import { useState } from 'react';
import { sendContactMessage, CONTACT_MESSAGE_MAX } from '../../lib/contactApi';
import './ContactForm.css';

/* El formulario de contacto del panel. Mismos campos, mismas validaciones y
 * mismos textos que el de apps/ventas (pages/Contact), así una consulta llega
 * igual venga de donde venga. Lo usan la landing pública y la sección Contacto
 * de adentro del panel.
 *
 * `initialName` / `initialEmail`: adentro del panel ya sabemos quién escribe.
 * `context`: una línea que se agrega al final del mensaje, para que del lado
 * nuestro se sepa desde qué cuenta vino (la pantalla avisa que se incluye). */

const SUPPORT_EMAIL = 'linkstar.app1@gmail.com';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ContactForm({ initialName = '', initialEmail = '', context = '', idPrefix = 'contact' }) {
  const empty = { name: initialName, email: initialEmail, phone: '', message: '' };
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState({});
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [sendError, setSendError] = useState('');

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = 'El nombre es obligatorio';
    if (!form.email.trim()) e.email = 'El email es obligatorio';
    else if (!EMAIL_RE.test(form.email.trim())) e.email = 'Email inválido';
    if (!form.message.trim()) e.message = 'El mensaje es obligatorio';
    return e;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
    if (errors[name]) setErrors((err) => ({ ...err, [name]: '' }));
    if (sendError) setSendError('');
  };

  async function handleSubmit(e) {
    e.preventDefault();
    if (sending) return;
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }

    const message = context ? `${form.message.trim()}\n\n— ${context}` : form.message;
    if (message.length > CONTACT_MESSAGE_MAX) {
      setErrors({ message: `El mensaje es demasiado largo (máximo ${CONTACT_MESSAGE_MAX.toLocaleString('es-AR')} caracteres).` });
      return;
    }

    setSending(true);
    setSendError('');
    try {
      await sendContactMessage({ ...form, message });
      setSent(true);
    } catch (error) {
      // 400 (datos inválidos) y 429 (demasiadas consultas) traen un mensaje del
      // servidor pensado para leerse. Lo demás es que el API no contestó: no hay
      // respaldo desde el navegador, así que se ofrece el mail.
      console.error('No se pudo enviar la consulta:', error);
      setSendError(
        error.status === 400 || error.status === 429
          ? error.message
          : `No pudimos enviar tu consulta. Probá de nuevo en unos minutos o escribinos a ${SUPPORT_EMAIL}.`,
      );
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <div className="contact-form contact-form--sent" role="status">
        <div className="contact-form__success-icon" aria-hidden="true">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
        </div>
        <h3 className="contact-form__success-title">¡Mensaje enviado!</h3>
        <p className="contact-form__success-text">Gracias por contactarnos. Te responderemos a la brevedad.</p>
        <button
          type="button"
          className="contact-form__secondary"
          onClick={() => { setSent(false); setForm(empty); }}
        >
          Enviar otro mensaje
        </button>
      </div>
    );
  }

  const field = (name) => `${idPrefix}-${name}`;

  return (
    <form className="contact-form" onSubmit={handleSubmit} noValidate>
      <div className="contact-form__row">
        <div className={`contact-form__field ${errors.name ? 'contact-form__field--error' : ''}`}>
          <label htmlFor={field('name')}>Nombre y apellido <span className="contact-form__req">*</span></label>
          <input
            id={field('name')}
            type="text"
            name="name"
            placeholder="Ej: Juan Pérez"
            value={form.name}
            onChange={handleChange}
            autoComplete="name"
            aria-invalid={Boolean(errors.name)}
          />
          {errors.name && <span className="contact-form__error">{errors.name}</span>}
        </div>

        <div className={`contact-form__field ${errors.email ? 'contact-form__field--error' : ''}`}>
          <label htmlFor={field('email')}>Email <span className="contact-form__req">*</span></label>
          <input
            id={field('email')}
            type="email"
            name="email"
            placeholder="tu@email.com"
            value={form.email}
            onChange={handleChange}
            autoComplete="email"
            aria-invalid={Boolean(errors.email)}
          />
          {errors.email && <span className="contact-form__error">{errors.email}</span>}
        </div>
      </div>

      <div className="contact-form__field">
        <label htmlFor={field('phone')}>Teléfono <span className="contact-form__optional">(opcional)</span></label>
        <input
          id={field('phone')}
          type="tel"
          name="phone"
          placeholder="+54 9 11 0000-0000"
          value={form.phone}
          onChange={handleChange}
          autoComplete="tel"
        />
      </div>

      <div className={`contact-form__field ${errors.message ? 'contact-form__field--error' : ''}`}>
        <label htmlFor={field('message')}>Mensaje <span className="contact-form__req">*</span></label>
        <textarea
          id={field('message')}
          name="message"
          placeholder="¿En qué podemos ayudarte?"
          rows={5}
          value={form.message}
          onChange={handleChange}
          aria-invalid={Boolean(errors.message)}
        />
        {errors.message && <span className="contact-form__error">{errors.message}</span>}
      </div>

      {sendError && <p className="contact-form__send-error" role="alert">{sendError}</p>}

      <button type="submit" className="contact-form__submit" disabled={sending}>
        {sending ? 'Enviando…' : 'Enviar mensaje'}
        {!sending && (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        )}
      </button>
    </form>
  );
}
