import { Link } from 'react-router-dom';
import { ROUTES } from '../../lib/routes';
import './Info.css';

/* El punto 3 decía que el usuario "deberá realizar el pago mediante los medios
 * habilitados", que contradice al checkout: hoy el pedido se confirma sin pago
 * online y el cobro se coordina a mano. Es el modelo de venta elegido para los
 * primeros meses, no una etapa a medio terminar, así que los términos lo tienen
 * que decir igual que la pantalla.
 *
 * Datos de la empresa: marcadores hasta que estén los papeles del monotributo.
 * Buscar "[RAZÓN SOCIAL]" para completarlos todos de una. */
export default function Terms() {
  return (
    <section className="info-page">
      <div className="container info-page__inner">
        <h1 className="info-page__title">Términos y condiciones</h1>
        <div className="info-page__content">
          <h2>1. Objeto</h2>
          <p>
            Estas condiciones generales regulan el uso de este sitio, la compra de los dispositivos
            NFC de Linkstar y el uso de la plataforma asociada (LinkstarApp). El vendedor es
            [RAZÓN SOCIAL], CUIT [CUIT], con domicilio en [DOMICILIO].
          </p>

          <h2>2. Productos y servicios</h2>
          <p>
            Linkstar comercializa carteles expositores físicos con tecnología NFC y QR que
            redirigen a enlaces preconfigurados (reseñas en Google, perfiles de Instagram, entre
            otros). La gestión y la medición de las interacciones se hacen desde LinkstarApp, que se
            contrata por separado del dispositivo mediante una suscripción mensual, sin permanencia
            y cancelable en cualquier momento. El precio y las condiciones vigentes de cada plan se
            muestran en LinkstarApp antes de contratar.
          </p>

          <h2>3. Compra, pago y envío</h2>
          <p>
            El pedido se confirma desde este sitio <strong>sin pago online</strong>: una vez
            recibido, nos comunicamos por correo electrónico para coordinar la forma de pago y el
            envío. El precio informado al confirmar el carrito es el precio final en pesos
            argentinos, con los impuestos incluidos.
          </p>
          <p>
            Los plazos de entrega son estimados y pueden variar según la disponibilidad y el
            destino. Te los informamos al coordinar el envío.
          </p>

          <h2>4. Derecho de revocación</h2>
          <p>
            Podés arrepentirte de la compra dentro de los <strong>10 días corridos</strong> desde
            que recibís el producto, sin expresar causa y sin costo, conforme al artículo 34 de la
            Ley 24.240. El procedimiento está en el{' '}
            <Link to={ROUTES.withdrawal}>botón de arrepentimiento</Link>. Esto es independiente de
            la <Link to={ROUTES.warranty}>garantía legal de 6 meses</Link>.
          </p>

          <h2>5. Uso de la plataforma</h2>
          <p>
            El acceso a LinkstarApp es personal e intransferible. El usuario se compromete a hacer
            un uso lícito de la plataforma. Nos reservamos el derecho de suspender o cancelar
            cuentas que realicen actividades fraudulentas, spam o un uso malintencionado de la
            redirección NFC.
          </p>

          <h2>6. Modificaciones</h2>
          <p>
            Podemos modificar estos Términos y Condiciones, así como el funcionamiento, el diseño o
            la estructura de LinkstarApp. Los cambios que afecten condiciones ya contratadas se
            comunican con antelación razonable.
          </p>

          <h2>7. Ley aplicable</h2>
          <p>
            Estas condiciones se rigen por las leyes de la República Argentina. Ante cualquier
            controversia serán competentes los tribunales ordinarios del domicilio del consumidor,
            conforme al artículo 36 de la Ley 24.240.
          </p>
        </div>
      </div>
    </section>
  );
}
