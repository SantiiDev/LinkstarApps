import { useMemo, useState } from 'react';
import PageHeader from '../../components/PageHeader/PageHeader';
import StatCard from '../../components/StatCard/StatCard';
import { ALL_REVIEWS, REVIEW_STATS } from '../../data/reviews';
import './Reviews.css';

function StarRow({ rating, size = 14 }) {
  return (
    <div className="reviews-star-row">
      {[1, 2, 3, 4, 5].map((n) => (
        <svg key={n} width={size} height={size} viewBox="0 0 24 24" fill={n <= rating ? '#F59E0B' : 'none'} stroke={n <= rating ? '#F59E0B' : 'rgba(27,26,46,0.25)'} strokeWidth="2">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      ))}
    </div>
  );
}

const FILTER_TABS = [
  { id: 'all', label: 'Todas' },
  { id: 'positive', label: 'Positivas' },
  { id: 'neutral', label: 'Neutras' },
  { id: 'negative', label: 'Negativas' },
  { id: 'pending', label: 'Sin responder' },
];

export default function ReviewsPage() {
  const [reviews, setReviews] = useState(ALL_REVIEWS);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [replyingId, setReplyingId] = useState(null);
  const [draft, setDraft] = useState('');

  const pending = reviews.filter((r) => !r.responded).length;
  const responded = reviews.length - pending;

  const filtered = useMemo(() => {
    return reviews.filter((r) => {
      const matchSearch =
        r.author.toLowerCase().includes(search.toLowerCase()) ||
        r.text.toLowerCase().includes(search.toLowerCase()) ||
        r.location.toLowerCase().includes(search.toLowerCase());

      const matchFilter =
        filter === 'all' ? true :
        filter === 'positive' ? r.sentiment === 'positive' :
        filter === 'neutral' ? r.sentiment === 'neutral' :
        filter === 'negative' ? r.sentiment === 'negative' :
        filter === 'pending' ? !r.responded : true;

      return matchSearch && matchFilter;
    });
  }, [reviews, search, filter]);

  function startReply(review) {
    setReplyingId(review.id);
    setDraft(review.response || '');
  }

  function submitReply(id) {
    setReviews((prev) => prev.map((r) => (r.id === id ? { ...r, responded: true, response: draft } : r)));
    setReplyingId(null);
    setDraft('');
  }

  return (
    <div className="reviews-page">
      <PageHeader
        eyebrow="Gestión de reseñas"
        title="Reseñas"
        subtitle="Todas las reseñas de Google recibidas en tus sucursales, en un solo lugar"
      />

      <div className="reviews-stats">
        <StatCard icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>} value={reviews.length} label="Reseñas totales" color="gold" />
        <StatCard icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="6" /><path d="M15.5 13.5 17 22l-5-3-5 3 1.5-8.5" /></svg>} value={`${REVIEW_STATS.averageRating} ★`} label="Rating promedio" color="orange" />
        <StatCard icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 17 4 12 9 7" /><path d="M20 18v-2a4 4 0 0 0-4-4H4" /></svg>} value={responded} label="Respondidas" color="forest" />
        <StatCard icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>} value={pending} label="Pendientes de responder" color="navy" />
      </div>

      <div className="reviews-toolbar">
        <div className="reviews-search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Buscar por cliente, texto o sucursal…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="reviews-filters">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.id}
              className={`reviews-filter-tab ${filter === tab.id ? 'reviews-filter-tab--active' : ''}`}
              onClick={() => setFilter(tab.id)}
            >
              {tab.label}
              {tab.id === 'pending' && pending > 0 && <span className="reviews-filter-tab__count">{pending}</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="reviews-list">
        {filtered.length === 0 && (
          <div className="reviews-empty">No hay reseñas que coincidan con este filtro.</div>
        )}

        {filtered.map((r) => (
          <div key={r.id} className="review-card">
            <div className="review-card__avatar">{r.initials}</div>
            <div className="review-card__body">
              <div className="review-card__top">
                <div>
                  <span className="review-card__author">{r.author}</span>
                  <span className="review-card__location">· {r.location}</span>
                </div>
                <span className="review-card__date">{r.date}</span>
              </div>

              <StarRow rating={r.rating} />
              <p className="review-card__text">{r.text}</p>

              <div className="review-card__keywords">
                {r.keywords.map((k) => <span key={k} className="review-card__keyword">{k}</span>)}
              </div>

              {r.responded && replyingId !== r.id && (
                <div className="review-card__response">
                  <span className="review-card__response-label">Tu respuesta</span>
                  <p>{r.response}</p>
                  <button className="review-card__edit-btn" onClick={() => startReply(r)}>Editar respuesta</button>
                </div>
              )}

              {replyingId === r.id && (
                <div className="review-card__reply-box">
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Escribí una respuesta pública para esta reseña…"
                    rows={3}
                  />
                  <div className="review-card__reply-actions">
                    <button className="review-card__reply-cancel" onClick={() => setReplyingId(null)}>Cancelar</button>
                    <button className="review-card__reply-submit" onClick={() => submitReply(r.id)} disabled={!draft.trim()}>
                      Publicar respuesta
                    </button>
                  </div>
                </div>
              )}

              {!r.responded && replyingId !== r.id && (
                <button className="review-card__respond-btn" onClick={() => startReply(r)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 17 4 12 9 7" /><path d="M20 18v-2a4 4 0 0 0-4-4H4" />
                  </svg>
                  Responder
                </button>
              )}
            </div>

            <span className={`review-card__status review-card__status--${r.sentiment}`}>
              {r.sentiment === 'positive' ? 'Positiva' : r.sentiment === 'negative' ? 'Negativa' : 'Neutra'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
