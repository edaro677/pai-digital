import { ArrowUpRight, ArrowRight, ShieldCheck, Clock3, CheckCircle2, FileSpreadsheet, Building2 } from 'lucide-react';
import type { Section } from '../../types/navigation';

export type ModulePlaceholderProps = {
  active: string;
  current: Section;
  sections: Section[];
  navigate: (name: string) => void;
};

export default function ModulePlaceholder({ active, current, sections, navigate }: ModulePlaceholderProps) {
  const CurrentIcon=current.icon;

  return (
    <>
        <section className="module-hero"><div className="module-hero-icon"><CurrentIcon size={27}/></div><div><span className="overline">MÓDULO DEL PORTAL</span><h2>{active}</h2><p>{current.description}</p></div><span className="module-state">Diseño inicial</span></section>
        <div className="module-content-grid"><section className="surface main-module"><div className="surface-heading"><div><span className="overline">VISTA GENERAL</span><h2>Espacio de trabajo</h2></div><span className="small-pill">Próximamente</span></div><div className="placeholder-illustration"><div className="placeholder-icon"><CurrentIcon size={36}/></div><h3>Preparando el módulo de {active.toLowerCase()}</h3><p>La navegación y el diseño están disponibles. Las funciones operativas se incorporarán después de validar los requisitos del proceso y las reglas de negocio.</p><div className="placeholder-features"><span><CheckCircle2 size={16}/> Estructura visual</span><span><Clock3 size={16}/> Funcionalidad pendiente</span></div></div></section><aside className="surface context-panel"><span className="overline">CONTEXTO DEL MÓDULO</span><h2>¿Qué permitirá hacer?</h2><p>{current.description}</p><div className="context-row"><FileSpreadsheet size={18}/><span>Basado en el proceso actual del PAI 2026.</span></div><div className="context-row"><Building2 size={18}/><span>Requisitos sujetos a revisión por Planeación.</span></div><div className="context-row"><ShieldCheck size={18}/><span>Acceso y permisos por definir e implementar.</span></div><button className="back-link" onClick={()=>navigate('Inicio')}>Volver al inicio <ArrowRight size={16}/></button></aside></div>
        <div className="section-head related"><div><span className="overline">CONTINÚA EXPLORANDO</span><h2>Otros módulos</h2></div></div><div className="related-grid">{sections.filter(s=>s.name!==active).slice(0,3).map(s=><button key={s.name} onClick={()=>navigate(s.name)}><s.icon size={19}/><span>{s.name}</span><ArrowUpRight size={16}/></button>)}</div>
    </>
  );
}
