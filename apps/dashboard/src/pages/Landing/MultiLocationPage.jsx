import { Link } from 'react-router-dom';
import Icon from '../../components/Icon/Icon';
import SoonBadge from '../../components/SoonBadge/SoonBadge';
import { PUBLIC_ROUTES } from '../../lib/routes';
import {
  ClosingCta, FaqSection, FeatureRow, PageHero, Reveal, Section, SectionHead, StartButton,
} from './LandingBlocks';
import { usePageTitle, usePublicPlans } from './landingModel';
import {
  ComplaintsShot, DashboardShot, LocationRuleShot, LocationSummaryShot, ReviewsShot, TeamCard,
} from './LandingShots';
import { MULTI_LOCATION_FAQS } from './landingFaqs';

/*
 * Multiubicaciones (/multiubicaciones): todo lo que el panel hace por local y
 * entre locales. Los límites salen de `plans.max_locations`, no de un número
 * escrito acá.
 */

function locationsLabel(plan) {
  if (plan.max_locations == null) return 'Sin límite de locales';
  return plan.max_locations === 1 ? '1 local' : `Hasta ${plan.max_locations} locales`;
}

export default function MultiLocationPage() {
  usePageTitle('Multiubicaciones · linkstar');
  const plans = usePublicPlans();

  return (
    <>
      <PageHero
        tag="Multiubicaciones"
        title={<>Todos tus locales, <span className="landing-accent">un solo panel</span></>}
        subtitle="Compará cómo le va a cada sucursal, respondé las reseñas de todas desde una bandeja y dale a cada encargado acceso sólo a lo suyo."
        actions={(
          <>
            <StartButton />
            <Link to={`${PUBLIC_ROUTES.plans}#contacto`} className="landing-btn landing-btn--ghost">
              Hablar con ventas
            </Link>
          </>
        )}
        note="Cada local con su ficha de Google, sus expositores y sus reglas."
        visual={<LocationSummaryShot />}
      />

      <Section tone="white" className="landing-features">
        <FeatureRow
          icon="store"
          tag="Comparación"
          title="Sabé qué local va mejor, y por qué"
          text="El resumen por local te muestra reseñas, puntaje, cuántas respondiste, sentimiento y escaneos, lado a lado. Cada pantalla tiene el filtro «Todos los locales»."
          bullets={[
            'Puntaje y reseñas de cada sucursal en el período que elijas.',
            'Qué porcentaje de reseñas respondió cada equipo.',
            'Escaneos de los expositores de cada local.',
          ]}
          visual={<DashboardShot maxHeight={470} />}
        />

        <FeatureRow
          reverse
          icon="message"
          tag="Una bandeja"
          title="Las reseñas de todas tus fichas, en un solo lugar"
          text="No hace falta entrar a cada ficha de Google. Filtrás por local cuando querés mirar una sola, o las ves todas juntas."
          bullets={[
            'Cada reseña dice de qué local es.',
            'Alertas por mail de reseñas negativas de cualquiera de tus locales.',
          ]}
          visual={<ReviewsShot />}
        />

        <FeatureRow
          ai
          icon="sparkles"
          tag="Tonos y reglas por local"
          title="Cada local puede responder a su manera"
          text="Los tonos de marca y la respuesta automática se configuran para todos los locales o para algunos en particular. La regla de un local tiene preferencia sobre la general."
          bullets={[
            'Un tono para todos, o uno distinto para cada sucursal.',
            'Respuesta automática prendida en un local y apagada en otro.',
            'Un mail de contacto distinto por local para las reseñas negativas.',
          ]}
          visual={<LocationRuleShot />}
        />

        <FeatureRow
          reverse
          icon="frown"
          tag="Dónde están las quejas"
          title="Encontrá el local que necesita atención"
          text="El análisis de sentimiento te muestra qué porcentaje de reseñas negativas tiene cada sucursal, para saber dónde poner el foco."
          visual={<ComplaintsShot />}
        />

        <FeatureRow
          icon="users"
          tag="Equipo por local"
          title="Cada encargado ve y responde sólo su local"
          text="Invitá a tu equipo con su propio usuario. A los encargados les asignás sus locales: ven sus reseñas y responden sólo ahí."
          bullets={[
            'Roles de propietario, administrador, encargado y sólo lectura.',
            'Registro de actividad para saber quién hizo qué.',
            { key: 'reports', content: <>Informes mensuales por local <SoonBadge /></> },
          ]}
          visual={<TeamCard />}
        />
      </Section>

      <Section tone="light">
        <SectionHead tag="Planes" title="Cuántos locales entran en cada plan" center />
        <Reveal className="landing-limits">
          {plans.map((plan) => (
            <div key={plan.code} className={`landing-limits__item${plan.code === 'business' ? ' landing-limits__item--featured' : ''}`}>
              <span className="landing-limits__name">{plan.name}</span>
              <strong className="landing-limits__value">{locationsLabel(plan)}</strong>
            </div>
          ))}
        </Reveal>
        <p className="landing-limits__more">
          <Link to={PUBLIC_ROUTES.plans}>Ver todo lo que incluye cada plan <Icon name="arrowRight" size={14} /></Link>
        </p>
      </Section>

      <FaqSection items={MULTI_LOCATION_FAQS} />
      <ClosingCta
        title="Tus locales, ordenados desde hoy."
        text="Empezá con uno y sumá los demás cuando quieras. Si tenés una cadena, lo armamos a tu medida."
      />
    </>
  );
}
