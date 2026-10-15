import { LandingShot } from './LandingBlocks';
import Icon from '../../components/Icon/Icon';
import GoogleLogo from '../../components/GoogleLogo/GoogleLogo';
import CompanyMockup from '../Company/CompanyMockup';
import { LocationSummaryCard } from '../Company/CompanyBlocks';
import ReviewsMockup from '../Reviews/ReviewsMockup';
import { ReviewDetail } from '../Reviews/ReviewsBlocks';
import GoogleSeoLocalMockup from '../GoogleBusiness/GoogleSeoLocalMockup';
import { NextMission, SeoSummary } from '../GoogleBusiness/GoogleSeoBlocks';
import { nextMission } from '../GoogleBusiness/googleSeoModel';
import { SAMPLE_SEO_LOCATIONS, SAMPLE_SEO_MAIN } from '../GoogleBusiness/googleSeoSample';
import GoogleMetricsMockup from '../GoogleBusiness/GoogleMetricsMockup';
import ReportsSentimentMockup from '../Reports/ReportsSentimentMockup';
import { ComplaintsByLocation } from '../Reports/SentimentBlocks';
import { AutoReplyCard, ScopeCard } from '../Automations/AutomationsBlocks';
import { SAMPLE_AUTO_REPLY } from '../Automations/automationsSample';
import {
  SAMPLE_AI_DRAFT,
  SAMPLE_AI_REVIEW,
  SAMPLE_COMPLAINTS_BY_LOCATION,
  SAMPLE_DEVICES,
  SAMPLE_LOCATION_RULE,
  SAMPLE_LOCATION_SUMMARY,
  SAMPLE_SCOPE_OPTIONS,
  SAMPLE_TEAM,
} from './landingSample';
import '../Company/Company.css';
import '../Reviews/Reviews.css';
import '../Automations/Automations.css';
import '../GoogleBusiness/GoogleBusiness.css';
import '../GoogleBusiness/GoogleMetrics.css';
import '../GoogleBusiness/GoogleSeoLocal.css';
import '../Reports/Reports.css';

/*
 * Las ilustraciones de la landing. Casi todas son pantallas o bloques REALES del
 * panel con datos inventados (los *Mockup.jsx de cada sección, googleSeoSample.js
 * y landingSample.js) dentro de un LandingShot, así lo que se promete es lo que
 * hay adentro. Las tarjetas propias del final (Google conectado, expositores,
 * equipo) existen porque el panel no tiene un bloque que se pueda dibujar suelto
 * para eso.
 */

const noop = () => {};

/* ─── Pantallas completas, recortadas ─────────────────────────────────── */
export function DashboardShot({ maxHeight = 460 }) {
  return <LandingShot maxHeight={maxHeight}><CompanyMockup /></LandingShot>;
}

export function SeoShot() {
  return <LandingShot maxHeight={470}><GoogleSeoLocalMockup /></LandingShot>;
}

export function ReviewsShot() {
  return <LandingShot maxHeight={470}><ReviewsMockup isBusiness /></LandingShot>;
}

export function MetricsShot() {
  return <LandingShot maxHeight={470}><GoogleMetricsMockup /></LandingShot>;
}

export function SentimentShot() {
  return <LandingShot maxHeight={470}><ReportsSentimentMockup /></LandingShot>;
}

/* ─── Bloques sueltos ──────────────────────────────────────────────────── */

/* El puntaje SEO y la próxima misión (Inicio, paso 2). */
export function SeoScoreShot() {
  return (
    <LandingShot width={640} bare>
      <div className="gb-page landing-shot-stack">
        <SeoSummary selected={SAMPLE_SEO_LOCATIONS[0]} />
        <NextMission mission={nextMission(SAMPLE_SEO_MAIN)} onNavigateSection={noop} onShowCategory={noop} />
      </div>
    </LandingShot>
  );
}

/* Una reseña crítica con el borrador de la IA ya escrito en la caja. */
function AiReviewDetail() {
  return (
    <ReviewDetail
      review={SAMPLE_AI_REVIEW}
      showBranch
      canReply
      isBusiness
      draft={SAMPLE_AI_DRAFT}
      onDraft={noop}
      editing={false}
      onEdit={noop}
      onCancelEdit={noop}
      onPublish={noop}
      publishing={false}
      replyError={null}
      onGenerate={noop}
      aiDraft
      onOpenTone={noop}
      onShare={noop}
      onBack={noop}
    />
  );
}

/* La misma reseña, sola y sin marco (Inicio, paso 3). */
export function AiReplyMiniShot() {
  return (
    <LandingShot width={640} bare>
      <div className="reviews-page"><AiReviewDetail /></div>
    </LandingShot>
  );
}

/* La reseña con el borrador y la regla de respuesta automática debajo (asoma:
   el marco la recorta). */
export function AiShot() {
  return (
    <LandingShot width={720} maxHeight={520}>
      <div className="reviews-page landing-shot-stack">
        <AiReviewDetail />
        <div className="automations-page landing-shot-flush">
          <AutoReplyCard rule={SAMPLE_AUTO_REPLY} onChange={noop} savedEnabled dirty={false} onSave={noop} onDisable={noop} />
        </div>
      </div>
    </LandingShot>
  );
}

export function LocationSummaryShot() {
  return (
    <LandingShot width={980}>
      <div className="company-page">
        <LocationSummaryCard rows={SAMPLE_LOCATION_SUMMARY} />
      </div>
    </LandingShot>
  );
}

export function LocationRuleShot() {
  return (
    <LandingShot width={720} maxHeight={520}>
      <div className="automations-page">
        <div className="automations-stack">
          <ScopeCard options={SAMPLE_SCOPE_OPTIONS} value="pichincha" onChange={noop} />
          <AutoReplyCard rule={SAMPLE_LOCATION_RULE} onChange={noop} savedEnabled dirty={false} onSave={noop} onDisable={noop} />
        </div>
      </div>
    </LandingShot>
  );
}

export function ComplaintsShot() {
  return (
    <LandingShot width={720}>
      <div className="reports-page">
        <ComplaintsByLocation byLocation={SAMPLE_COMPLAINTS_BY_LOCATION} />
      </div>
    </LandingShot>
  );
}

/* ─── Tarjetas propias de la landing ───────────────────────────────────── */

/* Paso 2 de «Cómo funciona»: la ficha ya conectada. */
export function GoogleConnectedCard() {
  return (
    <div className="landing-mini" aria-hidden="true">
      <div className="landing-mini__head">
        <GoogleLogo size={22} />
        <div>
          <strong>Perfil de Empresa de Google</strong>
          <span>Conectado · cuenta del negocio</span>
        </div>
        <span className="landing-mini__ok"><Icon name="check" size={13} strokeWidth={3} /></span>
      </div>
      <ul className="landing-mini__list">
        <li><Icon name="store" size={15} /> Café del Parque · Centro <em>Vinculada</em></li>
        <li><Icon name="store" size={15} /> Café del Parque · Fisherton <em>Vinculada</em></li>
      </ul>
      <p className="landing-mini__foot"><Icon name="refresh" size={13} /> Reseñas al día · leídas hace 12 min</p>
    </div>
  );
}

/* Funciones → Expositores: lo que el panel hace con ellos. El último dejó de
   recibir escaneos, que es lo que dispara el aviso por mail. */
export function DevicesCard() {
  return (
    <div className="landing-mini" aria-hidden="true">
      <div className="landing-mini__title">
        <Icon name="qr" size={17} /> Tus expositores · últimos 30 días
      </div>
      <ul className="landing-team">
        {SAMPLE_DEVICES.map((d) => (
          <li key={d.name}>
            <span className={`landing-team__avatar${d.idle ? ' landing-team__avatar--alert' : ''}`}>
              <Icon name={d.idle ? 'alert' : 'scan'} size={15} />
            </span>
            <span className="landing-team__who">
              <strong>{d.name}</strong>
              <span>{d.idle ?? `${d.location} · NFC + QR`}</span>
            </span>
            <span className="landing-team__scope">{d.scans} escaneos</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* Multiubicaciones: cada encargado con sus locales. */
export function TeamCard() {
  return (
    <div className="landing-mini" aria-hidden="true">
      <div className="landing-mini__title">
        <Icon name="users" size={17} /> Equipo · 4 de 10
      </div>
      <ul className="landing-team">
        {SAMPLE_TEAM.map((m) => (
          <li key={m.name}>
            <span className="landing-team__avatar">{m.initials}</span>
            <span className="landing-team__who">
              <strong>{m.name}</strong>
              <span>{m.role}</span>
            </span>
            <span className="landing-team__scope"><Icon name="store" size={12} /> {m.scope}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
