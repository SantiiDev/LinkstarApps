import { useState, useRef, useEffect } from 'react';
import { useCart } from '../../context/CartContext';
import './Shop.css';

const products = [
  {
    id: 'google-nfc',
    name: 'Expositor Google Reviews',
    description: 'Cartel expositor NFC para Google. Tus clientes escanean y dejan su reseña al instante. Aumenta tu reputación online con un solo toque y convierte cada visita en una valoración que te posiciona mejor en Google Maps.',
    price: 41000,
    badge: 'Más vendido',
    badgeColor: 'orange',
    platform: 'Google',
    platformIcon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
      </svg>
    ),
    images: { negro: '/google-nfc-black.webp', blanco: '/google-nfc-white.webp' },
    features: ['Reseñas de Google al instante', 'Aumenta reseñas orgánicamente', 'Sin app requerida', 'Programable desde LinkstarApp'],
  },
  {
    id: 'instagram-nfc',
    name: 'Expositor Instagram',
    description: 'Cartel expositor NFC/QR para Instagram. Con un solo toque, tus clientes acceden directamente a tu perfil y te siguen al instante. Multiplica tu comunidad orgánicamente sin esfuerzo y sin invertir en publicidad.',
    price: 41000,
    badge: 'Nuevo',
    badgeColor: 'gradient',
    platform: 'Instagram',
    platformIcon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <defs>
          <linearGradient id="ig-grad2" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#F58529" />
            <stop offset="50%" stopColor="#DD2A7B" />
            <stop offset="100%" stopColor="#8134AF" />
          </linearGradient>
        </defs>
        <rect x="2" y="2" width="20" height="20" rx="5" fill="url(#ig-grad2)" />
        <circle cx="12" cy="12" r="4" stroke="white" strokeWidth="2" fill="none" />
        <circle cx="17.5" cy="6.5" r="1.2" fill="white" />
      </svg>
    ),
    images: { negro: '/instagram-nfc-black.webp', blanco: '/instagram-nfc-white.webp' },
    features: ['Perfil de Instagram al instante', 'Aumenta seguidores orgánicos', 'Sin app requerida', 'Programable desde LinkstarApp'],
  },
];

// ─── Tiers de precio (iguales para ambos productos) ────────────────────────
const UNIT_PRICE = 41000;
const PAIR_ORIGINAL_PRICE = UNIT_PRICE * 2;        // 82.000 — total tachado de "2 unidades" y combo
const DOUBLE_TOTAL_PRICE = 65600;                  // 20% off PAIR_ORIGINAL_PRICE
const DOUBLE_UNIT_PRICE = DOUBLE_TOTAL_PRICE / 2;  // 32.800 c/u
const COMBO_TOTAL_PRICE = 61500;                   // 25% off PAIR_ORIGINAL_PRICE
const COMBO_UNIT_PRICE = COMBO_TOTAL_PRICE / 2;    // 30.750 c/u
const BULK_MIN_QTY = 3;
const BULK_MAX_QTY = 10;

function money(n) {
  return `$${n.toLocaleString('es-AR')}`;
}

// ─── Fila clickeable de cada tier: radio + label + badge + precio ──────────
function TierHead({ label, badge, active, total, strike, onClick }) {
  return (
    <button type="button" className={`shop-card__tier-head ${active ? 'active' : ''}`} onClick={onClick}>
      <span className="shop-card__tier-radio" />
      <span className="shop-card__tier-label">
        {label}
        {badge && <span className="shop-card__tier-badge">{badge}</span>}
      </span>
      <span className="shop-card__tier-pricing">
        {strike && <span className="shop-card__tier-strike">{money(strike)}</span>}
        <span className="shop-card__tier-price">{money(total)}</span>
      </span>
    </button>
  );
}

// ─── Fila de una unidad dentro del panel expandido: miniatura + color + precio ──
function UnitRow({ title, image, color, onChange, price, strikePrice }) {
  return (
    <div className="shop-card__unit-row">
      <img src={image} alt={title} className="shop-card__unit-thumb" loading="lazy" />
      <div className="shop-card__unit-mid">
        <div className="shop-card__unit-top">
          <span className="shop-card__unit-title">{title}</span>
          <div className="shop-card__unit-price">
            {strikePrice && <span className="shop-card__unit-strike">{money(strikePrice)}</span>}
            <span className="shop-card__unit-current">{money(price)}</span>
          </div>
        </div>
        <div className="shop-card__colors">
          <button
            type="button"
            className={`shop-card__color shop-card__color--negro ${color === 'negro' ? 'active' : ''}`}
            onClick={() => onChange('negro')}
          >
            <span className="shop-card__swatch shop-card__swatch--negro" />
            Negro
          </button>
          <button
            type="button"
            className={`shop-card__color shop-card__color--blanco ${color === 'blanco' ? 'active' : ''}`}
            onClick={() => onChange('blanco')}
          >
            <span className="shop-card__swatch shop-card__swatch--blanco" />
            Blanco
          </button>
        </div>
      </div>
    </div>
  );
}

const IMAGE_COLORS = ['negro', 'blanco'];

function ProductCard({ product, siblingProduct, defaultTier = null }) {
  const [tier, setTier] = useState(defaultTier);
  const [mainImageIdx, setMainImageIdx] = useState(0);
  const mainImageColor = IMAGE_COLORS[mainImageIdx];
  const [singleColor, setSingleColor] = useState('negro');
  const [doubleColors, setDoubleColors] = useState(['negro', 'negro']);
  const [comboColors, setComboColors] = useState({ own: 'negro', sibling: 'negro' });
  const [bulkQty, setBulkQty] = useState(BULK_MIN_QTY);
  const [bulkColors, setBulkColors] = useState(Array(BULK_MIN_QTY).fill('negro'));
  const [added, setAdded] = useState(false);
  const { addItem, addBundle } = useCart();

  const toggleTier = (id) => setTier(prev => prev === id ? null : id);

  const setBulkQtyClamped = (next) => {
    const q = Math.min(BULK_MAX_QTY, Math.max(BULK_MIN_QTY, next));
    setBulkQty(q);
    setBulkColors(prev => (
      q > prev.length
        ? [...prev, ...Array(q - prev.length).fill('negro')]
        : prev.slice(0, q)
    ));
  };

  const setDoubleColorAt = (idx, c) => setDoubleColors(prev => prev.map((v, i) => i === idx ? c : v));
  const setBulkColorAt = (idx, c) => setBulkColors(prev => prev.map((v, i) => i === idx ? c : v));

  const handleAddToCart = () => {
    if (!tier) return;
    if (tier === 'single') {
      addItem(product, 1, singleColor, UNIT_PRICE);
    } else if (tier === 'double') {
      addItem(product, 1, doubleColors[0], DOUBLE_UNIT_PRICE);
      addItem(product, 1, doubleColors[1], DOUBLE_UNIT_PRICE);
    } else if (tier === 'bulk') {
      bulkColors.forEach(c => addItem(product, 1, c, UNIT_PRICE));
    } else if (tier === 'combo') {
      addBundle({
        key: `combo-${[product.id, siblingProduct.id].sort().join('-')}`,
        name: 'Combo Google + Instagram',
        price: COMBO_TOTAL_PRICE,
        items: [
          { label: product.platform, color: comboColors.own, image: product.images[comboColors.own] },
          { label: siblingProduct.platform, color: comboColors.sibling, image: siblingProduct.images[comboColors.sibling] },
        ],
      });
    }
    setAdded(true);
    setTimeout(() => setAdded(false), 1800);
  };

  return (
    <div className="shop-card">
      {/* Media panel: imagen + descripción, apiladas */}
      <div className="shop-card__media">
        <div className="shop-card__image-wrap">
          <div className={`shop-card__badge shop-card__badge--${product.badgeColor}`}>
            {product.badge}
          </div>
          <div className="shop-card__image-glow" />
          <button
            type="button"
            className="shop-card__image-arrow shop-card__image-arrow--prev"
            onClick={() => setMainImageIdx(i => (i - 1 + IMAGE_COLORS.length) % IMAGE_COLORS.length)}
            aria-label="Imagen anterior"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <img
            src={product.images[mainImageColor]}
            alt={`${product.name} - ${mainImageColor}`}
            className="shop-card__image"
            loading="lazy"
          />
          <button
            type="button"
            className="shop-card__image-arrow shop-card__image-arrow--next"
            onClick={() => setMainImageIdx(i => (i + 1) % IMAGE_COLORS.length)}
            aria-label="Imagen siguiente"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>

        <div className="shop-card__desc-inner">
          <p className="shop-card__desc-text">{product.description}</p>
          <ul className="shop-card__features">
            {product.features.map((f, i) => (
              <li key={i} className="shop-card__feature">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                {f}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Content Panel */}
      <div className="shop-card__body">
        <div className="shop-card__header">
          <div className="shop-card__platform">
            {product.platformIcon}
            <span>{product.platform}</span>
          </div>
          <h2 className="shop-card__name">{product.name}</h2>
        </div>

        {/* Tier selector — cada opción se expande cuando está activa */}
        <div className="shop-card__tiers">
          {/* 1 unidad */}
          <div className={`shop-card__tier ${tier === 'single' ? 'active' : ''}`}>
            <TierHead
              label="1 unidad"
              active={tier === 'single'}
              total={UNIT_PRICE}
              strike={null}
              onClick={() => toggleTier('single')}
            />
            {tier === 'single' && (
              <div className="shop-card__tier-panel">
                <UnitRow
                  title="Color"
                  image={product.images[singleColor]}
                  color={singleColor}
                  onChange={setSingleColor}
                  price={UNIT_PRICE}
                  strikePrice={null}
                />
              </div>
            )}
          </div>

          {/* 2 unidades */}
          <div className={`shop-card__tier ${tier === 'double' ? 'active' : ''}`}>
            <TierHead
              label="2 unidades"
              active={tier === 'double'}
              total={DOUBLE_TOTAL_PRICE}
              strike={PAIR_ORIGINAL_PRICE}
              onClick={() => toggleTier('double')}
            />
            {tier === 'double' && (
              <div className="shop-card__tier-panel">
                <UnitRow
                  title="Unidad #1"
                  image={product.images[doubleColors[0]]}
                  color={doubleColors[0]}
                  onChange={(c) => setDoubleColorAt(0, c)}
                  price={DOUBLE_UNIT_PRICE}
                  strikePrice={UNIT_PRICE}
                />
                <UnitRow
                  title="Unidad #2"
                  image={product.images[doubleColors[1]]}
                  color={doubleColors[1]}
                  onChange={(c) => setDoubleColorAt(1, c)}
                  price={DOUBLE_UNIT_PRICE}
                  strikePrice={UNIT_PRICE}
                />
              </div>
            )}
          </div>

          {/* Combo Google + Instagram */}
          <div className={`shop-card__tier ${tier === 'combo' ? 'active' : ''}`}>
            <TierHead
              label="Combo Google + Instagram"
              badge="MÁS POPULAR"
              active={tier === 'combo'}
              total={COMBO_TOTAL_PRICE}
              strike={PAIR_ORIGINAL_PRICE}
              onClick={() => toggleTier('combo')}
            />
            {tier === 'combo' && (
              <div className="shop-card__tier-panel">
                <UnitRow
                  title={product.name}
                  image={product.images[comboColors.own]}
                  color={comboColors.own}
                  onChange={(c) => setComboColors(prev => ({ ...prev, own: c }))}
                  price={COMBO_UNIT_PRICE}
                  strikePrice={UNIT_PRICE}
                />
                <UnitRow
                  title={siblingProduct.name}
                  image={siblingProduct.images[comboColors.sibling]}
                  color={comboColors.sibling}
                  onChange={(c) => setComboColors(prev => ({ ...prev, sibling: c }))}
                  price={COMBO_UNIT_PRICE}
                  strikePrice={UNIT_PRICE}
                />
              </div>
            )}
          </div>

          {/* Pedido grande (3 a 10 unidades, sin descuento) */}
          <div className={`shop-card__tier ${tier === 'bulk' ? 'active' : ''}`}>
            <TierHead
              label="Pedido grande"
              active={tier === 'bulk'}
              total={UNIT_PRICE * bulkQty}
              strike={null}
              onClick={() => toggleTier('bulk')}
            />
            {tier === 'bulk' && (
              <div className="shop-card__tier-panel">
                <div className="shop-card__bulk-stepper">
                  <span className="shop-card__bulk-label">Cantidad (3 a 10)</span>
                  <div className="shop-card__qty">
                    <button
                      className="shop-card__qty-btn"
                      onClick={() => setBulkQtyClamped(bulkQty - 1)}
                      disabled={bulkQty <= BULK_MIN_QTY}
                      aria-label="Reducir"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                    </button>
                    <span className="shop-card__qty-value">{bulkQty}</span>
                    <button
                      className="shop-card__qty-btn"
                      onClick={() => setBulkQtyClamped(bulkQty + 1)}
                      disabled={bulkQty >= BULK_MAX_QTY}
                      aria-label="Aumentar"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                        <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                    </button>
                  </div>
                </div>
                {bulkColors.map((c, idx) => (
                  <UnitRow
                    key={idx}
                    title={`Unidad #${idx + 1}`}
                    image={product.images[c]}
                    color={c}
                    onChange={(nc) => setBulkColorAt(idx, nc)}
                    price={UNIT_PRICE}
                    strikePrice={null}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer: solo el CTA — los precios ya están en cada opción */}
        <div className="shop-card__footer">
          <button
            className={`shop-card__cta ${added ? 'shop-card__cta--added' : ''}`}
            onClick={handleAddToCart}
            disabled={!tier}
          >
            {added ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                ¡Agregado!
              </>
            ) : tier ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" /><line x1="3" y1="6" x2="21" y2="6" /><path d="M16 10a4 4 0 01-8 0" />
                </svg>
                Agregar al carrito
              </>
            ) : (
              'Elegí una opción'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Shop({ onBack }) {
  const sectionRef = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('shop--visible');
          }
        });
      },
      { threshold: 0.05 }
    );
    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section className="shop" id="tienda" ref={sectionRef}>
      {/* Hero strip */}
      <div className="shop__hero">
        <div className="shop__hero-bg shop__hero-bg--1" />
        <div className="shop__hero-bg shop__hero-bg--2" />
        <div className="container shop__hero-inner">
          <button className="shop__back" onClick={onBack}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
            </svg>
            Volver al inicio
          </button>
          <h1 className="shop__hero-title">
            Nuestros <span className="shop__hero-highlight">productos NFC</span>
          </h1>
          <p className="shop__hero-sub">Elegí tu plan y el color de cada unidad.</p>
        </div>
      </div>

      {/* Products grid */}
      <div className="container shop__grid-wrap">
        <div className="shop__grid">
          {products.map(product => (
            <ProductCard
              key={product.id}
              product={product}
              siblingProduct={products.find(p => p.id !== product.id)}
              defaultTier={product.id === 'google-nfc' ? 'combo' : null}
            />
          ))}
        </div>

        {/* Trust bar */}
        <div className="shop__trust">
          {[
            {
              icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13"></rect><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle></svg>,
              label: 'Envíos a todo el país', sub: 'Argentina'
            },
            {
              icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0110 0v4"></path></svg>,
              label: 'Pago seguro', sub: 'Múltiples métodos'
            },
            {
              icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 2v6h6M21.5 22v-6h-6M22 11.5A10 10 0 003.2 7.2M2 12.5a10 10 0 0018.8 4.2" /></svg>,
              label: 'Garantía', sub: '30 días de devolución'
            },
            {
              icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>,
              label: 'Soporte 7/7', sub: 'Atención personalizada'
            },
          ].map((item, i) => (
            <div className="shop__trust-item" key={i}>
              <span className="shop__trust-icon" style={{ display: 'flex', color: '#F58529' }}>{item.icon}</span>
              <div>
                <span className="shop__trust-label">{item.label}</span>
                <span className="shop__trust-sub">{item.sub}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
