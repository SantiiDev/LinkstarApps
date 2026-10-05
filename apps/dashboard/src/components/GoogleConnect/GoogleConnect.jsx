import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import GoogleLogo from '../GoogleLogo/GoogleLogo';
import { startGoogleConnect, disconnectGoogle, GOOGLE_RESULT_MESSAGES } from '../../lib/googleApi';
import './GoogleConnect.css';

/* La acción de conectar la ficha de Google, con su estado.
 *
 * Recibe el resultado de useGoogleConnection() en vez de consultarlo solo: los
 * banners que la usan necesitan el mismo estado para decidir si se muestran, y
 * así hay una sola consulta por pantalla.
 *
 * Qué muestra:
 *   sin conexión        el botón (o, si no es owner/admin, a quién pedírselo)
 *   needs_reauth        por qué hay que reconectar y el botón para hacerlo
 *   conectada           desde cuándo, la última lectura y "Desconectar"
 *
 * También muestra el resultado de la vuelta desde Google (?google=…), que el
 * API manda a /panel/resenas. El mensaje se DERIVA de la URL en cada render en
 * vez de copiarse a un estado y borrar el parámetro al montar: la primera
 * versión hacía eso, y si el panel remontaba el componente mientras terminaba de
 * cargar la sesión, el primer montaje consumía el parámetro y el segundo ya no
 * tenía qué mostrar. El parámetro se saca recién cuando el usuario hace algo
 * (conectar, desconectar); navegar a otra sección también lo deja atrás.
 */

const formatDateTime = (value) =>
  new Date(value).toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' });

export default function GoogleConnect({ google, buttonClassName = 'gc__btn', align = 'center' }) {
  const { canManageBilling: canManage } = useOrg();
  const [searchParams, setSearchParams] = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);

  const { connection, loading, reload, firstSyncPending } = google;

  const resultCode = searchParams.get('google');
  const result = resultCode ? GOOGLE_RESULT_MESSAGES[resultCode] ?? GOOGLE_RESULT_MESSAGES.error : null;

  function clearResult() {
    if (!resultCode) return;
    const next = new URLSearchParams(searchParams);
    next.delete('google');
    setSearchParams(next, { replace: true });
  }

  async function handleConnect() {
    setBusy(true);
    setError(null);
    clearResult();
    try {
      await startGoogleConnect();
      // Si salió bien el navegador ya está yendo a Google: no se resetea `busy`
      // para que el botón no vuelva a habilitarse durante la navegación.
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  async function handleDisconnect() {
    setBusy(true);
    setError(null);
    try {
      await disconnectGoogle();
      setConfirmingDisconnect(false);
      clearResult();
      await reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const connected = connection?.status === 'active';
  const needsReauth = connection?.status === 'needs_reauth';

  const connectButton = (label) => (
    <button className={buttonClassName} onClick={handleConnect} disabled={busy || loading} type="button">
      <GoogleLogo /> {busy ? 'Abriendo Google…' : label}
    </button>
  );

  return (
    <div className={`gc gc--${align}`}>
      {result && <p className={`gc__msg gc__msg--${result.tone}`} role="status">{result.text}</p>}

      {connected ? (
        <div className="gc__status">
          <span className="gc__badge">
            <span className="gc__dot" aria-hidden="true" /> Ficha de Google conectada
          </span>
          <span className="gc__meta">
            {firstSyncPending
              ? 'Leyendo tu ficha por primera vez…'
              : connection.last_synced_at
                ? `Última lectura: ${formatDateTime(connection.last_synced_at)}`
                : `Conectada el ${formatDateTime(connection.connected_at)}`}
          </span>
          {connection.last_error && <span className="gc__meta gc__meta--warn">{connection.last_error}</span>}

          {canManage && !confirmingDisconnect && (
            <button className="gc__link" onClick={() => setConfirmingDisconnect(true)} type="button">
              Desconectar
            </button>
          )}
          {canManage && confirmingDisconnect && (
            <span className="gc__confirm">
              Vamos a dejar de leer tu ficha y borrar las reseñas que guardamos.
              <button className="gc__link gc__link--danger" onClick={handleDisconnect} disabled={busy} type="button">
                {busy ? 'Desconectando…' : 'Sí, desconectar'}
              </button>
              <button className="gc__link" onClick={() => setConfirmingDisconnect(false)} disabled={busy} type="button">
                Cancelar
              </button>
            </span>
          )}
        </div>
      ) : canManage ? (
        <>
          {needsReauth && (
            <p className="gc__msg gc__msg--error">
              {connection.last_error || 'Google cortó el acceso a tu ficha.'} Volvé a conectarla para seguir leyendo tus reseñas.
            </p>
          )}
          {connectButton(needsReauth ? 'Volver a conectar Google' : 'Conectar mi ficha de Google')}
        </>
      ) : (
        <p className="gc__meta">
          {needsReauth
            ? 'Hay que volver a conectar la ficha de Google. Pedíselo a un administrador de la cuenta.'
            : 'Para conectar la ficha de Google, pedíselo a un administrador de la cuenta.'}
        </p>
      )}

      {error && <p className="gc__msg gc__msg--error" role="alert">{error}</p>}
    </div>
  );
}
