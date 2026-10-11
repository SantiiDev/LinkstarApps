import BusinessPitch from '../../components/BusinessPitch/BusinessPitch';
import { keywordSummary, strengthAndChallenge } from '../../lib/reviewInsights';
import { NpsKpis, NpsBreakdown, AspectList, AspectReviews } from './NpsBlocks';
import { SentimentDistribution, SentimentEvolution, SentimentKeywords, ComplaintsByLocation } from './SentimentBlocks';
import { KeywordsSummary, KeywordColumns, KeywordReviewsPanel } from './KeywordsBlocks';
import {
  SAMPLE_ASPECTS,
  SAMPLE_ATTENTION_REVIEWS,
  SAMPLE_COMPLAINTS,
  SAMPLE_COMPLAINTS_BY_LOCATION,
  SAMPLE_KEYWORDS,
  SAMPLE_NPS,
  SAMPLE_PRAISED,
  SAMPLE_SENTIMENT_COUNTS,
  SAMPLE_SENTIMENT_SERIES,
} from './reportsSample';
import '../GoogleBusiness/GoogleBusiness.css';
import '../GoogleBusiness/GoogleMetrics.css';
import './Reports.css';

/*
 * El modal de ventas de las tres secciones de Reportes (components/BusinessPitch),
 * con lo que cuenta cada una: 3 pasos en NPS, 3 en Sentimiento, 2 en Palabras
 * clave, como Tapstar. `children` es la maqueta de la sección, que va detrás.
 *
 * Los textos están adaptados de Tapstar a lo que hacemos de verdad. El paso 3 de
 * Sentimiento NO copia sus «temas resumidos por IA» («lo que les encanta / lo
 * que mejorarían»): eso no existe acá. Cuenta lo que la pantalla sí muestra.
 *
 * Las ilustraciones son los bloques reales de cada pantalla con datos
 * INVENTADOS (reportsSample.js), los mismos de la maqueta de atrás.
 */

const noop = () => {};
const { strength, challenge } = strengthAndChallenge(SAMPLE_ASPECTS);
const attentionTone = (id) => SAMPLE_ATTENTION_REVIEWS.tones[id];
const ATTENTION = SAMPLE_KEYWORDS.find((k) => k.term === 'atención');

const NPS_STEPS = [
  {
    title: 'Qué es el NPS',
    text: (
      <>
        Mide <strong>cuánta gente te recomendaría</strong>: los que hablan bien de vos menos los que hablan mal, de
        −100 a +100. Sale del <strong>texto de tus reseñas</strong>, así que no tenés que preguntarle nada a nadie.
      </>
    ),
    art: <NpsBreakdown nps={SAMPLE_NPS} />,
  },
  {
    title: 'Tu fortaleza y tu reto',
    text: 'Qué es lo que te hace recomendable y qué es lo que más te resta, con nombre y apellido.',
    art: <NpsKpis nps={SAMPLE_NPS} strength={strength} challenge={challenge} />,
  },
  {
    title: 'Y el NPS de cada aspecto',
    text: 'La atención, la espera, el precio, la limpieza… cada aspecto que mencionan, con su propio puntaje y las reseñas que hablan de él.',
    art: (
      <AspectList
        aspects={SAMPLE_ASPECTS.filter((a) => a.topic === 'atencion' || a.topic === 'ambiente')}
        openTopic="atencion"
        renderDetail={(aspect) => (
          <AspectReviews
            aspect={aspect}
            state={{ status: 'ok', items: SAMPLE_ATTENTION_REVIEWS.items }}
            toneOf={attentionTone}
            total={SAMPLE_ATTENTION_REVIEWS.items.length}
          />
        )}
      />
    ),
  },
];

const SENTIMENT_STEPS = [
  {
    title: 'Cada reseña, clasificada',
    text: (
      <>
        Positiva, neutra o negativa. <strong>Todas</strong> las que tienen texto, no una muestra, y sin que tengas que
        leerlas una por una.
      </>
    ),
    art: <SentimentDistribution counts={SAMPLE_SENTIMENT_COUNTS} />,
  },
  {
    title: 'La evolución, semana a semana',
    text: (
      <>
        Ves que el ánimo se tuerce <strong>antes de que se note en tu promedio de estrellas</strong>, que tarda meses
        en moverse.
      </>
    ),
    art: <SentimentEvolution series={SAMPLE_SENTIMENT_SERIES} mode="count" onMode={noop} />,
  },
  {
    title: 'Lo que elogian, lo que critican y dónde',
    text: 'Las palabras que más repiten según el tono con que las dicen y, si tenés varias sucursales, en cuál se concentran las quejas.',
    art: (
      <div className="reports-two-col reports-two-col--even">
        <SentimentKeywords keywords={SAMPLE_KEYWORDS} />
        <ComplaintsByLocation byLocation={SAMPLE_COMPLAINTS_BY_LOCATION} />
      </div>
    ),
  },
];

const KEYWORDS_STEPS = [
  {
    title: 'Lo que más gusta y lo que falla',
    text: (
      <>
        Dos listas sacadas de <strong>lo que escriben tus clientes</strong>, con cuánta gente repite cada cosa.
      </>
    ),
    art: (
      <div className="reports-stack">
        <KeywordsSummary text={keywordSummary(SAMPLE_PRAISED, SAMPLE_COMPLAINTS)} />
        <KeywordColumns praised={SAMPLE_PRAISED.slice(0, 5)} complaints={SAMPLE_COMPLAINTS} selected={null} onSelect={noop} />
      </div>
    ),
  },
  {
    title: 'De la palabra a quién la dijo',
    text: (
      <>
        Tocás una palabra y aparecen <strong>las reseñas que la mencionan</strong>, con la palabra resaltada. Del dato a
        la frase, en un clic.
      </>
    ),
    art: (
      <KeywordReviewsPanel
        keyword={ATTENTION}
        reviewCount={ATTENTION.count}
        state={{ status: 'ok', items: SAMPLE_ATTENTION_REVIEWS.items }}
        toneOf={attentionTone}
        page={0}
        pages={1}
        onPage={noop}
      />
    ),
  },
];

export function NpsPitch({ children }) {
  return (
    <BusinessPitch
      title="Tu NPS, sin mandarle una encuesta a nadie"
      description="El indicador que usan las grandes cadenas para saber cuánto las recomiendan, calculado con las reseñas que ya tenés."
      steps={NPS_STEPS}
    >
      {children}
    </BusinessPitch>
  );
}

export function SentimentPitch({ children }) {
  return (
    <BusinessPitch
      title="Qué sienten tus clientes, no sólo cuántas estrellas te ponen"
      description="Leemos cada reseña para que detectes rápido cualquier problema y lo resuelvas antes de que se note en tu puntaje."
      steps={SENTIMENT_STEPS}
    >
      {children}
    </BusinessPitch>
  );
}

export function KeywordsPitch({ children }) {
  return (
    <BusinessPitch
      title="Las palabras con las que tus clientes te describen"
      description="Detectá rápido qué no funciona: resolver un problema a tiempo evita reseñas negativas."
      steps={KEYWORDS_STEPS}
    >
      {children}
    </BusinessPitch>
  );
}
