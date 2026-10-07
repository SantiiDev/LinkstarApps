import { createContext, useContext, useState, useCallback, useEffect } from 'react';

const CartContext = createContext(null);

/* El carrito sobrevive a recargar la página.
 *
 * Vivía sólo en memoria: el visitante elegía dos expositores, iba a leer la
 * política de devoluciones y volvía con el carrito vacío.
 *
 * La versión invalida los carritos viejos. Hay que subirla cuando cambien los
 * precios o la forma de los ítems — si no, un carrito guardado hace semanas
 * llega al checkout con precios que el catálogo del servidor ya no acepta y el
 * visitante se come un 400 que no puede entender ni arreglar.
 *
 * Se subió a 2 cuando el tier "2 unidades" pasó a ser un pack: antes guardaba
 * dos unidades sueltas a $32.800, y ese precio ya no es válido para un ítem
 * suelto (ver services/api/lib/catalog.js).
 */
const STORAGE_KEY = 'linkstar_cart';
const STORAGE_VERSION = 2;

function readStoredCart() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (parsed?.v !== STORAGE_VERSION || !Array.isArray(parsed.items)) return [];

    // Forma mínima: una entrada corrupta rompería el render del cajón.
    return parsed.items.filter((i) =>
      i &&
      typeof i.key === 'string' &&
      typeof i.name === 'string' &&
      typeof i.price === 'number' && i.price > 0 &&
      Number.isInteger(i.qty) && i.qty > 0,
    );
  } catch {
    // localStorage puede no existir (modo privado, cookies bloqueadas) o traer
    // cualquier cosa. El carrito tiene que seguir funcionando en memoria.
    return [];
  }
}

export function CartProvider({ children }) {
  const [items, setItems] = useState(readStoredCart);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: STORAGE_VERSION, items }));
    } catch {
      // Cuota llena o almacenamiento bloqueado: no es motivo para romper nada.
    }
  }, [items]);

  /* `unitPrice` es obligatorio y no tiene default: el precio lo decide el tier
     que el comprador eligió en la tienda, no el producto. Antes caía por
     defecto a `product.price`, que era una copia suelta del precio de lista. */
  const addItem = useCallback((product, qty, color, unitPrice) => {
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
