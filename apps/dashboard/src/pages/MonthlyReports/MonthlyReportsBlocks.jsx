import Icon from '../../components/Icon/Icon';
import SoonBadge from '../../components/SoonBadge/SoonBadge';
import Switch from '../../components/Switch/Switch';
import { SentimentDistribution } from '../Reports/SentimentBlocks';

/*
 * Informes mensuales, sólo presentación. Lo usan la pantalla real
 * (MonthlyReportsScreen), su maqueta (MonthlyReportsMockup) y los pasos del modal
 * de ventas (MonthlyReportsPitch), así los tres se ven idénticos — el mismo
 * patrón que CompanyBlocks y GoogleSeoBlocks.
 *
 * `soon` es cómo lo ve hoy una cuenta Business: los informes todavía no se
 * generan, así que todo lo que haría algo va deshabilitado y con «Próximamente».
 * Sin `soon` es como se va a ver cuando funcione, y sólo lo dibujan la maqueta y
 * el modal, con datos inventados.
 */

/* «Período actual: Octubre 2026», con el mes de hoy. */
export function ReportsPeriodChip({ date = new Date() }) {
  const month = date.toLocaleDateString('es-AR', { month: 'long' });
  return (
    <span className="mrep-period">
      <Icon name="calendar" size={14} />
      Período actual: <strong>{month.charAt(0).toUpperCase() + month.slice(1)} {date.getFullYear()}</strong>
    </span>
  );
}

/* Se genera el día 5 y no el 1: Google publica las métricas con unos 4 días de
   atraso, y un informe del día 1 tendría el final del mes vacío. */
export function AutoGenerationNotice({ soon = false }) {
  return (
    <div className="mrep-notice">
      <Icon name="fileText" size={16} />
      <p>
        <strong>Generación automática:</strong> el informe de cada mes se arma solo el día 5 del mes siguiente,
        cuando Google ya publicó todos sus números.
        {soon && ' Estamos terminando el informe: todavía no se genera ninguno.'}
      </p>
      {soon && <SoonBadge />}
    </div>
  );
}

function ReportRow({ report, soon }) {
  return (
    <li className="mrep-report">
      <span className="mrep-report__icon"><Icon name="fileText" size={16} /></span>
      <div className="mrep-report__body">
        <span className="mrep-report__month">{report.month}</span>
        <span className="mrep-report__meta">
          <Icon name="clock" size={12} /> Generado el {report.generated}
          <span aria-hidden="true">·</span> Vence el {report.expires}
        </span>
        <div className="mrep-report__actions">
          <span className="mrep-pill mrep-pill--ok"><Icon name="check" size={11} strokeWidth={3} /> Disponible</span>
          <button type="button" className="mrep-btn mrep-btn--ghost" disabled={soon}>
            <Icon name="download" size={13} /> Descargar PDF
          </button>
        </div>
      </div>
    </li>
  );
}

/* Un ítem del acordeón: un local, o «toda tu marca» (`brand`). */
export function LocationReports({ item, brand = false, open, onToggle, soon = false }) {
  const count = item.reports.length;
  return (
    <div className={`gb-card mrep-item${open ? ' mrep-item--open' : ''}`}>
      <button type="button" className="mrep-item__head" aria-expanded={open} onClick={onToggle}>
        <span className={`mrep-item__icon${brand ? ' mrep-item__icon--brand' : ''}`}>
          <Icon name={brand ? 'crown' : 'store'} size={17} />
        </span>
        <span className="mrep-item__titles">
          <span className="mrep-item__name">{item.name}</span>
          {item.subtitle && <span className="mrep-item__sub">{item.subtitle}</span>}
          <span className="mrep-item__count">
            {count} {count === 1 ? 'informe disponible' : 'informes disponibles'}
          </span>
        </span>
        <span className="mrep-item__chevron"><Icon name="chevronDown" size={18} /></span>
      </button>

      {open && (
        <div className="mrep-item__body">
          <button type="button" className="mrep-btn mrep-btn--dark" disabled={soon}>
            <Icon name="fileText" size={13} /> Generar informe
            {soon && <SoonBadge />}
          </button>
          {count > 0 ? (
            <ul className="mrep-reports">
              {item.reports.map((r) => <ReportRow key={r.id} report={r} soon={soon} />)}
            </ul>
          ) : (
            <p className="mrep-empty">
              {soon
                ? 'Todavía no hay informes de este local. El primero va a aparecer acá cuando lancemos los informes.'
                : 'El primer informe de este local aparece el día 5 del mes que viene.'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* A quién le llega el informe cuando se genera. Con `soon` todo va
   deshabilitado: ningún control puede parecer que anda sin andar. */
export function EmailDeliveryCard({ recipients, soon = false }) {
  return (
    <div className="gb-card mrep-email">
      <div className="mrep-email__head">
        <span className="mrep-item__icon"><Icon name="mail" size={17} /></span>
        <div className="mrep-email__titles">
          <p className="mrep-email__title">
            Enviar por correo
            {soon && <SoonBadge />}
          </p>
          <p className="mrep-email__sub">Le mandamos el informe a quien vos digas apenas se genera.</p>
        </div>
        <Switch checked={!soon} disabled={soon} label="" />
      </div>

      <p className="mrep-email__label">Destinatarios</p>
      <ul className="mrep-chips">
        {recipients.map((r) => (
          <li key={r} className="mrep-chip">
            {r}
            <button type="button" aria-label={`Quitar ${r}`} disabled={soon}><Icon name="close" size={11} /></button>
          </li>
        ))}
      </ul>
      <div className="mrep-email__add">
        <input type="email" className="mrep-input" placeholder="tu@email.com, otro@email.com…" disabled={soon} readOnly={!soon} />
        <button type="button" className="mrep-btn mrep-btn--add" aria-label="Agregar" disabled={soon}>
          <Icon name="plus" size={14} />
        </button>
      </div>
      <p className="mrep-email__note">
        Les llega un mail con el link para descargarlo. Para abrirlo hay que iniciar sesión: el informe tiene los
        números de tu negocio.
      </p>
      <div className="mrep-email__foot">
        <button type="button" className="mrep-btn mrep-btn--primary" disabled={soon}>Guardar cambios</button>
      </div>
    </div>
  );
}

/* La primera hoja del PDF, para el paso 2 del modal. Es un dibujo de lo que va
   a ser el informe: el PDF todavía no existe, así que esto NO es una pantalla. */
export function ReportPreview({ page, sentimentCounts }) {
  return (
    <div className="mrep-sheet">
      <div className="mrep-sheet__head">
        <span className="mrep-sheet__brand">linkstar</span>
        <span className="mrep-sheet__meta">{page.location} · {page.month}</span>
      </div>
      <p className="mrep-sheet__title">Informe de reputación</p>
      <div className="mrep-sheet__kpis">
        {page.kpis.map((k) => (
          <div key={k.label} className="mrep-sheet__kpi">
            <span>{k.label}</span>
            <strong>{k.value}</strong>
            <small>{k.trend}</small>
          </div>
        ))}
      </div>
      <SentimentDistribution counts={sentimentCounts} />
    </div>
  );
}
