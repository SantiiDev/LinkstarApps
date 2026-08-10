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
            No se comunicarán los datos a terceros, salvo obligación legal. Nuestra infraestructura de servidores en la nube cuenta con los máximos estándares de seguridad y privacidad.
          </p>

          <h2>5. Derechos del Usuario</h2>
          <p>
            Los derechos que asisten al Usuario son:
          </p>
          <ul>
            <li>Derecho a retirar el consentimiento en cualquier momento.</li>
            <li>Derecho de acceso, rectificación, portabilidad y supresión de sus datos.</li>
            <li>Derecho a la limitación u oposición a su tratamiento.</li>
          </ul>
          <p>
            Para ejercer estos derechos, puede ponerse en contacto con nosotros a través de los canales de soporte oficiales.
          </p>
        </div>
      </div>
    </section>
  );
}
