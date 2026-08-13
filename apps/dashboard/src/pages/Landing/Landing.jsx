import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { SALES_CONTACT_URL } from '../../lib/config';
import { formatArs } from '../../lib/format';
import './Landing.css';

/* ───────────────── FAQ DATA ───────────────── */
const faqData = [
  {
    q: '¿Qué tipo de dispositivos incluye Linkstar?',
    a: 'Linkstar trabaja con expositores NFC/QR. Cada dispositivo dirige al cliente a dejar una reseña en Google con un solo toque o escaneo.',
  },
  {
    q: '¿Necesito conocimientos técnicos para usar la plataforma?',
    a: 'No. Linkstar está diseñado para ser intuitivo. Conectas tus dispositivos, asigna ubicaciones, y el panel te muestra todo en tiempo real.',
  },
  {
    q: '¿Puedo gestionar varias ubicaciones desde un solo panel?',
    a: 'Sí. El dashboard centraliza todas tus sucursales y dispositivos. Puedes comparar métricas por ubicación y detectar oportunidades de mejora.',
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

function RevealSection({ children, className = '', id, bg }) {
  const ref = useReveal();
  return (
    <div ref={ref} id={id} className={`landing-reveal landing-section${bg ? ` landing-section--${bg}` : ''}`}>
      <div className={className}>{children}</div>
    </div>
  );
}

/* ─── Navbar ────────────────────────────── */
const NAV_LINKS = [
  { id: 'features', label: 'Funciones' },
  { id: 'how', label: 'Cómo funciona' },
  { id: 'pricing', label: 'Planes' },
];
const NAV_SECTION_IDS = NAV_LINKS.map((link) => link.id);

function useActiveSection(ids) {
  const [activeId, setActiveId] = useState(null);
  useEffect(() => {
    const elements = ids.map((id) => document.getElementById(id)).filter(Boolean);
    if (!elements.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActiveId(entry.target.id);
        });
      },
      { rootMargin: '-45% 0px -50% 0px', threshold: 0 },
    );
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [ids]);
  return activeId;
}

function Navbar({ onEnterDashboard }) {
  const activeSection = useActiveSection(NAV_SECTION_IDS);
  // Mismo comportamiento que el navbar del sitio de ventas: fondo plano arriba
  // de todo y sombra + blur apenas se scrollea.
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // El drawer es fixed y tapa toda la ventana: sin esto el fondo se sigue
  // scrolleando por detrás.
  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const handleKeyDown = (e) => { if (e.key === 'Escape') setMenuOpen(false); };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [menuOpen]);

  // El scroll suave arranca recién en el frame siguiente: mientras el menú está
  // abierto el body tiene overflow:hidden y scrollIntoView no haría nada.
  const goToSection = (id) => {
    setMenuOpen(false);
    requestAnimationFrame(() => scrollTo(id));
  };

  const handleEnterDashboard = () => {
    setMenuOpen(false);
    onEnterDashboard();
  };

  return (
    <nav className={`landing-nav ${scrolled ? 'landing-nav--scrolled' : ''} ${menuOpen ? 'landing-nav--menu-open' : ''}`}>
      <div className="landing-nav__inner">
        <div className="landing-nav__logo" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
          <span className="landing-nav__logo-text">linkstar</span>
          <span className="landing-nav__logo-dot" />
        </div>

        <div className="landing-nav__links">
          {NAV_LINKS.map((link) => (
            <button
              key={link.id}
              className={`landing-nav__link ${activeSection === link.id ? 'landing-nav__link--active' : ''}`}
              onClick={() => scrollTo(link.id)}
            >
              {link.label}
            </button>
          ))}
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
          <button
            className={`landing-nav__toggle ${menuOpen ? 'landing-nav__toggle--open' : ''}`}
            onClick={() => setMenuOpen((open) => !open)}
            aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={menuOpen}
            aria-controls="landing-mobile-menu"
          >
            <span className="landing-nav__toggle-bar" />
            <span className="landing-nav__toggle-bar" />
            <span className="landing-nav__toggle-bar" />
          </button>
        </div>
      </div>

      {/* Menú mobile: las mismas tres secciones del navbar de escritorio */}
      <div
        id="landing-mobile-menu"
        className={`landing-nav__mobile ${menuOpen ? 'landing-nav__mobile--open' : ''}`}
      >
        {NAV_LINKS.map((link) => (
          <button
            key={link.id}
            className={`landing-nav__mobile-link ${activeSection === link.id ? 'landing-nav__mobile-link--active' : ''}`}
            onClick={() => goToSection(link.id)}
            tabIndex={menuOpen ? 0 : -1}
          >
            {link.label}
          </button>
        ))}

        <div className="landing-nav__mobile-actions">
          <button className="landing-nav__login-btn" onClick={handleEnterDashboard} tabIndex={menuOpen ? 0 : -1}>
            Iniciar sesión
          </button>
          <button className="landing-nav__cta-btn" onClick={handleEnterDashboard} tabIndex={menuOpen ? 0 : -1}>
            Empieza gratis
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
            </svg>
          </button>
        </div>
      </div>

      {menuOpen && <div className="landing-nav__overlay" onClick={() => setMenuOpen(false)} />}
    </nav>
  );
}

/* ─── Hero ──────────────────────────────── */
function Hero({ onEnterDashboard }) {
  return (
    <div className="landing-section landing-section--light landing-hero-block">
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

      {/* La barra de stats vive dentro del bloque del hero: juntos ocupan
          exactamente el alto de la ventana, así la sección oscura de abajo
          no asoma antes de scrollear. */}
      <Stats />
    </div>
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
function FeatureCard({ size = 'sm', variant, icon, title, desc, children }) {
  return (
    <div className={`landing-feature-card landing-feature-card--${variant} landing-feature-card--${size}`}>
      <div className={`landing-feature-card__icon landing-feature-card__icon--${variant}`}>{icon}</div>
      <h3 className="landing-feature-card__title">{title}</h3>
      <p className="landing-feature-card__desc">{desc}</p>
      {children}
    </div>
  );
}

function Features() {
  return (
    <RevealSection className="landing-features" id="features" bg="dark">
      <span className="landing-section-tag">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>
        Funciones
      </span>
      <h2 className="landing-section-title">Todo lo que vas a poder hacer con Linkstar</h2>
      <p className="landing-section-subtitle">
        Desde el panel general de tu negocio hasta las automatizaciones que te ahorran trabajo. Esto es lo que te espera adentro.
      </p>

      <div className="landing-features__bento">
        {/* Mi empresa */}
        <FeatureCard
          size="lg"
          variant="orange"
          title="Dejá de armar planillas para saber cómo va tu negocio"
          desc="Un panel con el pulso de tu negocio: locales, equipo y reputación, todo en una sola pantalla."
          icon={
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9V7l2-4h14l2 4v2" /><path d="M3 9a2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0" /><path d="M4 9v10a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9" /><path d="M9 22V13h6v9" />
            </svg>
          }
        >
          <div className="landing-feature-card__mockup">
            <div className="landing-feature-card__mockup-row">
              <span className="landing-feature-card__mockup-text">Escaneos</span>
              <div className="landing-feature-card__mockup-bar landing-feature-card__mockup-bar--orange" style={{ '--w': '32%', '--wh': '78%' }} />
              <span className="landing-feature-card__mockup-value">1,847</span>
            </div>
            <div className="landing-feature-card__mockup-row">
              <span className="landing-feature-card__mockup-text">Reseñas</span>
              <div className="landing-feature-card__mockup-bar landing-feature-card__mockup-bar--gold" style={{ '--w': '24%', '--wh': '54%' }} />
              <span className="landing-feature-card__mockup-value">523</span>
            </div>
            <div className="landing-feature-card__mockup-row">
              <span className="landing-feature-card__mockup-text">Conversión</span>
              <div className="landing-feature-card__mockup-bar landing-feature-card__mockup-bar--forest" style={{ '--w': '18%', '--wh': '38%' }} />
              <span className="landing-feature-card__mockup-value">28.3%</span>
            </div>
          </div>
        </FeatureCard>

        {/* Dispositivos */}
        <FeatureCard
          size="lg"
          variant="gold"
          title="Descubrí qué dispositivo te trae más reseñas"
          desc="Cada tarjeta NFC y código QR queda asociado a un local y un empleado, así sabés qué está funcionando de verdad."
          icon={
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.59 13.41 13.42 20.6a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82Z" /><circle cx="7" cy="7" r="1.5" />
            </svg>
          }
        >
          <div className="landing-feature-card__mockup">
            <div className="landing-feature-card__mockup-row">
              <span className="landing-feature-card__mockup-text">Mesa 4 · QR</span>
              <div className="landing-feature-card__mockup-bar landing-feature-card__mockup-bar--gold" style={{ '--w': '30%', '--wh': '88%' }} />
              <span className="landing-feature-card__mockup-pulse" />
            </div>
            <div className="landing-feature-card__mockup-row">
              <span className="landing-feature-card__mockup-text">Mostrador · NFC</span>
              <div className="landing-feature-card__mockup-bar landing-feature-card__mockup-bar--gold" style={{ '--w': '22%', '--wh': '60%', opacity: 0.75 }} />
            </div>
            <div className="landing-feature-card__mockup-row">
              <span className="landing-feature-card__mockup-text">Mesa 9 · QR</span>
              <div className="landing-feature-card__mockup-bar landing-feature-card__mockup-bar--gold" style={{ '--w': '14%', '--wh': '40%', opacity: 0.55 }} />
            </div>
          </div>
        </FeatureCard>

        {/* Reseñas */}
        <FeatureCard
          size="sm"
          variant="forest"
          title="Dejá de perseguir reseñas a mano"
          desc="Centralizá tus reseñas de Google y respondé más rápido, sin entrar a cada una por separado."
          icon={
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          }
        >
          <div className="landing-feature-card__mockup landing-feature-card__mockup--reply">
            <div className="landing-feature-card__mockup-row">
              <span className="landing-feature-card__mockup-stars">★★★★★</span>
            </div>
            <p className="landing-feature-card__mockup-quote">"La atención fue increíble, volveré sin duda."</p>
            <div className="landing-feature-card__mockup-reply">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              Respondida
            </div>
          </div>
        </FeatureCard>

        {/* Google Business */}
        <FeatureCard
          size="sm"
          variant="orange"
          title="Que te encuentren, y que les guste lo que ven"
          desc="Gestioná la información de tu perfil para que cada cliente vea lo mejor de tu negocio antes de elegirte."
          icon={
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
            </svg>
          }
        >
          <div className="landing-feature-card__mockup landing-feature-card__mockup--shine">
            <div className="landing-feature-card__mockup-row">
              <div className="landing-feature-card__mockup-circle" style={{ background: 'linear-gradient(135deg, var(--color-orange), var(--color-orange-hover))' }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-navy)' }}>Tu negocio</div>
                <div style={{ fontSize: '0.6rem', color: 'var(--color-text-secondary)' }}>★ 4.8 · 230 reseñas</div>
              </div>
            </div>
          </div>
        </FeatureCard>

        {/* Reportes */}
        <FeatureCard
          size="sm"
          variant="gold"
          title="Enterate qué está funcionando (y qué no)"
          desc="Comparalos por local, empleado o período y tomá decisiones con datos, no con corazonadas."
          icon={
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" />
            </svg>
          }
        >
          <div className="landing-feature-card__mockup">
            <svg className="landing-feature-card__sparkline" viewBox="0 0 100 32" preserveAspectRatio="none">
              <polyline points="0,26 15,22 30,24 45,13 60,17 75,6 100,9" fill="none" stroke="var(--color-gold)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </FeatureCard>

        {/* Automatizaciones */}
        <FeatureCard
          size="sm"
          variant="forest"
          title="Menos tareas repetitivas, más tiempo para tu negocio"
          desc="Configurá reglas simples y dejá que Linkstar se encargue del trabajo repetitivo por vos."
          icon={
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
          }
        >
          <div className="landing-feature-card__mockup landing-feature-card__mockup--automation">
            <span className="landing-feature-card__mockup-text">Responder reseñas 5★</span>
            <span className="landing-feature-card__toggle"><span className="landing-feature-card__toggle-dot" /></span>
          </div>
        </FeatureCard>
      </div>
    </RevealSection>
  );
}

/* ─── How It Works ──────────────────────── */
function StepArrow() {
  return (
    <span className="landing-step-arrow" aria-hidden="true">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </span>
  );
}

function StepCard({ variant, step, icon, title, desc, time }) {
  return (
    <div className={`landing-step-card landing-step-card--${variant}`}>
      <div className={`landing-step-card__icon landing-step-card__icon--${variant}`}>{icon}</div>
      <span className="landing-step-card__step">Paso {step}</span>
      <h3 className="landing-step-card__title">{title}</h3>
      <p className="landing-step-card__desc">{desc}</p>
      <span className="landing-step-card__time">{time}</span>
    </div>
  );
}

function HowItWorks() {
  return (
    <RevealSection className="landing-how" id="how" bg="light">
      <span className="landing-section-tag">Cómo funciona</span>
      <h2 className="landing-section-title">En marcha en 3 simples pasos</h2>
      <p className="landing-section-subtitle">
        Configura Linkstar en minutos y empieza a recibir reseñas reales desde el día uno.
      </p>

      <div className="landing-how__grid">
        <StepCard
          variant="orange"
          step="1"
          title="Conectá tu ficha de Google"
          desc="Sumá el link de reseñas de tu negocio para que cada escaneo lleve directo ahí."
          time="⏱ 1 min"
          icon={
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
            </svg>
          }
        />
        <StepArrow />
        <StepCard
          variant="gold"
          step="2"
          title="Conecta tus dispositivos"
          desc="Registra tus tarjetas NFC y códigos QR en el panel. Cada dispositivo queda vinculado a una ubicación."
          time="⏱ 5 min"
          icon={
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.59 13.41 13.42 20.6a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82Z" /><circle cx="7" cy="7" r="1.5" />
            </svg>
          }
        />
        <StepArrow />
        <StepCard
          variant="forest"
          step="3"
          title="Monitorea y crece"
          desc="Visualiza métricas en tiempo real, responde reseñas con IA y haz crecer tu reputación en Google automáticamente."
          time="● Continuo"
          icon={
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" />
            </svg>
          }
        />
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

// Los precios y los límites de cada plan salen de la tabla `plans` — la misma
// que lee el selector del alta, así que la vitrina y lo que se cobra no pueden
// separarse. La política plans_public_select (0006) deja leerla sin sesión,
// que es justo lo que necesita esta página.
//
// PRICING_FALLBACK es sólo para cuando la consulta falla: la landing es la
// puerta de entrada del producto y no puede quedarse sin sección de precios
// porque Supabase tardó. Mismo criterio que las páginas del panel, que caen a
// datos de ejemplo únicamente si la query tira error.
const PRICING_FALLBACK = [
  {
    code: 'free',
    name: 'Gratis',
    description: 'Incluido con tu expositor. Para empezar a medir desde el primer día.',
    price_ars: 0,
    checkout_mode: 'free',
    trial_days: 0,
    features: {
      highlights: [
        'Hasta 3 dispositivos',
        '1 ubicación',
        'Escaneos y reseñas estimadas en tiempo real',
        '30 días de historial',
        'Soporte por email',
      ],
    },
  },
  {
    code: 'business',
    name: 'Business',
    description: 'Analizá, gestioná y automatizá tu empresa.',
    price_ars: 24900,
    checkout_mode: 'subscription',
    trial_days: 7,
    features: {
      highlights: [
        'Hasta 25 dispositivos',
        'Hasta 5 ubicaciones',
        'Reportes de NPS, sentimiento y palabras clave',
        'Automatizaciones e informes mensuales',
        'Métricas de Google Business Profile',
        '1 año de historial',
        'Soporte prioritario',
      ],
    },
  },
  {
    code: 'enterprise',
    name: 'Enterprise',
    description: 'A medida para empresas y cadenas con más de 30 locales.',
    price_ars: 0,
    checkout_mode: 'contact',
    trial_days: 0,
    features: {
      highlights: [
        'Ubicaciones y dispositivos ilimitados',
        'Comparativas entre locales y regiones',
        'Integraciones y exportación de datos',
        '3 años de historial',
        'Onboarding y soporte dedicado',
      ],
    },
  },
];

const PRICING_EXTRAS = [
  {
    variant: 'orange',
    title: 'Controlá todas tus reseñas',
    items: [
      'Unificá las reseñas de todas tus ubicaciones en un solo lugar.',
      'Respondé más rápido, con ayuda de IA.',
      'Enterate apenas entra una reseña nueva.',
    ],
  },
  {
    variant: 'gold',
    title: 'Potenciá tu ficha de Google',
    items: [
      'Editá los datos de tu perfil: horarios, fotos, contacto.',
      'Mirá cuántos clientes llegan a través de tu ficha.',
      'Mantené tu información al día en todos tus locales.',
    ],
  },
  {
    variant: 'forest',
    title: 'Analizá y delegá',
    items: [
      'Comparalos por local, empleado o período.',
      'Descargá reportes cuando los necesites.',
      'Sumá a tu equipo con su propio acceso.',
    ],
  },
];

function PriceCard({ plan, onEnterDashboard }) {
  const featured = plan.checkout_mode === 'subscription';
  const highlights = plan.features?.highlights ?? [];
  const variant = featured ? 'forest' : 'orange';

  return (
    <div className={'landing-price-card' + (featured ? ' landing-price-card--featured' : '')}>
      {featured && plan.trial_days > 0 && (
        <span className="landing-price-card__badge">{plan.trial_days} días gratis</span>
      )}

      <div className="landing-price-card__name">{plan.name}</div>
      <p className="landing-price-card__desc">{plan.description}</p>

      <div className="landing-price-card__price">
        {plan.checkout_mode === 'contact' ? (
          <span className="landing-price-card__amount landing-price-card__amount--sm">A convenir</span>
        ) : Number(plan.price_ars) > 0 ? (
          <>
            <span className="landing-price-card__amount">{formatArs(plan.price_ars)}</span>
            <span className="landing-price-card__period">/mes</span>
          </>
        ) : (
          <>
            <span className="landing-price-card__amount">$0</span>
            <span className="landing-price-card__period">/mes</span>
          </>
        )}
      </div>

      {featured && plan.trial_days > 0 && (
        <p className="landing-price-card__note">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
          Primer cobro a los {plan.trial_days} días. Sin permanencia.
        </p>
      )}

      <div className="landing-price-card__features">
        {highlights.map((item) => (
          <div key={item} className="landing-price-card__feature">
            <CheckIcon variant={variant} /> {item}
          </div>
        ))}
      </div>

      {plan.checkout_mode === 'contact' ? (
        <a
          className="landing-price-card__btn landing-price-card__btn--outline"
          href={SALES_CONTACT_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          Contactar con ventas
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
        </a>
      ) : (
        <button
          className={
            'landing-price-card__btn ' +
            (featured ? 'landing-price-card__btn--solid' : 'landing-price-card__btn--outline')
          }
          onClick={onEnterDashboard}
        >
          {featured && plan.trial_days > 0 ? `Probar ${plan.trial_days} días gratis` : 'Empezar gratis'}
        </button>
      )}
    </div>
  );
}

function Pricing({ onEnterDashboard }) {
  const [plans, setPlans] = useState(PRICING_FALLBACK);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from('plans')
        .select('code, name, description, price_ars, checkout_mode, trial_days, features')
        .eq('is_public', true)
        .order('sort_order', { ascending: true });

      // Ante error o catálogo vacío se deja el fallback: mostrar una sección
      // de precios en blanco es peor que mostrar precios de hace un deploy.
      if (cancelled || error || !data?.length) return;
      setPlans(data);
    })();

    return () => { cancelled = true; };
  }, []);

  return (
    <RevealSection className="landing-pricing" id="pricing" bg="dark">
      <span className="landing-section-tag">Planes</span>
      <h2 className="landing-section-title">Elige el plan que mejor se adapte</h2>
      <p className="landing-section-subtitle">
        Sin permanencia, sin letra chica. Cambiás o cancelás cuando quieras.
      </p>

      <div className="landing-pricing__grid">
        {plans.map((plan) => (
          <PriceCard key={plan.code} plan={plan} onEnterDashboard={onEnterDashboard} />
        ))}
      </div>

      <p className="landing-pricing__fine-print">
        El plan gratis viene incluido con tu expositor y no pide tarjeta. Los planes pagos arrancan con
        días de prueba sin cargo y se cancelan cuando quieras.
      </p>

      <div className="landing-pricing__extra">
        <p className="landing-pricing__extra-heading">
          Con tu plan ya tenés el panel completo. <span className="landing-pricing__extra-highlight">Y además:</span>
        </p>

        <div className="landing-pricing__extra-grid">
          {PRICING_EXTRAS.map((box) => (
            <div key={box.title} className="landing-pricing__extra-box">
              <h4 className="landing-pricing__extra-box-title">{box.title}</h4>
              <ul className="landing-pricing__extra-box-list">
                {box.items.map((item) => (
                  <li key={item}>
                    <CheckIcon variant={box.variant} />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </RevealSection>
  );
}

/* ─── FAQ ───────────────────────────────── */
// Mismo patrón que apps/ventas FAQ.jsx: tarjetas blancas independientes con
// ícono "+/×" en vez del acordeón de bordes planos que tenía antes. El alto
// real de la respuesta se mide con un ref después de montar (no en el primer
// render, donde contentRef.current todavía es null) para que el ítem que
// arranca abierto no quede colapsado en max-height: 0.
function FAQItem({ q, a, isOpen, onClick }) {
  const contentRef = useRef(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (isOpen && contentRef.current) {
      setHeight(contentRef.current.scrollHeight);
    }
  }, [isOpen]);

  return (
    <div className={`landing-faq__item ${isOpen ? 'landing-faq__item--open' : ''}`}>
      <button className="landing-faq__question" onClick={onClick} aria-expanded={isOpen}>
        <span>{q}</span>
        <span className="landing-faq__icon">
          <span className="landing-faq__icon-bar landing-faq__icon-bar--h" />
          <span className="landing-faq__icon-bar landing-faq__icon-bar--v" />
        </span>
      </button>
      <div className="landing-faq__answer-wrapper" style={{ maxHeight: isOpen ? `${height}px` : '0px' }}>
        <div className="landing-faq__answer" ref={contentRef}>
          <p className="landing-faq__answer-text">{a}</p>
        </div>
      </div>
    </div>
  );
}

function FAQ({ openFaq, setOpenFaq }) {
  return (
    <RevealSection className="landing-faq" id="faq" bg="light">
      <span className="landing-section-tag">Preguntas frecuentes</span>
      <h2 className="landing-section-title">Resolvemos tus dudas</h2>

      <div className="landing-faq__list">
        {faqData.map((item, i) => (
          <FAQItem
            key={i}
            q={item.q}
            a={item.a}
            isOpen={openFaq === i}
            onClick={() => setOpenFaq(openFaq === i ? null : i)}
          />
        ))}
      </div>
    </RevealSection>
  );
}

/* ─── Footer ────────────────────────────── */
function Footer() {
  return (
    <div className="landing-section landing-section--dark">
      <footer className="landing-footer">
        <div className="landing-footer__brand">
          linkstar<span className="landing-footer__brand-dot">.</span>
        </div>
        <p className="landing-footer__copy">© 2026 linkstar — Panel de gestión de reseñas con NFC inteligente</p>
      </footer>
    </div>
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
      <Features />
      <HowItWorks />
      <Pricing onEnterDashboard={onEnterDashboard} />
      <FAQ openFaq={openFaq} setOpenFaq={setOpenFaq} />
      <Footer />
    </div>
  );
}
