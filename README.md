# Linkstar

Monorepo de Linkstar: expositores NFC/QR que llevan a los clientes de un negocio a dejar su reseña en
Google, y la plataforma SaaS desde la que ese negocio los administra y mide.

> **En desarrollo — todavía no salimos a la venta.** Sólo el esquema está en Supabase; ni la API ni el
> dashboard tienen deploy, y el checkout del sitio de ventas está desconectado a propósito. Buena parte de
> las pantallas del dashboard son maquetas con datos hardcodeados. El detalle de qué está realmente
> conectado y qué no está en [CLAUDE.md](CLAUDE.md).

## Estructura

| Path                | Paquete               | Qué es |
|---------------------|-----------------------|--------|
| `apps/ventas`       | `@linkstar/ventas`    | Sitio de ventas y tienda. React + Vite, Cloudflare Workers. |
| `apps/dashboard`    | `@linkstar/dashboard` | Dashboard SaaS y su landing. React + Vite. |
| `services/api`      | `@linkstar/api`       | Backend Express: redirección de escaneos, órdenes y webhooks de Mercado Pago. |
| `packages/database` | `@linkstar/database`  | Esquema Postgres (migraciones, RLS, tests). Fuente de verdad del modelo de datos. |

## Arranque

```bash
npm install
```

**Copiar** (no renombrar) los `.env.example` y completarlos:

```bash
cp services/api/.env.example services/api/.env
cp apps/dashboard/.env.example apps/dashboard/.env
```

Los `.env.example` quedan versionados: son la única lista de qué necesita cada servicio, y es lo primero
que busca el que clona el repo. Los `.env` con valores reales nunca se commitean (`.gitignore`). Si agregás
una variable nueva, agregala también al `.env.example` que corresponda en el mismo commit.

`apps/ventas` no necesita `.env` para desarrollo; su `.env.production` sí está en el repo (no tiene
secretos) y hoy apunta al placeholder `BACKEND_URL_PENDIENTE` hasta que la API tenga deploy.

```bash
npm run dev:api          # http://localhost:3001
npm run dev:dashboard    # http://localhost:5173
npm run dev:ventas       # http://localhost:5174
```

Los dos puertos de front son fijos (`strictPort`) porque la API los tiene en su lista de CORS.

## Otros comandos

```bash
npm run build            # buildea los dos frontends
npm run lint             # oxlint sobre el dashboard
npm run deploy:ventas    # build + wrangler deploy
npm run db:push          # supabase db push (necesita la CLI de supabase)
npm run db:reset         # supabase db reset
npm run db:status        # supabase migration list — compara local contra remoto
```

Scripts de operación de la API, desde `services/api`:

```bash
npm run provision-devices      # alta de expositores con claim_code
npm run rebuild-today-rollup   # recalcula el rollup del día
node scripts/seed-test-device.js
```

Usan la `service_role` key, así que `services/api/.env` decide si estás escribiendo en local o en
producción. No hay test runner configurado en ningún workspace.

## Historia

Este repo nace de la unión de `SantiiDev/Linkstar` (ventas) y `SantiiDev/LinkstarApp` (dashboard, API y
esquema), traídos con `git subtree add` para conservar los dos historiales completos. Los tags
`pre-monorepo-ventas` y `pre-monorepo-dashboard` marcan el último commit de cada repo antes de la unión.

Para el detalle de arquitectura, invariantes del esquema y decisiones que no conviene deshacer sin leer,
ver [CLAUDE.md](CLAUDE.md) y [packages/database/supabase/README.md](packages/database/supabase/README.md).
