/*
 * DATOS INVENTADOS de Métricas — los usan sólo las maquetas (GoogleMetricsMockup,
 * detrás de GoogleGate, y GoogleMetricsBusinessPreview, detrás de BusinessLock).
 * Nunca se mezclan con datos del cliente.
 *
 * Son coherentes entre sí, para que nada se lea raro debajo del desenfoque: las
 * plataformas suman las impresiones, los canales suman las interacciones y las
 * series diarias suman los totales.
 */
import { closedMonthOptions } from '../../lib/googleApi';

export const SAMPLE_DAYS = 30;

export const SAMPLE_CUR = {
  impressions: 30568, interactions: 3692,
  direction_requests: 941, website_clicks: 2257, call_clicks: 494,
  impressions_mobile_search: 8420, impressions_desktop_search: 3120,
  impressions_mobile_maps: 16310, impressions_desktop_maps: 2718,
};

export const SAMPLE_PREV = {
  impressions: 28400, interactions: 3690,
  direction_requests: 905, website_clicks: 2265, call_clicks: 520,
  impressions_mobile_search: 7900, impressions_desktop_search: 3300,
  impressions_mobile_maps: 14600, impressions_desktop_maps: 2600,
};

const keyword = (term, impressions) => ({ keyword: term, impressions, threshold: null });
const smallKeyword = (term) => ({ keyword: term, impressions: null, threshold: 15 });

export const SAMPLE_KEYWORDS = [
  keyword('cafetería', 1240), keyword('cafetería cerca de mí', 486), keyword('desayunos', 318),
  keyword('café de especialidad', 204), keyword('brunch', 152), keyword('café para llevar', 97),
  keyword('medialunas', 64), keyword('cafetería con patio', 41), keyword('desayunos palermo', 29),
  keyword('café de especialidad palermo', 18), smallKeyword('merienda'), smallKeyword('tostado de jamón y queso'),
];

export const SAMPLE_PREV_KEYWORDS = [
  keyword('cafetería', 1105), keyword('cafetería cerca de mí', 402), keyword('desayunos', 342),
  keyword('café de especialidad', 150), keyword('brunch', 118), keyword('café para llevar', 101),
  keyword('cafetería con patio', 38), keyword('desayunos palermo', 22), keyword('café de especialidad palermo', 16),
  smallKeyword('merienda'),
];

export const SAMPLE_MONTHS = closedMonthOptions();

/* Reparte `total` en `days` días con una forma creíble (fines de semana más
   altos, algo de ruido fijo) y sin perder unidades al redondear: la serie suma
   exactamente el total. `phase` corre la forma para que el período anterior no
   sea una copia del actual. */
function spread(total, days, phase = 0) {
  const weights = Array.from({ length: days }, (_, i) => {
    const weekday = (i + phase) % 7;
    const weekend = weekday >= 5 ? 1.35 : 1;
    return weekend * (1 + 0.18 * Math.sin((i + phase) * 1.7) + 0.08 * Math.cos((i + phase) * 0.6));
  });
  const sum = weights.reduce((a, b) => a + b, 0);
  const out = weights.map((w) => Math.floor((w / sum) * total));
  let rest = total - out.reduce((a, b) => a + b, 0);
  for (let i = 0; rest > 0; i = (i + 1) % days, rest -= 1) out[i] += 1;
  return out;
}

export function sampleSeries(keys) {
  return Object.fromEntries(keys.map((key) => [key, {
    cur: spread(SAMPLE_CUR[key], SAMPLE_DAYS, 2),
    prev: spread(SAMPLE_PREV[key], SAMPLE_DAYS, 4),
  }]));
}

/* Las etiquetas del eje: los últimos 30 días hasta hace 4 (el atraso de Google). */
export function sampleLabels() {
  const end = new Date();
  end.setDate(end.getDate() - 4);
  return Array.from({ length: SAMPLE_DAYS }, (_, i) => {
    const d = new Date(end);
    d.setDate(end.getDate() - (SAMPLE_DAYS - 1 - i));
    return `${d.getDate()}/${d.getMonth() + 1}`;
  });
}
