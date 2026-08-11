// ============================================================================
// Catálogo de precios de apps/ventas, replicado acá para que el servidor no
// confíe en el precio que manda el cliente en /api/create-preference,
// /api/process-payment y /api/orders/transfer (antes se armaba la preferencia
// de Mercado Pago y se cobraba directo con item.price / transaction_amount
// del body — cualquiera podía pedir un producto real a $1 con un curl).
//
// FUENTE DE VERDAD ACTUAL: apps/ventas/src/pages/Shop/Shop.jsx (UNIT_PRICE,
// DOUBLE_TOTAL_PRICE, COMBO_TOTAL_PRICE). Es una segunda fuente de verdad a
// propósito — el precio real SIEMPRE tiene que decidirlo el servidor, nunca
// el cliente — así que si cambian los precios o tiers en Shop.jsx hay que
// actualizar este archivo en el mismo cambio. Si el checkout real que se
// está reconstruyendo (ver CLAUDE.md) termina con un catálogo en la base de
// datos, este archivo se reemplaza por una consulta a esa tabla.
// ============================================================================

const UNIT_PRICE = 41000;          // tier "1 unidad" y "Pedido grande" (bulk, sin descuento — ver Shop.jsx)
const DOUBLE_UNIT_PRICE = 32800;   // tier "2 unidades": 65.600 total / 2, 20% off
const COMBO_TOTAL_PRICE = 61500;   // tier "Combo Google + Instagram": precio fijo del bundle completo

const BASE_PRODUCT_IDS = new Set(['google-nfc', 'instagram-nfc']);
const COMBO_ID = 'combo-google-nfc-instagram-nfc';
const VALID_UNIT_PRICES = new Set([UNIT_PRICE, DOUBLE_UNIT_PRICE]);

// Devuelve null si el item es válido, o el motivo del rechazo si no.
function catalogViolation(item) {
  const id = String(item.id ?? item.key ?? '');

  if (item.isBundle || id === COMBO_ID) {
    if (id !== COMBO_ID) return `Bundle desconocido: ${id}`;
    if (item.price !== COMBO_TOTAL_PRICE) {
      return `Precio inválido para ${id}: esperado ${COMBO_TOTAL_PRICE}`;
    }
    return null;
  }

  if (!BASE_PRODUCT_IDS.has(id)) {
    return `Producto desconocido: ${id}`;
  }
  if (!VALID_UNIT_PRICES.has(item.price)) {
    return `Precio inválido para ${id}: ${item.price}`;
  }
  return null;
}

// Tira un Error con status 400 en el primer item que no matchee el catálogo.
export function assertCatalogPrices(items) {
  for (const item of items) {
    const violation = catalogViolation(item);
    if (violation) {
      const err = new Error(violation);
      err.status = 400;
      throw err;
    }
  }
}

// El monto que se le cobra a Mercado Pago tiene que ser exactamente la suma
// de precios de catálogo × cantidad — nunca un número aparte que mande el
// cliente (transaction_amount en /api/process-payment).
export function assertMatchesCatalogTotal(amount, items) {
  const expected = items.reduce((sum, i) => sum + i.price * i.qty, 0);
  if (Math.abs(amount - expected) > 0.01) {
    const err = new Error(`El monto (${amount}) no coincide con el total del carrito (${expected})`);
    err.status = 400;
    throw err;
  }
}
