import { useMemo, useState } from 'react';
import Select from '../../components/Select/Select';
import PieChart from '../../components/PieChart/PieChart';
import Icon from '../../components/Icon/Icon';
import { KpiTrend } from '../../components/KpiCard/KpiCard';
import { PLATFORM_4 } from '../../lib/chartColors';
import { percentTrend, pointsTrend } from '../../lib/companyOverview';

/*
 * Las tarjetas Business de Métricas, sólo presentación: reciben los totales ya
 * sumados (`cur`, `prev` con la forma de sumRows() de GoogleMetricsScreen) y los
 * dibujan. Las usan la pantalla real y la maqueta de BusinessLock
 * (GoogleMetricsBusinessPreview), así las dos se ven idénticas y un cambio de
 * diseño se hace una sola vez — el mismo patrón que CompanyBlocks.
 *
 * Ningún bloque inventa un valor: sin período anterior dicen «—» o explican qué
 * falta. Los números inventados viven sólo en la maqueta.
 */

const NUM = new Intl.NumberFormat('es-AR');
const PCT = new Intl.NumberFormat('es-AR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });

const rateOf = (part, total) => (total ? part / total : null);
const formatRate = (rate) => (rate == null ? '—' : PCT.format(rate));

/* Variación de una tasa, en puntos porcentuales: «de 13,0% a 12,1%» es −0,9 pp,
   no «−7%», que se lee como si se hubiera perdido el 7% de los clientes. */
function rateTrend(rate, prevRate) {
  if (rate == null || prevRate == null) return null;
  return pointsTrend(rate * 100, prevRate * 100, { unit: ' pp' });
}

function CardHeader({ title, subtitle, children }) {
  return (
    <div className="gb-card__header gbm-card__header--wrap">
      <div>
        <h3 className="gb-card__title">{title}</h3>
        <span className="gb-card__subtitle">{subtitle}</span>
      </div>
      {children}
    </div>
  );
}

/* ─── Tasa de conversión ─────────────────────────────────────────────────── */

const CHANNELS = [
  { key: 'direction_requests', label: 'Cómo llegar', icon: 'pin', color: 'orange' },
  { key: 'website_clicks', label: 'Clics a la web', icon: 'globe', color: 'gold' },
  { key: 'call_clicks', label: 'Llamadas', icon: 'phone', color: 'forest' },
];

const GAUGE_R = 52;
const GAUGE_C = 2 * Math.PI * GAUGE_R;

export function ConversionBlock({ cur, prev }) {
  const rate = rateOf(cur.interactions, cur.impressions);
  const prevRate = prev ? rateOf(prev.interactions, prev.impressions) : null;
  const filled = Math.min(rate ?? 0, 1) * GAUGE_C;

  return (
    <div className="gb-card">
      <CardHeader title="Tasa de conversión" subtitle="Qué porcentaje de quienes ven tu ficha hace algo" />
      <div className="gbm-conv">
        <div className="gbm-conv__main">
          <div className="gbm-gauge">
            <svg viewBox="0 0 120 120" className="gbm-gauge__svg" aria-hidden="true">
              <circle cx="60" cy="60" r={GAUGE_R} className="gbm-gauge__track" />
              <circle
                cx="60" cy="60" r={GAUGE_R}
                className="gbm-gauge__fill"
                strokeDasharray={`${filled} ${GAUGE_C}`}
                transform="rotate(-90 60 60)"
              />
            </svg>
            <div className="gbm-gauge__center">
              <span className="gbm-gauge__value">{formatRate(rate)}</span>
              <span className="gbm-gauge__note">{NUM.format(cur.interactions)}</span>
            </div>
          </div>
          <p className="gbm-conv__title">Interacciones totales</p>
          <p className="gbm-conv__sub">de {NUM.format(cur.impressions)} impresiones</p>
          <KpiTrend trend={rateTrend(rate, prevRate)} caption={`Período anterior: ${formatRate(prevRate)}`} />
        </div>

        <div className="gbm-conv__channels">
          {CHANNELS.map((c) => {
            const channelRate = rateOf(cur[c.key], cur.impressions);
            const prevChannelRate = prev ? rateOf(prev[c.key], prev.impressions) : null;
            return (
              <div key={c.key} className="gbm-conv__channel">
                <span className="gbm-conv__channel-head">
                  <span className={`gbm-conv__channel-icon stat-card__icon-wrapper--${c.color}`}>
                    <Icon name={c.icon} size={14} />
                  </span>
                  {c.label}
                </span>
                <span className="gbm-conv__channel-value">{formatRate(channelRate)}</span>
                <span className="gbm-conv__channel-count">{NUM.format(cur[c.key])}</span>
                <KpiTrend trend={rateTrend(channelRate, prevChannelRate)} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ─── Plataformas ────────────────────────────────────────────────────────── */

const PLATFORMS = [
  { key: 'impressions_mobile_search', label: 'Búsqueda · celular', axis: ['Búsqueda', 'celular'] },
  { key: 'impressions_desktop_search', label: 'Búsqueda · computadora', axis: ['Búsqueda', 'computadora'] },
  { key: 'impressions_mobile_maps', label: 'Maps · celular', axis: ['Maps', 'celular'] },
  { key: 'impressions_desktop_maps', label: 'Maps · computadora', axis: ['Maps', 'computadora'] },
];

export function PlatformsBlock({ cur }) {
  const data = PLATFORMS.map((p, i) => ({ label: p.label, value: cur[p.key], color: PLATFORM_4[i] }));
  const total = data.reduce((sum, d) => sum + d.value, 0);
  return (
    <div className="gb-card">
      <CardHeader title="Dónde te ven" subtitle="Impresiones del período, por plataforma y dispositivo" />
      <PieChart data={data} centerValue={NUM.format(total)} centerLabel="impresiones" />
    </div>
  );
}

/* Marcas del eje Y: de 0 al primer múltiplo «redondo» (1, 2 o 5 × 10ⁿ) que
   cubre el máximo, en orden. */
function axisTicks(max) {
  const raw = Math.max(max / 4, 1);
  const power = 10 ** Math.floor(Math.log10(raw));
  const f = raw / power;
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * power;
  return Array.from({ length: Math.ceil(max / step) + 1 }, (_, i) => i * step);
}

export function PlatformsCompareBlock({ cur, prev }) {
  const header = (
    <CardHeader title="Frente al período anterior" subtitle="Impresiones por plataforma en los dos períodos" />
  );
  if (!prev) {
    return (
      <div className="gb-card">
        {header}
        <p className="gbm-muted">No hay período anterior para comparar en este rango.</p>
      </div>
    );
  }

  const groups = PLATFORMS.map((p) => ({ ...p, cur: cur[p.key], prev: prev[p.key] }));
  const ticks = axisTicks(Math.max(1, ...groups.flatMap((g) => [g.cur, g.prev])));
  const top = ticks[ticks.length - 1];
  const pctOf = (v) => `${(v / top) * 100}%`;

  return (
    <div className="gb-card">
      {header}
      <div
        className="gbm-bars"
        role="img"
        aria-label={groups.map((g) => `${g.label}: ${NUM.format(g.cur)}, antes ${NUM.format(g.prev)}`).join('. ')}
      >
        <div className="gbm-bars__axis">
          {ticks.map((t) => (
            <span key={t} style={{ bottom: pctOf(t) }}>{NUM.format(t)}</span>
          ))}
        </div>
        <div className="gbm-bars__plot">
          {ticks.map((t) => <span key={t} className="gbm-bars__grid" style={{ bottom: pctOf(t) }} />)}
          {groups.map((g) => (
            <div key={g.key} className="gbm-bars__group">
              <span className="gbm-bars__bar gbm-bars__bar--cur" style={{ height: pctOf(g.cur) }}>
                <span className="gbm-bars__tip">Este período: {NUM.format(g.cur)}</span>
              </span>
              <span className="gbm-bars__bar gbm-bars__bar--prev" style={{ height: pctOf(g.prev) }}>
                <span className="gbm-bars__tip">Período anterior: {NUM.format(g.prev)}</span>
              </span>
            </div>
          ))}
        </div>
        <span />
        <div className="gbm-bars__labels">
          {groups.map((g) => (
            <span key={g.key}>{g.axis[0]}<br />{g.axis[1]}</span>
          ))}
        </div>
      </div>
      <ul className="gbm-bars__legend">
        <li><span className="gbm-bars__swatch gbm-bars__bar--cur" />Este período</li>
        <li><span className="gbm-bars__swatch gbm-bars__bar--prev" />Período anterior</li>
      </ul>
    </div>
  );
}

/* ─── Búsquedas ──────────────────────────────────────────────────────────── */

const KEYWORDS_PAGE = 10;
const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('es');

/* Contra el mes anterior: con número en los dos meses, el porcentaje; si el mes
   anterior no la tenía, «Nueva»; si alguno es un «< N», no hay cuenta que hacer.
   Sin ninguna fila del mes anterior (no se leyó) todo es «—»: si no, cada
   búsqueda saldría como «Nueva». */
function KeywordChange({ row, prevByKeyword }) {
  if (!prevByKeyword.size) return <span className="gbm-kw__none">—</span>;
  const prev = prevByKeyword.get(row.keyword);
  if (!prev) return <span className="kpi-trend kpi-trend--up">Nueva</span>;
  const trend = row.impressions != null && prev.impressions != null
    ? percentTrend(row.impressions, prev.impressions)
    : null;
  return trend ? <KpiTrend trend={trend} /> : <span className="gbm-kw__none">—</span>;
}

/* La tarjeta entera. Quien la usa le pone `key` por mes y sucursal: así el
   buscador y la página vuelven a cero al cambiar cualquiera de los dos. */
export function KeywordsBlock({ months, month, onMonth, rows, prevRows, error }) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);

  const prevByKeyword = useMemo(() => new Map((prevRows ?? []).map((r) => [r.keyword, r])), [prevRows]);
  const filtered = useMemo(() => {
    const ranked = (rows ?? []).map((r, i) => ({ ...r, rank: i + 1 }));
    const q = fold(query.trim());
    return q ? ranked.filter((r) => fold(r.keyword).includes(q)) : ranked;
  }, [rows, query]);

  const pages = Math.ceil(filtered.length / KEYWORDS_PAGE);
  const pageRows = filtered.slice(page * KEYWORDS_PAGE, (page + 1) * KEYWORDS_PAGE);

  return (
    <div className="gb-card">
      <CardHeader title="Búsquedas que mostraron tu perfil" subtitle="Lo que escribió la gente en Google cuando apareció tu ficha, y cuántas veces">
        <Select value={month} onChange={onMonth} options={months} triggerClassName="ls-select-field gbm-kw__month" />
      </CardHeader>

      {error && <p className="gbm-error">{error}</p>}
      {!error && rows === null && <p className="gbm-muted">Cargando…</p>}
      {!error && rows?.length === 0 && (
        <p className="gbm-muted">Google todavía no publicó búsquedas para este mes, o fueron muy pocas para mostrarlas.</p>
      )}

      {rows?.length > 0 && (
        <>
          <div className="ls-field__control gbm-kw__search">
            <span className="ls-field__icon"><Icon name="search" size={15} /></span>
            <input
              type="search"
              className="ls-field__input"
              placeholder="Buscar una palabra…"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setPage(0); }}
              aria-label="Buscar una palabra"
            />
          </div>

          {pageRows.length === 0 ? (
            <p className="gbm-muted">Ninguna búsqueda contiene «{query.trim()}».</p>
          ) : (
            <div className="gbm-kw__wrap">
              <table className="gbm-kw">
                <thead>
                  <tr>
                    <th className="gbm-kw__rank">#</th>
                    <th>Búsqueda</th>
                    <th className="gbm-kw__num">
                      <span className="gbm-kw__th-info" title="Cuántas veces apareció tu ficha cuando alguien buscó esto, ese mes.">
                        Impresiones <Icon name="info" size={12} />
                      </span>
                    </th>
                    <th className="gbm-kw__num">Vs. mes anterior</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((r) => (
                    <tr key={r.keyword}>
                      <td className="gbm-kw__rank">{r.rank}</td>
                      <td className="gbm-kw__term">{r.keyword}</td>
                      <td className="gbm-kw__num gbm-kw__volume">
                        {r.impressions != null ? NUM.format(r.impressions) : `< ${NUM.format(r.threshold)}`}
                      </td>
                      <td className="gbm-kw__num"><KeywordChange row={r} prevByKeyword={prevByKeyword} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {pages > 1 && (
            <div className="gbm-pager">
              <button type="button" onClick={() => setPage((p) => p - 1)} disabled={page === 0} aria-label="Página anterior">
                <Icon name="chevronLeft" size={15} />
              </button>
              <span>Página {page + 1} de {pages}</span>
              <button type="button" onClick={() => setPage((p) => p + 1)} disabled={page + 1 >= pages} aria-label="Página siguiente">
                <Icon name="chevronRight" size={15} />
              </button>
            </div>
          )}
        </>
      )}

      <p className="gbm-footnote">
        Google no da el número exacto de las búsquedas chicas: las muestra como «&lt; 15».
      </p>
    </div>
  );
}
