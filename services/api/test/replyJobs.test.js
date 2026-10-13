import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allowedLocations, jobDecision } from '../lib/replyRules.js';

/* Qué publica la cola de respuestas y qué saltea (lib/replyRules.js). */

const LINKSTAR = '11111111-aaaa-bbbb-cccc-000000000001';
const VINERIA = '11111111-aaaa-bbbb-cccc-000000000002';

const ctx = (patch = {}) => ({
  review: { has_reply: false },
  is_business: true,
  auto_rule_active: true,
  google: { location_id: LINKSTAR },
  ...patch,
});

test('REPLY_ALLOWED_LOCATIONS vacía no restringe', () => {
  assert.equal(allowedLocations(''), null);
  assert.equal(allowedLocations(undefined), null);
  assert.equal(allowedLocations(' , '), null);
});

test('REPLY_ALLOWED_LOCATIONS deja pasar sólo esos locales', () => {
  const allowed = allowedLocations(` ${LINKSTAR.toUpperCase()} `);
  assert.deepEqual(jobDecision(ctx(), { source: 'past' }, allowed), { publish: true });
  const other = jobDecision(ctx({ google: { location_id: VINERIA } }), { source: 'past' }, allowed);
  assert.equal(other.publish, false);
  assert.match(other.reason, /REPLY_ALLOWED_LOCATIONS/);
});

test('sin contexto (ficha desvinculada) no publica', () => {
  assert.equal(jobDecision(null, { source: 'auto' }, null).publish, false);
});

test('una reseña que ya tiene respuesta no se pisa', () => {
  assert.equal(jobDecision(ctx({ review: { has_reply: true } }), { source: 'past' }, null).publish, false);
});

test('fuera de Business no publica', () => {
  assert.equal(jobDecision(ctx({ is_business: false }), { source: 'past' }, null).publish, false);
});

test('la regla automática se vuelve a mirar justo antes de publicar', () => {
  assert.equal(jobDecision(ctx({ auto_rule_active: false }), { source: 'auto' }, null).publish, false);
  // «Responder anteriores» es un pedido explícito: no depende de la regla.
  assert.equal(jobDecision(ctx({ auto_rule_active: false }), { source: 'past' }, null).publish, true);
});
