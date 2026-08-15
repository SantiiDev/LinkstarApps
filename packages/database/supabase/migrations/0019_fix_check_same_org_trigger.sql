-- ============================================================================
-- LINKSTAR — 0019: correctiva. `insert into employees` estaba roto desde el 0003
-- ============================================================================
-- Síntoma: TODO insert o update sobre public.employees falla con
--
--   ERROR:  record "new" has no field "employee_id"
--   CONTEXT: SQL expression "tg_table_name = 'devices' and new.employee_id is not null"
--            PL/pgSQL function private.check_same_org() line 13 at IF
--
-- No es un caso borde: falla siempre, para cualquier usuario, incluido
-- service_role. Nadie lo notó porque el producto es pre-lanzamiento y ninguna
-- pantalla da de alta empleados todavía — la pestaña "Equipo" los lee, no los
-- escribe. Apareció al correr tests/rls_isolation.sql de punta a punta por
-- primera vez, que es exactamente para lo que estaba escrito ese archivo.
--
-- ---------------------------------------------------------------------------
-- Por qué falla, que es lo interesante
-- ---------------------------------------------------------------------------
-- private.check_same_org() es UNA función usada por DOS triggers:
--
--   employees_check_same_org  before insert or update on public.employees
--   devices_check_same_org    before insert or update on public.devices
--
-- y traía esta línea, escrita con la intención razonable de que el chequeo del
-- empleado sólo corriera para devices:
--
--   if tg_table_name = 'devices' and new.employee_id is not null then
--
-- El `and` NO protege nada. PL/pgSQL no evalúa esa condición como lo haría un
-- lenguaje con cortocircuito: prepara la expresión ENTERA como una sola
-- sentencia SQL (`select tg_table_name = 'devices' and new.employee_id is not
-- null`) contra el rowtype de la tabla que disparó el trigger. Cuando dispara
-- sobre `employees` —que no tiene columna employee_id— la resolución del campo
-- falla al preparar la expresión, sin importar que el operando izquierdo sea
-- falso. El cortocircuito ocurriría *después*, y nunca se llega.
--
-- ---------------------------------------------------------------------------
-- El arreglo
-- ---------------------------------------------------------------------------
-- Anidar los IF. PL/pgSQL prepara cada expresión de forma perezosa, la primera
-- vez que se EJECUTA esa sentencia: una expresión dentro de una rama que no se
-- toma nunca se prepara, así que `new.employee_id` sólo se resuelve cuando el
-- trigger viene de `devices`, que es la única tabla donde esa columna existe.
--
-- ⚠️  Los dos IF tienen que quedar anidados. Colapsarlos de nuevo en un `and`
-- —que es la "simplificación" obvia al leer esto— reintroduce el bug tal cual,
-- y el error no aparece en devices sino en la otra tabla, que es lo que lo hizo
-- difícil de ver la primera vez. Hay un assert para esto en
-- tests/rls_isolation.sql.
--
-- El resto del cuerpo queda idéntico: mismos chequeos, mismos mensajes, mismo
-- errcode. Esto no cambia ninguna regla de negocio, sólo hace que la que ya
-- estaba escrita pueda ejecutarse.
-- ============================================================================
create or replace function private.check_same_org()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org uuid;
begin
  -- Vale para las dos tablas: employees y devices tienen location_id.
  if new.location_id is not null then
    select organization_id into v_org from public.locations where id = new.location_id;
    if v_org is distinct from new.organization_id then
      raise exception 'La ubicación pertenece a otra organización'
        using errcode = 'foreign_key_violation';
    end if;
  end if;

  -- Sólo devices tiene employee_id. El IF de adentro NO puede subir al de
  -- afuera con un `and`: ver la cabecera de esta migración.
  if tg_table_name = 'devices' then
    if new.employee_id is not null then
      select organization_id into v_org from public.employees where id = new.employee_id;
      if v_org is distinct from new.organization_id then
        raise exception 'El empleado pertenece a otra organización'
          using errcode = 'foreign_key_violation';
      end if;
    end if;
  end if;

  return new;
end;
$$;

-- Los triggers del 0003 no se tocan: siguen apuntando a esta misma función, que
-- es la que se acaba de redefinir. `create or replace function` no invalida ni
-- recrea los triggers que la usan.
