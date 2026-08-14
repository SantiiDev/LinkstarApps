import PageHeader from '../../components/PageHeader/PageHeader';
import StatCard from '../../components/StatCard/StatCard';
import TrendChart from '../../components/TrendChart/TrendChart';
import PieChart from '../../components/PieChart/PieChart';
import { CHART_COLORS } from '../../lib/chartColors';
import { sharesOf } from '../../lib/shares';
import { ALL_REVIEWS, REVIEW_STATS } from '../../data/reviews';
import './Reports.css';

const SENTIMENT_TREND = [68, 71, 70, 74, 75, 77];
const MONTHS = ['Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago'];

/* Tres bandas en vez de dos. Con el umbral único en 60 la barra saltaba de
   rojo a verde entre 59% y 61%: un cambio visual enorme para dos puntos de
   diferencia. La banda del medio absorbe ese salto, y los tres tonos son el
   mismo trío verificado que usan el anillo y las tarjetas (lib/chartColors.js).

   Sigue habiendo cortes — lo que los elimina del todo es una rampa continua,
   pero eso cambia bastante el aspecto de la tarjeta. */
function themeTone(positivePct) {
  if (positivePct >= 66) return 'forest';   // mayoría clara de menciones positivas
  if (positivePct >= 34) return 'gold';     // mezclado
  return 'danger';                          // mayoría clara de menciones negativas
}

const THEMES = [
  { label: 'Atención al cliente', positive: 89, mentions: 42 },
  { label: 'Calidad del producto', positive: 84, mentions: 35 },
  { label: 'Ambiente del local', positive: 91, mentions: 24 },
  { label: 'Tiempo de espera', positive: 38, mentions: 18 },
  { label: 'Precios', positive: 62, mentions: 15 },
];

function Icon({ name, ...rest }) {
  const props = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', ...rest };
  const icons = {
    smile: <svg {...props}><circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" /></svg>,
    meh: <svg {...props}><circle cx="12" cy="12" r="10" /><line x1="8" y1="15" x2="16" y2="15" /><line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" /></svg>,
    frown: <svg {...props}><circle cx="12" cy="12" r="10" /><path d="M16 16s-1.5-2-4-2-4 2-4 2" /><line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" /></svg>,
    tag: <svg {...props}><path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12.01V2h10.01l8.58 8.58a2 2 0 0 1 0 2.83z" /><line x1="7" y1="7" x2="7.01" y2="7" /></svg>,
  };
  return icons[name] || null;
}

export default function ReportsSentiment() {
  const total = ALL_REVIEWS.length;
  const countBy = (s) => ALL_REVIEWS.filter((r) => r.sentiment === s).length;

  /* Los tres porcentajes salen de un único reparto que suma 100. Antes el
     negativo se calculaba como `100 - positivo - neutro`, lo que le encajaba
     todo el error de redondeo de los otros dos a una sola categoría (y con
     pocas reseñas podía llegar a darle un valor negativo). */
  const SENTIMENTS = [
    { key: 'positive', label: 'Positivo', color: CHART_COLORS.good },
    { key: 'neutral',  label: 'Neutro',   color: CHART_COLORS.warning },
    { key: 'negative', label: 'Negativo', color: CHART_COLORS.bad },
  ].map((s) => ({ ...s, count: countBy(s.key) }));

  const shares = sharesOf(SENTIMENTS.map((s) => s.count));
  const [positivePct, neutralPct, negativePct] = shares;

  return (
    <div className="reports-page">
      <PageHeader
        eyebrow="Reportes"
        title="Análisis de Sentimiento"
        subtitle="Cómo se sienten tus clientes, detectado automáticamente con IA sobre cada reseña"
      />

      <div className="reports-stat-grid">
        {/* Mismo color que su porción en el anillo de "Distribución". */}
        <StatCard icon={<Icon name="smile" />} value={`${positivePct}%`} label="Sentimiento positivo" trend="+3%" color="forest" />
        <StatCard icon={<Icon name="meh" />} value={`${neutralPct}%`} label="Sentimiento neutro" color="gold" />
        <StatCard icon={<Icon name="frown" />} value={`${negativePct}%`} label="Sentimiento negativo" trendDirection="down" trend="-1%" color="danger" />
        <StatCard icon={<Icon name="tag" />} value={THEMES.length} label="Temas detectados" color="orange" />
      </div>

      <div className="reports-two-col">
        <div className="reports-card">
          <div className="reports-card__header">
            <div>
              <h3 className="reports-card__title">Sentimiento positivo en el tiempo</h3>
              <span className="reports-card__subtitle">Últimos 6 meses · {REVIEW_STATS.totalReviews} reseñas analizadas</span>
            </div>
          </div>
          {/* Es un porcentaje que se mueve entre 68 y 77: con la escala forzada
              a 0-100 se vería como una recta pegada al borde de arriba. */}
          <TrendChart
            data={SENTIMENT_TREND}
            labels={MONTHS}
            color="orange"
            seriesName="Reseñas positivas"
            xLabel="Mes"
            yLabel="% positivo"
            baseline="auto"
            formatValue={(v) => `${v}%`}
          />
        </div>

        <div className="reports-card">
          <div className="reports-card__header">
            <div>
              <h3 className="reports-card__title">Distribución</h3>
              <span className="reports-card__subtitle">{total} reseñas clasificadas</span>
            </div>
          </div>
          <PieChart
            data={SENTIMENTS.map((s) => ({ ...s, value: s.count }))}
            centerValue={total}
            centerLabel="reseñas"
            unit="reseñas"
          />
        </div>
      </div>

      <div className="reports-card">
        <div className="reports-card__header">
          <div>
            <h3 className="reports-card__title">Temas más mencionados</h3>
            <span className="reports-card__subtitle">Qué tan positivo es el sentimiento por tema</span>
          </div>
        </div>
        <div className="reports-themes">
          {THEMES.map((t) => (
            <div key={t.label} className="reports-theme-row">
              <div className="reports-theme-row__top">
                <span>{t.label}</span>
                <span className="reports-theme-row__mentions">{t.mentions} menciones</span>
              </div>
              <div className="reports-theme-row__bar">
                <div
                  className={`reports-theme-row__fill reports-theme-row__fill--${themeTone(t.positive)}`}
                  style={{ width: `max(3px, ${t.positive}%)` }}
                />
              </div>
              <span className="reports-theme-row__pct">{t.positive}% positivo</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
