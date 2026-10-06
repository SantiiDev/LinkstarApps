-- ============================================================================
-- LINKSTAR — 0027: selector de organización
-- ============================================================================
-- `profiles.last_organization_id` existe desde la 0002 y tres funciones lo leen
-- para decidir sobre qué organización opera el usuario —my_org_context()
-- (0013/0015), private.active_org_id() (0020) y private.active_org_id_for()
-- (0024)—, pero nada lo escribía. Quien es miembro de dos organizaciones (una
-- agencia, o nosotros entrando a dar soporte) caía siempre en la más vieja, sin
-- forma de cambiar.
--
-- Esta migración agrega lo que faltaba:
--
--   list_my_organizations()      las organizaciones del usuario, para el menú
--   set_active_organization()    escribe last_organization_id, validando que
--                                el usuario sea miembro
--   accept_invitation()          además deja activa la organización aceptada:
--                                quien ya tenía la suya y acepta una invitación
--                                tiene que entrar a la que acaba de aceptar, no
--                                volver a la de siempre sin entender por qué
--
-- ── Lo que NO cambia ──────────────────────────────────────────────────────
-- La regla de selección. Sigue viviendo en las tres funciones de arriba:
-- last_organization_id si el usuario es miembro de esa organización y no está
-- borrada, y si no, la membresía más vieja. Un valor que apunta a una
-- organización ajena se ignora, así que esto no abre nada nuevo; la validación
-- de set_active_organization() es para que el error se vea, no para tapar un
-- agujero.
--
-- Tampoco cambia el RLS. Las políticas siguen dejando leer TODAS las
-- organizaciones del usuario, y está bien: el RLS es el límite de seguridad
-- ("no ves lo de otro cliente"), no el de presentación ("ves la organización
-- que elegiste"). Esa segunda parte la hace el panel filtrando cada lectura por
-- organization_id (lib/dashboardApi.js, lib/catalogApi.js, lib/googleApi.js).
-- Antes de esta migración, alguien en dos organizaciones veía la UNIÓN de las
-- dos en Dispositivos, Sucursales y Reseñas.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- LISTAR MIS ORGANIZACIONES
--
-- Sólo las membresías PROPIAS: la policy de memberships deja ver las de los
-- compañeros también, y eso no sirve para un menú. Incluye las que no tienen
-- plan vigente — si no, quien tiene una organización vencida no podría entrar
-- a pagarla —, y has_access le dice al panel cuál está en esa situación.
-- `is_active` usa la misma regla que el resto, así el menú marca la misma
-- organización que muestra el panel.
-- ---------------------------------------------------------------------------
create or replace function public.list_my_organizations()
returns table (
  organization_id   uuid,
  organization_name text,
  role              public.org_role,
  plan_name         text,
  has_access        boolean,
  is_active         boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    o.id,
    o.name,
    m.role,
    p.name,
    public.org_has_access(o.id),
    o.id = private.active_org_id()
  from public.memberships m
  join public.organizations o      on o.id = m.organization_id and o.deleted_at is null
  left join public.subscriptions s on s.organization_id = o.id
  left join public.plans p         on p.code = s.plan_code
  where m.user_id = auth.uid()
  order by lower(o.name), o.id;
$$;

revoke all on function public.list_my_organizations() from public, anon;
grant execute on function public.list_my_organizations() to authenticated;


-- ---------------------------------------------------------------------------
-- ELEGIR LA ORGANIZACIÓN ACTIVA
--
-- Sin esta función, el cliente podría escribir profiles.last_organization_id
-- directo (profiles_update_self deja actualizar la fila propia, todas sus
-- columnas). Funcionaría, pero con un UUID ajeno el panel volvería en silencio
-- a la organización más vieja, y la FK además revelaría si ese UUID existe.
-- Acá un UUID que no es tuyo es un error explícito.
-- ---------------------------------------------------------------------------
create or replace function public.set_active_organization(p_org uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión' using errcode = '42501', hint = 'not_authenticated';
  end if;

  if not exists (
    select 1
    from public.memberships m
    join public.organizations o on o.id = m.organization_id and o.deleted_at is null
    where m.user_id = auth.uid() and m.organization_id = p_org
  ) then
    raise exception 'No sos miembro de esa organización' using errcode = '42501', hint = 'not_a_member';
  end if;

  update public.profiles
  set last_organization_id = p_org
  where id = auth.uid();

  return p_org;
end;
$$;

revoke all on function public.set_active_organization(uuid) from public, anon;
grant execute on function public.set_active_organization(uuid) to authenticated;


-- ---------------------------------------------------------------------------
-- ACEPTAR UNA INVITACIÓN — igual que la 0007, más la organización activa
--
-- Cuerpo copiado de la 0007 sin cambios salvo el update de profiles. Va en una
-- migración nueva y no editando la 0007 porque la 0007 ya está aplicada: editar
-- su archivo no cambiaría nada en la base (ver la 0017).
--
-- De paso, la 0007 sólo hacía `grant ... to authenticated` y nunca revocaba el
-- execute por defecto de PUBLIC, así que anon también podía llamarla. No
-- servía de nada —sin auth.uid() el insert de memberships falla—, pero la regla
-- del repo es revocar y otorgar explícito.
-- ---------------------------------------------------------------------------
create or replace function public.accept_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_inv public.invitations;
  v_hash text := encode(extensions.digest(p_token, 'sha256'), 'hex');
begin
  select * into v_inv
  from public.invitations
  where token_hash = v_hash and status = 'pending' and expires_at > now()
  for update;

  if not found then
    raise exception 'Invitación inválida o vencida' using errcode = 'P0002';
  end if;

  if lower(v_inv.email) <> lower(((select auth.jwt()) ->> 'email')) then
    raise exception 'Esta invitación es para otro correo' using errcode = '42501';
  end if;

  insert into public.memberships (organization_id, user_id, role)
  values (v_inv.organization_id, auth.uid(), v_inv.role)
  on conflict (organization_id, user_id) do update set role = excluded.role;

  update public.invitations
  set status = 'accepted', accepted_at = now(), accepted_by = auth.uid()
  where id = v_inv.id;

  -- Lo nuevo de la 0027: entrar a la organización que se acaba de aceptar.
  update public.profiles
  set last_organization_id = v_inv.organization_id
  where id = auth.uid();

  return v_inv.organization_id;
end;
$$;

revoke all on function public.accept_invitation(text) from public, anon;
grant execute on function public.accept_invitation(text) to authenticated;
