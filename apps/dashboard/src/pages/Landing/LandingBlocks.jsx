import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../../components/Icon/Icon';
import GoogleLogo from '../../components/GoogleLogo/GoogleLogo';
import { PUBLIC_ROUTES } from '../../lib/routes';
import { useStartCta } from './landingModel';

/*
 * Las piezas visuales que comparten las cuatro páginas de la landing (Inicio,
 * Funciones, Multiubicaciones, Planes). Los hooks, el contexto y las listas
 * están en landingModel.js; el estilo, en Landing.css.
 */

/* El botón principal: el texto y el destino los decide useStartCta(). */
export function StartButton({ className = 'landing-btn landing-btn--primary' }) {
  const cta = useStartCta();
  return (
    <button type="button" className={className} onClick={cta.onClick}>
      {cta.label}
      <Icon name="arrowRight" size={16} strokeWidth={2.5} />
    </button>
  );
}

/* ─── Aparición al scrollear ───────────────────────────────────────────────
   Sólo en bloques de fondo sólido. Las maquetas de adentro no tienen
   backdrop-filter (ver LandingShot), así que moverlas no re-desenfoca nada. */
function useReveal() {
  const ref = useRef(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          node.classList.add('landing-reveal--visible');
          observer.unobserve(node);
        }
      },
      { threshold: 0.12 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return ref;
}

export function Reveal({ children, className = '' }) {
  const ref = useReveal();
  return <div ref={ref} className={`landing-reveal ${className}`}>{children}</div>;
}

/* ─── Secciones ────────────────────────────────────────────────────────── */
/* Bloque de ancho completo con fondo (`light` crema, `white`, `dark` navy) y el
   contenido centrado a 1240px. `id` sirve de ancla (scroll-margin en el CSS). */
export function Section({ id, tone = 'light', className = '', children }) {
  return (
    <section id={id} className={`landing-section landing-section--${tone}`}>
      <div className={`landing-container ${className}`}>{children}</div>
    </section>
  );
}

export function SectionHead({ tag, title, subtitle, center = false }) {
  return (
    <div className={`landing-head${center ? ' landing-head--center' : ''}`}>
      {tag && <span className="landing-tag">{tag}</span>}
      <h2 className="landing-title">{title}</h2>
      {subtitle && <p className="landing-subtitle">{subtitle}</p>}
    </div>
  );
}

/* El hero de cada página: texto a la izquierda, visual a la derecha (abajo en
   mobile). `children` va debajo de los botones (chips, notas). */
export function PageHero({ tag, title, subtitle, actions, note, visual, children, compact = false }) {
  return (
    <section className={`landing-section landing-section--light landing-hero${compact ? ' landing-hero--compact' : ''}`}>
      <div className="landing-container landing-hero__grid">
        <div className="landing-hero__content">
          {tag && <span className="landing-hero__tag">{tag}</span>}
          <h1 className="landing-hero__title">{title}</h1>
          {subtitle && <p className="landing-hero__subtitle">{subtitle}</p>}
          {actions && <div className="landing-hero__actions">{actions}</div>}
          {note && <p className="landing-hero__note">{note}</p>}
          {children}
        </div>
        {visual && <div className="landing-hero__visual">{visual}</div>}
      </div>
    </section>
  );
}

/* ─── LandingShot: una pantalla del panel como ilustración ─────────────────
   Renderiza bloques REALES del panel con datos INVENTADOS dentro de un marco de
   ventana. Es el cuarto lugar donde puede dibujarse una maqueta (los otros son
   GoogleGate, BusinessLock y BusinessPitch), con las mismas condiciones: `inert`
   (no se puede tocar ni tabular, y los lectores de pantalla lo saltean) y fuera
   de cualquier sesión, así que nunca se confunde con datos de un cliente.

   El contenido se dibuja a `width` px y se achica con transform hasta el ancho
   del marco; el alto se mide para que el marco no deje aire. `maxHeight` corta
   la captura (con un degradé abajo), como un recorte de pantalla.

   Adentro no hay backdrop-filter ni animaciones (Landing.css): son decenas de
   tarjetas de vidrio y re-desenfocarlas en cada frame del scroll es justo lo
   que la regla 2 de rendimiento de CLAUDE.md prohíbe.

   En un celular se dibuja a `mobileWidth`: las media queries del panel miran el
   ancho de la VENTANA, no el del marco, así que a 1120px con la ventana de un
   celular saldría la versión mobile estirada. Dibujada angosta, coincide. */
const NARROW_QUERY = '(max-width: 768px)';

function useNarrow() {
  const [narrow, setNarrow] = useState(() => window.matchMedia(NARROW_QUERY).matches);
  useEffect(() => {
    const media = window.matchMedia(NARROW_QUERY);
    const onChange = () => setNarrow(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);
  return narrow;
}

export function LandingShot({
  children, width: wideWidth = 1120, mobileWidth = 520, maxHeight = null,
  label = 'app.linkstarapp.com', bare = false, className = '',
}) {
  const narrow = useNarrow();
  const width = narrow ? Math.min(wideWidth, mobileWidth) : wideWidth;
  const frameRef = useRef(null);
  const innerRef = useRef(null);
  const [size, setSize] = useState({ scale: 0, height: 0 });

  useEffect(() => {
    const frame = frameRef.current;
    const inner = innerRef.current;
    if (!frame || !inner) return undefined;
    const update = () => {
      const scale = frame.clientWidth / width;
      setSize({ scale, height: inner.offsetHeight * scale });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(frame);
    observer.observe(inner);
    return () => observer.disconnect();
  }, [width]);

  const cropped = maxHeight != null && size.height > maxHeight;
  const viewport = cropped ? maxHeight : size.height;

  return (
    <div className={`landing-shot${bare ? ' landing-shot--bare' : ''} ${className}`} aria-hidden="true">
      {!bare && (
        <div className="landing-shot__bar">
          <span className="landing-shot__dots"><i /><i /><i /></span>
          <span className="landing-shot__url"><Icon name="lock" size={10} />{label}</span>
        </div>
      )}
      <div
        ref={frameRef}
        className={`landing-shot__screen${cropped ? ' landing-shot__screen--cropped' : ''}`}
        style={{ height: viewport || undefined }}
      >
        <div
          ref={innerRef}
          className="landing-shot__inner"
          style={{ width, transform: `scale(${size.scale})`, visibility: size.scale ? 'visible' : 'hidden' }}
          inert
        >
          {children}
        </div>
      </div>
    </div>
  );
}

/* ─── Funciones ────────────────────────────────────────────────────────── */
export function AiBadge() {
  return (
    <span className="landing-ai-badge">
      <Icon name="sparkles" size={12} /> IA
    </span>
  );
}

export function CheckList({ items, tone = 'orange' }) {
  return (
    <ul className="landing-checks">
      {items.map((item) => (
        <li key={typeof item === 'string' ? item : item.key}>
          <span className={`landing-check landing-check--${tone}`}><Icon name="check" size={11} strokeWidth={3} /></span>
          <span>{typeof item === 'string' ? item : item.content}</span>
        </li>
      ))}
    </ul>
  );
}

/* Una función: texto + ilustración, alternando lados con `reverse`. */
export function FeatureRow({ id, icon, tag, title, text, bullets, ai = false, visual, reverse = false, footer }) {
  return (
    <div id={id} className={`landing-feature${reverse ? ' landing-feature--reverse' : ''}`}>
      <Reveal className="landing-feature__text">
        <span className="landing-feature__tag">
          {icon && <span className="landing-feature__icon"><Icon name={icon} size={16} /></span>}
          {tag}
          {ai && <AiBadge />}
        </span>
        <h3 className="landing-feature__title">{title}</h3>
        <p className="landing-feature__desc">{text}</p>
        {bullets && <CheckList items={bullets} />}
        {footer}
      </Reveal>
      <Reveal className="landing-feature__visual">{visual}</Reveal>
    </div>
  );
}

/* ─── Preguntas frecuentes ────────────────────────────────────────────────
   Tarjetas independientes con «+» que rota a «×», como apps/ventas. La primera
   arranca abierta. El alto real de la respuesta se mide después de montar, para
   que el ítem abierto no quede colapsado en max-height: 0. */
function FaqItem({ q, a, isOpen, onClick, id }) {
  const contentRef = useRef(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (isOpen && contentRef.current) setHeight(contentRef.current.scrollHeight);
  }, [isOpen]);

  return (
    <div className={`landing-faq__item${isOpen ? ' landing-faq__item--open' : ''}`}>
      <button
        type="button"
        className="landing-faq__question"
        onClick={onClick}
        aria-expanded={isOpen}
        aria-controls={`${id}-answer`}
      >
        <span>{q}</span>
        <span className="landing-faq__icon" aria-hidden="true">
          <span className="landing-faq__icon-bar landing-faq__icon-bar--h" />
          <span className="landing-faq__icon-bar landing-faq__icon-bar--v" />
        </span>
      </button>
      <div
        id={`${id}-answer`}
        className="landing-faq__answer-wrapper"
        style={{ maxHeight: isOpen ? `${height}px` : '0px' }}
      >
        <div className="landing-faq__answer" ref={contentRef}>
          <p>{a}</p>
        </div>
      </div>
    </div>
  );
}

export function FaqSection({ items, id = 'preguntas', title = 'Preguntas frecuentes', tone = 'white' }) {
  const [open, setOpen] = useState(0);
  return (
    <Section id={id} tone={tone} className="landing-faq">
      <SectionHead tag="Preguntas frecuentes" title={title} center />
      <div className="landing-faq__list">
        {items.map((item, i) => (
          <FaqItem
            key={item.q}
            id={`${id}-${i}`}
            q={item.q}
            a={item.a}
            isOpen={open === i}
            onClick={() => setOpen(open === i ? null : i)}
          />
        ))}
      </div>
    </Section>
  );
}

/* ─── Cierre de cada página ───────────────────────────────────────────── */
export function ClosingCta({
  title = 'Ya viste cómo funciona. Probalo.',
  text = 'Creá tu cuenta en un minuto, conectá tu ficha de Google y empezá a ver qué dicen tus clientes. Sin permanencia.',
}) {
  return (
    <Section tone="dark" className="landing-closing">
      <Reveal>
        <h2 className="landing-closing__title">{title}</h2>
        <p className="landing-closing__text">{text}</p>
        <div className="landing-closing__actions">
          <StartButton />
        </div>
        <p className="landing-closing__alt">
          ¿Tenés muchos locales o alguna duda? <Link to={`${PUBLIC_ROUTES.plans}#contacto`}>Escribinos</Link>
        </p>
      </Reveal>
    </Section>
  );
}

/* ─── Confianza: sólo hechos verificables ────────────────────────────────
   Nada de cifras de la empresa («+N negocios», «#1»): mientras no haya clientes
   serían inventadas, y eso es publicidad engañosa (Ley 24.240 / Lealtad
   Comercial). Cuando existan números reales, van acá. */
export function TrustStrip() {
  return (
    <div className="landing-trust">
      <span className="landing-trust__item">
        <GoogleLogo size={18} /> Se conecta con tu Perfil de Empresa de Google
      </span>
      <span className="landing-trust__item"><Icon name="card" size={17} /> Plan gratis sin tarjeta</span>
      <span className="landing-trust__item"><Icon name="shield" size={17} /> Sin permanencia</span>
      <span className="landing-trust__item"><Icon name="pin" size={17} /> Hecho en Argentina</span>
    </div>
  );
}

/* ─── Fotos ──────────────────────────────────────────────────────────────
   Espacio reservado para una foto que todavía no tenemos: dice qué va ahí.
   Se reemplaza por un <img> cuando llegue. */
export function PhotoSlot({ label, ratio = '4 / 3', className = '' }) {
  return (
    <div className={`landing-photo-slot ${className}`} style={{ aspectRatio: ratio }}>
      <Icon name="camera" size={26} />
      <span>FOTO: {label}</span>
    </div>
  );
}

/* La imagen de un expositor (las mismas de la tienda, apps/ventas/public). */
export function Expositor({ kind = 'google', color = 'black', className = '' }) {
  const alt = kind === 'google'
    ? 'Expositor Linkstar para reseñas de Google, con NFC y código QR'
    : 'Expositor Linkstar para Instagram, con NFC y código QR';
  return (
    <img
      className={`landing-expositor ${className}`}
      src={`/landing/${kind}-nfc-${color}.webp`}
      alt={alt}
      width="900"
      height="1250"
      loading="lazy"
      decoding="async"
    />
  );
}
