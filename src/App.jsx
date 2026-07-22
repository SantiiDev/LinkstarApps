import { useState } from 'react';
import './App.css';
import TopBar from './components/TopBar/TopBar';
import KpiCards from './components/KpiCards/KpiCards';
import BarChart from './components/BarChart/BarChart';
import RecentActivity from './components/RecentActivity/RecentActivity';
import EmployeeRanking from './components/EmployeeRanking/EmployeeRanking';
import DeviceGrid from './components/DeviceGrid/DeviceGrid';
import DevicesPage from './pages/Devices/Devices';
import EmployeesPage from './pages/Employees/Employees';
import LocationsPage from './pages/Locations/Locations';

/* ─── Dashboard view (inline, same as before) ─────────────── */
function DashboardView() {
  const today = new Date();
  const formattedDate = today.toLocaleDateString('es-ES', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  return (
    <main className="dashboard">
      {/* Header */}
      <div className="dashboard-header">
        <div className="dashboard-header__left">
          <h1 className="dashboard-header__title">Buenos días, Santino 👋</h1>
          <p className="dashboard-header__subtitle">
            Aquí tienes un resumen de tus dispositivos y reseñas — {formattedDate}
          </p>
        </div>
        <div className="dashboard-header__actions">
          <button className="dashboard-header__date-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            Últimos 7 días
          </button>
          <button className="dashboard-header__export-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Exportar
          </button>
        </div>
      </div>

      <KpiCards />

      <div className="dashboard__two-cols">
        <BarChart />
        <RecentActivity />
      </div>

      <div className="dashboard__two-cols">
        <EmployeeRanking />
        <div />
      </div>

      <div className="dashboard__section">
        <DeviceGrid />
      </div>

      <div className="dashboard__footer">
        <p className="dashboard__footer-text">
          © 2026 <span className="dashboard__footer-brand">
            linkstar<span className="dashboard__footer-dot">.</span>
          </span> — Panel de gestión de reseñas
        </p>
      </div>
    </main>
  );
}



/* ─── App root ─────────────────────────────────────────────── */
export default function App() {
  const [activeSection, setActiveSection] = useState('dashboard');

  return (
    <div className="app">
      <TopBar activeSection={activeSection} onNavigate={setActiveSection} />

      {activeSection === 'dashboard' && <DashboardView />}
      {activeSection === 'devices' && <DevicesPage />}
      {activeSection === 'employees' && <EmployeesPage />}
      {activeSection === 'locations' && <LocationsPage />}
    </div>
  );
}
