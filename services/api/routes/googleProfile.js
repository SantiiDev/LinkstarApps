import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { supabase } from '../lib/supabase.js';
import { requireAuth } from '../middleware/auth.js';
import { assertGoogleConfigured } from '../lib/googleOAuth.js';
import { accessTokenForOrg } from '../lib/googleAccess.js';
import { validateBody, googleProfileUpdateSchema, googlePostSchema } from '../lib/validation.js';
import {
  formatAddress,
  getAttributes,
  getLocationProfile,
  listAttributeMetadata,
  patchLocation,
  updateAttributes,
  listLocalPosts,
  createLocalPost,
  deleteLocalPost,
  getLocationForSeo,
  listLocationMedia,
} from '../lib/googleBusiness.js';
import { auditLocation } from '../lib/seoAudit.js';

const router = Router();

/* La ficha de Google, en vivo: Perfil (4.7), la protección de ficha (Business) y
 * las publicaciones. Todo habla con Google en nombre del negocio.
 *
 *   GET    /api/google/locations/:id/profile           ficha + atributos
 *   PATCH  /api/google/locations/:id/profile           editar (lista blanca)
 *   POST   /api/google/profile/changes/:id/revert      deshacer un cambio de Google
 *   POST   /api/google/profile/changes/:id/accept      «está bien así»
 *   GET    /api/google/locations/:id/posts             publicaciones (en vivo)
 *   POST   /api/google/locations/:id/posts             publicar (cupo en gratis)
 *   DELETE /api/google/locations/:id/posts?name=…      borrar una publicación
 *   GET    /api/google/seo?org=…                       Análisis SEO (lib/seoAudit.js)
 *
 * `:id` es el id de google_locations (nuestro), nunca el 'locations/123' de
 * Google: así cada pedido pasa por las RPC de 0030/0031, que deciden quién puede
 * qué. La lista de cambios detectados NO pasa por acá: el panel la lee directo
 * de google_profile_changes, con RLS.
 *
 * Errores: el detalle de Google o de la base sólo va al log (CWE-209); al panel
 * le llega un texto propio. Igual que routes/google.js.
 */

const readLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 120, standardHeaders: true, legacyHeaders: false });
// Escribir en la ficha de un cliente consume la cuota de Google del proyecto,
// que es compartida entre todas las organizaciones.
const writeLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 30, standardHeaders: true, legacyHeaders: false });

const RPC_ERRORS = {
  ficha_inexistente: [404, 'No encontramos esa ficha. Puede que ya no esté vinculada a una sucursal'],
  rol_insuficiente: [403, 'Tu rol no te permite hacer esto en esta ficha'],
  sin_acceso: [402, 'Tu plan no está activo'],
  solo_business: [402, 'Esto es parte del plan Business'],
  cupo_agotado: [402, 'Ya usaste la publicación gratis de este mes. Con Business publicás sin límite.'],
  cambio_inexistente: [404, 'Ese cambio ya se resolvió'],
};

function rpcError(error) {
  const known = Object.entries(RPC_ERRORS).find(([code]) => error?.message?.includes(code));
  if (!known) return error;
  const err = new Error(known[1][1]);
  err.status = known[1][0];
  return err;
}

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

const UUID = /^[0-9a-f-]{36}$/i;

function requireUuid(value, what) {
  if (!UUID.test(value)) throw badRequest(`${what} inválido`);
}

/* Responde el error. `fallback` es el texto si fue Google (o algo nuestro). */
function sendError(res, err, fallback, logLabel) {
  if ((err.status && err.status < 500) || err.status === 503) {
    return res.status(err.status).json({ error: err.message });
  }
  console.error(`${logLabel}:`, err);
  // Un 400 de Google es un dato que no aceptó (formato de horario, URL…): se
  // dice que fue Google, sin su mensaje crudo.
  if (err.httpStatus === 400) {
    return res.status(400).json({ error: `${fallback}: Google no aceptó alguno de los datos. Revisalos y probá de nuevo.` });
  }
  return res.status(502).json({ error: `${fallback}. Probá de nuevo en unos minutos.` });
}

async function readTarget(userId, googleLocationId) {
  const { data, error } = await supabase.rpc('google_location_read_target', {
    p_user: userId,
    p_google_location: googleLocationId,
  });
  if (error) throw rpcError(error);
  return data[0];
}

async function writeTarget(userId, googleLocationId, requireBusiness = false) {
  const { data, error } = await supabase.rpc('google_location_write_target', {
    p_user: userId,
    p_google_location: googleLocationId,
    p_require_business: requireBusiness,
  });
  if (error) throw rpcError(error);
  return data[0];
}

async function canWrite(userId, googleLocationId) {
  try {
    await writeTarget(userId, googleLocationId);
    return true;
  } catch (err) {
    if (err.status === 403) return false;
    throw err;
  }
}

/* ─── Perfil ───────────────────────────────────────────────────────────────── */

/* Atributos que el panel sabe mostrar y editar: sí/no (accesibilidad,
 * comodidades, pagos) y enlaces (redes). Los de opciones múltiples se dejan
 * para Google, que los edita mejor. */
function shapeAttributes(metadata, current) {
  const byName = new Map(current.map((a) => [a.name, a]));
  return metadata
    .filter((m) => !m.deprecated && (m.valueType === 'BOOL' || m.valueType === 'URL'))
    .map((m) => {
      const value = byName.get(m.parent);
      return {
        name: m.parent,
        displayName: m.displayName || m.parent.replace('attributes/', ''),
        group: m.groupDisplayName || 'Otros',
        valueType: m.valueType,
        value: m.valueType === 'BOOL' ? (value?.values?.[0] ?? null) : null,
        uri: m.valueType === 'URL' ? (value?.uriValues?.[0]?.uri ?? null) : null,
      };
    });
}

router.get('/api/google/locations/:id/profile', readLimiter, requireAuth(supabase), async (req, res) => {
  try {
    assertGoogleConfigured();
    requireUuid(req.params.id, 'Ficha');
    const target = await readTarget(req.user.id, req.params.id);
    const accessToken = await accessTokenForOrg(target.organization_id);

    const [location, current, editable] = await Promise.all([
      getLocationProfile(accessToken, target.google_location),
      getAttributes(accessToken, target.google_location).catch((err) => {
        console.error('No se pudieron leer los atributos de la ficha:', err.message);
        return [];
      }),
      canWrite(req.user.id, req.params.id),
    ]);
    // Después de la ficha: los nombres en castellano se piden por su categoría.
    const metadata = await listAttributeMetadata(accessToken, target.google_location, {
      categoryName: location.categories?.primaryCategory?.name,
      regionCode: location.storefrontAddress?.regionCode,
    }).catch((err) => {
      console.error('No se pudieron leer los atributos que admite la ficha:', err.message);
      return null;
    });

    res.json({
      canEdit: editable,
      profile: {
        title: location.title ?? null,
        description: location.profile?.description ?? '',
        primaryPhone: location.phoneNumbers?.primaryPhone ?? '',
        additionalPhones: location.phoneNumbers?.additionalPhones ?? [],
        websiteUri: location.websiteUri ?? '',
        regularHours: location.regularHours ?? null,
        primaryCategory: location.categories?.primaryCategory?.displayName ?? null,
        additionalCategories: (location.categories?.additionalCategories ?? []).map((c) => c.displayName).filter(Boolean),
        address: formatAddress(location.storefrontAddress),
        // Sola, para «Insertar variable» de Publicaciones (GooglePostComposer).
        city: location.storefrontAddress?.locality ?? null,
        openStatus: location.openInfo?.status ?? null,
        mapsUri: location.metadata?.mapsUri ?? null,
      },
      attributes: shapeAttributes(metadata ?? [], current),
      // El panel distingue «Google no habilita atributos para tu rubro» de «no pudimos leerlos».
      attributesError: metadata === null,
    });
  } catch (err) {
    sendError(res, err, 'No pudimos leer tu ficha de Google', 'Error leyendo la ficha');
  }
});

router.patch(
  '/api/google/locations/:id/profile',
  writeLimiter,
  requireAuth(supabase),
  validateBody(googleProfileUpdateSchema),
  async (req, res) => {
    try {
      assertGoogleConfigured();
      requireUuid(req.params.id, 'Ficha');
      const target = await writeTarget(req.user.id, req.params.id);
      const accessToken = await accessTokenForOrg(target.organization_id);
      const body = req.body;

      const fields = {};
      const mask = [];
      if (body.description !== undefined) {
        fields.profile = { description: body.description };
        mask.push('profile.description');
      }
      if (body.primaryPhone !== undefined || body.additionalPhones !== undefined) {
        fields.phoneNumbers = {
          primaryPhone: body.primaryPhone ?? '',
          additionalPhones: body.additionalPhones ?? [],
        };
        mask.push('phoneNumbers');
      }
      if (body.websiteUri !== undefined) {
        fields.websiteUri = body.websiteUri;
        mask.push('websiteUri');
      }
      if (body.regularHours !== undefined) {
        fields.regularHours = body.regularHours;
        mask.push('regularHours');
      }

      if (mask.length) await patchLocation(accessToken, target.google_location, fields, mask);

      const attributes = [
        // Un atributo o un enlace vacío se manda en la máscara sin valores: así
        // Google lo borra (un sí/no «sin cargar» no es lo mismo que «No»).
        ...(body.attributes ?? []).map((a) => ({ name: a.name, valueType: 'BOOL', values: a.value === null ? [] : [a.value] })),
        ...(body.links ?? []).map((l) => ({ name: l.name, valueType: 'URL', uriValues: l.uri ? [{ uri: l.uri }] : [] })),
      ];
      if (attributes.length) await updateAttributes(accessToken, target.google_location, attributes);

      await supabase.from('audit_log').insert({
        organization_id: target.organization_id,
        actor_id: req.user.id,
        action: 'google.profile_updated',
        entity_type: 'google_location',
        entity_id: req.params.id,
        metadata: { fields: [...mask, ...attributes.map((a) => a.name)] },
      });

      res.json({ ok: true });
    } catch (err) {
      sendError(res, err, 'No pudimos guardar los cambios en Google', 'Error editando la ficha');
    }
  }
);

/* ─── Protección de ficha (Business) ──────────────────────────────────────── */

router.post('/api/google/profile/changes/:changeId/:action', writeLimiter, requireAuth(supabase), async (req, res) => {
  try {
    assertGoogleConfigured();
    const { changeId, action } = req.params;
    requireUuid(changeId, 'Cambio');
    if (action !== 'revert' && action !== 'accept') throw badRequest('Acción inválida');

    const { data: change, error } = await supabase
      .from('google_profile_changes')
      .select('id, google_location_id, fields, owner_values, status')
      .eq('id', changeId)
      .maybeSingle();
    if (error) throw error;
    if (!change || change.status !== 'pending') throw rpcError({ message: 'cambio_inexistente' });

    // Primero el permiso (Business incluido), después Google, y recién al final
    // se marca resuelto: si Google rechaza la reversión, el cambio sigue
    // pendiente y se puede reintentar.
    const target = await writeTarget(req.user.id, change.google_location_id, true);

    if (action === 'revert') {
      const accessToken = await accessTokenForOrg(target.organization_id);
      await patchLocation(accessToken, target.google_location, change.owner_values, change.fields);
    }

    const { error: resolveError } = await supabase.rpc('google_resolve_profile_change', {
      p_change: changeId,
      p_user: req.user.id,
      p_status: action === 'revert' ? 'reverted' : 'accepted',
    });
    if (resolveError) throw rpcError(resolveError);

    res.json({ ok: true });
  } catch (err) {
    sendError(res, err, 'No pudimos deshacer el cambio en Google', 'Error resolviendo un cambio de la ficha');
  }
});

/* ─── Publicaciones ────────────────────────────────────────────────────────── */

const MEDIA_BUCKET = 'google-post-media';

function toGoogleDate(iso) {
  const [year, month, day] = iso.split('-').map(Number);
  return { year, month, day };
}
function toGoogleTime(hhmm) {
  const [hours, minutes] = hhmm.split(':').map(Number);
  return { hours, minutes };
}

function toLocalPost(body) {
  const post = { topicType: body.topicType, summary: body.summary };
  if (body.callToAction) {
    post.callToAction = { actionType: body.callToAction.actionType };
    if (body.callToAction.actionType !== 'CALL') post.callToAction.url = body.callToAction.url;
  }
  if (body.mediaUrl) post.media = [{ mediaFormat: 'PHOTO', sourceUrl: body.mediaUrl }];
  if (body.event) {
    post.event = {
      title: body.event.title,
      schedule: {
        startDate: toGoogleDate(body.event.startDate),
        endDate: toGoogleDate(body.event.endDate),
        ...(body.event.startTime ? { startTime: toGoogleTime(body.event.startTime) } : {}),
        ...(body.event.endTime ? { endTime: toGoogleTime(body.event.endTime) } : {}),
      },
    };
  }
  if (body.topicType === 'OFFER' && body.offer) {
    post.offer = Object.fromEntries(Object.entries(body.offer).filter(([, v]) => v));
  }
  return post;
}

function shapePost(post) {
  return {
    name: post.name,
    topicType: post.topicType,
    summary: post.summary ?? '',
    state: post.state ?? null,
    createTime: post.createTime ?? null,
    searchUrl: post.searchUrl ?? null,
    mediaUrl: post.media?.[0]?.googleUrl ?? post.media?.[0]?.sourceUrl ?? null,
    eventTitle: post.event?.title ?? null,
    schedule: post.event?.schedule ?? null,
    couponCode: post.offer?.couponCode ?? null,
  };
}

router.get('/api/google/locations/:id/posts', readLimiter, requireAuth(supabase), async (req, res) => {
  try {
    assertGoogleConfigured();
    requireUuid(req.params.id, 'Ficha');
    const target = await readTarget(req.user.id, req.params.id);
    const accessToken = await accessTokenForOrg(target.organization_id);
    const posts = await listLocalPosts(accessToken, target.google_account, target.google_location);
    res.json({ posts: posts.map(shapePost), canEdit: await canWrite(req.user.id, req.params.id) });
  } catch (err) {
    sendError(res, err, 'No pudimos leer tus publicaciones', 'Error listando publicaciones');
  }
});

router.post(
  '/api/google/locations/:id/posts',
  writeLimiter,
  requireAuth(supabase),
  validateBody(googlePostSchema),
  async (req, res) => {
    let reservedId = null;
    try {
      assertGoogleConfigured();
      requireUuid(req.params.id, 'Ficha');
      const target = await writeTarget(req.user.id, req.params.id);

      // La foto tiene que ser nuestra, de la carpeta de esta organización: si no,
      // el endpoint serviría para publicar cualquier imagen de internet en la
      // ficha de un cliente.
      if (req.body.mediaUrl) {
        const prefix = `${process.env.SUPABASE_URL}/storage/v1/object/public/${MEDIA_BUCKET}/${target.organization_id}/`;
        if (!req.body.mediaUrl.startsWith(prefix)) throw badRequest('La foto tiene que subirse desde el panel');
      }

      const { data: reserved, error: reserveError } = await supabase.rpc('google_post_reserve', {
        p_user: req.user.id,
        p_google_location: req.params.id,
        p_topic_type: req.body.topicType,
        p_summary: req.body.summary,
        p_media_url: req.body.mediaUrl ?? null,
      });
      if (reserveError) throw rpcError(reserveError);
      reservedId = reserved;

      const accessToken = await accessTokenForOrg(target.organization_id);
      const created = await createLocalPost(accessToken, target.google_account, target.google_location, toLocalPost(req.body));

      const { error: confirmError } = await supabase.rpc('google_post_confirm', {
        p_post: reservedId,
        p_google_post_name: created.name,
      });
      // Ya está publicada en Google: no se le dice al usuario que falló.
      if (confirmError) console.error('Publicación creada en Google pero no confirmada:', confirmError.message);
      reservedId = null;

      res.status(201).json({ post: shapePost(created) });
    } catch (err) {
      if (reservedId) {
        await supabase.rpc('google_post_release', { p_post: reservedId }).then(({ error }) => {
          if (error) console.error('No se pudo soltar la reserva de publicación:', error.message);
        });
      }
      sendError(res, err, 'Google no aceptó la publicación', 'Error publicando en Google');
    }
  }
);

router.delete('/api/google/locations/:id/posts', writeLimiter, requireAuth(supabase), async (req, res) => {
  try {
    assertGoogleConfigured();
    requireUuid(req.params.id, 'Ficha');
    const target = await writeTarget(req.user.id, req.params.id);

    // El nombre tiene que ser de una publicación de ESTA ficha.
    const name = String(req.query.name || '');
    const prefix = `${target.google_account}/${target.google_location}/localPosts/`;
    if (!name.startsWith(prefix) || !/^[\w/-]+$/.test(name)) throw badRequest('Publicación inválida');

    const accessToken = await accessTokenForOrg(target.organization_id);
    await deleteLocalPost(accessToken, name);

    const { error } = await supabase.rpc('google_post_mark_deleted', { p_google_post_name: name, p_user: req.user.id });
    if (error) console.error('Publicación borrada en Google pero no registrada:', error.message);

    res.json({ ok: true });
  } catch (err) {
    sendError(res, err, 'No pudimos borrar la publicación', 'Error borrando una publicación');
  }
});

/* ─── SEO Local: Análisis SEO (4.8) ───────────────────────────────────────── */

/* La lectura de Google de una ficha para el análisis, guardada 10 minutos: la
 * pantalla se abre y se cambia de sucursal seguido, y cada análisis son cuatro
 * pedidos a Google contra la cuota compartida del proyecto. «Actualizar»
 * (?fresh=1) la saltea. Es por ficha, no por usuario: quién puede ver qué se
 * decide en cada pedido con google_location_read_target(). */
const SEO_CACHE_MS = 10 * 60_000;
const seoCache = new Map();

const normalize = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

async function auditFicha(accessToken, gl, fresh) {
  const cached = seoCache.get(gl.id);
  if (!fresh && cached && Date.now() - cached.at < SEO_CACHE_MS) return cached.value;

  const [location, attributes, media, posts, reviewRows] = await Promise.all([
    getLocationForSeo(accessToken, gl.google_location),
    // Lo que falla de acá se marca «no medido» en vez de tirar el análisis entero.
    getAttributes(accessToken, gl.google_location).catch(() => null),
    listLocationMedia(accessToken, gl.google_account, gl.google_location).catch((err) => {
      console.error('Análisis SEO: no se pudieron leer las fotos:', err.message);
      return null;
    }),
    listLocalPosts(accessToken, gl.google_account, gl.google_location).catch(() => null),
    supabase
      .from('google_reviews')
      .select('created_time, reply_comment, reply_updated_time')
      .eq('google_location_id', gl.id)
      .order('created_time', { ascending: false })
      .limit(1000)
      .then(({ data, error }) => { if (error) throw error; return data ?? []; }),
  ]);

  const audit = auditLocation({
    location,
    attributes,
    media,
    posts,
    reviews: {
      total: gl.total_reviews ?? reviewRows.length,
      rating: gl.average_rating != null ? Number(gl.average_rating) : null,
      stored: reviewRows,
    },
  });
  const value = { audit, description: location.profile?.description ?? '' };
  seoCache.set(gl.id, { at: Date.now(), value });
  return value;
}

/* Business: lo que la gente buscó en Google cuando apareció tu ficha (últimos 3
 * meses cerrados) y que tu descripción no nombra. Sale de google_search_keywords,
 * que en gratis ni se lee (0029). */
async function missingSearchTerms(gl, description) {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 3, 1)).toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('google_search_keywords')
    .select('keyword, impressions, threshold')
    .eq('google_location_id', gl.id)
    .gte('month', from);
  if (error) throw error;

  const byTerm = new Map();
  for (const row of data ?? []) {
    byTerm.set(row.keyword, (byTerm.get(row.keyword) ?? 0) + (row.impressions ?? row.threshold ?? 0));
  }
  const desc = normalize(description);
  return [...byTerm.entries()]
    .sort((a, b) => b[1] - a[1])
    .filter(([term]) => normalize(term).split(/\s+/).filter((w) => w.length >= 3).some((w) => !desc.includes(w)))
    .slice(0, 8)
    .map(([term, impressions]) => ({ term, impressions }));
}

/* GET /api/google/seo?org=<uuid>[&fresh=1] — el análisis de cada ficha
 * vinculada que el usuario puede ver. Gratis y Business ven el análisis; la
 * lista de búsquedas que faltan en la descripción es de Business. */
router.get('/api/google/seo', readLimiter, requireAuth(supabase), async (req, res) => {
  try {
    assertGoogleConfigured();
    const orgId = String(req.query.org || '');
    requireUuid(orgId, 'Organización');
    const fresh = req.query.fresh === '1';

    const { data: fichas, error } = await supabase
      .from('google_locations')
      .select('id, google_account, google_location, title, maps_uri, location_id, total_reviews, average_rating, locations!inner(name, deleted_at)')
      .eq('organization_id', orgId)
      .not('location_id', 'is', null)
      .is('locations.deleted_at', null)
      .order('title');
    if (error) throw error;

    // Sólo las que este usuario puede ver (un encargado, sus sucursales).
    const visible = [];
    for (const gl of fichas ?? []) {
      try {
        await readTarget(req.user.id, gl.id);
        visible.push(gl);
      } catch (err) {
        if (err.status !== 403 && err.status !== 404) throw err;
      }
    }
    if (!visible.length) return res.json({ isBusiness: false, locations: [] });

    const accessToken = await accessTokenForOrg(orgId);
    const { data: isBusiness, error: businessError } = await supabase.rpc('org_has_business', { p_org: orgId });
    if (businessError) throw businessError;

    const locations = [];
    for (const gl of visible) {
      try {
        const { audit, description } = await auditFicha(accessToken, gl, fresh);
        locations.push({
          googleLocationId: gl.id,
          locationId: gl.location_id,
          name: gl.locations?.name ?? gl.title ?? 'Sucursal',
          title: gl.title,
          mapsUri: gl.maps_uri,
          audit,
          missingSearchTerms: isBusiness ? await missingSearchTerms(gl, description) : null,
        });
      } catch (err) {
        // Una ficha que Google no deja leer no tira las demás.
        console.error(`Análisis SEO de ${gl.google_location}:`, err.message);
        locations.push({
          googleLocationId: gl.id, locationId: gl.location_id, name: gl.locations?.name ?? gl.title ?? 'Sucursal',
          title: gl.title, mapsUri: gl.maps_uri, audit: null, missingSearchTerms: null,
          error: 'No pudimos leer esta ficha en Google. Probá de nuevo en unos minutos.',
        });
      }
    }

    res.json({ isBusiness: Boolean(isBusiness), locations });
  } catch (err) {
    sendError(res, err, 'No pudimos analizar tu ficha', 'Error en el análisis SEO');
  }
});

export default router;
