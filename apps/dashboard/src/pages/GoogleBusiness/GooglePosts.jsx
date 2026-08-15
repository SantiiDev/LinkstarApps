import PageHeader from '../../components/PageHeader/PageHeader';
import SectionPlaceholder from '../../components/SectionPlaceholder/SectionPlaceholder';
import './GoogleBusiness.css';

/*
 * Reemplaza la maqueta: había publicaciones con títulos, fechas de vencimiento
 * y contadores de vistas, todas inventadas.
 *
 * Sale de la Local Posts API (fase 4.7), que también permite crear y programar.
 */

export default function GooglePosts() {
  return (
    <div className="gb-page">
      <PageHeader
        eyebrow="Google Business"
        title="Publicaciones"
        subtitle="Las novedades que mostrás en tu ficha de Google"
      />

      <SectionPlaceholder
        variant="google"
        title="Publicá en tu ficha desde el panel"
        description="Las publicaciones de Google Business aparecen en tu ficha y caducan solas. Para verlas y crearlas desde acá hace falta la conexión."
        preview={[
          'Qué publicaciones tenés vigentes y cuándo vencen.',
          'Cuánta gente las vio y cuántos hicieron clic.',
          'Crear novedades, ofertas y eventos sin salir del panel.',
          'Programarlas para que salgan solas.',
        ]}
      />
    </div>
  );
}
