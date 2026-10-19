# API PAI — F2 / L1 local, contratos L2 y memoria L3

Proyecto independiente del frontend. Único contrato: `GET /api/poc/health`, JSON estático,
sin datos institucionales, identidad simulada, permisos de negocio ni integraciones.
L2 define entidades, errores y puertos: [L2_Modelo_Contratos.md](./L2_Modelo_Contratos.md).
L3 implementa memoria volátil solo para uso técnico y pruebas, sin conectarla a HTTP:
[L3_Persistencia_Memoria.md](./L3_Persistencia_Memoria.md). No se implementan L4 ni etapas posteriores.

## Requisitos y ejecución

- Node.js 24.x, npm y Azure Functions Core Tools v4 instalado previamente.
- Azurite 3.37.0 está fijado como dependencia de desarrollo; requiere Node >=22.
- Desde `api/`: `npm ci`, `npm run build`, `npm test`.
- Terminal 1, desde `api/`: `npm run storage:start`. Esperar los tres mensajes de escucha.
- Terminal 2, desde `api/`: `npm start`. Compila y ejecuta
  `func start --address 127.0.0.1 --port 7071 --functions pocHealth`.
- Antes de enviar HTTP, comprobar los cuatro listeners con PowerShell:

  ```powershell
  Get-NetTCPConnection -State Listen |
    Where-Object { $_.LocalPort -in @(7071,10000,10001,10002) } |
    Select-Object LocalAddress,LocalPort,OwningProcess
  ```

  Deben existir cuatro listeners, todos en `127.0.0.1`, pertenecientes a los procesos
  recién iniciados. Si hay wildcard o una IP no local, detener ambos y no probar HTTP.
- Consultar `Invoke-RestMethod http://127.0.0.1:7071/api/poc/health`: debe devolver
  `status=ok`, `service=pai-api-poc`, `stage=L1`, `mode=local-only`.
- Observar al menos dos intervalos del monitor (en el entorno validado, unos 30 segundos
  por intervalo). El aviso de almacenamiento no debe repetirse. Azurite registra las
  comprobaciones del host y las renovaciones de lease: son operaciones diferentes.
- Parar primero Functions con Ctrl+C en terminal 2; después Azurite con Ctrl+C en terminal 1.
  Repetir la consulta de listeners: ninguno de esos procesos debe seguir escuchando.
- Solo HTTP local; `anonymous` no ofrece autenticación ni habilita usos institucionales.

## Almacenamiento del host local

Azurite escucha exclusivamente en `127.0.0.1:10000` (Blob), `:10001` (Queue) y `:10002`
(Table). Sus datos quedan en `api/.azurite/`, excluidos de Git. Se deshabilita la telemetría
del emulador. No se utiliza `--disableProductStyleUrl` ni se aceptan argumentos externos.

`npm start` establece `AzureWebJobsStorage=UseDevelopmentStorage=true` únicamente en el
proceso hijo de Functions. El lanzador elimina las variantes heredadas de esa conexión,
incluidas claves jerárquicas y `ConnectionStrings`, además de configuraciones alternativas
de secretos/almacenamiento. Azurite también recibe un entorno sin `AZURITE_ACCOUNTS` ni
`AZURITE_DB` heredados. No se modifican variables de usuario o máquina.

No hace falta `local.settings.json` ni una cuenta Azure. No descargar configuración de
Azure ni añadir conexiones reales a este proyecto. El worker rechaza conexiones ausentes,
remotas o mixtas incluso si se intenta iniciar directamente con Core Tools. El acceso al
emulador utiliza su configuración pública de desarrollo, sin credenciales institucionales.

El almacenamiento es para servicios internos del host. No se implementó persistencia de
negocio ni se alteró el único endpoint HTTP. Sin Azurite en ejecución no debe darse por
saludable el host, aunque la respuesta HTTP pueda seguir funcionando.

### Evidencia de validación local — 19/10/2026

Con Node 24.22.0, Core Tools 4.16.0 y Azurite 3.37.0 se verificaron cuatro listeners
exclusivos en 127.0.0.1 y respuesta HTTP 200 con el JSON estático esperado.
El registro del emulador mostró comprobaciones `GET /devstoreaccount1/?comp=list&maxresults=1`
con HTTP 200 a las 09:42:48, 09:43:18 y 09:43:48 (America/Bogota): dos intervalos de
30 segundos. No apareció `Unhealthy` ni el error de creación del cliente de almacenamiento
en el registro del host durante la observación. Esto acredita la desaparición del aviso
en esa ventana; no se interpreta la ausencia del aviso como una prueba de salud en Azure.
La creación inicial del contenedor produce 404 esperados antes de su alta y posteriores 201/200.
Los logs de esta prueba están en `.azurite/`, ignorados por Git. No contienen conexiones reales.

## Capas

- `src/functions`: registro del único trigger HTTP.
- `src/http`: respuesta del endpoint independiente del registro.
- `src/infrastructure`: defensa de arranque local; no autentica usuarios.
- `src/infrastructure/memory`: siete repositorios y UnitOfWork volátil; sin I/O ni autorización.
- `src/domain`: entidades técnicas sintéticas, tipos nominales, errores y validadores de representación.
- `src/application/ports`: contratos de repositorio, unidad transaccional y reloj; sin servicios.
- `scripts`: compilación local, límites de alcance y arranque con dirección fija.
- `tests`: contrato técnico, rechazo de alojamiento y pruebas negativas de límites.

## Separación y prevención de publicación

El paquete, lockfile y TypeScript son propios. No se alteran scripts, dependencias,
configuración ni MSAL del frontend. `.local-build/` contiene únicamente compilados de
ejecución local, ignorados por Git; no se genera ZIP ni paquete de despliegue.

`check:boundaries` admite las tres fuentes L1, seis fuentes de dominio/puertos L2 y cuatro
fuentes del adaptador L3. Los fixtures solo existen bajo tests, fuera del build.
Rechaza fuentes adicionales, imports fuera del alcance y carga dinámica; el núcleo no
puede importar HTTP, infraestructura ni Azure Functions. Incorporar fixtures o una identidad local
requiere revisar explícitamente estos límites y diseñar salidas separadas. El compilador
tiene `rootDir: src`, y el build limpia su salida para no conservar fuentes obsoletas.

`.funcignore` excluye TODO de publicación; `private: true` evita publicación npm.
No hay scripts de despliegue. Estas defensas no impiden que alguien eluda deliberadamente
las herramientas o cambie la configuración: no constituyen autorización de producción.

El registro falla si no se habilita el modo local de desarrollo o si detecta indicadores
de alojamiento Azure. No existe proveedor real ni fallback de autenticación ficticia.
La comprobación de entorno es una defensa adicional, no un mecanismo de identidad.
Los indicadores de Azure se conservan al sanear el entorno: el lanzador y el worker
rechazan alojamiento, aunque la conexión del emulador esté correctamente configurada.

## Pruebas y límites

Las pruebas usan `node:test`; `npm test` recompila primero para evitar código obsoleto. Cubren respuesta JSON,
no reflexión de entrada y fallos de las defensas locales/de publicación. No validan Entra,
SQL, Graph, SharePoint ni autorización por ficha. Todo ello queda fuera de L1.

Las pruebas de almacenamiento comprueban eliminación de configuración heredada sin
mutar el entorno padre, conexión exclusiva al emulador, rechazo de configuraciones mixtas
y de alojamiento Azure, direcciones/puertos fijos y directorio local acotado.

El build incluye `npm run check:contracts`: compila los contratos y sus pruebas de tipos
con `tsc --noEmit`, sin tipos Node ni DOM. Las pruebas negativas usan `@ts-expect-error`
para detectar cruces de IDs, omisión de versión, mutaciones y operaciones no declaradas.
Las pruebas de comportamiento L2 cubren representaciones exactas y errores diferenciados;
no pretenden demostrar transacciones, permisos ni persistencia todavía inexistentes.

La instalación de Azurite 3.37.0 informó cuatro entradas moderadas en `npm audit`, ligadas
a dependencias transitivas (`uuid`, `@azure/ms-rest-js`, `sequelize`) y al paquete que las
incluye. No se aplicó `audit fix --force`: la corrección sugerida implicaba cambiar a
Azurite 2.7.1. Hay también avisos de deprecación transitivos. Es una herramienta local de
desarrollo: revisar actualizaciones compatibles antes de ampliar su uso; no empaquetarla
como dependencia de ejecución ni considerar este resultado una aprobación de producción.

El host Functions incluye rutas administrativas propias; no son funciones de negocio.
L1 registra únicamente `pocHealth`. No exponer este host a LAN, Internet ni túneles.
