/*
 * Las tarjetas Business de Métricas, cada una detrás de su BusinessLock.
 *
 * `MetricsBusinessCards` recibe las tarjetas reales como props y las envuelve:
 * con Business se ven ésas; en gratis, la maqueta de cada una (las `*Preview` de
 * abajo), desenfocada bajo su candado. La usan la pantalla real
 * (GoogleMetricsScreen) y la maqueta de GoogleGate (GoogleMetricsMockup), que le
 * pasa las mismas maquetas como si fueran las reales y sin candados
 * (`locked={false}`): detrás del modal de Google la sección se ve como la ve
 * una cuenta Business, también en gratis.
 *
 * LAS `*Preview` SON MAQUETAS DECORATIVAS, con números INVENTADOS
 * (googleMetricsSample.js). Se renderizan ÚNICAMENTE como `preview` de
 * components/BusinessLock o dentro de GoogleMetricsMockup (detrás de GoogleGate):
 * las dos puertas las dejan borrosas, inertes y bajo un velo que no se cierra.
 * NO agregar otro importador: fuera de esas puertas son una pantalla inventando
 * datos (CLAUDE.md).
 *
 * Usan los mismos bloques que la pantalla real (GoogleMetricsBlocks). Nunca se
 * arman con los datos del cliente: lo Business de una cuenta gratis ni siquiera
 * llega al navegador (0029).
 */
import BusinessLock from '../../components/BusinessLock/BusinessLock';
import {
  ConversionBlock, PlatformsBlock, PlatformsCompareBlock, KeywordsBlock, MetricsInsights,
} from './GoogleMetricsBlocks';
import { buildInsights } from './googleMetricsModel';
import { METRICS_LOCKS } from './businessLocks';
import { SAMPLE_CUR, SAMPLE_PREV, SAMPLE_KEYWORDS, SAMPLE_PREV_KEYWORDS, SAMPLE_MONTHS } from './googleMetricsSample';

const noop = () => {};

export function ConversionPreview() {
  return <ConversionBlock cur={SAMPLE_CUR} prev={SAMPLE_PREV} />;
}

export function PlatformsPreview() {
  return (
    <div className="gb-two-col gbm-row">
      <PlatformsBlock cur={SAMPLE_CUR} />
      <PlatformsCompareBlock cur={SAMPLE_CUR} prev={SAMPLE_PREV} />
    </div>
  );
}

export function KeywordsPreview() {
  return (
    <KeywordsBlock
      months={SAMPLE_MONTHS}
      month={SAMPLE_MONTHS[0].value}
      onMonth={noop}
      rows={SAMPLE_KEYWORDS}
      prevRows={SAMPLE_PREV_KEYWORDS}
      error={null}
    />
  );
}

export function InsightsPreview() {
  return <MetricsInsights items={buildInsights(SAMPLE_CUR, SAMPLE_PREV)} />;
}

/* Un solo candado sobre las dos tarjetas de plataformas, como Tapstar.
   `locked={false}`: sin candados, como las ve una cuenta Business. Lo usa sólo
   la maqueta de GoogleGate, que es una vidriera de la sección. */
export function MetricsBusinessCards({ conversion, platforms, keywords, insights, locked = true }) {
  const lock = (copy, preview, card) => (locked
    ? <BusinessLock {...copy} preview={preview}>{card}</BusinessLock>
    : card);
  return (
    <>
      <div className="gbm-section">{lock(METRICS_LOCKS.conversion, <ConversionPreview />, conversion)}</div>
      <div className="gbm-section">{lock(METRICS_LOCKS.platforms, <PlatformsPreview />, platforms)}</div>
      <div className="gbm-section">{lock(METRICS_LOCKS.keywords, <KeywordsPreview />, keywords)}</div>
      <div className="gbm-section">{lock(METRICS_LOCKS.insights, <InsightsPreview />, insights)}</div>
    </>
  );
}
