import { useState, useEffect, useRef } from 'react';
import './FAQ.css';

const faqData = [
  {
    question: '¿Qué es un cartel expositor NFC?',
    answer: 'Es un cartel de diseño premium con un chip NFC integrado. Cuando un cliente acerca su smartphone al cartel, accede automáticamente a tu contenido digital: menú, catálogo, web, redes sociales, ofertas o cualquier enlace que configures desde la plataforma Linkstar',
  },
  {
    question: '¿Necesito una app para que funcione?',
    answer: 'No. La tecnología NFC funciona de forma nativa en la mayoría de smartphones modernos (iPhone y Android). Tu cliente solo tiene que acercar su teléfono al cartel, sin descargar ninguna aplicación',
  },
  {
    question: '¿Puedo cambiar el contenido del cartel?',
    answer: 'Sí, las veces que quieras. Desde la plataforma Linkstar puedes actualizar los enlaces y el contenido digital vinculado a tu cartel en cualquier momento, sin necesidad de cambiar el cartel físico',
  },
  {
    question: '¿Qué opciones de personalización hay?',
    answer: 'Proximamente ofreceremos personalizaición completa. En la sección "Tienda" estan los productos que ofrecemos actualmente',
  },
  {
    question: '¿Cuánto tarda el envío?',
    answer: 'Procesamos tu pedido lo antes posible. El envío estándar tarda entre 3-5 días laborables',
  },
  {
    question: '¿Los carteles son resistentes?',
    answer: 'Absolutamente. Utilizamos materiales de alta calidad diseñados para uso intensivo. Nuestros carteles están pensados para entornos comerciales y resisten el uso diario. El chip NFC y el QR tienen una vida útil prácticamente ilimitada',
  },
];

function FAQItem({ question, answer, isOpen, onClick, index }) {
  const contentRef = useRef(null);
  const [height, setHeight] = useState(0);

  // contentRef sólo queda apuntando al nodo real después del commit, así que
  // en el primer render (el ítem que arranca abierto) scrollHeight todavía es
  // undefined y el wrapper queda con max-height inválido, colapsado en 0. Un
  // efecto que mide una vez montado corrige tanto ese caso como los toggles
  // normales.
  useEffect(() => {
    if (isOpen && contentRef.current) {
      setHeight(contentRef.current.scrollHeight);
    }
  }, [isOpen]);

  return (
    <div className={`faq__item ${isOpen ? 'faq__item--open' : ''}`}>
      <button className="faq__question" onClick={onClick} aria-expanded={isOpen}>
        <span>{question}</span>
        <div className="faq__icon">
          <span className="faq__icon-bar faq__icon-bar--h"></span>
          <span className="faq__icon-bar faq__icon-bar--v"></span>
        </div>
      </button>
      <div
        className="faq__answer-wrapper"
        style={{
          maxHeight: isOpen ? height + 'px' : '0px',
        }}
      >
        <div className="faq__answer" ref={contentRef}>
          <p>{answer}</p>
        </div>
      </div>
    </div>
  );
}

export default function FAQ({ onContact, data = faqData, title = "Todo lo que necesitas", titleSpan = "saber", description = "¿Tienes dudas? Aquí encontrarás las respuestas a las preguntas más comunes sobre nuestros carteles expositores NFC." }) {
  const [openIndex, setOpenIndex] = useState(0);
  const sectionRef = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('faq--visible');
          }
        });
      },
      { threshold: 0.1 }
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <section className="faq" id="personalizacion" ref={sectionRef}>
      <div className="faq__inner container">
        <div className="faq__header">
          <span className="faq__label">Preguntas frecuentes</span>
          <h2 className="faq__title">
            {title} {titleSpan && <span>{titleSpan}</span>}
          </h2>
          <p className="faq__description">
            {description}
          </p>
        </div>

        <div className="faq__list">
          {data.map((item, index) => (
            <FAQItem
              key={index}
              index={index}
              question={item.question}
              answer={item.answer}
              isOpen={openIndex === index}
              onClick={() => setOpenIndex(openIndex === index ? -1 : index)}
            />
          ))}
        </div>

        <div className="faq__cta-wrapper">
          <p className="faq__cta-text">¿No encuentras lo que buscas?</p>
          <a href="#contacto" className="faq__cta-link" onClick={(e) => { e.preventDefault(); onContact && onContact(); }}>
            Contacta con nosotros
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </a>
        </div>
      </div>
    </section>
  );
}
