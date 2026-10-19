import { fileURLToPath } from 'node:url';

export const storageDirectory = fileURLToPath(new URL('../.azurite/', import.meta.url));

export const storageArguments = Object.freeze([
  '--location', storageDirectory,
  '--blobHost', '127.0.0.1', '--blobPort', '10000',
  '--queueHost', '127.0.0.1', '--queuePort', '10001',
  '--tableHost', '127.0.0.1', '--tablePort', '10002',
  '--disableTelemetry',
]);

export function localProcessEnvironment(inherited = process.env) {
  // No copiar configuraciones de cuentas, endpoints o metadatos de almacenamiento.
  // La comparación es insensible a mayúsculas, como el entorno de Windows.
  return Object.fromEntries(Object.entries(inherited).filter(([key]) => {
    const name = key.toLowerCase();
    return !name.includes('azurewebjobsstorage')
      && !name.includes('azurewebjobsdashboard')
      && !name.includes('azurewebjobssecretstorage')
      && !name.startsWith('azure_storage_')
      && !name.startsWith('azurite_');
  }));
}

export function localHostEnvironment(inherited = process.env) {
  return {
    ...localProcessEnvironment(inherited),
    AzureWebJobsStorage: 'UseDevelopmentStorage=true',
    FUNCTIONS_WORKER_RUNTIME: 'node',
    AZURE_FUNCTIONS_ENVIRONMENT: 'Development',
    PAI_POC_LOCAL_ONLY: '1',
    FUNCTIONS_CORE_TOOLS_TELEMETRY_OPTOUT: '1',
  };
}
