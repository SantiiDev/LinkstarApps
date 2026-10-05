import GoogleGate from '../../components/GoogleGate/GoogleGate';
import GooglePostsMockup from './GooglePostsMockup';

/*
 * Sale de la Local Posts API (fase 4.7), que también permite crear y programar.
 *
 * Hasta entonces la pantalla es la maqueta de `GooglePostsMockup`, borrosa y
 * bloqueada detrás de `GoogleGate`.
 */

export default function GooglePosts() {
  return (
    <GoogleGate
      description="Las publicaciones de Google Business aparecen en tu ficha y caducan solas. Para verlas y crearlas desde acá hace falta la conexión."
      benefits={[
        'Qué publicaciones tenés vigentes y cuándo vencen.',
        'Cuánta gente las vio y cuántos hicieron clic.',
        'Crear novedades, ofertas y eventos sin salir del panel.',
        'Programarlas para que salgan solas.',
      ]}
    >
      <GooglePostsMockup />
    </GoogleGate>
  );
}
