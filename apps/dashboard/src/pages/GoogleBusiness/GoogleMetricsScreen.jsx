import { useEffect, useMemo, useState } from 'react';
import PageHeader from '../../components/PageHeader/PageHeader';
import StatCard from '../../components/StatCard/StatCard';
import TrendChart from '../../components/TrendChart/TrendChart';
import Select from '../../components/Select/Select';
import GoogleConnect from '../../components/GoogleConnect/GoogleConnect';
import BusinessLock from '../../components/BusinessLock/BusinessLock';
import RetentionNote from '../../components/RetentionNote/RetentionNote';
import { useOrg } from '../../context/OrgContext';
import { periodOptionsFor, clampPeriod } from '../../lib/retention';
import { fetchGoogleLocations, fetchGoogleMetrics, fetchSearchKeywords } from '../../lib/googleApi';
import { SPLIT_2 } from '../../lib/chartColors';
import {
  ConversionPreview,
  PlatformsPreview,
  KeywordsPreview,
  InsightsPreview,
} from './GoogleMetricsBusinessPreview';
import './GoogleBusiness.css';
import './GoogleMetrics.css';

/*
 * Métricas de la ficha de Google — la pantalla real (fase 4.6).
 *
 * Lee google_metrics_daily() (0029), nunca la tabla: la RPC es la que corta el
 * desglose por plataforma para el plan gratis. Sólo fichas vinculadas a una
 * sucursal, igual que Reseñas.
 *
 * ── El período ────────────────────────────────────────────────────────────
 * Google publica estas métricas con unos días de atraso, así que «últimos 30
 * días» termina en el último día que Google ya publicó, no hoy: si terminara hoy,
 * los últimos días se verían en cero y parecería una caída. El período anterior
 * es el mismo largo, justo antes. Las dos series se piden en una sola consulta.
 *
 * ── El historial del plan (0034) ──────────────────────────────────────────
 * La RPC no devuelve nada anterior al inicio del historial (30 días en gratis).
 * Por el atraso de Google, «últimos 30 días» en gratis arranca unos días antes
 * de ese inicio: el período se recorta ahí y la nota lo dice, en vez de dibujar
 * esos días en cero. Si el período anterior no entra, no hay comparación: «—»,
 * sin línea punteada y sin porcentaje.
 *
 * ── Gratis y Business ─────────────────────────────────────────────────────
 * Gratis: las cuatro tarjetas, los gráficos y la comparativa de sucursales.
 * Business: conversión, plataformas, búsquedas y lectura de las métricas —
 * cada una detrás de BusinessLock, con una maqueta (GoogleMetricsBusinessPreview)
 * de fondo. La conversión y las sugerencias salen de números que el plan gratis
 * ya ve; las plataformas y las búsquedas, la base no se las manda (0029).
 */

const RANGE_OPTIONS = [
  { value: '7', label: 'Últimos 7 días' },
  { value: '30', label: 'Últimos 30 días' },
  { value: '90', label: 'Últimos 90 días' },
];

// Cuántos días antes de hoy se asume publicado cuando todavía no hay ningún dato.
const GOOGLE_LAG_DAYS = 4;

const NUM = new Intl.NumberFormat('es-AR');
const PCT = new Intl.NumberFormat('es-AR', { style: 'percent', maximumFractionDigits: 1 });

/* ─── Fechas como 'YYYY-MM-DD' (calendario, sin hora) ───────────────────── */
function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function todayIso() {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())).toISOString().slice(0, 10);
}
function shortDate(iso) {
  const [, m, d] = iso.split('-');
  return `${Number(d)}/${Number(m)}`;
}
function longDate(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
function dayRange(from, to) {
  const days = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  return days;
}

/* Variación contra el período anterior, para StatCard. Sin base (anterior en
   cero) no hay porcentaje que dar: «+∞%» no informa nada. */
function trendOf(current, previous) {
  if (!previous) return {};
  const change = (current - previous) / previous;
  if (Math.abs(change) < 0.005) return { trend: '0%', trendDirection: 'up' };
  return {
    trend: `${change > 0 ? '+' : ''}${Math.round(change * 100)}%`,
    trendDirection: change > 0 ? 'up' : 'down',
  };
}

const METRICS = [
  { key: 'impressions', label: 'Impresiones', hint: 'Veces que tu ficha apareció en Google', color: 'navy', icon: 'eye' },
  { key: 'call_clicks', label: 'Clics en Llamar', hint: 'Tocaron el botón de llamar', color: 'forest', icon: 'phone' },
  { key: 'direction_requests', label: 'Clics en «Cómo llegar»', hint: 'Pidieron indicaciones para ir', color: 'orange', icon: 'pin' },
  { key: 'website_clicks', label: 'Clics a la web', hint: 'Entraron a tu sitio desde la ficha', color: 'gold', icon: 'globe' },
];

function Icon({ name }) {
  const p = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };
  const icons = {
    eye: <svg {...p}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>,
    phone: <svg {...p}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" /></svg>,
    pin: <svg {...p}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>,
    globe: <svg {...p}><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>,
    info: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>,
  };
  return icons[name] ?? null;
}

const interactionsOf = (r) => r.call_clicks + r.direction_requests + r.website_clicks;

/* Suma un conjunto de filas en un solo objeto. Las columnas de plataforma
   pueden venir en null (plan gratis): se suman sólo si vienen. */
function sumRows(rows) {
  const t = {
    impressions: 0, call_clicks: 0, direction_requests: 0, website_clicks: 0,
    impressions_desktop_maps: 0, impressions_desktop_search: 0,
    impressions_mobile_maps: 0, impressions_mobile_search: 0,
  };
  for (const r of rows) {
    for (const k of Object.keys(t)) t[k] += Number(r[k] ?? 0);
  }
  t.interactions = t.call_clicks + t.direction_requests + t.website_clicks;
  return t;
}

/* «Qué dicen tus métricas»: reglas simples sobre los números del período. No es
   IA ni pretende serlo: cada frase sale de una comparación que se puede rehacer
   a mano con los números de arriba. */
function buildInsights(cur, prev) {
  const out = [];
  const convCur = cur.impressions ? cur.interactions / cur.impressions : 0;
  const convPrev = prev.impressions ? prev.interactions / prev.impressions : 0;

  if (prev.impressions && cur.impressions >= prev.impressions * 1.1) {
    out.push({
      title: 'Te encuentran más que antes',
      text: `Tu ficha apareció ${NUM.format(cur.impressions)} veces, ${Math.round((cur.impressions / prev.impressions - 1) * 100)}% más que el período anterior. Mantené fotos y horarios al día para aprovecharlo.`,
    });
  } else if (prev.impressions && cur.impressions <= prev.impressions * 0.9) {
    out.push({
      title: 'Te están viendo menos',
      text: 'Las impresiones bajaron frente al período anterior. Publicar novedades y responder reseñas ayuda a que Google te muestre más.',
    });
  }
  if (prev.impressions && convPrev && convCur < convPrev * 0.85) {
    out.push({
      title: 'Te ven, pero te eligen menos',
      text: `De cada 100 personas que ven tu ficha, ${(convCur * 100).toFixed(1).replace('.', ',')} hacen algo (antes ${(convPrev * 100).toFixed(1).replace('.', ',')}). Revisá que el teléfono, la web y el horario estén completos.`,
    });
  }
  if (cur.impressions > 0 && cur.website_clicks === 0) {
    out.push({
      title: 'Nadie entró a tu web desde Google',
      text: 'Si tu ficha no tiene el sitio web cargado, agregalo desde Perfil: es uno de los tres botones que más se tocan.',
    });
  }
  const mobile = cur.impressions_mobile_maps + cur.impressions_mobile_search;
  if (cur.impressions > 0 && mobile / cur.impressions >= 0.7) {
    out.push({
      title: 'Te buscan desde el celular',
      text: `${PCT.format(mobile / cur.impressions)} de las veces que apareciste fue en un celular: el botón de llamar y «Cómo llegar» son los que más pesan ahí.`,
    });
  }
  if (!out.length) {
    out.push({
      title: 'Todo estable',
      text: 'No vemos cambios fuertes respecto del período anterior. Seguí respondiendo reseñas y publicando novedades.',
    });
  }
  return out.slice(0, 4);
}

function SplitBar({ title, hint, parts }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  return (
    <div className="gbm-split">
      <div className="gbm-split__head">
        <span className="gbm-split__title">{title}</span>
        <span className="gbm-split__hint">{hint}</span>
      </div>
      <div className="gb-split__bar" role="img" aria-label={parts.map((p) => `${p.label} ${total ? PCT.format(p.value / total) : '0%'}`).join(', ')}>
        {parts.map((p) => (
          <div
            key={p.label}
            className="gb-split__seg"
            style={{ width: `calc(${total ? (p.value / total) * 100 : 50}% - 1px)`, background: p.color }}
          />
        ))}
      </div>
      <ul className="gb-split__legend">
        {parts.map((p) => (
          <li key={p.label} className="gb-split__legend-item">
            <span className="gb-split__dot" style={{ background: p.color }} />
            <span className="gb-split__label">{p.label}</span>
            <span className="gb-split__pct">
              {NUM.format(p.value)} · {total ? PCT.format(p.value / total) : '—'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const KEYWORDS_PAGE = 10;

/* Últimos 3 meses cerrados, del más nuevo al más viejo: el mes en curso Google
   todavía no lo publica. */
function closedMonthOptions() {
  const now = new Date();
  const out = [];
  for (let i = 1; i <= 3; i++) {
    const d = new Date(Date.UTC(now.getFullYear(), now.getMonth() - i, 1));
    out.push({
      value: d.toISOString().slice(0, 10),
      label: d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
    });
  }
  return out;
}

function KeywordsCard({ orgId, locationId }) {
  const months = useMemo(closedMonthOptions, []);
  const [month, setMonth] = useState(months[0].value);
  const [rows, setRows] = useState(null);
  const [page, setPage] = useState(0);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    setPage(0);
    setError(null);
    fetchSearchKeywords(orgId, month, locationId)
      .then((data) => { if (!cancelled) setRows(data); })
      .catch((err) => {
        console.error('No se pudieron cargar las búsquedas:', err);
        if (!cancelled) setError('No pudimos cargar las búsquedas.');
      });
    return () => { cancelled = true; };
  }, [orgId, month, locationId]);

  const max = Math.max(1, ...(rows ?? []).map((r) => r.impressions ?? r.threshold ?? 0));
  const pageRows = (rows ?? []).slice(page * KEYWORDS_PAGE, (page + 1) * KEYWORDS_PAGE);
  const pages = Math.ceil((rows?.length ?? 0) / KEYWORDS_PAGE);

  return (
    <div className="gb-card">
      <div className="gb-card__header gbm-card__header--wrap">
        <div>
          <h3 className="gb-card__title">Búsquedas que mostraron tu perfil</h3>
          <span className="gb-card__subtitle">Lo que escribió la gente en Google cuando te encontró</span>
        </div>
        <Select value={month} onChange={setMonth} options={months} />
      </div>

      {error && <p className="gbm-error">{error}</p>}
      {!error && rows === null && <p className="gbm-muted">Cargando…</p>}
      {!error && rows?.length === 0 && (
        <p className="gbm-muted">Google todavía no publicó búsquedas para este mes, o fueron muy pocas para mostrarlas.</p>
      )}

      {pageRows.length > 0 && (
        <div className="gb-keywords">
          {pageRows.map((r) => {
            const value = r.impressions ?? r.threshold ?? 0;
            return (
              <div key={r.keyword} className="gb-keyword-row">
                <span className="gb-keyword-row__term" title={r.keyword}>{r.keyword}</span>
                <div className="gb-keyword-row__bar">
                  <div className="gb-keyword-row__fill" style={{ width: `max(3px, ${(value / max) * 100}%)` }} />
                </div>
                <span className="gb-keyword-row__volume">
                  {r.impressions != null ? NUM.format(r.impressions) : `< ${NUM.format(r.threshold)}`}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {pages > 1 && (
        <div className="gbm-pager">
          <button type="button" onClick={() => setPage((p) => p - 1)} disabled={page === 0}>Anterior</button>
          <span>Página {page + 1} de {pages}</span>
          <button type="button" onClick={() => setPage((p) => p + 1)} disabled={page + 1 >= pages}>Siguiente</button>
        </div>
      )}
      <p className="gbm-footnote">
        Google no da el número exacto de las búsquedas chicas: las muestra como «&lt; 15».
      </p>
    </div>
  );
}

export default function GoogleMetricsScreen({ google, onNavigateSettings }) {
  const { org, retentionDays } = useOrg();
  const orgId = org?.organization_id;

  const [fichas, setFichas] = useState(null);
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [range, setRange] = useState('30');
  const [locationId, setLocationId] = useState('all');

  const activeRange = clampPeriod(range, RANGE_OPTIONS, retentionDays);
  const days = Number(activeRange);
  const historyStart = retentionDays ? addDays(todayIso(), -retentionDays) : null;
  // Se pide de más: el doble del rango (período anterior) más el atraso de
  // Google y un margen, y después se recorta según el último día publicado.
  const fetchFrom = addDays(todayIso(), -(2 * days + GOOGLE_LAG_DAYS + 10));
  const fetchTo = addDays(todayIso(), -1);

  useEffect(() => {
    if (!orgId) return undefined;
    let cancelled = false;
    setError(null);
    setRows(null);
    Promise.all([fetchGoogleLocations(orgId), fetchGoogleMetrics(orgId, fetchFrom, fetchTo)])
      .then(([locations, metrics]) => {
        if (cancelled) return;
        setFichas(locations);
        setRows(metrics);
      })
      .catch((err) => {
        console.error('No se pudieron cargar las métricas:', err);
        if (!cancelled) setError('No pudimos cargar las métricas. Probá recargar la página.');
      });
    return () => { cancelled = true; };
  }, [orgId, fetchFrom, fetchTo]);

  const linked = useMemo(() => (fichas ?? []).filter((f) => f.location_id), [fichas]);
  const nameOf = (locId) => {
    const f = linked.find((x) => x.location_id === locId);
    return f?.locations?.name ?? f?.title ?? 'Sucursal';
  };

  const view = useMemo(() => {
    if (!rows) return null;
    const names = new Map(linked.map((f) => [f.location_id, f.locations?.name ?? f.title ?? 'Sucursal']));
    const filtered = locationId === 'all' ? rows : rows.filter((r) => r.location_id === locationId);
    const lastPublished = rows.reduce((max, r) => (r.day > max ? r.day : max), '');
    const end = lastPublished || addDays(todayIso(), -GOOGLE_LAG_DAYS);
    const fullFrom = addDays(end, -(days - 1));
    // Lo anterior al historial del plan no llega: el período arranca ahí.
    const curFrom = historyStart && historyStart > fullFrom ? historyStart : fullFrom;
    const prevTo = addDays(fullFrom, -1);
    const prevFrom = addDays(prevTo, -(days - 1));
    const hasPrevious = !historyStart || prevFrom >= historyStart;

    const cur = filtered.filter((r) => r.day >= curFrom && r.day <= end);
    const prev = filtered.filter((r) => r.day >= prevFrom && r.day <= prevTo);

    const curDays = dayRange(curFrom, end);
    const prevDays = dayRange(prevFrom, prevTo);
    const seriesOf = (subset, dayList, key) => {
      const byDay = new Map();
      for (const r of subset) {
        const v = key === 'interactions' ? interactionsOf(r) : Number(r[key] ?? 0);
        byDay.set(r.day, (byDay.get(r.day) ?? 0) + v);
      }
      return dayList.map((d) => byDay.get(d) ?? 0);
    };

    const byLocation = linked
      .filter((f) => locationId === 'all' || f.location_id === locationId)
      .map((f) => {
        const c = sumRows(cur.filter((r) => r.location_id === f.location_id));
        const p = hasPrevious ? sumRows(prev.filter((r) => r.location_id === f.location_id)) : null;
        return { locationId: f.location_id, name: names.get(f.location_id), cur: c, prev: p };
      })
      .sort((a, b) => b.cur.impressions - a.cur.impressions)
      .slice(0, 4);

    // Sin período anterior, `prev` es null y cada consumidor muestra «—»: un
    // objeto en cero se leería como «el mes pasado no hubo nada».
    return {
      hasData: Boolean(lastPublished),
      end, curFrom, prevFrom, prevTo,
      trimmed: curFrom !== fullFrom,
      hasPrevious,
      labels: curDays.map(shortDate),
      series: Object.fromEntries(METRICS.map((m) => [m.key, {
        cur: seriesOf(cur, curDays, m.key),
        prev: hasPrevious ? seriesOf(prev, prevDays, m.key) : undefined,
      }])),
      cur: sumRows(cur),
      prev: hasPrevious ? sumRows(prev) : null,
      byLocation,
    };
  }, [rows, linked, locationId, days, historyStart]);

  const header = (
    <PageHeader
      eyebrow="Google Business"
      title="Métricas del perfil"
      subtitle="Cómo te encuentran y qué hacen los clientes en tu ficha de Google"
    />
  );

  const reauthNotice = google.connection?.status === 'needs_reauth' && (
    <div className="gbm-notice">
      <p>Google cortó el acceso a tu ficha. Las métricas de abajo son las que teníamos guardadas; para seguir actualizándolas, volvé a conectarla.</p>
      <GoogleConnect google={google} align="start" />
    </div>
  );

  if (error) {
    return (
      <div className="gb-page">
        {header}
        <p className="gbm-error" role="alert">{error}</p>
      </div>
    );
  }

  if (!view) {
    return (
      <div className="gb-page">
        {header}
        <p className="gbm-muted">Cargando métricas…</p>
      </div>
    );
  }

  if (!linked.length) {
    return (
      <div className="gb-page">
        {header}
        {reauthNotice}
        <div className="gb-card gbm-empty">
          <p className="gbm-empty__title">Todavía no vinculaste ninguna ficha a una sucursal</p>
          <p>Las métricas se leen sólo de las fichas vinculadas. Elegí cuál de tus fichas corresponde a cada sucursal.</p>
          {onNavigateSettings && (
            <button type="button" className="gb-btn-primary" onClick={() => onNavigateSettings('local')}>
              Vincular en Gestión local
            </button>
          )}
        </div>
      </div>
    );
  }

  const firstReadPending = linked.some((f) => !f.metrics_synced_at);
  if (!view.hasData) {
    return (
      <div className="gb-page">
        {header}
        {reauthNotice}
        <div className="gb-card gbm-empty">
          <p className="gbm-empty__title">
            {firstReadPending ? 'Estamos leyendo tus métricas' : 'Google todavía no publicó métricas para tus fichas'}
          </p>
          <p>
            {firstReadPending
              ? 'La primera lectura de una ficha recién vinculada tarda un minuto. Recargá en un rato.'
              : 'Google publica estas métricas con unos días de atraso. Si tu ficha es nueva, puede tardar una semana en aparecer algo.'}
          </p>
        </div>
      </div>
    );
  }

  const locationOptions = [
    { value: 'all', label: 'Todas las sucursales' },
    ...linked.map((f) => ({ value: f.location_id, label: nameOf(f.location_id) })),
  ];

  const { cur, prev } = view;
  const convCur = cur.impressions ? cur.interactions / cur.impressions : 0;
  const convPrev = prev?.impressions ? prev.interactions / prev.impressions : 0;

  return (
    <div className="gb-page">
      {header}
      {reauthNotice}

      <div className="gb-card gbm-toolbar">
        <div className="gbm-toolbar__filters">
          {linked.length > 1 && (
            <label className="gbm-field">
              <span>Sucursal</span>
              <Select value={locationId} onChange={setLocationId} options={locationOptions} />
            </label>
          )}
          <label className="gbm-field">
            <span>Rango de fechas</span>
            <Select value={activeRange} onChange={setRange} options={periodOptionsFor(RANGE_OPTIONS, retentionDays)} />
          </label>
        </div>
        <p className="gbm-note">
          <Icon name="info" />
          {view.trimmed
            ? `Período: ${longDate(view.curFrom)} – ${longDate(view.end)}. Google publica con unos días de atraso, y lo anterior al ${longDate(view.curFrom)} queda fuera del historial de tu plan.`
            : `Google publica las métricas con unos días de atraso, así que el período llega hasta el ${longDate(view.end)}.`}
          {view.hasPrevious && ` Período anterior: ${longDate(view.prevFrom)} – ${longDate(view.prevTo)}.`}
        </p>
      </div>

      {!view.hasPrevious && (
        <RetentionNote days={retentionDays}>No hay período anterior para comparar.</RetentionNote>
      )}

      <div className="gb-stat-grid">
        {METRICS.map((m) => (
          <StatCard
            key={m.key}
            icon={<Icon name={m.icon} />}
            value={NUM.format(cur[m.key])}
            label={`${m.label} · antes ${prev ? NUM.format(prev[m.key]) : '—'}`}
            color={m.color}
            {...trendOf(cur[m.key], prev?.[m.key])}
          />
        ))}
      </div>

      <div className="gb-card gbm-trends">
        <div className="gb-card__header">
          <div>
            <h3 className="gb-card__title">Tendencia de interacciones</h3>
            <span className="gb-card__subtitle">
              {view.hasPrevious ? 'Línea llena: este período · punteada: el anterior' : 'Este período'}
            </span>
          </div>
        </div>
        <div className="gbm-trends__grid">
          {METRICS.map((m) => (
            <div key={m.key} className="gbm-trend">
              <span className="gbm-trend__title">{m.label}</span>
              <TrendChart
                data={view.series[m.key].cur}
                compareData={view.series[m.key].prev}
                labels={view.labels}
                color={m.color}
                seriesName="Este período"
                compareName="Período anterior"
              />
            </div>
          ))}
        </div>
      </div>

      <BusinessLock
        title="Descubrí cuánta gente hace algo después de ver tu ficha"
        description="La tasa de conversión: de cada 100 que te ven, cuántos llaman, piden cómo llegar o entran a tu web."
        preview={<ConversionPreview />}
      >
        <div className="gb-card gbm-section">
          <div className="gb-card__header">
            <div>
              <h3 className="gb-card__title">Tasa de conversión</h3>
              <span className="gb-card__subtitle">Qué porcentaje de quienes ven tu ficha hace algo</span>
            </div>
          </div>
          <div className="gbm-conv">
            <div className="gbm-conv__main">
              <span className="gbm-conv__value">{PCT.format(convCur)}</span>
              <span className="gbm-conv__label">{NUM.format(cur.interactions)} interacciones de {NUM.format(cur.impressions)} impresiones</span>
              <span className="gbm-conv__prev">Período anterior: {prev ? PCT.format(convPrev) : '—'}</span>
            </div>
            {METRICS.slice(1).map((m) => (
              <div key={m.key} className="gbm-conv__item">
                <span className="gbm-conv__item-value">{cur.impressions ? PCT.format(cur[m.key] / cur.impressions) : '—'}</span>
                <span className="gbm-conv__item-label">{m.label}</span>
              </div>
            ))}
          </div>
        </div>
      </BusinessLock>

      <div className="gb-two-col gbm-section">
        <BusinessLock
          title="Dónde te buscan tus clientes"
          description="Si te encuentran en el buscador de Google o en Google Maps, y desde qué dispositivo."
          preview={<PlatformsPreview />}
        >
          <div className="gb-card">
            <div className="gb-card__header">
              <div>
                <h3 className="gb-card__title">Dónde te ven</h3>
                <span className="gb-card__subtitle">Impresiones de este período, por plataforma</span>
              </div>
            </div>
            <SplitBar
              title="Búsqueda o Maps"
              hint="En qué parte de Google apareciste"
              parts={[
                { label: 'Búsqueda de Google', value: cur.impressions_desktop_search + cur.impressions_mobile_search, color: SPLIT_2[0] },
                { label: 'Google Maps', value: cur.impressions_desktop_maps + cur.impressions_mobile_maps, color: SPLIT_2[1] },
              ]}
            />
            <SplitBar
              title="Celular o computadora"
              hint="Desde qué dispositivo te vieron"
              parts={[
                { label: 'Celular', value: cur.impressions_mobile_search + cur.impressions_mobile_maps, color: SPLIT_2[0] },
                { label: 'Computadora', value: cur.impressions_desktop_search + cur.impressions_desktop_maps, color: SPLIT_2[1] },
              ]}
            />
          </div>
        </BusinessLock>

        <BusinessLock
          title="Qué tenés que hacer para que te busquen más"
          description="Una lectura de tus métricas en limpio, con lo que conviene revisar."
          preview={<InsightsPreview />}
        >
          <div className="gb-card">
            <div className="gb-card__header">
              <div>
                <h3 className="gb-card__title">Qué dicen tus métricas</h3>
                <span className="gb-card__subtitle">Sugerencias a partir de los números de arriba</span>
              </div>
            </div>
            <ul className="gbm-insights">
              {buildInsights(cur, prev ?? sumRows([])).map((i) => (
                <li key={i.title}>
                  <strong>{i.title}</strong>
                  <span>{i.text}</span>
                </li>
              ))}
            </ul>
          </div>
        </BusinessLock>
      </div>

      <div className="gbm-section">
        <BusinessLock
          title="Descubrí qué busca la gente cuando te encuentra"
          description="Las palabras exactas con las que te encuentran en Google, mes a mes."
          preview={<KeywordsPreview />}
        >
          <KeywordsCard orgId={orgId} locationId={locationId === 'all' ? null : locationId} />
        </BusinessLock>
      </div>

      {locationId === 'all' && view.byLocation.length > 1 && (
        <div className="gb-card gbm-section">
          <div className="gb-card__header">
            <div>
              <h3 className="gb-card__title">Comparativa de sucursales</h3>
              <span className="gb-card__subtitle">Las {view.byLocation.length} con más impresiones del período</span>
            </div>
          </div>
          <div className="gbm-compare">
            {view.byLocation.map((l) => {
              const conv = l.cur.impressions ? l.cur.interactions / l.cur.impressions : 0;
              const convP = l.prev?.impressions ? l.prev.interactions / l.prev.impressions : 0;
              const rowsOf = [
                ['Impresiones', NUM.format(l.cur.impressions), trendOf(l.cur.impressions, l.prev?.impressions)],
                ['Interacciones', NUM.format(l.cur.interactions), trendOf(l.cur.interactions, l.prev?.interactions)],
                ['Conversión', PCT.format(conv), trendOf(conv, convP)],
              ];
              return (
                <div key={l.locationId} className="gbm-compare__item">
                  <span className="gbm-compare__name">{l.name}</span>
                  {rowsOf.map(([label, value, t]) => (
                    <div key={label} className="gbm-compare__row">
                      <span>{label}</span>
                      <strong>{value}</strong>
                      <em className={t.trendDirection === 'down' ? 'gbm-down' : 'gbm-up'}>{t.trend ?? '—'}</em>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
