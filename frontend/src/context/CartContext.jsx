import { createContext, useContext, useState, useCallback } from 'react';

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const [items, setItems] = useState([]);
  const [isOpen, setIsOpen] = useState(false);

  const addItem = useCallback((product, qty, color, unitPrice = product.price) => {
    setItems(prev => {
      const key = `${product.id}-${color}-${unitPrice}`;
      const existing = prev.find(i => i.key === key);
      if (existing) {
        return prev.map(i => i.key === key ? { ...i, qty: i.qty + qty } : i);
      }
      return [...prev, {
        key,
        id: product.id,
        name: product.name,
        price: unitPrice,
        color,
        qty,
        image: product.images[color],
        platform: product.platform,
      }];
    });
    setIsOpen(true);
  }, []);

  // Combo Google+Instagram: una sola línea atómica (qty fija en 1), no dos
  // líneas separadas — así nadie puede sacar del carrito solo una mitad y
  // quedarse con la otra al precio promocional del combo. Si ya estaba en el
  // carrito, se actualizan sus colores/precio en vez de ignorarlos, para que
  // volver a "Agregar" después de cambiar el color realmente lo refleje.
  const addBundle = useCallback((bundle) => {
    setItems(prev => {
      const existing = prev.find(i => i.key === bundle.key);
      if (existing) {
        return prev.map(i => i.key === bundle.key
          ? { ...i, name: bundle.name, price: bundle.price, items: bundle.items }
          : i
        );
      }
      return [...prev, {
        key: bundle.key,
        id: bundle.key,
        name: bundle.name,
        price: bundle.price,
        qty: 1,
        isBundle: true,
        items: bundle.items,
      }];
    });
    setIsOpen(true);
  }, []);

  const removeItem = useCallback((key) => {
    setItems(prev => prev.filter(i => i.key !== key));
  }, []);

  const updateQty = useCallback((key, qty) => {
    if (qty < 1) return removeItem(key);
    setItems(prev => prev.map(i => i.key === key ? { ...i, qty } : i));
  }, [removeItem]);

  const clearCart = useCallback(() => setItems([]), []);

  const totalItems = items.reduce((sum, i) => sum + i.qty, 0);
  const totalPrice = items.reduce((sum, i) => sum + i.price * i.qty, 0);

  return (
    <CartContext.Provider value={{
      items, isOpen, setIsOpen,
      addItem, addBundle, removeItem, updateQty, clearCart,
      totalItems, totalPrice,
    }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
