# F2 / L2 — Modelo técnico y contratos de persistencia

Alcance: entidades y puertos para datos sintéticos. No es el esquema definitivo, una
implementación de repositorio, una autorización de acceso ni un flujo institucional.
Base de trabajo: commit `b6f9233`, rama `feature/arquitectura-persistencia-pai`.

## Referencias y límites funcionales

Se consultaron [PAI-005](../docs/03-arquitectura/PAI-005_Modelo_Datos_Conceptual.md),
[PAI-007](../docs/03-arquitectura/PAI-007_Alternativas_Persistencia.md) y
[PAI-004](../docs/02-requisitos/PAI-004_Pendientes_Planeacion.md), sin modificarlos.
P-03/P-04/P-17 mantienen pendientes capacidades, cierres, granularidad y ámbitos reales;
P-01/P-02/P-20 condicionan cálculos y mediciones; P-15 condiciona conservación.
La aprobación con ajustes de los insumos no convierte esas decisiones en reglas aprobadas.

El único endpoint sigue siendo `/api/poc/health`, sin cambios. Ningún tipo L2 se conecta
al endpoint, a MSAL, SQL, Graph o SharePoint. No se crearon fixtures operativos ni se leyeron
los Excel institucionales. Los ejemplos y pruebas contienen exclusivamente valores sintéticos.

## Entidades mínimas

Todos los campos son readonly. Esto impide mutación accidental en TypeScript, pero no
congela objetos en JavaScript ni reemplaza las copias defensivas que necesitará L3.

| Tipo | Contenido y supuesto técnico |
|---|---|
| InstitutionalUser | ID interno, referencia opaca tenant/objeto de directorio, alias, habilitación y versión. No crea ni autentica una identidad |
| Dependency | ID, etiqueta y versión. Sin jerarquía, sede ni programa inferidos |
| Ficha | ID, dependencia, etiqueta de ciclo y versión. Asociación exclusiva de laboratorio, no cardinalidad institucional ratificada |
| AccessAssignment | ID, usuario, ficha, una capacidad, habilitación, inicio/fin y versión. No decide vigencia ni acceso |
| Activity | ID, ficha, descripción y versión; sin pesos, metas ni fórmulas |
| Report | Detalle sintético por actividad/periodo, cantidad, narración, estado técnico, autores, fechas y versión |
| AuditEvent | ID, actor, instante, correlación y cambio con snapshots antes/después. Solo registro append-only de escrituras técnicas |
| IdempotencyRecord | ID, ámbito actor/operación/clave, huella, estado reservado/completado, resultado y versión |

**Granularidad:** Report es un detalle de laboratorio. PAI-005 propone una cabecera por
ficha/periodo con detalles por actividad; este contrato simplificado no sustituye ese
modelo. La unicidad `(activityId, period)` es una condición técnica del futuro adaptador
de PoC, no una decisión sobre envíos, aprobaciones ni cierres institucionales.

No hay repositorio de dependencias porque L2 solo requiere consultar fichas/actividades;
los catálogos se prepararán sintéticamente en una etapa autorizada posterior.

## Tipos y representaciones

- IDs nominales distintos para usuario, tenant, objeto de directorio, dependencia, ficha,
  asignación, actividad, reporte, evento y registro de idempotencia. No se presupone UUID
  ni se deriva identidad de un código Excel, correo o nombre.
- `entityId(kind, value)` valida texto no vacío, sin espacios extremos ni controles.
  La marca nominal es de compilación, no una comprobación de identidad ni de autorización.
- `Version` es un token opaco. El consumidor nunca lo incrementa ni ordena; memoria y SQL
  podrán representarlo de forma distinta manteniendo el contrato. El adaptador genera la
  versión al crear y una nueva al confirmar una actualización.
- `UtcInstant` usa ISO UTC canónico con milisegundos. El constructor valida fechas reales
  sin consultar la hora actual. `Clock.now()` permite inyectar el tiempo; no hay reloj concreto.
- `DecimalText` conserva exactamente decimales de punto fijo como texto. Admite negativos
  y conserva ceros decimales; no decide rangos, unidades, escala, redondeo ni sumabilidad.
  `null` indica cantidad no capturada en el laboratorio; no se equipara a cero o no aplica.
- `PeriodKey` y la etiqueta de ciclo son sintéticos, sin calendario trimestral aprobado.
- Estados de reporte: `poc-draft`, `poc-blocked`. No se implementa ninguna transición.
- Capacidades: `poc:read`, `poc:edit-report`. No equivalen a Planeación/gestor/validador.
- Las huellas y claves de idempotencia son tokens no vacíos. El constructor no calcula
  hashes ni garantiza su correspondencia con un contenido. Canonicalización y generación
  de huella se deberán definir antes de implementar idempotencia en L3.

El resultado cuantitativo técnico no es un indicador de resultado ni un porcentaje de
cumplimiento. No se implementa conversión entre ellos ni cálculo oficial alguno.

## Repositorios asíncronos

Todas las operaciones de repositorio devuelven Promise. Una búsqueda devuelve null si no
existe el registro y una lista vacía si no hay coincidencias. No se filtran permisos en
estos contratos: el ámbito solicitado no prueba que el llamante esté autorizado.

| Repositorio | Operaciones |
|---|---|
| UserRepository | findById, findByIdentity, setEnabled con expectedVersion |
| AssignmentRepository | findById, listByUserAndFicha, setEnabled con expectedVersion |
| FichaRepository | findById, findByIds |
| ActivityRepository | findById, listByFicha |
| ReportRepository | findById, findByActivityAndPeriod, create, update con expectedVersion |
| AuditRepository | append, findById; no update/delete |
| IdempotencyRepository | findByScope, reserve, complete con expectedVersion |

`listByUserAndFicha` devuelve también asignaciones deshabilitadas o fuera de ventana;
la política futura deberá evaluar esa información en la misma transacción. No se
implementa esa evaluación en L2. Las escrituras de habilitación solo definen un puerto
técnico para probar revocaciones más adelante; no se exponen por HTTP.

Los métodos de lectura de colecciones se destinan al dataset sintético acotado. Paginación,
orden estable y límites deberán concretarse antes de consultas de volumen/SQL. No se
promete que descargar colecciones completas sea adecuado para producción.

Creación: ID y datos de entrada sin versión; el adaptador detecta duplicados y genera
la versión. Actualización: ID, versión esperada y campos modificables explícitos; la
versión se compara y cambia atómicamente. ReportChanges no permite cambiar ID, actividad,
periodo, autor o instante de creación. No se ofrece borrado destructivo.

Auditoría: evento inmutable con ID único; un append duplicado falla. Sus snapshots no
sustituyen el modelo completo de VersionReporte ni una política de retención. Los intentos
denegados y errores de infraestructura tendrán tratamiento técnico posterior; no se han
inventado eventos de revisión institucional.

Idempotencia: scope único `(actorId, operation, key)` y huella que deberá incluir el
contenido/objetivo de la solicitud. Reserve no sobrescribe un scope existente. Complete
requiere reserva, versión vigente y resultado de dominio (reporte y evento), sin estados
HTTP. El resultado guardado conserva el snapshot original. Una operación completada no
se modifica. Repetición con igual huella y distinta huella deberá tratarse respectivamente
como recuperación y conflicto por el futuro servicio, sin confundirlas con autorización.
La recuperación también deberá revalidar acceso. No se fija expiración o limpieza automática.

## UnitOfWork y límites atómicos

`runAtomic(async context => resultado)` proporciona los siete repositorios ligados al
mismo contexto. Es el único propietario de la confirmación; no existen commits por
repositorio ni transacciones anidadas en el contrato.

Una futura escritura autorizada deberá:

1. Leer usuario, asignaciones y relaciones actuales dentro del contexto.
2. Evaluar la política aprobada y el tiempo inyectado, sin confiar en datos de permisos del cliente.
3. Consultar/reservar idempotencia y comprobar el estado/versión del reporte.
4. Escribir el reporte, agregar auditoría y completar idempotencia dentro del mismo contexto.
5. Confirmar todo o revertir todo ante una excepción, incluyendo versiones y reservas.

Se exige aislamiento serializable o validación equivalente al confirmar. Incluye lecturas
de habilitación, asignaciones y ausencia de filas: una revocación concurrente o una carrera
de creación no puede pasar inadvertida. L3 deberá demostrar esa semántica con pruebas de
intercalado y rollback. SQL necesitará bloqueo/validación e índices adecuados, no solo
envolver escrituras en una transacción con aislamiento insuficiente.

El callback no debe realizar HTTP, archivos ni efectos externos; tampoco puede retener
los repositorios para usarlos después. No habrá reintento automático del callback. Si
ocurre un conflicto, una nueva ejecución deberá releer los datos y revalidar permisos.

**Límite de las interfaces:** los tipos no implementan ni garantizan aislamiento,
autorización o presencia de auditoría. El adaptador y los servicios futuros tendrán que
cumplir el protocolo. No se ha declarado una seguridad efectiva por escribir un contrato.

## Errores

`DomainError` conserva un código estable sin HTTP ni detalles de infraestructura:

| Error | Código |
|---|---|
| NotFoundError | NOT_FOUND |
| AccessDeniedError | ACCESS_DENIED |
| VersionConflictError | VERSION_CONFLICT |
| DuplicateError | DUPLICATE |
| IncompatibleStateError | INCOMPATIBLE_STATE |
| InvalidValueError | INVALID_VALUE |

Las lecturas no convierten null en error automáticamente. Los errores operacionales
describen el contrato de escrituras o de una futura política; no hay lógica de autorización
en sus clases. InvalidValueError corresponde exclusivamente a representación técnica.

## Validación y trabajo pendiente

`npm run check:contracts` usa `tsc --noEmit`, lib ES2022 y sin tipos Node/DOM. Prueba tipos
nominales, estados/capacidades acotados, campos readonly, versión obligatoria, contexto
común y ausencia de commits individuales. No genera adaptadores ni fixtures ejecutables.

`npm test` ejecuta además funciones puras y errores, junto con todas las pruebas L1.
El guard de arquitectura rechaza imports de infraestructura desde el núcleo y mantiene
una lista explícita de fuentes permitidas. Nuevos adaptadores siguen bloqueados hasta L3.

Pendiente L3: almacenamiento en memoria, copias defensivas, generación de versiones,
unicidad, serialización y rollback, ciclo de vida de contextos, reservas concurrentes y
suite reutilizable de adaptadores. Autorización, identidad y contratos HTTP de negocio
permanecen fuera de L2 y requerirán la autorización correspondiente.
