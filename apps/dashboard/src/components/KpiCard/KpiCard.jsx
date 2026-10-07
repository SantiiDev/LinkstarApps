import '../StatCard/StatCard.css';
import './KpiCard.css';

/*
 * La tarjeta de KPI de Mi Empresa y Dispositivos.
 *
 * Usa las clases de StatCard (vidrio, hover y filete de color) para verse igual
 * que los KPIs del resto del panel, pero con estructura propia: ícono y etiqueta
 * arriba, el número, una línea de variación o contexto, y dos huecos opcionales
 * que StatCard no tiene — `aside` (una cajita al costado, como «Respondidas») y
 * `footer` (un enlace al pie, como «Ver análisis»).
 *
 * Nunca recibe un número inventado: quien la usa pasa «—» cuando no hay medición.
 * Va dentro de un contenedor `.kpi-grid`.
 */
/* El encabezado (ícono + etiqueta) va en su propia fila, a todo el ancho; la
 * cajita del costado va abajo, junto al número. Al lado del encabezado le
 * comía el ancho y la etiqueta se cortaba. */
export default function KpiCard({ icon, color = 'orange', label, children, aside, footer }) {
  return (
    <div className={`stat-card stat-card--${color} kpi-card`}>
      <div className="kpi-card__head">
        <span className={`kpi-card__icon stat-card__icon-wrapper--${color}`}>{icon}</span>
        <span className="kpi-card__label">{label}</span>
      </div>
      <div className="kpi-card__body">
        <div className="kpi-card__main">
          {children}
          {footer}
        </div>
        {aside}
      </div>
    </div>
  );
}

/* Variación contra el período anterior ({ text, direction: 'up'|'down'|'flat' })
   y, al lado, el contexto («vs período anterior»). Sin variación —no hay base—
   se muestra sólo el contexto. */
export function KpiTrend({ trend, caption }) {
  return (
    <div className="kpi-card__trend">
      {trend && (
        <span className={`kpi-trend kpi-trend--${trend.direction}`}>
          {trend.direction === 'up' ? '▲' : trend.direction === 'down' ? '▼' : '–'} {trend.text}
        </span>
      )}
      {caption && <span className="kpi-card__caption">{caption}</span>}
    </div>
  );
}
