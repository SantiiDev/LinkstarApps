/* Análisis SEO de una ficha de Google (SEO Local, fase 4.8).
 *
 * Google NO publica un «puntaje de SEO local»: ese número no existe del otro
 * lado. Este es uno propio, y es transparente: cada punto sale de un dato
 * concreto de la ficha que el cliente puede ver y corregir. Seis categorías que
 * suman 100 (los nombres siguen a la pantalla de Tapstar, que es la referencia):
 *
 *   Presencia visual          18   portada, logo, cantidad de fotos, fotos nuevas
 *   Keywords y servicios      12   descripción, rubro y ciudad en ella, servicios
 *   Actividad                 10   publicaciones en 30 días y constancia en 90
 *   Relevancia de categoría   20   categoría principal, secundarias, atributos
 *   Ficha NAP                 20   dirección o zona, nombre sin relleno, teléfono,
 *                                  web, horarios
 *   Reputación                20   puntaje, cantidad, % respondidas (90 días),
 *                                  velocidad de respuesta, reseñas del mes
 *
 * Actividad cuenta publicaciones, no mira cuándo fue la última: una sola ayer
 * después de meses en blanco no es «una por semana». Y el % de respondidas es de
 * los últimos 90 días, para que un atraso viejo no hunda el número para siempre.
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

/* Las palabras con contenido del rubro («empresa de software» → empresa,
   software). Desde 3 letras: «bar» es un rubro entero. */
function categoryWordsOf(location) {
  const category = location.categories?.primaryCategory?.displayName ?? '';
  return strip(category).split(/[^a-zñ]+/).filter((w) => w.length >= 3 && !STOPWORDS.has(w));
}

/* Al comienzo de una palabra: «bares» cuenta como «bar», «barato» no. `text`
   ya pasado por strip(). */
function mentionsWord(text, word) {
  return new RegExp(`(^|[^a-zñ])${word}(es|s)?([^a-zñ]|$)`).test(text);
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
  const categoryWords = categoryWordsOf(location);
  const city = location.storefrontAddress?.locality ?? '';
  const mentionsCategory = categoryWords.some((w) => mentionsWord(desc, w));
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
function activity({ posts, now }) {
  const unknown = posts === null;
  const live = (posts ?? []).filter((p) => p.state !== 'REJECTED' && p.createTime);
  const within = (days) => live.filter((p) => now - new Date(p.createTime) <= days * DAY).length;
  const last30 = within(30);
  const last90 = within(90);

  return [
    check({
      id: 'posts_30d', label: 'Publicaciones (30 días)', max: 6, unknown,
      score: (6 * Math.min(last30, 4)) / 4,
      current: `${last30} en 30 días`, target: 'Objetivo: 4 en 30 días', action: 'posts',
      tip: last30 >= 4
        ? 'Publicás todas las semanas: la ficha se ve viva y suma texto con el que Google te asocia.'
        : `${plural(last30, 'publicación', 'publicaciones')} en 30 días. Lo que cuenta es la constancia, no el volumen: una por semana rinde más que cuatro juntas el día 30, porque Google mira que la ficha esté activa todo el tiempo. Elegí un día fijo para publicar una novedad, oferta o evento.`,
    }),
    check({
      id: 'posts_90d', label: 'Constancia de publicación (90 días)', max: 4, unknown,
      score: (4 * Math.min(last90, 12)) / 12,
      current: `${last90} en 90 días`, target: 'Objetivo: 12 en 90 días', action: 'posts',
      tip: last90 >= 12
        ? 'Llevás meses publicando seguido. Es justo lo que Google premia: que la ficha no tenga baches.'
        : 'Google no mira sólo el último mes: valora que la ficha lleve meses publicando. Un mes bueno seguido de dos en blanco suma menos que una publicación por semana sostenida.',
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

/* Relleno en el nombre («Peluquería López | Peluquería en Rosario»): lo que viene
   después de un separador nombra la ciudad o el rubro. Criterio conservador a
   propósito: sólo mira lo que sigue al primer separador, así «Bar Palermo» o
   «Café del Parque - Centro» (sucursal) no pierden puntos. Devuelve lo detectado
   («la ciudad», «el rubro» o los dos) o null. */
function nameStuffing(location) {
  const segments = strip(location.title).split(/\s*[|·•,]\s*|\s+[-–—]\s+/).filter(Boolean);
  if (segments.length < 2) return null;
  const extra = segments.slice(1).join(' ');
  const city = strip(location.storefrontAddress?.locality);
  const hasCity = Boolean(city) && extra.includes(city);
  const hasCategory = categoryWordsOf(location).some((w) => mentionsWord(extra, w));
  if (hasCity && hasCategory) return 'la ciudad y el rubro';
  if (hasCity) return 'la ciudad';
  if (hasCategory) return 'el rubro';
  return null;
}
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

  const stuffed = nameStuffing(location);

  return [
    check({
      id: 'address', label: 'Dirección o zona de servicio', max: 4, score: hasAddress || hasArea ? 4 : 0,
      current: hasAddress ? 'Dirección cargada' : hasArea ? 'Zona de servicio' : null, action: 'google',
      tip: 'Sin dirección ni zona de servicio, Google no sabe dónde mostrarte en el mapa. Cargá la dirección del local o, si vas a domicilio, la zona que cubrís.',
    }),
    check({
      id: 'name', label: 'Nombre del negocio', max: 2, score: stuffed ? 0 : 2,
      current: stuffed ? `Agrega ${stuffed}` : null, action: 'google',
      tip: stuffed
        ? `Tu nombre en Google suma ${stuffed} después del nombre del negocio. Agregar la ciudad o el rubro al nombre va contra las reglas de Google y puede suspender la ficha. Dejalo como figura en tu cartel: la ciudad y el rubro van en la descripción.`
        : 'Nombre limpio, sin ciudad ni rubro agregados. Así tiene que quedar: rellenarlo con palabras clave es motivo de suspensión.',
    }),
    check({
      id: 'phone', label: 'Teléfono', max: 3, score: phone ? 3 : 0, current: phone || null, action: 'profile',
      tip: phone
        ? 'Teléfono cargado. Que sea el mismo que figura en tu web y tus redes: la coherencia de nombre, dirección y teléfono es una señal de confianza.'
        : 'Cargá un teléfono. «Llamar» es de los botones que más se tocan en una ficha.',
    }),
    check({
      id: 'website', label: 'Sitio web', max: 3, score: web ? 3 : 0, current: web || null, action: 'profile',
      tip: web
        ? 'Web cargada. Si tenés una página para cada sucursal, enlazá esa y no la de inicio.'
        : 'Cargá tu web, o tu Instagram si no tenés una. Es uno de los tres botones de la ficha.',
    }),
    check({
      id: 'hours', label: 'Horario', max: 6, score: periods ? 6 : 0,
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
  const recent = stored.filter((r) => now - new Date(r.created_time) <= 90 * DAY);
  const lastMonth = stored.filter((r) => now - new Date(r.created_time) <= 30 * DAY).length;

  // % respondidas de los últimos 90 días: un atraso de hace años no tiene que
  // hundir el número para siempre. Con menos de 5 reseñas en ese período el %
  // salta demasiado (1 sin responder = 0 %), y se usa todo el historial.
  const rateBase = recent.length >= 5 ? recent : stored;
  const replied = rateBase.filter((r) => r.reply_comment).length;
  const replyPct = rateBase.length ? replied / rateBase.length : null;
  const rateWindow = rateBase === recent ? 'últimos 90 días' : 'todas';

  // Velocidad: mediana de días entre la reseña y la respuesta, sobre las de los
  // últimos 90 días. Sin reseñas recientes no hay nada que medir, y no se castiga.
  const delays = recent
    .filter((r) => r.reply_updated_time)
    .map((r) => (new Date(r.reply_updated_time) - new Date(r.created_time)) / DAY)
    .filter((d) => d >= 0)
    .sort((a, b) => a - b);
  const median = delays.length ? delays[Math.floor(delays.length / 2)] : null;
  let speedScore = 3;
  let speedCurrent = 'Sin reseñas en 90 días';
  if (recent.length) {
    speedScore = median === null ? 0 : median <= 2 ? 3 : median <= 7 ? 2 : 1;
    speedCurrent = median === null ? 'Ninguna respondida en 90 días' : `${plural(Math.max(1, Math.round(median)), 'día', 'días')} de mediana`;
  }

  return [
    check({
      id: 'rating', label: 'Puntaje promedio', max: 6,
      score: rating == null ? 0 : rating >= 4.5 ? 6 : rating >= 4.0 ? 4 : rating >= 3.5 ? 2 : 0,
      current: rating == null ? 'Sin puntaje' : `${String(rating).replace('.', ',')} ★`, target: 'Objetivo: 4,5 ★', action: 'devices',
      tip: 'El promedio sube con volumen: pedile la reseña a cada cliente contento, en el momento. Para eso están tus expositores.',
    }),
    check({
      id: 'review_count', label: 'Cantidad de reseñas', max: 4,
      score: total >= 100 ? 4 : total >= 50 ? 3 : total >= 20 ? 2 : total >= 5 ? 1 : 0,
      current: plural(total, 'reseña', 'reseñas'), target: 'Objetivo: 100', action: 'devices',
      tip: 'La cantidad de reseñas es de lo que más mueve la posición en el mapa. Un expositor en cada mesa o mostrador las multiplica.',
    }),
    check({
      id: 'reply_rate', label: 'Reseñas respondidas', max: 5,
      score: replyPct === null ? 5 : replyPct >= 0.9 ? 5 : replyPct >= 0.6 ? 3 : replyPct >= 0.3 ? 1 : 0,
      current: replyPct === null ? 'Sin reseñas' : `${replied} de ${rateBase.length} · ${Math.round(replyPct * 100)} % · ${rateWindow}`,
      target: 'Objetivo: 90%', action: 'reviews',
      tip: 'Respondé todas, también las de cinco estrellas sin texto: un «gracias» alcanza. Las negativas, con calma y ofreciendo una solución.',
    }),
    check({
      id: 'reply_speed', label: 'Velocidad de respuesta', max: 3, score: speedScore,
      current: speedCurrent, target: 'Objetivo: en 2 días', action: 'reviews',
      tip: 'Respondé cada reseña en uno o dos días, las buenas y las malas. Una respuesta a los diez días ya no la lee nadie, y Google ve la ficha como poco atendida.',
    }),
    check({
      id: 'recent_reviews', label: 'Reseñas del último mes', max: 2, score: lastMonth >= 4 ? 2 : lastMonth >= 1 ? 1 : 0,
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

/* De mayor a menor. apps/dashboard/src/lib/companyOverview.js (seoLevelOf) y la
   maqueta de GoogleGate copian estos cortes: si cambian acá, cambian allá. */
const LEVELS = [
  { at: 85, label: 'Destacada' },
  { at: 65, label: 'Bien posicionada' },
  { at: 35, label: 'Visible online' },
  { at: 0, label: 'Difícil de encontrar' },
];

export function levelOf(score) {
  return LEVELS.find((l) => score >= l.at).label;
}

/* El nivel siguiente y cuántos puntos faltan; null en el más alto. */
function nextLevelOf(score) {
  const next = [...LEVELS].reverse().find((l) => l.at > score);
  return next ? { level: next.label, points: next.at - score } : null;
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
    next: nextLevelOf(score),
    closed: isClosed(input.location),
    best: ranked[0]?.label ?? null,
    worst: ranked.at(-1)?.label ?? null,
    categories,
  };
}

function isClosed(location) {
  return ['CLOSED_PERMANENTLY', 'CLOSED_TEMPORARILY'].includes(location.openInfo?.status);
}
