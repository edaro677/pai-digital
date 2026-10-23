# PAI Digital — Documento maestro de continuidad técnica

**Corte:** 23 de octubre de 2026

**Organización:** Fundación Universitaria María Cano (FUMC)

**Proyecto:** PAI Digital

**Estado:** F2 en ejecución, base c59b3928ab8e977a7668d82626f4063e10cefb7d. L8-C2 y L8-D aprobadas para PoC local; L8-E1/E2 selección, arranque y health validados. L8-E3 cerrada en autenticación Entra y lecturas HTTP/SQL: health 200, seis 401, tres 404 y dos SELECT reales documentados desde SqlUnitOfWork, sin fallback en rutas observadas. L8-E4: integridad actual no revalidada (ConnectionError; diagnóstico sqlcmd nativo 258); ensayo duradero diseñado y no ejecutable todavía con la política denegatoria y sin preparación/limpieza aprobadas. Sin escrituras nuevas; cambios pendientes de revisión/commit. Se conservan antecedentes.

**Fuente de estado:** antecedentes de conversación, reportes y documentación contrastados por Codex mediante inspección local. Los resultados L1–L4-B se conservan como cierres históricos; la ejecución L5 descrita al final incluye compilación y pruebas locales nuevas, sin validar Entra real.

## 1. Propósito y reglas de actualización

Documento de traspaso para continuar el desarrollo en nuevas conversaciones sin perder contexto, decisiones, restricciones, riesgos ni trazabilidad. Revisarlo al finalizar cada etapa técnica, después de cada commit relevante y cuando se produzca una decisión arquitectónica importante. Como pauta adicional, revisarlo aproximadamente cada tres interacciones sustantivas de desarrollo cuando el usuario o ChatGPT soliciten sincronización.

Esta periodicidad es una **convención operativa, no una automatización del chat**. En el flujo de planificación descrito aquí, ChatGPT trabaja con la evidencia compartida por el usuario; Codex puede inspeccionar y actualizar el repositorio cuando reciba una instrucción explícita y disponga de acceso local.

**Ruta local sugerida:** `D:\PAI\pai-digital-react\docs\seguimiento\PAI_Digital_Continuidad_Tecnica.md`.

Reglas: no modificar datos institucionales originales; no agregar secretos; registrar solo estados confirmados; separar hechos, decisiones pendientes e hipótesis; no hacer commit, push, PR o merge sin autorización expresa; no crear recursos Azure ni desplegar sin autorización.

## 2. Flujo de colaboración y roles

1. **Usuario (responsable de ejecución):** comparte necesidad y resultados de consola, ejecuta comandos PowerShell, verifica el entorno y autoriza commits o despliegues.
2. **ChatGPT (revisión y planificación):** delimita etapas, prepara prompts precisos para Codex, revisa los informes y evidencia que el usuario comparte, identifica riesgos y propone validaciones. No tiene acceso directo a `D:\`.
3. **Codex (agente local de implementación):** inspecciona el repositorio, desarrolla solo el alcance autorizado, ejecuta pruebas, documenta cambios y presenta informe. No hace commit salvo autorización posterior.
4. **Ciclo habitual:** alcance → instrucciones para Codex → ejecución local → informe y resultados PowerShell → revisión → autorización de commit → commit del usuario e identificador → actualización del maestro → preparación de la siguiente etapa. Incluye revisión de Git (`git status --short`, `git diff --check`, `git diff --stat`, `git ls-files --others --exclude-standard`).
5. **Criterio de evidencia:** un reporte de Codex describe resultados declarados; las salidas Git y de pruebas aportadas por el usuario permiten verificar parcialmente. No confundirlas con auditoría de código fuente realizada por ChatGPT.

### Ciclo operativo acordado

1. ChatGPT define el alcance técnico de una etapa y prepara instrucciones para Codex.
2. El usuario ejecuta las instrucciones en Codex dentro del repositorio local.
3. Codex inspecciona los archivos existentes, implementa los cambios y ejecuta las pruebas.
4. Codex entrega un informe con archivos modificados, resultados, limitaciones y estado de Git.
5. El usuario comparte el informe y los resultados de PowerShell con ChatGPT.
6. ChatGPT revisa el alcance, identifica riesgos y solicita correcciones cuando corresponde.
7. ChatGPT autoriza el commit únicamente después de las verificaciones, dentro del flujo acordado por el usuario. Esta revisión no habilita por sí sola a Codex a ejecutar comandos Git sin autorización expresa del usuario.
8. El usuario registra el commit y comparte su identificador.
9. Se actualiza el documento maestro y se prepara la siguiente etapa.

Restricciones del ciclo: no hacer commits, push, Pull Requests ni merge sin autorización;
no crear ni desplegar recursos Azure sin autorización; no modificar etapas anteriores sin
justificación y revisión; no registrar secretos, tokens ni datos institucionales sensibles;
diferenciar siempre lo implementado, lo probado, lo pendiente y los supuestos.

## 3. Repositorio y entorno

- Repositorio local: `D:\PAI\pai-digital-react`.
- GitHub: `https://github.com/edaro677/pai-digital`.
- Rama de trabajo actual: `feature/arquitectura-persistencia-pai`.
- HEAD confirmado al iniciar L8-C1: `90e160eaa3dcfe0104c402bb00e5558b614ecb8e` — `feat(api): incorpora diagnostico SQL local con trazabilidad sanitizada`. Git inicialmente limpio. Los cortes de commit pendiente de L8-B conservados debajo son históricos.
- Estrategia de ramas: `main` estable, `develop` integración, `feature/*` implementación.
- Frontend: React 19.3, TypeScript 5.7.3, Vite 6.4.4; MSAL browser 4.30 y MSAL React 3.0.29.
- API PoC: Azure Functions Node v4 y TypeScript, `api/` aislado; Node 24.22.0, npm 11.19.1, Core Tools 4.16.0; Azurite 3.37.0 en loopback.
- Login SPA Entra ID single tenant en desarrollo, sin acceso real de frontend a backend; no hay API PAI registrada/configurada aún.
- Datos originales en `insumos/planeacion`, ignorados por Git (`/insumos/`).
- Endpoints: `GET /api/poc/health` conserva diagnóstico local anónimo; L5 añade las consultas GET de ficha y actividades con L4-A/L4-B y persistencia L3, completadas en alcance local y verificadas también sobre HTTP real, sin datos operativos precargados.
- Frontend de seis módulos demostrativos: Inicio, Gestionar PAI, Reporte trimestral, Validación de avances, Evidencias y Dashboard.

## 4. Hitos confirmados y commits

| Hito | Estado | Commit | Evidencia conocida |
|---|---|---|---|
| F1 modularización frontend | Cerrada, integrada en develop | `2262904` (merge PR #5) | Build y 20 verificaciones manuales reportadas |
| L0 prerrequisitos F2 | Completada | — | Entorno Node/Functions/Azurite preparado |
| L1 — API local y Azurite | Completada | `b6f9233` | 16 pruebas aprobadas según antecedente; health y almacenamiento local documentados en README |
| L2 — Dominio y contratos | Completada | `5fd769c` | 22 pruebas aprobadas; 14 archivos, según reporte histórico |
| L3 — Persistencia transaccional en memoria | Completada | `d68cca8` | 53 pruebas aprobadas; 10 archivos; Git limpio tras commit según cierre |
| L4-A — Identidad Microsoft Entra ID | Completada | `131cab7` | 94 pruebas aprobadas; 16 archivos; Git limpio tras commit según cierre |
| L4-B — Autorización por ficha y capacidades | Completada | `8914e94` | 132 pruebas aprobadas según cierre; commit verificado localmente, 6 archivos |
| L5 — Consultas HTTP autenticadas | Completada en alcance técnico local | `f287707` | Dos GET; 182 pruebas aprobadas; Functions/Azurite y nueve peticiones HTTP reales validados |
| L6-A — Diseño de escrituras | Aprobado como diseño técnico | — | Sin cambios de código en esa etapa |
| L6-B — Escrituras HTTP seguras | **Completada en alcance técnico local** | `2543c0a` | POST/PATCH/GET de reporte; 214 pruebas aprobadas; Functions/Azurite, seis operaciones registradas y 18 peticiones HTTP reales validadas |
| L7-A — Diseño de persistencia duradera | Diseño concluido; recomendación preliminar | — | Informe de alternativas y estrategia SQL, sin implementación |
| L7-B1 — Preparación técnica SQL | Análisis y sincronización documental; pendiente de revisión | — | Decisiones de representación, compatibilidad L2 y esquema preliminar; sin migraciones |
| L7-B2 — Representaciones acotadas | Completada y registrada | `ba6c2b6` | 248 pruebas; alternativa B aprobada y contratos ajustados |
| L7-B3 — Diseño SQL | Diseño concluido | — | Ocho tablas y estrategia revisadas en conversación; sin ejecución |
| L7-B4 — Migración inicial en archivos | Registrada | `dc72d99` | up/verify/down originales y manifiesto inmutables; validación estática histórica |
| L7-B5-B2-R2/R3 — Verificador auxiliar R1 | Completado y registrado | `bade509` | 269 pruebas; verify R1 correcto; historial y datos intactos; down no ejecutado |
| L8-B — Conectividad SQL local y observabilidad sanitizada | Completada y registrada en alcance técnico local | `90e160e` | 298 pruebas; integración real de lectura satisfactoria en R4; 16 etapas sanitizadas; intermitencia pendiente |
| L8-C1/R1 — Codecs y sesión SQL aislada | Completada y registrada | `c59b392` | 348 pruebas aprobadas; dobles de transporte; sin SQL real ni repositorios funcionales |
| L8-C2-R1 — Descriptor y barrera de enlace | Implementada para revisión, sin commit | — | 371 pruebas; sin transporte ODBC real, decimales/binarios null bloqueados para enlace |
| L8-D — Repositorios SQL y UnitOfWork | Cerrada en alcance de PoC local; pendiente de commit | — | Integración real L8-D5: 7 repositorios, 19 métodos, 52 consultas; rollback conjunto y verificación independiente de integridad |
| L8-E1 — Composición y selección de persistencia | Implementada con dobles, pendiente de revisión/commit | — | 131 pruebas dirigidas; memoria predeterminada, sql-local explícito, sin carga nativa ni conexiones SQL en las pruebas; L8-E2 pendiente |
| Regresión integral L1–L6-B | Requisito de aceptación transversal para L7 | — | Debe conservarse al incorporar y validar el adaptador SQL |

**Último `git log -5 --oneline` confirmado localmente:**

Referencia histórica de la sincronización tras L4-B; el nuevo HEAD se registra en la
entrada L5 al final, sin reemplazar este antecedente.

```text
8914e94 feat(api): implementa autorizacion por ficha y capacidades
131cab7 feat(api): implementa validacion segura de identidad Entra ID
d68cca8 feat(api): implementa persistencia transaccional en memoria
5fd769c feat(api): define modelo de dominio y contratos de persistencia
b6f9233 feat(api): inicializa PoC local de Azure Functions con Azurite
```

**Estado Git confirmado tras L4-A:** `git status --short` vacío; no se reportó push, PR ni merge de la rama actual.

**Inspección al actualizar el maestro tras L4-B:** rama y HEAD coinciden con lo solicitado.
`git status --short` muestra únicamente `?? docs/seguimiento/`; su único archivo sin
seguimiento es este documento, preexistente a la actualización. No hay cambios pendientes
en archivos versionados. No describir el árbol completo como limpio mientras el maestro
siga sin seguimiento. Esta intervención no hace commit, push, PR ni merge.

## 5. Arquitectura implementada

### L1
- Azure Functions Node v4 local y endpoint `/api/poc/health`.
- Azurite local, sin recursos Azure ni credenciales institucionales.
- Comprobaciones de límites arquitectónicos y pruebas.

### L2
- Entidades técnicas: `InstitutionalUser`, `Dependency`, `Ficha`, `AccessAssignment`, `Activity`, `Report`, `AuditEvent`, `IdempotencyRecord`.
- Repositorios: usuario, asignaciones, fichas, actividades, reportes, auditoría, idempotencia.
- `UnitOfWork.runAtomic()`, reloj inyectable, versiones opacas y errores de dominio.
- Capacidades sintéticas `poc:read` y `poc:edit-report`; estados técnicos no institucionales.

### L3
- Adaptadores de los siete repositorios exclusivamente en memoria.
- Cola transaccional por instancia, copia privada del estado y commit/rollback conjunto.
- Versiones opacas, auditoría append-only, copias defensivas, invalidación de contextos, prohibición de transacciones anidadas.
- Límites: estado volátil; copias completas; una operación que no termine puede retener la cola; sin autorización.

### L4-A
- Biblioteca aislada para validar access tokens de Microsoft Entra ID v2.0.
- `jose@6.2.12` como única dependencia nueva reportada.
- Verifica RS256/JWKS, `iss`, `aud`, `tid`, `exp`, `nbf`, `oid`, `azp`, `scp`, versión 2.0; identidad basada en `tid+oid`.
- Rechaza Graph access tokens, ID tokens de SPA, app-only basado solo en roles y credenciales inválidas.
- Pruebas locales con claves efímeras; caché JWKS de 10 min y cooldown de 30 s reportados.
- Al cierre L4-A no estaba integrada a HTTP ni frontend. L5 conecta el validador a consultas HTTP; siguen pendientes registro/configuración de API/scope en Entra, cambios MSAL y validación institucional real.
- Configuración futura de recurso API debe emitir tokens v2 (`requestedAccessTokenVersion=2`), sujeto a revisión de la configuración real.

### L4-B

- Servicio aislado `FichaAuthorizationService`, en `api/src/application/authorization/service.ts`, registrado en `8914e94`.
- Recibe identidad previamente validada por L4-A y resuelve el usuario con `tenantId + objectId`; comprueba tenant esperado, usuario habilitado, ficha existente y asignación habilitada con capacidad explícita.
- `poc:read` y `poc:edit-report` son capacidades sintéticas independientes; no se infieren entre sí ni de roles Microsoft 365, scopes OAuth, correo, UPN o pertenencia a la dependencia.
- Denegación por defecto, sin administrador universal, acceso cruzado ni escalamiento por datos enviados por el cliente. Las denegaciones no revelan detalles de otras fichas o usuarios.
- `decide()` devuelve una decisión explícita e inmutable; `requireAllowed()` deniega con el error de dominio existente. Ambos reciben TransactionContext y no abren transacciones propias.
- Autorización y escritura pueden evaluarse en una misma unidad de trabajo; se comprobó con una transacción sintética que incluye reporte, auditoría e idempotencia, así como rollback y revocación concurrente. No hay caso de uso de escritura ni endpoint de negocio implementado.
- Ausencia de caché de decisiones: se releen usuario y asignaciones en cada evaluación. Las revocaciones confirmadas se observan en transacciones posteriores; no se promete cancelación retroactiva de una transacción ya activa.
- Integración L4-A → L4-B probada mediante token sintético firmado, claves efímeras y transporte OIDC/JWKS local. No equivale a una prueba contra Entra ID institucional.
- **Probado según reporte de cierre:** 132 pruebas aprobadas, 0 fallidas (94 previas, 35 nuevas de autorización y 3 negativas de límites); API, contratos, límites y frontend compilan. Permanece el aviso previo del bundle frontend >500 kB. Esta actualización no vuelve a ejecutar esas pruebas.
- **Pendiente:** definición institucional de vigencia de asignaciones. L2 no prescribe extremos inclusivos/exclusivos; el servicio exige AssignmentValidityPolicy explícita y no ofrece una implementación predeterminada en src. Las pruebas asumen únicamente en laboratorio `validFrom <= instante < validUntil`, con null sin fin superior.
- **Pendiente al cierre L4-B:** pruebas con Entra ID real e integración HTTP. L5 añade controladores con datos sintéticos y verifica el host HTTP vivo sin token; siguen pendientes Entra real y HTTP con tokens reales/datos operativos. Health conserva su comportamiento local anónimo.

Los nombres Gestor ALFA, Gestor BETA y Consultor ALFA describen fixtures, no roles
institucionales aprobados. Los estados, capacidades y convenciones de PoC no sustituyen
las decisiones pendientes de Planeación. Detalle: [L4B_Autorizacion_Fichas.md](../../api/L4B_Autorizacion_Fichas.md).

## 6. Cierre local de L5 y L6-B

**Estado:** F2 en ejecución. Base c59b3928ab8e977a7668d82626f4063e10cefb7d. R10-A prepara ejecutor reutilizable fuera del repositorio y aprueba 13 pruebas con procesos sintéticos, sin ejecutar sqlcmd, SQL real o integración ODBC. Límites 5/5/15 sin cambios y evidencia sanitizada. R10-B requiere autorización posterior; R8-A sigue sin validación ODBC real. Suite API histórica 429, no repetida en esta etapa. No cerrar L8-C2 ni realizar commit. Intermitencia histórica sin causa confirmada.
partiendo de `a251e2a` y registrada en `f287707`. L4-B permanece completada en `8914e94`.
L6-A fue aprobada como diseño. L6-B está completada en alcance técnico local y registrada
en `2543c0a`; integra identidad L4-A, autorización L4-B y persistencia transaccional L3.

Se implementan GET `/api/poc/fichas/{fichaId}` y `/api/poc/fichas/{fichaId}/actividades`,
con capacidad exacta poc:read, autorización/lectura en una misma transacción y DTO mínimos.
Se usa 404 idéntico para ficha inexistente/no visible. La identidad proviene del JWT L4-A,
nunca del cuerpo, query o encabezados de suplantación. L5 no incluía escrituras HTTP ni
lista global. L6-B añade POST de creación, PATCH de actualización y GET individual de
reportes, con auditoría, concurrencia optimista e idempotencia en una misma transacción.
Su validación registra 214 pruebas automatizadas y 18 peticiones reales sobre las seis
operaciones del host; el detalle operativo y sus limitaciones constan al final.

Se comunicó y corrigió el defecto azp de L4-A: configuración obligatoria allowedClientIds
y pertenencia tras verificar firma, con pruebas. No cambian contratos L2 ni criptografía.
La composición real empieza con memoria vacía y vigencia bloqueada; sin configuración
JWT devuelve 500 genérico. Las respuestas 200 se prueban por DI, no con fixtures en el host.

La suite automatizada aprobó 182 pruebas. La validación operativa posterior compiló la API,
inició Azure Functions/Azurite en loopback y ejecutó nueve peticiones HTTP: health 200 en
los tres escenarios; ambas consultas sin token 401 con configuración JWT estructural válida;
ambas consultas 500 genérico con configuración incompleta y con JSON inválido. Las respuestas
observadas no filtraron información sensible. Los procesos se detuvieron al terminar.

La vigencia institucional y la configuración/pruebas reales de Entra ID siguen pendientes.
Cualquier convención técnica temporal adicional para una PoC deberá identificarse como
supuesto y revisarse expresamente, sin convertirla en regla institucional. No habilitar
recursos Azure, Graph, SharePoint, SQL ni cambios MSAL sin autorización independiente.

## 7. Planeación institucional y Excel

- Se recibió cuestionario de Planeación del **16 de octubre de 2026**, 20 temas P-01 a P-20, con respuestas y aclaraciones aún pendientes; no equiparar respuestas con aprobación final de cada regla.
- Fórmula trimestral de referencia: `IF(programado="","",IFERROR(MIN(alcanzado/programado,1),0))`. Requiere validar vacíos, ceros, negativos, topes y agregaciones ponderadas.
- Pesos por meta deben sumar exactamente 100%; no corregir automáticamente sin validación funcional.
- Avance numérico sin evidencia no puede presentarse como reporte final; distinción entre borrador y envío.
- Planeación valida evidencia; cierres, reaperturas, auditoría y retención deben formalizarse.
- Respuestas describen 10 años mínimos de disponibilidad de PAI, pero tratamiento de historial de cambios requiere revisión jurídica/documental.
- Excel consolidado 2026 adjuntado en conversación: `01. Plan de Acción 2026 Consolidado V1 (6)(1).xlsx`.
- Se comunicaron resultados preliminares de revisión: 54 hojas, fórmulas con `#REF!`, casos de ponderación 50% y 120%, y complejidad del Consolidado. Estos hallazgos deben reproducirse y documentarse en auditoría formal antes de tomarlos como inventario exhaustivo.
- Auditoría Excel y actualización de reglas funcionales son trabajos paralelos; no bloquean el adaptador técnico L4-B, pero sí la lógica institucional definitiva, importación y cálculos de negocio.

Documentación existente en repositorio:
- `docs/02-requisitos/PAI-002_Matriz_Requisitos.md`
- `docs/02-requisitos/PAI-003_Reglas_Negocio.md`
- `docs/02-requisitos/PAI-004_Pendientes_Planeacion.md`
- `docs/03-arquitectura/PAI-005_Modelo_Datos_Conceptual.md`
- `docs/03-arquitectura/PAI-006_Diccionario_Excel.md`
- `docs/03-arquitectura/PAI-007_Alternativas_Persistencia.md`
- `docs/04-diseno/PAI-008_Plan_Implementacion.md`

## 8. Restricciones y decisiones pendientes

- No se ha aprobado una arquitectura productiva ni Azure SQL/SharePoint como implementación definitiva; son alternativas estudiadas.
- No desplegar ni crear recursos Azure, API registration o scopes institucionales sin autorización.
- No incorporar secretos ni datos reales en fixtures, tests o repositorio.
- No habilitar bypass de identidad en endpoints desplegables.
- No considerar los roles sintéticos como matriz de permisos institucional.
- No modificar etapas anteriores sin justificación y revisión; las limitaciones históricas de cada cierre no son autorizaciones para alterar sus contratos.
- No registrar secretos, tokens ni datos institucionales sensibles; mantener separados hechos implementados, pruebas reportadas/ejecutadas, pendientes y supuestos.
- No ejecutar push, PR, merge ni commit sin autorización explícita del usuario.
- Revisar más adelante los riesgos de auditoría, inmutabilidad tras cierre, reaperturas, importación masiva y cálculo de indicadores.

## 9. Protocolo de mantenimiento de este documento

Revisar al finalizar cada etapa técnica, después de cada commit relevante, ante decisiones
arquitectónicas importantes y aproximadamente cada tres interacciones sustantivas cuando
el usuario o ChatGPT soliciten sincronización. Es una convención operativa, no una tarea
automática del chat ni una autorización permanente para modificar archivos.

En cada actualización:
1. Leer este archivo completo y consultar `git status --short`, rama y últimos commits.
2. Registrar solo los cambios confirmados desde el último corte: hito, archivos, pruebas, commit y decisión.
3. Diferenciar `Implementado`, `Reportado por Codex`, `Verificado con Git` y `Pendiente`.
4. Añadir incidencias y próximos pasos sin borrar decisiones históricas relevantes.
5. Actualizar fecha y último commit. Conservar el documento como archivo Markdown legible y versionable.
6. No realizar commit por el solo hecho de actualizar la bitácora: pedir autorización y agruparlo con el commit de la etapa cuando corresponda.

**Plantilla mínima de nueva entrada:** fecha; etapa; objetivo; acciones ChatGPT/Codex/usuario; archivos; pruebas; resultado; commit (si existe); riesgos; siguiente acción.

## 10. Estado al corte y acción inmediata

**Corte actual:** L7-B4 registrada en dc72d99; up original aplicado en la base sintética
local pai_poc_dev. El verify original falló por colaciones; R2 incorpora auxiliares R1 y
su verify fue exitoso sin alterar historial ni datos. Pendiente de revisión/commit.
No hay adaptador SQL ni autorización para producción, nuevas bases o reversión.
Los registros siguientes conservan los hechos y pendientes de sus fechas históricas.

### Antecedente del corte tras L4-B

Último hecho confirmado localmente: L4-B registrada en `8914e94`, sobre
`feature/arquitectura-persistencia-pai`; L1–L4-B completadas. El único pendiente de Git
observado es el maestro preexistente sin seguimiento. La siguiente etapa es L5 — Consultas
HTTP autenticadas, todavía pendiente de alcance y autorización. No se inicia en esta intervención.

El párrafo anterior corresponde al corte histórico tras L4-B. La entrada siguiente L5
actualiza ese estado y registra los commits documentales intermedios.

### Registro de sincronización — 19/10/2026

- **Objetivo:** sincronizar el maestro con el cierre de L4-B sin alterar código ni otros documentos.
- **Acciones:** el usuario proporcionó el alcance y los commits; Codex leyó el maestro completo,
  contrastó README L1, documentos L2/L3/L4-A/L4-B, historial Git, servicio de autorización y
  versiones del lockfile. Se conserva el historial F1, las restricciones y los antecedentes de Planeación/Excel.
- **Archivo actualizado:** únicamente `docs/seguimiento/PAI_Digital_Continuidad_Tecnica.md`.
- **Pruebas históricas:** 132 aprobadas según cierre L4-B; no se ejecutan builds ni pruebas de aplicación por esta actualización documental.
- **Verificación documental:** `git diff --check` y revisión adicional del maestro sin seguimiento
  mediante `git diff --no-index --check`; estado Git revisado. No se hace commit.
- **Discrepancias registradas:** el maestro anterior aún indicaba L4-B pendiente y HEAD `131cab7`;
  se actualiza a `8914e94`. `api/README.md` todavía declara que L4-B no está implementada y su
  resumen de capas/límites llega hasta L4-A; el servicio, las pruebas, el documento L4-B y el
  commit demuestran que esa síntesis está desactualizada. No se modifica README por estar fuera del alcance.
- **Lectura histórica:** los pendientes descritos en los cierres L2/L3/L4-A corresponden al
  momento de cada etapa; no anulan las implementaciones posteriores. Los datos institucionales
  y hallazgos Excel de la sección 7 se conservan como antecedentes, sin revalidarlos en esta revisión.
- **Riesgos vigentes:** política temporal institucional sin definir, ausencia de pruebas Entra/HTTP
  reales y arquitectura productiva todavía no aprobada.
- **Siguiente acción:** revisión del usuario y autorización antes de versionar el maestro o iniciar L5.

### Registro L5 — Implementación y cierre técnico local

Actualización de trazabilidad: el cierre inicialmente pendiente de commit quedó registrado
en `f287707`. Las menciones a commit pendiente en el relato siguiente describen ese corte anterior.

- **Base:** rama feature/arquitectura-persistencia-pai, HEAD `a251e2a`, árbol inicial limpio.
  Entre L4-B y esta ejecución se registraron `7d22967` (maestro) y `a251e2a` (README).
  El estado sin seguimiento y la discrepancia README citados en la entrada histórica ya
  quedaron resueltos por esos commits; no describen el estado inicial de L5.
- **Implementado para revisión:** consultas de ficha/actividades, controlador reutilizado por
  Functions, composición explícita, registro GET y selección de las tres funciones en loopback.
  Corrección mínima previa azp mediante lista explícita de clientes permitidos.
- **Archivos:** cinco fuentes nuevas L5 bajo application/queries, http, composition y functions;
  cambios en configuración/normalización de identidad, entrypoint package.json, lanzador,
  guard y pruebas. Documentación en `api/L5_Consultas_HTTP.md` y secciones afectadas de README.
- **Probado localmente:** suite L1–L5, 182 aprobadas y 0 fallidas; API, contratos y límites
  correctos; frontend compila con aviso previo de bundle >500 kB. Controladores reales con
  HttpRequest, JWT sintéticos firmados, L4-A/L4-B y persistencia L3. Registro comprobado por
  AST y posteriormente mediante arranque real de Azure Functions Core Tools y Azurite.
- **Seguridad:** 401 por autenticación inválida; 400 por solicitud mal formada tras autenticar;
  404 uniforme por ausencia/falta de acceso; 403 reservado sin emitir para evitar enumeración;
  500 genérico. Se prueban revocación, concurrencia, GET sin escrituras y acceso cruzado.
- **Supuestos/límites:** política de intervalo solo en tests; composición del host bloquea
  vigencia y no precarga datos. No se modifica MSAL ni se instala dependencia. Sin configuración
  JWT explícita, nuevas rutas responden 500 y health permanece independiente.
- **Validación operativa:** nueve peticiones HTTP reales, tres rutas en tres configuraciones.
  Con configuración JWT estructural válida y ficticia: health 200 y consultas de ficha/
  actividades sin token 401. Con configuración incompleta y con JSON inválido: health 200
  y ambas consultas 500 genérico en cada escenario. Se confirmaron las tres rutas GET y
  listeners exclusivamente 127.0.0.1:7071/10000/10001/10002 antes de enviar HTTP.
- **Confidencialidad observada:** respuestas sin filtración de información sensible; marcador
  sintético de configuración ausente en respuestas/logs revisados. stderr vacíos, sin avisos
  de almacenamiento Unhealthy en la ventana observada. No es una prueba de tenant real.
- **Evidencia operativa:** `api/.test-tmp/l5-http-operational/`, ignorado por Git; resultados
  http-valid/incomplete/invalid-results.json y logs host-valid/incomplete/invalid y storage.
  No se cargaron fixtures ni se habilitó política temporal permisiva. Functions y Azurite
  quedaron detenidos, sin listeners en los cuatro puertos. La prueba conservó las huellas
  SHA-256 de los 19 archivos L5 existentes y no alteró código ni pruebas.
- **Cierre documental:** L5 completada en su alcance técnico local, pendiente de commit.
  Esta intervención actualiza solo el maestro y `api/L5_Consultas_HTTP.md`; no vuelve a
  ejecutar la suite ni el host y no inventa identificador de commit. El README conserva
  el estado previo de implementación hasta una sincronización expresamente autorizada.
- **Pendiente:** definición institucional de vigencia de asignaciones, memoria/composición
  operativa de datos y pruebas HTTP con tokens reales y datos operativos, además de Entra real.
  No existe aprobación de arquitectura productiva ni despliegue por este cierre.
- **Siguiente acción:** revisión y autorización del commit L5; L6 — Escrituras HTTP como
  siguiente etapa, todavía no iniciada. No se realizan commit, push, PR ni merge ni se avanza a L6/L7.

### Registro L6-B — Cierre técnico local y registro posterior

Actualización de trazabilidad L7-B1: L6-B quedó registrada en `2543c0a`, verificado
mediante Git. Las menciones siguientes a commit pendiente, HEAD `f287707` y siguiente
etapa todavía no autorizada describen el cierre histórico previo al registro de L6-B.

- **Base:** rama feature/arquitectura-persistencia-pai, HEAD `f287707`, árbol inicial limpio.
  Se contrastaron L2–L5, entidades, repositorios, versiones, errores, identidad, autorización
  y composición. Los contratos L2 y los adaptadores L3/L4-A/L4-B no se modifican.
- **Implementado para revisión:** POST `/api/poc/actividades/{activityId}/reportes`,
  PATCH y GET `/api/poc/reportes/{reportId}`. Escrituras poc:edit-report; consulta poc:read.
  Ficha derivada de actividad/reporte persistido, 404 uniforme sin permisos o sin recurso.
- **Contenido técnico:** POST acepta period/quantity/narrative, crea poc-draft y genera ID,
  actor y tiempo en servidor. PATCH exige expectedVersion y solo edita quantity/narrative;
  diferencia omisión/null y rechaza otros estados. No son transiciones institucionales.
- **Consistencia:** una misma instancia de memoria sirve lecturas y escrituras. Autorización,
  idempotencia, reporte y auditoría se ejecutan en un runAtomic. SHA-256 determinista con
  objetivo/operación/cliente/campos/versión, sin normalizar decimales. Replay tras autorización
  y antes de volver a comprobar versión; sin segunda escritura ni auditoría. Eventos con
  snapshots completos. Reservas y cambios se revierten ante fallos.
- **Pruebas:** 214 aprobadas, 0 fallidas en suite L1–L6-B; API, contratos, guard y frontend
  correctos. Se ejercitan controladores con JWT sintéticos, conflictos, carreras, replays,
  revocación, rollback y memoria independiente. Posteriormente se ejecutó el host HTTP vivo
  de L6-B: su evidencia se registra debajo, separada de las pruebas en proceso y de L5.
  Persiste aviso frontend de bundle >500 kB.
- **Documentos:** api/L6B_Escrituras_HTTP.md, README, este maestro y corrección de referencias
  de cierre/commit en api/L5_Consultas_HTTP.md. Sin cambios en frontend, MSAL o dependencias.
- **Límites:** memoria vacía y política temporal bloqueada en host; fixtures solo en tests;
  sin Entra real, SQL, Graph/SharePoint, recursos o despliegues. No implementar estados,
  aprobaciones, cierres ni reaperturas institucionales. L6-B queda completada solo en su
  alcance técnico local y no tiene commit propio.
- **Validación operativa L6-B:** rama y HEAD f287707 confirmados, nueve modificados y seis
  nuevos esperados, sin cambios ajenos; build API y git diff --check correctos. Functions
  Core Tools 4.16.0 y Azurite arrancaron correctamente en loopback. Se registraron GET
  health, GET ficha, GET actividades, GET reporte, POST creación y PATCH actualización.
- **HTTP real:** 18 peticiones, seis operaciones en tres escenarios. Configuración JWT
  estructural válida pero ficticia sin token: health 200 y cinco protegidas 401. Configuración
  incompleta y JSON inválido: health 200 y cinco protegidas 500 genérico en cada escenario.
  POST/PATCH usaron JSON válido sintético. No se cargaron fixtures ni se permitió vigencia.
- **Confidencialidad observada:** respuestas controladas UNAUTHENTICATED/INTERNAL_ERROR,
  sin divulgación sensible ni marcador sintético de configuración. stderr vacíos y sin
  errores de arranque/almacenamiento detectados; no equivale a validación productiva completa.
- **Parada e integridad:** Functions y Azurite detenidos, cero listeners en 7071/10000/10001/
  10002. SHA-256 de los 15 archivos y Git sin cambios durante la validación operativa.
  Logs/resultados en api/.test-tmp/l6b-http-operational-20261019/, ignorado por Git.
- **Cierre documental:** se actualizan únicamente api/L6B_Escrituras_HTTP.md y este maestro.
  No se inventa hash de L6-B; HEAD sigue en f287707 y el commit está pendiente. No se
  ejecuta de nuevo la suite o el host por esta actualización. El README conserva el estado
  anterior de implementación hasta una sincronización expresamente autorizada.
- **Pendientes funcionales/operativos:** memoria efímera sin persistencia operativa,
  política temporal de asignaciones bloqueada y sin pruebas HTTP exitosas con JWT válidos
  y datos operativos. Aprobación, devolución, cierre y reapertura institucionales requieren
  definiciones de Planeación; no se sustituyen por estados técnicos o fixtures de prueba.
- **Siguiente acción:** revisión y autorización del usuario; no avanzar a L7 ni realizar
  commit, push, PR o merge.

### Registro L7-A / L7-B1 — Diseño concluido y preparación técnica SQL

- **Fecha/base:** 19/10/2026; rama feature/arquitectura-persistencia-pai, HEAD `2543c0a`.
  Se verificó el commit L6-B y sus 15 archivos. No había modificaciones versionadas;
  existía únicamente el informe L7-A sin seguimiento, generado por solicitud del usuario:
  `docs/seguimiento/PAI_F2_L7A_Diseno_Persistencia_Duradera.txt`. Se conserva intacto;
  no se describe el árbol completo como limpio.
- **L7-A:** diseño preliminar concluido. Candidatos: SQL Server local para validación
  y Azure SQL posterior, manteniendo memoria para regresión. No es aprobación productiva.
- **L7-B1:** inspección de tipos, entidades, puertos, memoria y HTTP reales, y propuesta
  de decisiones en el informe de la conversación. Solo se sincronizan este maestro,
  `api/README.md` y `api/L6B_Escrituras_HTTP.md`; se conserva el historial de cierres.
- **Compatibilidad:** tokens L2 sin máximos declarados; no imponer 128 caracteres por
  extrapolación de HTTP. DecimalText conserva texto exacto, incluidos ceros y signo.
  UtcInstant usa ISO UTC canónico, pero admite año 0000 y años extendidos: datetime2(3)
  no cubre todo su rango. Version es opaca, no necesariamente UUID.
- **Propuesta pendiente de aprobación:** claves físicas internas bigint y representación
  exacta de claves de dominio, con búsqueda por digest no único y comparación completa;
  colación Latin1_General_100_BIN2 para texto técnico, sin normalización; versiones
  rowversion con codec canónico; fechas ISO originales y proyección SQL opcional;
  SQL Server 2022 Developer / compatibilidad 160 como línea base conservadora.
  No se crean nuevos límites públicos, permisos o estados institucionales.
- **Controlador candidato:** mssql con Tedious, sin componente nativo obligatorio;
  versión exacta y dependencias transitivas sujetas a comprobación del artefacto y prueba
  con Node 24 antes de instalar. La evidencia web consultada no constituye ejecución local.
- **Aceptación futura:** regresión integral L1–L6-B, round-trip de representaciones,
  persistencia tras reinicio, unicidad exacta, colisiones de digest forzadas, concurrencia
  entre conexiones, revocación, rollback, replay histórico y recuperación de fallos.
- **Pruebas en esta etapa:** no se repite la suite ni el host. Se confirma con Node que
  fechas canónicas año 0000 y +010000 satisfacen la condición temporal usada en L2.
  Las 214 pruebas y 18 peticiones siguen siendo evidencia histórica del cierre L6-B.
- **Límites:** sin cambios de código, pruebas, contratos, dependencias o insumos;
  sin SQL instalado/conectado, bases, contenedores, migraciones ni recursos Azure.
  Vigencia de asignaciones, retención y flujos institucionales siguen pendientes.
- **Siguiente acción:** revisar recomendaciones y aprobar explícitamente alcance,
  representación y entorno de L7-B2. No se realiza commit, push, PR, merge o despliegue.


### Corte vigente — L7-B2 implementada, pendiente de revisión/commit — 20/10/2026

Nota de trazabilidad posterior L7-B4: L7-B2 quedó registrada en `ba6c2b6`.
El encabezado y el relato siguiente conservan el corte previo al commit, no el estado actual.

Esta entrada actualiza el estado de los cortes anteriores sin borrar su historia.
Rama verificada: feature/arquitectura-persistencia-pai; HEAD sigue en 2543c0a (L6-B).
L7-A/L7-B1 concluyeron como análisis; L7-B2 implementa únicamente representaciones y pruebas.
No existe commit nuevo de L7-B2 y no se autoriza SQL, infraestructura o despliegue.

- **Decisión aprobada:** alternativa B, persistencia relacional convencional con límites
  técnicos explícitos. Se descartan las propuestas TokenValues, IDs varbinary(max) y
  bloqueos especiales SHA-256; nunca estuvieron implementadas. La huella idempotente
  SHA-256 de L6-B permanece. Las recomendaciones anteriores A/C quedan como antecedentes.
- **Cambios incompatibles L2:** IDs internos ASCII 1–64; tenant/objeto GUID canónico
  minúsculo no nulo; PeriodKey 1–128 unidades UTF-16 bien formadas; IdempotencyKey ASCII
  1–128; CorrelationId ASCII 1–64; huella 64 hexadecimales minúsculos; Version ASCII
  visible 1–128; UTC con milisegundos y años 0001–9999. Los alfabetos concretos constan
  en api/L7B2_Representacion_SQL.md. DecimalText no cambia. Sin truncamiento/normalización.
- **Contrato conservado:** mismas marcas nominales, firmas, entidades, puertos y errores;
  sin nuevos estados, roles, fórmulas, retención o reglas funcionales institucionales.
- **Memoria:** valida semillas y escrituras/snapshots en el contexto transaccional;
  conserva versiones, copias defensivas, atomicidad, rollback y contextos vencidos.
- **HTTP/seguridad:** IDs de ruta máximo 64, autenticación previa, autorización por ficha
  y capacidad, denegación por defecto, 404 uniforme y errores internos genéricos. No
  cambian los seis endpoints, la configuración JWT, MSAL o la política temporal bloqueada.
  Se preservan auditoría, idempotencia, replay histórico y tamaño de solicitudes.
- **Verificado localmente:** 248 pruebas aprobadas, 0 fallidas/omitidas: 214 históricas
  conservadas y 34 nuevas (28 representación/memoria y 6 HTTP). Build API, contratos
  TypeScript y fronteras aprobados mediante npm test; frontend build correcto, con aviso
  previo de bundle >500 kB. No se arranca Functions/Azurite ni se valida HTTP por sockets.
- **Documentación:** adiciones en README, L2, L3, L6-B y este maestro; nuevo documento
  api/L7B2_Representacion_SQL.md. Se conservan íntegros los textos preexistentes L7-B1
  y el informe L7-A sin seguimiento; no se reescriben como decisiones siempre vigentes.
- **Límites:** memoria efímera, sin Entra institucional real, SQL, conexiones, bases,
  migraciones, dependencias nuevas, recursos Azure, Graph o SharePoint. No cambia frontend.
  Vigencia de asignaciones, aprobaciones, devolución, cierre, reapertura y retención siguen
  pendientes de definición institucional. La regresión integral sigue siendo obligatoria.
- **Siguiente paso:** revisión del usuario y autorización posterior antes de commit o
  implementación del adaptador SQL. No se realiza commit, push, PR, merge ni despliegue.

### Registro L7-B3 / L7-B4 — Migración inicial, solo artefactos — 20/10/2026

- **Base verificada:** rama feature/arquitectura-persistencia-pai, HEAD `ba6c2b6`, árbol
  inicial limpio. L7-B2 está finalizada/registrada; se corrige la referencia del corte vigente
  conservando los relatos anteriores. L7-B3 es el diseño de la conversación, sin archivo
  L7-B3 adicional asumido ni migraciones ejecutadas en esa etapa.
- **Decisión vigente:** alternativa B, ocho tablas convencionales con representaciones
  L2 acotadas, PK/FK/UNIQUE/CHECK y versiones. No se implementa TokenValues ni bloqueo
  por digest. Los hashes son de artefactos/catálogo, no sustituyen igualdad de IDs.
- **Implementado L7-B4:** api/migrations/README.md, manifest.json, .gitattributes local
  y 0001_initial/up.sql, verify.sql, down.development.sql; pruebas estáticas en
  api/tests/migrations-static.test.mjs. No se cambia código de aplicación o contratos.
- **Modelo:** ocho tablas funcionales; siete RV; InsertionOrder en Activities y
  AccessAssignments; once FK NO ACTION; UNIQUE tenant/objeto, actividad/periodo y ámbito
  idempotente. Cantidades textuales, datetime2(3) y snapshots históricos JSON preservados.
  La validación completa Unicode/UTC/entidades y autorización seguirá en el futuro adaptador.
- **Historial técnico:** pai_meta.SchemaMigrations agrupa versión, fecha UTC y checksums
  de scripts/catálogo. Se prefiere a propiedades extendidas por simplicidad de consulta y
  verificación; no constituye entidad funcional adicional. LF se fija para hashes estables.
- **Seguridad:** rol técnico API sin usuarios/logins ni credenciales, SELECT acotado,
  INSERT y UPDATE por responsabilidad/columna, sin DELETE/ALTER ni acceso al historial.
  Principal de migración separado. Las guardas exigen contexto explícito, destino sintético
  local y loopback; Azure queda bloqueado aunque el DDL use características compatibles.
- **Reversión:** exige confirmación adicional, catálogo/historial íntegros, rol sin miembros
  y ocho tablas vacías. No hay override para borrar datos; errores revierten y se relanzan.
- **Validación estática:** 260 pruebas aprobadas, 0 fallidas/omitidas: 248 previas y 12
  nuevas. El pretest ejecuta build API, contratos TypeScript y fronteras. No es compilación
  T-SQL ni prueba de restricciones o permisos del motor. Frontend y git diff se verifican
  también al cierre; el aviso previo de bundle >500 kB no es un cambio de esta etapa.
- **Pendiente:** ejecutar scripts en entorno autorizado, comprobar restricciones/permisos,
  drift del catálogo, Unicode, fechas/RV, concurrencia, rollback/desconexión y recuperación;
  crear adaptador/controlador SQL solo con autorización posterior. Se mantienen pendientes
  funcionales de Planeación, Entra real, retención y evidencias.
- **Límites/cierre:** no se instala, conecta o ejecuta SQL, crea base, migra datos ni
  cambia frontend/MSAL/dependencias. No se realiza commit, push, PR, merge o despliegue.
  Esperar revisión y autorización antes de registrar o ampliar el alcance.

### Registro L7-B5-B2-R2 — Verificador auxiliar R1 — 20/10/2026

- **Base:** feature/arquitectura-persistencia-pai, HEAD dc72d99, Git inicialmente limpio.
  Instancia PAIPOC local observada operativa: Developer 16.0.1000.6, autenticación Windows
  y Shared Memory. Su instalación/configuración son antecedentes; R2 no los modifica.
- **Antecedente B2:** base pai_poc_dev y up original creados/aplicados por autorización
  previa. verify original falló con 468 al comparar Kind Modern_Spanish_CI_AS con
  sys.objects.type Latin1_General_CI_AS_KS_WS. R1 de diagnóstico concluyó como diseño.
- **Implementación R2:** api/migrations/verifiers/0001_initial/r1/{manifest.json,verify.sql,
  down.development.sql}; descriptor con hashes históricos y auxiliares. Solo se corrige
  Kind/o.type con COLLATE Latin1_General_100_BIN2; se agregan guardas R1 separadas del
  contexto histórico. Se conserva byte a byte el resto del algoritmo del verificador,
  incluida serialización, huella, transacción, restricciones y seguridad de down.
- **Compatibilidad:** no se edita manifiesto raíz ni originales 0001_initial. Las claves
  migration.* siguen representando la terna original, validada explícitamente y contra
  el historial. verifier.* identifica revisión/hashes auxiliares verificados externamente.
  No hay fila R1 ni actualización de SchemaMigrations; no es una nueva migración DDL.
- **Pruebas:** 269 API aprobadas, cero fallidas/omitidas (260 previas + nueve nuevas).
  Contratos, TypeScript y fronteras aprobados. Frontend compila con aviso previo >500 kB.
  Se ajustó un selector de una prueba nueva antes de ejecutar SQL; no un script del motor.
- **SQL real:** exclusivamente verify R1, tras pruebas estáticas y validación de archivos,
  mediante sqlcmd -S lpc:.\PAIPOC -E -d pai_poc_dev -b -V 11 -l 10 -t 60 -r 1,
  contexto y script en la misma conexión. Código 0, 0001_initial / verified, 494 ms;
  @@TRANCOUNT=0 y XACT_STATE()=0. No se reejecuta up ni ningún down.
- **Integridad antes/después:** snapshot idéntico de historial, catálogo y ocho recuentos
  funcionales, todos cero. Una fila 0001_initial con sus tres hashes y fecha original
  2026-10-20T21:13:22.747 UTC. Huella de catálogo conservada:
  822fb17b1d66a55e97217c30829d045b03de808d890972078f35f45516764720.
- **Documentación/pruebas:** README de migraciones y este maestro actualizados; prueba
  histórica de inmutabilidad y ocho pruebas R1. No cambia API README, frontend, contratos,
  MSAL, dependencias, SQL de aplicación ni configuración del motor.
- **Estado:** L7-B5-B2 supera creación/aplicación original y verificación local mediante R1;
  recomendar cierre de ese alcance sujeto a revisión. R2 pendiente de commit, sin inventar
  hash. No es validación productiva ni implementación de persistencia SQL de la API.
- **Pendiente:** down R1 solo preparado, sin ejecución; permisos efectivos, concurrencia,
  rollback, recuperación, instalación nueva y otras colaciones requieren etapas autorizadas.
  Conservados los pendientes institucionales de Planeación y la regresión integral.
- **Restricciones cumplidas:** sin nuevas bases o registros funcionales, alteración de
  historial, configuraciones, commit, push, PR, merge o despliegue. Esperar revisión.


### Registro L8-B — Consolidación de conectividad SQL y observabilidad — 21/10/2026

- **Base confirmada:** feature/arquitectura-persistencia-pai, HEAD
  `bade509ad6d4b3b4ae8c1b537eaa6b64101425f7`, nueve archivos pendientes de L8-B.
  El registro histórico R2 anterior conserva su estado previo al commit; Git confirma
  que el verificador R1 quedó registrado en ese HEAD. No se modifican los originales
  0001_initial, manifiestos, auxiliares R1 ni el historial SQL.
- **Implementación:** ejecutor independiente en api/scripts/sql-diagnostic.mjs y perfil
  fijo en sql-diagnostic-config.mjs, fuera de src, HTTP y composición de dependencias.
  Se incorporan mssql 12.7.10 y msnodesqlv8 5.6.0 como dependencias de desarrollo exactas,
  con lockfile; ODBC Driver 17 x64 17.10.6.1 ya estaba instalado. Node.js 24.22.0 x64.
- **Conectividad demostrada en L8-B/R4:** SQL Server 2022 Developer 16.0.1210.3,
  instancia PAIPOC, base sintética pai_poc_dev, Shared Memory y autenticación Windows
  integrada (NTLM observado). No se habilitan TCP/IP o Named Pipes ni se cambia el motor.
- **Seguridad:** no se publican identidades Windows, nombres de principales, cadenas
  de conexión, datos de resultados, mensajes originales ni stacks del controlador.
  Resultados y trazas se proyectan mediante listas positivas; errores con categorías
  y mensajes fijos. El perfil rechaza alojamiento Azure, otros runtimes y destinos.
  TrustServerCertificate=Yes es una excepción exclusiva del diagnóstico local.
- **Restricción administrativa:** la conexión observada tiene privilegios administrativos,
  expresados solo mediante un booleano. Está prohibido reutilizar sysadmin para escrituras
  funcionales de la API. Una identidad de aplicación con privilegios mínimos y su validación
  necesitan autorización e implementación posteriores; no se crean usuarios ni permisos.
- **Observabilidad R4:** desactivada por defecto; CLI --local --trace o configuración
  explícita del ejecutor local. stderr recibe etapa fija, duración monotónica, resultado,
  categoría/código permitido e indicadores del pool/transacción; stdout conserva el JSON
  de resultado. No se incorpora traza a respuestas HTTP. transactionActive es seguimiento
  del cliente, no prueba independiente del estado SQL tras un fallo de limpieza.
- **Limpieza:** rollback y cierre se intentan cuando corresponde. Fallos secundarios no
  sustituyen la categoría del error principal. La traza registra cada fallo de limpieza;
  fallos síncronos del destino de traza se descartan sin alterar el resultado SQL.
- **Pruebas automatizadas R4:** 298 aprobadas, ninguna fallida/omitida (288 anteriores
  y diez nuevas de trazabilidad). Las 29 dirigidas incluyen 23 de privacidad/trazabilidad
  y seis del diagnóstico; health funciona con carga nativa bloqueada. Pretest verifica
  compilación API, TypeScript, contratos y fronteras. Frontend compila con aviso previo
  de bundle superior a 500 kB. La revisión de cierre vuelve a ejecutar la regresión
  pertinente antes del commit; sus resultados finales constan en el informe de cierre.
- **SQL real R4, evidencia previa al cierre:** una integración optativa de solo lectura,
  16 etapas satisfactorias, 234 ms en el cuerpo de la prueba. Conexión 82 ms, catálogo
  43 ms, rollback 1 ms y cierre 1 ms; category y technicalCode null. Shared Memory,
  ocho tablas reconocidas, historial original, estado transaccional 0/1/0 y pool cerrado.
  Consulta independiente posterior: cero sesiones diagnósticas. Este cierre no necesita
  reejecutar SQL ni presenta los resultados anteriores como una ejecución nueva.
- **Intermitencia pendiente:** R2/R3 registraron SQL_QUERY_FAILED y fallos de conexión,
  incluido código 258 en 10240 ms; también hubo ejecuciones completas satisfactorias.
  No se confirmó la causa de consulta original. Disponibilidad transitoria, recursos
  o comportamiento del controlador son hipótesis, no conclusiones. R4 añade evidencia
  para futuras incidencias sin elevar timeouts, añadir reintentos o declarar resolución.
- **Límites conservados:** MemoryUnitOfWork, contratos HTTP, frontend/MSAL y migraciones
  intactos; no hay persistencia funcional SQL, escrituras de datos, recursos Azure,
  Graph/SharePoint ni despliegues. No se han probado durabilidad de reportes, autorización
  SQL, concurrencia, auditoría o idempotencia SQL. Reproducibilidad del binding nativo
  en otros equipos pendiente. Subsisten las decisiones funcionales de Planeación.
- **Cierre autorizado:** un único commit con mensaje
  `feat(api): incorpora diagnostico SQL local con trazabilidad sanitizada`, condicionado
  a revisión y pruebas satisfactorias. Este corte se prepara antes del commit y no
  inventa su hash. Sin push, PR, merge, despliegue ni avance automático a L8-C.
  Detalle: [L8B_Conectividad_SQL.md](../../api/L8B_Conectividad_SQL.md).


### Registro L8-C1 — Codecs y sesión SQL aislada — 21/10/2026

- **Base:** feature/arquitectura-persistencia-pai, HEAD 90e160eaa3dcfe0104c402bb00e5558b614ecb8e,
  Git limpio. L8-B quedó registrada en ese commit; se conservan sus relatos previos al commit.
- **Fuentes:** siete contratos de repositorio, UnitOfWork/MemoryUnitOfWork y sesiones,
  tipos/entidades L2, validadores de memoria, migración original y diagnóstico L8-B.
  No se encontró archivo de informe L8-A en el repositorio; no se presupone su contenido.
- **Implementado:** codecs, errores sanitizados y SqlSessionRunner con puertos de transporte
  internos, sin carga de controlador ni conexión real. La sesión no sustituye UnitOfWork ni
  crea repositorios. Contratos L2, SQL original/R1, HTTP, memoria y MSAL permanecen intactos.
- **Conversiones:** validadores L2 para IDs, GUID, periodo, claves y huellas; texto/booleanos
  estrictos; DecimalText textual exacto; ISO UTC/Date para datetime2(3); null explícito;
  enumeraciones existentes; ocho bytes RV/Version rv1:hex; snapshots tipados con versiones
  históricas opacas; InsertionOrder bigint sin Number. Se rechazan JSON duplicado, campos
  desconocidos o incompletos y valores inválidos sin exponer el contenido.
- **Vida transaccional:** transporte inyectable y conexión exclusiva; consultas ligadas a
  la misma transacción SERIALIZABLE; modo commit/rollback explícito. Rechazo de anidación,
  concurrencia y uso posterior al cierre. Drenaje de consultas pendientes antes de liberar;
  consultas no esperadas impiden confirmar. Primer error preservado ante fallos de limpieza.
  Errores de dominio conocidos del callback se conservan sin copiar mensajes contaminados.
- **Fronteras:** tres fuentes SQL permitidas, sin imports desde HTTP/composición/memoria
  ni dependencias SQL hacia Entra/Azure Functions. No hay nueva configuración o dependencia.
- **Límites:** todos los commits se prueban con dobles. No se ejecuta SQL real en L8-C1,
  ni escrituras, migraciones o cambios de servidor/permisos. La sesión no demuestra todavía
  cierre físico o transacciones del motor; requiere transporte con I/O acotado y descarte
  de conexiones inciertas. Un commit fallido puede ser ambiguo en un servidor real; no
  se reintenta ni se promete que rollback revierta un commit ya ocurrido. La intermitencia
  previa de L8-B continúa pendiente, así como mínimos privilegios para la API y Planeación.
- **Siguiente propuesta L8-C2:** binding de transporte y parámetros tipados, integración
  optativa de solo lectura/rollback en pai_poc_dev, verificación de formatos reales y
  liberación de recursos; mantener HTTP en memoria y pedir autorización antes de ampliar.
- **Documentación:** [L8C1_Codecs_Sesion_SQL.md](../../api/L8C1_Codecs_Sesion_SQL.md)
  detalla conversiones, responsabilidades, riesgos y alcance. Sin commit, push, PR,
  merge o despliegue; esperar revisión del usuario.

- **Validación L8-C1:** 338 pruebas API aprobadas, cero fallidas/omitidas: 298 anteriores
  y 40 nuevas (14 codecs, 21 sesión y cinco fronteras). Pruebas dirigidas 62 aprobadas,
  incluidas las fronteras anteriores. TypeScript, contratos y fronteras correctos;
  frontend compila con aviso previo >500 kB. Privacidad/traza L8-B y health sin carga
  nativa siguen aprobados. No se ejecutó integración SQL real. Git: seis nuevos y tres
  modificados del alcance, sin staging ni commit; git diff --check sin errores.


### Auditoría L8-C1-R1 y preparación de cierre — 21/10/2026

- **Base:** HEAD 90e160eaa3dcfe0104c402bb00e5558b614ecb8e y nueve archivos pendientes
  de L8-C1, coincidentes con lo esperado. Se conserva el relato anterior y sus 338 pruebas
  como corte histórico, sin presentarlo como resultado posterior a las correcciones R1.
- **Defectos demostrados:** el callback accedía a scope/transaction/finish por propiedades
  privadas solo en TypeScript; borrar un fallo permitía commit. También podía alterar
  la instancia de error retenida. Se corrigió con fachada runtime congelada, campos JS
  privados, errores internos independientes y sanitización final.
- **Codecs:** se corrigieron rowversion con iterador/byteLength sobrescritos y Date inválido
  con métodos sobrescritos. Se leen bytes y fechas mediante intrínsecos; snapshots toman
  valores de descriptores validados, sin una segunda lectura susceptible a Proxy.
- **Errores:** categorías controladas, sin propiedad stack ni errores originales. Commit
  sin respuesta fiable: SQL_COMMIT_OUTCOME_UNKNOWN y transactionOutcome=unknown;
  rollback posterior no elimina esa ambigüedad. Close fallido después de confirmación:
  SQL_CLOSE_FAILED y transactionOutcome=committed. Se conserva el primer error ante
  fallos secundarios. Errores de dominio conocidos conservan tipo/código sin contaminarse.
- **Garantías y límites:** unicidad de transacción, SERIALIZABLE solicitado, ausencia de
  anidación/concurrencia, drenaje, rollback y cierre se prueban solo con dobles. No se
  ejecuta integración SQL real, escrituras, migraciones ni cambios de servidor. I/O
  acotado, descarte/cierre físico, commit ambiguo del motor y formatos ODBC siguen
  pendientes de L8-C2. No usar sysadmin para escrituras funcionales. HTTP permanece
  en memoria; no cambian L2, migraciones, paquetes, permisos, usuarios ni MSAL.
- **Cierre autorizado:** un único commit con mensaje
  `feat(api): incorpora codecs y sesion SQL transaccional aislada`, condicionado a
  auditoría y pruebas satisfactorias. Este corte se prepara antes de registrar y no
  anticipa el hash. No realizar push, PR, merge o despliegue ni iniciar L8-C2.

- **Validación final R1:** 45 dirigidas aprobadas (18 codecs y 27 sesión), 348 pruebas API
  aprobadas y ninguna fallida/omitida; diez regresiones nuevas frente a las 338 iniciales.
  TypeScript, contratos y fronteras correctos. Frontend compila con aviso previo >500 kB.
  git diff --check y revisión de archivos nuevos sin errores. No se ejecutó test:sql ni
  integración SQL real. Se revisan y consolidan los mismos nueve archivos autorizados;
  el identificador del commit se entrega tras registrarlo, sin inventarlo en este corte.


### L8-C2-R1 — Descriptor de parámetros seguro — 21/10/2026

- **Base:** rama feature/arquitectura-persistencia-pai y HEAD
  c59b3928ab8e977a7668d82626f4063e10cefb7d, Git limpio. Se registra el commit real
  del cierre L8-C1/R1; los relatos anteriores previos al commit se conservan como historia.
- **Diagnóstico previo L8-C2:** no se modificaron archivos al detectar tipos insuficientes
  en SqlStatement y conversiones inseguras del controlador. La autorización R1 permite
  ampliar únicamente el descriptor y sus validaciones, sin cambiar L2 o el ciclo de sesión.
- **Implementación:** nuevo parameters.ts con unión discriminada, metadatos length/precision/
  scale y validación runtime. Session reexporta los tipos y valida la copia antes del
  transporte; se comparó el cuerpo con HEAD y permanece idéntico salvo esa validación.
  No se cambian transacciones, SERIALIZABLE, commit/rollback, drenaje, fachada, concurrencia,
  errores o clasificación del commit. Se amplía solo la lista de fuentes permitidas.
- **Tipos:** varchar/nvarchar, GUID, datetime2, bit, bigint textual, decimal/numeric
  textual con precisión/escala, binary y varbinary. Se distinguen null, vacío y undefined;
  rechaza longitud/precisión/escala incompatibles, pérdidas por redondeo, propiedades ajenas
  y nombres ambiguos. El uso existente nvarchar sin longitud se conserva con max explícito.
- **Precisión:** el cast instalado de mssql 12.7.10 transforma decimal/numeric string
  mediante parseFloat; no existe enlace exacto demostrado. DecimalText y QuantityText
  siguen textuales. La barrera pura para el futuro transporte rechaza esos enlaces,
  incluidos null, sin usar conversiones flotantes en código de aplicación.
- **Binarios:** la rama instalada convierte null/undefined a buffer vacío y puede convertir
  Uint8Array como texto. La barrera rechaza binario null y prepara Buffer para valores no
  nulos; varbinary vacío permanece distinto. Las pruebas ejercitan la función pura instalada
  en VM y dobles; no cargan el binding nativo ni prueban SQL NULL en el motor.
- **Alcance:** no se implementa todavía transporte real, repositorios o configuración SQL.
  La futura implementación deberá invocar la barrera antes de enlazar. No se ejecuta SQL,
  escrituras, migraciones o cambios de permisos; no se instalan paquetes ni cambian MSAL,
  HTTP, memoria o L2. La intermitencia sigue pendiente. Sin commit, push, PR o despliegue.
- **Siguiente paso propuesto:** transporte aislado con tipos admitidos, rechazo explícito de
  rutas bloqueadas e integración optativa de solo lectura/rollback bajo autorización.
  Referencia: [L8C2_Transporte_ODBC_SQL.md](../../api/L8C2_Transporte_ODBC_SQL.md).

- **Validación R1 del descriptor:** 50 dirigidas y 371 pruebas API completas aprobadas,
  ninguna fallida/omitida; las 348 anteriores se conservan y se agregan 23. TypeScript,
  contratos y fronteras correctos. Frontend compila con aviso previo >500 kB.
  git diff --check y revisión de nuevos sin errores. Sin integración SQL real.
  Seis archivos pendientes del alcance, sin staging ni commit. Esperar revisión.

### L8-C2-R2 — Transporte ODBC aislado — 21/10/2026

- **Base preservada:** misma rama y HEAD c59b3928ab8e977a7668d82626f4063e10cefb7d;
  seis archivos R1 pendientes sin staging. Se agregan transporte, prueba con dobles
  e integración optativa. Se conservan los antecedentes anteriores como historia.
- **Implementación pendiente de validación:** LocalOdbcTransport usa puertos C1,
  SERIALIZABLE y barrera R1 antes de cualquier input. Perfil local fijo Windows,
  PAIPOC/pai_poc_dev, Shared Memory, integrada y ODBC 17; mssql 12.7.10 y
  msnodesqlv8 5.6.0 existentes. Carga nativa inyectada solo por prueba local optativa.
  No cambia el ciclo de sesión, codecs, L2, migraciones, MemoryUnitOfWork o HTTP.
- **Seguridad:** errores sanitizados y traza desactivada por defecto, lista positiva
  de campos/códigos técnicos; sin credenciales, cuentas, cadenas completas o errores
  originales en la salida. Decimal/numeric y binarios null siguen rechazados. No se
  considera demostrado el enlace varbinary vacío. Timeouts de 10000 ms sin cambios,
  sin reintentos automáticos. Identidad administrativa exclusivamente diagnóstica.
- **Dobles y regresión:** 28 nuevas, 96 dirigidas y 399 API completas aprobadas;
  TypeScript, contratos y fronteras correctos. Frontend compila con aviso previo
  >500 kB. Health carga con binding nativo bloqueado. Integración omitida por defecto.
- **SQL real, resultado NO satisfactorio:** conexión, SERIALIZABLE, dos consultas y
  rollback exitosos. Se verifican formatos/contenido nvarchar, GUID, datetime2 UTC,
  bit, bigint exacto y binarios de ocho bytes. Se observa @@DBTS como bytes, sin
  alcanzar su comprobación de codec ni probar una fila con rowversion real.
- **Bloqueo:** SQL_CODEC_INVALID en comprobación agrupada null-empty; no se aisló
  todavía si falla vacío varbinary o nvarchar null. SQL_CLOSE_FAILED adicional en
  observador de cierre, sin aislar cuál precondición falló. No se modifica C1 para
  acomodarlo. El cierre físico se intenta en finally; consulta independiente final
  confirma ONLINE, ocho tablas vacías, cero sesiones residuales e historial/huella
  originales coincidentes. Normalización 0/0 en la misma sesión queda pendiente.
- **Trazabilidad:** dos errores iniciales del ejecutor (flags incompatibles sqlcmd y
  JSON anidado) corregidos; un diagnóstico posterior añadió el nombre fijo de la
  comprobación fallida. No hay repetición posterior al bloqueo null/vacío, aumento
  de timeouts, escrituras, migraciones o cambios de motor/permisos. No hubo timeout
  observado que permita confirmar o descartar la intermitencia previa.
- **Siguiente decisión:** revisar diagnóstico acotado de null/vacío y cierre antes
  de autorizar corrección/cierre. No declarar L8-C2 completada. Sin commit, push,
  PR, merge o despliegue. Detalles en
  [L8C2_Transporte_ODBC_SQL.md](../../api/L8C2_Transporte_ODBC_SQL.md).

### L8-C2-R3/R4/R5 — Sincronización de correcciones y diagnóstico inicial

- R3 aisló la conversión Buffer(0) a SQL NULL en la ruta de enlace. Texto NULL y
  controles positivos correctos. También distinguió el estado capturado previo 0/0
  del XACT_STATE=1 evaluado dentro del SELECT. Pool físicamente cerrado y sin sesiones
  residuales; el error del observador se confundía con SQL_CLOSE_FAILED.
- R4 implementa el rechazo preventivo en la barrera ODBC parameters.ts y las pruebas
  correspondientes, sin cambiar el descriptor general, codecs ni sesión C1. La prueba
  de integración captura estado antes del SELECT y separa observación/cierre/asserts.
- R4: 124 dirigidas incluidas privacidad, 404 API completas aprobadas; TypeScript,
  contratos, fronteras y frontend correctos (aviso previo >500 kB). Cinco pruebas
  nuevas frente a 399. Resultado histórico ejecutado en R4, no repetido en R5.
- Integración R4 no completada: sqlcmd inicial falló tras 15016.2791 ms, antes de LOAD
  del transporte Node. Error público SQL_QUERY_FAILED; test exit 1. Código original
  del proceso y etapa interna no conservados por el catch; no confundir con fallo
  ODBC Node. Límites sin cambios: login 5 s, consulta 5 s, proceso externo 15 s y
  test 60 s. Coincidencia con watchdog externo no demuestra causa de bloqueo/login.
- R5 inicial: rama y HEAD esperados, nueve archivos pendientes, sin staging ni sqlcmd
  residual; servicio PAIPOC Running. Se autoriza diagnóstico de lectura acotado y
  actualización de estos dos documentos, sin cambios de producción o timeouts.
  Resultados SQL R5 pendientes al registrar este corte; no anticipar integridad.
- No cerrar L8-C2: integración R4 pendiente e intermitencia histórica sin causa
  confirmada. Sin SQL DML/DDL, migraciones, protocolos nuevos, dependencias, HTTP,
  commit, push, PR, merge o despliegue. Detalle en api/L8C2_Transporte_ODBC_SQL.md.

### L8-C2-R6/R7 — Diagnóstico de la sesión contada tras el cierre

- **R6 real:** verificaciones previas correctas; una única integración, sin reintento,
  llegó al snapshot final. Pasaron transporte Shared Memory, SERIALIZABLE, parámetros,
  texto NULL/vacío, binarios no vacíos, rechazo preventivo de vacíos, rollback, estado
  capturado 0/0 en la misma sesión, cierre nativo y liberación de los tres pools.
  El rechazo de binarios NULL corresponde a pruebas con dobles. ERR_ASSERTION a los
  257.2994 ms: sessions=1 frente al 0 inicial; ONLINE, ocho tablas vacías e historial
  coincidentes. Suite completa 404 es histórica de R4, no nueva ejecución R7.
- **Criterio original:** sys.dm_exec_sessions WHERE program_name=N'PAI-L8C2-Transport',
  ejecutado por sqlcmd después de los cierres. Sin filtro de host, login, base, PID,
  identidad de conexión, estado o ejecución; sin excluir @@SPID expresamente.
  La base de conexión pai_poc_dev no limita esta vista a esa base. La etiqueta fija
  puede coincidir con otros procesos; el contador no identifica el lease de origen.
- **R7 inicial (86.61 ms):** cero coincidencias de transporte. Solo el observador SQLCMD,
  SPID 64, running, una lectura activa, Shared Memory, cero transacciones abiertas o
  asociadas, bloqueos y esperas. Login 2026-10-21T16:42:05.687 (hora reportada SQL).
- **R7 única posterior (39.41 ms):** también cero coincidencias. Solo otro observador
  SQLCMD, reutilizando SPID 64 con login 16:42:05.767 y otra conexión física. Se usaron
  tokens sanitizados de conexión, sin registrar host real, cuentas o login personal.
  No confundir reutilización del SPID con persistencia de la conexión anterior.
- **Atribución:** sesiones actuales B (observador). Sesión contada en R6 D (sin prueba
  de pertenencia): no se retuvieron session_id/login_time/connection_id originales.
  No se observa ya ninguna coincidencia; no se conoce el momento de desaparición ni
  se demuestra fuga, causa en el observador, pooling o retardo. Cierre informado por
  cliente y visibilidad DMV no son el mismo evento. Sin transacciones inesperadas.
- **Integridad final R7 (86.44 ms):** ONLINE, ocho recuentos individuales cero,
  0001_initial única, hashes y huella registrados coincidentes. No se ejecutaron
  verificadores ni recalculó la huella completa del catálogo actual. Cero procesos
  sqlcmd al finalizar. Sin escrituras, mantenimiento o intervención de sesiones.
- **Recomendación no implementada:** instrumentar la prueba para conservar identidad
  técnica de cada lease y del observador; correlacionar session_id + login_time +
  connection_id con detalle sanitizado si hay coincidencias. No debilitar el criterio,
  introducir sleeps o reintentos, ni asumir que excluir @@SPID soluciona este caso.
- Solo se actualizan api/L8C2_Transporte_ODBC_SQL.md y este maestro. Se conserva el
  historial anterior; se homogeneizan sus saltos de línea CRLF en el working tree sin
  reescribir contenidos históricos. Sin modificar código/pruebas o repetir integración.
  No cerrar L8-C2. Intermitencia histórica sin causa confirmada; sin commit/push/PR/merge.

### L8-C2-R8-A — Instrumentación de conexiones — 22/10/2026

- Solo pruebas y documentación; no cambian odbc.ts, parameters.ts, codecs, sesión C1,
  L2, migraciones, dependencias, timeouts, aislamiento o composición HTTP. La captura
  es viable con Request(transaction) en una subclase exclusiva de la prueba, después
  del begin real. No exige cambios del contrato o transporte de producción.
- Nuevos tests/helpers/sql-connection-observer.mjs y sql-connection-observer.test.mjs;
  integración optativa modificada para instrumentar el pool de lectura y los dos
  pools de rechazo de vacíos. Registro BEGIN/BEFORE_CLOSE con identidad compuesta,
  estados, contadores y timestamp UTC observado en SQL; login_time conserva su
  representación de servidor sin afirmar UTC. Falta de GUID/login => no identificable.
- Se reemplaza el contador amplio por program_name por consultas parametrizadas de
  session_id + login_time + connection_id, excluyendo @@SPID. Observador independiente
  efímero con cierre garantizado, sin fallback por host/login/programa, esperas o
  reintentos. Su conexión nunca se usa como identidad del transporte. Cambios de
  conexión entre begin y close impiden afirmar que se observó el mismo lease.
- Clasificaciones: error de observación, identidad incompleta, conexión todavía
  visible, transacción abierta y fallo nativo de cierre. Visibilidad inactiva no se
  llama transacción abierta, pero sigue fallando la prueba: no se relaja el criterio.
  La observación fallida no impide close ni se confunde con su fallo. Transacción
  inesperada correlacionada detiene las consultas posteriores y limpia el observador.
- Evidencia pública por lista positiva: SID/loginTime técnicos, huella abreviada de
  conexión, etapa, instante, estado, contadores y resultado del cierre. GUID completo
  solo en memoria; no se imprime SQL, host, cuentas, credenciales, errores crudos o
  stacks. Para otras sesiones XACT_STATE no se inventa: null con contadores DMV.
- 25 pruebas nuevas con dobles; 149 dirigidas y 429 API completas aprobadas (404+25),
  cero fallidas/omitidas. TypeScript, contratos y fronteras correctos. Frontend compila
  con aviso previo >500 kB; sintaxis de integración comprobada sin ejecutarla.
- Ninguna consulta SQL real, sqlcmd, modificación de servicio, permisos o servidor,
  integración o commit en R8-A. Quedan pendientes formatos/visibilidad DMV reales,
  correlación entre procesos, coste de instrumentar y cierre físico del observador.
  Se detecta identidad ausente/ambigua y no se inventa una sustituta. Las conexiones
  internas transitorias del driver anteriores al lease no quedan atribuidas por esta
  captura. Permisos de diagnóstico no definen permisos funcionales de la API.
- R7 observó SPID 64 reutilizado con distintos logins técnicos/conexiones; R6 solo
  conservó recuento 1. La nueva instrumentación no atribuye retroactivamente esa
  sesión. Intermitencia histórica sin causa confirmada. L8-C2 sigue abierta.
- Antes de R8-B: revisar diff y regresión, comprobar integridad/precondiciones y
  permisos diagnósticos existentes, y autorizar expresamente integración local de
  lectura/rollback. Detenerse ante identidad incierta, error o transacción inesperada;
  no reintentar ni cambiar código/configuración para forzar aprobación.

### L8-C2-R8-B/R9 — Aislamiento del timeout sqlcmd — 22/10/2026

- R8-B: once archivos pendientes sin staging y servicio Running. Primer precontrol
  DATABASE_CATALOG_INTEGRITY falló a los 15010.64 ms, ETIMEDOUT, watchdog de proceso
  15000 ms, exitCode null. No hubo respuesta SQL confirmada. No se llegaron a consultar
  permisos/metadatos DMV ni a cargar el driver del transporte: integración R8-B NO
  ejecutada. Conexión frente a consulta internas indeterminadas, sin atribuirlo a ODBC.
- R9: ejecutor temporal externo eliminado al finalizar, spawn asíncrono con marcadores
  sanitizados de inicio, respuesta SQL validada, exit y cierre de streams. Cada etapa
  una sola vez; sin reintentos o esperas. Límites conservados: login 5 s, consulta 5 s,
  proceso 15 s. A=-? local; B=SELECT 1 en master mediante lpc; C–E=pai_poc_dev.
- Resultados R9: A 39.19 ms; B 50.80 ms; C 51.12 ms; D ONLINE 56.28 ms; E consulta
  original de integridad 536.20 ms. Todas salida 0, señal/código técnico null, sin
  stderr. B–E con respuesta SQL validada. E respuesta a los 535.55 ms y exit a los
  535.79 ms; duraciones incluyen arranque/login/transferencia/validación, no SQL puro.
- Cinco etapas completadas, sin fallo nuevo. La consulta E se reconstruye del literal
  R8-B registrado y del mismo bloque de serialización R1, no se simplifica. SHA-256
  R9: 48f975450bdc41852ca2559a16e752dfeca2e1d617dc04b7efd5d915feff5cad.
  El temporal R8-B y un hash previo de consulta no se conservaron; no se afirma una
  comparación de hashes retroactiva inexistente. No se ejecutó el verificador completo.
- Integridad R9: ONLINE, ocho tablas con cero filas, 0001_initial única, hashes de
  historial y archivos originales coincidentes; huella actual recalculada con el
  algoritmo original coincide con el historial. Cero procesos sqlcmd residuales.
  R9 no valida identidades de transporte ni ejecuta integración ODBC.
- La consulta de integridad lee y ordena varios catálogos, serializa JSON, calcula
  SHA2_256 y hace ocho recuentos. Permisos, bloqueo o carga son riesgos posibles,
  no causas medidas del intento anterior. Ninguna ejecución satisfactoria aislada
  demuestra resuelta la intermitencia. No hay prueba para alterar consulta/timeouts.
- Propuesta no implementada: versionar por separado el diagnóstico local con marcadores
  seguros y preservar code/exitCode/signal en vez de perderlos en un error genérico.
  Requiere revisión antes de modificar scripts/pruebas versionados. R8-B pendiente de
  revisión/autorización posterior. L8-C2 sigue abierta; 429 tests es el resultado
  histórico R8-A, no una nueva suite ejecutada en R9.
- Solo se actualizan api/L8C2_Transporte_ODBC_SQL.md y este maestro. Sin modificar
  producción, pruebas, permisos, servidor, migraciones, paquetes, HTTP o timeouts.
  Sin commit, push, PR, merge ni despliegue. Intermitencia histórica sin causa confirmada.

### L8-C2-R10-A — Ejecutor local externo y pruebas sintéticas — 22/10/2026

- Ubicación: %TEMP%\pai-sqlcmd-r10a-20261022-a0ea5060\sqlcmd-diagnostic.mjs,
  con self-test.mjs, synthetic-child.mjs, synthetic-evidence.json y README.txt.
  Carpeta conservada para revisión/R10-B, fuera de Git y sujeta a limpieza de TEMP.
  SHA-256 del ejecutor: C03D73131641453E5079013F429C30DA9113C2B79598F67FEF1FE7579DC28695.
- Captura inicio/spawn, primera salida por stream, respuesta validada, exit/close,
  duración, exitCode, señal y código controlado. Salida recibida no equivale a salida
  validada, y datos posteriores inválidos impiden éxito final. Solo evidencia positiva
  por lista permitida; errores originales y buffers no se serializan ni persisten.
- Límites sin cambios: conexión 5 s, consulta 5 s, watchdog 15000 ms; 32 KiB por stream.
  Pipes se drenan incluso al truncar. spawn sin shell, proceso oculto; timeout/cancelación
  solicita SIGTERM y espera cierre del hijo directo. No se afirma limpieza de nietos.
- Se preparan CONNECTED/QUERY_STARTED/QUERY_COMPLETED mediante mensajes SQL severidad
  cero NOWAIT, sin log/escrituras. Solo simulados con Node: nada se ejecutó en SQL.
  El buffering puede retrasar u ocultar marcadores; ausencia no identifica una fase.
  Marcas de tiempo del cliente no representan el reloj de ejecución del servidor.
- 13 pruebas temporales aprobadas: éxito, exit 7, timeout real 15 s, señal, salida
  parcial/ausente, ENOENT previo, privacidad con valores ficticios, exceso de captura,
  marcador contaminado, basura posterior y excepción de validación/eventos. Watchdog
  15019.47 ms, ETIMEDOUT/SIGTERM; hijo terminado. Cancelación 11.74 ms/SIGTERM.
  Limpieza comprobada para los hijos creados; cero procesos sqlcmd al finalizar.
- No se ejecutó SQLCMD.EXE, SQL real, integración R8-B o R10-B. No se cambiaron código,
  pruebas versionadas, producción, ODBC, SQL Server, permisos, migraciones, consultas,
  timeouts o dependencias. Solo estos dos documentos en el repositorio. Las 429 API
  corresponden a R8-A, no se agregan las pruebas externas a la suite del proyecto.
- R10-B: requiere revisar/hash del ejecutor, cuerpo readonly y validador, y autorización
  explícita. El módulo no ejecuta SQL al importarse; localReadOnly es una declaración,
  no un parser de seguridad. El batch temporal agregará mensajes sin alterar archivos
  SQL versionados. No versionar el ejecutor sin una propuesta aprobada.
- Intermitencia histórica sin causa confirmada. L8-C2 abierta. Sin commit/push/PR/merge
  o despliegue. Detalle de límites/evidencia en api/L8C2_Transporte_ODBC_SQL.md.

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

## L8-D1 — SqlActivityRepository implementado para revisión (22/10/2026)

Inicio desde rama feature/arquitectura-persistencia-pai, HEAD
c59b3928ab8e977a7668d82626f4063e10cefb7d, trece archivos pendientes y staging vacío.
L8-C2 permanece APROBADA para PoC local; no se reabre su diagnóstico.

Se creó api/src/infrastructure/sql/repositories/activity.ts. SqlActivityRepository
implements ActivityRepository recibe exclusivamente SqlSession. No construye pools,
no recibe credenciales, no abre transacciones, no confirma ni revierte operaciones.
No se conecta a HTTP ni sustituye MemoryUnitOfWork. No se inicia FichaRepository.

findById utiliza SELECT Id, FichaId, Description, RV FROM pai.Activities WHERE Id=@id;
con parámetro varchar(64) validado por identifier('activity'). Devuelve null si no hay
filas y una entidad si hay una. Un resultado inesperado de varias filas para una PK
se rechaza con SQL_CODEC_INVALID; no se escoge una arbitrariamente.

listByFicha usa la misma proyección, filtro FichaId=@fichaId y ORDER BY InsertionOrder ASC,
con parámetro varchar(64) validado por identifier('ficha'). Retorna [] si no hay filas
y conserva el orden devuelto por SQL. No ordena por ID ni expone InsertionOrder.

Los resultados se reconstruyen con identifier('activity'), identifier('ficha'),
unicodeText y rowversion. Se conserva Unicode y los ocho bytes de RV se convierten
al token opaco rv1 existente, sin generar versiones ni usar number. Cada resultado
es independiente de los objetos del transporte. Los campos inválidos fallan con
SQL_CODEC_INVALID. Errores SQL conocidos se sanitizan conservando categoría; errores
desconocidos de ejecución se convierten en SQL_QUERY_FAILED, sin mensajes/stack/cause.
El uso posterior al cierre se rechaza por la sesión existente sin nueva ejecución SQL.

Se creó api/tests/sql-activity-repository.test.mjs con 21 pruebas sintéticas dirigidas,
todas aprobadas. Cubren consultas exactas, parámetros/ausencia de interpolación,
mapeo, Unicode, RV, null/[], orden, independencia, sesión cerrada, errores sanitizados,
rollback del runner, datos inválidos y cardinalidad inesperada. Utilizan transporte
simulado y SqlSessionRunner; no conectan a SQL Server. El implements del código se
comprueba con TypeScript; no fue necesario modificar pruebas de tipos existentes.

api/scripts/check-boundaries.mjs solo añade el archivo exacto permitido al conjunto
de infraestructura SQL. No se abren prefijos genéricos ni importaciones desde HTTP,
composición u otras capas. No se modifican odbc.ts, session.ts, contratos L2,
autenticación, autorización, repositorios en memoria, dependencias o migraciones.

Resultados: npm --prefix api run build correcto, incluidos contratos y fronteras;
21 pruebas dirigidas aprobadas; npm --prefix api test correcto. La misma suite
ordinaria con reporter TAP confirmó 506 pruebas aprobadas, cero fallidas/omitidas.
El glob tests/*.test.mjs excluye las integraciones SQL de tests/integration. No se
ejecutó SQL real, sqlcmd, integración ODBC, DML/DDL, migraciones ni preparación de fixtures.

Dictamen: APTO para validación de integración posterior, previa autorización. La
lectura real del nuevo repositorio y el orden con varias filas siguen pendientes;
los dobles prueban la cláusula ORDER BY y preservación del orden devuelto. La base
vacía permite primero una lectura real sin coincidencias; los casos positivos
necesitan autorización específica de datos sintéticos. Este incremento no acredita
persistencia de escrituras ni implementa UnitOfWork SQL.

Cambios de esta intervención: dos archivos creados, check-boundaries.mjs y este
documento actualizados. Los otros cambios pendientes se preservan. Sin staging,
commit, push, PR, merge o despliegue. Implementación pendiente de revisión del usuario.

## L8-D1 — Integración real de solo lectura, no aprobada (22/10/2026)

Precondiciones correctas: rama feature/arquitectura-persistencia-pai, HEAD
c59b3928ab8e977a7668d82626f4063e10cefb7d, quince archivos pendientes y staging vacío.
Servicio MSSQL$PAIPOC Running; compilación TypeScript, contratos y fronteras aprobados.
La base pai_poc_dev se comprobó mediante el snapshot inicial de la única ejecución.

Se creó api/tests/integration/sql-activity-repository.test.mjs, optativa mediante
PAI_SQL_ACTIVITY_INTEGRATION=1. Reutiliza LocalOdbcTransport, SqlSessionRunner,
SqlActivityRepository y los helpers aprobados de snapshot y observación. No modifica
infraestructura de conexión, producción, permisos o timeouts. El archivo no carga
el driver nativo ni ejecuta SQL si no se activa expresamente. El runner usa rollback.

Se ejecutó exactamente una vez. Resultado: NO APTO para cerrar L8-D1; ExitCode del
runner 1, un test fallido, cero aprobados/omitidos. Duración del test 15338.6307 ms;
proceso observado 15390.9895 ms. No hubo reintentos ni consultas posteriores.

### Lecturas y limpieza observadas

Snapshot inicial correcto: ONLINE, ocho tablas funcionales, cero registros y una
migración 0001_initial con hash UpSha256 esperado. Etapa JSON aprobada en 92.9582 ms,
ExitCode sqlcmd 0, categoría/código técnico null. No es una nueva verificación completa
de catálogo equivalente a R10-C.

El transporte aprobó LOAD, CONNECT, BEGIN y tres QUERY. Las aserciones de la prueba
comprobaron Shared Memory, pai_poc_dev, SERIALIZABLE, @@TRANCOUNT=1 y XACT_STATE()=1.
SqlActivityRepository fue instanciado con la sesión existente: findById para un ID
inexistente devolvió null y listByFicha para ficha inexistente devolvió []. No se
insertaron fixtures ni datos. La prueba solo contiene lecturas y finalización rollback.

ROLLBACK terminó ok en 0.6521 ms y CLOSE ok en 9.9113 ms, con connected=false y
transactionActive=false. Eso confirma la finalización lógica reportada por el runner,
no la desaparición física ni todas las comprobaciones posteriores del observador.

### Fallos independientes y verificación final

La comprobación posterior de limpieza/observación no se aprobó: priorFailureCode fue
OBSERVATION_FAILED. La evidencia no contiene un resultado DMV validado ni una
clasificación física publicable. Esa categoría puede proceder de assertLeaseClean,
observeAfterClose o la evaluación estricta de observaciones; no se atribuye a un punto
más específico sin evidencia. No se confirma ausencia de transacciones residuales
mediante DMV y no se transforma este fallo en una advertencia de conexión inactiva.

El snapshot final se intentó pese al fallo previo. Falló en etapa PROCESS, categoría
SQLCMD_PROCESS_TIMEOUT, código técnico ETIMEDOUT, duración 15011.4475 ms,
ExitCode sqlcmd null y señal SIGTERM. stdoutReceived=false, stderrReceived=false,
parseReached=false y parseSucceeded=false. El error público fue SQL_QUERY_FAILED.
Es evidencia del timeout externo del proceso sqlcmd; no identifica causa de conexión,
consulta SQL ni de SQL Server. No se amplían límites ni se recupera salida cruda.

finalIntegrityVerified=false, priorFailureCode=OBSERVATION_FAILED y
finalFailureCode=SQL_QUERY_FAILED: ambos fallos quedaron conservados. NO pudo
confirmarse el estado final de las ocho tablas ni la igualdad final del historial.
Solo se acredita el estado inicial vacío. No se realizaron modificaciones persistentes
intencionales, DML, DDL, migraciones, cambios de permisos/configuración ni conexión HTTP.

### Pruebas y estado

Antes de la ejecución real se aprobaron 102 pruebas dirigidas sintéticas: repositorio,
observador y snapshot, cero fallidas/omitidas; además sintaxis del archivo de integración.
Las 506 pruebas ordinarias son el antecedente de implementación, no una nueva suite
completa en esta intervención. Evidencia real sanitizada, sin identificadores completos,
mensajes originales, stacks o salida SQL cruda:
%TEMP%\pai-activity-integration-sanitized-evidence.json.

Cero procesos sqlcmd y cero procesos Node identificados con esta integración tras
finalizar; no es una observación SQL posterior. Los quince archivos preexistentes
conservaron sus hashes durante la ejecución. Solo se crea la prueba de integración
y se actualiza este maestro: quedan dieciséis archivos pendientes, sin staging.

Se mantiene L8-D1 pendiente de cierre por observación no validada e integridad final
no verificada. No se aplica corrección ni se repite la ejecución. La causa específica
no está demostrada. L8-C2 permanece APROBADA dentro de su alcance y evidencia histórica.
No se inicia FichaRepository. Sin commit, push, PR, merge ni despliegue.

## L8-D2 — Repositorios de consulta y acceso implementados (22/10/2026)

### Cierre de L8-D1 en su alcance validado

Por autorización del usuario se cierra L8-D1 para el alcance validado: consultas reales
vacías findById=null y listByFicha=[], pruebas simuladas aprobadas e integridad actual
de la base confirmada mediante la comprobación independiente auditada (SUCCESS,
ExitCode 0, 552.17 ms). Esa consulta confirmó ONLINE, ocho tablas vacías, historial y
hashes esperados y huella del catálogo coincidente. No sustituye retrospectivamente
el snapshot final fallido de la integración anterior. OBSERVATION_FAILED queda como
antecedente histórico, sin defecto del repositorio demostrado. Las lecturas positivas
reales siguen pendientes. No se reabre L8-C2 ni se investiga transporte/pooling.

### Implementación L8-D2

Se crean SqlFichaRepository, SqlUserRepository y SqlAssignmentRepository en
api/src/infrastructure/sql/repositories/{ficha,user,assignment}.ts. Los tres implementan
sus interfaces L2, reciben solo SqlSession y usan los codecs existentes. No construyen
conexiones, no abren transacciones ni ejecutan commit/rollback propios. No se modifican
contratos, odbc.ts, session.ts, autorización, HTTP, migraciones o esquema.

Ficha: findById devuelve entidad/null. findByIds deduplica por identidad exacta,
consulta por parámetros varchar(64) y reconstruye el orden de entrada, omitiendo
inexistentes. Procesa lotes de hasta 500 parámetros sin imponer un máximo nuevo al
contrato. Para entrada vacía usa un SELECT sin coincidencias que también comprueba
la vida de la sesión; devuelve []. Mapea dependencia, Unicode y RV, sin nuevos campos.

User: findById y findByIdentity consultan por ID y por tenant/objeto respectivamente;
GUID de entrada canónicos y enlace uniqueidentifier. El mapeo conserva alias Unicode,
Enabled y RV, normalizando solo la representación GUID SQL mediante el codec existente.

Assignment: findById y listByUserAndFicha conservan capacidad, Enabled, fechas UTC y
ValidUntil nullable. La lista usa ORDER BY InsertionOrder ASC, sin filtrar deshabilitadas,
ventanas pasadas o futuras. No toma decisiones de autorización ni de vigencia.

setEnabled de User/Assignment lee el registro en la misma sesión, devuelve NOT_FOUND
si falta y compara la Version opaca L2 con la versión actual antes de codificar RV.
Una versión opaca válida pero distinta produce VERSION_CONFLICT, no SQL_CODEC_INVALID.
El UPDATE solo cambia Enabled, usa parámetros ID varchar(64), versión binary(8) y bit,
condición WHERE Id=@id AND RV=@expectedVersion y OUTPUT INSERTED para obtener la versión
generada por SQL. Cero filas actualizadas produce VERSION_CONFLICT; un error de ejecución
sigue siendo infraestructura SQL_QUERY_FAILED, no se disfraza de conflicto.
No se generan versiones ni se sobrescribe RV. El caller debe conservar la sesión
SERIALIZABLE y coordinar auditoría con sus escrituras cuando se integre el UnitOfWork.

Se crea shared.ts en el mismo directorio para lectura/sanitización, cardinalidad y
comparación de versiones comunes. Las excepciones públicas excluyen mensajes originales,
stacks y objetos del controlador. No se modifica ActivityRepository para adoptar este
helper. check-boundaries.mjs incorpora únicamente los cuatro archivos exactos nuevos,
sin ampliar importaciones desde otras capas.

### Pruebas y resultados

Se crea api/tests/sql-access-repositories.test.mjs, con 48 casos nuevos. Cubren los tres
contratos, SQL y enlaces, mapeos positivos/vacíos, Unicode/GUID/fechas/RV, independencia,
orden y deduplicación con múltiples lotes, sesiones cerradas, errores sanitizados y
concurrencia optimista de setEnabled. Incluyen dos escritores solapados simulados:
solo un UPDATE satisface el predicado y el otro conserva VERSION_CONFLICT; no son
pruebas de concurrencia real ni de persistencia/commit contra SQL Server.

48 casos nuevos + 21 de Activity = 69 pruebas dirigidas aprobadas. Suite API ordinaria:
554 aprobadas, cero fallidas, omitidas o canceladas. Variación respecto al cierre de
implementación anterior: 506 + 48. Compilación TypeScript, contratos y fronteras correctos;
las declaraciones implements comprueban conformidad sin modificar interfaces ni pruebas
de otros repositorios. Las integraciones optativas no forman parte del glob ordinario.

No se ejecutó SQL real, sqlcmd, DML/DDL, fixtures ni migraciones. No hubo instalaciones,
cambios de pooling/timeouts, permisos o conexión HTTP a SQL. No se identificó una
incompatibilidad real contrato/esquema que obligara a detener algún repositorio.

Dictamen: APTO como bloque de implementación y pruebas simuladas de L8-D2, pendiente
de revisión y autorización de integración real. Las lecturas positivas reales, UPDATE
con RV real y concurrencia entre conexiones SQL siguen sin comprobarse. No se habilitan
escrituras funcionales, auditoría o permisos institucionales por implementar estos tipos.

Archivos creados: cuatro fuentes SQL (tres repositorios y shared.ts), y una prueba
consolidada. Modificados: check-boundaries.mjs y este maestro. Se preservan íntegramente
los restantes cambios preexistentes. Sin staging, commit, push, PR, merge o despliegue.

## L8-D3 — Audit, Report e Idempotency SQL implementados (22/10/2026)

Inicio verificado: rama feature/arquitectura-persistencia-pai, HEAD
c59b3928ab8e977a7668d82626f4063e10cefb7d, veintiún archivos pendientes y staging vacío.
Se conservan los cierres aprobados de L8-C2/L8-D1 y el bloque L8-D2. Sin investigación
adicional de transporte, sqlcmd o pooling.

Se crean SqlAuditRepository, SqlReportRepository y SqlIdempotencyRepository en
api/src/infrastructure/sql/repositories/{audit,report,idempotency}.ts. Los siete
repositorios previstos quedan implementados a nivel de código y pruebas con dobles.
Los nuevos adaptadores reciben solo SqlSession, sin pools ni transacciones propias.
No existe conexión SQL/HTTP ni SqlUnitOfWork implementado por esta intervención.

### Operaciones y correspondencia con el esquema

Audit: append y findById, sin update/delete. Serializa los cuatro tipos de AuditChange
mediante reportSnapshot, userSnapshot y assignmentSnapshot existentes. Preserva las
Version históricas opacas: no se convierten a la RV actual. Valida el before nulo
solo en creación y utiliza parámetros nvarchar(max), datetime2(3) UTC e IDs acotados.
Comprueba duplicado por ID y existencia del actor en la misma sesión antes del INSERT.
OUTPUT INSERTED.Id permite confirmar cardinalidad sin necesitar recordset de un INSERT
sin salida. No hay commit independiente ni actualización del historial de auditoría.

Report: findById, findByActivityAndPeriod, create y update. La identidad de periodo
usa nvarchar(128) y codec period, sin normalización. QuantityText usa varchar(max),
nullable y codec DecimalText; no hay conversión numérica ni redondeo. Narrative Unicode,
fechas UTC y RV utilizan los codecs aprobados. create valida duplicados por ID y
actividad/periodo y referencias de actividad y autores. update toma el registro actual,
compara la Version esperada antes de codificarla y ejecuta UPDATE con Id + RV y OUTPUT.
Solo cambia quantity, narrative, state, updatedBy y updatedAt; ignora intentos de
modificar ID, actividad, periodo o creación. La RV devuelta la genera SQL, no JavaScript.

Idempotency: findByScope, reserve y complete. reserve comprueba ID y ámbito completo
(actor, operación, clave), valida fingerprint y actor, e inserta estado reservado sin
sobrescribir registros previos. complete exige existencia, versión actual y estado
reservado; comprueba referencias a reporte/auditoría y que el snapshot after del evento
sea exactamente el resultado de reporte suministrado, usando el codec histórico.
Esa comprobación de consistencia técnica explícita responde al alcance L8-D3: un
resultado incompatible con su evento se rechaza con INCOMPATIBLE_STATE. No define
roles, aprobaciones o flujos institucionales ni exige reconstruir la versión histórica
contra el reporte actual. El adaptador de memoria anterior solo comprobaba existencia
de esas referencias; no se modifica en esta etapa.

complete usa UPDATE condicionado por Id, RV y estado reservado; almacena el reporte
histórico completo en OutcomeReportJson y sus referencias en columnas independientes.
Las lecturas de idempotencia decodifican ese JSON, validan correspondencia del ID y
estado/campos nulos; no hacen JOIN ni reconstruyen el resultado desde Reports. Editar
posteriormente el reporte no cambia el replay almacenado.

Las entradas de escritura se capturan/serializan antes de las esperas para no retener
objetos mutables del caller. Los resultados se reconstruyen con codecs y no exponen
los objetos del transporte. Las sesiones cerradas siguen rechazando operaciones.

### Conflictos, consistencia y límites

Se reutiliza y amplía repositories/shared.ts para categorías sanitizadas y comprobación
de referencias a tablas constantes permitidas. NOT_FOUND, DUPLICATE, VERSION_CONFLICT,
INCOMPATIBLE_STATE y errores SQL conservan categorías separadas y sin stack, mensajes
originales o excepciones del controlador. Versiones opacas válidas pero distintas de
la RV actual son conflictos, no errores de codec. UPDATE con cero filas tras comprobar
la existencia/versión se trata como conflicto; un fallo de ejecución sigue siendo
SQL_QUERY_FAILED. JSON histórico inválido, duplicado o de estructura incoherente se
rechaza mediante los codecs existentes.

Las comprobaciones de ausencia/unicidad y referencias requieren la misma sesión
SERIALIZABLE y restricciones SQL existentes. No sustituyen esas restricciones ni
permiten transacciones por repositorio. El transporte actual no expone de forma segura
números SQL originales: el bloqueo específico de clasificación es que una violación
de unicidad/FK o deadlock originada exclusivamente en el motor no puede traducirse
fiablemente a un conflicto de dominio. Se conserva SQL_QUERY_FAILED y rollback, sin
interpretar texto libre ni inventar DUPLICATE/NOT_FOUND. La implementación dispone de
precomprobaciones semánticas; la traducción fina de errores del motor queda pendiente
de diseño autorizado si resulta necesaria. No se modifica odbc.ts para resolverlo.

No se identificó incompatibilidad estructural contrato/esquema que obligara a detener
un repositorio. Siguen pendientes validación SQL real, comportamiento entre conexiones,
permisos mínimos y SqlUnitOfWork. Este último deberá envolver el contexto y mantener
atomicidad de autorización, escrituras, auditoría e idempotencia, rechazar contextos
vencidos y evitar commits incluso si el callback captura un fallo de repositorio o
omite await. SqlSessionRunner por sí solo no constituye ese UnitOfWork completo.

### Pruebas y resultado

Se crea api/tests/sql-write-repositories.test.mjs: 57 pruebas nuevas aprobadas. Incluyen
contratos, SQL/enlaces, mapeos positivos/vacíos, Unicode/DecimalText/UTC/RV, duplicados,
referencias, campos inmutables, versiones opacas, conflicto de actualización, append-only,
las cuatro variantes de auditoría, JSON con claves duplicadas, reserva/finalización,
replay histórico tras edición, copias defensivas, rollback coordinado simulado, sesiones
cerradas y sanitización. El rollback multi-repositorio está probado con un transporte
doble, no como evidencia de una transacción SQL real ni como SqlUnitOfWork implementado.

Pruebas dirigidas de los siete repositorios: 126 aprobadas, cero fallidas/omitidas.
Suite API ordinaria: 611 aprobadas, cero fallidas, omitidas o canceladas (554 + 57).
Compilación TypeScript, contratos y fronteras correctos. check-boundaries.mjs solo
agrega los tres nombres exactos de repositorio, sin ampliar importaciones desde HTTP.
Durante revisión se corrigió una pérdida de marca nominal al pasar un ID ya validado;
no se alteraron firmas ni tipos públicos y la compilación final está aprobada.

Dictamen: APTO para implementar SqlUnitOfWork en una autorización posterior, con los
límites anteriores explícitos. No equivale a aprobación de integración SQL real ni
habilitación de escrituras operativas. No se comienza SqlUnitOfWork automáticamente.

Archivos creados: tres repositorios y una prueba consolidada. Modificados: shared.ts,
check-boundaries.mjs y este maestro. Los demás archivos preexistentes se conservan.
Sin SQL real, DML/DDL real, fixtures, migraciones, cambios de permisos o configuración,
instalación de dependencias, cambios HTTP/autenticación/autorización, staging, commit,
push, PR, merge o despliegue. L8-C2 no se reabre.

## L8-D4 — SqlUnitOfWork implementado (22/10/2026)

Inicio confirmado: rama feature/arquitectura-persistencia-pai, HEAD
c59b3928ab8e977a7668d82626f4063e10cefb7d, veinticinco archivos pendientes y staging vacío.
Se revisaron el puerto UnitOfWork/TransactionContext, MemoryUnitOfWork/MemorySession,
SqlSessionRunner/SqlSession, errores y constructores de los siete repositorios.

Se crea api/src/infrastructure/sql/unitOfWork.ts. SqlUnitOfWork implements UnitOfWork
recibe el SqlSessionRunner existente; cada runAtomic delega una sola vez en
runner.run('commit', ...). El runner crea la conexión/transacción SERIALIZABLE y
entrega una única SqlSession, compartida por los siete repositorios. El adaptador
no crea otro puerto UnitOfWork, pools, SQL de transacción, conexiones por repositorio
ni commits individuales. No se modifica session.ts ni odbc.ts.

El callback recibe exactamente TransactionContext con fachadas congeladas para sus
siete repositorios y diecinueve métodos. No se exponen repositorios concretos, sesión,
controles de cierre o commit. La misma sesión enlaza lecturas de usuario/asignaciones,
versiones, escritura, auditoría e idempotencia cuando el caller las solicita. El puerto
no ejecuta autorización ni exige auditoría automáticamente: eso continúa siendo
responsabilidad de la capa de aplicación; no se relaja la composición denegatoria.

Un ámbito privado sigue llamadas COMPLETAS de repositorio, incluidas validaciones y
mapeos fuera de session.execute(). Conserva un fallo sanitizado independiente del
objeto entregado al consumidor: capturarlo o mutarlo en el callback no permite commit.
El ámbito deja de aceptar operaciones al terminar el callback, drena las iniciadas
antes de devolver el control al runner y falla si había operaciones pendientes sin
await. Si una operación pendiente falla se conserva su error; si termina correctamente
sigue siendo SQL_SESSION_PENDING y se revierte. Retornar la promesa del repositorio
al callback sí la incorpora al await normal y puede confirmar si todo es correcto.

El contexto vencido devuelve INCOMPATIBLE_STATE sin ejecutar consultas, compatible con
el adaptador de memoria, incluso para findByIds([]) u operaciones que validan antes
de ejecutar SQL. Durante la operación se rechazan llamadas de repositorio solapadas
con SQL_SESSION_BUSY y quedan registradas como fallo; no se añade cola ni reintentos.
Esta restricción respeta el transporte SQL existente, que no admite consultas
concurrentes en una sesión. No se afirma equivalencia de temporización con memoria,
cuyas operaciones sobre mapas son síncronas aunque devuelvan promesas.

El runner existente mantiene la prohibición de transacciones anidadas, incluso si el
callback captura el rechazo. Confirma una sola vez tras el éxito del callback/ámbito,
o intenta rollback y close ante fallo; la promesa externa termina después de su
limpieza. Se preservan sus categorías sanitizadas y resultados ambiguos: un commit
fallido no se declara revertido de forma definitiva; un close fallido después de
commit conserva transactionOutcome='committed'. La limpieza mantiene el error
principal según la política existente, sin modificar el runner.

### Pruebas ejecutadas

Se crea api/tests/sql-unit-of-work.test.mjs con 24 pruebas sintéticas aprobadas.
Cubren siete repositorios/fachadas y sesión/transacción compartida, commit único,
Report+Audit+Idempotency confirmados conjuntamente, fallos de auditoría/idempotencia
que revierten escrituras previas, fallo del callback, conflicto de versión,
infraestructura y errores capturados por el caller. Incluyen validación fuera del
execute, mutación del error recibido, las diecinueve operaciones tras cierre,
operaciones sin await, drenaje de llamadas multiconsulta, solapamiento, anidamiento,
liberación de recursos antes de resolver y nueva operación deliberada tras un fallo.
Comprueban commit ambiguo y close posterior a commit con sus metadatos existentes.

La atomicidad usa un transporte doble con un borrador y confirmación/restauración
simulada. NO es evidencia de atomicidad real de SQL Server, aislamiento entre varias
conexiones, comportamiento de bloqueos o recuperación ante caídas.

Resultados: 24 pruebas nuevas; 150 pruebas dirigidas de UnitOfWork + siete repositorios
aprobadas; suite API ordinaria 635 aprobadas, cero fallidas/omitidas/canceladas
(611 + 24). Compilación TypeScript, contratos y fronteras correctos. No se ejecutan
los archivos optativos de tests/integration ni SQL real. No se cambian pruebas o
contratos públicos previos; implements comprueba el puerto existente al compilar.

### Alcance y dictamen

check-boundaries.mjs solo permite el archivo exacto infrastructure/sql/unitOfWork.ts.
Se mantienen las prohibiciones de importar SQL desde HTTP, composición y otras capas.
No se sustituyen repositorios en memoria ni se cambian autenticación, autorización,
reglas funcionales, versiones, decimales, snapshots o consultas de los repositorios.

Dictamen: APTO para una integración SQL real conjunta, previa autorización. Siguen
pendientes commits/rollbacks reales con datos sintéticos autorizados, concurrencia
entre conexiones y validación con identidad SQL de mínimo privilegio. Se conservan
los límites documentados de clasificación de errores del motor y cierre físico.
Los callers deben usar los repositorios del contexto vigente; el ámbito no coordina
efectos externos o repositorios construidos fuera de ese contexto.

Archivos creados: unitOfWork.ts y sql-unit-of-work.test.mjs. Modificados:
check-boundaries.mjs y este maestro. Los restantes cambios pendientes se preservan;
quedan veintisiete archivos pendientes, staging vacío. Sin SQL real, DML/DDL real,
fixtures, migraciones, cambios de pooling/timeouts/permisos o instalación de dependencias.
Sin conexión SQL/HTTP, staging, commit, push, PR, merge o despliegue. No se ejecuta la
integración conjunta automáticamente. L8-C2 no se reabre.

## L8-D5 — Bloqueada antes de DML por identidad de prueba (22/10/2026)

Se leyó la solicitud adjunta de L8-D5 y se verificó la rama
feature/arquitectura-persistencia-pai, HEAD c59b3928ab8e977a7668d82626f4063e10cefb7d,
veintisiete archivos pendientes, staging vacío, servicio MSSQL$PAIPOC Running y
git diff --check correcto. Se inspeccionaron migración/FK, permisos existentes,
configuración de autenticación y punto de ejecución de SqlUnitOfWork.

Precondición obligatoria de la solicitud: no utilizar la identidad administrativa
de diagnóstico para escrituras y detenerse si no existe una identidad de prueba
adecuada; no crear usuarios, roles o permisos automáticamente.

Se ejecutó una única consulta SQL de metadatos, exclusivamente de lectura, mediante
sqlcmd local Shared Memory y autenticación Windows integrada, con límites 5/5/15.
No se consultaron ni publicaron nombres de identidades, credenciales o mensajes
originales. Resultado sanitizado:
- pai_poc_dev ONLINE.
- effectiveSysadmin=true.
- effectiveDbOwner=true.
- effectiveControlDatabase=true.
- runtimeRoleMembers=0 para pai_api_runtime.
- nonSystemDatabasePrincipals=0 (tipos de usuario/login/grupo, excluidos principales
  de sistema y roles). No se verificó una identidad no administrativa utilizable.

El transporte aprobado usa Trusted_Connection=Yes y la identidad integrada efectiva;
no se identifica una configuración de prueba no administrativa lista para el DML.
Además, el rol de aplicación aprobado tiene INSERT solo sobre Reports, AuditEvents
e IdempotencyRecords; no permite preparar los catálogos de fixtures (usuarios,
dependencias, fichas, actividades y asignaciones). No se amplía ese rol ni se usan
privilegios administrativos para eludir la condición. La preparación futura requiere
una identidad no administrativa y permisos de prueba mínimos expresamente autorizados,
sin ampliar silenciosamente los de la API.

Se detuvo L8-D5 antes de preparar/insertar fixtures o comenzar la integración real.
No se crearon archivos de prueba, usuarios, roles ni permisos. No hubo INSERT,
UPDATE, DELETE, DDL, migraciones, commit, rollback de escrituras o cambios persistentes
intencionales. No se repitió integración ODBC ni se investigaron sqlcmd/pooling.

No se ejecutaron escenarios A–E ni pruebas de integración de los siete repositorios.
No se obtuvieron snapshots inicial/final de las ocho tablas o historial en esta
intervención: la comprobación de seguridad antecedió al inicio de la prueba. La
consulta solo confirmó ONLINE y permisos; no equivale a una verificación actual del
catálogo o de las tablas vacías. La integridad independiente previa y las 635 pruebas
API son antecedentes históricos, no nuevas verificaciones L8-D5. No se repitieron
pruebas sintéticas, suite, TypeScript o build tras constatar el bloqueo: la instrucción
exigía detenerse y no se modificó código de aplicación.

SqlUnitOfWork conserva run('commit') en éxito; el runner permite rollback ante una
excepción del callback. No se altera ese contrato ni se implementa una estrategia
de fixtures/rollback antes de resolver la precondición de identidad. Los mecanismos
de cierre lógico, sanitización y advertencia física siguen intactos.

Dictamen: NO APTO para cerrar L8-D; integración conjunta pendiente de identidad y
permisos mínimos de prueba. L8-C2, el cierre limitado de L8-D1 y las implementaciones
L8-D2–D4 no se reabren ni se presentan como integraciones reales aprobadas.
Solo se actualiza este documento; los otros veintiséis archivos pendientes permanecen
intactos. Sin staging, commit, push, PR, merge ni despliegue. No se habilita SQL en HTTP.

## L8-D5 — Identidad preparada, arnés conjunto y primer intento sin escritor (22/10/2026)

Se conserva como antecedente el bloqueo inicial por identidad descrito arriba. Posteriormente, por autorización expresa, se creó PAIPOC_Test como cuenta Windows estándar, un login Windows, usuario pai_l8d5_test_user y rol pai_l8d5_test. La aplicación administrativa requirió corregir SQL 468 únicamente en dos comparaciones textuales mediante COLLATE Latin1_General_100_BIN2. El script corregido SHA-256 9B8B7802A35EDCEA48A24851329B26C1A00B807053426C43B51F316CE4B8F521 terminó con ExitCode 0. La conexión real restringida verificó identidad, Shared Memory, permisos SELECT/INSERT y UPDATE por columna, ausencia de privilegios administrativos, DELETE/ALTER y escritura de historial. VIEW SECURITY DEFINITION y VIEW PERFORMANCE DEFINITION se reconocieron como implicaciones del VIEW DEFINITION ya autorizado, sin ampliar permisos. Detalles en api/L8D5_Identidad_SQL_Pruebas.md; se mantienen documentadas las ACL Modify heredadas anteriores a esta preparación.

Se preparó un único arnés conjunto para los siete repositorios con escritor Node restringido y observador administrativo exclusivamente de lectura. Los fixtures y operaciones comparten SqlSession/transacción, se fuerza una excepción terminal para rollback y un decorador de pruebas impide llamar al commit nativo. La prueba sintética del mismo ejercicio cubre 19 métodos, resultado histórico de idempotencia, versión obsoleta, invalidación de contexto y fallos de auditoría/idempotencia/limpieza. Suite API: 646 aprobadas (635 anteriores + 11 nuevas). TypeScript, contratos, fronteras y build frontend correctos; aviso de Vite por tamaño del bundle. Los dobles no prueban atomicidad real.

Primer intento: el observador confirmó ONLINE, ocho tablas vacías, hashes e historial y huella recalculada del catálogo. Agotó el plazo de coordinación humana de 600 segundos y terminó con WRITER_NOT_COMPLETED, ExitCode 1 y pool cerrado. El escritor notificó L8D5_CHECK_FAILED sin alcanzar el bloque de construcción del transporte ni emitir L8D5_WRITER_FINISHED. No se capturó conexión del escritor; la observación D indica identidad no disponible, no una fuga demostrada. No se registró errno de red concreto. No se ejecutaron fixtures, métodos reales de repositorios o rollback conjunto. No se hicieron reintentos.

La comprobación final independiente se ejecutó pese al fallo y pasó: ocho tablas vacías, historial idéntico y catálogo sin modificaciones. No se declara validada la ausencia de transacciones del escritor mediante correlación DMV, porque no se capturó identidad. No se modificaron odbc.ts, session.ts, contratos, permisos o configuración; no se activó SQL en HTTP. Los 29 archivos pendientes al iniciar el arnés se preservan, excepto esta actualización documental del maestro.

Nuevos archivos de esta intervención: api/L8D5_Integracion_SQL.md, api/tests/helpers/sql-joint-work.mjs, api/tests/integration/sql-unit-of-work.mjs y api/tests/sql-joint-work.test.mjs. Evidencia sanitizada ignorada por Git: api/.test-tmp/l8d5-joint/result.json. No contiene GUID físicos, identidades personales ni credenciales. Sin staging, commit, push, PR, merge ni despliegue.

Dictamen: NO APTO para cerrar L8-D. El arnés está preparado y su seguridad de rollback probada con dobles, pero sigue pendiente una ejecución SQL real conjunta autorizada y sincronizada con la consola restringida ya lista. No se atribuye este fallo de coordinación a un defecto funcional del transporte o repositorios. No se reabre L8-C2 ni se afirma concurrencia real entre conexiones, persistencia tras reinicio o integración SQL/HTTP.

## L8-D5 — Segunda ejecución coordinada, fallo antes de fixtures (23/10/2026)

La consola PAIPOC_Test se preparó y verificó antes del observador. Se inició únicamente el servicio local PAIPOC, que estaba detenido, sin cambiar configuración o permisos. El observador informó READY y el escritor inició dentro de la ventana de observación; no se repitió la preparación de identidad SQL ni se cambiaron timeouts o pooling. Once pruebas sintéticas del arnés y la comprobación de fronteras pasaron nuevamente. Las 646 pruebas de regresión completa y build frontend anteriores no se presentan como ejecutados otra vez hoy.

Resultado del único intento autorizado de hoy: FAILED en stateBefore, categoría sanitizada SQL_WORK_FAILED. Escritor: connections=1, begins=1, queries=1, methods=[], commitAttempts=0, pending=0, rollbackAttempts=1, rollbackSucceeded=true, closeSucceeded=true. Hubo conexión e inicio de transacción, pero la validación del resultado de estado inicial no pasó. No se registró el campo concreto discrepante. Se detuvo antes del primer INSERT y antes de invocar métodos reales de los repositorios. La apertura estaba configurada para Shared Memory; la comprobación conjunta de estado no quedó aprobada.

Integridad inicial y final correctas: ocho tablas vacías, historial y catálogo sin cambios. Observador, pool y listener cerrados; canal loopback no establecido al terminar. Observación D, sin identidad física capturada: abandonedTransactions=null no equivale a una verificación DMV de cero transacciones. El rollback y cierre lógico sí fueron confirmados, pero sin DML no demuestran rollback conjunto de reporte/auditoría/idempotencia, concurrencia o resultado histórico real.

No se repitió automáticamente la integración y no se modificó código del arnés para forzar éxito. Solo se documentó el resultado en este maestro y api/L8D5_Integracion_SQL.md; evidencia sanitizada ignorada por Git en api/.test-tmp/l8d5-joint/result-second-20261023.json. Sin usuarios/permisos nuevos, DML funcional, DDL, migraciones, cambios ODBC/SqlSession/SqlUnitOfWork, activación SQL/HTTP, staging, commit, push, PR, merge o despliegue.

Dictamen: NO APTO para cerrar L8-D. Se recomienda autorizar únicamente diagnóstico sanitizado por campo en la validación checkState; no se presume la causa ni se relaja la aserción antes de disponer de los valores. No se reabren fases de pooling ni se realiza otro intento real sin autorización.

## L8-D5 — Causa de stateBefore corregida y validada sin escrituras (23/10/2026)

Se instrumentó exclusivamente el arnés para identificar la primera aserción fallida de checkState con proyección sanitizada. El modo aislado --state-only ejecutó una sola consulta bajo PAIPOC_Test sin fixtures. Evidencia inicial: field=controlServer, expected=0, actual=null, originalErrorType=AssertionError, code=ERR_ASSERTION, sqlErrorNumber=null, sin errores técnicos ODBC; rollback y cierre correctos. SQL_WORK_FAILED era la clasificación sanitizada de una aserción del arnés, no un error de permisos demostrado.

Causa: HAS_PERMS_BY_NAME(NULL,'SERVER','CONTROL SERVER') usa un ámbito incorrecto para esa función. Se cambió únicamente el segundo argumento a NULL en stateSql: HAS_PERMS_BY_NAME(NULL,NULL,'CONTROL SERVER'). La aserción 0 permanece estricta y null continúa bloqueando; no se aplicaron COALESCE, cambios de permisos o infraestructura. El diagnóstico de antes y después se conserva sin identidades completas ni datos sensibles.

Se ejecutaron solo seis pruebas sintéticas dirigidas de checkState y la comprobación local necesaria. Resultado real posterior: state-only OK, una consulta, cero escrituras e intentos de commit, rollbackSucceeded=true, closeSucceeded=true, category/diagnostic=null y technicalFailures=[]. No se repitieron las 646 pruebas ni la integración completa. SqlSession, ODBC, SqlUnitOfWork, contratos, esquema, migraciones, seguridad y HTTP permanecen intactos.

Archivos de este ajuste: tests/helpers/sql-joint-work.mjs (diagnóstico y expresión SQL), tests/integration/sql-unit-of-work.mjs (modo aislado de lectura), tests/sql-joint-state.test.mjs (seis pruebas dirigidas), api/L8D5_Integracion_SQL.md y este maestro. Dictamen: APTO para reintentar L8-D5 bajo nueva ejecución controlada autorizada; NO se declara cerrado L8-D ni probada atomicidad real de reportes/auditoría/idempotencia. Sin staging, commit, push, PR, merge o despliegue.

## L8-D5 — Nuevo intento autorizado tras stateBefore correcto (23/10/2026)

Se conserva como antecedente un intento previo del observador que no emitió READY: OBSERVER_PRECONDITION_FAILED, sin escritor, con integridad inicial/final no verificada y cierre del observador confirmado. No se atribuye una causa específica a esa categoría sanitizada.

Con nueva autorización expresa, el observador emitió READY: base ONLINE, ocho tablas vacías, historial y hashes originales válidos y huella del catálogo coincidente. El usuario ejecutó una sola vez el escritor desde la consola PAIPOC_Test preparada. stateBefore y la captura independiente de la identidad escritora pasaron antes del primer INSERT: autenticación integrada, Shared Memory, base pai_poc_dev, identidad restringida sin privilegios administrativos y una transacción SERIALIZABLE activa.

El escritor falló en fixtureInsert con SQL_QUERY_FAILED. El registro contiene connections=1, begins=1, queries=2, methods=[], pending=0, commitAttempts=0, rollbackAttempts=1, rollbackSucceeded=true y closeSucceeded=true. Por el orden del arnés, la segunda consulta corresponde al primer INSERT de fixtures, en pai.InstitutionalUsers (Id, TenantId, DirectoryObjectId, Alias, Enabled), parametrizado y con OUTPUT INSERTED.Id. El error público no conserva un número SQL ni detalle suficiente para distinguir permisos, restricción, enlace de parámetros u otro fallo de ejecución. No se afirma que el INSERT se completara; ningún método de repositorio llegó a ejecutarse.

Se ejecutaron rollback y cierre lógico; no hubo intento de commit ni operaciones pendientes al finalizar. El snapshot final independiente pasó: ocho tablas vacías, historial completo idéntico y catálogo sin cambios. Esto demuestra ausencia de fixtures persistentes tras este intento, pero no valida aún atomicidad conjunta de Report/Audit/Idempotency ni sus métodos positivos.

La correlación exacta de la identidad capturada produjo clasificación B: CONNECTION_STILL_VISIBLE, sleeping, cero transacciones abiertas, solicitudes, transacciones de usuario, bloqueos y esperas. Se registra como advertencia física no bloqueante conforme al criterio aprobado; no es la causa del fallo funcional. El observador confirmó cierre de su pool. No se investigó pooling ni se repitió la integración.

Dictamen: NO APTO para cerrar L8-D. Bloqueo concreto: primera inserción del fixture, categoría SQL_QUERY_FAILED sin causa raíz identificable en la evidencia disponible. Próximo paso mínimo, sujeto a autorización: diagnóstico sanitizado de esa operación específica, sin ampliar permisos ni modificar infraestructura para forzar éxito. No se ejecutó regresión general ni se modificaron ODBC, SqlSession, SqlUnitOfWork, migraciones, autenticación o HTTP. La intermitencia histórica permanece sin causa confirmada. Sin staging, commit, push, PR, merge o despliegue.

## Cierre vigente de L8-D y preparación controlada de L8-E (23/10/2026)

Por autorización del usuario se registra el dictamen APTO PARA CERRAR L8-D EN EL ALCANCE DE LA PoC LOCAL. Se conservan arriba los intentos anteriores como historia. La última integración conjunta real finalizó OK/ExitCode 0 bajo PAIPOC_Test, Windows integrada y Shared Memory: siete repositorios, diecinueve métodos y cincuenta y dos consultas SQL, una sesión y una transacción SERIALIZABLE compartidas. Rollback conjunto satisfactorio, cero intentos de commit, cero operaciones pendientes, cierre lógico e invalidación del contexto confirmados. Se verificaron lecturas positivas, creación/actualización de reportes, auditoría, reserva/finalización de idempotencia, resultado histórico y versión obsoleta.

El observador independiente, exclusivamente de lectura, confirmó las ocho tablas vacías antes y después, historial completo y huella del catálogo intactos, y cero transacciones abandonadas. CONNECTION_STILL_VISIBLE quedó como advertencia física no bloqueante de una sesión sleeping sin actividad. No se declara causalidad de pooling ni resuelta la intermitencia histórica de sqlcmd/ODBC/catálogo. La salida del escritor compartida por el usuario aporta queries=52; el resumen del observador en api/.test-tmp/l8d5-joint/result.json aporta el resto de comprobaciones sanitizadas. No se guardan GUID físicos, identidades personales ni secretos.

La etiqueta residual category=L8D5_CHECK_FAILED con status=OK era un defecto de presentación del arnés. Se corrigió para devolver category=null en éxito y conservar categorías controladas en fallos; no cambió lógica transaccional ni seguridad. Pruebas dirigidas actuales: 19 aprobadas sin SQL real. No se repitió la integración ni la suite histórica de 646 pruebas durante este cierre. No se inventa commit de L8-D: sigue pendiente de revisión/commit.

Límites no cubiertos: SQL en HTTP, concurrencia entre conexiones, commit duradero, reinicio/recuperación, Entra real y producción. La política temporal de asignaciones, roles y flujos de Planeación continúa sin aprobación; no se convierte el fixture en regla institucional.

L8-E se prepara solo como diseño en api/L8D5_Integracion_SQL.md: reutilizar createApplicationHandlers(identity, work, authorization, clock, tools), que ya recibe una única UnitOfWork compartida por consultas y reportes. La MemoryUnitOfWork vacía se instancia hoy en src/composition/queries.ts; las cinco rutas funcionales se registran juntas en src/functions/fichas.ts. Propuesta pendiente de autorización: selector local cerrado PAI_API_PERSISTENCE (memory predeterminado, sql-local explícito), sin fallback silencioso, y fábrica pequeña de SqlUnitOfWork/SqlSessionRunner/LocalOdbcTransport, con controlador nativo diferido. No se creó ni activó selector alguno.

Puntos que requieren control antes de una activación: frontera actual que prohíbe SQL desde composición; rechazo de WEBSITE_HOSTNAME incluso local por localOnly del transporte, distinto de la barrera de Core Tools; identidad de proceso Functions no administrativa, sin reutilizar al observador administrativo; política isApplicable=false conservada; ausencia de prueba de commit nativo en L8-D. Auth L4-A y autorización L4-B continúan intactas, con acceso por ficha/capacidad dentro de runAtomic y errores HTTP uniformes. La selección de SQL no debe habilitar acceso ni fixtures automáticamente.

Siguiente trabajo recomendado, sujeto a autorización: implementación de DI/selector y pruebas con dobles, sin conexiones reales ni activación SQL/HTTP, y después validación real separada bajo identidad restringida. No hay cambios en endpoints, configuración activa, permisos, infraestructura SQL o autenticación en este cierre. Sin staging, commit, push, PR, merge ni despliegue; L8-E no está implementada.
## L8-E1 — Composición y selección implementadas con dobles (23/10/2026)

Este incremento implementa el diseño previo de selección, sin ejecutar SQL real ni activar valores de entorno. PAI_API_PERSISTENCE ausente o exactamente memory selecciona MemoryUnitOfWork vacía; exactamente sql-local selecciona createLocalSqlUnitOfWork. Valores vacíos, desconocidos, con espacios o mayúsculas distintas fallan cerrados. No se normalizan ni se interpretan como memoria. El punto de composición entrega handlers de indisponibilidad 500 genéricos ante configuración inválida o fallo de construcción SQL; nunca hace fallback silencioso.

functions/fichas.ts entrega el selector a createLocalQueryHandlers. composition/queries.ts selecciona una sola UnitOfWork y reutiliza createApplicationHandlers para ReadFichaQueries y ReportService. Factories opcionales son DI exclusiva de código confiable, no datos HTTP. La política local isApplicable=false se conserva en createLocalAuthorization; su extracción permite probar directamente el comportamiento vigente sin introducir una política nueva.

Nueva composition/sql.ts: construye SqlUnitOfWork sobre SqlSessionRunner y LocalOdbcTransport. La construcción no conecta. createRequire prepara un cargador cuya única ruta permitida es mssql/msnodesqlv8.js; la carga nativa queda diferida hasta connect, bajo las barreras existentes del transporte. Para pruebas, la fábrica recibe SqlTransport simulado. No se creó proveedor de identidad ficticia ni un modo operativo de pruebas en el host.

Las fronteras admiten únicamente que composition/queries.ts invoque composition/sql.ts, y que esta fábrica importe UnitOfWork y los tres módulos SQL constructores. Se mantiene prohibición de SQL directo desde Functions, HTTP, dominio, aplicación y otros adaptadores. Functions solo puede acceder a composition/queries.ts, sin saltar a la fábrica SQL. node:module y las llamadas createRequire/loadNative se limitan al archivo y argumento literales autorizados; importaciones dinámicas generales siguen prohibidas. Pruebas negativas cubren rutas arbitrarias, variables, repositorios directos y acceso desde capas no autorizadas.

Validación final: npm run build correcto (fronteras, contratos TypeScript y compilación). node --test tests/composition-persistence.test.mjs tests/boundaries.test.mjs tests/http-fichas.test.mjs tests/http-reportes.test.mjs: 131 aprobadas, cero fallos. De ellas, 17 son pruebas nuevas de composición y 36 de fronteras; las restantes 78 cubren HTTP sobre dobles/memoria y JWT sintéticos de pruebas, sin conexión institucional. Dos casos nuevos de frontera inicialmente usaron una ruta relativa incorrecta; se corrigieron las rutas de prueba, sin eliminar ni relajar las aserciones. No se ejecutó la suite completa histórica.

Un proceso limpio bloqueó la carga de mssql/msnodesqlv8 antes de importar composición: ambos modos se construyeron y health respondió 200 con nativeLoads=0. Otras pruebas comprobaron fábrica SQL seleccionada exactamente una vez, fallo sin fallback, sanitización de errores, la misma instancia de UnitOfWork para consultas/reportes, autorización temporal denegada y ausencia de acceso a persistencia antes de autenticar. El commit ejercitado en el test de fábrica usa exclusivamente un transporte doble; no demuestra commit real SQL.

No se modificaron ODBC, SqlSession, SqlUnitOfWork, repositorios, contratos L2, autenticación institucional, configuración WEBSITE_HOSTNAME, permisos, migraciones o paquetes. No se crearon ni activaron archivos de entorno ni se inició Functions contra SQL. La selección ya está implementada, pero no constituye autorización de activación real. La incompatibilidad potencial de la barrera WEBSITE_HOSTNAME con Core Tools local se mantiene para L8-E2 y requiere cambio puntual autorizado; no se elude borrando el marcador. La identidad del proceso Functions deberá ser restringida y la política temporal seguirá denegando. Commit duradero, concurrencia entre conexiones, HTTP SQL/Entra reales y producción continúan pendientes.

Archivos de este incremento: src/composition/queries.ts, src/composition/sql.ts (nuevo), src/functions/fichas.ts, scripts/check-boundaries.mjs, tests/boundaries.test.mjs, tests/composition-persistence.test.mjs (nuevo), api/L8D5_Integracion_SQL.md y documento maestro. L8-D permanece cerrada en su alcance validado. Dictamen L8-E1: APTO para preparar L8-E2 bajo nueva autorización, sin iniciarla automáticamente. Sin staging, commit, push, PR, merge ni despliegue.
## L8-E2 — Barrera local preparada; acceso a Core Tools pendiente (23/10/2026)

Se implementó únicamente la excepción local necesaria de WEBSITE_HOSTNAME en la barrera del transporte SQL, conservando la transacción, los parámetros y los tiempos de espera. La excepción requiere conjuntamente hostname loopback válido, PAI_POC_LOCAL_ONLY=1, Development, runtime node, sql-local y Azurite explícito sin claves alternativas. Marcadores de alojamiento, producción o señales inconsistentes siguen rechazados. Los diagnósticos standalone conservan su contrato. Estas señales de configuración no equivalen a autenticación ni prueban criptográficamente el origen del proceso.

Build TypeScript/contratos/fronteras correcto y 191 pruebas dirigidas aprobadas con dobles/memoria. Autenticación L4-A, autorización L4-B y política temporal de denegación permanecen intactas. Se prepararon scripts/start-http-sql-local.ps1 y scripts/check-http-sql-identity.mjs para comprobar accesos/token Windows e identidad SQL de solo lectura, seleccionar sql-local únicamente en el proceso y reutilizar el arranque loopback sin recompilar bajo la cuenta restringida.

La comprobación real bajo PAIPOC_Test falló en CORE_TOOLS_EXECUTE_ACCESS antes de consultar SQL o iniciar Functions. Pasaron identidad/token Windows no administrativo, lectura del proyecto y ejecución de Node. La cuenta está habilitada y no tiene membresía directa en Administrators. Las ACL inspeccionadas de func.cmd, main.js y func.exe no contienen permisos para la cuenta o los grupos estándar comprobados. No se concedió acceso ni se amplió SQL. El procedimiento se endureció para comprobar lectura y ejecutar solo el func.exe existente durante el preflight, sin invocar bootstrap/instalación; no se repitió tras el fallo.

Detalles y alcance mínimo de lectura/ejecución propuesto, todavía NO aplicado: api/L8E2_HTTP_SQL_Local.md. Se limita a func.cmd, directorios de travesía, lib/main.js y bin de azure-functions-core-tools bajo el alias NVM; no incluye Modify, FullControl o escritura general en el repositorio. El destino real de los enlaces se verificará antes de cualquier futura ACL autorizada.

No arrancó el host, no se ejecutó health real, no se revalidó identidad SQL en este preflight y no se realizaron escrituras, fixtures, DDL, cambios de permisos, entorno permanente o despliegues. No se deduce compatibilidad real de Core Tools a partir de las pruebas con dobles. Dictamen L8-E2: NO APTO operativo hasta resolver el acceso mínimo y comprobar arranque/health bajo identidad restringida. L8-D permanece cerrada; no se habilitan pruebas HTTP de escritura ni etapas posteriores. Sin staging, commit, push, PR o merge.
## Aplicación de ACL autorizadas y nueva barrera de directorio padre (23/10/2026)

El usuario autorizó lectura/ejecución de Core Tools y travesía de sus padres. Se verificó C:\nvm4w\nodejs como enlace al directorio real de la versión v24.22.0 y se aplicaron las ACL sobre ese destino, no sobre una ruta supuesta. Los componentes func.cmd, lib/main.js y bin/func.exe existen. La cuenta actual, aunque no tiene token administrativo, pudo aplicar las ACL como titular con derechos suficientes; no fue necesario elevar ni solicitar contraseña.

ACL concedidas únicamente al SID de PAIPOC_Test: ReadAndExecute en func.cmd y lib/main.js; Traverse y ReadAttributes, sin propagación, en node_modules, azure-functions-core-tools y lib; ReadAndExecute con herencia solo en el subárbol bin. La comprobación de func.exe confirmó la regla heredada de lectura/ejecución. En los objetos modificados se compararon y conservaron las reglas de los demás principales. No se concedió Modify/FullControl ni escritura; no se modificaron permisos del repositorio o SQL. Se guardó copia de las ACL previas en un directorio temporal privado fuera de Git para trazabilidad/reversión.

La comprobación real en PAIPOC_Test ejecutó func.cmd --version y falló antes de Core Tools: EPERM, errno -4048, syscall lstat, en AppData del perfil que contiene la instalación NVM. Node.js v24.22.0 sí se ejecutó, pero no pudo resolver el destino real del main.js a través de ese padre. No se conserva en este documento el nombre personal del perfil. El preflight condicionado a ExitCode 0 no se ejecutó.

Se detuvo la secuencia conforme a la instrucción expresa del usuario: no se ampliaron automáticamente permisos sobre el perfil o AppData. La necesidad mínima que debe autorizarse/revisarse es ReadAttributes y Traverse del directorio AppData específico del perfil titular de NVM, sin listado de contenido, escritura ni propagación a hijos. Esto no equivale a autorizar acceso general a todo AppData; tampoco demuestra que no exista otra barrera posterior. No se concedió ese permiso en esta intervención.

Resultado: func --version sin versión de Core Tools; preflight SQL, arranque Functions y GET health no alcanzados. No se inició Azurite ni ningún host. No se realizaron conexiones SQL, fixtures, escrituras, cambios de señales de entorno o configuración permanente. No se modificó código de producción ni se repitieron pruebas generales. La identidad SQL restringida conserva su validación histórica de L8-D, sin nueva comprobación en este intento.

Dictamen vigente: NO APTO para pruebas HTTP/SQL funcionales hasta resolver la lectura de metadatos del padre AppData y completar las verificaciones. Se preservan las ACL mínimas ya aplicadas, sin revertirlas ni ampliarlas. Sin staging, commit, push, PR, merge ni despliegue.
## Corrección puntual de AppData validada; nuevo bloqueo en Local (23/10/2026)

Se confirmó que el AppData derivado del destino real C:\nvm4w\nodejs/v24.22.0 coincidía exactamente con el directorio del error anterior. Su propietario coincidía con el titular actual de la instalación; no había una ACE directa para PAIPOC_Test. Se añadió exclusivamente a ese SID una ACE Allow con máscara 160 (ReadAttributes | Traverse), AceFlags=None: sin herencia, ListDirectory/ReadData, escritura, Modify, FullControl, ChangePermissions o TakeOwnership. Se utilizó una ACE con máscara exacta para no incorporar Synchronize automáticamente. La verificación posterior confirmó que propietario y ACE de los demás principales no cambiaron. Se conserva copia privada de la ACL previa fuera de Git.

La revisión automática impidió una lectura auxiliar por falta de créditos; esa lectura no se ejecutó. Al reanudar por instrucción del usuario, se recuperó el resultado satisfactorio de la operación ya iniciada, sin aplicar otra vez la ACE ni eludir la revisión.

El primer bloque de validación pegado por el usuario se aplanó y PowerShell lo rechazó como sintaxis; no ejecutó SQL ni Core Tools. Se preparó solo un diagnóstico temporal ignorado por Git en api/.test-tmp/l8e2-host/check-metadata.mjs. Su ejecución real bajo PAIPOC_Test confirmó LSTAT_APPDATA / OK. El defecto EPERM del AppData original está resuelto y verificado.

La siguiente ejecución de func.cmd --version encontró otro EPERM, errno -4048, syscall lstat, esta vez en AppData\Local del mismo perfil titular de NVM. No se publica el nombre personal del perfil. Es un directorio distinto, no cubierto por la ACE anterior de ámbito no heredable. Conforme a la instrucción del usuario se detuvo la secuencia; no se modificó Local ni otro directorio y no se repitió func. La necesidad mínima pendiente es comprobar/autorizar por separado ReadAttributes y Traverse únicamente en el Local exacto, sin herencia ni listado/escritura; no se presupone acceso a otros padres o descendientes.

Core Tools no devolvió versión. Preflight SQL, identidad SQL efectiva del nuevo host, arranque Functions y health no alcanzados. No hubo conexiones SQL, DML/DDL, fixtures, cambios de permisos SQL, escrituras HTTP o configuración permanente. No se modificó código fuente de PAI Digital. Dictamen: AppData corregido; NO APTO todavía para completar L8-E2 por el acceso pendiente a Local. Sin staging, commit, push, PR, merge ni despliegue.
## Acceso mínimo de Local aplicado por autorización posterior (23/10/2026)

El usuario autorizó resolver el nuevo acceso. Se derivó Local del destino real de NVM v24.22.0 y se confirmó coincidencia exacta con el AppData\Local del EPERM anterior. Se añadió exclusivamente para PAIPOC_Test una ACE Allow de máscara 160 (ReadAttributes | Traverse), AceFlags=None, sin herencia, listado, escritura, Modify, FullControl, ChangePermissions o TakeOwnership. La verificación confirmó propietario y ACE de los demás principales intactos; se conservó una copia privada de la ACL anterior fuera de Git. No se aplicaron permisos en otros directorios.

La modificación terminó satisfactoriamente. Se solicitó una validación de func.cmd --version desde la consola restringida. Hasta recibir ese resultado no se considera probado el arranque de Core Tools ni se ejecutan preflight SQL, host o health. La corrección previa de AppData conserva su lstat real OK. No hubo cambios de código, SQL, configuración permanente o pruebas generales. Sin staging, commit, push, PR, merge ni despliegue.
## Resultado vigente: herramientas independientes y health real aprobados (23/10/2026)

Los bloqueos de acceso descritos arriba se conservan como antecedentes. Tras confirmar el nuevo EPERM en AppData\Local\nvm se aplicó únicamente sobre ese directorio real una ACE Allow para PAIPOC_Test: máscara 160 (ReadAttributes | Traverse), sin herencia. Se verificaron propietario y restantes ACE intactos. El intento posterior con la instalación NVM privada siguió sin superar CORE_TOOLS_EXECUTE_ACCESS; no se concedieron más accesos al perfil privado.

Se preparó una copia independiente de las herramientas ya instaladas en D:\PAI\tools\pai-local-24.22.0-4.16.0: Node.js 24.22.0 y Core Tools 4.16.0. Se compararon por SHA-256 los 9.016 archivos de origen y destino; coincidieron. Las firmas Authenticode de node.exe y func.exe resultaron válidas. PAIPOC_Test tiene únicamente lectura/ejecución heredable en este árbol nuevo; no se concedieron privilegios administrativos ni modificación general sobre el repositorio. No se instalaron dependencias de aplicación ni se descargaron versiones adicionales.

scripts/start-http-sql-local.ps1 admite -ToolsDirectory, selecciona explícitamente node.exe/func.cmd de ese directorio y verifica la versión mediante el lanzador real. Usa el perfil propio de la cuenta restringida obtenido por SID, evitando cachés/TEMP heredados del perfil que inició la consola. PATH, USERPROFILE, APPDATA, LOCALAPPDATA, TEMP, TMP y la selección de persistencia se limitan al proceso y se restauran mediante finally. No se guarda sql-local en archivos de configuración ni se incorporan contraseñas.

Comando validado desde la consola PAIPOC_Test:

```powershell
& 'D:/PAI/pai-digital-react/api/scripts/start-http-sql-local.ps1' -ToolsDirectory 'D:/PAI/tools/pai-local-24.22.0-4.16.0'
```

Resultados reales:

- func --version: 4.16.0; runtime Functions 4.1054.250.26428.
- HOST_PREFLIGHT: OK, identidad Windows esperada, token no administrativo, identidad SQL esperada, sin privilegios administrativos SQL y transporte Shared memory. Consulta SQL exclusivamente SELECT, writes=0.
- Host con selección sql-local solo en el proceso; seis funciones registradas. Se comprobó el propietario efectivo del proceso func.exe como la cuenta restringida esperada, sin publicar nombres personales.
- Listener HTTP observado únicamente en 127.0.0.1:7071. Azurite de prueba escuchó únicamente en loopback, puertos 10000–10002.
- Única solicitud HTTP: GET /api/poc/health. HTTP 200, cuerpo {"status":"ok","service":"pai-api-poc","stage":"L1","mode":"local-only"}.
- El usuario cerró Core Tools con Ctrl+C y confirmó la vuelta a consola. Se verificó la desaparición del listener HTTP y se detuvieron exclusivamente Azurite y su lanzador de prueba.

No se invocaron endpoints funcionales, no hubo fixtures, DML/DDL, cambios de permisos SQL ni modificaciones de repositorios, SqlSession o SqlUnitOfWork en esta corrección. La política temporal de denegación de asignaciones y la autenticación institucional permanecen intactas. Las 191 pruebas dirigidas y compilación anteriores son evidencia histórica; no se repitió una suite general para resolver este acceso.

Límite: health y el preflight SQL separado no prueban consultas SQL desde los endpoints protegidos, JWT reales, autorización positiva ni escrituras HTTP/SQL. La intermitencia histórica de sqlcmd no se declara resuelta.

Dictamen vigente: APTO para preparar una validación HTTP/SQL funcional controlada con autorización posterior. Acceso, preflight, arranque local y health completados; no se ejecutan automáticamente pruebas funcionales, escrituras ni despliegues. Sin staging ni commit.
## Validación funcional HTTP/SQL de lectura: bloqueo confirmado de identidad (23/10/2026)

Se inició de nuevo Core Tools 4.16.0 con las herramientas independientes, bajo PAIPOC_Test, sql-local explícito solo en el proceso y listener 127.0.0.1:7071. Se verificó el propietario restringido de func.exe. El preflight real indicó identidad Windows y SQL esperadas, sin privilegios administrativos efectivos y transporte Shared memory, writes=0. La consola restringida confirmó identityConfigurationPresent=false: PAI_API_IDENTITY_CONFIG no estaba definida. No se introdujo configuración sintética ni se adquirieron o registraron tokens institucionales.

Se enviaron exactamente siete solicitudes GET, sin POST/PATCH ni fixtures:

| Endpoint | Credencial | HTTP | Resultado |
|---|---|---|---|
| /api/poc/health | Ninguna | 200 | Diagnóstico local correcto |
| /api/poc/fichas/poc-http-missing-ficha | Ninguna y Bearer inválido sintético, dos solicitudes | 500 en ambas | INTERNAL_ERROR genérico |
| /api/poc/fichas/poc-http-missing-ficha/actividades | Ninguna y Bearer inválido sintético, dos solicitudes | 500 en ambas | INTERNAL_ERROR genérico |
| /api/poc/reportes/poc-http-missing-report | Ninguna y Bearer inválido sintético, dos solicitudes | 500 en ambas | INTERNAL_ERROR genérico |

Todas conservaron Cache-Control: no-store. Los errores respondieron únicamente el código y mensaje públicos previstos; no se registraron salidas SQL crudas, identidades personales, tokens ni excepciones originales. Que Core Tools registre la invocación como Succeeded significa que el controlador terminó; no convierte estos HTTP 500 en respuestas funcionales satisfactorias.

Recorrido comprobado por inspección: functions/fichas.ts → createLocalQueryHandlers → configuración Entra → createPersistence → fábrica SQL → SqlUnitOfWork → servicios. En esta ejecución, la ausencia de configuración provoca el retorno de unavailableQuery antes de llamar a createPersistence. Por tanto, sql-local fue solicitado en el entorno, pero SqlUnitOfWork no fue construido por esos controladores y ninguna consulta de repositorio SQL fue ejecutada por las solicitudes HTTP. No hubo fallback a memoria.

Con configuración válida, la validación Bearer/JWT precede a runAtomic. En base vacía y con una identidad auténtica válida, la autorización de ficha consultaría primero SqlUserRepository.findByIdentity (SELECT parametrizado sobre pai.InstitutionalUsers por TenantId y DirectoryObjectId) y denegaría el acceso al no existir usuario. Este recorrido es una previsión del código, no evidencia de una consulta HTTP/SQL ejecutada en esta prueba. La política isApplicable: () => false permanece intacta. No se probaron autorización positiva, JWT institucional válido ni respuestas 404 autenticadas de base vacía.

Pruebas dirigidas existentes: 17/17 de composition-persistence.test.mjs aprobadas, sin SQL ni red; verifican selector, ausencia de fallback, fábrica diferida y autenticación previa a persistencia. Los casos con dobles quedan expresamente separados de la evidencia HTTP real. No se modificó código de producción ni se repitió la suite general.

El observador independiente reutilizó runSqlcmd del ejecutor auditado y su consulta de integridad aprobada, solo de lectura. Inicial: SUCCESS, ExitCode 0, 818,24 ms. Final: SUCCESS, ExitCode 0, 462,93 ms. Ambos validaron pai_poc_dev ONLINE, las ocho tablas funcionales presentes y vacías, migración 0001_initial con hashes originales y huella de catálogo esperada. Las consultas SQL reales de esta intervención fueron las del preflight y del observador; ninguna se atribuye a los endpoints funcionales.

El usuario cerró el host con Ctrl+C. Se retiraron Azurite y su lanzador de prueba. Las evidencias sanitizadas y el arnés temporal GET permanecen únicamente en api/.test-tmp/l8e2-functional, ignorado por Git. No se alteraron permisos SQL, esquema, migraciones, repositorios, UnitOfWork, autenticación o autorización.

Dictamen: NO APTO para pasar a pruebas de escritura duradera. El arranque y health siguen validados; la ejecución de repositorios SQL desde HTTP permanece bloqueada por la configuración Entra ausente y la falta de un access token válido para la API. El siguiente paso requiere disponer de la configuración institucional aprobada y un mecanismo seguro de obtención/uso del token, sin copiarlo a documentación o evidencias. No se recomienda resolverlo desactivando autenticación ni cambiando la política temporal. Sin staging, commit, push, PR, merge ni despliegue.
## L8-E3 — Preparación Entra: valores administrativos pendientes (23/10/2026)

Diagnóstico estático del validador real: api/src/infrastructure/identity/config.ts, validator.ts, normalize.ts y keys.ts. La configuración PAI_API_IDENTITY_CONFIG exige tenantId (GUID no nulo), audience (GUID Application/Client ID del recurso API, no de la SPA ni Graph), requiredScope (un único nombre delegado exacto, sensible a mayúsculas, no openid/profile/email/offline_access), tokenVersion=2.0, clockToleranceSeconds entero 0–60 y allowedClientIds (1–100 GUID de clientes aprobados, comprobados contra azp). No se prescribe una tolerancia institucional nueva: debe suministrarse explícitamente dentro del rango admitido.

Para el tenant aprobado T se derivan exactamente issuer=https://login.microsoftonline.com/T/v2.0, metadataUrl=https://login.microsoftonline.com/T/v2.0/.well-known/openid-configuration y jwksUrl=https://login.microsoftonline.com/T/discovery/v2.0/keys. Se conservan firma RS256 con clave pública RSA de al menos 2048 bits, expiración, nbf, tid/oid, audience, issuer, azp admitido y scp requerido. No se admiten tokens app-only: roles no sustituye scp, ni las capacidades de ficha constituyen automáticamente scopes Entra. La API no requiere client secret para validar tokens.

Disponibilidad local comprobada sin publicar valores: .env.local contiene VITE_ENTRA_TENANT_ID y VITE_ENTRA_CLIENT_ID con forma GUID; src/auth/msalConfig.ts los utiliza para la SPA y solicita únicamente openid/profile. No se reutilizó el Client ID de la SPA como audience API. PAI_API_IDENTITY_CONFIG está ausente. La documentación histórica registra como pendientes el registro propio de API, scope, clientes/consentimiento y adquisición de tokens para la API. Esto no permite afirmar que no exista un registro remoto: su existencia/finalidad/autorización no están verificadas.

Consulta local Azure CLI account show: sesión disponible, tenant distinto del configurado en la SPA. No se mostraron cuentas ni identificadores y no se consultaron aplicaciones de ese tenant. No se inició login, cambió contexto, solicitó token ni realizó cambios Entra. La presencia de herramientas Azure CLI/Graph no prueba acceso autorizado al tenant objetivo.

Se requiere confirmación de un administrador autorizado de:

1. Tenant ID definitivo de PAI y confirmación de que corresponde al entorno de pruebas aprobado.
2. Registro existente y autorizado del recurso API: Application/Client ID, Application ID URI y finalidad. No confundir Application ID con Object ID.
3. Scope delegado habilitado: nombre exacto para requiredScope y URI completo para solicitarlo. No inventar api:// ni reutilizar Graph.
4. Cliente interactivo aprobado: Application/Client ID para allowedClientIds, plataforma/redirect URI existente y flujo permitido; consentimiento ya vigente para el scope. No se aceptarán consentimientos nuevos durante esta fase.
5. Configuración del recurso que emita access tokens v2: api.requestedAccessTokenVersion=2. Usar login v2 por sí solo no garantiza el formato del access token.
6. Usuario institucional autorizado para la prueba y tolerancia de reloj acordada; no se necesitan su contraseña, ID token, access token o secretos en el chat.

Procedimiento local preparado, pendiente de esos valores: desde PAIPOC_Test, introducir únicamente los valores públicos aprobados mediante Read-Host o un objeto PowerShell en memoria; construir el JSON de IdentityConfiguration con las URLs derivadas del tenant; conservar el valor previo de PAI_API_IDENTITY_CONFIG, asignar el JSON con [Environment]::SetEnvironmentVariable(...,'Process') y ejecutar start-http-sql-local.ps1 -ToolsDirectory D:/PAI/tools/pai-local-24.22.0-4.16.0 dentro de try/finally que restaure el valor previo. sql-local continúa seleccionado y restaurado por ese lanzador. No escribir JSON en .env, local.settings.json, perfiles, scripts persistentes ni configuración de usuario/máquina. No construir configuración desde claims no verificados de un JWT.

Token de prueba: utilizar MSAL y autenticación interactiva Authorization Code + PKCE con el cliente y redirect URI ya aprobados, solicitando el URI completo del scope de la API. Mantener access token y caché del arnés exclusivamente en memoria; enviarlo solo como Authorization: Bearer a la API loopback. No usar ID token, token de Graph o credenciales de aplicación como sustitutos. No copiar tokens a chat, argumentos de proceso, historial PowerShell, archivos o evidencia. Si falta consentimiento o el registro no permite el flujo, detenerse: no aceptar nuevas concesiones ni modificar Entra. La cuenta Windows PAIPOC_Test y el usuario institucional Entra son identidades distintas con propósitos distintos.

Validación prevista, no ejecutada en L8-E3: configuración válida sin Bearer → 401; Bearer inválido → 401; access token institucional válido → ejecutar servicios y autorización existente. Con ocho tablas vacías, se espera denegación 404 uniforme, no 403 ni 200 de datos: para ficha/actividades la autorización consultaría SqlUserRepository.findByIdentity y no encontraría usuario. Esa denegación aún puede demostrar una lectura SQL real, si se correlaciona adecuadamente. La política temporal de asignaciones continúa denegando y no se modifica para obtener resultados positivos. No se atribuye una consulta a SQL solo por un HTTP 404 o por health 200.

Resultado actual: BLOQUEADA POR CONFIGURACION ENTRA NO ACREDITADA. No se arrancó host, adquirió token ni repitieron pruebas HTTP/SQL en esta fase; no hay nuevos resultados 401/403/200 ni evidencia nueva de consultas SQL desde HTTP. Los HTTP 500 de L8-E2 son antecedentes por falta de configuración. No se modificaron autenticación de producción, frontend, repositorios, permisos, registros Entra, esquema o migraciones; no hubo escrituras funcionales ni fixtures. Se detiene antes de pruebas de escritura duradera.

Fuentes primarias consultadas: Microsoft claims-validation (aud v2 es Client ID de API), v2-oauth2-auth-code-flow (MSAL/PKCE y access_token para APIs), Graph apiApplication (requestedAccessTokenVersion y scopes). https://learn.microsoft.com/en-us/entra/identity-platform/claims-validation ; https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow ; https://learn.microsoft.com/en-us/graph/api/resources/apiapplication?view=graph-rest-1.0 .
## L8-E3 — Configuración aprobada y access token real validado; HTTP/SQL bloqueado (23/10/2026)

Autorización institucional proporcionada por el usuario: API PAI-Digital-API-FUMC-DEV; tenant 9c6cb0e9-1c0e-4137-ac54-6ba138984ef2; audience/API Client ID aca30f77-872a-4cc5-a540-0a7547d95f53; Application ID URI api://aca30f77-872a-4cc5-a540-0a7547d95f53; scope delegado access_as_user y scope completo api://aca30f77-872a-4cc5-a540-0a7547d95f53/access_as_user; access tokens v2 y consentimiento administrativo existentes, según confirmación del usuario. No se cambiaron registros, consentimientos o permisos Entra. La aprobación sustituye el bloqueo de valores pendientes anterior, conservado como antecedente.

El Client ID de la SPA se obtuvo de VITE_ENTRA_CLIENT_ID en .env.local; se comprobó que es diferente del recurso API y que el tenant local coincide con el autorizado. No se inventaron identificadores. Se construyó IdentityConfiguration en memoria con tokenVersion=2.0, clockToleranceSeconds=30 y allowedClientIds con el cliente real de la SPA. Issuer y endpoints OIDC/JWKS se derivaron del tenant. PAI_API_IDENTITY_CONFIG, NODE_OPTIONS y sql-local se limitan al proceso y se restauran mediante finally; no se escribieron en configuración permanente.

Se preparó un arnés temporal ignorado por Git en api/.test-tmp/l8e3-entra. Utiliza MSAL Browser 4.30.0 ya instalado, Authorization Code + PKCE y popup con redirect local http://localhost:5173/. El servidor del arnés escucha solo en 127.0.0.1:5173. Tanto cacheLocation como temporaryCacheLocation son memoryStorage; la respuesta de autenticación se descarta y clearCache se intenta en finally. No se escribieron access tokens, ID tokens, códigos OAuth, contraseñas o claims personales en evidencias, repositorio o documentación.

Resultado real confirmado en el arnés: tokenValidation.status=OK, signature=true, issuer=true, audience=true, expiration=true, scope=true y authorizedClient=true. Se utilizó el validador Entra existente, sin dobles de firma/claves ni relajar condiciones: descarga OIDC/JWKS real, RS256, issuer/audience/exp/nbf, tid/oid, scp y azp. Este resultado prueba el access token institucional de la API en el validador real; no se presenta como validación ejecutada por Azure Functions, porque el host no llegó a arrancar.

El primer arranque restringido terminó FAILED en SQL_IDENTITY_READ_ONLY, writes=0, antes de registrar Functions. El observador inicial auditado también falló: EXTERNAL_TIMEOUT, 15.017,47 ms, ExitCode no disponible, respuesta no validada y cierre no confirmado en ese resultado; una revisión posterior de procesos no encontró sqlcmd residual. No se atribuye la causa a Entra ni a pooling.

Se mejoró exclusivamente el diagnóstico local de api/scripts/check-http-sql-identity.mjs y start-http-sql-local.ps1 para proyectar etapa CONNECT/QUERY/IDENTITY_AND_PRIVILEGES, códigos técnicos de lista cerrada y nombres de controles fallidos. La primera edición del diagnóstico omitió declarar stage y quedó un defecto del propio diagnóstico; la repetición devolvió SQL_PREFLIGHT_DETAIL con etapa/código nulos y no prueba una causa SQL adicional. Se corrigió la declaración y se comprobó con cuatro pruebas aisladas que éxito, timeout de conexión, fallo de consulta y privilegio nulo conservan la clasificación y el cierre, sin ejecutar SQL. No se relajaron las comprobaciones: un privilegio nulo sigue fallando. El arranque con esa última corrección no quedó confirmado antes de finalizar esta intervención.

El navegador mostró inicialmente HARNESS_READ_CHECK_FAILED. La evidencia sanitaria confirma que el token ya había sido validado correctamente y que el fallo posterior fue al intentar alcanzar el host HTTP no iniciado: http=[] en el resultado. Se ajustó solo la presentación del arnés para separar tokenValidation de HTTP_HOST_READ_FAILED; no se repitió el login ni se reutilizó un token guardado. No se obtuvieron en esta intervención códigos HTTP 401/404/200 de las Functions; los resultados anteriores de health/HTTP se conservan como antecedentes, no se reutilizan como evidencia L8-E3.

Observación SQL temporal preparada mediante preload del proceso: marca la entrada real en SqlUnitOfWork y la terminación de SELECT conocidos (users.findByIdentity, reports.findById), sin registrar SQL completo, parámetros, tokens, cuentas o filas. No cambió archivos de producción del adaptador, repositorios, sesión o UnitOfWork. Como el host no arrancó, no se capturó ninguna marca de repositorio SQL desde HTTP y no se afirma esa integración. No hubo fallback a memoria; el preflight fallido impidió el arranque. La política temporal isApplicable: () => false permanece intacta y no hay autorización positiva nueva demostrada.

Pruebas dirigidas: cuatro del arnés/configuración/privacidad y cuatro del diagnóstico SQL con dobles, ocho aprobadas; sintaxis Node/PowerShell correcta. No se repitió suite general. La comprobación independiente final de integridad terminó EXIT_NONZERO, ExitCode 1, 5.122,31 ms, sin respuesta validada; cierre del hijo confirmado. Por tanto, el estado actual final de las tablas, historial y catálogo no quedó revalidado en L8-E3. No se ejecutaron escrituras funcionales, fixtures, DDL, migraciones o cambios de permisos. Las últimas ocho tablas vacías y catálogo/historial correctos son evidencia histórica de L8-E2, no se declaran comprobados de nuevo.

Se detuvieron el servidor MSAL y Azurite/lanzador de esta prueba. El token ya había sido descartado del arnés; se indicó al usuario no repetir el último arranque pendiente. Los recursos SQL y Entra no se modificaron. Sin staging, commit, push, PR, merge o despliegue.

Dictamen: autenticación Entra real VALIDADA en el validador existente; HTTP/SQL NO VALIDADO y NO APTO todavía para escrituras duraderas. Bloqueo pendiente: superar el preflight SQL restringido y revalidar integridad, conservando las barreras actuales. La corrección diagnóstica está preparada para obtener un código técnico concreto en el siguiente intento controlado; no hay evidencia suficiente para declarar una causa raíz de conectividad SQL ni para cambiar permisos, pooling o timeouts.
## L8-E3 — Reanudación: autenticación HTTP y ejecución SQL real demostradas (23/10/2026)

Esta reanudación sustituye el bloqueo operativo de arranque descrito en el corte anterior, sin borrar sus fallos ni declarar resuelta la intermitencia. El usuario ejecutó el lanzador corregido bajo PAIPOC_Test. HOST_PREFLIGHT terminó OK: identidad Windows esperada, token no administrativo, identidad SQL esperada, sin privilegios administrativos SQL, Shared memory y writes=0. Core Tools 4.16.0 registró las seis funciones; se comprobó listener únicamente 127.0.0.1:7071 y propietario efectivo PAIPOC_Test. Se restablecieron Azurite y el arnés temporal MSAL en loopback, sin modificar configuraciones permanentes.

Configuración utilizada: tenant 9c6cb0e9-1c0e-4137-ac54-6ba138984ef2; audience/API Client ID aca30f77-872a-4cc5-a540-0a7547d95f53; scope delegado access_as_user; scope solicitado api://aca30f77-872a-4cc5-a540-0a7547d95f53/access_as_user; access token v2; tolerancia explícita 30 segundos. allowedClientIds se obtuvo del Client ID real de la SPA en .env.local. Las URLs de issuer, metadatos y JWKS derivan del tenant. La aprobación del recurso y del consentimiento es la proporcionada por el usuario; no se modificó Entra.

MSAL Browser 4.30.0 utilizó autenticación interactiva Authorization Code + PKCE, caché y caché temporal memoryStorage. El validador Entra existente confirmó nuevamente firma, issuer, audience, expiración, scope y cliente autorizado antes de reenviar el access token al host. Las Functions recibieron el Bearer real sin inyección de identidad ni autorización simulada. El token se descartó después y no se conserva en archivos, logs o documentación.

Diez solicitudes HTTP reales y exclusivamente GET:

| Ruta | Sin Bearer | Bearer inválido | Access token institucional válido |
|---|---|---|---|
| /api/poc/health | 200, una solicitud | No ejecutado | No ejecutado |
| /api/poc/fichas/poc-entra-missing-ficha | 401 UNAUTHENTICATED | 401 UNAUTHENTICATED | 404 NOT_FOUND, 1.130,60 ms |
| /api/poc/fichas/poc-entra-missing-ficha/actividades | 401 UNAUTHENTICATED | 401 UNAUTHENTICATED | 404 NOT_FOUND, 16,52 ms |
| /api/poc/reportes/poc-entra-missing-report | 401 UNAUTHENTICATED | 401 UNAUTHENTICATED | 404 NOT_FOUND, 29,52 ms |

El health tardó 582,99 ms. Los cuerpos de error se mantuvieron sanitizados. No se presentan los 404 como acceso positivo a datos ni se espera 403: la API conserva su contrato de recurso no disponible ante ausencia o falta de autorización. Los 401 previos no alcanzaron los servicios de aplicación; el token válido sí alcanzó el contexto transaccional. Las diez respuestas fueron contrastadas automáticamente con la evidencia guardada.

Evidencia directa aportada por el usuario desde la consola del worker, preservando solo campos técnicos:

- Functions.pocFichaActividades: SQL_UOW_ENTER, adapter=SqlUnitOfWork; SELECT users.findByIdentity, result=ok, rowCount=0, duración SQL 0,95 ms.
- Functions.pocReportRead: SQL_UOW_ENTER, adapter=SqlUnitOfWork; SELECT reports.findById, result=ok, rowCount=0, duración SQL 13,93 ms.

La observación temporal envuelve el método original de SqlUnitOfWork y el query original del controlador real: no sustituye respuestas ni usa un transporte simulado. Los SELECT exactos parametrizados son, respectivamente, lectura de pai.InstitutionalUsers por TenantId/DirectoryObjectId y lectura de pai.Reports por Id. Se documentan dos SELECT observados directamente, no tres: la traza de la primera solicitud de ficha no fue incluida por el usuario, aunque su HTTP 404 sí está registrado. No se atribuyen lecturas a FichaRepository o ActivityRepository que la autorización impidió alcanzar.

Queda demostrado HTTP → composición existente → SqlUnitOfWork → repositorio SQL → consulta real para al menos esas dos solicitudes. Las marcas del adaptador y del controlador nativo excluyen un fallback a memoria en ellas. La política local de vigencia isApplicable: () => false y las comprobaciones de usuario/ficha/asignaciones permanecen intactas. No se concedió acceso positivo por scope o login institucional; los 404 muestran denegación/ausencia prevista.

Limitación independiente de integridad: el ejecutor histórico R10 devolvió RESPONSE_INVALID con ExitCode 0 en 8.748,56 ms; no se flexibilizó su validador ni se declaró SUCCESS. Para comprobar el estado vigente sin modificar referencias, se reutilizaron catalogSql y validateSnapshot del observador L8-D, con la serialización de catálogo R1 y el manifiesto original, exclusivamente SELECT. Esa comprobación final no logró conectar: ConnectionError en CONNECT, sin código/número SQL seguro disponible, cierre de pool confirmado. No se reintentó ni se amplió un timeout. Por ello, las ocho tablas, historial y catálogo actuales NO quedaron revalidados globalmente en esta reanudación. Los SELECT observados sí demuestran cero coincidencias en esas dos consultas, pero no prueban que todas las tablas estén vacías. No se ejecutó ningún DML, fixture o cambio de esquema para esta fase.

El usuario cerró el host con Ctrl+C y confirmó el cierre; se verificó que 7071 dejó de escuchar. Se detuvieron el arnés MSAL, Azurite y su lanzador. Sin procesos/listeners de prueba residuales al control final. No se mantienen tokens ni configuración Entra/sql-local permanente. Se conservaron los cambios previos y no se modificaron repositorios, ODBC, SqlSession, SqlUnitOfWork, reglas institucionales, permisos SQL o migraciones.

Dictamen de alcance: L8-E3 demuestra autenticación Entra real, rechazo HTTP de credenciales inválidas, denegación uniforme con credenciales válidas y ejecución real de SELECT SQL desde HTTP, bajo identidad Windows/SQL restringida. No se habilitan pruebas de escritura duradera: siguen pendientes la comprobación global de integridad, escenarios de autorización positiva con datos aprobados y una autorización explícita de escritura. La intermitencia de observadores SQL permanece sin causa confirmada. Sin staging, commit, push, PR, merge o despliegue.
## L8-E4 — Cierre de lecturas y diseño de persistencia duradera (23/10/2026)

### Integridad independiente: no confirmada actualmente

Se reutilizó el procedimiento de catálogo del observador L8-D: catalogSql/validateSnapshot, serialización de verify.sql R1, manifiesto original, autenticación Windows integrada de la identidad observadora ya existente, destino lpc:.\PAIPOC/pai_poc_dev y Node de la instalación utilizada anteriormente por esa observación. El lector no es la identidad escritora de la API; no se cambiaron cuentas, permisos ni configuración. El intento falló antes de obtener conexión: ConnectionError en CONNECT, 10.114,92 ms, pool cerrado; no hubo resultado de catálogo o DMV.

Diagnóstico breve adicional: identidad Windows actual coincidente con el propietario del repositorio (sin publicar su nombre), token Windows no administrativo, servicio MSSQL$PAIPOC Running y ODBC Driver 17 x64 presente. El arnés sqlcmd tuvo primero un error de opciones: -h y -y 0 son incompatibles, confirmado mediante ayuda local sin SQL; se eliminó -h y se corrigió únicamente el formato JSON de presentación del SELECT, conservando el cálculo y validaciones originales de catálogo/historial. El intento de lectura corregido terminó con ExitCode 1, código nativo 258, 5.050,75 ms, sin stdout ni resultado SQL. Es evidencia de fallo/timeout de conectividad, consistente con el intento nativo; no identifica por sí sola la causa raíz. No se ampliaron límites ni se inició una serie de reintentos.

Resultado actual: no se puede afirmar ONLINE, ocho tablas vacías, historial/catálogo coincidentes o ausencia de transacciones de prueba abandonadas en este corte, porque ninguna consulta llegó a aportar esos resultados. Se preparó la lectura DMV acotada a sesiones de pruebas/PAIPOC_Test, pero no se alcanzó. Las validaciones previas se conservan como antecedentes; no se convierten en evidencia actual. No se escribió, corrigió ni limpió ningún dato para forzar una comprobación.

### Cierre técnico de L8-E3

L8-E3 CERRADA EN EL ALCANCE DE AUTENTICACION Y LECTURAS HTTP/SQL DEMOSTRADAS: health 200; seis 401 (tres rutas sin Bearer y con Bearer inválido); access token institucional v2 validado; tres 404 uniformes con token válido; entrada directa a SqlUnitOfWork y SELECT reales users.findByIdentity y reports.findById, ambos correctos y sin filas; sin fallback a memoria en las rutas observadas. No se repitieron login, adquisición de token ni pruebas HTTP de autenticación en L8-E4.

Este cierre no incluye autorización positiva, escrituras, commit duradero ni revalidación de integridad global. La incidencia de observación de integridad queda abierta como condición independiente de L8-E4; no invalida la evidencia HTTP/SQL ya capturada ni se declara resuelta la intermitencia.

### Ensayo duradero propuesto, NO ejecutable todavía

Endpoint existente: POST /api/poc/actividades/{activityId}/reportes. Requiere Authorization: Bearer con access token v2 para la API aprobada, scope access_as_user y azp aprobado; Idempotency-Key exclusiva; Content-Type application/json; cuerpo de hasta 16.384 bytes con period, quantity como DecimalText exacto o null, y narrative. No admite campos de autor/estado adicionales. Ejemplo exclusivamente descriptivo: period='poc-durable-<identificador-de-ensayo>', quantity='9007199254740993.000100', narrative='Ensayo sintético de persistencia'. El identificador de ensayo debe satisfacer los límites actuales; no se usa ni inserta ahora.

Condición de autorización independiente del scope: usuario habilitado vinculado a tenant/oid del token validado, actividad y ficha existentes, y asignación habilitada con poc:edit-report y vigencia admitida por la política real. La lectura posterior GET /api/poc/reportes/{reportId} necesita además poc:read. El Client ID no concede acceso por sí solo. Actualmente createLocalAuthorization compone isApplicable: () => false: por ello NINGUNA asignación concede acceso, aunque existan filas correctas. Bajo la restricción de no modificar esa política, un ensayo HTTP con creación exitosa es inviable; no se simulará autorización ni se omitirá el servicio.

Dependencias persistentes necesarias antes del POST:

| Tabla | Uso/FK |
|---|---|
| InstitutionalUsers | Actor habilitado; identidad tenant/objeto única; FK de autor, auditoría e idempotencia |
| Dependencies | Padre de la ficha |
| Fichas | DependencyId → Dependencies |
| Activities | FichaId → Fichas; actividad destino del POST |
| AccessAssignments | UserId/FichaId → usuario/ficha; capacidades separadas poc:edit-report y poc:read |
| Reports | POST crea el reporte: FK actividad y autores; UNIQUE ActivityId + PeriodKey; rowversion |
| AuditEvents | POST añade evento histórico de creación, FK al actor; append-only desde la API |
| IdempotencyRecords | Reserva y finalización en la misma transacción; FK actor, reporte y auditoría; UNIQUE ActorId + Operation + IdempotencyKey; resultado histórico completo |

Con las ocho tablas vacías no basta ejecutar el POST: se necesitarían datos padre sintéticos COMMITidos con autorización específica. Un conjunto de padres sin commit en otra conexión no sirve para este ensayo: la conexión HTTP no puede usarse como si compartiera la transacción de preparación. La vinculación del actor debe usar tenant/oid realmente validados (metadatos de autenticación del usuario de prueba aprobado); inventar el oid impide autenticar/autorización. Si no se aprueba almacenar ese vínculo mínimo de identidad, tampoco es viable el caso positivo. Los contenidos de actividad, ficha, dependencia y reporte serán exclusivamente sintéticos.

Permisos existentes del escritor PAIPOC_Test: SELECT/INSERT en las tablas funcionales y UPDATE por columnas autorizadas. Para el POST bastan SELECT sobre usuario/ficha/asignaciones/actividad y comprobaciones de reporte/auditoría/idempotencia, INSERT en Reports/AuditEvents/IdempotencyRecords y UPDATE de finalización de IdempotencyRecords (State, CompletedAt, OutcomeReportId, OutcomeAuditEventId, OutcomeReportJson). El propio rowversion lo genera SQL Server. No se requiere conceder DELETE, db_owner, CONTROL o privilegios de migración. Los permisos reportados son los del script ya aprobado, no una nueva comprobación efectiva SQL en L8-E4, que no pudo conectar.

Secuencia mínima futura, condicionada a resolver todos los bloqueos y a autorización de ejecución:

1. Verificación independiente completa de integridad y ausencia de transacciones de prueba. Preparar y revisar el inventario exacto de IDs/tablas que podrán crearse y eliminarse, identidad Entra de prueba y datos padre. Requiere aprobación de autorización positiva y de la preparación/limpieza; no está autorizada en este corte.
2. Preparar los padres sintéticos en una transacción administrativa explícita, con commit únicamente tras validar todas las FK y pertenencia al ensayo. Esto es una escritura persistente separada del POST y debe figurar expresamente en la autorización futura. El escritor HTTP sigue siendo PAIPOC_Test, sin privilegios nuevos.
3. Iniciar el host restringido con configuración temporal y token en memoria. Ejecutar exactamente un POST con clave de idempotencia y periodo exclusivos. Esperar 201 y registrar solo recibo/IDs sintéticos, versión opaca y evidencias técnicas sanitizadas. No usar el error terminal de rollback de L8-D5: en el ensayo duradero el callback debe terminar correctamente para que el runner intente el COMMIT real conjunto de reporte, auditoría e idempotencia.
4. Confirmar el commit con una lectura independiente después de la transacción. Reiniciar el proceso host y realizar GET por el reportId con token válido y capacidad poc:read, para demostrar supervivencia al proceso que escribió. Verificar cantidad textual exacta, Unicode, periodo, estado, UTC y version; un observador separado comprueba las tres filas relacionadas, snapshots y resultado histórico. La nueva conexión/identidad compuesta, si se mide, se conserva solo en memoria: un nuevo lease no equivale automáticamente a una conexión física nueva por pooling.
5. Limpiar únicamente el conjunto sintético inventariado mediante un procedimiento administrativo distinto del escritor HTTP, autorizado para este ensayo; comprobar pertenencia completa, relaciones y que no hay datos ajenos, dentro de una transacción y sin cascadas. Eliminar IdempotencyRecords primero; luego AuditEvents y Reports (sin dependencias entre esos dos), AccessAssignments y Activities, Fichas, Dependencies e InstitutionalUsers al final. Los padres solo se eliminan si fueron creados exclusivamente para el ensayo y no tienen referencias ajenas. La eliminación administrativa de auditoría sintética es una excepción de mantenimiento de la PoC que necesita autorización expresa; la API y AuditRepository siguen siendo append-only. Si esa excepción no se aprueba, el diseño exige un destino sintético desechable autorizado o retención de la evidencia; no puede prometerse limpieza completa en la base compartida.
6. Observador independiente: ocho tablas vacías si ese era el estado inicial, historial de migraciones y catálogo idénticos, cero transacciones de prueba abandonadas y cierre de recursos. Si falla, reportar integridad no verificada; no borrar más ni recrear la base como solución automática.

Idempotencia/concurrencia: conservar clave y cuerpo exactos durante el ensayo; mismo scope con contenido distinto debe ser conflicto, no una segunda escritura. No repetir automáticamente un POST con respuesta perdida o commit ambiguo: primero resolver el resultado duradero mediante consultas/recibo y, si se autoriza, replay de la misma clave, nunca una clave nueva para forzar éxito. ActivityId+PeriodKey también es único. No añadir reintentos de deadlock ni inferir concurrencia entre conexiones a partir de un único ensayo secuencial. La rowversion recibida se conserva como token opaco, sin inventar versiones.

### Estado y límites de L8-E4

Preparación documental concluida; ensayo NO LISTO PARA EJECUCION. Bloqueos: integridad actual no demostrada por conectividad; política de asignaciones deliberadamente denegatoria; ausencia de datos padre persistentes aprobados; necesidad de aprobar vínculo mínimo de identidad de prueba y limpieza administrativa acotada, incluida auditoría sintética. No se solicita todavía autorización del POST porque estas condiciones no están resueltas, conforme a la instrucción del usuario de pedirla únicamente cuando el ensayo esté preparado.

No hubo POST/PATCH, fixtures, INSERT/UPDATE/DELETE funcionales, cambios de políticas, permisos, esquema o migraciones. Se modificaron únicamente estos documentos y un arnés temporal ignorado por Git en api/.test-tmp/l8e4. No se iniciaron host, login ni nuevas pruebas de autenticación. Sin staging, commit, push, PR, merge o despliegue.
## Respaldo autorizado del desarrollo SQL — preparación de commit (23/10/2026)

El usuario priorizó respaldar los 42 archivos pendientes en feature/arquitectura-persistencia-pai, exclusivamente en origin, sin merge ni despliegue. Revisión de alcance: parámetros/transporte ODBC, siete repositorios, SqlUnitOfWork, selector memory/sql-local, scripts locales, pruebas y continuidad L8-C2–L8-E4. Se comprobaron archivos nuevos/modificados, exclusiones y datos sensibles; las coincidencias de contraseñas pertenecen a fixtures sintéticos de sanitización, no a credenciales reales. Los identificadores Entra documentados son configuración pública previamente aprobada; no se incorporan tokens, claves privadas, identidades personales, rutas privadas o datos institucionales operativos.

Validaciones previas al respaldo: TypeScript API y contratos correctos; fronteras arquitectónicas correctas; 468 pruebas dirigidas SQL/composición/fronteras aprobadas, 0 fallidas; git diff --check correcto. No se ejecutaron integraciones SQL reales, fixtures, escrituras funcionales ni scripts administrativos durante esta revisión. Los logs de validación, .env.local, local.settings.json, .test-tmp, .local-build, .azurite y archivos de base de datos no forman parte del commit.

El respaldo no modifica los pendientes de L8-E4: código 258 del observador e integridad actual sin confirmar; datos padre persistentes todavía no aprobados; política de asignaciones denegatoria sin cambios; vínculo mínimo de identidad de prueba y procedimiento de limpieza administrativa, incluida auditoría sintética, pendientes de autorización. No se habilitan pruebas de escritura duradera por publicar la rama.
