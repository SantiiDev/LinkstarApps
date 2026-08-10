import { useState, useEffect, useRef } from 'react';
import './Contact.css';

export default function Contact() {
  const [form, setForm] = useState({ name: '', email: '', phone: '', message: '' });
  const [errors, setErrors] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);
  const sectionRef = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) e.target.classList.add('contact--visible');
        });
      },
      { threshold: 0.1 }
    );
    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = 'El nombre es obligatorio';
    if (!form.email.trim()) e.email = 'El email es obligatorio';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Email inválido';
    if (!form.message.trim()) e.message = 'El mensaje es obligatorio';
    return e;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(f => ({ ...f, [name]: value }));
    if (errors[name]) setErrors(err => ({ ...err, [name]: '' }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    
    setSending(true);
    
    try {
      const response = await fetch("https://api.web3forms.com/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          access_key: "32d006c0-18f0-411b-989f-19a34a6963c2",
          name: form.name,
          email: form.email,
          phone: form.phone,
          message: form.message,
        }),
      });
      
      const result = await response.json();
      if (result.success) {
        setSubmitted(true);
      } else {
        console.error("Error al enviar el formulario:", result);
      }
    } catch (error) {
      console.error("Error de red:", error);
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="contact" id="contacto" ref={sectionRef}>
      {/* Background decorations */}
      <div className="contact__bg-shape contact__bg-shape--1" />
      <div className="contact__bg-shape contact__bg-shape--2" />

      <div className="contact__inner container">
        {/* Header */}
        <div className="contact__header">
          <span className="contact__label">Contacto</span>
          <h2 className="contact__title">
            ¿Tenés alguna <span>consulta?</span>
          </h2>
          <p className="contact__subtitle">
            Escribinos y te respondemos en menos de 24 horas. Estamos para ayudarte a conectar tu negocio.
          </p>
        </div>

        <div className="contact__grid">
          {/* Form */}
          <div className="contact__form-wrap">
            {submitted ? (
              <div className="contact__success">
                <div className="contact__success-icon">
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                </div>
                <h3 className="contact__success-title">¡Mensaje enviado!</h3>
                <p className="contact__success-text">Gracias por contactarnos. Te responderemos a la brevedad.</p>
                <button
                  className="contact__success-btn"
                  onClick={() => { setSubmitted(false); setForm({ name: '', email: '', phone: '', message: '' }); }}
                >
                  Enviar otro mensaje
                </button>
              </div>
            ) : (
              <form className="contact__form" onSubmit={handleSubmit} noValidate>
                <div className="contact__form-row">
                  <div className={`contact__field ${errors.name ? 'contact__field--error' : ''}`}>
                    <label className="contact__field-label" htmlFor="contact-name">
                      Nombre y apellido <span>*</span>
                    </label>
                    <input
                      id="contact-name"
                      className="contact__input"
                      type="text"
                      name="name"
                      placeholder="Ej: Juan Pérez"
                      value={form.name}
                      onChange={handleChange}
                      autoComplete="name"
                    />
                    {errors.name && <span className="contact__error">{errors.name}</span>}
                  </div>

                  <div className={`contact__field ${errors.email ? 'contact__field--error' : ''}`}>
                    <label className="contact__field-label" htmlFor="contact-email">
                      Email <span>*</span>
                    </label>
                    <input
                      id="contact-email"
                      className="contact__input"
                      type="email"
                      name="email"
                      placeholder="tu@email.com"
                      value={form.email}
                      onChange={handleChange}
                      autoComplete="email"
                    />
                    {errors.email && <span className="contact__error">{errors.email}</span>}
                  </div>
                </div>

                <div className="contact__field">
                  <label className="contact__field-label" htmlFor="contact-phone">
                    Teléfono <span className="contact__optional">(opcional)</span>
                  </label>
                  <input
                    id="contact-phone"
                    className="contact__input"
                    type="tel"
                    name="phone"
                    placeholder="+54 9 11 0000-0000"
                    value={form.phone}
                    onChange={handleChange}
                    autoComplete="tel"
                  />
                </div>

                <div className={`contact__field ${errors.message ? 'contact__field--error' : ''}`}>
                  <label className="contact__field-label" htmlFor="contact-message">
                    Mensaje <span>*</span>
                  </label>
                  <textarea
                    id="contact-message"
                    className="contact__textarea"
                    name="message"
                    placeholder="¿En qué podemos ayudarte?"
                    rows={4}
                    value={form.message}
                    onChange={handleChange}
                  />
                  {errors.message && <span className="contact__error">{errors.message}</span>}
                </div>

                <button
                  type="submit"
                  className={`contact__submit ${sending ? 'contact__submit--sending' : ''}`}
                  disabled={sending}
                >
                  {sending ? (
                    <>
                      <span className="contact__spinner" />
                      Enviando...
                    </>
                  ) : (
                    <>
                      Enviar mensaje
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="22" y1="2" x2="11" y2="13" />
                        <polygon points="22 2 15 22 11 13 2 9 22 2" />
                      </svg>
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
