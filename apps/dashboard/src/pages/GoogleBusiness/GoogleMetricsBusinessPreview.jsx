/*
 * MAQUETAS DECORATIVAS — no son datos, son el fondo de BusinessLock.
 *
 * Cada una dibuja una tarjeta Business de Métricas con números INVENTADOS, para
 * que una cuenta gratis vea de qué se trata. Se renderizan ÚNICAMENTE como
 * `preview` de components/BusinessLock, que las deja borrosas, inertes y bajo un
 * velo que no se cierra. NO agregar otro importador: fuera de esa puerta son una
 * pantalla inventando datos (CLAUDE.md).
 *
 * Nunca se arman con los datos del cliente: lo Business de una cuenta gratis ni
 * siquiera llega al navegador (0029).
 */
import { SPLIT_2 } from '../../lib/chartColors';

export function ConversionPreview() {
  return (
    <div className="gb-card gbm-section">
      <div className="gb-card__header">
        <div>
          <h3 className="gb-card__title">Tasa de conversión</h3>
          <span className="gb-card__subtitle">Qué porcentaje de quienes ven tu ficha hace algo</span>
        </div>
      </div>
      <div className="gbm-conv">
        <div className="gbm-conv__main">
          <span className="gbm-conv__value">12,1%</span>
          <span className="gbm-conv__label">412 interacciones de 3.400 impresiones</span>
          <span className="gbm-conv__prev">Período anterior: 10,4%</span>
        </div>
        {[['3,1%', 'Clics en Llamar'], ['7,4%', 'Clics en «Cómo llegar»'], ['1,6%', 'Clics a la web']].map(([v, l]) => (
          <div key={l} className="gbm-conv__item">
            <span className="gbm-conv__item-value">{v}</span>
            <span className="gbm-conv__item-label">{l}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FakeSplit({ title, parts }) {
  return (
    <div className="gbm-split">
      <div className="gbm-split__head"><span className="gbm-split__title">{title}</span></div>
      <div className="gb-split__bar">
        {parts.map(([label, pct], i) => (
          <div key={label} className="gb-split__seg" style={{ width: `calc(${pct}% - 1px)`, background: SPLIT_2[i] }} />
        ))}
      </div>
      <ul className="gb-split__legend">
        {parts.map(([label, pct], i) => (
          <li key={label} className="gb-split__legend-item">
            <span className="gb-split__dot" style={{ background: SPLIT_2[i] }} />
            <span className="gb-split__label">{label}</span>
            <span className="gb-split__pct">{pct}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PlatformsPreview() {
  return (
    <div className="gb-card">
      <div className="gb-card__header">
        <div>
          <h3 className="gb-card__title">Dónde te ven</h3>
          <span className="gb-card__subtitle">Impresiones de este período, por plataforma</span>
        </div>
      </div>
      <FakeSplit title="Búsqueda o Maps" parts={[['Búsqueda de Google', 38], ['Google Maps', 62]]} />
      <FakeSplit title="Celular o computadora" parts={[['Celular', 81], ['Computadora', 19]]} />
    </div>
  );
}

export function InsightsPreview() {
  return (
    <div className="gb-card">
      <div className="gb-card__header">
        <div>
          <h3 className="gb-card__title">Qué dicen tus métricas</h3>
          <span className="gb-card__subtitle">Sugerencias a partir de tus números</span>
        </div>
      </div>
      <ul className="gbm-insights">
        <li><strong>Te encuentran más que antes</strong><span>Tu ficha apareció 3.400 veces, 18% más que el período anterior.</span></li>
        <li><strong>Te buscan desde el celular</strong><span>81% de las veces fue en un celular: el botón de llamar pesa más.</span></li>
        <li><strong>Revisá tu web</strong><span>Pocos entran a tu sitio desde la ficha.</span></li>
      </ul>
    </div>
  );
}

export function KeywordsPreview() {
  const rows = [['cafetería', 1240], ['cafetería cerca de mí', 860], ['desayunos', 520], ['café de especialidad', 310], ['brunch', 150]];
  return (
    <div className="gb-card">
      <div className="gb-card__header">
        <div>
          <h3 className="gb-card__title">Búsquedas que mostraron tu perfil</h3>
          <span className="gb-card__subtitle">Lo que escribió la gente en Google cuando te encontró</span>
        </div>
      </div>
      <div className="gb-keywords">
        {rows.map(([term, v]) => (
          <div key={term} className="gb-keyword-row">
            <span className="gb-keyword-row__term">{term}</span>
            <div className="gb-keyword-row__bar"><div className="gb-keyword-row__fill" style={{ width: `${(v / 1240) * 100}%` }} /></div>
            <span className="gb-keyword-row__volume">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
