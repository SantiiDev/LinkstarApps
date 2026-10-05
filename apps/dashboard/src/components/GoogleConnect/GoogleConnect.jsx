import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
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
 * API manda a /panel/resenas, y lo saca de la URL para que no reaparezca al
 * recargar.
 */

function GoogleIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.6 32.9 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 16.3 4 9.6 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.5 0 10.4-1.9 14.3-5.1l-6.6-5.6C29.6 34.9 26.9 36 24 36c-5.2 0-9.6-3.1-11.3-7.5l-6.6 5.1C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.3 5.7l6.6 5.6C39.9 37.1 44 31 44 24c0-1.3-.1-2.7-.4-3.5z" />
    </svg>
  );
}

const formatDateTime = (value) =>
  new Date(value).toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' });

export default function GoogleConnect({ google, buttonClassName = 'gc__btn', align = 'center' }) {
  const { canManageBilling: canManage } = useOrg();
  const [searchParams, setSearchParams] = useSearchParams();
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);

  const { connection, loading, reload, firstSyncPending } = google;

  // El resultado de la vuelta desde Google se lee una vez y se saca de la URL.
  useEffect(() => {
    const code = searchParams.get('google');
    if (!code) return;
    setResult(GOOGLE_RESULT_MESSAGES[code] ?? GOOGLE_RESULT_MESSAGES.error);
    const next = new URLSearchParams(searchParams);
    next.delete('google');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  async function handleConnect() {
    setBusy(true);
    setError(null);
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
      setResult(null);
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
      <GoogleIcon /> {busy ? 'Abriendo Google…' : label}
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
