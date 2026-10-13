import { useState } from 'react';
import { LayoutDashboard, ClipboardList, FileCheck2, FolderOpen, ChartColumnIncreasing, Settings2 } from 'lucide-react';
const sections = [
  { name:'Inicio', icon:LayoutDashboard, description:'Resumen del Plan de Acción Institucional y accesos rápidos.' },
  { name:'Gestionar PAI', icon:Settings2, description:'Administración de líneas estratégicas, metas, actividades e indicadores.' },
  { name:'Reporte trimestral', icon:ClipboardList, description:'Registro de logros, dificultades, avances y soportes por trimestre.' },
  { name:'Validación de avances', icon:FileCheck2, description:'Revisión, aprobación y devolución de reportes por Planeación y Calidad.' },
  { name:'Evidencias', icon:FolderOpen, description:'Documentos de soporte asociados a cada meta y actividad.' },
  { name:'Dashboard', icon:ChartColumnIncreasing, description:'Indicadores y seguimiento institucional por dependencia y trimestre.' },
];
export default function App(){
 const [active,setActive]=useState('Inicio');
 const current=sections.find(s=>s.name===active)!;
 const Icon=current.icon;
 return <><header className="top"><strong>Fundación Universitaria María Cano</strong><span>PAI Digital · Entorno de desarrollo</span></header><nav aria-label="Módulos PAI">{sections.map(s=><button key={s.name} className={active===s.name?'selected':''} onClick={()=>setActive(s.name)}>{s.name}</button>)}</nav><main><div className="crumb">Plan de Acción Institucional / {active}</div><section className="panel"><div className="heading"><Icon size={28}/><div><h1>{active}</h1><p>{current.description}</p></div></div><div className="notice"><strong>Fase 1 · Estructura inicial</strong><p>Esta es una base React funcional de navegación. Aún no tiene autenticación, conexión a SharePoint, formularios persistentes ni permisos implementados. Los diseños HTML originales están en la carpeta <code>referencias</code> para migrarlos a componentes React.</p></div><div className="cards">{sections.filter(s=>s.name!==active).map(s=><button key={s.name} className="card" onClick={()=>setActive(s.name)}><s.icon size={22}/><strong>{s.name}</strong><span>{s.description}</span></button>)}</div></section></main></>;
}
