-- ============================================================================
-- LINKSTAR — 0014: el acceso pago se hace cumplir en la base
-- ============================================================================
-- org_has_access() existe desde 0005 y hasta acá no la llamaba nadie. El guard
-- del dashboard (RequireActivePlan) decide si se renderiza el panel, pero eso
-- es React: se saltea con las devtools abiertas, o pegándole directo a
-- PostgREST con el mismo token de sesión. Un límite que sólo existe en el
-- frontend es una sugerencia — la misma frase que ya encabeza los límites de
-- plan en 0007.
--
-- Acá se cierra en RLS, y sólo sobre los datos del producto:
--
--   SE CIERRA    locations, employees, devices, scan_events,
--                scan_daily_rollups, location_review_snapshots, review_deltas
--   NO SE TOCA   organizations, memberships, profiles, plans, subscriptions,
--                subscription_payments
--
-- La segunda lista es deliberada. Si a alguien se le vence la suscripción
-- tiene que poder entrar igual a ver su organización, su plan y su historial
-- de cobros para poder pagar. Cortarle también eso lo dejaría sin forma de
-- volver a ser cliente.
--
-- Tampoco se toca resolve_scan(): los expositores físicos de un moroso siguen
-- redirigiendo. Un QR pegado en una mesa que lleva a un error es un problema
-- del cliente final, que no tiene nada que ver con esto.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- Organizaciones del usuario CON acceso vigente.
--
-- Mismo contrato que private.user_org_ids(): devuelve uuid[] para poder usarse
-- como `= any ((select unnest(...)))` dentro de las políticas. Esa forma
-- envuelta importa — `x = any(fn())` a secas ejecuta fn() una vez por fila, y
-- estas políticas corren sobre scan_daily_rollups.
-- ---------------------------------------------------------------------------
create or replace function private.orgs_with_access(p_roles public.org_role[] default null)
returns uuid[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(m.organization_id), '{}'::uuid[])
  from public.memberships m
  where m.user_id = auth.uid()
    and (p_roles is null or m.role = any(p_roles))
    and public.org_has_access(m.organization_id);
$$;

revoke all on function private.orgs_with_access(public.org_role[]) from public, anon;
grant execute on function private.orgs_with_access(public.org_role[]) to authenticated, service_role;

create or replace function private.orgs_manage_with_access()
returns uuid[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$ select private.orgs_with_access(array['owner','admin','manager']::public.org_role[]); $$;

create or replace function private.orgs_rw_with_access()
returns uuid[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$ select private.orgs_with_access(array['owner','admin']::public.org_role[]); $$;

grant execute on function private.orgs_manage_with_access() to authenticated;
grant execute on function private.orgs_rw_with_access() to authenticated;


-- ---------------------------------------------------------------------------
-- visible_location_ids() — se le suma el filtro de acceso.
--
-- Es la que usan review_deltas y location_review_snapshots, que filtran por
-- ubicación y no por organización, así que sin este cambio quedarían abiertas.
-- Cambiarla acá también da defensa en profundidad sobre el resto de las
-- políticas, que ya filtran por organización.
-- ---------------------------------------------------------------------------
create or replace function private.visible_location_ids()
returns uuid[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(distinct l.id), '{}'::uuid[])
  from public.memberships m
  join public.locations l on l.organization_id = m.organization_id
  left join public.membership_locations ml
         on ml.membership_id = m.id and ml.location_id = l.id
  where m.user_id = auth.uid()
    and l.deleted_at is null
    and (m.role <> 'manager' or ml.location_id is not null)
    and public.org_has_access(m.organization_id);
$$;


-- ---------------------------------------------------------------------------
-- LOCATIONS
-- ---------------------------------------------------------------------------
drop policy if exists locations_select on public.locations;
create policy locations_select on public.locations
  for select to authenticated
  using (
    organization_id = any ((select unnest(private.orgs_with_access())))
    and id = any ((select unnest(private.visible_location_ids())))
    and deleted_at is null
  );

drop policy if exists locations_insert on public.locations;
create policy locations_insert on public.locations
  for insert to authenticated
  with check ( organization_id = any ((select unnest(private.orgs_rw_with_access()))) );

drop policy if exists locations_update on public.locations;
create policy locations_update on public.locations
  for update to authenticated
  using  ( organization_id = any ((select unnest(private.orgs_rw_with_access()))) )
  with check ( organization_id = any ((select unnest(private.orgs_rw_with_access()))) );

drop policy if exists locations_delete on public.locations;
create policy locations_delete on public.locations
  for delete to authenticated
  using ( organization_id = any ((select unnest(private.orgs_rw_with_access()))) );


-- ---------------------------------------------------------------------------
-- EMPLOYEES
-- ---------------------------------------------------------------------------
drop policy if exists employees_select on public.employees;
create policy employees_select on public.employees
  for select to authenticated
  using (
    organization_id = any ((select unnest(private.orgs_with_access())))
    and (location_id is null or location_id = any ((select unnest(private.visible_location_ids()))))
    and deleted_at is null
  );

drop policy if exists employees_write on public.employees;
create policy employees_write on public.employees
  for all to authenticated
  using  ( organization_id = any ((select unnest(private.orgs_manage_with_access()))) )
  with check ( organization_id = any ((select unnest(private.orgs_manage_with_access()))) );


-- ---------------------------------------------------------------------------
-- DEVICES — sigue sin política de INSERT (se vinculan por claim_device()).
-- ---------------------------------------------------------------------------
drop policy if exists devices_select on public.devices;
create policy devices_select on public.devices
  for select to authenticated
  using (
    organization_id = any ((select unnest(private.orgs_with_access())))
    and (location_id is null or location_id = any ((select unnest(private.visible_location_ids()))))
    and deleted_at is null
  );

drop policy if exists devices_update on public.devices;
create policy devices_update on public.devices
  for update to authenticated
  using  ( organization_id = any ((select unnest(private.orgs_manage_with_access()))) )
  with check ( organization_id = any ((select unnest(private.orgs_manage_with_access()))) );


-- ---------------------------------------------------------------------------
-- MÉTRICAS — sólo lectura, ya lo eran.
-- ---------------------------------------------------------------------------
drop policy if exists scan_events_select on public.scan_events;
create policy scan_events_select on public.scan_events
  for select to authenticated
  using (
    organization_id = any ((select unnest(private.orgs_with_access())))
    and (location_id is null or location_id = any ((select unnest(private.visible_location_ids()))))
  );

drop policy if exists rollups_select on public.scan_daily_rollups;
create policy rollups_select on public.scan_daily_rollups
  for select to authenticated
  using (
    organization_id = any ((select unnest(private.orgs_with_access())))
    and (location_id is null or location_id = any ((select unnest(private.visible_location_ids()))))
  );

-- review_snapshots_select y review_deltas_select no se reescriben: filtran por
-- visible_location_ids(), que arriba ya quedó filtrada por acceso.


-- ---------------------------------------------------------------------------
-- claim_device() — vincular un expositor también requiere acceso vigente.
--
-- Es SECURITY DEFINER, así que se saltea RLS por diseño: la comprobación va
-- explícita adentro. Sin esto, una organización sin plan podría seguir
-- sumando dispositivos, que es exactamente lo que el plan limita.
-- ---------------------------------------------------------------------------
create or replace function private.assert_org_access(p_org uuid)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.org_has_access(p_org) then
    raise exception 'Tu suscripción no está activa. Elegí un plan para seguir usando LinkstarApp.'
      using errcode = '42501', hint = 'subscription_inactive';
  end if;
end;
$$;

revoke all on function private.assert_org_access(uuid) from public, anon;
grant execute on function private.assert_org_access(uuid) to authenticated, service_role;

-- Se reemplaza la versión de 0007. Único cambio: el paso 1 bis. El resto
-- (bloqueo de fila, límite de plan, consumo del claim_code, auditoría) es
-- idéntico y no debe tocarse.
create or replace function public.claim_device(
  p_claim_code  text,
  p_org_id      uuid,
  p_location_id uuid default null,
  p_label       text default null
)
returns public.devices
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_device public.devices;
  v_limit  integer;
  v_count  integer;
begin
  -- 1. ¿El usuario puede administrar esta organización?
  if not exists (
    select 1 from public.memberships
    where user_id = auth.uid() and organization_id = p_org_id
      and role in ('owner', 'admin')
  ) then
    raise exception 'No tenés permisos sobre esta organización' using errcode = '42501';
  end if;

  -- 1 bis. ¿Tiene suscripción vigente? (0014)
  perform private.assert_org_access(p_org_id);

  -- 2. Bloqueo la fila: dos personas escaneando el mismo código a la vez no
  --    pueden vincularlo dos veces.
  select * into v_device
  from public.devices
  where upper(claim_code) = upper(btrim(p_claim_code))
  for update;

  if not found then
    raise exception 'Código de vinculación inválido' using errcode = 'P0002', hint = 'invalid_claim_code';
  end if;

  if v_device.organization_id is not null then
    raise exception 'Este dispositivo ya está vinculado a otra cuenta'
      using errcode = '23505', hint = 'already_claimed';
  end if;

  -- 3. Límite de plan
  v_limit := private.plan_limit(p_org_id, 'devices');
  if v_limit is not null then
    select count(*) into v_count
    from public.devices
    where organization_id = p_org_id and deleted_at is null;

    if v_count >= v_limit then
      raise exception 'Alcanzaste el límite de dispositivos de tu plan (%)', v_limit
        using errcode = 'check_violation', hint = 'plan_limit_reached';
    end if;
  end if;

  -- 4. Vincular
  update public.devices
  set organization_id = p_org_id,
      location_id     = p_location_id,
      label           = coalesce(p_label, label),
      status          = 'active',
      claimed_at      = now(),
      activated_at    = coalesce(activated_at, now()),
      claim_code      = null            -- se consume: no se puede reusar
  where id = v_device.id
  returning * into v_device;

  insert into public.audit_log (organization_id, actor_id, action, entity_type, entity_id)
  values (p_org_id, auth.uid(), 'device.claimed', 'device', v_device.id);

  return v_device;
end;
$$;
