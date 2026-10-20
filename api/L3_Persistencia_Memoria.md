# F2 / L3 — Adaptador de persistencia en memoria

Base verificada: `5fd769c`, rama `feature/arquitectura-persistencia-pai`, árbol inicial limpio.
Los contratos de [L2](./L2_Modelo_Contratos.md), sus entidades, tipos y errores no se modifican.
No se encontró contradicción que requiriera cambiar interfaces. Sus limitaciones de
idempotencia y ausencia de repositorio de dependencias se conservan explícitamente.

## Arquitectura y alcance

| Archivo | Responsabilidad |
|---|---|
| src/infrastructure/memory/state.ts | Seed explícito, tablas privadas a la implementación, copias profundas y referencias de inicialización |
| src/infrastructure/memory/session.ts | Vida del contexto, registro de promesas, fallo transaccional y comparación de versiones |
| src/infrastructure/memory/repositories.ts | Implementaciones de los siete repositorios, ligadas a una sesión |
| src/infrastructure/memory/unitOfWork.ts | Cola por instancia, exclusión mutua, clonación, commit y cierre |
| tests/fixtures/memory.mjs | Datos deterministas exclusivamente para pruebas |
| tests/memory.test.mjs | Pruebas de estado observable, atomicidad y concurrencia |

La entrada del adaptador es `new MemoryUnitOfWork(seed)`; el único acceso operativo es
`runAtomic(callback)`. No se exponen repositorios persistentes, snapshots de estado ni
commits independientes en esa entrada pública. Los otros módulos son detalles internos.
No se conecta el adaptador al endpoint health ni al arranque de Functions. No hay I/O,
autenticación, políticas de autorización, SQL, Graph o SharePoint en el adaptador.

MemorySeed permite usuarios, dependencias, fichas, asignaciones, actividades y reportes
iniciales. Se clona antes de utilizarlo, se rechazan IDs/identidades duplicados y referencias
huérfanas, y se comprueba unicidad de reporte por actividad/periodo. Auditoría e idempotencia
comienzan vacías y se crean mediante sus contratos. Una instancia sin seed comienza vacía.

No existe repositorio de dependencias en L2: sus filas solo se inicializan con MemorySeed
y validan las referencias de fichas. No se añadieron métodos a los contratos para compensarlo.

## Semántica transaccional real

Cada instancia mantiene una cola FIFO de transacciones. Solo un callback accede a su
estado de trabajo a la vez, incluyendo durante los await. Una transacción empieza a
clonar el último estado confirmado después de que termine la anterior. Las lecturas,
ausencia de registros y escrituras comparten ese contexto: aislamiento serializable
por exclusión mutua de la instancia, sin lecturas sucias ni pérdida de actualizaciones.

La confirmación sustituye el estado privado únicamente si el callback termina con éxito
y se completaron las promesas de repositorio registradas. Una excepción descarta la copia
completa: usuarios, asignaciones, reportes, auditoría, idempotencia y versiones persistidas.
Un finally libera la cola tanto en éxito como en fallo. No hay reintentos automáticos.

Los repositorios realizan sus operaciones de memoria de forma síncrona y devuelven Promise;
no dejan I/O pendiente. Se capturan entradas antes de devolver la promesa. La sesión registra
y espera sus resultados antes de confirmar, incluso si el callback omitió un await. Un
error de repositorio marca fallida la transacción aunque el callback lo capture: no hay
savepoints y no puede confirmar una operación parcialmente fallida. La promesa devuelta
al consumidor sigue rechazándose; se evita además un rechazo global por una llamada omitida.

Al finalizar se invalida el contexto. Las referencias retenidas rechazan tanto lecturas
como escrituras con INCOMPATIBLE_STATE. AsyncLocalStorage detecta reentrada en la misma
instancia y rechaza transacciones anidadas antes de encolarlas, evitando un autobloqueo.

No se pueden iniciar timers, tareas separadas o efectos externos desde el callback para
continuar una transacción después de su fin. Un callback que nunca resuelve puede retener
la cola: L3 no implementa timeout ni cancelación segura. Las garantías son locales a una
instancia y un proceso, no una transacción distribuida ni una prueba de aislamiento SQL.

## Versiones y concurrencia

Cada creación o actualización confirmada usa un token opaco generado con randomUUID de
Node, sin dependencias adicionales. Los valores de seed se conservan hasta una actualización.
No se derivan versiones de la hora ni de un contador accesible por el consumidor.

setEnabled, update y complete comprueban expectedVersion antes de modificar. Dos solicitudes
con la misma versión se serializan: la primera puede confirmar y la segunda encuentra
VERSION_CONFLICT. Una creación repetida encuentra DUPLICATE. Las versiones de operaciones
descartadas no se reutilizan deliberadamente; los registros recuperan su versión confirmada.
Los UUID proporcionan unicidad práctica, no un orden ni una secuencia numérica contractual.

## Operaciones y errores

Se implementan exactamente UserRepository, AssignmentRepository, FichaRepository,
ActivityRepository, ReportRepository, AuditRepository e IdempotencyRepository.
No se añaden create/delete donde L2 no los declara. Los cambios de habilitación son
operaciones técnicas de persistencia, no una API administrativa ni una política de acceso.

- Búsquedas inexistentes devuelven null y listas sin coincidencias devuelven [].
- findByIds conserva el orden de la primera aparición, omite ausentes y elimina IDs repetidos.
- Las listas restantes conservan el orden de inserción; no se promete orden SQL ni paginación.
- Una escritura sobre ID inexistente devuelve NOT_FOUND; versión obsoleta, VERSION_CONFLICT.
- Reportes rechazan ID o pareja actividad/periodo duplicados; create/update verifican las
  referencias de actividad y autores requeridas. update copia solo los campos admitidos.
- Asignaciones deshabilitadas o fuera de ventana no se filtran por una política implícita.
- Un reporte poc-blocked no prohíbe por sí mismo update: L3 almacena ese estado; su efecto
  sobre operaciones se definirá en la etapa de autorización aprobada.

## Idempotencia

Unicidad por ID y por `(actorId, operation, key)`. Las claves compuestas se serializan
como tuplas JSON para evitar colisiones por concatenación con separadores ambiguos.
reserve siempre rechaza un duplicado con DUPLICATE, tanto con igual como con distinta huella.
No se calcula una huella ni se devuelve automáticamente una respuesta previa.

complete exige registro existente, versión vigente y estado poc:reserved. Se comprueba
que existan el reporte y el evento referenciados; se guarda una copia profunda del resultado
recibido, sin estados HTTP. Completar un registro ya completado con su versión actual da
INCOMPATIBLE_STATE; hacerlo con versión antigua da VERSION_CONFLICT. El resultado original
no se reescribe si el reporte cambia posteriormente.

L2 no asigna al repositorio la distinción operativa entre replay válido y colisión de
contenido. El futuro servicio deberá consultar la huella, validar su canonicalización,
comprobar coherencia de actor/objetivo/snapshots, revalidar autorización y decidir el resultado.
Aquí solo se prueban unicidad, versiones, estado y conservación. No hay TTL ni limpieza.

## Auditoría e inmutabilidad

append comprueba ID único y existencia del actor, conserva una copia profunda y no ofrece
edición/eliminación. Las búsquedas devuelven nuevas copias, incluidas estructuras anidadas.
Una transacción fallida no deja eventos ni registros idempotentes. El adaptador no genera
eventos automáticamente: el futuro caso de uso debe incluirlos junto con su escritura.

Se copian el seed, el estado de trabajo, entradas anidadas y todos los resultados de
repositorios. El consumidor puede modificar sus copias JavaScript sin alterar el almacén.
El contexto y los objetos de repositorio están congelados; no se confunde readonly de TS
con congelación profunda de los resultados. Los inputs son objetos de dominio confiables,
no cuerpos HTTP sin validar: este adaptador no es un sanitizador de texto libre.
Las pruebas no contienen datos institucionales, credenciales, tokens de acceso ni logging
de secretos. Los snapshots solo modelan las estructuras sintéticas definidas en L2.

## Fixtures y límites arquitectónicos

Los fixtures incluyen DEP-ALFA y DEP-BETA, una ficha por dependencia, dos actividades
por ficha, tres usuarios sintéticos y cinco asignaciones de laboratorio. Son deterministas,
se crean de nuevo por prueba y residen bajo tests/fixtures, fuera de src y del build.

El guard admite únicamente los cuatro módulos nuevos del adaptador. Solo unitOfWork puede
importar node:async_hooks y node:crypto; se rechazan imports de I/O, fixtures o Functions.
Se rechaza activar memoria desde el diagnóstico HTTP. Dominio y puertos mantienen su
independencia. Las exclusiones de publicación y los controles locales L1 no cambian.

## Pruebas y validación

- API: npm run build, correcto; incluye límites y contratos TypeScript sin emisión.
- Suite completa: 53 pruebas aprobadas, 0 fallidas, incluidas L1 y L2.
- Se verifican búsquedas, operaciones permitidas por contrato, duplicados, referencias,
  rollback de creación/actualización/auditoría/idempotencia, conflictos y carreras de
  creación/reserva/actualización. El intercalado se controla con barreras, sin sleeps.
- Se comprueban copias de entradas/salidas anidadas, persistencia entre transacciones,
  independencia entre instancias, contextos vencidos, reentrada y recuperación de la cola.
- Los tests negativos de arquitectura comprueban que memoria no use archivos/fixtures
  ni se conecte al endpoint health.

- Frontend: npm run build correcto; permanece la advertencia previa de bundle >500 kB.
- git diff --check y revisión de los siete archivos nuevos con --no-index --check: correctos.
- Git: tres archivos modificados y siete nuevos, todos bajo api; contratos L2, fuentes
  del endpoint health, paquetes/lockfiles, frontend y docs institucionales sin cambios.
- No se instalaron dependencias, arrancaron Functions/Azurite ni crearon recursos.
  L3 no modifica la configuración local ni expone nuevas rutas. No se realizaron commits.

## Pendientes

El estado se pierde al terminar el proceso; se copia completo por transacción y todas las
operaciones de una instancia se serializan. Es adecuado para un dataset de prueba acotado,
no un diseño de capacidad productiva. No hay conexiones SQL, caché distribuida, retención,
autorización, autenticación ni endpoints de negocio. L4 y etapas posteriores requieren
autorización expresa; los roles y reglas institucionales siguen sujetos a Planeación.


## Alineación L7-B2 — 20/10/2026

Se validan las representaciones acotadas L2 autorizadas al preparar semillas y dentro
de las escrituras de memoria, incluyendo versiones esperadas, snapshots de auditoría
y resultados de idempotencia. Las entradas JavaScript inválidas tampoco se persisten.
No se implementa SQL ni carga automática de fixtures. No cambian la cola por instancia,
copia privada, atomicidad, rollback, copias defensivas o invalidación de contextos.
Los fallos de representación capturados por el callback también abortan el commit.

Se conserva toda la regresión L3 y se agregan rechazos de semillas, rollback de ocho
operaciones inválidas y auditoría de habilitación. Suite conjunta L1–L7-B2: 248 aprobadas,
0 fallidas; no implica persistencia duradera ni concurrencia SQL entre conexiones.
Los pendientes de etapas posteriores descritos arriba corresponden al cierre original L3.
Detalle: [L7B2_Representacion_SQL.md](./L7B2_Representacion_SQL.md).
