import { supabase } from './supabaseClient';

// Capa de fetching del dashboard. Lee EXCLUSIVAMENTE las vistas de
// supabase/migrations/0008_dashboard_views.sql — nunca scan_events ni
// scan_daily_rollups directo (decisión 2 de CLAUDE.md). Las vistas tienen
// security_invoker = on, así que RLS filtra sola: con el cliente logueado
// (anon key + sesión del usuario) cada query devuelve sólo lo que ese
// usuario puede ver por sus memberships, sin filtrar organization_id acá.
//
// v_dashboard_kpis y v_recent_activity no se consumen todavía: ninguna
// pantalla actual (Devices/Employees/Locations) tiene un panel de KPIs
// generales ni un feed de actividad reciente para pegarlas.

export async function fetchDevicePerformance() {
  const { data, error } = await supabase.from('v_device_performance').select('*');
  if (error) throw error;
  return data ?? [];
}

export async function fetchEmployeeLeaderboard() {
  const { data, error } = await supabase.from('v_employee_leaderboard').select('*');
  if (error) throw error;
  return data ?? [];
}

export async function fetchLocationPerformance() {
  const { data, error } = await supabase.from('v_location_performance').select('*');
  if (error) throw error;
  return data ?? [];
}

// v_scans_daily agrega TODO el historial de scan_daily_rollups agrupado por
// día — sin límite de rango incorporado. Filtramos acá a los últimos N días.
export async function fetchScansDaily(days = 7) {
  const since = new Date();
  since.setDate(since.getDate() - (days - 1));
  const sinceStr = since.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('v_scans_daily')
    .select('day, scans, unique_scans, estimated_reviews')
    .gte('day', sinceStr)
    .order('day', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

// Decisión 6 de CLAUDE.md: Google no avisa reseñas nuevas, sólo se puede
// medir por diferencia de contador día a día (review_deltas). Cualquier
// número de "reseñas" que salga de ahí (directo o vía las vistas que lo
// agregan) tiene que quedar etiquetado como estimado en la UI.
export const ESTIMATED_LABEL = 'estimado';

export function formatRelativeTime(isoString) {
  if (!isoString) return 'Sin actividad';
  const diffMs = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'Hace instantes';
  if (minutes < 60) return `Hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `Hace ${days} día${days === 1 ? '' : 's'}`;
}

const PALETTE = ['#F58529', '#1A2639', '#10B981', '#F59E0B', '#6366f1', '#8b5cf6', '#ec4899'];
export function colorForIndex(i) {
  return PALETTE[i % PALETTE.length];
}

export function initialsFor(fullName) {
  if (!fullName) return '?';
  const parts = fullName.trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase();
}
