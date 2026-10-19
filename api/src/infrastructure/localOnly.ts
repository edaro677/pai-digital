/** Defensa de arranque local; no es un proveedor de identidad ni autorización. */
export function assertLocalEnvironment(env: NodeJS.ProcessEnv = process.env): void {
  const azureMarkers = [
    'WEBSITE_INSTANCE_ID', 'WEBSITE_SITE_NAME',
    'IDENTITY_ENDPOINT', 'MSI_ENDPOINT', 'CONTAINER_APP_NAME',
  ];

  const detected = azureMarkers.filter((key) => Boolean(env[key]));
  // Core Tools también establece WEBSITE_HOSTNAME durante la ejecución local.
  if (env.WEBSITE_HOSTNAME && !/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(env.WEBSITE_HOSTNAME)) {
    detected.push('WEBSITE_HOSTNAME');
  }
  if (detected.length > 0) {
    throw new Error(`L1 solo admite ejecución local; indicadores de alojamiento: ${detected.join(', ')}.`);
  }

  if (env.PAI_POC_LOCAL_ONLY !== '1' || env.AZURE_FUNCTIONS_ENVIRONMENT !== 'Development') {
    throw new Error('Usa npm start desde api/ para habilitar únicamente el diagnóstico local.');
  }

  const storageKeys = Object.keys(env).filter((key) => key.toLowerCase().includes('azurewebjobsstorage'));
  if (env.AzureWebJobsStorage !== 'UseDevelopmentStorage=true'
      || storageKeys.length !== 1 || storageKeys[0] !== 'AzureWebJobsStorage') {
    throw new Error('El host local solo admite la configuración explícita de Azurite, sin conexiones heredadas.');
  }
}
