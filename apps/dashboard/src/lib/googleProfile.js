/*
 * Cómo se muestra una ficha de Google en el panel (Perfil y su protección):
 * nombres de los campos, horarios, redes y descripciones de atributos. Sin
 * consultas — los datos llegan del API (routes/googleProfile.js) y de
 * google_profile_changes.
 */

export const DAYS = [
  ['MONDAY', 'Lunes'], ['TUESDAY', 'Martes'], ['WEDNESDAY', 'Miércoles'], ['THURSDAY', 'Jueves'],
  ['FRIDAY', 'Viernes'], ['SATURDAY', 'Sábado'], ['SUNDAY', 'Domingo'],
];

export const OPEN_STATUS = {
  OPEN: 'Abierto',
  CLOSED_TEMPORARILY: 'Cerrado temporalmente',
  CLOSED_PERMANENTLY: 'Cerrado permanentemente',
};

/* Los campos que vigila la protección de ficha (diffMask de Google). */
export const FIELD_LABELS = {
  title: 'Nombre',
  phoneNumbers: 'Teléfono',
  categories: 'Categoría',
  storefrontAddress: 'Dirección',
  websiteUri: 'Sitio web',
  regularHours: 'Horario',
  profile: 'Descripción',
  openInfo: 'Abierto / cerrado',
};

const pad = (n) => String(n ?? 0).padStart(2, '0');
export const hhmm = (t) => (t ? `${pad(t.hours)}:${pad(t.minutes)}` : '');

export function hoursLabel(regularHours, day) {
  const periods = (regularHours?.periods ?? []).filter((p) => p.openDay === day);
  if (!periods.length) return null;
  return periods.map((p) => `${hhmm(p.openTime)}–${hhmm(p.closeTime) || '24:00'}`).join(', ');
}

/* Un valor de la ficha, en una línea legible, para mostrar un cambio de Google. */
export function describeValue(field, value) {
  if (value == null) return '—';
  switch (field) {
    case 'phoneNumbers':
      return [value.primaryPhone, ...(value.additionalPhones ?? [])].filter(Boolean).join(', ') || '—';
    case 'websiteUri':
    case 'title':
      return value || '—';
    case 'profile':
      return value.description || '—';
    case 'openInfo':
      return OPEN_STATUS[value.status] ?? value.status ?? '—';
    case 'categories':
      return value.primaryCategory?.displayName ?? '—';
    case 'regularHours':
      return DAYS.map(([d, label]) => `${label.slice(0, 3)} ${hoursLabel(value, d) ?? 'cerrado'}`).join(' · ');
    case 'storefrontAddress':
      return [...(value.addressLines ?? []), value.locality].filter(Boolean).join(', ') || '—';
    default:
      return JSON.stringify(value);
  }
}

/* Redes: los atributos de enlace que Google habilita según el rubro. WhatsApp
   se muestra aparte, como un teléfono más. */
export const WHATSAPP_ATTRIBUTE = 'attributes/url_whatsapp';
export const SOCIAL = {
  'attributes/url_facebook': { label: 'Facebook', icon: 'facebook' },
  'attributes/url_instagram': { label: 'Instagram', icon: 'instagram' },
  'attributes/url_twitter': { label: 'Twitter / X', icon: 'x' },
  'attributes/url_youtube': { label: 'YouTube', icon: 'youtube' },
  'attributes/url_linkedin': { label: 'LinkedIn', icon: 'linkedin' },
  'attributes/url_tiktok': { label: 'TikTok', icon: 'tiktok' },
  'attributes/url_pinterest': { label: 'Pinterest', icon: 'pinterest' },
  'attributes/url_facebook_messenger': { label: 'Messenger', icon: 'message' },
  'attributes/url_text_messaging': { label: 'Mensajes de texto', icon: 'message' },
  'attributes/url_appointment': { label: 'Turnos online', icon: 'calendar' },
  [WHATSAPP_ATTRIBUTE]: { label: 'WhatsApp', icon: 'whatsapp' },
};

/* Una línea de explicación por atributo. Los nombres son los de la Business
   Information API (los de accesibilidad y turnos, comprobados contra la ficha
   real el 8 oct 2026; el resto, los nombres que publica Google, sin comprobar
   uno por uno). No es una lista de atributos a ofrecer: los que se muestran son
   siempre los que Google habilita para el rubro de la ficha. Un atributo que no
   esté acá (o que Google nombre distinto) no se queda sin descripción:
   attributeHint() le da una según su grupo. */
export const ATTRIBUTE_HINTS = {
  // Accesibilidad
  'attributes/has_wheelchair_accessible_entrance': 'La entrada se puede usar en silla de ruedas',
  'attributes/has_wheelchair_accessible_restroom': 'Baño adaptado para personas con movilidad reducida',
  'attributes/has_wheelchair_accessible_seating': 'Mesas o asientos adaptados',
  'attributes/has_wheelchair_accessible_parking': 'Estacionamiento reservado y accesible',
  'attributes/has_wheelchair_accessible_elevator': 'Ascensor apto para silla de ruedas',
  'attributes/has_assistive_hearing_loop': 'Bucle magnético para personas con audífonos',
  // Comodidades
  'attributes/has_restroom': 'Baño disponible para clientes',
  'attributes/has_gender_neutral_restroom': 'Baño sin distinción de género',
  'attributes/has_changing_tables': 'Cambiador para bebés en el baño',
  'attributes/has_wi_fi': 'Wi-Fi disponible para clientes',
  'attributes/has_bar_onsite': 'Tiene barra para tomar algo',
  'attributes/has_fireplace': 'Tiene hogar o chimenea',
  'attributes/has_live_music': 'Música en vivo',
  'attributes/has_live_performances': 'Shows o espectáculos en vivo',
  'attributes/has_rooftop_seating': 'Mesas en la terraza',
  'attributes/has_private_dining_room': 'Salón privado para grupos o eventos',
  'attributes/has_high_chairs': 'Sillas altas para bebés',
  'attributes/has_childrens_menu': 'Menú pensado para chicos',
  'attributes/has_seating': 'Hay lugar para sentarse',
  // Opciones de servicio
  'attributes/has_delivery': 'Envíos a domicilio',
  'attributes/has_no_contact_delivery': 'Entrega sin contacto, en la puerta',
  'attributes/has_same_day_delivery': 'Envío en el mismo día',
  'attributes/has_takeout': 'Pedidos para llevar',
  'attributes/has_curbside_pickup': 'Retiro en la vereda, sin bajar del auto',
  'attributes/has_in_store_pickup': 'Comprás online y retirás en el local',
  'attributes/has_in_store_shopping': 'Se puede comprar en el local',
  'attributes/serves_dine_in': 'Se puede comer en el local',
  'attributes/has_seating_outdoors': 'Mesas al aire libre',
  'attributes/accepts_reservations': 'Se puede reservar mesa',
  'attributes/has_catering': 'Hace servicio de catering',
  'attributes/has_onsite_services': 'Se atiende en el local',
  'attributes/offers_online_classes': 'Clases o servicios por internet',
  // Turnos
  'attributes/requires_appointments': 'Sólo se atiende con turno',
  'attributes/offers_online_appointments': 'Se pueden pedir turnos por internet',
  // Qué sirve
  'attributes/serves_breakfast': 'Sirve desayunos',
  'attributes/serves_brunch': 'Sirve brunch',
  'attributes/serves_lunch': 'Sirve almuerzos',
  'attributes/serves_dinner': 'Sirve cenas',
  'attributes/serves_dessert': 'Tiene postres',
  'attributes/serves_coffee': 'Sirve café',
  'attributes/serves_alcohol': 'Sirve bebidas con alcohol',
  'attributes/serves_beer': 'Sirve cerveza',
  'attributes/serves_wine': 'Sirve vino',
  'attributes/serves_cocktails': 'Sirve tragos',
  'attributes/serves_happy_hour_drinks': 'Tiene happy hour de bebidas',
  'attributes/serves_happy_hour_food': 'Tiene happy hour de comidas',
  'attributes/serves_late_night_food': 'Sirve comida hasta tarde',
  'attributes/serves_vegetarian': 'Tiene opciones vegetarianas',
  'attributes/serves_vegan': 'Tiene opciones veganas',
  'attributes/serves_healthy_food': 'Tiene opciones saludables',
  'attributes/serves_organic': 'Tiene productos orgánicos',
  'attributes/serves_small_plates': 'Platos chicos para compartir',
  // Público
  'attributes/good_for_kids': 'Ambiente apto para ir con chicos',
  'attributes/good_for_groups': 'Cómodo para ir en grupo',
  'attributes/good_for_working_on_laptop': 'Cómodo para trabajar con la computadora',
  'attributes/welcomes_dogs': 'Se puede entrar con perros',
  'attributes/welcomes_lgbtq': 'Espacio amigable con la comunidad LGBTQ+',
  'attributes/is_transgender_safespace': 'Espacio seguro para personas trans',
  // De la empresa
  'attributes/is_owned_by_women': 'La ficha muestra que es un negocio de mujeres',
  // Pagos
  'attributes/pay_credit_card': 'Acepta tarjeta de crédito',
  'attributes/pay_debit_card': 'Acepta tarjeta de débito',
  'attributes/pay_mobile_nfc': 'Pagos sin contacto con el celular',
  'attributes/pay_check': 'Acepta cheques',
  'attributes/requires_cash_only': 'Sólo se cobra en efectivo',
  // Estacionamiento
  'attributes/has_parking': 'Hay estacionamiento',
  'attributes/free_parking_lot': 'Estacionamiento propio sin cargo',
  'attributes/paid_parking_lot': 'Estacionamiento propio pago',
  'attributes/free_street_parking': 'Se puede estacionar gratis en la calle',
  'attributes/paid_street_parking': 'Estacionamiento medido en la calle',
  'attributes/free_garage_parking': 'Cochera sin cargo',
  'attributes/paid_garage_parking': 'Cochera paga',
  'attributes/has_valet_parking': 'Servicio de valet parking',
};

/* Para un atributo que no está en la lista: una línea según el grupo en el que
   lo pone Google (el nombre del grupo llega en español, de la API). Dice para
   qué sirve marcarlo, no qué significa: eso ya lo dice su nombre. */
const GROUP_HINTS = [
  ['accesib', 'Le dice a quien lo necesita si puede entrar y moverse en tu local'],
  ['pago', 'Cómo te pueden pagar: se ve antes de que vayan'],
  ['estacion', 'Dónde dejar el auto: se ve antes de que vayan'],
  ['servicio', 'Cómo atendés: Google lo muestra en tu ficha'],
  ['comodidad', 'Lo que ofrece tu local: Google lo muestra en tu ficha'],
  ['público', 'A quién recibís: Google lo muestra en tu ficha'],
  ['publico', 'A quién recibís: Google lo muestra en tu ficha'],
  ['niño', 'Para familias con chicos: Google lo muestra en tu ficha'],
  ['mascota', 'Si se puede ir con mascotas: Google lo muestra en tu ficha'],
  ['turno', 'Cómo pedir turno: Google lo muestra en tu ficha'],
];

const FALLBACK_HINT = 'Google lo muestra en tu ficha para que tus clientes sepan qué esperar';

/* La descripción de un atributo: la propia si la tiene, si no la de su grupo. */
export function attributeHint(attribute) {
  if (ATTRIBUTE_HINTS[attribute.name]) return ATTRIBUTE_HINTS[attribute.name];
  const group = (attribute.group ?? '').toLocaleLowerCase('es');
  return GROUP_HINTS.find(([key]) => group.includes(key))?.[1] ?? FALLBACK_HINT;
}

/* Los tres estados de un atributo sí/no en Google. «No» no es lo mismo que
   «sin cargar»: se publica en la ficha («No tiene entrada accesible»), así que
   mostrar «No» por algo que el dueño nunca cargó le diría al cliente algo falso. */
export const ATTRIBUTE_STATES = [
  { value: true, label: 'Sí', tone: 'yes' },
  { value: false, label: 'No', tone: 'no' },
  { value: null, label: 'Sin cargar', tone: 'unset' },
];

export const attributeState = (value) =>
  ATTRIBUTE_STATES.find((s) => s.value === (value ?? null)) ?? ATTRIBUTE_STATES[2];

/* El ícono de un grupo de atributos, por el nombre que le da Google. */
export function attributeGroupIcon(group = '') {
  const g = group.toLocaleLowerCase('es');
  if (g.includes('accesib')) return 'accessibility';
  if (g.includes('pago')) return 'card';
  return 'check';
}
