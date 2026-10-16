
import React from 'react';
import { createRoot } from 'react-dom/client';
import { PublicClientApplication } from '@azure/msal-browser';
import type { AuthenticationResult } from '@azure/msal-browser';
import { MsalProvider } from '@azure/msal-react';

import App from './App';
import AuthLoading from './components/AuthLoading';
import { msalConfig } from './auth/msalConfig';
import './styles.css';

const root = createRoot(document.getElementById('root')!);

root.render(<AuthLoading />);

async function initializeApp() {
  const msalInstance = new PublicClientApplication(msalConfig);
  await msalInstance.initialize();

  let initialAuthError: string | null = null;
  let redirectResult: AuthenticationResult | null = null;
  try {
    redirectResult = await msalInstance.handleRedirectPromise();
  } catch {
    initialAuthError = 'No fue posible completar el inicio de sesión con Microsoft 365. Inténtalo de nuevo. Si el problema continúa, contacta al soporte institucional.';
  }

  if (redirectResult?.account) {
    msalInstance.setActiveAccount(redirectResult.account);
  } else {
    const accounts = msalInstance.getAllAccounts();

    if (accounts.length === 1) {
      msalInstance.setActiveAccount(accounts[0]);
    }
  }

  root.render(
    <React.StrictMode>
      <MsalProvider instance={msalInstance}>
        <App initialAuthError={initialAuthError} />
      </MsalProvider>
    </React.StrictMode>
  );
}

initializeApp().catch(() => {
  root.render(<AuthLoading error />);
});

