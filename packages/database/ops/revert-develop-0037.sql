-- ============================================================================
-- Devuelve una base con la 0037 de `develop` (0037_ai_review_replies.sql,
-- PR #14 del 13 oct 2026) al estado de la 0036, para que después `db push`
-- aplique la 0037 de producción (0037_ai_replies.sql) y la 0038.
-- ============================================================================
-- Para qué existe: dos implementaciones distintas de las respuestas con IA
-- salieron con el mismo número. Producción tiene la de `main`; el proyecto de
-- pruebas (ref mbhuzrrjyboyimqvnrpy) recibió la de `develop`. Como la versión
-- 0037 ya figura aplicada ahí, `db push` la saltearía y la 0038 fallaría sobre
-- tablas con otra forma. Pasos completos en
-- packages/database/supabase/README.md («Proyecto de pruebas: volver al
-- esquema de producción»).
--
-- SÓLO para una base que tiene la 0037 de develop. Se niega a correr si la
-- 0037 registrada no es `ai_review_replies` (por ejemplo, en producción).
--
-- Se manda entero en una sola consulta (psql -f, o client.query(texto) de
-- node-pg). Es una transacción: si algo falla, no cambia nada.
--
-- Qué se pierde: tonos, emails, reglas y cola cargados con la versión de
-- develop, y el origen (reply_source) de las respuestas. Las respuestas en sí
-- (reply_comment) y el registro de actividad quedan.
-- ============================================================================

begin;

do $$
begin
  if not exists (
    select 1 from supabase_migrations.schema_migrations
     where version = '0037' and name = 'ai_review_replies'
  ) then
    raise exception 'Esta base no tiene la 0037 de develop (ai_review_replies). No se toca nada.';
  end if;
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'review_reply_tones' and column_name = 'emojis_enabled'
  ) then
    raise exception 'review_reply_tones no tiene la forma de develop. No se toca nada.';
  end if;
end $$;

-- Funciones de develop (el API las llama; las tablas caen después).
drop function if exists public.review_automation_target(uuid, uuid, uuid);
drop function if exists public.review_auto_reply_rule_get(uuid, uuid);
drop function if exists public.review_auto_reply_rule_save(uuid, uuid, uuid, boolean, smallint[], text);
drop function if exists public.review_auto_reply_stats(uuid, uuid);
drop function if exists public.review_reply_enqueue_auto(uuid);
drop function if exists public.review_reply_enqueue_past(uuid, uuid, uuid, integer, text);
drop function if exists public.review_reply_claim(integer, uuid);
drop function if exists public.review_reply_finish(uuid, text, text, timestamptz);
drop function if exists public.review_reply_context(uuid);
drop function if exists public.save_review_reply_tone(jsonb);
drop function if exists public.delete_review_reply_tone(uuid);
drop function if exists private.ai_replies_this_month(uuid);
drop function if exists private.ai_reply_monthly_cap();

-- Tablas de develop.
drop table if exists public.review_reply_jobs cascade;
drop table if exists public.review_auto_reply_rules cascade;
drop table if exists public.review_reply_settings cascade;
drop table if exists public.review_reply_tone_locations cascade;
drop table if exists public.review_reply_tones cascade;
drop function if exists private.review_auto_reply_rules_enabled_at();

-- El origen de las respuestas (develop: manual / ai_assisted / auto).
drop trigger if exists google_reviews_reply_source on public.google_reviews;
drop function if exists private.google_reviews_reply_source();
drop index if exists public.google_reviews_reply_source_idx;
alter table public.google_reviews drop constraint if exists google_reviews_reply_source_check;
alter table public.google_reviews drop column if exists reply_source;

-- google_record_reply vuelve a ser la de la 0026 (cuatro argumentos). La 0037
-- de producción la vuelve a reemplazar.
drop function if exists public.google_record_reply(uuid, uuid, text, timestamptz, text);

create or replace function public.google_record_reply(
  p_review  uuid,
  p_user    uuid,
  p_comment text,
  p_updated timestamptz
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
  select organization_id, reply_comment is not null
    into v_org, v_had
    from public.google_reviews
   where id = p_review;

  if v_org is null then
    raise exception 'resena_inexistente';
  end if;

  update public.google_reviews
     set reply_comment      = p_comment,
         reply_updated_time = coalesce(p_updated, now())
   where id = p_review;

  insert into public.audit_log (organization_id, actor_id, action, entity_type, entity_id, metadata)
  values (v_org, p_user, 'google.review_replied', 'google_review', p_review,
          jsonb_build_object('edited', v_had));
end;
$$;

revoke all on function public.google_record_reply(uuid, uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.google_record_reply(uuid, uuid, text, timestamptz) to service_role;

-- El historial: la 0037 deja de figurar aplicada (lo mismo que
-- `supabase migration repair --status reverted 0037`), así el próximo
-- `db push` aplica la de producción.
delete from supabase_migrations.schema_migrations where version = '0037';

commit;
