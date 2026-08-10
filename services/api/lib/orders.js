import { supabase } from './supabase.js';

export function generateOrderNumber() {
  return `LS-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
}

// Inserta la orden + sus renglones (public.orders / public.order_items,
// ver supabase/migrations/0005_billing_and_orders.sql). Lanza si algo falla:
// mejor un 500 explícito que un pedido "fantasma" sin order_items.
export async function createOrder({ orderNumber, status, paymentMethod, buyer, items, total, extra = {} }) {
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({
      order_number: orderNumber,
      status,
      payment_method: paymentMethod,
      buyer_name: buyer.name,
      buyer_email: buyer.email,
      buyer_phone: buyer.phone || null,
      shipping_address: {
        address: buyer.address,
        city: buyer.city,
        zip: buyer.zip || null,
      },
      subtotal: total,
      shipping_cost: 0,
      discount: 0,
      total,
      ...extra,
    })
    .select()
    .single();

  if (orderError) throw orderError;

  const orderItems = items.map((item) => ({
    order_id: order.id,
    sku: String(item.id ?? item.key),
    product_name: `${item.name}${item.color ? ` - ${item.color === 'negro' ? 'Negro' : 'Blanco'}` : ''}`,
    quantity: item.qty,
    unit_price: item.price,
    total_price: item.price * item.qty,
  }));

  const { error: itemsError } = await supabase.from('order_items').insert(orderItems);
  if (itemsError) throw itemsError;

  return order;
}
