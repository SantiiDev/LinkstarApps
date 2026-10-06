# Desplegar el API en Railway

`services/api` va a Railway en **`https://api.linkstarapp.com`**, y el mismo servicio contesta
también en **`https://l.linkstarapp.com`**, que es el dominio grabado en los NFC e impreso en los QR
(`/d/<public_id>`). El código no mira el host: los dos dominios apuntan al mismo contenedor.

Son **dos servicios** de Railway construidos con la misma imagen:

| Servicio | Qué corre | Cuándo |
|---|---|---|
| `api` | `node server.js` (el `CMD` del Dockerfile) | Siempre encendido |
| `daily` | `npm run daily` → `sync-reviews` + `send-alerts` (`scripts/daily.js`) | Cron, una vez por día |

Lo que ya está en el repo: `services/api/Dockerfile`, `.dockerignore` en la raíz y
`scripts/daily.js`. **No hay `railway.json` a propósito:** Railway deprecó «Config as Code» (los
archivos existentes dejan de funcionar el 1 de diciembre de 2026, y desde el 28 de agosto un servicio
nuevo no puede activarlo). Todo se configura en el panel, con la variable `RAILWAY_DOCKERFILE_PATH`
para que construya con nuestro Dockerfile.

> **Costo.** Plan Hobby de Railway: US$5 por mes, con US$5 de uso incluidos. Un API chico más un
> cron de un minuto por día entra ahí o apenas lo pasa. Render gratis no sirve: duerme el servicio a
> los 15 minutos y tarda 30 a 60 segundos en despertar, y un expositor no puede esperar eso.

---

## 0. Probarlo en tu máquina (opcional, 2 minutos)

Desde la **raíz** del repo, con Docker Desktop abierto:

```bash
docker build -f services/api/Dockerfile -t linkstar-api .
```

```bash
docker run --rm -p 3001:3001 --env-file services/api/.env linkstar-api
```

Después abrí `http://localhost:3001/api/health`: tiene que decir `{"status":"ok",…}`.

## 1. Crear el proyecto y el servicio `api`

1. Entrá a [railway.com](https://railway.com) con la cuenta de GitHub que tiene acceso a
   `SantiiDev/LinkstarApps` y elegí el plan **Hobby**.
2. **New Project → Deploy from GitHub repo →** el repo del monorepo.
3. En el servicio que se creó, abrí **Settings**:
   - **Root Directory:** vacío (la raíz del repo). **No** pongas `services/api`: el único
     `package-lock.json` está en la raíz y el build lo necesita.
   - **Config-as-code → Railway Config File:** **vacío**. Si Railway completó algo solo (por ejemplo
     `/services/api/package.json`), borralo.
   - **Build → Custom Build Command:** vacío.
   - **Deploy → Custom Start Command:** vacío. El `CMD` del Dockerfile ya arranca el servidor.
   - **Deploy → Healthcheck Path:** `/api/health`.
   - **Deploy → Restart Policy:** *On Failure*.
   - **Branch:** `main` (o `develop` mientras pruebes).
   - Cambiale el nombre a `api` (arriba de todo, en Settings).
4. Antes del primer deploy, cargá las variables del paso 2. Si arrancó solo y falló, no pasa nada:
   va a reintentar cuando estén.

> **Si Railway creó varios servicios** al conectar el repo (`@linkstar/ventas`, `@linkstar/dashboard`,
> `@linkstar/api`): detecta los workspaces de npm y arma uno por paquete. Quedate sólo con el del API
> y borrá los otros dos (Settings → Delete Service): ventas y el panel viven en Cloudflare, y en
> Railway sólo consumen crédito.

## 2. Variables del servicio `api`

En **Variables**, con **Raw Editor** podés pegar todo junto. **`PORT` no se define**: lo pone Railway.

| Variable | Valor |
|---|---|
| `RAILWAY_DOCKERFILE_PATH` | `services/api/Dockerfile`: sin esto Railway intenta adivinar cómo construir y falla |
| `SUPABASE_URL` | La del proyecto de producción (Supabase → Project Settings → API) |
| `SUPABASE_SERVICE_ROLE_KEY` | La `service_role` de producción. Secreta |
| `FRONTEND_URL` | `https://linkstarapp.com,https://app.linkstarapp.com` (ventas **primero**) |
| `DASHBOARD_URL` | `https://app.linkstarapp.com` |
| `WEBHOOK_URL` | `https://api.linkstarapp.com` (**sin** ruta: el código le agrega `/api/webhook/mercadopago`) |
| `REDIRECT_DOMAIN` | `l.linkstarapp.com` |
| `MP_ACCESS_TOKEN` | Access token de **producción** de Mercado Pago |
| `MP_WEBHOOK_SECRET` | La clave secreta de la sección Webhooks del panel de MP (paso 6) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Del cliente OAuth **de producción** («Linkstar API (producción)», paso 3 de `apps/dashboard/GOOGLE_VERIFICATION.md`) |
| `GOOGLE_REDIRECT_URI` | `https://api.linkstarapp.com/auth/google/callback` |
| `GOOGLE_TOKEN_ENC_KEY` | Una clave **nueva**, sólo para producción (abajo) |
| `RESEND_API_KEY` | De resend.com → API Keys (paso 7). Si todavía no está, dejala vacía: los mails se simulan en el log |
| `RESEND_FROM` | `Linkstar <avisos@linkstarapp.com>` cuando el dominio esté verificado en Resend |
| `SALES_NOTIFY_EMAIL` | `linkstar.app1@gmail.com`: a dónde llegan los avisos de pedidos y consultas |
| `WEB3FORMS_KEY` | La misma de hoy. Es el respaldo si falta Resend |

Generá la clave de cifrado con:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Guardala junto a la `service_role` (un gestor de contraseñas). **Si se pierde, cada cliente tiene
que reconectar su ficha de Google.** Una consecuencia de usar una clave nueva: la conexión de Google
que hiciste en local el 5 de octubre se guardó cifrada con tu clave de desarrollo, así que el API de
producción no la puede leer. Reconectá una vez desde el panel después del deploy. En modo Testing
vence a los 7 días de todos modos.

## 3. Dominios

En el servicio `api` → **Settings → Networking → Custom Domain**, agregá los dos:

- `api.linkstarapp.com`
- `l.linkstarapp.com`

Para cada uno Railway muestra un **CNAME** (algo como `xxxx.up.railway.app`) y, a veces, un **TXT**
de verificación. Cargalos en **Cloudflare → linkstarapp.com → DNS → Agregar registro**:

| Tipo | Nombre | Contenido | Proxy |
|---|---|---|---|
| CNAME | `api` | el destino que da Railway | **Sólo DNS (nube gris)** |
| CNAME | `l` | el destino que da Railway | **Sólo DNS (nube gris)** |
| TXT | el que indique Railway | el valor que indique Railway | — |

**La nube tiene que estar gris.** El API confía en exactamente un proxy (`trust proxy = 1`, el de
Railway). Con el proxy de Cloudflare encendido serían dos, el rate limit vería la IP de Cloudflare en
vez de la del cliente, y todos los escaneos compartirían el mismo cupo de 30 por minuto.

El certificado lo emite Railway solo, en unos minutos.

## 4. El servicio `daily` (cron)

1. En el proyecto: **New → GitHub Repo →** el mismo repo. Nombralo `daily`.
2. **Settings:**
   - **Root Directory:** vacío.
   - **Railway Config File:** vacío.
   - **Healthcheck Path:** vacío. Un cron no contesta HTTP.
   - **Custom Start Command:** `npm run daily`.
   - **Cron Schedule:** `0 11 * * *`, todos los días a las 11:00 UTC (08:00 en Argentina).
3. **Variables:** agregá `RAILWAY_DOCKERFILE_PATH=services/api/Dockerfile` y las que usan los jobs:
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, las cuatro `GOOGLE_*`, `RESEND_API_KEY`, `RESEND_FROM`
   y `DASHBOARD_URL`. Para no copiarlas dos veces: **Project Settings → Shared Variables**, y en cada
   servicio «Add shared variable». O referencialas desde el servicio `api` con `${{api.SUPABASE_URL}}`.
4. Para probarlo sin esperar al día siguiente: en el servicio `daily`, **Deployments → Run now** (o
   el botón de ejecutar el cron). El log tiene que terminar en `✓ Job diario completo.`.

El job corre siempre los dos pasos: si Google falla, las alertas por escaneos salen igual, y la
corrida queda marcada en rojo para que se vea.

## 5. Verificar

```bash
curl https://api.linkstarapp.com/api/health
```

- Tiene que devolver `{"status":"ok",…}`.
- **Un tap real:** en el navegador del celular, `https://l.linkstarapp.com/d/<public_id>?s=q` con el
  `public_id` de tu expositor de prueba. Tiene que llevarte al formulario de reseña de Google.
- **Google:** en `https://app.linkstarapp.com` → Reseñas → «Conectar mi ficha de Google». Volvés al
  panel con «tu ficha quedó conectada».
- **Logs** (servicio `api` → Deployments → View logs): tienen que decir
  `🚀 Linkstar API escuchando en el puerto …`, sin avisos de variables faltantes salvo las que
  dejaste vacías a propósito.

## 6. Mercado Pago

En el panel de desarrolladores de MP → tu aplicación → **Webhooks** (modo productivo):

- **URL:** `https://api.linkstarapp.com/api/webhook/mercadopago`
- **Eventos:** Pagos, Planes y suscripciones (`subscription_preapproval` y
  `subscription_authorized_payment`).
- Copiá la **clave secreta** que genera esa pantalla a `MP_WEBHOOK_SECRET`.

Esta URL del panel es la **única** por la que llegan las notificaciones de suscripción: MP ignora el
`notification_url` que se manda por preapproval.

## 7. Resend (mails a clientes y avisos a nosotros)

1. Creá la cuenta en [resend.com](https://resend.com) con `linkstar.app1@gmail.com`.
2. **Domains → Add Domain →** `linkstarapp.com`. Resend te da unos registros (MX y TXT de SPF en un
   subdominio `send`, y un TXT de DKIM). Cargalos en Cloudflare **tal cual**, con la nube gris.
3. Cuando el dominio diga **Verified**, creá una API key (**Sending access**) y ponela en
   `RESEND_API_KEY`. Cambiá `RESEND_FROM` a `Linkstar <avisos@linkstarapp.com>` en los dos servicios.

Mientras el dominio no esté verificado, Resend sólo deja mandar a la casilla con la que se creó la
cuenta. Los avisos a `SALES_NOTIFY_EMAIL` igual funcionan si es esa misma casilla; los mails a
clientes, no.

## 8. Después: lo que cambia en los frontends

En este orden, cada uno con el API ya contestando:

1. **Ventas.** En `apps/ventas/.env.production` poné `VITE_API_URL=https://api.linkstarapp.com` y
   corré `npm run deploy:ventas` desde la raíz. Probá con una consulta desde `/contacto`: tiene que
   llegar a `SALES_NOTIFY_EMAIL` **sin** el asunto «SIN REGISTRAR».
2. **Panel, plan Business.** Cuando MP de producción esté probado de punta a punta (una suscripción
   real que active la cuenta por webhook), borrá `VITE_BUSINESS_CHECKOUT=off` de
   `apps/dashboard/.env.production` y redesplegá el panel (`apps/dashboard/DEPLOY.md`).
3. **Limpieza.** Borrar el respaldo de Web3Forms del navegador (`Checkout.jsx`, `Contact.jsx`) y
   `WEB3FORMS_KEY` de `apps/ventas/src/lib/config.js`. Ver «`apps/ventas`» en `CLAUDE.md`.
4. **Google.** Con esto arriba ya se puede grabar el video y enviar la verificación (pasos 5 y 6 de
   `apps/dashboard/GOOGLE_VERIFICATION.md`).

Lo que **no** es de este documento y sigue pendiente para la fase 8: habilitar `pg_cron` y
descomentar los `cron.schedule` de la `0007` (rollups, deltas, vencimientos), que depende de decidir
cómo se corta el día (decisión 10). Y Supabase Pro.
