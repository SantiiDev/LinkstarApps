import GoogleGate from '../../components/GoogleGate/GoogleGate';
import GoogleSeoLocalMockup from './GoogleSeoLocalMockup';

/*
 * Ojo con esta sección en particular: Google NO expone una API de "puntaje SEO"
 * — ese número no existe del otro lado. La maqueta muestra un 78/100 y seis
 * factores escritos a mano. Cuando la ficha esté conectada va a haber que
 * definir una fórmula propia (completitud de la ficha, frecuencia de
 * publicaciones, velocidad de respuesta a reseñas) o cortar la sección. Por eso
 * el texto del modal no promete un puntaje: promete lo que sí se puede sacar de
 * la ficha, y la nota aclara que ese número no existe como dato.
 *
 * Hasta entonces la pantalla es la maqueta de `GoogleSeoLocalMockup`, borrosa y
 * bloqueada detrás de `GoogleGate`.
 */

export default function GoogleSeoLocal() {
  return (
    <GoogleGate
      description="El posicionamiento local se calcula sobre lo que tenés cargado en Google Business Profile. Sin la conexión no hay nada que revisar."
      benefits={[
        'Qué le falta a tu ficha: categoría, horarios, fotos, descripción.',
        'Hace cuánto que no publicás y cuántas publicaciones siguen vigentes.',
        'Qué porcentaje de tus reseñas tienen respuesta, y cuánto tardás.',
        'Cómo se compara todo eso con lo que Google premia en búsquedas cercanas.',
      ]}
      note="Google no publica un «puntaje de SEO local»: ese número no existe como dato. Lo que vas a ver acá es la lista concreta de lo que te falta, no una nota inventada."
    >
      <GoogleSeoLocalMockup />
    </GoogleGate>
  );
}
