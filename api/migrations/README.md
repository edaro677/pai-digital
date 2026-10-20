# Migración inicial PAI — L7-B4

Estado vigente al 20/10/2026: up original aplicado en la base sintética local y verificador auxiliar R1 ejecutado correctamente. Los apartados de L7-B4 conservan el diseño y sus pendientes; la evidencia real y el procedimiento vigente están al final.
Base: `ba6c2b6` (L7-B2 registrada). Diseño: L7-B3 de la conversación, alternativa B.
No hay adaptador SQL, controlador npm, runner o ejecución automática. Existe únicamente la base sintética local pai_poc_dev en PAIPOC, preparada por autorización separada.

## Archivos y decisión de historial

- `manifest.json`: versión, archivos autorizados y SHA-256 de sus bytes exactos UTF-8/LF.
- `0001_initial/up.sql`: ocho tablas `pai`, una tabla técnica `pai_meta.SchemaMigrations`,
  PK/FK/UNIQUE/CHECK, índices y rol SQL sin miembros `pai_api_runtime`.
- `0001_initial/verify.sql`: solo consulta el catálogo e historial, en una transacción.
- `0001_initial/down.development.sql`: reversión exclusiva de un esquema vacío y verificado.
- `.gitattributes`: fija LF para SQL/JSON; evita que autocrlf invalide hashes al clonar.

Se elige tabla técnica frente a propiedades extendidas: una fila reúne versión, fecha,
checksums de los tres scripts y huella del catálogo; es consultable y verificable con SQL
convencional. No es una novena entidad funcional ni exige servicios/dependencias adicionales.
El historial no contiene credenciales. La API no tiene acceso a `pai_meta`.

Cada artefacto se comprueba por SHA-256 antes de abrir un cliente SQL. SQL no lee los
archivos locales ni puede demostrar sus propios bytes: recibe los tres hashes revisados
como contexto de sesión. No hay hash literal del propio script ni dependencia circular.
Un operador que omita la comprobación puede registrar valores falsos; el historial no
es una firma digital ni resiste a un administrador que modifique esquema e historial.
Después de aplicar una versión, no editarla. Un cambio DDL exige otra migración; una corrección de herramientas auxiliares se publica como revisión separada, sin reescribir los originales ni el historial.

## Esquema y correspondencia L2

Todas las PK son `Id varchar(64)` BIN2 con CHECK de longitud y alfabeto técnico.
FK con el mismo tipo/colación; todas son NO ACTION en UPDATE y DELETE.

| Tabla | Columnas aparte de Id | Integridad/consulta |
|---|---|---|
| InstitutionalUsers | TenantId, DirectoryObjectId uniqueidentifier; Alias nvarchar(max); Enabled bit; RV rowversion | UNIQUE tenant/objeto, GUID distinto de cero |
| Dependencies | Label nvarchar(max); RV | Sin unicidad institucional añadida |
| Fichas | DependencyId varchar(64); CycleLabel nvarchar(max); RV | FK dependencia e índice |
| AccessAssignments | UserId/FichaId varchar(64); Capability varchar(40); Enabled bit; ValidFrom/ValidUntil datetime2(3); RV; InsertionOrder bigint IDENTITY | FK usuario/ficha, índice usuario/ficha/orden y ficha |
| Activities | FichaId varchar(64); Description nvarchar(max); RV; InsertionOrder bigint IDENTITY | FK ficha e índice ficha/orden |
| Reports | ActivityId varchar(64); PeriodKey nvarchar(128); QuantityText varchar(max); Narrative nvarchar(max); State varchar(40); CreatedBy/UpdatedBy varchar(64); CreatedAt/UpdatedAt datetime2(3); RV | FK actividad/autores; UNIQUE actividad/periodo; índices autores |
| AuditEvents | ActorId varchar(64); OccurredAt datetime2(3); CorrelationId varchar(64); Action varchar(40); BeforeJson/AfterJson nvarchar(max) | FK actor; índices actor/correlación; append-only para API |
| IdempotencyRecords | ActorId varchar(64); Operation varchar(40); IdempotencyKey varchar(128); RequestFingerprint varchar(64); State varchar(40); CreatedAt/CompletedAt datetime2(3); OutcomeReportId/OutcomeAuditEventId varchar(64); OutcomeReportJson nvarchar(max); RV | FK actor/reporte/evento; UNIQUE actor/operación/clave; índices resultado |

Nulos: ValidUntil, QuantityText, BeforeJson y los cuatro campos CompletedAt/Outcome*.
Los demás son NOT NULL. Los CHECK exigen BeforeJson nulo solo en creación de reporte y
presente en actualización/habilitaciones. Outcome y CompletedAt son todos nulos en
poc:reserved y todos presentes en poc:completed. Se usan IS NULL/IS NOT NULL explícitos
para no aceptar estados parciales mediante UNKNOWN de SQL. Los JSON presentes son objetos.
Las acciones, capacidades, operaciones y estados son exclusivamente las uniones actuales L2.
No se añade UNIQUE usuario/ficha/capacidad ni reglas de intervalos o transiciones institucionales.

## Garantías y límites críticos

- Texto con `Latin1_General_100_BIN2`, incluidos snapshots, sin normalización. IDs y claves
  tienen CHECK ASCII; periodos verifican bytes UTF-16 2–256 y rechazan espacios ASCII extremos.
  PK/UNIQUE preservan mayúsculas y representaciones Unicode distintas en el dominio válido.
- La validación completa de PeriodKey (Unicode bien formado, todos los espacios de trim()
  y controles), GUID canónico antes de conversión y demás constructores sigue a cargo del
  futuro adaptador. Los CHECK no se presentan como reemplazo total de L2. Conversiones
  SQL/parametrización mal elegidas pueden truncar o sustituir caracteres: deben probarse.
- QuantityText conserva cadena, ceros, signo y null sin number, float ni decimal(p,s).
  No se añade máximo ni conversión aritmética; la gramática la verificará decimalText.
- datetime2(3) cubre años 0001–9999 y milisegundos, pero no almacena zona horaria. El adaptador
  tendrá que validar UtcInstant y asegurar UTC explícito, sin redondear entradas inválidas.
- Siete tablas con RV; AuditEvents carece de Version en L2. El futuro codec de versiones
  será opaco: RV no es fecha ni orden de inserción. No se importan UUID de seed como RV.
- JSON históricos conservan todos los campos y versiones originales. ISJSON no valida
  entidades, relaciones del snapshot, claves duplicadas ni coherencia de actor/objetivo.
  No se compara su versión con la RV vigente ni se reconstruye outcome consultando Reports.
- InsertionOrder existe solo en Activities/AccessAssignments. Las futuras consultas deben
  ordenar explícitamente; IDENTITY puede tener saltos y no representa tiempo institucional.
  findByIds conserva el orden de entrada desde el adaptador, no el orden físico SQL.
- Idempotencia, autorización y auditoría seguirán coordinadas por UnitOfWork en la misma
  conexión con SERIALIZABLE y control de versión. El DDL no implementa autorización ni
  genera auditoría automáticamente. No hay triggers o bloqueos por digest.

## Verificación del catálogo

verify y down contrastan la lista exacta de columnas, tipos, longitudes de cadenas,
nulabilidad, colaciones, identidad y escala; datetime2 se verifica por tipo/escala, sin
confundir tamaño físico con max_length del catálogo. Se comprueban las nueve tablas,
nombres de restricciones e índices, FK/CHECK habilitados y confiables, ausencia de cascadas,
objetos inesperados y semilla/incremento 1 de las dos identidades.

La huella registrada tras up incluye columnas, definición exacta de CHECK, claves y sus
columnas, índices y filtros, FK, permisos del rol, propietarios de esquemas y triggers.
verify la recalcula y compara: detecta cambios posteriores sin normalizar expresiones SQL.
El rol API no puede ser miembro de otro rol. Sus futuros usuarios tampoco deberán tener
db_owner, db_datawriter u otros permisos heredados amplios; eso se revisará al aprovisionarlos.
Los errores de metadatos, permisos insuficientes o esquema incompleto deben bloquear
verify/down, nunca continuar con una verificación parcial.

## Privilegios

El rol es técnico de conexión, no un rol institucional. No se crean usuarios ni logins.
SELECT de las ocho tablas; INSERT solo Reports/AuditEvents/IdempotencyRecords; UPDATE por
columna para habilitación, campos editables de reporte y finalización idempotente.
DELETE y ALTER del esquema funcional, UPDATE de auditoría y acceso DML a historial denegados.
Sin altas de catálogos, DDL, permisos de administración ni delegación de permisos.

El principal de migración será separado, autorizado para los esquemas y permisos necesarios;
no se le asignan credenciales, membresías ni permisos de servidor en estos artefactos.
verify requiere visibilidad completa de los metadatos y lectura de historial; usar el
principal autorizado de migración. El rol API no es un verificador/migrador.
La finalización inmutable de idempotencia, expectedVersion y el alcance por ficha necesitan
el adaptador/servicios; los permisos por columna no bastan para garantizar esos protocolos.
React nunca accederá directamente a SQL.

## Procedimiento futuro, NO autorizado por L7-B4

1. Aprobar entorno y ejecución por separado. SQL Server >=2022 local, base sintética
   existente `pai_poc_...`, conexión TCP loopback o memoria compartida. No se crea la base.
2. Comprobar hashes con `Get-FileHash -Algorithm SHA256` y manifest; se comparan sin distinguir
   mayúsculas del hash impreso, y se pasan a SQL como 64 hexadecimales minúsculos.
3. En una conexión nueva sin transacción externa, preparar SESSION_CONTEXT mediante
   sys.sp_set_session_context con las siguientes claves y valores explícitos:

   | Clave | Valor |
   |---|---|
   | pai.migration.database | Nombre exacto de la base sintética autorizada |
   | pai.migration.approval | LOCAL_SYNTHETIC_ONLY |
   | pai.migration.upSha256 | SHA-256 verificado de up.sql |
   | pai.migration.verifySha256 | SHA-256 verificado de verify.sql |
   | pai.migration.downSha256 | SHA-256 verificado de down.development.sql |

4. Con la API detenida y un único operador/migrador, ejecutar up en esa conexión mediante
   un cliente SQL ya aprobado. No instalar herramientas ni iniciar recursos por estas instrucciones.
   up rechaza esquema/rol existentes: una ejecución repetida no omite silenciosamente DDL.
5. Ejecutar verify con el mismo contexto. Una fila de historial distinta o checksums/catálogo
   diferentes fallan. La comprobación no aplica cambios ni repara objetos automáticamente.
6. Registrar resultados, versión de motor y pruebas. Cerrar la conexión y borrar su contexto.

Los tres scripts fallan sin contexto, ante base distinta, conexión externa o motor Azure.
El esquema usa características de SQL Server 2022/Azure SQL, pero ejecutar en Azure está
deliberadamente bloqueado hasta aprobar y revisar otro procedimiento. Docker puede presentar
una IP de puente al motor aunque publique en loopback: en ese caso las guardas rechazan
la ejecución; no eludirlas, revisar y autorizar ese entorno específicamente.
Las guardas son preventivas, no impiden a un administrador reescribir o saltarse el script.

## Reversión y recuperación

up/down usan XACT_ABORT, TRY/CATCH y una transacción, sin GO ni transacciones anidadas.
Ante error se hace rollback y se relanza; no hay reintentos o correcciones automáticas.
Una prueba real deberá confirmar también su comportamiento ante desconexión y fallos DDL.

down exige además contexto `pai.migration.rollback=DROP_EMPTY_0001_INITIAL`, verify interno
correcto, historial inicial único, rol sin miembros y **cero filas en las ocho tablas**.
Obtiene bloqueos de tabla mantenidos hasta el fin para impedir inserciones durante la
revisión de vacío. No hay override para borrar datos, DELETE ni TRUNCATE.
Elimina tablas en orden inverso, rol, historial y esquemas dentro de la transacción.
Si hay datos, detenerse y planear backup/restauración o una migración correctiva posterior.
No eliminar una base ni vaciar tablas para hacer pasar down.

## Evidencia de L7-B4 y aceptación pendiente

Las pruebas migrations-static.test.mjs solo leen archivos: checksums, destinos, orden,
tipos declarados, restricciones, permisos y protecciones. No son parser/compilador T-SQL,
no ejecutan DDL ni acreditan comportamiento del motor. Se integran a npm test existente.

Pendiente en un entorno autorizado: compilar/ejecutar up/verify/down; ejecutar duplicado;
alterar un CHECK/índice/permiso y observar rechazo de verify; probar null/JSON incoherentes,
FK, alfabetos, espacios/Unicode, cantidades exactas, fechas extremas y RV; probar rollback
por fallo intermedio, permisos con usuario sin privilegios, rechazo de down con datos o
miembros, así como concurrencia, persistencia tras reinicio y recuperación.
La versión del controlador y el adaptador SQL siguen pendientes. No se afirma que esas
pruebas estén aprobadas por haber pasado la revisión estática.

Referencias oficiales consultadas: [ISJSON](https://learn.microsoft.com/en-us/sql/t-sql/functions/isjson-transact-sql),
[SESSION_CONTEXT](https://learn.microsoft.com/en-us/sql/t-sql/functions/session-context-transact-sql),
[FK del catálogo](https://learn.microsoft.com/en-us/sql/relational-databases/system-catalog-views/sys-foreign-keys-transact-sql).

## Revisión auxiliar R1 — L7-B5-B2-R2, 20/10/2026

L7-B4 quedó registrada en dc72d99. La ejecución original de up fue exitosa; verify falló
con error 468 en EXCEPT: Kind heredó Modern_Spanish_CI_AS y sys.objects.type usa
Latin1_General_CI_AS_KS_WS. El mismo defecto existe en el down original, que no se ejecutó.
No cambiar la colación del servidor, base o columnas para resolverlo.

Archivos vigentes de herramientas: verifiers/0001_initial/r1/manifest.json, verify.sql y
down.development.sql. El manifiesto raíz y los tres originales 0001_initial son inmutables.
El descriptor R1 enlaza el hash del manifiesto original y la terna histórica exacta, además
de los hashes propios. El único cambio de comprobación del catálogo es COLLATE
Latin1_General_100_BIN2 en Kind y o.type, en ambos auxiliares. La serialización de
CatalogSha256, las restricciones y todas las guardas anteriores permanecen idénticas.
No es una migración DDL 0002 ni crea una fila nueva en SchemaMigrations.

### Contexto histórico y contexto de revisión

Las claves pai.migration.upSha256, verifySha256 y downSha256 conservan los hashes
ORIGINALES. R1 comprueba por literales la terna exacta permitida y vuelve a contrastarla
con la única fila histórica. Nunca sustituirlas por los hashes R1.

Además, R1 requiere estas claves en la MISMA conexión:

| Clave | Valor |
|---|---|
| pai.verifier.revision | r1 exacto |
| pai.verifier.verifySha256 | Hash del nuevo verify.sql verificado externamente |
| pai.verifier.downSha256 | Hash del nuevo down.development.sql verificado externamente |

Los hashes R1 deben ser 64 hexadecimales minúsculos. El contexto no demuestra por sí
solo qué archivo se ejecutó: SQL verifica formato y revisión; el operador verifica los
bytes contra el descriptor ANTES de conectar. No se incrusta un hash propio circular.
Los manifiestos se revisan mediante Git; un administrador puede eludir este procedimiento.

### Procedimiento de verificación, sin ejecutar up ni down

Desde la raíz del repositorio, con una base ya autorizada y un único operador:

1. Verificar el SHA-256 del manifiesto raíz contra originalManifest.sha256 de R1.
2. Comparar originalFiles de R1 con files del manifiesto raíz y comprobar los bytes de
   los tres archivos originales con Get-FileHash -Algorithm SHA256.
3. Verificar ambos auxiliares contra files del descriptor R1, conservando UTF-8/LF.
4. Preparar el contexto histórico de la sección anterior y las tres claves de revisión.
5. Enviar contexto, GO y el contenido del verify R1 por la misma invocación de sqlcmd.
   Usar :ON ERROR EXIT, -b -V 11, timeouts finitos y comprobar LASTEXITCODE.
6. Consultar historial, huella de catálogo y recuentos antes/después. Ante error detenerse:
   no repetir automáticamente ni editar la base, scripts o historial para forzar éxito.

Comando utilizado (sqlcmd ODBC fuera del PATH; el flujo de entrada lleva contexto y SQL):

~~~powershell
$sqlcmdPath = 'C:\Program Files\Microsoft SQL Server\Client SDK\ODBC\170\Tools\Binn\SQLCMD.EXE'
$sql | & $sqlcmdPath -S 'lpc:.\PAIPOC' -E -d pai_poc_dev -b -V 11 -l 10 -t 60 -r 1 -W -w 240
if ($LASTEXITCODE -ne 0) { throw 'Detener; no reintentar automáticamente.' }
~~~

No usar directamente el verify original para este entorno. Para una instalación nueva
se conserva up ORIGINAL y sus hashes; después se usa R1. Esa creación y ejecución de up
requieren autorización independiente; R2 no las vuelve a ejecutar ni autoriza nuevas bases.
El down R1 está preparado y protegido, pero NO EJECUTADO ni autorizado por esta validación.
Mantiene confirmación adicional, rol sin miembros, tablas vacías, bloqueos y transacción.

### Evidencia real de R2 y límites

- Rama feature/arquitectura-persistencia-pai, HEAD dc72d99, árbol inicial limpio.
- SQL Server 2022 Developer 16.0.1000.6; Windows integrada, Shared Memory, pai_poc_dev.
- Originales y ambos auxiliares verificados por hashes antes de conectar.
- verify R1: código 0, resultado 0001_initial / verified; 494 ms medidos del cliente.
  Al terminar: @@TRANCOUNT=0, XACT_STATE()=0. No hubo error 468 ni cambios SQL de configuración.
- Snapshot de historial, catálogo y recuentos antes/después exactamente idéntico.
  Una fila histórica, AppliedAtUtc 2026-10-20T21:13:22.747; terna original conservada.
  CatalogSha256: 822fb17b1d66a55e97217c30829d045b03de808d890972078f35f45516764720.
  Ocho tablas funcionales con cero filas antes y después.
- 269 pruebas API aprobadas, 0 fallidas/omitidas: 260 anteriores + una de inmutabilidad
  histórica + ocho pruebas específicas R1. Build API, contratos y fronteras aprobados.
  Build frontend correcto; continúa el aviso previo del bundle >500 kB.
- Una prueba estática nueva requirió corregir su selector del bloque de catálogo antes
  de la ejecución SQL. No se modificaron los scripts SQL por ese ajuste de prueba.
- Sin ejecución de up o down, nuevas bases, datos funcionales, cambios de historial,
  frontend, contratos, dependencias o configuración SQL; sin commit ni despliegue.
- Validado el alcance local de creación/aplicación original y verificación R1. Quedan
  pendientes reversión, fallos intermedios, concurrencia, permisos efectivos con usuario
  de prueba, otras colaciones/motores y el adaptador SQL. No equivalen a esta verificación.
