import { useNavigate } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { settingsTabPath } from '../../lib/routes';
import './BusinessLock.css';

/*
 * Una tarjeta del plan Business vista desde el plan gratis.
 *
 * Con Business renderiza `children` (la tarjeta real). Sin Business renderiza
 * `preview` —una maqueta de esa tarjeta— desenfocada, debajo de un llamado a
 * pasarse de plan. Es el patrón de Tapstar: la sección se ve entera, y lo que es
 * de Business se ve borroso con su CTA encima, tarjeta por tarjeta.
 *
 * ES UNO DE LOS TRES LUGARES DONDE UNA MAQUETA PUEDE RENDERIZARSE (los otros son
 * GoogleGate y BusinessPitch), y vale por las mismas condiciones: desenfocada, `inert` (sin
 * clicks, sin foco, sin lector de pantalla, sin selección), y con un velo que no
 * se puede cerrar. Si `preview` se renderiza fuera de este componente, o si el
 * velo se puede sacar, se rompe la regla de CLAUDE.md: nunca imprimir un número
 * que no se distinga de uno medido. Los números de `preview` tienen que ser
 * inventados y verosímiles, NUNCA los datos reales del cliente: lo real de una
 * tarjeta Business no debe ni llegar al navegador de una cuenta gratis (0029).
 *
 * El corte de verdad lo hace la base (private.org_has_business): esto sólo
 * decide qué se dibuja.
 *
 * Es por tarjeta. Una sección que es entera de Business (NPS, Sentimiento,
 * Palabras clave) no usa esto sino components/BusinessPitch, el modal de ventas.
 */
export default function BusinessLock({ children, preview, title, description }) {
  const { isBusiness } = useOrg();
  const navigate = useNavigate();

  if (isBusiness) return children;

  return (
    <div className="block">
      <div className="block__preview" inert>
        {preview}
      </div>
      <div className="block__veil">
        <p className="block__title">{title}</p>
        {description && <p className="block__desc">{description}</p>}
        <button type="button" className="block__btn" onClick={() => navigate(settingsTabPath('plan'))}>
          Probar Business
        </button>
      </div>
    </div>
  );
}
