# F2 / L7-B2 — Representaciones acotadas para persistencia relacional

**Fecha:** 20/10/2026. **Estado:** implementada, pendiente de revisión y commit.
**Base verificada:** `2543c0a`, rama `feature/arquitectura-persistencia-pai`.

Esta etapa adopta la alternativa B por autorización expresa: futuras tablas, PK/FK,
UNIQUE y transacciones SQL convencionales. Solo implementa representaciones y regresión.
No hay adaptador SQL, conexiones, bases, migraciones, nuevas dependencias ni despliegue.

## Decisión y antecedentes

L7-A y L7-B1 estudiaron conservar todo el dominio previo mediante valores binarios,
digest y registro auxiliar. La revisión posterior priorizó simplicidad y mantenimiento.
Se descartan TokenValues, IDs en varbinary(max) y bloqueos especiales basados en digest;
nunca estuvieron implementados. Se conserva SHA-256 para la huella idempotente L6-B.
Los informes y entradas anteriores describen sus cortes históricos; no son la decisión
vigente cuando contradicen esta autorización L7-B2.

## Representaciones implementadas

| Constructor | Regla nueva | Unidad |
|---|---|---|
| entityId: user, dependency, ficha, assignment, activity, report, audit-event, idempotency-record | 1–64; primer alfanumérico, resto alfanumérico/punto/guion/guion bajo | ASCII |
| entityId: tenant, directory-object | GUID de 36, minúsculo, con guiones y distinto de cero; no normaliza | ASCII |
| periodKey | 1–128, sin espacios extremos ni controles anteriores y Unicode bien formado | Unidades UTF-16 |
| idempotencyKey | 1–128; primer alfanumérico; resto alfanumérico, punto, guion, guion bajo o dos puntos | ASCII |
| correlationId | 1–64; mismo alfabeto técnico que idempotencyKey | ASCII |
| requestFingerprint | Exactamente 64 hexadecimales minúsculos | ASCII |
| version | 1–128, exclusivamente ASCII visible U+0021–U+007E; sigue opaca | ASCII |
| utcInstant | ISO UTC canónico con milisegundos, años 0001–9999 | Cadena canónica de 24 caracteres |
| decimalText | Gramática y representación anteriores intactas; sin escala, redondeo ni máximo nuevo | Texto exacto |

Se mantienen marcas nominales y firmas públicas, estados, capacidades y errores existentes.
No se añaden códigos institucionales ni límites de calendario o vigencia funcional.
El constructor de PeriodKey comprueba pares sustitutos sin normalizar Unicode ni contar
grafemas. Los constructores no convierten GUID a minúsculas: rechazan valores no canónicos.
L4-A ya normaliza la identidad validada; no cambia criptografía, claims, MSAL o configuración.
Los IDs generados por L6-B siguen siendo UUID. No se exige UUID a todos los IDs internos.
Version no exige el futuro codec SQL ni UUID: memoria conserva su generador existente.

## Cambios incompatibles frente a L2 anterior

Antes los tokens generales no tenían máximo declarado, no exigían alfabetos específicos
y tenant/objeto podían ser textos de laboratorio. Ahora fallan con InvalidValueError si
incumplen la tabla. UtcInstant ya no admite año 0000 ni años extendidos.
No se trunca, redondea o normaliza silenciosamente. DecimalText no cambia.
Las rutas de ficha, actividades y reportes pasan de un máximo de 128 a 64 para sus IDs.
Se preservan límites de cuerpo 16 KiB, narración 4000 y periodo/decimal/versión 128 en HTTP.
Un decimal mayor de 128 sigue siendo válido en dominio, pero no en ese transporte.

## Memoria y seguridad

La preparación de semillas valida IDs, relaciones tipadas, versiones, periodos, cantidades
y fechas presentes en las seis entidades precargables. No carga datos automáticamente.
Las escrituras validan representaciones dentro de MemorySession.invoke: reporte nuevo y
actualizado, habilitación con versión esperada, eventos y snapshots, reserva y resultado
idempotente. Esto incluye entradas JavaScript que eluden las marcas TypeScript.
Las validaciones no introducen reglas de negocio ni un validador general de objetos
arbitrarios; los contratos tipados y las comprobaciones anteriores siguen aplicándose.

Un error capturado por el callback también impide commit; se conservan copia privada,
rollback, versiones optimistas, copias defensivas, cola por instancia y contextos vencidos.
Se mantienen identidad L4-A, autorización L4-B en la transacción, denegación por defecto,
404 uniforme y errores genéricos. Autenticar precede la validación de ID/cuerpo HTTP.
Replay revalida acceso y conserva el resultado histórico, sin duplicar eventos.

## Validación ejecutada

- `npm test --prefix api`: 248 aprobadas, 0 fallidas, 0 omitidas.
- Diferencia frente a L6-B: 214 existentes conservadas + 34 nuevas.
- 28 nuevas en representations.test.mjs: IDs (8), GUID (2), periodo (1), clave/correlación
  (2), versión/huella/UTC/decimal (4), semillas (1), auditoría de habilitación (2) y
  rollback por ocho operaciones inválidas (8).
- 6 nuevas HTTP: ficha/actividades (2), GET/POST/PATCH de reportes (3), periodo/replay (1).
- El pretest ejecuta build API, guard arquitectónico, contratos TypeScript sin emisión
  y compilación TypeScript del paquete. Todos aprobaron.
- `npm run build` en raíz: correcto; persiste aviso previo de bundle mayor de 500 kB.
- Las pruebas HTTP usan HttpRequest y JWT sintéticos firmados en proceso. No se arrancó
  Functions/Azurite ni se hicieron peticiones sobre sockets en esta etapa.
- No se eliminan casos históricos; solo cambian los fixtures incompatibles de tenant,
  objeto, huella y las búsquedas de GUID inexistente.

## Límites y siguiente paso

La memoria sigue siendo efímera y por instancia; no acredita durabilidad ni concurrencia
SQL entre conexiones. La política temporal del host sigue bloqueada, sin fixtures ni Entra
real. Roles, aprobaciones, devolución, cierre, reapertura y retención siguen pendientes.

El esquema SQL y su codec rowversion son futuros, no implementados. Preparar migraciones,
instalar controlador, crear una base o iniciar un contenedor requiere autorización posterior.
La regresión integral L1–L6-B se conserva como aceptación de esos incrementos.
No se realiza commit, push, PR, merge ni despliegue por este cierre.
