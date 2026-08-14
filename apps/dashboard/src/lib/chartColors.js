/* Colores de SERIE — los que distinguen categorías dentro de un mismo gráfico.
   No son los mismos que los colores decorativos de las tarjetas.

   Este trío está verificado, no elegido a ojo: separación con daltonismo
   ΔE 8.9 en el peor par adyacente (protan) y ΔE 19.8 con visión normal, muy por
   encima del piso de 15. El par --color-orange / --color-gold, en cambio, da
   ΔE 6.2 con visión normal: son indistinguibles y no pueden ser dos series del
   mismo gráfico.

   Los tres quedan por debajo de 3:1 de contraste contra el fondo claro, así que
   todo gráfico que los use tiene que traer etiquetas visibles (leyenda con
   texto y número) — nunca identidad por color solo. */
export const CHART_COLORS = {
  good: '#10B981',    // --color-forest
  warning: '#F59E0B', // --color-gold
  bad: '#EF4444',     // --color-danger
  brand: '#F58529',   // --color-orange
};

/* Escalas de tres estados (promotores/pasivos/detractores,
   positivo/neutro/negativo): siempre en este orden, de mejor a peor. */
export const SCALE_3 = [CHART_COLORS.good, CHART_COLORS.warning, CHART_COLORS.bad];

/* Partición en dos categorías sin carga de valor (ninguna es "mejor" que la
   otra). Verificado: ΔE 10.4 con daltonismo protan, ΔE 25.9 con visión normal. */
export const SPLIT_2 = [CHART_COLORS.brand, CHART_COLORS.good];
