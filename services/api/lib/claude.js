import Anthropic from '@anthropic-ai/sdk';

/* Cliente mínimo de la API de Claude (Anthropic) — fase 5.
 *
 * Una sola cosa: mandar un texto con instrucciones y un esquema, y devolver el
 * JSON que el modelo respondió. Reemplazó a lib/gemini.js el 8/10/2026, antes de
 * que el análisis se encendiera en producción (Gemini sólo corrió en pruebas
 * locales del 7/10, nunca en Railway).
 *
 * La respuesta está atada al esquema con structured outputs
 * (output_config.format): el modelo no puede devolver otra forma, diga lo que
 * diga la reseña.
 *
 * ANTHROPIC_API_KEY es opcional para el servicio: sin ella isClaudeConfigured()
 * da false y quien llama se saltea el análisis.
 *
 * Los reintentos (429, 5xx, red) los hace el SDK. Generar un análisis es
 * idempotente (lo que se guarda se pisa por review_id), así que reintentar no
 * duplica nada — distinto de googleRequest(), que no reintenta un POST porque
 * publicaría dos veces.
 *
 * Con claude-haiku-5-5 no se manda `temperature`: el modelo sólo acepta el valor
 * por defecto y cualquier otro responde 400. El esquema hace el trabajo que
 * antes hacía temperature 0.
 */

const TIMEOUT_MS = 60_000;
const MAX_RETRIES = 3;
// Lugar para el razonamiento del modelo más el JSON. Si se queda corto, la
// respuesta termina en max_tokens sin JSON y se reporta como error.
const MAX_TOKENS = 4096;

// Se lee al llamar y no al importar: así no depende de que dotenv haya cargado
// antes que este módulo.
export function analysisModel() {
  return process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5';
}

export function isClaudeConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

let client;
function getClient() {
  // El constructor lee ANTHROPIC_API_KEY del entorno.
  client ??= new Anthropic({ timeout: TIMEOUT_MS, maxRetries: MAX_RETRIES });
  return client;
}

export async function generateJson({ system, prompt, schema, model = analysisModel() }) {
  if (!isClaudeConfigured()) throw new Error('ANTHROPIC_API_KEY no está configurada');

  let response;
  try {
    response = await getClient().messages.create({
      model,
      max_tokens: MAX_TOKENS,
      system,
      messages: [{ role: 'user', content: prompt }],
      // Clasificar una reseña es una tarea corta: poco razonamiento alcanza y
      // abarata cada llamada.
      output_config: { effort: 'low', format: { type: 'json_schema', schema } },
    });
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      throw Object.assign(new Error(`Claude respondió ${err.status ?? 'sin conexión'}: ${err.message}`), {
        status: err.status,
      });
    }
    throw err;
  }

  // Los filtros de seguridad del modelo pueden declinar un pedido. No se
  // reintenta: el mismo texto va a volver a declinarse.
  if (response.stop_reason === 'refusal') {
    const category = response.stop_details?.category ?? 'sin categoría';
    throw Object.assign(new Error(`Claude no analizó la reseña (refusal: ${category})`), { code: 'model_refusal' });
  }
  if (response.stop_reason === 'max_tokens') {
    throw Object.assign(new Error('Claude se quedó sin tokens antes de terminar el JSON'), { code: 'model_max_tokens' });
  }

  // La respuesta puede empezar con bloques de razonamiento: se busca el texto
  // por tipo, no por posición.
  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');
  if (!text) throw Object.assign(new Error('Claude no devolvió texto'), { code: 'model_empty' });

  try {
    return { json: JSON.parse(text), usage: response.usage ?? null };
  } catch {
    throw Object.assign(new Error('Claude devolvió un JSON inválido'), { code: 'model_bad_json' });
  }
}
