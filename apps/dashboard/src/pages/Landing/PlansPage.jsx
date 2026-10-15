import { Link } from 'react-router-dom';
import Icon from '../../components/Icon/Icon';
import ContactForm from '../../components/ContactForm/ContactForm';
import { effectiveCheckoutMode } from '../../lib/config';
import { formatArs } from '../../lib/format';
import { FaqSection, PageHero, Reveal, Section, SectionHead } from './LandingBlocks';
import { useLandingActions, usePageTitle, usePublicPlans } from './landingModel';
import { PLANS_FAQS } from './landingFaqs';

/*
 * Planes (/planes): simple y directa. Precios, límites y bullets salen de la
 * tabla `plans` (usePublicPlans); lo único escrito acá es el detalle de lo que
 * suma Business, agrupado como en Tapstar, ADENTRO de su tarjeta (antes era un
 * bloque suelto debajo de las tres que no decía a qué plan correspondía).
 *
 * Abajo va el formulario de contacto (#contacto): es el destino de «Contactar
 * con ventas», del cierre de cada página y del pie.
 */

const BUSINESS_GROUPS = [
  {
    title: 'Respondé mejor y más rápido',
    items: ['Respuestas con IA y tonos de marca', 'Respuesta automática por local', 'Responder reseñas anteriores de una vez'],
  },
  {
    title: 'Potenciá tu ficha de Google',
    items: ['Publicaciones ilimitadas con textos de IA', 'Protección de ficha con aviso por mail', 'Métricas por plataforma y búsquedas'],
  },
  {
    title: 'Analizá y delegá',
    items: ['Sentimiento, NPS y palabras clave', 'Equipo con acceso por local', 'Informes mensuales (próximamente)'],
  },
];

function Check({ tone = 'orange' }) {
  return (
    <span className={`landing-check landing-check--${tone}`}>
      <Icon name="check" size={11} strokeWidth={3} />
    </span>
  );
}

function PriceCard({ plan }) {
  const { onStart } = useLandingActions();
  const featured = plan.checkout_mode === 'subscription';
  const highlights = plan.features?.highlights ?? [];
  // El botón sigue al modo EFECTIVO (VITE_BUSINESS_CHECKOUT); el precio y el
  // destacado, al real: el plan cuesta lo mismo aunque por ahora se contrate
  // hablando con ventas.
  const mode = effectiveCheckoutMode(plan);

  return (
    <div className={`landing-price-card${featured ? ' landing-price-card--featured' : ''}`}>
      {featured && plan.trial_days > 0 && (
        <span className="landing-price-card__badge">{plan.trial_days} días gratis</span>
      )}

      <div className="landing-price-card__name">{plan.name}</div>
      <p className="landing-price-card__desc">{plan.description}</p>

      <div className="landing-price-card__price">
        {plan.checkout_mode === 'contact' ? (
          <span className="landing-price-card__amount landing-price-card__amount--sm">A medida</span>
        ) : (
          <>
            <span className="landing-price-card__amount">
              {Number(plan.price_ars) > 0 ? formatArs(plan.price_ars) : '$0'}
            </span>
            <span className="landing-price-card__period">/mes</span>
          </>
        )}
      </div>

      {featured && plan.trial_days > 0 && (
        <p className="landing-price-card__note">
          <Icon name="lock" size={13} />
          Primer cobro a los {plan.trial_days} días. Sin permanencia.
        </p>
      )}

      {mode === 'contact' ? (
        <Link to={{ hash: '#contacto' }} className="landing-price-card__btn landing-price-card__btn--outline">
          Contactar con ventas <Icon name="arrowRight" size={14} strokeWidth={2.5} />
        </Link>
      ) : (
        <button
          type="button"
          className={`landing-price-card__btn landing-price-card__btn--${featured ? 'solid' : 'outline'}`}
          onClick={() => onStart(plan.code)}
        >
          {mode === 'subscription' && plan.trial_days > 0 ? `Probar ${plan.trial_days} días gratis` : 'Empezar gratis'}
        </button>
      )}

      <ul className="landing-price-card__features">
        {highlights.map((item) => (
          <li key={item}><Check tone={featured ? 'forest' : 'orange'} /> {item}</li>
        ))}
      </ul>

      {plan.code === 'business' && (
        <div className="landing-price-card__groups">
          <p className="landing-price-card__groups-title">Además, con Business:</p>
          {BUSINESS_GROUPS.map((group) => (
            <div key={group.title} className="landing-price-card__group">
              <h4>{group.title}</h4>
              <ul>
                {group.items.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PlansPage() {
  usePageTitle('Planes · linkstar');
  const plans = usePublicPlans();

  return (
    <>
      <PageHero
        compact
        tag="Planes"
        title={<>Empezá gratis. <span className="landing-accent">Crecé cuando quieras.</span></>}
        subtitle="Un plan gratis para siempre, Business para ir más allá y Enterprise para cadenas. Sin permanencia: cambiás o cancelás cuando quieras."
      />

      <Section tone="white" className="landing-pricing">
        <Reveal className="landing-pricing__grid">
          {plans.map((plan) => <PriceCard key={plan.code} plan={plan} />)}
        </Reveal>
        <p className="landing-pricing__fine-print">
          Precios en pesos argentinos. El plan gratis no pide tarjeta. Business se paga con débito automático de
          Mercado Pago y se cancela desde el panel.
        </p>
      </Section>

      <FaqSection items={PLANS_FAQS} tone="light" />

      <Section id="contacto" tone="white" className="landing-contact">
        <SectionHead
          tag="Contacto"
          title="¿Tenés alguna consulta?"
          subtitle={(
            <>
              ¿Más locales, una cadena o una duda antes de empezar? Escribinos y te respondemos en menos de 24 horas.
              También podés hacerlo a <a href="mailto:linkstar.app1@gmail.com">linkstar.app1@gmail.com</a>.
            </>
          )}
          center
        />
        <div className="landing-contact__form">
          <ContactForm idPrefix="landing-contact" />
        </div>
      </Section>
    </>
  );
}
