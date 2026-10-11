import { useState } from 'react';
import PageHeader from '../../components/PageHeader/PageHeader';
import GoogleConnect from '../../components/GoogleConnect/GoogleConnect';
import { useOrg } from '../../context/OrgContext';
import { useRememberedData } from '../../lib/useRememberedData';
import { deleteGooglePost, fetchGoogleLocations, fetchGooglePosts, fetchPostQuota } from '../../lib/googleApi';
import { PostsList, PostsToolbar, QuotaBanner } from './GooglePostsBlocks';
import GooglePostComposer from './GooglePostComposer';
import './GoogleBusiness.css';
import './GoogleProfile.css';
import './GooglePosts.css';

/*
 * Publicaciones en la ficha de Google — la pantalla real (fase 4.7).
 *
 * Se publica EN EL ACTO: programar publicaciones (y el job cada hora que eso
 * pide) es la evolución probable, anotada en el roadmap, no esta versión.
 *
 * El plan gratis tiene 1 publicación por mes (Tapstar hace lo mismo); Business,
 * sin límite. El cupo lo cuenta y lo hace cumplir la base (google_post_reserve,
 * 0031); el banner de acá sólo lo anticipa.
 *
 * Las publicaciones se leen en vivo de Google. No se muestran vistas ni clics:
 * Google dejó de darlos por publicación en 2023, y la maqueta que había acá los
 * inventaba.
 *
 * Pendiente, a propósito fuera de esta versión (Tapstar tiene las dos):
 *  - Publicar en varias fichas a la vez. Cada ficha es una publicación para
 *    Google, así que en gratis choca con el cupo de 1 (google_post_reserve
 *    reserva de a una); sería de Business, con el API publicando ficha por
 *    ficha y diciendo cuál falló.
 *  - La tarjeta «Publicaciones programadas»: va cuando exista la programación,
 *    no antes, o sería un «sin programadas» de una función que no hay.
 *
 * El formulario de «Nueva publicación», con los pasos de Tapstar, vive en
 * GooglePostComposer. Lo que es sólo presentación vive en GooglePostsBlocks,
 * compartido con la maqueta de GoogleGate (GooglePostsMockup).
 */

export default function GooglePostsScreen({ google, onNavigateSettings }) {
  const { org, isBusiness } = useOrg();
  const orgId = org?.organization_id;

  const [picked, setPicked] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [deleting, setDeleting] = useState(null);

  // Recordado entre visitas (lib/useRememberedData): se muestra lo último leído
  // y Google se relee por detrás, sin «Leyendo tus publicaciones…» cada vez.
  const fichasState = useRememberedData(orgId ? `google:fichas:${orgId}` : null, () => fetchGoogleLocations(orgId));
  const fichas = fichasState.data ? fichasState.data.filter((f) => f.location_id) : null;
  const selected = picked ?? fichas?.[0]?.id ?? null;
  const postsState = useRememberedData(selected ? `google:posts:${selected}` : null, async () => {
    const [result, quota] = await Promise.all([fetchGooglePosts(selected), fetchPostQuota(orgId)]);
    return { posts: result.posts, canEdit: result.canEdit, quota };
  });
  const posts = postsState.data?.posts ?? null;
  const canEdit = Boolean(postsState.data?.canEdit);
  const quota = postsState.data?.quota ?? null;
  const load = postsState.reload;
  const error = actionError
    ?? (fichasState.error ? 'No pudimos cargar tus fichas.' : postsState.error?.message ?? null);

  async function remove(post) {
    if (!window.confirm('¿Borrar esta publicación de tu ficha de Google? No se puede deshacer.')) return;
    setDeleting(post.name);
    setActionError(null);
    try {
      await deleteGooglePost(selected, post.name);
      load();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setDeleting(null);
    }
  }

  const header = (
    <PageHeader eyebrow="Google Business" title="Publicaciones" subtitle="Publicá novedades, ofertas y eventos en tu ficha de Google" />
  );

  const reauthNotice = google.connection?.status === 'needs_reauth' && (
    <div className="gbm-notice">
      <p>Google cortó el acceso a tu ficha. Para ver y crear publicaciones, volvé a conectarla.</p>
      <GoogleConnect google={google} align="start" />
    </div>
  );

  if (fichas && !fichas.length) {
    return (
      <div className="gb-page">
        {header}
        {reauthNotice}
        <div className="gb-card gbm-empty">
          <p className="gbm-empty__title">Todavía no vinculaste ninguna ficha a una sucursal</p>
          <p>Elegí cuál de tus fichas de Google corresponde a cada sucursal para poder publicar en ella.</p>
          {onNavigateSettings && (
            <button type="button" className="gb-btn-primary" onClick={() => onNavigateSettings('local')}>
              Vincular en Gestión local
            </button>
          )}
        </div>
      </div>
    );
  }

  const options = (fichas ?? []).map((f) => ({ value: f.id, label: f.locations?.name ?? f.title ?? 'Ficha' }));
  const quotaLeft = quota && quota.limite != null ? Math.max(0, quota.limite - quota.usadas) : null;
  const outOfQuota = quotaLeft === 0;

  return (
    <div className="gb-page">
      {header}
      {reauthNotice}

      <QuotaBanner quota={quota} isBusiness={isBusiness} onNavigateSettings={onNavigateSettings} />
      <PostsToolbar options={options} selected={selected} onSelect={(id) => { setPicked(id); setActionError(null); }} />

      {notice && <p className="gbp-saved" role="status">{notice}</p>}
      {error && <p className="gbm-error" role="alert">{error}</p>}

      {selected && canEdit && (
        <GooglePostComposer
          orgId={orgId}
          googleLocationId={selected}
          fichaName={options.find((o) => o.value === selected)?.label ?? 'Tu negocio'}
          disabled={outOfQuota}
          isBusiness={isBusiness}
          onNavigateSettings={onNavigateSettings}
          onPublished={() => {
            setNotice('Listo, mandamos la publicación a Google. Va a aparecer en tu ficha cuando Google la apruebe.');
            load();
          }}
        />
      )}

      <PostsList posts={posts} loading={!posts && !error} deleting={deleting} onDelete={canEdit ? remove : null} />
    </div>
  );
}
