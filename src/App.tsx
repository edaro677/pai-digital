import { useRef, useState } from 'react';
import { useMsal } from '@azure/msal-react';
import { InteractionStatus } from '@azure/msal-browser';
import { loginRequest } from './auth/msalConfig';
import LoginPage from './components/LoginPage';
import AuthLoading from './components/AuthLoading';
import { LayoutDashboard, ClipboardList, FileCheck2, FolderOpen, ChartNoAxesCombined, Settings2, PanelLeftClose, PanelLeftOpen, Search, ArrowUpRight, ArrowRight, CalendarDays, ShieldCheck, Clock3, Layers3, CheckCircle2, Menu, X, ChevronRight, FileSpreadsheet, Sparkles, Info, Building2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

type Section = {name:string; icon:LucideIcon; description:string; eyebrow:string};
const sections: Section[] = [
  {name:'Inicio',icon:LayoutDashboard,eyebrow:'Vista general',description:'Una visión clara del Plan de Acción Institucional y de los procesos disponibles.'},
  {name:'Gestionar PAI',icon:Settings2,eyebrow:'Planeación estratégica',description:'Estructura institucional de líneas estratégicas, metas, actividades e indicadores.'},
  {name:'Reporte trimestral',icon:ClipboardList,eyebrow:'Seguimiento periódico',description:'Registro de avances, logros, dificultades y resultados por trimestre.'},
  {name:'Validación de avances',icon:FileCheck2,eyebrow:'Control y seguimiento',description:'Revisión de los reportes trimestrales y gestión de observaciones.'},
  {name:'Evidencias',icon:FolderOpen,eyebrow:'Gestión documental',description:'Consulta y organización de los soportes asociados al cumplimiento del PAI.'},
  {name:'Dashboard',icon:ChartNoAxesCombined,eyebrow:'Analítica institucional',description:'Indicadores, comparativos y seguimiento por dependencia y periodo.'},
];
const steps = [
  {name:'Estructura del proyecto',state:'Completado',icon:CheckCircle2},
  {name:'Análisis del PAI 2026',state:'Realizado inicialmente',icon:CheckCircle2},
  {name:'Validación con Planeación',state:'En espera',icon:Clock3},
  {name:'Integración institucional',state:'Por iniciar',icon:Layers3},
];
function App({ initialAuthError = null }: { initialAuthError?: string | null }){
  const { instance, accounts, inProgress } = useMsal();
  const [authError, setAuthError] = useState<string | null>(initialAuthError);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const redirectPending = useRef(false);

  const account = instance.getActiveAccount() ?? accounts[0] ?? null;

  const isAuthenticated = account !== null;

  const isAuthenticating =
    inProgress !== InteractionStatus.None || isRedirecting;

  const handleLogin = async () => {
    if (isAuthenticating || redirectPending.current) return;
    redirectPending.current = true;
    setAuthError(null);
    setIsRedirecting(true);

    try {
      await instance.loginRedirect(loginRequest);
    } catch {
      redirectPending.current = false;
      setIsRedirecting(false);
      setAuthError('No fue posible iniciar sesión con Microsoft 365. Inténtalo de nuevo. Si el problema continúa, contacta al soporte institucional.');
    }
  };

  const handleLogout = async () => {
    if (isAuthenticating || redirectPending.current) return;
    redirectPending.current = true;
    setAuthError(null);
    setIsRedirecting(true);

    try {
      await instance.logoutRedirect({
        account: account ?? undefined,
        postLogoutRedirectUri: window.location.origin + '/',
      });
    } catch {
      redirectPending.current = false;
      setIsRedirecting(false);
      setAuthError('No fue posible completar el cierre de sesión. Inténtalo de nuevo.');
    }
  };

  const [active,setActive]=useState('Inicio');
  const [collapsed,setCollapsed]=useState(false);
  const [mobileOpen,setMobileOpen]=useState(false);
  const [search,setSearch]=useState('');
  const [showSearch,setShowSearch]=useState(false);
  const current=sections.find(s=>s.name===active)!;
  const CurrentIcon=current.icon;
  const navigate=(name:string)=>{setActive(name);setMobileOpen(false);setShowSearch(false);window.scrollTo({top:0,behavior:'smooth'});};
  const matches=sections.filter(s=>s.name.toLowerCase().includes(search.toLowerCase()));
  if (isAuthenticating) {
    return <AuthLoading />;
  }
  if (!isAuthenticated) {
    return <LoginPage onLogin={handleLogin} isAuthenticating={isAuthenticating} error={authError} />;
  }
  return <div className={`app-shell ${collapsed?'is-collapsed':''}`}>
    <aside className={`sidebar ${mobileOpen?'mobile-open':''}`} aria-label="Navegación principal">
      <div className="brand"><div className="brand-symbol">MC</div><div className="brand-copy"><strong>María Cano</strong><span>Portal institucional</span></div><button className="collapse-button" title={collapsed?'Expandir menú':'Contraer menú'} onClick={()=>setCollapsed(!collapsed)}>{collapsed?<PanelLeftOpen size={18}/>:<PanelLeftClose size={18}/>}</button><button className="mobile-close" onClick={()=>setMobileOpen(false)} aria-label="Cerrar menú"><X size={20}/></button></div>
      <div className="product-identity"><span className="product-icon"><Layers3 size={19}/></span><div><strong>PAI Digital</strong><span>Plan de Acción Institucional</span></div></div>
      <div className="nav-label">ESPACIO DE TRABAJO</div>
      <nav className="side-nav">{sections.map(s=><button title={s.name} key={s.name} onClick={()=>navigate(s.name)} className={`nav-item ${active===s.name?'active':''}`}><s.icon size={19} strokeWidth={1.9}/><span>{s.name}</span>{active===s.name&&<span className="active-dot"/>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="sidebar-info"><ShieldCheck size={18}/><div><strong>Entorno de desarrollo</strong><span>Sin conexión a datos reales</span></div></div><div className="sidebar-footer">Fundación Universitaria María Cano</div></div>
    </aside>
    {mobileOpen&&<button className="mobile-backdrop" aria-label="Cerrar navegación" onClick={()=>setMobileOpen(false)}/>}
    <div className="main-area"><header className="topbar"><div className="top-left"><button className="mobile-menu icon-button" onClick={()=>setMobileOpen(true)} aria-label="Abrir menú"><Menu size={21}/></button><span className="top-location">PAI Digital</span><ChevronRight size={15}/><strong>{active}</strong></div><div className="top-actions"><button className="icon-button search-trigger" aria-label="Buscar módulo" title="Buscar módulo" onClick={()=>setShowSearch(!showSearch)}><Search size={20}/></button><span className="top-divider"/><div className="environment-tag"><span/> Desarrollo</div>
{isAuthenticated && account ? (
  <div className="auth-user">
    <div
      className="avatar"
      title={account.username}
    >
      {(account.name || account.username)
        .charAt(0)
        .toUpperCase()}
    </div>

    <button
      type="button"
      className="auth-button"
      onClick={handleLogout}
      disabled={isAuthenticating}
      title={`Cerrar sesión de ${account.username}`}
    >
      Cerrar sesión
    </button>
  </div>
) : (
  <button
    type="button"
    className="auth-button"
    onClick={handleLogin}
    disabled={isAuthenticating}
  >
    {isAuthenticating
      ? 'Procesando...'
      : 'Iniciar sesión'}
  </button>
)}
    </div></header>
    {showSearch&&<div className="search-popover"><label htmlFor="module-search">Buscar módulo</label><input id="module-search" autoFocus value={search} onChange={e=>setSearch(e.target.value)} placeholder="Ej. Evidencias, Dashboard..."/>{matches.map(s=><button key={s.name} onClick={()=>navigate(s.name)}><s.icon size={16}/>{s.name}<ArrowRight size={14}/></button>)}{matches.length===0&&<p>No se encontraron módulos.</p>}</div>}
    <main className="content">
      {authError && <p className="auth-error" role="alert">{authError}</p>}
      <div className="page-intro"><div><div className="eyebrow"><span className="eyebrow-line"/>{current.eyebrow}</div><h1>{active==='Inicio'?'Plan de Acción Institucional':active}</h1><p>{current.description}</p></div><div className="intro-meta"><CalendarDays size={16}/><span>Vigencia 2026</span></div></div>
      {active==='Inicio'?<>
        <section className="hero"><div className="hero-content"><span className="hero-kicker"><Sparkles size={15}/> TRANSFORMACIÓN DIGITAL</span><h2>Una nueva forma de planear, hacer seguimiento y avanzar.</h2><p>Estamos construyendo un espacio centralizado para gestionar el Plan de Acción Institucional, con información organizada y procesos más claros.</p><button className="hero-cta" onClick={()=>navigate('Gestionar PAI')}>Explorar módulos <ArrowUpRight size={17}/></button></div><div className="hero-art" aria-hidden="true"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="orbit orbit-three"/><div className="hero-art-card"><Layers3 size={32}/><span>PAI</span><small>2026</small></div></div></section>
        <div className="section-head"><div><span className="overline">EXPLORA EL PORTAL</span><h2>Módulos de trabajo</h2><p>Accede a las funciones previstas para cada etapa del proceso.</p></div></div>
        <div className="module-grid">{sections.filter(s=>s.name!=='Inicio').map((s,i)=><button className="module-card" key={s.name} onClick={()=>navigate(s.name)}><span className={`module-icon shade-${i}`}><s.icon size={22}/></span><span className="module-arrow"><ArrowUpRight size={19}/></span><strong>{s.name}</strong><span className="module-desc">{s.description}</span><span className="module-link">Explorar módulo <ArrowRight size={15}/></span></button>)}</div>
        <div className="lower-grid"><section className="surface project-status"><div className="surface-heading"><div><span className="overline">HOJA DE RUTA</span><h2>Estado del proyecto</h2></div><span className="small-pill">Fase inicial</span></div><div className="step-list">{steps.map((s,i)=><div className="step" key={s.name}><span className={`step-icon ${i<2?'done':''}`}><s.icon size={17}/></span><div><strong>{s.name}</strong><span>{s.state}</span></div></div>)}</div></section><section className="surface info-surface"><span className="info-icon"><Info size={22}/></span><span className="overline">IMPORTANTE</span><h2>Construcción por etapas</h2><p>Esta versión presenta la estructura visual y la navegación. La autenticación institucional, el almacenamiento de información, los permisos y los flujos de aprobación aún no están implementados.</p><div className="info-divider"/><div className="info-note"><Clock3 size={17}/><span>En espera de la validación de requisitos por parte de Planeación.</span></div></section></div>
      </>:<>
        <section className="module-hero"><div className="module-hero-icon"><CurrentIcon size={27}/></div><div><span className="overline">MÓDULO DEL PORTAL</span><h2>{active}</h2><p>{current.description}</p></div><span className="module-state">Diseño inicial</span></section>
        <div className="module-content-grid"><section className="surface main-module"><div className="surface-heading"><div><span className="overline">VISTA GENERAL</span><h2>Espacio de trabajo</h2></div><span className="small-pill">Próximamente</span></div><div className="placeholder-illustration"><div className="placeholder-icon"><CurrentIcon size={36}/></div><h3>Preparando el módulo de {active.toLowerCase()}</h3><p>La navegación y el diseño están disponibles. Las funciones operativas se incorporarán después de validar los requisitos del proceso y las reglas de negocio.</p><div className="placeholder-features"><span><CheckCircle2 size={16}/> Estructura visual</span><span><Clock3 size={16}/> Funcionalidad pendiente</span></div></div></section><aside className="surface context-panel"><span className="overline">CONTEXTO DEL MÓDULO</span><h2>¿Qué permitirá hacer?</h2><p>{current.description}</p><div className="context-row"><FileSpreadsheet size={18}/><span>Basado en el proceso actual del PAI 2026.</span></div><div className="context-row"><Building2 size={18}/><span>Requisitos sujetos a revisión por Planeación.</span></div><div className="context-row"><ShieldCheck size={18}/><span>Acceso y permisos por definir e implementar.</span></div><button className="back-link" onClick={()=>navigate('Inicio')}>Volver al inicio <ArrowRight size={16}/></button></aside></div>
        <div className="section-head related"><div><span className="overline">CONTINÚA EXPLORANDO</span><h2>Otros módulos</h2></div></div><div className="related-grid">{sections.filter(s=>s.name!==active).slice(0,3).map(s=><button key={s.name} onClick={()=>navigate(s.name)}><s.icon size={19}/><span>{s.name}</span><ArrowUpRight size={16}/></button>)}</div>
      </>}
      <footer className="page-footer"><span>© 2026 Fundación Universitaria María Cano</span><span>PAI Digital · Prototipo de interfaz</span></footer>
    </main></div>
  </div>;
}
export default App;
