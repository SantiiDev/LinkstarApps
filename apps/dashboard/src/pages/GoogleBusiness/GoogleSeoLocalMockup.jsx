/*
 * MAQUETA DECORATIVA — no es la pantalla, es el fondo.
 *
 * Se renderiza ÚNICAMENTE como `children` de `GoogleGate`, que la deja borrosa,
 * inerte y detrás de un modal que no se puede cerrar. NO agregar otro
 * importador: fuera de esa puerta es una pantalla inventando datos.
 *
 * Es la pantalla real (GoogleSeoLocalScreen) dibujada con los mismos bloques
 * (GoogleSeoBlocks) y un análisis INVENTADO con la forma exacta que devuelve
 * services/api/lib/seoAudit.js: las mismas seis categorías, los mismos checks
 * con sus máximos, y el puntaje, el nivel y la mejor / peor categoría sacados
 * con las mismas cuentas. Así lo que se ve antes de conectar es lo que se ve
 * después. «Búsquedas que no están en tu descripción» (Business) va abierta
 * aunque la cuenta sea gratis, sin candado: detrás del modal de Google la sección
 * se muestra como la ve una cuenta Business. El candado aparece recién en la
 * pantalla real.
 */

import PageHeader from '../../components/PageHeader/PageHeader';
import { MissingTermsCard, Ranking, SeoCategories, SeoSummary } from './GoogleSeoBlocks';
import './GoogleBusiness.css';
import './GoogleMetrics.css';
import './GoogleSeoLocal.css';

const check = (id, label, max, score, action, tip, current = null, target = null) => ({
  id, label, max, score, action, tip, current, target,
  status: score >= max ? 'ok' : score > 0 ? 'partial' : 'pending',
});

/* [categoría, etiqueta, checks]: los ids y máximos de seoAudit.js. `s` son los
   puntajes de cada check, en orden, para poder armar dos fichas distintas. */
function buildCategories(s) {
  return [
    ['visual', 'Presencia visual', [
      check('cover', 'Foto de portada', 2, s.cover, 'google', 'Tenés portada. Es lo primero que se ve de tu ficha: que muestre el local o tu producto estrella.'),
      check('logo', 'Logo', 2, s.logo, 'google', 'Subí tu logo cuadrado. Acompaña a tu nombre en los resultados y ayuda a que te reconozcan de un vistazo.'),
      check('photos', 'Fotos en la ficha', 7, s.photos, 'google', 'Tenés 12 fotos. Subí al menos 20 y repartilas por tipo (fachada, interior, producto, equipo).', '12 fotos', 'Objetivo: 20 fotos'),
      check('fresh_photos', 'Fotos nuevas (90 días)', 7, s.fresh, 'google', 'Una ficha sin fotos recientes parece abandonada. Dos al mes con el celular alcanzan.', '1 en 90 días', 'Objetivo: 2 en 90 días'),
    ]],
    ['keywords', 'Keywords y servicios', [
      check('description', 'Descripción completa', 4, 4, 'profile', 'Tu descripción es completa: cuenta qué hacés y para quién.', '312 de 750 caracteres', 'Objetivo: 250 o más'),
      check('description_terms', 'Rubro y ciudad en la descripción', 4, 2, 'profile', 'Nombrá tu ciudad en la descripción: Google la usa para decidir en qué búsquedas cercanas mostrarte.', 'Falta la ciudad'),
      check('services', 'Servicios o productos cargados', 4, s.services, 'google', 'Cargá al menos 5 productos o servicios: aparecen en tu ficha y suman palabras con las que te encuentran.', '2 cargados', 'Objetivo: 5'),
    ]],
    ['activity', 'Actividad', [
      check('posts', 'Publicación reciente', 5, s.posts, 'posts', 'No publicaste nada en los últimos 30 días. Una novedad por semana mantiene la ficha activa.', 'Hace 45 días', 'Objetivo: una cada 30 días'),
      check('reply_speed', 'Respondés rápido', 5, s.speed, 'reviews', 'Respondés en promedio a los 6 días. Contestar en menos de 2 le muestra a Google y a tus clientes que estás.', '6 días', 'Objetivo: menos de 2 días'),
    ]],
    ['category', 'Relevancia de categoría', [
      check('primary_category', 'Categoría principal', 10, 10, 'google', 'Tu categoría principal es «Cafetería»: es la que más pesa en qué búsquedas aparecés.', 'Cafetería'),
      check('extra_categories', 'Categorías secundarias', 5, 3, 'google', 'Sumá una categoría secundaria más que describa lo que también hacés.', '1 secundaria', 'Objetivo: 2'),
      check('attributes', 'Atributos completos', 5, s.attributes, 'profile', 'Completá los atributos que Google habilita para tu rubro: accesibilidad, pagos, servicios.', '6 de 9', 'Objetivo: todos'),
    ]],
    ['nap', 'Ficha NAP', [
      check('address', 'Dirección o zona de servicio', 5, 5, 'google', 'Tu dirección está cargada y verificada.'),
      check('phone', 'Teléfono', 4, 4, 'profile', 'Tu teléfono está cargado: es uno de los botones que más se tocan.', '0341 555-0000'),
      check('website', 'Sitio web', 4, 4, 'profile', 'Tu web está cargada.', 'cafedelparque.com.ar'),
      check('hours', 'Horario', 5, 5, 'profile', 'Tu horario está cargado para toda la semana.'),
      check('special_hours', 'Horarios especiales', 2, s.special, 'google', 'Cargá los horarios de los próximos feriados: si no, Google te muestra abierto cuando no estás.', 'Sin feriados cargados'),
    ]],
    ['reputation', 'Reputación', [
      check('rating', 'Puntaje promedio', 7, 6, 'reviews', 'Tu promedio es 4,6. Pedir reseñas a tus clientes contentos es lo que más lo sube.', '4,6 ★', 'Objetivo: 4,8'),
      check('review_count', 'Cantidad de reseñas', 5, 5, 'devices', 'Tenés más de 100 reseñas: Google te muestra con más confianza.', '128 reseñas'),
      check('reply_rate', 'Reseñas respondidas', 5, s.replies, 'reviews', 'Respondé todas las reseñas, también las buenas: Google lo toma como señal de que la ficha está atendida.', '64% respondidas', 'Objetivo: 90%'),
      check('recent_reviews', 'Reseñas del último mes', 3, 3, 'devices', 'Recibiste 7 reseñas el último mes: el expositor está funcionando.', '7 este mes'),
    ]],
  ].map(([id, label, checks]) => {
    const max = checks.reduce((sum, c) => sum + c.max, 0);
    return { id, label, max, measuredMax: max, score: checks.reduce((sum, c) => sum + c.score, 0), checks };
  });
}

/* Las mismas cuentas que auditLocation() de seoAudit.js. */
function auditOf(categories) {
  const max = categories.reduce((sum, c) => sum + c.measuredMax, 0);
  const score = Math.round((categories.reduce((sum, c) => sum + c.score, 0) / max) * 100);
  const ranked = categories
    .map((c) => ({ label: c.label, pct: c.score / c.measuredMax, missing: c.measuredMax - c.score }))
    .sort((a, b) => b.pct - a.pct || a.missing - b.missing);
  const level = score >= 85 ? 'Destacada' : score >= 65 ? 'Bien posicionada' : score >= 35 ? 'Visible online' : 'Difícil de encontrar';
  return { score, level, closed: false, best: ranked[0].label, worst: ranked.at(-1).label, categories };
}

const MAIN = auditOf(buildCategories({
  cover: 2, logo: 0, photos: 4, fresh: 4, services: 2, posts: 0, speed: 2, attributes: 3, special: 0, replies: 3,
}));
const SECOND = auditOf(buildCategories({
  cover: 2, logo: 2, photos: 7, fresh: 7, services: 4, posts: 5, speed: 5, attributes: 5, special: 2, replies: 5,
}));

const LOCATIONS = [
  { googleLocationId: 'sample-1', name: 'Café del Parque · Centro', audit: MAIN },
  { googleLocationId: 'sample-2', name: 'Café del Parque · Fisherton', audit: SECOND },
];

const MAIN_CATEGORY = MAIN.categories.find((c) => c.label === MAIN.worst);
const noop = () => {};

export default function GoogleSeoLocalMockup() {
  return (
    <div className="gb-page">
      <PageHeader
        eyebrow="SEO Local"
        title="Análisis SEO"
        subtitle="Qué tan completa está tu ficha de Google y qué cambiar para aparecer más en las búsquedas cercanas"
      />

      <SeoSummary locations={LOCATIONS} selected={LOCATIONS[0]} onSelect={noop} onRefresh={noop} refreshing={false} />
      <SeoCategories audit={MAIN} category={MAIN_CATEGORY} onCategory={noop} onNavigateSection={noop} />

      <MissingTermsCard
        terms={[
          { term: 'café de especialidad', impressions: 204 },
          { term: 'brunch', impressions: 152 },
          { term: 'medialunas', impressions: 64 },
        ]}
        onNavigateSection={noop}
      />

      <Ranking locations={LOCATIONS} selectedId="sample-1" onSelect={noop} />
    </div>
  );
}
