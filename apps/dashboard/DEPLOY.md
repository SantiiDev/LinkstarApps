# Desplegar el panel

El panel se publica en `https://app.linkstarapp.com` (Cloudflare Workers, gratis,
la misma cuenta que el sitio de ventas). Se publicó el 6 de octubre de 2026, antes que el
API; el API quedó en Railway ese mismo día (`api.linkstarapp.com`, guía en
[services/api/DEPLOY.md](../../services/api/DEPLOY.md)). Si el API no contesta, el panel lo
dice en vez de romperse (ver la decisión 1).

**Orden de cada publicación con migraciones:** subirlas a producción, mergear a `main` (eso
publica el API en Railway) y recién ahí publicar el panel. El panel nuevo puede leer columnas
que agrega una migración; publicado antes, esa pantalla se rompe.

## Por qué se despliega antes que el resto de la fase 8

El despliegue es la fase 8 del roadmap. Lo que lo adelanta es la verificación de
la app OAuth de Google: mientras la app esté en modo Testing, sólo pueden
conectar los usuarios de prueba y sus tokens vencen a los 7 días. Para publicarla
Google pide una página de inicio y una política de privacidad **públicas, sin
iniciar sesión, en un dominio propio verificado**. Esa página es este panel.

El resto de la fase 8 —el API, `pg_cron`, Supabase Pro— sigue donde estaba. Los
pasos de la verificación están en [GOOGLE_VERIFICATION.md](GOOGLE_VERIFICATION.md).

## Las dos decisiones (resueltas el 6 de octubre de 2026)

### 1. El checkout del plan Business, sin API

Con el panel público y el API sin desplegar, el checkout de Business no puede
funcionar. **Se eligió publicar con Business detrás de "Contactar con ventas"**,
como Enterprise: `VITE_BUSINESS_CHECKOUT=off` en `.env.production`
(ver `effectiveCheckoutMode()` en `src/lib/config.js`). El precio y el destacado
del plan se siguen mostrando; sólo cambia el botón. No toca la base: en local, sin
la variable, el checkout se sigue probando igual.

**Hoy (octubre de 2026)** el API ya está desplegado, pero faltan las credenciales de
producción de Mercado Pago y su webhook, así que el interruptor sigue en `off`. **El día que
una suscripción de prueba de punta a punta active una cuenta por webhook**: borrar
`VITE_BUSINESS_CHECKOUT=off` de `.env.production` y volver a desplegar.

Las demás acciones que necesitan el API (conectar Google, responder reseñas,
"Actualizar ahora", mandar invitaciones por mail) muestran "el servicio no está
disponible en este momento" en vez de un error crudo. `VITE_API_URL` ya apunta a
`https://api.linkstarapp.com`, así que no hace falta recompilar cuando el API exista.

### 2. El subdominio

`app.linkstarapp.com`. No hay que crearlo a mano: `wrangler.jsonc` lo declara
con `custom_domain: true` y el primer deploy crea el registro DNS y el
certificado. Si algún día se cambia el nombre, cambiarlo a la vez en:

- `routes` en `apps/dashboard/wrangler.jsonc`
- el enlace a la política del panel en `apps/ventas/src/pages/Info/Privacy.jsx`
- la pantalla de consentimiento en Google Cloud (página de inicio y política)

## Pasos

Desde la raíz del repo:

```bash
npm run build:dashboard
cd apps/dashboard && npx wrangler deploy
```

`vite build` usa **`.env.production`** (trackeado en git, sólo valores públicos:
URL y anon key de Supabase, `VITE_API_URL`, `VITE_REDIRECT_DOMAIN`,
`VITE_BUSINESS_CHECKOUT`). Pisa todas las variables de tu `.env` de desarrollo;
si agregás una variable nueva al `.env`, agregala también acá o se va a colar el
valor de desarrollo en el bundle de producción.

| Variable | Ojo con |
|---|---|
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | Del proyecto real. La anon key es pública por diseño; **nunca** la `service_role`. |
| `VITE_API_URL` | `https://api.linkstarapp.com`, aunque todavía no conteste. |
| `VITE_REDIRECT_DOMAIN` | Tiene que coincidir con el `REDIRECT_DOMAIN` del API, o el QR que genera el panel apunta a donde nadie contesta. Hoy los dos valen `l.linkstarapp.com`, que apunta al API de Railway. |
| `VITE_BUSINESS_CHECKOUT` | `off` mientras no haya Mercado Pago de producción (decisión 1). |

## Después de desplegar

- Abrir `https://app.linkstarapp.com/privacidad` **en una ventana de incógnito**.
  Si pide iniciar sesión, Google no la va a aceptar.
- Abrir `https://app.linkstarapp.com/` y confirmar que el pie enlaza la política:
  Google revisa la página de inicio.
- Probar un refresh en `/panel/empresa`. Si da 404, falta
  `not_found_handling` en `wrangler.jsonc`.
- Recién ahí seguir con [GOOGLE_VERIFICATION.md](GOOGLE_VERIFICATION.md).
