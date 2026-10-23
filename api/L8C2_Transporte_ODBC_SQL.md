# L8-C2 — Descriptor seguro y transporte ODBC local

**Estado (22/10/2026): L8-C2 APROBADA para PoC local por el usuario. Integración real ExitCode 0, 389,88 ms, snapshots correctos y ocho tablas vacías. CONNECTION_STILL_VISIBLE como advertencia física no bloqueante. L8-D1 en diseño, sin implementar repositorios; sin commit.**
R10-C validó sqlcmd; R8-B se ejecutó y falló en la observación posterior (clase B). Se conserva evidencia
sanitizada del proceso, salida recibida/validada y terminación; límites 5/5/15 intactos.
El conjunto temporal auditado permanece intacto; cualquier nueva ejecución requiere autorización.
L8-C2 aprobada para PoC local; intermitencia histórica sin causa confirmada. Sin commit.

## Antecedente L8-C2-R1 — Descriptor SQL y barrera de enlace segura

Fecha: 21/10/2026. Base c59b3928ab8e977a7668d82626f4063e10cefb7d, rama
feature/arquitectura-persistencia-pai; Git inicialmente limpio. Implementado para
revisión, sin commit. Esta corrección NO implementa todavía el transporte ODBC real.

## Alcance y consumidores

El único consumidor runtime del descriptor es TransactionSession.execute; las pruebas
L8-C1 usan nvarchar sin length. SqlStatement y SqlParameter se definen ahora en
src/infrastructure/sql/parameters.ts y se reexportan desde session.ts para conservar
las importaciones existentes. No cambian los contratos L2 ni las migraciones.

La única modificación de ejecución en session.ts es validar la copia del statement
antes de entregarla al transporte. Se comparó su cuerpo con HEAD: inicio, aislamiento,
commit/rollback, fachada congelada, drenaje, rechazo de concurrencia/anidación,
clasificación del commit y sanitización permanecen idénticos. Si falla la validación,
el transporte no recibe la consulta y se conserva SQL_QUERY_FAILED y el rollback
existentes, aunque el callback capture la excepción. Los validadores independientes
usan SQL_CODEC_INVALID, sin datos, causa, mensaje original o stack.

## Unión discriminada

Todos los descriptores requieren name, type y value. Se rechazan propiedades ajenas,
accesores, metadatos undefined, valores undefined, tipos arbitrarios, combinaciones
incompatibles y nombres duplicados sin distinguir mayúsculas. Los nombres se limitan
al perfil técnico ASCII [A-Za-z_][A-Za-z0-9_]*, hasta 127 caracteres y sin @.

| Tipo | Valor | Metadatos y validación |
| --- | --- | --- |
| nvarchar | string o null | length 1–4000 unidades UTF-16 o max; omisión histórica se resuelve como max; sin truncar/normalizar texto |
| varchar | string ASCII o null | length 1–8000 bytes o max; omisión se resuelve como max. Perfil ASCII técnico para evitar supuestos sobre páginas de códigos; texto no ASCII debe usar nvarchar |
| uniqueidentifier | GUID canónico minúsculo no nulo, o null | Reutiliza el codec de GUID del dominio actual; sin length/scale |
| datetime2 | Date válido UTC o null | scale 0–7, omisión 3 para el perfil local; escala menor de 3 rechazada si redondearía milisegundos. No promete precisión submilisegundo |
| bit | boolean o null | No acepta 0/1 ni cadenas como sustitutos |
| bigint | cadena entera o null | Rango firmado -9223372036854775808 a 9223372036854775807, comprobado con BigInt; sin number ni coerción flotante |
| decimal/numeric | cadena DecimalText o null | precision obligatoria 1–38 y scale obligatoria 0–precision; comprobación de dígitos mediante texto. Nunca trunca, redondea ni elimina ceros |
| binary | Uint8Array/Buffer o null | length 1–8000; omisión histórica resuelta como 8. Exige exactamente length bytes para evitar padding implícito |
| varbinary | Uint8Array/Buffer o null | length obligatoria 1–8000 o max; permite desde cero bytes hasta length. Vacío no es null |

Los defaults descritos son decisiones explícitas del perfil técnico, NO defaults de
T-SQL ni una configuración productiva. No se añaden money, float, int, TVP u otros
tipos sin necesidad. Date y binarios se copian defensivamente. La validación de
nvarchar mantiene las cadenas UTF-16 como L8-C1; no sustituye las validaciones L2
de periodo ni certifica cómo enviará cada cadena un futuro binding ODBC.

## Evidencia del controlador instalado

Inspección de mssql 12.7.10, lib/datatypes.js y lib/msnodesqlv8/request.js,
función castParameter; msnodesqlv8 5.6.0 permanece instalado sin cambios.

- Decimal/Numeric: si recibe string ejecuta parseFloat antes del enlace. La prueba
  aislada de esa función reproduce pérdida con 9007199254740993.123456789.
  No se ha demostrado una ruta directa exacta de enlace decimal/numeric.
- BigInt: su rama conserva cadenas. Que la cadena llegue/retorne íntegra del motor
  sigue pendiente de una prueba ODBC real.
- Binary/VarBinary: null y undefined se sustituyen por EMPTY_BUFFER. La prueba
  reproduce el mismo buffer de longitud cero para null/undefined/vacío; no demuestra
  conservación de SQL NULL ni se presenta como prueba contra SQL Server.
- Un Uint8Array que no es Buffer puede convertirse mediante value.toString() y
  Buffer.from(texto), alterando los bytes. El buffer de ocho bytes se conserva en esa
  función si ya es Buffer. El futuro enlace debe usar una copia Buffer explícita.

Estas pruebas leen y ejecutan exclusivamente la función pura extraída del archivo
instalado, en un contexto VM aislado. No importan mssql ni msnodesqlv8, no cargan el
binding nativo y no abren conexiones SQL. No se modifica node_modules.

## Política exacta y barrera para el futuro transporte

DecimalText permanece como texto exacto; QuantityText continúa siendo varchar(max).
No hay conversión implícita de DecimalText a decimal/numeric. El descriptor puede
representar estos tipos y validar su rango, pero eso NO significa que puedan enlazarse
con seguridad en el controlador actual.

mssqlOdbcBindingIssue devuelve razones técnicas fijas:
EXACT_DECIMAL_BINDING_UNAVAILABLE o BINARY_NULL_BINDING_UNSAFE. La función pura
prepareMssqlOdbcParameters valida primero toda la lista y rechaza decimal/numeric
(incluso null) y binary/varbinary null antes de cualquier Request.input. No modifica
categorías de error ni la sesión; los rechazos son SQL_CODEC_INVALID sin detalles.
Para binarios no nulos prepara una copia Buffer, incluido el buffer vacío varbinary.
Los dobles comprueban que, si la lista contiene un tipo bloqueado, no se enlaza nada.

Todavía no existe transporte real: la barrera es preparación validada para que el
futuro adaptador la invoque obligatoriamente. No se afirma que toda implementación
inyectable de SqlTransport respete una barrera que no invoque.

Alternativa futura decimal: aprobar y probar parámetros textuales con una conversión
SQL explícita y estática a decimal(p,s), sin concatenar valores, o una ruta de binding
exacto demostrada. Debe validarse rango, escala, round-trip, errores y planes de
consulta; no se implementa esa alternativa en R1. Cambiar de controlador requeriría
otra evaluación y autorización. El binario null sigue bloqueado hasta demostrar una
ruta que conserve NULL, sin confundirla con un valor de cero bytes.

## Límites y próximos pasos

Sin SQL real, escrituras, repositorios, cambios de motor/permisos, paquetes nuevos,
HTTP/Functions, MemoryUnitOfWork o migraciones. Se conservan los límites de L8-C1:
leases, timeouts, cancelación, cierre físico y resultados de commit ambiguos no se
validan contra ODBC. La intermitencia de L8-B no está resuelta.

El siguiente incremento debe implementar el transporte aislado con esta barrera,
solo pruebas optativas de lectura/rollback, parámetros tipados admitidos y rechazo
antes de Request.input de las rutas bloqueadas. No usar sysadmin para escrituras
funcionales. No ampliar el ciclo transaccional para acomodar el controlador.

## Referencias de tipos

Se contrastaron los límites con documentación oficial de Microsoft; las restricciones
más conservadoras del perfil y los defaults locales se identifican expresamente arriba:

- [nvarchar](https://learn.microsoft.com/en-us/sql/t-sql/data-types/nchar-and-nvarchar-transact-sql?view=sql-server-ver16).
- [varchar](https://learn.microsoft.com/en-us/sql/t-sql/data-types/char-and-varchar-transact-sql?view=sql-server-ver16).
- [decimal/numeric](https://learn.microsoft.com/en-us/sql/t-sql/data-types/decimal-and-numeric-transact-sql?view=sql-server-ver16).
- [datetime2](https://learn.microsoft.com/en-us/sql/t-sql/data-types/datetime2-transact-sql?view=sql-server-ver16).
- [binary/varbinary](https://learn.microsoft.com/en-us/sql/t-sql/data-types/binary-and-varbinary-transact-sql?view=sql-server-ver16).


## Validación R1

- 50 dirigidas aprobadas: 23 del descriptor y las 27 existentes de sesión.
- Suite API completa: 371 aprobadas, cero fallidas/omitidas; conserva las 348 anteriores.
- TypeScript, contratos y fronteras correctos. La prueba nueva de tipos usa un archivo
  virtual y no emite archivos; comprueba combinaciones rechazadas en compilación.
- Frontend compila con el aviso previo del bundle mayor de 500 kB.
- En desarrollo de las pruebas se corrigió la resolución del host TypeScript virtual
  y se dieron nombres distintos a dos parámetros sintéticos para no confundir una
  prueba de binarios con el rechazo de duplicados. No se retiraron aserciones.
- git diff --check y revisión de whitespace de archivos nuevos; seis archivos del alcance
  pendientes, tres nuevos y tres modificados, sin staging ni commit.
- No se ejecutó integración SQL, no se cargó el binding nativo, no se instaló software,
  no se modificó el controlador ni se realizaron escrituras o cambios del servidor.

## L8-C2-R2 — Transporte implementado y validación detenida

### Diseño y aislamiento

Nuevo `src/infrastructure/sql/odbc.ts`: LocalOdbcTransport implementa los puertos
SqlTransport/SqlConnection/SqlTransaction existentes. No implementa repositorios ni
UnitOfWork y no sustituye MemoryUnitOfWork. No se modifica L2, codecs, errores C1,
migraciones ni el ciclo transaccional C1. Los cambios pendientes R1 se conservan.

La composición local inyecta explícitamente loadDriver. El transporte no importa
mssql/msnodesqlv8; la importación nativa diferida existe exclusivamente en la prueba
optativa. Se conserva la prohibición arquitectónica de importar SQL desde HTTP o
composición Functions. Únicamente se añade odbc.ts a las fuentes permitidas.

Perfil fijo Windows x64/Node 24, Shared Memory PAIPOC, base sintética pai_poc_dev,
Windows integrada, ODBC 17, un pool de máximo una conexión por lease. Se rechazan
indicadores Azure y NODE_ENV=production; no se aceptan DSN, credenciales ni cadenas
heredadas. Los timeouts de conexión, solicitud y adquisición permanecen en 10000 ms.
No hay reintentos automáticos ni fallback a memoria. La identidad administrativa
actual solo es diagnóstica: no autoriza futuras escrituras funcionales.

Toda consulta del transporte valida SqlStatement, prepara la lista completa mediante
prepareMssqlOdbcParameters y resuelve tipos explícitos antes de crear Request/input.
Decimal/numeric, binarios null, undefined y metadatos inválidos no llegan al driver.
No se interpola ningún valor en SQL. No se afirma todavía que varbinary vacío sea
seguro contra el motor: la comprobación real de null/vacío falló.

El puerto conserva SERIALIZABLE, commit/rollback y cierre; los commits solo se
ejercitan con dobles. Errores nuevos se reconstruyen con categorías C1 controladas,
sin mensaje original, stack o causa. La traza es opcional y apagada por defecto:
etapa fija, duración, ok/failed, categoría, código técnico en lista permitida y dos
booleanos de estado. El estado de transporte es seguimiento local, no prueba de
resultado de un commit ambiguo. Un observador fallido no reemplaza el resultado I/O.

### Pruebas y ejecución

- Nuevos `tests/sql-odbc.test.mjs`: 28 pruebas con dobles; configuración fija, carga
  diferida, tipos, barrera total antes de input, rechazo decimal/binario null, errores,
  rollback, cierre, conservación del principal, commit ambiguo y privacidad.
- 96 dirigidas de codecs, sesión, parámetros y transporte aprobadas.
- Suite API: 399 aprobadas, cero fallidas/omitidas (371 R1 + 28 nuevas).
- TypeScript, contratos y fronteras correctos; frontend compila con aviso previo
  del bundle mayor de 500 kB. Health y módulo SQL cargan con process.dlopen bloqueado.
- Nueva integración optativa `tests/integration/sql-transport.test.mjs`, omitida
  por defecto; el test usa exclusivamente SELECT, BEGIN/SERIALIZABLE y ROLLBACK.
  No se ejecuta commit, DML, DDL ni scripts de migración.

Comando local, después de `npm run build` en api:

```powershell
$env:PAI_SQL_TRANSPORT_INTEGRATION='1'
try { node --test tests/integration/sql-transport.test.mjs }
finally { Remove-Item Env:PAI_SQL_TRANSPORT_INTEGRATION -ErrorAction SilentlyContinue }
```

No ejecutar nuevamente para intentar obtener un resultado aprobado sin revisar
primero los fallos descritos abajo. No forma parte de npm test ni de test:sql L8-B.

### Evidencia real y bloqueo

Durante la preparación se corrigieron dos defectos del ejecutor de prueba:
combinación incompatible sqlcmd -h/-y 0 y tratamiento de un JSON anidado como cadena.
No eran fallos de ODBC. La primera ejecución del transporte realizó ambas consultas
y rollback, pero devolvió SQL_WORK_FAILED y fallo de cierre. Se añadió identificación
sanitizada de la comprobación fallida y se ejecutó un diagnóstico controlado, sin
reintentos automáticos ni aumento de timeouts. No se repitió tras localizar null/vacío.

Última ejecución instrumentada (milisegundos aproximados):

| Etapa | Duración | Resultado |
| --- | ---: | --- |
| LOAD | 34.44 | ok |
| CONNECT | 22.67 | ok |
| BEGIN | 4.67 | ok |
| QUERY estado | 7.83 | ok |
| QUERY parámetros | 3.32 | ok |
| ROLLBACK | 0.61 | ok |
| CLOSE | 2.57 | failed, SQL_CLOSE_FAILED |

El error principal fue SQL_CODEC_INVALID en la comprobación técnica `null-empty`.
Esta comprobación agrupa varbinary de cero bytes y nvarchar null; la evidencia
disponible no identifica cuál de las dos condiciones falló. No se publicaron filas
ni valores originales para diagnosticarlo. Debe aislarse con booleanos separados,
sin modificar codecs o semántica para que una conversión incorrecta pase la prueba.

Antes de ese punto se verificó el contenido exacto de nvarchar, GUID, Date UTC con
milisegundos, bit booleano, bigint string en el máximo firmado y binarios de ocho
bytes. Se observó @@DBTS como bytes, pero su comprobación de codec queda pendiente
porque el test se detuvo antes. @@DBTS no es una fila persistida: con tablas vacías
no se ha probado un rowversion de una entidad real.

El observador de cierre de la prueba comprueba pool sin préstamos/pendientes y
estado 0/0 en la misma sesión después del rollback, y siempre intenta el cierre
físico en finally. Alguna comprobación falló y se sanitizó como SQL_CLOSE_FAILED;
no se conoce todavía cuál. No afirmar normalización transaccional demostrada ni
atribuirlo directamente al cierre nativo. La traza connected=true refleja que el
wrapper no confirmó éxito; no es prueba de que persistiera una conexión física.

Consulta independiente final, exclusivamente de lectura: base ONLINE, ocho tablas,
cero registros funcionales, cero sesiones con APP PAI-L8C2-Transport, historial con
hashes originales y CatalogSha256 esperado intactos. No quedaron sesiones residuales.
La comparación integral antes/después prevista en la prueba no se alcanzó.

No hubo timeout en estas ejecuciones ni evidencia nueva que confirme/resuelva la
intermitencia previa. No se modificó servidor, protocolos, usuarios, permisos,
paquetes, frontend ni HTTP. No se hizo commit.

### Decisión pendiente

**REQUIERE CORRECCIONES / diagnóstico acotado antes de cerrar L8-C2.** Aislar
null/vacío y la comprobación de cierre con indicadores técnicos permitidos. Si la
corrección requiere cambiar C1 o esquema, solicitar autorización antes de aplicarla.
No aceptar vacío y null como equivalentes ni debilitar las aserciones. El adaptador
es únicamente una implementación pendiente de validación, sin habilitación operativa.

## L8-C2-R3/R4 — Hallazgos aislados y correcciones pendientes de integración

R3 identificó por separado que Buffer de cero bytes llega al enlace, pero SQL recibe
NULL; nvarchar null, cadena vacía y binarios no vacíos se conservan. La aserción
row.emptyValue.length fallaba porque el valor devuelto era null. No se atribuye la
pérdida a los codecs: se observó null antes de la copia del transporte.

El observador original evaluaba XACT_STATE dentro del SELECT y obtenía 1, mientras
@@TRANCOUNT era 0. R3 reprodujo en la misma sesión la captura previa 0/0 con DECLARE,
frente al estado 1 evaluado dentro del SELECT. El cierre nativo se resolvía y no
quedaban sesiones residuales. La aserción del observador relanzada después del cierre
se clasificaba como SQL_CLOSE_FAILED, sin demostrar un fallo del cierre físico.

R4 incorpora únicamente estas correcciones y sus pruebas:

- parameters.ts: EMPTY_BINARY_BINDING_UNSAFE para vacío varbinary; binary vacío ya
  infringe su longitud fija. Ambos se rechazan antes de Request/input, sin convertir
  valores, alterar el descriptor general o mutar el Buffer original. Se conservan
  rechazo de binarios null y enlace exacto de tres y ocho bytes.
- Integración: captura previa de @@TRANCOUNT/XACT_STATE con variables; observación,
  error de observación y cierre nativo separados. No hay aserciones del observador
  dentro de close; se evalúan después de confirmar la limpieza. Error de observación
  no se reclasifica como error nativo de cierre.
- Pruebas: 124 dirigidas incluyendo privacidad y 404 API completas aprobadas
  (399 previas + cinco nuevas); TypeScript, contratos y fronteras correctos.
  Frontend compila con aviso previo >500 kB; integración omitida por defecto.
- Ejecución R4: integración fallida a los 15016.2791 ms en snapshot inicial sqlcmd,
  categoría pública SQL_QUERY_FAILED. El transporte Node no se cargó, por lo que
  R4 no demostró el nuevo observador, cierre físico o integridad final de la base.
  Se detuvo sin reintento, aumento de timeouts ni commit; sin procesos sqlcmd al final.
- No cambian codecs, ciclo de sesión C1, L2, migraciones, SQL Server, dependencias,
  HTTP o MemoryUnitOfWork. La intermitencia histórica continúa sin causa confirmada.

### R5 — Inspección inicial del fallo sqlcmd

La comprobación original usa SQLCMD.EXE de ODBC 170 con estos argumentos, sin secretos:

```text
-S lpc:.\PAIPOC -E -d pai_poc_dev -l 5 -t 5 -b -y 0 -w 65535 -Q <snapshotSql>
```

snapshotSql es el SELECT de disponibilidad, catálogo, ocho recuentos funcionales,
sesiones y fila original de SchemaMigrations definido en tests/integration/sql-transport.test.mjs.
Conexión (-l): 5 s; consulta (-t): 5 s; execFileSync: 15000 ms;
test Node: 60000 ms. El catch original reconstruye SQL_QUERY_FAILED y no conserva
code/status/signal ni el punto de conexión alcanzado. El runner Node terminó con
código 1, pero eso no identifica el código de salida de sqlcmd. No se puede recuperar
retroactivamente su código técnico ni confirmar el timeout interno responsable.
La duración coincide con el watchdog externo de 15 s, sin constituir por sí sola
prueba concluyente de su activación ni de una causa SQL concreta.

Inicio R5: rama/HEAD esperados, nueve archivos pendientes sin staging, cero procesos
sqlcmd y servicio MSSQL$PAIPOC Running. Comprobaciones SQL de R5 todavía pendientes
al registrar este corte. No se modifica producción ni se repite la integración R4.

## L8-C2-R6/R7 — Sesión residual: evidencia y límites de atribución

### Resultado real R6

R6 corrigió solo el alias del diagnóstico temporal de R5; ocho recuentos individuales
cero (65.54 ms), integridad original correcta (83.83 ms) y sesiones/solicitudes/locks
sin incidencias (69.12 ms). Las 31 pruebas dirigidas del transporte pasaron. La suite
completa de 404 corresponde a R4; no se presenta como nueva ejecución en R6/R7.

La única integración real R6 terminó con ERR_ASSERTION, a los 257.2994 ms. Pasaron
Shared Memory, SERIALIZABLE, consultas parametrizadas, GUID, UTC, bigint exacto,
texto NULL/cadena vacía, binarios no vacíos y comprobación del codec de @@DBTS.
@@DBTS no sustituye una prueba con rowversion de una entidad persistida.
Se rechazaron binary/varbinary vacíos antes de input/query, con rollback y cierre
confirmados también en esas dos sesiones de rechazo. El rechazo de binarios NULL
se verificó con dobles, no con un caso SQL adicional. El observador posterior al
rollback capturó 0/0 en la misma sesión; nativeCloseResolved, connected=false y
pool=null pasaron. Falló únicamente snapshot final: sessions=1 frente al inicial 0;
ONLINE, ocho tablas vacías e historial coincidían. No se repitió la integración.

### Criterio exacto y momento

En tests/integration/sql-transport.test.mjs:18 se utiliza:

```sql
SELECT COUNT(*) FROM sys.dm_exec_sessions
WHERE program_name=N'PAI-L8C2-Transport';
```

snapshot se ejecuta mediante un proceso sqlcmd independiente, autenticación Windows,
Shared Memory y base pai_poc_dev. El filtro no limita host, login, base, proceso,
session_id, connection_id, estado, transacción o ejecución particular. Abrir la
consulta en pai_poc_dev NO limita sys.dm_exec_sessions a esa base. No excluye @@SPID
explícitamente: solo excluye de hecho a un observador cuyo program_name sea SQLCMD.
También puede contar cualquier proceso que reutilice la etiqueta fija del transporte.

El snapshot final (línea 153) sucede después de las comprobaciones de cierre del
pool principal y los dos pools usados para rechazar vacíos. No distingue cuál lease
habría originado el recuento. R6 no retuvo session_id, login_time o connection_id de
la sesión residual; el recuento 1 no permite atribución retrospectiva por sí solo.

### R7: dos observaciones, sin repetir integración

Se consultaron sys.dm_exec_sessions, sys.dm_exec_connections, sys.dm_exec_requests,
sys.dm_tran_session_transactions y sys.dm_tran_active_transactions. Selección acotada
a sesiones de usuario con etiqueta del transporte, SQLCMD o @@SPID; máximo 32 filas.
La consulta proyecta estados, tiempos, proceso técnico, solicitudes, transacciones,
bloqueos y conexión. host_name se compara solo en memoria con el del observador;
no se registran host/login/cuentas. connection_id se publica como token SHA-256
abreviado para comparar, no como una identidad personal. Las horas siguientes son
las reportadas por SQL Server, sin afirmar zona horaria.

| Observación | Duración | Sesiones etiqueta transporte | Sesión visible | Login | Token conexión |
| --- | ---: | ---: | --- | --- | --- |
| Inicial | 86.61 ms | 0 | SPID 64, SQLCMD, observador | 2026-10-21T16:42:05.687 | 9522842445083e70 |
| Única posterior | 39.41 ms | 0 | SPID 64, SQLCMD, observador | 2026-10-21T16:42:05.767 | 1fea43c9cbe25599 |

Cada observador estaba running, con una solicitud propia de lectura, Shared Memory,
misma máquina que su propio observador y base objetivo. Inicio y fin de última
solicitud reportados coincidían con el login en cada muestra. Ambos tenían cero
transacciones abiertas, cero transacciones de usuario activas/asociadas, cero
solicitudes bloqueadas y cero solicitudes en espera. No se halló otra sesión relevante.

El SPID 64 se reutilizó entre conexiones distintas: login, proceso cliente y token
físico diferentes. Por eso comparar solo session_id sería insuficiente. No hubo
esperas artificiales, sondeo, reintentos ni intervención sobre las sesiones.

**Atribución:** los registros actuales son B, observadores SQL. La sesión histórica
contada en R6 queda D, no atribuible con la evidencia conservada. Actualmente no hay
ninguna coincidencia con el filtro original; no puede determinarse el instante de
desaparición de la coincidencia anterior ni probar que el observador causara el
recuento R6. Tampoco hay evidencia suficiente para declarar una fuga, pooling,
retardo de cierre o concurrencia como causa confirmada. Cierre del pool informado
por el cliente y visibilidad DMV son evidencias distintas en momentos distintos.

### Integridad y recomendación

Lectura independiente de integridad R7 (86.44 ms): pai_poc_dev ONLINE; las ocho tablas
InstitutionalUsers, Dependencies, Fichas, AccessAssignments, Activities, Reports,
AuditEvents e IdempotencyRecords tienen cero filas; existe una única 0001_initial y
sus tres hashes y CatalogSha256 registrados coinciden con los valores originales.
No se ejecutó verify ni se recalculó la serialización completa de la huella actual:
la afirmación anterior corresponde al valor registrado en el historial. Sin sqlcmd
residual al finalizar. No se ejecutaron DML/DDL, migraciones, KILL o mantenimiento.

Antes de cambiar el criterio de aprobación, se recomienda una instrumentación mínima
futura de la prueba: retener identidades técnicas de las conexiones de cada lease
(session_id + login_time + connection_id), registrar @@SPID del observador y devolver
un detalle sanitizado cuando haya coincidencias. Correlacionar con esas identidades;
no sustituir cero por un umbral permisivo ni resolverlo con sleeps/reintentos.
Excluir @@SPID es una mejora defensiva, pero los observadores R7 ya estaban excluidos
por su etiqueta SQLCMD; no se demuestra que esa exclusión arregle el fallo R6.
No se implementa ahora ninguna modificación de pruebas o producción.

L8-C2 sigue abierta, sin commit. La intermitencia histórica continúa sin causa
confirmada. R7 no ejecutó la integración R4 ni la suite completa y no habilita SQL
en HTTP. Se actualizan exclusivamente este documento y el maestro de continuidad.

## L8-C2-R8-A — Instrumentación de conexiones (22/10/2026)

### Alcance implementado

Exclusivamente pruebas y documentación. No se modifica odbc.ts, parameters.ts,
codecs.ts, errors.ts, sesión C1, L2, migraciones, paquetes, composición ni HTTP.
No hay cambios del contrato de sesión ni del transporte de producción. La prueba
opcional sigue exigiendo PAI_SQL_TRANSPORT_INTEGRATION=1 y no se ejecutó en R8-A.

Nuevos tests/helpers/sql-connection-observer.mjs y sql-connection-observer.test.mjs.
La integración existente usa instrumentLease para sus tres pools: lectura normal y
dos rechazos de binarios vacíos. Se mantiene el aislamiento SERIALIZABLE, orden
begin/callback/rollback/close, timeouts y ausencia de reintentos. Instrumentar añade
lecturas diagnósticas acotadas; no sleeps, escrituras, commits reales o nuevos pools
persistentes. El helper no importa el módulo nativo: solo recibe el driver de la
composición optativa, o dobles en la suite ordinaria.

### Captura sobre el lease real

La subclase de Transaction de la prueba delega begin al controlador y lee después
con Request(transaction), sobre la misma transacción reservada, antes del callback.
No intenta identificarla mediante una conexión independiente. Se conserva por lease:

- sessionId: identificador de sesión, insuficiente por sí solo ante reutilización.
- loginTime: representación textual de s.login_time, conservada sin conversión UTC.
- connectionId: GUID completo en memoria cuando la DMV permite identificar una única
  conexión primaria; se usa parent_connection_id IS NULL para no escoger un hijo MARS.
- stage BEGIN/BEFORE_CLOSE/OBSERVER/POST_CLOSE; estado conectado, estado de sesión,
  solicitudes activas, transacciones de usuario, bloqueos/esperas y observedAtUtc
  obtenido en SQL mediante SYSUTCDATETIME. No se inventan timestamps en el cliente.
- transactionCount/transactionState propios capturados con DECLARE antes del SELECT.
  XACT_STATE de otra sesión no es accesible por esa función: POST_CLOSE lo deja null
  y usa open_transaction_count y asociaciones de transacción de la sesión objetivo.

Antes del cierre se amplía la lectura que ya existía en el mismo pool de máximo una
conexión; debe coincidir exactamente con la identidad BEGIN. Si la conexión fue
sustituida, no se acepta como si fuera la original. La observación fallida se retiene
por separado y el cierre nativo siempre se intenta en finally; las aserciones se
realizan después. Que el observador no obtenga información no equivale a conexión
cerrada, y close resuelto no equivale a ausencia en DMV.

Las propiedades de sesión/conexión vienen de DMV, no del nombre de programa. Si
faltan loginTime o connectionId se conserva null y se informa CONNECTION_UNIDENTIFIABLE;
no se crea una identidad de sustitución ni se amplía el filtro. Cero filas, más de
una conexión primaria o datos no válidos tampoco permiten una identidad inequívoca.
La posibilidad real de leer estos campos y la serialización exacta de fechas siguen
pendientes del motor/ODBC. La instrumentación no cubre conexiones de prueba internas
que el controlador pudiera crear/cerrar durante pool.connect antes de reservar la
transacción; no atribuye a un lease una conexión que no haya capturado.

### Correlación exacta posterior

Se elimina del snapshot de integridad el contador por program_name. La prueba abre
un observador independiente de vida corta con la misma configuración local y los
mismos timeouts, etiqueta diagnóstica de observador y cierre garantizado en finally.
No es la fuente de las identidades del transporte. Por cada identidad capturada se
prepara exclusivamente esta condición, con parámetros tipados mediante barrera R1/R4:

```sql
WHERE s.session_id<>@@SPID AND s.session_id=@sid
  AND CONVERT(varchar(33),s.login_time,126) COLLATE Latin1_General_100_BIN2
      =@loginTime COLLATE Latin1_General_100_BIN2
  AND c.connection_id=@connectionId
```

SID usa bigint textual; loginTime usa nvarchar(33) y la misma representación SQL de
captura; connectionId usa uniqueidentifier. No se interpolan valores ni se utiliza
program_name, host o login como fallback. Una comprobación defensiva en memoria
aplica la misma identidad compuesta y excluye al observador. Las capturas de los
tres leases deben ser completas antes de abrir el observador. No existe sondeo o
reintento: una consulta acotada por lease. Ante una transacción abierta correlacionada
se dejan de consultar los leases restantes y se cierra el observador sin intervenir.

Resultados separados: OBSERVATION_FAILED, CONNECTION_UNIDENTIFIABLE,
CONNECTION_STILL_VISIBLE, TRANSACTION_OPEN y NATIVE_CLOSE_FAILED. Sleeping/visible
con cero transacciones no se confunde con una transacción abierta, pero sigue
produciendo fallo CONNECTION_STILL_VISIBLE: no se relaja el criterio de ausencia.
Un error de observación y un fallo secundario de limpieza se conservan por separado.

### Privacidad y evidencia

El resultado imprime solo una proyección positiva: SID, loginTime técnico, huella
SHA-256 abreviada de connectionId, etapa, observedAtUtc, estado, contadores y resultado
del cierre nativo por lease. El GUID completo se usa únicamente en memoria para
comparación/parametrización. No se imprimen login_name, host, credenciales, cadenas
completas, SQL, errores originales ni stacks. Errores públicos solo contienen
categorías controladas, sin identificadores completos. Ante un residual se conserva
su identidad correlacionada y su estado, junto al resultado de close.

### Pruebas R8-A y límites pendientes

- 25 nuevas pruebas con dobles: identidad completa/opcional, coincidencia exacta,
  SPID reutilizado con distinto login o GUID, observador excluido, falso positivo por
  programa, parámetros tipados, residual inactivo frente a transacción, privacidad,
  limpieza en fallos de captura/consulta/conexión/cierre y fallos secundarios.
- 149 dirigidas y 429 API completas aprobadas (404 anteriores + 25), sin fallidas u
  omitidas. TypeScript, contratos y fronteras correctos; frontend compila con aviso
  previo >500 kB. Se comprueba la sintaxis del archivo optativo sin ejecutarlo.
- No se ejecutó integración, sqlcmd, consulta SQL, arranque de servicio o cambio de
  servidor en esta intervención. Los formatos DMV, permisos reales, coste de lecturas,
  correlación entre procesos y cierre físico de este observador son garantías aún
  pendientes de R8-B; los resultados de dobles no se presentan como prueba del motor.
- La intermitencia histórica no tiene causa confirmada. R6 contó una sesión sin
  conservar identidad; R7 vio dos observadores distintos reutilizando SPID 64. Esta
  instrumentación no permite reconstruir retroactivamente la sesión R6.

Para autorizar R8-B: revisar este diff y la suite, conservar los permisos diagnósticos
ya disponibles sin otorgar nuevos, comprobar precondiciones locales e integridad y
autorizar expresamente una integración de lectura/rollback sin reintento. Si falta
identidad, fallan permisos/observación/cierre o aparece una transacción inesperada,
detenerse con evidencia sanitizada. No debilitar aserciones ni cambiar el motor para
forzar éxito. L8-C2 permanece abierta, sin commit.

Referencias de esquema/permisos consultadas, sin ejecutar SQL: Microsoft Learn,
[sys.dm_exec_sessions](https://learn.microsoft.com/en-us/sql/relational-databases/system-dynamic-management-objects/sys-dm-exec-sessions-transact-sql?view=sql-server-ver16)
y [sys.dm_exec_connections](https://learn.microsoft.com/en-us/sql/relational-databases/system-dynamic-management-objects/sys-dm-exec-connections-transact-sql?view=sql-server-ver16).
connection_id identifica una conexión y la relación sesión/conexiones puede ser
uno-a-varios. Las DMV de diagnóstico requieren permisos que varían por versión;
en SQL Server 2022 la vista de conexiones requiere VIEW SERVER PERFORMANCE STATE.
No se solicitan ni conceden permisos en R8-A y este diagnóstico administrativo no
define los privilegios futuros de la identidad funcional de la API.

## L8-C2-R8-B/R9 — Timeout inicial y aislamiento por etapas (22/10/2026)

### Resultado de R8-B

R8-B confirmó rama/HEAD, once archivos sin staging, servicio Running y ausencia de
procesos sqlcmd. Su primera lectura DATABASE_CATALOG_INTEGRITY alcanzó el watchdog
externo: 15010.64 ms, ETIMEDOUT, PROCESS_WATCHDOG_TIMEOUT, exitCode no disponible
(null). No hubo respuesta SQL confirmada ni se ejecutaron los pasos DMV posteriores.
La integración ODBC, la captura de los tres leases y la correlación R8-A NO se
iniciaron. No atribuir ese fallo al transporte Node ni presentar R8-B como aprobada.
Se detuvo sin reintentar o modificar archivos/documentación.

### Invocación y aislamiento temporal R9

R9 usó un ejecutor temporal fuera del repositorio, eliminado después. No se modifican
producción, pruebas, migraciones, permisos o SQL Server. No se ejecuta integración ODBC.
Se sustituye únicamente en este ejecutor temporal execFileSync por spawn para observar
spawn, data, exit y close. Se conserva 15000 ms de watchdog; cada etapa SQL conserva
-l 5 y -t 5. No hay reintentos, ciclos de carga, sleeps ni aumento de límites.

SQLCMD.EXE es el binario ya instalado de ODBC 170. A usa solo -? (sin conexión).
B usa -S lpc:.\PAIPOC -E -d master para SELECT 1; y separa el acceso mínimo de la
selección de la base del aplicativo. C–E usan -d pai_poc_dev. El resto de argumentos
SQL se conserva: -l 5 -t 5 -b -y 0 -w 65535 -Q <consulta>. No se registran cuentas,
cadenas con credenciales, paths privados o mensajes completos de stderr.

El inicio del proceso NO prueba login. Una respuesta SQL se marca solo al recibir
y validar el resultado esperado, no por observar spawn. Se registra la primera
respuesta SQL validada, salida del proceso y cierre de streams, más inicio/fin UTC,
exitCode, señal y código técnico controlado. La hora del marcador de respuesta no
es tiempo puro de ejecución en el servidor: incluye arranque, login, consulta,
transferencia/buffering y validación local. Si un futuro timeout no tiene respuesta
SQL validada, la subetapa conexión/consulta seguirá siendo indeterminada.

### Evidencia R9: una ejecución por etapa

Horas UTC del 22/10/2026; duraciones respecto al inicio de cada invocación.

| Etapa | Inicio UTC | Fin UTC | Total ms | Spawn ms | Primera respuesta SQL ms | Exit ms | ExitCode | Señal/código técnico |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| A: proceso local, -? | 15:23:28.876 | 15:23:28.915 | 39.19 | 15.71 | No aplica | 38.88 | 0 | null/null |
| B: conexión mínima, SELECT 1 | 15:23:28.915 | 15:23:28.966 | 50.80 | 4.61 | 45.60 | 50.59 | 0 | null/null |
| C: DB_NAME en pai_poc_dev | 15:23:28.966 | 15:23:29.017 | 51.12 | 4.45 | 45.89 | 50.96 | 0 | null/null |
| D: estado ONLINE | 15:23:29.017 | 15:23:29.073 | 56.28 | 5.71 | 50.91 | 56.13 | 0 | null/null |
| E: integridad original | 15:23:29.073 | 15:23:29.610 | 536.20 | 5.30 | 535.55 | 535.79 | 0 | null/null |

Todas devolvieron stdout esperado, sin stderr ni categoría de fallo. A dio respuesta
local de ayuda; no se confunde con SQL. B–E dieron respuesta SQL confirmada y terminaron
correctamente. No se detuvo en una etapa fallida: se completaron las cinco.

E conserva el literal DATABASE_CATALOG_INTEGRITY de la ejecución temporal R8-B y el
mismo bloque de serialización del verificador R1, leído sin modificarlo. No se
reemplazó por snapshot simplificado. El archivo temporal R8-B ya no existía y no se
conservó su hash de consulta; la reconstrucción procede del comando registrado.
La consulta R9 queda identificada por SHA-256:
48f975450bdc41852ca2559a16e752dfeca2e1d617dc04b7efd5d915feff5cad.
No se ejecuta el verificador completo: solo DECLARE/SELECT/asignación de variables y
HASHBYTES del catálogo, sin transacción de verificación, commit, DML o DDL.

### Integridad demostrada en R9

E confirmó pai_poc_dev ONLINE, ocho tablas funcionales con cero filas individuales,
una única 0001_initial y los tres hashes históricos originales coincidentes. También
comparó los SHA-256 de los archivos up/verify/down originales con esos valores.
Se recalculó la huella completa del catálogo mediante la serialización original y
coincidió con el historial: 822fb17b1d66a55e97217c30829d045b03de808d890972078f35f45516764720.
A diferencia de los controles R7 solo sobre el valor registrado, este paso sí calcula
la huella actual. Cero procesos sqlcmd al finalizar. No se consultan sesiones residuales
ODBC en R9 ni se afirma que haya nuevas pruebas de las identidades R8-A.

### Coste, incertidumbres y propuesta mínima

La consulta E accede a columnas/tipos, CHECK, índices/columnas, FK, permisos/rol,
propietarios de esquema y triggers de pai/pai_meta; ordena y serializa JSON y calcula
SHA2_256. Además cuenta ocho tablas y consulta SchemaMigrations. Son varias lecturas
metadatos y subconsultas; dependen de visibilidad/permisos y pueden competir por
recursos o bloqueos de esquema. No hay escaneo de Excel ni datos institucionales.
Estos son costes/riesgos estructurales, NO causas demostradas del timeout.

E tardó más que las consultas mínimas, pero muy por debajo de los límites en esta
muestra. No se midieron esperas o bloqueos del intento histórico, ni tiempo SQL puro.
No hubo pausas después de obtener respuesta que sugieran un cierre bloqueado en R9;
esto no descarta arranque/login/consulta/buffering/cierre como explicación de un
fallo anterior distinto. La intermitencia no se reprodujo y continúa sin causa
confirmada. Cambiar consulta, controlador, privilegios o timeout sería especulativo.

Propuesta pendiente de aprobación: conservar como diagnóstico local separado los
marcadores sanitizados de proceso/respuesta/exit/streams y código/señal del ejecutor,
en vez de descartar todo en SQL_QUERY_FAILED. No se implementa ni modifica el
diagnóstico versionado en R9. Esa evidencia permitiría clasificar un siguiente
fallo sin repetirlo ni elevar límites. Antes de otra integración R8-B se requiere
revisión/autorización posterior; L8-C2 permanece abierta. Las 429 pruebas API son
el resultado histórico R8-A, no una suite repetida en esta intervención documental.

## L8-C2-R10-A — Ejecutor temporal y pruebas sintéticas (22/10/2026)

### Ubicación y alcance

Ejecutor reutilizable fuera del repositorio:
%TEMP%\pai-sqlcmd-r10a-20261022-a0ea5060\sqlcmd-diagnostic.mjs.
En esa carpeta quedan self-test.mjs, synthetic-child.mjs, synthetic-evidence.json y
README.txt. Se usa el alias TEMP para no registrar una ruta personal. La carpeta
se conserva para revisión/R10-B, aunque Windows podría limpiarla. Verificar existencia
para una intervención futura. No se incorpora un script o prueba versionada.

SHA-256 del ejecutor validado:
C03D73131641453E5079013F429C30DA9113C2B79598F67FEF1FE7579DC28695.
SHA-256 de la evidencia sintética:
6C1E7D8120B55E7E84B9C8503C9B8B7E233AB73D2A009A2AE8BB49D871799CF6.

Solo cambian este documento y el maestro. No se modifican producción, pruebas del
repositorio, ODBC, sesión C1, parámetros, migraciones, SQL Server, configuración o
permisos. No se instalan dependencias. La suite API conserva su resultado histórico
429 de R8-A: no se cuentan las pruebas temporales como nuevas pruebas API.

### Datos conservados y límites

runProcess usa spawn sin shell y windowsHide, observa spawn/data/exit/close y no
serializa ChildProcess o excepciones. Reporta inicio UTC, inicio efectivo del proceso,
primera salida y tiempos por stream, respuesta validada, salida del proceso, cierre
de streams y duración total; exitCode, señal observada, código técnico permitido y
clasificación controlada. childPid solo sirve para comprobar limpieza, no es una
identidad Windows o conexión SQL. El error antes del arranque no inventa un PID.

stdout y stderr tienen límites separados y fijos de 32768 bytes. Se siguen drenando
los pipes tras truncar para evitar bloquear al hijo. Solo los buffers acotados viven
en memoria; no salen como resultado, error, consola o archivo. Se descartan al
finalizar. La evidencia persistida contiene únicamente campos construidos por lista
positiva. Se rechazan salidas truncadas como exitosas. Los callbacks de validación
no aportan objetos a la evidencia: solo se acepta boolean true.

Se distinguen salida recibida, respuesta validada durante el flujo y validación final.
Una respuesta válida seguida de basura no es un éxito final. Errores del validador o
del destino de eventos no exponen mensajes originales. No se registran identidades,
hostnames, credenciales, cadenas sensibles, SQL, stacks o GUID completos.

runSqlcmd está preparado para Windows x64/Node 24 y perfil fijo local Shared Memory
lpc:.\PAIPOC, Windows integrada y pai_poc_dev. Exige localReadOnly=true explícito y
rechaza marcadores Azure/producción; no admite cadenas o credenciales del entorno.
No tiene CLI SQL ni ejecución automática al importar. Requiere un importador aprobado
para R10-B, cuerpo de lectura revisado y validador confiable. localReadOnly NO es un
parser de SQL ni autorización para un cuerpo arbitrario. No se invocó runSqlcmd en
R10-A: la prueba del guard se rechazó antes de cualquier spawn SQL.

Login -l 5, consulta -t 5, watchdog externo 15000 ms: sin cambio o reintento. El
watchdog o una cancelación explícita solicitan SIGTERM al único hijo directo; se
esperan exit y close antes de devolver evidencia. No se probaron árboles arbitrarios
de descendientes ni se afirma que kill cubra nietos. En los procesos creados para
estas pruebas sí se verificó que cada hijo directo había desaparecido al terminar.

### Marcadores propuestos, sin ejecución SQL

instrumentSql prepara mensajes fijos de severidad cero, sin WITH LOG ni escrituras:

```sql
RAISERROR(N'PAI_DIAG_V1|CONNECTED',0,1) WITH NOWAIT;
RAISERROR(N'PAI_DIAG_V1|QUERY_STARTED',0,1) WITH NOWAIT;
-- cuerpo SQL de lectura aprobado, sin alterar el archivo versionado
RAISERROR(N'PAI_DIAG_V1|QUERY_COMPLETED',0,1) WITH NOWAIT;
```

CONNECTED recibido prueba que el batch llegó al servidor tras conexión y selección
de base; no prueba cuándo ocurrió el login. QUERY_STARTED/QUERY_COMPLETED delimitan
mensajes alrededor del cuerpo, no miden el plan o tiempo SQL puro. La hora registrada
es recepción en cliente, no el reloj de ejecución del servidor. Se reconocen líneas
completas exactas en stdout o stderr; una cadena con datos adicionales no es marcador.

La documentación oficial indica que NOWAIT envía mensajes inmediatamente al cliente,
pero no garantiza que sqlcmd/pipes/OS entreguen cada mensaje instantáneamente. La
recepción y orden entre streams pueden depender de buffering. No recibir un marcador
NO demuestra qué fase falló. Marcadores recibidos son evidencia positiva; el proceso
iniciado por sí solo no demuestra conexión. Los marcadores y su salida SQL real aún
requieren R10-B; hoy solo se emitieron desde fixtures Node sintéticos.
Referencia: [Microsoft Learn: RAISERROR/NOWAIT](https://learn.microsoft.com/en-us/sql/t-sql/language-elements/raiserror-transact-sql?view=sql-server-ver16).

### Validación sintética R10-A

13 pruebas aprobadas, cero fallidas/omitidas; 12 invocaciones de proceso más una
prueba pura de preparación/guard. Antes de inicio no se creó hijo. No se invocó
SQLCMD.EXE, se ejecutó SQL o se repitió R8-B. Principales resultados públicos:

| Caso | Clasificación | Duración ms | ExitCode | Señal | Código |
| --- | --- | ---: | --- | --- | --- |
| Éxito | SUCCESS | 58.93 | 0 | null | null |
| Salida no cero | EXIT_NONZERO | 48.93 | 7 | null | null |
| Watchdog externo real de 15000 ms | EXTERNAL_TIMEOUT | 15019.47 | null | SIGTERM | ETIMEDOUT |
| Terminación solicitada | TERMINATED_BY_REQUEST | 11.74 | null | SIGTERM | null |
| Salida parcial | OUTPUT_UNVALIDATED | 49.11 | 0 | null | null |
| Sin salida | OUTPUT_UNVALIDATED | 46.44 | 0 | null | null |
| Error anterior al arranque | PROCESS_START_FAILED | 0.97 | -4058 | null | ENOENT |
| Salida sintética con secretos ficticios | SUCCESS, proyección segura | 48.99 | 0 | null | null |
| Exceso de captura | OUTPUT_LIMIT_EXCEEDED | 46.90 | 0 | null | null |
| Marcador con contenido ajeno | OUTPUT_UNVALIDATED | 51.68 | 0 | null | null |
| Basura posterior a respuesta válida | OUTPUT_UNVALIDATED | 84.38 | 0 | null | null |
| Error del validador/eventos | RESPONSE_VALIDATION_FAILED | 69.06 | 0 | null | null |

La señal nativa observada se registra aparte de la solicitud de terminación; si una
plataforma no la informa no se inventa. El test de watchdog mantiene al fixture vivo
para ejercitar la cancelación real de 15 s, sin elevar ese límite. No es una espera
introducida en un diagnóstico SQL. Las pruebas comprobaron limpieza y ausencia de
valores ficticios Windows/email/ruta/contraseña/GUID en resultados, eventos y errores.
Se confirmó ausencia de hijos sintéticos y de procesos sqlcmd al finalizar.

### Condiciones para R10-B

Revisar el módulo temporal y verificar su hash; autorizar expresamente la ejecución
local del cuerpo SQL de lectura y su validador, incluido el envoltorio de mensajes.
No se modifica la consulta de integridad versionada; el batch temporal sí incorpora
mensajes, por lo que sus tiempos deben interpretarse como ejecución instrumentada.
Conservar límites y cero reintentos, guardar solo la evidencia sanitizada y detenerse
ante fallo sin modificar el servidor. Si se desea versionar el ejecutor, proponer el
cambio antes de incorporarlo al repositorio. No se implementó esa incorporación.
La intermitencia histórica sigue sin causa confirmada; R10-B no ejecutada y L8-C2
no cerrada. Sin commit, push, PR, merge o despliegue.

## L8-C2-R10-B2 — Endurecimiento temporal de sqlcmd (22/10/2026)

Rama y HEAD confirmados: feature/arquitectura-persistencia-pai,
c59b3928ab8e977a7668d82626f4063e10cefb7d. Once archivos pendientes sin staging.
R10-B1 fue NO APTO; esta intervención implementa correcciones y pruebas sintéticas,
no ejecuta sqlcmd, SQL real, R8-B ni integración ODBC y no modifica SQL Server.

### Preservación y consulta exacta

Se verificaron los cinco SHA-256 de R10-B1 y se conservaron copias íntegras en
%TEMP%\pai-sqlcmd-r10b1-original-20261022-a0ea5060. Trabajo temporal en
%TEMP%\pai-sqlcmd-r10a-20261022-a0ea5060; cambios registrados en changes-r10b2.patch,
con rutas privadas sustituidas antes de escribir el archivo. Nada de ello se incorpora a Git.
La consulta DATABASE_CATALOG_INTEGRITY se recuperó del comando histórico R9
(registro local, línea 5566), incorporando exactamente el bloque del verificador R1.
Se confirmó identidad de los 4585 bytes UTF-8 mediante SHA-256:
48f975450bdc41852ca2559a16e752dfeca2e1d617dc04b7efd5d915feff5cad.
Se conserva como integrity-original.sql, sin cambiar columnas o serialización.

Revisión manual de todas sus expresiones: solo lecturas sys.*, SchemaMigrations,
COUNT/COUNT_BIG de las ocho tablas, funciones integradas de metadatos/conversión/hash,
JSON y variables locales; SET NOCOUNT ON afecta únicamente a la sesión. No hay
SQL dinámico, procedimientos, funciones de usuario, servidores vinculados, comandos
sqlcmd, tablas temporales ni DML/DDL. No se ejecuta el verificador R1 completo.
El wrapper separado añade mensajes RAISERROR severidad 0 NOWAIT y una variable
local DB_NAME para comprobar la base, dato que no existe en el JSON histórico.
Cuerpo y wrapper se fijan por hashes; se rechaza SQL arbitrario del llamador.
Esta revisión estática no equivale a ejecución satisfactoria en el motor.

### Controles implementados

- Binario absoluto SQLCMD.EXE ODBC 170, versión inspeccionada 16.0.1000.6 y hash
  fijado. Recursos instalados SQLCMD.rll confirman -X[1] y -x, sin ejecutar -?.
  Se emplean -X1 y -x. Sin shell, windowsHide:true y sin búsqueda por PATH.
- Entorno explícito de spawn: SystemRoot, WINDIR y SystemDrive. No se heredan
  SQLCMDINI, SQLCMD*, OSQL*, NODE_OPTIONS, credenciales o ajustes de conexión.
  La prueba con SQLCMDINI sintética en el padre confirma su exclusión en el hijo.
  Windows puede añadir variables estándar de perfil/PATH al proceso: se observó
  con Node sin conservar valores; no se garantiza ausencia de todas esas variables.
- Validación previa de ejecutable, argumentos, AbortSignal, callbacks y captura.
  Los callbacks son síncronos/de confianza; una promesa devuelta se rechaza y su
  rechazo se consume sin publicar errores originales. No se aísla código malicioso.
- Categorías diferenciadas: PROCESS_START_FAILED, PROCESS_RUNTIME_FAILED,
  EXTERNAL_TIMEOUT, PROCESS_TERMINATION_FAILED, SQL_ERROR_RECOGNIZED, EXIT_NONZERO,
  RESPONSE_INCOMPLETE, RESPONSE_INVALID y OBSERVER_FAILED. Códigos técnicos
  limitados por listas positivas; no se conservan mensajes/stacks del controlador.
- El timeout externo conserva su causa aunque falle la limpieza. Se distinguen
  solicitud, aceptación de terminación, exit observado y cierre de streams.
  Sin confirmación al vencer el watchdog se devuelve evidencia de cierre no
  confirmado en vez de esperar indefinidamente. No se declara limpio ese proceso.
- Solo se solicita terminar al hijo directo; no se incorpora terminación forzada
  de descendientes. Un fallo de kill no demuestra que el proceso haya finalizado.
  El límite requiere progreso del event loop y callbacks acotados de confianza.
- Se conservan 5/5/15 segundos y 32768 bytes por stream; cero reintentos SQL.

### Validador y procedencia

references.json procede de api/migrations/manifest.json, del verificador R1 y de
la evidencia documentada R9. Se fijan hashes de referencias, cuerpo, wrapper y
binario; modificar archivos/pins sigue requiriendo revisión de un inventario externo.
El validador exige estructura completa y campos exactos, ONLINE, base pai_poc_dev
confirmada por el wrapper, ocho nombres de tablas distintos, cero filas, una sola
migración 0001_initial y hashes históricos exactos de up/verify/down:

- up: 29634f596d609ea6b031ed50f1641180d4dd0f2d6fd40ff3357e60a184b1d35f
- verify: f78cd96c0f31f1b04d34e1b453d483a4433557c7651e41ec95be9faaef2bf9d5
- down: c059d2b65bd06aabb94826d04b0a54c9aa0223e074b6a65b93615bea0acb153e
- catálogo registrado y recalculado:
  822fb17b1d66a55e97217c30829d045b03de808d890972078f35f45516764720

Se rechazan datos omitidos/extra, duplicados (incluidas claves JSON escapadas),
JSON parcial/concatenado, tablas desconocidas, hashes incorrectos y recuentos
no numéricos, nulos o distintos de cero. ExitCode 0 no sustituye esa validación.
No se aceptan valores esperados ni validadores SQL suministrados por el llamador.

### Pruebas reales de esta intervención, exclusivamente sintéticas

Resultado final: 65 pruebas aprobadas, cero fallidas, sin omisiones; 15953.07 ms.
El fixture del watchdog ejercitó el límite real de 15000 ms (caso 15013.59 ms), no
un timeout SQL. Se cubren valores completos/incorrectos por pipes Node, privacidad,
fallo de arranque/runtime/observador, promesas no admitidas, señales, captura,
fallo de terminación y ausencia de close con dobles. No se prueban árboles de hijos.
Las primeras ejecuciones detectaron una comprobación incompatible con la ruta
canónica de Node y una aserción que confundía entorno enviado con variables
adicionales de Windows. Ambas se corrigieron sin eliminar los controles de seguridad.
La evidencia final conserva solo campos técnicos sanitizados; los valores de
identidad/ruta/contraseña de fixtures son ficticios y permanecen fuera de Git.

La suite API de 429 es histórica, NO se repitió ni se añadieron pruebas versionadas.
Solo se actualizan este documento y el maestro; producción, HTTP, codecs, sesión,
pruebas versionadas, migraciones y dependencias conservan sus archivos iniciales.

### Dictamen y límites

APTO para una nueva auditoría estática del conjunto temporal; no es aprobación
para ejecutar SQL real. El manifiesto temporal sha256.json identifica todos los
otros archivos definitivos y su propia huella se entrega por separado.
Antes de cualquier futura ejecución hay que reauditar SQL/wrapper/validador, verificar
hashes y obtener autorización explícita. Los hashes no son firmas ni protegen contra
un escritor que cambie también el código y los pins (riesgo TOCTOU).
La compatibilidad efectiva de salida SQL del nuevo wrapper, conectividad e integridad
actual de la base NO se comprobaron en R10-B2. Intermitencia histórica sin causa
confirmada. L8-C2 sigue abierta. Sin commit, push, PR, merge ni despliegue.

Comprobación adicional final: un artefacto local ausente produce error controlado
sin stack/ruta privada; prueba con copia sintética aislada. Total definitivo: 65/65.

## L8-C2-R10-B4 — Cierre de tres brechas del diagnóstico temporal (22/10/2026)

Rama/HEAD confirmados: feature/arquitectura-persistencia-pai,
c59b3928ab8e977a7668d82626f4063e10cefb7d. Once archivos pendientes sin staging.
Se verificaron los trece archivos contra el manifiesto R10-B2/R10-B3, cuya huella
es e4a5609b156d3073060fea2347176759f39cbc18226efa08a8398164607cb793.
Copia íntegra preservada fuera de Git en
%TEMP%\pai-sqlcmd-r10b3-original-20261022-a0ea5060. Ninguna evidencia histórica
se pierde: el manifiesto/evidencia anteriores están en ese respaldo; audit-summary.json
y changes-r10b2.patch se mantienen como antecedentes. El inventario actual se renueva
al finalizar y las diferencias quedan en changes-r10b4.patch, con rutas sanitizadas.

### Hallazgos R10-B3 y correcciones

1. Ruta SQL alternativa: createProcessRunner estaba exportado y permitía seleccionar
   kind sqlcmd, argumentos y validador. El motor del ciclo de vida pasa a ser privado
   y compartido. La utilidad exportada solo admite Node actual y la ruta exacta del
   fixture autorizado, validado por hash, con modos enumerados y dos argumentos.
   Se rechazan ejecutables ajenos, scripts distintos, -e, argumentos extra y kind.
   runSqlcmd es la única ruta SQL; mantiene destino/argumentos/cuerpo/referencias y
   validador fijos. prepareSqlcmd solo prepara datos. Los dobles son código local de
   confianza, no un sandbox contra JavaScript malicioso con privilegios del usuario.
2. Marcadores insuficientes: protocol.mjs exige exactamente una aparición global de
   CONNECTED, DATABASE de pai_poc_dev, QUERY_STARTED y QUERY_COMPLETED. Se conserva
   el orden definido por el wrapper dentro de cada canal (subsecuencia), sin suponer
   orden global de recepción stdout/stderr. En stdout se respeta la posición del JSON
   respecto a los marcadores de inicio/fin. Duplicados no se deduplican silenciosamente;
   marcadores desconocidos, contradictorios, alterados, sin terminador y secuencias
   inválidas impiden éxito. La ausencia sin otra corrupción es evidencia insuficiente,
   nunca una conclusión automática sobre fallo de login/conexión.
3. stderr no validado: gramática explícita limitada a líneas exactas de marcadores,
   terminadas en LF/CRLF, y líneas vacías. Cualquier contenido residual, encabezado,
   prefijo no autorizado, error desconocido o truncamiento impide SUCCESS. No se
   añaden excepciones para una salida de sqlcmd que todavía no se ha observado.
   Los errores SQL reconocidos pueden clasificarse como fallo con código permitido;
   no por ello se aceptan como salida válida. Nunca se persiste su mensaje original.

SUCCESS exige conjuntamente protocolo válido, JSON completo validado, exitCode 0,
sin truncamiento, exit observado y streams cerrados. La validación de integridad
conserva los mismos hashes, catálogo, ocho tablas vacías y migración 0001_initial.
No se cambia integrity.mjs ni references.json. El cuerpo de 4585 bytes y el wrapper
siguen intactos; SHA-256 del SQL original:
48f975450bdc41852ca2559a16e752dfeca2e1d617dc04b7efd5d915feff5cad.

### Validaciones efectivamente ejecutadas

88 pruebas sintéticas aprobadas, 0 fallidas: las 65 anteriores y 23 nuevas.
La prueba de privacidad de stderr contaminado ahora exige rechazo conservando
la comprobación de sanitización; no se elimina su intención original.
Cobertura nueva: kind SQL, binario SQL/ajeno, otro script, eval, argumentos extra,
modo no autorizado, cambio de validador, tres marcadores ausentes, repetidos,
desconocidos, contradictorios, fuera de orden, stderr residual/error desconocido,
stdout válido con stderr inválido, marcador sin terminador, cola parcial y truncamiento.
También pasa un protocolo válido repartido entre pipes; siguen aprobando los casos
anteriores de timeout parcial, limpieza de recursos y cierre no confirmado del hijo.
Duración de la suite: 16749.38 ms; watchdog sintético real: 15012.85 ms.
No se alteran los límites 5/5/15 ni la captura de 32768 bytes; cero reintentos SQL.
La suite API de 429 pruebas es histórica y no se repite en esta intervención.

Sintaxis JavaScript y evidencia sanitizada se comprueban al finalizar. El resultado
actual está en audit-summary-r10b4.json; el manifiesto sha256.json incluye todos los
otros archivos temporales definitivos y su propia huella se informa por separado.
No se incorporan estos artefactos a Git. Solo se actualizan los dos documentos
permitidos; los otros nueve archivos pendientes deben conservar sus hashes iniciales.

### Límites y dictamen preliminar

APTO para auditoría estática final, no para ejecución SQL automática. No se ejecutaron
sqlcmd, SQL real, R8-B o integración ODBC. El formato real de encabezados/prefijos y
marcadores de sqlcmd sigue pendiente; la política es rechazar, no inventar tolerancias.
No se garantiza terminación de árboles arbitrarios de descendientes. Si el cierre
no se confirma, la evidencia no declara recursos liberados. Los callbacks son de
confianza y deben permitir progreso del event loop. Persisten el riesgo TOCTOU y la
necesidad de revalidar hashes inmediatamente antes de una futura ejecución autorizada.
Intermitencia histórica sin causa confirmada. L8-C2 abierta. Sin cambios de servidor,
permisos, migraciones, producción, pruebas versionadas, dependencias o HTTP.
Sin commit, push, PR, merge ni despliegue.

## L8-C2-R10-C — Primera ejecución real del diagnóstico auditado (22/10/2026)

Resultado: SUCCESS en una sola invocación de runSqlcmd(), sin reintentos.
Rama feature/arquitectura-persistencia-pai y HEAD
c59b3928ab8e977a7668d82626f4063e10cefb7d confirmados; once archivos pendientes
sin staging. Servicio MSSQL$PAIPOC Running y cero procesos sqlcmd antes de ejecutar.
Los diecisiete archivos temporales coinciden con el manifiesto auditado R10-B4:
3702e14c8f961a517803fea55704cc34fce70deadeb3ac58f08daf733fe3b9b3.
El ejecutable conserva SHA-256
7220b526ab97b0a5b30ed7b09c497ab7fad39141090f8801d68691c38ff248da.
Todas las precondiciones se comprobaron antes de la única consulta, sin SQL preliminar.

### Ejecución y evidencia observada

Se utilizó exclusivamente runSqlcmd() del conjunto auditado, con destino configurado
lpc:.\PAIPOC, base pai_poc_dev y autenticación Windows integrada (-E). No se usaron
comandos SQL alternativos. Cuerpo DATABASE_CATALOG_INTEGRITY y wrapper aprobados,
con límites 5 s conexión, 5 s consulta y 15000 ms watchdog, sin cambios.
El importador local externo volvió a verificar hashes antes de cargar el ejecutor y
utilizó un archivo de inicio de creación exclusiva para evitar repetirlo por accidente.
Se persistieron únicamente eventos/resultados por lista positiva, nunca stdout/stderr
crudos, SQL de respuesta, mensajes originales, stacks, identidades o conexiones.

| Evidencia | Tiempo observado |
| --- | --- |
| Inicio de medición UTC | 2026-10-22T16:42:59.720Z |
| Proceso iniciado | 7.32 ms |
| Primera salida recibida | 694.55 ms |
| CONNECTED reconocido | 695.23 ms |
| DATABASE de pai_poc_dev reconocido | 695.26 ms |
| QUERY_STARTED reconocido | 695.28 ms |
| QUERY_COMPLETED reconocido | 695.32 ms |
| Respuesta SQL validada | 696.03 ms |
| Salida del proceso observada | 700.22 ms |
| Cierre de streams observado | 700.65 ms |
| Fin UTC / duración total | 2026-10-22T16:43:00.420Z / 700.70 ms |

ExitCode 0, señal null, código técnico null, clasificación SUCCESS y sin error de
limpieza. directChildExited=true y streamsClosed=true. No se solicitó terminación.
stdout observado y stderr no observado; sin truncamiento ni fallo del observador.
Los tiempos de marcadores son de recepción/reconocimiento en Node, no tiempos del
reloj SQL ni duración pura de cada etapa del servidor. Que aparezcan casi juntos
no demuestra que arranque, login o ejecución duraran esos intervalos individuales.

### Integridad confirmada por el validador en esa lectura

La respuesta completa y el marcador de base superaron validateIntegrity y el protocolo:
pai_poc_dev, ONLINE, exactamente ocho tablas funcionales con cero registros, una sola
migración 0001_initial, hashes históricos up/verify/down exactos y huella actual del
catálogo recalculada coincidente con el historial y las referencias aprobadas.
La huella de catálogo validada es
822fb17b1d66a55e97217c30829d045b03de808d890972078f35f45516764720.
No se conservaron las filas JSON crudas: estas conclusiones proceden del validador fijo
que solo permite SUCCESS si cumplen todos sus criterios. No hubo consultas posteriores
para volver a contar filas o inspeccionar sesiones SQL.

### Comprobaciones posteriores y alcance

Cero procesos sqlcmd residuales. Los diecisiete archivos auditados y el binario
conservan sus hashes. Antes de actualizar documentación se verificó que los once
archivos pendientes del repositorio conservaban exactamente sus hashes previos a la
invocación. Después se modifican exclusivamente este documento y el maestro.
Sin staging; git diff --check correcto. Sin cambios de código, pruebas versionadas,
migraciones, configuración SQL, permisos o dependencias. Sin consultas adicionales.

Evidencia temporal separada, fuera de Git y del directorio auditado:
%TEMP%\pai-sqlcmd-r10c-20261022-a0ea5060\execution-evidence.json y
post-execution-checks.json. El conjunto auditado de R10-B4 no se modifica ni se
regenera su manifiesto. No se ejecutan pruebas sintéticas ni se repite la suite API.
Las 88 pruebas sintéticas corresponden al cierre anterior, no a una nueva ejecución.

R10-C valida satisfactoriamente esta muestra de sqlcmd y su comprobación de integridad;
NO demuestra resuelta la intermitencia histórica ni valida msnodesqlv8/mssql desde Node.
No se ejecutó integración ODBC ni R8-B. La ausencia de procesos sqlcmd no equivale a
una nueva verificación DMV de sesiones físicas, que no estaba autorizada aquí.

Recomendación: solicitar autorización separada para retomar R8-B con sus precondiciones
revalidadas y una sola ejecución de la integración existente de lectura, observando
parametrización, transacción/rollback, identidad de leases y cierre. Ante un fallo,
detenerse sin reintentos ni cambios especulativos o atribuciones automáticas.
L8-C2 permanece abierta. Intermitencia histórica sin causa confirmada.
Sin commit, push, PR, merge ni despliegue.

## L8-C2-R8-B — Integración ODBC real: clase B, no aprobada (22/10/2026)

Resultado global: FAILED, clase B (CONNECTION_STILL_VISIBLE), una sola ejecución de
api/tests/integration/sql-transport.test.mjs; exitCode 1, 0 aprobadas y 1 fallida.
Duración del proceso de prueba: 367.35 ms. Sin reintentos, cambios para forzar éxito
ni consultas SQL después del fallo. Última etapa demostrada: observación POST_CLOSE.
L8-C2 no se cierra.

### Precondiciones y observador

Rama feature/arquitectura-persistencia-pai, HEAD
c59b3928ab8e977a7668d82626f4063e10cefb7d, once archivos pendientes sin staging,
git diff --check correcto y servicio MSSQL$PAIPOC Running. Los nueve archivos de
implementación/pruebas pendientes conservaban los hashes de R10-C. La evidencia
R10-C se verificó por hash y se utilizó como antecedente, no como garantía futura.
No se repitió DATABASE_CATALOG_INTEGRITY ni el cálculo completo del catálogo.
La prueba existente sí ejecutó su snapshot reducido de lectura inicial; el snapshot
reducido final no llegó a ejecutarse por el fallo del observador.

Se compiló la API con TypeScript, contratos y fronteras correctos (npm --prefix api
run build), sin cambiar fuentes. La comprobación previa del observador utilizó
una conexión ODBC efímera de lectura con la configuración local existente y confirmó
VIEW SERVER PERFORMANCE STATE y VIEW SERVER STATE. Se leyeron correctamente
sys.dm_exec_sessions, sys.dm_exec_connections, sys.dm_exec_requests y la dependencia
sys.dm_tran_session_transactions. session_id, login_time y connection_id disponibles
y completos; cero transacciones de usuario en esa lectura. Pool de precomprobación
cerrado. No se concedieron permisos ni se publicaron cuentas o GUID completos.

### Resultado funcional confirmado antes del fallo

- Conexión Shared Memory y autenticación Windows comprobadas por las aserciones del
  test. Dentro de la transacción: @@TRANCOUNT=1, XACT_STATE()=1 y aislamiento 4
  (SERIALIZABLE). Base pai_poc_dev.
- Parámetros y codecs comprobados: nvarchar con Unicode sintético, uniqueidentifier,
  datetime2(3), bit, bigint máximo como texto exacto, binary/varbinary no vacíos,
  binario corto y rowversion. NULL textual y cadena vacía se conservaron distintos.
- Ambas QUERY principales, ROLLBACK y CLOSE tuvieron trazas ok. Conexión principal
  24.43 ms, BEGIN 21.76 ms, consultas 6.92/7.93 ms, ROLLBACK 1.28 ms, CLOSE 2.34 ms.
- Los dos casos negativos binary/varbinary vacíos superaron las aserciones de rechazo
  antes de request.input() y query(): cero llamadas. Cada caso usó su propio lease
  rollback-only y pasó assertLeaseClean, igual que el principal.
- Los tres leases confirmaron invocación y resolución de cierre nativo y pool local
  cerrado. Las comprobaciones previas a close verificaron cero transacciones,
  XACT_STATE()=0, cero transacciones de usuario y ningún préstamo pendiente.
- Esto no se presenta como integración aprobada: la comprobación de ausencia de
  identidades después de close falló en el tercer lease.

### Identidades sanitizadas y correlación exacta

login_time se conserva en hora local del servidor, sin etiquetarlo como UTC.
connection_id completo solo se utilizó en memoria y en parámetros de correlación;
la salida pública contiene una huella SHA-256 abreviada a 16 caracteres.

| Lease | session_id | login_time | Huella abreviada | close invocado/resuelto | Correlación posterior |
| --- | ---: | --- | --- | --- | --- |
| 1 principal | 67 | 2026-10-22T11:53:54.563 | a3e3294ab7d8442c | sí/sí | Sin identidad coincidente visible |
| 2 binary vacío | 67 | 2026-10-22T11:53:54.607 | a3e3294ab7d8442c | sí/sí | Sin identidad coincidente visible |
| 3 varbinary vacío | 67 | 2026-10-22T11:53:54.613 | a3e3294ab7d8442c | sí/sí | CONNECTION_STILL_VISIBLE |

Observador independiente: session_id 68, login_time 2026-10-22T11:53:54.617,
huella a0fb48d620ebceea. Se excluyó al propio observador de las correlaciones.
No se usó program_name como identidad ni se asumieron tres conexiones físicas
independientes. Coinciden SID y huella entre leases, pero login_time difiere;
la correlación usó la identidad compuesta completa, no solo SID o huella pública.

La lectura POST_CLOSE del tercer lease, observada a las 2026-10-22T16:53:54.627Z,
conservaba exactamente session_id/login_time/connection_id capturados. Estado sleeping,
transactionCount=0, activeUserTransactions=0, activeRequests=0, blockedRequests=0 y
waitingRequests=0. transactionState es null en esta consulta por diseño: no se inventa
un XACT_STATE() de otra sesión. Clasificación global B, nunca A/SUCCESS.
La identidad estaba visible en esa observación, sin una transacción activa detectada;
no demuestra una fuga permanente. Tampoco se atribuye automáticamente a ODBC.
El cierre del observador concluyó antes de devolver el resultado a la prueba.

### Detención, persistencia y evidencia

La prueba lanzó CONNECTION_STILL_VISIBLE al evaluar los resultados del observador.
No ejecutó el snapshot final ni el mensaje final de éxito. No hubo timeout.
El snapshot inicial reducido había confirmado ONLINE, ocho tablas y cero registros,
además de la migración esperada; R10-C es el antecedente de integridad completa.
El flujo ejecutado utiliza SELECT y rollback, sin DML/DDL, pero NO se afirma una
comprobación posterior de cero filas o historial inalterado que no se ejecutó.
No se consultaron nuevamente las sesiones ni se repitió la integración tras fallar.

Evidencia fuera de Git:
%TEMP%\pai-r8b-20261022-final-a0ea5060\observer-precheck.json,
integration-evidence.json y result-summary.json. El ejecutor externo lanzó una sola
vez el archivo original con --test y opt-in local; filtró TAP en memoria por lista
positiva antes de conservar resultados. No se guardaron salidas crudas, mensajes
originales, stacks, cuentas Windows, hostnames, credenciales o GUID completos.
El registro de códigos TAP no añadió código, pero la categoría está demostrada
explícitamente en el resultado estructurado del tercer lease y en el flujo del test.

Tras finalizar, cero procesos Node de integración y cero procesos sqlcmd detectados.
Esto no constituye una nueva comprobación DMV ni demuestra cuándo desapareció la
identidad SQL observada. Antes de documentar se verificó que los once archivos
pendientes conservaban sus hashes previos. Solo se actualizan este documento y el
maestro; sin staging ni cambios de implementación, pruebas, timeouts o dependencias.

### Riesgos y recomendación

No cerrar L8-C2. Solicitar una etapa posterior de diagnóstico de lectura, sin repetir
la integración automáticamente, para distinguir visibilidad transitoria/pooling de
persistencia de la identidad observada. Cualquier observación debe conservar el filtro
compuesto exacto y separar sesión visible, solicitud activa y transacción abierta.
No debilitar aserciones, modificar pool/driver/protocolos ni introducir esperas o
reintentos para obtener éxito. La causa de esta visibilidad y de la intermitencia
histórica no está confirmada. Sin commit, push, PR, merge ni despliegue.

## L8-C2-R11-A — Identidad no correlacionable y revisión de pooling (22/10/2026)

Clasificación: D — identidad histórica no correlacionable con la evidencia conservada.
No se abrió ninguna conexión SQL, no se consultaron DMV ni tablas y no se repitió
R8-B. No es un resultado A ni un fallo de consulta E: la observación no se inició
porque falta un componente obligatorio de la identidad.

### Estado y evidencia

Rama feature/arquitectura-persistencia-pai, HEAD
c59b3928ab8e977a7668d82626f4063e10cefb7d, once archivos pendientes sin staging,
git diff --check correcto y servicio MSSQL$PAIPOC Running. Se verificaron por hash
los archivos de evidencia R8-B contra evidence-sha256.json, sin modificarlos.

La tercera captura conserva SID 67, login_time 2026-10-22T11:53:54.613 y la huella
abreviada a3e3294ab7d8442c. No conserva connection_id completo: publicObservation()
emite SHA-256(connection_id).slice(0,16), y el colector solo persiste esa proyección.
Se inspeccionaron los JSON del directorio R8-B; ninguno contiene GUID completos.
La identidad completa se usó en memoria durante R8-B para la correlación que dio B,
pero no se guardó para diagnósticos diferidos. No se reconstruye un GUID a partir de
una huella ni se sustituye la igualdad exacta por SID, programa o coincidencia parcial.

Por ello no se puede determinar ahora si aquella identidad sigue visible, desapareció
o fue reemplazada. Los valores sleeping, cero transacciones y cero solicitudes siguen
siendo observaciones históricas de R8-B, no resultados nuevos de R11-A.
La comprobación independiente de las ocho tablas no se ejecutó: dependía de completar
correctamente la observación exacta. No se afirma integridad funcional actual.

### Revisión estática de las versiones instaladas

Versiones confirmadas en paquetes/DLL: mssql 12.7.10, msnodesqlv8 5.6.0 y ODBC Driver
17.10.6.1. Se consultaron README y fuentes distribuidas localmente con los paquetes;
para Driver 17 se inspeccionó la información instalada de DLL/registro, no se dispone
con ello de una medición del estado del administrador ODBC durante R8-B.

| Nivel | Hecho inspeccionado | Límite de la conclusión |
| --- | --- | --- |
| Aplicación PAI | localOdbcConfig: max=1, min=0, idleTimeoutMillis=1000, acquireTimeoutMillis=10000; conexión/consulta 10000 ms. Cada connect crea un ConnectionPool explícito. | No se usa sql.connect() ni el pool global de mssql en el flujo revisado. No se modificó configuración. |
| Pool mssql/Tarn | ConnectionPool crea/destruye una conexión de comprobación y utiliza tarn.Pool. close espera pool.destroy(), pone this.pool=null y resuelve callbacks. | Destrucción del pool lógico no demuestra desaparición física inmediata en SQL Server. |
| Adaptador mssql/msnodesqlv8 | _poolCreate llama msnodesql.open; _poolDestroy llama tds.close y resuelve su callback. No utiliza msnodesqlv8.Pool. | El callback de destrucción no acredita por sí solo ausencia DMV; su implementación no propaga un argumento de error de tds.close. |
| Capa JS msnodesqlv8 | Tiene API Pool opcional; la ruta utilizada abre conexiones directamente. DriverMgr encola CLOSE; ConnectionWrapper cierra mediante callback y setImmediate. | Cola y callback son mecanismos asíncronos; no se midió un retraso causante del residual. |
| Capa nativa/administrador ODBC | Fuentes: entorno compartido estático; Initialize solicita SQL_ATTR_CONNECTION_POOLING=SQL_CP_ONE_PER_HENV y SQL_ATTR_CP_MATCH=SQL_CP_RELAXED_MATCH. | Son configuraciones de las fuentes instaladas; no se instrumentó el binario para demostrar su efecto exacto durante R8-B. |
| SQL Server físico | R8-B observó la identidad exacta del tercer lease sleeping, sin transacciones/solicitudes. | R11-A no puede volver a correlacionarla; no demuestra fuga permanente ni duración de retención. |

Referencias locales verificables:
- api/src/infrastructure/sql/odbc.ts: localOdbcConfig, connect y close.
- api/src/infrastructure/sql/session.ts: TransactionSession.finish y SqlSessionRunner.run.
- api/node_modules/mssql/README.md: Connection Pools y pool options.
- api/node_modules/mssql/lib/base/connection-pool.js: _connect, _close y tarn.Pool.
- api/node_modules/mssql/lib/msnodesqlv8/connection-pool.js: _poolCreate/_poolDestroy.
- api/node_modules/mssql/lib/msnodesqlv8/transaction.js: adquisición y liberación tras rollback.
- api/node_modules/msnodesqlv8/README.md y lib/sql.js: Pool opcional, distinto de open.
- api/node_modules/msnodesqlv8/lib/driver.js y lib/connection.js: CLOSE en cola y callback.
- api/node_modules/msnodesqlv8/cpp/src/odbc/odbc_environment.cpp: atributos de pooling.
- api/node_modules/msnodesqlv8/cpp/src/odbc/odbc_connection.cpp: sharedEnvironment_, Close.
- api/node_modules/msnodesqlv8/cpp/src/js/workers/close_worker.cpp: liberación nativa y callback.

En el registro local del Driver 17 se leyó CPTimeout='60'. No se cambia ni se interpreta
como una duración medida de la sesión R8-B, ni como el timeout del pool Tarn.
La capa nativa llama SQLDisconnect, libera handles y marca cierre local; en el Close
inspeccionado no se comprueba el retorno de SQLDisconnect. Esto es una limitación
estática de lo que acredita el callback, NO evidencia de que SQLDisconnect fallara.

### Requests, transacciones y referencias

Los requests del transporte reciben explícitamente la transacción; los del observador,
su pool. No se recurre a propietarios globales por omisión. El runner drena operaciones,
ejecuta rollback y luego close. mssql devuelve la conexión al pool tras rollback y
limpia la referencia adquirida. Los ledgers de instrumentación retienen objetos de pool
y snapshots para comprobarlos; retener el objeto JS cerrado no prueba retener una
conexión física. No se identificó un pool global de aplicación abandonado en esta ruta.

El código instalado hace compatible la hipótesis de pooling/reutilización por debajo
del pool mssql con la evidencia histórica: cierre lógico resuelto, estado sleeping y
cero transacciones. Los SID y huellas iguales, con login_time diferentes entre leases,
no acreditan tres conexiones físicas distintas. Cierre diferido o fallo no propagado
siguen siendo posibilidades no demostradas. No hay evidencia para atribuir causa única,
cuantificar retención o declarar resuelta la intermitencia.

### Recomendación y límites

No cambiar pooling, timeouts, permisos o aserciones para aceptar B automáticamente.
Primero aprobar un diseño de observabilidad que conserve connection_id completo solo
en memoria hasta terminar todas las observaciones autorizadas. Para una observación
diferida entre procesos haría falta autorizar expresamente un estado privado separado,
con acceso restringido y eliminación, manteniendo los logs públicos sanitizados.
La evidencia histórica actual no permite recuperar la identidad perdida; no se inventa
ni se repite la integración en esta etapa. Un criterio de cierre lógico frente a
sesión física bajo pooling requiere revisión técnica explícita y pruebas posteriores,
no relajación inmediata del test. R8-B mantiene su fallo histórico B; R11-A es D.
L8-C2 continúa abierta. Cero consultas SQL en R11-A. Sin cambios de código, servidor,
permisos, configuración, dependencias o pruebas; sin commit, push, PR, merge o despliegue.

## L8-C2-R11-B — Ciclo de vida de identidades del observador (22/10/2026)

Implementado para revisión, sin commit. R11-B corrige exclusivamente la observabilidad
sintética y el uso de identidades dentro del proceso de integración; no ejecuta SQL real,
sqlcmd ni integración ODBC. No recupera el GUID histórico perdido de R8-B/R11-A.

### Defecto y corrección acotada

La correlación anterior ya comparaba session_id, login_time y connection_id completos
durante la integración. Faltaba un ámbito explícito para conservar esas referencias
hasta consumir la observación posterior, descartarlas en todas las salidas y evitar
que la serialización accidental de los registros expusiera connection_id completo.
No se cambia la consulta DMV, sus parámetros ni la regla de correlación exacta.

createObservationScope conserva en memoria los registros de cada lease, del observador
y de las coincidencias posteriores. El GUID completo se guarda en un WeakMap privado,
accesible mediante un getter no enumerable; JSON y las proyecciones públicas no lo
incluyen. Los ledgers tienen una proyección JSON sanitizada que excluye el pool.
La integración pasa el mismo ámbito a todos los leases y a observeAfterClose.
La identidad sigue disponible después del cierre nativo, mientras se correlacionan
las DMV. Un ámbito ocupado no puede descartarse durante esa observación pendiente.

Un finally de la integración invoca dispose tanto en éxito como en error: revoca los
handles, elimina las referencias a registros y pools, vacía las colecciones y cierra
el ámbito. No crea archivos con GUID completos. La eliminación de referencias permite
la recolección de memoria de JavaScript; no garantiza borrado físico inmediato ni puede
revocar cadenas copiadas deliberadamente fuera del ámbito controlado. Tampoco permite
correlación diferida entre procesos: al terminar el proceso no se conserva la identidad.

### Garantías y pruebas realmente ejecutadas

- Compilación API correcta: TypeScript, contratos y fronteras arquitectónicas.
- 36 pruebas unitarias/sintéticas del observador aprobadas: 25 anteriores y 11 nuevas.
- Cobertura de identidad completa tras cierre, SID reutilizado con otro login_time,
  connection_id distinto, identidad incompleta, descarte y uso posterior rechazado.
- Cobertura de JSON/logs/errores sanitizados con GUID y errores exclusivamente sintéticos,
  observación pendiente, conexión residual y fallo del observador con limpieza.
- Se mantienen cierre nativo confirmado y correlación exacta; identidad incompleta,
  CONNECTION_STILL_VISIBLE, TRANSACTION_OPEN y fallo de observación siguen siendo fallos.
- Sin esperas, reintentos, cambios de pooling/timeouts, transporte, sesión o parámetros.
- No se ejecutó la suite completa ni integración real: esta etapa autoriza únicamente
  las pruebas dirigidas del observador y las verificaciones de compilación.

### Estado y próximo paso

APTO técnicamente para proponer una nueva ejecución controlada de R8-B, pendiente de
su autorización y de verificar sus precondiciones. No se ejecuta automáticamente.
La corrección no demuestra la causa de la conexión residual, no acepta conexiones
visibles como éxito y no resuelve la intermitencia histórica. L8-C2 permanece abierta.

## L8-C2-R11-C — Única ejecución real posterior a R11-B (22/10/2026)

### Precondiciones y ejecución

Rama feature/arquitectura-persistencia-pai y HEAD
c59b3928ab8e977a7668d82626f4063e10cefb7d confirmados. Once archivos pendientes,
sin staging y git diff --check correcto. Servicio MSSQL$PAIPOC Running. Compilación
API, TypeScript, contratos y fronteras correctos. Observador R11-B disponible.

Se ejecutó exactamente una vez la prueba existente tests/integration/sql-transport.test.mjs,
con PAI_SQL_TRANSPORT_INTEGRATION=1 y reporter TAP. No se modificó la prueba, el
transporte, sus aserciones, pooling ni timeouts. El ejecutor externo solo capturó en
memoria la salida y persistió una proyección de campos técnicos permitidos; no guardó
stdout/stderr crudos, mensajes originales, stacks ni GUID completos.

### Resultado real: fallo previo a las trazas ODBC

- ExitCode 1, sin señal; un test ejecutado, cero aprobados, uno fallido, cero omitidos.
- Categoría pública observada: SQL_QUERY_FAILED. Sin código nativo adicional disponible.
- Duración del test: 6107.3906 ms; proceso observado: 6170.2395 ms.
- Primera salida del proceso: 69.4206 ms; es salida del runner, no respuesta SQL validada.
- Cero registros técnicos de CONNECT/BEGIN/QUERY/ROLLBACK/CLOSE y cero identidades.
- Sin truncamiento y sin error de arranque del proceso.

La prueba llama primero a snapshot(), que ejecuta sqlcmd para verificar ONLINE,
recuento de tablas/datos e historial antes de cargar el controlador y abrir ODBC.
Ese helper transforma cualquier fallo de proceso o de interpretación JSON en
SQL_QUERY_FAILED. La ausencia de trazas y el flujo inspeccionado sitúan el fallo en
esa comprobación inicial, antes de demostrar una conexión ODBC. La categoría pública
no permite distinguir conexión, consulta, error SQL o parseo; la duración por sí sola
no demuestra un timeout. No se atribuye el fallo al transporte Node.js ni a SQL Server.

Clasificación operativa E: fallo técnico de la comprobación inicial. La observación
DMV posterior al cierre NO fue alcanzada; por tanto no existe una nueva clasificación
A/B/C/D sobre conexiones residuales. El antecedente R8-B clase B permanece histórico.

### Alcance no validado y cierre de la intervención

No se alcanzaron las aserciones de parametrización, Unicode/GUID, fechas/booleanos,
bigint, NULL/cadena vacía, binarios, SERIALIZABLE, rollback o cierre nativo del pool.
No se capturaron identidades de leases ni se ejecutó su correlación posterior. El
finally del ámbito permanece en el código existente; esta ejecución no ejerció su
comportamiento con conexiones reales capturadas. No se afirma éxito de esas garantías.

No pudo confirmarse en R11-C el estado ONLINE, las ocho tablas vacías ni el historial:
la comprobación inicial no entregó una respuesta validada y la final no se ejecutó.
No se realizaron consultas posteriores, reintentos, integración adicional, DML, DDL,
migraciones ni cambios del motor. Tras terminar, cero procesos sqlcmd y servicio SQL
Running. Los once hashes de archivos pendientes coincidían con los previos antes de
actualizar exclusivamente este documento y el maestro de continuidad.

Evidencia sanitizada local: %TEMP%\pai-r11c-sanitized-evidence.json. Contiene duraciones,
ExitCode, categoría y contadores del runner, sin salida SQL cruda ni identidades.
L8-C2 se mantiene abierta. La intermitencia histórica sigue sin causa confirmada.
Recomendación: revisar por separado, con autorización, la comprobación inicial
sqlcmd y su clasificación de fallos antes de otra integración ODBC. Sin commit.

## L8-C2-R11-E — Instrumentación mínima del snapshot (22/10/2026)

Implementado para revisión, sin SQL real ni commit. R11-D confirmó que el catch único
del snapshot inicial impedía distinguir fallos del proceso sqlcmd de JSON inválido.
R11-E separa esas etapas; no identifica retroactivamente la causa raíz de R11-C.

### Cambio y contrato conservado

El helper de pruebas tests/helpers/sql-snapshot.mjs recibe una función ejecutora y una
salida opcional de evidencia. No importa child_process, mssql ni msnodesqlv8 y no
contiene un ejecutor SQL. La integración conserva la única invocación execFileSync
existente, encerrada en una función, y pasa al helper su resultado sin alterar datos.
La inyección se utiliza con dobles sintéticos en tests/sql-snapshot.test.mjs; no se
introduce ninguna composición de producción, ruta HTTP o ejecutor SQL alternativo.

Se mantienen literalmente ruta, argumentos, snapshotSql, opciones de captura,
autenticación Windows, Shared Memory, base pai_poc_dev y límites 5/5/15 segundos.
No se añaden opciones sqlcmd, cambios de entorno, esperas ni reintentos. Permanecen
las aserciones de integridad iniciales y la comparación del snapshot final, además
de las condiciones estrictas del observador R11-B y su descarte mediante finally.

### Categorías y evidencia

- SQLCMD_SPAWN_FAILED: códigos ENOENT/EACCES/ENOEXEC compatibles con fallo de arranque,
  sin status, señal ni pid que acrediten ejecución.
- SQLCMD_PROCESS_FAILED: status no cero o señal permitida.
- SQLCMD_PROCESS_TIMEOUT: código técnico ETIMEDOUT, sin inferir timeout de conexión SQL.
- SQLCMD_OUTPUT_FAILED: código ENOBUFS.
- SQLCMD_JSON_INVALID: fallo de JSON.parse o de preparación de su entrada, después
  de retornar el ejecutor; incluye salida vacía.
- SQLCMD_DIAGNOSTIC_UNKNOWN: información insuficiente o no reconocida.

La evidencia contiene exclusivamente etapa PROCESS/JSON, duración, exitCode, señal
permitida, código técnico cerrado, indicadores de stdout/stderr, parseo alcanzado,
parseo satisfactorio y categoría. Las propiedades de excepciones se leen como datos
propios, sin invocar getters. Nunca se utilizan mensajes libres para clasificar.
Las proyecciones están congeladas y no incluyen stdout/stderr crudos, mensajes,
stacks, rutas privadas, GUID completos, resultados SQL ni excepciones originales.

Un dato desconocido se representa mediante null. En éxito, execFileSync devuelve
stdout pero no stderr: stderrReceived=null, sin afirmar que no hubo stderr. En fallo,
se inspecciona solo si stdout/stderr propios contienen bytes o texto, sin conservarlos
en la evidencia. El resultado JSON válido vuelve a las aserciones existentes en memoria.
Los fallos de ambas etapas conservan la excepción pública SQL_QUERY_FAILED, sin
cause, stack ni detalles originales. Un fallo del receptor opcional de evidencia no
sustituye el fallo principal ni cambia el resultado funcional del snapshot.

### Validación ejecutada y límites

21 pruebas sintéticas dirigidas aprobadas, cero fallidas. Incluyen arranque rechazado,
status no satisfactorio, ETIMEDOUT, señal, exceso de buffer, diagnóstico ausente,
propiedades/getters no confiables, salida vacía, JSON inválido/válido, privacidad,
receptor de evidencia fallido y conservación de opciones y aserciones de integración.
Compilación API, TypeScript, contratos y fronteras correctos. No se ejecutó integración
ODBC, sqlcmd, consultas SQL ni la suite completa. Los 36 casos del observador son el
antecedente R11-B y no una nueva ejecución en esta etapa.

APTO técnicamente para una única nueva integración controlada, previa autorización
y comprobación de precondiciones. No se ejecuta automáticamente ni se cierra L8-C2.
La clasificación describe el proceso o el parseo, no prueba por sí sola una causa de
conexión SQL. La intermitencia histórica y la conexión residual siguen sin causa
confirmada; esta instrumentación debe contrastarse en una ejecución real posterior.

## L8-C2-R11-F — Ejecución controlada y decisión técnica (22/10/2026)

### Precondiciones y alcance

Rama feature/arquitectura-persistencia-pai y HEAD
c59b3928ab8e977a7668d82626f4063e10cefb7d confirmados. Trece archivos pendientes,
sin staging, servicio MSSQL$PAIPOC Running y git diff --check correcto. Compilación
TypeScript de API, contratos y fronteras aprobados. Se ejecutó exactamente una vez
la integración existente con opt-in, sin cambiar código, SQL, argumentos, entorno de
sqlcmd, pooling, timeouts o aserciones. Sin reintentos ni consultas SQL posteriores.

### Resultado global

RESULTADO 3: CONNECTION_STILL_VISIBLE. Clasificación de observación B: una identidad
compuesta permanece visible sin transacción activa. Un test ejecutado, cero aprobados,
uno fallido, cero omitidos. ExitCode del runner 1, sin señal. No se convierte B en éxito.

Duración del test: 384.2152 ms. Proceso de pruebas observado: 443.1644 ms; primera salida
recibida del runner a 67.4360 ms (no es una medición de respuesta SQL). Sin truncamiento
ni fallo de arranque. Evidencia filtrada: %TEMP%\pai-r11f-sanitized-evidence.json.
El filtro externo dejó una etiqueta de etapa como REDACTED; no se reconstruye salida
cruda ni se cambia evidencia. Las etapas necesarias para el dictamen sí se conservaron.

### Snapshot y parametrización

Snapshot inicial aprobado y JSON interpretado: etapa JSON, duración 134.5032 ms,
ExitCode de sqlcmd 0, señal null, technicalCode null, categoría null,
stdoutReceived=true, stderrReceived=null (no observable en éxito con execFileSync),
parseReached=true y parseSucceeded=true. Las aserciones iniciales de ONLINE, ocho
tablas funcionales, cero registros y migración/hash UpSha256 esperado pasaron.
Esto no sustituye una nueva huella completa del catálogo como la de R10-C.

Conexión Shared Memory y autenticación integrada aprobadas por las aserciones del
archivo existente. Pasaron Unicode, GUID, fecha/milisegundos, bit, bigint máximo exacto,
binarios no vacíos, rowversion, NULL textual y cadena vacía. Los rechazos de binario
vacío binary/varbinary se ejecutaron con cero llamadas input y query en cada control.
No se ejecutó ni se añadió ningún DML, DDL o commit de escritura.

### Transacción y cierre

SERIALIZABLE comprobado, @@TRANCOUNT=1 y XACT_STATE()=1 durante la transacción principal.
Trazas principales aprobadas: CONNECT 30.6722 ms, BEGIN 29.6462 ms,
QUERY 10.3361 ms y 6.8181 ms, ROLLBACK 0.8087 ms y CLOSE 2.3577 ms.
assertLeaseClean pasó para los tres leases: cierre nativo invocado y resuelto,
rollback/estado transaccional limpio y pool local liberado según las aserciones.
La resolución del cierre nativo no se presenta como desaparición física inmediata.

### Correlación exacta y conexión residual

Las identidades completas se capturaron y compararon exclusivamente en memoria con
session_id + login_time + connection_id. Los logs solo contienen SID, hora local del
servidor y huella abreviada; la huella no sustituye la clave de consulta DMV.
El finally de R11-B descarta las referencias controladas al salir por el fallo.

- Lease 1: SID 67, login_time local 2026-10-22T15:28:50.547,
  huella e83f0d849d3fec92; sin coincidencia residual exacta.
- Leases 2 y 3: SID 67, login_time local 2026-10-22T15:28:50.597,
  huella e83f0d849d3fec92; ambos correlacionaron una identidad todavía visible.
- Observador independiente: SID 68, login_time local 2026-10-22T15:28:50.610,
  huella c9e563b8f276e7ca; no se confunde con la identidad buscada.

Los dos últimos leases compartieron la identidad observada; no se cuentan como dos
conexiones físicas residuales independientes. Las observaciones POST_CLOSE de esa
identidad fueron sleeping, transactionCount=0, activeUserTransactions=0,
activeRequests=0, blockedRequests=0 y waitingRequests=0. transactionState=null es el
valor deliberado de la consulta DMV, no una medición XACT_STATE()=0 en esa sesión.
La visibilidad está demostrada en esos instantes; su duración posterior y causa no.
No demuestra fuga permanente, ni confirma pooling ODBC como causa raíz.

### Estado final y decisión

El fallo por conexión visible ocurrió antes del snapshot final: NO quedó verificado
el estado final de las ocho tablas ni la comparación final del historial. Solo se
acredita su estado inicial vacío. No hubo cambios persistentes intencionales: la
prueba contiene lecturas y transacciones terminadas en rollback. No se hicieron
consultas adicionales para suplir la verificación final no alcanzada.

Tras terminar: cero procesos sqlcmd y cero procesos Node cuya línea de comandos
corresponda al archivo de integración. Esto no demuestra ausencia de sesiones SQL:
la última observación DMV mantuvo una identidad visible. Los trece hashes de archivos
pendientes coincidieron antes de actualizar exclusivamente los dos documentos.

Recomendación: mantener L8-C2 abierta. Bloqueo concreto: la condición estricta de
inexistencia de identidades visibles después del cierre no se cumple, aunque el cierre
nativo se resolvió y la conexión observada no tenía actividad ni transacciones. Para
continuar se necesita autorizar un diagnóstico acotado del cierre físico/pooling o
revisar explícitamente el criterio de aceptación con evidencia; no se relaja en esta
intervención. La intermitencia histórica de sqlcmd tampoco se declara resuelta por
este snapshot satisfactorio. Sin commit, push, PR, merge ni despliegue.

## Ajuste final de aceptación L8-C2 para la PoC (22/10/2026)

Cambio autorizado posterior a R11-G, implementado para revisión, sin SQL real ni commit.
No abre otra subfase de diagnóstico. Los fallos históricos de R8-B/R11-F conservan su
resultado original; el criterio descrito aquí rige la próxima validación autorizada.

La prueba conserva como obligatorios SERIALIZABLE, rollback, cierre lógico/nativo,
operaciones pendientes en cero, identidad completa y correlación exacta. El evaluador
assessResidual solo devuelve CONNECTION_STILL_VISIBLE como advertencia si todas las
coincidencias tienen estado sleeping, cero transacciones/solicitudes/bloqueos/esperas
y ausencia de estado transaccional incompatible. Cualquier identidad incompleta,
actividad incompatible, transacción abierta o fallo de observación sigue bloqueando.
Los controles previos assertLeaseClean y de pool cerrado no se han relajado.

withFinalSnapshot espera que el trabajo termine sus intentos de limpieza y después
intenta siempre una sola verificación final independiente, tanto con advertencia
como con fallo previo, incluso si falló el snapshot inicial. Comprueba ONLINE, ocho
tablas, cero registros, migración/hash inicial esperado y, si existe snapshot inicial,
igualdad completa del snapshot/historial. La consulta y sus argumentos no cambian.
Si no se obtiene o no se valida el snapshot final, finalIntegrityVerified=false y la
prueba falla. La excepción pública de ejecución/JSON sigue siendo SQL_QUERY_FAILED;
una discrepancia de integridad continúa bloqueando como SQL_WORK_FAILED sanitizado.

El reporte finalSnapshot conserva por separado priorFailureCode y finalFailureCode.
Un snapshot correcto no elimina el fallo previo. Si fallan ambos, se conserva el
error principal con finalSnapshotCode adicional; se conserva también cleanupCode
NATIVE_CLOSE_FAILED cuando lo aporta el observador. No se adjuntan errores originales,
stacks ni mensajes libres. No se cambia la política interna de errores del runner de
producción. Como cualquier finally, no garantiza ejecución si el proceso es terminado
externamente; sin evidencia de snapshot final no puede declararse integridad validada.

Las coincidencias inactivas se publican con severity=warning. El resumen de éxito solo
se publica después de pasar la verificación final y todos los controles bloqueantes;
conserva closureWarning y residualCapturedLeases, sin afirmar que las sesiones físicas
desaparecieron. No se confunde cantidad de leases con cantidad de conexiones físicas.
Los GUID completos permanecen en memoria hasta el finally de descarte ya existente.

Archivos ajustados: integración sql-transport, helpers existentes sql-connection-observer
y sql-snapshot, y sus dos pruebas sintéticas; además de este documento y el maestro.
No se modifican odbc.ts, session.ts, parámetros, migraciones ni configuración SQL.
No cambian pooling, timeouts, consultas, opciones, entorno o dependencias. Sin reintentos.

Validación: 81 pruebas sintéticas dirigidas aprobadas (48 observador y 33 snapshot;
57 casos previos y 24 nuevos). Compilación TypeScript, contratos y fronteras correctos.
Se cubren advertencias estrictas, actividad/transacciones rechazadas, identidad
incompleta, observación fallida, snapshot final tras fallo y errores simultáneos
sanitizados. No se ejecutó SQL, sqlcmd ni integración real. No se afirma integridad
actual de la base a partir de estas pruebas con dobles.

Dictamen: APTO para una única validación real final, previa autorización. L8-C2 sigue
abierta hasta revisar esa evidencia; ni la causa del pooling ni la intermitencia
histórica se declaran resueltas. No se implementaron repositorios ni conexión SQL HTTP.

## Validación real final de L8-C2 — 22/10/2026

Dictamen: APTO_PARA_CIERRE_L8C2, pendiente de revisión del usuario. No se cierra la
etapa automáticamente ni se inicia L8-D. Sin commit, push, PR, merge o despliegue.

### Precondiciones y ejecución única

Rama feature/arquitectura-persistencia-pai y HEAD
c59b3928ab8e977a7668d82626f4063e10cefb7d confirmados. Trece archivos pendientes,
staging vacío, servicio MSSQL$PAIPOC Running. Compilación API, TypeScript, contratos,
fronteras y git diff --check correctos. La disponibilidad de pai_poc_dev se confirmó
en el snapshot inicial de la única prueba, sin consultas preliminares adicionales.

Se ejecutó exactamente una vez la prueba existente tests/integration/sql-transport.test.mjs
con PAI_SQL_TRANSPORT_INTEGRATION=1. Un test aprobado, cero fallidos, cero omitidos.
ExitCode 0, señal null, sin fallo de arranque ni truncamiento. Duración del test
389.8778 ms; proceso observado 438.5527 ms. No se alteró código, SQL, configuración,
argumentos, pooling o timeouts. Sin reintentos ni modificaciones persistentes intencionales.

### Resultados obligatorios

- Snapshot inicial aprobado: ONLINE, ocho tablas funcionales, cero registros y
  migración/hash UpSha256 esperado. Duración 167.4168 ms, ExitCode de sqlcmd 0,
  etapa JSON, parseReached=true, parseSucceeded=true, categoría/código técnico null.
- Conexión Shared Memory y autenticación integrada aprobadas.
- Parametrización aprobada: Unicode, GUID, fecha con milisegundos, bit, bigint exacto,
  binarios no vacíos, rowversion, cadena vacía y NULL textual.
- Binarios vacíos binary y varbinary rechazados antes de input/query.
- SERIALIZABLE comprobado. Rollback correcto; antes del cierre @@TRANCOUNT=0 y
  XACT_STATE()=0. Sin operaciones pendientes/prestadas según assertLeaseClean.
- Cierre lógico/nativo invocado y resuelto en los tres leases; pools locales liberados.
- Observación independiente correcta mediante identidad compuesta completa en memoria.
- Snapshot final aprobado: duración 34.4683 ms, ExitCode de sqlcmd 0, etapa JSON,
  parseSucceeded=true. finalIntegrityVerified=true, priorFailureCode=null y
  finalFailureCode=null. Igualdad del snapshot completo e historial inicial/final.
- Confirmadas ocho tablas funcionales sin registros persistentes y base ONLINE al
  finalizar. Historial de migración sin cambios. No se recalculó una nueva huella
  completa del catálogo: esa comprobación pertenece al antecedente R10-C.

En ambos snapshots stdoutReceived=true; stderrReceived=null indica desconocido en
la interfaz exitosa execFileSync, no prueba ausencia de stderr. No se publicaron
salidas crudas, credenciales, mensajes originales, stacks ni connection_id completos.
Las categorías de fallo y errores públicos sanitizados se conservan; no hubo fallos
reales en esta ejecución para ejercitar esas ramas. Sus pruebas son las sintéticas.

### Advertencia física conservada

El lease 1 no tuvo coincidencias residuales. Los leases 2 y 3 compartieron la identidad
observada: SID 51, login_time local 2026-10-22T15:42:05.160, huella abreviada
d0ce3121d39fe475. Esta identidad permanecía sleeping, con transactionCount=0,
activeUserTransactions=0, activeRequests=0, blockedRequests=0 y waitingRequests=0.
transactionState=null corresponde al diseño de la consulta DMV; no se confunde con
una ejecución XACT_STATE() sobre esa sesión. No se cuentan dos conexiones físicas
por existir dos leases asociados a la misma identidad.

Se registró CONNECTION_STILL_VISIBLE con severity=warning y residualCapturedLeases=2,
conforme al criterio autorizado de la PoC. No se afirma desaparición física inmediata
ni se declara la advertencia un error de cierre lógico. Los GUID completos se usaron
solo en memoria para correlación exacta y sus referencias controladas se descartaron
en finally. La causa específica de la retención y su duración siguen sin demostrarse.

### Cierre de la intervención y límites

Cero procesos sqlcmd y cero procesos Node identificados con el archivo de integración
tras finalizar. Esto no es una consulta DMV posterior ni prueba desaparición física.
Los trece archivos pendientes conservaron sus hashes durante la ejecución; después
se actualizaron exclusivamente este documento y el maestro de continuidad.

No se realizaron escrituras funcionales, DDL, migraciones, cambios de permisos o
configuración, instalación de dependencias, conexiones Azure o integración SQL/HTTP.
Las 81 pruebas sintéticas corresponden al ajuste anterior; no se repitieron en esta
validación real. Evidencia sanitizada: %TEMP%\pai-l8c2-final-sanitized-evidence.json.

Recomendación: aprobar el cierre técnico local de L8-C2 bajo el alcance de la PoC,
conservando la advertencia física y los límites de propagación de errores del driver.
Una ejecución satisfactoria no resuelve la intermitencia histórica ni valida todavía
repositorios SQL, escrituras funcionales, identidad no administrativa o despliegue.
La decisión formal de cierre y cualquier siguiente etapa requieren autorización.

## L8-D1 — Cierre aprobado de L8-C2 y diseño del primer repositorio (22/10/2026)

Por autorización expresa del usuario, L8-C2 queda APROBADA para la PoC local.
La integración real final tuvo ExitCode 0 y duración de test 389.88 ms (389,88 ms).
Parametrización, SERIALIZABLE, rollback y los tres cierres lógicos fueron aprobados,
sin operaciones pendientes ni transacciones abandonadas detectadas. Snapshot final
correcto: ocho tablas funcionales vacías e historial conservado. La identidad sleeping
sin actividad ni transacciones se conserva como advertencia física no bloqueante
CONNECTION_STILL_VISIBLE. No se afirma que pooling sea la causa demostrada.
La intermitencia histórica de sqlcmd no está resuelta. Este cierre no incorpora
repositorios SQL, escrituras funcionales, despliegue ni conexión SQL a HTTP.

L8-D1 es preparación de diseño; no se implementa todavía un repositorio. Se contrastaron
application/ports/repositories.ts, unitOfWork.ts, domain/entities.ts, domain/types.ts,
el adaptador de memoria, los codecs/sesión SQL y la migración 0001_initial/up.sql.
Hay siete repositorios para ocho entidades: Dependency tiene tabla, pero no contrato
propio de repositorio; no se inventa uno.

Orden recomendado: ActivityRepository, FichaRepository, UserRepository,
AssignmentRepository, AuditRepository, ReportRepository e IdempotencyRepository.
AuditRepository precede al uso funcional de las escrituras de reportes. Los métodos
mutadores de usuarios/asignaciones tampoco se habilitarán operativamente sin el
contexto transaccional y la auditoría correspondiente. SQL UnitOfWork y la composición
completa son incrementos posteriores, no siete commits o transacciones independientes.
La selección es técnica: comenzar por lectura y mapeo, luego identidad/asignaciones,
y finalmente escrituras, auditoría y resultado histórico idempotente coordinados.

Primer repositorio propuesto: SqlActivityRepository implements ActivityRepository,
recibiendo solo SqlSession. Métodos findById(ActivityId) y listByFicha(FichaId).
Tabla pai.Activities: Id varchar(64) BIN2 PK, FichaId varchar(64) BIN2 FK a pai.Fichas,
Description nvarchar(max), RV rowversion e InsertionOrder bigint IDENTITY, no nulos.
Mapeo id/fichaId mediante identifier, description mediante unicodeText y version con
rowversion.decode: ocho bytes a token rv1 hexadecimal, sin convertir a number.
InsertionOrder conserva el orden de lista y no se incorpora a la entidad Activity.

SELECT de columnas explícitas con parámetro @id varchar(64), o @fichaId varchar(64)
y ORDER BY InsertionOrder ASC. Sin interpolación, SELECT *, filtros de autorización,
juicios de vigencia, joins innecesarios ni commits propios. Cero filas significa null
en findById y [] en listByFicha. La FK no obliga a consultar otro repositorio para
realizar estas lecturas. No se inventa un método de creación de actividades.

El runner existente mantiene SERIALIZABLE y la vida de la sesión; la prueba técnica
puede usar run('rollback', ...) y construir el repositorio dentro del callback.
El repositorio no abre/cierra pools, no inicia transacciones y no reemplaza UnitOfWork.
Lectura y rowversion no requieren expectedVersion; las escrituras posteriores sí
conservarán control optimista en la misma transacción, auditoría e idempotencia.

Archivos previstos, NO creados ni modificados en L8-D1:
- api/src/infrastructure/sql/repositories/activity.ts.
- api/tests/sql-activity-repository.test.mjs.
- api/tests/integration/sql-activity-repository.test.mjs (optativa).
- api/scripts/check-boundaries.mjs: alta explícita del nuevo archivo permitido,
  preservando la prohibición de activar SQL desde HTTP y sin abrir prefijos genéricos.
- api/tests/types/contracts.ts: comprobación de conformidad, si resulta necesaria.
- Documentación técnica/continuidad pertinente al incremento autorizado.

Pruebas propuestas: sesiones simuladas, parametrización y ausencia de interpolación,
null/[], mapeo exacto de rowversion/Unicode, orden de inserción, independencia de
resultados, errores sanitizados y rechazo al usar la sesión cerrada. El orden SQL se
validará también con varias filas reales cuando se autoricen fixtures. La base vacía
permite inicialmente solo validar lecturas vacías por ODBC. Una lectura positiva exige
autorización posterior de preparación sintética aislada; no se usará sysadmin para
habilitar escrituras funcionales ni se crearán fixtures en esta etapa.

Limitaciones a resolver en incrementos de escritura: el transporte actual convierte
fallos de consulta en SQL_QUERY_FAILED; no se asume disponible el número SQL original
para mapear duplicados. Deben diseñarse comprobaciones semánticas dentro de SERIALIZABLE
o una ampliación mínima autorizada, sin modificar hoy el transporte. Además, Version
sigue siendo opaca en L2: un token L2 válido que no corresponda a la RV actual no debe
convertirse accidentalmente en un error de codec en vez del conflicto esperado.
findByIds de fichas debe preservar deduplicación y orden de entrada; actividades y
asignaciones deben conservar InsertionOrder. Idempotencia conserva el resultado
histórico completo, no una nueva lectura del reporte actualizado.

En L8-D1 solo se actualizan este documento y el maestro, preservando el resto de los
trece archivos pendientes. Sin staging, commit, SQL real, DML/DDL, migraciones,
instalaciones, cambios de permisos o del motor. No se ejecutaron nuevamente pruebas;
81 pruebas sintéticas y la integración real aprobada corresponden al cierre anterior.
Implementación del primer repositorio pendiente de aprobación del diseño.
