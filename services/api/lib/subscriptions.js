// Suscripciones mensuales del dashboard (Mercado Pago — preapproval).
//
// Ojo con la diferencia respecto de lib/orders.js: eso es un pago único por
// los expositores (preference + checkout del sitio de ventas). Esto es débito
// automático recurrente por el acceso a LinkstarApp. Son dos productos
// distintos que comparten la misma cuenta de Mercado Pago y el mismo webhook.
//
// Se usa "suscripción SIN plan asociado": el auto_recurring viaja completo en
// cada preapproval en vez de apuntar a un preapproval_plan. El motivo es
// external_reference — el checkout de un plan asociado no lo acepta, y sin él
// el webhook recibe un cobro sin saber de qué organización es. Ver la nota al
// final de 0013_subscription_onboarding.sql.
//
// Los datos de la tarjeta NUNCA pasan por acá: el cliente autoriza en el
// init_point de Mercado Pago y vuelve. Este servicio sólo ve ids y estados.
import { PreApproval } from 'mercadopago';
import { mpClient, withTimeout } from './mercadopago.js';
import { DASHBOARD_URL } from './config.js';

const MP_API = 'https://api.mercadopago.com';
const MP_TIMEOUT_MS = 8000;

// A dónde vuelve el cliente después de autorizar en Mercado Pago. Es una
// pantalla de espera, no de confirmación: la verdad la trae el webhook.
export const SUBSCRIPTION_BACK_URL = `${DASHBOARD_URL}/alta/pago/resultado`;

// El id de organización viaja a Mercado Pago SIN guiones.
//
// No es cosmético: el WAF de MP rechaza un external_reference con formato UUID
// con un 400 "Request contains invalid or disallowed content", mientras que
// los mismos 32 caracteres hexadecimales pasan sin problema. Sin normalizar,
// ninguna suscripción se llegaría a crear.
export const toMpReference = (uuid) => String(uuid).replace(/-/g, '');

// La vuelta, para el webhook: 32 hex -> uuid canónico.
export function fromMpReference(reference) {
  const hex = String(reference || '').replace(/-/g, '');
  if (!/^[0-9a-f]{32}$/i.test(hex)) return null;
  return [
    hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20),
  ].join('-');
}

/**
 * Crea la suscripción de una organización a un plan y devuelve el init_point
 * al que hay que mandar al cliente para que la autorice.
 *
 * Nace con status 'pending': recién cuando el cliente autoriza, Mercado Pago
 * la pasa a 'authorized' y nos avisa por webhook. Hasta entonces la
 * organización sigue sin plan elegido y el panel le queda cerrado.
 */
export async function createSubscriptionPreapproval({ plan, orgId, payerEmail }) {
  const preapproval = new PreApproval(mpClient);

  const autoRecurring = {
    frequency: 1,
    frequency_type: 'months',
    transaction_amount: Number(plan.price_ars),
    currency_id: 'ARS',
  };

  // free_trial son los días que el cliente ve en pantalla, leídos de la misma
  // fila de `plans` que muestra el selector. Que salgan del mismo lugar es lo
  // que evita prometer 7 días y cobrar a los 5.
  if (plan.trial_days > 0) {
    autoRecurring.free_trial = {
      frequency: plan.trial_days,
      frequency_type: 'days',
    };
  }

  const response = await withTimeout(
    preapproval.create({
      body: {
        reason: `LinkstarApp — Plan ${plan.name}`,
        auto_recurring: autoRecurring,
        back_url: SUBSCRIPTION_BACK_URL,
        payer_email: payerEmail,
        // El puente entre Mercado Pago y nuestra base: todo webhook de esta
        // suscripción vuelve con este valor. Sin guiones, ver toMpReference.
        external_reference: toMpReference(orgId),
        // OJO: acá NO va notification_url. /preapproval lo acepta sin quejarse
        // (responde 200) pero no lo guarda — la respuesta no lo devuelve. Las
        // notificaciones de suscripción salen únicamente a la URL configurada
        // en el panel de Mercado Pago. Verificado contra la API en vivo.
        status: 'pending',
      },
    }),
    MP_TIMEOUT_MS,
    'Mercado Pago preapproval.create'
  );

  if (!response?.init_point) {
    throw new Error('Mercado Pago no devolvió init_point para la suscripción');
  }

  return {
    id: response.id,
    initPoint: response.init_point,
    status: response.status,
  };
}

/** Estado actual de una suscripción según Mercado Pago (lo consulta el webhook). */
export async function getPreapproval(id) {
  const preapproval = new PreApproval(mpClient);
  return withTimeout(
    preapproval.get({ id }),
    MP_TIMEOUT_MS,
    'Mercado Pago preapproval.get'
  );
}

/** Cancela la suscripción en Mercado Pago. El estado final lo escribe el webhook. */
export async function cancelPreapproval(id) {
  const preapproval = new PreApproval(mpClient);
  return withTimeout(
    preapproval.update({ id, body: { status: 'cancelled' } }),
    MP_TIMEOUT_MS,
    'Mercado Pago preapproval.update(cancelled)'
  );
}

/**
 * Detalle de un cobro recurrente (topic subscription_authorized_payment).
 *
 * Va por fetch y no por la SDK porque la SDK de Node no expone un cliente para
 * /authorized_payments. Es la única llamada a mano a la API de MP en el repo.
 */
export async function getAuthorizedPayment(id) {
  const res = await withTimeout(
    fetch(`${MP_API}/authorized_payments/${id}`, {
      headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` },
    }),
    MP_TIMEOUT_MS,
    'Mercado Pago authorized_payments'
  );

  if (!res.ok) {
    throw new Error(`authorized_payments/${id} devolvió ${res.status}`);
  }
  return res.json();
}
