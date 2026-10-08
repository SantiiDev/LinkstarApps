import { useState, useMemo, useEffect, useRef } from 'react';
import { updateDevice, catalogErrorMessage } from '../../lib/catalogApi';
import PageHeader from '../../components/PageHeader/PageHeader';
import GoogleConnectBanner from '../../components/GoogleConnectBanner/GoogleConnectBanner';
import SectionPlaceholder from '../../components/SectionPlaceholder/SectionPlaceholder';
import KpiCard, { KpiTrend } from '../../components/KpiCard/KpiCard';
import TrendChart from '../../components/TrendChart/TrendChart';
import Select from '../../components/Select/Select';
import Icon from '../../components/Icon/Icon';
import Switch from '../../components/Switch/Switch';
import PageSkeleton from '../../components/PageSkeleton/PageSkeleton';
import RetentionNote from '../../components/RetentionNote/RetentionNote';
import { periodOptionsFor, clampPeriod, canComparePrevious } from '../../lib/retention';
import {
  formatRelativeTime,
  colorForIndex,
  lastNDayLabels,
  lastNDayKeys,
  ESTIMATED_LABEL,
} from '../../lib/dashboardApi';
import { REDIRECT_DOMAIN } from '../../lib/config';
import { downloadQrPng } from '../../lib/qr';
import { useOrg } from '../../context/OrgContext';
import { useDevicesData, SPARKLINE_DAYS } from './useDevicesData';
import ScanClaimModal from './ScanClaimModal';
import './Devices.css';

/*
 * Dispositivos — los expositores de la organización y cómo rinden.
 *
 * De arriba a abajo: el teaser del ranking de empleados (próximamente), los
 * KPIs de escaneos de 30 días (los que salieron de Mi Empresa cuando se rehízo
 * sobre reseñas), la tabla de expositores (estilo Tapstar, con buscador y
 * filtros), la actividad diaria y el ranking de sucursales.
 *
 * Todo sale de las vistas del 0008/0016/0018 (nunca de scan_events) y de
 * `devices` para lo que la vista no trae. Si la carga falla, se dice: no hay
 * datos de ejemplo de respaldo (ver useDevicesData.js).
 *
 * «Reseñas» por expositor es un PRORRATEO y se rotula «estimado» (decisión 6 de
 * CLAUDE.md): Google sólo da el total diario por ficha, así que lo de cada
 * expositor es la parte de las reseñas nuevas de su sucursal que corresponde a
 * su parte de los escaneos. La conversión por expositor se sacó (octubre 2026):
 * queda sólo la general, en los KPIs.
 */

const NUM = new Intl.NumberFormat('es-AR');

/* Las reseñas nuevas de los últimos 30 días de la sucursal, repartidas según los
   escaneos humanos de cada expositor. null («—») cuando no hay de dónde sacarlo:
   sin sucursal, sin snapshot de Google (nadie mide sus reseñas todavía) o sin
   escaneos en la sucursal (no hay con qué repartir). */
function estimateReviews(row, location) {
  if (!location || location.total_reviews == null) return null;
  const locationScans = location.human_scans_30d ?? 0;
  if (!locationScans) return null;
  return Math.round(((location.new_reviews_30d ?? 0) * (row.human_scans_30d ?? 0)) / locationScans);
}

function formatDate(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });
}

function mapDeviceRow(row, series, details, locationById) {
  const extra = details?.get(row.device_id);
  return {
    id: row.device_id,
    publicId: row.public_id,
    name: row.label,
    type: row.kind === 'instagram' ? 'instagram' : 'google',
    // El nombre es lo que se muestra y el id es lo que se guarda: editar un
    // dispositivo escribe `location_id` y `employee_id`.
    locationId: row.location_id ?? '',
    employeeId: row.employee_id ?? '',
    // Sólo una tarjeta personal (`nfc_card`) se asigna a un empleado: un
    // expositor está sobre la mesa y no es de nadie (decisión 11, 0028).
    formFactor: row.form_factor ?? null,
    destinationUrl: extra?.destinationUrl ?? '',
    location: row.location_name || 'Sin sucursal asignada',
    hasLocation: Boolean(row.location_name),
    // El enum tiene cinco valores pero el panel muestra dos: todo lo que no
    // esté activo se ve como Inactivo. Ver handleToggleStatus más abajo.
    status: row.status === 'active' ? 'active' : 'inactive',
    scans30: row.human_scans_30d ?? 0,
    scansTotal: row.total_scans ?? 0,
    reviews: estimateReviews(row, locationById.get(row.location_id)),
    lastScan: formatRelativeTime(row.last_scan_at),
    activeSince: formatDate(extra?.claimedAt),
    // Un dispositivo sin escaneos en la ventana no está en el Map: siete ceros
    // es la respuesta correcta, el dato existe y es cero.
    weeklyScans: series?.get(row.device_id) ?? Array(SPARKLINE_DAYS).fill(0),
  };
}

// El QR siempre codifica ?s=q (medio "qr" en scan_events.medium, 0011). El
// NFC se graba aparte con la misma URL pero ?s=n — no lo genera esta pantalla.
function handleDownloadQr(device) {
  if (!device.publicId) return;
  const url = `https://${REDIRECT_DOMAIN}/d/${device.publicId}?s=q`;
  downloadQrPng(url, `linkstar-qr-${device.publicId}.png`).catch(err => {
    console.error('No se pudo generar el QR:', err);
  });
}

/* Variación porcentual que ya calcula la vista → la forma de KpiTrend. */
function trendFromPct(pct) {
  if (pct === null || pct === undefined) return null;
  const rounded = Math.round(pct);
  if (rounded === 0) return { text: '0%', direction: 'flat' };
  return { text: `${rounded > 0 ? '+' : ''}${rounded}%`, direction: rounded > 0 ? 'up' : 'down' };
}

const DEVICE_TYPE_OPTIONS = [
  { value: 'google', label: 'Expositor Google Maps' },
  { value: 'instagram', label: 'Expositor Instagram' },
];

const ACTIVITY_PERIOD_OPTIONS = [
  { value: '7', label: 'Últimos 7 días' },
  { value: '30', label: 'Últimos 30 días' },
  { value: '90', label: 'Últimos 90 días' },
];

const FILTER_TABS = [
  { id: 'all',       label: 'Todos' },
  { id: 'google',    label: 'Google Maps' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'active',    label: 'Activos' },
  { id: 'inactive',  label: 'Inactivos' },
];

const RANKING_VISIBLE = 5;

/* Lo que el usuario dejó elegido al irse a otra sección y volver (en memoria;
   se pierde al recargar). Es de una organización: con otra activa, de cero. */
const DEFAULT_VIEW = { search: '', filter: 'all', period: '7', unique: false, showAllLocations: false };
let lastView = { orgId: null, ...DEFAULT_VIEW };

/* ─── Íconos ─────────────────────────────────────────────────── */
/* `type` es a dónde redirige el expositor — todos tienen NFC y QR, no es hardware. */
function DeviceTypeIcon({ type, size = 24 }) {
  return <Icon name={type === 'google' ? 'pin' : 'instagram'} size={size} />;
}

const TYPE_LABELS = { google: 'Google Maps', instagram: 'Instagram' };

/* ─── Sparkline ─────────────────────────────────────────────── */
/* max(2px, …) para que un día sin escaneos siga dibujando una barra al ras: sin
   ese piso, una serie toda en cero se lee como un gráfico roto y no como «no
   hubo actividad». */
function SparkLine({ data, inactive }) {
  const max = Math.max(...data, 1);
  const labels = lastNDayLabels(data.length);
  return (
    <span className="devices-spark" aria-hidden="true">
      {data.map((v, i) => (
        <span
          key={i}
          className={`devices-spark__bar${inactive ? ' devices-spark__bar--inactive' : ''}`}
          style={{ height: `max(2px, ${(v / max) * 100}%)` }}
          title={`${labels[i]}: ${v}`}
        />
      ))}
    </span>
  );
}

/* ─── Detalle del expositor ─────────────────────────────────── */
function DeviceModal({ device, onClose, onSave, onToggleStatus, locations, employees, canEdit, busy, error }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!device) return null;
  const max = Math.max(...device.weeklyScans, 1);
  const days = lastNDayLabels(device.weeklyScans.length);

  function startEditing() {
    setForm({
      name: device.name,
      locationId: device.locationId ?? '',
      employeeId: device.employeeId ?? '',
      type: device.type,
      destinationUrl: device.destinationUrl ?? '',
    });
    setEditing(true);
  }

  /* Guardar y activar/desactivar ESCRIBEN en la base (devices_update, 0014). */
  async function handleSave(e) {
    e.preventDefault();
    const ok = await onSave(device, form);
    // Sólo se sale del modo edición si el guardado entró. Si falló, el
    // formulario queda abierto con lo que la persona escribió y el error
    // visible: cerrarlo perdería el texto y daría a entender que se guardó.
    if (ok) setEditing(false);
  }

  return (
    <div className="device-modal-overlay" onClick={onClose}>
      <div className="device-modal" role="dialog" aria-modal="true" aria-labelledby="device-modal-name" onClick={e => e.stopPropagation()}>
        <div className="device-modal__header">
          <div className="device-modal__header-left">
            <div className={`device-modal__icon device-modal__icon--${device.type}`}>
              <DeviceTypeIcon type={device.type} size={28} />
            </div>
            <div>
              <div className="device-modal__name" id="device-modal-name">{device.name}</div>
              <span className={`table-badge table-badge--${device.status}`}>
                <span className="table-badge-dot" />
                {device.status === 'active' ? 'Activo' : 'Inactivo'}
              </span>
            </div>
          </div>
          <button className="device-modal__close" onClick={onClose} aria-label="Cerrar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="device-modal__body">
          {editing ? (
            <form id="device-edit-form" className="device-edit-form" onSubmit={handleSave}>
              <label className="device-edit-form__field">
                <span>Nombre</span>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  required
                  autoFocus
                />
              </label>
              <div className="device-edit-form__field">
                <span>Sucursal</span>
                <Select
                  value={form.locationId}
                  onChange={v => setForm(f => ({ ...f, locationId: v }))}
                  options={[
                    { value: '', label: 'Sin asignar' },
                    ...locations.map(l => ({ value: l.id, label: l.name })),
                  ]}
                  triggerClassName="device-edit-form__select-trigger"
                />
                {locations.length === 0 && (
                  <span className="device-edit-form__hint">
                    Todavía no hay locales cargados. Un expositor sin local usa el destino de acá abajo.
                  </span>
                )}
              </div>
              {/* La sucursal decide a dónde redirige el escaneo (resolve_scan lee
                  locations.google_review_url), así que un expositor sin sucursal
                  cae al destino de respaldo. */}
              {!form.locationId && (
                <p className="device-edit-form__warn">
                  Sin sucursal asignada, los escaneos de este expositor no llegan a ninguna ficha de Google.
                </p>
              )}
              <div className="device-edit-form__field">
                <span>Empleado</span>
                {device.formFactor === 'nfc_card' ? (
                  <Select
                    value={form.employeeId}
                    onChange={v => setForm(f => ({ ...f, employeeId: v }))}
                    options={[
                      { value: '', label: 'Sin asignar' },
                      ...employees.map(e => ({ value: e.id, label: e.name })),
                    ]}
                    triggerClassName="device-edit-form__select-trigger"
                  />
                ) : (
                  <span className="device-edit-form__hint">
                    Los escaneos de un expositor no se atribuyen a un empleado: está sobre la mesa y no es de
                    nadie. Para eso están las tarjetas personales.
                  </span>
                )}
              </div>
              <div className="device-edit-form__field">
                <span>Tipo</span>
                <Select
                  value={form.type}
                  onChange={v => setForm(f => ({ ...f, type: v }))}
                  options={DEVICE_TYPE_OPTIONS}
                  triggerClassName="device-edit-form__select-trigger"
                />
              </div>
              <label className="device-edit-form__field">
                <span>¿A dónde lleva este expositor?</span>
                <input
                  type="url"
                  value={form.destinationUrl}
                  onChange={e => setForm(f => ({ ...f, destinationUrl: e.target.value }))}
                  placeholder="https://…"
                />
                {/* Paso 1 de la cascada de resolve_scan(): si está cargado, pisa
                    todo lo demás. */}
                <span className="device-edit-form__hint">
                  Dejalo vacío para que use la ficha del local. Si ponés un link, este expositor
                  va a llevar ahí y no a la reseña.
                </span>
              </label>
              {error && <p className="device-edit-form__error" role="alert">{error}</p>}
            </form>
          ) : (
            <>
              <div className="device-modal__stats-row">
                <div className="device-modal__stat-box">
                  <span className="device-modal__stat-val device-modal__stat-val--orange">{NUM.format(device.scans30)}</span>
                  <span className="device-modal__stat-lbl">Escaneos 30 días</span>
                </div>
                <div className="device-modal__stat-box">
                  <span className="device-modal__stat-val">{NUM.format(device.scansTotal)}</span>
                  <span className="device-modal__stat-lbl">Escaneos totales</span>
                </div>
                <div className="device-modal__stat-box">
                  <span className="device-modal__stat-val device-modal__stat-val--gold">
                    {device.reviews == null ? '—' : `≈ ${NUM.format(device.reviews)}`}
                  </span>
                  <span className="device-modal__stat-lbl">Reseñas ({ESTIMATED_LABEL})</span>
                </div>
              </div>

              <div className="device-modal__info-grid">
                <div className="device-modal__info-item">
                  <div className="device-modal__info-key">Sucursal</div>
                  <div className="device-modal__info-val">{device.location}</div>
                </div>
                <div className="device-modal__info-item">
                  <div className="device-modal__info-key">Activo desde</div>
                  <div className="device-modal__info-val">{device.activeSince ?? '—'}</div>
                </div>
                <div className="device-modal__info-item">
                  <div className="device-modal__info-key">Último escaneo</div>
                  <div className="device-modal__info-val">{device.lastScan}</div>
                </div>
                <div className="device-modal__info-item">
                  <div className="device-modal__info-key">Lleva a</div>
                  <div className="device-modal__info-val">{TYPE_LABELS[device.type]}</div>
                </div>
              </div>

              <div className="device-modal__chart-title">
                Escaneos últimos {device.weeklyScans.length} días
              </div>
              <div className="device-modal__sparkline">
                {device.weeklyScans.map((v, i) => (
                  <div
                    key={i}
                    className="device-modal__spark-bar"
                    style={{ height: `max(2px, ${(v / max) * 100}%)` }}
                    title={`${days[i]}: ${v}`}
                  />
                ))}
              </div>
              {device.reviews != null && (
                <p className="device-modal__note">
                  Las reseñas son una estimación: Google sólo informa el total de cada ficha, así que a este
                  expositor le toca la parte de las reseñas nuevas de su sucursal que corresponde a sus escaneos.
                </p>
              )}
            </>
          )}
        </div>

        {!editing && error && <p className="device-edit-form__error device-modal__error" role="alert">{error}</p>}
        <div className="device-modal__footer">
          {editing ? (
            <>
              <button type="button" className="device-modal__action-btn device-modal__action-btn--secondary" onClick={() => setEditing(false)} disabled={busy}>
                Cancelar
              </button>
              <button type="submit" form="device-edit-form" className="device-modal__action-btn device-modal__action-btn--primary" disabled={busy}>
                {busy ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </>
          ) : (
            <>
              <button
                className="device-modal__action-btn device-modal__action-btn--secondary"
                onClick={() => handleDownloadQr(device)}
                disabled={!device.publicId}
              >
                Descargar QR
              </button>
              {/* Editar y desactivar se ocultan para quien no puede escribir
                  (política devices_update: owner, admin o manager). */}
              {canEdit && (
                <>
                  <button className="device-modal__action-btn device-modal__action-btn--secondary" onClick={startEditing}>
                    Editar
                  </button>
                  <button className="device-modal__action-btn device-modal__action-btn--danger" onClick={() => onToggleStatus(device)} disabled={busy}>
                    {busy ? 'Guardando…' : device.status === 'active' ? 'Desactivar' : 'Activar'}
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Estados vacíos ────────────────────────────────────────── */
/* Dos vacíos distintos: la organización todavía no vinculó ningún expositor
   (instrucción y botón), o el filtro no devolvió nada (limpiar el filtro).
   `hasAny` se calcula sobre la lista completa, no sobre la filtrada. */
function DevicesEmpty({ hasAny, onClaim, onClearFilters }) {
  if (hasAny) {
    return (
      <div className="devices-empty">
        <div className="devices-empty__icon"><Icon name="search" size={26} /></div>
        <div className="devices-empty__title">Sin resultados</div>
        <div className="devices-empty__text">Ningún dispositivo coincide con la búsqueda o el filtro aplicado.</div>
        <button className="devices-empty__btn" onClick={onClearFilters}>Limpiar filtros</button>
      </div>
    );
  }

  return (
    <div className="devices-empty">
      <div className="devices-empty__icon"><Icon name="qr" size={26} /></div>
      <div className="devices-empty__title">Todavía no vinculaste ningún expositor</div>
      <div className="devices-empty__text">
        Cuando vincules tu primer expositor Linkstar vas a ver acá sus escaneos, su sucursal y el QR para
        reimprimirlo. Escaneá el QR chico de la base o escribí el código que viene impreso al lado.
      </div>
      <button className="devices-empty__btn" onClick={onClaim}>
        <Icon name="qr" size={14} />
        Vincular un dispositivo
      </button>
    </div>
  );
}

/* ─── Tabla de dispositivos ─────────────────────────────────── */
/* Una grilla de divs y no un <table>: por debajo de 900px cada fila pasa a ser
   una tarjeta con sus etiquetas, sin scroll horizontal (Devices.css). */
function DeviceTable({ devices, onSelect }) {
  return (
    <div className="devices-table" role="table" aria-label="Dispositivos">
      <div className="devices-table__head" role="row">
        <span role="columnheader">Dispositivo</span>
        <span role="columnheader">Tipo</span>
        <span role="columnheader">Estado</span>
        <span role="columnheader">Escaneos (30 días)</span>
        <span role="columnheader">Reseñas ({ESTIMATED_LABEL})</span>
        <span role="columnheader">Último escaneo</span>
        <span role="columnheader" className="devices-table__actions-head">Acciones</span>
      </div>
      {devices.map((device, index) => (
        <div
          key={device.id}
          className="devices-row"
          role="row"
          tabIndex={0}
          style={{ animationDelay: `${Math.min(index, 10) * 0.03}s` }}
          onClick={() => onSelect(device)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(device); } }}
        >
          <div className="devices-row__name" role="cell">
            <span className={`devices-row__icon devices-row__icon--${device.type}`}>
              <DeviceTypeIcon type={device.type} size={18} />
            </span>
            <span className="devices-row__title">
              <strong>{device.name}</strong>
              <span className={`devices-row__location${device.hasLocation ? '' : ' devices-row__location--missing'}`}>
                <Icon name="pin" size={11} /> {device.location}
              </span>
            </span>
          </div>
          <div className="devices-row__cell devices-row__cell--type" role="cell">
            <span className="devices-row__label">Tipo</span>
            <span className={`devices-type devices-type--${device.type}`}>{TYPE_LABELS[device.type]}</span>
          </div>
          <div className="devices-row__cell devices-row__cell--status" role="cell">
            <span className="devices-row__label">Estado</span>
            <span className={`table-badge table-badge--${device.status}`}>
              <span className="table-badge-dot" />
              {device.status === 'active' ? 'Activo' : 'Inactivo'}
            </span>
          </div>
          <div className="devices-row__cell" role="cell">
            <span className="devices-row__label">Escaneos (30 días)</span>
            <span className="devices-row__scans">
              <strong>{NUM.format(device.scans30)}</strong>
              <SparkLine data={device.weeklyScans} inactive={device.status === 'inactive'} />
            </span>
          </div>
          <div className="devices-row__cell" role="cell">
            <span className="devices-row__label">Reseñas ({ESTIMATED_LABEL})</span>
            <span className="devices-row__reviews">{device.reviews == null ? '—' : `≈ ${NUM.format(device.reviews)}`}</span>
          </div>
          <div className="devices-row__cell" role="cell">
            <span className="devices-row__label">Último escaneo</span>
            <span className="devices-row__muted">{device.lastScan}</span>
          </div>
          <div className="devices-row__actions" role="cell">
            <button
              type="button"
              className="devices-icon-btn"
              onClick={e => { e.stopPropagation(); handleDownloadQr(device); }}
              disabled={!device.publicId}
              aria-label={`Descargar QR de ${device.name}`}
              title="Descargar QR"
            >
              <Icon name="qr" size={15} />
            </button>
            <button
              type="button"
              className="devices-icon-btn"
              onClick={e => { e.stopPropagation(); onSelect(device); }}
              aria-label={`Ver detalle de ${device.name}`}
              title="Ver detalle"
            >
              <Icon name="more" size={16} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Botón (i) ─────────────────────────────────────────────── */
/* Antes era un `title`: sólo se leía pasando el mouse, y en el celular no hacía
   nada. Ahora se abre con un click y se cierra con otro, afuera o con Escape. */
function InfoPopover() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function onDown(e) { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false); }
    function onKey(e) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="devices-info" ref={rootRef}>
      <button
        type="button"
        className={`devices-page__btn-icon${open ? ' devices-page__btn-icon--open' : ''}`}
        aria-label="Cómo funcionan los expositores"
        aria-expanded={open}
        aria-controls="devices-info-panel"
        onClick={() => setOpen(o => !o)}
      >
        <Icon name="info" size={17} />
      </button>
      {open && (
        <div className="devices-info__panel" id="devices-info-panel" role="dialog" aria-label="Cómo funcionan los expositores">
          <p className="devices-info__title">Cómo funcionan los expositores</p>
          <ul className="devices-info__list">
            <li><strong>NFC y QR en uno.</strong> Tus clientes lo tocan con el celular o escanean el QR del frente; las dos formas cuentan como escaneo.</li>
            <li><strong>A dónde lleva.</strong> Un expositor de Google Maps abre el formulario de reseña de tu sucursal; uno de Instagram, tu perfil.</li>
            <li><strong>Vincular uno nuevo.</strong> Tocá «Escanear QR» y apuntá al QR chico de la base, o escribí el código de 8 caracteres que viene al lado.</li>
            <li><strong>Reseñas «estimado».</strong> Google sólo informa el total de cada ficha: lo de cada expositor es la parte que le toca según sus escaneos.</li>
          </ul>
        </div>
      )}
    </div>
  );
}

/* ─── Ranking de Empleados (próximamente) ───────────────────── */
/* No hace nada a propósito: la atribución por persona necesita las tarjetas
   personales, que todavía no se venden (decisión 11). Un expositor está sobre
   la mesa y no es de nadie. */
function EmployeeRankingTeaser() {
  return (
    <div className="devices-teaser">
      <span className="devices-teaser__icon"><Icon name="trophy" size={24} /></span>
      <div className="devices-teaser__body">
        <p className="devices-teaser__title">
          Ranking de Empleados
          <span className="devices-teaser__badge">Próximamente</span>
        </p>
        <p className="devices-teaser__text">
          Asigná una tarjeta personal a cada empleado y descubrí quién consigue más reseñas.
        </p>
        <div className="devices-teaser__chips">
          <span className="devices-teaser__chip"><Icon name="crown" size={12} /> Líder de la semana</span>
          <span className="devices-teaser__chip"><Icon name="trend" size={12} /> Objetivos semanales</span>
        </div>
      </div>
    </div>
  );
}

/* ─── KPIs de escaneos (30 días) ────────────────────────────── */
function DevicesKpis({ kpis, hasReviewData }) {
  const scans = kpis?.human_scans ?? 0;
  const active = kpis?.active_devices ?? 0;
  const total = kpis?.total_devices ?? 0;
  const reviews = hasReviewData ? (kpis?.estimated_reviews ?? 0) : null;
  const conversion = hasReviewData ? (kpis?.conversion_rate ?? null) : null;

  return (
    <div className="kpi-grid">
      <KpiCard icon={<Icon name="scan" size={16} />} color="orange" label="Total de escaneos">
        <div className="kpi-card__value">{NUM.format(scans)}</div>
        <KpiTrend trend={trendFromPct(kpis?.human_scans_change_pct)} caption="últimos 30 días" />
      </KpiCard>
      <KpiCard icon={<Icon name="device" size={16} />} color="navy" label="Expositores activos">
        <div className="kpi-card__value">{NUM.format(active)}<small>/{NUM.format(total)}</small></div>
        <KpiTrend caption={total === 0 ? 'Todavía no vinculaste ninguno' : `de ${NUM.format(total)} vinculado${total === 1 ? '' : 's'}`} />
      </KpiCard>
      <KpiCard icon={<Icon name="star" size={16} />} color="gold" label="Reseñas estimadas">
        <div className="kpi-card__value">{reviews == null ? '—' : NUM.format(reviews)}</div>
        <KpiTrend
          trend={reviews == null ? null : trendFromPct(kpis?.reviews_change_pct)}
          caption={reviews == null ? 'Conectá tu ficha de Google' : `últimos 30 días · ${ESTIMATED_LABEL}`}
        />
      </KpiCard>
      <KpiCard icon={<Icon name="target" size={16} />} color="forest" label="Conversión a reseña">
        <div className="kpi-card__value">
          {conversion == null ? '—' : <>{String(conversion).replace('.', ',')}<small>%</small></>}
        </div>
        <KpiTrend
          caption={!hasReviewData
            ? 'Conectá tu ficha de Google'
            : conversion == null ? 'Sin escaneos en el período' : 'reseñas cada 100 personas que escanean'}
        />
      </KpiCard>
    </div>
  );
}

/* ─── Actividad ─────────────────────────────────────────────── */
/* v_scans_daily trae un total por día de la organización (nunca scan_events).
   Se pide el doble del período: la mitad vieja es el período anterior, que se
   dibuja punteado. Claves y etiquetas salen de lib/dashboardApi.js, las dos en
   UTC, para que cada punto rotule el día que cuenta. */
function buildActivity(rows, days, unique) {
  const column = unique ? 'unique_scans' : 'human_scans';
  const byDay = new Map((rows ?? []).map(r => [r.day, r[column] ?? 0]));
  const keys = lastNDayKeys(days * 2);
  const values = keys.map(k => byDay.get(k) ?? 0);
  return {
    labels: lastNDayLabels(days),
    current: values.slice(days),
    previous: values.slice(0, days),
  };
}

function ActivityCard({ activity, period, onPeriod, retentionDays, unique, onUnique }) {
  const days = Number(period);
  const series = useMemo(() => buildActivity(activity.rows, days, unique), [activity.rows, days, unique]);
  const total = series.current.reduce((s, v) => s + v, 0);
  // Si el período anterior cae fuera del historial del plan, la base no lo
  // devuelve y se vería en cero: se muestra «—» y se dice por qué (0034).
  const hasPrevious = canComparePrevious(days, retentionDays);
  const previousTotal = series.previous.reduce((s, v) => s + v, 0);

  return (
    <div className="devices-panel devices-activity">
      <div className="devices-panel__header">
        <div>
          <h3 className="devices-panel__title"><Icon name="activity" size={17} /> Actividad de Dispositivos</h3>
          <span className="devices-panel__subtitle">
            {unique ? 'Personas distintas' : 'Escaneos'} por día{hasPrevious ? ' · línea punteada: el período anterior' : ''}
          </span>
        </div>
        <div className="devices-activity__controls">
          <Switch checked={unique} onChange={onUnique} label="Personas distintas" />
          <Select
            value={period}
            onChange={onPeriod}
            options={periodOptionsFor(ACTIVITY_PERIOD_OPTIONS, retentionDays)}
            triggerClassName="ls-select-field"
          />
        </div>
      </div>

      {activity.failed && <p className="devices-note">No pudimos cargar la actividad. Probá recargar la página.</p>}
      {!activity.failed && activity.rows === null && <p className="devices-muted">Cargando actividad…</p>}
      {!activity.failed && activity.rows !== null && (
        <>
          <div className="devices-activity__totals">
            <span><strong>{NUM.format(total)}</strong> en el período</span>
            <span className="devices-activity__prev">{hasPrevious ? NUM.format(previousTotal) : '—'} en el anterior</span>
          </div>
          {!hasPrevious && (
            <RetentionNote days={retentionDays}>No hay período anterior para comparar.</RetentionNote>
          )}
          {total === 0 && (!hasPrevious || previousTotal === 0) && (
            <p className="devices-note">
              Todavía no registramos escaneos en este período. Van a aparecer acá en cuanto alguien toque o
              escanee un expositor (se suman todos los días a las 8:00).
            </p>
          )}
          <TrendChart
            data={series.current}
            compareData={hasPrevious ? series.previous : undefined}
            labels={series.labels}
            color="orange"
            seriesName={unique ? 'Personas distintas' : 'Escaneos'}
            compareName="Período anterior"
            yLabel={unique ? 'Personas' : 'Escaneos'}
          />
        </>
      )}
    </div>
  );
}

/* ─── Ranking de ubicaciones ────────────────────────────────── */
/* `human_scans_30d` (0018) y no `unique_scans_30d`: la columna se rotula
   «Escaneos» y tiene que cerrar contra el resto del panel. Las reseñas son
   `new_reviews_30d` (deltas de Google), «—» si la sucursal no tiene snapshot. */
function LocationRanking({ locations, showAll, onToggle }) {
  const ranked = useMemo(
    () => [...locations].sort((a, b) => (b.human_scans_30d ?? 0) - (a.human_scans_30d ?? 0) || (a.name ?? '').localeCompare(b.name ?? '')),
    [locations]
  );
  const visible = showAll ? ranked : ranked.slice(0, RANKING_VISIBLE);
  const hidden = ranked.length - RANKING_VISIBLE;

  return (
    <div className="devices-panel devices-ranking">
      <div className="devices-panel__header">
        <div>
          <h3 className="devices-panel__title"><Icon name="pin" size={17} /> Ranking de ubicaciones</h3>
          <span className="devices-panel__subtitle">Tus sucursales, por escaneos de los últimos 30 días</span>
        </div>
        {hidden > 0 && (
          <button type="button" className="devices-link-btn" onClick={onToggle} aria-expanded={showAll}>
            {showAll ? 'Ver menos' : `Ver más (${hidden})`}
            <span className={`devices-link-btn__chevron${showAll ? ' devices-link-btn__chevron--up' : ''}`}><Icon name="chevronDown" size={14} /></span>
          </button>
        )}
      </div>

      {ranked.length === 0 ? (
        <p className="devices-note">
          Todavía no cargaste ninguna sucursal. Se crean desde Configuración → Gestión local, y después les
          asignás los expositores.
        </p>
      ) : (
        <div className="devices-ranking__list">
          <div className="devices-ranking__head">
            <span>#</span>
            <span>Sucursal</span>
            <span>Escaneos</span>
            <span>Reseñas ({ESTIMATED_LABEL})</span>
          </div>
          {visible.map((loc, i) => (
            <div key={loc.location_id} className="devices-ranking__row">
              <span className={`devices-ranking__pos${i < 3 ? ` devices-ranking__pos--${i + 1}` : ''}`}>{i + 1}</span>
              <span className="devices-ranking__name">
                <span className="devices-ranking__dot" style={{ background: colorForIndex(i) }} />
                {loc.name}
              </span>
              <span className="devices-ranking__scans">{NUM.format(loc.human_scans_30d ?? 0)}</span>
              <span className="devices-ranking__reviews">
                {loc.total_reviews == null ? '—' : NUM.format(loc.new_reviews_30d ?? 0)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Página ────────────────────────────────────────────────── */
export default function DevicesPage({ claimCode, onClaimCodeHandled }) {
  const { org, retentionDays } = useOrg();
  const orgId = org?.organization_id;

  const initial = lastView.orgId === orgId ? lastView : DEFAULT_VIEW;
  const [search, setSearch] = useState(initial.search);
  const [filter, setFilter] = useState(initial.filter);
  const [period, setPeriod] = useState(initial.period);
  const [unique, setUnique] = useState(initial.unique);
  const [showAllLocations, setShowAllLocations] = useState(initial.showAllLocations);

  useEffect(() => {
    lastView = { orgId, search, filter, period, unique, showAllLocations };
  }, [orgId, search, filter, period, unique, showAllLocations]);

  // Un período guardado de antes de bajar de plan no puede pedir más historia
  // de la que la base deja ver (0034).
  const activePeriod = clampPeriod(period, ACTIVITY_PERIOD_OPTIONS, retentionDays);
  const { base, activity, reload } = useDevicesData(orgId, { period: activePeriod });

  const [selectedId, setSelectedId] = useState(null);
  const [claim, setClaim] = useState(null); // null | { code }
  const [deviceBusy, setDeviceBusy] = useState(false);
  const [deviceError, setDeviceError] = useState(null);

  /* devices_update (0014) admite owner, admin y manager. */
  const canEdit = ['owner', 'admin', 'manager'].includes(org?.role);

  /* El QR de vinculación abre el panel en /panel/dispositivos?vincular=CODIGO
     (ScanClaimModal.jsx): se abre el modal ya completado y se limpia la URL,
     para que recargar no lo vuelva a abrir. */
  useEffect(() => {
    if (!claimCode) return;
    setClaim({ code: claimCode });
    onClaimCodeHandled?.();
  }, [claimCode, onClaimCodeHandled]);

  const locationById = useMemo(
    () => new Map(base.locations.map(l => [l.location_id, l])),
    [base.locations]
  );
  const devices = useMemo(
    () => base.devices.map(row => mapDeviceRow(row, base.series, base.details, locationById)),
    [base.devices, base.series, base.details, locationById]
  );
  const hasReviewData = base.locations.some(l => l.total_reviews !== null && l.total_reviews !== undefined);
  const selected = devices.find(d => d.id === selectedId) ?? null;

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return devices.filter(d => {
      const matchSearch = !term || d.name.toLowerCase().includes(term) || d.location.toLowerCase().includes(term);
      const matchFilter =
        filter === 'all'       ? true :
        filter === 'google'    ? d.type === 'google' :
        filter === 'instagram' ? d.type === 'instagram' :
        filter === 'active'    ? d.status === 'active' :
        filter === 'inactive'  ? d.status === 'inactive' : true;
      return matchSearch && matchFilter;
    });
  }, [devices, search, filter]);

  const totalActive = devices.filter(d => d.status === 'active').length;
  const totalScans30 = devices.reduce((sum, d) => sum + d.scans30, 0);

  function clearFilters() {
    setSearch('');
    setFilter('all');
  }

  /* Guardado real contra `devices` (política devices_update del 0014). Devuelve
     true/false para que el modal sepa si puede cerrar el formulario. */
  async function handleSaveDevice(device, form) {
    setDeviceBusy(true);
    setDeviceError(null);
    try {
      await updateDevice(device.id, {
        label: form.name,
        location_id: form.locationId || null,
        // La base rechaza un empleado en algo que no sea una tarjeta (0028).
        employee_id: device.formFactor === 'nfc_card' ? form.employeeId || null : null,
        // El desplegable habla en 'google'/'instagram'; la columna es el enum
        // device_kind, donde Google es 'google_review'. Sin esto falla con 22P02.
        kind: form.type === 'instagram' ? 'instagram' : 'google_review',
        // Vacío tiene que ser null, nunca '': resolve_scan() hace coalesce sobre
        // esta columna y una cadena vacía contaría como destino válido.
        destination_url: form.destinationUrl.trim() || null,
      });
      setSelectedId(null);
      reload();
      return true;
    } catch (err) {
      console.error('No se pudo guardar el dispositivo:', err);
      setDeviceError(catalogErrorMessage(err, 'el dispositivo'));
      return false;
    } finally {
      setDeviceBusy(false);
    }
  }

  async function handleToggleStatus(device) {
    /* El enum device_status es ('unassigned','active','paused','lost','retired'):
       'inactive' NO existe en la base y escribirlo falla con 22P02. Apagar un
       expositor lo deja en 'paused'. */
    const next = device.status === 'active' ? 'paused' : 'active';
    setDeviceBusy(true);
    setDeviceError(null);
    try {
      await updateDevice(device.id, { status: next });
      setSelectedId(null);
      reload();
    } catch (err) {
      console.error('No se pudo cambiar el estado del dispositivo:', err);
      setDeviceError(catalogErrorMessage(err, 'el dispositivo'));
    } finally {
      setDeviceBusy(false);
    }
  }

  const header = (
    <PageHeader
      eyebrow="Expositores"
      title="Dispositivos"
      subtitle="Tus expositores Linkstar (NFC y QR en un mismo dispositivo) y cuánto rinden"
      actions={(
        <div className="devices-page__actions">
          <InfoPopover />
          <button type="button" className="devices-page__btn-primary" onClick={() => setClaim({ code: '' })}>
            <Icon name="qr" size={15} />
            Escanear QR
          </button>
        </div>
      )}
    />
  );

  const claimModal = claim && (
    <ScanClaimModal
      initialCode={claim.code}
      onClose={() => setClaim(null)}
      onClaimed={reload}
    />
  );

  if (base.loading && !base.devices.length && !base.kpis) {
    return (
      <div className="devices-page">
        {header}
        <PageSkeleton label="Cargando tus dispositivos" />
        {claimModal}
      </div>
    );
  }

  if (base.error) {
    return (
      <div className="devices-page">
        {header}
        <SectionPlaceholder
          variant="soon"
          title="No pudimos cargar tus dispositivos"
          description="Hubo un problema al consultar tus expositores. Probá recargar la página; si sigue pasando, escribinos y lo miramos."
        />
        {claimModal}
      </div>
    );
  }

  return (
    <div className="devices-page">
      {header}

      <GoogleConnectBanner />

      <EmployeeRankingTeaser />

      <DevicesKpis kpis={base.kpis} hasReviewData={hasReviewData} />

      {/* ── Cuadro de dispositivos ── */}
      <div className="devices-card">
        <div className="devices-card__header">
          <div className="devices-card__header-left">
            <span className="devices-card__header-icon"><Icon name="scan" size={17} /></span>
            Dispositivos
          </div>
          <div className="devices-card__header-stats">
            <span><strong>{NUM.format(totalActive)}</strong> activos</span>
            <span className="devices-card__divider" />
            <span><strong>{NUM.format(totalScans30)}</strong> escaneos (30 días)</span>
          </div>
        </div>

        <div className="devices-toolbar">
          <div className="devices-search">
            <span className="devices-search__icon"><Icon name="search" size={16} /></span>
            <input
              className="devices-search__input"
              type="search"
              placeholder="Buscar por nombre o sucursal…"
              aria-label="Buscar dispositivos"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="devices-filters" role="tablist" aria-label="Filtrar dispositivos">
            {FILTER_TABS.map(tab => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={filter === tab.id}
                className={`devices-filter-tab${filter === tab.id ? ' devices-filter-tab--active' : ''}`}
                onClick={() => setFilter(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0
          ? <DevicesEmpty hasAny={devices.length > 0} onClaim={() => setClaim({ code: '' })} onClearFilters={clearFilters} />
          : <DeviceTable devices={filtered} onSelect={d => setSelectedId(d.id)} />}
      </div>

      <ActivityCard
        activity={activity}
        period={activePeriod}
        onPeriod={setPeriod}
        retentionDays={retentionDays}
        unique={unique}
        onUnique={setUnique}
      />

      <LocationRanking
        locations={base.locations}
        showAll={showAllLocations}
        onToggle={() => setShowAllLocations(v => !v)}
      />

      {selected && (
        <DeviceModal
          device={selected}
          locations={base.locations.map(l => ({ id: l.location_id, name: l.name }))}
          employees={base.employees.map(e => ({ id: e.employee_id, name: e.full_name }))}
          canEdit={canEdit}
          busy={deviceBusy}
          error={deviceError}
          onClose={() => { setSelectedId(null); setDeviceError(null); }}
          onSave={handleSaveDevice}
          onToggleStatus={handleToggleStatus}
        />
      )}

      {claimModal}
    </div>
  );
}
