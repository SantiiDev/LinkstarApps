import Icon from '../../components/Icon/Icon';

/* Encabezado de cada tarjeta de Configuración: ícono en caja de color, título
 * (con un badge opcional), subtítulo y una acción a la derecha. `icon` es un
 * nombre de components/Icon. */
export default function SettingsCardHead({ icon, iconVariant = 'navy', title, badge, subtitle, action }) {
  return (
    <div className="settings-card__head">
      <div className="settings-card__head-left">
        <div className={`settings-icon-box settings-icon-box--${iconVariant}`}><Icon name={icon} /></div>
        <div>
          <h3 className="settings-card__title-row">
            {title}
            {badge}
          </h3>
          {subtitle}
        </div>
      </div>
      {action && <div className="settings-card__head-action">{action}</div>}
    </div>
  );
}
