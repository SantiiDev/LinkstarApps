import { useOrg } from '../../context/OrgContext';
import MonthlyReportsMockup from './MonthlyReportsMockup';
import MonthlyReportsPitch from './MonthlyReportsPitch';
import MonthlyReportsScreen from './MonthlyReportsScreen';

/*
 * Informes mensuales — una sección de Business (el plan lo promete desde la 0013).
 *
 *   plan gratis          → MonthlyReportsPitch (el modal de ventas de Business)
 *                          con MonthlyReportsMockup de fondo.
 *   Business/Enterprise  → MonthlyReportsScreen: los locales reales, y todo lo
 *                          que haría algo marcado «Próximamente», porque los
 *                          informes todavía no se generan (ver su cabecera).
 *
 * No pasa por GoogleGate: el informe también lleva los escaneos, y la lista de
 * locales no depende de Google.
 */
export default function MonthlyReports({ onNavigateSettings }) {
  const { isBusiness } = useOrg();

  if (!isBusiness) {
    return (
      <MonthlyReportsPitch>
        <MonthlyReportsMockup />
      </MonthlyReportsPitch>
    );
  }

  return <MonthlyReportsScreen onNavigateSettings={onNavigateSettings} />;
}
