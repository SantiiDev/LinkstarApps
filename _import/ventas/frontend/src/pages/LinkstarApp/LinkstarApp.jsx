import { useEffect, useRef, useState } from 'react';
import FAQ from '../../components/sections/FAQ/FAQ';
import './LinkstarApp.css';

const linkstarFaqData = [
  {
    question: '¿Qué es LinkstarApp?',
    answer: 'La plataforma gratuita donde controlas todos tus dispositivos Linkstar y ves las estadisticas de uso.',
  },
  {
    question: '¿De verdad no hay que pagar por la Plataforma?',
    answer: 'No, viene incluida con la compra de tus dispositivos. Sin suscripciones ni costes ocultos.',
  },
  {
    question: '¿Cómo vinculo los dispositivos Linkstar a mi cuenta?',
    answer: 'Cuando te lleguen, los escaneas por primera vez y se vinculan automáticamente. Si no tienes cuenta, la creas en el momento.',
  },
  {
    question: '¿Habrá más funciones?',
    answer: 'Sí, nuestro equipo lanza actualizaciones constantemente para ayudarte a multiplicar tus reseñas.',
  }
];

const CountUp = ({ end, duration = 2000, suffix = '' }) => {
  const [count, setCount] = useState(0);
  const countRef = useRef(null);

  useEffect(() => {
    let animationFrameId;
    let isMounted = true;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          let startTimestamp = null;
          const animate = (timestamp) => {
            if (!isMounted) return;
            if (!startTimestamp) startTimestamp = timestamp;
            const progress = timestamp - startTimestamp;
            const percentage = Math.min(progress / duration, 1);
            const easeOut = 1 - Math.pow(1 - percentage, 3);
            setCount(Math.floor(easeOut * end));
            if (progress < duration) {
              animationFrameId = requestAnimationFrame(animate);
            }
          };
          animationFrameId = requestAnimationFrame(animate);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );

    if (countRef.current) observer.observe(countRef.current);
    return () => {
      isMounted = false;
      observer.disconnect();
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };
  }, [end, duration]);

  return <span ref={countRef}>{count}{suffix}</span>;
};

const Svg = ({ children, color }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color || "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);

const MapPinIcon = <Svg color="var(--color-gold)"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></Svg>;
const SettingsIcon = <Svg color="var(--color-forest)"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" /></Svg>;
const UtensilsIcon = <Svg color="var(--color-orange)"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" /><path d="M7 2v20" /><path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" /></Svg>;
const BuildingIcon = <Svg color="var(--color-forest)"><rect x="4" y="2" width="16" height="20" rx="2" ry="2" /><path d="M9 22v-4h6v4" /><path d="M8 6h.01" /><path d="M16 6h.01" /><path d="M12 6h.01" /><path d="M12 10h.01" /><path d="M12 14h.01" /><path d="M16 10h.01" /><path d="M16 14h.01" /><path d="M8 10h.01" /><path d="M8 14h.01" /></Svg>;
const TrendingUpIcon = <Svg color="var(--color-gold)"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></Svg>;
const TrophyIcon = <Svg color="#F59E0B"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" /><path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" /><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" /><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" /></Svg>;
const StarIcon = <Svg color="#F59E0B"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></Svg>;
const SearchIcon = <Svg color="#3B82F6"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></Svg>;
const RefreshIcon = <Svg color="#10B981"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></Svg>;
const BarChartIcon = <Svg color="#8B5CF6"><line x1="12" y1="20" x2="12" y2="10" /><line x1="18" y1="20" x2="18" y2="4" /><line x1="6" y1="20" x2="6" y2="16" /></Svg>;
const ClipboardIcon = <Svg color="#6366F1"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><rect x="8" y="2" width="8" height="4" rx="1" ry="1" /></Svg>;
const DollarIcon = <Svg color="#10B981"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></Svg>;
const LinkIcon = <Svg color="#EC4899"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></Svg>;
const SmileIcon = <Svg color="#6B7280"><circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" /></Svg>;

const features = [
  {
    icon: BarChartIcon,
    title: 'Métricas de Google',
    badge: 'Reseñas en vivo',
    description: 'Mirá cuántas reseñas y qué rating tiene tu negocio en Google, actualizado día a día. Sin entrar a Google Maps a revisar a mano.',
    points: [
      'Total de reseñas y rating promedio',
      'Evolución semana a semana',
      'Distribución por cantidad de estrellas'
    ]
  },
  {
    icon: ClipboardIcon,
    title: 'Reportes e Insights',
    badge: 'Con IA',
    description: 'Entendé qué piensan realmente tus clientes: puntaje NPS, sentimiento de cada reseña y las palabras clave que más se repiten.',
    points: [
      'Puntaje NPS automático',
      'Análisis de sentimiento con IA',
      'Palabras clave más mencionadas'
    ]
  },
  {
    icon: SettingsIcon,
    title: 'Gestión de dispositivos',
    badge: 'Control total',
    description: 'Controla todos tus dispositivos Linkstar desde un único panel. Configura el enlace y monitoriza el rendimiento individual.',
    points: [
      'Configura el enlace de cada dispositivo',
      'Ve los escaneos en tiempo real',
      'Reasigna un dispositivo fácilmente'
    ]
  }
];

const useCases = [
  {
    icon: UtensilsIcon,
    title: 'Restaurantes y Hostelería',
    subtitle: 'Ranking de empleados — Motiva a tu equipo',
    example: 'Ejemplo: "La Parrilla del Parque"',
    description: 'Compraron tarjetas Linkstar (una por empleado). Desde el panel, el dueño ve quién consigue más reseñas cada mes.',
    highlights: [
      { icon: TrophyIcon, text: 'Competición sana entre el equipo' },
      { icon: TrendingUpIcon, text: '+300% reseñas en el primer mes' },
      { icon: StarIcon, text: 'Premio al mejor empleado' }
    ]
  },
  {
    icon: BuildingIcon,
    title: 'Cadenas y Franquicias',
    subtitle: 'Vista por ubicaciones — Compara rendimiento',
    example: 'Ejemplo: "Gimnasios FitLife — 12 locales"',
    description: 'Distribuyeron 30 expositores en sus locales. Pueden comparar el rendimiento al instante y detectar qué sucursal necesita atención.',
    highlights: [
      { icon: SearchIcon, text: 'Detectar locales con bajo rendimiento' },
      { icon: RefreshIcon, text: 'Reasignar dispositivos sin coste extra' },
      { icon: BarChartIcon, text: 'Decisiones basadas en datos' }
    ]
  },
  {
    icon: TrendingUpIcon,
    title: 'Departamento Marketing',
    subtitle: 'Gestión multi-cliente — Reporta con datos',
    example: 'Ejemplo: "Agencia GrowTech"',
    description: 'Gestionan la reputación online de 15 negocios distintos. Monitorizan todos los dispositivos de sus clientes desde una sola cuenta.',
    highlights: [
      { icon: ClipboardIcon, text: 'Informes de rendimiento instantáneos' },
      { icon: DollarIcon, text: 'Control centralizado de clientes' },
      { icon: LinkIcon, text: 'Cambio de fichas sin complicaciones' }
    ]
  }
];

const dashboardKpisMock = [
  { icon: StarIcon, label: 'Reseñas totales en Google', value: '213', trend: '+13 esta semana' },
  { icon: TrophyIcon, label: 'Rating promedio', value: '4.8★', trend: '+0.2 este mes' },
  { icon: RefreshIcon, label: 'Tasa de respuesta', value: '92%', trend: '+5%' },
  { icon: SmileIcon, label: 'Satisfacción positiva', value: '77%', trend: '+3%' },
];

const reviewsTrendMock = [28, 40, 34, 52, 46, 58, 50, 64];

const starDistributionMock = [
  { stars: 5, pct: 74 },
  { stars: 4, pct: 16 },
  { stars: 3, pct: 6 },
  { stars: 2, pct: 3 },
  { stars: 1, pct: 1 },
];

const employeeRankingMock = [
  { pos: '1', name: 'María G.', reviews: 47, pct: 100 },
  { pos: '2', name: 'Carlos R.', reviews: 38, pct: 81 },
  { pos: '3', name: 'Laura P.', reviews: 29, pct: 62 },
  { pos: '4', name: 'Diego M.', reviews: 15, pct: 32 },
];

const locationsMock = [
  { name: 'Centro', scans: 312, trend: '+18%', status: 'up' },
  { name: 'Norte', scans: 245, trend: '+12%', status: 'up' },
  { name: 'Sur', scans: 89, trend: '-5%', status: 'down' },
  { name: 'Este', scans: 198, trend: '+8%', status: 'up' },
];

const multiClientMock = [
  { name: 'La Parrilla del Parque', devices: 4, reviews: 127, rating: '4.8' },
  { name: 'Gimnasio FitLife Centro', devices: 2, reviews: 89, rating: '4.6' },
  { name: 'Clínica Dental Sonrisa', devices: 3, reviews: 64, rating: '4.9' },
];


export default function LinkstarApp({ onShop, onContact }) {
  const sectionRefs = useRef([]);
  sectionRefs.current = []; // Limpiamos referencias en cada render

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('lapp-animate--visible');
          }
        });
      },
      { threshold: 0.1 }
    );

    sectionRefs.current.forEach((ref) => {
      if (ref) observer.observe(ref);
    });

    return () => observer.disconnect();
  }, []);

  const addToRefs = (el) => {
    if (el && !sectionRefs.current.includes(el)) {
      sectionRefs.current.push(el);
    }
  };

  return (
    <div className="lapp" id="linkstarapp">

      {/* 1. HERO SECTION */}
      <section className="lapp__hero lapp-animate" ref={addToRefs}>
        <div className="lapp__hero-bg">
          <div className="lapp__hero-glow"></div>
        </div>
        <div className="container lapp__hero-inner">
          <div className="lapp__hero-content-wrapper">
            <div className="lapp__badge">Incluido gratis con tus dispositivos</div>
            <h2 className="lapp__title">
              El panel de control de tus <span className="lapp__highlight">reseñas en Google</span>
            </h2>
            <p className="lapp__subtitle">
              Controla, mide y optimiza el rendimiento de todos tus carteles Linkstar desde un único lugar.
              <strong> Sin suscripciones. Sin costes ocultos.</strong>
            </p>
            <div className="lapp__ctas">
              <button type="button" className="lapp__btn lapp__btn--primary" onClick={(e) => { e.preventDefault(); onShop(); }}>
                Comprar Dispositivos
              </button>
              <button type="button" className="lapp__btn lapp__btn--secondary" onClick={(e) => e.preventDefault()}>
                Acceder a LinkstarApp
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </button>
            </div>

            <div className="lapp__stats">
              <div className="lapp__stat">
                <span className="lapp__stat-num"><CountUp end={500} suffix="+" /></span>
                <span className="lapp__stat-text">Negocios conectados</span>
              </div>
              <div className="lapp__stat-div"></div>
              <div className="lapp__stat">
                <span className="lapp__stat-num"><CountUp end={12} suffix="K+" /></span>
                <span className="lapp__stat-text">Reseñas conseguidas</span>
              </div>
              <div className="lapp__stat-div"></div>
              <div className="lapp__stat">
                <span className="lapp__stat-num">$<CountUp end={0} /></span>
                <span className="lapp__stat-text">Coste de plataforma</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 1.5 DASHBOARD MOCKUP SECTION */}
      <section className="lapp__dashboard-section container lapp-animate" ref={addToRefs}>
        <div className="lapp__dashboard-mock">
          <div className="lapp__dash-shell">

            {/* Sidebar */}
            <aside className="lapp__dash-sidebar">
              <div className="lapp__mock-logo">linkstar<span style={{ color: 'var(--color-orange)' }}>.</span></div>
              <span className="lapp__dash-sidebar-label">Menú principal</span>
              <nav className="lapp__dash-sidebar-nav">
                <span className="lapp__dash-nav-item lapp__dash-nav-item--active">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="2" width="16" height="20" rx="2" ry="2" /><path d="M9 22v-4h6v4" /></svg>
                  Mi Empresa
                </span>
                <span className="lapp__dash-nav-item">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="5" y="2" width="14" height="20" rx="2" ry="2" /><line x1="12" y1="18" x2="12.01" y2="18" /></svg>
                  Dispositivos
                </span>
                <span className="lapp__dash-nav-item">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
                  Reseñas
                </span>
                <span className="lapp__dash-nav-item">
                  {MapPinIcon}
                  Google Business
                </span>
                <span className="lapp__dash-nav-item">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="20" x2="12" y2="10" /><line x1="18" y1="20" x2="18" y2="4" /><line x1="6" y1="20" x2="6" y2="16" /></svg>
                  Reportes
                </span>
              </nav>

              <div className="lapp__dash-sidebar-divider" />

              <nav className="lapp__dash-sidebar-nav lapp__dash-sidebar-nav--secondary">
                <span className="lapp__dash-nav-item">Informes mensuales</span>
                <span className="lapp__dash-nav-item">Automatizaciones</span>
                <span className="lapp__dash-nav-item">Configuración</span>
              </nav>

              <div className="lapp__dash-profile">
                <div className="lapp__dash-avatar">A</div>
                <div className="lapp__dash-profile-info">
                  <span className="lapp__dash-profile-name">Ana, dueña</span>
                  <span className="lapp__dash-profile-email">ana@minegocio.com</span>
                </div>
              </div>
            </aside>

            {/* Main content */}
            <div className="lapp__dash-main2">
              <div className="lapp__dash-topbar2">
                <span className="lapp__dash-help">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.13.96.36 1.9.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0122 16.92z" /></svg>
                  ¿Necesitás ayuda? Contáctanos
                </span>
                <span className="lapp__dash-bell" aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 01-3.46 0" /></svg>
                </span>
              </div>

              <div className="lapp__dash-body">
                {/* KPI Cards */}
                <div className="lapp__dash-kpis">
                  {dashboardKpisMock.map((kpi, i) => (
                    <div className="lapp__dash-kpi" key={i}>
                      <div className="lapp__dash-kpi-header">
                        <span className="lapp__dash-kpi-label">{kpi.label}</span>
                        <span className="lapp__dash-kpi-icon">{kpi.icon}</span>
                      </div>
                      <span className="lapp__dash-kpi-value">{kpi.value}</span>
                      <span className="lapp__dash-kpi-trend lapp__dash-kpi-trend--up">↑ {kpi.trend}</span>
                    </div>
                  ))}
                </div>

                {/* Main content row */}
                <div className="lapp__dash-main">
                  {/* Reviews over time line chart */}
                  <div className="lapp__dash-chart-card">
                    <div className="lapp__dash-chart-header">
                      <span className="lapp__dash-chart-title">Reseñas en el tiempo</span>
                      <span className="lapp__dash-chart-sub">Últimas 8 semanas</span>
                    </div>
                    <div className="lapp__dash-linechart">
                      <svg viewBox="0 0 280 110" preserveAspectRatio="none" className="lapp__dash-linechart-svg">
                        <defs>
                          <linearGradient id="lapp-line-area" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="var(--color-orange)" stopOpacity="0.25" />
                            <stop offset="100%" stopColor="var(--color-orange)" stopOpacity="0" />
                          </linearGradient>
                        </defs>
                        <polygon
                          points={`0,100 ${reviewsTrendMock.map((v, i) => `${(i / (reviewsTrendMock.length - 1)) * 280},${100 - (v / Math.max(...reviewsTrendMock)) * 90}`).join(' ')} 280,100`}
                          fill="url(#lapp-line-area)"
                        />
                        <polyline
                          points={reviewsTrendMock.map((v, i) => `${(i / (reviewsTrendMock.length - 1)) * 280},${100 - (v / Math.max(...reviewsTrendMock)) * 90}`).join(' ')}
                          fill="none"
                          stroke="var(--color-orange)"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        {reviewsTrendMock.map((v, i) => (
                          <circle
                            key={i}
                            cx={(i / (reviewsTrendMock.length - 1)) * 280}
                            cy={100 - (v / Math.max(...reviewsTrendMock)) * 90}
                            r="3.5"
                            fill="#fff"
                            stroke="var(--color-orange)"
                            strokeWidth="2.5"
                          />
                        ))}
                      </svg>
                    </div>
                  </div>

                  {/* Star distribution */}
                  <div className="lapp__dash-chart-card">
                    <div className="lapp__dash-chart-header">
                      <span className="lapp__dash-chart-title">Distribución por estrellas</span>
                      <span className="lapp__dash-chart-sub">213 reseñas en total</span>
                    </div>
                    <div className="lapp__dash-stars-list">
                      {starDistributionMock.map((s) => (
                        <div className="lapp__dash-stars-row" key={s.stars}>
                          <span className="lapp__dash-stars-label">{s.stars} ★</span>
                          <div className="lapp__dash-stars-track">
                            <div className="lapp__dash-stars-fill" style={{ width: `${s.pct}%` }}></div>
                          </div>
                          <span className="lapp__dash-stars-pct">{s.pct}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* AI sentiment card */}
                <div className="lapp__dash-sentiment-card">
                  <span className="lapp__dash-sentiment-badge">NUEVO</span>
                  <h4 className="lapp__dash-sentiment-title">Análisis de sentimiento con IA</h4>
                  <p className="lapp__dash-sentiment-desc">Detectá automáticamente qué sienten tus clientes en cada reseña.</p>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* 2. FEATURES SECTION */}
      <section className="lapp__features container lapp-animate" ref={addToRefs}>
        <div className="lapp__section-header">
          <h3 className="lapp__section-title">Todo lo que necesitas para gestionar tus reseñas</h3>
        </div>

        <div className="lapp__features-grid">
          {features.map((feat, i) => (
            <div className="lapp__feature-card" key={i}>
              <div className="lapp__feature-top">
                <span className="lapp__feature-icon">{feat.icon}</span>
                <span className="lapp__feature-badge">{feat.badge}</span>
              </div>
              <h4 className="lapp__feature-title">{feat.title}</h4>
              <p className="lapp__feature-desc">{feat.description}</p>
              <ul className="lapp__feature-points">
                {feat.points.map((point, j) => (
                  <li key={j}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                    {point}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* 3. USE CASES SECTION */}
      <section className="lapp__cases container lapp-animate" ref={addToRefs}>
        <div className="lapp__section-header">
          <h3 className="lapp__section-title">Diseñado para cada tipo de negocio</h3>
          <p className="lapp__section-subtitle">Desde el restaurante de barrio hasta la agencia de marketing con múltiples clientes.</p>
        </div>

        <div className="lapp__cases-list">

          {/* CASE 1: Restaurantes — Ranking de empleados */}
          <div className="lapp__case-row">
            <div className="lapp__case-content">
              <div className="lapp__case-title-wrapper">
                <div className="lapp__case-icon">{useCases[0].icon}</div>
                <h4 className="lapp__case-title">{useCases[0].title}</h4>
                <span className="lapp__badge-soon">Próximamente</span>
              </div>
              <p className="lapp__case-subtitle">{useCases[0].subtitle}</p>
              <div className="lapp__case-example">{useCases[0].example}</div>
              <p className="lapp__case-desc">{useCases[0].description}</p>
              <ul className="lapp__case-highlights">
                {useCases[0].highlights.map((hl, j) => (
                  <li key={j}>
                    <span className="hl-icon">{hl.icon}</span>
                    <span>{hl.text}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="lapp__case-visual">
              <div className="lapp__case-mock">
                <div className="lapp__case-mock-header">
                  <span>Ranking de Empleados</span>
                  <span className="lapp__mock-header-badge">Próximamente</span>
                </div>
                <div className="lapp__case-mock-body lapp__case-mock-body--ranking">
                  {employeeRankingMock.map((emp, j) => (
                    <div className={`lapp__ranking-row${j === 0 ? ' lapp__ranking-row--top' : ''}`} key={j}>
                      <div className="lapp__ranking-pos">{emp.pos}</div>
                      <div className="lapp__ranking-avatar" style={{ background: ['var(--color-orange)', 'var(--color-forest)', 'var(--color-gold)', 'var(--color-navy)'][j] }}>
                        {emp.name.charAt(0)}
                      </div>
                      <div className="lapp__ranking-info">
                        <span className="lapp__ranking-name">{emp.name}</span>
                        <div className="lapp__ranking-bar-track">
                          <div className="lapp__ranking-bar-fill" style={{ width: `${emp.pct}%` }}></div>
                        </div>
                      </div>
                      <div className="lapp__ranking-count">
                        {emp.reviews}
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
                      </div>
                    </div>
                  ))}
                  <div className="lapp__ranking-footer">
                    <img src="/google-nfc-black.webp" alt="Tarjeta NFC" className="lapp__ranking-nfc" loading="lazy" />
                    <span>Cada tarjeta vinculada a un empleado</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* CASE 2: Cadenas — Vista por ubicaciones */}
          <div className="lapp__case-row">
            <div className="lapp__case-content">
              <div className="lapp__case-title-wrapper">
                <div className="lapp__case-icon">{useCases[1].icon}</div>
                <h4 className="lapp__case-title">{useCases[1].title}</h4>
              </div>
              <p className="lapp__case-subtitle">{useCases[1].subtitle}</p>
              <div className="lapp__case-example">{useCases[1].example}</div>
              <p className="lapp__case-desc">{useCases[1].description}</p>
              <ul className="lapp__case-highlights">
                {useCases[1].highlights.map((hl, j) => (
                  <li key={j}>
                    <span className="hl-icon">{hl.icon}</span>
                    <span>{hl.text}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="lapp__case-visual">
              <div className="lapp__case-mock">
                <div className="lapp__case-mock-header">
                  <span>Vista por Ubicaciones</span>
                  <span className="lapp__mock-header-badge">12 locales</span>
                </div>
                <div className="lapp__case-mock-body lapp__case-mock-body--locations">
                  <div className="lapp__locations-grid">
                    {locationsMock.map((loc, j) => (
                      <div className="lapp__location-card" key={j}>
                        <div className="lapp__location-header">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-gold)" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
                          <span className="lapp__location-name">{loc.name}</span>
                        </div>
                        <span className="lapp__location-scans">{loc.scans}</span>
                        <span className={`lapp__location-trend lapp__location-trend--${loc.status}`}>{loc.trend}</span>
                      </div>
                    ))}
                  </div>
                  <div className="lapp__locations-comparison">
                    <div className="lapp__comparison-label">Escaneos por local</div>
                    <div className="lapp__comparison-bars">
                      {[85, 67, 24, 54].map((h, j) => (
                        <div className="lapp__comparison-bar-wrap" key={j}>
                          <div className="lapp__comparison-bar" style={{ height: `${h}%` }}></div>
                          <span className="lapp__comparison-bar-label">{['Centro', 'Norte', 'Sur', 'Este'][j]}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* CASE 3: Marketing — Gestión multi-cliente */}
          <div className="lapp__case-row">
            <div className="lapp__case-content">
              <div className="lapp__case-title-wrapper">
                <div className="lapp__case-icon">{useCases[2].icon}</div>
                <h4 className="lapp__case-title">{useCases[2].title}</h4>
              </div>
              <p className="lapp__case-subtitle">{useCases[2].subtitle}</p>
              <div className="lapp__case-example">{useCases[2].example}</div>
              <p className="lapp__case-desc">{useCases[2].description}</p>
              <ul className="lapp__case-highlights">
                {useCases[2].highlights.map((hl, j) => (
                  <li key={j}>
                    <span className="hl-icon">{hl.icon}</span>
                    <span>{hl.text}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="lapp__case-visual">
              <div className="lapp__case-mock">
                <div className="lapp__case-mock-header">
                  <span>Panel Multi-Cliente</span>
                  <span className="lapp__mock-header-badge">15 negocios</span>
                </div>
                <div className="lapp__case-mock-body lapp__case-mock-body--clients">
                  <div className="lapp__clients-list">
                    {multiClientMock.map((client, j) => (
                      <div className="lapp__client-row" key={j}>
                        <div className="lapp__client-info">
                          <span className="lapp__client-name">{client.name}</span>
                          <span className="lapp__client-meta">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-forest)" strokeWidth="2.5"><rect x="4" y="2" width="16" height="20" rx="2" ry="2" /></svg>
                            {client.devices} dispositivos
                          </span>
                        </div>
                        <div className="lapp__client-stats">
                          <span className="lapp__client-reviews">{client.reviews} reseñas</span>
                          <span className="lapp__client-rating">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="#F59E0B" stroke="#F59E0B" strokeWidth="1"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
                            {client.rating}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="lapp__clients-summary">
                    <div className="lapp__summary-item">
                      <span className="lapp__summary-value">15</span>
                      <span className="lapp__summary-label">Clientes</span>
                    </div>
                    <div className="lapp__summary-item">
                      <span className="lapp__summary-value">42</span>
                      <span className="lapp__summary-label">Dispositivos</span>
                    </div>
                    <div className="lapp__summary-item">
                      <span className="lapp__summary-value">1.2K</span>
                      <span className="lapp__summary-label">Reseñas totales</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* 4. PRICING CTA SECTION */}
      <section className="lapp__pricing container lapp-animate" ref={addToRefs}>
        <div className="lapp__pricing-box">
          <div className="lapp__pricing-glow"></div>
          <div className="lapp__pricing-content">
            <span className="lapp__pricing-overline">Sin sorpresas</span>
            <h3 className="lapp__pricing-title">¿Cuánto cuesta la plataforma?</h3>
            <div className="lapp__pricing-amount">$0 <span className="lapp__pricing-period">/ siempre</span></div>
            <p className="lapp__pricing-desc">Incluida gratis con la compra de cualquier dispositivo Linkstar. Sin suscripciones ni costes ocultos.</p>

            <ul className="lapp__pricing-features">
              <li><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg> Panel de control completo</li>
              <li><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg> Estadísticas en tiempo real</li>
              <li><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg> Dispositivos ilimitados</li>
              <li><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg> Ubicaciones ilimitadas</li>
            </ul>

            <button className="lapp__btn lapp__btn--primary lapp__pricing-btn" onClick={(e) => { e.preventDefault(); onShop(); }}>
              Comprar tu Linkstar
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </button>
          </div>
        </div>
      </section>

      {/* 5. FAQ SECTION */}
      <FAQ 
        data={linkstarFaqData} 
        title="Dudas sobre" 
        titleSpan="LinkstarApp" 
        description="Resolvé tus inquietudes sobre cómo funciona nuestra plataforma." 
        onContact={onContact}
      />
    </div>
  );
}
