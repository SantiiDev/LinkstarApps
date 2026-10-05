import GoogleGate from '../../components/GoogleGate/GoogleGate';
import ReviewsMockup from './ReviewsMockup';

/*
 * Desde la 0024 los datos existen: la conexión con Google es real (el botón
 * del modal la inicia) y sync-reviews guarda cada reseña en `google_reviews`,
 * vinculada a su ficha en `google_locations`. Lo que falta es esta pantalla:
 * reescribirla contra esas dos tablas y borrar la maqueta.
 *
 * El conteo que alimenta las "reseñas estimadas" sigue siendo otro:
 * `location_review_snapshots`, el total diario por sucursal (invariante 6).
 *
 * Hasta entonces la pantalla es la maqueta de `ReviewsMockup`, borrosa y
 * bloqueada detrás de `GoogleGate` — ver el comentario de ese componente para
 * por qué un número inventado ahí dentro no rompe la regla del panel. Con la
 * ficha conectada el modal sigue ahí: cambia el texto, no se destapa nada.
 *
 * Es también la página a la que vuelve el navegador después de autorizar en
 * Google (?google=…, RETURN_PATH en services/api/routes/google.js), y el modal
 * es quien muestra ese resultado.
 */

export default function ReviewsPage() {
  return (
    <GoogleGate
      description="Los expositores mandan gente a dejar reseñas, pero para leerlas necesitamos permiso sobre tu ficha. Google no las comparte de otra forma."
      benefits={[
        'Cada reseña completa: quién la dejó, cuántas estrellas y qué escribió.',
        'Cuáles siguen sin responder, y responderlas desde el panel.',
        'Filtrar por sucursal, por puntaje o por estado de respuesta.',
        'Avisos cuando entra una reseña negativa.',
      ]}
      note="Mientras tanto, en Dispositivos y Gestión local vas a ver reseñas «estimadas»: se calculan por la diferencia del contador de tu ficha día a día, que es lo único medible sin la conexión."
    >
      <ReviewsMockup />
    </GoogleGate>
  );
}
