import PageHeader from '../../components/PageHeader/PageHeader';
import SectionPlaceholder from '../../components/SectionPlaceholder/SectionPlaceholder';
import './Reviews.css';

/*
 * Reemplaza la maqueta más grande del panel: había reseñas completas con autor,
 * iniciales, estrellas, texto, fecha y estado de respuesta, más filtros y
 * buscador sobre ese array.
 *
 * Es la sección que más lejos está de tener datos, y conviene ser exacto sobre
 * por qué: no alcanza con conectar Google. NO EXISTE una tabla de reseñas
 * individuales en el esquema — `location_review_snapshots` guarda un total
 * diario por sucursal, no reseñas. Hacen falta las dos cosas: la conexión
 * (fase 4.2) y una migración que cree la tabla (fase 4.4).
 *
 * Por eso todo lo demás del producto habla de "reseñas estimadas": lo único
 * medible hoy es la diferencia del contador día a día.
 */

export default function ReviewsPage() {
  return (
    <div className="reviews-page">
      <PageHeader
        eyebrow="Reputación"
        title="Reseñas"
        subtitle="Todo lo que dejan tus clientes en Google, en un solo lugar"
      />

      <SectionPlaceholder
        variant="google"
        title="Tus reseñas todavía no llegan hasta acá"
        description="Los expositores mandan gente a dejar reseñas, pero para leerlas necesitamos permiso sobre tu ficha. Google no las comparte de otra forma."
        preview={[
          'Cada reseña completa: quién la dejó, cuántas estrellas y qué escribió.',
          'Cuáles siguen sin responder, y responderlas desde el panel.',
          'Filtrar por sucursal, por puntaje o por estado de respuesta.',
          'Avisos cuando entra una reseña negativa.',
        ]}
        note="Mientras tanto, en Dispositivos y Gestión local vas a ver reseñas «estimadas»: se calculan por la diferencia del contador de tu ficha día a día, que es lo único medible sin la conexión."
      />
    </div>
  );
}
