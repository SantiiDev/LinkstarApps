import PageHeader from '../../components/PageHeader/PageHeader';
import StatCard from '../../components/StatCard/StatCard';
import TrendChart from '../../components/TrendChart/TrendChart';
import PieChart from '../../components/PieChart/PieChart';
import { CHART_COLORS } from '../../lib/chartColors';
import { sharesOf } from '../../lib/shares';
import './Reports.css';

/* Sólo se guardan los conteos: el porcentaje de cada grupo y el puntaje NPS
   se derivan de acá. Antes convivían un `pct` escrito a mano y un NPS_SCORE
   de 68 que no se correspondían — el NPS es promotores% − detractores%, o
   sea 66 con estos mismos datos. */
const BREAKDOWN = [
  { label: 'Promotores',  hint: '9-10', count: 153, color: CHART_COLORS.good },
  { label: 'Pasivos',     hint: '7-8',  count: 47,  color: CHART_COLORS.warning },
  { label: 'Detractores', hint: '0-6',  count: 13,  color: CHART_COLORS.bad },
];

/* El último punto es el NPS de hoy, así que tiene que coincidir con el que
   sale del desglose (66). Estaba en 68 y la misma pantalla se contradecía. */
const NPS_TREND = [58, 60, 63, 65, 64, 66];
const MONTHS = ['Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago'];

function Icon({ name, ...rest }) {
  const props = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', ...rest };
  const icons = {
    smile: <svg {...props}><circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" /></svg>,
    meh: <svg {...props}><circle cx="12" cy="12" r="10" /><line x1="8" y1="15" x2="16" y2="15" /><line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" /></svg>,
    frown: <svg {...props}><circle cx="12" cy="12" r="10" /><path d="M16 16s-1.5-2-4-2-4 2-4 2" /><line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" /></svg>,
    users: <svg {...props}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>,
  };
  return icons[name] || null;
}

export default function ReportsNps() {
  const totalResponses = BREAKDOWN.reduce((s, b) => s + b.count, 0);
  const shares = sharesOf(BREAKDOWN.map((b) => b.count));
  const npsScore = shares[0] - shares[2];
  const level = npsScore >= 70 ? 'Excelente' : npsScore >= 50 ? 'Muy bueno' : npsScore >= 0 ? 'Aceptable' : 'A mejorar';

  return (
    <div className="reports-page">
      <PageHeader
        eyebrow="Reportes"
        title="NPS"
        subtitle="Qué tan probable es que tus clientes te recomienden a otras personas"
      />

      <div className="reports-two-col">
        <div className="reports-card">
          <div className="reports-card__header">
            <div>
              <h3 className="reports-card__title">Composición de respuestas</h3>
              <span className="reports-card__subtitle">{totalResponses} respuestas clasificadas</span>
            </div>
            <span className="reports-nps-level">{level}</span>
          </div>
          {/* El puntaje va solo en el hueco del anillo. Ya no dice "/100": el
              NPS se mueve entre −100 y +100, así que "68/100" hacía leer que
              faltaban 32 puntos para el máximo cuando en realidad faltan 34.
              El signo + es lo que marca que la escala admite negativos. */}
          <PieChart
            data={BREAKDOWN.map((b) => ({ ...b, value: b.count }))}
            centerValue={npsScore > 0 ? `+${npsScore}` : `${npsScore}`}
            unit="resp."
          />
        </div>

        <div className="reports-card">
          <div className="reports-card__header">
            <div>
              <h3 className="reports-card__title">Evolución del NPS</h3>
              <span className="reports-card__subtitle">Últimos 6 meses</span>
            </div>
          </div>
          {/* baseline="auto": el NPS va de −100 a 100, así que el 0 no es su
              piso natural y forzarlo aplastaría la variación contra el techo. */}
          <TrendChart
            data={NPS_TREND}
            labels={MONTHS}
            color="orange"
            seriesName="Puntaje NPS"
            xLabel="Mes"
            yLabel="NPS"
            baseline="auto"
          />
        </div>
      </div>

      <div className="reports-stat-grid">
        {/* El color de cada tarjeta es el mismo que el de su porción en el
            anillo de arriba. Detractores estaba en navy mientras su porción era
            roja: la misma categoría con dos colores en la misma pantalla. */}
        <StatCard icon={<Icon name="smile" />} value={BREAKDOWN[0].count} label="Promotores (9-10)" trend="+8%" color="forest" />
        <StatCard icon={<Icon name="meh" />} value={BREAKDOWN[1].count} label="Pasivos (7-8)" color="gold" trendDirection="down" trend="-2%" />
        <StatCard icon={<Icon name="frown" />} value={BREAKDOWN[2].count} label="Detractores (0-6)" color="danger" trendDirection="down" trend="-3%" />
        <StatCard icon={<Icon name="users" />} value={totalResponses} label="Respuestas totales" color="orange" />
      </div>
    </div>
  );
}
