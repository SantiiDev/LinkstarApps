import PageHeader from '../../components/PageHeader/PageHeader';
import SectionPlaceholder from '../../components/SectionPlaceholder/SectionPlaceholder';
import './GoogleBusiness.css';

/*
 * Acá había un puntaje de 78/100, seis factores de posicionamiento con notas
 * ("tu última foto es de hace 45 días") y cinco palabras clave con volumen de
 * búsqueda. Todo escrito a mano.
 *
 * Ojo con esta sección en particular: Google NO expone una API de "puntaje SEO"
 * — ese número no existe del otro lado. Cuando la ficha esté conectada va a
 * haber que definir una fórmula propia (completitud de la ficha, frecuencia de
 * publicaciones, velocidad de respuesta a reseñas) o cortar la sección. Por eso
 * el texto de abajo no promete un puntaje: promete lo que sí se puede sacar de
 * la ficha.
 *
 * El CSS de la maqueta se deja como estaba: es el objetivo de diseño para
 * cuando haya datos, y está en el historial de git de todos modos.
 */

/* Recuperar la maqueta ─────────────────────────────────────────
 * El JSX que había acá no se perdió: está completo —grillas, tablas y
 * gráficos— en el tag `maquetas-pre-fase-2`, y el CSS de esta pantalla sigue
 * en el repo sin tocar. Los dos juntos son el punto de partida para rehacerla.
 *
 *   git show maquetas-pre-fase-2:apps/dashboard/src/pages/GoogleBusiness/GoogleSeoLocal.jsx
 *
 * Que la fuente de datos se conecte NO devuelve esta pantalla sola: hay que
 * volver a escribir el JSX contra el dato real. El tag es de dónde copiarlo.
 */

export default function GoogleSeoLocal() {
  return (
    <div className="gb-page">
      <PageHeader
        eyebrow="Google Business"
        title="SEO Local"
        subtitle="Qué tan bien posicionada está tu ficha frente a los negocios cercanos"
      />

      <SectionPlaceholder
        variant="google"
        title="Necesitamos leer tu ficha para poder evaluarla"
        description="El posicionamiento local se calcula sobre lo que tenés cargado en Google Business Profile. Sin la conexión no hay nada que revisar."
        preview={[
          'Qué le falta a tu ficha: categoría, horarios, fotos, descripción.',
          'Hace cuánto que no publicás y cuántas publicaciones siguen vigentes.',
          'Qué porcentaje de tus reseñas tienen respuesta, y cuánto tardás.',
          'Cómo se compara todo eso con lo que Google premia en búsquedas cercanas.',
        ]}
        note="Google no publica un «puntaje de SEO local»: ese número no existe como dato. Lo que vas a ver acá es la lista concreta de lo que te falta, no una nota inventada."
      />
    </div>
  );
}
