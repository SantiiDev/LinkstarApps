import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchGoogleLocations, fetchReviewAnalysis, fetchReviewTextCounts } from '../../lib/googleApi';

/* La carga que comparten NPS, Sentimiento y Palabras clave (fase 5, 0033): las
 * fichas, los análisis y cuántas reseñas tienen texto. Sólo la usan las
 * pantallas reales, a las que en gratis no se llega (el modal de ventas va
 * antes), así que no hay pedido que evitar. Los estados vacíos y los filtros
 * están en ReviewAnalysisShared.jsx. */
export function useReviewAnalysis(orgId) {
  const [state, setState] = useState({ fichas: null, rows: null, counts: null, error: null });

  useEffect(() => {
    if (!orgId) return undefined;
    let cancelled = false;
    setState({ fichas: null, rows: null, counts: null, error: null });
    Promise.all([fetchGoogleLocations(orgId), fetchReviewAnalysis(orgId), fetchReviewTextCounts(orgId)])
      .then(([fichas, rows, counts]) => {
        if (!cancelled) setState({ fichas, rows, counts, error: null });
      })
      .catch((err) => {
        console.error('No se pudo cargar el análisis de reseñas:', err);
        if (!cancelled) setState((s) => ({ ...s, error: 'No pudimos cargar el análisis de tus reseñas. Probá recargar la página.' }));
      });
    return () => { cancelled = true; };
  }, [orgId]);

  const linked = useMemo(() => (state.fichas ?? []).filter((f) => f.location_id), [state.fichas]);
  const names = useMemo(
    () => new Map(linked.map((f) => [f.location_id, f.locations?.name ?? f.title ?? 'Sucursal'])),
    [linked]
  );
  const nameOf = useCallback((locationId) => names.get(locationId) ?? 'Sucursal', [names]);

  return { ...state, loading: !state.error && state.rows === null, linked, nameOf };
}
