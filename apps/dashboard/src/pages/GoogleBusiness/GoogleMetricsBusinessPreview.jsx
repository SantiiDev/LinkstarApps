/*
 * MAQUETAS DECORATIVAS — no son datos, son el fondo de BusinessLock.
 *
 * Cada una dibuja una tarjeta Business de Métricas con números INVENTADOS, para
 * que una cuenta gratis vea de qué se trata. Se renderizan ÚNICAMENTE como
 * `preview` de components/BusinessLock, que las deja borrosas, inertes y bajo un
 * velo que no se cierra. NO agregar otro importador: fuera de esa puerta son una
 * pantalla inventando datos (CLAUDE.md).
 *
 * Usan los mismos bloques que la pantalla real (GoogleMetricsBlocks), así la
 * maqueta es la tarjeta de verdad con otros números. Los números son coherentes
 * entre sí (las plataformas suman las impresiones, los canales las
 * interacciones), para que nada se lea raro debajo del desenfoque.
 *
 * Nunca se arman con los datos del cliente: lo Business de una cuenta gratis ni
 * siquiera llega al navegador (0029).
 */
import { closedMonthOptions } from '../../lib/googleApi';
import { ConversionBlock, PlatformsBlock, PlatformsCompareBlock, KeywordsBlock } from './GoogleMetricsBlocks';

const CUR = {
  impressions: 30568, interactions: 3692,
  direction_requests: 941, website_clicks: 2257, call_clicks: 494,
  impressions_mobile_search: 8420, impressions_desktop_search: 3120,
  impressions_mobile_maps: 16310, impressions_desktop_maps: 2718,
};

const PREV = {
  impressions: 28400, interactions: 3690,
  direction_requests: 905, website_clicks: 2265, call_clicks: 520,
  impressions_mobile_search: 7900, impressions_desktop_search: 3300,
  impressions_mobile_maps: 14600, impressions_desktop_maps: 2600,
};

const keyword = (term, impressions) => ({ keyword: term, impressions, threshold: null });
const smallKeyword = (term) => ({ keyword: term, impressions: null, threshold: 15 });

const KEYWORDS = [
  keyword('cafetería', 1240), keyword('cafetería cerca de mí', 486), keyword('desayunos', 318),
  keyword('café de especialidad', 204), keyword('brunch', 152), keyword('café para llevar', 97),
  keyword('medialunas', 64), keyword('cafetería con patio', 41), keyword('desayunos palermo', 29),
  keyword('café de especialidad palermo', 18), smallKeyword('merienda'), smallKeyword('tostado de jamón y queso'),
];

const PREV_KEYWORDS = [
  keyword('cafetería', 1105), keyword('cafetería cerca de mí', 402), keyword('desayunos', 342),
  keyword('café de especialidad', 150), keyword('brunch', 118), keyword('café para llevar', 101),
  keyword('cafetería con patio', 38), keyword('desayunos palermo', 22), keyword('café de especialidad palermo', 16),
  smallKeyword('merienda'),
];

const MONTHS = closedMonthOptions();
const noop = () => {};

export function ConversionPreview() {
  return <ConversionBlock cur={CUR} prev={PREV} />;
}

export function PlatformsPreview() {
  return (
    <div className="gb-two-col gbm-row">
      <PlatformsBlock cur={CUR} />
      <PlatformsCompareBlock cur={CUR} prev={PREV} />
    </div>
  );
}

export function KeywordsPreview() {
  return (
    <KeywordsBlock
      months={MONTHS}
      month={MONTHS[0].value}
      onMonth={noop}
      rows={KEYWORDS}
      prevRows={PREV_KEYWORDS}
      error={null}
    />
  );
}

export function InsightsPreview() {
  return (
    <div className="gb-card">
      <div className="gb-card__header">
        <div>
          <h3 className="gb-card__title">Qué dicen tus métricas</h3>
          <span className="gb-card__subtitle">Sugerencias a partir de tus números</span>
        </div>
      </div>
      <ul className="gbm-insights">
        <li><strong>Te encuentran más que antes</strong><span>Tu ficha apareció 30.568 veces, 8% más que el período anterior.</span></li>
        <li><strong>Te buscan desde el celular</strong><span>81% de las veces fue en un celular: el botón de llamar pesa más.</span></li>
        <li><strong>Revisá tu web</strong><span>Pocos entran a tu sitio desde la ficha.</span></li>
      </ul>
    </div>
  );
}
