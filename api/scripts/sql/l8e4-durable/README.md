# L8-E4 — Ensayo duradero controlado, preparado y NO ejecutado

La implementación está preparada para revisión y confirmación antes de escribir. Importar los módulos o dot-sourcear `prepare-l8e4-session.ps1` no inicia servidores, autenticación, SQL ni HTTP. No hay configuración permanente del ensayo. `.funcignore` sigue excluyendo toda publicación.

## Alcance fijo y aislamiento

La composición normal conserva `isApplicable: () => false`. Solo una configuración temporal `PAI_L8E4_TRIAL` completa selecciona la política del ensayo. No permite elegir usuario, ficha, actividad, capacidades, periodo, clave o cuerpo arbitrarios: esos valores están fijados en `composition/localDurableTrial.ts`.

Además de JWT Entra validado por el adaptador original, se exige tenant público aprobado, object ID exacto obtenido del token validado, audience y scope existentes. `FichaAuthorizationService` sigue comprobando usuario habilitado, vínculo tenant/oid, ficha, asignaciones y capacidades. La política adicional solo admite las dos asignaciones inventariadas, para el mismo usuario y ficha, con inicio/fin exactos y vigencia estrictamente interior. La ventana capturada dura menos de 30 minutos y nunca puede exceder una hora ni la expiración del token usado para capturarla.

Cada solicitud admitida comprueba Windows x64/Node 24, todas las señales locales existentes, sql-local, loopback:7071, ausencia de marcadores alojados/producción y ausencia de preloads heredados. Un proceso PowerShell fijo verifica de forma independiente: identidad Windows real PAIPOC_Test no administrativa; Node y Core Tools desde las herramientas independientes verificadas por SHA-256; Core Tools en la cadena real de padres del worker, del mismo usuario; único listener 127.0.0.1:7071 propiedad de ese host. Variables de entorno por sí solas no superan estas comprobaciones. No es una protección contra un administrador que modifique el código o los binarios; el repositorio y las herramientas siguen siendo código confiable con acceso restringido.

Modo write: un único despacho de POST por proceso, incluso ante dos solicitudes concurrentes, fallo o resultado ambiguo. Solo el activityId, Idempotency-Key y cuerpo exactos de este documento pasan. Modo read: únicamente GET del reportId recibido; no permite POST. Fichas, actividades y PATCH quedan denegados en ambos modos del ensayo. Health no cambia. Los errores conservan cuerpos sanitizados, 401 para autenticación inválida y denegación uniforme para recursos fuera del alcance. No se cambió el validador Entra, servicios, repositorios, SqlUnitOfWork u ODBC.

## Inventario

Prefijo exacto: `l8e4-20261023-r01`.

| Tabla | Filas | ID y relación |
|---|---:|---|
| InstitutionalUsers | 1 | `...-user`, tenant aprobado y oid realmente validado; alias sintético, habilitado |
| Dependencies | 1 | `...-dep`, etiqueta sintética |
| Fichas | 1 | `...-ficha` → `...-dep` |
| Activities | 1 | `...-activity` → `...-ficha`, descripción Unicode sintética |
| AccessAssignments | 2 | `...-read` / `...-edit`, usuario y ficha anteriores; poc:read / poc:edit-report |
| Reports | 1 | ID generado por API; actividad anterior, periodo exclusivo |
| AuditEvents | 1 | Evento de creación del reporte, actor sintético, snapshot completo |
| IdempotencyRecords | 1 | Reserva completada, actor/operación/clave exclusivos, FK al reporte y auditoría |

Los seis padres requieren commit administrativo previo para ser visibles desde la conexión HTTP. El vínculo tenant/oid es metadato real de autenticación y requiere aprobación; todo contenido funcional es sintético. No inventar oid ni imprimir variables privadas.

## Obtención segura de la identidad

`Initialize-L8E4Trial` abre el arnés de MSAL Browser mediante `l8e4-http-trial.mjs`. Usa el Client ID real de `.env.local`, Authorization Code + PKCE y caché memoryStorage; no crea registros ni solicita permisos nuevos. Cancelar un consentimiento no previsto. El access token solo viaja en memoria y se valida con el adaptador Entra original (firma, issuer, audience, expiración, scope, cliente autorizado, tolerancia 30 s). El object ID se toma exclusivamente de ese resultado validado.

El arnés entrega la configuración privada por una tubería hijo→PowerShell capturada por la función; no se muestra en consola ni se escribe. No invocar directamente `--capture-private-pipe`, no imprimir `$script:L8E4Trial`, no iniciar transcripciones/depuración de valores y no redirigir la tubería privada a archivos. El navegador solo ve una confirmación booleana; descarta el token y la caché al terminar. Las funciones de inicio transmiten la configuración al host únicamente en su entorno de proceso y restauran el entorno del operador. La identidad Windows escritora y la identidad institucional JWT son distintas y ambas se verifican.

## Secuencia controlada — ejecución autorizada, sujeta a todas las precondiciones

Ejecutar desde PowerShell habitual del observador/administrador existente, sin modificar permisos. Mantener esta sesión para conservar en memoria identidad, recibo y verificación. No ejecutar estos pasos durante la preparación técnica.

1. Dot-sourcear `api/scripts/prepare-l8e4-session.ps1`; ejecutar `Initialize-L8E4Trial` y abrir http://localhost:5174/. Autenticarse solo en Microsoft. Exigir `validatedIdentityInMemory:true`. La función no hace SQL ni HTTP contra la API. El mismo usuario institucional debe utilizarse en los accesos posteriores.
2. Comprobar integridad inicial con `node api/tests/integration/sql-integrity-observer.mjs --check` desde la raíz: ONLINE, ocho tablas vacías, historial/catálogo correctos, cero transacciones de prueba y cierre. No reabrir diagnósticos históricos. Si falla, no escribir.
3. `Start-L8E4TrialHost`: credenciales Windows únicamente en solicitud segura, sin argumentos/archivos. Inicia la consola PAIPOC_Test con las herramientas independientes, preflight SQL de lectura y selección sql-local temporal. Esperar HOST_PREFLIGHT OK y Functions. El host conserva los controles SQL restringidos, loopback y señales originales. No iniciar como administrador. Comprobar health una vez si procede.
4. `Invoke-L8E4HttpTrial -Preflight`: autenticar al mismo usuario mediante localhost:5174 y exigir guardPositive/identityMatch verdaderos. Es un GET denegado 404 con prueba técnica cerrada del guard real; no concede acceso a recursos ni ejecuta escrituras. Sin ese resultado en memoria, Prepare no puede abrir SQL.
5. **Primera escritura persistente:** `Invoke-L8E4SqlDraft -Step Prepare -ExecuteApproved`. Usa los valores privados capturados, valida SHA-256 contra `sha256.json`, fija SESSION_CONTEXT parametrizado, abre conexión administrativa independiente y ejecuta `01_prepare.parents.sql`. Exigir seis padres y commit de preparación correcto. Cualquier discrepancia detiene; no volver a sembrar.
6. `Invoke-L8E4HttpTrial -ExecuteApproved`: abrir el arnés local y autenticar al mismo usuario institucional. Ejecuta **un único** POST fijo, sin entrada de URL, cuerpo o clave desde el navegador:

   `POST /api/poc/actividades/l8e4-20261023-r01-activity/reportes`

   `Idempotency-Key: l8e4:20261023:r01:create-report`

   ```json
   {"period":"poc-durable-20261023-r01","quantity":"9007199254740993.000100","narrative":"Ensayo sintetico L8-E4: á 😀 漢字"}
   ```

   Exigir 201 y recibo sintético válido. El SqlUnitOfWork normal confirma reporte, auditoría e idempotencia; no se utiliza el arnés L8-D5 de rollback terminal. La función y el host impiden otro despacho automático. El token se descarta; solo queda el recibo sintético.
7. Cerrar el host con Ctrl+C. `Invoke-L8E4SqlDraft -Step Verify -ExecuteApproved` abre una conexión independiente y ejecuta `02_verify.result.sql`: comprueba los tres resultados, cantidad textual exacta, Unicode, UTC, rowversion, relaciones y snapshots históricos. Conserva el resultado sintético verificado, IDs y hashes de ambos snapshots en `api/.test-tmp/l8e4-durable/verified-synthetic-result.json`, ignorado por Git, sin tenant/oid/token. Solo una verificación correcta guardada habilita la limpieza completa.
8. `Start-L8E4TrialHost -Read`: nuevo proceso, modo GET y reportId exacto del recibo. Tras preflight y Functions, `Invoke-L8E4HttpTrial -Read -ExecuteApproved`. Exigir 200 y coincidencia de versión, periodo, cantidad, Unicode, estado y UTC. Cerrar este host con Ctrl+C. La lectura sobre otro proceso/conexión y la supervivencia al reinicio demuestran persistencia; un lease de pooling no se presenta como prueba de otra conexión física.
9. Conservar evidencia y ejecutar `Invoke-L8E4SqlDraft -Step Cleanup -ExecuteApproved` solo tras aprobar expresamente eliminación de la auditoría sintética. Exige el GET correcto, verificación independiente, recibo, hashes previos y ausencia de listener 7071. `03_cleanup.admin.sql` bloquea e inventaría exactamente nueve filas, compara ambos hashes bajo los bloqueos y elimina únicamente sus PK en orden de FK, con ROWCOUNT y rollback ante discrepancia. PAIPOC_Test no recibe DELETE.
10. Alternativa exclusiva si el POST falla **sin generar resultados**: detener el host y resolver cualquier resultado ambiguo mediante lectura, sin repetir POST. `Invoke-L8E4SqlDraft -Step CleanupParents -ExecuteApproved` ejecutaría `04_cleanup.parents-only.admin.sql`: exige exactamente seis padres correlacionados y cero Reports/AuditEvents/IdempotencyRecords bajo bloqueos; elimina solo asignaciones, actividad, ficha, dependencia y usuario, con transacción y rollback. Si encuentra una sola fila de resultado o cualquier inventario distinto, no elimina nada. Nunca usar esta alternativa para ocultar un commit incierto o un resultado parcial inesperado.
11. Repetir únicamente la comprobación final independiente de integridad: ocho tablas vacías, historial/catálogo intactos y cero transacciones de prueba observables. Si falla, declarar integridad final no verificada. Conservar evidencia sanitaria y ejecutar `Clear-L8E4TrialSession` para descartar referencias controladas de identidad/recibo; cerrar navegador y consolas de prueba. No se garantiza borrado físico de memoria administrada por GC.

Los comandos `-ExecuteApproved` son guardas contra ejecución accidental; no sustituyen la autorización humana. Las cuatro huellas de scripts se fijan en `sha256.json`; un cambio exige revisión y actualizar conscientemente ese manifiesto. No hay GO, DDL, migraciones, permisos nuevos ni limpieza por prefijos amplios.

## Fallos y permisos

- Si falla la preparación: rollback de sus padres, detenerse.
- Si falla POST o se pierde la respuesta: no repetir, no cambiar clave/periodo ni adivinar reportId. Determinar estado por lectura independiente; el procedimiento automático se detiene si no hay recibo suficiente.
- La limpieza completa elimina exclusivamente auditoría sintética correlacionada con el recibo y los hashes guardados; es una excepción administrativa aprobada, no una modificación de AuditRepository append-only.
- Escritor: permisos ya existentes de SELECT, INSERT de resultados y UPDATE limitado de finalización de idempotencia. Sin DELETE, privilegios administrativos ni cambios de seguridad.
- Administrador separado: SELECT e INSERT de los seis padres; SELECT de verificación; DELETE de las nueve filas o solo seis padres. Los scripts conservan su requisito de administrador existente y no conceden roles nuevos.
- Esta fase solo valida con dobles, JWT firmado de laboratorio y análisis estático. No demuestra todavía ejecución del guard positivo bajo Core Tools, arranque con el vínculo capturado, sintaxis T-SQL real de los borradores, commit HTTP o limpieza real. Todo ello se comprobará en el ensayo autorizado, sin flexibilizar guardas si falla.

## L8-E4 — Reanudación detenida por integridad inicial (26/10/2026)

Se realizó una única comprobación nativa de lectura, sin reintentos. Conexión correcta (26,93 ms), identidad correcta (7,98 ms), permisos mínimos correctos (6,55 ms). INITIAL_CATALOG_QUERY falló con SQLSTATE HYT00 después de 30.020,92 ms; sin número SQL Server disponible. Cierre confirmado (3 ms), duración total 30.229,55 ms, ExitCode 1. La causa interna del timeout no quedó demostrada. Integridad actual NO confirmada y observación de transacciones no alcanzada; el resultado correcto anterior es solo evidencia histórica.

Se detuvo antes de escribir: sin captura de identidad Entra, host, guard positivo real, seis padres, POST, commit, GET posterior o limpieza. No hay procesos del observador ni del arnés de navegador residuales; Vite/5173 permanece intacto. No se modificaron SQL Server, permisos, esquema o infraestructura de persistencia.

Preparación local validada sin SQL: TypeScript correcto y 57 pruebas dirigidas aprobadas. El arnés usa localhost:5174 para conservar Vite/5173. Se añadió preflight GET denegado (404) con prueba técnica del guard real, emitida únicamente después de validar JWT e identidad del host; no ejecuta lógica de aplicación ni amplía acceso a recursos. La preparación de padres exige ese preflight satisfactorio en memoria. No se ha probado aún el guard positivo real ni el flujo interactivo en ese puerto.

Secuencia obligatoria actualizada: integridad inicial correcta → captura privada en localhost:5174 → host restringido → Invoke-L8E4HttpTrial -Preflight y prueba positiva del guard → preparación autorizada de seis padres → único POST → verificación independiente → reinicio/GET → limpieza selectiva → integridad final. Esta secuencia sustituye cualquier instrucción anterior de preparar padres antes del host. La ejecución está autorizada por el usuario, pero ninguna autorización sustituye las precondiciones.

Dictamen de este intento: L8-E4 BLOQUEADA por HYT00 en INITIAL_CATALOG_QUERY. No se repite automáticamente el ensayo ni se declara persistencia duradera validada. Sin staging, commit, push, merge o despliegue.

## Paso 282 — Conservación de bytes al publicar

La revisión del índice detectó un CR duplicado al final de la línea de aprobación
de 04_cleanup.parents-only.admin.sql. Se retiró solo ese byte, sin cambiar tokens
SQL; su SHA-256 revisado es 7e879a2b48cf8ff6324c79d8a599fceda19fcdb3ae2ca23f1effc1e69ec95fe5.
El manifiesto se actualizó y los demás SQL conservaron sus bytes. Los atributos
mantienen CRLF exacto y reconocen cr-at-eol sin desactivar la detección de espacios
sobrantes reales. No se ejecutó ninguno de los scripts durante esta revisión.
