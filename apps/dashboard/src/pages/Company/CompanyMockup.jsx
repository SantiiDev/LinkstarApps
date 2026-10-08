import { useState } from 'react';
import PageHeader from '../../components/PageHeader/PageHeader';
import { lastNDayLabels } from '../../lib/dashboardApi';
import {
  CompanyToolbar, NegativeAlert, ReviewsKpi, SentimentKpi, RatingKpi, SeoKpi,
  StarGoalCard, ReviewsTrendCard, StarDistributionCard, LocationSummaryCard, RecentReviewsCard,
} from './CompanyBlocks';
import './Company.css';

/*
 * MAQUETA de Mi Empresa: TODOS LOS NÚMEROS Y NOMBRES SON INVENTADOS.
 *
 * Sólo se renderiza dentro de GoogleGate (ver Company.jsx), que la desenfoca, la
 * vuelve `inert` y la tapa con un modal que no se cierra: así se ve como una
 * muestra de la pantalla, nunca como datos del cliente. Renderizarla en otro
 * lugar rompe la regla de CLAUDE.md («nunca imprimir un número que no se
 * distinga de uno medido»).
 *
 * Usa los mismos bloques que la pantalla real (CompanyBlocks.jsx), así la
 * muestra es fiel. Los negocios y las personas son ficticios a propósito: ni
 * clientes reales ni sus reseñas.
 */

const LOCATIONS = [
  { value: 'all', label: 'Todos los locales' },
  { value: 'centro', label: 'Café Aurora · Centro' },
  { value: 'parque', label: 'Café Aurora · Parque' },
];

const SERIES = [0, 1, 0, 0, 2, 1, 0, 1, 0, 0, 1, 2, 0, 0, 1, 0, 1, 1, 0, 2, 0, 0, 1, 0, 1, 0, 0, 1, 1, 1];

const AVERAGE = { mean: 4.62, shown: 4.6, total: 128, sum: 4.62 * 128, exact: true, targets: [4.7, 4.8, 4.9, 5] };

const DISTRIBUTION = [
  { stars: 5, count: 12, pct: 67 },
  { stars: 4, count: 3, pct: 17 },
  { stars: 3, count: 1, pct: 6 },
  { stars: 2, count: 1, pct: 6 },
  { stars: 1, count: 1, pct: 6 },
];

const SUMMARY = [
  { id: 'centro', name: 'Café Aurora · Centro', linked: true, scans: 214, reviews: 11, answered: 9, answeredPct: 82, sentiment: 84, rating: 4.7 },
  { id: 'parque', name: 'Café Aurora · Parque', linked: true, scans: 137, reviews: 7, answered: 4, answeredPct: 57, sentiment: 71, rating: 4.5 },
];

const ago = (days) => new Date(Date.now() - days * 86400000).toISOString();
const RECENT = [
  { id: 'm1', reviewer_name: 'Martina R.', star_rating: 5, created_time: ago(1), comment: 'Muy buena atención y el café riquísimo. Volvemos seguro.', reply_comment: 'Gracias Martina!', google_locations: { locations: { name: 'Centro' } } },
  { id: 'm2', reviewer_name: 'Diego F.', star_rating: 2, created_time: ago(3), comment: 'Tardaron bastante en traer el pedido, una lástima porque el lugar es lindo.', reply_comment: null, google_locations: { locations: { name: 'Parque' } } },
  { id: 'm3', reviewer_name: 'Lucía M.', star_rating: 5, created_time: ago(6), comment: 'Las medialunas son las mejores de la zona.', reply_comment: 'Gracias!', google_locations: { locations: { name: 'Centro' } } },
  { id: 'm4', reviewer_name: 'Tomás B.', star_rating: 4, created_time: ago(9), comment: null, reply_comment: null, google_locations: { locations: { name: 'Parque' } } },
];

const noop = () => {};

export default function CompanyMockup() {
  const [target, setTarget] = useState(4.7);
  return (
    <div className="company-page">
      <PageHeader
        eyebrow="Panel general"
        title="Mi Empresa"
        subtitle="Resumen de tus locales y de lo que dicen tus clientes en Google"
      />
      <CompanyToolbar locationOptions={LOCATIONS} locationId="all" onLocation={noop} range="30" onRange={noop} />
      <NegativeAlert count={2} onRespond={noop} />
      <div className="kpi-grid">
        <ReviewsKpi
          data={{ value: 18, trend: { text: '+20%', direction: 'up' }, answered: 13, answeredPct: 72 }}
          caption="vs período anterior"
        />
        <SentimentKpi state={{ status: 'ok', value: 78, trend: { text: '+4 pts', direction: 'up' } }} caption="vs período anterior" onPlans={noop} />
        <RatingKpi data={{ value: 4.6, trend: { text: '+0,1', direction: 'up' } }} caption="vs período anterior" />
        <SeoKpi state={{ status: 'ok', summary: { score: 68, level: 'Bien posicionada', tone: 'good', count: 2 } }} onOpen={noop} />
      </div>
      <StarGoalCard average={AVERAGE} target={target} onTarget={setTarget} />
      <div className="company-two-col">
        <ReviewsTrendCard series={{ labels: lastNDayLabels(30), data: SERIES }} total={18} mode="count" onMode={noop} />
        <StarDistributionCard distribution={DISTRIBUTION} total={18} />
      </div>
      <LocationSummaryCard rows={SUMMARY} />
      <RecentReviewsCard items={RECENT} showLocation onViewAll={noop} />
    </div>
  );
}
