import PageHeader from '../../components/PageHeader/PageHeader';
import './GoogleBusiness.css';

const SCORE = 78;

const FACTORS = [
  { label: 'Categoría completa', ok: true, note: 'Cafetería configurada como categoría principal' },
  { label: 'Consistencia NAP', ok: true, note: 'Nombre, dirección y teléfono coinciden en toda la web' },
  { label: 'Reseñas respondidas', ok: true, note: '92% de tus reseñas tienen respuesta' },
  { label: 'Fotos actualizadas', ok: false, note: 'Tu última foto es de hace 45 días' },
  { label: 'Palabras clave en descripción', ok: false, note: 'Sumá términos que usan tus clientes al buscarte' },
  { label: 'Publicaciones activas', ok: true, note: '3 publicaciones vigentes' },
];

const KEYWORDS = [
  { term: 'cafetería cerca de mí', volume: 1240 },
  { term: 'mejor café centro', volume: 860 },
  { term: 'desayunos buenos aires', volume: 610 },
  { term: 'cafetería av corrientes', volume: 430 },
  { term: 'brunch cerca', volume: 310 },
];

function Icon({ name, ...rest }) {
  const props = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', ...rest };
  const icons = {
    check: <svg {...props}><polyline points="20 6 9 17 4 12" /></svg>,
    warn: <svg {...props}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>,
  };
  return icons[name] || null;
}

export default function GoogleSeoLocal() {
  const maxVolume = Math.max(...KEYWORDS.map((k) => k.volume));
  const scoreLabel = SCORE >= 80 ? 'Excelente' : SCORE >= 60 ? 'Bueno' : 'A mejorar';

  return (
    <div className="gb-page">
      <PageHeader
        eyebrow="Google Business"
        title="SEO Local"
        subtitle="Qué tan bien posicionada está tu ficha frente a los negocios cercanos"
      />

      <div className="gb-two-col">
        <div className="gb-card gb-score-card">
          <div
            className="gb-score-gauge"
            style={{ background: `conic-gradient(var(--color-orange) ${SCORE * 3.6}deg, rgba(26,38,57,0.08) 0deg)` }}
          >
            <div className="gb-score-gauge__inner">
              <span className="gb-score-gauge__value">{SCORE}</span>
              <span className="gb-score-gauge__max">/100</span>
            </div>
          </div>
          <div className="gb-score-card__label">{scoreLabel}</div>
          <p className="gb-score-card__text">
            Tu puntuación de SEO local resume qué tan optimizada está tu ficha para aparecer en búsquedas cercanas.
          </p>
        </div>

        <div className="gb-side-col">
          <div className="gb-card">
            <div className="gb-card__header">
              <div>
                <h3 className="gb-card__title">Factores de posicionamiento</h3>
                <span className="gb-card__subtitle">Lo que Google evalúa de tu ficha</span>
              </div>
            </div>
            <ul className="gb-checklist">
              {FACTORS.map((item) => (
                <li key={item.label} className={`gb-checklist__item ${item.ok ? 'gb-checklist__item--ok' : 'gb-checklist__item--warn'}`}>
                  <Icon name={item.ok ? 'check' : 'warn'} />
                  <div>
                    <div className="gb-checklist__label">{item.label}</div>
                    <div className="gb-checklist__note">{item.note}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="gb-card">
        <div className="gb-card__header">
          <div>
            <h3 className="gb-card__title">Palabras clave que te traen visibilidad</h3>
            <span className="gb-card__subtitle">Búsquedas mensuales estimadas en tu zona</span>
          </div>
        </div>
        <div className="gb-keywords">
          {KEYWORDS.map((k) => (
            <div key={k.term} className="gb-keyword-row">
              <span className="gb-keyword-row__term">{k.term}</span>
              <div className="gb-keyword-row__bar">
                <div className="gb-keyword-row__fill" style={{ width: `${(k.volume / maxVolume) * 100}%` }} />
              </div>
              <span className="gb-keyword-row__volume">{k.volume.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
