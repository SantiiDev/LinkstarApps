import PageHeader from '../../components/PageHeader/PageHeader';
import StatCard from '../../components/StatCard/StatCard';
import { useOrg } from '../../context/OrgContext';
import { ALL_REVIEWS, REVIEW_STATS } from '../../data/reviews';
import { DEFAULT_REVIEW_FILTERS, REVIEWS_INBOX_PAGE_SIZE } from '../../lib/googleApi';
import { ReviewDetail, ReviewList, ReviewsToolbar } from './ReviewsBlocks';
import './Reviews.css';

/*
 * MAQUETA DECORATIVA — no es la pantalla, es el fondo.
 *
 * Todos los números y los nombres de acá son inventados (data/reviews.js). Se
 * dibuja con las mismas piezas que la pantalla real (ReviewsBlocks), así quien
 * todavía no conectó Google ve cómo va a ser la bandeja.
 *
 * Se renderiza ÚNICAMENTE como `children` de `GoogleGate`, que lo deja borroso,
 * inerte y detrás de un modal que no se puede cerrar. Fuera de esa puerta sería
 * una pantalla inventando datos, que es justo lo que la fase 2 sacó del panel.
 * NO agregar otro importador.
 *
 * Los handlers no hacen nada: el subárbol es `inert`.
 */

const noop = () => {};

// Horas hacia atrás de cada reseña inventada, en el orden de ALL_REVIEWS.
const HOURS_AGO = [2, 5, 26, 30, 50, 75, 98, 122, 146, 170, 175, 340, 345];

/* data/reviews.js tiene la forma de la maqueta vieja; acá se pasa a la de una
 * fila de google_reviews, que es lo que esperan las piezas. */
const ROWS = ALL_REVIEWS.map((r, i) => ({
  id: r.id,
  reviewer_name: r.author,
  is_anonymous: false,
  star_rating: r.rating,
  comment: r.text,
  created_time: new Date(Date.now() - (HOURS_AGO[i] ?? 400) * 3_600_000).toISOString(),
  reply_comment: r.responded ? r.response : null,
  google_locations: { title: r.location, maps_uri: null, locations: { name: r.location } },
  google_review_analysis: { sentiment: r.sentiment },
}));

const LOCATIONS = [
  { value: 'all', label: 'Todos los locales' },
  ...[...new Set(ALL_REVIEWS.map((r) => r.location))].map((name) => ({ value: name, label: name })),
];

const pending = ROWS.filter((r) => !r.reply_comment).length;
const ICON = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };

export default function ReviewsMockup() {
  const { isBusiness } = useOrg();
  const selected = ROWS.find((r) => !r.reply_comment);

  return (
    <div className="reviews-page">
      <PageHeader
        eyebrow="Gestión de reseñas"
        title="Bandeja de reseñas"
        subtitle="Respondé a tus clientes desde tu perfil de Google"
      />

      <div className="reviews-stats">
        <StatCard icon={<svg {...ICON}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>} value={REVIEW_STATS.totalReviews} label="Reseñas en Google" color="gold" />
        <StatCard icon={<svg {...ICON}><circle cx="12" cy="8" r="6" /><path d="M15.5 13.5 17 22l-5-3-5 3 1.5-8.5" /></svg>} value={`${REVIEW_STATS.averageRating} ★`} label="Rating promedio" color="orange" />
        <StatCard icon={<svg {...ICON}><polyline points="9 17 4 12 9 7" /><path d="M20 18v-2a4 4 0 0 0-4-4H4" /></svg>} value={ROWS.length - pending} label="Respondidas" color="forest" />
        <StatCard icon={<svg {...ICON}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>} value={pending} label="Sin responder" color="navy" />
      </div>

      <ReviewsToolbar
        filters={DEFAULT_REVIEW_FILTERS}
        onFilter={noop}
        search=""
        onSearch={noop}
        locationOptions={LOCATIONS}
        pendingCount={pending}
        isBusiness={isBusiness}
      />

      <div className="reviews-inbox">
        <ReviewList
          status="all"
          count={ROWS.length}
          reviews={ROWS}
          selectedId={selected?.id}
          onSelect={noop}
          showBranch
          lastRead={new Date(Date.now() - 3 * 3_600_000).toISOString()}
          page={0}
          pageSize={REVIEWS_INBOX_PAGE_SIZE}
          onPage={noop}
        />
        <ReviewDetail
          review={selected}
          showBranch
          canReply
          isBusiness={isBusiness}
          draft=""
          onDraft={noop}
          editing={false}
          onEdit={noop}
          onCancelEdit={noop}
          onPublish={noop}
          publishing={false}
          replyError={null}
          onOpenTone={noop}
          onBack={noop}
        />
      </div>
    </div>
  );
}
