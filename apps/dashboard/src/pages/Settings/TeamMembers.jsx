import { useCallback, useEffect, useState } from 'react';
import Select from '../../components/Select/Select';
import { useOrg } from '../../context/OrgContext';
import {
  ASSIGNABLE_ROLES,
  ROLE_LABELS,
  expiryLabel,
  fetchMemberLimit,
  fetchOrgMembers,
  fetchPendingInvitations,
  inviteMember,
  invitationErrorMessage,
  removeMember,
  revokeInvitation,
  setMemberRole,
} from '../../lib/teamApi';
import './TeamMembers.css';

/* Miembros de la cuenta: las personas que INICIAN SESIÓN en el panel.
 *
 * No confundir con EmployeesPage, que se renderiza justo abajo en la misma
 * pestaña: los empleados son el mozo y el cajero, existen para atribuirles
 * escaneos y no tienen usuario. Los dos bloques dicen cuál es cuál en su
 * subtítulo, porque "equipo" a secas es ambiguo en este producto.
 *
 * La invitación viaja como LINK COPIABLE, no por mail: todavía no hay proveedor
 * de email transaccional (llega en la fase 7, que igual lo necesita para las
 * automatizaciones). Web3Forms, que es lo único conectado hoy, sirve para
 * avisarnos a nosotros de una compra, no para escribirle a un cliente. El día
 * que haya proveedor, manda exactamente este mismo link y esta pantalla no
 * cambia.
 */

function Icon({ name, size = 16 }) {
  const props = {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round',
  };
  const icons = {
    copy: <svg {...props}><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>,
    check: <svg {...props}><polyline points="20 6 9 17 4 12" /></svg>,
    trash: <svg {...props}><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>,
    mail: <svg {...props}><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 6-10 7L2 6" /></svg>,
  };
  return icons[name] || null;
}

function initialsOf(name, email) {
  const source = (name || email || '?').trim();
  const parts = source.split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';
}

/* Un botón que confirma en el lugar en vez de abrir un `confirm()` del browser.
 * Quitar a alguien del equipo le corta el acceso a la cuenta, así que no
 * conviene que sea un click seco — pero un modal para esto es demasiado. */
function ConfirmButton({ label, confirmLabel, onConfirm, busy }) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(timer);
  }, [armed]);

  if (!armed) {
    return (
      <button type="button" className="team-row__action" onClick={() => setArmed(true)} disabled={busy}>
        {label}
      </button>
    );
  }

  return (
    <button
      type="button"
      className="team-row__action team-row__action--danger"
      onClick={() => { setArmed(false); onConfirm(); }}
      disabled={busy}
    >
      {confirmLabel}
    </button>
  );
}

/* El link sólo existe en memoria y sólo hasta que se recarga la pantalla: en la
 * base queda el sha256 del token, no el token. Por eso el panel insiste en
 * copiarlo ahora y avisa que no se puede volver a ver. */
function InvitationLink({ invitation, onDismiss }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(invitation.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // clipboard puede fallar sin https o sin permiso; el input es
      // seleccionable a mano, así que no se rompe nada.
      setCopied(false);
    }
  };

  return (
    <div className="team-invite-result">
      <div className="team-invite-result__head">
        <strong>Invitación creada para {invitation.email}</strong>
        <button type="button" className="team-invite-result__close" onClick={onDismiss} aria-label="Cerrar">×</button>
      </div>
      <p className="team-invite-result__text">
        Copiá este enlace y mandáselo. <strong>No se va a poder volver a ver</strong>: si lo perdés,
        revocá la invitación y creá una nueva.
      </p>
      <div className="team-invite-result__row">
        <input className="team-invite-result__input" value={invitation.link} readOnly onFocus={(e) => e.target.select()} />
        <button type="button" className="team-invite-result__copy" onClick={copy}>
          <Icon name={copied ? 'check' : 'copy'} />
          {copied ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      <p className="team-invite-result__hint">
        Tiene que aceptarla desde una cuenta con el correo <strong>{invitation.email}</strong>. {expiryLabel(invitation.expiresAt)}.
      </p>
    </div>
  );
}

export default function TeamMembers() {
  const { org, canManageBilling, loading: orgLoading } = useOrg();
  const organizationId = org?.organization_id ?? null;
  const planCode = org?.plan_code ?? null;

  /* canManageBilling es owner/admin, que es exactamente el permiso que la RLS
     del 0006 pide para invitar y para leer `invitations`. Se reusa en vez de
     recalcular el rol, para que la UI y la base no puedan discrepar. */
  const canManage = canManageBilling;

  const [members, setMembers] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [limit, setLimit] = useState(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const [email, setEmail] = useState('');
  const [role, setRole] = useState('viewer');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [created, setCreated] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    /* Se espera a que OrgContext resuelva. Sin esto, el primer render pasa con
       `org` en null y `canManageBilling` en false, así que la tarjeta alcanza a
       dibujar "sólo el propietario puede invitar gente" y el límite del plan mal
       antes de corregirse — un parpadeo que se lee como un error de permisos. */
    if (orgLoading) return;

    try {
      const [memberRows, invitationRows, maxMembers] = await Promise.all([
        fetchOrgMembers(),
        canManage ? fetchPendingInvitations(organizationId) : Promise.resolve([]),
        fetchMemberLimit(planCode),
      ]);
      setMembers(memberRows);
      setInvitations(invitationRows);
      setLimit(maxMembers);
      setFailed(false);
    } catch (err) {
      // Sin fallback a mock: esta pantalla dice quién tiene acceso a la cuenta,
      // y una lista inventada acá es peor que un error.
      console.error('No se pudo cargar el equipo:', err);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [organizationId, planCode, canManage, orgLoading]);

  useEffect(() => { load(); }, [load]);

  /* Las pendientes cuentan para el límite: si no, se pueden emitir diez
     invitaciones en un plan de dos y nueve personas hacen todo el trámite para
     chocarse con un error al final. Es el mismo criterio que aplica invite_member(). */
  const used = members.length + invitations.length;
  const atLimit = limit !== null && used >= limit;

  const submit = async (e) => {
    e.preventDefault();
    if (!email.trim() || sending) return;

    setSending(true);
    setError(null);
    try {
      const result = await inviteMember(email.trim(), role);
      setCreated({ ...result, email: email.trim() });
      setEmail('');
      setRole('viewer');
      await load();
    } catch (err) {
      setError(invitationErrorMessage(err));
    } finally {
      setSending(false);
    }
  };

  const act = async (id, fn) => {
    setBusyId(id);
    setError(null);
    try {
      await fn();
      await load();
    } catch (err) {
      setError(invitationErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  if (orgLoading || loading) {
    return (
      <div className="settings-card">
        <p className="settings-card__subtitle">Cargando el equipo…</p>
      </div>
    );
  }

  if (failed) {
    return (
      <div className="settings-card">
        <h3 className="settings-card__title-row">Miembros de la cuenta</h3>
        <p className="settings-card__subtitle">
          No pudimos cargar el equipo. Probá recargar la página; si sigue pasando, escribinos.
        </p>
      </div>
    );
  }

  return (
    <div className="settings-card">
      <div className="settings-card__head">
        <div className="settings-card__head-left">
          <div className="settings-icon-box settings-icon-box--orange"><Icon name="mail" size={18} /></div>
          <div>
            <h3 className="settings-card__title-row">Miembros de la cuenta</h3>
            <p className="settings-card__subtitle">
              Las personas que entran a este panel. Distinto de los empleados de acá abajo, que no
              inician sesión y existen para atribuirles escaneos.
            </p>
          </div>
        </div>
        <div className="settings-card__head-action">
          <span className="team-seats">
            {limit === null ? `${used} miembros` : `${used} de ${limit}`}
          </span>
        </div>
      </div>

      <ul className="team-list">
        {members.map((m) => (
          <li key={m.membership_id} className="team-row">
            <span className="team-row__avatar">{initialsOf(m.full_name, m.email)}</span>
            <span className="team-row__identity">
              <span className="team-row__name">
                {m.full_name || m.email}
                {m.is_me && <span className="team-row__you">vos</span>}
              </span>
              <span className="team-row__email">{m.email}</span>
            </span>

            {/* El propio rol y el del propietario no se editan desde acá: la RPC
                los rechaza igual, y ofrecer un control que va a fallar es peor
                que no ofrecerlo. */}
            {/* El <span> no es decorativo: Select pone `triggerClassName` en su
                <button> interno, pero el hijo flex de .team-row es el <div>
                envoltorio que Select renderiza. Sin este wrapper, el ancho se le
                aplicaría al botón y no al elemento que la fila dimensiona. */}
            {canManage && !m.is_me && m.role !== 'owner' ? (
              <span className="team-row__role-select">
                <Select
                  value={m.role}
                  onChange={(next) => act(m.membership_id, () => setMemberRole(m.membership_id, next))}
                  options={ASSIGNABLE_ROLES.map(({ value, label }) => ({ value, label }))}
                  triggerClassName="settings-select"
                />
              </span>
            ) : (
              <span className={`team-row__role team-row__role--${m.role}`}>{ROLE_LABELS[m.role]}</span>
            )}

            {canManage && !m.is_me && m.role !== 'owner' ? (
              <ConfirmButton
                label="Quitar"
                confirmLabel="¿Seguro?"
                busy={busyId === m.membership_id}
                onConfirm={() => act(m.membership_id, () => removeMember(m.membership_id))}
              />
            ) : (
              <span className="team-row__action-spacer" />
            )}
          </li>
        ))}
      </ul>

      {canManage && invitations.length > 0 && (
        <>
          <h4 className="team-subhead">Invitaciones sin aceptar</h4>
          <ul className="team-list">
            {invitations.map((inv) => (
              <li key={inv.id} className="team-row team-row--pending">
                <span className="team-row__avatar team-row__avatar--pending"><Icon name="mail" /></span>
                <span className="team-row__identity">
                  <span className="team-row__name">{inv.email}</span>
                  <span className="team-row__email">{expiryLabel(inv.expires_at)}</span>
                </span>
                <span className={`team-row__role team-row__role--${inv.role}`}>{ROLE_LABELS[inv.role]}</span>
                <ConfirmButton
                  label="Revocar"
                  confirmLabel="¿Seguro?"
                  busy={busyId === inv.id}
                  onConfirm={() => act(inv.id, () => revokeInvitation(inv.id))}
                />
              </li>
            ))}
          </ul>
        </>
      )}

      {canManage && (
        <div className="team-invite">
          <h4 className="team-subhead">Invitar a alguien</h4>

          {created && <InvitationLink invitation={created} onDismiss={() => setCreated(null)} />}

          {atLimit ? (
            <p className="team-limit">
              Tu plan incluye {limit} {limit === 1 ? 'miembro' : 'miembros'} y ya los estás usando,
              contando las invitaciones sin aceptar. Para sumar gente hace falta cambiar de plan.
            </p>
          ) : (
            <form className="team-invite__form" onSubmit={submit}>
              <label className="settings-field team-invite__email">
                <span>Correo</span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="persona@ejemplo.com"
                />
              </label>
              <label className="settings-field team-invite__role">
                <span>Rol</span>
                <Select
                  value={role}
                  onChange={setRole}
                  options={ASSIGNABLE_ROLES.map(({ value, label }) => ({ value, label }))}
                  triggerClassName="settings-select"
                />
              </label>
              <button type="submit" className="team-invite__submit" disabled={sending}>
                {sending ? 'Creando…' : 'Crear invitación'}
              </button>
            </form>
          )}

          <p className="settings-card__hint team-invite__note">
            {ASSIGNABLE_ROLES.find((r) => r.value === role)?.hint}
          </p>

          {error && <p className="team-error">{error}</p>}
        </div>
      )}

      {!canManage && (
        <p className="settings-card__hint">
          Sólo el propietario y los administradores pueden invitar gente o cambiar roles.
        </p>
      )}
    </div>
  );
}
