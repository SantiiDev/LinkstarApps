-- ============================================================================
-- 0035 — Los dos tipos de aviso nuevos de Automatizaciones
-- ============================================================================
-- «Alerta por valoración baja» y «Alerta por palabras clave»: un mail cuando
-- entra una reseña con pocas estrellas o que nombra una palabra que eligió el
-- cliente. La lógica (columnas, trigger y pending_notifications) es la 0036.
--
-- Va sola porque un valor de enum recién agregado no se puede usar dentro de la
-- misma transacción (misma nota que la 0030 con 'profile_changed'), y cada
-- archivo de migración es una transacción.
-- ============================================================================

alter type public.notification_kind add value if not exists 'low_rating';
alter type public.notification_kind add value if not exists 'review_keyword';
