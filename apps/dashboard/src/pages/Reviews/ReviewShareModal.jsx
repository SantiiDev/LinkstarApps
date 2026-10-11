import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from '../../components/Icon/Icon';
import { originalReviewText } from '../../lib/googleApi';
import { renderReviewImage, shortAuthorName } from '../../lib/reviewImage';
import '../../components/FormModal/FormModal.css';
import './ReviewShareModal.css';

/*
 * «Compartir» una reseña: arma una imagen para Instagram (historia 9:16 o
 * publicación 1:1) en el navegador (lib/reviewImage.js) y deja compartirla o
 * descargarla. No pasa por el API ni guarda nada.
 *
 * Instagram no tiene una forma de publicar desde una web. En el celular,
 * «Compartir» abre el menú del sistema (Web Share API con archivos), donde
 * aparece Instagram; en la compu el camino es «Descargar imagen». El botón de
 * compartir sólo se muestra si el navegador acepta compartir archivos.
 *
 * Va con portal a document.body, como los demás modales que se abren desde
 * adentro de una tarjeta con backdrop-filter (ver la nota de Settings en
 * CLAUDE.md): si no, quedaría atrapado en el contexto de apilado de la tarjeta.
 */

const FORMAT_OPTIONS = [
  { value: 'story', label: 'Historia', hint: '1080 × 1920' },
  { value: 'post', label: 'Publicación', hint: '1080 × 1080' },
];

function slug(text) {
  return String(text || 'resena')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'resena';
}

/* Lo que se dibuja, a partir de la fila de google_reviews. */
function shareDataOf(review) {
  return {
    businessName: review.google_locations?.title ?? review.google_locations?.locations?.name ?? '',
    author: review.is_anonymous || !review.reviewer_name ? 'Usuario de Google' : shortAuthorName(review.reviewer_name),
    rating: review.star_rating ?? null,
    text: originalReviewText(review.comment) ?? '',
    date: review.created_time ?? null,
  };
}

export default function ReviewShareModal({ review, onClose }) {
  const [format, setFormat] = useState('story');
  const [image, setImage] = useState(null); // { blob, url, file }
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  // Se vuelve a dibujar al cambiar de formato. La URL anterior se libera.
  useEffect(() => {
    let cancelled = false;
    let url = null;
    setImage(null);
    setError(null);
    const data = shareDataOf(review);
    renderReviewImage({ ...data, format })
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        const file = new File([blob], `resena-${slug(data.businessName)}-${format}.png`, { type: 'image/png' });
        setImage({ blob, url, file });
      })
      .catch((err) => {
        console.error('No se pudo armar la imagen de la reseña:', err);
        if (!cancelled) setError('No pudimos armar la imagen. Probá de nuevo.');
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [review, format]);

  // Escape cierra, y la página de atrás no scrollea mientras el modal está abierto.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  const canShareFiles = Boolean(
    image && typeof navigator.canShare === 'function' && navigator.canShare({ files: [image.file] })
  );

  async function share() {
    setNotice(null);
    try {
      await navigator.share({ files: [image.file] });
    } catch (err) {
      // Cerrar el menú sin elegir nada no es un error.
      if (err?.name !== 'AbortError') setNotice('No se pudo abrir el menú de compartir. Descargá la imagen y subila desde Instagram.');
    }
  }

  function download() {
    const link = document.createElement('a');
    link.href = image.url;
    link.download = image.file.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  return createPortal(
    <div className="fmodal-overlay" onClick={onClose}>
      <div
        className="fmodal share-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-modal-title"
      >
        <div className="fmodal__header">
          <div>
            <h3 className="fmodal__title" id="share-modal-title">Compartir reseña</h3>
            <p className="share-modal__subtitle">Una imagen lista para tus historias o tu feed de Instagram.</p>
          </div>
          <button className="fmodal__close" onClick={onClose} aria-label="Cerrar" type="button">
            <Icon name="close" size={18} strokeWidth={2.5} />
          </button>
        </div>

        <div className="fmodal__body">
          <div className="share-modal__formats" role="radiogroup" aria-label="Formato">
            {FORMAT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={format === opt.value}
                className={`share-modal__format${format === opt.value ? ' share-modal__format--active' : ''}`}
                onClick={() => setFormat(opt.value)}
              >
                <strong>{opt.label}</strong>
                <span>{opt.hint}</span>
              </button>
            ))}
          </div>

          <div className={`share-modal__preview share-modal__preview--${format}`}>
            {image ? (
              <img src={image.url} alt="Vista previa de la imagen de la reseña" />
            ) : (
              <span className="share-modal__loading">{error ?? 'Armando la imagen…'}</span>
            )}
          </div>

          <p className="fmodal__hint share-modal__note">
            <Icon name="instagram" size={14} /> Instagram no deja publicar directo desde una web:{' '}
            {canShareFiles ? 'tocá «Compartir» y elegí Instagram, o descargala y subila.' : 'descargá la imagen y subila desde la app.'}
          </p>
          {notice && <p className="fmodal__warn" role="status">{notice}</p>}
        </div>

        <div className="fmodal__footer">
          <button type="button" className="fmodal__btn fmodal__btn--ghost" onClick={download} disabled={!image}>
            <Icon name="download" size={15} /> Descargar imagen
          </button>
          {canShareFiles && (
            <button type="button" className="fmodal__btn fmodal__btn--primary" onClick={share}>
              <Icon name="share" size={15} /> Compartir
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
