import { supabase } from './supabase.js';
import { accessTokenForOrg } from './googleAccess.js';
import { putReviewReply } from './googleBusiness.js';

/* Publicar una respuesta en Google y registrarla. Un solo camino para las tres
 * formas de responder: a mano desde el panel (routes/google.js), y la
 * respuesta automática y «responder reseñas anteriores» (lib/autoReplies.js).
 *
 * El orden es el de siempre (0026): primero Google, y recién cuando Google la
 * acepta se registra con lo que Google devolvió. Si el registro falla no se
 * reporta como error: la respuesta YA está publicada, y la próxima lectura de
 * la ficha la trae igual. Reintentar sería publicarla dos veces.
 *
 *   target  { organization_id, google_account, google_location, review_id }
 *           (review_id es el id de Google; `reviewId` es el nuestro)
 *   source  'panel' | 'ai_draft' | 'auto' | 'past'  (google_reviews.reply_source)
 *   accessToken  opcional: el ejecutor de la cola refresca uno por organización
 *                y lo reusa, en vez de pedir uno por reseña.
 *
 * Errores con `status` 409 si la conexión con Google ya no sirve
 * (accessTokenForOrg). Lo demás es un error de Google o de la red. */
export async function publishReviewReply({ reviewId, target, comment, userId = null, source = 'panel', accessToken }) {
  const token = accessToken ?? (await accessTokenForOrg(target.organization_id));

  const reply = await putReviewReply(token, target.google_account, target.google_location, target.review_id, comment);

  const { error } = await supabase.rpc('google_record_reply', {
    p_review: reviewId,
    p_user: userId,
    p_comment: reply.comment,
    p_updated: reply.updateTime,
    p_source: source,
  });
  if (error) console.error(`Respuesta publicada en Google pero no registrada (${reviewId}):`, error.message);

  return reply;
}
