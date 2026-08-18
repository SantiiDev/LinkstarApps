import { useState } from 'react';
import { useCart } from '../../context/CartContext';
import { API_URL, WEB3FORMS_KEY } from '../../lib/config';
import './Checkout.css';


/* Pedido sin pago online: el comprador confirma acá y el cobro se coordina a
 * mano. Es el modo de venta elegido para los primeros meses, no una etapa a
 * medio terminar.
 *
 * El pedido se registra en la base a través de POST /api/orders/manual, que
 * además manda el aviso por mail desde el servidor. Antes el pedido existía
 * SÓLO como mail: un mail perdido era un pedido perdido.
 *
 * El camino de respaldo de abajo existe porque services/api todavía no está
 * desplegado (VITE_API_URL en .env.production sigue siendo un placeholder). Si
 * el API no contesta, se manda el mail desde el navegador como antes y se
 * avisa en el asunto que ese pedido NO quedó registrado. Cuando el API esté
 * arriba, este respaldo —y con él la key de Web3Forms en el bundle— se puede
 * borrar. */
function generateOrderNumber() {
  return `LS-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
}

async function createManualOrder({ customer, items }) {
  const response = await fetch(`${API_URL}/api/orders/manual`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customer: {
        name: customer.name,
        email: customer.email,
        phone: customer.phone || undefined,
        address: customer.address,
        city: customer.city,
        zip: customer.zip || undefined,
      },
      items: items.map(i => ({
        id: i.id ?? i.key,
        key: i.key,
        name: i.name,
        color: i.color,
        qty: i.qty,
        price: i.price,
        isBundle: i.isBundle,
        items: i.items,
      })),
    }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.error || 'No pudimos registrar el pedido');
    error.status = response.status;
    throw error;
  }

  return data.order_number;
}

// Web3Forms (plan free) rechaza llamadas server-to-server, así que este mail
// se manda desde el navegador (igual que el formulario de Contacto) y no
// desde server.js. No usamos adjuntos reales porque Web3Forms los reserva
// para el plan Pro (con esta cuenta, un intento de adjuntar hace que
// rechace todo el envío) — en su lugar, cada producto lleva el link
// absoluto a su imagen para que se pueda ver con un click.
async function sendOrderEmail({ orderNumber, customer, items, total, persisted = true }) {
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
      subject: persisted
        ? `🛒 Nuevo pedido ${orderNumber}`
        : `⚠️ Pedido SIN REGISTRAR ${orderNumber} — anotalo a mano`,
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

⚠️ Pedido sin pago online: coordinar el pago y el envío con el cliente.${persisted ? '' : `
⚠️ ESTE PEDIDO NO QUEDÓ GUARDADO EN LA BASE — el servidor no respondió.
   Es el único registro que existe: guardalo o cargalo a mano.`}
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

  // ── Realizar pedido (sin pago online: se registra y se avisa por mail) ──
  const handlePlaceOrder = async () => {
    setProcessing(true);
    setOrderError('');

    const finish = (number) => {
      setOrderNumber(number);
      setStep('success');
      clearCart();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    try {
      finish(await createManualOrder({ customer: form, items }));
    } catch (err) {
      // Un 400 es el pedido en sí: precio que no coincide con el catálogo del
      // servidor, o un dato que falta. Reintentar por mail escondería el
      // problema, así que se muestra y no se manda nada.
      if (err.status === 400) {
        console.error('Pedido rechazado por el servidor:', err);
        setOrderError('No pudimos validar tu pedido. Actualizá la página y volvé a armar el carrito.');
        setProcessing(false);
        return;
      }

      // Cualquier otra cosa es el API caído o todavía sin desplegar: el pedido
      // no se pierde, va por mail avisando que no quedó registrado.
      console.error('No se pudo registrar el pedido, mando el aviso por mail:', err);
      const fallbackNumber = generateOrderNumber();
      try {
        await sendOrderEmail({
          orderNumber: fallbackNumber,
          customer: form,
          items,
          total,
          persisted: false,
        });
        finish(fallbackNumber);
      } catch (mailErr) {
        console.error('Order email error:', mailErr);
        setOrderError('Ocurrió un error al enviar el pedido. Intentá de nuevo en unos minutos.');
      }
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
