import PageHeader from '../../components/PageHeader/PageHeader';
import StatCard from '../../components/StatCard/StatCard';
import TrendChart from '../../components/TrendChart/TrendChart';
import { SPLIT_2 } from '../../lib/chartColors';
import './GoogleBusiness.css';

/* Las dos formas de llegar a la ficha suman 100%: es una partición, no dos
   medidas sueltas. Se guarda sólo el porcentaje porque es el único dato que
   hay — inventarle conteos para que "cierre" con las vistas de arriba sería
   fabricar números en una pantalla que todavía es mock. */
const SEARCH_SPLIT = [
  { label: 'Búsqueda directa', hint: 'te buscan por tu nombre', pct: 62, color: SPLIT_2[0] },
  { label: 'Por descubrimiento', hint: 'te encuentran por rubro o zona', pct: 38, color: SPLIT_2[1] },
];

const VIEWS_TREND = [4200, 4650, 5100, 5480, 6120, 6900, 7640, 8412];
const WEEKS = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8'];

/* Interacciones que no se solapan con las 4 KPI cards de arriba
   (vistas, llamadas, cómo llegar, sitio web) — para no repetir los
   mismos números en dos lugares distintos de la misma pantalla.

   Ordenadas de mayor a menor: es un ranking, y con 25× de diferencia entre
   la primera y la última una lista de números sueltos no dejaba ver eso. */
const INTERACTIONS = [
  { label: 'Enviar mensaje', value: 64, icon: 'message' },
  { label: 'Guardar ficha', value: 128, icon: 'bookmark' },
  { label: 'Ver fotos', value: 940, icon: 'image' },
  { label: 'Compartir ficha', value: 37, icon: 'share' },
].sort((a, b) => b.value - a.value);

const MAX_INTERACTION = Math.max(...INTERACTIONS.map((i) => i.value));
const NUM_FORMAT = new Intl.NumberFormat('es-AR');

function Icon({ name, ...rest }) {
  const props = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', ...rest };
  const icons = {
    eye: <svg {...props}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>,
    phone: <svg {...props}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" /></svg>,
    pin: <svg {...props}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>,
    globe: <svg {...props}><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>,
    message: <svg {...props}><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>,
    bookmark: <svg {...props}><path d="M19 21 12 16l-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>,
    image: <svg {...props}><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></svg>,
    share: <svg {...props}><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" /></svg>,
  };
  return icons[name] || null;
}

export default function GoogleMetrics() {
  return (
    <div className="gb-page">
      <PageHeader
        eyebrow="Google Business"
        title="Métricas"
        subtitle="Cómo te encuentran y qué hacen los clientes en tu ficha de Google"
      />

      <div className="gb-stat-grid">
        <StatCard icon={<Icon name="eye" />} value="8,412" label="Vistas del perfil" trend="+14%" color="navy" />
        <StatCard icon={<Icon name="phone" />} value="187" label="Llamadas realizadas" trend="+22%" color="forest" />
        <StatCard icon={<Icon name="pin" />} value="342" label="Clics en 'Cómo llegar'" trend="+6%" color="orange" />
        <StatCard icon={<Icon name="globe" />} value="519" label="Visitas al sitio web" trend="+11%" color="gold" />
      </div>

      <div className="gb-two-col">
        <div className="gb-card chart-card">
          <div className="gb-card__header">
            <div>
              <h3 className="gb-card__title">Vistas del perfil</h3>
              <span className="gb-card__subtitle">Últimas 8 semanas</span>
            </div>
          </div>
          <TrendChart
            data={VIEWS_TREND}
            labels={WEEKS}
            color="orange"
            seriesName="Vistas del perfil"
            xLabel="Semana"
            yLabel="Vistas"
          />
        </div>

        <div className="gb-side-col">
          <div className="gb-card">
            <div className="gb-card__header">
              <div>
                <h3 className="gb-card__title">Cómo te buscan</h3>
                <span className="gb-card__subtitle">Directa vs. descubrimiento</span>
              </div>
            </div>
            <div className="gb-split">
              <div
                className="gb-split__bar"
                role="img"
                aria-label={SEARCH_SPLIT.map((s) => `${s.label} ${s.pct}%`).join(', ')}
              >
                {SEARCH_SPLIT.map((s) => (
                  <div
                    key={s.label}
                    className="gb-split__seg"
                    /* Se le descuenta a cada tramo su parte del corte de 2px,
                       para que la suma siga midiendo exactamente el 100% del
                       riel y el último no quede recortado. */
                    style={{
                      width: `calc(${s.pct}% - ${(2 * (SEARCH_SPLIT.length - 1)) / SEARCH_SPLIT.length}px)`,
                      background: s.color,
                    }}
                  />
                ))}
              </div>
              <ul className="gb-split__legend">
                {SEARCH_SPLIT.map((s) => (
                  <li key={s.label} className="gb-split__legend-item">
                    <span className="gb-split__dot" style={{ background: s.color }} />
                    <span className="gb-split__label">
                      {s.label}
                      <span className="gb-split__hint">{s.hint}</span>
                    </span>
                    <span className="gb-split__pct">{s.pct}%</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="gb-card">
            <div className="gb-card__header">
              <div>
                <h3 className="gb-card__title">Interacciones</h3>
                <span className="gb-card__subtitle">Acciones sobre tu ficha, de mayor a menor</span>
              </div>
            </div>
            {/* Una sola medida (cantidad de acciones) repartida entre cuatro
                categorías: barras de un mismo color, porque la categoría ya la
                dice la etiqueta. Darle un color distinto a cada fila sugeriría
                que el color significa algo, y acá no significa nada. */}
            <div className="gb-interactions">
              {INTERACTIONS.map((i) => (
                <div key={i.label} className="gb-interaction">
                  <div className="gb-interaction__icon"><Icon name={i.icon} width={16} height={16} /></div>
                  <span className="gb-interaction__label">{i.label}</span>
                  <div className="gb-interaction__bar">
                    <div
                      className="gb-interaction__fill"
                      style={{ width: `max(3px, ${(i.value / MAX_INTERACTION) * 100}%)` }}
                    />
                  </div>
                  <span className="gb-interaction__value">{NUM_FORMAT.format(i.value)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
