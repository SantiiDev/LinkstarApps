import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { recall, remember } from '../../lib/viewMemory';
import { fetchLocationPerformance, fetchLocationScanTotals } from '../../lib/dashboardApi';
import {
  fetchGoogleLocations,
  fetchReviewRows,
  fetchReviewAnalysis,
  fetchReviews,
  fetchSeoAudit,
} from '../../lib/googleApi';

const RECENT_LIMIT = 8;

/* La carga de Mi Empresa, en cuatro partes que no se esperan entre sí:
 *
 *   - base: sucursales, fichas, todas las reseñas (sin texto) y, en Business, su
 *     análisis. Los filtros de sucursal y período se aplican en el cliente sobre
 *     esto, así que cambiar un filtro no vuelve a pedirlo.
 *   - escaneos por sucursal: dependen del rango, se piden cuando cambia.
 *   - últimas reseñas (con texto): dependen de la sucursal.
 *   - Análisis SEO: lee Google en vivo a través del API y puede tardar varios
 *     segundos, así que va aparte y la tarjeta muestra «Calculando…» mientras.
 *
 * Un fallo en las tres últimas no tumba la pantalla: su bloque dice que no se
 * pudo medir. Un fallo en la base sí, porque sin reseñas no hay pantalla.
 *
 * ── Lo último que se vio queda recordado ──────────────────────────────────
 * Mi Empresa es la pantalla a la que más se vuelve. Sin recuerdo, cada vez que
 * se entraba desde otra sección arrancaba en blanco con el esqueleto de carga y
 * el SEO volvía a «Calculando…». Ahora cada parte se guarda en memoria
 * (lib/viewMemory.js) y al volver se muestra al instante mientras se relee por
 * detrás; si la relectura falla, se queda lo que había. */
const EMPTY_BASE = { loading: true, error: null, locations: [], fichas: [], reviewRows: [], analysis: null, analysisFailed: false };

export function useCompanyOverview(orgId, { isBusiness, scanSince, locationId }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const baseKey = `company:base:${orgId}:${isBusiness}`;
  const scansKey = `company:scans:${orgId}:${scanSince}`;
  const recentKey = `company:recent:${orgId}:${locationId}`;
  const seoKey = `company:seo:${orgId}`;

  const [base, setBase] = useState(() => recall(userId, baseKey) ?? EMPTY_BASE);
  const [scans, setScans] = useState(() => recall(userId, scansKey) ?? { totals: null, failed: false });
  const [recent, setRecent] = useState(() => recall(userId, recentKey) ?? { items: null, failed: false });
  const [seo, setSeo] = useState(() => recall(userId, seoKey) ?? { data: null, loading: true, failed: false });

  useEffect(() => {
    if (!orgId) return undefined;
    let cancelled = false;
    const known = recall(userId, baseKey);
    setBase(known ?? EMPTY_BASE);
    // El análisis va con su propio catch: si falta la 0033 en el entorno, o la
    // vista falla, el resto de la pantalla igual se muestra.
    const analysisPromise = isBusiness
      ? fetchReviewAnalysis(orgId).catch((err) => {
        console.error('No se pudo cargar el análisis de reseñas:', err);
        return undefined;
      })
      : Promise.resolve(null);
    Promise.all([fetchLocationPerformance(orgId), fetchGoogleLocations(orgId), fetchReviewRows(orgId), analysisPromise])
      .then(([locations, fichas, reviewRows, analysis]) => {
        const next = {
          loading: false,
          error: null,
          locations,
          fichas,
          reviewRows,
          analysis: analysis ?? null,
          analysisFailed: analysis === undefined,
        };
        remember(baseKey, next);
        if (!cancelled) setBase(next);
      })
      .catch((err) => {
        console.error('No se pudo cargar el resumen de la empresa:', err);
        // Con algo ya mostrado, una relectura fallida no lo reemplaza por un error.
        if (!cancelled && !known) setBase({ ...EMPTY_BASE, loading: false, error: err });
      });
    return () => { cancelled = true; };
  }, [orgId, isBusiness, userId, baseKey]);

  useEffect(() => {
    if (!orgId) return undefined;
    let cancelled = false;
    const known = recall(userId, scansKey);
    setScans(known ?? { totals: null, failed: false });
    fetchLocationScanTotals(orgId, scanSince)
      .then((totals) => {
        const next = { totals, failed: false };
        remember(scansKey, next);
        if (!cancelled) setScans(next);
      })
      .catch((err) => {
        console.error('No se pudieron cargar los escaneos por sucursal:', err);
        if (!cancelled && !known) setScans({ totals: null, failed: true });
      });
    return () => { cancelled = true; };
  }, [orgId, scanSince, userId, scansKey]);

  useEffect(() => {
    if (!orgId) return undefined;
    let cancelled = false;
    const known = recall(userId, recentKey);
    setRecent(known ?? { items: null, failed: false });
    fetchReviews(orgId, { locationId: locationId === 'all' ? null : locationId })
      .then((page) => {
        const next = { items: page.slice(0, RECENT_LIMIT), failed: false };
        remember(recentKey, next);
        if (!cancelled) setRecent(next);
      })
      .catch((err) => {
        console.error('No se pudieron cargar las últimas reseñas:', err);
        if (!cancelled && !known) setRecent({ items: [], failed: true });
      });
    return () => { cancelled = true; };
  }, [orgId, locationId, userId, recentKey]);

  useEffect(() => {
    if (!orgId) return undefined;
    let cancelled = false;
    const known = recall(userId, seoKey);
    setSeo(known ?? { data: null, loading: true, failed: false });
    fetchSeoAudit(orgId)
      .then((data) => {
        const next = { data, loading: false, failed: false };
        remember(seoKey, next);
        if (!cancelled) setSeo(next);
      })
      .catch((err) => {
        console.error('No se pudo calcular el SEO local:', err);
        if (!cancelled && !known) setSeo({ data: null, loading: false, failed: true });
      });
    return () => { cancelled = true; };
  }, [orgId, userId, seoKey]);

  return { base, scans, recent, seo };
}
