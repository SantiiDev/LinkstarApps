import './Info.css';

export default function Privacy() {
  return (
    <section className="info-page">
      <div className="container info-page__inner">
        <h1 className="info-page__title">Política de privacidad</h1>
        <div className="info-page__content">
          <h2>1. Responsable del Tratamiento</h2>
          <p>
            Linkstar es el responsable del tratamiento de los datos personales del Usuario y le informa que estos datos serán tratados de conformidad con lo dispuesto en las normativas vigentes en materia de protección de datos personales.
          </p>

          <h2>2. Finalidad del Tratamiento</h2>
          <p>
            Mantenemos una relación comercial con el Usuario. Las operaciones previstas para realizar el tratamiento son:
          </p>
          <ul>
            <li>Gestión de compras y envíos de carteles NFC.</li>
            <li>Remisión de comunicaciones comerciales publicitarias sobre nuestros servicios de LinkstarApp, si el usuario ha dado su consentimiento.</li>
            <li>Gestión de soporte técnico y vinculación de dispositivos en la plataforma.</li>
            <li>Realizar estudios estadísticos para mejorar la experiencia de usuario.</li>
          </ul>

          <h2>3. Conservación de los Datos</h2>
          <p>
            Se conservarán mientras exista un interés mutuo para mantener el fin del tratamiento y cuando ya no sea necesario para tal fin, se suprimirán con medidas de seguridad adecuadas para garantizar la seudonimización de los datos o la destrucción total de los mismos.
          </p>

          <h2>4. Comunicación de los Datos</h2>
          <p>
            <strong>No vendemos tus datos ni los cedemos a terceros con fines comerciales.</strong> Para
            que el servicio funcione nos apoyamos en los siguientes proveedores, que tratan esos datos
            por nuestra cuenta y únicamente para prestarnos su servicio:
          </p>
          <ul>
            <li><strong>Supabase</strong> — base de datos y alojamiento de la información de pedidos y cuentas.</li>
            <li><strong>Cloudflare</strong> — publicación de este sitio.</li>
            <li><strong>Mercado Pago</strong> — procesamiento de los pagos. Los datos de tu tarjeta los cargás directamente ahí y nunca pasan por nuestros servidores.</li>
            <li><strong>Web3Forms</strong> — envío a nuestra casilla de los avisos de pedidos y consultas.</li>
          </ul>
          <p>
            También los entregaríamos si nos lo exigiera una autoridad competente por una vía legal
            válida.
          </p>

          <h2>5. LinkstarApp</h2>
          <p>
            Si además usás <strong>LinkstarApp</strong>, el panel donde administrás tus expositores, el
            tratamiento de esos datos —escaneos, sucursales, equipo y, si la conectás, tu ficha de Google
            Business Profile— se rige por{' '}
            <a href="https://app.linkstarapp.com/privacidad">la política de privacidad del panel</a>,
            que es un documento aparte.
          </p>

          <h2>6. Derechos del Usuario</h2>
          <p>
            Los derechos que asisten al Usuario son:
          </p>
          <ul>
            <li>Derecho a retirar el consentimiento en cualquier momento.</li>
            <li>Derecho de acceso, rectificación, portabilidad y supresión de sus datos.</li>
            <li>Derecho a la limitación u oposición a su tratamiento.</li>
          </ul>
          <p>
            Para ejercer estos derechos, escribinos a{' '}
            <a href="mailto:linkstar.app1@gmail.com">linkstar.app1@gmail.com</a> y te respondemos.
          </p>
        </div>
      </div>
    </section>
  );
}
