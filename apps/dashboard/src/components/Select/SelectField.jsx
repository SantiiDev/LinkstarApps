import Icon from '../Icon/Icon';
import Select from './Select';
import './Select.css';

/*
 * Un campo de una barra de filtros: etiqueta arriba y el control abajo, con un
 * ícono opcional a la izquierda. Lo usan Mi Empresa (local y período) y Reseñas
 * (local, rating, estado, orden, tipo y buscador), que antes tenían cada una su
 * copia del mismo markup.
 *
 * `FilterField` envuelve cualquier control (el buscador de Reseñas es un
 * <input>); `SelectField` es el caso común, con el <Select> ya puesto. El ancho
 * lo decide la barra que lo contiene.
 */
export function FilterField({ label, icon, className = '', children }) {
  return (
    <div className={`ls-field ${className}`}>
      <span className="ls-field__label">{label}</span>
      <div className="ls-field__control">
        {icon && <span className="ls-field__icon"><Icon name={icon} size={15} /></span>}
        {children}
      </div>
    </div>
  );
}

export default function SelectField({ label, icon, ...selectProps }) {
  return (
    <FilterField label={label} icon={icon}>
      <Select
        {...selectProps}
        triggerClassName={`ls-select-field ls-select-field--block${icon ? ' ls-select-field--icon' : ''}`}
      />
    </FilterField>
  );
}
