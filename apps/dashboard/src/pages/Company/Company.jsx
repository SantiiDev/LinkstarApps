import { useEffect, useState } from 'react';
import { useOrg } from '../../context/OrgContext';
import PageHeader from '../../components/PageHeader/PageHeader';
import StatCard from '../../components/StatCard/StatCard';
import TrendChart from '../../components/TrendChart/TrendChart';
import SectionPlaceholder from '../../components/SectionPlaceholder/SectionPlaceholder';
import {
  fetchDashboardKpis,
  fetchRecentActivity,
  fetchScansDaily,
  fetchLocationPerformance,
  formatRelativeTime,
  lastNDayLabels,
  ESTIMATED_LABEL,
} from '../../lib/dashboardApi';
import './Company.css';

/*
 * Mi Empresa — la pantalla post-login.
 *
 * Hasta la fase 2 del roadmap esto era 100% inventado: reseñas totales, rating
 * promedio, tasa de respuesta, satisfacción, distribución por estrellas y un
 * feed de reseñas con nombres y textos escritos a mano. Nada de eso tiene tabla
 * detrás — no existe una tabla de reseñas individuales en ningún lado (eso es
 * la fase 4.4), y los agregados de reseñas dependen de location_review_snapshots,
 * que hoy no llena nadie porque falta la integración sync-reviews.
 *
 * Reconstruida sobre lo único que sí medimos: escaneos. Todo lo que hay acá
 * sale de las vistas del 0008/0018 y nada se fabrica.
 *
 * Sobre las reseñas: NO se muestra 0. Un 0 no se distingue de "medimos y no
 * hubo ninguna", y la verdad es que todavía no medimos. Mientras no haya
 * snapshots de Google, esos KPIs van en "—" con la explicación al lado. En
 * cuanto sync-reviews escriba el primer snapshot, hasReviewData pasa a true y
 * los números aparecen solos: no hay que volver a tocar esta pantalla.
 */

const TREND_DAYS = 30;
const ACTIVITY_LIMIT = 8;

/* ─── Icons ────────────────────────────────────────────────── */
function Icon({ name, ...rest }) {
  const props = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', ...rest };
  const icons = {
    scan: (
      <svg {...props}>
        <path d="M6 8.32a7.43 7.43 0 0 1 0 7.36" /><path d="M9.46 6.21a11.76 11.76 0 0 1 0 11.58" />
        <path d="M12.91 4.1a16.1 16.1 0 0 1 0 15.8" /><path d="M16.37 2a20.16 20.16 0 0 1 0 20" />
      </svg>
    ),
    device: (
      <svg {...props}>
        <rect x="4" y="4" width="16" height="16" rx="2" /><rect x="9" y="9" width="6" height="6" rx="1" />
        <path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3" />
      </svg>
    ),
    star: (
      <svg {...props}>
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    ),
    target: (
      <svg {...props}>
        <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" />
      </svg>
    ),
    award: (
      <svg {...props}>
        <circle cx="12" cy="8" r="6" /><path d="M15.5 13.5 17 22l-5-3-5 3 1.5-8.5" />
      </svg>
    ),
    google: (
      <svg {...props} viewBox="0 0 48 48" fill="none">
        <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.6 32.9 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z" />
        <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 16.3 4 9.6 8.3 6.3 14.7z" />
        <path fill="#4CAF50" d="M24 44c5.5 0 10.4-1.9 14.3-5.1l-6.6-5.6C29.6 34.9 26.9 36 24 36c-5.2 0-9.6-3.1-11.3-7.5l-6.6 5.1C9.5 39.6 16.2 44 24 44z" />
        <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.3 5.7l6.6 5.6C39.9 37.1 44 31 44 24c0-1.3-.1-2.7-.4-3.5z" />
      </svg>
    ),
    arrowRight: (
      <svg {...props} width={14} height={14}>
        <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
      </svg>
    ),
    seo: (
      <svg {...props}>
        <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><path d="M11 8v3l2 2" />
      </svg>
    ),
    posts: (
      <svg {...props}>
        <rect x="3" y="4" width="18" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="18" x2="12" y2="21" />
      </svg>
    ),
    report: (
      <svg {...props}>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    ),
  };
  return icons[name] || null;
}

/* ─── Quick links to other sections ──────────────────────────── */
const QUICK_LINKS = [
  { id: 'devices', label: 'Dispositivos', text: 'Tus expositores y sus escaneos', icon: 'device', color: 'orange' },
  { id: 'settings', label: 'Gestión local', text: 'Sucursales, equipo y facturación', icon: 'seo', color: 'forest' },
  { id: 'gb-metrics', label: 'Métricas de Google', text: 'Visitas, llamadas y clics a tu ficha', icon: 'award', color: 'navy' },
  { id: 'monthly-reports', label: 'Informes mensuales', text: 'Descargá el resumen del mes', icon: 'report', color: 'gold' },
];

/* Formatea el porcentaje de variación que va en la esquina de cada StatCard.
   `null` cuando no hay período anterior con el que comparar — una organización
   de tres semanas no tiene "mes pasado", y un +100% inventado ahí sería el
   mismo problema que veníamos sacando de esta pantalla. */
function trendOf(pct) {
  if (pct === null || pct === undefined) return null;
  const rounded = Math.round(pct);
  return {
    trend: `${rounded > 0 ? '+' : ''}${rounded}% vs mes anterior`,
    trendDirection: rounded >= 0 ? 'up' : 'down',
  };
}

const KIND_LABELS = {
  google_review: 'Google Maps',
  instagram: 'Instagram',
  custom: 'Destino propio',
};

/* v_scans_daily no rellena los días sin escaneos ni acota el rango: eso es
   trabajo del cliente, igual que en Dispositivos. */
function buildSeries(rows, days) {
  const byDay = new Map(rows.map(r => [r.day, r.human_scans]));
  const today = new Date();
  const totals = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    totals.push(byDay.get(date.toISOString().slice(0, 10)) ?? 0);
  }
  return totals;
}

export default function Company({ onNavigate }) {
  const { org } = useOrg();

  const [kpis, setKpis] = useState(null);
  const [activity, setActivity] = useState([]);
  const [series, setSeries] = useState([]);
  const [hasReviewData, setHasReviewData] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [kpiRow, activityRows, dailyRows, locationRows] = await Promise.all([
          fetchDashboardKpis(),
          fetchRecentActivity(ACTIVITY_LIMIT),
          fetchScansDaily(TREND_DAYS),
          fetchLocationPerformance(),
        ]);
        if (cancelled) return;
        setKpis(kpiRow);
        setActivity(activityRows);
        setSeries(buildSeries(dailyRows, TREND_DAYS));
        // Hay dato de reseñas cuando existe al menos un snapshot de Google.
        // total_reviews sale de location_review_snapshots vía la vista: si es
        // null en todas las sucursales, nadie escribió nunca un snapshot.
        setHasReviewData(locationRows.some(l => l.total_reviews !== null && l.total_reviews !== undefined));
      } catch (err) {
        // A diferencia de Dispositivos y Ubicaciones, acá NO se cae a un mock:
        // esta pantalla se está reconstruyendo justamente para dejar de mostrar
        // datos inventados, así que un fallo se dice.
        console.error('No se pudo cargar el resumen de la empresa:', err);
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const today = new Date();
  const formattedDate = today.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });

  const scans = kpis?.human_scans ?? 0;
  const scansTrend = trendOf(kpis?.human_scans_change_pct);
  const reviewsTrend = trendOf(kpis?.reviews_change_pct);
  const hasAnyScan = scans > 0;

  const header = (
    <PageHeader
      eyebrow="Panel general"
      title="Mi Empresa"
      subtitle="Resumen de la actividad de tus expositores en los últimos 30 días"
      actions={
        <button className="company-btn company-btn--ghost">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          {formattedDate}
        </button>
      }
    />
  );

  if (loading) {
    return <div className="app-loading">Cargando…</div>;
  }

  if (failed) {
    return (
      <div className="company-page">
        {header}
        <SectionPlaceholder
          variant="soon"
          title="No pudimos cargar tu resumen"
          description="Hubo un problema al consultar tus datos. Probá recargar la página; si sigue pasando, escribinos y lo miramos."
        />
      </div>
    );
  }

  return (
    <div className="company-page">
      {header}

      {/* ── Conectar Google: sigue siendo una invitación, nunca bloquea la vista ── */}
      <div className="company-banner">
        <div className="company-banner__icon"><Icon name="google" width={26} height={26} /></div>
        <div className="company-banner__body">
          <div className="company-banner__title">Gestioná todo tu perfil de Google Business</div>
          <p className="company-banner__text">
            Conectá tu ficha para ver cuántas reseñas nuevas generan tus expositores, responderlas desde acá y medir tu posicionamiento local.
          </p>
        </div>
        <div className="company-banner__actions">
          <button className="company-banner__connect-btn">
            <Icon name="google" width={16} height={16} />
            Conectar mi ficha de Google
          </button>
        </div>
      </div>

      {/* ── Chips de estado. Sólo lo que sabemos de verdad: antes decía "Perfil
             de Google Business conectado" y "Ficha completada al 92%" sin que
             existiera ninguna conexión ni nada que midiera completitud. ── */}
      <div className="company-chips">
        <div className="company-chip">
          <Icon name="award" width={14} height={14} /> Plan actual: <strong>{org?.plan_name ?? '—'}</strong>
        </div>
        <div className="company-chip">
          <Icon name="device" width={14} height={14} />
          <strong>{kpis?.active_devices ?? 0}</strong> de <strong>{kpis?.total_devices ?? 0}</strong> expositores activos
        </div>
        <div className="company-chip">
          <Icon name="google" width={14} height={14} /> Ficha de Google: <strong>sin conectar</strong>
        </div>
      </div>

      {/* ── KPIs ── */}
      <div className="company-stat-grid">
        <StatCard
          icon={<Icon name="scan" />}
          value={scans.toLocaleString()}
          label="Escaneos (últimos 30 días)"
          color="orange"
          delay={0}
          {...(scansTrend ?? {})}
        />
        <StatCard
          icon={<Icon name="device" />}
          value={`${kpis?.active_devices ?? 0}`}
          label="Expositores activos"
          color="navy"
          delay={0.05}
        />
        <StatCard
          icon={<Icon name="star" />}
          value={hasReviewData ? (kpis?.estimated_reviews ?? 0).toLocaleString() : '—'}
          label={`Reseñas nuevas (${ESTIMATED_LABEL})`}
          color="gold"
          delay={0.1}
          {...(hasReviewData ? (reviewsTrend ?? {}) : {})}
        />
        <StatCard
          icon={<Icon name="target" />}
          value={hasReviewData && kpis?.conversion_rate !== null ? `${kpis.conversion_rate}%` : '—'}
          label="Conversión a reseña"
          color="forest"
          delay={0.15}
        />
      </div>

      {!hasReviewData && (
        <p className="company-hint">
          Las <strong>reseñas</strong> y la <strong>conversión</strong> quedan en <code>—</code> hasta que
          conectes tu ficha de Google. Google no avisa cuando entra una reseña nueva: se calculan comparando
          el total de tu ficha día a día, y para eso necesitamos leerla. No es que no tengas reseñas — es que
          todavía no las estamos midiendo.
        </p>
      )}

      {/* ── Actividad ── */}
      <div className="company-two-col">
        <div className="company-card chart-card">
          <div className="company-card__header">
            <div>
              <h3 className="company-card__title">Escaneos por día</h3>
              <span className="company-card__subtitle">Últimos {TREND_DAYS} días · sólo toques humanos</span>
            </div>
          </div>
          {!hasAnyScan && (
            <p className="company-hint company-hint--tight">
              Todavía no registramos escaneos. Van a aparecer acá en cuanto alguien toque o escanee un
              expositor.
            </p>
          )}
          <TrendChart
            data={series}
            labels={lastNDayLabels(TREND_DAYS)}
            color="orange"
            seriesName="Escaneos"
            xLabel="Día"
            yLabel="Escaneos"
          />
        </div>

        <div className="company-side-col">
          <div className="company-card">
            <div className="company-card__header">
              <div>
                <h3 className="company-card__title">Actividad reciente</h3>
                <span className="company-card__subtitle">Últimos 7 días</span>
              </div>
              <button className="company-card__link" onClick={() => onNavigate?.('devices')}>Ver dispositivos</button>
            </div>

            {activity.length === 0 ? (
              <p className="company-hint company-hint--tight">
                Sin actividad en los últimos 7 días.
              </p>
            ) : (
              <ul className="company-activity">
                {activity.map((event, i) => (
                  <li key={`${event.occurred_at}-${i}`} className="company-activity__item">
                    <span className="company-activity__dot" />
                    <div className="company-activity__body">
                      <span className="company-activity__label">
                        {event.device_label || 'Expositor'}
                      </span>
                      <span className="company-activity__meta">
                        {KIND_LABELS[event.kind] ?? event.kind} · {formatRelativeTime(event.occurred_at)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* ── Bloques que dependen de Google ── */}
      <SectionPlaceholder
        variant="google"
        title="Tus reseñas de Google, acá adentro"
        description="Conectá tu ficha y esta pantalla pasa a mostrar lo que están diciendo tus clientes, no sólo cuántos tocaron el expositor."
        preview={[
          'Cada reseña con su autor, estrellas y texto.',
          'Cuáles quedaron sin responder, y responderlas desde el panel.',
          'Cuántas reseñas nuevas generó cada sucursal y cada expositor.',
          'Tu rating promedio y cómo se mueve mes a mes.',
        ]}
        note="Es el mismo permiso que usa la app de Google Business Profile. Podés desconectarla cuando quieras."
      />

      {/* ── Explorá más ── */}
      <div className="company-card">
        <div className="company-card__header">
          <div>
            <h3 className="company-card__title">Explorá más</h3>
            <span className="company-card__subtitle">Otras secciones de tu panel</span>
          </div>
        </div>
        <div className="quick-links">
          {QUICK_LINKS.map((link) => (
            <button key={link.id} className="quick-link" onClick={() => onNavigate?.(link.id)}>
              <div className={`quick-link__icon quick-link__icon--${link.color}`}>
                <Icon name={link.icon} width={18} height={18} />
              </div>
              <div className="quick-link__body">
                <div className="quick-link__label">{link.label}</div>
                <div className="quick-link__text">{link.text}</div>
              </div>
              <Icon name="arrowRight" className="quick-link__arrow" />
            </button>
          ))}
        </div>
      </div>

      <div className="dashboard__footer">
        <p className="dashboard__footer-text">
          © 2026 <span className="dashboard__footer-brand">linkstar<span className="dashboard__footer-dot">.</span></span> — Panel de gestión de reseñas
        </p>
      </div>
    </div>
  );
}
