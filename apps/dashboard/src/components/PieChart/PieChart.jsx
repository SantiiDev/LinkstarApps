import { useMemo, useState } from 'react';
import { sharesOf } from '../../lib/shares';
import './PieChart.css';

const VB = 200;                 // lado del viewBox, en unidades SVG
const CX = VB / 2;
const CY = VB / 2;
const R_OUT = 92;
const R_IN = 58;                // > 0 ⇒ anillo. El hueco es donde va el titular.
const R_MID = (R_OUT + R_IN) / 2;

/* Separación de 2px entre porciones, expresada en grados sobre el radio medio.
   El corte hace de segunda codificación: dos porciones contiguas se distinguen
   por el borde aunque el lector no perciba la diferencia de color. */
const GAP_DEG = (2 / (2 * Math.PI * R_MID)) * 360;

function polar(r, deg) {
  const rad = ((deg - 90) * Math.PI) / 180;   // 0° arriba, sentido horario
  return [CX + r * Math.cos(rad), CY + r * Math.sin(rad)];
}

function ringPath(startDeg, rawEndDeg) {
  /* Un arco de exactamente 360° tiene el mismo punto de inicio y de fin, y por
     especificación SVG eso se omite entero: el anillo no se dibujaría. Pasa con
     una sola categoría al 100% (una org con todas sus reseñas positivas), así
     que se recorta una pizca — 0,01° es una centésima de píxel, invisible. */
  const endDeg = Math.min(rawEndDeg, startDeg + 359.99);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  const [x1, y1] = polar(R_OUT, startDeg);
  const [x2, y2] = polar(R_OUT, endDeg);
  const [x3, y3] = polar(R_IN, endDeg);
  const [x4, y4] = polar(R_IN, startDeg);
  return `M${x1.toFixed(2)},${y1.toFixed(2)} `
    + `A${R_OUT},${R_OUT} 0 ${large} 1 ${x2.toFixed(2)},${y2.toFixed(2)} `
    + `L${x3.toFixed(2)},${y3.toFixed(2)} `
    + `A${R_IN},${R_IN} 0 ${large} 0 ${x4.toFixed(2)},${y4.toFixed(2)} Z`;
}

const DEFAULT_FORMAT = new Intl.NumberFormat('es-AR');

/**
 * Gráfico de torta (anillo) para una composición: partes de un mismo todo.
 *
 * La identidad de cada porción nunca queda sólo en el color — la leyenda trae
 * el nombre, el porcentaje y el conteo en texto. Es obligatorio con esta
 * paleta, que está por debajo de 3:1 de contraste contra el fondo claro.
 *
 * @param {{label: string, value: number, color: string, hint?: string}[]} data
 * @param {string} centerValue  Titular dentro del anillo (ej. el puntaje NPS).
 * @param {string} centerLabel  Qué es ese titular.
 * @param {string} centerNote   Aclaración chica bajo el titular (ej. la escala).
 * @param {string} unit         Sustantivo del conteo en la leyenda ("reseñas").
 */
export default function PieChart({
  data,
  centerValue,
  centerLabel,
  centerNote,
  unit,
  formatValue,
}) {
  const [hover, setHover] = useState(null);
  const fmt = formatValue || ((v) => DEFAULT_FORMAT.format(v));

  const slices = useMemo(() => {
    const rows = (data ?? []).filter((d) => Number(d.value) > 0);
    if (rows.length === 0) return [];

    const shares = sharesOf(rows.map((d) => Number(d.value)));
    const total = rows.reduce((sum, d) => sum + Number(d.value), 0);

    // Los ángulos salen de los valores exactos, no de los porcentajes ya
    // redondeados: si no, el anillo puede quedar con un hueco o pisarse.
    let cursor = 0;
    return rows.map((d, i) => {
      const sweep = (Number(d.value) / total) * 360;
      const start = cursor;
      cursor += sweep;

      // Con una sola porción no hay contra qué separarla: el corte dejaría una
      // muesca suelta en un anillo que en realidad es continuo.
      const gap = rows.length > 1 ? Math.min(GAP_DEG, sweep / 4) : 0;
      const [lx, ly] = polar(R_MID, start + sweep / 2);

      return {
        ...d,
        share: shares[i],
        /* Una categoría que existe pero no llega al 1% redondea a 0. Mostrar
           "0%" al lado de un conteo distinto de cero se lee como un error, así
           que en ese caso se dice "<1%". */
        shareText: shares[i] === 0 ? '<1%' : `${shares[i]}%`,
        path: ringPath(start + gap / 2, start + sweep - gap / 2),
        labelPos: [lx, ly],
      };
    });
  }, [data]);

  if (slices.length === 0) {
    return <div className="pie-chart pie-chart--empty">Todavía no hay datos para mostrar</div>;
  }

  const summary = slices.map((s) => `${s.label} ${s.shareText}`).join(', ');

  return (
    <div className="pie-chart">
      <div className="pie-chart__ring">
        <svg viewBox={`0 0 ${VB} ${VB}`} className="pie-chart__svg" role="img" aria-label={summary}>
          {slices.map((s, i) => (
            <path
              key={s.label}
              d={s.path}
              fill={s.color}
              className={`pie-chart__slice ${hover != null && hover !== i ? 'pie-chart__slice--dim' : ''}`}
              onPointerEnter={() => setHover(i)}
              onPointerLeave={() => setHover(null)}
            />
          ))}
        </svg>

        {(centerValue != null || centerLabel) && (
          /* Sin rótulo ni nota, el número queda solo y puede ocupar más lugar
             en el hueco — si no, se ve chico y descentrado hacia arriba. */
          <div className={`pie-chart__center ${!centerLabel && !centerNote ? 'pie-chart__center--solo' : ''}`}>
            {centerValue != null && <span className="pie-chart__center-value">{centerValue}</span>}
            {centerLabel && <span className="pie-chart__center-label">{centerLabel}</span>}
            {centerNote && <span className="pie-chart__center-note">{centerNote}</span>}
          </div>
        )}

        {hover != null && (
          <div
            className="pie-chart__tooltip"
            style={{
              left: `${(slices[hover].labelPos[0] / VB) * 100}%`,
              top: `${(slices[hover].labelPos[1] / VB) * 100}%`,
            }}
          >
            <span className="pie-chart__tooltip-dot" style={{ background: slices[hover].color }} />
            {slices[hover].label} <strong>{slices[hover].shareText}</strong>
          </div>
        )}
      </div>

      {/* La leyenda no es decorativa: es lo que hace que la identidad de cada
          porción no dependa del color. Siempre con nombre, porcentaje y conteo. */}
      <ul className="pie-chart__legend">
        {slices.map((s, i) => (
          <li
            key={s.label}
            className={`pie-chart__legend-item ${hover === i ? 'pie-chart__legend-item--on' : ''}`}
            onPointerEnter={() => setHover(i)}
            onPointerLeave={() => setHover(null)}
          >
            <span className="pie-chart__legend-dot" style={{ background: s.color }} />
            <span className="pie-chart__legend-label">
              {s.label}
              {s.hint && <span className="pie-chart__legend-hint"> ({s.hint})</span>}
            </span>
            <span className="pie-chart__legend-share">{s.shareText}</span>
            <span className="pie-chart__legend-count">
              {fmt(s.value)}{unit ? ` ${unit}` : ''}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
