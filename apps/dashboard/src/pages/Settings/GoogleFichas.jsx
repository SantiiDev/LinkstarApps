import { useCallback, useEffect, useState } from 'react';
import Select from '../../components/Select/Select';
import GoogleConnect from '../../components/GoogleConnect/GoogleConnect';
import { useOrg } from '../../context/OrgContext';
import { fetchLocationRows } from '../../lib/catalogApi';
import {
  fetchGoogleLocations,
  linkGoogleLocation,
  requestGoogleSync,
  useGoogleConnection,
} from '../../lib/googleApi';
import './GoogleFichas.css';

/*
 * Conexión con Google y vínculo ficha ↔ sucursal, dentro de "Gestión local".
 *
 * Reemplaza a una tarjeta que decía "todavía estamos construyendo esa conexión"
 * (y antes, a una cuenta conectada inventada). Hace dos cosas:
 *
 *   1. Conectar / desconectar, con el mismo componente que el resto del panel.
 *   2. Decir qué ficha de Google es de qué sucursal. Es la decisión que más
 *      importa de toda la integración: desde la 0025 SÓLO se leen las reseñas
 *      de las fichas vinculadas. La cuenta de Google que conectó puede
 *      administrar fichas de otros negocios (el caso real fue la de un cliente),
 *      y de esas no guardamos nada más que nombre y dirección.
 *
 * Desvincular borra en el acto las reseñas guardadas de esa ficha (lo hace la
 * base, link_google_location → google_prune_unlinked_reviews). Por eso pide
 * confirmación, igual que asignarle a una ficha una sucursal que ya tenía otra:
 * la otra queda desvinculada.
 *
 * Después de cada cambio se pide "Actualizar ahora" al API, para que las
 * reseñas de una ficha recién vinculada aparezcan sin esperar al job diario. Si
 * el API no está disponible (el panel se publica antes que el API), el vínculo
 * queda guardado igual y se lee en la próxima corrida.
 *
 * Editar es de owner/admin, que es lo que permite la RPC. El resto ve la lista.
 */

const NONE = '';

export default function GoogleFichas() {
  const { org } = useOrg();
  const canEdit = org?.role === 'owner' || org?.role === 'admin';
  const google = useGoogleConnection(org?.organization_id);
  const { connection, reload } = google;
  const connected = connection?.status === 'active' || connection?.status === 'needs_reauth';

  const [fichas, setFichas] = useState(null);
  const [branches, setBranches] = useState([]);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(null); // { ficha, next, message }
  const [waitingSync, setWaitingSync] = useState(null); // last_synced_at al pedir

  const load = useCallback(async () => {
    try {
      const [locations, rows] = await Promise.all([fetchGoogleLocations(), fetchLocationRows()]);
      setFichas(locations);
      setBranches(rows);
      setError(null);
    } catch (err) {
      console.error('No se pudieron leer las fichas de Google:', err);
      setError('No pudimos leer tus fichas de Google. Probá recargar la página.');
    }
  }, []);

  // Se recarga cuando termina una lectura (last_synced_at avanza): es lo que
  // trae las fichas nuevas y los totales de las recién vinculadas.
  useEffect(() => {
    if (connected) load();
  }, [connected, connection?.last_synced_at, load]);

  // Tras pedir "Actualizar ahora", se consulta la conexión cada 4 s hasta que
  // la lectura termine, con un tope de un minuto.
  useEffect(() => {
    if (waitingSync === null) return undefined;
    if (connection?.last_synced_at && connection.last_synced_at !== waitingSync) {
      setWaitingSync(null);
      setNotice('Listo, tu cuenta de Google está al día.');
      return undefined;
    }
    const startedAt = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - startedAt > 60_000) {
        clearInterval(timer);
        setWaitingSync(null);
        setNotice('La lectura está tardando. Los cambios van a aparecer en unos minutos.');
      } else {
        reload();
      }
    }, 4000);
    return () => clearInterval(timer);
  }, [waitingSync, connection?.last_synced_at, reload]);

  async function syncNow() {
    setNotice(null);
    setError(null);
    try {
      await requestGoogleSync();
      setWaitingSync(connection?.last_synced_at ?? '');
      setNotice('Leyendo tu cuenta de Google…');
    } catch (err) {
      setError(err.message);
    }
  }

  function requestChange(ficha, next) {
    const current = ficha.location_id ?? NONE;
    if (next === current) return;

    if (next === NONE) {
      setPending({
        ficha,
        next,
        message: `Al desvincular «${ficha.title}» se borran las reseñas que guardamos de esa ficha y dejamos de leerlas.`,
      });
      return;
    }
    const holder = fichas.find((f) => f.location_id === next && f.id !== ficha.id);
    if (holder) {
      setPending({
        ficha,
        next,
        message: `Esa sucursal ya está vinculada a «${holder.title}». Si seguís, «${holder.title}» queda desvinculada y se borran sus reseñas guardadas.`,
      });
      return;
    }
    applyChange(ficha, next);
  }

  async function applyChange(ficha, next) {
    setPending(null);
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await linkGoogleLocation(ficha.id, next === NONE ? null : next);
      await load();
      if (next === NONE) {
        setNotice(`«${ficha.title}» quedó desvinculada.`);
      } else {
        // Leer ya las reseñas de la ficha recién vinculada. Si el API no
        // responde, el vínculo ya está guardado: se lee en la próxima corrida.
        try {
          await requestGoogleSync();
          setWaitingSync(connection?.last_synced_at ?? '');
          setNotice(`«${ficha.title}» quedó vinculada. Estamos leyendo sus reseñas…`);
        } catch {
          setNotice(`«${ficha.title}» quedó vinculada. Sus reseñas van a aparecer en la próxima lectura diaria.`);
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const options = [
    { value: NONE, label: 'Sin vincular' },
    ...branches.map((b) => ({ value: b.id, label: b.name })),
  ];
  const branchName = (id) => branches.find((b) => b.id === id)?.name ?? 'una sucursal';
  // Una ficha que no vino en la última lectura ya no la administra la cuenta
  // conectada. Se marca en vez de esconderla: puede tener un vínculo guardado.
  const isStale = (ficha) => connection?.last_synced_at && ficha.last_seen_at
    && new Date(ficha.last_seen_at) < new Date(new Date(connection.last_synced_at).getTime() - 60 * 60_000);

  return (
    <div className="gfichas">
      <GoogleConnect google={google} align="start" buttonClassName="settings-save-btn" />

      {connected && (
        <>
          <p className="settings-card__hint settings-card__hint--block">
            Vinculá sólo las fichas que son de este negocio, cada una con su sucursal. De las demás no
            guardamos reseñas: sólo su nombre, para que puedas elegirla acá.
          </p>

          {error && <p className="gfichas__msg gfichas__msg--error" role="alert">{error}</p>}
          {notice && <p className="gfichas__msg" role="status">{notice}</p>}

          {pending && (
            <div className="gfichas__confirm" role="alertdialog" aria-label="Confirmar cambio">
              <p>{pending.message}</p>
              <div className="gfichas__confirm-actions">
                <button type="button" className="gfichas__link" onClick={() => setPending(null)}>Cancelar</button>
                <button type="button" className="gfichas__danger" onClick={() => applyChange(pending.ficha, pending.next)}>
                  Seguir
                </button>
              </div>
            </div>
          )}

          {fichas === null && !error && <p className="settings-card__hint">Cargando fichas…</p>}

          {fichas?.length === 0 && (
            <p className="settings-card__hint">
              Todavía no leímos tu cuenta de Google. Esperá un minuto{canEdit ? ' o tocá «Actualizar ahora»' : ''}.
            </p>
          )}

          {fichas?.length > 0 && (
            <ul className="gfichas__list">
              {fichas.map((ficha) => (
                <li key={ficha.id} className="gfichas__item">
                  <div className="gfichas__info">
                    <span className="gfichas__title">{ficha.title ?? 'Ficha sin nombre'}</span>
                    {ficha.address && <span className="gfichas__meta">{ficha.address}</span>}
                    <span className="gfichas__meta">
                      {ficha.location_id
                        ? (ficha.total_reviews != null
                          ? `${ficha.total_reviews} reseña(s) en Google${ficha.average_rating ? ` · ${ficha.average_rating} ★` : ''}`
                          : 'Vinculada · leyendo sus reseñas')
                        : 'Sin vincular · no leemos sus reseñas'}
                      {isStale(ficha) && ' · ya no aparece en tu cuenta de Google'}
                    </span>
                  </div>

                  {canEdit ? (
                    <div className="gfichas__select">
                      <Select
                        value={ficha.location_id ?? NONE}
                        onChange={(next) => requestChange(ficha, next)}
                        options={options}
                        disabled={busy || !branches.length}
                      />
                    </div>
                  ) : (
                    <span className="gfichas__meta">
                      {ficha.location_id ? `Vinculada a ${branchName(ficha.location_id)}` : 'Sin vincular'}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}

          {canEdit && fichas?.length > 0 && !branches.length && (
            <p className="settings-card__hint">Cargá primero una sucursal (arriba, en esta misma pestaña) para poder vincularle una ficha.</p>
          )}

          {canEdit && connection?.status === 'active' && (
            <button type="button" className="gfichas__link gfichas__sync" onClick={syncNow} disabled={waitingSync !== null}>
              {waitingSync !== null ? 'Actualizando…' : 'Actualizar ahora'}
            </button>
          )}
        </>
      )}
    </div>
  );
}
