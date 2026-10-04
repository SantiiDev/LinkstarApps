import GoogleGate from '../../components/GoogleGate/GoogleGate';
import GoogleProfileMockup from './GoogleProfileMockup';

/*
 * Esta pantalla es de lectura Y escritura (fase 4.7): la gracia es poder editar
 * la ficha desde acá sin ir a Google. Por eso el texto habla de editar, no sólo
 * de mirar.
 *
 * Hasta entonces la pantalla es la maqueta de `GoogleProfileMockup`, borrosa y
 * bloqueada detrás de `GoogleGate`.
 */

export default function GoogleProfile() {
  return (
    <GoogleGate
      description="Conectá tu cuenta y vas a poder ver y corregir los datos de tu ficha sin salir del panel."
      benefits={[
        'Nombre, categoría, dirección y teléfono, con el estado de verificación.',
        'Horarios normales y los especiales de feriados.',
        'Fotos y descripción del negocio.',
        'Editar cualquiera de esos campos y que se publique en Google.',
      ]}
      note="Los cambios que hagas acá se escriben en tu ficha real. Es la misma información que ve alguien buscándote en Maps."
    >
      <GoogleProfileMockup />
    </GoogleGate>
  );
}
