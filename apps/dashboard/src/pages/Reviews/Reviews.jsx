import GoogleGate from '../../components/GoogleGate/GoogleGate';
import ReviewsMockup from './ReviewsMockup';

/*
 * La sección que más lejos está de tener datos, y conviene ser exacto sobre por
 * qué: no alcanza con conectar Google. NO EXISTE una tabla de reseñas
 * individuales en el esquema — `location_review_snapshots` guarda un total
 * diario por sucursal, no reseñas. Hacen falta las dos cosas: la conexión
 * (fase 4.2) y una migración que cree la tabla (fase 4.4).
 *
 * Por eso todo lo demás del producto habla de "reseñas estimadas": lo único
 * medible hoy es la diferencia del contador día a día.
 *
 * Hasta entonces la pantalla es la maqueta de `ReviewsMockup`, borrosa y
 * bloqueada detrás de `GoogleGate` — ver el comentario de ese componente para
 * por qué un número inventado ahí dentro no rompe la regla del panel.
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
