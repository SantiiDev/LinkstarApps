import PageHeader from '../../components/PageHeader/PageHeader';
import ContactForm from '../../components/ContactForm/ContactForm';
import { useAuth } from '../../context/AuthContext';
import { useOrg } from '../../context/OrgContext';
import './Contact.css';

/* Contacto y soporte, adentro del panel. Es el mismo formulario que la landing
 * y el sitio de ventas (POST /api/contact), con dos diferencias: el nombre y el
 * mail vienen de la sesión, y al final del mensaje se agrega desde qué
 * organización se escribe — sin eso, del lado nuestro una consulta de soporte
 * llega sin saber de qué cuenta es. La pantalla lo dice para que no sea una
 * sorpresa.
 *
 * Se llega desde el sidebar y desde el "¿Necesitás ayuda? Escribinos" de la
 * barra superior, que antes abría un mailto. */

const SUPPORT_EMAIL = 'linkstar.app1@gmail.com';

export default function ContactPage() {
  const { user } = useAuth();
  const { org } = useOrg();

  const fullName = user?.user_metadata?.full_name || '';
  const context = org
    ? `Enviado desde el panel · Organización: ${org.organization_name} (${org.organization_id}) · Plan: ${org.plan_name || org.plan_code || '—'}`
    : 'Enviado desde el panel';

  return (
    <div className="contact-page">
      <PageHeader
        eyebrow="Ayuda"
        title="Contacto"
        subtitle="¿Una duda, un problema con un expositor o una idea? Escribinos"
      />

      <div className="contact-page__grid">
        <ContactForm
          idPrefix="panel-contact"
          initialName={fullName}
          initialEmail={user?.email || ''}
          context={context}
        />

        <aside className="contact-page__aside">
          <div className="contact-page__card">
            <h3>Te respondemos en menos de 24 horas</h3>
            <p>
              Llega a nuestra casilla con tu nombre, tu mail y la organización desde la que escribís
              {org?.organization_name ? <> (<strong>{org.organization_name}</strong>)</> : null}, así te
              ubicamos sin pedirte más datos.
            </p>
          </div>

          <div className="contact-page__card">
            <h3>¿Preferís el mail?</h3>
            <p>
              Escribinos a <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
            </p>
          </div>

          <div className="contact-page__card">
            <h3>Para que sea más rápido</h3>
            <ul>
              <li>Si es sobre un expositor, decinos cuál (el nombre que tiene en Dispositivos).</li>
              <li>Si algo no funciona, contanos qué pantalla estabas usando y qué esperabas que pasara.</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
