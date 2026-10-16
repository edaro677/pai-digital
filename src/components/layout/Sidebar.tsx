import { PanelLeftClose, PanelLeftOpen, ShieldCheck, Layers3, X } from 'lucide-react';
import type { Section } from '../../types/navigation';

type SidebarProps = {
  active: string;
  collapsed: boolean;
  mobileOpen: boolean;
  sections: Section[];
  onToggleCollapsed: () => void;
  onCloseMobile: () => void;
  navigate: (name: string) => void;
};

export default function Sidebar({ active, collapsed, mobileOpen, sections, onToggleCollapsed, onCloseMobile, navigate }: SidebarProps) {
  return (
    <aside className={`sidebar ${mobileOpen?'mobile-open':''}`} aria-label="Navegación principal">
      <div className="brand"><div className="brand-symbol">MC</div><div className="brand-copy"><strong>María Cano</strong><span>Portal institucional</span></div><button className="collapse-button" title={collapsed?'Expandir menú':'Contraer menú'} onClick={onToggleCollapsed}>{collapsed?<PanelLeftOpen size={18}/>:<PanelLeftClose size={18}/>}</button><button className="mobile-close" onClick={onCloseMobile} aria-label="Cerrar menú"><X size={20}/></button></div>
      <div className="product-identity"><span className="product-icon"><Layers3 size={19}/></span><div><strong>PAI Digital</strong><span>Plan de Acción Institucional</span></div></div>
      <div className="nav-label">ESPACIO DE TRABAJO</div>
      <nav className="side-nav">{sections.map(s=><button title={s.name} key={s.name} onClick={()=>navigate(s.name)} className={`nav-item ${active===s.name?'active':''}`}><s.icon size={19} strokeWidth={1.9}/><span>{s.name}</span>{active===s.name&&<span className="active-dot"/>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="sidebar-info"><ShieldCheck size={18}/><div><strong>Entorno de desarrollo</strong><span>Sin conexión a datos reales</span></div></div><div className="sidebar-footer">Fundación Universitaria María Cano</div></div>
    </aside>
  );
}
