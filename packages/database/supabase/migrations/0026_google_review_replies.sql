-- ============================================================================
-- LINKSTAR — 0026: responder reseñas desde el panel (fase 4.5)
-- ============================================================================
-- Responder una reseña es ESCRIBIR en la ficha de Google del cliente, en su
-- nombre: lo que publica el panel lo ve cualquiera en Google Maps. Por eso la
-- autorización no se deja en el API —que corre como service_role y se saltea el
-- RLS— sino en una RPC que dice exactamente quién puede responder qué:
--
--   owner / admin   cualquier reseña de su organización
--   manager         sólo las de las sucursales que tiene asignadas, igual que
--                   ve sólo esas (visible_location_ids, 0006/0014)
--   viewer          ninguna: es de sólo lectura
--
-- Y sólo sobre fichas vinculadas a una sucursal viva (0025): de una ficha sin
-- vincular no tenemos reseñas, y si las tuviéramos no serían de este cliente.
--
-- El API pide el destino con google_review_reply_target(), publica en Google y
-- recién después registra la respuesta con google_record_reply(). Si Google
-- rechaza la respuesta, la base no cambia: lo que muestra el panel es siempre
-- lo que quedó publicado.
-- ============================================================================

create or replace function public.google_review_reply_target(p_user uuid, p_review uuid)
returns table (
  organization_id uuid,
  google_account  text,
  google_location text,
  review_id       text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_org      uuid;
  v_account  text;
  v_location text;
  v_review   text;
  v_branch   uuid;
  v_role     public.org_role;
begin
  select r.organization_id, gl.google_account, gl.google_location, r.review_id, gl.location_id
    into v_org, v_account, v_location, v_review, v_branch
    from public.google_reviews r
    join public.google_locations gl on gl.id = r.google_location_id
    join public.locations l on l.id = gl.location_id and l.deleted_at is null
   where r.id = p_review;

  if v_org is null then
    raise exception 'resena_inexistente';
  end if;

  select m.role into v_role
    from public.memberships m
   where m.organization_id = v_org and m.user_id = p_user;

  if v_role is null
     or v_role = 'viewer'
     or (v_role = 'manager' and not exists (
           select 1
             from public.memberships m
             join public.membership_locations ml on ml.membership_id = m.id
            where m.organization_id = v_org
              and m.user_id = p_user
              and ml.location_id = v_branch
         )) then
    raise exception 'rol_insuficiente';
  end if;

  if not public.org_has_access(v_org) then
    raise exception 'sin_acceso';
  end if;

  return query select v_org, v_account, v_location, v_review;
end;
$$;

-- Lo que quedó publicado en Google, tal como Google lo devolvió.
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

revoke all on function public.google_review_reply_target(uuid, uuid) from public, anon, authenticated;
revoke all on function public.google_record_reply(uuid, uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.google_review_reply_target(uuid, uuid) to service_role;
grant execute on function public.google_record_reply(uuid, uuid, text, timestamptz) to service_role;
