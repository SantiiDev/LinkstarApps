import './Info.css';

export default function Warranty() {
  return (
    <section className="info-page">
      <div className="container info-page__inner">
        <h1 className="info-page__title">Política de Garantía</h1>
        <div className="info-page__content">
          <h2>1. Cobertura de la Garantía</h2>
          <p>
            Todos los dispositivos y carteles físicos de Linkstar cuentan con una garantía legal de <strong>6 meses</strong> desde el momento en que se efectúa la entrega.
            Esta garantía cubre cualquier defecto de fábrica que afecte el normal funcionamiento del chip NFC o fallas estructurales del material no atribuibles al mal uso.
          </p>

          <h2>2. ¿Qué NO cubre la garantía?</h2>
          <p>
            La garantía quedará sin efecto en los siguientes casos:
          </p>
          <ul>
            <li>Daños causados por golpes, caídas o manipulación indebida del producto.</li>
            <li>Exposición directa y prolongada al agua o temperaturas extremas si el producto no fue especificado para exteriores.</li>
            <li>Desgaste estético normal por el uso diario (rayones menores en la superficie).</li>
            <li>Cualquier intento de modificación, apertura o alteración del mecanismo interno donde se aloja el chip.</li>
          </ul>

          <h2>3. Vida Útil del Chip NFC</h2>
          <p>
            La tecnología NFC integrada no utiliza baterías ni fuentes de energía externa, ya que se alimenta del smartphone del usuario durante el escaneo. Por lo tanto, el chip en sí tiene una vida útil prácticamente ilimitada (estimada en más de 100,000 lecturas). 
          </p>

          <h2>4. Procedimiento de Reclamo</h2>
          <p>
            En caso de detectar una falla cubierta por esta garantía, el cliente debe:
          </p>
          <ol>
            <li>Contactarse a través de nuestro formulario de Soporte o email oficial, detallando el inconveniente.</li>
            <li>Adjuntar fotografías o videos claros que evidencien el problema.</li>
            <li>Proporcionar el número de pedido o factura de compra.</li>
          </ol>
          <p>
            Una vez aprobado el reclamo, Linkstar procederá al reemplazo o reparación del producto defectuoso sin costo adicional para el cliente.
          </p>
        </div>
      </div>
    </section>
  );
}
