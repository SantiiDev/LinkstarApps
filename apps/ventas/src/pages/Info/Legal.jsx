import './Info.css';

/* El aviso legal de un sitio que vende tiene que identificar al vendedor: la
 * Ley 24.240 (art. 4) y la Res. 104/2005 exigen razón social, CUIT y domicilio
 * visibles. El texto anterior decía sólo "este sitio pertenece a Linkstar", que
 * no identifica a nadie, y fijaba la ley aplicable en "la jurisdicción
 * correspondiente", que no dice nada.
 *
 * Datos de la empresa: marcadores hasta que estén los papeles del monotributo.
 * Buscar "[RAZÓN SOCIAL]" para completarlos todos de una. */
export default function Legal() {
  return (
    <section className="info-page">
      <div className="container info-page__inner">
        <h1 className="info-page__title">Aviso legal</h1>
        <div className="info-page__content">
          <h2>1. Identificación del titular</h2>
          <p>
            Este sitio web es operado por <strong>[RAZÓN SOCIAL]</strong>, CUIT{' '}
            <strong>[CUIT]</strong>, con domicilio en <strong>[DOMICILIO]</strong>, República
            Argentina. Correo de contacto: <strong>[EMAIL]</strong>.
          </p>
          <p>
            El uso de este sitio y de nuestros servicios implica la aceptación de las disposiciones
            de este Aviso Legal, de los Términos y Condiciones y de la Política de Privacidad.
          </p>

          <h2>2. Propiedad intelectual</h2>
          <p>
            El diseño del portal, su código fuente, los logos, marcas y demás signos distintivos
            pertenecen a [RAZÓN SOCIAL] y están protegidos por la Ley 11.723 de Propiedad
            Intelectual y por la Ley 22.362 de Marcas. Queda prohibida su reproducción,
            distribución, comunicación pública o transformación, total o parcial, sin autorización
            expresa.
          </p>

          <h2>3. Responsabilidad sobre los contenidos</h2>
          <p>
            No nos hacemos responsables por el contenido ni por la legalidad de los sitios de
            terceros a los que se pueda acceder desde este portal o desde los enlaces configurados
            en un dispositivo Linkstar por su titular.
          </p>
          <p>
            Nos reservamos el derecho de modificar o actualizar los contenidos y el diseño del sitio
            sin previo aviso, para mantener la información al día.
          </p>

          <h2>4. Defensa del consumidor</h2>
          <p>
            Si sos consumidor, te amparan la Ley 24.240 de Defensa del Consumidor y el artículo 42
            de la Constitución Nacional. Podés consultar tus derechos o iniciar un reclamo ante la
            Dirección Nacional de Defensa del Consumidor a través del enlace que figura en el pie de
            este sitio.
          </p>

          <h2>5. Ley aplicable y jurisdicción</h2>
          <p>
            Estas disposiciones se rigen por las leyes de la República Argentina. Ante cualquier
            controversia serán competentes los tribunales ordinarios del domicilio del consumidor,
            conforme al artículo 36 de la Ley 24.240.
          </p>
        </div>
      </div>
    </section>
  );
}
