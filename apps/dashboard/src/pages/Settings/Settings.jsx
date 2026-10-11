import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Icon from '../../components/Icon/Icon';
import PageHeader from '../../components/PageHeader/PageHeader';
import Select from '../../components/Select/Select';
import LocationsPage from '../Locations/Locations';
import GoogleFichas from './GoogleFichas';
import BrandToneModal from '../Reviews/BrandToneModal';
import { fetchLocationRows } from '../../lib/catalogApi';
import TeamMembers from './TeamMembers';
import ActivityLog from './ActivityLog';
import PlanTab from './PlanTab';
import CardHead from './SettingsCardHead';
import { useOrg } from '../../context/OrgContext';
import { PUBLIC_ROUTES, SETTINGS_TABS, SETTINGS_TAB_ALIASES, settingsTabPath } from '../../lib/routes';
import './Settings.css';

// Los ids son los mismos que van en la URL (/panel/configuracion/equipo), así
// que no hace falta traducir entre el id de la pestaña y su path. Los nombres
// viejos ('team', 'billing', 'facturacion', 'employees'…) siguen funcionando
// como alias, en SETTINGS_TAB_ALIASES. La primera es la que se abre por defecto.
const TABS = [
  { id: 'plan', label: 'Plan', icon: 'card' },
  { id: 'local', label: 'Gestión local', icon: 'pin' },
  { id: 'equipo', label: 'Equipo', icon: 'users' },
  { id: 'legal', label: 'Legal', icon: 'gear' },
];

/* ─── Gestión local ───────────────────────────────────────────── */
const CONTACT_LOCATION_OPTIONS = [{ value: 'all', label: 'Todos los locales' }];

function LocalTab() {
  const { org } = useOrg();
  const [contactLocation, setContactLocation] = useState('all');
  // El mismo modal de tono que abre Reseñas, con el selector de local. Todavía
  // no guarda (sólo frontend, ver BrandToneModal): por eso la lista de abajo
  // sigue vacía.
  const [toneLocations, setToneLocations] = useState(null);

  function openTone() {
    setToneLocations([]);
    fetchLocationRows(org?.organization_id)
      .then((rows) => setToneLocations(rows.map((l) => ({ value: l.id, label: l.name }))))
      .catch(() => {});
  }

  return (
    <div className="settings-panel">
      {/* Primero Google y después las sucursales, como en Tapstar: la cuenta de
          Google es lo que se conecta una vez, y cada ficha se vincula a una
          sucursal de la lista de abajo. `--raised`: el menú de cada selector se
          abre hacia abajo, sobre la tarjeta de Sucursales (que tiene el suyo). */}
      <div className="settings-card settings-card--raised settings-card--top">
        <CardHead
          icon="pin"
          iconVariant="navy"
          title="Fichas de Google"
          subtitle={
            <p className="settings-card__subtitle">
              La cuenta de Google que administra tus fichas, y a qué sucursal corresponde cada una.
            </p>
          }
        />

        {/* Esta tarjeta mostró primero una cuenta conectada inventada (con el
            nombre y el correo de una persona real) y después un texto diciendo
            que la conexión se estaba construyendo. Desde la fase 4 es real:
            conectar, y vincular cada ficha con su sucursal. Ver GoogleFichas. */}
        <GoogleFichas />
      </div>

      {/* Ubicaciones reales. LocationsPage se renderiza acá sin su encabezado ni
          su pie propios (`embedded`): esta tarjeta trae el título. Desde oct 2026
          es sólo la lista (sin tarjetas de números ni vista de grilla). */}
      <div className="settings-card settings-card--raised">
        <CardHead
          icon="store"
          iconVariant="orange"
          title="Sucursales"
          subtitle={
            <p className="settings-card__subtitle">
              Cada local de tu negocio y a dónde lleva su expositor cuando alguien lo toca.
            </p>
          }
        />
        <LocationsPage embedded />
      </div>

      <div className="settings-card">
        <CardHead
          icon="palette"
          iconVariant="gold"
          title="Tonos de marca"
          subtitle={<p className="settings-card__subtitle">Definí cómo responde la IA por local. El tono específico de un local tiene prioridad sobre el global.</p>}
          action={<button type="button" className="settings-save-btn" onClick={openTone}>+ Añadir tono</button>}
        />

        <div className="settings-empty-state">
          <div className="settings-empty-state__icon"><Icon name="palette" size={22} /></div>
          <p className="settings-empty-state__title">No hay tonos configurados todavía.</p>
          <p className="settings-empty-state__text">Creá tu primer tono para que la IA responda con tu voz.</p>
        </div>
      </div>

      {toneLocations && <BrandToneModal locationOptions={toneLocations} onClose={() => setToneLocations(null)} />}

      <div className="settings-card">
        <CardHead
          icon="mail"
          iconVariant="forest"
          title="Email de contacto para reseñas negativas"
          subtitle={<p className="settings-card__subtitle">La IA lo va a citar en las respuestas a reseñas de 1, 2 y 3 estrellas.</p>}
        />

        <div className="settings-contact-email-row">
          <Select
            value={contactLocation}
            onChange={setContactLocation}
            options={CONTACT_LOCATION_OPTIONS}
            triggerClassName="settings-select"
          />
          <input type="email" placeholder="contacto@tunegocio.com" className="settings-text-input" />
          <button type="button" className="settings-save-btn">Guardar</button>
        </div>
        <p className="settings-card__hint settings-card__hint--block">
          Distinto de las alertas de Automatizaciones (que te avisan a vos). Este email es público — el cliente lo va a ver en la respuesta visible en Google Maps.
        </p>
      </div>
    </div>
  );
}

/* ─── Equipo ──────────────────────────────────────────────────── */
function TeamTab() {
  return (
    <div className="settings-panel">
      {/* Sólo las personas que entran al panel (memberships/invitations del
          0002, cableado en la 0020) y lo que hicieron. Los empleados —el mozo,
          el cajero: no inician sesión, existen para atribuirles escaneos— se
          sacaron de acá en oct 2026: sin tarjetas personales a la venta su
          ranking está siempre vacío (decisión 11). pages/Employees sigue escrita
          y leyendo v_employee_leaderboard de verdad; cuando existan las
          tarjetas, vuelve a tener un lugar. */}
      <TeamMembers />

      <ActivityLog />
    </div>
  );
}

/* ─── Legal ───────────────────────────────────────────────────── */
/* Esta lista eran cinco botones que no abrían nada, y dos de los documentos ni
 * existían (DPA, Política de Cookies — esta última además sobraba: el panel no
 * usa cookies de seguimiento). Sobrevivió a la limpieza de maquetas de la fase 2
 * porque estaba embebida acá y no era una pantalla propia, igual que la tarjeta
 * de "Cuentas de Google conectadas".
 *
 * Ahora son enlaces de verdad y sólo a lo que existe. Al agregar un documento,
 * agregarlo acá con su URL — no como una fila sin destino. */
const LEGAL_DOCS = [
  {
    label: 'Política de privacidad',
    hint: 'Qué datos guardamos y qué podés hacer con ellos.',
    href: PUBLIC_ROUTES.privacy,
    external: false,
  },
  {
    label: 'Términos y condiciones',
    hint: 'Las condiciones del sitio de venta de expositores.',
    href: 'https://linkstarapp.com/terminos',
    external: true,
  },
];

function LegalTab() {
  return (
    <div className="settings-panel">
      <div className="settings-card">
        <CardHead
          icon="gear"
          iconVariant="navy"
          title="Legal"
          subtitle={<p className="settings-card__subtitle">Documentos legales y políticas</p>}
        />

        <div className="settings-legal-list">
          {LEGAL_DOCS.map((doc) => (
            <a
              key={doc.label}
              className="settings-legal-row"
              href={doc.href}
              {...(doc.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
            >
              <Icon name="fileText" size={16} />
              <span>
                {doc.label}
                <small className="settings-legal-row__hint">{doc.hint}</small>
              </span>
              <Icon name="externalLink" size={14} className="settings-legal-row__ext" />
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Root ────────────────────────────────────────────────────── */
/* La pestaña abierta vive en la URL (/panel/configuracion/:tab) y no en un
   useState: así se puede enlazar directo a una pestaña —Dispositivos enlaza a
   "Gestión local"—, compartir el enlace y usar atrás del navegador entre
   pestañas. Sin :tab, o con una pestaña que no existe, se abre la primera. */
export default function SettingsPage() {
  const { tab: tabParam } = useParams();
  const navigate = useNavigate();

  const resolved = SETTINGS_TAB_ALIASES[tabParam] || tabParam;
  const tab = SETTINGS_TABS.includes(resolved) ? resolved : SETTINGS_TABS[0];

  return (
    <div className="settings-page">
      <PageHeader
        eyebrow="Configuración"
        title="Configuración"
        subtitle="Tu plan, tus locales, tu equipo y los documentos legales"
      />

      <div className="settings-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`settings-tab ${tab === t.id ? 'settings-tab--active' : ''}`}
            onClick={() => navigate(settingsTabPath(t.id))}
          >
            <Icon name={t.icon} size={15} />
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'plan' && <PlanTab />}
      {tab === 'local' && <LocalTab />}
      {tab === 'equipo' && <TeamTab />}
      {tab === 'legal' && <LegalTab />}
    </div>
  );
}
