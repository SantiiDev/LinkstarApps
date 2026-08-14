import { useEffect, useMemo, useRef, useState } from 'react';
import './TrendChart.css';

const COLOR_VARS = {
  orange: 'var(--color-orange)',
  gold: 'var(--color-gold)',
  forest: 'var(--color-forest)',
  navy: 'var(--color-navy)',
};

/* Escalones "redondos" (1, 2 o 5 × 10ⁿ) para que el eje diga 0 / 10 / 20 / 30
   y no 0 / 8,4 / 16,8. Devuelve el dominio ya estirado hasta el tick de cada
   extremo: eso es lo que evita que el punto más alto toque el techo de la
   tarjeta y toda serie parezca estar en su récord histórico.

   `integer` evita ticks fraccionarios cuando la variable es discreta (un
   conteo de escaneos no puede valer 2,5). */
function niceScale(rawMin, rawMax, wanted = 4, integer = false) {
  let min = rawMin;
  let max = rawMax;

  if (!Number.isFinite(min) || !Number.isFinite(max)) return { ticks: [0, 1], min: 0, max: 1 };

  // Serie plana: sin esto el dominio mide 0 y todo se divide por cero.
  if (min === max) {
    if (min === 0) return { ticks: [0, 1], min: 0, max: 1 };
    const pad = Math.abs(min) * 0.5;
    min -= pad;
    max += pad;
  }

  const raw = Math.max((max - min) / wanted, Number.MIN_VALUE);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  let step = (norm <= 1.5 ? 1 : norm <= 3 ? 2 : norm <= 7 ? 5 : 10) * mag;
  if (integer) step = Math.max(1, Math.round(step));

  let lo = Math.floor(min / step) * step;
  let hi = Math.ceil(max / step) * step;

  /* Si el máximo cae justo sobre un tick, el punto más alto queda pegado al
     borde de arriba y vuelve a parecer un récord. Se agrega un escalón de aire.
     Abajo se hace lo mismo, salvo cuando el piso es 0: ahí el 0 es el piso real
     y bajarlo desperdiciaría media tarjeta. */
  if (hi === max) hi += step;
  if (lo === min && lo !== 0) lo -= step;

  const ticks = [];
  for (let v = lo; v <= hi + step / 1000; v += step) ticks.push(Number(v.toPrecision(12)));
  return { ticks, min: lo, max: hi };
}

const DEFAULT_FORMAT = new Intl.NumberFormat('es-AR');
const COMPACT_FORMAT = new Intl.NumberFormat('es-AR', { notation: 'compact', maximumFractionDigits: 1 });

/**
 * Gráfico de línea con ejes reales.
 *
 * El SVG se dibuja a la medida en píxeles del contenedor (1 unidad = 1 px) en
 * vez de estirar un viewBox fijo: si se escala distinto en X que en Y, la
 * pendiente deja de significar algo — los mismos datos se ven empinados en una
 * tarjeta angosta y planos en una ancha — y los círculos de cada punto se
 * deforman en elipses.
 *
 * @param {number[]} data        Serie de valores.
 * @param {string[]} labels      Una etiqueta por valor (se ralean solas si no entran).
 * @param {string}   seriesName  Qué mide la serie. Aparece en el tooltip.
 * @param {string}   xLabel      Nombre del eje X (ej. "Semana", "Día", "Mes").
 * @param {string}   yLabel      Nombre del eje Y (ej. "Escaneos", "% positivo").
 * @param {'zero'|'auto'} baseline
 *        `zero` para conteos: la escala arranca en 0 y se rellena el área.
 *        `auto` para puntajes y porcentajes, donde el 0 no es el piso natural
 *        (un NPS va de −100 a 100) y el relleno mentiría sugiriendo acumulación.
 */
export default function TrendChart({
  data,
  labels,
  color = 'orange',
  seriesName = 'Valor',
  xLabel,
  yLabel,
  baseline = 'zero',
  formatValue,
}) {
  const plotRef = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [hover, setHover] = useState(null);

  const strokeColor = COLOR_VARS[color] || COLOR_VARS.orange;

  useEffect(() => {
    const el = plotRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ w: Math.round(width), h: Math.round(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const chart = useMemo(() => {
    const values = (data ?? []).map((v) => (Number.isFinite(Number(v)) ? Number(v) : 0));
    if (values.length === 0 || size.w < 80 || size.h < 80) return null;

    const pad = {
      top: yLabel ? 26 : 14,
      right: 48,
      bottom: xLabel ? 38 : 24,
      left: 10,
    };

    const isInteger = values.every((v) => Number.isInteger(v));
    const dataMin = Math.min(...values);
    const dataMax = Math.max(...values);
    const scale = baseline === 'zero'
      ? niceScale(Math.min(0, dataMin), dataMax, 4, isInteger)
      : niceScale(dataMin, dataMax, 4, isInteger);

    const innerW = size.w - pad.left - pad.right;
    const innerH = size.h - pad.top - pad.bottom;
    const span = scale.max - scale.min || 1;

    const stepX = values.length > 1 ? innerW / (values.length - 1) : 0;
    const xAt = (i) => (values.length > 1 ? pad.left + i * stepX : pad.left + innerW / 2);
    const yAt = (v) => pad.top + innerH - ((v - scale.min) / span) * innerH;

    const points = values.map((v, i) => [xAt(i), yAt(v)]);
    const linePath = points
      .map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(2)},${p[1].toFixed(2)}`)
      .join(' ');

    // El área sólo cierra contra el 0. Rellenar hasta una base que no es cero
    // exagera la variación: la altura pintada deja de ser proporcional al valor.
    const areaPath = baseline === 'zero'
      ? `${linePath} L${points[points.length - 1][0].toFixed(2)},${yAt(0).toFixed(2)} `
        + `L${points[0][0].toFixed(2)},${yAt(0).toFixed(2)} Z`
      : null;

    // Las etiquetas del eje X se ralean para que no se pisen, y se dibujan en
    // la posición real de su punto — antes se repartían con space-between, así
    // que sólo coincidían con los datos de casualidad.
    const perLabel = 62;
    const stride = Math.max(1, Math.ceil(values.length / Math.max(2, Math.floor(innerW / perLabel))));
    const labelIdx = [];
    for (let i = 0; i < values.length; i += stride) labelIdx.push(i);
    const last = values.length - 1;
    if (labelIdx[labelIdx.length - 1] !== last && (last - labelIdx[labelIdx.length - 1]) * stepX > 44) {
      labelIdx.push(last);
    }

    // La notación compacta recién a partir de 100.000: "8.000" se lee sin
    // esfuerzo y es exacto, mientras que "8 mil" pierde precisión justo en el
    // rango en el que se mueven estos números.
    const tickFormat = scale.max >= 100000 ? COMPACT_FORMAT : DEFAULT_FORMAT;

    return {
      values, pad, scale, innerW, innerH, stepX, xAt, yAt,
      points, linePath, areaPath, labelIdx, tickFormat,
      showDots: values.length <= 12,
      indexAt(clientX) {
        const rel = clientX - pad.left;
        if (stepX === 0) return 0;
        return Math.max(0, Math.min(values.length - 1, Math.round(rel / stepX)));
      },
    };
  }, [data, size, baseline, xLabel, yLabel]);

  const isEmpty = !data || data.length === 0;
  const fmt = formatValue || ((v) => DEFAULT_FORMAT.format(v));
  const gradientId = `trendFill-${color}`;

  function handleMove(e) {
    if (!chart || !plotRef.current) return;
    const rect = plotRef.current.getBoundingClientRect();
    setHover(chart.indexAt(e.clientX - rect.left));
  }

  const hovered = chart && hover != null && hover < chart.values.length ? hover : null;

  /* El contenedor medido se monta SIEMPRE, con datos o sin ellos: si el estado
     vacío devolviera otro árbol, al llegar los datos el ResizeObserver seguiría
     observando el nodo viejo, el tamaño quedaría en 0 y el gráfico no se
     dibujaría nunca. Es exactamente el caso de Dispositivos, que arranca con la
     serie vacía y la completa cuando responde la query. */
  return (
    <div className="trend-chart">
      <div
        className={`trend-chart__plot ${isEmpty ? 'trend-chart__plot--empty' : ''}`}
        ref={plotRef}
        onPointerMove={handleMove}
        onPointerLeave={() => setHover(null)}
      >
        {isEmpty && (
          <span className="trend-chart__empty-text">Todavía no hay datos para este período</span>
        )}

        {!isEmpty && chart && (
          <svg
            width={size.w}
            height={size.h}
            viewBox={`0 0 ${size.w} ${size.h}`}
            className="trend-chart__svg"
            role="img"
            aria-label={
              `${seriesName} por ${(xLabel || 'período').toLowerCase()}: `
              + `${chart.values.length} puntos, mínimo ${fmt(Math.min(...chart.values))}, `
              + `máximo ${fmt(Math.max(...chart.values))}.`
            }
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={strokeColor} stopOpacity="0.28" />
                <stop offset="100%" stopColor={strokeColor} stopOpacity="0" />
              </linearGradient>
            </defs>

            {/* Grilla + valores del eje Y, a la derecha */}
            {chart.scale.ticks.map((t) => {
              const y = chart.yAt(t);
              if (y < chart.pad.top - 1 || y > size.h - chart.pad.bottom + 1) return null;
              return (
                <g key={t}>
                  <line
                    className="trend-chart__grid"
                    x1={chart.pad.left}
                    x2={size.w - chart.pad.right}
                    y1={y}
                    y2={y}
                  />
                  <text
                    className="trend-chart__tick"
                    x={size.w - chart.pad.right + 8}
                    y={y}
                    dominantBaseline="middle"
                  >
                    {chart.tickFormat.format(t)}
                  </text>
                </g>
              );
            })}

            {yLabel && (
              <text className="trend-chart__axis-name" x={size.w - chart.pad.right + 8} y={12}>
                {yLabel}
              </text>
            )}

            {chart.areaPath && <path d={chart.areaPath} fill={`url(#${gradientId})`} />}
            <path
              d={chart.linePath}
              fill="none"
              stroke={strokeColor}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {chart.showDots && chart.points.map((p, i) => (
              <circle key={i} cx={p[0]} cy={p[1]} r="3" fill="var(--color-white)" stroke={strokeColor} strokeWidth="2" />
            ))}

            {/* Etiquetas del eje X, cada una bajo su punto */}
            {labels && chart.labelIdx.map((i) => (
              <text
                key={i}
                className="trend-chart__tick"
                x={chart.xAt(i)}
                y={size.h - chart.pad.bottom + 15}
                textAnchor={i === 0 ? 'start' : i === chart.values.length - 1 ? 'end' : 'middle'}
              >
                {labels[i]}
              </text>
            ))}

            {xLabel && (
              <text
                className="trend-chart__axis-name"
                x={chart.pad.left + chart.innerW / 2}
                y={size.h - 4}
                textAnchor="middle"
              >
                {xLabel}
              </text>
            )}

            {hovered != null && (
              <g pointerEvents="none">
                <line
                  className="trend-chart__crosshair"
                  x1={chart.xAt(hovered)}
                  x2={chart.xAt(hovered)}
                  y1={chart.pad.top}
                  y2={size.h - chart.pad.bottom}
                />
                <circle
                  cx={chart.xAt(hovered)}
                  cy={chart.yAt(chart.values[hovered])}
                  r="4.5"
                  fill={strokeColor}
                  stroke="var(--color-white)"
                  strokeWidth="2"
                />
              </g>
            )}
          </svg>
        )}

        {!isEmpty && chart && hovered != null && (
          <div
            className="trend-chart__tooltip"
            style={{
              left: Math.min(Math.max(chart.xAt(hovered), 70), Math.max(size.w - 70, 70)),
              top: Math.max(chart.yAt(chart.values[hovered]) - 14, 8),
            }}
          >
            {labels?.[hovered] && <div className="trend-chart__tooltip-label">{labels[hovered]}</div>}
            <div className="trend-chart__tooltip-row">
              <span className="trend-chart__tooltip-dot" style={{ background: strokeColor }} />
              <span className="trend-chart__tooltip-name">{seriesName}</span>
              <strong className="trend-chart__tooltip-value">{fmt(chart.values[hovered])}</strong>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
