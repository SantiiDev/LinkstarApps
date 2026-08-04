import { useState } from 'react';
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

const PROTECTED_SECTIONS = [
  'company', 'devices', 'reviews',
  'gb-metrics', 'gb-profile', 'gb-posts', 'gb-seo',
  'reports-nps', 'reports-sentiment', 'reports-keywords',
  'monthly-reports', 'automations', 'settings', 'profile',
];

/* ─── App root ─────────────────────────────────────────────── */
export default function App() {
  const [activeSection, setActiveSection] = useState('landing');
  const [settingsTab, setSettingsTab] = useState('general');
  const { user, loading, signOut } = useAuth();

  const goToSettings = (tab) => {
    setSettingsTab(tab);
    setActiveSection('settings');
  };

  /* Restaurando la sesión guardada — evita el flash de Login antes de
     saber si ya hay una sesión activa. */
  if (loading) {
    return <div className="app-loading">Cargando…</div>;
  }

  /* Landing page (no shell) */
  if (activeSection === 'landing') {
    return (
      <Landing onEnterDashboard={() => setActiveSection(user ? 'company' : 'login')} />
    );
  }

  if (activeSection === 'login') {
    return (
      <Login
        onSuccess={() => setActiveSection('company')}
        onGoRegister={() => setActiveSection('register')}
        onBack={() => setActiveSection('landing')}
      />
    );
  }

  if (activeSection === 'register') {
    return (
      <Register
        onSuccess={() => setActiveSection('company')}
        onGoLogin={() => setActiveSection('login')}
        onBack={() => setActiveSection('landing')}
      />
    );
  }

  /* Middleware de acceso: ninguna sección del dashboard se renderiza
     sin sesión activa, sin importar cómo se haya llegado a este estado. */
  if (PROTECTED_SECTIONS.includes(activeSection) && !user) {
    return (
      <Login
        onSuccess={() => setActiveSection('company')}
        onGoRegister={() => setActiveSection('register')}
        onBack={() => setActiveSection('landing')}
      />
    );
  }

  const handleLogout = async () => {
    await signOut();
    setActiveSection('landing');
  };

  return (
    <AppShell activeSection={activeSection} onNavigate={setActiveSection} onLogout={handleLogout}>
      {activeSection === 'company' && <Company onNavigate={setActiveSection} />}
      {activeSection === 'devices' && <DevicesPage onNavigate={setActiveSection} onNavigateSettings={goToSettings} />}
      {activeSection === 'reviews' && <ReviewsPage />}

      {activeSection === 'gb-metrics' && <GoogleMetrics />}
      {activeSection === 'gb-profile' && <GoogleProfile />}
      {activeSection === 'gb-posts' && <GooglePosts />}
      {activeSection === 'gb-seo' && <GoogleSeoLocal />}

      {activeSection === 'reports-nps' && <ReportsNps />}
      {activeSection === 'reports-sentiment' && <ReportsSentiment />}
      {activeSection === 'reports-keywords' && <ReportsKeywords />}

      {activeSection === 'monthly-reports' && <MonthlyReports />}
      {activeSection === 'automations' && <Automations />}
      {activeSection === 'settings' && <SettingsPage initialTab={settingsTab} />}
      {activeSection === 'profile' && <ProfilePage />}
    </AppShell>
  );
}
