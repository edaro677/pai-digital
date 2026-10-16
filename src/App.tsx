import { useRef, useState } from 'react';
import { useMsal } from '@azure/msal-react';
import { InteractionStatus } from '@azure/msal-browser';
import { loginRequest } from './auth/msalConfig';
import LoginPage from './components/LoginPage';
import AuthLoading from './components/AuthLoading';
import PageIntro from './components/shared/PageIntro';
import PageFooter from './components/layout/PageFooter';
import ModuleContent from './app/ModuleContent';
import { PanelLeftClose, PanelLeftOpen, Search, ArrowRight, ShieldCheck, Layers3, Menu, X, ChevronRight } from 'lucide-react';
import { sections } from './app/navigation';

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
      <PageIntro active={active} current={current} />
      <ModuleContent active={active} current={current} sections={sections} navigate={navigate} />
      <PageFooter />
    </main></div>
  </div>;
}
export default App;
