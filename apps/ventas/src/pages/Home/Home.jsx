import { useNavigate } from 'react-router-dom';
import Hero from '../../components/sections/Hero/Hero';
import Features from '../../components/sections/Features/Features';
import HowItWorks from '../../components/sections/HowItWorks/HowItWorks';
import ReviewsCTA from '../../components/sections/ReviewsCTA/ReviewsCTA';
import FAQ from '../../components/sections/FAQ/FAQ';
import { ROUTES } from '../../lib/routes';

/* La home es la única página que compone varias secciones. Las secciones
 * siguen recibiendo callbacks (`onShop`, `onContact`) en vez de usar el router
 * por dentro: son botones de CTA con estilos propios, no enlaces de
 * navegación, y así no hay que tocarlas. La navegación "de verdad" —la que
 * tiene que poder rastrear un buscador— vive en Navbar y Footer, que sí usan
 * <Link>. */
export default function Home() {
  const navigate = useNavigate();
  const goToShop = () => navigate(ROUTES.shop);

  return (
    <main>
      <Hero onShop={goToShop} onLinkstarApp={() => navigate(ROUTES.linkstarapp)} />
      <ReviewsCTA onShop={goToShop} />
      <HowItWorks onShop={goToShop} />
      <Features onShop={goToShop} />
      <FAQ onContact={() => navigate(ROUTES.contact)} />
    </main>
  );
}
