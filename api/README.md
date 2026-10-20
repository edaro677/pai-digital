# API PAI — F2 / L1–L6-B completadas en alcance técnico local

Proyecto independiente del frontend. `GET /api/poc/health` conserva su JSON estático,
sin datos institucionales, identidad simulada ni integración de autenticación o autorización.
L2 define entidades, errores y puertos: [L2_Modelo_Contratos.md](./L2_Modelo_Contratos.md).
L3 implementa memoria volátil para uso técnico y pruebas; L5 la compone mediante interfaces:
[L3_Persistencia_Memoria.md](./L3_Persistencia_Memoria.md).
L4-A aporta verificación JWT Entra v2, ahora utilizada por las consultas L5:
[L4A_Identidad_Entra.md](./L4A_Identidad_Entra.md).
L4-B está implementada en el commit `8914e94`: servicio aislado de autorización por ficha y
capacidades, integrada por L5 mediante consultas de aplicación: [L4B_Autorizacion_Fichas.md](./L4B_Autorizacion_Fichas.md).
El cierre reportó **132 pruebas aprobadas, 0 fallidas**, para la suite completa L1–L4-B;
es el resultado histórico del cierre L4-B.

**L5 — Consultas HTTP autenticadas completada en alcance técnico local, commit `f287707`.**
Rutas registradas: `GET /api/poc/fichas/{fichaId}` y
`GET /api/poc/fichas/{fichaId}/actividades`. Exigen JWT y capacidad exacta `poc:read`, con
autorización y lectura en la misma transacción; sin integración
con el frontend. Detalle: [L5_Consultas_HTTP.md](./L5_Consultas_HTTP.md).

**L6-B — Escrituras HTTP seguras completada en alcance técnico local, commit `2543c0a`.**
Se agregan únicamente POST `/api/poc/actividades/{activityId}/reportes`, PATCH y GET
`/api/poc/reportes/{reportId}`. POST/PATCH requieren poc:edit-report e Idempotency-Key;
GET requiere poc:read. Solo se crean/editan registros sintéticos poc-draft, sin transiciones
institucionales. Detalle: [L6B_Escrituras_HTTP.md](./L6B_Escrituras_HTTP.md).

Las lecturas y escrituras usan la misma instancia UnitOfWork en composición. La escritura,
auditoría e idempotencia son atómicas. PATCH exige expectedVersion, distingue omisión/null
y nunca recibe estado ni autoría del cliente. Los replays revalidan acceso y recuperan el
recibo original antes de volver a comprobar versión, sin escribir ni duplicar auditoría.

El host no precarga datos ni asignaciones. Sin `PAI_API_IDENTITY_CONFIG` válido, las nuevas
rutas responden 500 genérico; health permanece operativo. La variable contiene JSON de
IdentityConfiguration (tenant, audiencia API, scope, URLs OIDC/JWKS, versión 2.0,
tolerancia y **allowedClientIds obligatorio**), sin valores institucionales por defecto.
No se configuró ni consultó Entra real. La política temporal de la composición local
bloquea todas las asignaciones hasta una revisión posterior; los 200 se verifican con DI
exclusivamente en tests. No habilitar datos ni políticas reales por esta etapa.

## Autorización L4-B y límites pendientes

`FichaAuthorizationService` resuelve el usuario por `tenantId + objectId`, verifica usuario
habilitado, ficha existente y asignación habilitada con capacidad explícita. Deniega por
defecto, sin inferir permisos por roles Microsoft 365, scopes o dependencia compartida.
`poc:read` y `poc:edit-report` son capacidades sintéticas independientes, no roles
institucionales aprobados. No existe caché de decisiones de autorización.

`decide()` y `requireAllowed()` reciben TransactionContext para que la comprobación y
la futura escritura ocurran dentro de la misma unidad de trabajo. Las pruebas sintéticas
verifican acceso cruzado, escalamiento, revocación, rollback e integración L4-A → L4-B.
L6-B integra escrituras exclusivamente técnicas de PoC, sin implementar procesos institucionales.

La política temporal institucional de asignaciones sigue pendiente. L2 no define si los
extremos validFrom/validUntil son inclusivos o exclusivos; el servicio exige una
AssignmentValidityPolicy explícita y no incluye una implementación predeterminada en src.
Solo las pruebas usan el supuesto `validFrom <= instante < validUntil`, con null sin fin
superior. Antes de habilitar accesos operativos debe acordarse una política confiable revisada;
la convención de laboratorio no constituye una decisión institucional.

La integración con Entra ID real también permanece pendiente: registro/configuración de
API y scope, adquisición de access tokens dirigidos a la API desde MSAL y pruebas contra
el tenant requieren autorización posterior. Los tokens, claves y datos usados en pruebas
son sintéticos; no acreditan integración institucional ni autorización de producción.

## Requisitos y ejecución

- Node.js 24.x, npm y Azure Functions Core Tools v4 instalado previamente.
- Azurite 3.37.0 está fijado como dependencia de desarrollo; requiere Node >=22.
- Desde `api/`: `npm ci`, `npm run build`, `npm test`.
- Terminal 1, desde `api/`: `npm run storage:start`. Esperar los tres mensajes de escucha.
- Terminal 2, desde `api/`: `npm start`. Compila y ejecuta
  `func start --address 127.0.0.1 --port 7071 --functions pocHealth pocFicha pocFichaActividades pocReportCreate pocReportRead pocReportUpdate`.
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
- Solo HTTP local. `anonymous` en Functions desactiva su clave de función; las consultas
  L5 aplican autenticación JWT y autorización en el controlador. Health sigue anónimo.

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

El almacenamiento es para servicios internos del host. No se implementó persistencia
de negocio duradera ni se alteró health. Sin Azurite en ejecución no debe darse por
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

- `src/functions`: entrada index, health, consultas L5 y tres operaciones de reporte L6-B.
- `src/http`: controladores de consultas y respuesta health, independientes del registro.
- `src/composition`: unión explícita de identidad, autorización, consultas y memoria vacía.
- `src/infrastructure`: defensa de arranque local; no autentica usuarios.
- `src/infrastructure/memory`: siete repositorios y UnitOfWork volátil; sin I/O ni autorización.
- `src/infrastructure/identity`: configuración, Bearer, JWT, JWKS y normalización; sin repositorios ni HTTP.
- `src/domain`: entidades técnicas sintéticas, tipos nominales, errores y validadores de representación.
- `src/application/ports`: contratos de repositorio, unidad transaccional, reloj e identidad.
- `src/application/authorization`: servicio L4-B por ficha/capacidad, independiente de HTTP y adaptadores.
- `src/application/queries`: lectura de ficha/actividades con autorización en el mismo contexto.
- `src/application/reports`: comandos y lectura de reporte, recibos/DTO y coordinación transaccional.
- `src/infrastructure/reportTools.ts`: UUID, correlación y huella SHA-256; sin persistencia ni I/O externo.
- `scripts`: compilación local, límites de alcance y arranque con dirección fija.
- `tests`: contratos, defensas locales, memoria transaccional, identidad y autorización sintéticas, y pruebas negativas de límites.

## Separación y prevención de publicación

El paquete, lockfile y TypeScript son propios. No se alteran scripts, dependencias,
configuración ni MSAL del frontend. `.local-build/` contiene únicamente compilados de
ejecución local, ignorados por Git; no se genera ZIP ni paquete de despliegue.

`check:boundaries` admite las tres fuentes L1, seis fuentes de dominio/puertos L2 y cuatro
fuentes del adaptador L3, un puerto nuevo y seis módulos de identidad L4-A, y el servicio
de autorización L4-B, las cinco fuentes L5 y las tres fuentes nuevas L6-B. La composición explícita es la entrada
a los adaptadores; HTTP depende de consultas y puertos, con una excepción para reconocer
AuthenticationError. Health no activa ninguna de esas capas. Se bloquea importar memoria
desde el controlador/servicio o hacer depender los puertos de los servicios.
Los fixtures solo existen bajo tests, fuera del build.
Rechaza fuentes adicionales, imports fuera del alcance y carga dinámica; el núcleo no
puede importar HTTP, infraestructura ni Azure Functions. Incorporar fixtures o una identidad local
requiere revisar explícitamente estos límites y diseñar salidas separadas. El compilador
tiene `rootDir: src`, y el build limpia su salida para no conservar fuentes obsoletas.

`.funcignore` excluye TODO de publicación; `private: true` evita publicación npm.
No hay scripts de despliegue. Estas defensas no impiden que alguien eluda deliberadamente
las herramientas o cambie la configuración: no constituyen autorización de producción.

El registro falla si no se habilita el modo local de desarrollo o si detecta indicadores
de alojamiento Azure. L5 compone el validador real solo con configuración explícita válida,
sin fallback ficticio ni claves sintéticas en src. Su construcción no descarga metadatos.
La comprobación de entorno es una defensa adicional, no un mecanismo de identidad.
Los indicadores de Azure se conservan al sanear el entorno: el lanzador y el worker
rechazan alojamiento, aunque la conexión del emulador esté correctamente configurada.

## Pruebas y límites

Las pruebas usan `node:test`; `npm test` recompila primero para evitar código obsoleto.
Las de L1 cubren respuesta JSON, no reflexión de entrada y fallos de las defensas locales/de
publicación. La suite posterior incluye memoria, validación JWT y autorización por ficha
con datos sintéticos. L5 ejercita los controladores reutilizados por Functions con JWT
firmados localmente, el validador real y L3/L4-B; no valida Entra ID, SQL, Graph o SharePoint reales.
La ejecución L1–L5 registra 182 pruebas aprobadas, 0 fallidas; API, contratos y límites
correctos. La validación operativa posterior de L5 sí inició Core Tools/Azurite y ejecutó
nueve peticiones reales: health 200; consultas sin token 401 con configuración estructural
válida; configuración incompleta/JSON inválido 500 genérico. No se filtraron datos sensibles
en las respuestas observadas. Esa evidencia no acredita escrituras L6-B sobre sockets.

Suite al cierre L1–L6-B: 214 pruebas aprobadas, 0 fallidas; se ejercitan controladores HTTP
reales con JWT sintéticos y L3/L4-A/L4-B. Se prueban versiones obsoletas, carreras,
replays, revocación y rollback completo por fallos de auditoría o idempotencia. L6-B no
modifica la política temporal del host; las respuestas exitosas usan DI solo en tests.
La validación operativa posterior inició Functions/Azurite en loopback y registró seis
operaciones y 18 peticiones HTTP: health 200, protegidas sin token 401 y configuración
JWT inválida 500 genérico. No se observaron divulgaciones sensibles; procesos detenidos
y listeners liberados. Estos resultados históricos no se vuelven a ejecutar en L7-B1.

POST/PATCH aceptan exclusivamente JSON UTF-8 no comprimido, hasta 16 KiB leídos por stream
incluso sin Content-Length. Límites técnicos: narrative 4000 caracteres, period/decimal/
expectedVersion 128, clave 1–128 con caracteres acotados. No son límites institucionales.
Errores nuevos: 409 conflicto genérico; 413 tamaño excesivo; 415 formato no admitido.

Las pruebas de almacenamiento comprueban eliminación de configuración heredada sin
mutar el entorno padre, conexión exclusiva al emulador, rechazo de configuraciones mixtas
y de alojamiento Azure, direcciones/puertos fijos y directorio local acotado.

El build incluye `npm run check:contracts`: compila los contratos y sus pruebas de tipos
con `tsc --noEmit`, sin tipos Node ni DOM. Las pruebas negativas usan `@ts-expect-error`
para detectar cruces de IDs, omisión de versión, mutaciones y operaciones no declaradas.
Las pruebas de comportamiento L2 cubren representaciones exactas y errores diferenciados;
las garantías de memoria transaccional y autorización se prueban separadamente en L3/L4-B.

Las pruebas L4-A generan claves efímeras, firman tokens sintéticos y verifican configuración,
firma, claims, caché y rotación sin red. No equivalen a validación en el tenant institucional.
`jose@6.2.12` es la única dependencia incorporada para ello. No se requiere ni se incluye
un client secret, certificado privado de producción o token institucional.

L5 corrige la validación de actor: `azp` debe pertenecer a allowedClientIds explícito,
validado y copiado de forma inmutable. No basta con que sea un GUID. Los rechazos de
ficha inexistente, sin asignación o sin capacidad devuelven el mismo 404 para evitar
enumeración; 403 se reserva y no se emite en estas rutas. ID/solicitud inválidos tras
autenticar → 400; autenticación inválida → 401; error inesperado/configuración ausente → 500.

La instalación de Azurite 3.37.0 informó cuatro entradas moderadas en `npm audit`, ligadas
a dependencias transitivas (`uuid`, `@azure/ms-rest-js`, `sequelize`) y al paquete que las
incluye. No se aplicó `audit fix --force`: la corrección sugerida implicaba cambiar a
Azurite 2.7.1. Hay también avisos de deprecación transitivos. Es una herramienta local de
desarrollo: revisar actualizaciones compatibles antes de ampliar su uso; no empaquetarla
como dependencia de ejecución ni considerar este resultado una aprobación de producción.

El host Functions incluye rutas administrativas propias; no son funciones de negocio.
Se conservan los tres GET L1–L5 y se agregan pocReportCreate (POST), pocReportRead (GET)
y pocReportUpdate (PATCH). No exponer este host a LAN, Internet ni túneles.

## Continuidad L7 — Diseño y preparación de persistencia duradera

L6-B está registrada en `2543c0a`. L7-A concluyó como diseño preliminar; L7-B1 es
preparación técnica y sincronización documental, sin adaptador SQL implementado.
SQL Server local y Azure SQL futuro son candidatos, no infraestructura autorizada.
Los contratos L2 permanecen intactos: sus tokens no tienen máximo de longitud y
UtcInstant admite fechas canónicas fuera del rango de datetime2. No imponer los límites
HTTP como límites de dominio ni convertir DecimalText a number o decimal(p,s).
Las decisiones SQL requieren revisión antes de L7-B2; no se instalan dependencias,
crean conexiones/bases/contenedores ni ejecutan migraciones en esta etapa.
La regresión integral L1–L6-B, durabilidad y concurrencia entre conexiones siguen siendo
requisitos de aceptación del futuro adaptador, no resultados acreditados por este diseño.


## Estado vigente — L7-B2, 20/10/2026

L7-B2 quedó registrada en `ba6c2b6`, sobre la base histórica `2543c0a`.
Por autorización expresa se adopta la alternativa B: representaciones acotadas y futuro
SQL convencional. Esta entrada sustituye las recomendaciones de representación L7-B1
anteriores, conservadas como historial: ya no se mantienen tokens ilimitados ni fechas
fuera de 0001–9999. Se descartan TokenValues, IDs binarios y bloqueos especiales por digest,
que solo fueron propuestas; SHA-256 sigue usándose como huella idempotente.

IDs internos ASCII 1–64; GUID Entra canónico minúsculo no nulo; PeriodKey 1–128 unidades
UTF-16 bien formadas; claves ASCII 1–128 y correlación 1–64; huella hexadecimal minúscula
64; versión ASCII visible 1–128; UTC canónico con milisegundos, años 0001–9999.
DecimalText conserva su representación y gramática. No cambian marcas ni firmas públicas.
HTTP ahora admite IDs de hasta 64; mantiene autenticación previa, autorización y 404 uniforme.
Memoria valida semillas, escrituras y snapshots dentro de su contexto transaccional.

Suite ejecutada: 248 aprobadas, 0 fallidas, 0 omitidas (214 previas + 34 nuevas).
Build API, contratos, fronteras y frontend correctos; aviso frontend previo >500 kB.
No se arrancó el host ni se probó Entra real. No hay SQL, migraciones, dependencias nuevas,
infraestructura o cambios de frontend. Detalle: [L7B2_Representacion_SQL.md](./L7B2_Representacion_SQL.md).

## Estado vigente — L7-B4, 20/10/2026

L7-B3 concluyó como diseño de la conversación. L7-B4 incorpora únicamente artefactos
de migración inicial, verificaciones estáticas y documentación; pendiente de revisión/commit.
Detalle: [migrations/README.md](./migrations/README.md).

Hay ocho tablas funcionales convencionales y una tabla técnica de historial. Se conserva
la alternativa B: sin TokenValues ni bloqueos especiales por digest. SHA-256 identifica
artefactos y cambios de catálogo, y continúa como huella idempotente de L6-B.
No se implementó SQL en ejecución: no hay adaptador, controlador nuevo, conexión,
base de datos, instalación, carga de fixtures o ejecución de up/verify/down.

Los scripts están bloqueados sin confirmaciones explícitas y solo admiten un destino
SQL Server local sintético. El esquema es compatible con SQL Server 2022/Azure SQL,
pero el procedimiento de ejecución Azure permanece deshabilitado y requiere autorización.
La reversión solo acepta un esquema íntegro y vacío, sin miembros en el rol API.

Suite L1–L7-B4: 260 aprobadas, 0 fallidas/omitidas: 248 anteriores + 12 pruebas estáticas.
El pretest compila API, contratos y fronteras. El build frontend sigue siendo obligatorio.
La inspección estática no acredita sintaxis compilada, restricciones, permisos efectivos,
durabilidad, concurrencia o rollback del motor: esas pruebas quedan pendientes.
