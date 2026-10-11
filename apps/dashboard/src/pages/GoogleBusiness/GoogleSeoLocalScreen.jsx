import { useCallback, useEffect, useState } from 'react';
import PageHeader from '../../components/PageHeader/PageHeader';
import GoogleConnect from '../../components/GoogleConnect/GoogleConnect';
import BusinessLock from '../../components/BusinessLock/BusinessLock';
import { useOrg } from '../../context/OrgContext';
import { fetchSeoAudit } from '../../lib/googleApi';
import {
  MissingTermsCard,
  MissingTermsPreview,
  NextMission,
  Ranking,
  SeoCategories,
  SeoSummary,
  SeoToolbar,
} from './GoogleSeoBlocks';
import { nextMission } from './googleSeoModel';
import { MISSING_TERMS_LOCK } from './businessLocks';
import './GoogleBusiness.css';
import './GoogleMetrics.css';
import './GoogleSeoLocal.css';

/*
 * Análisis SEO — la pantalla real de SEO Local (fase 4.8).
 *
 * El puntaje lo calcula el API sobre la ficha en vivo (services/api/lib/
 * seoAudit.js): seis categorías que suman 100, cada punto atado a un dato que
 * el cliente puede corregir. Google no publica un «puntaje de SEO local»; este
 * es nuestro y la pantalla lo dice. La estructura sigue a la de Tapstar: el
 * puntaje con cuánto falta para el próximo nivel, la próxima misión (la tarea
 * que más suma), las categorías con lo pendiente de la elegida y su botón, lo
 * que ya se cumple aparte, y el ranking entre sucursales.
 *
 * Pendiente a futuro: la evolución del puntaje («+N este mes»). Necesita guardar
 * el puntaje de cada ficha por día —una tabla que escriba el job diario, unos 4
 * pedidos a Google por ficha—; hoy el análisis se calcula en vivo y no queda.
 *
 * Gratis ve el análisis entero. Business suma «Búsquedas que no están en tu
 * descripción», que sale de las palabras de búsqueda de Google (Business, 0029);
 * en gratis esa tarjeta va detrás de BusinessLock con datos inventados.
 *
 * Lo que es sólo presentación vive en GoogleSeoBlocks, compartido con la maqueta
 * de GoogleGate (GoogleSeoLocalMockup).
 */

const header = (
  <PageHeader
    eyebrow="SEO Local"
    title="Análisis SEO"
    subtitle="Qué tan completa está tu ficha de Google y qué cambiar para aparecer más en las búsquedas cercanas"
  />
);

export default function GoogleSeoLocalScreen({ google, onNavigateSection }) {
  const { org } = useOrg();
  const orgId = org?.organization_id;
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [categoryId, setCategoryId] = useState(null);

  const load = useCallback(async (fresh = false) => {
    if (!orgId) return;
    setError(null);
    if (fresh) setRefreshing(true);
    try {
      const result = await fetchSeoAudit(orgId, { fresh });
      setData(result);
    } catch (err) {
      console.error('No se pudo cargar el análisis SEO:', err);
      setError(err.message || 'No pudimos analizar tu ficha. Probá recargar la página.');
    } finally {
      setRefreshing(false);
    }
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  const locations = data?.locations ?? [];
  const selected = locations.find((l) => l.googleLocationId === selectedId) ?? locations[0] ?? null;
  const audit = selected?.audit ?? null;

  // Al cambiar de ficha, se abre en su categoría más floja (la misma que el
  // ranking marca «A mejorar», con el mismo desempate: más puntos por ganar).
  useEffect(() => {
    if (!audit) return;
    const weakest = audit.categories.find((c) => c.label === audit.worst);
    setCategoryId(weakest?.id ?? audit.categories[0].id);
  }, [audit]);

  const reauthNotice = google.connection?.status === 'needs_reauth' && (
    <div className="gbm-notice">
      <p>Google cortó el acceso a tu ficha. El análisis se hace sobre la ficha en vivo, así que hace falta volver a conectarla.</p>
      <GoogleConnect google={google} align="start" />
    </div>
  );

  if (error) {
    return (
      <div className="gb-page">
        {header}
        {reauthNotice}
        <p className="gbm-error" role="alert">{error}</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="gb-page">
        {header}
        <p className="gbm-muted">Analizando tu ficha en Google…</p>
      </div>
    );
  }
  if (!locations.length) {
    return (
      <div className="gb-page">
        {header}
        {reauthNotice}
        <div className="gb-card gbm-empty">
          <p className="gbm-empty__title">Todavía no vinculaste ninguna ficha a una sucursal</p>
          <p>El análisis se hace sobre las fichas vinculadas. Elegí cuál de tus fichas corresponde a cada sucursal.</p>
          {onNavigateSection && (
            <button type="button" className="gb-btn-primary" onClick={() => onNavigateSection('settings-local')}>
              Vincular en Gestión local
            </button>
          )}
        </div>
      </div>
    );
  }

  const category = audit?.categories.find((c) => c.id === categoryId) ?? audit?.categories[0];

  return (
    <div className="gb-page">
      {header}

      <SeoToolbar
        locations={locations}
        selected={selected}
        onSelect={setSelectedId}
        onRefresh={() => load(true)}
        refreshing={refreshing}
      />

      {reauthNotice}
      {selected.error && <p className="gbm-error" role="alert">{selected.error}</p>}

      {audit && category && (
        <>
          <SeoSummary selected={selected} />
          <NextMission mission={nextMission(audit)} onNavigateSection={onNavigateSection} onShowCategory={setCategoryId} />
          <SeoCategories audit={audit} category={category} onCategory={setCategoryId} onNavigateSection={onNavigateSection} />

          <BusinessLock {...MISSING_TERMS_LOCK} preview={<MissingTermsPreview />}>
            <MissingTermsCard terms={selected.missingSearchTerms} onNavigateSection={onNavigateSection} />
          </BusinessLock>
        </>
      )}

      {locations.filter((l) => l.audit).length > 1 && (
        <Ranking locations={locations} selectedId={selected.googleLocationId} onSelect={setSelectedId} />
      )}
    </div>
  );
}
