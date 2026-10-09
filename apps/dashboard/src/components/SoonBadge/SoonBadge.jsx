import './SoonBadge.css';

/*
 * La etiqueta «Próximamente» de todo el panel: la píldora azul marino del
 * ranking de empleados de Dispositivos. Antes cada pantalla tenía la suya
 * (dorada en Configuración y Automatizaciones, translúcida dentro de los
 * botones de IA, texto suelto en los menús); ahora todas usan ésta.
 *
 * Marca algo que se ve pero todavía no funciona. Va al lado del título, dentro
 * de un botón deshabilitado o en una opción deshabilitada de <Select>
 * (`soon: true` en la opción).
 */
export default function SoonBadge({ children = 'Próximamente', className = '' }) {
  return <span className={`ls-soon ${className}`}>{children}</span>;
}
