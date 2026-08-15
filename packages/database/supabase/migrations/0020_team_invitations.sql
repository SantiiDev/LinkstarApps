-- ============================================================================
-- LINKSTAR — 0020: Equipo y accesos (fase 3 del roadmap)
-- ============================================================================
-- La tabla `invitations` existe desde el 0002 y `accept_invitation()` desde el
-- 0007, pero nunca hubo una pantalla que los usara ni nada que emitiera el
-- token. Los tres planes venden miembros (2 / 10 / ilimitados) y hasta hoy no
-- se podía agregar al segundo.
--
-- Esta migración cierra tres huecos:
--
--   1. `max_members` NO se estaba aplicando en ninguna parte. El
--      `enforce_plan_limit()` del 0007 tiene triggers para `locations` y
--      `employees` nada más, y su `case` interno ni siquiera contempla
--      'members' — así que aunque se le colgara un trigger, el `format('%I')`
--      recibiría NULL y reventaría. Los miembros necesitan su propia función,
--      además, porque `memberships` no tiene `deleted_at` y la del 0007 filtra
--      por esa columna.
--
--   2. Nadie emitía el token. `accept_invitation()` compara contra
--      `token_hash`, pero la fila hay que crearla con el hash ya calculado.
--      Se hace acá, en el servidor: el token se genera con `gen_random_bytes`
--      y se devuelve UNA sola vez al que invita. En la base queda el hash.
--
--   3. El listado del equipo necesita el email de cada miembro, y el email vive
--      en `auth.users`, que `authenticated` no puede leer por PostgREST.
--      `profiles` no lo copia. De ahí `list_org_members()`.
--
-- Nota sobre el envío: por decisión de producto la invitación viaja como link
-- copiable (el dueño lo manda por WhatsApp), no por mail. No hay proveedor de
-- email transaccional todavía — llega en la fase 7, que igual lo necesita para
-- las automatizaciones. Nada de lo de acá cambia cuando eso pase: el mail va a
-- mandar exactamente el mismo link que hoy se copia a mano.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- LÍMITE DE MIEMBROS
--
-- Dos conteos distintos a propósito, y confundirlos rompe el alta:
--
--   * El trigger sobre `memberships` cuenta SÓLO memberships. Cuando alguien
--     acepta una invitación, `accept_invitation()` inserta el membership
--     mientras la invitación todavía está en 'pending' y recién después la
--     marca 'accepted'. Si el trigger contara las invitaciones pendientes, la
--     que se está aceptando se contaría a sí misma y la última butaca del plan
--     nunca se podría usar.
--
--   * `invite_member()` sí suma las pendientes, porque el problema ahí es el
--     opuesto: con 2 butacas y 1 usada, mandar 5 invitaciones significa que 4
--     personas van a hacer todo el trámite para chocarse con un error al final.
--     Mejor frenarlo al emitir.
-- ---------------------------------------------------------------------------
create or replace function private.member_count(p_org uuid)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(*)::integer from public.memberships where organization_id = p_org;
$$;

create or replace function private.pending_invitation_count(p_org uuid)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(*)::integer
  from public.invitations
  where organization_id = p_org
    and status = 'pending'
    and expires_at > now();
$$;

create or replace function private.enforce_member_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_limit   integer;
  v_current integer;
begin
  v_limit := private.plan_limit(new.organization_id, 'members');

  -- NULL = plan ilimitado (enterprise)... o, y esto importa, una organización
  -- que todavía no tiene fila en `subscriptions`. Es exactamente el caso del
  -- primer owner: `bootstrap_organization()` inserta el membership ANTES que la
  -- suscripción, así que `plan_limit` no encuentra nada y devuelve NULL. Sin
  -- esa salida, crear una organización fallaría siempre.
  if v_limit is null then
    return new;
  end if;

  -- El conteo es STABLE, así que ve el snapshot del statement: dos aceptaciones
  -- exactamente simultáneas sobre la última butaca podrían pasar las dos y dejar
  -- la organización un miembro por encima del plan. Se deja así a propósito —
  -- serializarlo pide un lock sobre la organización en cada alta de miembro, y
  -- el daño máximo con planes de 2 y 10 butacas es un miembro de más en una
  -- carrera que requiere coincidir al milisegundo. Si algún día importa, el
  -- arreglo es un `select ... for update` sobre la fila de `subscriptions`.
  v_current := private.member_count(new.organization_id);

  if v_current >= v_limit then
    raise exception
      'Tu plan permite % miembro(s) y ya los estás usando. Cambiá de plan para sumar gente.',
      v_limit
      using errcode = 'check_violation', hint = 'plan_limit_reached';
  end if;

  return new;
end;
$$;

create trigger memberships_plan_limit
  before insert on public.memberships
  for each row execute function private.enforce_member_limit();


-- ---------------------------------------------------------------------------
-- LA ORGANIZACIÓN ACTIVA
--
-- Misma regla de desempate que `my_org_context()` (0013): la que el usuario
-- estaba mirando (`profiles.last_organization_id`) y, si no hay, la membresía
-- más vieja. Se extrae acá porque ahora hay tres funciones que necesitan
-- responder "¿sobre qué organización está operando este usuario?" y las tres
-- tienen que contestar lo mismo — si `invite_member()` eligiera una org
-- distinta de la que muestra el panel, alguien invitaría gente a una cuenta que
-- no está viendo.
--
-- Nada escribe `last_organization_id` todavía y no hay selector de
-- organización, así que hoy esto siempre devuelve la más vieja. Cuando el
-- selector exista, las tres se mueven juntas.
-- ---------------------------------------------------------------------------
create or replace function private.active_org_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select m.organization_id
  from public.memberships m
  join public.organizations o on o.id = m.organization_id and o.deleted_at is null
  where m.user_id = auth.uid()
  order by
    (o.id = (select pr.last_organization_id from public.profiles pr where pr.id = auth.uid())) desc,
    m.created_at asc
  limit 1;
$$;


-- ---------------------------------------------------------------------------
-- EMITIR UNA INVITACIÓN
--
-- SECURITY DEFINER por el token: `gen_random_bytes` tiene que correr en el
-- servidor. Generarlo en el browser obligaría a hashear con SubtleCrypto del
-- lado del cliente y a confiar en que lo hizo bien; acá el plano existe durante
-- una sola respuesta y lo que queda guardado es el sha256.
--
-- Devuelve el token EN PLANO y es la única vez que se puede leer. Quien invita
-- lo copia; si lo pierde, revoca y vuelve a invitar. Guardarlo recuperable
-- convertiría la tabla en un llavero de credenciales de acceso.
-- ---------------------------------------------------------------------------
create or replace function public.invite_member(
  p_email text,
  p_role  public.org_role default 'viewer'
)
returns table (invitation_id uuid, token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_org    uuid;
  v_email  citext := btrim(p_email)::citext;
  v_token  text   := encode(extensions.gen_random_bytes(24), 'hex');
  v_limit  integer;
  v_used   integer;
  -- La fila entera y no columnas sueltas: `expires_at` es a la vez columna de
  -- `invitations` y parámetro de salida de esta función, y un
  -- `returning expires_at into ...` sería ambiguo para PL/pgSQL. Con
  -- `returning *` no se nombra ninguna columna y el conflicto no existe.
  v_row    public.invitations;
begin
  if v_email is null or position('@' in v_email::text) = 0 then
    raise exception 'Ese correo no es válido' using errcode = '22023';
  end if;

  -- El rol se valida por el tipo `org_role`, pero owner se excluye a mano: el
  -- 0002 ya protege al último owner con `protect_last_owner()`, y regalar el
  -- rol máximo por link copiable es otra cosa. Que el traspaso de propiedad sea
  -- su propio flujo explícito, no un valor más del desplegable.
  if p_role = 'owner' then
    raise exception 'No se puede invitar a alguien como propietario'
      using errcode = '22023', hint = 'owner_by_invitation';
  end if;

  -- La organización activa, la misma que muestra el panel — y no "cualquiera de
  -- las que administra". Después se verifica que en ESA sea owner o admin:
  -- alguien puede ser owner de una cuenta y viewer de otra, y tomar la primera
  -- que aparezca lo dejaría invitando gente a la cuenta equivocada.
  v_org := private.active_org_id();

  if v_org is null or not (v_org = any ((select unnest(private.orgs_rw())))) then
    raise exception 'No tenés permiso para invitar gente a esta cuenta'
      using errcode = '42501';
  end if;

  -- Ya es miembro: invitarlo de nuevo no suma nada y confunde al que invita,
  -- porque la invitación quedaría pendiente para siempre.
  if exists (
    select 1
    from public.memberships m
    join auth.users u on u.id = m.user_id
    where m.organization_id = v_org and lower(u.email) = lower(v_email::text)
  ) then
    raise exception 'Esa persona ya forma parte de tu equipo'
      using errcode = '23505', hint = 'already_member';
  end if;

  -- Reinvitar al mismo correo REEMPLAZA la invitación anterior: el 0002 tiene un
  -- índice único parcial sobre (organization_id, email) where status='pending',
  -- así que sin esto el insert de abajo chocaría. Es además el caso de "perdí el
  -- link, mandame otro", que tiene que funcionar.
  --
  -- Va ANTES del control de límite y no después, y el orden es el bug que se
  -- evita: con 2 butacas, 1 propietario y 1 invitación pendiente para bob@,
  -- reinvitar a bob@ contaría su propia invitación vieja y daría "plan lleno".
  -- Liberándola primero, reinvitar a alguien que ya está invitado nunca consume
  -- una butaca nueva.
  update public.invitations
  set status = 'expired'
  where organization_id = v_org
    and email = v_email
    and status = 'pending';

  v_limit := private.plan_limit(v_org, 'members');
  if v_limit is not null then
    v_used := private.member_count(v_org) + private.pending_invitation_count(v_org);
    if v_used >= v_limit then
      raise exception
        'Tu plan permite % miembro(s), contando las invitaciones sin aceptar. Cambiá de plan para sumar gente.',
        v_limit
        using errcode = 'check_violation', hint = 'plan_limit_reached';
    end if;
  end if;

  insert into public.invitations (organization_id, email, role, token_hash, invited_by)
  values (
    v_org,
    v_email,
    p_role,
    encode(extensions.digest(v_token, 'sha256'), 'hex'),
    auth.uid()
  )
  returning * into v_row;

  -- `audit_log` (0004) existe desde el principio pero hasta hoy sólo lo escribía
  -- `claim_device()`, así que el "registro de actividad" del panel no tenía casi
  -- nada que mostrar. Los movimientos de equipo son justo lo que uno quiere
  -- poder auditar después: quién le dio acceso a quién.
  --
  -- El email va en metadata y NO en entity_id: el invitado todavía no tiene
  -- usuario, así que no hay uuid al que apuntar.
  insert into public.audit_log (organization_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    v_org, auth.uid(), 'member.invited', 'invitation', v_row.id,
    jsonb_build_object('email', v_email::text, 'role', p_role::text)
  );

  return query select v_row.id, v_token, v_row.expires_at;
end;
$$;

revoke all on function public.invite_member(text, public.org_role) from public, anon;
grant execute on function public.invite_member(text, public.org_role) to authenticated;


-- ---------------------------------------------------------------------------
-- LISTADO DEL EQUIPO
--
-- No es una vista, y por eso no rompe el invariante de `security_invoker`: el
-- email vive en `auth.users`, que PostgREST no expone a `authenticated` por
-- ningún camino, así que hace falta SECURITY DEFINER igual que en
-- `my_org_context()`.
--
-- Devuelve el equipo de UNA organización, la activa, no la unión de todas las
-- del usuario: para alguien que pertenece a dos cuentas, mezclar las dos listas
-- sería filtrar los compañeros de una a la otra.
-- ---------------------------------------------------------------------------
create or replace function public.list_org_members()
returns table (
  membership_id uuid,
  user_id       uuid,
  full_name     text,
  email         text,
  role          public.org_role,
  is_me         boolean,
  joined_at     timestamptz,
  last_login_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    m.id,
    m.user_id,
    p.full_name,
    u.email::text,
    m.role,
    m.user_id = auth.uid(),
    m.created_at,
    p.last_login_at
  from public.memberships m
  join auth.users u on u.id = m.user_id
  left join public.profiles p on p.id = m.user_id
  where m.organization_id = private.active_org_id()
  order by
    case m.role
      when 'owner' then 1 when 'admin' then 2 when 'manager' then 3 else 4
    end,
    m.created_at;
$$;

revoke all on function public.list_org_members() from public, anon;
grant execute on function public.list_org_members() to authenticated;


-- ---------------------------------------------------------------------------
-- CAMBIAR EL ROL DE UN MIEMBRO
--
-- `memberships_update` del 0006 ya deja a owner/admin editar la fila, así que
-- esto podría hacerse desde el cliente. Va como RPC por dos motivos que la
-- política no cubre: que nadie se cambie el rol a sí mismo (un admin
-- ascendiéndose a owner) y que 'owner' no se reparta por UI.
-- `protect_last_owner()` del 0002 sigue siendo la red de abajo.
-- ---------------------------------------------------------------------------
create or replace function public.set_member_role(
  p_membership_id uuid,
  p_role          public.org_role
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_target public.memberships;
begin
  if p_role = 'owner' then
    raise exception 'El traspaso de propiedad no se hace desde acá'
      using errcode = '22023', hint = 'owner_by_transfer';
  end if;

  select * into v_target from public.memberships where id = p_membership_id;

  if not found or not (v_target.organization_id = any ((select unnest(private.orgs_rw())))) then
    raise exception 'No tenés permiso para cambiar ese rol' using errcode = '42501';
  end if;

  if v_target.user_id = auth.uid() then
    raise exception 'No podés cambiar tu propio rol' using errcode = '42501';
  end if;

  if v_target.role = 'owner' then
    raise exception 'No se puede degradar al propietario desde acá'
      using errcode = '42501', hint = 'owner_by_transfer';
  end if;

  update public.memberships set role = p_role where id = p_membership_id;

  insert into public.audit_log (organization_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    v_target.organization_id, auth.uid(), 'member.role_changed', 'membership', p_membership_id,
    jsonb_build_object('from', v_target.role::text, 'to', p_role::text)
  );
end;
$$;

revoke all on function public.set_member_role(uuid, public.org_role) from public, anon;
grant execute on function public.set_member_role(uuid, public.org_role) to authenticated;


comment on function public.invite_member(text, public.org_role) is
  'Crea una invitación y devuelve el token en plano UNA sola vez. En la base queda el sha256.';
comment on function public.list_org_members() is
  'Equipo de las organizaciones del usuario, con el email que vive en auth.users.';
comment on function public.set_member_role(uuid, public.org_role) is
  'Cambia el rol de un miembro. No permite owner, ni cambiarse el rol a uno mismo.';
