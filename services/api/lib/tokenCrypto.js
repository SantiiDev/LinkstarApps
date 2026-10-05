import crypto from 'node:crypto';

/* Cifrado de los refresh tokens de Google antes de guardarlos en Supabase.
 *
 * AES-256-GCM con la clave en GOOGLE_TOKEN_ENC_KEY (32 bytes en base64). La
 * clave vive en este servicio y NO en la base, a propósito: un volcado de la
 * base —un backup, la service_role filtrada— no alcanza para leer la ficha de
 * Google de ningún cliente. Ver el encabezado de la migración 0024.
 *
 * El organization_id va como dato asociado (AAD): no forma parte del texto
 * cifrado, pero el descifrado falla si no coincide. Así, copiar el token
 * cifrado de una organización a la fila de otra no sirve de nada.
 *
 * Formato guardado: "<iv>.<tag>.<ciphertext>", cada parte en base64url, más el
 * `key_id` en su propia columna. Hoy sólo existe 'v1'. Para rotar: agregar
 * GOOGLE_TOKEN_ENC_KEY_V2, cifrar con esa, y descifrar según el key_id de cada
 * fila hasta que todos se hayan reconectado o re-cifrado.
 */

const CURRENT_KEY_ID = 'v1';
const KEY_ENV_BY_ID = { v1: 'GOOGLE_TOKEN_ENC_KEY' };

function loadKey(keyId) {
  const envName = KEY_ENV_BY_ID[keyId];
  if (!envName) throw new Error(`key_id desconocido: ${keyId}`);

  const raw = process.env[envName];
  if (!raw) throw new Error(`Falta ${envName} para cifrar/descifrar tokens de Google`);

  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error(`${envName} tiene que ser 32 bytes en base64 (tiene ${key.length})`);
  }
  return key;
}

export function hasTokenKey() {
  try {
    loadKey(CURRENT_KEY_ID);
    return true;
  } catch {
    return false;
  }
}

export function encryptToken(plaintext, organizationId) {
  const key = loadKey(CURRENT_KEY_ID);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(String(organizationId)));
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    ciphertext: [iv, tag, ciphertext].map((b) => b.toString('base64url')).join('.'),
    keyId: CURRENT_KEY_ID,
  };
}

export function decryptToken(stored, keyId, organizationId) {
  const key = loadKey(keyId);
  const [iv, tag, ciphertext] = String(stored).split('.').map((p) => Buffer.from(p, 'base64url'));
  if (!iv || !tag || !ciphertext) throw new Error('Token cifrado con formato inválido');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAAD(Buffer.from(String(organizationId)));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
