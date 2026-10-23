# L8-D5 — Integración SQL conjunta con rollback obligatorio

**Estado vigente — 23/10/2026:** L8-D cerrada con dictamen **APTO PARA CERRAR L8-D EN EL ALCANCE DE LA PoC LOCAL**. Resultado real conjunto OK, ExitCode 0, siete repositorios, diecinueve métodos, cincuenta y dos consultas SQL, una sesión/transacción, rollback y cero intentos de commit. Integridad final independiente confirmada. Sin integración SQL/HTTP ni commit. Los intentos fallidos descritos debajo se conservan como historia; no representan el estado vigente.

## Alcance

Un único ejercicio integral de los siete repositorios y SqlUnitOfWork. El escritor debe ejecutarse como PAIPOC_Test; el observador usa otra conexión administrativa exclusivamente de lectura. No se activa SQL en HTTP ni se modifican contratos, migraciones, permisos, odbc.ts o session.ts.

Archivos de prueba:

- tests/integration/sql-unit-of-work.mjs: un arnés con dos modos explícitos (--observe y --writer).
- tests/helpers/sql-joint-work.mjs: fixtures sintéticos, ejercicio de los 19 métodos y coordinación de rollback.
- tests/sql-joint-work.test.mjs: diecinueve pruebas dirigidas tras el cierre y la corrección de presentación; no requieren SQL Server. Las once pruebas originales se conservan.

## Barreras de escritura

El escritor comprueba su identidad Windows y, dentro de la transacción, la identidad SQL, Shared Memory, SERIALIZABLE, @@TRANCOUNT=1, XACT_STATE()=1 y ausencia de sysadmin/db_owner/CONTROL. El observador acredita la conexión del escritor mediante SID de sesión y login_time, obtiene connection_id de las DMV y lo conserva solo en memoria. No se concede lectura global de DMV al escritor.

Los fixtures se insertan mediante la misma SqlSession que reciben los siete repositorios, dentro del runner existente. Un error terminal de dominio obliga a rollback después de las aserciones. Un decorador de pruebas impide invocar el commit nativo incluso si el callback terminara por error normalmente. Las pruebas con dobles verifican ese mecanismo, el rollback por fallos de auditoría/idempotencia y que un fallo de rollback o cierre sigue siendo bloqueante.

Los fixtures incluyen usuario, dependencia, dos fichas, dos actividades y dos asignaciones, con IDs exclusivos. Los datos Unicode, periodos, GUID sintéticos, fechas UTC, cantidades DecimalText y rowversion se comprueban mediante los repositorios. Las listas se insertan con IDs en orden distinto del lexicográfico para verificar InsertionOrder. Las asignaciones deshabilitadas/fuera de vigencia se devuelven sin aplicar una política institucional.

Se reserva idempotencia, se crea un reporte y su auditoría, se finaliza la reserva y se modifica el reporte después. La lectura del resultado histórico debe seguir devolviendo el reporte original. El conflicto por versión obsoleta se prueba al final porque invalida el contexto; no es una prueba de carrera entre conexiones. La auditoría se ejercita con dos append/find y sin métodos de modificación. El rechazo real de duplicados de auditoría no forma parte de esta única ejecución.

## Observación e integridad

El observador recalcula la huella con la serialización exacta del catálogo extraída del verificador R1, cuyos bytes y manifiestos se verifican antes de conectar. Solo ejecuta DECLARE/SELECT/SET de variables locales; no ejecuta la migración ni el verificador transaccional. Comprueba ONLINE, las ocho tablas y sus recuentos individuales, la terna de hashes originales y la coincidencia de CatalogSha256. La comparación final incluye el historial completo recuperado inicialmente.

Un canal TCP efímero limitado a 127.0.0.1 coordina ambos procesos. Solo admite HELLO, CAPTURE y FINISH; no acepta SQL ni credenciales. Es instrumentación local de pruebas, no una API HTTP. Solo se admite un escritor. Los GUID físicos y datos crudos no se escriben en el descriptor ni en la evidencia.

Después de la limpieza, se correlaciona exactamente session_id + login_time + connection_id. Una conexión ausente pasa; una conexión sleeping sin transacciones, solicitudes, bloqueos o esperas genera CONNECTION_STILL_VISIBLE como advertencia. La actividad incompatible, la identidad incompleta y los errores de observación bloquean el resultado.

La verificación final se intenta independientemente del resultado del escritor o del cierre y no puede ocultar un fallo previo. Si no puede completarse, se informa integridad final no verificada. El resultado sanitizado y el descriptor local se guardan en api/.test-tmp/l8d5-joint/, excluido de Git. No contienen identidades personales, cadenas de conexión ni GUID físicos completos.

## Limitaciones

Los dobles no prueban atomicidad real; el resultado SQL debe registrarse aparte. No se demuestra concurrencia entre conexiones, commit duradero, reinicio del backend, integración Entra real, reglas institucionales o autorización funcional con datos operativos. El observador administrativo no realiza escrituras de fixtures. Las secuencias IDENTITY y el contador rowversion pueden avanzar pese al rollback; no se restablecen contadores ni se promete ausencia de ese efecto técnico. La garantía buscada es cero registros sintéticos persistentes y esquema/historial intactos.

Antecedente previo al primer intento: 646 pruebas API aprobadas (635 anteriores + 11 nuevas), TypeScript, contratos y fronteras correctos. En ese corte el resultado conjunto estaba pendiente; el cierre real posterior se registra al final. No se presenta esa regresión histórica como ejecutada nuevamente durante el cierre.

## Resultado del primer intento coordinado — 22/10/2026

Resultado global: FAILED / WRITER_NOT_COMPLETED. El observador terminó con ExitCode 1 después de agotar su límite de coordinación de 600 segundos para el inicio/finalización humana del escritor. Ese límite no es un cambio de los timeouts SQL. En la lectura posterior el descriptor tenía 1390 segundos, no existía listener loopback y no había canal conectado.

El escritor mostró únicamente FAILED / L8D5_CHECK_FAILED, sin el registro L8D5_WRITER_FINISHED. Por el flujo del arnés, ese registro se emite después del bloque que construye y ejercita LocalOdbcTransport, incluso si falla. Su ausencia sitúa el fallo antes de ese bloque; la evidencia pública no conserva un errno de red específico y no permite afirmar ECONNREFUSED como código confirmado. El observador no recibió un resultado del escritor ni capturó identidad SQL. No se llegó a ejecutar el ejercicio de repositorios ni a insertar fixtures en este intento. No se repitió la prueba.

Integridad inicial y final: verificadas. Ocho tablas funcionales presentes y vacías; historial completo idéntico; hashes de scripts originales y CatalogSha256 recalculado coincidentes; cierre del pool del observador confirmado. Clasificación D: no hubo identidad del escritor capturada para correlación. abandonedTransactions=null no se presenta como una comprobación DMV positiva de ausencia de transacciones del escritor. La instrumentación no demuestra rollback SQL conjunto, pues el escritor no inició ese ejercicio.

Pruebas previas: once pruebas sintéticas del arnés y suite API de 646 pruebas aprobadas. TypeScript, contratos, fronteras y build frontend correctos; Vite mantiene el aviso de bundle mayor de 500 kB. Ningún commit persistente, DML funcional, migración, modificación de permisos o activación SQL/HTTP en este intento.

Dictamen: NO APTO para cerrar L8-D; pendiente de una nueva ejecución conjunta expresamente autorizada. Recomendación: coordinar el arranque con la consola PAIPOC_Test ya preparada y ejecutar el escritor en cuanto el observador informe READY, sin cambiar SQL, pooling, timeouts de consultas ni permisos. No se afirma un defecto del transporte, de los repositorios o de SqlUnitOfWork a partir de este fallo de coordinación.

## Segunda ejecución controlada — 23/10/2026

La cuenta PAIPOC_Test y sus permisos se verificaron otra vez en una consola interactiva abierta antes del observador. El servicio PAIPOC estaba detenido al inicio y se puso en marcha sin cambiar su configuración, usuarios o permisos. No se repitió la preparación administrativa. Se preservó la evidencia del primer intento y se ejecutaron once pruebas sintéticas del arnés y fronteras: todas aprobadas. La suite de 646 pruebas completa y el build frontend se mantienen como comprobaciones del 22/10; no se presentan como una nueva regresión completa de hoy.

El observador confirmó READY con integridad inicial correcta. El escritor se conectó al canal dentro de esa ventana y finalizó en FAILED, etapa stateBefore, categoría SQL_WORK_FAILED. Registró una conexión, un inicio de transacción, una consulta, cero operaciones pendientes y cero intentos de commit. El arnés se detuvo antes del primer fixture y devolvió methods=[]. Por tanto, ningún método de los siete repositorios fue validado realmente en esta ejecución.

La apertura utiliza la configuración local forzada lpc:.\PAIPOC con autenticación integrada; la identidad Windows de proceso es PAIPOC_Test por la barrera previa del escritor. La comprobación completa del resultado de estado inicial no pasó. La evidencia no conserva qué campo/aserción concreta de checkState falló ni su valor; no se atribuye el fallo a permisos, identidad, @@TRANCOUNT, aislamiento o transporte sin esa información. SQL_WORK_FAILED es una categoría sanitizada y no constituye un número de error del motor.

rollbackAttempts=1, rollbackSucceeded=true y closeSucceeded=true: se ejecutaron rollback y cierre lógico antes de terminar. Solo se revirtió una transacción previa a fixtures; esto no demuestra atomicidad conjunta Report/Audit/Idempotency ni rollback de cambios funcionales. No se alcanzó el escenario de versión obsoleta, auditoría, resultado histórico o reutilización posterior del contexto.

El snapshot final se intentó pese al fallo y pasó: ocho tablas vacías, historial idéntico y huella del catálogo intacta. El observador cerró su pool y el listener loopback; no quedó canal TCP establecido. Clasificación D: no se capturó identidad física porque la validación inicial precede a CAPTURE. abandonedTransactions=null se mantiene como no verificado independientemente mediante DMV; no se transforma en cero. Los éxitos de rollback/cierre son evidencia de limpieza lógica, no una correlación física completada.

No se repitió la integración. No hubo INSERT, UPDATE, fixtures, commit persistente, DDL, cambios de permisos, pooling, timeouts, ODBC, SqlSession, SqlUnitOfWork, HTTP o autenticación. La evidencia sanitizada se conserva en .test-tmp/l8d5-joint/result-second-20261023.json, excluida de Git.

Dictamen: NO APTO para cerrar L8-D. Próximo ajuste mínimo recomendado, sujeto a autorización: identificar de forma sanitizada el campo concreto de checkState que incumple la precondición y los valores técnicos permitidos, sin relajar condiciones ni repetir la prueba automáticamente. No se rediseña el arnés ni se investiga pooling a partir de este resultado.

## Diagnóstico mínimo y corrección de stateBefore — 23/10/2026

Causa raíz confirmada en el arnés: la expresión HAS_PERMS_BY_NAME(NULL,'SERVER','CONTROL SERVER') devolvía NULL porque la consulta de permisos de servidor requiere NULL en el segundo argumento de esta función. La aserción controlServer===0 recibía null y lanzaba AssertionError/ERR_ASSERTION. sanitizeWorkError, sin modificaciones, convertía ese error interno de comprobación en SQL_WORK_FAILED. No había un número de error SQL ni fallo técnico reportado por ODBC. No era una denegación de permisos.

La instrumentación de pruebas identifica campo, esperado, obtenido, tipo y clase de error antes de la sanitización. Su proyección solo admite valores técnicos y una huella abreviada de la conexión; no expone nombres Windows, login_time crudo, connection_id completo, mensajes originales, stacks o credenciales. Se agregó el modo explícito --state-only para una sola consulta seguida de rollback y cierre, sin llamar a runJoint, fixtureStatements o repositorios.

Corrección funcional mínima en la consulta stateSql:

```diff
- HAS_PERMS_BY_NAME(NULL,'SERVER','CONTROL SERVER') AS controlServer,
+ HAS_PERMS_BY_NAME(NULL,NULL,'CONTROL SERVER') AS controlServer,
```

La aserción sigue exigiendo 0: no se acepta NULL, no se aplica COALESCE ni se amplían permisos. Referencia oficial: https://learn.microsoft.com/en-us/sql/t-sql/functions/has-perms-by-name-transact-sql?view=sql-server-2016 (ejemplo de permiso a nivel servidor con NULL,NULL; NULL para clase o permiso inválido).

Validación dirigida: seis pruebas sintéticas de checkState aprobadas, incluida la condición de que null siga bloqueando, preservación de tipos y ausencia de datos sensibles. No se repitió la suite de 646 pruebas. La consulta original instrumentada, ejecutada bajo PAIPOC_Test, confirmó controlServer esperado 0/obtenido null, con rollback y cierre satisfactorios. Tras la corrección, el mismo modo aislado terminó OK: category=null, diagnostic=null, queryCount=1, writes=0, commitAttempts=0, rollbackSucceeded=true, closeSucceeded=true y technicalFailures=[]. Las evidencias de antes y después se preservaron en .test-tmp/l8d5-state/, excluido de Git.

No se ejecutaron fixtures ni integración conjunta, no se modificaron SqlSession, ODBC, SqlUnitOfWork, contratos, esquema, migraciones, permisos, autenticación o HTTP. No se declara atomicidad funcional SQL ni cierre de L8-D. Dictamen de este ajuste: APTO para autorizar un nuevo intento controlado de L8-D5 con la consola restringida preparada antes de READY; no se inicia automáticamente.

## L8-D5 — Nuevo intento autorizado tras stateBefore correcto (23/10/2026)

Se conserva como antecedente un intento previo del observador que no emitió READY: OBSERVER_PRECONDITION_FAILED, sin escritor, con integridad inicial/final no verificada y cierre del observador confirmado. No se atribuye una causa específica a esa categoría sanitizada.

Con nueva autorización expresa, el observador emitió READY: base ONLINE, ocho tablas vacías, historial y hashes originales válidos y huella del catálogo coincidente. El usuario ejecutó una sola vez el escritor desde la consola PAIPOC_Test preparada. stateBefore y la captura independiente de la identidad escritora pasaron antes del primer INSERT: autenticación integrada, Shared Memory, base pai_poc_dev, identidad restringida sin privilegios administrativos y una transacción SERIALIZABLE activa.

El escritor falló en fixtureInsert con SQL_QUERY_FAILED. El registro contiene connections=1, begins=1, queries=2, methods=[], pending=0, commitAttempts=0, rollbackAttempts=1, rollbackSucceeded=true y closeSucceeded=true. Por el orden del arnés, la segunda consulta corresponde al primer INSERT de fixtures, en pai.InstitutionalUsers (Id, TenantId, DirectoryObjectId, Alias, Enabled), parametrizado y con OUTPUT INSERTED.Id. El error público no conserva un número SQL ni detalle suficiente para distinguir permisos, restricción, enlace de parámetros u otro fallo de ejecución. No se afirma que el INSERT se completara; ningún método de repositorio llegó a ejecutarse.

Se ejecutaron rollback y cierre lógico; no hubo intento de commit ni operaciones pendientes al finalizar. El snapshot final independiente pasó: ocho tablas vacías, historial completo idéntico y catálogo sin cambios. Esto demuestra ausencia de fixtures persistentes tras este intento, pero no valida aún atomicidad conjunta de Report/Audit/Idempotency ni sus métodos positivos.

La correlación exacta de la identidad capturada produjo clasificación B: CONNECTION_STILL_VISIBLE, sleeping, cero transacciones abiertas, solicitudes, transacciones de usuario, bloqueos y esperas. Se registra como advertencia física no bloqueante conforme al criterio aprobado; no es la causa del fallo funcional. El observador confirmó cierre de su pool. No se investigó pooling ni se repitió la integración.

Dictamen: NO APTO para cerrar L8-D. Bloqueo concreto: primera inserción del fixture, categoría SQL_QUERY_FAILED sin causa raíz identificable en la evidencia disponible. Próximo paso mínimo, sujeto a autorización: diagnóstico sanitizado de esa operación específica, sin ampliar permisos ni modificar infraestructura para forzar éxito. No se ejecutó regresión general ni se modificaron ODBC, SqlSession, SqlUnitOfWork, migraciones, autenticación o HTTP. La intermitencia histórica permanece sin causa confirmada. Sin staging, commit, push, PR, merge o despliegue.

## Cierre L8-D y preparación de L8-E — 23/10/2026

Dictamen vigente: APTO PARA CERRAR L8-D EN EL ALCANCE DE LA PoC LOCAL. El usuario autorizó el cierre después del resultado conjunto real OK, ExitCode 0. Se ejecutaron siete repositorios, diecinueve métodos y cincuenta y dos consultas SQL, bajo PAIPOC_Test, autenticación Windows integrada y Shared Memory. Una conexión y una transacción SERIALIZABLE compartidas; rollbackAttempts=1, rollbackSucceeded=true, closeSucceeded=true, commitAttempts=0, pending=0, assertionsComplete=true y sameSessionAtEnd=true. Se rechazó el contexto cerrado, se rechazó una versión obsoleta y se conservó el resultado histórico de idempotencia.

Métodos realmente ejercitados:

| Repositorio | Métodos |
|---|---|
| User | findById, findByIdentity, setEnabled |
| Ficha | findById, findByIds |
| Activity | findById, listByFicha |
| Assignment | findById, listByUserAndFicha, setEnabled |
| Report | create, findById, findByActivityAndPeriod, update |
| Audit | append, findById |
| Idempotency | reserve, complete, findByScope |

Reportes, auditoría, reserva/finalización de idempotencia y fixtures compartieron la sesión y se revirtieron conjuntamente. El observador independiente de solo lectura confirmó integridad inicial y final: ocho tablas funcionales vacías, historial completo intacto, hashes y huella del catálogo coincidentes y cero transacciones abandonadas. Clasificación B: CONNECTION_STILL_VISIBLE, sleeping sin actividad/transacciones, advertencia física no bloqueante. No se afirma que el pooling sea la causa de ese comportamiento ni de la intermitencia histórica. Las lecturas reales conservaron orden, Unicode, DecimalText exacto, UTC, rowversion y resultado histórico.

Evidencia: resultado sanitizado del observador en .test-tmp/l8d5-joint/result.json (ignorado por Git) y salida del escritor compartida por el usuario, que conserva el contador queries=52. No se inventa SID o GUID físico: no están publicados en el resultado sanitizado. Esta intervención de cierre no repite SQL ni la integración. La intermitencia histórica de sqlcmd y los timeouts de catálogo observados anteriormente no quedan declarados resueltos por este éxito.

Se corrigió únicamente la presentación de category del escritor: status OK produce category null; status FAILED conserva la categoría controlada correspondiente o L8D5_CHECK_FAILED. No cambia el estado, las aserciones, el rollback o la clasificación transaccional. Prueba dirigida agregada; archivo tests/sql-joint-work.test.mjs completo: diecinueve pruebas aprobadas, sin SQL real. Las 646 pruebas históricas no se volvieron a ejecutar y no se publican como el total vigente de una nueva regresión completa.

Límites del cierre: no se validaron SQL a través de HTTP, concurrencia real entre conexiones, commit duradero, recuperación/reinicio, integración Entra real ni producción. La prueba demuestra escritura transaccional seguida de rollback, no persistencia de un commit. Las decisiones de vigencia, roles y flujos de Planeación siguen pendientes. No se reabren L8-C2 ni etapas anteriores.

## L8-E — Diseño de composición mínima, todavía sin activar SQL

### Mapa actual

functions/index.ts registra health y functions/fichas.ts. Este último registra las cinco operaciones funcionales (incluidos los reportes; no existe functions/reportes.ts) y llama una sola vez a createLocalQueryHandlers(PAI_API_IDENTITY_CONFIG). En composition/queries.ts se valida la configuración Entra, se construyen reloj, validador real L4-A, una MemoryUnitOfWork vacía y FichaAuthorizationService. Su política isApplicable devuelve false. createApplicationHandlers(identity, work, authorization, clock, tools) entrega la MISMA UnitOfWork a ReadFichaQueries y ReportService y reutiliza los handlers HTTP existentes.

ReadFichaQueries usa contexto users/assignments/fichas para autorización y fichas/activities para las consultas. ReportService utiliza autorización y los repositorios activities/reports/audit/idempotency, dentro de runAtomic. HTTP valida el Bearer antes de consultar; conserva 401 de autenticación, 404 uniforme para ausencia/acceso denegado, 409 para conflictos de reportes y 500 genérico para infraestructura. Los DTO, rutas y capacidades no necesitan cambiar por seleccionar otro adaptador.

### Selección propuesta (NO implementada)

Extender el punto de composición existente con un selector estricto de persistencia local: ausencia o memory conserva MemoryUnitOfWork; sql-local exige selección explícita de arranque y construye una sola SqlUnitOfWork(new SqlSessionRunner(new LocalOdbcTransport(...))) compartida por todos los handlers. Nombre de variable propuesto: PAI_API_PERSISTENCE, con valores memory y sql-local. No se crea ni activa esta variable en esta intervención. Valores desconocidos o configuración SQL inválida deben fallar cerrados mediante los handlers de indisponibilidad; nunca caer silenciosamente a memoria ni tomar datos de conexión desde HTTP. Mantener el contrato actual de createApplicationHandlers; no introducir Router, contexto global, contenedor DI ni un segundo UnitOfWork.

La selección se resuelve una vez por instancia del worker, no por petición. Cada runAtomic continúa creando su sesión/transacción; no compartir transacciones entre peticiones. El controlador nativo se carga de forma diferida SOLO al ejecutar una operación SQL del modo autorizado, después de autenticación. No importarlo incondicionalmente desde functions/index.ts, health o módulos HTTP. Una fábrica pequeña de composición puede construir el adaptador, sin duplicar repositorios. El cargador debe quedar en un único archivo confiable con ruta literal y excepción de frontera acotada, sin aceptar rutas/código de entorno o cliente ni instalar dependencias sin necesidad evaluada.

### Archivos previstos para la futura implementación

| Archivo | Cambio previsto sujeto a autorización |
|---|---|
| src/composition/queries.ts | Selección estricta del adaptador conservando firma/compatibilidad actual, identidad y autorización |
| src/composition/sql.ts (nuevo, solo si se necesita separar la fábrica) | Construcción de SqlUnitOfWork y carga diferida del controlador ya instalado |
| src/functions/fichas.ts | Entregar al punto de composición el selector de arranque; conservar rutas y handlers |
| scripts/check-boundaries.mjs | Permitir únicamente la fábrica SQL y composición concretas; mantener prohibición desde HTTP/health y del resto de cargas dinámicas |
| tests/boundaries.test.mjs | Actualizar la prueba que actualmente prohíbe SQL desde composición, conservando las prohibiciones restantes |
| tests/http-fichas.test.mjs y tests/http-reportes.test.mjs | Equivalencia de DI, memoria por defecto, errores y no acceso SQL antes de autenticar |
| tests/composition-persistence.test.mjs (nuevo propuesto) | Selector cerrado, sin fallback, carga diferida y UnitOfWork compartida mediante dobles |
| src/infrastructure/sql/odbc.ts | Solo si se autoriza: revisar la barrera localOnly para reconocer Core Tools local sin permitir Azure; no cambiar transacciones, parámetros, timeouts o pooling |
| tests/sql-odbc.test.mjs | Cobertura de la barrera local bajo Functions y rechazo de alojamiento remoto |
| README.md y documento maestro | Configuración propuesta/aprobada, identidad restringida, límites y resultados reales |

### Bloqueos y controles antes de habilitar SQL/HTTP

1. check-boundaries prohíbe actualmente la importación SQL desde composición; hay que autorizar una excepción puntual y sus pruebas, no eludir el verificador.
2. localOdbcConfig es fija para PAIPOC/pai_poc_dev; las conexiones Windows usan la identidad del proceso Functions. No ejecutar el host SQL con el observador administrativo ni trasladar a aplicación las credenciales/privilegios del diagnóstico. Validar identidad efectiva no administrativa antes de permitir escrituras; no conceder permisos en esta fase. Las ACL necesarias de Node/Core Tools/Azurite se deben comprobar bajo esa identidad, sin ampliar permisos implícitamente.
3. localOnly en odbc.ts rechaza cualquier WEBSITE_HOSTNAME; assertLocalEnvironment, en cambio, admite localhost/127.0.0.1/[::1] de Core Tools. Es una incompatibilidad potencial real de las barreras, todavía no probada en HTTP SQL. No eliminar marcadores de entorno para eludirla: cualquier ajuste requiere autorización puntual y pruebas negativas para Azure. No se modifica ahora.
4. La política temporal isApplicable=false se mantiene en ambos adaptadores. Seleccionar SQL no habilita usuarios/asignaciones ni permisos por sí mismo. Sin decisión aprobada no se esperan respuestas funcionales positivas con asignaciones reales. Los casos positivos sintéticos se prueban por DI en pruebas, nunca mediante un modo permisivo del host ni identidades falsas operativas.
5. Conservar tenantId+objectId del token, audiencia/emisor/vigencia/scopes/azp validados por L4-A y autorización vigente por ficha/capacidad en la misma transacción de escritura. No añadir caché de decisiones ni aceptar actor/ficha/autorización desde campos del cliente.
6. SqlUnitOfWork usa run('commit') también para consultas. L8-D no probó commit nativo: incluso la primera validación GET con SQL requiere verificar explícitamente ese cierre transaccional. POST/PATCH y persistencia después de reinicio precisan autorización adicional de datos sintéticos y pruebas reales de commit/durabilidad, idempotencia, errores y carreras entre conexiones; no se deducen de las 52 consultas revertidas.
7. La intermitencia local sigue siendo riesgo: conservar errores genéricos, observabilidad sanitizada, cero reintentos ciegos y resultado de commit ambiguo como tal. No fallback a memoria al fallar SQL, ni reejecución automática de escrituras no confirmadas.

Recomendación: implementar primero la selección y composición con dobles, sin activar variables ni abrir conexiones SQL en HTTP. Aceptación: memoria idéntica por defecto, sql-local solo explícito, modo inválido cerrado, health sin carga nativa, JWT/404/409/500 conservados y autorización dentro de runAtomic. Después solicitar autorización separada para el arranque real local bajo identidad restringida y validación HTTP/SQL; la política institucional y los commits persistentes permanecen fuera del cierre L8-D. L8-E queda preparada como diseño, no implementada ni activada.
## L8-E1 — Composición y selección implementadas con dobles (23/10/2026)

Este incremento implementa el diseño previo de selección, sin ejecutar SQL real ni activar valores de entorno. PAI_API_PERSISTENCE ausente o exactamente memory selecciona MemoryUnitOfWork vacía; exactamente sql-local selecciona createLocalSqlUnitOfWork. Valores vacíos, desconocidos, con espacios o mayúsculas distintas fallan cerrados. No se normalizan ni se interpretan como memoria. El punto de composición entrega handlers de indisponibilidad 500 genéricos ante configuración inválida o fallo de construcción SQL; nunca hace fallback silencioso.

functions/fichas.ts entrega el selector a createLocalQueryHandlers. composition/queries.ts selecciona una sola UnitOfWork y reutiliza createApplicationHandlers para ReadFichaQueries y ReportService. Factories opcionales son DI exclusiva de código confiable, no datos HTTP. La política local isApplicable=false se conserva en createLocalAuthorization; su extracción permite probar directamente el comportamiento vigente sin introducir una política nueva.

Nueva composition/sql.ts: construye SqlUnitOfWork sobre SqlSessionRunner y LocalOdbcTransport. La construcción no conecta. createRequire prepara un cargador cuya única ruta permitida es mssql/msnodesqlv8.js; la carga nativa queda diferida hasta connect, bajo las barreras existentes del transporte. Para pruebas, la fábrica recibe SqlTransport simulado. No se creó proveedor de identidad ficticia ni un modo operativo de pruebas en el host.

Las fronteras admiten únicamente que composition/queries.ts invoque composition/sql.ts, y que esta fábrica importe UnitOfWork y los tres módulos SQL constructores. Se mantiene prohibición de SQL directo desde Functions, HTTP, dominio, aplicación y otros adaptadores. Functions solo puede acceder a composition/queries.ts, sin saltar a la fábrica SQL. node:module y las llamadas createRequire/loadNative se limitan al archivo y argumento literales autorizados; importaciones dinámicas generales siguen prohibidas. Pruebas negativas cubren rutas arbitrarias, variables, repositorios directos y acceso desde capas no autorizadas.

Validación final: npm run build correcto (fronteras, contratos TypeScript y compilación). node --test tests/composition-persistence.test.mjs tests/boundaries.test.mjs tests/http-fichas.test.mjs tests/http-reportes.test.mjs: 131 aprobadas, cero fallos. De ellas, 17 son pruebas nuevas de composición y 36 de fronteras; las restantes 78 cubren HTTP sobre dobles/memoria y JWT sintéticos de pruebas, sin conexión institucional. Dos casos nuevos de frontera inicialmente usaron una ruta relativa incorrecta; se corrigieron las rutas de prueba, sin eliminar ni relajar las aserciones. No se ejecutó la suite completa histórica.

Un proceso limpio bloqueó la carga de mssql/msnodesqlv8 antes de importar composición: ambos modos se construyeron y health respondió 200 con nativeLoads=0. Otras pruebas comprobaron fábrica SQL seleccionada exactamente una vez, fallo sin fallback, sanitización de errores, la misma instancia de UnitOfWork para consultas/reportes, autorización temporal denegada y ausencia de acceso a persistencia antes de autenticar. El commit ejercitado en el test de fábrica usa exclusivamente un transporte doble; no demuestra commit real SQL.

No se modificaron ODBC, SqlSession, SqlUnitOfWork, repositorios, contratos L2, autenticación institucional, configuración WEBSITE_HOSTNAME, permisos, migraciones o paquetes. No se crearon ni activaron archivos de entorno ni se inició Functions contra SQL. La selección ya está implementada, pero no constituye autorización de activación real. La incompatibilidad potencial de la barrera WEBSITE_HOSTNAME con Core Tools local se mantiene para L8-E2 y requiere cambio puntual autorizado; no se elude borrando el marcador. La identidad del proceso Functions deberá ser restringida y la política temporal seguirá denegando. Commit duradero, concurrencia entre conexiones, HTTP SQL/Entra reales y producción continúan pendientes.

Archivos de este incremento: src/composition/queries.ts, src/composition/sql.ts (nuevo), src/functions/fichas.ts, scripts/check-boundaries.mjs, tests/boundaries.test.mjs, tests/composition-persistence.test.mjs (nuevo), api/L8D5_Integracion_SQL.md y documento maestro. L8-D permanece cerrada en su alcance validado. Dictamen L8-E1: APTO para preparar L8-E2 bajo nueva autorización, sin iniciarla automáticamente. Sin staging, commit, push, PR, merge ni despliegue.