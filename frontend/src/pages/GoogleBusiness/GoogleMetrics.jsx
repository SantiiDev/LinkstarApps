import PageHeader from '../../components/PageHeader/PageHeader';
import StatCard from '../../components/StatCard/StatCard';
import TrendChart from '../../components/TrendChart/TrendChart';
import './GoogleBusiness.css';

const VIEWS_TREND = [4200, 4650, 5100, 5480, 6120, 6900, 7640, 8412];
const WEEKS = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8'];

const INTERACTIONS = [
  { label: 'Cómo llegar', value: 342, icon: 'pin' },
  { label: 'Llamar', value: 187, icon: 'phone' },
  { label: 'Visitar sitio web', value: 519, icon: 'globe' },
  { label: 'Enviar mensaje', value: 64, icon: 'message' },
];

function Icon({ name, ...rest }) {
  const props = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', ...rest };
  const icons = {
    eye: <svg {...props}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>,
    phone: <svg {...props}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" /></svg>,
    pin: <svg {...props}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>,
    globe: <svg {...props}><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>,
    message: <svg {...props}><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>,
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
          <TrendChart data={VIEWS_TREND} labels={WEEKS} color="navy" />
        </div>

        <div className="gb-side-col">
          <div className="gb-card">
            <div className="gb-card__header">
              <div>
                <h3 className="gb-card__title">Cómo te buscan</h3>
                <span className="gb-card__subtitle">Directa vs. descubrimiento</span>
              </div>
            </div>
            <div className="gb-compare">
              <div className="gb-compare__row">
                <div className="gb-compare__top">
                  <span>Búsqueda directa</span>
                  <strong>62%</strong>
                </div>
                <div className="gb-compare__bar"><div className="gb-compare__fill gb-compare__fill--orange" style={{ width: '62%' }} /></div>
              </div>
              <div className="gb-compare__row">
                <div className="gb-compare__top">
                  <span>Búsqueda por descubrimiento</span>
                  <strong>38%</strong>
                </div>
                <div className="gb-compare__bar"><div className="gb-compare__fill gb-compare__fill--navy" style={{ width: '38%' }} /></div>
              </div>
            </div>
          </div>

          <div className="gb-card">
            <div className="gb-card__header">
              <div>
                <h3 className="gb-card__title">Interacciones</h3>
                <span className="gb-card__subtitle">Acciones sobre tu ficha</span>
              </div>
            </div>
            <div className="gb-interactions">
              {INTERACTIONS.map((i) => (
                <div key={i.label} className="gb-interaction">
                  <div className="gb-interaction__icon"><Icon name={i.icon} width={16} height={16} /></div>
                  <span className="gb-interaction__label">{i.label}</span>
                  <span className="gb-interaction__value">{i.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
