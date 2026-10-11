/*
 * Métricas de la ficha, sin componentes: qué métricas hay, los rangos y las
 * sugerencias de «Qué dicen tus métricas» (los candados, en businessLocks.js). Lo
 * usan la pantalla real (GoogleMetricsScreen), sus bloques (GoogleMetricsBlocks)
 * y sus maquetas, así todas dicen lo mismo. Va aparte de los bloques porque un
 * archivo de componentes que además exporta constantes rompe el Fast Refresh.
 */

const NUM = new Intl.NumberFormat('es-AR');
const PCT_SHORT = new Intl.NumberFormat('es-AR', { style: 'percent', maximumFractionDigits: 1 });

/* ─── Las cuatro métricas de la ficha ────────────────────────────────────── */

export const METRICS = [
  { key: 'impressions', label: 'Impresiones', color: 'navy', icon: 'eye' },
  { key: 'call_clicks', label: 'Clics en Llamar', color: 'forest', icon: 'phone' },
  { key: 'direction_requests', label: 'Clics en «Cómo llegar»', color: 'orange', icon: 'pin' },
  { key: 'website_clicks', label: 'Clics a la web', color: 'gold', icon: 'globe' },
];

export const METRICS_RANGES = [
  { value: '7', label: 'Últimos 7 días' },
  { value: '30', label: 'Últimos 30 días' },
  { value: '90', label: 'Últimos 90 días' },
];

/* «Qué dicen tus métricas»: reglas simples sobre los números del período. No es
   IA ni pretende serlo: cada frase sale de una comparación que se puede rehacer
   a mano con los números de arriba. `prev` puede venir en cero (sin período
   anterior): las reglas que comparan simplemente no se cumplen. */
export function buildInsights(cur, prev) {
  const out = [];
  const convCur = cur.impressions ? cur.interactions / cur.impressions : 0;
  const convPrev = prev.impressions ? prev.interactions / prev.impressions : 0;

  if (prev.impressions && cur.impressions >= prev.impressions * 1.1) {
    out.push({
      title: 'Te encuentran más que antes',
      text: `Tu ficha apareció ${NUM.format(cur.impressions)} veces, ${Math.round((cur.impressions / prev.impressions - 1) * 100)}% más que el período anterior. Mantené fotos y horarios al día para aprovecharlo.`,
    });
  } else if (prev.impressions && cur.impressions <= prev.impressions * 0.9) {
    out.push({
      title: 'Te están viendo menos',
      text: 'Las impresiones bajaron frente al período anterior. Publicar novedades y responder reseñas ayuda a que Google te muestre más.',
    });
  }
  if (prev.impressions && convPrev && convCur < convPrev * 0.85) {
    out.push({
      title: 'Te ven, pero te eligen menos',
      text: `De cada 100 personas que ven tu ficha, ${(convCur * 100).toFixed(1).replace('.', ',')} hacen algo (antes ${(convPrev * 100).toFixed(1).replace('.', ',')}). Revisá que el teléfono, la web y el horario estén completos.`,
    });
  }
  if (cur.impressions > 0 && cur.website_clicks === 0) {
    out.push({
      title: 'Nadie entró a tu web desde Google',
      text: 'Si tu ficha no tiene el sitio web cargado, agregalo desde Perfil: es uno de los tres botones que más se tocan.',
    });
  }
  const mobile = cur.impressions_mobile_maps + cur.impressions_mobile_search;
  if (cur.impressions > 0 && mobile / cur.impressions >= 0.7) {
    out.push({
      title: 'Te buscan desde el celular',
      text: `${PCT_SHORT.format(mobile / cur.impressions)} de las veces que apareciste fue en un celular: el botón de llamar y «Cómo llegar» son los que más pesan ahí.`,
    });
  }
  if (!out.length) {
    out.push({
      title: 'Todo estable',
      text: 'No vemos cambios fuertes respecto del período anterior. Seguí respondiendo reseñas y publicando novedades.',
    });
  }
  return out.slice(0, 4);
}

