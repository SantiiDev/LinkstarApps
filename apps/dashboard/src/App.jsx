import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import './App.css';
import AppShell from './components/AppShell/AppShell';
import Company from './pages/Company/Company';
import ReviewsPage from './pages/Reviews/Reviews';
import GoogleMetrics from './pages/GoogleBusiness/GoogleMetrics';
import GoogleProfile from './pages/GoogleBusiness/GoogleProfile';
import GooglePosts from './pages/GoogleBusiness/GooglePosts';
import GoogleSeoLocal from './pages/GoogleBusiness/GoogleSeoLocal';
import ReportsNps from './pages/Reports/ReportsNps';
import ReportsSentiment from './pages/Reports/ReportsSentiment';
import ReportsKeywords from './pages/Reports/ReportsKeywords';
import MonthlyReports from './pages/MonthlyReports/MonthlyReports';
import Automations from './pages/Automations/Automations';
import SettingsPage from './pages/Settings/Settings';
import ProfilePage from './pages/Profile/Profile';
import DevicesPage from './pages/Devices/Devices';
import Landing from './pages/Landing/Landing';
import Login from './pages/Login/Login';
import Register from './pages/Register/Register';
import { useAuth } from './context/AuthContext';
import {
  PUBLIC_ROUTES,
  DASHBOARD_BASE,
  SECTION_PATHS,
  DEFAULT_SECTION,
  pathForSection,
  settingsTabPath,
} from './lib/routes';

const HOME_SECTION_PATH = SECTION_PATHS[DEFAULT_SECTION];

/* ─── Guarda de sesión ─────────────────────────────────────────
   Todo lo que cuelga de /panel pasa por acá: sin sesión no se renderiza
   ninguna sección, sin importar cómo se haya llegado a la URL. Se recuerda a
   dónde iba (`state.from`) para volver ahí después de iniciar sesión, que es
   la razón de ser de tener URLs: si alguien comparte /panel/resenas, el login
   no debería dejarte en la portada. */
function RequireAuth({ children }) {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) {
    return <Navigate to={PUBLIC_ROUTES.login} replace state={{ from: location }} />;
  }
  return children;
}

/* ─── Rutas públicas ───────────────────────────────────────────── */
function LandingRoute() {
  const { user } = useAuth();
  const navigate = useNavigate();
  return (
    <Landing onEnterDashboard={() => navigate(user ? HOME_SECTION_PATH : PUBLIC_ROUTES.login)} />
  );
}

/* Con sesión activa, /iniciar-sesion y /registro no tienen nada que ofrecer:
   redirigen al panel en vez de mostrar un formulario para volver a entrar. */
function LoginRoute() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname;

  if (user) return <Navigate to={from || HOME_SECTION_PATH} replace />;

  return (
    <Login
      onSuccess={() => navigate(from || HOME_SECTION_PATH, { replace: true })}
      onGoRegister={() => navigate(PUBLIC_ROUTES.register)}
      onBack={() => navigate(PUBLIC_ROUTES.landing)}
    />
  );
}

function RegisterRoute() {
  const { user } = useAuth();
  const navigate = useNavigate();

  if (user) return <Navigate to={HOME_SECTION_PATH} replace />;

  return (
    <Register
      onSuccess={() => navigate(HOME_SECTION_PATH, { replace: true })}
      onGoLogin={() => navigate(PUBLIC_ROUTES.login)}
      onBack={() => navigate(PUBLIC_ROUTES.landing)}
    />
  );
}

/* ─── Páginas que navegan a otras secciones ────────────────────
   Siguen hablando en ids de sección ('reviews', 'gb-metrics'); el id se
   traduce a path acá, así las páginas no saben nada del router. */
function CompanyRoute() {
  const navigate = useNavigate();
  return <Company onNavigate={(section) => navigate(pathForSection(section))} />;
}

function DevicesRoute() {
  const navigate = useNavigate();
  return (
    <DevicesPage
      onNavigate={(section) => navigate(pathForSection(section))}
      onNavigateSettings={(tab) => navigate(settingsTabPath(tab))}
    />
  );
}

/* ─── App root ─────────────────────────────────────────────── */
export default function App() {
  const { loading } = useAuth();

  /* Restaurando la sesión guardada — evita el flash de Login antes de
     saber si ya hay una sesión activa. */
  if (loading) {
    return <div className="app-loading">Cargando…</div>;
  }

  return (
    <Routes>
      <Route path={PUBLIC_ROUTES.landing} element={<LandingRoute />} />
      <Route path={PUBLIC_ROUTES.login} element={<LoginRoute />} />
      <Route path={PUBLIC_ROUTES.register} element={<RegisterRoute />} />

      {/* El shell (sidebar + topbar) es la ruta padre: se monta una sola vez y
          las secciones se renderizan adentro, en su <Outlet />. */}
      <Route
        path={DASHBOARD_BASE}
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to={HOME_SECTION_PATH} replace />} />

        <Route path={SECTION_PATHS.company} element={<CompanyRoute />} />
        <Route path={SECTION_PATHS.devices} element={<DevicesRoute />} />
        <Route path={SECTION_PATHS.reviews} element={<ReviewsPage />} />

        <Route path={SECTION_PATHS['gb-metrics']} element={<GoogleMetrics />} />
        <Route path={SECTION_PATHS['gb-profile']} element={<GoogleProfile />} />
        <Route path={SECTION_PATHS['gb-posts']} element={<GooglePosts />} />
        <Route path={SECTION_PATHS['gb-seo']} element={<GoogleSeoLocal />} />

        <Route path={SECTION_PATHS['reports-nps']} element={<ReportsNps />} />
        <Route path={SECTION_PATHS['reports-sentiment']} element={<ReportsSentiment />} />
        <Route path={SECTION_PATHS['reports-keywords']} element={<ReportsKeywords />} />

        <Route path={SECTION_PATHS['monthly-reports']} element={<MonthlyReports />} />
        <Route path={SECTION_PATHS.automations} element={<Automations />} />

        {/* La pestaña abierta de Configuración va en la URL, así Dispositivos
            puede enlazar directo a "Gestión local" y el enlace se puede
            compartir. Sin pestaña se abre la primera. */}
        <Route path={SECTION_PATHS.settings} element={<SettingsPage />} />
        <Route path={`${SECTION_PATHS.settings}/:tab`} element={<SettingsPage />} />

        <Route path={SECTION_PATHS.profile} element={<ProfilePage />} />

        {/* /panel/lo-que-sea -> la sección de inicio del panel. */}
        <Route path="*" element={<Navigate to={HOME_SECTION_PATH} replace />} />
      </Route>

      <Route path="*" element={<Navigate to={PUBLIC_ROUTES.landing} replace />} />
    </Routes>
  );
}
