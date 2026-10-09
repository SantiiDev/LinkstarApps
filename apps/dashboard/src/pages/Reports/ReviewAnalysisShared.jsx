import GoogleConnect from '../../components/GoogleConnect/GoogleConnect';
import SelectField, { FilterField } from '../../components/Select/SelectField';
import Icon from '../../components/Icon/Icon';
import { RANGE_OPTIONS } from '../../lib/reviewInsights';

/* Lo que comparten NPS, Sentimiento y Palabras clave (fase 5, 0033): los
 * filtros, el aviso de reconexión y los estados en los que todavía no hay nada
 * que mostrar. La carga está en useReviewAnalysis.js.
 *
 * Los estados vacíos distinguen cuatro cosas que no son lo mismo y que un
 * «sin datos» genérico mezclaría:
 *   - no hay ninguna ficha vinculada        → vincular en Gestión local
 *   - hay reseñas, pero ninguna con texto   → las de sólo estrellas no tienen tono
 *   - hay reseñas con texto sin analizar    → el análisis corre con la lectura
 *                                             diaria (o «Actualizar ahora»)
 *   - el filtro no deja nada                → cambiar el período o la sucursal
 */

export function ReauthNotice({ google }) {
  if (google.connection?.status !== 'needs_reauth') return null;
  return (
    <div className="gbm-notice">
      <p>Google cortó el acceso a tu ficha. Lo de abajo es lo que ya teníamos analizado; para sumar reseñas nuevas, volvé a conectarla.</p>
      <GoogleConnect google={google} align="start" />
    </div>
  );
}

/* Devuelve el bloque a mostrar cuando todavía no hay nada que graficar, o null
   si hay análisis. */
export function AnalysisEmptyState({ data, onNavigateSettings }) {
  if (data.error) return <p className="gbm-error" role="alert">{data.error}</p>;
  if (data.loading) return <p className="gbm-muted">Cargando el análisis…</p>;

  if (!data.linked.length) {
    return (
      <div className="gb-card gbm-empty">
        <p className="gbm-empty__title">Todavía no vinculaste ninguna ficha a una sucursal</p>
        <p>Analizamos sólo las reseñas de las fichas vinculadas. Elegí cuál de tus fichas corresponde a cada sucursal.</p>
        {onNavigateSettings && (
          <button type="button" className="gb-btn-primary" onClick={() => onNavigateSettings('local')}>
            Vincular en Gestión local
          </button>
        )}
      </div>
    );
  }

  if (data.rows.length) return null;

  const { total, withText } = data.counts;
  if (!withText) {
    return (
      <div className="gb-card gbm-empty">
        <p className="gbm-empty__title">Todavía no hay reseñas con texto para analizar</p>
        <p>
          {total
            ? `Tus ${total} reseña${total === 1 ? '' : 's'} son sólo de estrellas. El tono y los temas salen de lo que escribe el cliente, así que aparecen con la primera reseña que traiga texto.`
            : 'Cuando entre la primera reseña con texto en una ficha vinculada, la analizamos y aparece acá.'}
        </p>
      </div>
    );
  }

  return (
    <div className="gb-card gbm-empty">
      <p className="gbm-empty__title">Estamos analizando tus reseñas</p>
      <p>
        Hay {withText} reseña{withText === 1 ? '' : 's'} con texto esperando. El análisis corre con la lectura
        diaria de tu ficha; si recién pasaste a Business o conectaste Google, «Actualizar ahora» en Gestión local
        lo adelanta.
      </p>
    </div>
  );
}

/* Los mismos campos que Mi Empresa y Métricas (components/Select/SelectField):
   «Local» siempre visible, aunque haya una sola sucursal, y los rangos de días
   de Mi Empresa. `showReviewCount` suma un tercer campo, de sólo lectura, con las
   reseñas analizadas del período (Palabras clave, como Tapstar). */
export function AnalysisToolbar({ data, locationId, setLocationId, range, setRange, analyzedCount, showReviewCount = false }) {
  const options = [
    { value: 'all', label: 'Todos los locales' },
    ...data.linked.map((f) => ({ value: f.location_id, label: data.nameOf(f.location_id) })),
  ];
  const { total, withText } = data.counts;
  const withoutText = total - withText;
  // Lo que falta analizar se cuenta sobre todo el historial, no sobre el filtro.
  const pending = Math.max(0, withText - data.rows.length);

  return (
    <div className="gb-card gbm-toolbar">
      <div className="gbm-toolbar__filters">
        <SelectField label="Local" icon="store" value={locationId} onChange={setLocationId} options={options} />
        <SelectField label="Rango de fechas" icon="calendar" value={range} onChange={setRange} options={RANGE_OPTIONS} />
        {showReviewCount && (
          <FilterField label="Reseñas" icon="message" className="reports-count-field">
            <div className="ls-select-field ls-select-field--block ls-select-field--icon reports-count-field__value">
              {analyzedCount}
            </div>
          </FilterField>
        )}
      </div>
      <p className="gbm-note">
        <Icon name="info" size={14} />
        <span>
          {analyzedCount} reseña{analyzedCount === 1 ? '' : 's'} analizada{analyzedCount === 1 ? '' : 's'} en este período.
          {pending > 0 && ` Quedan ${pending} por analizar: se completan en las próximas lecturas diarias.`}
          {withoutText > 0 && (withoutText === 1
            ? ' Una de tus reseñas es sólo de estrellas y no se analiza: no tiene texto.'
            : ` ${withoutText} de tus reseñas son sólo de estrellas y no se analizan: no tienen texto.`)}
          {' '}El análisis lo hace una IA sobre lo que escribió cada cliente, una sola vez por reseña.
        </span>
      </p>
    </div>
  );
}
