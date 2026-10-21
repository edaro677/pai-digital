# L8-B — Conectividad Node.js / SQL Server, solo diagnostico local

Fecha: 21/10/2026. Base: bade509ad6d4b3b4ae8c1b537eaa6b64101425f7.
Rama: feature/arquitectura-persistencia-pai. Implementado y validado localmente;
pendiente de revision. Sin commit, integracion HTTP ni adaptador SQL de aplicacion.

## Componentes y alcance

- Node.js 24.22.0 x64, npm 11.19.1, Windows.
- Versiones publicadas confirmadas con npm view: mssql 12.7.10, msnodesqlv8 5.6.0.
  Instaladas con npm install --save-dev --save-exact exclusivamente dentro de api/.
  Lockfile conserva integridades npm. No se modifican paquetes de la raiz.
- ODBC Driver 17 x64: msodbcsql17.dll 17.10.6.1, previamente instalado.
- Carga nativa real de msnodesqlv8/prebuilds/win32-x64/msnodesqlv8.node exitosa.
- Motor observado: SQL Server 2022 Developer 16.0.1210.3 (RTM-GDR).
  Es la version encontrada en esta fecha; L8-B no instala ni actualiza SQL Server.
- Destino fijo lpc:.\PAIPOC, base pai_poc_dev, Windows integrada. TCP/IP y Named
  Pipes se comprobaron deshabilitados, Shared Memory habilitado; no se alteran.

scripts/sql-diagnostic.mjs importa mssql/msnodesqlv8.js solo dentro de la funcion
de diagnostico. scripts/sql-diagnostic-config.mjs define destino, driver y tiempos
de espera constantes. No se aceptan SQL, servidores, credenciales o DSN desde CLI
ni cadenas heredadas de variables de entorno. Se rechaza alojamiento Azure y
runtime distinto de Windows x64 / Node 24. No se carga nada desde src/.

El pool tiene max=1, min=0. Usa Trusted_Connection=Yes, Encrypt=Yes y, solo para
este destino local, TrustServerCertificate=Yes. Esta excepcion de certificado no
es una politica para Azure o produccion. APP=PAI-L8B-Diagnostic identifica sesiones.
No hay fallback a TCP/IP, Named Pipes, otro controlador ni otra base.

## Ejecucion explicita

Desde api/, en una terminal Windows independiente del host Functions:

```powershell
npm run sql:diagnose -- --local
```

El ejecutor no corre durante npm start, npm test o build. No crea archivos de
resultados ni registra cadenas de conexion. Devuelve JSON tecnico por stdout.
La prueba optativa se encuentra fuera del glob tests/*.test.mjs:

```powershell
# Sin activacion: una prueba omitida, sin cargar el binding ni conectar.
npm run test:sql

# Con activacion explicita: una prueba real, solo lecturas y rollback.
$env:PAI_SQL_INTEGRATION = '1'
try { npm run test:sql } finally { Remove-Item Env:PAI_SQL_INTEGRATION }
```

No requiere fixtures ni operaciones sobre usuarios, roles o permisos. La prueba
requiere que la instancia y base ya esten preparadas. Si no estan disponibles,
falla sin iniciar servicios ni cambiar configuracion. Para cerrar el diagnostico
se espera la finalizacion del proceso: finally revierte la transaccion si procede
y cierra su pool. No se detiene SQL Server.

## Consultas y transaccion

1. Abrir pool; consultar @@VERSION, DB_NAME(), instancia, edicion, modo Windows,
   transporte e indicador booleano de privilegios administrativos. Exigir Shared memory y PAIPOC/pai_poc_dev.
2. Comprobar estado inicial sin transacciones abiertas.
3. Leer 0001_initial con parametro VarChar(64) y contrastar los tres hashes con
   el manifiesto original. Comprobar exactamente las ocho tablas funcionales.
4. BEGIN de transaccion SERIALIZABLE, solo lecturas; comprobar misma sesion,
   @@TRANCOUNT=1, XACT_STATE=1 y el mismo historial.
5. ROLLBACK; exigir @@TRANCOUNT=0, XACT_STATE=0 e historial identico.
6. Comprobar cero prestamos y solicitudes pendientes, cerrar pool y exigir
   connected=false y referencia interna de pool eliminada (mssql 12.7.10).

Se usan unicamente lecturas, variables SQL locales y control transaccional.
No se declara una opcion READ ONLY de SQL Server: la ausencia de escrituras se
garantiza por las sentencias fijas de este ejecutor, no por un principal restringido.

## Evidencia real y medicion de estado

- npm run sql:diagnose -- --local: codigo 0, status=ok.
- Transporte efectivo: Shared memory; autenticacion NTLM integrada.
- Indicador administrativo observado: true. No se publican nombres de principales.
  Es una conexion ADMINISTRATIVA exclusivamente diagnostica. No prueba permisos
  minimos ni debe reutilizarse para habilitar escrituras de la API.
- Ocho tablas reconocidas, 0001_initial presente con sus tres hashes originales.
- Transaccion 0 -> 1 -> 0, rollback completado, XACT_STATE final 0 y misma sesion.
- Pool sin prestamos/esperas antes del cierre y cerrado al finalizar.
- Consulta independiente mediante sqlcmd, solo lectura: cero sesiones con
  program_name=PAI-L8B-Diagnostic despues de los procesos de prueba.
- Historial antes/despues intacto: AppliedAtUtc 2026-10-20T21:13:22.747 y
  CatalogSha256 822fb17b1d66a55e97217c30829d045b03de808d890972078f35f45516764720.
- Recuento independiente exacto: ocho tablas funcionales con cero filas.

Los intentos preliminares detectaron XACT_STATE=1 con @@TRANCOUNT=0 al evaluar
XACT_STATE dentro de SELECT. Una consulta de lectura independiente reprodujo
0/0 en SELECT aislado y 0/1 con subconsulta DMV. La ejecucion nativa tambien
observo ese efecto al medir directamente en SELECT. Se corrigio la medicion:
DECLARE captura @@TRANCOUNT y XACT_STATE antes del SELECT que devuelve valores.
Se conservaron las exigencias 0/1/0; no se relajo una asercion para aprobar ni se
cambio la configuracion del motor. Los cierres de intentos fallidos liberaron
las sesiones. Esto no demuestra el manejo de fallos de una futura unidad SQL.

## Pruebas y aislamiento

- Suite ordinaria: 275 aprobadas, 0 fallidas/omitidas (269 anteriores + seis nuevas).
  No exige SQL Server. Cubre perfil fijo, bloqueo de entornos, separacion del
  binding, ausencia de DML/DDL, opt-in y health con process.dlopen bloqueado.
- Integracion SQL optativa activada: una aprobada, cero fallidas/omitidas.
  Sin activacion se comprobo una omitida y cero conexiones de esa prueba.
- Pretest: build API, TypeScript, contratos y fronteras correctos. Scripts mjs
  comprobados por Node; no se modifica tsconfig ni los contratos de aplicacion.
- Build frontend correcto; persiste aviso previo de bundle superior a 500 kB.
- src/, composicion, MemoryUnitOfWork, HTTP, MSAL, migraciones y R1 intactos.
  No se inicio Functions/Azurite ni se probo health por socket en L8-B; su contrato
  se verifico en proceso, tambien con carga nativa bloqueada.

## Advertencias y siguiente incremento

npm aviso que los scripts install de msnodesqlv8 y postinstall de protobufjs no
estaban aprobados por allowScripts. No se cambiaron esas aprobaciones ni se
compilo un binding: el binario incluido cargo y funciono realmente en Node 24.
La reproducibilidad del paquete en otras maquinas requiere su propia prueba.

npm audit informa cuatro entradas moderadas ligadas a Azurite y sus transitivas
(@azure/ms-rest-js, sequelize y uuid), ya documentadas antes. No se aplico audit
fix --force ni se altero Azurite. No hay hallazgos altos/criticos en ese reporte.

L8-C propuesto: codecs y sesion SQL de pruebas, con contexto transaccional ligado
a una conexion, validaciones de entrada/salida y cierre determinista. Mantener
HTTP en memoria. Las escrituras, identidad restringida, permisos y preparacion
de datos sinteticos necesitaran autorizacion posterior. Esta fase no demuestra
persistencia de reportes, concurrencia, autorizacion SQL, auditoria o idempotencia.

Fuentes: [node-mssql](https://tediousjs.github.io/node-mssql/),
[msnodesqlv8](https://github.com/TimelordUK/node-sqlserver-v8).


## Revision L8-B-R4: observabilidad local optativa

La salida publica usa una lista positiva de campos tecnicos. No devuelve filas SQL,
identidades, banner completo del motor ni objetos de error. Las excepciones publicas
usan categorias y mensajes fijos, sin stack con rutas ni causa original.

Activacion explicita, exclusivamente dentro del perfil local ya validado:

```powershell
npm run sql:diagnose -- --local --trace
```

Sin --trace no se emiten registros de traza. La configuracion programatica equivalente
es runSqlDiagnostic({ trace: true, onTrace: destinoSincrono }). El destino predeterminado
es stderr; stdout mantiene exclusivamente el JSON de resultado. No se usa desde HTTP.
Un fallo sincrono del destino de traza se descarta para no alterar operaciones SQL;
la observabilidad no garantiza entrega si falla ese destino.

Campos permitidos: stage, durationMs, result, category, technicalCode, connected,
borrowed, pending y transactionActive. Los identificadores de etapa se construyen
internamente: DRIVER_LOAD, POOL_CREATE, CONNECT, BEFORE_METADATA/STATE/HISTORY,
CATALOG, BEGIN, DURING_METADATA/STATE/HISTORY, ROLLBACK, AFTER_METADATA/STATE/HISTORY,
CLEANUP_ROLLBACK, CLOSE y POOL_EVENT. durationMs usa reloj monotonico. category es
null en exito o una categoria SQL controlada; technicalCode admite solo codigos
enumerados de timeout, conexion, autenticacion, transaccion y errores SQL conocidos.
Valores desconocidos se convierten a null sin analizar mensajes.

connected refleja el booleano del pool; borrowed/pending son enteros no negativos o
null si no estan disponibles. transactionActive refleja seguimiento del cliente,
no una consulta adicional del estado del servidor. Tras un rollback fallido puede
permanecer true aunque posteriormente se cierre la conexion. No se declara exitoso
un cierre que devuelve un error. Si tambien falla la limpieza se conserva el primer
error principal; los errores secundarios aparecen individualmente en la traza.

Los timeouts y las consultas permanecen sin cambios. No hay nuevos reintentos ni
ciclos de carga. El rollback de limpieza conserva el comportamiento de recuperacion
anterior y no sustituye la categoria del error principal.

Integracion optativa de una sola ejecucion y solo lectura, con traza:

```powershell
$env:PAI_SQL_INTEGRATION = '1'
$env:PAI_SQL_TRACE = '1'
try { npm run test:sql } finally {
  Remove-Item Env:PAI_SQL_INTEGRATION
  Remove-Item Env:PAI_SQL_TRACE
}
```

Antecedentes R2/R3: suite de 288 aprobadas (13 de privacidad); hubo fallos intermitentes
de consultas y de conexion. R3 observo tanto ejecuciones completas satisfactorias como
un fallo de conexion de 10240 ms con codigo 258. No se confirmo la causa exacta del
SQL_QUERY_FAILED historico. La traza R4 pretende localizar futuras incidencias;
su incorporacion no demuestra que la intermitencia este resuelta.


Validacion automatizada R4: 298 pruebas ordinarias aprobadas, sin fallidas ni omitidas
(288 anteriores + 10 nuevas de trazabilidad). Pruebas dirigidas: 29 aprobadas,
23 de privacidad/trazabilidad y seis del diagnostico, incluida health con carga
nativa bloqueada. TypeScript, contratos, fronteras y build frontend correctos;
continua el aviso previo del bundle mayor de 500 kB. El resultado de la ejecucion
SQL real R4 debe evaluarse por separado; estos resultados unitarios no prueban
la resolucion de la intermitencia.


Ejecucion SQL real R4, una sola vez con traza activada: una prueba aprobada, sin
fallidas ni omitidas; cuerpo de la prueba 234 ms. Las 16 etapas terminaron ok,
category=null y technicalCode=null. Duraciones registradas en milisegundos:

| Etapa | ms |
| --- | ---: |
| DRIVER_LOAD | 54 |
| POOL_CREATE | 0 |
| CONNECT | 82 |
| BEFORE_METADATA | 24 |
| BEFORE_STATE | 3 |
| BEFORE_HISTORY | 5 |
| CATALOG | 43 |
| BEGIN | 4 |
| DURING_METADATA | 4 |
| DURING_STATE | 1 |
| DURING_HISTORY | 1 |
| ROLLBACK | 1 |
| AFTER_METADATA | 2 |
| AFTER_STATE | 1 |
| AFTER_HISTORY | 2 |
| CLOSE | 1 |

Se verifico Shared Memory, historial original, ocho tablas, estado transaccional
0/1/0, rollback completo y pool cerrado sin prestamos ni solicitudes pendientes.
No se insertaron datos ni se ejecutaron migraciones. Ninguna etapa alcanzo el
limite de tiempo. Esta muestra no reproduce el fallo previo ni identifica su
causa: disponibilidad transitoria del motor, recursos del equipo o comportamiento
del controlador siguen siendo hipotesis. No hay evidencia para modificar atStage,
aumentar timeouts o declarar corregida la intermitencia. Si reaparece el fallo,
la traza permitira conocer etapa, codigo autorizado y estado tecnico sin mensajes
originales. Sin commit; se mantiene pendiente la revision del incremento.
