import { useState } from 'react';
import PageHeader from '../../components/PageHeader/PageHeader';
import StatCard from '../../components/StatCard/StatCard';
import TrendChart from '../../components/TrendChart/TrendChart';
import { sharesOf } from '../../lib/shares';
import { ALL_REVIEWS, REVIEW_STATS } from '../../data/reviews';
import './Company.css';

/* ─── Icons ────────────────────────────────────────────────── */
function Icon({ name, ...rest }) {
  const props = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', ...rest };
  const icons = {
    star: (
      <svg {...props}>
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    ),
    award: (
      <svg {...props}>
        <circle cx="12" cy="8" r="6" /><path d="M15.5 13.5 17 22l-5-3-5 3 1.5-8.5" />
      </svg>
    ),
    reply: (
      <svg {...props}>
        <polyline points="9 17 4 12 9 7" /><path d="M20 18v-2a4 4 0 0 0-4-4H4" />
      </svg>
    ),
    smile: (
      <svg {...props}>
        <circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" />
      </svg>
    ),
    check: (
      <svg {...props}>
        <polyline points="20 6 9 17 4 12" />
      </svg>
    ),
    alert: (
      <svg {...props}>
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
    google: (
      <svg {...props} viewBox="0 0 48 48" fill="none">
        <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.6 32.9 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z" />
        <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 16.3 4 9.6 8.3 6.3 14.7z" />
        <path fill="#4CAF50" d="M24 44c5.5 0 10.4-1.9 14.3-5.1l-6.6-5.6C29.6 34.9 26.9 36 24 36c-5.2 0-9.6-3.1-11.3-7.5l-6.6 5.1C9.5 39.6 16.2 44 24 44z" />
        <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.3 5.7l6.6 5.6C39.9 37.1 44 31 44 24c0-1.3-.1-2.7-.4-3.5z" />
      </svg>
    ),
    arrowRight: (
      <svg {...props} width={14} height={14}>
        <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
      </svg>
    ),
    seo: (
      <svg {...props}>
        <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><path d="M11 8v3l2 2" />
      </svg>
    ),
    posts: (
      <svg {...props}>
        <rect x="3" y="4" width="18" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="18" x2="12" y2="21" />
      </svg>
    ),
    report: (
      <svg {...props}>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    ),
  };
  return icons[name] || null;
}

function StarRow({ rating, size = 13 }) {
  return (
    <div className="star-row">
      {[1, 2, 3, 4, 5].map((n) => (
        <svg key={n} width={size} height={size} viewBox="0 0 24 24" fill={n <= rating ? '#F59E0B' : 'none'} stroke={n <= rating ? '#F59E0B' : 'rgba(27,26,46,0.25)'} strokeWidth="2">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      ))}
    </div>
  );
}

/* ─── Reviews-over-time area chart ───────────────────────────── */
const TREND_WEEKS = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8'];
const TREND_DATA = [9, 12, 10, 15, 13, 17, 15, 19];

/* ─── Quick links to other sections ──────────────────────────── */
const QUICK_LINKS = [
  { id: 'gb-metrics', label: 'Métricas de Google', text: 'Visitas, llamadas y clics a tu ficha', icon: 'award', color: 'orange' },
  { id: 'gb-seo', label: 'SEO Local', text: 'Tu puntuación de posicionamiento', icon: 'seo', color: 'forest' },
  { id: 'gb-posts', label: 'Publicaciones', text: 'Novedades activas en tu ficha', icon: 'posts', color: 'navy' },
  { id: 'monthly-reports', label: 'Informes mensuales', text: 'Descargá el resumen del mes', icon: 'report', color: 'gold' },
];

export default function Company({ onNavigate }) {
  const [alertDismissed, setAlertDismissed] = useState(false);
  const negativeUnresponded = ALL_REVIEWS.filter((r) => r.sentiment === 'negative' && !r.responded);
  const recentReviews = ALL_REVIEWS.slice(0, 5);
  const totalDist = REVIEW_STATS.distribution.reduce((sum, d) => sum + d.count, 0);
  const distShares = sharesOf(REVIEW_STATS.distribution.map((d) => d.count));

  const today = new Date();
  const formattedDate = today.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="company-page">
      <PageHeader
        eyebrow="Panel general"
        title="Mi Empresa"
        subtitle="Resumen general del estado comercial en tu ficha de Google Business Profile"
        actions={
          <button className="company-btn company-btn--ghost">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            {formattedDate}
          </button>
        }
      />

      {/* ── Connect Google banner (inline, never blocks the view, not dismissible) ── */}
      <div className="company-banner">
        <div className="company-banner__icon"><Icon name="google" width={26} height={26} /></div>
        <div className="company-banner__body">
          <div className="company-banner__title">Gestioná todo tu perfil de Google Business</div>
          <p className="company-banner__text">
            Conectá tu ficha para responder reseñas con IA, ver cuántos clientes llegan desde Google Maps y tu puntuación de SEO local.
          </p>
        </div>
        <div className="company-banner__actions">
          <button className="company-banner__connect-btn">
            <Icon name="google" width={16} height={16} />
            Conectar mi ficha de Google
          </button>
        </div>
      </div>

      {/* ── Status chips ── */}
      <div className="company-chips">
        <div className="company-chip company-chip--ok">
          <Icon name="check" width={14} height={14} /> Perfil de Google Business conectado
        </div>
        <div className="company-chip">
          <Icon name="award" width={14} height={14} /> Plan actual: <strong>Pro</strong>
        </div>
        <div className="company-chip">
          Ficha completada al <strong>92%</strong>
        </div>
      </div>

      {/* ── Negative reviews alert ── */}
      {negativeUnresponded.length > 0 && !alertDismissed && (
        <div className="company-alert">
          <button className="company-alert__close" onClick={() => setAlertDismissed(true)} aria-label="Cerrar aviso">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
          <button className="company-alert__trigger" onClick={() => onNavigate?.('reviews')}>
            <div className="company-alert__icon"><Icon name="alert" /></div>
            <div className="company-alert__body">
              <div className="company-alert__title">
                {negativeUnresponded.length} reseña{negativeUnresponded.length > 1 ? 's' : ''} negativa{negativeUnresponded.length > 1 ? 's' : ''} sin responder
              </div>
              <p className="company-alert__text">
                Responder rápido a las reseñas negativas mejora tu reputación online y ayuda a recuperar clientes.
              </p>
            </div>
            <span className="company-alert__cta">
              Responder ahora <Icon name="arrowRight" />
            </span>
          </button>
        </div>
      )}

      {/* ── KPI row ── */}
      <div className="company-stat-grid">
        <StatCard icon={<Icon name="star" />} value={REVIEW_STATS.totalReviews} label="Reseñas totales en Google" trend="+13 esta semana" color="gold" delay={0} />
        <StatCard icon={<Icon name="award" />} value={`${REVIEW_STATS.averageRating} ★`} label="Rating promedio" trend="+0.2 este mes" color="orange" delay={0.05} />
        <StatCard icon={<Icon name="reply" />} value={`${REVIEW_STATS.responseRate}%`} label="Tasa de respuesta" trend="+5%" color="forest" delay={0.1} />
        <StatCard icon={<Icon name="smile" />} value={`${REVIEW_STATS.positiveRate}%`} label="Satisfacción positiva" trend="+3%" color="navy" delay={0.15} />
      </div>

      {/* ── Trend chart + distribution/sentiment ── */}
      <div className="company-two-col">
        <div className="company-card chart-card">
          <div className="company-card__header">
            <div>
              <h3 className="company-card__title">Reseñas en el tiempo</h3>
              <span className="company-card__subtitle">Últimas 8 semanas</span>
            </div>
          </div>
          <TrendChart
            data={TREND_DATA}
            labels={TREND_WEEKS}
            color="orange"
            seriesName="Reseñas nuevas"
            xLabel="Semana"
            yLabel="Reseñas"
          />
        </div>

        <div className="company-side-col">
          <div className="company-card">
            <div className="company-card__header">
              <div>
                <h3 className="company-card__title">Distribución por estrellas</h3>
                <span className="company-card__subtitle">{REVIEW_STATS.totalReviews} reseñas en total</span>
              </div>
            </div>
            {/* La barra y el porcentaje se miden contra el MISMO denominador
                (el total de reseñas). Antes el ancho iba contra el balde más
                grande y el número contra el total, así que 5★ se dibujaba al
                100% y decía 74%: dos escalas distintas en la misma fila. */}
            <div className="star-dist">
              {REVIEW_STATS.distribution.map((d, i) => (
                <div key={d.stars} className="star-dist__row">
                  <span className="star-dist__label">{d.stars} ★</span>
                  <div className="star-dist__bar">
                    {/* max(3px, …) para que un balde con pocas reseñas se vea:
                        al 0,9% del riel la barra mide 2px y parece vacío. */}
                    <div
                      className="star-dist__fill"
                      style={{ width: d.count > 0 ? `max(3px, ${(d.count / totalDist) * 100}%)` : 0 }}
                    />
                  </div>
                  <span className="star-dist__count">{d.count}</span>
                  <span className="star-dist__pct">{distShares[i]}%</span>
                </div>
              ))}
            </div>
          </div>

          <button className="company-sentiment-card" onClick={() => onNavigate?.('reports-sentiment')}>
            <span className="company-sentiment-card__badge">Nuevo</span>
            <div className="company-sentiment-card__title">Análisis de sentimiento con IA</div>
            <p className="company-sentiment-card__text">
              Detectá automáticamente qué sienten tus clientes en cada reseña.
            </p>
            <span className="company-sentiment-card__cta">Ver más <Icon name="arrowRight" /></span>
          </button>
        </div>
      </div>

      {/* ── Recent reviews + quick links ── */}
      <div className="company-two-col">
        <div className="company-card">
          <div className="company-card__header">
            <div>
              <h3 className="company-card__title">Reseñas recientes</h3>
              <span className="company-card__subtitle">Lo último que dejaron tus clientes</span>
            </div>
            <button className="company-card__link" onClick={() => onNavigate?.('reviews')}>Ver todas</button>
          </div>

          <div className="recent-reviews">
            {recentReviews.map((r) => (
              <div key={r.id} className="recent-review">
                <div className="recent-review__avatar">{r.initials}</div>
                <div className="recent-review__body">
                  <div className="recent-review__top">
                    <span className="recent-review__author">{r.author}</span>
                    <span className="recent-review__date">{r.date}</span>
                  </div>
                  <StarRow rating={r.rating} />
                  <p className="recent-review__text">{r.text}</p>
                </div>
                <span className={`recent-review__badge ${r.responded ? 'recent-review__badge--done' : 'recent-review__badge--pending'}`}>
                  {r.responded ? 'Respondida' : 'Pendiente'}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="company-card">
          <div className="company-card__header">
            <div>
              <h3 className="company-card__title">Explorá más</h3>
              <span className="company-card__subtitle">Otras secciones de tu panel</span>
            </div>
          </div>
          <div className="quick-links">
            {QUICK_LINKS.map((link) => (
              <button key={link.id} className="quick-link" onClick={() => onNavigate?.(link.id)}>
                <div className={`quick-link__icon quick-link__icon--${link.color}`}>
                  <Icon name={link.icon} width={18} height={18} />
                </div>
                <div className="quick-link__body">
                  <div className="quick-link__label">{link.label}</div>
                  <div className="quick-link__text">{link.text}</div>
                </div>
                <Icon name="arrowRight" className="quick-link__arrow" />
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="dashboard__footer">
        <p className="dashboard__footer-text">
          © 2026 <span className="dashboard__footer-brand">linkstar<span className="dashboard__footer-dot">.</span></span> — Panel de gestión de reseñas
        </p>
      </div>
    </div>
  );
}
