# API PAI — F2 / L1–L4-B y consultas HTTP L5 en implementación

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

**L5 — Consultas HTTP autenticadas en implementación, pendiente de revisión y cierre.**
Rutas registradas: `GET /api/poc/fichas/{fichaId}` y
`GET /api/poc/fichas/{fichaId}/actividades`. Exigen JWT y capacidad exacta `poc:read`, con
autorización y lectura en la misma transacción; no existen escrituras HTTP ni integración
con el frontend. Detalle: [L5_Consultas_HTTP.md](./L5_Consultas_HTTP.md).

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
No se implementó un caso de uso funcional de escritura ni un endpoint para ello.

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
  `func start --address 127.0.0.1 --port 7071 --functions pocHealth pocFicha pocFichaActividades`.
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

- `src/functions`: entrada index y registro de health y las dos consultas GET.
- `src/http`: controladores de consultas y respuesta health, independientes del registro.
- `src/composition`: unión explícita de identidad, autorización, consultas y memoria vacía.
- `src/infrastructure`: defensa de arranque local; no autentica usuarios.
- `src/infrastructure/memory`: siete repositorios y UnitOfWork volátil; sin I/O ni autorización.
- `src/infrastructure/identity`: configuración, Bearer, JWT, JWKS y normalización; sin repositorios ni HTTP.
- `src/domain`: entidades técnicas sintéticas, tipos nominales, errores y validadores de representación.
- `src/application/ports`: contratos de repositorio, unidad transaccional, reloj e identidad.
- `src/application/authorization`: servicio L4-B por ficha/capacidad, independiente de HTTP y adaptadores.
- `src/application/queries`: lectura de ficha/actividades con autorización en el mismo contexto.
- `scripts`: compilación local, límites de alcance y arranque con dirección fija.
- `tests`: contratos, defensas locales, memoria transaccional, identidad y autorización sintéticas, y pruebas negativas de límites.

## Separación y prevención de publicación

El paquete, lockfile y TypeScript son propios. No se alteran scripts, dependencias,
configuración ni MSAL del frontend. `.local-build/` contiene únicamente compilados de
ejecución local, ignorados por Git; no se genera ZIP ni paquete de despliegue.

`check:boundaries` admite las tres fuentes L1, seis fuentes de dominio/puertos L2 y cuatro
fuentes del adaptador L3, un puerto nuevo y seis módulos de identidad L4-A, y el servicio
de autorización L4-B y las cinco fuentes nuevas L5. La composición explícita es la entrada
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
correctos. No se inició Core Tools/Azurite ni se probó HTTP sobre sockets durante L5.

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
Se registran únicamente `pocHealth`, `pocFicha` y `pocFichaActividades`, todos GET.
No exponer este host a LAN, Internet ni túneles. L6/L7 no se implementan.
