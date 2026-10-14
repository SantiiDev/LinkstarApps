-- ============================================================================
-- 0038 — Respuestas con IA: tonos por tipo y por locales, techo y ventana de
--        la cola, y registro de actividad
-- ============================================================================
-- La 0037 está en producción y no se toca. Esta migración trae lo mejor de la
-- segunda implementación que se hizo en paralelo en `develop` (PR #14, 13 oct
-- 2026), adaptado al esquema de la 0037:
--
--   1. TONO POR TIPO Y POR LOCALES (el modal de Tapstar). Un tono es para
--      reseñas Positivas (4–5★) o Críticas (1–3★) y se aplica a «todos los
--      locales» o a una lista. Para una reseña de N★ en el local L se usa el
--      tono de su tipo que nombra a L, si no el de su tipo para todos, y si es
--      crítica y no hay ninguno crítico, el positivo con el mismo orden
--      (review_reply_writer_context). Antes había uno solo por (org, local) en
--      review_reply_settings; los que había se copian como «positivos».
--   2. TECHO TÉCNICO: la cola no acepta más de 2.000 respuestas por
--      organización y mes (de Argentina). Business no tiene cupo visible; esto
--      frena un bucle o un abuso, no a un cliente real.
--   3. VENTANA DE 7 DÍAS en lo que encola la regla automática. Una conexión que
--      estuvo vencida semanas y se reconecta trae reseñas de hace semanas: la
--      regla no las contesta «ahora» como si fueran nuevas. Lo viejo se
--      responde a propósito, con «Responder reseñas anteriores».
--   4. REGISTRO DE ACTIVIDAD de lo que configura cada persona: guardar la regla,
--      pedir «anteriores», guardar o borrar un tono.
--
-- Lo que sigue igual que en la 0037, a propósito (y distinto de develop):
--   * Ninguna de estas tablas se lee ni se escribe desde el panel: todo pasa por
--     el API (service_role) y el permiso lo decide review_ai_scope_target(). Un
--     encargado puede escribir el tono de SUS locales —la regla de responder
--     una reseña, 0026—, nunca uno de «todos los locales».
--   * reply_source sigue siendo panel / ai_draft / auto / past.
--   * Al modelo no le llega el nombre de quien escribió la reseña (decisión del
--     14 oct 2026): escribe {nombre} y el API lo completa.
--
-- EXPAND / CONTRACT. Esta migración sólo agrega y reemplaza cuerpos de función
-- con la MISMA firma: el API que hoy corre en Railway (el de la 0037) sigue
-- funcionando entre el `db push` y el deploy del API nuevo. Lo que el API nuevo
-- deja de usar —list_brand_tones(), save_brand_tone(), delete_brand_tone(),
-- review_reply_context(uuid, uuid) y las columnas de tono de
-- review_reply_settings (instructions, signature, emojis, tone_saved_at)—
-- queda acá y lo borra una migración posterior, cuando el API nuevo ya esté
-- desplegado. Un tono guardado con el API viejo en ese intervalo no se copia:
-- pre-lanzamiento, se vuelve a cargar.
--
-- El idioma (`language`) se queda en review_reply_settings y vale el de la fila
-- global de la organización (todavía no tiene control en el panel).
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. Tonos
-- ---------------------------------------------------------------------------
-- `emojis` tiene la misma forma que en la 0037 (private.valid_reply_emojis).
create table if not exists public.review_reply_tones (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  kind             text not null check (kind in ('positive', 'critical')),
  applies_to_all   boolean not null default true,
  instructions     text not null default '' check (char_length(instructions) <= 500),
  signature        text not null default '' check (char_length(signature) <= 120),
  emojis           jsonb not null
                     default '{"enabled": false, "mode": "auto", "amount": "moderate", "custom": []}'
                     check (private.valid_reply_emojis(emojis)),
  created_by       uuid references auth.users(id) on delete set null,
  updated_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Un solo tono «para todos los locales» por tipo.
create unique index if not exists review_reply_tones_all_uq
  on public.review_reply_tones (organization_id, kind)
  where applies_to_all;

drop trigger if exists review_reply_tones_set_updated_at on public.review_reply_tones;
create trigger review_reply_tones_set_updated_at
  before update on public.review_reply_tones
  for each row execute function private.set_updated_at();

-- Los locales de un tono que no es de «todos». `kind` y la organización están
-- repetidos para que la base garantice que un local tenga a lo sumo un tono de
-- cada tipo.
create table if not exists public.review_reply_tone_locations (
  tone_id          uuid not null references public.review_reply_tones(id) on delete cascade,
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  kind             text not null check (kind in ('positive', 'critical')),
  location_id      uuid not null references public.locations(id) on delete cascade,
  primary key (tone_id, location_id),
  constraint review_reply_tone_locations_kind_key unique (organization_id, kind, location_id)
);

create index if not exists review_reply_tone_locations_location_idx
  on public.review_reply_tone_locations (location_id);

comment on table public.review_reply_tones is
  'Tono de marca de las respuestas con IA (0038): uno por tipo (positive 4–5★ / critical 1–3★) y ámbito. Sólo por el API.';
comment on table public.review_reply_tone_locations is
  'Locales de un tono que no es de «todos los locales» (0038). Un local, a lo sumo un tono de cada tipo.';

alter table public.review_reply_tones          enable row level security;
alter table public.review_reply_tones          force  row level security;
alter table public.review_reply_tone_locations enable row level security;
alter table public.review_reply_tone_locations force  row level security;

revoke all on public.review_reply_tones          from anon, authenticated;
revoke all on public.review_reply_tone_locations from anon, authenticated;


-- ---------------------------------------------------------------------------
-- 2. Los tonos de la 0037 pasan a ser tonos positivos del mismo alcance
-- ---------------------------------------------------------------------------
-- El tono único de la 0037 se usaba para todas las reseñas; como «positivo»
-- se sigue usando para todas (las críticas caen en el positivo si no hay uno
-- crítico). Idempotente: no copia si la organización ya tiene tonos.
do $$
declare
  v_row record;
  v_id  uuid;
begin
  for v_row in
    select s.*
      from public.review_reply_settings s
      left join public.locations l on l.id = s.location_id
     where s.tone_saved_at is not null
       and (s.location_id is null or l.deleted_at is null)
       and not exists (select 1 from public.review_reply_tones t where t.organization_id = s.organization_id)
     order by s.organization_id, s.location_id nulls first
  loop
    insert into public.review_reply_tones
      (organization_id, kind, applies_to_all, instructions, signature, emojis,
       created_by, updated_by, created_at, updated_at)
    values
      (v_row.organization_id, 'positive', v_row.location_id is null, v_row.instructions, v_row.signature,
       v_row.emojis, v_row.updated_by, v_row.updated_by, v_row.tone_saved_at, v_row.updated_at)
    returning id into v_id;

    if v_row.location_id is not null then
      insert into public.review_reply_tone_locations (tone_id, organization_id, kind, location_id)
      values (v_id, v_row.organization_id, 'positive', v_row.location_id);
    end if;
  end loop;
end $$;


-- ---------------------------------------------------------------------------
-- 3. Quién puede con un tono
-- ---------------------------------------------------------------------------
-- El alcance de un tono son varios locales (o todos): hay que poder en cada
-- uno. Devuelve el rol. Con `p_write`, «todos los locales» es sólo de
-- owner/admin, igual que en review_ai_scope_target().
create or replace function private.review_tone_scope_check(
  p_user      uuid,
  p_org       uuid,
  p_all       boolean,
  p_locations uuid[],
  p_write     boolean
)
returns public.org_role
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_role public.org_role;
  v_loc  uuid;
begin
  -- Rol, acceso y Business, aunque el tono sea de un solo local.
  v_role := public.review_ai_scope_target(p_user, p_org, null, false);

  if p_all then
    perform public.review_ai_scope_target(p_user, p_org, null, p_write);
    return v_role;
  end if;

  foreach v_loc in array coalesce(p_locations, '{}') loop
    perform public.review_ai_scope_target(p_user, p_org, v_loc, p_write);
  end loop;
  return v_role;
end;
$$;


-- ---------------------------------------------------------------------------
-- 4. Tonos: listar, guardar, borrar
-- ---------------------------------------------------------------------------
-- Lo que ve cada uno: owner/admin todos; un encargado los de «todos los
-- locales» y los que nombran alguno de sus locales. `editable` dice si además
-- lo puede cambiar (un encargado, sólo si todos sus locales son suyos).
-- Los locales borrados no se listan; un tono que se quedó sin locales vivos
-- no se muestra (no aplica a nada).
create or replace function public.list_reply_tones(p_user uuid, p_org uuid)
returns table (
  id             uuid,
  kind           text,
  applies_to_all boolean,
  location_ids   uuid[],
  instructions   text,
  signature      text,
  emojis         jsonb,
  updated_at     timestamptz,
  editable       boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_role  public.org_role;
  v_mine  uuid[];
begin
  v_role := public.review_ai_scope_target(p_user, p_org, null, false);

  select coalesce(array_agg(ml.location_id), '{}')
    into v_mine
    from public.memberships m
    join public.membership_locations ml on ml.membership_id = m.id
   where m.organization_id = p_org and m.user_id = p_user;

  return query
  with tones as (
    select t.*,
           coalesce((select array_agg(tl.location_id order by l.name)
                       from public.review_reply_tone_locations tl
                       join public.locations l on l.id = tl.location_id and l.deleted_at is null
                      where tl.tone_id = t.id), '{}') as locs
      from public.review_reply_tones t
     where t.organization_id = p_org
  )
  select t.id, t.kind, t.applies_to_all, t.locs, t.instructions, t.signature, t.emojis, t.updated_at,
         v_role in ('owner', 'admin') or (not t.applies_to_all and t.locs <@ v_mine)
    from tones t
   where (t.applies_to_all or cardinality(t.locs) > 0)
     and (v_role in ('owner', 'admin') or t.applies_to_all or t.locs && v_mine)
   order by t.kind = 'critical', not t.applies_to_all, t.created_at;
end;
$$;

-- Crea (p_id NULL) o reemplaza un tono. Errores (el API los traduce):
--   rol_insuficiente, local_inexistente, sin_acceso, solo_business,
--   tipo_invalido, sin_locales, tono_inexistente,
--   tono_global_existente (ya hay uno «para todos» de ese tipo),
--   local_con_tono (algún local ya tiene uno de ese tipo).
create or replace function public.save_reply_tone(
  p_user           uuid,
  p_org            uuid,
  p_id             uuid,
  p_kind           text,
  p_applies_to_all boolean,
  p_location_ids   uuid[],
  p_instructions   text,
  p_signature      text,
  p_emojis         jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_all       boolean := coalesce(p_applies_to_all, true);
  v_locations uuid[];
  v_old       record;
  v_old_locs  uuid[];
  v_id        uuid := p_id;
begin
  if p_kind is null or p_kind not in ('positive', 'critical') then
    raise exception 'tipo_invalido';
  end if;

  select coalesce(array_agg(distinct x), '{}') into v_locations
    from unnest(coalesce(p_location_ids, '{}')) x
   where x is not null;

  if v_all then
    v_locations := '{}';
  elsif cardinality(v_locations) = 0 then
    raise exception 'sin_locales';
  end if;

  -- Hay que poder escribir el alcance nuevo…
  perform private.review_tone_scope_check(p_user, p_org, v_all, v_locations, true);

  -- …y, si se edita, también el que tenía (un encargado no se lleva a sus
  -- locales un tono que era de todos).
  if v_id is not null then
    select * into v_old
      from public.review_reply_tones t
     where t.id = v_id and t.organization_id = p_org
       for update;
    if not found then
      raise exception 'tono_inexistente';
    end if;
    select coalesce(array_agg(tl.location_id), '{}') into v_old_locs
      from public.review_reply_tone_locations tl
      join public.locations l on l.id = tl.location_id and l.deleted_at is null
     where tl.tone_id = v_id;
    perform private.review_tone_scope_check(p_user, p_org, v_old.applies_to_all, v_old_locs, true);
  end if;

  if v_all and exists (
    select 1 from public.review_reply_tones t
     where t.organization_id = p_org and t.kind = p_kind and t.applies_to_all
       and t.id is distinct from v_id
  ) then
    raise exception 'tono_global_existente';
  end if;

  if exists (
    select 1 from public.review_reply_tone_locations tl
     where tl.organization_id = p_org and tl.kind = p_kind
       and tl.location_id = any (v_locations)
       and tl.tone_id is distinct from v_id
  ) then
    raise exception 'local_con_tono';
  end if;

  if v_id is null then
    insert into public.review_reply_tones
      (organization_id, kind, applies_to_all, instructions, signature, emojis, created_by, updated_by)
    values
      (p_org, p_kind, v_all, btrim(coalesce(p_instructions, '')), btrim(coalesce(p_signature, '')),
       p_emojis, p_user, p_user)
    returning id into v_id;
  else
    update public.review_reply_tones
       set kind           = p_kind,
           applies_to_all = v_all,
           instructions   = btrim(coalesce(p_instructions, '')),
           signature      = btrim(coalesce(p_signature, '')),
           emojis         = p_emojis,
           updated_by     = p_user
     where id = v_id;
    delete from public.review_reply_tone_locations where tone_id = v_id;
  end if;

  insert into public.review_reply_tone_locations (tone_id, organization_id, kind, location_id)
  select v_id, p_org, p_kind, lid from unnest(v_locations) lid;

  insert into public.audit_log (organization_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_org, p_user, 'review_tone.saved', 'review_reply_tone', v_id,
          jsonb_build_object('kind', p_kind, 'applies_to_all', v_all,
                             'locations', cardinality(v_locations), 'created', p_id is null));

  return v_id;
end;
$$;

create or replace function public.delete_reply_tone(p_user uuid, p_org uuid, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tone record;
  v_locs uuid[];
begin
  select * into v_tone
    from public.review_reply_tones t
   where t.id = p_id and t.organization_id = p_org
     for update;
  if not found then
    raise exception 'tono_inexistente';
  end if;

  select coalesce(array_agg(tl.location_id), '{}') into v_locs
    from public.review_reply_tone_locations tl
    join public.locations l on l.id = tl.location_id and l.deleted_at is null
   where tl.tone_id = p_id;
  perform private.review_tone_scope_check(p_user, p_org, v_tone.applies_to_all, v_locs, true);

  delete from public.review_reply_tones where id = p_id;

  insert into public.audit_log (organization_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_org, p_user, 'review_tone.deleted', 'review_reply_tone', p_id,
          jsonb_build_object('kind', v_tone.kind, 'applies_to_all', v_tone.applies_to_all));
end;
$$;


-- ---------------------------------------------------------------------------
-- 5. Lo que necesita el redactor para una reseña
-- ---------------------------------------------------------------------------
-- Reemplaza, para el API nuevo, a review_reply_context(uuid, uuid) de la 0037
-- (que queda para el API viejo). Sin estrellas, la reseña cuenta como
-- positiva. `tone_kind` NULL = no hay tono que aplique.
create or replace function public.review_reply_writer_context(p_org uuid, p_location uuid, p_stars smallint)
returns table (
  tone_kind              text,
  instructions           text,
  signature              text,
  emojis                 jsonb,
  language               text,
  negative_contact_email text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with want as (
    select case when coalesce(p_stars, 5) >= 4 then 'positive' else 'critical' end as kind
  ),
  tone as (
    select t.kind, t.instructions, t.signature, t.emojis
      from public.review_reply_tones t
      cross join want w
      left join public.review_reply_tone_locations tl
        on tl.tone_id = t.id and tl.location_id = p_location
     where t.organization_id = p_org
       and (t.kind = w.kind or (w.kind = 'critical' and t.kind = 'positive'))
       and (tl.location_id is not null or t.applies_to_all)
     order by (t.kind = w.kind) desc, (tl.location_id is not null) desc
     limit 1
  ),
  email as (
    select s.negative_contact_email
      from public.review_reply_settings s
     where s.organization_id = p_org
       and (s.location_id = p_location or s.location_id is null)
       and s.negative_contact_email is not null
     order by s.location_id nulls last
     limit 1
  )
  select (select t.kind from tone t),
         coalesce((select t.instructions from tone t), ''),
         coalesce((select t.signature from tone t), ''),
         coalesce((select t.emojis from tone t),
                  '{"enabled": false, "mode": "auto", "amount": "moderate", "custom": []}'::jsonb),
         coalesce((select s.language from public.review_reply_settings s
                    where s.organization_id = p_org and s.location_id is null), 'business'),
         (select e.negative_contact_email::text from email e);
$$;


-- ---------------------------------------------------------------------------
-- 6. Techo de la cola
-- ---------------------------------------------------------------------------
-- `stable` y no `immutable`: así el test (rls_isolation.sql) la puede bajar
-- dentro de su transacción sin que quede plegada en un plan ya preparado.
create or replace function private.ai_reply_monthly_cap()
returns integer
language sql
stable
as $$ select 2000 $$;

-- Trabajos que entraron a la cola este mes (de Argentina), sin los que se
-- saltearon o fallaron.
create or replace function private.ai_replies_this_month(p_org uuid)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(*)::integer
    from public.review_reply_jobs j
   where j.organization_id = p_org
     and j.status in ('pending', 'processing', 'done')
     and date_trunc('month', j.created_at at time zone 'America/Argentina/Buenos_Aires')
       = date_trunc('month', now() at time zone 'America/Argentina/Buenos_Aires');
$$;


-- ---------------------------------------------------------------------------
-- 7. Encolar: misma firma que la 0037, con techo, ventana y registro
-- ---------------------------------------------------------------------------
create or replace function public.enqueue_auto_replies()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  with candidates as (
    select r.organization_id,
           r.id,
           rule.delay,
           row_number() over (partition by r.organization_id order by r.created_time, r.id) as n
      from public.google_reviews r
      join public.google_locations gl on gl.id = r.google_location_id
      join public.locations l on l.id = gl.location_id and l.deleted_at is null
      cross join lateral (
        select ru.enabled, ru.stars, ru.delay, ru.enabled_at
          from public.review_auto_reply_rules ru
         where ru.organization_id = r.organization_id
           and (ru.location_id = gl.location_id or ru.location_id is null)
         order by ru.location_id nulls last
         limit 1
      ) rule
     where rule.enabled
       and r.reply_comment is null
       and r.created_time >= rule.enabled_at
       and r.created_time > now() - interval '7 days'
       and r.star_rating = any (rule.stars)
       and private.org_has_business(r.organization_id)
       and not exists (select 1 from public.review_reply_jobs j where j.review_id = r.id)
  ),
  room as (
    select c.organization_id,
           private.ai_reply_monthly_cap() - private.ai_replies_this_month(c.organization_id) as left_
      from (select distinct organization_id from candidates) c
  )
  insert into public.review_reply_jobs (organization_id, review_id, source, due_at)
  select c.organization_id,
         c.id,
         'auto',
         now() + case c.delay
                   when '1-3h' then interval '1 hour' + random() * interval '2 hours'
                   when '3-6h' then interval '3 hours' + random() * interval '3 hours'
                   else interval '0'
                 end
    from candidates c
    join room on room.organization_id = c.organization_id
   where c.n <= room.left_
  on conflict (review_id) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.enqueue_past_replies(
  p_user     uuid,
  p_org      uuid,
  p_location uuid,
  p_count    integer,
  p_stars    text
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
  v_stars smallint[];
  v_room  integer;
begin
  perform public.review_ai_scope_target(p_user, p_org, p_location, true);

  v_stars := case p_stars
               when '4-5' then '{4,5}'::smallint[]
               when '5'   then '{5}'::smallint[]
               when '1-3' then '{1,2,3}'::smallint[]
               when 'all' then '{1,2,3,4,5}'::smallint[]
             end;
  if v_stars is null then
    raise exception 'filtro_invalido';
  end if;

  v_room := least(greatest(coalesce(p_count, 1), 1), 200,
                  private.ai_reply_monthly_cap() - private.ai_replies_this_month(p_org));

  if v_room <= 0 then
    v_count := 0;
  else
    insert into public.review_reply_jobs as j (organization_id, review_id, source, due_at, created_by)
    select r.organization_id, r.id, 'past', now(), p_user
      from public.google_reviews r
      join public.google_locations gl on gl.id = r.google_location_id
      join public.locations l on l.id = gl.location_id and l.deleted_at is null
     where r.organization_id = p_org
       and (p_location is null or gl.location_id = p_location)
       and r.reply_comment is null
       and r.star_rating = any (v_stars)
       and not exists (
         select 1 from public.review_reply_jobs x
          where x.review_id = r.id and x.status in ('pending', 'processing', 'done')
       )
     order by r.created_time desc, r.id
     limit v_room
    on conflict (review_id) do update
       set source      = 'past',
           status      = 'pending',
           due_at      = now(),
           attempts    = 0,
           error       = null,
           created_by  = excluded.created_by,
           created_at  = now(),
           started_at  = null,
           finished_at = null
     where j.status in ('skipped', 'failed');

    get diagnostics v_count = row_count;
  end if;

  insert into public.audit_log (organization_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_org, p_user, 'auto_reply.past_requested', 'location', p_location,
          jsonb_build_object('count', p_count, 'stars', p_stars, 'queued', v_count));

  return v_count;
end;
$$;

-- Igual que la 0037, más el registro de actividad.
create or replace function public.save_auto_reply_rule(
  p_user     uuid,
  p_org      uuid,
  p_location uuid,
  p_enabled  boolean,
  p_stars    smallint[],
  p_delay    text
)
returns table (enabled boolean, stars smallint[], delay text, location_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
begin
  perform public.review_ai_scope_target(p_user, p_org, p_location, true);

  insert into public.audit_log (organization_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_org, p_user, 'auto_reply.rule_saved', 'location', p_location,
          jsonb_build_object('enabled', coalesce(p_enabled, false), 'stars', to_jsonb(p_stars), 'delay', p_delay));

  return query
  insert into public.review_auto_reply_rules as r
    (organization_id, location_id, enabled, stars, delay, updated_by, updated_at)
  values (p_org, p_location, coalesce(p_enabled, false),
          (select array_agg(distinct s order by s) from unnest(p_stars) s), p_delay, p_user, now())
  on conflict on constraint review_auto_reply_rules_scope_key do update
     set enabled    = excluded.enabled,
         stars      = excluded.stars,
         delay      = excluded.delay,
         updated_by = excluded.updated_by,
         updated_at = now()
  returning r.enabled, r.stars, r.delay, r.location_id;
end;
$$;


-- ---------------------------------------------------------------------------
-- 8. Permisos: todo sólo para service_role
-- ---------------------------------------------------------------------------
revoke all on function private.review_tone_scope_check(uuid, uuid, boolean, uuid[], boolean) from public, anon, authenticated;
revoke all on function public.list_reply_tones(uuid, uuid) from public, anon, authenticated;
revoke all on function public.save_reply_tone(uuid, uuid, uuid, text, boolean, uuid[], text, text, jsonb) from public, anon, authenticated;
revoke all on function public.delete_reply_tone(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.review_reply_writer_context(uuid, uuid, smallint) from public, anon, authenticated;
revoke all on function private.ai_replies_this_month(uuid) from public, anon, authenticated;
revoke all on function private.ai_reply_monthly_cap() from public, anon, authenticated;

grant execute on function public.list_reply_tones(uuid, uuid) to service_role;
grant execute on function public.save_reply_tone(uuid, uuid, uuid, text, boolean, uuid[], text, text, jsonb) to service_role;
grant execute on function public.delete_reply_tone(uuid, uuid, uuid) to service_role;
grant execute on function public.review_reply_writer_context(uuid, uuid, smallint) to service_role;
