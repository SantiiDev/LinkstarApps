import { useState, Suspense, lazy } from 'react';
import { CartProvider } from './context/CartContext';
import Navbar from './components/layout/Navbar/Navbar';
import Hero from './components/sections/Hero/Hero';
import Features from './components/sections/Features/Features';
import HowItWorks from './components/sections/HowItWorks/HowItWorks';
import ReviewsCTA from './components/sections/ReviewsCTA/ReviewsCTA';
import FAQ from './components/sections/FAQ/FAQ';
import Footer from './components/layout/Footer/Footer';
import Cart from './components/common/Cart/Cart';

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

export default function App() {
  const [page, setPage] = useState('home'); // 'home' | 'shop' | 'contact' | 'checkout'

  const goToShop = () => {
    setPage('shop');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const goHome = () => {
    setPage('home');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const goToContact = () => {
    setPage('contact');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const goToCheckout = () => {
    setPage('checkout');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const goToLinkstarApp = () => {
    setPage('linkstarapp');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const navigateTo = (pageName) => {
    setPage(pageName);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <CartProvider>
      {page !== 'checkout' && (
        <Navbar onShop={goToShop} onHome={goHome} onContact={goToContact} onLinkstarApp={goToLinkstarApp} currentPage={page} />
      )}

      <Suspense fallback={<div className="page-loading" />}>
      {page === 'checkout' && <Checkout onBack={goHome} />}

      {page === 'shop' && (
        <>
          <Shop onBack={goHome} />
          <Footer onContact={goToContact} onShop={goToShop} onLinkstarApp={goToLinkstarApp} onNavigate={navigateTo} />
        </>
      )}

      {page === 'contact' && (
        <>
          <Contact />
          <Footer onContact={goToContact} onShop={goToShop} onLinkstarApp={goToLinkstarApp} onNavigate={navigateTo} />
        </>
      )}

      {page === 'linkstarapp' && (
        <>
          <LinkstarApp onShop={goToShop} onContact={goToContact} />
          <Footer onContact={goToContact} onShop={goToShop} onLinkstarApp={goToLinkstarApp} onNavigate={navigateTo} />
        </>
      )}

      {page === 'home' && (
        <>
          <main>
            <Hero onShop={goToShop} onLinkstarApp={goToLinkstarApp} />
            <ReviewsCTA onShop={goToShop} />
            <HowItWorks onShop={goToShop} />
            <Features onShop={goToShop} />
            <FAQ onContact={goToContact} />
          </main>
          <Footer onContact={goToContact} onShop={goToShop} onLinkstarApp={goToLinkstarApp} onNavigate={navigateTo} />
        </>
      )}

      {page === 'legal' && (
        <>
          <Legal />
          <Footer onContact={goToContact} onShop={goToShop} onLinkstarApp={goToLinkstarApp} onNavigate={navigateTo} />
        </>
      )}

      {page === 'privacy' && (
        <>
          <Privacy />
          <Footer onContact={goToContact} onShop={goToShop} onLinkstarApp={goToLinkstarApp} onNavigate={navigateTo} />
        </>
      )}

      {page === 'terms' && (
        <>
          <Terms />
          <Footer onContact={goToContact} onShop={goToShop} onLinkstarApp={goToLinkstarApp} onNavigate={navigateTo} />
        </>
      )}

      {page === 'warranty' && (
        <>
          <Warranty />
          <Footer onContact={goToContact} onShop={goToShop} onLinkstarApp={goToLinkstarApp} onNavigate={navigateTo} />
        </>
      )}

      {page === 'about' && (
        <>
          <About />
          <Footer onContact={goToContact} onShop={goToShop} onLinkstarApp={goToLinkstarApp} onNavigate={navigateTo} />
        </>
      )}
      </Suspense>

      <Cart onCheckout={goToCheckout} />
    </CartProvider>
  );
}
