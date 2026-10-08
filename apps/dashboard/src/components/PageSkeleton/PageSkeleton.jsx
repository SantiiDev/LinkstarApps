import './PageSkeleton.css';

/*
 * Lo que se ve la primera vez que se entra a una sección con fila de KPIs
 * (Mi Empresa, Dispositivos), antes de tener nada que mostrar: una barra, cuatro
 * tarjetas y un bloque ancho, con la forma de la pantalla que viene. Las
 * siguientes veces ya no aparece: la pantalla muestra lo último que vio
 * (lib/viewMemory.js).
 *
 * Bloques planos con un pulso de opacidad, sin vidrio: no hay desenfoque que
 * recalcular mientras late (ver la nota de rendimiento de CLAUDE.md).
 */
export default function PageSkeleton({ label = 'Cargando' }) {
  return (
    <div className="page-skeleton" aria-busy="true" aria-label={label}>
      <div className="page-skeleton__bar" />
      <div className="page-skeleton__grid">
        {[0, 1, 2, 3].map((i) => <div key={i} className="page-skeleton__card" />)}
      </div>
      <div className="page-skeleton__wide" />
    </div>
  );
}
