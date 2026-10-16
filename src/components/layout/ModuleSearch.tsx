import { ArrowRight } from 'lucide-react';
import type { ChangeEvent } from 'react';
import type { Section } from '../../types/navigation';

type ModuleSearchProps = {
  showSearch: boolean;
  search: string;
  matches: Section[];
  onSearchChange: (event: ChangeEvent<HTMLInputElement>) => void;
  navigate: (name: string) => void;
};

export default function ModuleSearch({ showSearch, search, matches, onSearchChange, navigate }: ModuleSearchProps) {
  if (!showSearch) return null;

  return (
    <div className="search-popover"><label htmlFor="module-search">Buscar módulo</label><input id="module-search" autoFocus value={search} onChange={onSearchChange} placeholder="Ej. Evidencias, Dashboard..."/>{matches.map(s=><button key={s.name} onClick={()=>navigate(s.name)}><s.icon size={16}/>{s.name}<ArrowRight size={14}/></button>)}{matches.length===0&&<p>No se encontraron módulos.</p>}</div>
  );
}
