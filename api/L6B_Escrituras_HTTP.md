# F2 / L6-B — Escrituras HTTP seguras

**Estado:** completada en su alcance técnico local, pendiente de commit. No se asigna
identificador de commit L6-B ni se aprueba integración institucional o despliegue productivo.
Base verificada: `f287707`, rama feature/arquitectura-persistencia-pai, árbol inicial limpio.
L5 está completada en alcance técnico local y registrada en ese commit. Se contrastaron
L2–L5 y el maestro, los contratos reales y los controles de identidad/autorización existentes.
No se cambian dominio, puertos L2, persistencia L3 ni validación criptográfica L4-A.

## Arquitectura y composición

| Archivo | Responsabilidad |
|---|---|
| src/application/reports/service.ts | Comandos, DTO/recibo, lectura, autorización y coordinación de escritura/auditoría/idempotencia |
| src/http/reportes.ts | Autenticación, validación acotada de JSON, mapeo HTTP y tres controladores reutilizados por Functions |
| src/infrastructure/reportTools.ts | UUID, correlación y SHA-256 mediante node:crypto, inyectables sin nueva dependencia |
| src/composition/queries.ts | Una instancia UnitOfWork compartida por consultas L5, GET de reporte y escrituras |
| src/functions/fichas.ts | Conserva L5 y registra únicamente las tres operaciones nuevas |
| scripts/start-local.mjs | Añade los tres nombres de función, conservando dirección 127.0.0.1:7071 |

createApplicationHandlers recibe desde código confiable el validador, la unidad de trabajo,
L4-B, reloj y herramientas. No existe un modo de identidad ficticia ni selección de fixtures
desde una petición o variable de entorno. createLocalQueryHandlers conserva configuración
JWT explícita, memoria vacía y política temporal siempre false. Un único registro de
Functions construye esa composición una vez por worker. No hay almacenamiento compartido
entre workers, persistencia duradera o caché de decisiones de autorización.

## Endpoints y cuerpos

| Operación | Ruta | Capacidad | Respuesta |
|---|---|---|---|
| POST | /api/poc/actividades/{activityId}/reportes | poc:edit-report | 201 y recibo mínimo |
| PATCH | /api/poc/reportes/{reportId} | poc:edit-report | 200 y recibo con nueva versión |
| GET | /api/poc/reportes/{reportId} | poc:read | 200 y DTO explícito con versión vigente |

POST exige exactamente las tres propiedades, incluso si quantity es null:

```json
{"period":"synthetic-period","quantity":"1.000","narrative":"Contenido sintético"}
```

PATCH exige expectedVersion y al menos uno de quantity/narrative:

```json
{"expectedVersion":"token-opaco","quantity":null}
```

Omitir quantity conserva su valor; null lo elimina de forma explícita, sin convertirlo en
cero. narrative admite cadena vacía, nunca null. Los decimales conservan su texto exacto;
no se calculan porcentajes ni indicadores y no se aplican reglas institucionales de rangos.
POST fija exclusivamente el estado técnico existente poc-draft. PATCH solo admite ese
estado, conserva estado/actividad/periodo/autoría/fechas de creación y rechaza campos
protegidos en el cuerpo. Identificadores, autoría, fechas y correlación se generan en servidor.

Recibo de escritura (mismo esquema para primera respuesta y replay):

```json
{"data":{"id":"synthetic-report-2","activityId":"synthetic-activity-alpha-1","period":"synthetic-period","version":"token-opaco"}}
```

GET proyecta id, activityId, period, version, quantity, narrative, state, createdAt y
updatedAt. No devuelve author IDs, eventos ni reservas. Escritura no implica lectura: el
recibo no contiene narración previa ni snapshots. No se registran listas globales, borrado,
transiciones de estado o endpoints independientes de auditoría/idempotencia.

## Transacción y autorización

L4-A verifica cada Bearer antes de procesar cuerpo o abrir transacción, conservando la
lista obligatoria de clientes azp. No se cambia MSAL. El servicio deriva la ficha desde
Activity.fichaId en POST, o Report.activityId → Activity.fichaId en PATCH/GET. No acepta
userId, tenantId, capacidades ni ficha alternativa del cliente.

Un único runAtomic carga relaciones, autoriza con L4-B y resuelve idempotencia. Si es una
operación nueva, comprueba unicidad/estado/versión, reserva, escribe reporte, agrega evento
con snapshot completo y completa idempotencia. El controlador responde solo después del
commit. Las excepciones propagan rollback; no hay guardados independientes ni reintentos
automáticos. El adaptador también comprueba expectedVersion al actualizar.

Se usan exactamente los eventos existentes poc:report-created (before null, after completo)
y poc:report-updated (before/after completos), actor autenticado e instante inyectado.
No se registra auditoría de denegaciones, ni se inventa una regla institucional de retención.

## Idempotencia

POST/PATCH exigen Idempotency-Key. Ámbito L2 intacto: actor interno + operación + clave.
La huella SHA-256 serializa una tupla v1 con operación, actor, clientId verificado, objetivo
y datos aceptados. PATCH incluye expectedVersion y banderas de presencia de cada campo;
POST incluye periodo. No incluye hora, UUID generados ni orden de propiedades JSON.
"1.0" y "1.000" son solicitudes diferentes. Cambiar cliente con la misma clave también
es una reutilización incompatible, sin ampliar el ámbito del contrato L2.

Se revalida autorización antes de buscar/devolver replay. Misma huella y registro completed
recuperan el recibo original: no escriben, generan IDs ni duplican auditoría. Se comprueban
objetivo, actor y consistencia completa del snapshot con el evento guardado. Otra huella
da 409; una reserva incompleta o resultado incoherente no concede replay y da 409.
El replay se resuelve antes de volver a comprobar estado/versión: devuelve el resultado
de aquella operación, no la versión más reciente. No constituye una nueva modificación.
Una revocación confirmada impide recuperar el replay aunque la operación original exista.

La unicidad actividad/periodo evita duplicar reportes también con claves distintas. L3
serializa carreras por instancia; no se afirma equivalencia con una base distribuida.
Reservas, reporte, evento y outcome se revierten juntos si falla cualquier paso. No se
cachean fallos ni hay expiración/limpieza, recuperación distribuida o retención indefinida
garantizada: toda la memoria, incluidas claves, se pierde al reiniciar.

## Validación de transporte y errores

Se conservan IDs de transporte L5 (1–128 caracteres ASCII acotados). Sin query parameters.
JSON UTF-8 no comprimido; content-type application/json, opcional charset=utf-8. Cuerpo
máximo 16384 bytes mediante lectura incremental, sin depender de Content-Length. Se
rechazan tipos, arrays/null como raíz, propiedades desconocidas, versión faltante y PATCH
sin campos editables. narrative hasta 4000 caracteres; period, decimal y versión hasta
128; Idempotency-Key 1–128, alfanumérico inicial y resto alfanumérico/punto/guion/guion
bajo/dos puntos, sin comas ni espacios. Son límites técnicos PoC, no requisitos de Planeación.
Los validadores de dominio existentes siguen verificando representación de periodo/decimal/
versión. No se presume trimestre ni escala oficial. Solo el controlador valida cuerpos;
los comandos del servicio son entradas ya tipadas desde código confiable.

| HTTP | Uso |
|---|---|
| 400 | JSON/campos/ID/clave/versión requerida inválidos |
| 401 | Identidad ausente/inválida; WWW-Authenticate: Bearer |
| 404 | Recurso o relación inexistentes, usuario sin acceso o capacidad insuficiente, respuesta uniforme |
| 409 | Duplicado, versión obsoleta, estado no editable o clave incompatible; mensaje genérico |
| 413 | Cuerpo mayor que 16 KiB, también sin longitud declarada |
| 415 | Tipo de contenido/codificación no admitidos |
| 500 | Error interno/configuración ausente, sin detalles del error original |

Las respuestas reutilizan application/json, no-store y nosniff de L5. Los conflictos se
evalúan después de autorización, sin revelar la existencia o versión de un recurso ajeno.
No se registran JWT, claims, claves de idempotencia, texto del cliente o stack traces.
No hay prueba de tiempo constante, límites de frecuencia ni controles productivos completos.

## Pruebas y resultados

- API: build correcto, incluyendo guard y check:contracts sin Node/DOM para el núcleo.
- Suite completa: **214 aprobadas, 0 fallidas**, incluyendo las 182 previas. Nuevas pruebas
  ejercen HttpRequest y los mismos controladores de Functions, JWT sintéticos firmados,
  L4-A/L4-B y memoria real. Fetch global bloqueado; no se conecta Entra.
- POST/PATCH/GET autorizados, recibo/DTO exactos, autoría y snapshots completos, null/
  omisión/decimal exacto, falta de token, firma/azp inválidos, usuario desconocido, capacidad
  insuficiente, acceso cruzado, IDs inexistentes, poc-blocked y versión obsoleta.
- Creaciones y actualizaciones concurrentes, POST concurrente idempotente, PATCH repetido
  después de otra versión, clave incompatible por contenido/objetivo/decimal/presencia,
  revocación antes de replay, ausencia de duplicación de auditoría, GET sin cambios y
  separación entre instancias. Fallos inyectados después de append o complete demuestran
  rollback de creación/actualización, eventos y reservas, con reintento posterior correcto.
- Validación de tamaño por stream y Content-Length, UTF-8 multibyte, tipos, campos protegidos,
  claves inválidas y errores genéricos. Registro AST conserva L1–L5 y añade solo tres operaciones.
- Nuevas pruebas negativas del guard: el núcleo no importa herramientas concretas, HTTP
  no importa memoria y health no puede activar escrituras. Tipos verifican versión requerida,
  decimal textual y separación de IDs. No se añaden dependencias ni se modifican L2.
- Frontend build correcto; permanece advertencia previa de bundle >500 kB.
- git diff --check, status, stat y archivos sin seguimiento revisados, incluidos espacios
  de archivos nuevos. La suite en proceso se complementó posteriormente con la validación
  operativa sobre Functions/Azurite descrita a continuación; no se confunden ambas evidencias.

## Validación operativa local de L6-B — 19/10/2026

Se comprobó la rama feature/arquitectura-persistencia-pai y HEAD `f287707`, con exactamente
nueve archivos modificados y seis nuevos esperados de L6-B, sin cambios ajenos. Build API
y git diff --check correctos antes del arranque. Azure Functions Core Tools 4.16.0
(runtime 4.1054.250.26428) y Azurite iniciaron correctamente mediante sus lanzadores locales.

El host registró seis operaciones. Antes de enviar peticiones se verificaron listeners
exclusivos en 127.0.0.1:7071 y 127.0.0.1:10000/10001/10002. Se ejecutaron **18 peticiones
HTTP reales**, seis por escenario, sin Authorization ni credenciales reales:

| Operación registrada | JWT estructural válida, ficticia; sin token | JWT incompleta | JSON de configuración inválido |
|---|---|---|---|
| GET /api/poc/health | 200 | 200 | 200 |
| GET /api/poc/fichas/{fichaId} | 401 | 500 genérico | 500 genérico |
| GET /api/poc/fichas/{fichaId}/actividades | 401 | 500 genérico | 500 genérico |
| GET /api/poc/reportes/{reportId} | 401 | 500 genérico | 500 genérico |
| POST /api/poc/actividades/{activityId}/reportes | 401 | 500 genérico | 500 genérico |
| PATCH /api/poc/reportes/{reportId} | 401 | 500 genérico | 500 genérico |

POST y PATCH enviaron cuerpos JSON sintéticos válidos y una Idempotency-Key sintética.
Los IDs de URL no correspondían a datos cargados: no se precargaron fixtures ni se habilitó
una política temporal permisiva. La configuración ficticia se limitó al proceso de prueba;
las variables temporales del lanzador se restauraron. No se contactó con Entra ni servicios
institucionales y no se efectuó ninguna escritura autenticada sobre el host.

Health mantuvo su JSON estático; los errores protegidos observados fueron:

```json
{"error":{"code":"UNAUTHENTICATED","message":"Autenticación requerida."}}
```

```json
{"error":{"code":"INTERNAL_ERROR","message":"No fue posible procesar la solicitud."}}
```

Los 401 incluyeron WWW-Authenticate: Bearer. No se observó divulgación de información
sensible en respuestas: tampoco se expuso el marcador sintético de configuración en los
logs revisados. Los cuatro stderr quedaron vacíos y no se detectaron errores de arranque
o almacenamiento. Estas afirmaciones se limitan a la ventana y casos observados.

Evidencias locales en `api/.test-tmp/l6b-http-operational-20261019/`, ignorado por Git:
http-valid-results.json, http-incomplete-results.json, http-invalid-results.json,
host-valid/incomplete/invalid.stdout.log, storage.stdout.log y stderr asociados.
No se incorporan esos logs al contenido versionado.

Se detuvieron Functions y Azurite, confirmando **cero listeners** en 7071/10000/10001/10002.
Las huellas SHA-256 de los 15 archivos y el estado Git permanecieron idénticos tras la
prueba operativa. Este cierre documental cambia únicamente este archivo y el maestro;
no vuelve a ejecutar la suite ni el host y conserva los demás cambios L6-B.

## Límites y siguiente revisión

L6-B queda completada en alcance técnico local, pendiente de commit autorizado. No hay tokens reales,
datos institucionales, SQL, Graph, SharePoint, recursos ni despliegue. El host permanece
vacío y con política temporal bloqueada; sin configuración JWT válida responde 500 genérico
y no afecta health. Los éxitos de escritura se validan únicamente mediante DI en pruebas.
Las reglas definitivas de vigencia, roles, evidencias, estados y cálculos siguen pendientes.
Los estados poc-draft/poc-blocked y la restricción de edición son solo técnicos de PoC.
La memoria es efímera y la política temporal sigue bloqueada. No se probaron por HTTP
peticiones exitosas con JWT válidos y persistencia operativa; los casos exitosos se
demuestran mediante controladores y DI en las 214 pruebas automatizadas. Los flujos
institucionales de aprobación, devolución, cierre y reapertura requieren definiciones
de Planeación y no están implementados. El cierre local no resuelve esas limitaciones.
No se modifica React/MSAL ni se avanza a L7; no se realiza commit/push/PR/merge.
