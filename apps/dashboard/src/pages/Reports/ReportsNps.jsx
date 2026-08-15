import PageHeader from '../../components/PageHeader/PageHeader';
import SectionPlaceholder from '../../components/SectionPlaceholder/SectionPlaceholder';
import './Reports.css';

/*
 * variant="soon", NO "google": esta es la única sección del panel que no
 * depende de conectar nada. No existe absolutamente nada detrás — ni tabla, ni
 * encuesta, ni pregunta (fase 6 del roadmap). Ponerle un botón de "conectar
 * Google" sería mentir sobre qué la destraba: no hay nada que el cliente pueda
 * hacer para habilitarla, la tenemos que construir nosotros.
 *
 * La decisión difícil de esa fase, anotada acá para que no se pierda: meter una
 * encuesta entre el tap y Google le pega justo a la conversión a reseña, que es
 * para lo que el cliente compró el expositor. Las salidas razonables son
 * preguntar DESPUÉS de que la reseña se dejó, mandarlo por otro canal, o sacarlo
 * de lo que se vende.
 */

export default function ReportsNps() {
  return (
    <div className="reports-page">
      <PageHeader
        eyebrow="Reportes"
        title="NPS"
        subtitle="Qué tan probable es que tus clientes te recomienden"
      />

      <SectionPlaceholder
        variant="soon"
        title="El NPS todavía no está disponible"
        description="A diferencia del resto del panel, esta sección no espera ninguna conexión tuya: la estamos construyendo."
        preview={[
          'Tu puntaje neto, con promotores, pasivos y detractores.',
          'Cómo evoluciona mes a mes y por sucursal.',
          'Las respuestas una por una, con el comentario de cada cliente.',
        ]}
        note="Lo que falta definir es dónde se hace la pregunta. Preguntar antes de mandar al cliente a Google le quita fuerza a la reseña, que es para lo que comprás el expositor — así que probablemente vaya después, o por otro canal."
      />
    </div>
  );
}
