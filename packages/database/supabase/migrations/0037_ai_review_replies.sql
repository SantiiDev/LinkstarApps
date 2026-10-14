-- ============================================================================
-- LINKSTAR — 0037: respuestas a reseñas con IA (resto de la fase 5)
-- ============================================================================
-- Cuatro piezas, todas Business:
--
--   1. ORIGEN de cada respuesta (google_reviews.reply_source): la escribió una
--      persona ('manual'), una persona partiendo de un borrador de la IA
--      ('ai_assisted') o la publicó sola una regla ('auto'). Es lo que cuenta
--      «Reseñas respondidas automáticamente» y lo que filtra Reseñas.
--   2. TONO DE MARCA (review_reply_tones): cómo escribe la IA. Igual que en
--      Tapstar, un tono es para reseñas Positivas (4–5★) o Críticas (1–3★) y se
--      aplica a «todos los locales» o a una lista de locales.
--   3. DATOS PARA LAS RESPUESTAS (review_reply_settings): por ahora el email de
--      contacto que la IA cita en las críticas, global o por local.
--   4. RESPUESTA AUTOMÁTICA (review_auto_reply_rules + review_reply_jobs): una
--      regla por ámbito y una cola de trabajos que ejecuta el API
--      (lib/replyJobs.js) desde el cron horario, el `daily`, «Actualizar
--      ahora» y «Responder reseñas anteriores».
--
-- ── Lo que no hay que deshacer ──────────────────────────────────────────────
-- * LA COLA ES EL CANDADO. Pueden correr a la vez el cron horario, el daily y
--   el «Actualizar ahora» del API, que son procesos distintos: un candado en
--   memoria no alcanza, y publicar dos veces en Google la misma respuesta es
--   justo lo que no puede pasar. El índice único parcial sobre review_id
--   (pending/running/done) y el claim con `for update skip locked` lo impiden.
-- * LA REGLA AUTOMÁTICA ARRANCA APAGADA y sólo mira reseñas creadas después de
--   activarla (enabled_at, que anota la base, como en la 0036). Activarla no
--   responde la historia: para eso está «Responder reseñas anteriores», que es
--   un pedido explícito.
-- * EL ORIGEN SE BORRA SI LA RESPUESTA CAMBIA POR FUERA. Si el dueño edita la
--   respuesta directamente en Google, el sync trae otro texto y el trigger de
--   abajo pone reply_source en null: ya no es «la que publicó la regla».
-- * TECHO TÉCNICO. Business no tiene cupo visible, pero la cola no acepta más
--   de 2.000 trabajos por organización y mes (de Argentina): frena un bucle o un
--   abuso, no a un cliente real.
--
-- Al modelo se le manda: el texto y las estrellas de la reseña, el NOMBRE DE
-- PILA de quien la escribió (decisión del 13 oct 2026, declarada en la
-- política de privacidad §3.2), el nombre y la ciudad del local, y el tono,
-- la firma y el email que cargó el dueño. Ver services/api/lib/replyWriter.js.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. ORIGEN DE LA RESPUESTA
-- ---------------------------------------------------------------------------
alter table public.google_reviews
  add column if not exists reply_source text;

alter table public.google_reviews
  drop constraint if exists google_reviews_reply_source_check,
  add constraint google_reviews_reply_source_check
    check (reply_source is null or reply_source in ('manual', 'ai_assisted', 'auto'));

create index if not exists google_reviews_reply_source_idx
  on public.google_reviews (organization_id, reply_source)
  where reply_source is not null;

-- La respuesta cambió y no la escribimos nosotros (la trajo el sync porque se
-- editó o se borró en Google): el origen deja de valer. google_record_reply()
-- marca su propio update con una variable de la transacción.
create or replace function private.google_reviews_reply_source()
returns trigger
language plpgsql
as $$
begin
  if new.reply_comment is distinct from old.reply_comment
     and coalesce(current_setting('linkstar.reply_write', true), '') <> '1' then
    new.reply_source := null;
  end if;
  return new;
end;
$$;

drop trigger if exists google_reviews_reply_source on public.google_reviews;
create trigger google_reviews_reply_source
  before update on public.google_reviews
  for each row execute function private.google_reviews_reply_source();

-- Reemplaza la de la 0026: misma lógica más el origen. p_user puede ser null
-- (la publicó una regla, no una persona). Se borra la firma vieja para que un
-- llamado con cuatro argumentos no sea ambiguo.
drop function if exists public.google_record_reply(uuid, uuid, text, timestamptz);

create or replace function public.google_record_reply(
  p_review  uuid,
  p_user    uuid,
  p_comment text,
  p_updated timestamptz,
  p_source  text default 'manual'
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org uuid;
  v_had boolean;
begin
  if p_source is null or p_source not in ('manual', 'ai_assisted', 'auto') then
    raise exception 'origen_invalido';
  end if;

  select organization_id, reply_comment is not null
    into v_org, v_had
    from public.google_reviews
   where id = p_review;

  if v_org is null then
    raise exception 'resena_inexistente';
  end if;

  perform set_config('linkstar.reply_write', '1', true);
  update public.google_reviews
     set reply_comment      = p_comment,
         reply_updated_time = coalesce(p_updated, now()),
         reply_source       = p_source
   where id = p_review;
  perform set_config('linkstar.reply_write', '', true);

  insert into public.audit_log (organization_id, actor_id, action, entity_type, entity_id, metadata)
  values (v_org, p_user, 'google.review_replied', 'google_review', p_review,
          jsonb_build_object('edited', v_had, 'source', p_source));
end;
$$;

revoke all on function public.google_record_reply(uuid, uuid, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.google_record_reply(uuid, uuid, text, timestamptz, text) to service_role;


-- ---------------------------------------------------------------------------
-- 2. TONO DE MARCA
-- ---------------------------------------------------------------------------
-- Un tono por tipo y ámbito. Para una reseña de N★ en el local L:
--   tipo = positive si N >= 4, si no critical;
--   primero el tono de ese tipo que nombra a L, después el de «todos»;
--   si es critical y no hay ninguno, el positivo con el mismo orden
--   (como dice el modal: «Si no creas el de reseñas críticas, se usará el
--   positivo»).
create table if not exists public.review_reply_tones (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  kind             text not null check (kind in ('positive', 'critical')),
  applies_to_all   boolean not null default true,
  instructions     text not null default '' check (length(instructions) <= 500),
  signature        text not null default '' check (length(signature) <= 120),
  emojis_enabled   boolean not null default false,
  emojis_mode      text not null default 'auto' check (emojis_mode in ('auto', 'custom')),
  emojis_amount    text not null default 'moderate' check (emojis_amount in ('moderate', 'few')),
  emojis_custom    text[] not null default '{}'
                     check (coalesce(array_length(emojis_custom, 1), 0) <= 10),
  created_by       uuid references auth.users(id) on delete set null,
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

-- Los locales de un tono que no es de «todos». `kind` está repetido acá para
-- que la base garantice que un local tenga a lo sumo un tono de cada tipo.
create table if not exists public.review_reply_tone_locations (
  tone_id          uuid not null references public.review_reply_tones(id) on delete cascade,
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  kind             text not null check (kind in ('positive', 'critical')),
  location_id      uuid not null references public.locations(id) on delete cascade,
  primary key (tone_id, location_id),
  unique (organization_id, kind, location_id)
);


-- ---------------------------------------------------------------------------
-- 3. DATOS PARA LAS RESPUESTAS
-- ---------------------------------------------------------------------------
-- location_id null = «Todos los locales». El de un local pisa al global.
-- Tabla aparte (y no una columna en locations) para poder sumar datos sin
-- tocar el catálogo. `nulls not distinct`: que la fila global también sea única
-- y sirva de destino del upsert del panel.
create table if not exists public.review_reply_settings (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  location_id      uuid references public.locations(id) on delete cascade,
  contact_email    extensions.citext
                     check (contact_email is null or contact_email::text ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint review_reply_settings_scope_uq unique nulls not distinct (organization_id, location_id)
);

drop trigger if exists review_reply_settings_set_updated_at on public.review_reply_settings;
create trigger review_reply_settings_set_updated_at
  before update on public.review_reply_settings
  for each row execute function private.set_updated_at();


-- ---------------------------------------------------------------------------
-- 4. RESPUESTA AUTOMÁTICA: reglas y cola
-- ---------------------------------------------------------------------------
create table if not exists public.review_auto_reply_rules (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  location_id      uuid references public.locations(id) on delete cascade,
  enabled          boolean not null default false,
  stars            smallint[] not null default '{4,5}',
  delay            text not null default 'now' check (delay in ('now', '1-3h', '3-6h')),
  enabled_at       timestamptz,
  updated_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint review_auto_reply_rules_scope_uq unique nulls not distinct (organization_id, location_id),
  constraint review_auto_reply_rules_stars_check check (
    coalesce(array_length(stars, 1), 0) between 1 and 5
    and array_position(stars, null) is null
    and stars <@ array[1,2,3,4,5]::smallint[]
  )
);

drop trigger if exists review_auto_reply_rules_set_updated_at on public.review_auto_reply_rules;
create trigger review_auto_reply_rules_set_updated_at
  before update on public.review_auto_reply_rules
  for each row execute function private.set_updated_at();

-- «Desde cuándo», como notification_preferences_enabled_at() de la 0036: lo
-- anota la base al pasar de apagada a prendida, y nunca lo toma del que llama.
create or replace function private.review_auto_reply_rules_enabled_at()
returns trigger
language plpgsql
as $$
begin
  if new.enabled and (tg_op = 'INSERT' or not old.enabled) then
    new.enabled_at := now();
  elsif tg_op = 'UPDATE' then
    new.enabled_at := old.enabled_at;
  elsif not new.enabled then
    new.enabled_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists review_auto_reply_rules_enabled_at on public.review_auto_reply_rules;
create trigger review_auto_reply_rules_enabled_at
  before insert or update on public.review_auto_reply_rules
  for each row execute function private.review_auto_reply_rules_enabled_at();

-- Un trabajo = responder UNA reseña. `auto` lo crea la regla; `past`, el botón
-- «Responder reseñas anteriores».
create table if not exists public.review_reply_jobs (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  review_id        uuid not null references public.google_reviews(id) on delete cascade,
  source           text not null check (source in ('auto', 'past')),
  run_after        timestamptz not null default now(),
  status           text not null default 'pending'
                     check (status in ('pending', 'running', 'done', 'skipped', 'failed')),
  attempts         smallint not null default 0,
  locked_at        timestamptz,
  last_error       text,
  requested_by     uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  finished_at      timestamptz
);

-- EL CANDADO: una reseña no puede tener dos trabajos vivos o uno ya hecho.
create unique index if not exists review_reply_jobs_review_uq
  on public.review_reply_jobs (review_id)
  where status in ('pending', 'running', 'done');

create index if not exists review_reply_jobs_due_idx
  on public.review_reply_jobs (run_after)
  where status in ('pending', 'running');

create index if not exists review_reply_jobs_org_month_idx
  on public.review_reply_jobs (organization_id, created_at);


-- ---------------------------------------------------------------------------
-- 5. RLS
-- ---------------------------------------------------------------------------
-- Tonos y datos: los ve y los cambia quien administra la cuenta (owner/admin),
-- como notification_preferences (0023). Los tonos se escriben sólo por RPC
-- (save/delete_review_reply_tone, abajo), que valida los locales en una sola
-- transacción. Reglas y cola: sólo el API (service_role).
alter table public.review_reply_tones          enable row level security;
alter table public.review_reply_tones          force row level security;
alter table public.review_reply_tone_locations enable row level security;
alter table public.review_reply_tone_locations force row level security;
alter table public.review_reply_settings       enable row level security;
alter table public.review_reply_settings       force row level security;
alter table public.review_auto_reply_rules     enable row level security;
alter table public.review_auto_reply_rules     force row level security;
alter table public.review_reply_jobs           enable row level security;
alter table public.review_reply_jobs           force row level security;

revoke all on public.review_reply_tones          from anon;
revoke all on public.review_reply_tone_locations from anon;
revoke all on public.review_reply_settings       from anon;
revoke all on public.review_auto_reply_rules     from anon, authenticated;
revoke all on public.review_reply_jobs           from anon, authenticated;

revoke insert, update, delete, truncate on public.review_reply_tones          from authenticated;
revoke insert, update, delete, truncate on public.review_reply_tone_locations from authenticated;
grant select on public.review_reply_tones          to authenticated;
grant select on public.review_reply_tone_locations to authenticated;
grant select, insert, update, delete on public.review_reply_settings to authenticated;

drop policy if exists review_reply_tones_select on public.review_reply_tones;
create policy review_reply_tones_select on public.review_reply_tones
  for select to authenticated
  using ( organization_id = any ((select unnest(private.orgs_rw_with_access()))) );

drop policy if exists review_reply_tone_locations_select on public.review_reply_tone_locations;
create policy review_reply_tone_locations_select on public.review_reply_tone_locations
  for select to authenticated
  using ( organization_id = any ((select unnest(private.orgs_rw_with_access()))) );

drop policy if exists review_reply_settings_select on public.review_reply_settings;
create policy review_reply_settings_select on public.review_reply_settings
  for select to authenticated
  using ( organization_id = any ((select unnest(private.orgs_rw_with_access()))) );

-- El local, si viene, tiene que ser de la misma organización y estar vivo.
drop policy if exists review_reply_settings_write on public.review_reply_settings;
create policy review_reply_settings_write on public.review_reply_settings
  for all to authenticated
  using ( organization_id = any ((select unnest(private.orgs_rw_with_access()))) )
  with check (
    organization_id = any ((select unnest(private.orgs_rw_with_access())))
    and (
      location_id is null
      or exists (
        select 1 from public.locations l
        where l.id = location_id
          and l.organization_id = review_reply_settings.organization_id
          and l.deleted_at is null
      )
    )
  );


-- ---------------------------------------------------------------------------
-- 6. TONOS DESDE EL PANEL
-- ---------------------------------------------------------------------------
-- p_tone = { id?, organization_id, kind, applies_to_all, location_ids[],
--            instructions, signature,
--            emojis: { enabled, mode, amount, custom[] } }
-- Errores con `hint` (el panel los traduce en replySettingsApi.js):
--   rol_insuficiente, solo_business, tono_inexistente, local_invalido,
--   sin_locales, tono_global_existente, local_con_tono.
create or replace function public.save_review_reply_tone(p_tone jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_org       uuid := nullif(p_tone->>'organization_id', '')::uuid;
  v_id        uuid := nullif(p_tone->>'id', '')::uuid;
  v_kind      text := p_tone->>'kind';
  v_all       boolean := coalesce((p_tone->>'applies_to_all')::boolean, true);
  v_locations uuid[];
  v_custom    text[];
begin
  if v_org is null or not (v_org = any (private.orgs_rw_with_access())) then
    raise exception 'rol_insuficiente' using errcode = '42501', hint = 'rol_insuficiente';
  end if;
  if not private.org_has_business(v_org) then
    raise exception 'solo_business' using hint = 'solo_business';
  end if;

  select coalesce(array_agg(distinct x::uuid), '{}')
    into v_locations
    from jsonb_array_elements_text(coalesce(p_tone->'location_ids', '[]'::jsonb)) x;

  select coalesce(array_agg(x), '{}')
    into v_custom
    from jsonb_array_elements_text(coalesce(p_tone->'emojis'->'custom', '[]'::jsonb)) x;

  if v_all then
    v_locations := '{}';
  elsif coalesce(array_length(v_locations, 1), 0) = 0 then
    raise exception 'sin_locales' using hint = 'sin_locales';
  elsif exists (
    select 1 from unnest(v_locations) lid
    where not exists (
      select 1 from public.locations l
      where l.id = lid and l.organization_id = v_org and l.deleted_at is null
    )
  ) then
    raise exception 'local_invalido' using hint = 'local_invalido';
  end if;

  if v_id is not null and not exists (
    select 1 from public.review_reply_tones t where t.id = v_id and t.organization_id = v_org
  ) then
    raise exception 'tono_inexistente' using hint = 'tono_inexistente';
  end if;

  if v_all and exists (
    select 1 from public.review_reply_tones t
    where t.organization_id = v_org and t.kind = v_kind and t.applies_to_all
      and t.id is distinct from v_id
  ) then
    raise exception 'tono_global_existente' using hint = 'tono_global_existente';
  end if;

  if exists (
    select 1 from public.review_reply_tone_locations tl
    where tl.organization_id = v_org and tl.kind = v_kind
      and tl.location_id = any (v_locations)
      and tl.tone_id is distinct from v_id
  ) then
    raise exception 'local_con_tono' using hint = 'local_con_tono';
  end if;

  if v_id is null then
    insert into public.review_reply_tones (
      organization_id, kind, applies_to_all, instructions, signature,
      emojis_enabled, emojis_mode, emojis_amount, emojis_custom, created_by
    ) values (
      v_org, v_kind, v_all,
      btrim(coalesce(p_tone->>'instructions', '')),
      btrim(coalesce(p_tone->>'signature', '')),
      coalesce((p_tone->'emojis'->>'enabled')::boolean, false),
      coalesce(p_tone->'emojis'->>'mode', 'auto'),
      coalesce(p_tone->'emojis'->>'amount', 'moderate'),
      v_custom,
      auth.uid()
    )
    returning id into v_id;
  else
    update public.review_reply_tones
       set kind           = v_kind,
           applies_to_all = v_all,
           instructions   = btrim(coalesce(p_tone->>'instructions', '')),
           signature      = btrim(coalesce(p_tone->>'signature', '')),
           emojis_enabled = coalesce((p_tone->'emojis'->>'enabled')::boolean, false),
           emojis_mode    = coalesce(p_tone->'emojis'->>'mode', 'auto'),
           emojis_amount  = coalesce(p_tone->'emojis'->>'amount', 'moderate'),
           emojis_custom  = v_custom
     where id = v_id;
    delete from public.review_reply_tone_locations where tone_id = v_id;
  end if;

  insert into public.review_reply_tone_locations (tone_id, organization_id, kind, location_id)
  select v_id, v_org, v_kind, lid from unnest(v_locations) lid;

  insert into public.audit_log (organization_id, actor_id, action, entity_type, entity_id, metadata)
  values (v_org, auth.uid(), 'review_tone.saved', 'review_reply_tone', v_id,
          jsonb_build_object('kind', v_kind, 'applies_to_all', v_all,
                             'locations', coalesce(array_length(v_locations, 1), 0)));

  return v_id;
end;
$$;

create or replace function public.delete_review_reply_tone(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_org uuid;
begin
  select organization_id into v_org from public.review_reply_tones where id = p_id;
  if v_org is null or not (v_org = any (private.orgs_rw_with_access())) then
    raise exception 'tono_inexistente' using hint = 'tono_inexistente';
  end if;

  delete from public.review_reply_tones where id = p_id;

  insert into public.audit_log (organization_id, actor_id, action, entity_type, entity_id, metadata)
  values (v_org, auth.uid(), 'review_tone.deleted', 'review_reply_tone', p_id, '{}'::jsonb);
end;
$$;

revoke all on function public.save_review_reply_tone(jsonb) from public, anon;
revoke all on function public.delete_review_reply_tone(uuid) from public, anon;
grant execute on function public.save_review_reply_tone(jsonb) to authenticated;
grant execute on function public.delete_review_reply_tone(uuid) to authenticated;


-- ---------------------------------------------------------------------------
-- 7. LO QUE USA EL API (service_role)
-- ---------------------------------------------------------------------------

-- Quién puede tocar las automatizaciones de un ámbito. La misma regla que
-- responder una reseña (google_review_reply_target, 0026): owner/admin en toda
-- la organización, manager sólo en sus locales —y nunca en «Todos los
-- locales», que también abarca los que no son suyos—, viewer nunca. Y Business.
create or replace function public.review_automation_target(p_user uuid, p_org uuid, p_location uuid)
returns void
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_role public.org_role;
begin
  select m.role into v_role
    from public.memberships m
   where m.organization_id = p_org and m.user_id = p_user;

  if v_role is null or v_role = 'viewer' or (v_role = 'manager' and p_location is null) then
    raise exception 'rol_insuficiente';
  end if;

  if p_location is not null and not exists (
    select 1 from public.locations l
    where l.id = p_location and l.organization_id = p_org and l.deleted_at is null
  ) then
    raise exception 'local_inexistente';
  end if;

  if v_role = 'manager' and not exists (
    select 1
      from public.memberships m
      join public.membership_locations ml on ml.membership_id = m.id
     where m.organization_id = p_org and m.user_id = p_user and ml.location_id = p_location
  ) then
    raise exception 'rol_insuficiente';
  end if;

  if not public.org_has_access(p_org) then
    raise exception 'sin_acceso';
  end if;

  if not private.org_has_business(p_org) then
    raise exception 'solo_business';
  end if;
end;
$$;

-- La regla de ESE ámbito (no la efectiva), o los valores por defecto si nunca
-- se guardó. La forma es la del contrato de apps/dashboard/src/lib/automationsApi.js.
create or replace function public.review_auto_reply_rule_get(p_org uuid, p_location uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select jsonb_build_object(
              'enabled', r.enabled, 'stars', to_jsonb(r.stars), 'delay', r.delay,
              'location_id', r.location_id, 'enabled_at', r.enabled_at)
       from public.review_auto_reply_rules r
      where r.organization_id = p_org
        and r.location_id is not distinct from p_location),
    jsonb_build_object('enabled', false, 'stars', jsonb_build_array(4, 5), 'delay', 'now',
                       'location_id', p_location, 'enabled_at', null)
  );
$$;

create or replace function public.review_auto_reply_rule_save(
  p_user     uuid,
  p_org      uuid,
  p_location uuid,
  p_enabled  boolean,
  p_stars    smallint[],
  p_delay    text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  perform public.review_automation_target(p_user, p_org, p_location);

  insert into public.review_auto_reply_rules as r
    (organization_id, location_id, enabled, stars, delay, updated_by)
  values (p_org, p_location, coalesce(p_enabled, false),
          (select coalesce(array_agg(distinct s order by s), '{}') from unnest(p_stars) s),
          p_delay, p_user)
  on conflict (organization_id, location_id) do update
     set enabled    = excluded.enabled,
         stars      = excluded.stars,
         delay      = excluded.delay,
         updated_by = excluded.updated_by;

  insert into public.audit_log (organization_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_org, p_user, 'auto_reply.rule_saved', 'location', p_location,
          jsonb_build_object('enabled', p_enabled, 'stars', to_jsonb(p_stars), 'delay', p_delay));

  return public.review_auto_reply_rule_get(p_org, p_location);
end;
$$;

-- Reseñas que respondió la automatización (regla o «anteriores») y el tiempo
-- que ahorró: 2 minutos por respuesta, lo que tarda una persona en leer la
-- reseña y escribir dos líneas.
create or replace function public.review_auto_reply_stats(p_org uuid, p_location uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object('replied', count(*), 'minutes_saved', count(*) * 2)
    from public.google_reviews r
    join public.google_locations gl on gl.id = r.google_location_id
   where r.organization_id = p_org
     and r.reply_source = 'auto'
     and (p_location is null or gl.location_id = p_location);
$$;

-- El techo técnico: trabajos creados este mes (de Argentina), sin contar los
-- que se saltearon o fallaron.
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
     and j.status in ('pending', 'running', 'done')
     and date_trunc('month', j.created_at at time zone 'America/Argentina/Buenos_Aires')
       = date_trunc('month', now() at time zone 'America/Argentina/Buenos_Aires');
$$;

create or replace function private.ai_reply_monthly_cap()
returns integer
language sql
immutable
as $$ select 2000 $$;

-- Encola las reseñas que la regla efectiva de su local manda responder. Una
-- reseña recibe a lo sumo UN trabajo automático en toda su vida: si se salteó
-- o falló, la regla no la vuelve a intentar (sí puede hacerlo «Responder
-- reseñas anteriores», que es un pedido explícito).
create or replace function public.review_reply_enqueue_auto(p_org uuid default null)
returns integer
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_org   uuid;
  v_room  integer;
  v_added integer;
  v_total integer := 0;
begin
  for v_org in
    select distinct ar.organization_id
      from public.review_auto_reply_rules ar
     where ar.enabled
       and (p_org is null or ar.organization_id = p_org)
  loop
    continue when not private.org_has_business(v_org);

    v_room := private.ai_reply_monthly_cap() - private.ai_replies_this_month(v_org);
    continue when v_room <= 0;

    insert into public.review_reply_jobs (organization_id, review_id, source, run_after)
    select v_org, c.id, 'auto', c.run_after
      from (
        select r.id,
               r.created_time,
               now() + case eff.delay
                         when '1-3h' then interval '1 hour' + random() * interval '2 hours'
                         when '3-6h' then interval '3 hours' + random() * interval '3 hours'
                         else interval '0'
                       end as run_after
          from public.google_reviews r
          join public.google_locations gl on gl.id = r.google_location_id
          join public.locations l on l.id = gl.location_id and l.deleted_at is null
          cross join lateral (
            -- La regla del local pisa a la global, aunque esté apagada.
            select ar.*
              from public.review_auto_reply_rules ar
             where ar.organization_id = v_org
               and (ar.location_id = l.id or ar.location_id is null)
             order by ar.location_id nulls last
             limit 1
          ) eff
         where r.organization_id = v_org
           and eff.enabled
           and eff.enabled_at is not null
           and r.created_time >= eff.enabled_at
           and r.created_time > now() - interval '7 days'
           and r.reply_comment is null
           and r.star_rating = any (eff.stars)
           and not exists (select 1 from public.review_reply_jobs j where j.review_id = r.id)
         order by r.created_time
         limit v_room
      ) c
    on conflict (review_id) where status in ('pending', 'running', 'done') do nothing;

    get diagnostics v_added = row_count;
    v_total := v_total + v_added;
  end loop;

  return v_total;
end;
$$;

-- «Responder reseñas anteriores»: las últimas p_count sin responder del
-- filtro, sin importar cuándo se escribieron. Mismo permiso que editar la
-- regla de ese ámbito.
create or replace function public.review_reply_enqueue_past(
  p_user     uuid,
  p_org      uuid,
  p_location uuid,
  p_count    integer,
  p_stars    text
)
returns integer
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_room  integer;
  v_stars smallint[];
  v_added integer;
begin
  perform public.review_automation_target(p_user, p_org, p_location);

  v_stars := case p_stars
               when 'all' then array[1,2,3,4,5]
               when '4-5' then array[4,5]
               when '5'   then array[5]
               when '1-3' then array[1,2,3]
             end::smallint[];
  if v_stars is null then
    raise exception 'filtro_invalido';
  end if;

  v_room := least(greatest(coalesce(p_count, 0), 0), 200,
                  private.ai_reply_monthly_cap() - private.ai_replies_this_month(p_org));
  if v_room <= 0 then
    return 0;
  end if;

  insert into public.review_reply_jobs (organization_id, review_id, source, run_after, requested_by)
  select p_org, c.id, 'past', now(), p_user
    from (
      select r.id
        from public.google_reviews r
        join public.google_locations gl on gl.id = r.google_location_id
        join public.locations l on l.id = gl.location_id and l.deleted_at is null
       where r.organization_id = p_org
         and (p_location is null or l.id = p_location)
         and r.reply_comment is null
         and r.star_rating = any (v_stars)
         and not exists (
           select 1 from public.review_reply_jobs j
            where j.review_id = r.id and j.status in ('pending', 'running', 'done')
         )
       order by r.created_time desc, r.id
       limit v_room
    ) c
  on conflict (review_id) where status in ('pending', 'running', 'done') do nothing;

  get diagnostics v_added = row_count;

  insert into public.audit_log (organization_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_org, p_user, 'auto_reply.past_requested', 'location', p_location,
          jsonb_build_object('count', p_count, 'stars', p_stars, 'queued', v_added));

  return v_added;
end;
$$;

-- Toma trabajos vencidos sin que dos procesos tomen el mismo. Uno que quedó
-- en `running` más de 15 minutos (el proceso murió a mitad) se puede retomar.
create or replace function public.review_reply_claim(p_limit integer default 20, p_org uuid default null)
returns table (
  job_id          uuid,
  organization_id uuid,
  review_id       uuid,
  source          text,
  attempts        smallint
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
begin
  return query
  with picked as (
    select j.id
      from public.review_reply_jobs j
     where (p_org is null or j.organization_id = p_org)
       and (
         (j.status = 'pending' and j.run_after <= now())
         or (j.status = 'running' and j.locked_at < now() - interval '15 minutes')
       )
     order by j.run_after, j.created_at
     limit greatest(1, least(coalesce(p_limit, 20), 100))
     for update skip locked
  )
  update public.review_reply_jobs j
     set status    = 'running',
         locked_at = now(),
         attempts  = j.attempts + 1
    from picked
   where j.id = picked.id
  returning j.id, j.organization_id, j.review_id, j.source, j.attempts;
end;
$$;

-- Cierra un trabajo. p_status = 'pending' con p_retry_at lo devuelve a la cola.
create or replace function public.review_reply_finish(
  p_job      uuid,
  p_status   text,
  p_error    text default null,
  p_retry_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_status not in ('pending', 'done', 'skipped', 'failed') then
    raise exception 'estado_invalido';
  end if;

  update public.review_reply_jobs
     set status      = p_status,
         last_error  = left(p_error, 500),
         locked_at   = null,
         run_after   = case when p_status = 'pending' then coalesce(p_retry_at, now()) else run_after end,
         finished_at = case when p_status = 'pending' then null else now() end
   where id = p_job
     and status = 'running';
end;
$$;

-- Todo lo que necesita el redactor (lib/replyWriter.js) para una reseña, y el
-- estado que el ejecutor tiene que volver a mirar justo antes de publicar.
-- null si la reseña no existe o su ficha no está vinculada a un local vivo.
create or replace function public.review_reply_context(p_review uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $$
declare
  r       record;
  v_kind  text;
  v_tone  jsonb;
  v_email text;
  v_rule  record;
  v_rule_found boolean;
begin
  select gr.id, gr.organization_id, gr.review_id, gr.star_rating, gr.comment,
         gr.reviewer_name, gr.is_anonymous, gr.created_time, gr.reply_comment,
         gl.google_account, gl.google_location, gl.title as ficha_title,
         l.id as location_id, l.name as location_name, l.city
    into r
    from public.google_reviews gr
    join public.google_locations gl on gl.id = gr.google_location_id
    join public.locations l on l.id = gl.location_id and l.deleted_at is null
   where gr.id = p_review;

  if not found then
    return null;
  end if;

  v_kind := case when coalesce(r.star_rating, 5) >= 4 then 'positive' else 'critical' end;

  select jsonb_build_object(
           'id', t.id, 'kind', t.kind, 'instructions', t.instructions, 'signature', t.signature,
           'emojis', jsonb_build_object('enabled', t.emojis_enabled, 'mode', t.emojis_mode,
                                        'amount', t.emojis_amount, 'custom', to_jsonb(t.emojis_custom)))
    into v_tone
    from public.review_reply_tones t
    left join public.review_reply_tone_locations tl
      on tl.tone_id = t.id and tl.location_id = r.location_id
   where t.organization_id = r.organization_id
     and (t.kind = v_kind or (v_kind = 'critical' and t.kind = 'positive'))
     and (tl.location_id is not null or t.applies_to_all)
   order by (t.kind = v_kind) desc, (tl.location_id is not null) desc
   limit 1;

  select s.contact_email::text
    into v_email
    from public.review_reply_settings s
   where s.organization_id = r.organization_id
     and (s.location_id = r.location_id or s.location_id is null)
     and s.contact_email is not null
   order by s.location_id nulls last
   limit 1;

  select ar.enabled, ar.enabled_at, ar.stars
    into v_rule
    from public.review_auto_reply_rules ar
   where ar.organization_id = r.organization_id
     and (ar.location_id = r.location_id or ar.location_id is null)
   order by ar.location_id nulls last
   limit 1;
  v_rule_found := found;

  return jsonb_build_object(
    'review', jsonb_build_object(
      'id', r.id,
      'stars', r.star_rating,
      'text', nullif(private.review_original_text(r.comment), ''),
      'first_name', case when r.is_anonymous then null
                         else nullif(split_part(btrim(coalesce(r.reviewer_name, '')), ' ', 1), '') end,
      'created_time', r.created_time,
      'has_reply', r.reply_comment is not null
    ),
    'business', jsonb_build_object(
      'name', coalesce(nullif(btrim(r.ficha_title), ''), r.location_name),
      'city', r.city
    ),
    'google', jsonb_build_object(
      'organization_id', r.organization_id,
      'location_id', r.location_id,
      'google_account', r.google_account,
      'google_location', r.google_location,
      'review_id', r.review_id
    ),
    'kind', v_kind,
    'tone', v_tone,
    'contact_email', v_email,
    'is_business', private.org_has_business(r.organization_id),
    'auto_rule_active', v_rule_found and coalesce(
      v_rule.enabled and v_rule.enabled_at is not null
        and r.created_time >= v_rule.enabled_at
        and r.star_rating = any (v_rule.stars),
      false)
  );
end;
$$;

-- Todas las del API: sólo service_role. 0001 da execute a authenticated por
-- defecto, así que hay que sacárselo a mano.
revoke all on function public.review_automation_target(uuid, uuid, uuid)          from public, anon, authenticated;
revoke all on function public.review_auto_reply_rule_get(uuid, uuid)              from public, anon, authenticated;
revoke all on function public.review_auto_reply_rule_save(uuid, uuid, uuid, boolean, smallint[], text) from public, anon, authenticated;
revoke all on function public.review_auto_reply_stats(uuid, uuid)                 from public, anon, authenticated;
revoke all on function public.review_reply_enqueue_auto(uuid)                     from public, anon, authenticated;
revoke all on function public.review_reply_enqueue_past(uuid, uuid, uuid, integer, text) from public, anon, authenticated;
revoke all on function public.review_reply_claim(integer, uuid)                   from public, anon, authenticated;
revoke all on function public.review_reply_finish(uuid, text, text, timestamptz)  from public, anon, authenticated;
revoke all on function public.review_reply_context(uuid)                          from public, anon, authenticated;
revoke all on function private.ai_replies_this_month(uuid)                        from public, anon, authenticated;
revoke all on function private.ai_reply_monthly_cap()                             from public, anon, authenticated;
revoke all on function private.google_reviews_reply_source()                      from public, anon, authenticated;
revoke all on function private.review_auto_reply_rules_enabled_at()               from public, anon, authenticated;

grant execute on function public.review_automation_target(uuid, uuid, uuid)          to service_role;
grant execute on function public.review_auto_reply_rule_get(uuid, uuid)              to service_role;
grant execute on function public.review_auto_reply_rule_save(uuid, uuid, uuid, boolean, smallint[], text) to service_role;
grant execute on function public.review_auto_reply_stats(uuid, uuid)                 to service_role;
grant execute on function public.review_reply_enqueue_auto(uuid)                     to service_role;
grant execute on function public.review_reply_enqueue_past(uuid, uuid, uuid, integer, text) to service_role;
grant execute on function public.review_reply_claim(integer, uuid)                   to service_role;
grant execute on function public.review_reply_finish(uuid, text, text, timestamptz)  to service_role;
grant execute on function public.review_reply_context(uuid)                          to service_role;


comment on table public.review_reply_tones is
  'Tono de marca para las respuestas con IA (0037). Uno por tipo (positive/critical) y ámbito; se escribe con save_review_reply_tone().';
comment on table public.review_reply_settings is
  'Datos que la IA usa al responder (0037): email de contacto para reseñas críticas, global (location_id null) o por local.';
comment on table public.review_auto_reply_rules is
  'Regla de respuesta automática por ámbito (0037). La de un local pisa a la global. Sólo el API la escribe.';
comment on table public.review_reply_jobs is
  'Cola de respuestas con IA (0037). El índice único parcial sobre review_id es el candado contra responder dos veces.';
