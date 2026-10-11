-- ============================================================================
-- 0037 — Respuestas con IA: tono de marca, respuesta automática y su cola
-- ============================================================================
-- El resto de la fase 5. El panel ya tenía las pantallas (botón «Generar
-- respuesta con IA», modal de tono de marca, las tres tarjetas de IA de
-- Automatizaciones y el mail para reseñas negativas); esto es lo que guardan y
-- lo que usa el API para escribir y publicar. Contrato de las rutas en
-- apps/dashboard/src/lib/automationsApi.js.
--
-- Tres tablas, ninguna legible desde el panel:
--
--   review_reply_settings    tono de marca + mail para reseñas negativas, uno
--                            por (organización, local); local NULL = global.
--   review_auto_reply_rules  la regla de respuesta automática, mismo alcance.
--   review_reply_jobs        la cola de lo que se publica SIN que una persona
--                            apriete «Publicar» (automáticas y «responder
--                            reseñas anteriores»).
--
-- Por qué todo pasa por el API y por funciones, sin políticas para el cliente:
-- la regla de quién puede (owner/admin en todo, un encargado sólo en sus
-- sucursales, nunca un viewer, y sólo Business) es la de responder una reseña
-- (0026), y escrita en una función se lee y se prueba mejor que repartida en
-- políticas. Mismo criterio que private.google_oauth_tokens (0024).
--
-- Decisiones que son fáciles de deshacer sin querer:
--
--   1. LA REGLA DE UN LOCAL PISA A LA GLOBAL, también si está apagada: un local
--      con su regla en «off» no se responde solo aunque la global esté en «on».
--   2. UNA REGLA NUEVA NO RESPONDE RESEÑAS VIEJAS. El trigger anota `enabled_at`
--      al prenderse (como `*_enabled_at` de la 0036) y sólo entran reseñas
--      creadas desde entonces. Lo viejo se responde a propósito, con «Responder
--      reseñas anteriores».
--   3. UNA RESEÑA ENTRA UNA SOLA VEZ A LA COLA (review_id único), y antes de
--      publicar se vuelve a mirar que siga sin respuesta (claim_reply_jobs).
--      Responder dos veces una reseña en Google es el error que no se arregla.
--   4. google_reviews.reply_source dice quién escribió la respuesta que se ve.
--      Si después Google trae otra (el dueño la cambió desde Google), vuelve a
--      NULL: no nos atribuimos lo que escribió otro.
--
-- Publicar solo está construido pero apagado en producción: el API publica sólo
-- con AI_AUTO_REPLY_PUBLISH=on (services/api/lib/autoReplies.js). La política
-- de privacidad dice «nunca publicamos por nuestra cuenta» hasta que Google
-- apruebe la verificación de la app.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. Quién escribió la respuesta publicada
-- ---------------------------------------------------------------------------
alter table public.google_reviews
  add column if not exists reply_source text;

alter table public.google_reviews
  drop constraint if exists google_reviews_reply_source_check;
alter table public.google_reviews
  add constraint google_reviews_reply_source_check
  check (reply_source is null or reply_source in ('panel', 'ai_draft', 'auto', 'past'));

comment on column public.google_reviews.reply_source is
  'Quién escribió la respuesta: panel (a mano), ai_draft (borrador de IA publicado por una persona), auto (respuesta automática), past («responder reseñas anteriores»). NULL: vino de Google.';

create index if not exists google_reviews_auto_replied_idx
  on public.google_reviews (organization_id)
  where reply_source in ('auto', 'past');

-- La sincronización (reviewSync.js) hace upsert de reply_comment con lo que
-- tiene Google y no toca reply_source. Si el texto cambia y no fue
-- google_record_reply() el que lo cambió, la respuesta ya no es nuestra.
create or replace function private.google_reviews_reply_source()
returns trigger
language plpgsql
as $$
begin
  if new.reply_comment is null then
    new.reply_source := null;
  elsif new.reply_comment is distinct from old.reply_comment
        and coalesce(current_setting('linkstar.recording_reply', true), '') <> 'on' then
    new.reply_source := null;
  end if;
  return new;
end;
$$;

drop trigger if exists google_reviews_reply_source on public.google_reviews;
create trigger google_reviews_reply_source
  before update of reply_comment, reply_source on public.google_reviews
  for each row execute function private.google_reviews_reply_source();


-- ---------------------------------------------------------------------------
-- 2. Tono de marca y mail para reseñas negativas
-- ---------------------------------------------------------------------------
-- La forma de `emojis` es la de DEFAULT_BRAND_TONE en BrandToneModal.jsx.
create or replace function private.valid_reply_emojis(p jsonb)
returns boolean
language sql
immutable
as $$
  select jsonb_typeof(p) = 'object'
     and (select count(*) from jsonb_object_keys(p)) = 4
     and jsonb_typeof(p -> 'enabled') = 'boolean'
     and p ->> 'mode' in ('auto', 'custom')
     and p ->> 'amount' in ('moderate', 'few')
     and jsonb_typeof(p -> 'custom') = 'array'
     and jsonb_array_length(p -> 'custom') <= 10
     and not exists (
       select 1 from jsonb_array_elements(p -> 'custom') e
        where jsonb_typeof(e) <> 'string' or char_length(e #>> '{}') not between 1 and 16
     );
$$;

create table if not exists public.review_reply_settings (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null references public.organizations(id) on delete cascade,
  location_id            uuid references public.locations(id) on delete cascade,

  -- El tono. `tone_saved_at` NULL = en este alcance no hay tono (la fila puede
  -- existir sólo por el mail): se usa el global.
  instructions           text not null default '' check (char_length(instructions) <= 500),
  signature              text not null default '' check (char_length(signature) <= 120),
  emojis                 jsonb not null
                           default '{"enabled": false, "mode": "auto", "amount": "moderate", "custom": []}'
                           check (private.valid_reply_emojis(emojis)),
  -- business = siempre en el idioma del negocio (castellano); review = en el
  -- idioma en que escribió el cliente.
  language               text not null default 'business' check (language in ('business', 'review')),
  tone_saved_at          timestamptz,

  -- Público: la IA lo cita en las respuestas a reseñas de 1 a 3 estrellas.
  -- `extensions.citext` calificado: ver la nota de la 0023.
  negative_contact_email extensions.citext
                           check (negative_contact_email is null
                                  or negative_contact_email::text ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),

  updated_by             uuid references auth.users(id) on delete set null,
  updated_at             timestamptz not null default now(),

  constraint review_reply_settings_scope_key unique nulls not distinct (organization_id, location_id)
);

comment on table public.review_reply_settings is
  'Tono de marca y mail para reseñas negativas de las respuestas con IA. location_id NULL = global; el de un local pisa al global. Sólo por el API (0037).';


-- ---------------------------------------------------------------------------
-- 3. Regla de respuesta automática
-- ---------------------------------------------------------------------------
create or replace function private.valid_reply_stars(p_stars smallint[])
returns boolean
language sql
immutable
as $$
  select coalesce(array_length(p_stars, 1), 0) between 1 and 5
     and not exists (select 1 from unnest(p_stars) s where s is null or s not between 1 and 5);
$$;

create table if not exists public.review_auto_reply_rules (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id     uuid references public.locations(id) on delete cascade,
  enabled         boolean not null default false,
  stars           smallint[] not null default '{4,5}' check (private.valid_reply_stars(stars)),
  delay           text not null default 'now' check (delay in ('now', '1-3h', '3-6h')),
  enabled_at      timestamptz,
  updated_by      uuid references auth.users(id) on delete set null,
  updated_at      timestamptz not null default now(),

  constraint review_auto_reply_rules_scope_key unique nulls not distinct (organization_id, location_id)
);

comment on table public.review_auto_reply_rules is
  'Regla de respuesta automática con IA. location_id NULL = «Todos los locales»; la de un local la pisa aunque esté apagada. Sólo por el API (0037).';

-- Como en la 0036: `enabled_at` lo pone la base al prenderse, nunca el cliente.
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


-- ---------------------------------------------------------------------------
-- 4. La cola de lo que se publica solo
-- ---------------------------------------------------------------------------
create table if not exists public.review_reply_jobs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  review_id       uuid not null unique references public.google_reviews(id) on delete cascade,
  source          text not null check (source in ('auto', 'past')),
  due_at          timestamptz not null default now(),
  status          text not null default 'pending'
                    check (status in ('pending', 'processing', 'done', 'failed', 'skipped')),
  attempts        smallint not null default 0,
  error           text,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  started_at      timestamptz,
  finished_at     timestamptz
);

create index if not exists review_reply_jobs_due_idx on public.review_reply_jobs (status, due_at);
create index if not exists review_reply_jobs_org_idx on public.review_reply_jobs (organization_id);

comment on table public.review_reply_jobs is
  'Respuestas con IA que se publican sin que una persona apriete «Publicar». Una fila por reseña. Las procesa services/api/lib/autoReplies.js (0037).';


-- ---------------------------------------------------------------------------
-- 5. Ninguna de las tres se lee ni se escribe desde el panel
-- ---------------------------------------------------------------------------
alter table public.review_reply_settings   enable row level security;
alter table public.review_reply_settings   force  row level security;
alter table public.review_auto_reply_rules enable row level security;
alter table public.review_auto_reply_rules force  row level security;
alter table public.review_reply_jobs       enable row level security;
alter table public.review_reply_jobs       force  row level security;

revoke all on public.review_reply_settings   from anon, authenticated;
revoke all on public.review_auto_reply_rules from anon, authenticated;
revoke all on public.review_reply_jobs       from anon, authenticated;


-- ---------------------------------------------------------------------------
-- 6. Quién puede: una reseña puntual y un alcance (org + local)
-- ---------------------------------------------------------------------------
-- La reseña para escribirle un borrador: la regla de responder (0026) más el
-- corte Business, y lo que la IA necesita saber de ella. El nombre de quien
-- escribió sale para que el API lo complete en el texto: al modelo no le llega.
create or replace function public.review_ai_target(p_user uuid, p_review uuid)
returns table (
  organization_id uuid,
  location_id     uuid,
  google_account  text,
  google_location text,
  review_id       text,
  star_rating     smallint,
  comment         text,
  reviewer_name   text,
  is_anonymous    boolean,
  business_name   text,
  has_reply       boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_target record;
begin
  select * into v_target from public.google_review_reply_target(p_user, p_review);

  if not private.org_has_business(v_target.organization_id) then
    raise exception 'solo_business';
  end if;

  return query
  select v_target.organization_id,
         gl.location_id,
         v_target.google_account,
         v_target.google_location,
         v_target.review_id,
         r.star_rating,
         private.review_original_text(r.comment),
         r.reviewer_name,
         r.is_anonymous,
         coalesce(nullif(btrim(gl.title), ''), l.name),
         r.reply_comment is not null
    from public.google_reviews r
    join public.google_locations gl on gl.id = r.google_location_id
    join public.locations l on l.id = gl.location_id
   where r.id = p_review;
end;
$$;

-- Lo mismo para el ejecutor de la cola, que no tiene usuario: el permiso ya se
-- decidió al encolar (la regla la guardó alguien con permiso, o «responder
-- anteriores» lo pidió alguien con permiso) y claim_reply_jobs() acaba de
-- volver a mirar que se pueda publicar.
create or replace function public.review_reply_job_target(p_review uuid)
returns table (
  organization_id uuid,
  location_id     uuid,
  google_account  text,
  google_location text,
  review_id       text,
  star_rating     smallint,
  comment         text,
  reviewer_name   text,
  is_anonymous    boolean,
  business_name   text,
  has_reply       boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select r.organization_id,
         gl.location_id,
         gl.google_account,
         gl.google_location,
         r.review_id,
         r.star_rating,
         private.review_original_text(r.comment),
         r.reviewer_name,
         r.is_anonymous,
         coalesce(nullif(btrim(gl.title), ''), l.name),
         r.reply_comment is not null
    from public.google_reviews r
    join public.google_locations gl on gl.id = r.google_location_id
    join public.locations l on l.id = gl.location_id and l.deleted_at is null
   where r.id = p_review;
$$;

-- Leer o escribir el tono, el mail o la regla de un alcance. `p_location` NULL
-- es el global («Todos los locales»). Un encargado puede LEER el global (es lo
-- que heredan sus sucursales) pero no escribirlo.
create or replace function public.review_ai_scope_target(
  p_user     uuid,
  p_org      uuid,
  p_location uuid,
  p_write    boolean default false
)
returns public.org_role
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_role public.org_role;
begin
  select m.role into v_role
    from public.memberships m
   where m.organization_id = p_org and m.user_id = p_user;

  if v_role is null or v_role = 'viewer' then
    raise exception 'rol_insuficiente';
  end if;

  if p_location is not null and not exists (
       select 1 from public.locations l
        where l.id = p_location and l.organization_id = p_org and l.deleted_at is null
     ) then
    raise exception 'local_inexistente';
  end if;

  if v_role = 'manager' then
    if p_location is null then
      if p_write then
        raise exception 'rol_insuficiente';
      end if;
    elsif not exists (
      select 1
        from public.memberships m
        join public.membership_locations ml on ml.membership_id = m.id
       where m.organization_id = p_org and m.user_id = p_user and ml.location_id = p_location
    ) then
      raise exception 'rol_insuficiente';
    end if;
  end if;

  if not public.org_has_access(p_org) then
    raise exception 'sin_acceso';
  end if;

  if not private.org_has_business(p_org) then
    raise exception 'solo_business';
  end if;

  return v_role;
end;
$$;


-- ---------------------------------------------------------------------------
-- 7. Tono de marca y mail: leer y guardar
-- ---------------------------------------------------------------------------
-- Lo que aplica a un local: su tono si tiene, si no el global; lo mismo con el
-- mail, por separado (un local puede tener mail propio y usar el tono global).
create or replace function public.review_reply_context(p_org uuid, p_location uuid)
returns table (
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
  with scoped as (
    select s.*, (s.location_id is null) as is_global
      from public.review_reply_settings s
     where s.organization_id = p_org
       and (s.location_id is null or s.location_id = p_location)
  ),
  tone as (
    select * from scoped where tone_saved_at is not null order by is_global limit 1
  ),
  email as (
    select negative_contact_email from scoped
     where negative_contact_email is not null order by is_global limit 1
  )
  select coalesce((select t.instructions from tone t), ''),
         coalesce((select t.signature from tone t), ''),
         coalesce((select t.emojis from tone t),
                  '{"enabled": false, "mode": "auto", "amount": "moderate", "custom": []}'::jsonb),
         coalesce((select t.language from tone t), 'business'),
         (select e.negative_contact_email::text from email e);
$$;

create or replace function public.list_brand_tones(p_user uuid, p_org uuid)
returns table (
  location_id   uuid,
  location_name text,
  instructions  text,
  signature     text,
  emojis        jsonb,
  language      text,
  updated_at    timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_role public.org_role;
begin
  v_role := public.review_ai_scope_target(p_user, p_org, null, false);

  return query
  select s.location_id, l.name, s.instructions, s.signature, s.emojis, s.language, s.updated_at
    from public.review_reply_settings s
    left join public.locations l on l.id = s.location_id
   where s.organization_id = p_org
     and s.tone_saved_at is not null
     and (s.location_id is null or l.deleted_at is null)
     and (v_role in ('owner', 'admin')
          or s.location_id is null
          or exists (
            select 1
              from public.memberships m
              join public.membership_locations ml on ml.membership_id = m.id
             where m.organization_id = p_org and m.user_id = p_user and ml.location_id = s.location_id
          ))
   order by s.location_id is not null, l.name;
end;
$$;

create or replace function public.save_brand_tone(
  p_user         uuid,
  p_org          uuid,
  p_location     uuid,
  p_instructions text,
  p_signature    text,
  p_emojis       jsonb,
  p_language     text default 'business'
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.review_ai_scope_target(p_user, p_org, p_location, true);

  insert into public.review_reply_settings as s
    (organization_id, location_id, instructions, signature, emojis, language, tone_saved_at, updated_by, updated_at)
  values
    (p_org, p_location, btrim(coalesce(p_instructions, '')), btrim(coalesce(p_signature, '')),
     p_emojis, coalesce(p_language, 'business'), now(), p_user, now())
  on conflict on constraint review_reply_settings_scope_key do update
     set instructions  = excluded.instructions,
         signature     = excluded.signature,
         emojis        = excluded.emojis,
         language      = excluded.language,
         tone_saved_at = now(),
         updated_by    = excluded.updated_by,
         updated_at    = now();
end;
$$;

create or replace function public.delete_brand_tone(p_user uuid, p_org uuid, p_location uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.review_ai_scope_target(p_user, p_org, p_location, true);

  update public.review_reply_settings
     set instructions  = '',
         signature     = '',
         emojis        = '{"enabled": false, "mode": "auto", "amount": "moderate", "custom": []}'::jsonb,
         language      = 'business',
         tone_saved_at = null,
         updated_by    = p_user,
         updated_at    = now()
   where organization_id = p_org
     and location_id is not distinct from p_location;

  -- Sin tono ni mail la fila no dice nada.
  delete from public.review_reply_settings
   where organization_id = p_org
     and location_id is not distinct from p_location
     and tone_saved_at is null
     and negative_contact_email is null;
end;
$$;

-- El mail guardado en ESE alcance (no el heredado): es lo que edita la pantalla.
create or replace function public.get_negative_contact(p_user uuid, p_org uuid, p_location uuid)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.review_ai_scope_target(p_user, p_org, p_location, false);

  return (
    select s.negative_contact_email::text
      from public.review_reply_settings s
     where s.organization_id = p_org
       and s.location_id is not distinct from p_location
  );
end;
$$;

-- p_email NULL o vacío borra el mail de ese alcance.
create or replace function public.save_negative_contact(p_user uuid, p_org uuid, p_location uuid, p_email text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text := nullif(btrim(coalesce(p_email, '')), '');
begin
  perform public.review_ai_scope_target(p_user, p_org, p_location, true);

  insert into public.review_reply_settings as s
    (organization_id, location_id, negative_contact_email, updated_by, updated_at)
  values (p_org, p_location, v_email, p_user, now())
  on conflict on constraint review_reply_settings_scope_key do update
     set negative_contact_email = excluded.negative_contact_email,
         updated_by             = excluded.updated_by,
         updated_at             = now();

  delete from public.review_reply_settings
   where organization_id = p_org
     and location_id is not distinct from p_location
     and tone_saved_at is null
     and negative_contact_email is null;
end;
$$;


-- ---------------------------------------------------------------------------
-- 8. Regla automática: leer, guardar y el contador
-- ---------------------------------------------------------------------------
-- La regla guardada en ESE alcance. Sin regla, cero filas: el API devuelve los
-- valores por defecto (AUTO_REPLY_DEFAULTS del panel).
create or replace function public.get_auto_reply_rule(p_user uuid, p_org uuid, p_location uuid)
returns table (enabled boolean, stars smallint[], delay text, location_id uuid)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
begin
  perform public.review_ai_scope_target(p_user, p_org, p_location, false);

  return query
  select r.enabled, r.stars, r.delay, r.location_id
    from public.review_auto_reply_rules r
   where r.organization_id = p_org
     and r.location_id is not distinct from p_location;
end;
$$;

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

-- Las reseñas que respondió la automatización (sola o con «responder
-- anteriores»). Los minutos son una estimación: 2 por respuesta, lo que tarda
-- una persona en leer la reseña y escribir dos líneas. La pantalla lo presenta
-- como «tiempo ahorrado», no como algo medido.
create or replace function public.auto_reply_stats(p_user uuid, p_org uuid, p_location uuid)
returns table (replied integer, minutes_saved integer)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_count integer;
begin
  perform public.review_ai_scope_target(p_user, p_org, p_location, false);

  select count(*)::integer into v_count
    from public.google_reviews r
    join public.google_locations gl on gl.id = r.google_location_id
   where r.organization_id = p_org
     and r.reply_source in ('auto', 'past')
     and (p_location is null or gl.location_id = p_location);

  return query select v_count, v_count * 2;
end;
$$;


-- ---------------------------------------------------------------------------
-- 9. La cola: encolar, tomar y cerrar
-- ---------------------------------------------------------------------------
-- Las automáticas: reseñas sin respuesta de fichas vinculadas a una sucursal
-- viva (0025), creadas después de que se prendió la regla que les toca (la del
-- local si existe, si no la global) y con estrellas dentro de esa regla.
create or replace function public.enqueue_auto_replies()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  insert into public.review_reply_jobs (organization_id, review_id, source, due_at)
  select r.organization_id,
         r.id,
         'auto',
         now() + case rule.delay
                   when '1-3h' then interval '1 hour' + random() * interval '2 hours'
                   when '3-6h' then interval '3 hours' + random() * interval '3 hours'
                   else interval '0'
                 end
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
     and r.star_rating = any (rule.stars)
     and private.org_has_business(r.organization_id)
  on conflict (review_id) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- «Responder reseñas anteriores»: las `p_count` más nuevas sin respuesta del
-- filtro. Una reseña que ya estaba en la cola y quedó salteada o falló vuelve a
-- entrar; una pendiente, en curso o hecha, no.
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
   limit greatest(1, least(coalesce(p_count, 1), 200))
  on conflict (review_id) do update
     set source      = 'past',
         status      = 'pending',
         due_at      = now(),
         attempts    = 0,
         error       = null,
         created_by  = excluded.created_by,
         started_at  = null,
         finished_at = null
   where j.status in ('skipped', 'failed');

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Toma las que vencieron (y las que quedaron colgadas en 'processing' más de
-- 30 minutos, o fallaron hace más de una hora con menos de 3 intentos) y antes
-- de devolverlas vuelve a mirar que se puedan publicar. Las que no, quedan
-- 'skipped' con el motivo.
create or replace function public.claim_reply_jobs(p_limit integer default 50, p_org uuid default null)
returns table (job_id uuid, organization_id uuid, review_id uuid, source text, created_by uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_job    record;
  v_reason text;
begin
  for v_job in
    select j.id, j.organization_id, j.review_id, j.source, j.created_by
      from public.review_reply_jobs j
     where (p_org is null or j.organization_id = p_org)
       and (   (j.status = 'pending' and j.due_at <= now())
            or (j.status = 'processing' and j.started_at < now() - interval '30 minutes')
            or (j.status = 'failed' and j.attempts < 3 and j.finished_at < now() - interval '1 hour'))
     order by j.due_at
     limit greatest(1, least(coalesce(p_limit, 50), 200))
     for update skip locked
  loop
    v_reason := null;

    select case
             when r.id is null then 'resena_inexistente'
             when r.reply_comment is not null then 'ya_respondida'
             when l.id is null then 'ficha_desvinculada'
             when not private.org_has_business(v_job.organization_id) then 'sin_business'
             when v_job.source = 'auto' and not coalesce((
                    select ru.enabled and r.star_rating = any (ru.stars)
                      from public.review_auto_reply_rules ru
                     where ru.organization_id = v_job.organization_id
                       and (ru.location_id = gl.location_id or ru.location_id is null)
                     order by ru.location_id nulls last
                     limit 1
                  ), false) then 'regla_apagada'
           end
      into v_reason
      from (select 1) one
      left join public.google_reviews r on r.id = v_job.review_id
      left join public.google_locations gl on gl.id = r.google_location_id
      left join public.locations l on l.id = gl.location_id and l.deleted_at is null;

    if v_reason is not null then
      update public.review_reply_jobs
         set status = 'skipped', error = v_reason, finished_at = now()
       where id = v_job.id;
      continue;
    end if;

    update public.review_reply_jobs
       set status = 'processing', started_at = now(), attempts = attempts + 1, error = null
     where id = v_job.id;

    job_id := v_job.id;
    organization_id := v_job.organization_id;
    review_id := v_job.review_id;
    source := v_job.source;
    created_by := v_job.created_by;
    return next;
  end loop;
end;
$$;

create or replace function public.finish_reply_job(p_job uuid, p_status text, p_error text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_status not in ('done', 'failed', 'skipped') then
    raise exception 'estado_invalido';
  end if;

  update public.review_reply_jobs
     set status = p_status, error = left(p_error, 500), finished_at = now()
   where id = p_job;
end;
$$;

-- Lo que hay vencido y esperando, sin tocarlo: lo usa el ejecutor cuando
-- publicar está apagado (AI_AUTO_REPLY_PUBLISH) para contar sin cambiar nada.
create or replace function public.pending_reply_jobs(p_org uuid default null)
returns table (organization_id uuid, source text, due integer, waiting integer)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select j.organization_id, j.source,
         count(*) filter (where j.due_at <= now())::integer,
         count(*) filter (where j.due_at > now())::integer
    from public.review_reply_jobs j
   where j.status = 'pending'
     and (p_org is null or j.organization_id = p_org)
   group by j.organization_id, j.source
   order by j.organization_id, j.source;
$$;


-- ---------------------------------------------------------------------------
-- 10. google_record_reply con el origen de la respuesta
-- ---------------------------------------------------------------------------
-- Se reemplaza (cambia la firma): suma `p_source` y acepta `p_user` NULL para
-- las automáticas (audit_log.actor_id ya es nullable). La llamada de antes, con
-- argumentos por nombre, sigue funcionando.
drop function if exists public.google_record_reply(uuid, uuid, text, timestamptz);

create function public.google_record_reply(
  p_review  uuid,
  p_user    uuid,
  p_comment text,
  p_updated timestamptz,
  p_source  text default 'panel'
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
  if p_source not in ('panel', 'ai_draft', 'auto', 'past') then
    raise exception 'origen_invalido';
  end if;

  select organization_id, reply_comment is not null
    into v_org, v_had
    from public.google_reviews
   where id = p_review;

  if v_org is null then
    raise exception 'resena_inexistente';
  end if;

  -- El trigger de reply_source deja pasar el cambio sólo con esta marca.
  perform set_config('linkstar.recording_reply', 'on', true);

  update public.google_reviews
     set reply_comment      = p_comment,
         reply_updated_time = coalesce(p_updated, now()),
         reply_source       = p_source
   where id = p_review;

  perform set_config('linkstar.recording_reply', '', true);

  insert into public.audit_log (organization_id, actor_id, action, entity_type, entity_id, metadata)
  values (v_org, p_user, 'google.review_replied', 'google_review', p_review,
          jsonb_build_object('edited', v_had, 'source', p_source));
end;
$$;


-- ---------------------------------------------------------------------------
-- 11. Permisos: todo sólo para service_role
-- ---------------------------------------------------------------------------
revoke all on function public.review_ai_target(uuid, uuid) from public, anon, authenticated;
revoke all on function public.review_reply_job_target(uuid) from public, anon, authenticated;
revoke all on function public.review_ai_scope_target(uuid, uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.review_reply_context(uuid, uuid) from public, anon, authenticated;
revoke all on function public.list_brand_tones(uuid, uuid) from public, anon, authenticated;
revoke all on function public.save_brand_tone(uuid, uuid, uuid, text, text, jsonb, text) from public, anon, authenticated;
revoke all on function public.delete_brand_tone(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.get_negative_contact(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.save_negative_contact(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.get_auto_reply_rule(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.save_auto_reply_rule(uuid, uuid, uuid, boolean, smallint[], text) from public, anon, authenticated;
revoke all on function public.auto_reply_stats(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.enqueue_auto_replies() from public, anon, authenticated;
revoke all on function public.enqueue_past_replies(uuid, uuid, uuid, integer, text) from public, anon, authenticated;
revoke all on function public.claim_reply_jobs(integer, uuid) from public, anon, authenticated;
revoke all on function public.finish_reply_job(uuid, text, text) from public, anon, authenticated;
revoke all on function public.pending_reply_jobs(uuid) from public, anon, authenticated;
revoke all on function public.google_record_reply(uuid, uuid, text, timestamptz, text) from public, anon, authenticated;

grant execute on function public.review_ai_target(uuid, uuid) to service_role;
grant execute on function public.review_reply_job_target(uuid) to service_role;
grant execute on function public.review_ai_scope_target(uuid, uuid, uuid, boolean) to service_role;
grant execute on function public.review_reply_context(uuid, uuid) to service_role;
grant execute on function public.list_brand_tones(uuid, uuid) to service_role;
grant execute on function public.save_brand_tone(uuid, uuid, uuid, text, text, jsonb, text) to service_role;
grant execute on function public.delete_brand_tone(uuid, uuid, uuid) to service_role;
grant execute on function public.get_negative_contact(uuid, uuid, uuid) to service_role;
grant execute on function public.save_negative_contact(uuid, uuid, uuid, text) to service_role;
grant execute on function public.get_auto_reply_rule(uuid, uuid, uuid) to service_role;
grant execute on function public.save_auto_reply_rule(uuid, uuid, uuid, boolean, smallint[], text) to service_role;
grant execute on function public.auto_reply_stats(uuid, uuid, uuid) to service_role;
grant execute on function public.enqueue_auto_replies() to service_role;
grant execute on function public.enqueue_past_replies(uuid, uuid, uuid, integer, text) to service_role;
grant execute on function public.claim_reply_jobs(integer, uuid) to service_role;
grant execute on function public.finish_reply_job(uuid, text, text) to service_role;
grant execute on function public.pending_reply_jobs(uuid) to service_role;
grant execute on function public.google_record_reply(uuid, uuid, text, timestamptz, text) to service_role;
