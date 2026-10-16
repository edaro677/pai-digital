type AuthLoadingProps = {
  error?: boolean;
};

export default function AuthLoading({ error = false }: AuthLoadingProps) {
  return (
    <main className="login-page" aria-labelledby="auth-title">
      <div className="login-card login-status">
        <div className="login-brand-symbol" aria-hidden="true">MC</div>
        <h1 id="auth-title">PAI Digital</h1>
        {error ? (
          <>
            <p className="auth-error" role="alert">
              No fue posible preparar el acceso institucional. Recarga la página para
              intentarlo de nuevo. Si el problema continúa, contacta al soporte institucional.
            </p>
            <button type="button" className="login-primary-button" onClick={() => window.location.reload()}>
              Volver a intentar
            </button>
          </>
        ) : (
          <div role="status" aria-live="polite">
            <span className="login-spinner" aria-hidden="true" />
            <p>Preparando tu acceso institucional…</p>
            <p className="login-description">Espera mientras se procesa la autenticación.</p>
          </div>
        )}
      </div>
    </main>
  );
}
