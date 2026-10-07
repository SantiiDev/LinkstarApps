/* Cliente mínimo de la API de Gemini (generateContent) — fase 5.
 *
 * Una sola cosa: mandar un texto con instrucciones y un esquema, y devolver el
 * JSON que el modelo respondió. Sin SDK: es una llamada HTTP, y así no se suma
 * una dependencia por una función.
 *
 * La clave va en el header x-goog-api-key, nunca en la URL (las URLs terminan
 * en logs). GEMINI_API_KEY es opcional para el servicio: sin ella
 * isGeminiConfigured() da false y quien llama se saltea el análisis.
 *
 * Reintenta 429 y 5xx con espera creciente. Generar un análisis es idempotente
 * (lo que se guarda se pisa por review_id), así que reintentar no duplica nada —
 * distinto de googleRequest(), que no reintenta un POST porque publicaría dos
 * veces.
 */

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 4;

// Se lee al llamar y no al importar: así no depende de que dotenv haya cargado
// antes que este módulo.
export function geminiModel() {
  return process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
}

export function isGeminiConfigured() {
  return Boolean(process.env.GEMINI_API_KEY);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function generateJson({ system, prompt, schema, model = geminiModel() }) {
  if (!isGeminiConfigured()) throw new Error('GEMINI_API_KEY no está configurada');

  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: schema,
      temperature: 0,
    },
  });

  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let response;
    try {
      response = await fetch(`${BASE_URL}/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      lastError = new Error(`Gemini no respondió: ${err.message}`);
      if (attempt < MAX_ATTEMPTS) await sleep(1000 * 2 ** attempt);
      continue;
    }

    const data = await response.json().catch(() => ({}));
    if (response.ok) {
      const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
      if (!text) {
        // Sin candidato: el modelo bloqueó la respuesta (p. ej. por seguridad).
        // No se reintenta: con temperatura 0 va a volver a pasar lo mismo.
        const reason = data.promptFeedback?.blockReason ?? data.candidates?.[0]?.finishReason ?? 'sin texto';
        throw Object.assign(new Error(`Gemini no devolvió respuesta (${reason})`), { code: 'gemini_empty' });
      }
      try {
        return { json: JSON.parse(text), usage: data.usageMetadata ?? null };
      } catch {
        throw Object.assign(new Error('Gemini devolvió un JSON inválido'), { code: 'gemini_bad_json' });
      }
    }

    lastError = Object.assign(
      new Error(`Gemini respondió ${response.status}: ${data.error?.message ?? 'sin detalle'}`),
      { status: response.status }
    );
    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable) throw lastError;
    if (attempt < MAX_ATTEMPTS) await sleep(1000 * 2 ** attempt);
  }
  throw lastError;
}
