import { CalendarDays } from 'lucide-react';
import type { Section } from '../../types/navigation';

type PageIntroProps = {
  active: string;
  current: Section;
};

export default function PageIntro({ active, current }: PageIntroProps) {
  return (
    <div className="page-intro"><div><div className="eyebrow"><span className="eyebrow-line"/>{current.eyebrow}</div><h1>{active==='Inicio'?'Plan de Acción Institucional':active}</h1><p>{current.description}</p></div><div className="intro-meta"><CalendarDays size={16}/><span>Vigencia 2026</span></div></div>
  );
}
