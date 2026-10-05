import { Link } from 'react-router-dom';
import { ROUTES } from '../../lib/routes';
import './Info.css';

/* Botón de arrepentimiento — Res. 424/2020 de la Secretaría de Comercio
 * Interior, sobre el art. 34 de la Ley 24.240.
 *
 * La norma pide que el acceso esté disponible en la primera pantalla del sitio
 * y que sea fácilmente visible, por eso va enlazado desde el footer de todas
 * las páginas y no escondido adentro de Términos.
 *
 * Los datos de la empresa van como marcadores hasta que estén los papeles del
 * monotributo. Buscar "[RAZÓN SOCIAL]" para completarlos todos de una. */
export default function Withdrawal() {
  return (
    <section className="info-page">
      <div className="container info-page__inner">
        <h1 className="info-page__title">Botón de arrepentimiento</h1>
        <div className="info-page__content">
          <p>
            Si compraste a distancia —desde este sitio, por teléfono o por mensaje— podés
            arrepentirte y dejar sin efecto la compra dentro de los <strong>10 días corridos</strong>{' '}
            contados desde que recibís el producto, sin tener que dar ningún motivo y sin ningún
            costo para vos. Es un derecho que te da el artículo 34 de la Ley 24.240 de Defensa del
            Consumidor y no se puede renunciar.
          </p>

          <h2>Cómo lo hacés</h2>
          <p>
            Escribinos a <strong>[EMAIL]</strong> con el asunto “Arrepentimiento” y contanos:
          </p>
          <ul>
            <li>Tu nombre y apellido.</li>
            <li>El número de pedido (te lo dimos al confirmar la compra).</li>
            <li>El producto que querés devolver.</li>
          </ul>
          <p>
            Te respondemos dentro de las 48 horas hábiles con la constancia de la revocación y las
            instrucciones para el retiro. No hace falta que expliques por qué.
          </p>

          <h2>Qué pasa después</h2>
          <ul>
            <li>
              El retiro del producto lo coordinamos y lo pagamos nosotros: los gastos de devolución
              corren por nuestra cuenta.
            </li>
            <li>
              Te devolvemos el importe por el mismo medio en que lo pagaste, una vez que recibimos
              el producto.
            </li>
            <li>
              El expositor tiene que volver en las mismas condiciones en que lo recibiste. Probarlo
              no lo arruina: acercar el teléfono al NFC no lo gasta ni lo marca.
            </li>
          </ul>

          <h2>Esto no es la garantía</h2>
          <p>
            Son dos cosas distintas y las dos te corresponden. El arrepentimiento son 10 días para
            devolver sin motivo. La <Link to={ROUTES.warranty}>garantía</Link> son 6 meses para que
            te reparemos o reemplacemos un producto con una falla.
          </p>

          <h2>Datos del vendedor</h2>
          <p>
            [RAZÓN SOCIAL] — CUIT [CUIT] — [DOMICILIO] — [EMAIL]
          </p>
        </div>
      </div>
    </section>
  );
}
