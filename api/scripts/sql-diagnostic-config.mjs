// Perfil fijo de diagnostico. No lee cadenas de conexion, DSN ni credenciales del entorno.
export function assertSqlDiagnosticEnvironment(env = process.env, runtime = process) {
  if (runtime.platform !== 'win32' || runtime.arch !== 'x64' || !runtime.versions.node.startsWith('24.')) {
    throw new Error('El diagnostico requiere Windows x64 y Node.js 24.');
  }
  const azureMarkers = ['WEBSITE_INSTANCE_ID', 'WEBSITE_SITE_NAME', 'WEBSITE_HOSTNAME',
    'IDENTITY_ENDPOINT', 'MSI_ENDPOINT', 'CONTAINER_APP_NAME'];
  if (azureMarkers.some(key => Boolean(env[key]))) {
    throw new Error('El diagnostico SQL no admite alojamiento Azure.');
  }
}

export function sqlDiagnosticConfig() {
  return {
    server: 'lpc:.\\PAIPOC',
    database: 'pai_poc_dev',
    driver: 'ODBC Driver 17 for SQL Server',
    connectionString: 'Driver={ODBC Driver 17 for SQL Server};Server=lpc:.\\PAIPOC;Database=pai_poc_dev;Trusted_Connection=Yes;Encrypt=Yes;TrustServerCertificate=Yes;APP=PAI-L8B-Diagnostic;',
    connectionTimeout: 10000,
    requestTimeout: 10000,
    options: { trustedConnection: true, encrypt: true, trustServerCertificate: true, useUTC: true },
    pool: { max: 1, min: 0, idleTimeoutMillis: 1000, acquireTimeoutMillis: 10000 },
  };
}
