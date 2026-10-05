import { Link } from 'react-router-dom';
import { ROUTES } from '../../lib/routes';
import './Info.css';

/* Los 6 meses no son una política nuestra: es el piso del art. 11 de la Ley
 * 24.240 para cosas muebles no consumibles nuevas, y es irrenunciable. Ofrecer
 * menos no vale aunque esté escrito, así que este número no se baja.
 *
 * Distinto del arrepentimiento (10 días, art. 34), que vive en su propia
 * página porque la Res. 424/2020 pide un acceso directo desde la home.
 *
 * Datos de la empresa: marcadores hasta que estén los papeles del monotributo.
 * Buscar "[RAZÓN SOCIAL]" para completarlos todos de una. */
export default function Warranty() {
  return (
    <section className="info-page">
      <div className="container info-page__inner">
        <h1 className="info-page__title">Política de Garantía</h1>
        <div className="info-page__content">
          <h2>1. Cobertura de la Garantía</h2>
          <p>
            Todos los dispositivos y carteles físicos de Linkstar cuentan con la garantía legal de{' '}
            <strong>6 meses</strong> que establece el artículo 11 de la Ley 24.240 de Defensa del
            Consumidor, contados desde la entrega del producto. Cubre cualquier defecto de fábrica
            que afecte el normal funcionamiento del chip NFC o fallas estructurales del material no
            atribuibles al mal uso.
          </p>
          <p>
            Durante ese plazo, la reparación o el reemplazo no tienen ningún costo para vos,
            incluido el traslado del producto.
          </p>

          <h2>2. ¿Qué NO cubre la garantía?</h2>
          <p>La garantía queda sin efecto en los siguientes casos:</p>
          <ul>
            <li>Daños causados por golpes, caídas o manipulación indebida del producto.</li>
            <li>
              Exposición directa y prolongada al agua o a temperaturas extremas si el producto no
              fue especificado para exteriores.
            </li>
            <li>Desgaste estético normal por el uso diario (rayones menores en la superficie).</li>
            <li>
              Cualquier intento de modificación, apertura o alteración del mecanismo interno donde
              se aloja el chip.
            </li>
          </ul>

          <h2>3. Vida Útil del Chip NFC</h2>
          <p>
            La tecnología NFC integrada no usa baterías ni fuentes de energía externa: se alimenta
            del teléfono del usuario durante el escaneo. Por eso el chip tiene una vida útil
            prácticamente ilimitada, estimada en más de 100.000 lecturas.
          </p>

          <h2>4. Procedimiento de Reclamo</h2>
          <p>Si detectás una falla cubierta por esta garantía:</p>
          <ol>
            <li>Escribinos a [EMAIL] detallando el inconveniente.</li>
            <li>Adjuntá fotos o videos donde se vea el problema.</li>
            <li>Indicanos el número de pedido o la factura de compra.</li>
          </ol>
          <p>
            Una vez aprobado el reclamo, coordinamos el retiro y procedemos al reemplazo o la
            reparación sin costo adicional para vos.
          </p>

          <h2>5. Esto no es el derecho de arrepentimiento</h2>
          <p>
            Son dos cosas distintas y las dos te corresponden. La garantía son 6 meses para que
            respondamos por una falla. El{' '}
            <Link to={ROUTES.withdrawal}>botón de arrepentimiento</Link> son 10 días corridos desde
            la entrega para devolver la compra sin dar ningún motivo.
          </p>

          <h2>6. Datos del vendedor</h2>
          <p>[RAZÓN SOCIAL] — CUIT [CUIT] — [DOMICILIO] — [EMAIL]</p>
        </div>
      </div>
    </section>
  );
}
