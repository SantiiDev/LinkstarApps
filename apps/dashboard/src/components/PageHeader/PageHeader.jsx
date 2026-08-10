import './PageHeader.css';

export default function PageHeader({ eyebrow, title, subtitle, actions }) {
  return (
    <div className="page-header">
      <div className="page-header__title-block">
        {eyebrow && (
          <div className="page-header__eyebrow">
            <span className="page-header__eyebrow-dot" />
            {eyebrow}
          </div>
        )}
        <h1 className="page-header__title">{title}</h1>
        {subtitle && <p className="page-header__subtitle">{subtitle}</p>}
      </div>

      {actions && <div className="page-header__actions">{actions}</div>}
    </div>
  );
}
