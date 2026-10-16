import { Sparkles, ArrowUpRight, Layers3, ArrowRight, Info, Clock3 } from 'lucide-react';
import type { Section } from '../../types/navigation';
import { steps } from './inicio.data';

type InicioPageProps = {
  sections: Section[];
  navigate: (name: string) => void;
};

export default function InicioPage({ sections, navigate }: InicioPageProps) {
  return (
    <>
        <section className="hero"><div className="hero-content"><span className="hero-kicker"><Sparkles size={15}/> TRANSFORMACIÓN DIGITAL</span><h2>Una nueva forma de planear, hacer seguimiento y avanzar.</h2><p>Estamos construyendo un espacio centralizado para gestionar el Plan de Acción Institucional, con información organizada y procesos más claros.</p><button className="hero-cta" onClick={()=>navigate('Gestionar PAI')}>Explorar módulos <ArrowUpRight size={17}/></button></div><div className="hero-art" aria-hidden="true"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="orbit orbit-three"/><div className="hero-art-card"><Layers3 size={32}/><span>PAI</span><small>2026</small></div></div></section>
        <div className="section-head"><div><span className="overline">EXPLORA EL PORTAL</span><h2>Módulos de trabajo</h2><p>Accede a las funciones previstas para cada etapa del proceso.</p></div></div>
        <div className="module-grid">{sections.filter(s=>s.name!=='Inicio').map((s,i)=><button className="module-card" key={s.name} onClick={()=>navigate(s.name)}><span className={`module-icon shade-${i}`}><s.icon size={22}/></span><span className="module-arrow"><ArrowUpRight size={19}/></span><strong>{s.name}</strong><span className="module-desc">{s.description}</span><span className="module-link">Explorar módulo <ArrowRight size={15}/></span></button>)}</div>
        <div className="lower-grid"><section className="surface project-status"><div className="surface-heading"><div><span className="overline">HOJA DE RUTA</span><h2>Estado del proyecto</h2></div><span className="small-pill">Fase inicial</span></div><div className="step-list">{steps.map((s,i)=><div className="step" key={s.name}><span className={`step-icon ${i<2?'done':''}`}><s.icon size={17}/></span><div><strong>{s.name}</strong><span>{s.state}</span></div></div>)}</div></section><section className="surface info-surface"><span className="info-icon"><Info size={22}/></span><span className="overline">IMPORTANTE</span><h2>Construcción por etapas</h2><p>Esta versión presenta la estructura visual y la navegación. La autenticación institucional, el almacenamiento de información, los permisos y los flujos de aprobación aún no están implementados.</p><div className="info-divider"/><div className="info-note"><Clock3 size={17}/><span>En espera de la validación de requisitos por parte de Planeación.</span></div></section></div>
    </>
  );
}
