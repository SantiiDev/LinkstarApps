import { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ALL_LOCATIONS } from '../../data/locations';
import { useOrg } from '../../context/OrgContext';
import {
  fetchLocationPerformance,
  fetchDevicePerformance,
  fetchEmployeeLeaderboard,
  fetchLocationScansSeries,
  formatRelativeTime,
  colorForIndex,
  lastNDayLabels,
} from '../../lib/dashboardApi';
import {
  fetchLocationRows,
  deleteLocation,
  googleDestinationOf,
  instagramDestinationOf,
  catalogErrorMessage,
} from '../../lib/catalogApi';
import Icon from '../../components/Icon/Icon';
import Select from '../../components/Select/Select';
import LocationForm from './LocationForm';
import './Locations.css';

// Largo de las sparklines de esta pantalla.
const SPARKLINE_DAYS = 7;

/* ─── Helpers ──────────────────────────────────────────────── */
function pct(current, goal) {
  return Math.min(Math.round((current / goal) * 100), 100);
}

// "—" para campos sin dato real (null) en vez de "null" o "%" solo.
function stat(value, suffix = '') {
  return value === null || value === undefined ? '—' : `${value}${suffix}`;
}

// v_location_performance (0008_dashboard_views.sql) no expone dirección,
// teléfono ni los campos de Google: es una vista de MÉTRICAS. Esos datos salen
// de la fila de `locations` (catalogApi.fetchLocationRows), que se cruza acá por
// id. Las dos lecturas conviven a propósito — la vista sigue siendo la única
// fuente de los números (invariante 2), y la fila es lo que edita el formulario.
// Se cruza además con v_device_performance/v_employee_leaderboard para armar
// listas reales de dispositivos/empleados y la última actividad.
/* Los dos destinos de una sucursal. Una sucursal no tiene UN destino: cada
   expositor tiene su tipo (`devices.kind`) y resolve_scan() arma el link según
   ese tipo — los de Google van a la reseña, los de Instagram al perfil, y una
   sucursal puede tener de los dos a la vez. Por cada destino:
     - `set`:   la sucursal tiene el link cargado (mismo cálculo que
                LocationForm, que copia la cascada de resolve_scan);
     - `count`: cuántos expositores de ese tipo tiene (sin los retirados);
     - `missing`: hay expositores de ese tipo y no tienen a dónde ir. Es lo único
                que se avisa: un link que ningún expositor usa no falta.
   Un expositor con destino propio (`destination_url`) no depende de la
   sucursal, pero v_device_performance no expone esa columna: se cuenta igual. */
function linksOf(detail, devices) {
  const live = devices.filter(d => d.status !== 'retired');
  const google = Boolean(googleDestinationOf(detail));
  const instagram = Boolean(instagramDestinationOf(detail));
  const googleCount = live.filter(d => d.kind === 'google_review').length;
  const instagramCount = live.filter(d => d.kind === 'instagram').length;
  return {
    google: { set: google, count: googleCount, missing: googleCount > 0 && !google },
    instagram: { set: instagram, count: instagramCount, missing: instagramCount > 0 && !instagram },
  };
}

/* Una sucursal que hay que arreglar: un tipo de expositor sin link, o ningún
   destino cargado (sus expositores no llevarían a ningún lado). Sin la fila
   cruda (`detail`) no se sabe y no se avisa. */
function needsLinks(loc) {
  if (!loc.detail) return false;
  const { google, instagram } = loc.links;
  return google.missing || instagram.missing || (!google.set && !instagram.set);
}

function mapLocationRow(row, { devicesByLocation, employeesByLocation, scansSeries, index, detail }) {
  const myDevices = devicesByLocation.get(row.location_id) || [];
  const myEmployees = employeesByLocation.get(row.location_id) || [];
  const lastScanAt = myDevices.reduce((latest, d) => {
    if (!d.last_scan_at) return latest;
    return !latest || d.last_scan_at > latest ? d.last_scan_at : latest;
  }, null);

  return {
    id: row.location_id,
    name: row.name,
    address: detail?.address || '—',
    city: detail?.city || row.city || '—',
    // La vista sólo excluye locations con deleted_at (soft-delete) — no hay
    // un flag real de "operativa/cerrada" más allá de eso.
    status: 'active',
    // No hay encargado a nivel sucursal en el esquema: `memberships` +
    // `membership_locations` acotan a un usuario a una sucursal, pero eso es un
    // permiso, no un cargo. Queda en "—" hasta que exista el campo.
    manager: '—',
    phone: detail?.phone || '—',
    email: '—',
    openSince: '—',
    // La fila cruda, para el formulario de edición y para saber si la sucursal
    // tiene destino de escaneo cargado.
    detail: detail ?? null,
    links: linksOf(detail, myDevices),
    lastActivity: formatRelativeTime(lastScanAt),
    totalDevices: myDevices.length,
    activeDevices: myDevices.filter(d => d.status === 'active').length,
    totalEmployees: myEmployees.length,
    // human_scans_30d (0018), no unique_scans_30d: la etiqueta dice "Escaneos"
    // y unique son personas distintas. Con 40 toques de 12 clientes la tarjeta
    // mostraba 12, un número que no coincidía con ninguna otra pantalla.
    // unique_scans_30d se sigue usando del lado SQL para conversion_rate.
    totalScans: row.human_scans_30d ?? 0,
    totalReviews: row.new_reviews_30d ?? 0,
    avgConversion: row.conversion_rate,
    avgRating: row.average_rating,
    monthlyGoal: 100,
    weeklyScans: scansSeries?.get(row.location_id) ?? Array(SPARKLINE_DAYS).fill(0),
    // Sin serie diaria de reseñas: review_deltas tiene el dato por día, pero
    // lo llena compute_review_deltas() a partir de location_review_snapshots,
    // que hoy no escribe nadie (falta la integración sync-reviews de Google).
    // Mientras tanto son ceros de verdad, no un placeholder: es lo mismo que
    // ya devuelve new_reviews_30d en las tarjetas de arriba.
    weeklyReviews: Array(SPARKLINE_DAYS).fill(0),
    zones: [],
    devices: myDevices.map(d => d.label),
    employees: myEmployees.map(e => e.full_name),
    coordinates: null,
    color: colorForIndex(index),
  };
}

/* ─── Location Detail Modal ────────────────────────────────── */
function LocationModal({ location, onClose, onEdit, onDelete, canEdit }) {
  if (!location) return null;
  const maxScans = Math.max(...location.weeklyScans, 1);
  const maxReviews = Math.max(...location.weeklyReviews, 1);
  const progress = pct(location.totalReviews, location.monthlyGoal);
  // Los últimos N días terminando hoy, no una semana calendario: rotular esto
  // con L-M-X-J-V-S-D asumía que la serie arrancaba un lunes y desalineaba
  // cada barra con su fecha real.
  const days = lastNDayLabels(location.weeklyScans.length);

  return (
    <div className="loc-modal-overlay" onClick={onClose}>
      <div className="loc-modal" onClick={e => e.stopPropagation()}>

        {/* Hero */}
        <div className="loc-modal__hero">
          <div
            className="loc-modal__avatar"
            style={{ background: location.color }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
          </div>

          <div className="loc-modal__hero-info">
            <div className="loc-modal__name">{location.name}</div>
            <div className="loc-modal__address">{location.address}</div>
            <div className="loc-modal__hero-badges">
              <span className={`loc-card__status loc-card__status--${location.status}`}>
                <span className="loc-card__status-dot" />
                {location.status === 'active' ? 'Operativa' : 'Cerrada'}
              </span>
              <span className="loc-card__rating">⭐ {stat(location.avgRating)}</span>
            </div>
          </div>

          <button className="loc-modal__close" onClick={onClose} aria-label="Cerrar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="loc-modal__body">

          {/* Stats row */}
          <div className="loc-modal__stats">
            <div className="loc-modal__stat-box">
              <span className="loc-modal__stat-val" style={{ color: 'var(--color-orange)' }}>
                {location.totalScans.toLocaleString()}
              </span>
              <span className="loc-modal__stat-lbl">Escaneos</span>
            </div>
            <div className="loc-modal__stat-box">
              <span className="loc-modal__stat-val" style={{ color: 'var(--color-gold)' }}>
                {location.totalReviews.toLocaleString()}
              </span>
              <span className="loc-modal__stat-lbl">Reseñas (estimado)</span>
            </div>
            <div className="loc-modal__stat-box">
              <span className="loc-modal__stat-val" style={{ color: 'var(--color-forest)' }}>
                {stat(location.avgConversion, '%')}
              </span>
              <span className="loc-modal__stat-lbl">Conversión</span>
            </div>
          </div>

          {/* Goal progress */}
          <div className="loc-modal__goal-section">
            <div className="loc-modal__goal-header">
              <span className="loc-modal__goal-label">Meta mensual de reseñas (estimado)</span>
              <span className="loc-modal__goal-val">{location.totalReviews} / {location.monthlyGoal} · {progress}%</span>
            </div>
            <div className="loc-modal__goal-track">
              <div className="loc-modal__goal-fill" style={{ width: `${progress}%` }} />
            </div>
          </div>

          {/* Info grid */}
          <div className="loc-modal__info-grid">
            <div className="loc-modal__info-item">
              <div className="loc-modal__info-key">Encargado</div>
              <div className="loc-modal__info-val">{location.manager}</div>
            </div>
            <div className="loc-modal__info-item">
              <div className="loc-modal__info-key">Dispositivos</div>
              <div className="loc-modal__info-val">{location.activeDevices} activos / {location.totalDevices} total</div>
            </div>
            <div className="loc-modal__info-item">
              <div className="loc-modal__info-key">Empleados</div>
              <div className="loc-modal__info-val">{location.totalEmployees}</div>
            </div>
            <div className="loc-modal__info-item">
              <div className="loc-modal__info-key">Rating promedio</div>
              <div className="loc-modal__info-val">⭐ {stat(location.avgRating)} / 5</div>
            </div>
            <div className="loc-modal__info-item">
              <div className="loc-modal__info-key">Abierta desde</div>
              <div className="loc-modal__info-val">{location.openSince}</div>
            </div>
            <div className="loc-modal__info-item">
              <div className="loc-modal__info-key">Última actividad</div>
              <div className="loc-modal__info-val">{location.lastActivity}</div>
            </div>
          </div>

          {/* Zones */}
          <div className="loc-modal__section-title">Zonas</div>
          <div className="loc-modal__tags-list">
            {location.zones.map(z => (
              <span key={z} className="loc-modal__zone-tag">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                </svg>
                {z}
              </span>
            ))}
          </div>

          {/* Devices */}
          <div className="loc-modal__section-title">Dispositivos asignados</div>
          <div className="loc-modal__tags-list">
            {location.devices.map(d => (
              <span key={d} className="loc-modal__device-tag">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 8.32a7.43 7.43 0 0 1 0 7.36" />
                  <path d="M9.46 6.21a11.76 11.76 0 0 1 0 11.58" />
                  <path d="M12.91 4.1a16.1 16.1 0 0 1 0 15.8" />
                </svg>
                {d}
              </span>
            ))}
          </div>

          {/* Employees */}
          <div className="loc-modal__section-title">Equipo</div>
          <div className="loc-modal__tags-list">
            {location.employees.map(e => (
              <span key={e} className="loc-modal__employee-tag">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
                </svg>
                {e}
              </span>
            ))}
          </div>

          {/* Weekly charts */}
          <div className="loc-modal__charts-row">
            <div className="loc-modal__chart-block">
              <div className="loc-modal__chart-title">
                Escaneos — últimos {location.weeklyScans.length} días
              </div>
              <div className="loc-modal__chart">
                {location.weeklyScans.map((v, i) => (
                  <div
                    key={i}
                    className="loc-modal__chart-bar loc-modal__chart-bar--scans"
                    style={{ height: `max(2px, ${(v / maxScans) * 100}%)` }}
                    title={`${days[i]}: ${v} escaneos`}
                  />
                ))}
              </div>
            </div>
            <div className="loc-modal__chart-block">
              <div className="loc-modal__chart-title">
                Reseñas — últimos {location.weeklyReviews.length} días
              </div>
              <div className="loc-modal__chart">
                {location.weeklyReviews.map((v, i) => (
                  <div
                    key={i}
                    className="loc-modal__chart-bar loc-modal__chart-bar--reviews"
                    style={{ height: `max(2px, ${(v / maxReviews) * 100}%)` }}
                    title={`${days[i]}: ${v} reseñas`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Footer.
            "Ver historial completo" estaba acá y no abría nada — no existe una
            pantalla de historial por sucursal. Se sacó junto con el resto de los
            botones inertes; si más adelante hay a dónde ir, vuelve. */}
        {canEdit && (
          <div className="loc-modal__footer">
            <button
              className="loc-modal__action-btn loc-modal__action-btn--danger"
              onClick={() => onDelete(location)}
            >
              Dar de baja
            </button>
            {/* Sin `detail` no se puede editar, y el botón se deshabilita en vez
                de abrir el formulario: LocationForm decide entre alta y edición
                mirando si le llegó un id, así que abrirlo sin la fila crearía
                una sucursal nueva en lugar de modificar ésta. Pasa sólo si
                fetchLocationRows() falló. */}
            <button
              className="loc-modal__action-btn loc-modal__action-btn--secondary"
              onClick={() => onEdit(location)}
              disabled={!location.detail}
              title={location.detail ? undefined : 'No pudimos cargar los datos de esta sucursal. Recargá la página.'}
            >
              Editar sucursal
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Empty states ──────────────────────────────────────────── */
/* Mismo criterio que en Dispositivos: "no cargaste ninguna sucursal todavía" y
   "el filtro no devolvió nada" son dos situaciones distintas y antes decían la
   misma frase. `hasAny` mira la lista completa, no la filtrada. */
function LocationsEmpty({ hasAny, onClearFilters, onCreate }) {
  if (hasAny) {
    return (
      <div className="loc-empty">
        <div className="loc-empty__icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </div>
        <div className="loc-empty__title">Sin resultados</div>
        <div className="loc-empty__text">Ninguna sucursal coincide con la búsqueda o el filtro aplicado.</div>
        <button className="loc-empty__btn" onClick={onClearFilters}>Limpiar filtros</button>
      </div>
    );
  }

  return (
    <div className="loc-empty">
      <div className="loc-empty__icon">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
        </svg>
      </div>
      <div className="loc-empty__title">Todavía no cargaste ninguna sucursal</div>
      <div className="loc-empty__text">
        Una sucursal es cada local con su propia ficha de Google. Cargala primero
        y después asignale los expositores: sin eso, un escaneo no sabe a qué
        formulario de reseña mandar al cliente.
      </div>
      {/* El CTA sólo aparece si quien mira puede crear: a un manager, que no
          tiene la política de insert del 0014, un botón acá le ofrecería algo
          que la base le va a rechazar. */}
      {onCreate && (
        <button className="loc-empty__btn" onClick={onCreate} type="button">
          Cargar una sucursal
        </button>
      )}
    </div>
  );
}

/* ─── Lista ─────────────────────────────────────────────────── */
/* Una fila por sucursal, sin scroll horizontal. Hasta oct 2026 había además una
   vista de tarjetas y la tabla tenía ocho columnas con escaneos, reseñas
   estimadas, conversión y rating: datos de Mi Empresa y Dispositivos dentro de
   Configuración, y una tabla de 780px que había que deslizar. Esta lista dice
   sólo lo que se configura acá: la sucursal, qué links tiene cargados (Google,
   Instagram o los dos, ver linksOf) y cuántos expositores tiene. Los números
   siguen en el detalle (LocationModal). En celular cada fila se apila (CSS). */
const LINK_LABELS = { google: 'Google', instagram: 'Instagram' };

/* Un destino de la sucursal: cargado (verde), falta y hay expositores de ese
   tipo esperándolo (ámbar), o sin cargar y sin expositores que lo usen (gris,
   no es un problema). El número es cuántos expositores van a ese destino. */
function LinkChip({ type, link }) {
  const state = link.set ? 'ok' : link.missing ? 'missing' : 'unset';
  const devices = link.count === 1 ? '1 expositor' : `${link.count} expositores`;
  const title = link.set
    ? `Link de ${LINK_LABELS[type]} cargado${link.count ? ` · ${devices}` : ''}`
    : link.missing
      ? `Falta el link de ${LINK_LABELS[type]}: ${devices} no llevan a ningún lado`
      : `Sin link de ${LINK_LABELS[type]}`;

  return (
    <span className={`loc-link loc-link--${state}`} title={title}>
      <Icon name={type === 'google' ? 'star' : 'instagram'} size={12} strokeWidth={2.2} />
      {LINK_LABELS[type]}
      {link.count > 0 && <span className="loc-link__count">{link.count}</span>}
      {state === 'missing' && <span className="loc-link__flag">falta el link</span>}
    </span>
  );
}

function LocationTable({ locations, hasAny, onSelect, onClearFilters, onCreate }) {
  if (locations.length === 0) {
    return (
      <div className="loc-table-wrap">
        <LocationsEmpty hasAny={hasAny} onClearFilters={onClearFilters} onCreate={onCreate} />
      </div>
    );
  }

  return (
    <div className="loc-table-wrap">
      <table className="loc-table">
        <thead>
          <tr>
            <th>Sucursal</th>
            <th>Destinos</th>
            <th>Expositores</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          {locations.map(loc => (
            <tr key={loc.id} onClick={() => onSelect(loc)}>
              <td className="loc-table__cell-main">
                <div className="loc-table__location">
                  <div className="loc-table__icon" style={{ background: `${loc.color}18`, color: loc.color }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                  </div>
                  <div className="loc-table__text">
                    <div className="loc-table__name">{loc.name}</div>
                    <div className="loc-table__address">
                      {[loc.address, loc.city].filter(v => v && v !== '—').join(' · ') || '—'}
                    </div>
                  </div>
                </div>
              </td>
              <td data-label="Destinos">
                {/* Sin la fila cruda (fetchLocationRows falló) no sabemos qué links
                    tiene: "—", no "sin cargar", que sería afirmar algo que no leímos. */}
                {!loc.detail ? '—' : (
                  <div className="loc-links">
                    <LinkChip type="google" link={loc.links.google} />
                    <LinkChip type="instagram" link={loc.links.instagram} />
                  </div>
                )}
              </td>
              <td data-label="Expositores">
                <span className="loc-table__devices-count">
                  {loc.activeDevices} <span className="loc-table__devices-sep">activos de</span> {loc.totalDevices}
                </span>
              </td>
              <td data-label="Estado">
                <span className={`loc-table__badge-status loc-table__badge-status--${loc.status}`}>
                  <span className="loc-table__badge-dot" />
                  {loc.status === 'active' ? 'Operativa' : 'Cerrada'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Main Page ─────────────────────────────────────────────── */
/* No hay tab "Cerradas": mapLocationRow() pone `status: 'active'` en todas,
   porque la vista del 0008 sólo excluye las borradas (deleted_at) y no existe
   un flag de "cerrada" en el esquema. El tab estaba siempre vacío — clickearlo
   devolvía "Sin resultados" sin que el usuario hubiera filtrado nada. Vuelve
   el día que haya una columna que lo respalde. */
const FILTER_TABS = [
  { id: 'all',      label: 'Todas' },
  { id: 'active',   label: 'Operativas' },
];

/* Se ordena por lo que muestra la lista. Antes era por reseñas, escaneos,
   conversión y rating, columnas que ya no están acá (ver LocationTable). */
const SORT_OPTIONS = [
  { value: 'name',        label: 'Nombre (A–Z)' },
  { value: 'devices',     label: 'Más expositores' },
  { value: 'destination', label: 'Links faltantes primero' },
];

const SORTERS = {
  name: (a, b) => a.name.localeCompare(b.name, 'es'),
  devices: (a, b) => b.totalDevices - a.totalDevices || a.name.localeCompare(b.name, 'es'),
  // Las que les falta un link arriba: son las que hay que arreglar. Sin la fila
  // cruda (`detail`) no se sabe, y van al final.
  destination: (a, b) => {
    const rank = (l) => (!l.detail ? 2 : needsLinks(l) ? 0 : 1);
    return rank(a) - rank(b) || a.name.localeCompare(b.name, 'es');
  },
};

// `embedded`: la página se renderiza dentro de la pestaña "Gestión local" de
// Configuración, que ya trae su propio PageHeader. En ese modo se ocultan el
// encabezado y el pie propios para no duplicarlos.
export default function LocationsPage({ embedded = false }) {
  const { org } = useOrg();
  const orgId = org?.organization_id;
  const [locations, setLocations] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [filter, setFilter]     = useState('all');
  const [sort, setSort]         = useState('name');
  const [selected, setSelected] = useState(null);
  /* null = cerrado · { location: null } = alta · { location } = edición */
  const [editing, setEditing]   = useState(null);
  const [actionError, setActionError] = useState(null);

  /* Sólo owner y admin pueden escribir `locations` (política locations_insert
     del 0014). Un manager entra a esta pantalla y ve todo, pero no puede crear
     ni editar: mostrarle los botones sería ofrecerle algo que la base va a
     rechazar. */
  const canEdit = org?.role === 'owner' || org?.role === 'admin';

  /* Carga real desde Supabase (v_location_performance, cruzada con
     v_device_performance/v_employee_leaderboard para dispositivos/equipo
     asignados y última actividad). Si falla, mock completo — un resultado
     vacío (org sin ubicaciones todavía) no es una falla. */
  const [reloadToken, setReloadToken] = useState(0);
  const reload = () => setReloadToken(t => t + 1);

  useEffect(() => {
    // Sin organización activa no se pide nada (la lectura lanzaría y esto
    // caería al mock).
    if (!orgId) return;
    let cancelled = false;
    (async () => {
      try {
        const [locationRows, detailRows, deviceRows, employeeRows, scansSeries] = await Promise.all([
          fetchLocationPerformance(orgId),
          // Las filas crudas: dirección, teléfono y los campos de Google, que la
          // vista de métricas no tiene. Catch propio — si esto falla, la
          // pantalla sigue mostrando métricas reales y sólo se queda sin los
          // datos de ficha, en vez de caerse entera al mock.
          fetchLocationRows(orgId).catch(err => {
            console.error('No se pudieron cargar los datos de ficha de las sucursales:', err);
            return [];
          }),
          fetchDevicePerformance(orgId),
          fetchEmployeeLeaderboard(orgId),
          // Catch propio: si falta la migración 0016 la sparkline queda plana,
          // pero el resto de la pantalla conserva sus datos reales en vez de
          // caerse entera al mock.
          fetchLocationScansSeries(orgId, SPARKLINE_DAYS).catch(err => {
            console.error('No se pudo cargar la serie diaria por local, las sparklines quedan en cero:', err);
            return new Map();
          }),
        ]);
        if (cancelled) return;

        const detailById = new Map(detailRows.map(r => [r.id, r]));

        const devicesByLocation = new Map();
        deviceRows.forEach(d => {
          if (!d.location_id) return;
          if (!devicesByLocation.has(d.location_id)) devicesByLocation.set(d.location_id, []);
          devicesByLocation.get(d.location_id).push(d);
        });

        const employeesByLocation = new Map();
        employeeRows.forEach(e => {
          if (!e.location_id) return;
          if (!employeesByLocation.has(e.location_id)) employeesByLocation.set(e.location_id, []);
          employeesByLocation.get(e.location_id).push(e);
        });

        setLocations(locationRows.map((row, index) =>
          mapLocationRow(row, {
            devicesByLocation,
            employeesByLocation,
            scansSeries,
            index,
            detail: detailById.get(row.location_id),
          })
        ));
      } catch (err) {
        console.error('No se pudieron cargar las ubicaciones reales, muestro datos de ejemplo:', err);
        if (cancelled) return;
        setLocations(ALL_LOCATIONS);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [reloadToken, orgId]);

  /* Después de guardar se recarga todo en vez de parchear el array en memoria.
     Es una consulta más, pero una sucursal nueva no tiene fila en
     v_location_performance hasta que se la vuelve a pedir, y parchear a mano
     significaría fabricar sus métricas en cero — justo lo que este panel dejó
     de hacer. */
  function handleSaved() {
    setEditing(null);
    setSelected(null);
    setActionError(null);
    reload();
  }

  async function handleDelete(location) {
    const ok = window.confirm(
      `¿Dar de baja "${location.name}"?\n\nLos expositores asignados dejan de tener sucursal y sus escaneos pasan a redirigir al destino de respaldo de la organización. El historial se conserva.`
    );
    if (!ok) return;

    try {
      await deleteLocation(location.id);
      setSelected(null);
      setActionError(null);
      reload();
    } catch (err) {
      console.error('No se pudo dar de baja la sucursal:', err);
      setActionError(catalogErrorMessage(err, 'la sucursal'));
    }
  }

  /* Derived stats */
  // Sólo se cuentan las que tienen fila cruda: si fetchLocationRows() falló, el
  // campo viene vacío para todas y avisar "ninguna tiene destino" sería mentir
  // sobre un dato que no llegamos a leer.
  const missingDestinationCount = locations.filter(needsLinks).length;
  const totalActive    = locations.filter(l => l.status === 'active').length;
  const totalDevices   = locations.reduce((s, l) => s + l.totalDevices, 0);

  /* Filtered + sorted list */
  const displayed = useMemo(() => {
    let list = locations.filter(l => {
      const q = search.toLowerCase();
      const matchSearch =
        l.name.toLowerCase().includes(q) ||
        l.address.toLowerCase().includes(q) ||
        l.manager.toLowerCase().includes(q) ||
        l.city.toLowerCase().includes(q);

      const matchFilter =
        filter === 'all'    ? true :
        filter === 'active' ? l.status === 'active' : true;

      return matchSearch && matchFilter;
    });

    list = [...list].sort(SORTERS[sort] ?? SORTERS.name);
    return list;
  }, [locations, search, filter, sort]);

  function clearFilters() {
    setSearch('');
    setFilter('all');
  }

  if (loading) {
    return <div className="app-loading">Cargando…</div>;
  }

  return (
    <div className={`loc-page ${embedded ? 'loc-page--embedded' : ''}`}>

      {/* ── Header ── */}
      {!embedded && (
      <div className="loc-page__header">
        <div className="loc-page__title-block">
          <div className="loc-page__eyebrow">
            <span className="loc-page__eyebrow-dot" />
            Gestión de sucursales
          </div>
          <h1 className="loc-page__title">Ubicaciones</h1>
          <p className="loc-page__subtitle">
            {locations.length} sucursales registradas · {totalActive} operativas · {totalDevices} dispositivos desplegados
          </p>
        </div>

        {/* "Exportar" vivía acá y no hacía nada: ni descargaba un archivo ni
            abría un diálogo. Se sacó por la misma regla que la fase 2 le aplicó
            a los interruptores de Automatizaciones — un botón que no resuelve
            nada es peor que ninguno. Cuando exista la exportación, vuelve. */}
        {canEdit && (
          <div className="loc-page__actions">
            <button className="loc-page__btn-primary" onClick={() => setEditing({ location: null })}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Nueva sucursal
            </button>
          </div>
        )}
      </div>
      )}

      {/* Las cuatro tarjetas que iban acá (total, operativas, escaneos y reseñas
          estimadas) se sacaron en oct 2026: Configuración no repite números de
          otras pantallas. */}

      {/* ── Toolbar ── */}
      <div className="loc-toolbar">
        {/* Search */}
        <div className="loc-search">
          <svg className="loc-search__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            className="loc-search__input"
            type="text"
            placeholder="Buscar por nombre, dirección o ciudad…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Filter tabs */}
        <div className="loc-filters">
          {FILTER_TABS.map(tab => (
            <button
              key={tab.id}
              className={`loc-filter-tab ${filter === tab.id ? 'loc-filter-tab--active' : ''}`}
              onClick={() => setFilter(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Orden: el Select del panel, no el <select> nativo, que abría el menú
            del sistema operativo. */}
        <div className="loc-sort">
          <span className="loc-sort__icon"><Icon name="trend" size={14} /></span>
          <Select
            value={sort}
            onChange={setSort}
            options={SORT_OPTIONS}
            triggerClassName="ls-select-field ls-select-field--block ls-select-field--icon"
          />
        </div>

        {/* El alta también vive acá, no sólo en el encabezado: esta pantalla se
            renderiza embebida dentro de Configuración → Gestión local, y en ese
            modo el encabezado propio no se dibuja. Con el botón sólo arriba, la
            ruta por la que realmente se entra no tenía forma de crear nada. */}
        {canEdit && (
          <button className="loc-toolbar__new" onClick={() => setEditing({ location: null })}>
            <Icon name="plus" size={14} strokeWidth={2.5} />
            Nueva sucursal
          </button>
        )}
      </div>

      {actionError && <p className="loc-action-error" role="alert">{actionError}</p>}

      {/* Una sucursal sin destino de escaneo es el problema más caro de esta
          pantalla y el menos visible: todo se ve bien hasta que alguien apoya el
          celular en el expositor y no pasa nada. Por eso se avisa arriba de la
          lista y no escondido en el detalle. */}
      {missingDestinationCount > 0 && (
        <p className="loc-action-warn">
          {missingDestinationCount === 1
            ? 'A 1 sucursal le falta un link.'
            : `A ${missingDestinationCount} sucursales les falta un link.`}
          {' '}Tienen expositores de Google o de Instagram sin a dónde llevar, o ningún destino cargado —
          {canEdit ? ' abrila y completá el link de reseña o el de Instagram.' : ' pedile al propietario de la cuenta que lo complete.'}
        </p>
      )}

      {/* ── Content ── */}
      <LocationTable locations={displayed} hasAny={locations.length > 0} onSelect={setSelected} onClearFilters={clearFilters} onCreate={canEdit ? () => setEditing({ location: null }) : undefined} />

      {/* ── Modales ──
          Van al <body> con un portal. Embebida en Configuración, esta página
          vive dentro de una tarjeta con backdrop-filter y z-index (la de
          Sucursales, settings-card--raised): eso es un contexto de apilado, y
          un position: fixed adentro no puede quedar por encima de lo que esté
          fuera de la tarjeta — el modal se veía detrás de las Fichas de Google. */}
      {selected && createPortal(
        <LocationModal
          location={selected}
          canEdit={canEdit}
          onClose={() => setSelected(null)}
          onEdit={loc => { if (loc.detail) setEditing({ location: loc.detail }); }}
          onDelete={handleDelete}
        />,
        document.body
      )}

      {/* ── Alta / edición ── */}
      {editing && createPortal(
        <LocationForm
          organizationId={org?.organization_id}
          location={editing.location}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
        />,
        document.body
      )}
    </div>
  );
}
