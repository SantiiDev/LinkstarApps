# Linkstar

Monorepo de Linkstar: expositores NFC/QR que llevan a los clientes de un negocio a dejar su reseña en
Google, y la plataforma SaaS desde la que ese negocio los administra y mide.

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

Copiar los `.env` de ejemplo y completarlos:

- `services/api/.env` ← `services/api/.env.example`
- `apps/dashboard/.env` ← `apps/dashboard/.env.example`

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
```

## Historia

Este repo nace de la unión de `SantiiDev/Linkstar` (ventas) y `SantiiDev/LinkstarApp` (dashboard, API y
esquema), traídos con `git subtree add` para conservar los dos historiales completos. Los tags
`pre-monorepo-ventas` y `pre-monorepo-dashboard` marcan el último commit de cada repo antes de la unión.

Para el detalle de arquitectura, invariantes del esquema y decisiones que no conviene deshacer sin leer,
ver [CLAUDE.md](CLAUDE.md) y [packages/database/supabase/README.md](packages/database/supabase/README.md).
