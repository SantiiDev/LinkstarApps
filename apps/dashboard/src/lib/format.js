// Importes en pesos, siempre sin centavos: los precios del producto son
// redondos y "$24.900,00" en una tarjeta de plan sólo agrega ruido.
export const formatArs = (value) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(Number(value));
