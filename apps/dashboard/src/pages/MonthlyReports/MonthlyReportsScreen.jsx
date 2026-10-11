import { useEffect, useState } from 'react';
import PageHeader from '../../components/PageHeader/PageHeader';
import PageSkeleton from '../../components/PageSkeleton/PageSkeleton';
import SectionPlaceholder from '../../components/SectionPlaceholder/SectionPlaceholder';
import { useAuth } from '../../context/AuthContext';
import { useOrg } from '../../context/OrgContext';
import { fetchLocationRows } from '../../lib/catalogApi';
import { AutoGenerationNotice, EmailDeliveryCard, LocationReports, ReportsPeriodChip } from './MonthlyReportsBlocks';
import '../GoogleBusiness/GoogleBusiness.css';
import './MonthlyReports.css';

/*
 * Informes mensuales — la pantalla de una cuenta Business (la estructura es la de
 * «Informes de Reputación» de Tapstar: un acordeón por local).
 *
 * TODAVÍA NO SE GENERA NINGÚN INFORME. La pantalla muestra los locales reales con
 * «0 informes disponibles» y todo lo que haría algo deshabilitado y con
 * «Próximamente»; nunca un informe de mentira. Lo que falta, cuando se encare:
 *   - el contenido del informe (lo define Santiago con el socio);
 *   - generarlo el día 5 de cada mes (Google publica sus métricas con ~4 días de
 *     atraso) desde el job diario, uno por local y otro de toda la marca;
 *   - el PDF, en un bucket PRIVADO de Supabase, descargado con link firmado;
 *   - una tabla chica de metadatos: una fila por local y mes (ruta del PDF,
 *     generado, vence según data_retention_days). El PDF ya es la foto fija del
 *     mes: no hace falta guardar además los números;
 *   - el envío por Resend con link (pide sesión), con un kind nuevo en
 *     notification_log para no mandarlo dos veces.
 *
 * El JSX de la maqueta vieja (una lista por mes con números inventados) sigue en
 * git show maquetas-pre-fase-2:apps/dashboard/src/pages/MonthlyReports/MonthlyReports.jsx
 * sólo como referencia histórica: la estructura que se eligió es otra.
 */

function retentionMonths(days) {
  return Math.max(1, Math.round((days ?? 365) / 30.4));
}

export default function MonthlyReportsScreen({ onNavigateSettings }) {
  const { org, retentionDays } = useOrg();
  const { user } = useAuth();
  const orgId = org?.organization_id;
  const [locations, setLocations] = useState(null);
  const [error, setError] = useState(null);
  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    setError(null);
    fetchLocationRows(orgId)
      .then((rows) => { if (!cancelled) setLocations(rows); })
      .catch((err) => {
        console.error('No se pudieron cargar los locales:', err);
        if (!cancelled) setError(err);
      });
    return () => { cancelled = true; };
  }, [orgId]);

  const months = retentionMonths(retentionDays);
  const header = (
    <PageHeader
      eyebrow="Informes"
      title="Informes mensuales"
      subtitle={`Un informe PDF por local cada mes, disponible durante ${months} meses`}
      actions={<ReportsPeriodChip />}
    />
  );

  if (error) {
    return (
      <div className="gb-page mrep-page">
        {header}
        <SectionPlaceholder
          title="No pudimos cargar tus locales"
          description="Probá recargar la página en un rato."
        />
      </div>
    );
  }
  if (!locations) {
    return (
      <div className="gb-page mrep-page">
        {header}
        <PageSkeleton />
      </div>
    );
  }

  const items = locations.map((l) => ({
    id: l.id,
    name: l.name,
    subtitle: [l.city, l.province].filter(Boolean).join(', '),
    reports: [],
  }));
  if (items.length > 1) {
    items.unshift({
      id: 'brand',
      brand: true,
      name: org?.organization_name ?? 'Toda tu marca',
      subtitle: `Toda tu marca · los ${items.length} locales juntos`,
      reports: [],
    });
  }
  const toggle = (id) => setOpenId((current) => (current === id ? null : id));

  return (
    <div className="gb-page mrep-page">
      {header}
      <AutoGenerationNotice soon />

      {items.length === 0 ? (
        <div className="gb-card mrep-empty-card">
          <p className="mrep-empty-card__title">Todavía no cargaste ningún local</p>
          <p>Los informes son por local. Cargá tus sucursales y acá va a aparecer una por una.</p>
          {onNavigateSettings && (
            <button type="button" className="gb-btn-primary" onClick={() => onNavigateSettings('local')}>
              Ir a Gestión local
            </button>
          )}
        </div>
      ) : (
        <div className="mrep-list">
          {items.map((item) => (
            <LocationReports
              key={item.id}
              item={item}
              brand={item.brand}
              open={openId === item.id}
              onToggle={() => toggle(item.id)}
              soon
            />
          ))}
        </div>
      )}

      <EmailDeliveryCard recipients={user?.email ? [user.email] : []} soon />
    </div>
  );
}
