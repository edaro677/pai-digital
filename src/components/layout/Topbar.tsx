import { Menu, ChevronRight, Search } from 'lucide-react';
import type { ReactNode } from 'react';

type TopbarProps = {
  active: string;
  onOpenMobile: () => void;
  onToggleSearch: () => void;
  authControls: ReactNode;
};

export default function Topbar({ active, onOpenMobile, onToggleSearch, authControls }: TopbarProps) {
  return (
    <header className="topbar"><div className="top-left"><button className="mobile-menu icon-button" onClick={onOpenMobile} aria-label="Abrir menú"><Menu size={21}/></button><span className="top-location">PAI Digital</span><ChevronRight size={15}/><strong>{active}</strong></div><div className="top-actions"><button className="icon-button search-trigger" aria-label="Buscar módulo" title="Buscar módulo" onClick={onToggleSearch}><Search size={20}/></button><span className="top-divider"/><div className="environment-tag"><span/> Desarrollo</div>
{authControls}
    </div></header>
  );
}
