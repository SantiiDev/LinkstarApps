/* Email transaccional: los mails que le llegan al CLIENTE.
 *
 * No confundir con lib/email.js, que manda a NUESTRA casilla los avisos de
 * pedidos y las consultas del formulario de contacto, y lo hace por Web3Forms.
 * Web3Forms no sirve para esto: es un reenviador de formularios a una casilla
 * fija, no tiene destinatario variable ni plantillas ni reputación de dominio.
 * Ese fue justamente el motivo por el que la fase 3 resolvió las invitaciones
 * de equipo con un link copiable en vez de un mail.
 *
 * Proveedor: Resend. La costura está en `send()`: es la única función que sabe
 * de Resend, y todo lo demás arma contenido y la llama. Cambiar de proveedor es
 * reescribir esa función.
 *
 * ── Si no hay RESEND_API_KEY ──────────────────────────────────────────────
 * No se rompe: se escribe el mail en consola y se devuelve `simulated: true`.
 * Es a propósito y sirve para dos cosas — desarrollar sin cuenta, y que el
 * script de alertas se pueda probar de punta a punta antes de que exista el
 * dominio verificado. Ojo con lo que eso implica: `simulated` NO es un envío.
 * Quien lo llama tiene que decidir si registra el aviso como mandado (ver
 * scripts/send-alerts.js, que no lo registra).
 */

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

/* El remitente tiene que ser de un dominio verificado en Resend. Mientras no lo
 * esté, Resend sólo deja mandar a la casilla con la que se creó la cuenta —
 * suficiente para probar, inservible para clientes. `onboarding@resend.dev` es
 * el remitente de prueba que Resend habilita sin verificar nada. */
const FROM = process.env.RESEND_FROM || 'Linkstar <onboarding@resend.dev>';

if (!process.env.RESEND_API_KEY) {
  console.warn(
    '⚠️  Falta RESEND_API_KEY en .env — los mails al cliente se van a simular por consola, no a enviar.'
  );
}

/* Único punto que conoce el proveedor.
 *
 * Devuelve { sent, simulated, id }. No lanza por un rechazo del proveedor: quien
 * llama decide qué hacer. En el ejecutor de alertas eso importa — un mail que
 * falló NO se registra, así vuelve a intentarse en la próxima corrida en vez de
 * perderse en silencio. */
export async function send({ to, subject, html, text }) {
  if (!process.env.RESEND_API_KEY) {
    console.log('\n──────── MAIL SIMULADO (falta RESEND_API_KEY) ────────');
    console.log(`Para:    ${to}`);
    console.log(`Asunto:  ${subject}`);
    console.log(text || html);
    console.log('──────────────────────────────────────────────────────\n');
    return { sent: false, simulated: true, id: null };
  }

  const response = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM, to: [to], subject, html, text }),
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    // El mensaje del proveedor se conserva: los errores útiles de Resend son
    // "dominio no verificado" y "sólo podés mandarte mails a vos mismo", y
    // esconderlos detrás de un genérico cuesta una tarde.
    const reason = result?.message || `HTTP ${response.status}`;
    throw new Error(`Resend rechazó el envío: ${reason}`);
  }

  return { sent: true, simulated: false, id: result?.id ?? null };
}

/* ---------------------------------------------------------------------------
 * Plantillas
 *
 * HTML a mano y con estilos en línea, sin librería de plantillas: los clientes
 * de correo ignoran <style> en el head y la mitad no entiende flexbox. Son
 * tres mails; una dependencia más no se justifica.
 * ------------------------------------------------------------------------- */

const BRAND = '#F58529';
const INK = '#1A2639';

function layout({ heading, body, cta }) {
  return `<!doctype html>
<html lang="es"><body style="margin:0;padding:24px;background:#eef0f7;font-family:-apple-system,'Segoe UI',system-ui,sans-serif;color:${INK};">
  <table role="presentation" style="max-width:520px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;">
    <tr><td style="padding:28px 28px 8px;">
      <div style="font-size:18px;font-weight:800;letter-spacing:-.02em;">linkstar<span style="color:${BRAND};">.</span></div>
    </td></tr>
    <tr><td style="padding:8px 28px 4px;">
      <h1 style="margin:0 0 12px;font-size:20px;line-height:1.3;">${heading}</h1>
    </td></tr>
    <tr><td style="padding:0 28px 24px;font-size:15px;line-height:1.65;color:#41506b;">
      ${body}
      ${cta ? `<div style="margin-top:24px;"><a href="${cta.href}" style="display:inline-block;padding:11px 22px;border-radius:999px;background:${BRAND};color:#fff;text-decoration:none;font-weight:600;font-size:14px;">${cta.label}</a></div>` : ''}
    </td></tr>
    <tr><td style="padding:16px 28px 26px;border-top:1px solid #eef0f7;font-size:12px;color:#8a93a6;">
      Recibís este mail porque tenés avisos activados en LinkstarApp. Podés apagarlos en Configuración.
    </td></tr>
  </table>
</body></html>`;
}

function formatRelative(isoString) {
  if (!isoString) return 'nunca';
  const hours = Math.floor((Date.now() - new Date(isoString).getTime()) / 3600000);
  if (hours < 48) return `hace ${hours} horas`;
  return `hace ${Math.floor(hours / 24)} días`;
}

/* Expositor sin escaneos. El asunto nombra el expositor: en la bandeja se ve
 * sólo eso, y "Tenés un aviso" no le dice nada a nadie. */
export function deviceIdleEmail({ organizationName, payload }) {
  const label = payload.device_label || 'Un expositor';
  const place = payload.location_name ? ` en ${payload.location_name}` : '';
  const last = payload.last_scan_at
    ? `El último escaneo fue <strong>${formatRelative(payload.last_scan_at)}</strong>.`
    : 'Todavía no registró ningún escaneo desde que lo vinculaste.';

  return {
    subject: `${label} lleva ${payload.idle_hours} horas sin escaneos`,
    html: layout({
      heading: `${label} está callado`,
      body: `
        <p style="margin:0 0 12px;">Tu expositor <strong>${label}</strong>${place} no registra actividad
        en las últimas <strong>${payload.idle_hours} horas</strong>. ${last}</p>
        <p style="margin:0;">Suele pasar cuando el expositor quedó fuera de la vista del cliente, o
        guardado. Vale la pena chequear que siga en el mostrador o en la mesa.</p>`,
    }),
    text: `${label}${place} no registra escaneos en las últimas ${payload.idle_hours} horas. `
      + `Suele pasar cuando el expositor quedó fuera de la vista del cliente. `
      + `Revisá que siga en su lugar. — ${organizationName}`,
  };
}

/* Resumen semanal. Muestra la variación sólo si hay semana anterior con la cual
 * comparar: un "+100%" contra cero es ruido. */
export function weeklySummaryEmail({ organizationName, payload }) {
  const scans = payload.scans_7d ?? 0;
  const prev = payload.scans_prev_7d ?? 0;

  let comparison = '';
  if (prev > 0) {
    const pct = Math.round(((scans - prev) / prev) * 100);
    comparison = pct === 0
      ? ' Igual que la semana pasada.'
      : ` ${pct > 0 ? 'Un' : 'Un'} <strong>${Math.abs(pct)}% ${pct > 0 ? 'más' : 'menos'}</strong> que la semana anterior.`;
  }

  const body = scans === 0
    ? `<p style="margin:0;">Esta semana no registramos escaneos en tus
       ${payload.active_devices} expositor(es) activo(s). Si eso no cuadra, avisanos y lo miramos.</p>`
    : `<p style="margin:0 0 12px;">Esta semana tuviste <strong>${scans} escaneo${scans === 1 ? '' : 's'}</strong>
       en ${payload.active_devices} expositor(es) activo(s).${comparison}</p>
       <p style="margin:0;">Entrá al panel para ver el detalle por sucursal y por expositor.</p>`;

  return {
    subject: `Tu semana en Linkstar: ${scans} escaneo${scans === 1 ? '' : 's'}`,
    html: layout({ heading: `Resumen de la semana`, body }),
    text: `${organizationName} — esta semana: ${scans} escaneos en ${payload.active_devices} expositores activos.`,
  };
}

/* Invitación al equipo.
 *
 * La fase 3 la resolvió con un link que quien invita copia y manda por donde
 * quiera, porque no había proveedor de email. El link es EL MISMO: esto sólo lo
 * manda por correo además. `invite_member()` y la pantalla de aceptación no
 * cambian, y si el mail falla el link copiable sigue siendo válido. */
export function invitationEmail({ organizationName, inviterName, link }) {
  const who = inviterName ? `${inviterName} te invitó` : 'Te invitaron';
  return {
    subject: `${who} a ${organizationName} en Linkstar`,
    html: layout({
      heading: `${who} a ${organizationName}`,
      body: `<p style="margin:0;">Con este enlace entrás al panel de <strong>${organizationName}</strong>
             para ver los escaneos de sus expositores. El enlace vence en 7 días.</p>`,
      cta: { href: link, label: 'Aceptar la invitación' },
    }),
    text: `${who} a ${organizationName} en Linkstar. Aceptá la invitación acá: ${link} (vence en 7 días).`,
  };
}
