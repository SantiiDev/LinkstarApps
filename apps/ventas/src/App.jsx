import { Suspense, lazy, useEffect } from 'react';
import { Routes, Route, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { CartProvider } from './context/CartContext';
import Navbar from './components/layout/Navbar/Navbar';
import Footer from './components/layout/Footer/Footer';
import Cart from './components/common/Cart/Cart';
import Home from './pages/Home/Home';
import { ROUTES } from './lib/routes';

// Cargadas sólo cuando se navega a esa página: no hace falta que el bundle
// inicial de la home incluya el checkout, el shop o las páginas legales.
const Contact = lazy(() => import('./pages/Contact/Contact'));
const Shop = lazy(() => import('./pages/Shop/Shop'));
const LinkstarApp = lazy(() => import('./pages/LinkstarApp/LinkstarApp'));
const Checkout = lazy(() => import('./pages/Checkout/Checkout'));
const Legal = lazy(() => import('./pages/Info/Legal'));
const Privacy = lazy(() => import('./pages/Info/Privacy'));
const Terms = lazy(() => import('./pages/Info/Terms'));
const Warranty = lazy(() => import('./pages/Info/Warranty'));
const About = lazy(() => import('./pages/Info/About'));

/* Cada ruta arranca desde arriba. Antes cada `goToX` hacía su propio
 * window.scrollTo; ahora que la navegación pasa por el router, el scroll se
 * resetea en un solo lugar. 'instant' y no 'smooth': la página ya cambió,
 * animar el viaje sólo muestra la nueva pasando de largo. */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [pathname]);
  return null;
}

/* Layout del sitio: navbar arriba, página en el medio, footer abajo. El
 * checkout queda fuera a propósito — es un embudo de compra y no lleva ni
 * navbar ni footer, igual que antes. */
function SiteLayout() {
  return (
    <>
      <Navbar />
      <Suspense fallback={<div className="page-loading" />}>
        <Outlet />
      </Suspense>
      <Footer />
    </>
  );
}

function CheckoutRoute() {
  const navigate = useNavigate();
  return (
    <Suspense fallback={<div className="page-loading" />}>
      <Checkout onBack={() => navigate(ROUTES.home)} />
    </Suspense>
  );
}

function ShopRoute() {
  const navigate = useNavigate();
  return <Shop onBack={() => navigate(ROUTES.home)} />;
}

function LinkstarAppRoute() {
  const navigate = useNavigate();
  return (
    <LinkstarApp
      onShop={() => navigate(ROUTES.shop)}
      onContact={() => navigate(ROUTES.contact)}
    />
  );
}

export default function App() {
  return (
    <CartProvider>
      <ScrollToTop />

      <Routes>
        <Route element={<SiteLayout />}>
          <Route path={ROUTES.home} element={<Home />} />
          <Route path={ROUTES.shop} element={<ShopRoute />} />
          <Route path={ROUTES.linkstarapp} element={<LinkstarAppRoute />} />
          <Route path={ROUTES.contact} element={<Contact />} />
          <Route path={ROUTES.about} element={<About />} />
          <Route path={ROUTES.warranty} element={<Warranty />} />
          <Route path={ROUTES.legal} element={<Legal />} />
          <Route path={ROUTES.privacy} element={<Privacy />} />
          <Route path={ROUTES.terms} element={<Terms />} />
        </Route>

        <Route path={ROUTES.checkout} element={<CheckoutRoute />} />

        {/* Cualquier URL desconocida vuelve a la home. El sitio se sirve como
            SPA desde el Worker, que ya responde 200 a todo, así que una página
            de 404 propia no cambiaría el status code. */}
        <Route path="*" element={<Navigate to={ROUTES.home} replace />} />
      </Routes>

      {/* El carrito es un cajón, no una página: vive fuera del router para que
          no se cierre ni se vacíe visualmente al navegar. */}
      <Cart />
    </CartProvider>
  );
}
