import { useNavigate } from 'react-router-dom';
import { settingsTabPath } from '../../lib/routes';
import './RetentionNote.css';

/*
 * Aviso de que un dato no se muestra porque cae fuera del historial del plan
 * (0034). Va donde una pantalla habría dibujado ceros: el período anterior de
 * una comparación, o el tramo de un período que arranca antes del historial.
 * `children` dice qué falta; la nota agrega cuánto guarda el plan y el camino a
 * Facturación, igual que BusinessLock.
 */
export default function RetentionNote({ days, children }) {
  const navigate = useNavigate();
  return (
    <p className="retention-note">
      <span>
        {children} Tu plan guarda {days} días de historial; Business guarda un año.
      </span>
      <button type="button" className="retention-note__btn" onClick={() => navigate(settingsTabPath('facturacion'))}>
        Ver planes
      </button>
    </p>
  );
}
