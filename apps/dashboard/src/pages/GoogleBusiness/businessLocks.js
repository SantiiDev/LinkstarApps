/*
 * Lo que dice cada candado Business (components/BusinessLock) de las secciones
 * de Google, en un solo lugar: la pantalla real y su maqueta de GoogleGate lo
 * leen de acá, así el candado de atrás del modal dice lo mismo que el de la
 * pantalla.
 */

export const METRICS_LOCKS = {
  conversion: {
    title: 'Descubrí cuánta gente hace algo después de ver tu ficha',
    description: 'La tasa de conversión: de cada 100 que te ven, cuántos llaman, piden cómo llegar o entran a tu web.',
  },
  platforms: {
    title: 'Descubrí dónde te buscan tus clientes',
    description: 'Si te encuentran en el buscador de Google o en Google Maps, desde el celular o la computadora, y cómo cambió.',
  },
  keywords: {
    title: 'Descubrí qué busca la gente cuando te encuentra',
    description: 'Las palabras exactas con las que te encuentran en Google, mes a mes.',
  },
  insights: {
    title: 'Qué tenés que hacer para que te busquen más',
    description: 'Una lectura de tus métricas en limpio, con lo que conviene revisar.',
  },
};

export const PROTECTION_LOCK = {
  title: 'Que nadie cambie tu ficha sin que lo sepas',
  description: 'Si Google cambia tu teléfono, tu horario o te marca como cerrado, te avisamos y lo deshacés con un botón.',
};

export const MISSING_TERMS_LOCK = {
  title: 'Las búsquedas que te faltan en la descripción son del plan Business',
  description: 'Cruzamos lo que la gente escribe en Google cuando aparece tu ficha con tu descripción, y te decimos qué palabras sumar.',
};
