/*
 * MAQUETA DECORATIVA — no es la pantalla, es el fondo.
 *
 * Se renderiza ÚNICAMENTE como `children` de `GoogleGate`, que la deja borrosa,
 * inerte y detrás de un modal que no se puede cerrar, y como ilustración inerte
 * de la landing pública (pages/Landing, LandingShot, sin sesión). NO agregar
 * otro importador: adentro del panel, fuera de esa puerta, es una pantalla
 * inventando datos.
 *
 * Es la pantalla real (GoogleSeoLocalScreen) dibujada con los mismos bloques
 * (GoogleSeoBlocks) y un análisis INVENTADO (googleSeoSample.js, que también
 * usa la landing) con la forma exacta que devuelve services/api/lib/seoAudit.js.
 * Así lo que se ve antes de conectar es lo que se ve después. «Búsquedas que no están en tu descripción» (Business) va abierta
 * aunque la cuenta sea gratis, sin candado: detrás del modal de Google la sección
 * se muestra como la ve una cuenta Business. El candado aparece recién en la
 * pantalla real.
 */

import PageHeader from '../../components/PageHeader/PageHeader';
import {
  MissingTermsCard,
  NextMission,
  Ranking,
  SeoCategories,
  SeoSummary,
  SeoToolbar,
} from './GoogleSeoBlocks';
import { nextMission } from './googleSeoModel';
import { SAMPLE_SEO_LOCATIONS as LOCATIONS, SAMPLE_SEO_MAIN as MAIN } from './googleSeoSample';
import './GoogleBusiness.css';
import './GoogleMetrics.css';
import './GoogleSeoLocal.css';

const MAIN_CATEGORY = MAIN.categories.find((c) => c.label === MAIN.worst);
const noop = () => {};

export default function GoogleSeoLocalMockup() {
  return (
    <div className="gb-page">
      <PageHeader
        eyebrow="SEO Local"
        title="Análisis SEO"
        subtitle="Qué tan completa está tu ficha de Google y qué cambiar para aparecer más en las búsquedas cercanas"
      />

      <SeoToolbar locations={LOCATIONS} selected={LOCATIONS[0]} onSelect={noop} onRefresh={noop} refreshing={false} />
      <SeoSummary selected={LOCATIONS[0]} />
      <NextMission mission={nextMission(MAIN)} onNavigateSection={noop} onShowCategory={noop} />
      <SeoCategories audit={MAIN} category={MAIN_CATEGORY} onCategory={noop} onNavigateSection={noop} />

      <MissingTermsCard
        terms={[
          { term: 'café de especialidad', impressions: 204 },
          { term: 'brunch', impressions: 152 },
          { term: 'medialunas', impressions: 64 },
        ]}
        onNavigateSection={noop}
      />

      <Ranking locations={LOCATIONS} selectedId="sample-1" onSelect={noop} />
    </div>
  );
}
