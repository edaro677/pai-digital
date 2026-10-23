# L8-E2 — Preparación del host HTTP con SQL local

Estado a 23/10/2026: L8-E3 cerrada en autenticación/lecturas HTTP→SQL demostradas. L8-E4: integridad actual no confirmada por fallo de conexión; ensayo duradero diseñado pero bloqueado por autorización positiva, datos padre y limpieza no aprobados. Ninguna escritura ejecutada.

## Barrera de entorno

Antes, localOnly en infrastructure/sql/odbc.ts rechazaba cualquier WEBSITE_HOSTNAME. Core Tools puede establecerlo también al ejecutar localmente. La barrera HTTP local ya admite nombres loopback, pero el transporte SQL no los admitía.

Ahora assertLocalSqlEnvironment conserva Windows x64/Node 24 y rechazo de NODE_ENV=production y de todos los marcadores de alojamiento anteriores: WEBSITE_INSTANCE_ID, WEBSITE_SITE_NAME, IDENTITY_ENDPOINT, MSI_ENDPOINT, CONTAINER_APP_NAME y FUNCTIONS_WORKER_RUNTIME_VERSION. Estos marcadores prevalecen incluso con señales locales completas.

Si hay contexto Functions o señales de arranque local, se exigen conjuntamente:

- WEBSITE_HOSTNAME exactamente localhost, 127.0.0.1 o [::1], con puerto opcional válido 1–65535.
- PAI_POC_LOCAL_ONLY=1.
- AZURE_FUNCTIONS_ENVIRONMENT=Development.
- FUNCTIONS_WORKER_RUNTIME=node.
- PAI_API_PERSISTENCE=sql-local.
- AzureWebJobsStorage=UseDevelopmentStorage=true, sin claves de almacenamiento duplicadas o alternativas.

No basta NODE_ENV ni el hostname. Una señal ausente/inconsistente bloquea con SQL_CONNECT_FAILED sanitizado antes de cargar el controlador. Las señales son controles explícitos de configuración del proceso local confiable, no una atestación criptográfica del origen ni sustitutos de autenticación/autorización. El diagnóstico Node standalone sin señales Functions mantiene su contrato previo. No cambian parámetros, tiempos de espera, pooling, repositorios, SqlSession ni SqlUnitOfWork.

## Procedimiento de arranque restringido

scripts/start-http-sql-local.ps1 verifica el token Windows esperado y no administrativo, lectura de archivos compilados/configuración, Node y Core Tools instalados. Comprueba primero lectura de los componentes y ejecuta directamente el func.exe existente para consultar su versión, sin invocar ningún instalador automático. Reutiliza scripts/check-http-sql-identity.mjs --check para una consulta SELECT de identidad SQL, sin publicar cuentas, mensajes originales o credenciales: base pai_poc_dev, Shared Memory, sin sysadmin/db_owner/CONTROL y sin transacciones abiertas. Ese diagnóstico nunca se importa desde HTTP.

No ejecutarlo desde una cuenta administrativa. En una consola interactiva PAIPOC_Test ya abierta:

```powershell
& 'D:/PAI/pai-digital-react/api/scripts/start-http-sql-local.ps1' -CheckOnly
```

Solo tras completar todos los accesos y la comprobación SQL se podrá ejecutar sin -CheckOnly. El procedimiento selecciona sql-local exclusivamente en el proceso, llama al arranque documentado scripts/start-local.mjs (127.0.0.1:7071) y restaura la variable al finalizar. No usa npm start ni recompila bajo la cuenta restringida. No crea archivos de entorno ni guarda contraseñas. Azurite debe iniciarse separadamente con el procedimiento existente, en loopback; no se inició durante esta intervención. Se usará solo GET health, sin endpoints funcionales/escrituras, y se detendrán los procesos de prueba. Ninguna de estas acciones posteriores se ejecutó con el preflight fallido.

## Resultado real del acceso y necesidad de ACL

PAIPOC_Test está habilitada y no aparece como miembro directo de Administrators. El usuario ejecutó -CheckOnly bajo la cuenta restringida; terminó FAILED en CORE_TOOLS_EXECUTE_ACCESS, writes=0. Por el orden del script pasaron la identidad/token Windows, lectura de los archivos del proyecto y ejecución de Node 24. No se alcanzó la consulta de identidad SQL ni el arranque. La comprobación SQL restringida de L8-D sigue siendo antecedente válido, pero no se presenta como revalidación actual de L8-E2.

La inspección administrativa de solo lectura encontró los binarios instalados y ninguna ACE aplicable al SID de PAIPOC_Test, Everyone, Authenticated Users o Users en los componentes inspeccionados de Core Tools. Esto concuerda con la falta de acceso, sin convertir una inspección parcial de ACL en una simulación completa de AccessCheck de Windows. No se registran rutas privadas de destino del enlace NVM.

Propuesta de ACL mínima para revisión y autorización posterior, sobre los destinos reales de estos alias y solo para PAIPOC_Test:

| Componente | Acceso propuesto |
|---|---|
| C:\nvm4w\nodejs\func.cmd | Lectura/ejecución del archivo |
| C:\nvm4w\nodejs\node_modules | Lectura/travesía de este directorio, sin propagación general |
| C:\nvm4w\nodejs\node_modules\azure-functions-core-tools | Lectura/travesía de este directorio |
| Subdirectorio lib | Lectura/travesía del directorio |
| lib/main.js | Lectura/ejecución del archivo del lanzador |
| Subárbol bin | Lectura/ejecución para func.exe y sus DLL, workers y archivos de soporte |

No se propone Modify/FullControl, acceso a todo el perfil NVM o escritura general en el repositorio. No se aplicó ninguna ACL ni permisos SQL. Antes de aplicarlas se deben comprobar los destinos del enlace y limitar la propagación al subárbol necesario. Si después aparecen necesidades de caché/TEMP/perfil del usuario, se documentarán por separado; no se autorizan aquí permisos preventivos de escritura. La ACL Modify del repositorio heredada previamente documentada no se modifica ni se presenta como concesión de esta etapa.

## Validación y límites

- npm run build correcto: TypeScript, contratos y fronteras.
- 191 pruebas dirigidas aprobadas: sql-odbc, composición, fronteras y HTTP sobre dobles/memoria.
- Casos: señales locales válidas; marcadores Azure prevalecen; señales faltantes/inconsistentes; hostname/puertos inválidos; errores sanitizados; memoria por defecto, identidad y autorización sin cambios.
- Sintaxis Node y PowerShell de los procedimientos correcta. Tras el fallo de acceso se añadió una comprobación explícita de lectura de componentes y uso directo del ejecutable ya instalado, para impedir que un bootstrap intente instalación. No se repitió el preflight ni se invocó el host.
- Cero escrituras SQL y cero fixtures; ninguna conexión SQL desde HTTP, ninguna llamada a endpoints funcionales. Sin listeners en 7071/10000/10001/10002 al verificar el cierre.
- El host no arrancó: identidad efectiva de un proceso Functions, comportamiento de WEBSITE_HOSTNAME real y health permanecen sin verificar. No se prueban tokens reales ni la política temporal, que continúa denegando asignaciones.

Dictamen: NO APTO operativo hasta autorizar/aplicar el acceso de archivos mínimo y completar preflight, arranque/health restringidos. No se inicia ninguna prueba HTTP de escritura. Sin staging, commit, push, PR, merge ni despliegue.

## Aplicación de ACL autorizadas y nueva barrera de directorio padre (23/10/2026)

El usuario autorizó lectura/ejecución de Core Tools y travesía de sus padres. Se verificó C:\nvm4w\nodejs como enlace al directorio real de la versión v24.22.0 y se aplicaron las ACL sobre ese destino, no sobre una ruta supuesta. Los componentes func.cmd, lib/main.js y bin/func.exe existen. La cuenta actual, aunque no tiene token administrativo, pudo aplicar las ACL como titular con derechos suficientes; no fue necesario elevar ni solicitar contraseña.

ACL concedidas únicamente al SID de PAIPOC_Test: ReadAndExecute en func.cmd y lib/main.js; Traverse y ReadAttributes, sin propagación, en node_modules, azure-functions-core-tools y lib; ReadAndExecute con herencia solo en el subárbol bin. La comprobación de func.exe confirmó la regla heredada de lectura/ejecución. En los objetos modificados se compararon y conservaron las reglas de los demás principales. No se concedió Modify/FullControl ni escritura; no se modificaron permisos del repositorio o SQL. Se guardó copia de las ACL previas en un directorio temporal privado fuera de Git para trazabilidad/reversión.

La comprobación real en PAIPOC_Test ejecutó func.cmd --version y falló antes de Core Tools: EPERM, errno -4048, syscall lstat, en AppData del perfil que contiene la instalación NVM. Node.js v24.22.0 sí se ejecutó, pero no pudo resolver el destino real del main.js a través de ese padre. No se conserva en este documento el nombre personal del perfil. El preflight condicionado a ExitCode 0 no se ejecutó.

Se detuvo la secuencia conforme a la instrucción expresa del usuario: no se ampliaron automáticamente permisos sobre el perfil o AppData. La necesidad mínima que debe autorizarse/revisarse es ReadAttributes y Traverse del directorio AppData específico del perfil titular de NVM, sin listado de contenido, escritura ni propagación a hijos. Esto no equivale a autorizar acceso general a todo AppData; tampoco demuestra que no exista otra barrera posterior. No se concedió ese permiso en esta intervención.

Resultado: func --version sin versión de Core Tools; preflight SQL, arranque Functions y GET health no alcanzados. No se inició Azurite ni ningún host. No se realizaron conexiones SQL, fixtures, escrituras, cambios de señales de entorno o configuración permanente. No se modificó código de producción ni se repitieron pruebas generales. La identidad SQL restringida conserva su validación histórica de L8-D, sin nueva comprobación en este intento.

Dictamen vigente: NO APTO para pruebas HTTP/SQL funcionales hasta resolver la lectura de metadatos del padre AppData y completar las verificaciones. Se preservan las ACL mínimas ya aplicadas, sin revertirlas ni ampliarlas. Sin staging, commit, push, PR, merge ni despliegue.
## Corrección puntual de AppData validada; nuevo bloqueo en Local (23/10/2026)

Se confirmó que el AppData derivado del destino real C:\nvm4w\nodejs/v24.22.0 coincidía exactamente con el directorio del error anterior. Su propietario coincidía con el titular actual de la instalación; no había una ACE directa para PAIPOC_Test. Se añadió exclusivamente a ese SID una ACE Allow con máscara 160 (ReadAttributes | Traverse), AceFlags=None: sin herencia, ListDirectory/ReadData, escritura, Modify, FullControl, ChangePermissions o TakeOwnership. Se utilizó una ACE con máscara exacta para no incorporar Synchronize automáticamente. La verificación posterior confirmó que propietario y ACE de los demás principales no cambiaron. Se conserva copia privada de la ACL previa fuera de Git.

La revisión automática impidió una lectura auxiliar por falta de créditos; esa lectura no se ejecutó. Al reanudar por instrucción del usuario, se recuperó el resultado satisfactorio de la operación ya iniciada, sin aplicar otra vez la ACE ni eludir la revisión.

El primer bloque de validación pegado por el usuario se aplanó y PowerShell lo rechazó como sintaxis; no ejecutó SQL ni Core Tools. Se preparó solo un diagnóstico temporal ignorado por Git en api/.test-tmp/l8e2-host/check-metadata.mjs. Su ejecución real bajo PAIPOC_Test confirmó LSTAT_APPDATA / OK. El defecto EPERM del AppData original está resuelto y verificado.

La siguiente ejecución de func.cmd --version encontró otro EPERM, errno -4048, syscall lstat, esta vez en AppData\Local del mismo perfil titular de NVM. No se publica el nombre personal del perfil. Es un directorio distinto, no cubierto por la ACE anterior de ámbito no heredable. Conforme a la instrucción del usuario se detuvo la secuencia; no se modificó Local ni otro directorio y no se repitió func. La necesidad mínima pendiente es comprobar/autorizar por separado ReadAttributes y Traverse únicamente en el Local exacto, sin herencia ni listado/escritura; no se presupone acceso a otros padres o descendientes.

Core Tools no devolvió versión. Preflight SQL, identidad SQL efectiva del nuevo host, arranque Functions y health no alcanzados. No hubo conexiones SQL, DML/DDL, fixtures, cambios de permisos SQL, escrituras HTTP o configuración permanente. No se modificó código fuente de PAI Digital. Dictamen: AppData corregido; NO APTO todavía para completar L8-E2 por el acceso pendiente a Local. Sin staging, commit, push, PR, merge ni despliegue.
## Acceso mínimo de Local aplicado por autorización posterior (23/10/2026)

El usuario autorizó resolver el nuevo acceso. Se derivó Local del destino real de NVM v24.22.0 y se confirmó coincidencia exacta con el AppData\Local del EPERM anterior. Se añadió exclusivamente para PAIPOC_Test una ACE Allow de máscara 160 (ReadAttributes | Traverse), AceFlags=None, sin herencia, listado, escritura, Modify, FullControl, ChangePermissions o TakeOwnership. La verificación confirmó propietario y ACE de los demás principales intactos; se conservó una copia privada de la ACL anterior fuera de Git. No se aplicaron permisos en otros directorios.

La modificación terminó satisfactoriamente. Se solicitó una validación de func.cmd --version desde la consola restringida. Hasta recibir ese resultado no se considera probado el arranque de Core Tools ni se ejecutan preflight SQL, host o health. La corrección previa de AppData conserva su lstat real OK. No hubo cambios de código, SQL, configuración permanente o pruebas generales. Sin staging, commit, push, PR, merge ni despliegue.
## Resultado vigente: herramientas independientes y health real aprobados (23/10/2026)

Los bloqueos de acceso descritos arriba se conservan como antecedentes. Tras confirmar el nuevo EPERM en AppData\Local\nvm se aplicó únicamente sobre ese directorio real una ACE Allow para PAIPOC_Test: máscara 160 (ReadAttributes | Traverse), sin herencia. Se verificaron propietario y restantes ACE intactos. El intento posterior con la instalación NVM privada siguió sin superar CORE_TOOLS_EXECUTE_ACCESS; no se concedieron más accesos al perfil privado.

Se preparó una copia independiente de las herramientas ya instaladas en D:\PAI\tools\pai-local-24.22.0-4.16.0: Node.js 24.22.0 y Core Tools 4.16.0. Se compararon por SHA-256 los 9.016 archivos de origen y destino; coincidieron. Las firmas Authenticode de node.exe y func.exe resultaron válidas. PAIPOC_Test tiene únicamente lectura/ejecución heredable en este árbol nuevo; no se concedieron privilegios administrativos ni modificación general sobre el repositorio. No se instalaron dependencias de aplicación ni se descargaron versiones adicionales.

scripts/start-http-sql-local.ps1 admite -ToolsDirectory, selecciona explícitamente node.exe/func.cmd de ese directorio y verifica la versión mediante el lanzador real. Usa el perfil propio de la cuenta restringida obtenido por SID, evitando cachés/TEMP heredados del perfil que inició la consola. PATH, USERPROFILE, APPDATA, LOCALAPPDATA, TEMP, TMP y la selección de persistencia se limitan al proceso y se restauran mediante finally. No se guarda sql-local en archivos de configuración ni se incorporan contraseñas.

Comando validado desde la consola PAIPOC_Test:

```powershell
& 'D:/PAI/pai-digital-react/api/scripts/start-http-sql-local.ps1' -ToolsDirectory 'D:/PAI/tools/pai-local-24.22.0-4.16.0'
```

Resultados reales:

- func --version: 4.16.0; runtime Functions 4.1054.250.26428.
- HOST_PREFLIGHT: OK, identidad Windows esperada, token no administrativo, identidad SQL esperada, sin privilegios administrativos SQL y transporte Shared memory. Consulta SQL exclusivamente SELECT, writes=0.
- Host con selección sql-local solo en el proceso; seis funciones registradas. Se comprobó el propietario efectivo del proceso func.exe como la cuenta restringida esperada, sin publicar nombres personales.
- Listener HTTP observado únicamente en 127.0.0.1:7071. Azurite de prueba escuchó únicamente en loopback, puertos 10000–10002.
- Única solicitud HTTP: GET /api/poc/health. HTTP 200, cuerpo {"status":"ok","service":"pai-api-poc","stage":"L1","mode":"local-only"}.
- El usuario cerró Core Tools con Ctrl+C y confirmó la vuelta a consola. Se verificó la desaparición del listener HTTP y se detuvieron exclusivamente Azurite y su lanzador de prueba.

No se invocaron endpoints funcionales, no hubo fixtures, DML/DDL, cambios de permisos SQL ni modificaciones de repositorios, SqlSession o SqlUnitOfWork en esta corrección. La política temporal de denegación de asignaciones y la autenticación institucional permanecen intactas. Las 191 pruebas dirigidas y compilación anteriores son evidencia histórica; no se repitió una suite general para resolver este acceso.

Límite: health y el preflight SQL separado no prueban consultas SQL desde los endpoints protegidos, JWT reales, autorización positiva ni escrituras HTTP/SQL. La intermitencia histórica de sqlcmd no se declara resuelta.

Dictamen vigente: APTO para preparar una validación HTTP/SQL funcional controlada con autorización posterior. Acceso, preflight, arranque local y health completados; no se ejecutan automáticamente pruebas funcionales, escrituras ni despliegues. Sin staging ni commit.
## Validación funcional HTTP/SQL de lectura: bloqueo confirmado de identidad (23/10/2026)

Se inició de nuevo Core Tools 4.16.0 con las herramientas independientes, bajo PAIPOC_Test, sql-local explícito solo en el proceso y listener 127.0.0.1:7071. Se verificó el propietario restringido de func.exe. El preflight real indicó identidad Windows y SQL esperadas, sin privilegios administrativos efectivos y transporte Shared memory, writes=0. La consola restringida confirmó identityConfigurationPresent=false: PAI_API_IDENTITY_CONFIG no estaba definida. No se introdujo configuración sintética ni se adquirieron o registraron tokens institucionales.

Se enviaron exactamente siete solicitudes GET, sin POST/PATCH ni fixtures:

| Endpoint | Credencial | HTTP | Resultado |
|---|---|---|---|
| /api/poc/health | Ninguna | 200 | Diagnóstico local correcto |
| /api/poc/fichas/poc-http-missing-ficha | Ninguna y Bearer inválido sintético, dos solicitudes | 500 en ambas | INTERNAL_ERROR genérico |
| /api/poc/fichas/poc-http-missing-ficha/actividades | Ninguna y Bearer inválido sintético, dos solicitudes | 500 en ambas | INTERNAL_ERROR genérico |
| /api/poc/reportes/poc-http-missing-report | Ninguna y Bearer inválido sintético, dos solicitudes | 500 en ambas | INTERNAL_ERROR genérico |

Todas conservaron Cache-Control: no-store. Los errores respondieron únicamente el código y mensaje públicos previstos; no se registraron salidas SQL crudas, identidades personales, tokens ni excepciones originales. Que Core Tools registre la invocación como Succeeded significa que el controlador terminó; no convierte estos HTTP 500 en respuestas funcionales satisfactorias.

Recorrido comprobado por inspección: functions/fichas.ts → createLocalQueryHandlers → configuración Entra → createPersistence → fábrica SQL → SqlUnitOfWork → servicios. En esta ejecución, la ausencia de configuración provoca el retorno de unavailableQuery antes de llamar a createPersistence. Por tanto, sql-local fue solicitado en el entorno, pero SqlUnitOfWork no fue construido por esos controladores y ninguna consulta de repositorio SQL fue ejecutada por las solicitudes HTTP. No hubo fallback a memoria.

Con configuración válida, la validación Bearer/JWT precede a runAtomic. En base vacía y con una identidad auténtica válida, la autorización de ficha consultaría primero SqlUserRepository.findByIdentity (SELECT parametrizado sobre pai.InstitutionalUsers por TenantId y DirectoryObjectId) y denegaría el acceso al no existir usuario. Este recorrido es una previsión del código, no evidencia de una consulta HTTP/SQL ejecutada en esta prueba. La política isApplicable: () => false permanece intacta. No se probaron autorización positiva, JWT institucional válido ni respuestas 404 autenticadas de base vacía.

Pruebas dirigidas existentes: 17/17 de composition-persistence.test.mjs aprobadas, sin SQL ni red; verifican selector, ausencia de fallback, fábrica diferida y autenticación previa a persistencia. Los casos con dobles quedan expresamente separados de la evidencia HTTP real. No se modificó código de producción ni se repitió la suite general.

El observador independiente reutilizó runSqlcmd del ejecutor auditado y su consulta de integridad aprobada, solo de lectura. Inicial: SUCCESS, ExitCode 0, 818,24 ms. Final: SUCCESS, ExitCode 0, 462,93 ms. Ambos validaron pai_poc_dev ONLINE, las ocho tablas funcionales presentes y vacías, migración 0001_initial con hashes originales y huella de catálogo esperada. Las consultas SQL reales de esta intervención fueron las del preflight y del observador; ninguna se atribuye a los endpoints funcionales.

El usuario cerró el host con Ctrl+C. Se retiraron Azurite y su lanzador de prueba. Las evidencias sanitizadas y el arnés temporal GET permanecen únicamente en api/.test-tmp/l8e2-functional, ignorado por Git. No se alteraron permisos SQL, esquema, migraciones, repositorios, UnitOfWork, autenticación o autorización.

Dictamen: NO APTO para pasar a pruebas de escritura duradera. El arranque y health siguen validados; la ejecución de repositorios SQL desde HTTP permanece bloqueada por la configuración Entra ausente y la falta de un access token válido para la API. El siguiente paso requiere disponer de la configuración institucional aprobada y un mecanismo seguro de obtención/uso del token, sin copiarlo a documentación o evidencias. No se recomienda resolverlo desactivando autenticación ni cambiando la política temporal. Sin staging, commit, push, PR, merge ni despliegue.
## L8-E3 — Preparación Entra: valores administrativos pendientes (23/10/2026)

Diagnóstico estático del validador real: api/src/infrastructure/identity/config.ts, validator.ts, normalize.ts y keys.ts. La configuración PAI_API_IDENTITY_CONFIG exige tenantId (GUID no nulo), audience (GUID Application/Client ID del recurso API, no de la SPA ni Graph), requiredScope (un único nombre delegado exacto, sensible a mayúsculas, no openid/profile/email/offline_access), tokenVersion=2.0, clockToleranceSeconds entero 0–60 y allowedClientIds (1–100 GUID de clientes aprobados, comprobados contra azp). No se prescribe una tolerancia institucional nueva: debe suministrarse explícitamente dentro del rango admitido.

Para el tenant aprobado T se derivan exactamente issuer=https://login.microsoftonline.com/T/v2.0, metadataUrl=https://login.microsoftonline.com/T/v2.0/.well-known/openid-configuration y jwksUrl=https://login.microsoftonline.com/T/discovery/v2.0/keys. Se conservan firma RS256 con clave pública RSA de al menos 2048 bits, expiración, nbf, tid/oid, audience, issuer, azp admitido y scp requerido. No se admiten tokens app-only: roles no sustituye scp, ni las capacidades de ficha constituyen automáticamente scopes Entra. La API no requiere client secret para validar tokens.

Disponibilidad local comprobada sin publicar valores: .env.local contiene VITE_ENTRA_TENANT_ID y VITE_ENTRA_CLIENT_ID con forma GUID; src/auth/msalConfig.ts los utiliza para la SPA y solicita únicamente openid/profile. No se reutilizó el Client ID de la SPA como audience API. PAI_API_IDENTITY_CONFIG está ausente. La documentación histórica registra como pendientes el registro propio de API, scope, clientes/consentimiento y adquisición de tokens para la API. Esto no permite afirmar que no exista un registro remoto: su existencia/finalidad/autorización no están verificadas.

Consulta local Azure CLI account show: sesión disponible, tenant distinto del configurado en la SPA. No se mostraron cuentas ni identificadores y no se consultaron aplicaciones de ese tenant. No se inició login, cambió contexto, solicitó token ni realizó cambios Entra. La presencia de herramientas Azure CLI/Graph no prueba acceso autorizado al tenant objetivo.

Se requiere confirmación de un administrador autorizado de:

1. Tenant ID definitivo de PAI y confirmación de que corresponde al entorno de pruebas aprobado.
2. Registro existente y autorizado del recurso API: Application/Client ID, Application ID URI y finalidad. No confundir Application ID con Object ID.
3. Scope delegado habilitado: nombre exacto para requiredScope y URI completo para solicitarlo. No inventar api:// ni reutilizar Graph.
4. Cliente interactivo aprobado: Application/Client ID para allowedClientIds, plataforma/redirect URI existente y flujo permitido; consentimiento ya vigente para el scope. No se aceptarán consentimientos nuevos durante esta fase.
5. Configuración del recurso que emita access tokens v2: api.requestedAccessTokenVersion=2. Usar login v2 por sí solo no garantiza el formato del access token.
6. Usuario institucional autorizado para la prueba y tolerancia de reloj acordada; no se necesitan su contraseña, ID token, access token o secretos en el chat.

Procedimiento local preparado, pendiente de esos valores: desde PAIPOC_Test, introducir únicamente los valores públicos aprobados mediante Read-Host o un objeto PowerShell en memoria; construir el JSON de IdentityConfiguration con las URLs derivadas del tenant; conservar el valor previo de PAI_API_IDENTITY_CONFIG, asignar el JSON con [Environment]::SetEnvironmentVariable(...,'Process') y ejecutar start-http-sql-local.ps1 -ToolsDirectory D:/PAI/tools/pai-local-24.22.0-4.16.0 dentro de try/finally que restaure el valor previo. sql-local continúa seleccionado y restaurado por ese lanzador. No escribir JSON en .env, local.settings.json, perfiles, scripts persistentes ni configuración de usuario/máquina. No construir configuración desde claims no verificados de un JWT.

Token de prueba: utilizar MSAL y autenticación interactiva Authorization Code + PKCE con el cliente y redirect URI ya aprobados, solicitando el URI completo del scope de la API. Mantener access token y caché del arnés exclusivamente en memoria; enviarlo solo como Authorization: Bearer a la API loopback. No usar ID token, token de Graph o credenciales de aplicación como sustitutos. No copiar tokens a chat, argumentos de proceso, historial PowerShell, archivos o evidencia. Si falta consentimiento o el registro no permite el flujo, detenerse: no aceptar nuevas concesiones ni modificar Entra. La cuenta Windows PAIPOC_Test y el usuario institucional Entra son identidades distintas con propósitos distintos.

Validación prevista, no ejecutada en L8-E3: configuración válida sin Bearer → 401; Bearer inválido → 401; access token institucional válido → ejecutar servicios y autorización existente. Con ocho tablas vacías, se espera denegación 404 uniforme, no 403 ni 200 de datos: para ficha/actividades la autorización consultaría SqlUserRepository.findByIdentity y no encontraría usuario. Esa denegación aún puede demostrar una lectura SQL real, si se correlaciona adecuadamente. La política temporal de asignaciones continúa denegando y no se modifica para obtener resultados positivos. No se atribuye una consulta a SQL solo por un HTTP 404 o por health 200.

Resultado actual: BLOQUEADA POR CONFIGURACION ENTRA NO ACREDITADA. No se arrancó host, adquirió token ni repitieron pruebas HTTP/SQL en esta fase; no hay nuevos resultados 401/403/200 ni evidencia nueva de consultas SQL desde HTTP. Los HTTP 500 de L8-E2 son antecedentes por falta de configuración. No se modificaron autenticación de producción, frontend, repositorios, permisos, registros Entra, esquema o migraciones; no hubo escrituras funcionales ni fixtures. Se detiene antes de pruebas de escritura duradera.

Fuentes primarias consultadas: Microsoft claims-validation (aud v2 es Client ID de API), v2-oauth2-auth-code-flow (MSAL/PKCE y access_token para APIs), Graph apiApplication (requestedAccessTokenVersion y scopes). https://learn.microsoft.com/en-us/entra/identity-platform/claims-validation ; https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow ; https://learn.microsoft.com/en-us/graph/api/resources/apiapplication?view=graph-rest-1.0 .
## L8-E3 — Configuración aprobada y access token real validado; HTTP/SQL bloqueado (23/10/2026)

Autorización institucional proporcionada por el usuario: API PAI-Digital-API-FUMC-DEV; tenant 9c6cb0e9-1c0e-4137-ac54-6ba138984ef2; audience/API Client ID aca30f77-872a-4cc5-a540-0a7547d95f53; Application ID URI api://aca30f77-872a-4cc5-a540-0a7547d95f53; scope delegado access_as_user y scope completo api://aca30f77-872a-4cc5-a540-0a7547d95f53/access_as_user; access tokens v2 y consentimiento administrativo existentes, según confirmación del usuario. No se cambiaron registros, consentimientos o permisos Entra. La aprobación sustituye el bloqueo de valores pendientes anterior, conservado como antecedente.

El Client ID de la SPA se obtuvo de VITE_ENTRA_CLIENT_ID en .env.local; se comprobó que es diferente del recurso API y que el tenant local coincide con el autorizado. No se inventaron identificadores. Se construyó IdentityConfiguration en memoria con tokenVersion=2.0, clockToleranceSeconds=30 y allowedClientIds con el cliente real de la SPA. Issuer y endpoints OIDC/JWKS se derivaron del tenant. PAI_API_IDENTITY_CONFIG, NODE_OPTIONS y sql-local se limitan al proceso y se restauran mediante finally; no se escribieron en configuración permanente.

Se preparó un arnés temporal ignorado por Git en api/.test-tmp/l8e3-entra. Utiliza MSAL Browser 4.30.0 ya instalado, Authorization Code + PKCE y popup con redirect local http://localhost:5173/. El servidor del arnés escucha solo en 127.0.0.1:5173. Tanto cacheLocation como temporaryCacheLocation son memoryStorage; la respuesta de autenticación se descarta y clearCache se intenta en finally. No se escribieron access tokens, ID tokens, códigos OAuth, contraseñas o claims personales en evidencias, repositorio o documentación.

Resultado real confirmado en el arnés: tokenValidation.status=OK, signature=true, issuer=true, audience=true, expiration=true, scope=true y authorizedClient=true. Se utilizó el validador Entra existente, sin dobles de firma/claves ni relajar condiciones: descarga OIDC/JWKS real, RS256, issuer/audience/exp/nbf, tid/oid, scp y azp. Este resultado prueba el access token institucional de la API en el validador real; no se presenta como validación ejecutada por Azure Functions, porque el host no llegó a arrancar.

El primer arranque restringido terminó FAILED en SQL_IDENTITY_READ_ONLY, writes=0, antes de registrar Functions. El observador inicial auditado también falló: EXTERNAL_TIMEOUT, 15.017,47 ms, ExitCode no disponible, respuesta no validada y cierre no confirmado en ese resultado; una revisión posterior de procesos no encontró sqlcmd residual. No se atribuye la causa a Entra ni a pooling.

Se mejoró exclusivamente el diagnóstico local de api/scripts/check-http-sql-identity.mjs y start-http-sql-local.ps1 para proyectar etapa CONNECT/QUERY/IDENTITY_AND_PRIVILEGES, códigos técnicos de lista cerrada y nombres de controles fallidos. La primera edición del diagnóstico omitió declarar stage y quedó un defecto del propio diagnóstico; la repetición devolvió SQL_PREFLIGHT_DETAIL con etapa/código nulos y no prueba una causa SQL adicional. Se corrigió la declaración y se comprobó con cuatro pruebas aisladas que éxito, timeout de conexión, fallo de consulta y privilegio nulo conservan la clasificación y el cierre, sin ejecutar SQL. No se relajaron las comprobaciones: un privilegio nulo sigue fallando. El arranque con esa última corrección no quedó confirmado antes de finalizar esta intervención.

El navegador mostró inicialmente HARNESS_READ_CHECK_FAILED. La evidencia sanitaria confirma que el token ya había sido validado correctamente y que el fallo posterior fue al intentar alcanzar el host HTTP no iniciado: http=[] en el resultado. Se ajustó solo la presentación del arnés para separar tokenValidation de HTTP_HOST_READ_FAILED; no se repitió el login ni se reutilizó un token guardado. No se obtuvieron en esta intervención códigos HTTP 401/404/200 de las Functions; los resultados anteriores de health/HTTP se conservan como antecedentes, no se reutilizan como evidencia L8-E3.

Observación SQL temporal preparada mediante preload del proceso: marca la entrada real en SqlUnitOfWork y la terminación de SELECT conocidos (users.findByIdentity, reports.findById), sin registrar SQL completo, parámetros, tokens, cuentas o filas. No cambió archivos de producción del adaptador, repositorios, sesión o UnitOfWork. Como el host no arrancó, no se capturó ninguna marca de repositorio SQL desde HTTP y no se afirma esa integración. No hubo fallback a memoria; el preflight fallido impidió el arranque. La política temporal isApplicable: () => false permanece intacta y no hay autorización positiva nueva demostrada.

Pruebas dirigidas: cuatro del arnés/configuración/privacidad y cuatro del diagnóstico SQL con dobles, ocho aprobadas; sintaxis Node/PowerShell correcta. No se repitió suite general. La comprobación independiente final de integridad terminó EXIT_NONZERO, ExitCode 1, 5.122,31 ms, sin respuesta validada; cierre del hijo confirmado. Por tanto, el estado actual final de las tablas, historial y catálogo no quedó revalidado en L8-E3. No se ejecutaron escrituras funcionales, fixtures, DDL, migraciones o cambios de permisos. Las últimas ocho tablas vacías y catálogo/historial correctos son evidencia histórica de L8-E2, no se declaran comprobados de nuevo.

Se detuvieron el servidor MSAL y Azurite/lanzador de esta prueba. El token ya había sido descartado del arnés; se indicó al usuario no repetir el último arranque pendiente. Los recursos SQL y Entra no se modificaron. Sin staging, commit, push, PR, merge o despliegue.

Dictamen: autenticación Entra real VALIDADA en el validador existente; HTTP/SQL NO VALIDADO y NO APTO todavía para escrituras duraderas. Bloqueo pendiente: superar el preflight SQL restringido y revalidar integridad, conservando las barreras actuales. La corrección diagnóstica está preparada para obtener un código técnico concreto en el siguiente intento controlado; no hay evidencia suficiente para declarar una causa raíz de conectividad SQL ni para cambiar permisos, pooling o timeouts.
## L8-E3 — Reanudación: autenticación HTTP y ejecución SQL real demostradas (23/10/2026)

Esta reanudación sustituye el bloqueo operativo de arranque descrito en el corte anterior, sin borrar sus fallos ni declarar resuelta la intermitencia. El usuario ejecutó el lanzador corregido bajo PAIPOC_Test. HOST_PREFLIGHT terminó OK: identidad Windows esperada, token no administrativo, identidad SQL esperada, sin privilegios administrativos SQL, Shared memory y writes=0. Core Tools 4.16.0 registró las seis funciones; se comprobó listener únicamente 127.0.0.1:7071 y propietario efectivo PAIPOC_Test. Se restablecieron Azurite y el arnés temporal MSAL en loopback, sin modificar configuraciones permanentes.

Configuración utilizada: tenant 9c6cb0e9-1c0e-4137-ac54-6ba138984ef2; audience/API Client ID aca30f77-872a-4cc5-a540-0a7547d95f53; scope delegado access_as_user; scope solicitado api://aca30f77-872a-4cc5-a540-0a7547d95f53/access_as_user; access token v2; tolerancia explícita 30 segundos. allowedClientIds se obtuvo del Client ID real de la SPA en .env.local. Las URLs de issuer, metadatos y JWKS derivan del tenant. La aprobación del recurso y del consentimiento es la proporcionada por el usuario; no se modificó Entra.

MSAL Browser 4.30.0 utilizó autenticación interactiva Authorization Code + PKCE, caché y caché temporal memoryStorage. El validador Entra existente confirmó nuevamente firma, issuer, audience, expiración, scope y cliente autorizado antes de reenviar el access token al host. Las Functions recibieron el Bearer real sin inyección de identidad ni autorización simulada. El token se descartó después y no se conserva en archivos, logs o documentación.

Diez solicitudes HTTP reales y exclusivamente GET:

| Ruta | Sin Bearer | Bearer inválido | Access token institucional válido |
|---|---|---|---|
| /api/poc/health | 200, una solicitud | No ejecutado | No ejecutado |
| /api/poc/fichas/poc-entra-missing-ficha | 401 UNAUTHENTICATED | 401 UNAUTHENTICATED | 404 NOT_FOUND, 1.130,60 ms |
| /api/poc/fichas/poc-entra-missing-ficha/actividades | 401 UNAUTHENTICATED | 401 UNAUTHENTICATED | 404 NOT_FOUND, 16,52 ms |
| /api/poc/reportes/poc-entra-missing-report | 401 UNAUTHENTICATED | 401 UNAUTHENTICATED | 404 NOT_FOUND, 29,52 ms |

El health tardó 582,99 ms. Los cuerpos de error se mantuvieron sanitizados. No se presentan los 404 como acceso positivo a datos ni se espera 403: la API conserva su contrato de recurso no disponible ante ausencia o falta de autorización. Los 401 previos no alcanzaron los servicios de aplicación; el token válido sí alcanzó el contexto transaccional. Las diez respuestas fueron contrastadas automáticamente con la evidencia guardada.

Evidencia directa aportada por el usuario desde la consola del worker, preservando solo campos técnicos:

- Functions.pocFichaActividades: SQL_UOW_ENTER, adapter=SqlUnitOfWork; SELECT users.findByIdentity, result=ok, rowCount=0, duración SQL 0,95 ms.
- Functions.pocReportRead: SQL_UOW_ENTER, adapter=SqlUnitOfWork; SELECT reports.findById, result=ok, rowCount=0, duración SQL 13,93 ms.

La observación temporal envuelve el método original de SqlUnitOfWork y el query original del controlador real: no sustituye respuestas ni usa un transporte simulado. Los SELECT exactos parametrizados son, respectivamente, lectura de pai.InstitutionalUsers por TenantId/DirectoryObjectId y lectura de pai.Reports por Id. Se documentan dos SELECT observados directamente, no tres: la traza de la primera solicitud de ficha no fue incluida por el usuario, aunque su HTTP 404 sí está registrado. No se atribuyen lecturas a FichaRepository o ActivityRepository que la autorización impidió alcanzar.

Queda demostrado HTTP → composición existente → SqlUnitOfWork → repositorio SQL → consulta real para al menos esas dos solicitudes. Las marcas del adaptador y del controlador nativo excluyen un fallback a memoria en ellas. La política local de vigencia isApplicable: () => false y las comprobaciones de usuario/ficha/asignaciones permanecen intactas. No se concedió acceso positivo por scope o login institucional; los 404 muestran denegación/ausencia prevista.

Limitación independiente de integridad: el ejecutor histórico R10 devolvió RESPONSE_INVALID con ExitCode 0 en 8.748,56 ms; no se flexibilizó su validador ni se declaró SUCCESS. Para comprobar el estado vigente sin modificar referencias, se reutilizaron catalogSql y validateSnapshot del observador L8-D, con la serialización de catálogo R1 y el manifiesto original, exclusivamente SELECT. Esa comprobación final no logró conectar: ConnectionError en CONNECT, sin código/número SQL seguro disponible, cierre de pool confirmado. No se reintentó ni se amplió un timeout. Por ello, las ocho tablas, historial y catálogo actuales NO quedaron revalidados globalmente en esta reanudación. Los SELECT observados sí demuestran cero coincidencias en esas dos consultas, pero no prueban que todas las tablas estén vacías. No se ejecutó ningún DML, fixture o cambio de esquema para esta fase.

El usuario cerró el host con Ctrl+C y confirmó el cierre; se verificó que 7071 dejó de escuchar. Se detuvieron el arnés MSAL, Azurite y su lanzador. Sin procesos/listeners de prueba residuales al control final. No se mantienen tokens ni configuración Entra/sql-local permanente. Se conservaron los cambios previos y no se modificaron repositorios, ODBC, SqlSession, SqlUnitOfWork, reglas institucionales, permisos SQL o migraciones.

Dictamen de alcance: L8-E3 demuestra autenticación Entra real, rechazo HTTP de credenciales inválidas, denegación uniforme con credenciales válidas y ejecución real de SELECT SQL desde HTTP, bajo identidad Windows/SQL restringida. No se habilitan pruebas de escritura duradera: siguen pendientes la comprobación global de integridad, escenarios de autorización positiva con datos aprobados y una autorización explícita de escritura. La intermitencia de observadores SQL permanece sin causa confirmada. Sin staging, commit, push, PR, merge o despliegue.
## L8-E4 — Cierre de lecturas y diseño de persistencia duradera (23/10/2026)

### Integridad independiente: no confirmada actualmente

Se reutilizó el procedimiento de catálogo del observador L8-D: catalogSql/validateSnapshot, serialización de verify.sql R1, manifiesto original, autenticación Windows integrada de la identidad observadora ya existente, destino lpc:.\PAIPOC/pai_poc_dev y Node de la instalación utilizada anteriormente por esa observación. El lector no es la identidad escritora de la API; no se cambiaron cuentas, permisos ni configuración. El intento falló antes de obtener conexión: ConnectionError en CONNECT, 10.114,92 ms, pool cerrado; no hubo resultado de catálogo o DMV.

Diagnóstico breve adicional: identidad Windows actual coincidente con el propietario del repositorio (sin publicar su nombre), token Windows no administrativo, servicio MSSQL$PAIPOC Running y ODBC Driver 17 x64 presente. El arnés sqlcmd tuvo primero un error de opciones: -h y -y 0 son incompatibles, confirmado mediante ayuda local sin SQL; se eliminó -h y se corrigió únicamente el formato JSON de presentación del SELECT, conservando el cálculo y validaciones originales de catálogo/historial. El intento de lectura corregido terminó con ExitCode 1, código nativo 258, 5.050,75 ms, sin stdout ni resultado SQL. Es evidencia de fallo/timeout de conectividad, consistente con el intento nativo; no identifica por sí sola la causa raíz. No se ampliaron límites ni se inició una serie de reintentos.

Resultado actual: no se puede afirmar ONLINE, ocho tablas vacías, historial/catálogo coincidentes o ausencia de transacciones de prueba abandonadas en este corte, porque ninguna consulta llegó a aportar esos resultados. Se preparó la lectura DMV acotada a sesiones de pruebas/PAIPOC_Test, pero no se alcanzó. Las validaciones previas se conservan como antecedentes; no se convierten en evidencia actual. No se escribió, corrigió ni limpió ningún dato para forzar una comprobación.

### Cierre técnico de L8-E3

L8-E3 CERRADA EN EL ALCANCE DE AUTENTICACION Y LECTURAS HTTP/SQL DEMOSTRADAS: health 200; seis 401 (tres rutas sin Bearer y con Bearer inválido); access token institucional v2 validado; tres 404 uniformes con token válido; entrada directa a SqlUnitOfWork y SELECT reales users.findByIdentity y reports.findById, ambos correctos y sin filas; sin fallback a memoria en las rutas observadas. No se repitieron login, adquisición de token ni pruebas HTTP de autenticación en L8-E4.

Este cierre no incluye autorización positiva, escrituras, commit duradero ni revalidación de integridad global. La incidencia de observación de integridad queda abierta como condición independiente de L8-E4; no invalida la evidencia HTTP/SQL ya capturada ni se declara resuelta la intermitencia.

### Ensayo duradero propuesto, NO ejecutable todavía

Endpoint existente: POST /api/poc/actividades/{activityId}/reportes. Requiere Authorization: Bearer con access token v2 para la API aprobada, scope access_as_user y azp aprobado; Idempotency-Key exclusiva; Content-Type application/json; cuerpo de hasta 16.384 bytes con period, quantity como DecimalText exacto o null, y narrative. No admite campos de autor/estado adicionales. Ejemplo exclusivamente descriptivo: period='poc-durable-<identificador-de-ensayo>', quantity='9007199254740993.000100', narrative='Ensayo sintético de persistencia'. El identificador de ensayo debe satisfacer los límites actuales; no se usa ni inserta ahora.

Condición de autorización independiente del scope: usuario habilitado vinculado a tenant/oid del token validado, actividad y ficha existentes, y asignación habilitada con poc:edit-report y vigencia admitida por la política real. La lectura posterior GET /api/poc/reportes/{reportId} necesita además poc:read. El Client ID no concede acceso por sí solo. Actualmente createLocalAuthorization compone isApplicable: () => false: por ello NINGUNA asignación concede acceso, aunque existan filas correctas. Bajo la restricción de no modificar esa política, un ensayo HTTP con creación exitosa es inviable; no se simulará autorización ni se omitirá el servicio.

Dependencias persistentes necesarias antes del POST:

| Tabla | Uso/FK |
|---|---|
| InstitutionalUsers | Actor habilitado; identidad tenant/objeto única; FK de autor, auditoría e idempotencia |
| Dependencies | Padre de la ficha |
| Fichas | DependencyId → Dependencies |
| Activities | FichaId → Fichas; actividad destino del POST |
| AccessAssignments | UserId/FichaId → usuario/ficha; capacidades separadas poc:edit-report y poc:read |
| Reports | POST crea el reporte: FK actividad y autores; UNIQUE ActivityId + PeriodKey; rowversion |
| AuditEvents | POST añade evento histórico de creación, FK al actor; append-only desde la API |
| IdempotencyRecords | Reserva y finalización en la misma transacción; FK actor, reporte y auditoría; UNIQUE ActorId + Operation + IdempotencyKey; resultado histórico completo |

Con las ocho tablas vacías no basta ejecutar el POST: se necesitarían datos padre sintéticos COMMITidos con autorización específica. Un conjunto de padres sin commit en otra conexión no sirve para este ensayo: la conexión HTTP no puede usarse como si compartiera la transacción de preparación. La vinculación del actor debe usar tenant/oid realmente validados (metadatos de autenticación del usuario de prueba aprobado); inventar el oid impide autenticar/autorización. Si no se aprueba almacenar ese vínculo mínimo de identidad, tampoco es viable el caso positivo. Los contenidos de actividad, ficha, dependencia y reporte serán exclusivamente sintéticos.

Permisos existentes del escritor PAIPOC_Test: SELECT/INSERT en las tablas funcionales y UPDATE por columnas autorizadas. Para el POST bastan SELECT sobre usuario/ficha/asignaciones/actividad y comprobaciones de reporte/auditoría/idempotencia, INSERT en Reports/AuditEvents/IdempotencyRecords y UPDATE de finalización de IdempotencyRecords (State, CompletedAt, OutcomeReportId, OutcomeAuditEventId, OutcomeReportJson). El propio rowversion lo genera SQL Server. No se requiere conceder DELETE, db_owner, CONTROL o privilegios de migración. Los permisos reportados son los del script ya aprobado, no una nueva comprobación efectiva SQL en L8-E4, que no pudo conectar.

Secuencia mínima futura, condicionada a resolver todos los bloqueos y a autorización de ejecución:

1. Verificación independiente completa de integridad y ausencia de transacciones de prueba. Preparar y revisar el inventario exacto de IDs/tablas que podrán crearse y eliminarse, identidad Entra de prueba y datos padre. Requiere aprobación de autorización positiva y de la preparación/limpieza; no está autorizada en este corte.
2. Preparar los padres sintéticos en una transacción administrativa explícita, con commit únicamente tras validar todas las FK y pertenencia al ensayo. Esto es una escritura persistente separada del POST y debe figurar expresamente en la autorización futura. El escritor HTTP sigue siendo PAIPOC_Test, sin privilegios nuevos.
3. Iniciar el host restringido con configuración temporal y token en memoria. Ejecutar exactamente un POST con clave de idempotencia y periodo exclusivos. Esperar 201 y registrar solo recibo/IDs sintéticos, versión opaca y evidencias técnicas sanitizadas. No usar el error terminal de rollback de L8-D5: en el ensayo duradero el callback debe terminar correctamente para que el runner intente el COMMIT real conjunto de reporte, auditoría e idempotencia.
4. Confirmar el commit con una lectura independiente después de la transacción. Reiniciar el proceso host y realizar GET por el reportId con token válido y capacidad poc:read, para demostrar supervivencia al proceso que escribió. Verificar cantidad textual exacta, Unicode, periodo, estado, UTC y version; un observador separado comprueba las tres filas relacionadas, snapshots y resultado histórico. La nueva conexión/identidad compuesta, si se mide, se conserva solo en memoria: un nuevo lease no equivale automáticamente a una conexión física nueva por pooling.
5. Limpiar únicamente el conjunto sintético inventariado mediante un procedimiento administrativo distinto del escritor HTTP, autorizado para este ensayo; comprobar pertenencia completa, relaciones y que no hay datos ajenos, dentro de una transacción y sin cascadas. Eliminar IdempotencyRecords primero; luego AuditEvents y Reports (sin dependencias entre esos dos), AccessAssignments y Activities, Fichas, Dependencies e InstitutionalUsers al final. Los padres solo se eliminan si fueron creados exclusivamente para el ensayo y no tienen referencias ajenas. La eliminación administrativa de auditoría sintética es una excepción de mantenimiento de la PoC que necesita autorización expresa; la API y AuditRepository siguen siendo append-only. Si esa excepción no se aprueba, el diseño exige un destino sintético desechable autorizado o retención de la evidencia; no puede prometerse limpieza completa en la base compartida.
6. Observador independiente: ocho tablas vacías si ese era el estado inicial, historial de migraciones y catálogo idénticos, cero transacciones de prueba abandonadas y cierre de recursos. Si falla, reportar integridad no verificada; no borrar más ni recrear la base como solución automática.

Idempotencia/concurrencia: conservar clave y cuerpo exactos durante el ensayo; mismo scope con contenido distinto debe ser conflicto, no una segunda escritura. No repetir automáticamente un POST con respuesta perdida o commit ambiguo: primero resolver el resultado duradero mediante consultas/recibo y, si se autoriza, replay de la misma clave, nunca una clave nueva para forzar éxito. ActivityId+PeriodKey también es único. No añadir reintentos de deadlock ni inferir concurrencia entre conexiones a partir de un único ensayo secuencial. La rowversion recibida se conserva como token opaco, sin inventar versiones.

### Estado y límites de L8-E4

Preparación documental concluida; ensayo NO LISTO PARA EJECUCION. Bloqueos: integridad actual no demostrada por conectividad; política de asignaciones deliberadamente denegatoria; ausencia de datos padre persistentes aprobados; necesidad de aprobar vínculo mínimo de identidad de prueba y limpieza administrativa acotada, incluida auditoría sintética. No se solicita todavía autorización del POST porque estas condiciones no están resueltas, conforme a la instrucción del usuario de pedirla únicamente cuando el ensayo esté preparado.

No hubo POST/PATCH, fixtures, INSERT/UPDATE/DELETE funcionales, cambios de políticas, permisos, esquema o migraciones. Se modificaron únicamente estos documentos y un arnés temporal ignorado por Git en api/.test-tmp/l8e4. No se iniciaron host, login ni nuevas pruebas de autenticación. Sin staging, commit, push, PR, merge o despliegue.
