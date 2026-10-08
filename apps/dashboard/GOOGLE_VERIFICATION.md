# Verificar la app OAuth de Google

Mientras la pantalla de consentimiento esté en modo **Testing**:

- sólo pueden conectar su ficha los usuarios de prueba cargados a mano (máximo 100);
- los refresh tokens **vencen a los 7 días**, y `sync-reviews` marca la conexión
  como "volvé a conectar".

Para un cliente real hay que **publicar** la app, y el permiso que usamos
(`https://www.googleapis.com/auth/business.manage`) exige que Google la verifique
antes. Esto es independiente del acceso a la Business Profile API, que ya está
aprobado.

Este documento es la lista de lo que hay que hacer en la consola. El código ya
está listo: la página de inicio (`https://app.linkstarapp.com`), la política
(`/privacidad`, pública y enlazada desde el pie de la home) y el flujo completo.

> Los requisitos de Google cambian; esto refleja lo que pedían al escribirlo
> (octubre de 2026). Si la consola pide algo distinto, manda la consola.

## 0. Antes de empezar

- El panel tiene que estar desplegado y respondiendo (ver [DEPLOY.md](DEPLOY.md)):
  `https://app.linkstarapp.com/privacidad` en incógnito, sin pedir login.
- **El video de demostración (paso 5) necesita el flujo OAuth funcionando en
  producción**, o sea, el API desplegado en `api.linkstarapp.com`. Todo lo demás
  se puede dejar hecho antes; el envío final, probablemente, cuando el API esté
  arriba.

## 1. Verificar el dominio en Search Console

Google sólo acepta URLs de dominios que alguien del proyecto demostró que son suyos.

1. Entrá a [Google Search Console](https://search.google.com/search-console) con la
   **misma cuenta** que administra el proyecto de Google Cloud.
2. Agregá una propiedad de tipo **Dominio**: `linkstarapp.com`.
3. Google te da un registro **TXT**. Cargalo en Cloudflare → `linkstarapp.com` →
   DNS → Agregar registro → Tipo `TXT`, nombre `@`, el valor que dio Google.
4. Volvé a Search Console y tocá **Verificar** (puede tardar unos minutos).

## 2. Información de la marca (Google Auth Platform → Información de la marca)

| Campo | Valor |
|---|---|
| Nombre de la app | `Linkstar` |
| Correo de asistencia | `linkstar.app1@gmail.com` |
| Logo | **Dejalo vacío.** Subir un logo agrega una verificación de marca aparte, que demora más. Se puede sumar después. |
| Página principal | `https://app.linkstarapp.com` |
| Política de privacidad | `https://app.linkstarapp.com/privacidad` |
| Condiciones del servicio | `https://linkstarapp.com/terminos` |
| Dominios autorizados | `linkstarapp.com` |
| Contacto del desarrollador | `linkstar.app1@gmail.com` |

El nombre de la app tiene que coincidir con lo que dice la página principal
("linkstar"): Google lo compara.

## 3. Separar el cliente de desarrollo del de producción (Clientes)

Hoy hay un solo cliente, "Cliente Linkstar", con `http://localhost:3001/...`.

- **Dejalo** como cliente de desarrollo (es el de tu `services/api/.env` local).
- **Creá otro**, tipo *Aplicación web*, llamado `Linkstar API (producción)`, con
  **una sola** URI de redireccionamiento:
  `https://api.linkstarapp.com/auth/google/callback`.
  Su ID y su secreto van en las variables del API desplegado, nunca en el repo.

Si durante la revisión Google objeta la URI de `localhost` del cliente de
desarrollo, se puede quitar mientras dure la revisión y volver a agregar después.

## 4. Acceso a los datos — justificación del permiso

En **Acceso a los datos**, el único permiso es
`https://www.googleapis.com/auth/business.manage`. Google pide explicar por qué
hace falta ese y no uno más chico. Texto sugerido (los revisores leen en inglés):

> Linkstar is a dashboard for small businesses that use our NFC/QR stands to ask
> their customers for Google reviews. Business owners connect their own Google
> Business Profile so the dashboard can:
> (1) list the business locations they manage, so the owner chooses which ones
> belong to their business;
> (2) read the reviews, total review count and average rating of those chosen
> locations only, once a day, to show them and to measure how many new reviews
> each location gets;
> (3) publish the owner's reply to a review when the owner writes it and clicks
> "Publicar en Google";
> (4) show the location's performance metrics (views, calls, direction requests,
> website clicks, search keywords);
> (5) show and edit the location's profile (description, phone numbers, website,
> opening hours, attributes) and create or delete posts, only when the owner
> saves a change or publishes a post in the dashboard;
> (6) on the paid plan, detect once a day when Google changed the profile on its
> own, notify the owner and let them revert it with a button.
> We never write anything on our own: every write is an explicit action of the
> owner. Reviews of locations the owner did not select are never stored.
> On the paid plan, the text and star rating of each review (never the
> reviewer's name) are sent to Anthropic's Claude API to classify sentiment and
> topics shown to that same owner; Anthropic processes them on our behalf and
> does not use them for training.
> business.manage is the only scope that grants access to the Account
> Management, Business Information, Performance and My Business (reviews and
> posts) APIs; there is no narrower read-only scope for reviews, and replying,
> editing the profile and posting require write access. Data is used only to
> provide these features, is not sold, shared or used for advertising or to
> train AI models, and is deleted immediately when the owner disconnects their
> profile or unlinks a location.

Si cambia el proveedor de IA, cambiar este párrafo y `pages/Legal/Privacy.jsx`
(§3.2 y §4) juntos: el revisor compara los dos.

## 5. Video de demostración

Google pide un video (en YouTube, como **no listado**) que muestre el flujo
completo en la app real y **cada uso del permiso que declara el paso 4**. Lo que
se declara y no se ve en el video es el motivo de rechazo más común.

**Antes de grabar**

- Panel y API de producción, con el cliente OAuth de producción (paso 3).
- La IA de reseñas encendida, si se va a declarar en el paso 4 (si no, sacar ese
  párrafo de la justificación y de la política hasta que lo esté).
- **Todo se hace sobre la ficha de Linkstar.** La cuenta de Google conectada
  también administra *Vineria Martu*, ficha de un cliente real: en el paso de
  vincular va a aparecer en la lista. Dejarla sin vincular está bien (demuestra
  que no leemos fichas ajenas), pero no editar, publicar ni responder nada ahí, y
  si no hay permiso del cliente, difuminar su nombre al editar el video.
- Navegador limpio, zoom al 110–125 % para que se lean los textos, sin otras
  pestañas ni notificaciones.
- Desconectar Google antes de empezar, para grabar la conexión desde cero.

**Guion (3 a 4 minutos, narrado o con subtítulos en inglés)**

| # | En pantalla | Qué decir |
|---|---|---|
| 1 | `https://app.linkstarapp.com`, bajar al pie y abrir **Política de privacidad**; que se vea la URL. Detenerse en la sección 3. | "This is Linkstar, a dashboard for small businesses. Our privacy policy is public at app.linkstarapp.com/privacidad, and section 3 explains how we use Google Business Profile data." |
| 2 | Iniciar sesión. Ir a **Reseñas** y tocar **Conectar mi ficha de Google**. | "The owner signs in and connects their own Business Profile. Connecting is optional." |
| 3 | Pantalla de consentimiento: que se vean **el nombre "Linkstar"**, el permiso, y la **barra de direcciones con el `client_id`**. Elegir la cuenta y aceptar. | "Google shows our app name and the only scope we request, business.manage." |
| 4 | De vuelta en el panel: el mensaje "Listo, tu ficha de Google quedó conectada". | "We're back in the dashboard. The refresh token is stored encrypted on our server and never reaches the browser." |
| 5 | **Configuración → Gestión local → Fichas de Google**: vincular *Linkstar* con su sucursal. Mostrar que la otra ficha queda **sin vincular**. Tocar **Actualizar ahora**. | "The owner chooses which locations belong to their business. We only read reviews and metrics of linked locations. Unlinked locations keep only their name and address, so they can be offered here." |
| 6 | **Reseñas**: la bandeja con las reseñas de Linkstar. Abrir una, escribir una respuesta y tocar **Publicar en Google**. Después mostrar la respuesta en Google Maps, en otra pestaña. | "Reviews of the linked location. The owner writes a reply and publishes it. We only post when the owner clicks this button. Here is the same reply on Google Maps." |
| 7 | **Google Business → Métricas**: tarjetas y gráfico del período. | "Performance metrics of the linked location: views, calls, direction requests and website clicks." |
| 8 | **Google Business → Perfil**: cambiar algo inocuo (por ejemplo, una frase de la descripción), **Guardar cambios**, y volver a dejarlo como estaba. | "The owner can edit the profile from here. We only write when the owner saves a change." |
| 9 | **Google Business → Publicaciones**: **Nueva publicación**, publicarla y después **borrarla**. | "Posts are created and deleted only by the owner." |
| 10 | (Si la IA está encendida y la cuenta es Business) **Reportes → Sentimiento**. | "On the paid plan, review text and rating, never the reviewer's name, are sent to Anthropic's Claude API to classify sentiment and topics for this owner. It is not used for training." |
| 11 | **Configuración → Fichas de Google → Desconectar**. Mostrar que las reseñas desaparecen del panel. | "Disconnecting revokes our access at Google and deletes the stored locations and reviews immediately." |

Después de grabar, volver a conectar la ficha de Linkstar: desconectar borra lo
que se había leído, y la sincronización diaria lo vuelve a traer.

Si la cuenta de producción está en el plan gratis, las tarjetas de Business se
ven con candado. No hace falta mostrarlas: en ese caso, saltear el paso 10 y
explicarlo en el texto del envío.

## 6. Publicar y enviar

1. **Público → Publicar app.** Pasa de Testing a "En producción" con la
   verificación pendiente. Mientras Google revisa, los usuarios de prueba siguen
   funcionando.
2. **Centro de verificación → Enviar para verificación**: pide el video, la
   justificación y confirmar la información de la marca.
3. Google responde por mail al contacto del desarrollador. Si pide cambios, se
   contestan en el mismo hilo.

## Después de la aprobación

- Los tokens dejan de vencer a los 7 días. Las conexiones hechas en modo Testing
  conviene reconectarlas una vez: su token se emitió con las reglas de Testing.
- Sacar la nota de "modo Testing" de `CLAUDE.md` (sección Google Business
  Profile).
