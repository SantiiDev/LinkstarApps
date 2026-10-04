# Desplegar el panel

La configuración está escrita (`wrangler.jsonc`) pero **el panel no está
desplegado**, y no conviene desplegarlo sin leer esto primero.

## Por qué está escrita antes de tiempo

El despliegue del panel es la fase 8 del roadmap. Lo que lo adelanta es el paso
**4.2**: para que Google apruebe el acceso a las Business Profile APIs hay que
verificar la pantalla de consentimiento contra un dominio propio, con una
política de privacidad que se pueda abrir **sin iniciar sesión**. O sea que el
panel necesita una URL estable antes de que se pueda escribir una línea del
OAuth, y el trámite es lo que más demora de toda la fase 4.

Esto cubre sólo ese pedazo. El resto de la fase 8 —`pg_cron`, Supabase Pro, el
hosting del API— sigue donde estaba.

## Antes de desplegar: dos decisiones

### 1. El checkout del plan Business se rompe

`services/api` **no está desplegado**. El panel llama al API para
`POST /api/subscriptions/checkout`, así que con el panel público y el API en
`localhost`, cualquiera que llegue y elija el plan Business va a ver un error.

Las salidas razonables son tres, y hay que elegir una antes de publicar:

- **Desplegar el API primero** (Railway o Render, raíz `services/api`). Es lo
  que resuelve el problema de fondo, pero es el gasto de la fase 8 — unos US$5
  a US$7 por mes. Ojo con el plan gratis de Render: duerme el servicio a los 15
  minutos y despierta en 30 a 60 segundos, inaceptable para el redirect de un
  expositor físico.
- **Publicar sólo con el plan gratis visible** y dejar Business detrás de
  "contactanos", como ya está Enterprise. Sin costo y sin nada roto.
- **Publicar igual**, asumiendo que nadie va a llegar. Es cierto hoy —el panel
  no se anuncia en ningún lado— pero deja una bomba armada para el día que se
  anuncie.

### 2. El subdominio

`wrangler.jsonc` asume `app.linkstarapp.com`. Hay que crearlo en Cloudflare
(la zona es propia) antes del primer deploy. Si se prefiere otro nombre, hay que
cambiarlo en tres lugares a la vez:

- `route.pattern` en `apps/dashboard/wrangler.jsonc`
- el enlace a la política del panel en `apps/ventas/src/pages/Info/Privacy.jsx`
- lo que se cargue después en la consola de Google Cloud

## Pasos

```bash
npm run build:dashboard
cd apps/dashboard && npx wrangler deploy
```

Antes del primer deploy, revisar que `apps/dashboard/.env` tenga los valores de
**producción** y no los de desarrollo. Los que importan:

| Variable | Ojo con |
|---|---|
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | Del proyecto real. |
| `VITE_API_URL` | Mientras el API no esté desplegado, esto apunta a localhost y el checkout de Business falla (ver arriba). |
| `VITE_REDIRECT_DOMAIN` | Tiene que coincidir con el `REDIRECT_DOMAIN` del API, o el QR que genera el panel apunta a donde nadie contesta. Hoy los dos valen `l.linkstarapp.com`, y ese subdominio **todavía no existe**. |

## Después de desplegar

- Abrir `https://app.linkstarapp.com/privacidad` **en una ventana de incógnito**.
  Si pide iniciar sesión, Google no la va a aceptar.
- Probar un refresh en `/panel/empresa`. Si da 404, falta
  `not_found_handling` en `wrangler.jsonc`.
- Recién ahí cargar la URL de la política en la pantalla de consentimiento de
  Google Cloud.
