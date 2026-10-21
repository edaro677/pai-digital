# L8-C1 — Codecs y sesión transaccional SQL

Corte: 21/10/2026. Base: `90e160eaa3dcfe0104c402bb00e5558b614ecb8e`, rama
`feature/arquitectura-persistencia-pai`. Corte inicial conservado. Auditoría R1 y
correcciones incorporadas; commit de cierre autorizado, sujeto a validación final.

## Fuentes y alcance

Se inspeccionaron los siete repositorios L2, TransactionContext/UnitOfWork,
MemoryUnitOfWork/MemorySession y validadores de memoria, tipos y entidades del dominio,
la migración inmutable `migrations/0001_initial/up.sql`, el diagnóstico L8-B y el maestro.
No se encontró un archivo de informe L8-A en api/ o docs/; no se inventa su contenido.
El código y la migración son las fuentes de verdad. No se detectó una incompatibilidad
que requiera cambiar esos contratos o el esquema. No se implementan repositorios SQL,
UnitOfWork SQL, binding ODBC, configuración de conexión ni integración HTTP.

## Conversiones

`src/infrastructure/sql/codecs.ts` admite unknown al leer y valida también al escribir.
No se usa coerción genérica por String, Boolean o Number. Fallos: SQL_CODEC_INVALID,
sin valor original, mensaje del parser, causa ni propiedad stack.

| Codec | Propiedad/columna confirmada | Conversión y validación |
| --- | --- | --- |
| identifier(kind) | IDs y FK varchar(64) | Validador L2; ASCII, 1–64, sin truncar o alterar caso |
| guid(kind) | TenantId/DirectoryObjectId uniqueidentifier | Escritura GUID canónico minúsculo no nulo; lectura admite mayúsculas del proveedor y devuelve la forma canónica. No es normalización de IDs varchar |
| unicodeText | Alias, Label, CycleLabel, Description, Narrative nvarchar(max) | Exige string y conserva UTF-16 tal cual; no agrega restricciones al texto libre L2 |
| period | Reports.PeriodKey nvarchar(128) | 1–128 unidades UTF-16, bien formado y restricciones L2, sin normalizar |
| correlation/idempotency/fingerprint | CorrelationId/IdempotencyKey/RequestFingerprint | Validadores L2, longitudes y alfabetos exactos |
| decimal | Reports.QuantityText varchar(max) | Gramática DecimalText y texto exacto, incluidos signo y ceros; nunca Number ni decimal(p,s) |
| instant | ValidFrom/Until, Created/Updated/Occurred/CompletedAt datetime2(3) | ISO UTC canónico del dominio ↔ Date independiente. Años 0001–9999, milisegundos y verificación de fechas reales |
| bit | Enabled bit | Solo boolean; 0/1 y cadenas se rechazan, no se interpretan como booleanos |
| nullable(codec) | Columnas expresamente NULL | null se conserva. undefined indica ausencia, no NULL; se rechaza |
| capability/reportState/operation/idempotencyState/auditAction | Columnas técnicas varchar(40) | Solo las enumeraciones ya presentes en L2 y CHECK SQL |
| rowversion | RV, siete tablas | Ocho bytes originales ↔ Version `rv1:` y 16 hex minúsculos; sin interpretación numérica ni inversión de bytes |
| historicalVersion | Version en snapshots JSON | Token opaco L2, incluidos tokens históricos de memoria; no se exige prefijo RV |
| insertionOrder | Activities/AccessAssignments.InsertionOrder bigint | Texto decimal del proveedor ↔ bigint positivo hasta 9223372036854775807; rechaza number |
| report/user/assignmentSnapshot | AuditEvents.BeforeJson/AfterJson; IdempotencyRecords.OutcomeReportJson | JSON objeto con propiedades exactas y tipos completos de Report/InstitutionalUser/AccessAssignment. Rechaza campos adicionales, ausentes, accesores y claves duplicadas, incluso escapadas |

La selección del snapshot según AuditChange.action, before=null y la coherencia de
OutcomeReportId/OutcomeAuditEventId son responsabilidades de los futuros repositorios,
no reglas nuevas del codec. La migración no se altera. SQL guarda OutcomeReportJson
como Report histórico, no como objeto contenedor ReportOperationOutcome.

La omisión de una propiedad PATCH sigue siendo responsabilidad HTTP/aplicación; el codec
nullable no transforma ausencia en null. No se añade un codec de objeto genérico ni un
mapper completo de filas. Los snapshots se reconstruyen sin pérdida semántica; no se
promete conservar espacios, escapes o el orden textual original del JSON.

Requisito del futuro binding: useUTC=true para datetime2(3), RV como Buffer/Uint8Array,
bit como boolean y bigint como texto exacto. Si el proveedor devuelve otra forma debe
corregirse el binding explícitamente; no convertir de forma permisiva. El uso de Date
no permite recuperar precisión SQL superior a milisegundos: la columna actual es (3).
Estos formatos del futuro binding no se han validado contra SQL en L8-C1.

## Sesión

`SqlTransport.connect()` entrega una conexión de uso exclusivo, cuyo begin(SERIALIZABLE)
entrega la misma transacción para todas las consultas. El transporte debe proporcionar
leases independientes, ejecutar parámetros tipados y cerrar/descartar una conexión
incierta; no devolverla silenciosamente al pool. Los puertos se definen en session.ts,
sin dependencias de mssql/msnodesqlv8. No conectan por sí solos con ningún servidor.

`SqlSessionRunner.run('commit' | 'rollback', work)` exige finalización explícita:

1. Bloquear anidación en el contexto asíncrono, incluso entre instancias.
2. Conectar e iniciar una transacción serializable.
3. Entregar al callback una fachada congelada con únicamente execute(statement),
   sin referencias al estado, finish, commit/rollback o controlador. El estado privado
   y los errores retenidos no comparten objetos mutables con el callback.
4. Rechazar consultas concurrentes en una sesión; el rechazo impide confirmar aunque
   se capture. Las consultas secuenciales comparten el mismo objeto transacción.
5. Al terminar el callback, cerrar la admisión. Una consulta aún en curso marca
   SQL_SESSION_PENDING; se espera su finalización antes de rollback y cierre.
6. Confirmar solo con modo commit explícito, sin error ni consultas pendientes;
   de lo contrario intentar rollback. Ante un commit fallido, intentar rollback sin
   volver a confirmar ni ejecutar nuevamente el callback.
7. Intentar siempre close si se obtuvo conexión. Conservar el primer fallo principal
   aunque fallen rollback/cierre. Una sesión expirada nunca inicia nuevo I/O.

Los inputs y resultados se copian defensivamente. Los rechazos omitidos de execute
se manejan internamente sin ocultar la promesa rechazada al consumidor. El llamador
debe esperar o manejar la promesa de run; no se suprimen fallos de invocaciones run
que el llamador abandone. Una tarea diferida puede
seguir existiendo fuera de la sesión, pero no puede usarla ni abrir una transacción
anidada desde su contexto heredado después del cierre.

Los errores del transporte se sustituyen por categorías fijas por operación, sin copiar
excepciones. Los errores de dominio conocidos del callback conservan tipo/código,
reconstruidos con mensajes controlados, sin stack ni detalles originales. Los demás fallos del
callback se convierten en SQL_WORK_FAILED. No se traducen errores numéricos SQL a
NotFound/Duplicate/VersionConflict: esa clasificación necesita los futuros repositorios.

## Fronteras y límites

Se admiten solo tres nuevas fuentes SQL. La comprobación de fronteras rechaza importarlas
desde HTTP, composición, memoria u otras capas, así como dependencias SQL hacia Entra,
Azure Functions o módulos de ejecución. Solo session.ts puede usar node:async_hooks.
La publicación sigue completamente excluida por .funcignore. No cambian L2, memoria,
MSAL, HTTP, seis endpoints, paquetes ni migraciones. No se instalan dependencias.

No hay reintentos automáticos, cancelación de SQL ni timeout artificial en esta capa.
Un transporte que no resuelva nunca bloquearía el drenaje: el binding posterior debe
imponer tiempos de I/O, permitir cancelación segura y demostrar cierre físico. Un fallo
de close se reporta; no demuestra que el recurso se liberó. Si begin falla después de
abrir una transacción en el servidor, el transporte debe descartar la conexión incierta.

Un fallo de commit puede tener resultado ambiguo en un motor real; intentar rollback no
prueba que un commit no haya ocurrido. Tampoco puede deshacerse un commit ya confirmado
si luego falla close. R1 publica SQL_COMMIT_OUTCOME_UNKNOWN y transactionOutcome=unknown
si falla la confirmación, incluso cuando el rollback posterior no devuelve error. Si
commit respondió correctamente y solo falla close, publica SQL_CLOSE_FAILED con
transactionOutcome=committed. No se declara una escritura parcial ni se reintenta a ciegas:
las pruebas del adaptador y la idempotencia deberán tratar esta incertidumbre.

La identidad administrativa de L8-B no se utilizará para escrituras funcionales. En esta
fase todos los commits, rollbacks y fallos de sesión se ejercitan solo con dobles. No se
realiza integración SQL real, no se modifican datos/configuración, ni se ejecutan DDL o
migraciones. La intermitencia previa sigue pendiente; no se revalida ni se da por resuelta.

## Siguiente incremento propuesto

L8-C2: implementar y probar el binding del transporte con un lease/conexión real y
parámetros tipados, únicamente lectura y rollback en pai_poc_dev con opt-in. Verificar
Date UTC, bit, bigint y RV reales, drenaje/cancelación, liberación tras fallos e integridad
de historial/datos antes/después. Si reaparece intermitencia, conservar la evidencia
sanitizada y detener la integración. Mantener HTTP en memoria; ninguna escritura o
adaptación de permisos queda autorizada por esta propuesta.


## Validación histórica de L8-C1 antes de R1

- Pruebas dirigidas: 62 aprobadas (14 codecs, 21 sesión y 27 fronteras, incluidas
  las 22 fronteras preexistentes).
- Suite ordinaria completa: 338 aprobadas, cero fallidas/omitidas; conserva 298 previas
  y añade 40: 14 codecs, 21 sesión y cinco fronteras. Mantiene las 23 de privacidad/
  trazabilidad L8-B y health con carga nativa bloqueada.
- npm run build en api/ y el pretest: TypeScript, contratos y fronteras correctos.
- npm run build en la raíz: correcto, con aviso previo de bundle mayor de 500 kB.
- No se ejecuta test:sql, no se importa el binding nativo nuevo ni se abre una conexión
  SQL real para estas pruebas. Ningún commit transaccional se envía a un servidor.
- git diff --check y revisión adicional de whitespace en archivos nuevos. Git conserva
  únicamente nueve archivos del incremento (seis nuevos y tres modificados), sin staging
  ni commit. La documentación maestra registra este corte y los límites de la evidencia.


## Auditoría L8-C1-R1

Revisión exclusivamente local, sin SQL real, sobre el mismo HEAD base. Defectos
reproducidos mediante código y dobles, corregidos sin cambiar contratos L2 o migraciones:

| Hallazgo | Evidencia anterior | Corrección |
| --- | --- | --- |
| Alto: encapsulación insuficiente en runtime | Las propiedades TypeScript private eran visibles desde JS; borrar scope.failure tras una consulta fallida permitía commit. finish también era accesible y reemplazable | Fachada congelada limitada a execute; estado/transacción con campos privados JS; finalización solo interna |
| Alto: error principal mutable compartido | Cambiar code/message del error capturado modificaba el error retenido y su salida posterior | Copias independientes para el fallo interno y el error entregado; sanitización final |
| Medio: rowversion dependía de propiedades sobrescribibles | Ocho bytes con iterador modificado producían rv1:ff; un byte con byteLength aparente de ocho se aceptaba | Iteración intrínseca sobre bytes reales y comprobación de ocho elementos |
| Medio: Date no validaba exclusivamente su valor interno | Invalid Date con getTime/toISOString sobrescritos se aceptaba | Métodos intrínsecos Date.prototype para lectura UTC y validación |
| Integridad de snapshot | Un Proxy podía cambiar un campo entre inspección de descriptores y lectura posterior | Construcción desde los valores de los descriptores ya validados |
| Semántica de commit ambiguo | La categoría genérica previa de commit no expresaba la incertidumbre documentada | Categoría SQL_COMMIT_OUTCOME_UNKNOWN y resultado unknown; close tras commit confirmado conserva committed |
| Privacidad de errores | Se conservaba una propiedad stack de texto fijo y la clasificación de errores hostiles podía lanzar al inspeccionarlos | Se elimina stack; inspección protegida y categorías controladas, sin copiar mensajes |

Las nuevas pruebas de regresión verifican estos casos con datos exclusivamente sintéticos,
incluido un doble que aplica commit y luego pierde su respuesta. Que rollback posterior
resuelva no demuestra reversión de ese commit. Se conservan las pruebas de precisión,
Unicode, JSON duplicado/escapado, versiones históricas, consultas sin await, drenaje,
concurrencia, anidación, errores capturados y continuidad después del cierre.

Los límites del transporte real permanecen: I/O que no termina, cancelación, leases
exclusivos, descarte de conexiones inciertas, cierre físico y estado de commit requieren
validación posterior. El conjunto de pruebas no equivale a una prueba contra SQL Server.
No se modifica la identidad administrativa ni se habilitan escrituras con sysadmin.
La próxima fase continúa siendo L8-C2, con autorización independiente.


Resultados finales de R1: 45 pruebas dirigidas aprobadas (18 codecs y 27 sesión),
348 pruebas ordinarias aprobadas, cero fallidas/omitidas. Se conservan las 338 del
corte inicial y se agregan diez regresiones: cuatro codecs y seis sesión. TypeScript,
contratos y fronteras correctos mediante build/pretest. Frontend compilado con el
aviso previo >500 kB. git diff --check y revisión de whitespace de archivos nuevos
sin errores. Ninguna integración SQL real ejecutada. Los nueve archivos se consolidan
mediante el único commit autorizado; el hash final se entrega en el informe Git.
