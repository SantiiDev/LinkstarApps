import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { recall, remember } from '../../lib/viewMemory';
import { fetchDeviceDetails } from '../../lib/catalogApi';
import {
  fetchDevicePerformance,
  fetchLocationPerformance,
  fetchDashboardKpis,
  fetchEmployeeLeaderboard,
  fetchDeviceScansSeries,
  fetchScansDaily,
} from '../../lib/dashboardApi';

export const SPARKLINE_DAYS = 7;

/* La carga de Dispositivos, en dos partes:
 *
 *   - base: expositores (v_device_performance), sucursales
 *     (v_location_performance, para el ranking y las reseñas estimadas), los KPIs
 *     de 30 días (v_dashboard_kpis), empleados (para el formulario), la serie de
 *     7 días de cada expositor y los datos que la vista no trae (destino y fecha
 *     de vinculación).
 *   - actividad: la serie diaria de la organización para el gráfico, con el doble
 *     de días del período elegido para dibujar también el anterior.
 *
 * Lo último que se vio queda en memoria (lib/viewMemory.js): al volver a la
 * sección se muestra al instante y se relee por detrás. `reload()` (después de
 * editar o vincular) también relee sin vaciar la pantalla.
 *
 * Si la base falla y no hay nada recordado, la pantalla lo dice. NO se cae a
 * datos de ejemplo: hasta octubre de 2026 esta pantalla mostraba expositores
 * inventados como si fueran reales cuando la consulta fallaba, y pasó en
 * producción. Empleados, la serie y los detalles tienen su propio catch porque
 * son extras: que fallen no esconde los totales, que sí son reales. */
const EMPTY_BASE = {
  loading: true, error: null,
  devices: [], locations: [], kpis: null, employees: [], series: new Map(), details: new Map(),
};

export function useDevicesData(orgId, { period }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const baseKey = `devices:base:${orgId}`;
  const activityKey = `devices:activity:${orgId}:${period}`;

  const [base, setBase] = useState(() => recall(userId, baseKey) ?? EMPTY_BASE);
  const [activity, setActivity] = useState(() => recall(userId, activityKey) ?? { rows: null, failed: false });
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    if (!orgId) return undefined;
    let cancelled = false;
    const known = recall(userId, baseKey);
    if (!known) setBase(EMPTY_BASE);
    Promise.all([
      fetchDevicePerformance(orgId),
      fetchLocationPerformance(orgId),
      fetchDashboardKpis(orgId),
      fetchEmployeeLeaderboard(orgId).catch((err) => {
        console.error('No se pudo cargar la lista de empleados:', err);
        return [];
      }),
      // Sin la serie (p. ej. falta la 0016 en el entorno) las sparklines quedan
      // planas, pero el resto sigue siendo real.
      fetchDeviceScansSeries(orgId, SPARKLINE_DAYS).catch((err) => {
        console.error('No se pudo cargar la serie diaria por dispositivo:', err);
        return new Map();
      }),
      fetchDeviceDetails(orgId).catch((err) => {
        console.error('No se pudieron cargar los detalles de los dispositivos:', err);
        return new Map();
      }),
    ])
      .then(([devices, locations, kpis, employees, series, details]) => {
        const next = { loading: false, error: null, devices, locations, kpis, employees, series, details };
        remember(baseKey, next);
        if (!cancelled) setBase(next);
      })
      .catch((err) => {
        console.error('No se pudieron cargar los dispositivos:', err);
        if (!cancelled && !known) setBase({ ...EMPTY_BASE, loading: false, error: err });
      });
    return () => { cancelled = true; };
  }, [orgId, userId, baseKey, reloadKey]);

  useEffect(() => {
    if (!orgId) return undefined;
    let cancelled = false;
    const known = recall(userId, activityKey);
    setActivity(known ?? { rows: null, failed: false });
    fetchScansDaily(orgId, Number(period) * 2)
      .then((rows) => {
        const next = { rows, failed: false };
        remember(activityKey, next);
        if (!cancelled) setActivity(next);
      })
      .catch((err) => {
        console.error('No se pudo cargar la actividad diaria:', err);
        if (!cancelled && !known) setActivity({ rows: null, failed: true });
      });
    return () => { cancelled = true; };
  }, [orgId, userId, period, activityKey]);

  return { base, activity, reload };
}
