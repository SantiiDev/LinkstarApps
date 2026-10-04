import './Info.css';

/* Reescrita para la normativa argentina. El texto anterior era vocabulario del
 * RGPD europeo —"portabilidad", "limitación u oposición", "seudonimización"—
 * que acá no aplica: la norma vigente es la Ley 25.326 y el organismo de
 * control es la AAIP.
 *
 * El punto sobre las IPs no es relleno: el backend hashea la IP de cada escaneo
 * con un pepper y nunca la guarda en claro (ver private.app_secrets en la
 * migración 0001), así que conviene decirlo donde el visitante lo pueda leer.
 *
 * Datos de la empresa: marcadores hasta que estén los papeles del monotributo.
 * Buscar "[RAZÓN SOCIAL]" para completarlos todos de una. */
export default function Privacy() {
  return (
    <section className="info-page">
      <div className="container info-page__inner">
        <h1 className="info-page__title">Política de privacidad</h1>
        <div className="info-page__content">
          <h2>1. Responsable de la base de datos</h2>
          <p>
            El responsable del tratamiento de tus datos personales es [RAZÓN SOCIAL], CUIT [CUIT],
            con domicilio en [DOMICILIO]. Podés contactarnos en [EMAIL].
          </p>
          <p>
            Tratamos tus datos conforme a la <strong>Ley 25.326 de Protección de los Datos
            Personales</strong> y sus normas complementarias.
          </p>

          <h2>2. Para qué usamos tus datos</h2>
          <ul>
            <li>Gestionar la compra, el cobro y el envío de los expositores NFC.</li>
            <li>Darte soporte y vincular tus dispositivos a tu cuenta de LinkstarApp.</li>
            <li>
              Enviarte comunicaciones sobre LinkstarApp, sólo si nos diste tu consentimiento. Podés
              revocarlo en cualquier momento escribiéndonos.
            </li>
            <li>Elaborar estadísticas agregadas para mejorar el producto.</li>
          </ul>

          <h2>3. Datos de los escaneos</h2>
          <p>
            Cuando alguien usa un expositor Linkstar registramos el escaneo para poder mostrarle las
            métricas al dueño del negocio. <strong>No guardamos la dirección IP en claro</strong>:
            se almacena únicamente un hash irreversible, de modo que no es posible reconstruir la IP
            original ni identificar a la persona que escaneó.
          </p>

          <h2>4. Conservación</h2>
          <p>
            Conservamos tus datos mientras dure la relación comercial y, después, durante los plazos
            que exijan las normas fiscales y comerciales. Cumplidos esos plazos los eliminamos o
            los anonimizamos de forma irreversible.
          </p>

          <h2>5. A quién se los damos</h2>
          <p>
            No cedemos tus datos a terceros, salvo obligación legal o requerimiento de autoridad
            competente. Trabajamos con proveedores de infraestructura y de pagos que los tratan
            únicamente por nuestra cuenta y siguiendo nuestras instrucciones.
          </p>

          <h2>6. Tus derechos</h2>
          <p>
            Tenés derecho a acceder a tus datos, y a rectificarlos, actualizarlos o suprimirlos
            cuando corresponda. Escribinos a [EMAIL] y te respondemos dentro de los plazos que fija
            la Ley 25.326: 10 días corridos para el acceso y 5 días hábiles para la rectificación o
            supresión.
          </p>
          <p>
            El titular de los datos personales tiene la facultad de ejercer el derecho de acceso en
            forma gratuita a intervalos no inferiores a seis meses, salvo que acredite un interés
            legítimo al efecto, conforme el artículo 14, inciso 3 de la Ley 25.326.
          </p>
          <p>
            La <strong>Agencia de Acceso a la Información Pública</strong>, órgano de control de la
            Ley 25.326, tiene la atribución de atender las denuncias y reclamos que se interpongan
            con relación al incumplimiento de las normas sobre protección de datos personales.
          </p>
        </div>
      </div>
    </section>
  );
}
