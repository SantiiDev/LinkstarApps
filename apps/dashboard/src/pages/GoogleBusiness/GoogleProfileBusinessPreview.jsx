/*
 * MAQUETA DECORATIVA — fondo de BusinessLock en Perfil, no datos.
 *
 * Dibuja la tarjeta de protección de ficha con un cambio INVENTADO. Se renderiza
 * ÚNICAMENTE como `preview` de components/BusinessLock (borrosa, inerte, con un
 * velo que no se cierra). NO agregar otro importador.
 */
export function ProtectionPreview() {
  return (
    <div className="gb-card gbp-card gbp-protect">
      <div className="gbp-card__head">
        <h3 className="gb-card__title">Protección de ficha</h3>
      </div>
      <p className="gbp-hint">Revisamos tu ficha todos los días y te avisamos si Google cambia algo por su cuenta.</p>
      <div className="gbp-change">
        <div className="gbp-change__head">
          <strong>Google cambió: Teléfono</strong>
          <span>hace 2 horas</span>
        </div>
        <div className="gbp-change__diff">
          <span className="gbp-change__field">Teléfono</span>
          <span>Tenías: <b>0341 555-0000</b></span>
          <span>Google muestra: <b>0800 000-0000</b></span>
        </div>
        <div className="gbp-change__diff">
          <span className="gbp-change__field">Abierto / cerrado</span>
          <span>Tenías: <b>Abierto</b></span>
          <span>Google muestra: <b>Cerrado permanentemente</b></span>
        </div>
      </div>
    </div>
  );
}
