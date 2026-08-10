import { useEffect, useRef } from 'react';
import './ReviewsCTA.css';

const stats = [
  { value: '4.9★', label: 'Valoración en Google' },
  { value: '3×', label: 'Más reseñas en 30 días' },
  { value: '91%', label: 'Clientes convencidos' },
];

export default function ReviewsCTA({ onShop }) {
  const sectionRef = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) e.target.classList.add('rcta--visible');
        });
      },
      { threshold: 0.15 }
    );
    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section className="rcta" ref={sectionRef}>
      <div className="rcta__inner container">
        <div className="rcta__content">
          <div className="rcta__left">
            <span className="rcta__label">Reseñas que venden</span>
            <h2 className="rcta__title">
              ¿Por qué necesito <span>más reseñas?</span>
            </h2>
            <p className="rcta__text">
              El <strong>83% de los consumidores</strong> leen reseñas online antes de elegir un negocio local.
              Con Linkstar, cada cliente que toca tu cartel puede dejar su valoración en segundos — sin fricción,
              sin excusas.
            </p>
            <p className="rcta__text">
              Más reseñas = mejor posicionamiento en Google = más clientes. Así de directo.
            </p>
            <a href="#tienda" className="rcta__btn" onClick={(e) => { e.preventDefault(); onShop && onShop(); }}>
              Consigue más reseñas hoy
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </a>
          </div>

          <div className="rcta__right">
            <div className="rcta__card">
              {/* Decorative stars */}
              <div className="rcta__stars" aria-hidden="true">
                {[...Array(5)].map((_, i) => (
                  <svg key={i} width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                  </svg>
                ))}
              </div>

              <blockquote className="rcta__quote">
                "Desde que pusimos el cartel Linkstar, las reseñas en Google se triplicaron en el primer mes.
                Ahora somos el taller de chaperia mejor valorado de la zona"
              </blockquote>

              <div className="rcta__author">
                <div className="rcta__author-avatar">MG</div>
                <div>
                  <div className="rcta__author-name">Alejandro Gallo</div>
                  <div className="rcta__author-role">Taller FusionCars, Zavalla</div>
                </div>
              </div>

              {/* Stats bar */}
              <div className="rcta__stats">
                {stats.map((s, i) => (
                  <div className="rcta__stat" key={i}>
                    <span className="rcta__stat-value">{s.value}</span>
                    <span className="rcta__stat-label">{s.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Floating badge */}
            <div className="rcta__floating-badge">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
              <span>+68 reseñas nuevas este mes</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
