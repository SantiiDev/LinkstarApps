-- ============================================================================
-- LINKSTAR — 0012: RPC para recomputar el rollup de un día a demanda
-- ============================================================================
-- private.rebuild_daily_rollups() (0007_functions_and_jobs.sql) ya hace el
-- DELETE + INSERT idempotente por día — pensado para el cron nocturno, que
-- por eso recalcula "ayer" por default. Vivir en el schema `private` la deja
-- fuera de la API de PostgREST (config.toml sólo expone `public`/
-- `graphql_public`), así que no hay forma de invocarla a demanda desde un
-- script sin pasar por psql directo.
--
-- Esta función es sólo un wrapper delgado en `public` — no reimplementa nada,
-- llama a la misma private.rebuild_daily_rollups() de siempre. El único
-- cambio de comportamiento es el default: current_date (hoy) en vez de
-- current_date - 1 (ayer), porque el caso de uso acá es "quiero ver el
-- dashboard actualizado ahora, sin esperar al job nocturno" — para eso
-- necesitás el rollup de HOY, no el de ayer.
--
-- Sigue siendo seguro correrla las veces que quieras: hereda el DELETE+INSERT
-- idempotente de la función que envuelve.
-- ============================================================================
create or replace function public.rebuild_today_rollup(p_day date default current_date)
returns integer
language sql
security definer
set search_path = public, private, pg_temp
as $$
  select private.rebuild_daily_rollups(p_day);
$$;

-- Mismo criterio que resolve_scan: sólo el backend de confianza (service_role)
-- la ejecuta. anon/authenticated no tienen por qué poder forzar un recálculo.
revoke all on function public.rebuild_today_rollup(date) from public, anon, authenticated;
grant execute on function public.rebuild_today_rollup(date) to service_role;
