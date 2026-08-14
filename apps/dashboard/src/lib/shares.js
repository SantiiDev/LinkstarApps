/* Reparte porcentajes enteros que suman exactamente 100 (método del resto
   mayor). Redondear cada parte por separado con Math.round da sumas de 99 o
   101 según los datos, y en un gráfico que se presenta como "el total de tus
   reseñas" eso se lee como un error de cálculo.

   El parche habitual —calcular la última parte como `100 - las otras`— es peor:
   esconde todo el error de redondeo en una sola categoría, y con datos chicos
   puede llegar a darle un porcentaje negativo. */
export function sharesOf(counts) {
  const total = counts.reduce((sum, c) => sum + c, 0);
  if (total === 0) return counts.map(() => 0);

  const exact = counts.map((c) => (c / total) * 100);
  const floors = exact.map(Math.floor);
  let left = 100 - floors.reduce((sum, f) => sum + f, 0);

  // Los puntos sobrantes van a las partes con mayor resto decimal.
  const order = exact
    .map((v, i) => ({ i, rest: v - floors[i] }))
    .sort((a, b) => b.rest - a.rest);

  const out = [...floors];
  for (let k = 0; k < order.length && left > 0; k++, left--) out[order[k].i] += 1;
  return out;
}
