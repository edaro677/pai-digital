# PAI Digital — Documento maestro de continuidad técnica

**Corte:** 19 de octubre de 2026

**Organización:** Fundación Universitaria María Cano (FUMC)

**Proyecto:** PAI Digital

**Estado:** F2 en ejecución; L1–L4-B completadas y registradas en Git; L5 — Consultas HTTP autenticadas **completada en su alcance técnico local, pendiente de commit**. L6 es la siguiente etapa, todavía no iniciada.

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
- Último commit confirmado mediante Git: `a251e2a` — `docs(api): actualiza estado de L4-B y prepara L5`. El commit de implementación L4-B sigue siendo `8914e94`; L5 no tiene commit.
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
| L5 — Consultas HTTP autenticadas | **Completada en alcance técnico local; pendiente de commit** | — | Dos GET; 182 pruebas automatizadas aprobadas; host Functions/Azurite y nueve peticiones HTTP reales validados; sin commit L5 |
| L6 — Escrituras HTTP | Siguiente etapa; no iniciada | — | Requiere alcance y autorización independiente |
| L7 regresión integral | Pendiente | — | — |

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

## 6. Cierre local de L5 y siguiente etapa L6

**Estado:** L5 completada en su alcance técnico local por instrucción expresa del usuario,
partiendo de `a251e2a`; pendiente de commit, sin identificador propio. L4-B permanece
completada en `8914e94`. L6 — Escrituras HTTP es la siguiente etapa y no se ha iniciado.

Se implementan GET `/api/poc/fichas/{fichaId}` y `/api/poc/fichas/{fichaId}/actividades`,
con capacidad exacta poc:read, autorización/lectura en una misma transacción y DTO mínimos.
Se usa 404 idéntico para ficha inexistente/no visible. La identidad proviene del JWT L4-A,
nunca del cuerpo, query o encabezados de suplantación. No hay escrituras HTTP ni lista global.

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

**Corte actual tras validación operativa:** L5 completada en alcance técnico local, pendiente
de commit. HEAD continúa en `a251e2a`; se conservan sus cambios sin registrar. Próxima
etapa L6, todavía no iniciada. Esperar revisión y autorización antes de commit o nuevas etapas.

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

### Registro L5 — Implementación y cierre técnico local, pendiente de commit

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
