# API PAI — F2 / L1 local, contratos L2, memoria L3, identidad L4-A y autorización L4-B

Proyecto independiente del frontend. Único endpoint HTTP: `GET /api/poc/health`, JSON estático,
sin datos institucionales, identidad simulada ni integración de autenticación o autorización.
L2 define entidades, errores y puertos: [L2_Modelo_Contratos.md](./L2_Modelo_Contratos.md).
L3 implementa memoria volátil solo para uso técnico y pruebas, sin conectarla a HTTP:
[L3_Persistencia_Memoria.md](./L3_Persistencia_Memoria.md).
L4-A añade una biblioteca aislada de verificación JWT Entra v2, sin integrarla con rutas:
[L4A_Identidad_Entra.md](./L4A_Identidad_Entra.md).
L4-B está implementada en el commit `8914e94`: servicio aislado de autorización por ficha y
capacidades, sin integración HTTP: [L4B_Autorizacion_Fichas.md](./L4B_Autorizacion_Fichas.md).
El cierre reportó **132 pruebas aprobadas, 0 fallidas**, para la suite completa L1–L4-B;
es un resultado histórico, no una nueva ejecución por esta sincronización documental.

**L5 — Consultas HTTP autenticadas permanece pendiente.** Todavía no existen endpoints
HTTP autenticados para operaciones funcionales. Las bibliotecas L4-A/L4-B no están
conectadas al host ni al frontend; health conserva su diagnóstico local anónimo.

## Autorización L4-B y límites pendientes

`FichaAuthorizationService` resuelve el usuario por `tenantId + objectId`, verifica usuario
habilitado, ficha existente y asignación habilitada con capacidad explícita. Deniega por
defecto, sin inferir permisos por roles Microsoft 365, scopes o dependencia compartida.
`poc:read` y `poc:edit-report` son capacidades sintéticas independientes, no roles
institucionales aprobados. No existe caché de decisiones de autorización.

`decide()` y `requireAllowed()` reciben TransactionContext para que la comprobación y
la futura escritura ocurran dentro de la misma unidad de trabajo. Las pruebas sintéticas
verifican acceso cruzado, escalamiento, revocación, rollback e integración L4-A → L4-B.
No se implementó un caso de uso funcional de escritura ni un endpoint para ello.

La política temporal institucional de asignaciones sigue pendiente. L2 no define si los
extremos validFrom/validUntil son inclusivos o exclusivos; el servicio exige una
AssignmentValidityPolicy explícita y no incluye una implementación predeterminada en src.
Solo las pruebas usan el supuesto `validFrom <= instante < validUntil`, con null sin fin
superior. Antes de integrar endpoints debe acordarse una política confiable revisada;
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
- `src/infrastructure/identity`: configuración, Bearer, JWT, JWKS y normalización; sin repositorios ni HTTP.
- `src/domain`: entidades técnicas sintéticas, tipos nominales, errores y validadores de representación.
- `src/application/ports`: contratos de repositorio, unidad transaccional, reloj e identidad.
- `src/application/authorization`: servicio L4-B por ficha/capacidad, independiente de HTTP y adaptadores.
- `scripts`: compilación local, límites de alcance y arranque con dirección fija.
- `tests`: contratos, defensas locales, memoria transaccional, identidad y autorización sintéticas, y pruebas negativas de límites.

## Separación y prevención de publicación

El paquete, lockfile y TypeScript son propios. No se alteran scripts, dependencias,
configuración ni MSAL del frontend. `.local-build/` contiene únicamente compilados de
ejecución local, ignorados por Git; no se genera ZIP ni paquete de despliegue.

`check:boundaries` admite las tres fuentes L1, seis fuentes de dominio/puertos L2 y cuatro
fuentes del adaptador L3, un puerto nuevo y seis módulos de identidad L4-A, y el servicio
de autorización L4-B. Impide activar autorización desde HTTP o adaptadores, importar
memoria directamente desde el servicio y hacer depender los puertos del servicio.
Los fixtures solo existen bajo tests, fuera del build.
Rechaza fuentes adicionales, imports fuera del alcance y carga dinámica; el núcleo no
puede importar HTTP, infraestructura ni Azure Functions. Incorporar fixtures o una identidad local
requiere revisar explícitamente estos límites y diseñar salidas separadas. El compilador
tiene `rootDir: src`, y el build limpia su salida para no conservar fuentes obsoletas.

`.funcignore` excluye TODO de publicación; `private: true` evita publicación npm.
No hay scripts de despliegue. Estas defensas no impiden que alguien eluda deliberadamente
las herramientas o cambie la configuración: no constituyen autorización de producción.

El registro falla si no se habilita el modo local de desarrollo o si detecta indicadores
de alojamiento Azure. El validador L4-A no se instancia desde el host y no hay fallback ficticio.
La comprobación de entorno es una defensa adicional, no un mecanismo de identidad.
Los indicadores de Azure se conservan al sanear el entorno: el lanzador y el worker
rechazan alojamiento, aunque la conexión del emulador esté correctamente configurada.

## Pruebas y límites

Las pruebas usan `node:test`; `npm test` recompila primero para evitar código obsoleto.
Las de L1 cubren respuesta JSON, no reflexión de entrada y fallos de las defensas locales/de
publicación. La suite posterior incluye memoria, validación JWT y autorización por ficha
con datos sintéticos. No valida integración real con Entra ID, SQL, Graph o SharePoint,
ni endpoints HTTP funcionales autenticados todavía inexistentes.

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

La instalación de Azurite 3.37.0 informó cuatro entradas moderadas en `npm audit`, ligadas
a dependencias transitivas (`uuid`, `@azure/ms-rest-js`, `sequelize`) y al paquete que las
incluye. No se aplicó `audit fix --force`: la corrección sugerida implicaba cambiar a
Azurite 2.7.1. Hay también avisos de deprecación transitivos. Es una herramienta local de
desarrollo: revisar actualizaciones compatibles antes de ampliar su uso; no empaquetarla
como dependencia de ejecución ni considerar este resultado una aprobación de producción.

El host Functions incluye rutas administrativas propias; no son funciones de negocio.
L1 registra únicamente `pocHealth`. No exponer este host a LAN, Internet ni túneles.
