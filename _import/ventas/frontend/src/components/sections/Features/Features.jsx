import { useEffect, useRef } from 'react';
import './Features.css';

const features = [
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 12C2 6.48 6.48 2 12 2s10 4.48 10 10-4.48 10-10 10S2 17.52 2 12z" />
        <path d="M8 12a4 4 0 018 0" />
        <circle cx="12" cy="12" r="1" fill="currentColor" />
      </svg>
    ),
    title: 'Tecnología NFC',
    description: 'Chip NFC de última generación integrado en cada cartel. Un simple toque desde cualquier smartphone conecta al instante con tu contenido digital.',
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
      </svg>
    ),
    title: 'Diseño Premium',
    description: 'Acabados de alta calidad con materiales resistentes y elegantes. Cada cartel es una pieza que eleva la imagen de tu marca.',
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
    title: 'Instalación en Segundos',
    description: 'Sin cables, sin configuraciones complicadas. Coloca tu cartel, programa el contenido desde la plataforma y listo. Así de simple.',
  },
];

export default function Features({ onShop }) {
  const sectionRef = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('features--visible');
          }
        });
      },
      { threshold: 0.15 }
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <section className="features" id="tienda" ref={sectionRef}>
      <div className="features__inner container">
        <div className="features__header">
          <span className="features__label">¿Por qué Linkstar?</span>
          <h2 className="features__title">
            Todo lo que necesitas para <span>conectar</span> con tus clientes
          </h2>
          <p className="features__description">
            Nuestros carteles expositores combinan diseño excepcional con tecnología 
            NFC de vanguardia para crear experiencias memorables.
          </p>
        </div>

        <div className="features__grid">
          {features.map((feature, index) => (
            <div
              className="features__card"
              key={index}
              style={{ '--delay': `${index * 100}ms` }}
            >
              <div className="features__card-icon">
                {feature.icon}
              </div>
              <h3 className="features__card-title">{feature.title}</h3>
              <p className="features__card-description">{feature.description}</p>
              <div className="features__card-glow"></div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
