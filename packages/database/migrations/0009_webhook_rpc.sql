-- ============================================================================
-- LINKSTAR — 0009: RPC de idempotencia para webhooks
-- ============================================================================
-- private.webhook_events no es alcanzable vía PostgREST (el schema `private`
-- nunca se expone a la API, ver 0001/0006). El backend de Express necesita
-- escribir ahí para no duplicar pagos cuando Mercado Pago reintenta una
-- notificación. Esta función es el único puente permitido: SECURITY DEFINER,
-- otorgada sólo a `service_role`, jamás a `anon`/`authenticated`.
--
-- Devuelve TRUE la primera vez que ve un (provider, topic, external_id)
-- ⇒ el backend debe procesar la notificación.
-- Devuelve FALSE si ya lo había visto ⇒ el backend responde 200 y no hace nada más.
-- ============================================================================
create or replace function public.record_webhook_event(
  p_provider        text,
  p_topic           text,
  p_external_id     text,
  p_payload         jsonb,
  p_signature_valid boolean default null
)
returns boolean
language plpgsql
security definer
set search_path = private, pg_temp
as $$
declare
  v_rows integer;
begin
  insert into private.webhook_events (provider, topic, external_id, payload, signature_valid)
  values (p_provider, p_topic, p_external_id, p_payload, p_signature_valid)
  on conflict (provider, topic, external_id) do nothing;

  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

revoke all on function public.record_webhook_event(text, text, text, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.record_webhook_event(text, text, text, jsonb, boolean) to service_role;

-- Marca un evento ya insertado como procesado (o con error), para diagnóstico.
create or replace function public.mark_webhook_processed(
  p_provider    text,
  p_topic       text,
  p_external_id text,
  p_error       text default null
)
returns void
language sql
security definer
set search_path = private, pg_temp
as $$
  update private.webhook_events
  set processed_at = now(),
      attempts      = attempts + 1,
      error         = p_error
  where provider = p_provider
    and topic = p_topic
    and external_id = p_external_id;
$$;

revoke all on function public.mark_webhook_processed(text, text, text, text) from public, anon, authenticated;
grant execute on function public.mark_webhook_processed(text, text, text, text) to service_role;
