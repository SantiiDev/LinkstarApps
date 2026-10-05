/* El logo de Google, en un solo lugar.
 *
 * Estaba copiado con sus cuatro paths en cuatro archivos distintos (Mi
 * Empresa, Configuración, SectionPlaceholder y GoogleConnectBanner), y los
 * cuatro habían ido divergiendo en detalles: uno le pasaba `strokeWidth={0}`,
 * otro heredaba el `stroke` del mapa de íconos que lo envolvía.
 *
 * Es un logo, no un ícono de línea: va con `fill` y nunca con `stroke`, así que
 * no acepta las props de trazo que usan los demás. `aria-hidden` porque siempre
 * aparece al lado de un texto que ya dice "Google". */
export default function GoogleLogo({ size = 18, className }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.6 32.9 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 16.3 4 9.6 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.5 0 10.4-1.9 14.3-5.1l-6.6-5.6C29.6 34.9 26.9 36 24 36c-5.2 0-9.6-3.1-11.3-7.5l-6.6 5.1C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.3 5.7l6.6 5.6C39.9 37.1 44 31 44 24c0-1.3-.1-2.7-.4-3.5z" />
    </svg>
  );
}
