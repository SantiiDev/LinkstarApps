import { formatRelativeTime } from '../../lib/dashboardApi';
import { originalReviewText } from '../../lib/googleApi';
import '../../components/KpiCard/KpiCard.css';
import './Reports.css';

/*
 * Las reseñas que nombran algo — un aspecto en NPS, una palabra en Palabras
 * clave —, cada una con el tono con que lo nombra. Es una sola lista para las
 * dos pantallas, así se ven iguales y se mantienen en un lugar.
 *
 * `state` es { status: 'loading' | 'error' | 'ok', items } con las filas de
 * fetchReviewsByIds. `toneOf(id)` da el tono de ESA mención ('positive' |
 * 'neutral' | 'negative'), no el de la reseña entera, y `toneLabel(tone)` el
 * texto de la pastilla.
 *
 * `highlight`: un término a resaltar en el texto. Sólo se marca cuando aparece
 * tal cual (sin distinguir mayúsculas, como palabra completa): la IA a veces
 * resume con otra palabra («demora» para «tardaron una hora»), y ahí no se
 * marca nada antes que marcar algo que no es.
 */

const TONE_PILL = { positive: 'good', neutral: 'mid', negative: 'bad' };

function withHighlight(text, term) {
  if (!text || !term) return text;
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let pattern;
  try {
    pattern = new RegExp(`(?<![\\p{L}\\p{N}])(${escaped})(?![\\p{L}\\p{N}])`, 'giu');
  } catch {
    return text;
  }
  // Con un solo grupo de captura, split deja las coincidencias en los índices impares.
  return text.split(pattern).map((part, i) => (i % 2 ? <mark key={i} className="reports-mention__mark">{part}</mark> : part));
}

/* `state.status === 'loading'` con `items` todavía cargados (cambio de página
   en Palabras clave): se siguen mostrando, atenuados, hasta que llegan las
   nuevas. Si se reemplazaran por «Cargando…», el panel se achicaría de golpe y
   la página saltaría con cada «Siguiente». */
export default function ReviewMentions({ state, toneOf, toneLabel, showLocation, highlight, errorText }) {
  const stale = state?.status === 'loading' && state.items?.length > 0;
  if (!state || (state.status === 'loading' && !stale)) return <p className="gbm-muted">Cargando reseñas…</p>;
  if (state.status === 'error') {
    return <p className="gbm-error">{errorText ?? 'No pudimos cargar las reseñas. Probá de nuevo.'}</p>;
  }

  return (
    <ul className={`reports-mentions${stale ? ' reports-mentions--stale' : ''}`} aria-busy={stale || undefined}>
      {state.items.map((r) => {
        const author = r.is_anonymous || !r.reviewer_name ? 'Usuario de Google' : r.reviewer_name;
        const where = r.google_locations?.locations?.name;
        const tone = toneOf(r.id);
        return (
          <li key={r.id} className="reports-mention">
            <div className="reports-mention__top">
              <span className="reports-mention__author">{author}</span>
              {r.star_rating && (
                <span className="reports-mention__stars" role="img" aria-label={`${r.star_rating} de 5 estrellas`}>
                  {'★'.repeat(r.star_rating)}<span className="reports-mention__stars-off">{'★'.repeat(5 - r.star_rating)}</span>
                </span>
              )}
              <span>{formatRelativeTime(r.created_time)}{showLocation && where ? ` · ${where}` : ''}</span>
              {tone && <span className={`kpi-pill kpi-pill--${TONE_PILL[tone]}`}>{toneLabel(tone)}</span>}
            </div>
            <p className="reports-mention__text">{withHighlight(originalReviewText(r.comment), highlight)}</p>
          </li>
        );
      })}
    </ul>
  );
}
