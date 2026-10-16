import { ShieldCheck, LockKeyhole, LogIn } from 'lucide-react';

type LoginPageProps = {
  onLogin: () => void;
  isAuthenticating: boolean;
  error?: string | null;
};

export default function LoginPage({
  onLogin,
  isAuthenticating,
  error,
}: LoginPageProps) {
  return (
    <main className="login-page" aria-labelledby="login-title">
      <div className="login-card">
        <div className="login-brand">
          <div className="login-brand-symbol">MC</div>
          <div>
            <strong>María Cano</strong>
            <span>Fundación Universitaria</span>
          </div>
        </div>

        <div className="login-icon">
          <LockKeyhole size={28} aria-hidden="true" />
        </div>

        <span className="login-eyebrow">
          PLATAFORMA INSTITUCIONAL
        </span>

        <h1 id="login-title">Bienvenido a PAI Digital</h1>

        <p className="login-description">
          Plataforma de gestión y seguimiento del
          Plan de Acción Institucional.
        </p>

        {error && <p id="login-error" className="auth-error" role="alert">{error}</p>}

        <button
          type="button"
          className="login-primary-button"
          onClick={onLogin}
          disabled={isAuthenticating}
          aria-describedby={error ? 'login-error' : undefined}
        >
          <LogIn size={19} aria-hidden="true" />
          {isAuthenticating
            ? 'Procesando autenticación...'
            : 'Iniciar sesión con Microsoft 365'}
        </button>

        <div className="login-security">
          <ShieldCheck size={18} aria-hidden="true" />
          <span>
            Acceso mediante cuenta institucional
            de Microsoft Entra ID.
          </span>
        </div>
      </div>

      <div className="login-footer">
        © 2026 Fundación Universitaria María Cano
      </div>
    </main>
  );
}
