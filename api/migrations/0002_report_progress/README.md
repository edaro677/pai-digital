# 0002_report_progress — propuesta Paso 278

**Preparada, no ejecutada.** No modifica 0001_initial, concede permisos ni habilita
envío institucional. Los scripts requieren revisión y autorización posteriores.

| Estructura | Contenido y relaciones |
|---|---|
| ActivityGoals | ActivityId/GoalId, RV y FK a Activities. Solo identidad/pertenencia; no inventa reglas de metas. |
| ReportEvidence | Declaración, destino actividad/meta, referencia opaca, nombre Unicode, MIME, tamaño bigint exacto, autor/UTC, RV histórico del reporte, RV propio y orden de inserción. FK compuestas exigen actividad del reporte y meta de esa actividad. |
| ReportSubmissions | Una fila inmutable por reporte: origen Abierto, estado Enviado, actor/UTC, versión de política, RV histórico y snapshot completo. FK a reporte/usuario, RV propio. |
| EvidenceVerifications | Una prueba por evidencia/envío: instante, actor autorizado y JSON con versión inmutable, SHA-256, alcance y metadatos. FK a declaración/envío/usuario, RV propio. No almacena archivos. |
| AuditEvents | ProgressJson adicional; dos acciones nuevas. Antes/después e historial append-only conservados. |
| IdempotencyRecords | OutcomeProgressJson y dos operaciones nuevas; conserva resultado histórico completo, unicidad de scope y RV. |

Reports conserva sus estados técnicos y su RV controla el agregado completo.
No se asigna Abierto a los reportes existentes: una política confiable debe
certificar ese origen. Solo el envío aceptado persiste Enviado y su snapshot.
No se implementan reapertura, devolución o cierre. Los RV propios nuevos no
sustituyen el token del reporte ni habilitan actualizaciones de historia.

El snapshot conserva declaraciones y pruebas. Al leer se compara el inventario
de EvidenceVerifications, su actor/instante y JSON con el snapshot, sin reconstruir
resultados históricos. La prueba describe el objeto verificado en ese instante;
no garantiza retención futura en un proveedor aún no implementado.

## Código preparado, sin activación HTTP

SqlProgressRepository implementa progress. Auditoría e idempotencia aceptan las
nuevas variantes solo en modo explícito. SqlUnitOfWork(runner, {progress:true})
integra las ocho fachadas sobre la misma sesión SERIALIZABLE y verifica metadatos
antes del callback. Incompatibilidad/falta de visibilidad produce
SQL_SCHEMA_INCOMPATIBLE; errores de consulta conservan su clasificación sanitizada.

La composición HTTP existente no pasa esa opción. No hay variable nueva ni
fallback a memoria. Siguen faltando política institucional completa y verificador
confiable; el esquema compatible no otorga autorización de envío.

## Archivos y aplicación futura

- Los tres scripts exigen coincidencia exacta entre DB_NAME() y el destino
  declarado en pai.migration.database; la lista cerrada contiene pai_poc_dev y
  pai_poc_migration_test. El arnés Paso 279 solo permite la segunda base y master
  para crear/comprobar/eliminar esa misma base.
- up.sql exige PAIPOC, SQL Server 2022 local por Shared Memory,
  identidad administrativa, aprobación y exactamente 0001_initial. Recalcula la
  huella base con la serialización original; aborta ante cambios, repetición o
  artefactos parciales. DDL e historia 0002 son una transacción.
- verify.sql es de solo lectura: manifiesto/historial, huella, objetos y
  restricciones habilitadas/confiables. No prueba integridad de archivos del cliente.
- down.sql aborta si hay metas, declaraciones, envíos, pruebas o historia nueva
  en auditoría/idempotencia. No elimina datos para conseguir revertir. Solo con
  esas estructuras vacías restaura y compara la huella original.
- sha256.json fija los tres scripts y el up.sql original. Comprobar archivos
  externamente antes de cargar hashes en SESSION_CONTEXT.

Antes de autorizar: revisar diff/manifiesto, respaldar, detener escritores y
ensayar up/verify/down en una copia local desechable. Los dobles no validan
sintaxis DDL, restricciones ni atomicidad real de SQL Server. No se conectó al
servidor en esta intervención.

La conexión administrativa sin transacción previa requerirá el nombre exacto
en pai.migration.database, pai.migration.approval=LOCAL_PROGRESS_0002 y pai.migration.upSha256,
pai.migration.verifySha256, pai.migration.downSha256 conforme al manifiesto.
No se incluye aplicación automática.

Permisos futuros sujetos a aprobación separada: SELECT de las cuatro tablas
nuevas; INSERT en ReportEvidence, ReportSubmissions y EvidenceVerifications;
UPDATE de OutcomeProgressJson en IdempotencyRecords. Se reutilizan los permisos
existentes de reportes, auditoría e idempotencia. Sin DELETE, DDL ni escritura
runtime sobre ActivityGoals o pai_meta. El aprovisionamiento del catálogo de
metas requiere una decisión institucional. No se prepara ni aplica GRANT.

El plan de aplicación deberá fijar la huella esperada tras los permisos aprobados:
la serialización incluye pai_api_runtime. No cambiar silenciosamente huellas
históricas. No habilitar escritores mixtos 0001/0002 después de crear envíos;
la activación posterior debe coordinar composición y proveedores.

Validación: TypeScript/contratos/fronteras, 24 pruebas nuevas con transporte
simulado y suite API 914/914. Incluye autorización, parámetros, Unicode, versiones,
metas, replay, snapshots históricos, discrepancias persistidas, rollback ante
fallos y contexto cerrado. No equivale a una migración aplicada ni a SQL real.

```powershell
npm --prefix api run build
node --test api/tests/sql-progress.test.mjs api/tests/report-progress.test.mjs
```

## Paso 279 — ensayo real detenido, base desechable eliminada

Se comprobó SQL Server 2022 Developer/PAIPOC, Shared Memory, sysadmin disponible
en la identidad actual y ausencia de pai_poc_migration_test. No se elevó ningún
privilegio. Se creó únicamente esa base, con marca aleatoria de propiedad y
registro local de database_id/create_date para impedir reutilización o borrado
de una base desconocida. No se abrió ninguna conexión a pai_poc_dev.

El intento nativo de 0001 terminó HYT00; la comprobación posterior encontró cero
tablas pai/pai_meta, cero solicitudes ajenas y cero transacciones de usuario en
la base desechable. No se completó la aplicación de 0001 ni se alcanzó 0002.
El intento mediante sqlcmd tampoco alcanzó la migración: se confirmó Shared
Memory 258, login timeout y demora de prelogin. No se demuestra defecto DDL de
0002 ni causa raíz del transporte; no se cambiaron límites, permisos o servidor.

Se detuvo el ensayo. La limpieza final usó la conexión nativa administrativa a
master, comprobó exactamente nombre, database_id, create_date y marca de
propiedad; eliminó solo la base desechable y confirmó DB_ID ausente. No se usó
SINGLE_USER, KILL ni ROLLBACK IMMEDIATE. Evidencia técnica sanitizada en
api/.test-tmp/paso279/evidence.json, ignorada por Git.

Cambios preparados: control de destino explícito y manifiesto recalculado con
SQL en LF conforme a .gitattributes. 0001 permanece intacta. El arnés operatorio
api/tests/integration/sql-migration-0002.mjs conserva las etapas create/up/test/
down/drop, cada una explícita y limitada al destino desechable. El verifier de
0001 previsto es la revisión R1 ya aprobada para su conflicto de colación,
conservando hashes e historial originales. Las etapas posteriores no se han
validado realmente y no deben presentarse como aprobadas por sus dobles.

Dictamen del ensayo: **NO APTA todavía para aplicación posterior**. Falta validar
up/verify, comportamiento, rechazo de down con datos y reversión limpia en SQL
Server. El bloqueo observado es de ejecución/conexión, no un defecto de esquema
demostrado. No se repite automáticamente este ensayo.

### Reintento posterior solicitado por el usuario

El usuario autorizó un nuevo intento. La etapa CREATE terminó HYT00 antes de
iniciar UP; no se ejecutaron migraciones ni fixtures. Una lectura independiente
de DB_ID confirmó que pai_poc_migration_test existe tras el intento. Las lecturas
de su identidad completa/marca de propiedad también terminaron HYT00, por lo que
no se pudo correlacionar con seguridad con el registro de propiedad anterior.
Se conserva la base desechable y no se fuerza DROP. La ausencia confirmada del
apartado anterior corresponde exclusivamente al primer ensayo, no al estado
posterior a este reintento. pai_poc_dev no fue accedida. Estado actual: bloqueado,
con limpieza pendiente de identificación inequívoca de la base desechable.

### Revalidación y correcciones del arnés administrativo

Dos lecturas independientes con SqlClient confirmaron posteriormente ausencia de
la base. La conclusión anterior de existencia no quedó corroborada; no debe
tomarse como inventario actual. No se borró una base desconocida.

Se preparó sql-migration-0002.ps1: SqlClient integrado, Shared Memory, pooling
deshabilitado en el arnés administrativo y destino fijo. No modifica ODBC de la
aplicación. Corrige parámetros SESSION_CONTEXT incompatibles con sql_variant
(15600: usar nvarchar acotado), aprobación/hash de R1 ausentes (51031) y conversión
PowerShell que convertía byte[] de RV a object[] al usar una expresión if.
Los bytes se conservan y clonan explícitamente; JSON grandes mantienen nvarchar(max).
La lectura consume todos los resultados y elimina lector/comando. Se preserva
UTF-8/Unicode y cada ejecución archiva evidencia sanitizada independiente.

Resultado real nuevo: 0001 aplicada, R1 correcta, 0002 aplicada y verify.sql
correcto. También terminó la preparación sintética. El comportamiento posterior
se detuvo por la conversión del arnés; su corrección tiene prueba aislada, pero
el flujo completo de envío/down todavía no quedó validado en el servidor.

Se observó presión de memoria real: ERRORLOG con 802/17300 recientes y DMV con
process_physical_memory_low=true. SQL tenía max server memory 2048 MB, sin cambios;
Windows disponía aproximadamente de 1,2 GB físicos libres sobre 16 GB. No se
demostró que todos los HYT00 históricos tengan una única causa. Cambiar de
cliente no eliminó todos los fallos: otro intento también agotó tiempo antes de
escribir, por lo que no se declara reparado el servidor ni estable la conexión.
El arnés ahora rechaza presión física/virtual señalada por SQL antes de CREATE.

La última base propia restante se eliminó con SqlClient desde master tras
comparar nombre, ID, create_date y propietario exactos; DB_ID ausente confirmado.
No se usó borrado forzado. No se accedió a pai_poc_dev, se cambiaron permisos,
se ajustó memoria global ni se cerraron aplicaciones del usuario. Pendiente
liberar recursos y completar un recorrido íntegro con memoria estable.

Pruebas dirigidas: 73/73 y 12 comprobaciones sintéticas del cliente sin conexión
SQL; TypeScript, contratos, fronteras y diff --check correctos. Entrada vigente
del ensayo futuro, solo con aprobación y base ausente:

```powershell
& api/tests/integration/sql-migration-0002.ps1 -Run
```

La entrada Node anterior quedó retirada: todos sus modos fallan antes de abrir
SQL y muestran el comando directo de PowerShell. El cambio de cliente es local
al ensayo, no una migración de la infraestructura de persistencia de la aplicación.

### Resultado final validado tras liberar memoria

Después de que el usuario liberara memoria, el ensayo directo con PowerShell 7
y SqlClient terminó **OK**, con un segundo recorrido final completo de unos
3,6 segundos. La entrada vigente exige PowerShell 7; no se deben usar los
lanzadores anidados Node/sqlcmd/Windows PowerShell del diagnóstico anterior.

Se aplicaron 0001 y 0002, pasaron R1 y verify.sql, se insertaron seis registros
padre sintéticos y se asociaron evidencia de meta, verificación sintética,
snapshot Enviado, dos auditorías y dos resultados históricos de idempotencia.
La lectura desde una conexión independiente confirmó el snapshot completo,
Unicode y DecimalText exacto. El inventario total fue de 13 filas de ensayo.
No hubo almacenamiento ni verificación institucional de archivos ni HTTP.

La actualización con RV obsoleto no afectó filas. La unicidad del scope rechazó
el duplicado; una FK inválida provocó rollback y otra conexión confirmó que no
persistieron ni la modificación previa ni la meta inválida. down.sql rechazó
datos con 51211; después de limpieza selectiva e inventario vacío, down terminó
correctamente y R1 confirmó catálogo/historial originales. Se eliminó únicamente
la base desechable propia y se confirmó ausencia. pai_poc_dev permaneció intacta.

Evidencia final: api/.test-tmp/paso279/sqlclient-evidence.json y archivo por fecha,
ignorados por Git. El guard de memoria falla antes de CREATE si SQL señala
presión o no puede verificarse el estado. No se cambiaron límites de memoria ni
se cerraron procesos del usuario. Las señales 802/17300 y presión de memoria
quedaron demostradas, pero no se atribuyen todos los timeouts históricos a una
única causa ni se garantiza estabilidad indefinida.

Validación final de código: suite API 917/917; 15 comprobaciones sintéticas del
cliente sin SQL, TypeScript, contratos, fronteras y diff --check correctos.
Dictamen actualizado: **migración apta para aplicación posterior expresamente
autorizada**, dentro del alcance local ensayado. No se aplicó en pai_poc_dev ni
se habilitó envío institucional. Ejecutar directamente, con base ausente:

```powershell
pwsh -NoProfile -File api/tests/integration/sql-migration-0002.ps1 -Run
```

## Paso 281 — aplicación posterior en pai_poc_dev (NO EJECUTADA)

El ensayo anterior valida 0002 en una base desechable. No demuestra salud actual,
respaldo disponible o preparación actual de pai_poc_dev. Las comprobaciones y
la aplicación siguientes requieren autorización posterior; esta sección es un
procedimiento revisable, no un ejecutor automático.

1. **Salud y memoria.** Usar PowerShell 7/SqlClient directo, autenticación Windows
   integrada y límites explícitos (conexión 5 s, consulta 10 s). Consultar las
   señales física/virtual de sys.dm_os_process_memory y salud/memoria del host;
   revisar errores recientes 802/17300. Señal de presión, estado no verificable,
   error de conexión o timeout: detener sin reintentar ni aumentar límites.
   Un error histórico aislado no demuestra presión actual ni estabilidad futura.
2. **Destino e identidad.** Confirmar PAIPOC, SQL Server 2022 Developer,
   DB_NAME() exactamente pai_poc_dev, ONLINE, Shared memory y coincidencia privada
   de la identidad administrativa prevista. Detener escritores/host antes de
   capturar el estado base. No usar PAIPOC_Test para la migración.
3. **Base 0001.** Comprobar hashes originales con manifest.json y la revisión R1
   con su propio manifiesto. Ejecutar R1 con la aprobación original y su contexto
   pai.verifier.revision/verifySha256/downSha256; conservar 0001_initial intacta.
   Exigir historial exacto 0001, catálogo original y ausencia de objetos parciales
   0002. Confirmar y registrar ocho tablas funcionales vacías y cero transacciones
   de prueba abandonadas; si hay datos o cambios no esperados, detener para revisión.
4. **Respaldo recuperable — pendiente.** La identidad autorizada debe generar un
   FULL COPY_ONLY con CHECKSUM a un archivo nuevo, de ruta autorizada y sin
   sobrescribir respaldos. Comprobar RESTORE VERIFYONLY WITH CHECKSUM y restaurar
   realmente ese respaldo en otra base local de nombre/rutas nuevos, usando los
   nombres lógicos obtenidos por RESTORE FILELISTONLY, sin REPLACE. Verificar allí
   catálogo/historial con R1; conservar evidencia de restauración y cadena de
   custodia del archivo, sin credenciales. VERIFYONLY por sí solo no prueba
   recuperabilidad completa. No aplicar 0002 sin esta evidencia y disponibilidad
   del archivo. La creación/restauración/eliminación de esa copia necesitará
   autorización específica; no reutilizar una base desconocida.
5. **Manifiesto 0002.** Recalcular bytes exactos SHA-256 de up.sql, verify.sql y
   down.sql contra sha256.json; comprobar que Git conserva LF según los atributos
   de migrations. Fijar la revisión revisada y no editar archivos entre verificación
   y ejecución. Guardar solo hashes y resultados sanitizados.
6. **Permisos existentes.** El guard actual de up/down exige IS_MEMBER('db_owner')=1
   efectivo en esta base; no exige sysadmin. Comprobarlo sin GRANT ni cambio de rol.
   Para respaldo/restauración se deben acreditar además los permisos existentes
   aplicables, con el operador autorizado. Una cuenta con solo permisos de tablas
   no satisface el guard aprobado: detener, no ampliar privilegios automáticamente.
7. **Aplicación única.** En una conexión nueva a pai_poc_dev, sin transacción
   previa, cargar SESSION_CONTEXT con pai.migration.database=pai_poc_dev,
   pai.migration.approval=LOCAL_PROGRESS_0002 y los tres hashes exactos revisados.
   Ejecutar únicamente up.sql con ese contexto en la misma conexión. El script
   controla su transacción; el ejecutor debe drenar todos los resultados. No usar
   el arnés desechable, no sustituir nombres ni invocar CREATE/DROP DATABASE.
   Ante error o resultado ambiguo, cerrar y registrar; no repetir up automáticamente.
8. **Verificación.** En conexión administrativa independiente, cargar destino y
   hashes y ejecutar verify.sql. Confirmar las cuatro tablas nuevas, columnas,
   índices y FK/CHECK confiables; nuevas variantes de auditoría/idempotencia;
   historial con exactamente 0001 y 0002, hashes originales 0001 conservados y
   huella 0002 coincidente. No esperar que el catálogo completo siga teniendo la
   huella 0001 después de una migración que precisamente cambia su estructura.
9. **Cierre.** Confirmar tablas base y nuevas vacías, historial/catálogo verificados,
   cero transacciones propias/abandonadas y cierre confirmado de conexiones.
   La observación que no pueda realizarse se declara no verificada. Si falla,
   conservar estado/evidencia: no ejecutar down, restaurar ni limpiar automáticamente
   en pai_poc_dev. Cualquier recuperación requiere revisión y autorización separada.

La autorización futura debe identificar destino, operador, revisión/hash y
evidencia del respaldo restaurado. La aplicación no concede permisos adicionales
a PAIPOC_Test ni activa la opción progress de SqlUnitOfWork, un verificador de
archivos, una política positiva o el envío institucional. L8-E4 HTTP duradero
permanece pendiente. No se hizo ninguna comprobación SQL en el Paso 281.
