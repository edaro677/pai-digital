import { useRef, useState } from 'react';
import { useMsal } from '@azure/msal-react';
import { InteractionStatus } from '@azure/msal-browser';
import { loginRequest } from './auth/msalConfig';
import LoginPage from './components/LoginPage';
import AuthLoading from './components/AuthLoading';
import PageIntro from './components/shared/PageIntro';
import PageFooter from './components/layout/PageFooter';
import ModuleContent from './app/ModuleContent';
import Sidebar from './components/layout/Sidebar';
import Topbar from './components/layout/Topbar';
import ModuleSearch from './components/layout/ModuleSearch';
import AppLayout from './components/layout/AppLayout';
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
  return (
    <AppLayout
      collapsed={collapsed}
      mobileOpen={mobileOpen}
      onCloseMobile={()=>setMobileOpen(false)}
      sidebar={
        <Sidebar
          active={active}
          collapsed={collapsed}
          mobileOpen={mobileOpen}
          sections={sections}
          onToggleCollapsed={()=>setCollapsed(!collapsed)}
          onCloseMobile={()=>setMobileOpen(false)}
          navigate={navigate}
        />
      }
      topbar={
        <Topbar
          active={active}
          onOpenMobile={()=>setMobileOpen(true)}
          onToggleSearch={()=>setShowSearch(!showSearch)}
          authControls={isAuthenticated && account ? (
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
        />
      }
      search={
        <ModuleSearch
          showSearch={showSearch}
          search={search}
          matches={matches}
          onSearchChange={e=>setSearch(e.target.value)}
          navigate={navigate}
        />
      }
    >
      {authError && <p className="auth-error" role="alert">{authError}</p>}
      <PageIntro active={active} current={current} />
      <ModuleContent active={active} current={current} sections={sections} navigate={navigate} />
      <PageFooter />
    </AppLayout>
  );
}
export default App;
