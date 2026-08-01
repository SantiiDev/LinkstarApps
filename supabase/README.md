# Linkstar — Esquema multi-tenant

Migraciones para Supabase (PostgreSQL 15+). Aplicar **en orden**:

```bash
supabase db reset            # local
# o, contra el proyecto remoto:
supabase db push
```

| Archivo | Contenido |
|---|---|
| `0001_extensions_types_helpers.sql` | Extensiones, esquema `private`, enums, generadores de IDs, hash de IP |
| `0002_tenancy.sql` | `organizations`, `profiles`, `memberships`, `invitations` |
| `0003_catalog.sql` | `locations`, `employees`, `devices`, alcance por sucursal |
| `0004_events_and_metrics.sql` | `scan_events`, `scan_daily_rollups`, snapshots de reseñas, auditoría |
| `0005_billing_and_orders.sql` | `plans`, `subscriptions`, pagos, `orders` del sitio de venta, webhooks |
| `0006_rls.sql` | **Todas las políticas de Row Level Security** |
| `0007_functions_and_jobs.sql` | `resolve_scan`, `claim_device`, límites de plan, jobs nocturnos |
| `0008_dashboard_views.sql` | Vistas del dashboard (con `security_invoker`) |

---

## Modelo de datos

```mermaid
erDiagram
    ORGANIZATIONS ||--o{ MEMBERSHIPS : "tiene"
    ORGANIZATIONS ||--o{ LOCATIONS : "tiene"
    ORGANIZATIONS ||--o{ EMPLOYEES : "tiene"
    ORGANIZATIONS ||--o{ DEVICES : "posee"
    ORGANIZATIONS ||--|| SUBSCRIPTIONS : "paga"
    ORGANIZATIONS ||--o{ ORDERS : "compró"

    AUTH_USERS ||--|| PROFILES : "extiende"
    AUTH_USERS ||--o{ MEMBERSHIPS : "pertenece"

    MEMBERSHIPS ||--o{ MEMBERSHIP_LOCATIONS : "acotado a"
    LOCATIONS ||--o{ MEMBERSHIP_LOCATIONS : ""

    LOCATIONS ||--o{ EMPLOYEES : "trabaja en"
    LOCATIONS ||--o{ DEVICES : "instalado en"
    EMPLOYEES ||--o{ DEVICES : "asignado a"

    DEVICES ||--o{ SCAN_EVENTS : "genera"
    SCAN_EVENTS }o--|| SCAN_DAILY_ROLLUPS : "se agrega en"

    LOCATIONS ||--o{ LOCATION_REVIEW_SNAPSHOTS : "se mide"
    LOCATION_REVIEW_SNAPSHOTS ||--o{ REVIEW_DELTAS : "produce"

    PLANS ||--o{ SUBSCRIPTIONS : ""
    SUBSCRIPTIONS ||--o{ SUBSCRIPTION_PAYMENTS : ""
    ORDERS ||--o{ ORDER_ITEMS : ""
    ORDERS ||--o{ DEVICES : "provisiona"
```

---

## Las seis decisiones que importan

### 1. El tenant es la organización, no el local
Un cliente con cinco sucursales es **una** organización con cinco `locations`. Si hicieras que cada local fuera un tenant, no podrías mostrarle al dueño el comparativo entre sucursales, que es justamente lo que justifica el plan más caro.

### 2. La atribución se guarda como *snapshot*, no por JOIN
`scan_events` copia `location_id`, `employee_id` y `kind` en el momento del escaneo. Si mañana el cliente reasigna un expositor del mozo Juan al mozo Pedro, un JOIN reescribiría toda la historia y Juan aparecería con cero reseñas de golpe. Este es el error más caro de deshacer una vez que tenés datos en producción.

### 3. El dashboard nunca lee `scan_events`
Lee `scan_daily_rollups`, que se reconstruye a la madrugada con `DELETE + INSERT` por día (idempotente: podés recalcular cualquier día las veces que quieras). Es la diferencia entre quedarte en los USD 25 de Supabase o empezar a pagar add-ons de compute.

### 4. `resolve_scan` no se le otorga a `anon`
La anon key de Supabase es pública por diseño: está en el bundle de tu SPA. Si `anon` pudiera ejecutar la función, cualquiera podría inflar o ensuciar las métricas de cualquier cliente conociendo un `public_id`. La ejecuta sólo el Worker/Edge Function de redirección, con `service_role`.

### 5. Los dispositivos no se crean desde la app
Se fabrican con `status = 'unassigned'` y un `claim_code` impreso en la base, y el cliente los vincula con `claim_device()`. Si `devices` tuviera política de INSERT para el cliente, cualquiera se daría de alta expositores infinitos y saltearía los límites del plan.

### 6. Toda vista lleva `security_invoker = on`
Sin eso, una vista corre con los permisos de quien la creó e **ignora el RLS de las tablas de abajo**. Es la fuga multi-tenant más silenciosa que existe: el RLS está perfecto, los tests sobre tablas pasan, y la vista devuelve los datos de todos los clientes.

---

## Sobre las "reseñas estimadas"

Conviene tenerlo claro antes de venderlo: **Google no avisa cuándo alguien deja una reseña** ni permite atribuirla a un escaneo. No hay callback, no hay webhook, no hay forma de saberlo con certeza.

Lo único medible de verdad es el **conteo total de reseñas por ubicación**, consultado diariamente vía Google Business Profile API (o Places API) y guardado en `location_review_snapshots`. La diferencia día contra día son las reseñas nuevas (`review_deltas`).

Eso te da atribución real **por sucursal y por día**. Por empleado o por dispositivo es necesariamente un prorrateo según los escaneos únicos. Etiquetalo como "estimado" en la UI —ya lo hacés— y explicalo en la documentación del producto: si un cliente descubre solo que el número es una estimación, perdés la confianza de golpe.

---

## Lo que falta construir (fuera del esquema)

Tu app es un SPA de Vite: no tiene servidor. Estas tres piezas necesitan secretos y van sí o sí a Edge Functions de Supabase o Workers de Cloudflare:

| Pieza | Qué hace | Secreto que usa |
|---|---|---|
| `redirect` | `GET /d/:public_id` — llama `resolve_scan()` — HTTP 302 | `SERVICE_ROLE_KEY` |
| `mp-webhook` | Valida la firma `x-signature`, escribe en `private.webhook_events`, actualiza suscripción o pedido | `SERVICE_ROLE_KEY`, `MP_WEBHOOK_SECRET` |
| `sync-reviews` | Job diario: consulta Google por cada `google_place_id` y guarda el snapshot | `SERVICE_ROLE_KEY`, `GOOGLE_API_KEY` |

Tres reglas para el webhook de Mercado Pago:

1. **Validá la firma `x-signature`.** El endpoint es público; sin validación, cualquiera puede activarse una suscripción con un `curl`.
2. **Respondé `200` en menos de 22 segundos**, antes de procesar. Guardá el payload y procesá aparte.
3. **Insertá en `private.webhook_events` con la clave única `(provider, topic, external_id)`.** Mercado Pago reintenta, y a veces manda la misma notificación dos veces aunque hayas respondido bien. Sin idempotencia, un reintento te duplica un pago o reactiva una suscripción cancelada.

---

## Antes de ir a producción

- [ ] Correr `tests/rls_isolation.sql` (verifica que un tenant no vea al otro)
- [ ] Habilitar `pg_cron` y descomentar los `cron.schedule` de `0007`
- [ ] Cargar precios reales y `mp_preapproval_plan_id` en `plans`
- [ ] Activar backups diarios (plan Pro de Supabase)
- [ ] Rotar `private.app_secrets.ip_pepper` **nunca**: si lo cambiás, se rompe la deduplicación histórica
- [ ] Verificar en el panel de Supabase que ninguna tabla aparezca con el aviso "RLS disabled"
