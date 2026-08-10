import { useState } from 'react';
import { useCart } from '../../context/CartContext';
import './Checkout.css';

const WEB3FORMS_KEY = '32d006c0-18f0-411b-989f-19a34a6963c2';

// Checkout en pausa: el registro del pedido en la base de datos (backend +
// Supabase) está desactivado por ahora. El número de orden se genera acá
// mismo y el pedido sólo queda como notificación por mail (Web3Forms) —
// no hay persistencia ni forma de consultarlo después vía /api/orders.
function generateOrderNumber() {
  return `LS-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
}

// Web3Forms (plan free) rechaza llamadas server-to-server, así que este mail
// se manda desde el navegador (igual que el formulario de Contacto) y no
// desde server.js. No usamos adjuntos reales porque Web3Forms los reserva
// para el plan Pro (con esta cuenta, un intento de adjuntar hace que
// rechace todo el envío) — en su lugar, cada producto lleva el link
// absoluto a su imagen para que se pueda ver con un click.
async function sendOrderEmail({ orderNumber, customer, items, total }) {
  const origin = window.location.origin;
  const itemsText = items
    .map(i => i.isBundle
      ? `• ${i.name} — $${(i.price * i.qty).toLocaleString('es-AR')}\n` +
        i.items.map(s => `  - ${s.label}: ${s.color === 'negro' ? 'Negro' : 'Blanco'} (${origin}${s.image})`).join('\n')
      : `• ${i.name} (${i.color === 'negro' ? 'Negro' : 'Blanco'}) x${i.qty} — $${(i.price * i.qty).toLocaleString('es-AR')}\n  Imagen: ${origin}${i.image}`)
    .join('\n\n');

  const response = await fetch('https://api.web3forms.com/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      access_key: WEB3FORMS_KEY,
      subject: `🛒 Nuevo pedido ${orderNumber}`,
      from_name: 'Linkstar Tienda',
      name: customer.name,
      email: customer.email,
      phone: customer.phone || 'No proporcionado',
      message: `
NUEVO PEDIDO: ${orderNumber}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CLIENTE
  Nombre: ${customer.name}
  Email: ${customer.email}
  Teléfono: ${customer.phone || 'No proporcionado'}

DIRECCIÓN DE ENVÍO
  ${customer.address}
  ${customer.city}${customer.zip ? ` (${customer.zip})` : ''}

PRODUCTOS
${itemsText}

TOTAL: $${total.toLocaleString('es-AR')}

⚠️ Pedido sin pago online: coordinar el pago y el envío con el cliente.
      `.trim(),
    }),
  });
  const result = await response.json();
  if (!result.success) throw new Error(result.message || 'Web3Forms rechazó el envío');
}

export default function Checkout({ onBack }) {
  const { items, totalPrice, clearCart } = useCart();
  const [step, setStep] = useState('info'); // info | confirm | success
  const [form, setForm] = useState({
    name: '', email: '', phone: '', address: '', city: '', zip: '',
  });
  const [errors, setErrors] = useState({});
  const [processing, setProcessing] = useState(false);
  const [orderError, setOrderError] = useState('');
  const [orderNumber, setOrderNumber] = useState('');

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(f => ({ ...f, [name]: value }));
    if (errors[name]) setErrors(err => ({ ...err, [name]: '' }));
    if (orderError) setOrderError('');
  };

  const validateInfo = () => {
    const e = {};
    if (!form.name.trim()) e.name = 'Requerido';
    if (!form.email.trim()) e.email = 'Requerido';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Email inválido';
    if (!form.address.trim()) e.address = 'Requerido';
    if (!form.city.trim()) e.city = 'Requerido';
    return e;
  };

  const handleContinue = () => {
    const errs = validateInfo();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setStep('confirm');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ── Realizar pedido (sin pago online, sólo notificación por mail) ──
  const handlePlaceOrder = async () => {
    setProcessing(true);
    setOrderError('');

    const newOrderNumber = generateOrderNumber();

    try {
      await sendOrderEmail({
        orderNumber: newOrderNumber,
        customer: form,
        items,
        total,
      });

      setOrderNumber(newOrderNumber);
      setStep('success');
      clearCart();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      console.error('Order email error:', err);
      setOrderError(err.message || 'Ocurrió un error al enviar el pedido. Intentá de nuevo.');
    } finally {
      setProcessing(false);
    }
  };

  const shipping = 0;
  const total = totalPrice + shipping;

  // ── Success screen ──
  if (step === 'success') {
    return (
      <section className="checkout">
        <div className="container checkout__inner">
          <div className="checkout__success">
            <div className="checkout__success-icon">
              <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
            <h2 className="checkout__success-title">¡Pedido realizado!</h2>
            <p className="checkout__success-text">
              Recibimos tu pedido. Muy pronto nos pondremos en contacto por email para coordinar el pago y el envío.
            </p>
            <p className="checkout__success-order">Orden {orderNumber}</p>
            <button className="checkout__success-btn" onClick={onBack}>
              Volver al inicio
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="checkout">
      <div className="container checkout__inner">
        {/* Header */}
        <div className="checkout__header">
          <button className="checkout__back" onClick={onBack}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
            </svg>
            Volver
          </button>
          <h1 className="checkout__title">Realizar pedido</h1>
          {/* Steps indicator */}
          <div className="checkout__steps">
            <div className={`checkout__step ${step === 'info' ? 'checkout__step--active' : 'checkout__step--done'}`}>
              <span className="checkout__step-num">1</span>
              <span className="checkout__step-label">Información</span>
            </div>
            <div className="checkout__step-line" />
            <div className={`checkout__step ${step === 'confirm' ? 'checkout__step--active' : ''}`}>
              <span className="checkout__step-num">2</span>
              <span className="checkout__step-label">Confirmación</span>
            </div>
          </div>
        </div>

        <div className="checkout__grid">
          {/* Left: Form */}
          <div className="checkout__form-col">
            {step === 'info' && (
              <div className="checkout__section">
                <h3 className="checkout__section-title">Datos de contacto</h3>
                <div className="checkout__form-row">
                  <div className={`checkout__field ${errors.name ? 'checkout__field--error' : ''}`}>
                    <label htmlFor="ck-name">Nombre completo *</label>
                    <input id="ck-name" name="name" value={form.name} onChange={handleChange} placeholder="Juan Pérez" autoComplete="name" />
                    {errors.name && <span className="checkout__error">{errors.name}</span>}
                  </div>
                  <div className={`checkout__field ${errors.email ? 'checkout__field--error' : ''}`}>
                    <label htmlFor="ck-email">Email *</label>
                    <input id="ck-email" name="email" type="email" value={form.email} onChange={handleChange} placeholder="tu@email.com" autoComplete="email" />
                    {errors.email && <span className="checkout__error">{errors.email}</span>}
                  </div>
                </div>
                <div className="checkout__field">
                  <label htmlFor="ck-phone">Teléfono <span className="checkout__optional">(opcional)</span></label>
                  <input id="ck-phone" name="phone" type="tel" value={form.phone} onChange={handleChange} placeholder="+54 9 11 0000-0000" autoComplete="tel" />
                </div>

                <h3 className="checkout__section-title" style={{ marginTop: 'var(--space-6)' }}>Dirección de envío</h3>
                <div className={`checkout__field ${errors.address ? 'checkout__field--error' : ''}`}>
                  <label htmlFor="ck-address">Dirección *</label>
                  <input id="ck-address" name="address" value={form.address} onChange={handleChange} placeholder="Calle 123, Piso 4, Depto B" autoComplete="street-address" />
                  {errors.address && <span className="checkout__error">{errors.address}</span>}
                </div>
                <div className="checkout__form-row">
                  <div className={`checkout__field ${errors.city ? 'checkout__field--error' : ''}`}>
                    <label htmlFor="ck-city">Ciudad *</label>
                    <input id="ck-city" name="city" value={form.city} onChange={handleChange} placeholder="Buenos Aires" autoComplete="address-level2" />
                    {errors.city && <span className="checkout__error">{errors.city}</span>}
                  </div>
                  <div className="checkout__field">
                    <label htmlFor="ck-zip">Código postal</label>
                    <input id="ck-zip" name="zip" value={form.zip} onChange={handleChange} placeholder="C1000" autoComplete="postal-code" />
                  </div>
                </div>

                <button className="checkout__continue" onClick={handleContinue}>
                  Continuar
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
                  </svg>
                </button>
              </div>
            )}

            {step === 'confirm' && (
              <div className="checkout__section">
                <h3 className="checkout__section-title">Confirmá tu pedido</h3>

                <div className="checkout__order-info">
                  <p>Este pedido no incluye pago online. Al confirmarlo, nos vamos a contactar con vos por email para coordinar el pago y el envío.</p>
                </div>

                <div className="checkout__review">
                  <div className="checkout__review-row">
                    <span className="checkout__review-label">Nombre</span>
                    <span className="checkout__review-value">{form.name}</span>
                  </div>
                  <div className="checkout__review-row">
                    <span className="checkout__review-label">Email</span>
                    <span className="checkout__review-value">{form.email}</span>
                  </div>
                  {form.phone && (
                    <div className="checkout__review-row">
                      <span className="checkout__review-label">Teléfono</span>
                      <span className="checkout__review-value">{form.phone}</span>
                    </div>
                  )}
                  <div className="checkout__review-row">
                    <span className="checkout__review-label">Dirección</span>
                    <span className="checkout__review-value">{form.address}, {form.city}{form.zip ? ` (${form.zip})` : ''}</span>
                  </div>
                </div>

                {/* Error message */}
                {orderError && (
                  <div className="checkout__pay-error">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
                    </svg>
                    {orderError}
                  </div>
                )}

                <div className="checkout__pay-actions">
                  <button
                    className="checkout__back-btn"
                    onClick={() => { setStep('info'); setOrderError(''); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                    disabled={processing}
                  >
                    ← Volver
                  </button>
                  <button
                    className={`checkout__pay-btn ${processing ? 'checkout__pay-btn--processing' : ''}`}
                    onClick={handlePlaceOrder}
                    disabled={processing}
                  >
                    {processing ? (
                      <>
                        <span className="checkout__pay-spinner" />
                        Enviando...
                      </>
                    ) : (
                      <>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
                        </svg>
                        {`Realizar pedido · $${total.toLocaleString('es-AR')}`}
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right: Order summary */}
          <div className="checkout__summary">
            <h3 className="checkout__summary-title">Resumen del pedido</h3>
            <ul className="checkout__summary-items">
              {items.map(item => (
                <li className="checkout__summary-item" key={item.key}>
                  <div className={`checkout__summary-img checkout__summary-img--${item.isBundle ? item.items[0].color : item.color}`}>
                    <img src={item.isBundle ? item.items[0].image : item.image} alt={item.name} loading="lazy" />
                  </div>
                  <div className="checkout__summary-info">
                    <span className="checkout__summary-name">{item.name}</span>
                    {item.isBundle ? (
                      item.items.map((sub, i) => (
                        <span key={i} className="checkout__summary-meta">
                          {sub.label}: {sub.color === 'negro' ? 'Negro' : 'Blanco'}
                        </span>
                      ))
                    ) : (
                      <span className="checkout__summary-meta">{item.color === 'negro' ? 'Negro' : 'Blanco'} × {item.qty}</span>
                    )}
                  </div>
                  <span className="checkout__summary-price">${(item.price * item.qty).toLocaleString('es-AR')}</span>
                </li>
              ))}
            </ul>
            <div className="checkout__summary-divider" />
            <div className="checkout__summary-row">
              <span>Subtotal</span>
              <span>${totalPrice.toLocaleString('es-AR')}</span>
            </div>
            <div className="checkout__summary-row">
              <span>Envío</span>
              <span className="checkout__summary-free">Gratis</span>
            </div>
            <div className="checkout__summary-divider" />
            <div className="checkout__summary-row checkout__summary-row--total">
              <span>Total</span>
              <span>${total.toLocaleString('es-AR')}</span>
            </div>
            <div className="checkout__summary-trust">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
              </svg>
              Te contactamos para coordinar pago y envío
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
