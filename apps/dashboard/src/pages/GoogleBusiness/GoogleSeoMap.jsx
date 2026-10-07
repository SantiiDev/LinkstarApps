import PageHeader from '../../components/PageHeader/PageHeader';
import SectionPlaceholder from '../../components/SectionPlaceholder/SectionPlaceholder';
import './GoogleBusiness.css';

/*
 * Mapa SEO — en qué posición aparece la ficha en Google Maps según desde dónde
 * se busque: una grilla de puntos alrededor del local (3×3 a 9×9, con una
 * distancia entre puntos), una búsqueda («bar en rosario») y la posición en
 * cada punto. Es la segunda pantalla de SEO Local en Tapstar.
 *
 * Variante «soon» y no «google»: lo que falta lo tenemos que hacer nosotros, no
 * el cliente. Para medir hace falta la Places API de Google (otra clave, con
 * facturación) y cada punto de la grilla es una consulta paga, así que va a ser
 * de Business y con un cupo de mediciones por mes. Las condiciones de Google
 * Maps Platform no dejan guardar los datos de los otros negocios que aparecen:
 * de cada medición se guarda nuestra posición, nada más.
 */
export default function GoogleSeoMap() {
  return (
    <div className="gb-page">
      <PageHeader
        eyebrow="SEO Local"
        title="Mapa SEO"
        subtitle="En qué posición sale tu negocio en Google Maps según desde dónde te busquen"
      />
      <SectionPlaceholder
        variant="soon"
        title="El Mapa SEO todavía no está disponible"
        description="Esta sección no espera ninguna conexión tuya: la estamos construyendo."
        preview={[
          'Una grilla sobre el mapa con tu posición en cada punto alrededor del local.',
          'La búsqueda que vos elijas: «bar en rosario», «cafetería cerca de mí».',
          'Cómo cambia tu posición entre una medición y la siguiente.',
        ]}
        note="Mientras tanto, el Análisis SEO te dice qué mejorar en tu ficha para subir en esas búsquedas."
      />
    </div>
  );
}
