import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useOrg } from '../../context/OrgContext';
import { acceptInvitation, invitationErrorMessage } from '../../lib/teamApi';
import { PUBLIC_ROUTES, SECTION_PATHS, DEFAULT_SECTION, invitationPath } from '../../lib/routes';
import './AcceptInvitation.css';

/* Canjear una invitación al equipo.
 *
 * Vive fuera de /panel a propósito: el invitado llega sin ser miembro de
 * ninguna organización, y RequireActivePlan lo mandaría a crear una empresa —
 * que es exactamente lo contrario de lo que vino a hacer.
 *
 * El token viaja en la URL, así que hay una condición que no se puede saltear:
 * `accept_invitation()` compara el email de la invitación contra el del JWT. Sin
 * sesión no hay JWT, y con la sesión equivocada la RPC rechaza. De ahí los tres
 * estados de esta pantalla:
 *
 *   sin sesión      -> mandar a registrarse/iniciar sesión y volver acá
 *   con sesión      -> canjear
 *   canjeada        -> refrescar el contexto de organización y entrar al panel
 *
 * El `refresh()` de OrgContext al final no es cosmético: el usuario acaba de
 * pasar de "sin organización" a "miembro", y sin recargar ese contexto el guard
 * del panel todavía lo ve planless y lo rebota al alta.
 */

export default function AcceptInvitation() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { refresh } = useOrg();

  const [status, setStatus] = useState('idle'); // idle | working | done | error
  const [error, setError] = useState(null);

  /* La RPC no es idempotente en el sentido útil: la segunda vez el token ya está
     'accepted' y responde "inválida o vencida", que en pantalla se lee como si
     algo hubiera fallado. En React 19 + StrictMode el efecto corre dos veces en
     desarrollo, así que sin este candado el camino feliz mostraría un error. */
  const attempted = useRef(false);

  const redeem = useCallback(async () => {
    if (attempted.current) return;
    attempted.current = true;

    setStatus('working');
    try {
      await acceptInvitation(token);
      await refresh();
      setStatus('done');
    } catch (err) {
      console.error('No se pudo aceptar la invitación:', err);
      setError(invitationErrorMessage(err));
      setStatus('error');
    }
  }, [token, refresh]);

  useEffect(() => {
    if (authLoading || !user || !token) return;
    redeem();
  }, [authLoading, user, token, redeem]);

  // Entrar al panel se hace con un click y no con un redirect automático: el
  // usuario acaba de sumarse a una cuenta que no conocía y conviene que lea a
  // cuál antes de que le cambie la pantalla.
  const goToPanel = () => navigate(SECTION_PATHS[DEFAULT_SECTION], { replace: true });

  if (authLoading) {
    return <Shell><p className="invite__text">Un momento…</p></Shell>;
  }

  /* Sin sesión: se guarda a dónde volver. `state.from` es el mismo mecanismo que
     usa RequireAuth, así que Login y Register ya saben devolverlo acá. */
  if (!user) {
    const from = { pathname: invitationPath(token) };
    return (
      <Shell>
        <h1 className="invite__title">Te invitaron a una cuenta de Linkstar</h1>
        <p className="invite__text">
          Para aceptar la invitación necesitás una cuenta con <strong>la misma dirección de correo</strong> a
          la que te invitaron. Si todavía no tenés, creala ahora: es gratis y toma un minuto.
        </p>
        <div className="invite__actions">
          <button
            className="invite__btn invite__btn--primary"
            onClick={() => navigate(PUBLIC_ROUTES.register, { state: { from } })}
          >
            Crear mi cuenta
          </button>
          <button
            className="invite__btn"
            onClick={() => navigate(PUBLIC_ROUTES.login, { state: { from } })}
          >
            Ya tengo cuenta
          </button>
        </div>
      </Shell>
    );
  }

  if (status === 'working' || status === 'idle') {
    return <Shell><p className="invite__text">Sumándote al equipo…</p></Shell>;
  }

  if (status === 'error') {
    return (
      <Shell>
        <h1 className="invite__title">No pudimos aceptar la invitación</h1>
        <p className="invite__text invite__text--error">{error}</p>
        <p className="invite__text">
          Estás en sesión como <strong>{user.email}</strong>. Si te invitaron con otra dirección,
          cerrá sesión y volvé a entrar con esa.
        </p>
        <div className="invite__actions">
          <button className="invite__btn invite__btn--primary" onClick={goToPanel}>
            Ir a mi panel
          </button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="invite__title">¡Listo! Ya sos parte del equipo</h1>
      <p className="invite__text">
        Tu cuenta <strong>{user.email}</strong> quedó vinculada. Lo que puedas ver y modificar depende
        del rol que te asignaron.
      </p>
      <div className="invite__actions">
        <button className="invite__btn invite__btn--primary" onClick={goToPanel}>
          Entrar al panel
        </button>
      </div>
    </Shell>
  );
}

function Shell({ children }) {
  return (
    <div className="invite">
      <div className="invite__card">
        <span className="invite__brand">Linkstar</span>
        {children}
      </div>
    </div>
  );
}
