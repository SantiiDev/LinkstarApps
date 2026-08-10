import { useState, useEffect, useRef } from 'react';
import './Landing.css';

/* ───────────────── FAQ DATA ───────────────── */
const faqData = [
  {
    q: '¿Qué tipo de dispositivos incluye Linkstar?',
    a: 'Linkstar trabaja con tarjetas NFC, códigos QR de expositor y stands inteligentes. Cada dispositivo dirige al cliente a dejar una reseña en Google con un solo toque o escaneo.',
  },
  {
    q: '¿Necesito conocimientos técnicos para usar la plataforma?',
    a: 'No. Linkstar está diseñado para ser intuitivo. Conectas tus dispositivos, asignas empleados y ubicaciones, y el panel te muestra todo en tiempo real.',
  },
  {
    q: '¿Puedo gestionar varias ubicaciones desde un solo panel?',
    a: 'Sí. El dashboard centraliza todas tus sucursales, dispositivos y empleados. Puedes comparar métricas por ubicación y detectar oportunidades de mejora.',
  },
  {
    q: '¿Cómo funciona la respuesta con IA?',
    a: 'La IA analiza cada reseña entrante, detecta el sentimiento y genera una respuesta personalizada con tu tono de marca. Tú revisas, ajustas si quieres, y la envías con un clic.',
  },
  {
    q: '¿Puedo cancelar en cualquier momento?',
    a: 'Sí. No hay permanencia ni contratos a largo plazo. Puedes cambiar de plan o cancelar cuando quieras desde tu panel de configuración.',
  },
];

/* ───────────────── SCROLL HELPER ───────────────── */
function scrollTo(id) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth' });
}

/* ───────────────── SCROLL REVEAL HOOK ───────────────── */
function useReveal() {
  const ref = useRef(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          node.classList.add('landing-reveal--visible');
          observer.unobserve(node);
        }
      },
      { threshold: 0.15 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return ref;
}

function RevealSection({ children, className = '', id }) {
  const ref = useReveal();
  return (
    <div ref={ref} id={id} className={`landing-reveal ${className}`}>
      {children}
    </div>
  );
}

/* ─── Navbar ────────────────────────────── */
function Navbar({ onEnterDashboard }) {
  return (
    <nav className="landing-nav">
      <div className="landing-nav__logo" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
        linkstar<span className="landing-nav__logo-dot">.</span>
      </div>

      <div className="landing-nav__links">
        <button className="landing-nav__link" onClick={() => scrollTo('features')}>Funciones</button>
        <button className="landing-nav__link" onClick={() => scrollTo('how')}>Cómo funciona</button>
        <button className="landing-nav__link" onClick={() => scrollTo('pricing')}>Planes</button>
      </div>

      <div className="landing-nav__actions">
        <button className="landing-nav__login-btn" onClick={onEnterDashboard}>
          Iniciar sesión
        </button>
        <button className="landing-nav__cta-btn" onClick={onEnterDashboard}>
          Empieza gratis
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
          </svg>
        </button>

        {/* Mobile toggle */}
        <button className="landing-nav__toggle" onClick={onEnterDashboard} aria-label="Menu">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
      </div>
    </nav>
  );
}

/* ─── Hero ──────────────────────────────── */
function Hero({ onEnterDashboard }) {
  return (
    <section className="landing-hero">
      <div className="landing-hero__content">
        <span className="landing-hero__badge">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
          Plataforma #1 de reseñas con NFC
        </span>

        <h1 className="landing-hero__title">
          Convierte cada interacción en una{' '}
          <span className="landing-hero__title-accent">reseña de Google</span>
        </h1>

        <p className="landing-hero__subtitle">
          Linkstar centraliza tus dispositivos NFC y QR, asigna empleados, monitorea escaneos y genera respuestas con IA. De una hoja de cálculo a un sistema inteligente.
        </p>

        <div className="landing-hero__actions">
          <button className="landing-hero__primary-btn" onClick={onEnterDashboard}>
            Empieza tu prueba gratis
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
            </svg>
          </button>
          <button className="landing-hero__secondary-btn" onClick={() => scrollTo('features')}>
            Ver funciones
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </div>
        <p className="landing-hero__trust-text">Sin tarjeta de crédito · Cancela cuando quieras</p>
      </div>

      {/* Glass panel mockup */}
      <div className="landing-hero__visual">
        <div className="landing-hero__panel">
          <div className="landing-hero__panel-header">
            <span className="landing-hero__panel-dot" />
            Panel de Linkstar
          </div>

          <div className="landing-hero__panel-stats">
            <div className="landing-hero__panel-stat">
              <div className="landing-hero__panel-stat-label">Escaneos</div>
              <div className="landing-hero__panel-stat-value">12,847</div>
            </div>
            <div className="landing-hero__panel-stat">
              <div className="landing-hero__panel-stat-label">Conversión</div>
              <div className="landing-hero__panel-stat-value landing-hero__panel-stat-value--orange">27.4%</div>
            </div>
            <div className="landing-hero__panel-stat">
              <div className="landing-hero__panel-stat-label">Rating</div>
              <div className="landing-hero__panel-stat-value landing-hero__panel-stat-value--green">4.8</div>
            </div>
          </div>

          {/* Mini review */}
          <div className="landing-hero__review-card">
            <div className="landing-hero__review-top">
              <div className="landing-hero__review-user">
                <div className="landing-hero__review-avatar">SM</div>
                <span className="landing-hero__review-name">Sofía M.</span>
              </div>
              <span className="landing-hero__review-stars">★★★★★</span>
            </div>
            <p className="landing-hero__review-text">"La atención fue increíble, volveré sin duda."</p>
            <div className="landing-hero__review-ai">
              <div className="landing-hero__review-ai-label">Respuesta con tu tono · IA</div>
              <p className="landing-hero__review-ai-text">
                ¡Muchas gracias, Sofía! Nos alegra saber que disfrutaste de la experiencia. Te esperamos muy pronto de vuelta.
              </p>
            </div>
            <div className="landing-hero__review-tags">
              <span className="landing-hero__review-tags-label">SEO:</span>
              <span className="landing-hero__review-tag">atención al cliente</span>
              <span className="landing-hero__review-tag">sucursal centro</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Stats ─────────────────────────────── */
function Stats() {
  return (
    <RevealSection className="landing-stats">
      <div className="landing-stats__grid">
        <div className="landing-stats__item">
          <div className="landing-stats__value">+12.000</div>
          <div className="landing-stats__label">Escaneos gestionados</div>
        </div>
        <div className="landing-stats__item">
          <div className="landing-stats__value">4.8★</div>
          <div className="landing-stats__label">Valoración media</div>
        </div>
        <div className="landing-stats__item">
          <div className="landing-stats__value">Segundos</div>
          <div className="landing-stats__label">Respuestas con IA</div>
        </div>
        <div className="landing-stats__item">
          <div className="landing-stats__value">24/7</div>
          <div className="landing-stats__label">Monitoreo automático</div>
        </div>
      </div>
    </RevealSection>
  );
}

/* ─── Features ──────────────────────────── */
function Features() {
  return (
    <RevealSection className="landing-features" id="features">
      <span className="landing-section-tag">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>
        Funciones
      </span>
      <h2 className="landing-section-title">Todo lo que necesitas, en un solo panel</h2>
      <p className="landing-section-subtitle">
        Desde la gestión de dispositivos hasta respuestas inteligentes, Linkstar tiene las herramientas para hacer crecer tu reputación online.
      </p>

      <div className="landing-features__grid">
        {/* Card 1: Dashboard */}
        <div className="landing-feature-card landing-feature-card--orange">
          <div className="landing-feature-card__icon landing-feature-card__icon--orange">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3v18h18" /><path d="M18 17V9" /><path d="M13 17V5" /><path d="M8 17v-3" />
            </svg>
          </div>
          <h3 className="landing-feature-card__title">Dashboard en tiempo real</h3>
          <p className="landing-feature-card__desc">
            Visualiza escaneos, reseñas y tasas de conversión por dispositivo, empleado y ubicación. Todo actualizado al instante.
          </p>
          <div className="landing-feature-card__mockup">
            <div className="landing-feature-card__mockup-row">
              <span className="landing-feature-card__mockup-text">Escaneos</span>
              <div className="landing-feature-card__mockup-bar landing-feature-card__mockup-bar--orange" style={{ width: '70%' }} />
              <span className="landing-feature-card__mockup-value">1,847</span>
            </div>
            <div className="landing-feature-card__mockup-row">
              <span className="landing-feature-card__mockup-text">Reseñas</span>
              <div className="landing-feature-card__mockup-bar landing-feature-card__mockup-bar--gold" style={{ width: '50%' }} />
              <span className="landing-feature-card__mockup-value">523</span>
            </div>
            <div className="landing-feature-card__mockup-row">
              <span className="landing-feature-card__mockup-text">Conversión</span>
              <div className="landing-feature-card__mockup-bar landing-feature-card__mockup-bar--forest" style={{ width: '35%' }} />
              <span className="landing-feature-card__mockup-value">28.3%</span>
            </div>
          </div>
        </div>

        {/* Card 2: IA */}
        <div className="landing-feature-card landing-feature-card--gold">
          <div className="landing-feature-card__icon landing-feature-card__icon--gold">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a4 4 0 0 1 4 4v1a3 3 0 0 1 3 3v1a2 2 0 0 1-2 2h-1" />
              <path d="M8 7V6a4 4 0 0 1 4-4" />
              <path d="M6 10a3 3 0 0 1 3-3" />
              <path d="M4 13a2 2 0 0 1 2-2" />
              <circle cx="12" cy="17" r="5" />
              <path d="M12 14v3l2 1" />
            </svg>
          </div>
          <h3 className="landing-feature-card__title">Respuestas con IA</h3>
          <p className="landing-feature-card__desc">
            La IA lee cada reseña, entiende el contexto y redacta una respuesta con tu tono de marca. Tú revisas y envías con un clic.
          </p>
          <div className="landing-feature-card__mockup">
            <div className="landing-feature-card__mockup-row">
              <div className="landing-feature-card__mockup-circle" style={{ background: 'linear-gradient(135deg, var(--color-gold), #d97706)' }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-navy)' }}>Tono configurado</div>
                <div style={{ fontSize: '0.6rem', color: 'var(--color-text-secondary)' }}>Cercano, profesional</div>
              </div>
              <div style={{ width: 28, height: 16, borderRadius: 8, background: 'var(--color-forest)' }} />
            </div>
          </div>
        </div>

        {/* Card 3: Multi-local */}
        <div className="landing-feature-card landing-feature-card--forest">
          <div className="landing-feature-card__icon landing-feature-card__icon--forest">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
            </svg>
          </div>
          <h3 className="landing-feature-card__title">Multi-local & Equipos</h3>
          <p className="landing-feature-card__desc">
            Gestiona múltiples sucursales, asigna dispositivos a empleados y compara el rendimiento entre ubicaciones.
          </p>
          <div className="landing-feature-card__mockup">
            <div className="landing-feature-card__mockup-row">
              <span className="landing-feature-card__mockup-text">Centro</span>
              <div className="landing-feature-card__mockup-bar landing-feature-card__mockup-bar--forest" style={{ width: '80%' }} />
            </div>
            <div className="landing-feature-card__mockup-row">
              <span className="landing-feature-card__mockup-text">Norte</span>
              <div className="landing-feature-card__mockup-bar landing-feature-card__mockup-bar--forest" style={{ width: '55%', opacity: 0.7 }} />
            </div>
            <div className="landing-feature-card__mockup-row">
              <span className="landing-feature-card__mockup-text">Sur</span>
              <div className="landing-feature-card__mockup-bar landing-feature-card__mockup-bar--forest" style={{ width: '35%', opacity: 0.5 }} />
            </div>
          </div>
        </div>
      </div>
    </RevealSection>
  );
}

/* ─── How It Works ──────────────────────── */
function HowItWorks() {
  return (
    <RevealSection className="landing-how" id="how">
      <span className="landing-section-tag">Cómo funciona</span>
      <h2 className="landing-section-title">En marcha en 3 simples pasos</h2>
      <p className="landing-section-subtitle">
        Configura Linkstar en minutos y empieza a recibir reseñas reales desde el día uno.
      </p>

      <div className="landing-how__grid">
        <div className="landing-step-card">
          <div className="landing-step-card__number">1</div>
          <h3 className="landing-step-card__title">Conecta tus dispositivos</h3>
          <p className="landing-step-card__desc">
            Registra tus tarjetas NFC y códigos QR en el panel. Cada dispositivo queda vinculado a una ubicación.
          </p>
        </div>
        <div className="landing-step-card">
          <div className="landing-step-card__number">2</div>
          <h3 className="landing-step-card__title">Asigna empleados</h3>
          <p className="landing-step-card__desc">
            Define tu equipo y asigna dispositivos. Linkstar trackea quién genera más reseñas y su conversión.
          </p>
        </div>
        <div className="landing-step-card">
          <div className="landing-step-card__number">3</div>
          <h3 className="landing-step-card__title">Monitorea y crece</h3>
          <p className="landing-step-card__desc">
            Visualiza métricas en tiempo real, responde reseñas con IA y haz crecer tu reputación en Google automáticamente.
          </p>
        </div>
      </div>
    </RevealSection>
  );
}

/* ─── Pricing ───────────────────────────── */
function CheckIcon({ variant = 'orange' }) {
  return (
    <span className={`landing-price-card__check landing-price-card__check--${variant}`}>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
    </span>
  );
}

// Único lugar del monorepo donde vive un precio. La página de LinkstarApp del
// sitio de ventas describe el modelo (dispositivo una vez + plataforma por mes)
// pero no repite importes, justamente para no tener dos fuentes de verdad.
const STARTER_PRICE = '$24.900';

// TODO: canal de contacto real para el plan a medida. Hoy el único que existe
// en el repo es el Instagram del footer del sitio de ventas; cuando haya un
// mail o un WhatsApp de ventas, cambiar esto por ese.
const SALES_CONTACT_URL = 'https://www.instagram.com/santisiena?igsh=MWwyeW5lYmlsNWRtNQ==';

function Pricing({ onEnterDashboard }) {
  return (
    <RevealSection className="landing-pricing" id="pricing">
      <span className="landing-section-tag">Planes</span>
      <h2 className="landing-section-title">Elige el plan que mejor se adapte</h2>
      <p className="landing-section-subtitle">
        Sin permanencia, sin letra chica. Cambiás o cancelás cuando quieras.
      </p>

      <div className="landing-pricing__grid">
        {/* Starter */}
        <div className="landing-price-card">
          <div className="landing-price-card__name">Starter</div>
          <p className="landing-price-card__desc">Ideal para un solo local con pocos dispositivos.</p>
          <div className="landing-price-card__price">
            <span className="landing-price-card__amount">{STARTER_PRICE}</span>
            <span className="landing-price-card__period">/mes</span>
          </div>
          <div className="landing-price-card__features">
            <div className="landing-price-card__feature"><CheckIcon variant="orange" /> Hasta 5 dispositivos</div>
            <div className="landing-price-card__feature"><CheckIcon variant="orange" /> 1 ubicación</div>
            <div className="landing-price-card__feature"><CheckIcon variant="orange" /> Dashboard en tiempo real</div>
            <div className="landing-price-card__feature"><CheckIcon variant="orange" /> Respuestas con IA básicas</div>
            <div className="landing-price-card__feature"><CheckIcon variant="orange" /> Soporte por email</div>
          </div>
          <button className="landing-price-card__btn landing-price-card__btn--outline" onClick={onEnterDashboard}>
            Empezar
          </button>
        </div>

        {/* A medida */}
        <div className="landing-price-card landing-price-card--featured">
          <span className="landing-price-card__badge">Varios locales</span>
          <div className="landing-price-card__name">A medida</div>
          <p className="landing-price-card__desc">Para negocios con varios locales y equipos.</p>
          <div className="landing-price-card__price">
            <span className="landing-price-card__amount">A convenir</span>
          </div>
          <div className="landing-price-card__features">
            <div className="landing-price-card__feature"><CheckIcon variant="forest" /> Dispositivos y ubicaciones según tu operación</div>
            <div className="landing-price-card__feature"><CheckIcon variant="forest" /> Ranking de empleados</div>
            <div className="landing-price-card__feature"><CheckIcon variant="forest" /> IA con tono personalizado</div>
            <div className="landing-price-card__feature"><CheckIcon variant="forest" /> Automatizaciones 24/7</div>
            <div className="landing-price-card__feature"><CheckIcon variant="forest" /> Soporte prioritario</div>
          </div>
          <a
            className="landing-price-card__btn landing-price-card__btn--solid"
            href={SALES_CONTACT_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            Consultanos
          </a>
        </div>
      </div>
    </RevealSection>
  );
}

/* ─── FAQ ───────────────────────────────── */
function FAQ({ openFaq, setOpenFaq }) {
  return (
    <RevealSection className="landing-faq" id="faq">
      <span className="landing-section-tag">Preguntas frecuentes</span>
      <h2 className="landing-section-title">Resolvemos tus dudas</h2>

      <div className="landing-faq__list">
        {faqData.map((item, i) => (
          <div key={i} className={`landing-faq__item ${openFaq === i ? 'landing-faq__item--open' : ''}`}>
            <button className="landing-faq__question" onClick={() => setOpenFaq(openFaq === i ? null : i)}>
              {item.q}
              <svg className="landing-faq__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            <div className="landing-faq__answer">
              <p className="landing-faq__answer-text">{item.a}</p>
            </div>
          </div>
        ))}
      </div>
    </RevealSection>
  );
}

/* ─── Footer CTA ────────────────────────── */
function FooterCTA({ onEnterDashboard }) {
  return (
    <RevealSection className="landing-footer-cta">
      <div className="landing-footer-cta__bg">
        <h2 className="landing-footer-cta__title">
          Tu reputación en Google, en piloto inteligente
        </h2>
        <p className="landing-footer-cta__subtitle">
          Empieza tu prueba gratis. No pagas nada hasta que estés listo, y cancelas cuando quieras.
        </p>
        <button className="landing-footer-cta__btn" onClick={onEnterDashboard}>
          Empieza tu prueba gratis
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
          </svg>
        </button>
      </div>
    </RevealSection>
  );
}

/* ─── Footer ────────────────────────────── */
function Footer() {
  return (
    <footer className="landing-footer">
      <div className="landing-footer__brand">
        linkstar<span className="landing-footer__brand-dot">.</span>
      </div>
      <p className="landing-footer__copy">© 2026 linkstar — Panel de gestión de reseñas con NFC inteligente</p>
    </footer>
  );
}

/* ═══════════════════════════════════════════
   LANDING PAGE COMPONENT
   ═══════════════════════════════════════════ */
export default function Landing({ onEnterDashboard }) {
  const [openFaq, setOpenFaq] = useState(null);

  return (
    <div className="landing-page">
      <Navbar onEnterDashboard={onEnterDashboard} />
      <Hero onEnterDashboard={onEnterDashboard} />
      <Stats />
      <Features />
      <HowItWorks />
      <Pricing onEnterDashboard={onEnterDashboard} />
      <FAQ openFaq={openFaq} setOpenFaq={setOpenFaq} />
      <FooterCTA onEnterDashboard={onEnterDashboard} />
      <Footer />
    </div>
  );
}
