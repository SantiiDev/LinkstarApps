import { useEffect, useMemo, useState } from 'react';
import PageHeader from '../../components/PageHeader/PageHeader';
import GoogleConnect from '../../components/GoogleConnect/GoogleConnect';
import RetentionNote from '../../components/RetentionNote/RetentionNote';
import { useOrg } from '../../context/OrgContext';
import { periodOptionsFor, clampPeriod } from '../../lib/retention';
import {
  closedMonthOptions,
  fetchGoogleLocations,
  fetchGoogleMetrics,
  fetchSearchKeywords,
  previousMonth,
} from '../../lib/googleApi';
import {
  ConversionBlock,
  PlatformsBlock,
  PlatformsCompareBlock,
  KeywordsBlock,
  MetricsToolbar,
  MetricsKpis,
  MetricsTrends,
  MetricsInsights,
  LocationCompare,
} from './GoogleMetricsBlocks';
import { METRICS, METRICS_RANGES, buildInsights } from './googleMetricsModel';
import { MetricsBusinessCards } from './GoogleMetricsBusinessPreview';
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
 * Business: conversión, plataformas (con la comparación contra el período
 * anterior), búsquedas y lectura de las métricas — cada una detrás de
 * BusinessLock (MetricsBusinessCards), con una maqueta de fondo. Las tarjetas
 * reales y las maquetas se dibujan con los mismos bloques (GoogleMetricsBlocks),
 * con la estructura de la pantalla de Tapstar; la maqueta de GoogleGate
 * (GoogleMetricsMockup) también, así lo que se ve antes de conectar es esta
 * pantalla. La conversión y las sugerencias salen de números que el plan gratis
 * ya ve; las plataformas y las búsquedas, la base no se las manda (0029).
 */

const RANGE_OPTIONS = METRICS_RANGES;

// Cuántos días antes de hoy se asume publicado cuando todavía no hay ningún dato.
const GOOGLE_LAG_DAYS = 4;

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

/* Pide el mes elegido y el anterior juntos: la tabla compara uno con otro. */
function KeywordsCard({ orgId, locationId }) {
  const months = useMemo(() => closedMonthOptions(), []);
  const [month, setMonth] = useState(months[0].value);
  const [data, setData] = useState({ rows: null, prevRows: null });
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setData({ rows: null, prevRows: null });
    setError(null);
    Promise.all([
      fetchSearchKeywords(orgId, month, locationId),
      fetchSearchKeywords(orgId, previousMonth(month), locationId),
    ])
      .then(([rows, prevRows]) => { if (!cancelled) setData({ rows, prevRows }); })
      .catch((err) => {
        console.error('No se pudieron cargar las búsquedas:', err);
        if (!cancelled) setError('No pudimos cargar las búsquedas.');
      });
    return () => { cancelled = true; };
  }, [orgId, month, locationId]);

  return (
    <KeywordsBlock
      key={`${month}-${locationId}`}
      months={months}
      month={month}
      onMonth={setMonth}
      rows={data.rows}
      prevRows={data.prevRows}
      error={error}
    />
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
    { value: 'all', label: 'Todos los locales' },
    ...linked.map((f) => ({ value: f.location_id, label: nameOf(f.location_id) })),
  ];

  const { cur, prev } = view;

  return (
    <div className="gb-page">
      {header}
      {reauthNotice}

      <MetricsToolbar
        locationId={locationId}
        onLocation={setLocationId}
        locationOptions={locationOptions}
        range={activeRange}
        onRange={setRange}
        rangeOptions={periodOptionsFor(RANGE_OPTIONS, retentionDays)}
        note={(view.trimmed
          ? `Período: ${longDate(view.curFrom)} – ${longDate(view.end)}. Google publica con unos días de atraso, y lo anterior al ${longDate(view.curFrom)} queda fuera del historial de tu plan.`
          : `Google publica las métricas con unos días de atraso, así que el período llega hasta el ${longDate(view.end)}.`)
          + (view.hasPrevious ? ` Período anterior: ${longDate(view.prevFrom)} – ${longDate(view.prevTo)}.` : '')}
      />

      {!view.hasPrevious && (
        <RetentionNote days={retentionDays}>No hay período anterior para comparar.</RetentionNote>
      )}

      <MetricsKpis cur={cur} prev={prev} />
      <MetricsTrends series={view.series} labels={view.labels} hasPrevious={view.hasPrevious} />

      <MetricsBusinessCards
        conversion={<ConversionBlock cur={cur} prev={prev} />}
        platforms={(
          <div className="gb-two-col gbm-row">
            <PlatformsBlock cur={cur} />
            <PlatformsCompareBlock cur={cur} prev={prev} />
          </div>
        )}
        keywords={<KeywordsCard orgId={orgId} locationId={locationId === 'all' ? null : locationId} />}
        insights={<MetricsInsights items={buildInsights(cur, prev ?? sumRows([]))} />}
      />

      {locationId === 'all' && view.byLocation.length > 1 && <LocationCompare byLocation={view.byLocation} />}
    </div>
  );
}
