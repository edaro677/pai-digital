import type { ReactNode } from 'react';

type AppLayoutProps = {
  collapsed: boolean;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  sidebar: ReactNode;
  topbar: ReactNode;
  search: ReactNode;
  children: ReactNode;
};

export default function AppLayout({ collapsed, mobileOpen, onCloseMobile, sidebar, topbar, search, children }: AppLayoutProps) {
  return <div className={`app-shell ${collapsed?'is-collapsed':''}`}>
    {sidebar}
    {mobileOpen&&<button className="mobile-backdrop" aria-label="Cerrar navegación" onClick={onCloseMobile}/>}
    <div className="main-area">
      {topbar}
      {search}
      <main className="content">{children}</main>
    </div>
  </div>;
}
