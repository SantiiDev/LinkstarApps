-- ============================================================================
-- LINKSTAR — 0010: Tracking de login en profiles
-- ============================================================================
-- Registra el último login de cada usuario. La escribe el backend (Express)
-- con el cliente service_role tras validar el JWT de la sesión — igual que
-- el resto de escrituras de confianza del proyecto (resolve_scan, webhooks).
-- El cliente (anon/authenticated) nunca escribe esta columna directamente.
-- ============================================================================

alter table public.profiles
  add column last_login_at timestamptz;
