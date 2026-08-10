import { useEffect, useRef } from 'react';
import './Hero.css';

export default function Hero({ onShop, onLinkstarApp }) {
  const heroRef = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('hero--visible');
          }
        });
      },
      { threshold: 0.1 }
    );

    if (heroRef.current) {
      observer.observe(heroRef.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <section className="hero" id="inicio" ref={heroRef}>
      {/* Background decorations */}
      <div className="hero__bg-shape hero__bg-shape--1"></div>
      <div className="hero__bg-shape hero__bg-shape--2"></div>
      <div className="hero__bg-shape hero__bg-shape--3"></div>

      <div className="hero__inner container">
        <div className="hero__content">
          <div className="hero__badge">
            <span className="hero__badge-dot"></span>
            Tecnología NFC
          </div>

          <h1 className="hero__title">
            Tu marca,<br />
            <span className="hero__title-highlight">siempre visible.</span><br />
            Sin esfuerzo.
          </h1>

          <p className="hero__subtitle">
            Carteles expositores inteligentes con tecnología NFC integrada.
            Conecta con tus clientes con un simple toque y transforma cada
            punto de contacto en una experiencia digital.
          </p>

          <div className="hero__ctas">
            <a
              href="#linkstarapp"
              className="hero__cta hero__cta--primary"
              onClick={(e) => {
                e.preventDefault();
                if (onLinkstarApp) onLinkstarApp();
              }}
            >
              Descubre Linkstar
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </a>
            <a
              href="#catalogo"
              className="hero__cta hero__cta--secondary"
              onClick={(e) => { e.preventDefault(); onShop(); }}
            >
              Ver catálogo
            </a>
          </div>

          <div className="hero__stats">
            <div className="hero__stat">
              <span className="hero__stat-number">500+</span>
              <span className="hero__stat-label">Negocios confían</span>
            </div>
            <div className="hero__stat-divider"></div>
            <div className="hero__stat">
              <span className="hero__stat-number">4.9★</span>
              <span className="hero__stat-label">Valoración media</span>
            </div>
            <div className="hero__stat-divider"></div>
            <div className="hero__stat">
              <span className="hero__stat-number">ARG</span>
              <span className="hero__stat-label">Envíos a todo el país</span>
            </div>
          </div>
        </div>

        <div className="hero__image-wrapper">
          <div className="hero__image-glow"></div>
          <div className="hero__image-composite">
            <img
              src="/google-nfc-black.webp"
              alt="Cartel NFC Google"
              className="hero__image-piece hero__image-piece--1"
            />
            <img
              src="/instagram-nfc-white.webp"
              alt="Cartel NFC Instagram"
              className="hero__image-piece hero__image-piece--2"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
