import PageHeader from '../../components/PageHeader/PageHeader';
import SectionPlaceholder from '../../components/SectionPlaceholder/SectionPlaceholder';
import './GoogleBusiness.css';

/*
 * Reemplaza la maqueta: había publicaciones con títulos, fechas de vencimiento
 * y contadores de vistas, todas inventadas.
 *
 * Sale de la Local Posts API (fase 4.7), que también permite crear y programar.
 */

/* Recuperar la maqueta ─────────────────────────────────────────
 * El JSX que había acá no se perdió: está completo —grillas, tablas y
 * gráficos— en el tag `maquetas-pre-fase-2`, y el CSS de esta pantalla sigue
 * en el repo sin tocar. Los dos juntos son el punto de partida para rehacerla.
 *
 *   git show maquetas-pre-fase-2:apps/dashboard/src/pages/GoogleBusiness/GooglePosts.jsx
 *
 * Que la fuente de datos se conecte NO devuelve esta pantalla sola: hay que
 * volver a escribir el JSX contra el dato real. El tag es de dónde copiarlo.
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
