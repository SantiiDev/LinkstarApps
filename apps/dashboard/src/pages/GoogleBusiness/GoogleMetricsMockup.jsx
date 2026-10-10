/*
 * MAQUETA DECORATIVA — no es la pantalla, es el fondo.
 *
 * Se renderiza ÚNICAMENTE como `children` de `GoogleGate`, que la deja borrosa,
 * inerte y detrás de un modal que no se puede cerrar. NO agregar otro
 * importador: fuera de esa puerta es una pantalla inventando datos.
 *
 * Es la pantalla real (GoogleMetricsScreen) dibujada con los mismos bloques
 * (GoogleMetricsBlocks) y números INVENTADOS (googleMetricsSample.js), así lo
 * que se ve antes de conectar es lo que se ve después. Las tarjetas Business van
 * abiertas aunque la cuenta sea gratis, sin candados ni llamados a pasarse de
 * plan: detrás del modal de Google la sección se muestra como la ve una cuenta
 * Business. El candado aparece recién en la pantalla real.
 */

import PageHeader from '../../components/PageHeader/PageHeader';
import { MetricsToolbar, MetricsKpis, MetricsTrends } from './GoogleMetricsBlocks';
import { METRICS, METRICS_RANGES } from './googleMetricsModel';
import {
  MetricsBusinessCards,
  ConversionPreview,
  PlatformsPreview,
  KeywordsPreview,
  InsightsPreview,
} from './GoogleMetricsBusinessPreview';
import { SAMPLE_CUR, SAMPLE_PREV, sampleSeries, sampleLabels } from './googleMetricsSample';
import './GoogleBusiness.css';
import './GoogleMetrics.css';

const noop = () => {};

export default function GoogleMetricsMockup() {
  return (
    <div className="gb-page">
      <PageHeader
        eyebrow="Google Business"
        title="Métricas del perfil"
        subtitle="Cómo te encuentran y qué hacen los clientes en tu ficha de Google"
      />

      <MetricsToolbar
        locationId="all"
        onLocation={noop}
        locationOptions={[{ value: 'all', label: 'Todos los locales' }]}
        range="30"
        onRange={noop}
        rangeOptions={METRICS_RANGES}
        note="Google publica las métricas con unos días de atraso, así que el período llega hasta hace 4 días."
      />

      <MetricsKpis cur={SAMPLE_CUR} prev={SAMPLE_PREV} />
      <MetricsTrends series={sampleSeries(METRICS.map((m) => m.key))} labels={sampleLabels()} hasPrevious />

      <MetricsBusinessCards
        conversion={<ConversionPreview />}
        platforms={<PlatformsPreview />}
        keywords={<KeywordsPreview />}
        insights={<InsightsPreview />}
        locked={false}
      />
    </div>
  );
}
