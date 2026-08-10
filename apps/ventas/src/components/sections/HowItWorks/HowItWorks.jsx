import { useEffect, useRef } from 'react';
import './HowItWorks.css';

const steps = [
  {
    number: '01',
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="3" />
        <path d="M9 9h6M9 12h6M9 15h4" />
      </svg>
    ),
    title: 'Escanea el QR de tu dispositivo',
    description: 'Cuando recibas tu Linkstar, escanea el código QR impreso en el cartel para activarlo por primera vez.',
  },
  {
    number: '02',
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
        <circle cx="12" cy="9" r="2.5" />
      </svg>
    ),
    title: 'Escribe el nombre de tu negocio en Google Maps',
    description: 'Te llevará a la plataforma LinkstarApp. Busca tu negocio en el buscador conectado a Google Maps y guarda la opción correcta.',
  },
  {
    number: '03',
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 12C2 6.48 6.48 2 12 2s10 4.48 10 10-4.48 10-10 10S2 17.52 2 12z" />
        <path d="M8 12a4 4 0 018 0" />
        <circle cx="12" cy="12" r="1" fill="currentColor" />
      </svg>
    ),
    title: '¡Tu Linkstar ya está listo!',
    description: 'Así de fácil. Ahora, cuando un cliente acerque el móvil, lo llevará directo a dejar su reseña en Google.',
  },
];

export default function HowItWorks({ onShop }) {
  const sectionRef = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('how--visible');
          }
        });
      },
      { threshold: 0.15 }
    );
    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section className="how" id="plataforma" ref={sectionRef}>
      <div className="how__inner container">
        <div className="how__header">
          <span className="how__label">Así de fácil</span>
          <h2 className="how__title">
            Conecta tu Linkstar en <span>20 segundos</span>
          </h2>
          <p className="how__description">
            Vincula tu dispositivo con tu negocio en Google Maps en menos de un minuto. El proceso es tan sencillo que lo tendrás listo antes de lo que imaginas.
          </p>
        </div>

        <div className="how__steps">
          {steps.map((step, i) => (
            <div
              className="how__step"
              key={i}
              style={{ '--delay': `${i * 120}ms` }}
            >
              {/* Connector line between steps */}
              {i < steps.length - 1 && (
                <div className="how__connector" aria-hidden="true">
                  <svg viewBox="0 0 120 20" preserveAspectRatio="none">
                    <path d="M0 10 Q60 0 120 10" stroke="currentColor" strokeWidth="2" fill="none" strokeDasharray="6 4" />
                  </svg>
                </div>
              )}

              <div className="how__step-card">
                <div className="how__step-number">{step.number}</div>
                <div className="how__step-icon">{step.icon}</div>
                <h3 className="how__step-title">{step.title}</h3>
                <p className="how__step-description">{step.description}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="how__cta">
          <a href="#tienda" className="how__cta-btn" onClick={(e) => { e.preventDefault(); onShop && onShop(); }}>
            Empezar ahora
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </a>
        </div>
      </div>
    </section>
  );
}
