import InicioPage from '../features/inicio/InicioPage';
import GestionarPaiPage from '../features/gestionar-pai/GestionarPaiPage';
import ReporteTrimestralPage from '../features/reporte-trimestral/ReporteTrimestralPage';
import ValidacionAvancesPage from '../features/validacion-avances/ValidacionAvancesPage';
import EvidenciasPage from '../features/evidencias/EvidenciasPage';
import DashboardPage from '../features/dashboard/DashboardPage';
import ModulePlaceholder from '../components/shared/ModulePlaceholder';
import type { ModulePlaceholderProps } from '../components/shared/ModulePlaceholder';

export default function ModuleContent(props: ModulePlaceholderProps) {
  switch (props.active) {
    case 'Inicio':
      return <InicioPage sections={props.sections} navigate={props.navigate} />;
    case 'Gestionar PAI':
      return <GestionarPaiPage {...props} />;
    case 'Reporte trimestral':
      return <ReporteTrimestralPage {...props} />;
    case 'Validación de avances':
      return <ValidacionAvancesPage {...props} />;
    case 'Evidencias':
      return <EvidenciasPage {...props} />;
    case 'Dashboard':
      return <DashboardPage {...props} />;
    default:
      return <ModulePlaceholder {...props} />;
  }
}
