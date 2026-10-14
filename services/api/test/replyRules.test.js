import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allowedLocations, isLocationAllowed } from '../lib/replyRules.js';

/* REPLY_ALLOWED_LOCATIONS: el seguro del proyecto de pruebas. */

test('vacía o sin definir: sin restricción', () => {
  assert.equal(allowedLocations(''), null);
  assert.equal(allowedLocations(undefined), null);
  assert.equal(allowedLocations(' , '), null);
  assert.equal(isLocationAllowed('cualquiera', null), true);
});

test('con ids: sólo esos locales, sin importar mayúsculas ni espacios', () => {
  const allowed = allowedLocations(' AAAA-1 , bbbb-2 ');
  assert.deepEqual([...allowed], ['aaaa-1', 'bbbb-2']);
  assert.equal(isLocationAllowed('aaaa-1', allowed), true);
  assert.equal(isLocationAllowed('BBBB-2', allowed), true);
  assert.equal(isLocationAllowed('cccc-3', allowed), false);
  assert.equal(isLocationAllowed(null, allowed), false);
});
