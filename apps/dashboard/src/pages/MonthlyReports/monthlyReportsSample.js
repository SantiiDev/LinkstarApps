/*
 * DATOS INVENTADOS de Informes mensuales. Sólo los usan la maqueta
 * (MonthlyReportsMockup) y el modal de ventas (MonthlyReportsPitch), que se ven
 * borrosos, inertes y detrás de BusinessPitch. Nunca la pantalla real: una cuenta
 * Business ve sus locales con «0 informes», no estos.
 *
 * El negocio es el mismo de las otras maquetas (Café del Parque, Rosario).
 */

const report = (id, month, generated, expires) => ({ id, month, generated, expires });

export const SAMPLE_BRAND = {
  id: 'brand',
  name: 'Café del Parque',
  subtitle: 'Toda tu marca · los 3 locales juntos',
  reports: [
    report('b-sep', 'Septiembre 2026', '5 oct', '5 oct 2027'),
    report('b-ago', 'Agosto 2026', '5 sept', '5 sept 2027'),
  ],
};

export const SAMPLE_LOCATIONS = [
  {
    id: 'centro',
    name: 'Café del Parque · Centro',
    subtitle: 'Rosario',
    reports: [
      report('c-sep', 'Septiembre 2026', '5 oct', '5 oct 2027'),
      report('c-ago', 'Agosto 2026', '5 sept', '5 sept 2027'),
    ],
  },
  {
    id: 'fisherton',
    name: 'Café del Parque · Fisherton',
    subtitle: 'Rosario',
    reports: [report('f-sep', 'Septiembre 2026', '5 oct', '5 oct 2027')],
  },
  { id: 'pichincha', name: 'Café del Parque · Pichincha', subtitle: 'Rosario', reports: [] },
];

export const SAMPLE_RECIPIENTS = ['sofia@cafedelparque.com.ar', 'martin@cafedelparque.com.ar', 'contador@estudiorios.com.ar'];

/* La primera hoja del informe de septiembre del local Centro (paso 2 del modal). */
export const SAMPLE_REPORT_PAGE = {
  location: 'Café del Parque · Centro',
  month: 'Septiembre 2026',
  kpis: [
    { label: 'Reseñas nuevas', value: '23', trend: '+5 vs. agosto' },
    { label: 'Promedio del mes', value: '4,7 ★', trend: '+0,1' },
    { label: 'Escaneos', value: '412', trend: '+18%' },
    { label: 'Apariciones en Google', value: '6.840', trend: '+9%' },
  ],
};
