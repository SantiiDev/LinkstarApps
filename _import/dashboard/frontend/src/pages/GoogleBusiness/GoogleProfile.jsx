import PageHeader from '../../components/PageHeader/PageHeader';
import './GoogleBusiness.css';

const CHECKLIST = [
  { label: 'Categoría principal', ok: true, note: 'Cafetería' },
  { label: 'Horario de atención', ok: true, note: 'Completo para los 7 días' },
  { label: 'Descripción del negocio', ok: true, note: '750/750 caracteres' },
  { label: 'Fotos del local', ok: false, note: 'Subí al menos 5 fotos más para mejorar tu ficha' },
  { label: 'Preguntas y respuestas', ok: false, note: 'Tenés 3 preguntas sin responder' },
];

const PHOTO_COLORS = ['#F58529', '#1A2639', '#10B981', '#F59E0B', '#6366f1', '#ec4899', '#8b5cf6', '#0ea5e9'];

function Icon({ name, ...rest }) {
  const props = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', ...rest };
  const icons = {
    check: <svg {...props}><polyline points="20 6 9 17 4 12" /></svg>,
    warn: <svg {...props}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>,
    edit: <svg {...props}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>,
    pin: <svg {...props}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>,
    phone: <svg {...props}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" /></svg>,
    globe: <svg {...props}><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>,
    clock: <svg {...props}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>,
    plus: <svg {...props}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>,
    info: <svg {...props}><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>,
  };
  return icons[name] || null;
}

function Stars({ rating = 4.8 }) {
  return (
    <div className="gb-profile-stars">
      {[1, 2, 3, 4, 5].map((n) => (
        <svg key={n} width={14} height={14} viewBox="0 0 24 24" fill={n <= Math.round(rating) ? '#F59E0B' : 'none'} stroke={n <= Math.round(rating) ? '#F59E0B' : 'rgba(27,26,46,0.25)'} strokeWidth="2">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      ))}
    </div>
  );
}

export default function GoogleProfile() {
  return (
    <div className="gb-page">
      <PageHeader
        eyebrow="Google Business"
        title="Perfil"
        subtitle="La información que ven tus clientes cuando encuentran tu negocio en Google"
      />

      <div className="gb-two-col">
        <div className="gb-card gb-profile-preview">
          <div className="gb-profile-preview__badge">Vista previa en Google</div>
          <div className="gb-profile-preview__row">
            <div className="gb-profile-preview__avatar">L</div>
            <div>
              <h2 className="gb-profile-preview__name">Mi Negocio · Linkstar</h2>
              <div className="gb-profile-preview__meta">
                <Stars rating={4.8} />
                <span>4.8 (213 reseñas)</span>
                <span className="gb-profile-preview__dot">·</span>
                <span>Cafetería</span>
              </div>
              <span className="gb-profile-preview__open">Abierto ahora · Cierra 22:00</span>
            </div>
          </div>

          <div className="gb-profile-preview__details">
            <div className="gb-profile-preview__detail">
              <Icon name="pin" /> Av. Corrientes 1234, CABA, Buenos Aires
            </div>
            <div className="gb-profile-preview__detail">
              <Icon name="phone" /> +54 11 4567-8901
            </div>
            <div className="gb-profile-preview__detail">
              <Icon name="globe" /> www.linkstar.com.ar
            </div>
            <div className="gb-profile-preview__detail">
              <Icon name="clock" /> Lun a Sáb · 8:00 – 22:00
            </div>
          </div>

          <div className="gb-profile-preview__spacer" />

          <button className="gb-profile-preview__edit-btn">
            <Icon name="edit" /> Editar información
          </button>
        </div>

        <div className="gb-side-col">
          <div className="gb-card">
            <div className="gb-card__header">
              <div>
                <h3 className="gb-card__title">Completá tu ficha</h3>
                <span className="gb-card__subtitle">92% completa</span>
              </div>
            </div>
            <ul className="gb-checklist">
              {CHECKLIST.map((item) => (
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
            <h3 className="gb-card__title">Fotos</h3>
            <span className="gb-card__subtitle">24 fotos publicadas</span>
          </div>
          <button type="button" className="gb-btn-primary">
            <Icon name="plus" width={15} height={15} /> Añadir foto
          </button>
        </div>

        <div className="gb-photo-notice">
          <Icon name="info" width={16} height={16} />
          <p>
            Los cambios pueden tardar entre <strong>24 y 48 hs</strong> en reflejarse en tu ficha de Google, según sus políticas de revisión.
          </p>
        </div>

        <div className="gb-photos-grid">
          {PHOTO_COLORS.map((c, i) => (
            <div key={i} className="gb-photo-tile" style={{ background: `linear-gradient(135deg, ${c}, ${c}99)` }} />
          ))}
        </div>
      </div>
    </div>
  );
}
