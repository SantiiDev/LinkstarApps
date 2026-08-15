import { useEffect, useState } from 'react';
import { useOrg } from '../../context/OrgContext';
import { auditActionLabel, fetchAuditLog, fetchOrgMembers } from '../../lib/teamApi';
import { formatRelativeTime } from '../../lib/dashboardApi';

/* Quién hizo qué en la cuenta. Lee `audit_log` (0004) de verdad.
 *
 * Reemplaza una maqueta de tres filas escritas a mano —con el nombre y el mail
 * reales de uno de nosotros, y acciones que nunca ocurrieron— que la fase 2 no
 * llegó a barrer porque estaba embebida en Settings.jsx en vez de ser su propia
 * pantalla.
 *
 * Una cuenta nueva ve muy poco acá, y está bien: hasta la 0020 el único que
 * escribía en `audit_log` era `claim_device()`. Eso es "todavía no pasó nada",
 * que es distinto de "no lo estamos midiendo" — por eso esto lee la tabla en
 * lugar de mostrar un SectionPlaceholder. Cada `insert into audit_log` que se
 * agregue en el futuro aparece acá solo.
 *
 * La RLS del 0006 limita la tabla a owner/admin. Para un manager o un viewer la
 * consulta devuelve vacío sin error, así que la tarjeta no se dibuja.
 */

const MAX_ROWS = 20;

export default function ActivityLog() {
  const { org, canManageBilling, loading: orgLoading } = useOrg();
  const organizationId = org?.organization_id ?? null;

  const [rows, setRows] = useState([]);
  const [actors, setActors] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    /* Igual que TeamMembers: hasta que OrgContext resuelva, `canManageBilling`
       es false y `organizationId` null. Salir sin apagar `loading` mantiene la
       tarjeta oculta en vez de dibujarla vacía y rellenarla un instante después,
       que se ve como si el registro estuviera vacío y después no. */
    if (orgLoading) return;

    if (!canManageBilling || !organizationId) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        // Los nombres se resuelven contra el equipo y no con un join: audit_log
        // referencia auth.users, que PostgREST no expone, así que no hay
        // relación que pueda seguir por sí solo.
        const [auditRows, members] = await Promise.all([
          fetchAuditLog(organizationId, MAX_ROWS),
          fetchOrgMembers(),
        ]);
        if (cancelled) return;
        setRows(auditRows);
        setActors(new Map(members.map((m) => [m.user_id, m.full_name || m.email])));
        setFailed(false);
      } catch (err) {
        console.error('No se pudo cargar el registro de actividad:', err);
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [organizationId, canManageBilling, orgLoading]);

  if (orgLoading || loading || !canManageBilling) return null;

  return (
    <div className="settings-card">
      <div className="settings-card__head">
        <div className="settings-card__head-left">
          <div className="settings-icon-box settings-icon-box--navy">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
          </div>
          <div>
            <h3 className="settings-card__title-row">Registro de actividad</h3>
            <p className="settings-card__subtitle">Quién hizo qué en tu cuenta</p>
          </div>
        </div>
      </div>

      {failed ? (
        <p className="settings-card__hint">
          No pudimos cargar el registro. Probá recargar la página.
        </p>
      ) : rows.length === 0 ? (
        <p className="settings-card__hint">
          Todavía no hay movimientos registrados. Acá van a aparecer los expositores que vincules y
          los cambios en tu equipo.
        </p>
      ) : (
        <div className="settings-activity-log">
          {rows.map((row) => (
            <div key={row.id} className="settings-activity-row">
              <span className="settings-activity-row__date">{formatRelativeTime(row.created_at)}</span>
              <span className="settings-activity-row__actor">
                {actors.get(row.actor_id) || 'Alguien de tu equipo'}
              </span>
              <span className="settings-activity-row__text">{auditActionLabel(row)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
