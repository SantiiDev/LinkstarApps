import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../../../context/CartContext';
import { ROUTES } from '../../../lib/routes';
import './Cart.css';

export default function Cart() {
  const { items, isOpen, setIsOpen, removeItem, updateQty, totalItems, totalPrice } = useCart();
  // El carrito se monta fuera de <Routes> (es un cajón, no una página), pero
  // adentro del BrowserRouter: puede navegar por su cuenta y ya no necesita
  // que App le pase un callback.
  const navigate = useNavigate();

  // Bloquea el scroll de la página de fondo mientras el carrito está abierto,
  // así el scroll siempre queda contenido dentro del drawer.
  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  return (
    <>
      {/* Backdrop */}
      <div
        className={`cart-backdrop ${isOpen ? 'cart-backdrop--visible' : ''}`}
        onClick={() => setIsOpen(false)}
      />

      {/* Drawer */}
      <aside className={`cart-drawer ${isOpen ? 'cart-drawer--open' : ''}`}>
        {/* Header */}
        <div className="cart-drawer__header">
          <h2 className="cart-drawer__title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <path d="M16 10a4 4 0 01-8 0" />
            </svg>
            Carrito
            {totalItems > 0 && <span className="cart-drawer__count">{totalItems}</span>}
          </h2>
          <button className="cart-drawer__close" onClick={() => setIsOpen(false)} aria-label="Cerrar">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="cart-drawer__body">
          {items.length === 0 ? (
            <div className="cart-drawer__empty">
              <div className="cart-drawer__empty-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <path d="M16 10a4 4 0 01-8 0" />
                </svg>
              </div>
              <p className="cart-drawer__empty-text">Tu carrito está vacío</p>
              <p className="cart-drawer__empty-sub">Agrega productos desde la tienda</p>
            </div>
          ) : (
            <ul className="cart-drawer__items">
              {items.map(item => (
                <li className="cart-item" key={item.key}>
                  <div className={`cart-item__image-wrap cart-item__image-wrap--${item.isBundle ? item.items[0].color : item.color}`}>
                    <img src={item.isBundle ? item.items[0].image : item.image} alt={item.name} className="cart-item__image" loading="lazy" />
                  </div>
                  <div className="cart-item__info">
                    <div className="cart-item__top">
                      <span className="cart-item__name">{item.name}</span>
                      <button className="cart-item__remove" onClick={() => removeItem(item.key)} aria-label="Eliminar">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </div>
                    {item.isBundle ? (
                      <div className="cart-item__bundle-colors">
                        {item.items.map((sub, i) => (
                          <span key={i} className="cart-item__color">
                            {sub.label}: {sub.color === 'negro' ? 'Negro' : 'Blanco'}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="cart-item__color">{item.color === 'negro' ? 'Negro' : 'Blanco'}</span>
                    )}
                    <div className={`cart-item__bottom ${item.isBundle ? 'cart-item__bottom--bundle' : ''}`}>
                      {!item.isBundle && (
                        <div className="cart-item__qty">
                          <button onClick={() => updateQty(item.key, item.qty - 1)} aria-label="Reducir">−</button>
                          <span>{item.qty}</span>
                          <button onClick={() => updateQty(item.key, item.qty + 1)} aria-label="Aumentar">+</button>
                        </div>
                      )}
                      <span className="cart-item__price">${(item.price * item.qty).toLocaleString('es-AR')}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div className="cart-drawer__footer">
            <div className="cart-drawer__totals">
              <div className="cart-drawer__total-row">
                <span>Subtotal</span>
                <span>${totalPrice.toLocaleString('es-AR')}</span>
              </div>
              <div className="cart-drawer__total-row cart-drawer__total-row--final">
                <span>Total</span>
                <span>${totalPrice.toLocaleString('es-AR')}</span>
              </div>
            </div>
            <button
              className="cart-drawer__checkout"
              onClick={() => { setIsOpen(false); navigate(ROUTES.checkout); }}
            >
              Realizar pedido
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
              </svg>
            </button>
          </div>
        )}
      </aside>
    </>
  );
}
