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

/* Una línea de explicación para los atributos más comunes. Los nombres son los
   de la Business Information API (los de accesibilidad y turnos, comprobados
   contra la ficha real el 8 oct 2026); uno que no esté acá (o que Google nombre
   distinto) se muestra igual, sin descripción. No es una lista de atributos a
   ofrecer: los que se muestran son siempre los que Google habilita para el
   rubro de la ficha. */
export const ATTRIBUTE_HINTS = {
  'attributes/has_wheelchair_accessible_entrance': 'La entrada se puede usar en silla de ruedas',
  'attributes/has_wheelchair_accessible_restroom': 'Baño adaptado para personas con movilidad reducida',
  'attributes/has_wheelchair_accessible_seating': 'Mesas o asientos adaptados',
  'attributes/has_wheelchair_accessible_parking': 'Estacionamiento reservado y accesible',
  'attributes/has_wheelchair_accessible_elevator': 'Ascensor apto para silla de ruedas',
  'attributes/has_restroom': 'Baño disponible para clientes',
  'attributes/welcomes_dogs': 'Se puede entrar con perros',
  'attributes/has_seating_outdoors': 'Mesas al aire libre',
  'attributes/good_for_kids': 'Ambiente apto para ir con chicos',
  'attributes/has_delivery': 'Envíos a domicilio',
  'attributes/has_takeout': 'Pedidos para llevar',
  'attributes/serves_dine_in': 'Se puede comer en el local',
  'attributes/pay_credit_card': 'Acepta tarjeta de crédito',
  'attributes/pay_debit_card': 'Acepta tarjeta de débito',
  'attributes/pay_mobile_nfc': 'Pagos sin contacto con el celular',
  'attributes/requires_cash_only': 'Sólo se cobra en efectivo',
  'attributes/requires_appointments': 'Sólo se atiende con turno',
  'attributes/offers_online_appointments': 'Se pueden pedir turnos por internet',
  'attributes/has_onsite_services': 'Se atiende en el local',
  'attributes/welcomes_lgbtq': 'Espacio amigable con la comunidad LGBTQ+',
  'attributes/is_owned_by_women': 'La ficha muestra que es un negocio de mujeres',
};

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
