import PageHeader from '../../components/PageHeader/PageHeader';
import SectionPlaceholder from '../../components/SectionPlaceholder/SectionPlaceholder';
import './GoogleBusiness.css';

/*
 * Reemplaza la maqueta: había nombre, categoría, dirección, teléfono, horarios
 * y estado de verificación de un negocio que no existe.
 *
 * Esta pantalla es de lectura Y escritura (fase 4.7): la gracia es poder editar
 * la ficha desde acá sin ir a Google. Por eso el texto habla de editar, no sólo
 * de mirar.
 */

export default function GoogleProfile() {
  return (
    <div className="gb-page">
      <PageHeader
        eyebrow="Google Business"
        title="Ficha de Google"
        subtitle="Los datos que ven tus clientes cuando te encuentran en Google"
      />

      <SectionPlaceholder
        variant="google"
        title="Tu ficha, editable desde acá"
        description="Conectá tu cuenta y vas a poder ver y corregir los datos de tu ficha sin salir del panel."
        preview={[
          'Nombre, categoría, dirección y teléfono, con el estado de verificación.',
          'Horarios normales y los especiales de feriados.',
          'Fotos y descripción del negocio.',
          'Editar cualquiera de esos campos y que se publique en Google.',
        ]}
        note="Los cambios que hagas acá se escriben en tu ficha real. Es la misma información que ve alguien buscándote en Maps."
      />
    </div>
  );
}
