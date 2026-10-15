import { Link } from 'react-router-dom';
import Icon from '../../components/Icon/Icon';
import GoogleLogo from '../../components/GoogleLogo/GoogleLogo';
import { formatArs } from '../../lib/format';
import { PUBLIC_ROUTES } from '../../lib/routes';
import {
  ClosingCta, Expositor, FaqSection, PageHero, PhotoSlot, Reveal, Section, SectionHead,
  StartButton, TrustStrip,
} from './LandingBlocks';
import { AiReplyMiniShot, DashboardShot, GoogleConnectedCard, SeoScoreShot } from './LandingShots';
import { FEATURE_LINKS, featurePath, usePageTitle, usePublicPlans } from './landingModel';
import { HOME_FAQS } from './landingFaqs';

/*
 * Inicio (/): qué es Linkstar, cómo funciona en tres pasos, y una puerta a cada
 * una de las otras páginas. Es también la «página principal» que Google revisa
 * para verificar la app OAuth: tiene que decir qué hace el producto con la ficha
 * y enlazar la política de privacidad (en el pie).
 */

/* Los pasos hablan del panel, no del expositor: el hardware se vende en
   linkstarapp.com; esta landing vende el software (como mytapstar / tapstar). */
const STEPS = [
  {
    title: 'Conectá tu ficha de Google',
    text: 'Iniciás sesión con la cuenta que administra tu Perfil de Empresa y en un minuto tus reseñas, tus métricas y los datos de tu ficha están en el panel.',
    visual: <GoogleConnectedCard />,
  },
  {
    title: 'Mirá tu puntaje y qué te falta',
    text: 'El análisis SEO revisa tu ficha y le pone una nota de 0 a 100, con la próxima acción que más puntos te suma para aparecer más en Google.',
    visual: <SeoScoreShot />,
  },
  {
    title: 'Respondé con IA y automatizá',
    text: 'La IA escribe la respuesta con tu tono: la revisás y la publicás, o dejás una regla para que las reseñas nuevas se respondan solas.',
    visual: <AiReplyMiniShot />,
  },
];

function HeroArt() {
  return (
    <div className="landing-hero-art">
      <DashboardShot maxHeight={430} />
      <Expositor className="landing-hero-art__expositor" />
      <div className="landing-hero-art__toast" aria-hidden="true">
        <span className="landing-hero-art__toast-icon"><GoogleLogo size={18} /></span>
        <span>
          <strong>Nueva reseña · ★★★★★</strong>
          <span>«Excelente atención, volvemos seguro»</span>
        </span>
      </div>
    </div>
  );
}

export default function HomePage() {
  usePageTitle('linkstar · Más reseñas en Google');
  const plans = usePublicPlans();
  const business = plans.find((p) => p.code === 'business');

  return (
    <>
      <PageHero
        tag="Para negocios que viven de sus reseñas en Google"
        title={<>Posicionate como <span className="landing-accent">la opción N.º&nbsp;1</span> en Google Maps y ganá más clientes</>}
        subtitle="Cada reseña bien respondida y cada punto de SEO son una venta que se lleva tu negocio y no tu competencia. Linkstar te dice qué hacer y te ayuda a hacerlo."
        actions={(
          <>
            <StartButton />
            <Link to={{ hash: '#como-funciona' }} className="landing-btn landing-btn--ghost">
              Ver cómo funciona <Icon name="chevronDown" size={16} />
            </Link>
          </>
        )}
        note="Plan gratis sin tarjeta · Sin permanencia"
        visual={<HeroArt />}
      />

      <Section tone="white" className="landing-trust-wrap">
        <TrustStrip />
      </Section>

      {/* ─── Cómo funciona ─── */}
      <Section id="como-funciona" tone="light">
        <SectionHead
          tag="Cómo funciona"
          title="Empezá en tres pasos"
          subtitle="Conectás tu ficha y el panel hace el resto: te dice qué mejorar y te ayuda a responder cada reseña."
          center
        />
        <div className="landing-steps">
          {STEPS.map((step, i) => (
            <Reveal key={step.title} className="landing-step">
              <div className="landing-step__visual">{step.visual}</div>
              <span className="landing-step__number">Paso {i + 1}</span>
              <h3 className="landing-step__title">{step.title}</h3>
              <p className="landing-step__text">{step.text}</p>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* ─── Lo que hay adentro ─── */}
      <Section tone="white">
        <SectionHead
          tag="Descubrí Linkstar"
          title="Todo lo que vas a encontrar adentro"
          subtitle="Un panel pensado para negocios con uno o con muchos locales, con un plan gratis para empezar."
          center
        />
        <div className="landing-explore">
          <Reveal className="landing-explore__card landing-explore__card--wide">
            <span className="landing-explore__icon"><Icon name="sparkles" size={20} /></span>
            <h3>Funciones</h3>
            <p>SEO, reseñas, respuestas con IA, tu ficha de Google, reportes y expositores: todo en un solo lugar.</p>
            <div className="landing-explore__chips">
              {FEATURE_LINKS.map((f) => (
                <Link key={f.hash} to={featurePath(f.hash)} className="landing-chip">
                  <Icon name={f.icon} size={14} /> {f.title}
                </Link>
              ))}
            </div>
            <Link to={PUBLIC_ROUTES.features} className="landing-explore__link">
              Descubrir las funciones <Icon name="arrowRight" size={15} />
            </Link>
          </Reveal>

          <Reveal className="landing-explore__card">
            <span className="landing-explore__icon"><Icon name="store" size={20} /></span>
            <h3>Multiubicaciones</h3>
            <p>Todos tus locales en un panel: compará reseñas y puntajes, con tonos, reglas y equipo por local.</p>
            <Link to={PUBLIC_ROUTES.multiLocation} className="landing-explore__link">
              Ver cómo funciona <Icon name="arrowRight" size={15} />
            </Link>
          </Reveal>

          <Reveal className="landing-explore__card">
            <span className="landing-explore__icon"><Icon name="tag" size={20} /></span>
            <h3>Planes</h3>
            <p>
              Gratis, sin tarjeta y para siempre. Cuando quieras más, Business
              {business && Number(business.price_ars) > 0 ? ` por ${formatArs(business.price_ars)} al mes` : ''}, sin permanencia.
            </p>
            <Link to={PUBLIC_ROUTES.plans} className="landing-explore__link">
              Ver los planes <Icon name="arrowRight" size={15} />
            </Link>
          </Reveal>
        </div>
      </Section>

      {/* ─── Testimonio ───
          Vineria Martu es un cliente real y aprobó aparecer acá. El texto está
          escrito en su nombre y con su permiso: si cambia, se cambia con él. */}
      <Section tone="light">
        <Reveal className="landing-testimonial">
          <PhotoSlot label="el dueño de Vineria Martu en el local, o el frente de la vinería" ratio="1 / 1" className="landing-testimonial__photo" />
          <figure className="landing-testimonial__body">
            <span className="landing-testimonial__stars" aria-label="5 estrellas">★★★★★</span>
            <blockquote>
              «Antes respondíamos las reseñas cuando nos acordábamos y no sabíamos bien qué decía la gente de
              nosotros. Ahora entramos al panel, las vemos todas juntas y las contestamos en un minuto con la ayuda
              de la IA, hasta las que no son tan lindas, que son las que más hay que cuidar. Y por fin sabemos qué
              tenemos que mejorar.»
            </blockquote>
            <figcaption>
              <strong>Vineria Martu</strong>
              <span>Dueño · Cliente de Linkstar</span>
            </figcaption>
          </figure>
        </Reveal>
      </Section>

      <FaqSection items={HOME_FAQS} />
      <ClosingCta />
    </>
  );
}
