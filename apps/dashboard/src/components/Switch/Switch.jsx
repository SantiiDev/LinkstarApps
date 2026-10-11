import './Switch.css';

/*
 * Interruptor de sí/no con etiqueta («Puntuación media», «Personas distintas»).
 *
 * Por debajo es un checkbox real: conserva el foco, el teclado y el lector de
 * pantalla, y la pista se dibuja encima. `color` es el del estado encendido
 * (orange | gold), para que combine con la serie que activa. `disabled` es para
 * algo que todavía no funciona (va con un SoonBadge al lado), no para esconder
 * un permiso.
 */
export default function Switch({ checked, onChange, label, color = 'orange', disabled = false }) {
  return (
    <label className={`ls-switch ls-switch--${color}${disabled ? ' ls-switch--disabled' : ''}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange?.(e.target.checked)} />
      <span className="ls-switch__track" aria-hidden="true"><span className="ls-switch__thumb" /></span>
      <span className="ls-switch__label">{label}</span>
    </label>
  );
}
