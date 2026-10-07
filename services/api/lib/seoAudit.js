/* Análisis SEO de una ficha de Google (SEO Local, fase 4.8).
 *
 * Google NO publica un «puntaje de SEO local»: ese número no existe del otro
 * lado. Este es uno propio, y es transparente: cada punto sale de un dato
 * concreto de la ficha que el cliente puede ver y corregir. Seis categorías que
 * suman 100 (los nombres siguen a la pantalla de Tapstar, que es la referencia):
 *
 *   Presencia visual          18   portada, logo, cantidad de fotos, fotos nuevas
 *   Keywords y servicios      12   descripción, rubro y ciudad en ella, servicios
 *   Actividad                 10   publicaciones recientes, velocidad de respuesta
 *   Relevancia de categoría   20   categoría principal, secundarias, atributos
 *   Ficha NAP                 20   dirección o zona, teléfono, web, horarios
 *   Reputación                20   puntaje, cantidad, % respondidas, reseñas del mes
 *
 * Lo que no se pudo leer (p. ej. las fotos, si Google no respondió) queda como
 * 'unknown' y NO cuenta en el máximo: el puntaje se normaliza sobre lo que sí se
 * midió, en vez de castigar por algo que no sabemos.
 *
 * Es una función pura, sin llamadas: lo que lee de Google lo junta la ruta
 * (routes/googleProfile.js, GET /api/google/seo).
 */

const DAY = 86_400_000;

const STOPWORDS = new Set(['del', 'los', 'las', 'con', 'por', 'para', 'una', 'uno', 'and', 'the']);

const strip = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function check({ id, label, max, score, current = null, target = null, tip, action, unknown = false }) {
  const s = unknown ? 0 : Math.max(0, Math.min(max, Math.round(score)));
  return {
    id,
    label,
    max,
    score: s,
    status: unknown ? 'unknown' : s >= max ? 'ok' : s > 0 ? 'partial' : 'pending',
    current,
    target,
    tip,
    action,
  };
}

function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

/* ─── Presencia visual (18) ─────────────────────────────────────────────── */
function visual({ media, now }) {
  const unknown = media === null;
  const items = media ?? [];
  const byCat = (cats) => items.some((m) => cats.includes(m.locationAssociation?.category));
  const photos = items.filter((m) => (m.mediaFormat ?? 'PHOTO') === 'PHOTO');
  const recent = photos.filter((m) => m.createTime && now - new Date(m.createTime) <= 90 * DAY).length;
  const hasCover = byCat(['COVER']);
  const hasLogo = byCat(['PROFILE', 'LOGO']);

  return [
    check({
      id: 'cover', label: 'Foto de portada', max: 2, score: hasCover ? 2 : 0, unknown, action: 'google',
      tip: hasCover
        ? 'Tenés portada. Es lo primero que se ve de tu ficha: que muestre el local o tu producto estrella.'
        : 'Sin portada, Google elige una por vos, y suele ser la foto de un cliente con mala luz. Subí una horizontal (16:9, mínimo 1024 px) que muestre tu local o tu producto estrella.',
    }),
    check({
      id: 'logo', label: 'Logo', max: 2, score: hasLogo ? 2 : 0, unknown, action: 'google',
      tip: hasLogo
        ? 'Logo subido. Acompaña a tu nombre en los resultados: comprobá que se distinga a 50 px de ancho.'
        : 'Subí tu logo cuadrado. Acompaña a tu nombre en los resultados y ayuda a que te reconozcan de un vistazo.',
    }),
    check({
      id: 'photos', label: 'Fotos en la ficha', max: 7, score: (7 * Math.min(photos.length, 20)) / 20, unknown,
      current: plural(photos.length, 'foto', 'fotos'), target: 'Objetivo: 20 fotos', action: 'google',
      tip: `Tenés ${plural(photos.length, 'foto', 'fotos')}. Subí al menos 20 y repartilas por tipo (fachada, interior, producto, equipo): Google usa las fotos para entender de qué va el negocio, y son lo primero que mira la gente antes de decidir.`,
    }),
    check({
      id: 'fresh_photos', label: 'Fotos nuevas (90 días)', max: 7, score: recent >= 2 ? 7 : recent === 1 ? 4 : 0, unknown,
      current: `${recent} en 90 días`, target: 'Objetivo: 2 en 90 días', action: 'google',
      tip: recent >= 2
        ? 'Subís fotos seguido: la ficha se ve viva y Google lo toma como señal de actividad.'
        : 'Una ficha sin fotos recientes parece abandonada, y la frescura es una señal que Google usa para desempatar. No hace falta una sesión de fotos: dos al mes con el celular alcanzan.',
    }),
  ];
}

/* ─── Keywords y servicios (12) ─────────────────────────────────────────── */
function keywords({ location }) {
  const description = location.profile?.description ?? '';
  const len = description.trim().length;
  const desc = strip(description);

  const category = location.categories?.primaryCategory?.displayName ?? '';
  // Las palabras con contenido del rubro («empresa de software» → empresa,
  // software). Desde 3 letras: «bar» es un rubro entero.
  const categoryWords = strip(category).split(/[^a-zñ]+/).filter((w) => w.length >= 3 && !STOPWORDS.has(w));
  const city = location.storefrontAddress?.locality ?? '';
  // Al comienzo de una palabra: «bares» cuenta como «bar», «barato» no.
  const mentionsCategory = categoryWords.length > 0
    && categoryWords.some((w) => new RegExp(`(^|[^a-zñ])${w}(es|s)?([^a-zñ]|$)`).test(desc));
  const mentionsCity = Boolean(city) && desc.includes(strip(city));
  // Sin dirección no hay ciudad que pedir: esos 2 puntos se dan por cumplidos.
  const mentionScore = (mentionsCategory ? 2 : 0) + (city ? (mentionsCity ? 2 : 0) : 2);

  const services = (location.serviceItems ?? []).length;

  return [
    check({
      id: 'description', label: 'Descripción completa', max: 4, score: len >= 250 ? 4 : len >= 100 ? 2 : 0,
      current: `${len} de 750 caracteres`, target: 'Objetivo: 250 o más', action: 'profile',
      tip: len >= 250
        ? 'Tu descripción tiene buen largo. Revisala cada tanto para que siga diciendo lo que vendés hoy.'
        : 'Contá en 250 a 750 caracteres qué hacés, para quién y dónde. Es texto que Google lee para decidir en qué búsquedas mostrarte.',
    }),
    check({
      id: 'description_terms', label: 'Rubro y ciudad en la descripción', max: 4, score: mentionScore,
      current: [mentionsCategory ? 'menciona el rubro' : 'falta el rubro', city ? (mentionsCity ? `menciona ${city}` : `falta ${city}`) : null].filter(Boolean).join(' · '),
      action: 'profile',
      tip: `Nombrá tu rubro${category ? ` («${category.toLowerCase()}»)` : ''}${city ? ` y tu ciudad («${city}»)` : ''} con las palabras que usaría un cliente. Así coincidís con «${category ? category.toLowerCase() : 'tu rubro'}${city ? ` en ${city}` : ''}», que es como busca la gente.`,
    }),
    check({
      id: 'services', label: 'Servicios o productos cargados', max: 4, score: services >= 5 ? 4 : services >= 1 ? 2 : 0,
      current: plural(services, 'cargado', 'cargados'), target: 'Objetivo: 5 o más', action: 'google',
      tip: 'Cargá en Google cada servicio o producto que ofrecés, con su nombre. Cada uno es una búsqueda más en la que podés aparecer.',
    }),
  ];
}

/* ─── Actividad (10) ────────────────────────────────────────────────────── */
function activity({ posts, reviews, now }) {
  const unknownPosts = posts === null;
  const live = (posts ?? []).filter((p) => p.state !== 'REJECTED');
  const last = live.reduce((max, p) => Math.max(max, new Date(p.createTime ?? 0).getTime()), 0);
  const days = last ? Math.floor((now - last) / DAY) : null;

  // Velocidad de respuesta: mediana de días entre la reseña y la respuesta, sobre
  // las de los últimos 90 días. Sin reseñas recientes no hay nada que medir, y
  // no se castiga.
  const recent = reviews.stored.filter((r) => now - new Date(r.created_time) <= 90 * DAY);
  const replied = recent.filter((r) => r.reply_updated_time);
  const delays = replied
    .map((r) => (new Date(r.reply_updated_time) - new Date(r.created_time)) / DAY)
    .filter((d) => d >= 0)
    .sort((a, b) => a - b);
  const median = delays.length ? delays[Math.floor(delays.length / 2)] : null;
  let replyScore = 5;
  let replyCurrent = 'Sin reseñas en 90 días';
  if (recent.length) {
    replyScore = median === null ? 0 : median <= 2 ? 5 : median <= 7 ? 3 : 1;
    replyCurrent = median === null ? 'Ninguna respondida en 90 días' : `${Math.max(1, Math.round(median))} día(s) de mediana`;
  }

  return [
    check({
      id: 'posts', label: 'Publicación reciente', max: 5, unknown: unknownPosts,
      score: days === null ? 0 : days <= 7 ? 5 : days <= 30 ? 3 : 0,
      current: days === null ? 'Ninguna publicación' : days === 0 ? 'Hoy' : `Hace ${plural(days, 'día', 'días')}`,
      target: 'Objetivo: una por semana', action: 'posts',
      tip: 'Publicá una novedad, oferta o evento por semana. Las publicaciones muestran que el negocio está activo y suman texto con el que Google te asocia.',
    }),
    check({
      id: 'reply_speed', label: 'Respondés rápido', max: 5, score: replyScore,
      current: replyCurrent, target: 'Objetivo: en 2 días', action: 'reviews',
      tip: 'Respondé cada reseña en uno o dos días, las buenas y las malas. Google lo ve como actividad, y quien lee tus reseñas también.',
    }),
  ];
}

/* ─── Relevancia de categoría (20) ──────────────────────────────────────── */
function category({ location, attributes }) {
  const primary = location.categories?.primaryCategory?.displayName ?? null;
  const extra = (location.categories?.additionalCategories ?? []).length;
  const unknownAttrs = attributes === null;
  const set = (attributes ?? []).filter((a) => (a.values?.length ?? 0) > 0 || (a.uriValues?.length ?? 0) > 0).length;

  return [
    check({
      id: 'primary_category', label: 'Categoría principal', max: 10, score: primary ? 10 : 0,
      current: primary, action: 'google',
      tip: primary
        ? `Tu categoría principal es «${primary}». Es el factor de relevancia que más pesa: confirmá que sea la más específica que describe lo que vendés.`
        : 'Elegí una categoría principal en Google, la más específica que exista para tu negocio. Es lo que más pesa para aparecer en las búsquedas de tu rubro.',
    }),
    check({
      id: 'extra_categories', label: 'Categorías secundarias', max: 5, score: extra >= 2 ? 5 : extra === 1 ? 3 : 0,
      current: plural(extra, 'cargada', 'cargadas'), target: 'Objetivo: 2 o más', action: 'google',
      tip: 'Sumá las categorías secundarias que también te describen (por ejemplo «cervecería» además de «bar»). Te abren búsquedas que la principal no cubre.',
    }),
    check({
      id: 'attributes', label: 'Atributos completos', max: 5, unknown: unknownAttrs,
      score: set >= 5 ? 5 : set >= 1 ? 2 : 0,
      current: plural(set, 'cargado', 'cargados'), target: 'Objetivo: 5 o más', action: 'profile',
      tip: 'Marcá los atributos que aplican: accesibilidad, wifi, formas de pago, si se puede reservar. Son filtros que la gente usa al buscar.',
    }),
  ];
}

/* ─── Ficha NAP (20) ────────────────────────────────────────────────────── */
function nap({ location, now }) {
  const hasAddress = Boolean(location.storefrontAddress?.addressLines?.length);
  const hasArea = Boolean(location.serviceArea?.places?.placeInfos?.length || location.serviceArea?.regionCode);
  const phone = location.phoneNumbers?.primaryPhone ?? '';
  const web = location.websiteUri ?? '';
  const periods = location.regularHours?.periods?.length ?? 0;
  const upcomingSpecial = (location.specialHours?.specialHourPeriods ?? []).some((p) => {
    const d = p.startDate;
    return d && new Date(Date.UTC(d.year, d.month - 1, d.day)) >= new Date(now - DAY);
  });

  return [
    check({
      id: 'address', label: 'Dirección o zona de servicio', max: 5, score: hasAddress || hasArea ? 5 : 0,
      current: hasAddress ? 'Dirección cargada' : hasArea ? 'Zona de servicio' : null, action: 'google',
      tip: 'Sin dirección ni zona de servicio, Google no sabe dónde mostrarte en el mapa. Cargá la dirección del local o, si vas a domicilio, la zona que cubrís.',
    }),
    check({
      id: 'phone', label: 'Teléfono', max: 4, score: phone ? 4 : 0, current: phone || null, action: 'profile',
      tip: phone
        ? 'Teléfono cargado. Que sea el mismo que figura en tu web y tus redes: la coherencia de nombre, dirección y teléfono es una señal de confianza.'
        : 'Cargá un teléfono. «Llamar» es de los botones que más se tocan en una ficha.',
    }),
    check({
      id: 'website', label: 'Sitio web', max: 4, score: web ? 4 : 0, current: web || null, action: 'profile',
      tip: web
        ? 'Web cargada. Si tenés una página para cada sucursal, enlazá esa y no la de inicio.'
        : 'Cargá tu web, o tu Instagram si no tenés una. Es uno de los tres botones de la ficha.',
    }),
    check({
      id: 'hours', label: 'Horario', max: 5, score: periods ? 5 : 0,
      current: periods ? 'Cargado' : null, action: 'profile',
      tip: periods
        ? 'Horario cargado. Google muestra «Abierto ahora» con él y prioriza a quien está abierto cuando alguien busca.'
        : 'Cargá tu horario. Sin él, Google no puede decir si estás abierto, y en las búsquedas de «abierto ahora» quedás afuera.',
    }),
    check({
      id: 'special_hours', label: 'Horarios especiales', max: 2, score: upcomingSpecial ? 2 : 0,
      current: upcomingSpecial ? 'Hay próximos cargados' : 'Ninguno próximo', action: 'google',
      tip: 'Cargá los horarios de feriados y fechas especiales antes de que lleguen. Una ficha que dice «abierto» un feriado en el que cerrás te cuesta reseñas malas.',
    }),
  ];
}

/* ─── Reputación (20) ───────────────────────────────────────────────────── */
function reputation({ reviews, now }) {
  const { total, rating, stored } = reviews;
  const replied = stored.filter((r) => r.reply_comment).length;
  const replyPct = stored.length ? replied / stored.length : null;
  const lastMonth = stored.filter((r) => now - new Date(r.created_time) <= 30 * DAY).length;

  return [
    check({
      id: 'rating', label: 'Puntaje promedio', max: 7,
      score: rating == null ? 0 : rating >= 4.5 ? 7 : rating >= 4.0 ? 4 : rating >= 3.5 ? 2 : 0,
      current: rating == null ? 'Sin puntaje' : `${String(rating).replace('.', ',')} ★`, target: 'Objetivo: 4,5 ★', action: 'devices',
      tip: 'El promedio sube con volumen: pedile la reseña a cada cliente contento, en el momento. Para eso están tus expositores.',
    }),
    check({
      id: 'review_count', label: 'Cantidad de reseñas', max: 5,
      score: total >= 100 ? 5 : total >= 50 ? 4 : total >= 20 ? 3 : total >= 5 ? 1 : 0,
      current: plural(total, 'reseña', 'reseñas'), target: 'Objetivo: 100', action: 'devices',
      tip: 'La cantidad de reseñas es de lo que más mueve la posición en el mapa. Un expositor en cada mesa o mostrador las multiplica.',
    }),
    check({
      id: 'reply_rate', label: 'Reseñas respondidas', max: 5,
      score: replyPct === null ? 5 : replyPct >= 0.9 ? 5 : replyPct >= 0.6 ? 3 : replyPct >= 0.3 ? 1 : 0,
      current: replyPct === null ? 'Sin reseñas' : `${Math.round(replyPct * 100)}% respondidas`, target: 'Objetivo: 90%', action: 'reviews',
      tip: 'Respondé todas, también las de cinco estrellas sin texto: un «gracias» alcanza. Las negativas, con calma y ofreciendo una solución.',
    }),
    check({
      id: 'recent_reviews', label: 'Reseñas del último mes', max: 3, score: lastMonth >= 4 ? 3 : lastMonth >= 1 ? 2 : 0,
      current: `${lastMonth} en 30 días`, target: 'Objetivo: 4 por mes', action: 'devices',
      tip: 'Google premia las reseñas recientes, no sólo el total. Un flujo constante vale más que muchas de golpe.',
    }),
  ];
}

const CATEGORIES = [
  { id: 'visual', label: 'Presencia visual', build: visual },
  { id: 'keywords', label: 'Keywords y servicios', build: keywords },
  { id: 'activity', label: 'Actividad', build: activity },
  { id: 'category', label: 'Relevancia de categoría', build: category },
  { id: 'nap', label: 'Ficha NAP', build: nap },
  { id: 'reputation', label: 'Reputación', build: reputation },
];

export function levelOf(score) {
  if (score >= 85) return 'Destacada';
  if (score >= 65) return 'Bien posicionada';
  if (score >= 35) return 'Visible online';
  return 'Difícil de encontrar';
}

/* input: { location, attributes|null, media|null, posts|null,
 *          reviews: { total, rating, stored: [{ created_time, reply_comment, reply_updated_time }] },
 *          now? } */
export function auditLocation(input) {
  const now = input.now ?? Date.now();
  const ctx = { ...input, now };

  const categories = CATEGORIES.map(({ id, label, build }) => {
    const checks = build(ctx);
    const known = checks.filter((c) => c.status !== 'unknown');
    return {
      id,
      label,
      max: checks.reduce((s, c) => s + c.max, 0),
      score: known.reduce((s, c) => s + c.score, 0),
      measuredMax: known.reduce((s, c) => s + c.max, 0),
      checks,
    };
  });

  const measuredMax = categories.reduce((s, c) => s + c.measuredMax, 0);
  const raw = categories.reduce((s, c) => s + c.score, 0);
  const score = measuredMax ? Math.round((raw / measuredMax) * 100) : 0;

  // Mejor y peor categoría por porcentaje cumplido (sobre lo medido). En un
  // empate, peor es la que tiene más puntos por ganar: es por donde conviene
  // empezar. La pantalla abre en esa misma categoría.
  const ranked = categories
    .filter((c) => c.measuredMax)
    .map((c) => ({ id: c.id, label: c.label, pct: c.score / c.measuredMax, missing: c.measuredMax - c.score }))
    .sort((a, b) => b.pct - a.pct || a.missing - b.missing);

  return {
    score,
    level: levelOf(score),
    closed: isClosed(input.location),
    best: ranked[0]?.label ?? null,
    worst: ranked.at(-1)?.label ?? null,
    categories,
  };
}

function isClosed(location) {
  return ['CLOSED_PERMANENTLY', 'CLOSED_TEMPORARILY'].includes(location.openInfo?.status);
}
