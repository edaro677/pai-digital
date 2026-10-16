import { LayoutDashboard, ClipboardList, FileCheck2, FolderOpen, ChartNoAxesCombined, Settings2 } from 'lucide-react';
import type { Section } from '../types/navigation';

export const sections: Section[] = [
  {name:'Inicio',icon:LayoutDashboard,eyebrow:'Vista general',description:'Una visión clara del Plan de Acción Institucional y de los procesos disponibles.'},
  {name:'Gestionar PAI',icon:Settings2,eyebrow:'Planeación estratégica',description:'Estructura institucional de líneas estratégicas, metas, actividades e indicadores.'},
  {name:'Reporte trimestral',icon:ClipboardList,eyebrow:'Seguimiento periódico',description:'Registro de avances, logros, dificultades y resultados por trimestre.'},
  {name:'Validación de avances',icon:FileCheck2,eyebrow:'Control y seguimiento',description:'Revisión de los reportes trimestrales y gestión de observaciones.'},
  {name:'Evidencias',icon:FolderOpen,eyebrow:'Gestión documental',description:'Consulta y organización de los soportes asociados al cumplimiento del PAI.'},
  {name:'Dashboard',icon:ChartNoAxesCombined,eyebrow:'Analítica institucional',description:'Indicadores, comparativos y seguimiento por dependencia y periodo.'},
];
