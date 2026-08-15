import PageHeader from '../../components/PageHeader/PageHeader';
import SectionPlaceholder from '../../components/SectionPlaceholder/SectionPlaceholder';
import './Automations.css';

/*
 * variant="soon": falta la tabla de preferencias por organización, el ejecutor
 * de jobs y un proveedor de email transaccional (fase 7). Web3Forms no sirve
 * para esto — es para avisarles a ustedes de una compra, no para escribirle a
 * un cliente.
 *
 * Antes esta pantalla tenía interruptores que se prendían y apagaban sin
 * guardar nada ni ejecutar nada. Peor que un número inventado: el cliente cree
 * que dejó algo activado.
 *
 * Dos de las automatizaciones listadas abajo salen puras de escaneos y NO
 * necesitan Google — "expositor sin escaneos en 48 horas" y "resumen semanal".
 * Si hiciera falta una victoria visible temprano, son las dos que se pueden
 * adelantar sin esperar la fase 4.
 */

/* Recuperar la maqueta ─────────────────────────────────────────
 * El JSX que había acá no se perdió: está completo —incluidos los
 * interruptores— en el tag `maquetas-pre-fase-2`, y el CSS de esta pantalla
 * sigue en el repo sin tocar. Los dos juntos son el punto de partida para
 * rehacerla.
 *
 *   git show maquetas-pre-fase-2:apps/dashboard/src/pages/Automations/Automations.jsx
 *
 * Que la fuente de datos exista NO devuelve esta pantalla sola: hay que volver
 * a escribir el JSX contra el dato real. El tag es de dónde copiarlo.
 */

export default function Automations() {
  return (
    <div className="automations-page">
      <PageHeader
        eyebrow="Automatizaciones"
        title="Automatizaciones"
        subtitle="Que el panel trabaje solo mientras vos atendés"
      />

      <SectionPlaceholder
        variant="soon"
        title="Las automatizaciones todavía no corren"
        description="Preferimos no mostrarte interruptores que no guardan nada: si los prendieras, no pasaría absolutamente nada."
        preview={[
          'Avisarte cuando un expositor deja de registrar escaneos.',
          'Un resumen semanal de tu actividad por email.',
          'Alertarte apenas entra una reseña negativa.',
          'Responder solas las reseñas de cinco estrellas, con tu tono.',
        ]}
        note="Las dos primeras dependen sólo de los escaneos, así que van a llegar antes. Las dos que tocan reseñas necesitan la conexión con Google."
      />
    </div>
  );
}
