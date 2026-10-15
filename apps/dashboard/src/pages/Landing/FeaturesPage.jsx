import { Link } from 'react-router-dom';
import Icon from '../../components/Icon/Icon';
import SoonBadge from '../../components/SoonBadge/SoonBadge';
import {
  ClosingCta, FaqSection, FeatureRow, PageHero, Section, StartButton,
} from './LandingBlocks';
import { AiShot, DevicesCard, MetricsShot, ReviewsShot, SentimentShot, SeoShot } from './LandingShots';
import { FEATURE_LINKS, featurePath, usePageTitle } from './landingModel';
import { FEATURES_FAQS } from './landingFaqs';

/*
 * Funciones (/funciones): las seis partes del producto, cada una con su ancla
 * (los ids salen de FEATURE_LINKS, que también arma el desplegable del navbar).
 *
 * La IA tiene su propia parte («IA y automatizaciones», donde ES la función) y
 * aparece como sello en Google Business y Reportes, donde ayuda a otra cosa.
 * Sólo se cuenta lo que existe: el Mapa SEO, programar publicaciones y los
 * informes mensuales no se prometen como si estuvieran.
 */

/* Los expositores se venden en el sitio de ventas; acá sólo se cuenta lo que el
   panel hace con ellos, como mytapstar con los de tapstar. */
const SHOP_URL = 'https://linkstarapp.com/tienda';

export default function FeaturesPage() {
  usePageTitle('Funciones · linkstar');

  return (
    <>
      <PageHero
        compact
        tag="Funciones"
        title={<>Todo para crecer en Google, <span className="landing-accent">en un solo panel</span></>}
        subtitle="Conseguí más reseñas, respondelas con tu tono, mejorá tu ficha y entendé qué dicen tus clientes. Elegí por dónde empezar:"
      >
        <div className="landing-hero__chips">
          {FEATURE_LINKS.map((f) => (
            <Link key={f.hash} to={featurePath(f.hash)} className="landing-chip landing-chip--lg">
              <Icon name={f.icon} size={15} /> {f.title}
            </Link>
          ))}
        </div>
      </PageHero>

      <Section tone="white" className="landing-features">
        <FeatureRow
          id="seo"
          icon="search"
          tag="Visibilidad SEO"
          title="Sabé exactamente qué te falta para aparecer más en Google"
          text="Revisamos tu ficha en seis áreas y te damos un puntaje de 0 a 100. Cada punto que te falta viene con lo que tenés que hacer para sumarlo."
          bullets={[
            'Puntaje SEO con tu nivel y cuánto te falta para el siguiente.',
            'Presencia visual, keywords, actividad, categoría, datos y reputación.',
            'Tu próxima misión: la acción que más puntos te suma hoy.',
            'Las búsquedas reales que no aparecen en tu descripción.',
          ]}
          visual={<SeoShot />}
        />

        <FeatureRow
          id="resenas"
          reverse
          icon="star"
          tag="Reseñas"
          title="Todas tus reseñas de Google, en una sola bandeja"
          text="Leé y respondé las reseñas de todas tus fichas sin entrar a Google, con filtros para encontrar justo las que necesitan atención."
          bullets={[
            'Filtrá por local, estrellas, sin responder o tipo de comentario.',
            'Alertas por mail cuando entra una reseña de 1 a 3 estrellas o con una palabra que te importa.',
            'Respondé desde el panel y la respuesta se publica en tu ficha.',
            'Convertí tus mejores reseñas en una imagen para Instagram.',
          ]}
          visual={<ReviewsShot />}
        />

        <FeatureRow
          id="ia"
          ai
          icon="sparkles"
          tag="IA y automatizaciones"
          title="Respuestas con tu tono, en un clic o en piloto automático"
          text="La IA escribe la respuesta como la escribirías vos. La revisás y la publicás, o dejás una regla para que las reseñas nuevas se respondan solas."
          bullets={[
            'Borrador de respuesta con IA para cada reseña, que editás antes de publicar.',
            'Tonos de marca: uno para las reseñas positivas y otro para las críticas.',
            'Respuesta automática: elegís a qué estrellas responde, por local o para todos.',
            'Respondé de una vez las reseñas viejas que quedaron sin contestar.',
          ]}
          visual={<AiShot />}
        />

        <FeatureRow
          id="google"
          reverse
          icon="globe"
          tag="Google Business"
          title="Tu ficha de Google, al día y protegida"
          text="Editá tu perfil, publicá novedades y mirá cómo te encuentran tus clientes, sin entrar a Google."
          bullets={[
            'Editá descripción, horarios, teléfonos, web y atributos de tu ficha.',
            { key: 'posts', content: <>Publicaciones con textos sugeridos por IA, con foto, oferta o evento.</> },
            'Métricas de búsquedas, vistas, llamadas y cómo llegar, con tu tasa de conversión.',
            'Protección de ficha: te avisamos si Google cambia tus datos y los revertís en un clic.',
          ]}
          visual={<MetricsShot />}
        />

        <FeatureRow
          id="reportes"
          ai
          icon="trend"
          tag="Reportes"
          title="Entendé qué dicen tus clientes, no sólo cuántas estrellas te dan"
          text="La IA lee cada reseña y la clasifica: qué tono tiene, de qué habla y qué palabras se repiten. Vos ves el resumen."
          bullets={[
            'NPS calculado con el texto de tus reseñas, también por aspecto: atención, espera, precio…',
            'Sentimiento positivo, neutro y negativo, y cómo evoluciona.',
            'Las palabras clave de las que más se quejan y las que más elogian.',
            { key: 'monthly', content: <>Informes mensuales por local <SoonBadge /></> },
          ]}
          visual={<SentimentShot />}
        />

        <FeatureRow
          id="dispositivos"
          reverse
          icon="qr"
          tag="Seguimiento de expositores"
          title="Sabé cuánto rinde cada expositor"
          text="Si usás expositores NFC y QR de Linkstar, el panel te muestra cuántas veces los tocan o escanean, en qué local, y te avisa si alguno deja de funcionar."
          bullets={[
            'Escaneos por expositor y por local, con la actividad de cada día.',
            'Aviso por mail si un expositor deja de recibir escaneos.',
            'Sumás uno nuevo escaneando el QR chico de su base.',
            'Expositores para tu ficha de Google o para tu Instagram.',
          ]}
          visual={<DevicesCard />}
          footer={(
            <p className="landing-feature__aside">
              ¿Todavía no tenés expositores? <a href={SHOP_URL}>Conseguilos en linkstarapp.com</a>
            </p>
          )}
        />
      </Section>

      <Section tone="light" className="landing-band">
        <p className="landing-band__text">
          <Icon name="sparkles" size={18} /> La IA, los reportes y las automatizaciones son del plan Business. Con el plan gratis ya tenés la bandeja de reseñas, el análisis SEO y el seguimiento de tus expositores.
        </p>
        <StartButton />
      </Section>

      <FaqSection items={FEATURES_FAQS} />
      <ClosingCta />
    </>
  );
}
