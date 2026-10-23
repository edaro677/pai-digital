# L8-D5 — Identidad SQL local de pruebas (preparación)

Estado: script preparado y revisado estáticamente; **no aplicado ni probado contra SQL Server**. No se crearon cuentas, logins, usuarios, permisos o fixtures en esta intervención. No se ejecutó SQL real. La autorización de preparación no autoriza los pasos administrativos siguientes.

## Entorno observado y elección

Inspección local de registro y cuentas: PAIPOC tiene LoginMode=1 (Windows), TCP/IP=0 y Named Pipes=0. No existe todavía la cuenta local propuesta `PAIPOC_Test`. La comprobación anterior de L8-D5 identificó privilegios administrativos en la identidad de diagnóstico; no se repitió esa consulta SQL aquí.

Usar una **cuenta Windows local estándar dedicada**, `PAIPOC_Test`, con contraseña administrada por Windows. Mantener autenticación integrada y `lpc:.\PAIPOC`, base `pai_poc_dev`. No habilitar modo mixto, protocolos ni firewall. Crear un login Windows, un usuario de base `pai_l8d5_test_user` y un rol exclusivo `pai_l8d5_test`. No ampliar `pai_api_runtime`, que conserva su política de producción.

El script no crea la cuenta del sistema operativo. Crear un login es necesariamente una operación en la instancia; no se crean usuarios ni se conceden permisos en otras bases. El acceso estándar a master/tempdb mediante public no se presenta como aislamiento absoluto de instancia. Las pertenencias a grupos Windows y los permisos de public deben comprobarse bajo la identidad efectiva antes de DML.

## Script pendiente de aprobación

Archivo: `scripts/sql/prepare-l8d5-test-identity.sql`.

Barreras: destino PAIPOC/pai_poc_dev, motor local SQL Server 2022 o posterior, conexión Shared Memory, ausencia de transacción previa, aprobación explícita SESSION_CONTEXT y cuenta Windows distinta del administrador ejecutor y del propietario de la base. Usa nombres delimitados mediante QUOTENAME. Rechaza usuarios/roles existentes incompatibles, permisos adicionales y membresías inesperadas; no los revoca silenciosamente. Sus variables de permisos son locales, no tablas persistentes.

La configuración de seguridad se aplica en una transacción. Volver a ejecutarlo, con aprobación y bajo las mismas precondiciones, no duplica login, usuario ni membresía y reaplica los mismos permisos. Esto es una propiedad prevista del diseño: **idempotencia y rollback administrativos pendientes de ejecución real**. No modifica objetos funcionales, migraciones, historial ni configuración del motor. No otorga roles administrativos ni CONTROL. Los mensajes deliberadamente no incluyen identidades ni errores originales.

## Confirmación puntual de CREATE LOGIN transaccional

La documentación oficial de Microsoft para SQL Server confirma que `CREATE LOGIN` participa en transacciones: si se revierte la transacción, también se revierte la creación del login, y el login nuevo no puede utilizarse hasta confirmar la transacción. Referencia: https://learn.microsoft.com/en-us/sql/t-sql/statements/create-login-transact-sql?view=sql-server-ver16

Se conserva por ello `CREATE LOGIN ... FROM WINDOWS` dentro del bloque existente, junto con usuario, rol, membresía y permisos. Separarlo no es necesario para SQL Server 2022 y dejaría un login nuevo persistente si fallara después la configuración de la base. Las comprobaciones de seguridad y las condiciones de existencia para la ejecución idempotente no cambian. La creación de la cuenta Windows sigue siendo una operación previa y separada; no queda cubierta por esta transacción SQL.

Esta confirmación es documental y estática. No se ejecutó SQL ni se repitieron pruebas; la aplicación real del script y la comprobación de identidad efectiva continúan pendientes de autorización.

## Permisos concretos

| Objeto | SELECT | INSERT | UPDATE |
| --- | --- | --- | --- |
| pai.InstitutionalUsers | Sí | Sí, fixture | Enabled |
| pai.Dependencies | Sí | Sí, fixture | Ninguno |
| pai.Fichas | Sí | Sí, fixture | Ninguno |
| pai.AccessAssignments | Sí | Sí, fixture | Enabled |
| pai.Activities | Sí | Sí, fixture | Ninguno |
| pai.Reports | Sí | Sí, repositorio | QuantityText, Narrative, State, UpdatedBy, UpdatedAt |
| pai.AuditEvents | Sí | Sí, append-only | Denegado |
| pai.IdempotencyRecords | Sí | Sí, reserva | State, CompletedAt, OutcomeReportId, OutcomeAuditEventId, OutcomeReportJson |
| pai_meta.SchemaMigrations | Sí, verificación | Denegado | Denegado |

Los siete repositorios usan estas ocho tablas: User→InstitutionalUsers; Assignment→AccessAssignments; Ficha→Fichas; Activity→Activities; Report→Reports; Audit→AuditEvents; Idempotency→IdempotencyRecords. Dependencies se necesita para la FK de los fixtures de Fichas. Las cinco primeras inserciones son privilegios exclusivos de prueba; no los necesita la API de producción actual.

Además: CONNECT a la base y VIEW DEFINITION a esta base para ver el catálogo completo, incluida la configuración de `pai_api_runtime`. Sin WITH GRANT OPTION. DELETE y ALTER del esquema pai denegados; ALTER/TAKE OWNERSHIP y escrituras de pai_meta denegados. No hay UPDATE global de tablas ni permisos para alterar identidades, actividad, periodo o fechas de creación. Las restricciones de versiones y relaciones siguen en los repositorios y SQL; este rol no sustituye la autorización por ficha.

**No se concede VIEW SERVER STATE ni VIEW SERVER PERFORMANCE STATE.** El observador actual usa DMV de otras sesiones y de transacciones. En SQL Server 2022 esas lecturas pueden requerir permisos de servidor que no corresponden al escritor. Una identidad de diagnóstico separada debe hacer la observación de solo lectura. No ejecutar la integración actual suponiendo que este rol resuelve automáticamente esa dependencia.

## Procedimiento futuro — requiere autorización administrativa

1. Crear la cuenta local estándar `PAIPOC_Test` mediante administración de Windows, con contraseña introducida en un diálogo seguro. No añadirla a Administrators, grupos de administración SQL u otros grupos privilegiados. No reutilizar una cuenta institucional. No crearla todavía.
2. Conceder acceso de lectura y recorrido al código y a los artefactos ya compilados, Node y ODBC. Usar una carpeta temporal propia para evidencia. Revisar las ACL existentes antes de conceder nada; no conceder Modify a todo D:\PAI, ni acceso a insumos, secretos o al perfil del administrador. Si no es posible dar acceso al directorio sin exponer archivos sensibles, utilizar una copia local saneada del código de pruebas. No se cambiaron ACL en esta preparación.
3. Tras aprobación, el administrador local podrá aplicar **solo** el script preparado. Ejemplo PowerShell desde la raíz del repositorio, no ejecutado:

```powershell
$sqlcmd = 'C:\Program Files\Microsoft SQL Server\Client SDK\ODBC\170\Tools\Binn\SQLCMD.EXE'
$script = Get-Content -LiteralPath 'api/scripts/sql/prepare-l8d5-test-identity.sql' -Raw
$approval = "EXEC sys.sp_set_session_context @key=N'pai.l8d5.identity.approval', @value=N'LOCAL_L8D5_ONLY';`r`n"
($approval + $script) | & $sqlcmd -S 'lpc:.\PAIPOC' -E -d pai_poc_dev -b -l 5 -t 5 -X1 -x
if ($LASTEXITCODE -ne 0) { throw 'Preparacion SQL no completada' }
```

No guardar stdout/stderr crudos de errores administrativos en documentación. Si falla, detenerse; no ampliar permisos automáticamente. Los límites 5/5 de este ejemplo no autorizan cambiar los límites del transporte existente.

4. Abrir una consola interactiva bajo la cuenta dedicada; Windows solicita su contraseña:

```powershell
runas.exe /profile /user:".\PAIPOC_Test" "powershell.exe -NoLogo -NoProfile"
```

No usar `/netonly` (mantendría la identidad local del proceso), `/savecred` ni contraseñas en argumentos. En la nueva consola, situarse en el repositorio y comprobar `node --version`. Ejecutar Node y sqlcmd desde esa consola hace que Trusted_Connection use esa identidad Windows. No basta con cambiar una variable del proceso actual.

Para trabajar también con Codex bajo esa cuenta, iniciar desde la misma consola su ejecutable ya instalado, si está disponible y autorizado, con un perfil propio. No copiar credenciales ni el directorio .codex del administrador. No es necesario ejecutar el editor/agente bajo la cuenta de SQL para aislar las escrituras: puede preparar código con la sesión habitual y ejecutar **únicamente el proceso Node de integración** en la consola restringida. Esta es la opción de menor alcance. No se instala ni configura Codex aquí.

5. Ejecutar primero verificaciones de solo lectura bajo la cuenta restringida (siguiente sección). No iniciar fixtures si una condición no se cumple.

## Verificación efectiva previa a cualquier DML

No basta con inspeccionar el rol ni con EXECUTE AS USER: se debe abrir una conexión Windows real desde el proceso restringido. No publicar el nombre del principal. Consulta propuesta, **no ejecutada**:

```sql
SELECT
 CAST(CASE WHEN ORIGINAL_LOGIN() = CONVERT(sysname,SERVERPROPERTY('MachineName')) + N'\PAIPOC_Test'
   THEN 1 ELSE 0 END AS bit) AS expectedWindowsIdentity,
 IS_SRVROLEMEMBER(N'sysadmin') AS isSysadmin,
 IS_MEMBER(N'db_owner') AS isDbOwner,
 IS_MEMBER(N'db_securityadmin') AS isDbSecurityAdmin,
 IS_MEMBER(N'db_ddladmin') AS isDbDdlAdmin,
 HAS_PERMS_BY_NAME(NULL,N'SERVER',N'CONTROL SERVER') AS controlServer,
 HAS_PERMS_BY_NAME(NULL,N'SERVER',N'ALTER ANY LOGIN') AS alterAnyLogin,
 HAS_PERMS_BY_NAME(NULL,N'SERVER',N'ALTER ANY SERVER ROLE') AS alterAnyServerRole,
 HAS_PERMS_BY_NAME(NULL,N'SERVER',N'CREATE ANY DATABASE') AS createAnyDatabase,
 HAS_PERMS_BY_NAME(NULL,N'SERVER',N'IMPERSONATE ANY LOGIN') AS impersonateAnyLogin,
 HAS_PERMS_BY_NAME(NULL,N'SERVER',N'VIEW SERVER STATE') AS viewServerState,
 HAS_PERMS_BY_NAME(NULL,N'SERVER',N'VIEW SERVER PERFORMANCE STATE') AS viewServerPerformanceState,
 HAS_PERMS_BY_NAME(DB_NAME(),N'DATABASE',N'CONTROL') AS controlDatabase,
 HAS_PERMS_BY_NAME(DB_NAME(),N'DATABASE',N'ALTER') AS alterDatabase,
 HAS_PERMS_BY_NAME(DB_NAME(),N'DATABASE',N'ALTER ANY USER') AS alterAnyUser,
 HAS_PERMS_BY_NAME(DB_NAME(),N'DATABASE',N'ALTER ANY ROLE') AS alterAnyRole,
 HAS_PERMS_BY_NAME(DB_NAME(),N'DATABASE',N'CREATE TABLE') AS createTable,
 HAS_PERMS_BY_NAME(N'pai',N'SCHEMA',N'DELETE') AS deleteFunctional,
 HAS_PERMS_BY_NAME(N'pai_meta.SchemaMigrations',N'OBJECT',N'UPDATE') AS updateHistory,
 HAS_PERMS_BY_NAME(N'pai.AuditEvents',N'OBJECT',N'UPDATE') AS updateAudit,
 HAS_PERMS_BY_NAME(N'pai.Reports',N'OBJECT',N'UPDATE',N'Narrative',N'COLUMN') AS updateNarrative,
 HAS_PERMS_BY_NAME(N'pai.Reports',N'OBJECT',N'UPDATE',N'ActivityId',N'COLUMN') AS updateActivityIdentity;
```

Exigir expectedWindowsIdentity=1, updateNarrative=1 y todos los demás indicadores anteriores=0. NULL no es aprobado. Revisar además `sys.fn_my_permissions(NULL,'SERVER')` y `sys.fn_my_permissions(NULL,'DATABASE')` bajo la cuenta, sin persistir salida cruda; cualquier permiso adicional no previsto exige revisión. Verificar SELECT/INSERT efectivos en las ocho tablas, UPDATE únicamente en las doce columnas listadas, ausencia de DELETE/ALTER y SELECT sin escrituras de SchemaMigrations. Verificar membresías SQL (incluidas las heredadas por grupos Windows) y ausencia de grupos administrativos Windows; un token UAC no elevado no demuestra que la cuenta sea estándar.

No intentar DELETE/DDL para probar una denegación. Las verificaciones son de metadatos/permisos. La conservación de datos se demostrará posteriormente mediante snapshots y rollback.

## Pasos restantes para desbloquear L8-D5

1. Aprobar la creación de la cuenta Windows, sus ACL mínimas y la aplicación del script; todavía no realizadas.
2. Aplicar y verificar la identidad efectiva, sin fixtures ni integración en ese paso.
3. Autorizar la prueba conjunta: escritor Node restringido y observador independiente de solo lectura. Adaptar únicamente el arnés de pruebas si necesita separar el observador; no cambiar ODBC, SqlSession ni HTTP, ni otorgar privilegios globales al escritor.
4. Preparar fixtures sintéticos en la misma sesión/transacción que los repositorios. `SqlUnitOfWork.runAtomic` confirma al terminar normalmente: la prueba deberá provocar un error terminal controlado después de sus aserciones para forzar rollback y registrar por separado que las aserciones terminaron. No confirmar fixtures ni sembrarlos fuera de esa transacción. Probar esto con dobles antes de ejecutar SQL real.
5. Bajo autorización específica, una ejecución real conjunta con comprobaciones inicial/final, auditoría e idempotencia, rollback y cierre lógico. Mantener las identidades físicas completas exclusivamente en memoria. La conexión administrativa no ejecutará escrituras funcionales.

Esta preparación no demuestra atomicidad SQL real, mínimo privilegio efectivo ni cierre de L8-D5. Persisten la intermitencia histórica de sqlcmd y la necesidad de verificar los permisos del observador separado. No se cambió transporte, UnitOfWork, autenticación institucional, esquema ni configuración.

## Referencias técnicas

- CREATE LOGIN y participación en transacciones: https://learn.microsoft.com/en-us/sql/t-sql/statements/create-login-transact-sql?view=sql-server-ver16
- Evaluación bajo el contexto real del usuario: https://learn.microsoft.com/en-us/sql/t-sql/functions/has-perms-by-name-transact-sql?view=sql-server-ver16
- Permisos de DMV de transacciones: https://learn.microsoft.com/en-us/sql/relational-databases/system-dynamic-management-objects/sys-dm-tran-session-transactions-transact-sql?view=sql-server-ver16
- Diferencia de runas /netonly: https://learn.microsoft.com/en-us/windows-server/identity/securing-privileged-access/reference-tools-logon-types

## Corrección SQL 468 y nuevo intento administrativo autorizado

La cuenta Windows PAIPOC_Test ya fue creada y comprobada como estándar habilitada, sin pertenencia a Administradores. El primer intento administrativo devolvió ExitCode 1. Las consultas posteriores de lectura confirmaron ausencia del login, usuario y rol; el análisis estático del lote mediante sys.dm_exec_describe_first_result_set detectó SQL 468 entre Modern_Spanish_CI_AS y Latin1_General_CI_AS_KS_WS en la comparación de permisos.

Se corrigieron únicamente las comparaciones de PermissionName y State entre @Allowed y sys.database_permissions, usando Latin1_General_100_BIN2 explícitamente en ambos operandos. La revisión estática de las demás comparaciones no identificó otro cruce entre columnas textuales de una tabla local y el catálogo: los restantes enlaces entre vistas usan IDs numéricos; las comparaciones con identificadores Windows usan variables o literales, y los SID son binarios. No se cambiaron permisos, controles, transacciones ni condiciones de idempotencia.

SHA-256 anterior: `01F46590D4DA0112E30D6010AD104B53E41687C091B520A811C764C0B13D40FF`.
SHA-256 corregido: `9B8B7802A35EDCEA48A24851329B26C1A00B807053426C43B51F316CE4B8F521`.

Se autoriza un único nuevo intento administrativo con SESSION_CONTEXT, autenticación Windows y Shared Memory contra PAIPOC/pai_poc_dev. Su resultado y la verificación mediante conexión real restringida se registrarán por separado. No se ejecutarán fixtures ni integración L8-D5. Los estados de preparación anteriores se conservan como antecedentes históricos.

### Resultado del único intento con la corrección de colación

El script corregido terminó con ExitCode 0 en 497 ms y devolvió la confirmación preparationApplied=1. Una consulta posterior de solo lectura confirmó el login Windows habilitado, su usuario de base, el rol de pruebas y la membresía correspondiente. La cuenta Windows no se volvió a crear. No se ejecutaron fixtures, DML funcional ni integración L8-D5.

Se inició runas /profile bajo PAIPOC_Test, sin /netonly ni /savecred. El proceso runas finalizó sin generar el resultado del verificador restringido (evidencia todavía NOT_EXECUTED). Por tanto, la identidad SQL efectiva y sus permisos no se presentan como verificados. Queda pendiente el mensaje de la consola antes de decidir el siguiente paso; no se repitió el script administrativo ni se ampliaron permisos.

### Incidencia de inicio de la consola restringida

La consola persistente confirmó runas ExitCode 1 con el mensaje de que no puede adquirir la contraseña del usuario. El verificador sigue NOT_EXECUTED: no se demostró un fallo de contraseña, autenticación SQL ni permisos de la identidad restringida. No se hicieron más intentos automáticos de runas; se indicó iniciar el comando manualmente desde una consola PowerShell nueva abierta por el usuario. La aplicación administrativa exitosa no se repitió y no se ampliaron privilegios.

### Acceso mínimo al ejecutable Node

La conexión real aún no se había iniciado: el verificador se detuvo en READ_EXECUTE_ACCESS. La inspección mostró que la ruta pública de Node es un enlace a una instalación en el perfil de la cuenta habitual y que el ejecutable no concedía acceso a la cuenta de pruebas ni a los grupos estándar inspeccionados. Se añadió exclusivamente ReadAndExecute a PAIPOC_Test sobre el ejecutable y su directorio de versión, sin herencia, recursividad, modificación ni acceso general al perfil. La ejecución bajo la cuenta restringida debe confirmar el resultado; no se modificaron permisos SQL ni se repitió el script administrativo.

La revisión de ACL también detectó permisos Modify heredados para Authenticated Users en el repositorio, anteriores a esta preparación. No fueron concedidos por esta intervención ni se modificaron: las concesiones explícitas de lectura no eliminan esos derechos heredados. No debe afirmarse que el acceso efectivo al repositorio es exclusivamente de lectura hasta revisar esa política de ACL por separado.

### Verificación real y corrección de una expectativa de metadatos

La conexión real bajo PAIPOC_Test alcanzó SQL con ExitCode 0 y confirmó identidad esperada, Shared Memory, ausencia de roles administrativos y de permisos de servidor adicionales, SELECT/INSERT correctos, UPDATE limitado a las columnas esperadas, protección del esquema e historial y cero transacciones abiertas. La única discrepancia fue unexpectedDatabasePermissions=2.

Una consulta suplementaria de lectura, en contexto del usuario de base mediante EXECUTE AS USER y REVERT, identificó VIEW PERFORMANCE DEFINITION y VIEW SECURITY DEFINITION. sys.fn_builtin_permissions confirmó que ambos están cubiertos por VIEW DEFINITION, ya aprobado. Esta consulta suplementaria no sustituye la conexión Windows real anterior ni concede permisos.

Se corrigió únicamente la lista de permisos esperados del verificador temporal para reconocer esas dos implicaciones de SQL Server 2022. No se ejecutaron GRANT/REVOKE, cambios administrativos, fixtures ni integración, y no se relajaron los controles de escritura o administración. Queda pendiente ejecutar de nuevo la verificación de lectura bajo la identidad real con esa expectativa corregida.

### Resultado final de preparación administrativa e identidad efectiva

La verificación real de lectura bajo PAIPOC_Test terminó OK, con ExitCode 0. La evidencia sanitizada confirmó identidad Windows esperada, token Windows sin elevación administrativa, Node ejecutable y arnés legible, conexión Shared Memory a pai_poc_dev, ocho tablas visibles y cero transacciones abiertas. Confirmó SELECT/INSERT previstos, UPDATE limitado exactamente a las columnas autorizadas, ausencia de roles administrativos y de permisos de servidor inesperados, ausencia de DELETE/ALTER y de escritura sobre el historial; lectura del historial disponible.

El verificador reconoce VIEW PERFORMANCE DEFINITION y VIEW SECURITY DEFINITION únicamente como implicaciones del VIEW DEFINITION ya autorizado. No se concedieron privilegios adicionales para obtener el resultado. El script administrativo corregido conserva SHA-256 9B8B7802A35EDCEA48A24851329B26C1A00B807053426C43B51F316CE4B8F521 y fue aplicado una vez satisfactoriamente tras corregir SQL 468.

Preparación de identidad SQL: APROBADA para su alcance. Este resultado no ejecuta ni cierra L8-D5: no hubo fixtures, DML funcional ni prueba de atomicidad real conjunta. La preparación de la integración debe conservar un escritor restringido, el observador DMV separado con acceso de lectura apropiado, rollback de fixtures y snapshots inicial/final. La revisión pendiente de los permisos Modify heredados del sistema de archivos permanece documentada; no fueron eliminados por las concesiones de lectura de esta preparación. La intermitencia histórica de sqlcmd sigue sin causa confirmada.
