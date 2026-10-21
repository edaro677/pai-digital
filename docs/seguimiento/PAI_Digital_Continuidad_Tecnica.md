# PAI Digital — Documento maestro de continuidad técnica

**Corte:** 21 de octubre de 2026

**Organización:** Fundación Universitaria María Cano (FUMC)

**Proyecto:** PAI Digital

**Estado:** F2 en ejecución. L8-B registrada en `90e160eaa3dcfe0104c402bb00e5558b614ecb8e`. L8-C1 y auditoría R1 implementan codecs y sesión transaccional con transporte inyectable, aislados de HTTP y probados con dobles; correcciones auditadas, 348 pruebas aprobadas y commit de cierre autorizado. HTTP conserva memoria; no existe adaptador SQL funcional ni autorización productiva. La intermitencia SQL previa continúa sin causa confirmada.

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
| L8-C1/R1 — Codecs y sesión SQL aislada | Auditada y corregida; commit de cierre autorizado | Ver informe Git de cierre | 348 pruebas aprobadas; dobles de transporte; sin SQL real ni repositorios funcionales |
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

**Estado:** L5 completada en su alcance técnico local por instrucción expresa del usuario,
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
