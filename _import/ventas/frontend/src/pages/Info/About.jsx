import './Info.css';

export default function About() {
  return (
    <section className="info-page">
      <div className="container info-page__inner">
        <h1 className="info-page__title">Sobre nosotros</h1>
        <div className="info-page__content">
          <h2>Nuestra Misión</h2>
          <p>
            En Linkstar, nacimos con un propósito claro: democratizar y simplificar la conexión entre el mundo físico y el digital.
            Creemos que cualquier negocio, sin importar su tamaño, debe poder interactuar de manera instantánea y elegante con sus clientes.
          </p>
          
          <h2>El Problema que Resolvemos</h2>
          <p>
            Notamos que muchos comercios luchaban por conseguir reseñas en Google o seguidores en redes sociales debido a la fricción de pedirle al usuario que busque el nombre del local o escanee códigos QR complejos y borrosos. 
            Con nuestros carteles NFC, esa barrera desaparece: un solo toque y el cliente está conectado.
          </p>

          <h2>Nuestra Tecnología</h2>
          <p>
            No solo fabricamos dispositivos estéticos y premium. Hemos desarrollado <strong>LinkstarApp</strong>, una plataforma propia y gratuita que entrega el verdadero valor a nuestros clientes: los datos.
            Permitimos a los dueños de negocios medir cada interacción, comparar ubicaciones, gamificar el trabajo de sus empleados y tener el control absoluto de su reputación online.
          </p>
          
          <h2>Nuestra Visión a Futuro</h2>
          <p>
            Queremos ser el puente estándar de interacción física-digital en la industria del retail y la hostelería en Latinoamérica y el mundo.
            Trabajamos día a día desarrollando nuevas funcionalidades para la plataforma e ideando formatos innovadores para que tu marca nunca deje de crecer.
          </p>
        </div>
      </div>
    </section>
  );
}
