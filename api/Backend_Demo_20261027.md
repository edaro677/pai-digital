# Paso 276 — Demostración funcional del backend PAI

Preparada y ejecutada el 26/10/2026 para la presentación del 27/10/2026.
Datos sintéticos, persistencia en memoria y dobles de identidad ya existentes.
No requiere navegador, Core Tools, SQL Server, object ID institucional ni contraseña.

## Comando único

Desde `D:\PAI\pai-digital-react`, con Node.js 24 y las dependencias existentes:

```powershell
npm --prefix api run demo:backend
```

El comando verifica fronteras y contratos, compila TypeScript y ejecuta
`scripts/demo-backend.mjs`. Resultado esperado: ExitCode 0, `status: OK`,
`mode: memory-only`, 16 respuestas de controladores HTTP y nueve comprobaciones
funcionales. Cada ejecución empieza con una memoria nueva; no deja registros
persistentes, tokens, servidor ni procesos de demostración activos.

El ejecutor bloquea la carga del controlador nativo y las solicitudes externas.
Debe mostrar `nativeDriverLoads: 0` y `externalNetworkRequests: 0`. Aunque el
operador tenga sql-local en su entorno, esta herramienta está definida
exclusivamente como demo en memoria; no cambia el selector de la aplicación.

## Recorrido y resultados comprobados

| Paso | Operación | Resultado esperado |
|---|---|---|
| 1 | GET fichas sin Bearer / con Bearer inválido | 401 / 401 |
| 2 | GET fichas del actor sintético ALFA | 200; solo ALFA |
| 3 | GET detalle de ALFA | 200; dependencia, ciclo y versión |
| 4 | GET ficha BETA no autorizada / inexistente | 404 / 404 con el mismo cuerpo |
| 5 | GET actividades de ALFA | 200; dos actividades de esa ficha |
| 6 | GET reportes del periodo antes de crear | 200; lista vacía |
| 7 | GET reportes de BETA con identidad ALFA | 404 |
| 8 | Precondición de envío programado sin referencias de evidencia | INVALID_VALUE, sin escrituras; solo dominio |
| 9 | Misma precondición con una referencia sintética | Aceptada; no valida un archivo ni ejecuta envío |
| 10 | POST de borrador sin periodo obligatorio | 400 |
| 11 | POST de avance válido en borrador | 201 |
| 12 | Repetir el POST con la misma clave y contenido | 201; mismo ID y versión originales |
| 13 | Reutilizar la clave con contenido diferente | 409 |
| 14 | GET reportes del periodo después de crear | 200; un solo reporte |
| 15 | GET reporte por ID | 200; mismos valores, Unicode y decimal exacto |
| 16 | GET del reporte con identidad BETA | 404 |
| 17 | Inspección directa de auditoría e idempotencia | Un evento de creación, una reserva completada y snapshot histórico coincidente |

La salida separa las 16 respuestas HTTP de las comprobaciones de contenido,
precondiciones de dominio e inspección directa. Los contadores finales deben ser:

```json
{"reports":1,"audit":1,"reservations":1,"completions":1}
```

Esto verifica que la repetición idempotente no vuelve a invocar creación de
reporte, append de auditoría ni reserva/finalización. También se comprueban los
registros resultantes en memoria, el actor de auditoría, before=null y el snapshot
completo, no solamente los códigos HTTP.

## Endpoints ejercitados

Todos se invocan mediante `HttpRequest` sobre los controladores existentes,
compuestos con los servicios reales y MemoryUnitOfWork:

- GET `/api/poc/fichas`
- GET `/api/poc/fichas/{fichaId}`
- GET `/api/poc/fichas/{fichaId}/actividades`
- GET `/api/poc/fichas/{fichaId}/reportes?period=2026-Q4`
- GET `/api/poc/reportes/{reportId}`
- POST `/api/poc/actividades/{activityId}/reportes` — únicamente memoria

No se crea un router o servicio alternativo. Las pruebas de registro Functions
comprueban adicionalmente que las rutas reales conservan sus métodos y handlers.

## Niveles de evidencia para la presentación

| Nivel | Evidencia | Alcance |
|---|---|---|
| HTTP real con autenticación institucional | Antecedente L8-E3, no reejecutado en Paso 276 | JWT institucional validado, health 200, rechazo 401 y lecturas 404 sobre recursos ausentes. No demuestra acceso positivo a fixtures ni escritura duradera. |
| Controladores HTTP con dobles, en proceso | Ejecutado por esta demo y pruebas dirigidas | HttpRequest y respuestas de los handlers reales; sin servidor, sockets ni sesión institucional real. |
| Dominio / repositorios invocados directamente | Ejecutado por esta demo | Precondición de evidencia y lectura de auditoría/idempotencia en MemoryUnitOfWork. No son endpoints HTTP. |

La identidad de laboratorio utiliza el validador original, JWT firmado con claves
efímeras, metadata/JWKS de prueba y reloj controlado. La política de vigencia es un
doble exclusivo del arnés. No se modifica el validador Entra, la política
institucional predeterminada de denegación ni la excepción local L8-E4.

Repetir HTTP institucional requiere un host autorizado y un access token real
vigente obtenido interactivamente. Esa dependencia se registra y no bloquea este
recorrido automatizado. No se solicita una nueva captura ni se inicia el host.

## Ejemplos sintéticos

Ficha visible: `synthetic-ficha-alpha`, dependencia `DEP-ALFA`, ciclo
`Ciclo sintético 2026`. La ficha `synthetic-ficha-beta` no se expone a ALFA.
Actividad: `synthetic-activity-alpha-1`, descripción `Actividad sintética alpha-1`.

Comando de registro de borrador, con `Idempotency-Key: demo:advance:276`:

```json
{
  "period": "2026-Q4",
  "quantity": "9007199254740993.000100",
  "narrative": "Avance sintético trimestral: á 😀 漢字"
}
```

Reporte generado por el arnés: `demo-report-2`, actividad anterior, estado técnico
`poc-draft` y fecha del reloj de laboratorio `2026-10-27T13:00:00.000Z`.
La cantidad es texto exacto ficticio; no es un dato financiero institucional.
Las versiones opacas se verifican internamente y se omiten del ejemplo de reporte
para mantener estable la salida entre ejecuciones.

## Validaciones reproducibles

El comando único ya incluye TypeScript, contratos y fronteras. Pruebas dirigidas:

```powershell
node --test api/tests/backend-demo.test.mjs api/tests/http-fichas.test.mjs api/tests/http-reportes.test.mjs api/tests/authorization.test.mjs api/tests/identity.test.mjs api/tests/planning.test.mjs api/tests/functions-registration.test.mjs
```

Resultado del Paso 276: 184 pruebas aprobadas, cero fallidas. Incluyen aislamiento
entre ejecuciones, no exposición de tokens/claves, ausencia de controlador SQL y
red externa, autorización, validación de reportes e idempotencia. La prueba DEMO
anterior se reutilizó en el helper común; no se duplicaron servicios o contratos.

## Limitaciones y siguiente implementación

- La escritura SQL duradera desde HTTP continúa pendiente de L8-E4. Este paso no
  ejecuta SQL ni retoma sus diagnósticos.
- El POST de creación conserva su contrato de borradores. El Paso 277 añade
  asociación de referencias y envío condicionado en memoria (ver abajo); no
  implementa carga de archivos ni habilita un envío institucional real.
- Los siete nombres de estados están definidos, pero no su máquina de
  transiciones institucionales. No existe una etapa independiente de aprobación.
- Cierres trimestrales configurables, validación por actividad/meta, responsables
  y reglas de medición todavía requieren contratos y decisiones funcionales.
  El periodo sigue siendo una clave opaca; 2026-Q4 es el ejemplo del arnés.
- No se demuestra concurrencia entre conexiones, persistencia tras reinicio,
  despliegue ni funcionamiento institucional completo mediante esta demo.

Siguiente implementación recomendada: conectar un verificador institucional de
archivos y una política completa de periodo, actividad y metas a los puertos del
Paso 277. La demostración del Paso 276 no ejercita ese nuevo flujo.

## Paso 277 — Referencias de evidencia y envío condicionado

Implementado y probado exclusivamente en memoria, con identidad y dependencias
confiables de laboratorio. No se ejecutó SQL, HTTP sobre un host real ni Entra
interactivo en este paso. El validador institucional permanece intacto.

| Ruta | Operación y requisitos |
|---|---|
| POST `/api/poc/reportes/{reportId}/evidencias` | Declarar referencia, con autorización de edición, versión vigente e Idempotency-Key. Responde 201. |
| GET `/api/poc/reportes/{reportId}/evidencias` | Listar declaraciones con autorización de lectura. Responde 200. |
| POST `/api/poc/reportes/{reportId}/enviar` | Envío condicionado a reglas completas y verificación confiable. Responde 200 al completarse; 409 si faltan precondiciones. |
| GET `/api/poc/reportes/{reportId}/envio` | Consultar el snapshot institucional Enviado; null antes del envío. Requiere autorización de lectura. |

Los cuatro controladores exigen JWT validado; no aceptan identidad, estado de
verificación ni permisos aportados por el cliente. La falta de acceso se presenta
como 404 y las credenciales ausentes o inválidas como 401. Todas las rutas previas
conservan sus contratos. La excepción local L8-E4 deniega las cuatro rutas nuevas.

Ejemplo sintético del cuerpo de asociación (usar la versión vigente, no este
literal de ejemplo, y una clave Idempotency-Key exclusiva):

```json
{
  "period": "2026-Q4",
  "expectedVersion": "version-vigente",
  "evidence": {
    "id": "synthetic-evidence-277",
    "target": {"kind": "activity", "activityId": "synthetic-activity-alpha-1"},
    "storageReference": "synthetic-object-277",
    "name": "Avance sintético.pdf",
    "mediaType": "application/pdf",
    "sizeBytes": 123
  }
}
```

Para una meta, target contiene kind=goal, activityId y goalId; su pertenencia debe
constar en la política confiable. La referencia es un identificador opaco, no una
URL, ruta local, credencial ni prueba de existencia. Nombre Unicode, tipo MIME y
tamaño son metadatos declarados. No se almacena ningún archivo.

El cuerpo de envío contiene únicamente period y expectedVersion; la clave de
idempotencia sigue en la cabecera. Una declaración permanece **declared**.
Solo EvidenceVerifier puede certificar **verified** con versión inmutable, SHA-256,
tipo/tamaño, instante y permiso del actor para usar el objeto en ese reporte.
Únicamente después de todas las comprobaciones se conserva el snapshot
**valid-for-submission**. La prueba describe el objeto verificado en ese instante;
no garantiza su retención futura en un almacenamiento aún no implementado.

SubmissionPolicy debe suministrar reglas completas: periodo aprobado, actor
permitido, estado Abierto, actividad y metas aplicables, obligatoriedad y frescura
de verificación. No se interpreta automáticamente poc-draft como Abierto.
Se valida cada evidencia adjunta, incluyendo las opcionales. No hay política ni
verificador reales instalados: el envío permanece bloqueado por defecto y no
existe una variable de entorno que los habilite.

La verificación externa de archivos ocurre fuera de la transacción. Antes de
escribir se revalidan autorización, versión, inventario, política y frescura de
las pruebas. El envío, actualización de versión, auditoría y finalización de
idempotencia se confirman juntos en MemoryUnitOfWork o se revierten juntos.
El replay devuelve el snapshot histórico, no una reconstrucción posterior.
Después del envío se rechazan nuevas asociaciones y modificaciones del borrador.

El esquema 0001_initial no contiene evidencias/metas, estados institucionales ni
los nuevos eventos/operaciones. Se conserva sin cambios: TransactionContext
expone una capacidad progress opcional, implementada solo en memoria. El registro
Enviado es un snapshot separado consultable en /envio; Report.state conserva su
estado técnico PoC. En el Paso 277 SQL rechazaba las nuevas variantes. El Paso 278
prepara SqlProgressRepository y una opción explícita de SqlUnitOfWork para el
esquema 0002: siguen desactivados en HTTP y la migración no se ejecutó.
No existe fallback a memoria.

Validación reproducible sin SQL:

```powershell
npm --prefix api run build
node --test api/tests/report-progress.test.mjs
```

Resultado: 47 pruebas dirigidas aprobadas; suite API ordinaria 890/890, TypeScript,
contratos y fronteras correctos. Incluye actividad/meta, Unicode, estados/periodos,
autorización, evidencia ausente/no verificada, expiración de prueba, concurrencia,
idempotencia histórica, sanitización y rollback ante fallos de auditoría o
finalización. Los positivos usan dobles de política y almacenamiento, no archivos
institucionales. Pendientes: proveedor confiable, catálogo/reglas institucionales
y diseño aprobado de persistencia SQL; no se implementan devoluciones, revisión,
socialización, reaperturas ni cierres trimestrales.
