import { API_URL } from './config';

/* Consultas de contacto: POST /api/contact de services/api, la misma ruta que
 * usa el formulario del sitio de ventas. El aviso nos llega por Resend (o por
 * Web3Forms si el API no tiene Resend configurado), con rate limit de 5 cada
 * 15 minutos por IP.
 *
 * A diferencia de ventas, acá NO hay respaldo directo a Web3Forms desde el
 * navegador: el panel nunca tuvo la access_key en el bundle y no la va a tener.
 * Si el API no contesta, el formulario lo dice y ofrece el mail. */
export async function sendContactMessage({ name, email, phone, message }) {
  let response;
  try {
    response = await fetch(`${API_URL}/api/contact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name.trim(),
        email: email.trim(),
        phone: phone?.trim() || undefined,
        message: message.trim(),
      }),
    });
  } catch {
    const error = new Error('El servicio no está disponible en este momento.');
    error.status = 0;
    throw error;
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'No pudimos enviar tu consulta.');
    error.status = response.status;
    throw error;
  }
}

/* El límite que valida el API (routes/contact.js): más largo, responde 400. */
export const CONTACT_MESSAGE_MAX = 5000;
