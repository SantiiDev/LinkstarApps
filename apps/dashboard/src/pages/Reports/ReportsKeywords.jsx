import PageHeader from '../../components/PageHeader/PageHeader';
import SectionPlaceholder from '../../components/SectionPlaceholder/SectionPlaceholder';
import './Reports.css';

/*
 * Reemplaza la maqueta: había términos con frecuencia y sentimiento asociado.
 * Mismo bloqueo que sentimiento — hace falta el texto de las reseñas (fase 4.4)
 * antes de poder extraer nada de él (fase 5).
 *
 * Ojo con no confundir esta pantalla con la de SEO Local: acá las palabras
 * salen de lo que ESCRIBEN tus clientes; allá, de lo que BUSCA la gente en
 * Google. Son dos fuentes distintas.
 */

export default function ReportsKeywords() {
  return (
    <div className="reports-page">
      <PageHeader
        eyebrow="Reportes"
        title="Palabras clave"
        subtitle="Las palabras que más repiten tus clientes al hablar de vos"
      />

      <SectionPlaceholder
        variant="google"
        title="Las palabras salen de las reseñas, y todavía no las tenemos"
        description="Para saber qué repiten tus clientes hay que leer lo que escribieron. Eso llega con la conexión a tu ficha de Google."
        preview={[
          'Qué términos aparecen más seguido en tus reseñas.',
          'Cuáles vienen acompañados de elogios y cuáles de quejas.',
          'Cómo cambia el vocabulario de tus clientes a lo largo del tiempo.',
          'Qué palabras te conviene sumar a la descripción de tu ficha.',
        ]}
        note="No es lo mismo que SEO Local: acá se mide lo que dicen tus clientes, allá lo que busca la gente en Google."
      />
    </div>
  );
}
