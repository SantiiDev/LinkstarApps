-- ============================================================================
-- 0039 — Respuestas con IA: se borra el tono de la 0037
-- ============================================================================
-- La parte «contract» del expand/contract que empezó la 0038. La 0038 trajo los
-- tonos por tipo y por locales (review_reply_tones + review_reply_tone_locations)
-- y dejó lo de la 0037 en su lugar para que el API viejo siguiera andando entre
-- el `db push` y el deploy. El API y el panel nuevos están desplegados desde el
-- merge d1abc8c (14 oct 2026) y ya no usan nada de esto:
--
--   * public.list_brand_tones(uuid, uuid)
--   * public.save_brand_tone(uuid, uuid, uuid, text, text, jsonb, text)
--   * public.delete_brand_tone(uuid, uuid, uuid)
--   * public.review_reply_context(uuid, uuid)   (lo reemplaza
--                                                review_reply_writer_context)
--   * las columnas de tono de review_reply_settings: instructions, signature,
--     emojis y tone_saved_at.
--
-- review_reply_settings se queda con lo que todavía usa el API:
-- negative_contact_email (por alcance) y language (vale el de la fila global).
--
-- private.valid_reply_emojis() NO se borra: la usa el check de
-- review_reply_tones.emojis (0038).
--
-- ORDEN: esto va DESPUÉS del deploy del API nuevo. Con el API de la 0037
-- corriendo, guardar o leer un tono daría «function does not exist».
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. Las funciones
-- ---------------------------------------------------------------------------
drop function if exists public.list_brand_tones(uuid, uuid);
drop function if exists public.save_brand_tone(uuid, uuid, uuid, text, text, jsonb, text);
drop function if exists public.delete_brand_tone(uuid, uuid, uuid);
drop function if exists public.review_reply_context(uuid, uuid);


-- ---------------------------------------------------------------------------
-- 2. save_negative_contact() sin tone_saved_at
-- ---------------------------------------------------------------------------
-- Misma firma que en la 0037. Borraba la fila de un alcance cuando no quedaba
-- ni tono ni mail; sin tono en esta tabla, la fila sólo dice algo si tiene
-- mail o un idioma distinto del de por defecto. Lo del idioma es a propósito:
-- borrar el mail de la fila global no tiene que llevarse un `language =
-- 'review'` (todavía no hay control en el panel, pero el API viejo lo podía
-- guardar con el tono).
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

  -- Sin mail ni idioma propio la fila no dice nada.
  delete from public.review_reply_settings
   where organization_id = p_org
     and location_id is not distinct from p_location
     and negative_contact_email is null
     and language = 'business';
end;
$$;


-- ---------------------------------------------------------------------------
-- 3. Las columnas
-- ---------------------------------------------------------------------------
-- Las filas que existían sólo por el tono quedarían vacías: se borran antes,
-- con la misma regla que save_negative_contact(). Los tonos ya se copiaron a
-- review_reply_tones en la 0038.
delete from public.review_reply_settings
 where negative_contact_email is null
   and language = 'business';

-- El check de `emojis` (private.valid_reply_emojis) se va con la columna.
alter table public.review_reply_settings
  drop column if exists instructions,
  drop column if exists signature,
  drop column if exists emojis,
  drop column if exists tone_saved_at;

comment on table public.review_reply_settings is
  'Mail para reseñas negativas (por alcance: location_id NULL = global; el de un local pisa al global) e idioma de las respuestas con IA (vale el de la fila global). El tono vive en review_reply_tones (0038). Sólo por el API (0037, 0039).';
