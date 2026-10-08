import { Link } from 'react-router-dom';
import { PUBLIC_ROUTES } from '../../lib/routes';
import './Legal.css';

/* Política de privacidad de LinkstarApp (el panel), distinta de la del sitio de
 * ventas y no por duplicación: tratan datos distintos. El sitio de ventas
 * procesa pedidos, envíos y pagos de hardware; el panel procesa escaneos,
 * cuentas de equipo y datos de la ficha de Google Business Profile del cliente.
 *
 * La sección 3 tiene que coincidir con lo que el panel hace con la ficha: la
 * verificación de Google la compara con la app. El proveedor de IA de la 3.2
 * es el que analiza las reseñas en services/api (fase 5); si se cambia de
 * proveedor, se cambia acá antes de cargar su clave.
 *
 * Tiene que ser PÚBLICA y estar fuera de los guards de /panel. No es una
 * preferencia: la pantalla de consentimiento de Google exige una URL de
 * política de privacidad accesible sin iniciar sesión, en un dominio propio, y
 * que declare explícitamente qué datos de Google se piden, para qué se usan,
 * con quién se comparten y cómo se revoca el acceso. Sin eso no hay aprobación
 * de las Business Profile APIs, que es lo que bloquea toda la fase 4.
 *
 * ⚠️ Escrito describiendo lo que el sistema hace hoy, leyendo el código. NO es
 * asesoramiento legal y conviene que lo revise alguien del rubro antes de
 * cobrarle a un cliente real. Lo que sí garantiza es que no afirma cosas
 * falsas, que es de donde venía: la política del sitio de ventas decía "no se
 * comunicarán los datos a terceros" mientras el producto ya corría sobre
 * Supabase y cobraba por Mercado Pago.
 *
 * Si cambia algún proveedor o algún dato que se guarda, se actualiza acá y en
 * la fecha de abajo.
 */

const UPDATED = '8 de octubre de 2026';

/* La casilla real, la misma que usa el topbar del panel. NO usar
 * soporte@linkstar.com.ar: ese dominio nunca se registró (es lo que vino a
 * arreglar la 0021). Una política de privacidad con un correo de contacto que
 * rebota es motivo de rechazo en la verificación de Google, además de dejar sin
 * salida a quien quiera ejercer sus derechos. Cambiar por
 * soporte@linkstarapp.com cuando esa casilla exista: ese dominio sí es propio. */
const CONTACT_EMAIL = 'linkstar.app1@gmail.com';

export default function Privacy() {
  return (
    <div className="legal-page">
      <div className="legal-page__inner">
        <Link to={PUBLIC_ROUTES.landing} className="legal-page__back">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
          </svg>
          Volver
        </Link>

        <h1 className="legal-page__title">Política de privacidad</h1>
        <p className="legal-page__meta">
          LinkstarApp — panel de gestión · Última actualización: {UPDATED}
        </p>

        <div className="legal-page__content">
          <p className="legal-page__lead">
            Esta política explica qué datos maneja <strong>LinkstarApp</strong>, el panel donde
            administrás tus expositores. Si buscás la política del sitio de venta de expositores, está
            en <a href="https://linkstarapp.com/privacidad">linkstarapp.com/privacidad</a>.
          </p>

          <h2>1. Quién es responsable</h2>
          <p>
            Linkstar es responsable del tratamiento de los datos que se describen acá. Para cualquier
            consulta sobre esta política o para ejercer tus derechos, escribinos a{' '}
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
          </p>

          <h2>2. Qué datos guardamos</h2>

          <h3>2.1 De vos, como titular de la cuenta</h3>
          <ul>
            <li>Tu dirección de correo y tu contraseña, que gestiona nuestro proveedor de autenticación. Nosotros nunca vemos tu contraseña.</li>
            <li>Tu nombre, si lo cargás.</li>
            <li>La fecha de tu último inicio de sesión.</li>
            <li>Los datos de tu empresa, tus sucursales y tu equipo, tal como los cargás vos.</li>
          </ul>

          <h3>2.2 De quien escanea un expositor</h3>
          <p>
            Cuando alguien toca o escanea uno de tus expositores, registramos el evento para poder
            contarte cuántos escaneos tuviste. De esa persona guardamos:
          </p>
          <ul>
            <li>
              <strong>Una huella de su dirección IP, no la IP.</strong> La dirección se transforma con una
              función de un solo sentido y se guarda sólo el resultado. Sirve para no contar diez veces a
              la misma persona; no permite reconstruir la IP original.
            </li>
            <li>El navegador y el sistema operativo del dispositivo, en forma genérica.</li>
            <li>El país y, si está disponible, la región y la ciudad.</li>
            <li>La fecha y la hora, y a qué destino se lo redirigió.</li>
          </ul>
          <p>
            <strong>No pedimos ni guardamos el nombre, el correo ni el teléfono de quien escanea</strong>,
            y no instalamos cookies en su dispositivo. No podemos identificar a una persona concreta a
            partir de un escaneo, y vos tampoco: el panel te muestra totales, nunca visitantes
            individuales.
          </p>

          <h3>2.3 De tu facturación</h3>
          <p>
            Si contratás un plan pago, el cobro lo procesa Mercado Pago. <strong>Los datos de tu tarjeta
            nunca pasan por nuestros servidores</strong>: los cargás directamente en Mercado Pago y
            nosotros sólo recibimos el estado de la suscripción y el identificador del pago.
          </p>

          <h2>3. Datos de Google Business Profile</h2>
          <p>
            El panel puede conectarse a tu ficha de Google Business Profile, si vos lo autorizás. Esta
            sección describe ese tratamiento.
          </p>
          <p>
            <strong>La conexión es opcional y el panel funciona sin ella.</strong> Mientras no la
            autorices, las secciones que dependen de Google se muestran vacías y te explican qué falta.
          </p>

          <h3>3.1 Qué pedimos y para qué</h3>
          <p>
            Pedimos un único permiso de Google, el de administración de Google Business Profile, y con él
            hacemos esto:
          </p>
          <ul>
            <li><strong>La lista de fichas que administra tu cuenta</strong> — nombre, dirección e identificador de lugar de cada una, para que elijas cuáles son de tu negocio y a qué sucursal corresponde cada una.</li>
            <li><strong>Las reseñas de las fichas que vinculaste</strong> — autor tal como lo muestra Google, puntaje, texto, fecha y respuesta, para mostrártelas en el panel. <strong>De una ficha que no vinculaste no leemos ni guardamos reseñas</strong>: tu cuenta de Google puede administrar fichas de otros negocios, y esos datos no son tuyos.</li>
            <li><strong>El conteo total y el puntaje promedio de esas fichas</strong> — se leen una vez por día para estimar cuántas reseñas nuevas generaron tus expositores. Google no avisa cuando entra una reseña, así que la diferencia día a día es la única forma de medirlo.</li>
            <li><strong>Responder reseñas en tu nombre</strong> — sólo cuando vos (o alguien de tu equipo con permiso) escribe una respuesta y la publica desde el panel. Nunca publicamos nada por nuestra cuenta.</li>
            <li><strong>Las métricas de tus fichas vinculadas</strong> — visualizaciones, llamadas, solicitudes de cómo llegar, visitas a tu web y las búsquedas con las que te encontraron, día por día, para mostrarte su evolución.</li>
            <li><strong>Los datos de la ficha</strong> — descripción, teléfonos, web, horarios, atributos, servicios, fotos y publicaciones, que se leen cuando abrís el panel para mostrártelos y para calcular el análisis de SEO local. Sólo los modificamos cuando vos (o alguien de tu equipo con permiso) edita un dato o crea o borra una publicación desde el panel. Las fotos que subís para una publicación se guardan en nuestro almacenamiento con una dirección pública, porque Google las descarga desde ahí.</li>
            <li><strong>Los cambios que Google hace en tu ficha por su cuenta</strong> — en el plan Business, una vez por día comparamos tu ficha con la versión que Google propone, te avisamos si cambió algo y te dejamos revertirlo. Nunca lo revertimos sin que vos lo pidas.</li>
          </ul>

          <h3>3.2 Análisis de reseñas con inteligencia artificial</h3>
          <p>
            En el plan Business, el panel te muestra el tono de tus reseñas, los temas que mencionan y
            las palabras que más se repiten. Para eso enviamos <strong>el texto y el puntaje</strong> de
            cada reseña de tus fichas vinculadas a <strong>Anthropic</strong>, el proveedor del modelo
            de inteligencia artificial Claude, que la clasifica y nos devuelve el resultado. Guardamos ese
            resultado junto a la reseña, así cada una se analiza una sola vez.
          </p>
          <ul>
            <li><strong>No enviamos el nombre ni la foto de quien escribió la reseña</strong>, ni ningún dato tuyo o de tu cuenta.</li>
            <li>Las reseñas que sólo tienen estrellas, sin texto, no se envían.</li>
            <li>En el plan gratis no se envía ninguna reseña.</li>
            <li>Anthropic trata ese texto por nuestra cuenta y sólo para darnos el resultado; según sus condiciones comerciales, no lo usa para entrenar sus modelos.</li>
          </ul>

          <h3>3.3 Uso limitado</h3>
          <p>
            El uso que LinkstarApp hace de la información recibida de las APIs de Google se ajusta a la{' '}
            <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">
              Política de Datos de Usuario de los Servicios de API de Google
            </a>, incluidos sus requisitos de Uso Limitado. En concreto:
          </p>
          <ul>
            <li>Usamos esos datos únicamente para darte las funciones del panel que los necesitan.</li>
            <li><strong>No los vendemos</strong>, ni los cedemos, ni los usamos para publicidad.</li>
            <li><strong>No los usamos para entrenar modelos de inteligencia artificial</strong> de propósito general, ni propios ni de terceros.</li>
            <li>Ninguna persona de nuestro equipo los lee, salvo que vos nos lo pidas expresamente para resolver un problema, que sea necesario por motivos de seguridad, o que nos obligue la ley.</li>
          </ul>

          <h3>3.4 Cómo se revoca</h3>
          <p>
            Podés desconectar tu ficha desde el panel en cualquier momento, y también desde{' '}
            <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer">
              la página de permisos de tu cuenta de Google
            </a>. Al desconectarla desde el panel revocamos el permiso en Google, dejamos de sincronizar y
            <strong> borramos en el acto</strong> las fichas y las reseñas que habíamos traído. Lo único que
            se conserva son los totales diarios de reseñas de tus sucursales, que alimentan tus propias
            estadísticas y no contienen reseñas, autores ni textos. Lo mismo pasa con una sola ficha: al
            desvincularla de su sucursal, sus reseñas se borran en ese momento.
          </p>

          <h3>3.5 Cómo protegemos el acceso</h3>
          <p>
            El permiso que nos da Google se guarda cifrado, con una clave que no está en la misma base de
            datos, y sólo lo usa nuestro servidor. Nunca llega a tu navegador ni al de nadie de tu equipo.
          </p>

          <h2>4. Con quién los compartimos</h2>
          <p>
            No vendemos datos. No los cedemos a terceros con fines comerciales. Para que el servicio
            funcione se apoya en estos proveedores, que los tratan por nuestra cuenta y sólo para eso:
          </p>
          <ul>
            <li><strong>Supabase</strong> — base de datos, autenticación y almacenamiento.</li>
            <li><strong>Cloudflare</strong> — publicación del sitio y de la aplicación.</li>
            <li><strong>Mercado Pago</strong> — cobro de los planes pagos.</li>
            <li><strong>Resend</strong> — envío de correos (invitaciones a tu equipo y avisos), cuando el envío está activado.</li>
            <li><strong>Google</strong> — únicamente si conectás tu ficha, y sólo en esa dirección.</li>
            <li><strong>Anthropic</strong> — análisis del texto de las reseñas con inteligencia artificial, sólo en el plan Business y sólo como se explica en el punto 3.2.</li>
          </ul>
          <p>
            También los entregaríamos si nos lo exigiera una autoridad competente por una vía legal
            válida.
          </p>

          <h2>5. Cuánto tiempo los guardamos</h2>
          <p>
            Los datos de tu cuenta y de tu empresa se conservan mientras la cuenta exista. Cada escaneo
            individual se borra automáticamente cuando supera el historial de tu plan (30 días en el plan
            gratis, un año en Business, nunca menos de 30 días). Los totales diarios, que son los que ves
            en el panel, se conservan, y el panel te muestra los del período que cubre tu plan, igual que
            las métricas de tu ficha de Google.
          </p>
          <p>
            Si cerrás tu cuenta, eliminamos tus datos personales dentro de los 30 días. Podemos conservar
            lo que necesitemos para cumplir obligaciones contables o legales.
          </p>

          <h2>6. Tus derechos</h2>
          <ul>
            <li>Acceder a los datos que tenemos sobre vos y pedir una copia.</li>
            <li>Corregirlos si están mal.</li>
            <li>Pedir que los borremos.</li>
            <li>Oponerte a un tratamiento o pedir que se limite.</li>
            <li>Retirar tu consentimiento cuando el tratamiento se base en él, sin que eso afecte lo hecho antes.</li>
          </ul>
          <p>
            Escribinos a <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> y te
            respondemos. Si considerás que no resolvimos bien, podés reclamar ante la autoridad de
            protección de datos que corresponda.
          </p>

          <h2>7. Seguridad</h2>
          <p>
            El acceso a los datos está separado por cuenta a nivel de la base de datos: la propia base
            rechaza una consulta que intente leer datos de otra empresa, no sólo la aplicación. Las
            conexiones viajan cifradas. Las direcciones IP de los escaneos se guardan transformadas, como
            se explica en el punto 2.2.
          </p>

          <h2>8. Cambios</h2>
          <p>
            Si cambiamos esta política, actualizamos la fecha del encabezado. Si el cambio afecta de forma
            relevante cómo tratamos tus datos, te avisamos por correo o dentro del panel antes de que
            entre en vigor.
          </p>
        </div>
      </div>
    </div>
  );
}
