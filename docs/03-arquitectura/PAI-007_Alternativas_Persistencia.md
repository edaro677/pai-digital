# PAI-007 — Alternativas de persistencia e integración Microsoft 365

Versión 0.1 de análisis, 16/10/2026. Rama `feature/analisis-funcional-pai`.

## 1. Punto de partida y decisión abierta

El [inventario técnico](../arquitectura-actual-pai.md), §§1, 5 y 6, identifica React/MSAL y el cliente Graph instalado, pero no persistencia ni autorización de datos implementada. El [acta preliminar](../01-inicio/PAI-001_Acta_Inicio.md), §7, propone Lists y bibliotecas, bajo validación; no equivale a selección definitiva. El [cuestionario respondido](<../../insumos/planeacion/PAI_Digital_Revision_Requisitos_Planeacion cuetionario resuelto..docx>) (Q) acepta con ajustes evidencias, historial e informes, pero no aprueba una tecnología concreta.

Este documento compara alternativas para el [modelo conceptual PAI-005](PAI-005_Modelo_Datos_Conceptual.md). **No selecciona ni provisiona almacenamiento**, no amplía scopes, no crea servicios y no cambia MSAL. La decisión requiere P-13 de [PAI-004](../02-requisitos/PAI-004_Pendientes_Planeacion.md), con participación de Sistemas, seguridad, administración Microsoft 365 y Planeación.

## 2. Necesidades que debe resolver cualquier alternativa

| Necesidad | Evidencia funcional | Prueba de viabilidad propuesta |
|---|---|---|
| Datos relacionados por vigencia/ficha/meta/actividad/periodo | Q §§1–2; RF-001–010 | Consultar y modificar sin relaciones huérfanas; conciliación con dataset aprobado |
| Acceso restringido por asignación real | RF-017–020, Q §4.3 | Gestor de ficha A no lee/escribe B mediante URL o API directa |
| Cierre y corrección autorizada | Q §4.3–4.4; RF-020–022 | No editar un cierre por eludir el frontend; autorización y reapertura trazables |
| Concurrencia y consistencia | Necesidad técnica derivada de reporte/revisión | Rechazar actualización obsoleta y doble decisión; recuperar fallos parciales |
| Versiones e historial reproducible | RF-022 y Q §4.4 | Consultar evidencia y reporte originales junto con su corrección, sin perder observaciones |
| Documentos con metadatos | RF-013/021 | Archivo, versión, permisos, retención y vínculo correcto al reporte |
| Consultas e informes trimestrales | RF-015, 023–024 | Filtros y exportación reproducibles por corte, sin lectura masiva innecesaria |
| Diez años y crecimiento | Q §4.6, horizonte pendiente P-08 | Medir consultas, almacenamiento y operación con volumen simulado y múltiples revisiones |

Las necesidades de concurrencia y separación de servicios son propuestas técnicas; no implican que se haya aprobado un backend específico.

## 3. Alternativas

| Alternativa | Datos estructurados | Evidencias | Ventajas potenciales | Riesgos / condiciones |
|---|---|---|---|---|
| A. React + Graph delegado + Lists/bibliotecas | Listas relacionadas mediante IDs/metadatos | Bibliotecas SharePoint | Menor infraestructura propia; aprovechamiento de Microsoft 365 existente | El usuario conserva los derechos concedidos sobre origen; un filtro React no protege otras fichas ni bloquea edición poscierre. Debe demostrarse autorización efectiva y consistencia antes de elegir |
| B. API de negocio + Lists/bibliotecas | Listas detrás de un servicio de operaciones | Bibliotecas, mediadas cuando sea necesario | Centraliza transiciones, validaciones, cálculo e idempotencia; reutiliza Microsoft 365 | Requiere operar API; las listas no deben quedar como ruta alternativa de escritura irrestricta; fallos entre varios recursos necesitan recuperación y conciliación |
| C. API + base relacional + biblioteca SharePoint | Base relacional administrada, por ejemplo Azure SQL | Bibliotecas SharePoint con IDs de archivo/versión referenciados | Integridad y consultas relacionales adecuadas a modelo y revisiones; control explícito de operaciones | Mayor coste/operación; transacción de base no incluye automáticamente carga documental. Diseñar estados de carga, compensación y retención coordinada |
| D. Dataverse + bibliotecas SharePoint, si procede | Tablas/relaciones y seguridad de Dataverse | Biblioteca o almacenamiento documental a evaluar | Capacidades de datos, roles y auditoría a contrastar con necesidades | Validar licencias, capacidad, integración con React, administración y ciclo de entrega. No exige sustituir React por una interfaz Power Apps; tampoco se asume que ya esté licenciado |
| E. Excel o archivos JSON como almacenamiento principal | Archivos compartidos | Carpetas/bibliotecas | Útiles como formato de intercambio o dataset piloto | No se recomienda como sistema transaccional de reportes, decisiones concurrentes y permisos por ficha; coste elevado de construir controles fiables sobre archivos |

Las ventajas son hipótesis de arquitectura, no resultados de benchmark. A y B difieren en el lugar de las reglas, no solo en la forma de llamar Graph. Si el servicio usa permisos delegados y los usuarios mantienen escritura directa sobre los mismos datos, agregar una API no impide eludirla.

## 4. Consideraciones de SharePoint y Graph verificadas

### Volumen, índices y permisos

SharePoint permite listas de hasta 30 millones de elementos; el umbral de vista/consulta de 5.000 no es la capacidad total de una lista. Deben probarse consultas con índices y filtros selectivos por vigencia, ficha, periodo y estado, además de paginación. [Límites del servicio](https://learn.microsoft.com/en-us/office365/servicedescriptions/sharepoint-online-service-description/sharepoint-online-limits), [Umbral de vista de listas](https://support.microsoft.com/en-us/sharepoint/lists/data-and-lists/list-view-threshold-for-large-lists-and-libraries).

Los permisos únicos tienen límite soportado de 50.000 ámbitos por lista/biblioteca y recomendación general de 5.000. El diseño no debe crear sin evaluación un ámbito de seguridad por cada detalle, comentario o evento. Bibliotecas documentales y adjuntos de lista también tienen capacidades distintas; conviene evaluar bibliotecas para evidencias versionadas, sin fijar aquí límites funcionales de archivo. [Límites de SharePoint](https://learn.microsoft.com/en-us/office365/servicedescriptions/sharepoint-online-service-description/sharepoint-online-limits).

Estos límites son del servicio consultado, no pruebas de capacidad o licenciamiento de FUMC. No se consultó el tenant ni su almacenamiento disponible.

### Permisos de aplicación y operación

Los permisos Selected de Graph permiten acotar aplicaciones a recursos seleccionados; consentimiento y concesión sobre el recurso son pasos diferenciados. No equivalen a una política de negocio por ficha/estado, y no eliminan los permisos que un usuario tenga por otra vía. Su idoneidad depende del flujo delegado/aplicación y del recurso; deben evaluarse, sin concederlos en este trabajo. [Selected permissions](https://learn.microsoft.com/en-us/graph/permissions-selected-overview).

Si se adopta un servicio con identidad de aplicación, las credenciales o identidades de carga de trabajo pertenecen al servicio, nunca a variables `VITE_`. Debe limitarse el recurso y autorizar cada petición entrante con identidad y asignaciones verificadas; un backend con acceso amplio sin controles sería otro riesgo.

### Concurrencia, fallos parciales y carga

Graph admite `If-Match` con eTag al actualizar un elemento de lista; una versión que no coincide devuelve 412 y no actualiza el elemento. Es una base para control optimista, no una transacción entre reporte, decisiones y documentos. [Actualización de listItem](https://learn.microsoft.com/en-us/graph/api/listitem-update?view=graph-rest-1.0).

Una operación de envío/cierre debe probar consistencia si falla la segunda escritura o la carga de evidencia. Diseñar identificador de operación, estados intermedios controlados, reintento idempotente y reconciliación; no considerar un lote de peticiones prueba suficiente de atomicidad de negocio. Graph permite agrupar hasta 20 solicitudes por lote, con resultados individuales. [JSON batching](https://learn.microsoft.com/en-us/graph/json-batching).

Graph puede responder 429 por limitación de solicitudes; su guía indica respetar `Retry-After`. Planificar reintentos controlados y evitar descargar todas las fichas para cada filtro. [Throttling](https://learn.microsoft.com/en-us/graph/throttling).

### Auditoría y alternativas de seguridad

Dataverse ofrece seguridad basada en roles, propiedad y unidades de negocio; su correspondencia con las fichas del PAI exige diseño, no una equivalencia automática con dependencias. [Seguridad de Dataverse](https://learn.microsoft.com/en-us/power-platform/admin/wp-security-cds).

La auditoría de Dataverse debe habilitarse/configurarse y consume capacidad de registros. La política de conservación y las decisiones de negocio deben modelarse aun si se dispone de auditoría técnica. [Auditoría de Dataverse](https://learn.microsoft.com/en-us/power-platform/admin/manage-dataverse-auditing).

Azure SQL dispone de seguridad por fila con predicados de filtrado y bloqueo. Usarla requiere definir políticas y contexto seguro; no aparece por elegir una base relacional. Mantener autorización de operaciones y proteger por igual datos históricos/documentales. [Row-level security](https://learn.microsoft.com/en-us/sql/relational-databases/security/row-level-security?view=azuresqldb-current).

## 5. Dimensionamiento preliminar, no previsión aprobada

El Excel tiene 789 filas candidatas de actividades en 40 fichas visibles, no un catálogo validado para 2027. Solo para estimar un escenario estable de diez vigencias y cuatro trimestres:

| Conjunto | Escenario aritmético | Exclusiones |
|---|---:|---|
| Cabeceras de reporte por ficha/trimestre | 40 × 4 × 10 = 1.600 | Si se aprueba esa granularidad; no incluye reenvíos |
| Detalles por actividad/trimestre | 789 × 4 × 10 = 31.560 | No incluye versiones, observaciones, decisiones ni eventos |
| Mediciones de indicador | Por definir | Cantidad de indicadores y periodicidad pendientes P-02 |
| Archivos y versiones | Por definir | Tipos, tamaños, retención y número de evidencias pendientes P-06/P-15 |

No utilizar estas cifras como conteo oficial de usuarios/actividades o compromiso de capacidad. Revisiones y auditoría pueden multiplicar filas; binarios y versiones pueden dominar el almacenamiento. Las consultas deben probarse por partición funcional, no solo por tamaño del primer año.

## 6. Mapeo posible si se selecciona Lists y bibliotecas

Propuesta sujeta a prueba: catálogos de vigencias/unidades/estructura; conjuntos de fichas/metas/actividades y programación; reportes/versiones/detalles; mediciones independientes; decisiones/observaciones/solicitudes; catálogo de asignaciones e historial. No es necesario ni conveniente definir ahora una lista por cada entidad conceptual sin probar relaciones, consultas y permisos.

Las evidencias podrían almacenarse en bibliotecas con metadatos de vigencia, ficha, meta/actividad, periodo, reporte y versión; los vínculos usarían identificadores estables del repositorio y versión revisada. No usar solo nombres de archivo o una URL compartida como identidad. El detalle de retención, versiones y descargas requiere pruebas y aprobación institucional.

Las escrituras de estructura, reportes cerrados, aprobaciones e historial deben evaluarse especialmente: si el origen no puede imponer las reglas necesarias con acceso directo, seleccionar un servicio de negocio o una alternativa que sí las imponga. No resolverlo únicamente ocultando listas o controles.

## 7. Prueba de concepto y criterio de selección

Propuesta de evaluación; no se ejecutó ni autoriza crear recursos externos:

1. Aprobar permisos y estados mínimos (P-03/P-04/P-17), entidades (PAI-005), volumen y retención.
2. Usar datos sintéticos; probar al menos dos gestores con fichas distintas, un validador, un usuario con doble función y un receptor.
3. Intentar acceso por API/URL directa, consulta cruzada, cambio de identificador, edición poscierre y autoaprobación; documentar controles efectivos del origen/servicio.
4. Ejecutar edición concurrente, doble envío, fallo entre escrituras, archivo sin metadatos, metadatos sin archivo y recuperación sin duplicados.
5. Consultar/exportar volúmenes multivigencia mayores que el piloto; medir latencia, paginación, límites de consulta, reintentos y coste operativo con objetivos acordados, sin inventar umbrales.
6. Reconstruir un corte emitido después de cambiar programación y evidencia. Verificar que el historial técnico no sustituye el registro de decisiones funcionales.
7. Revisar licencias, responsabilidades, copia/recuperación, retención, monitorización y coste total. Registrar una decisión arquitectónica comparada con evidencias.

Recomendación condicionada: mantener bibliotecas SharePoint como candidata documental y comparar B/C/D para datos y reglas; A solo si demuestra autorización y cierre efectivos sin rutas alternativas. No hay base suficiente para declarar Lists solución definitiva ni para descartarla solo por superar 5.000 registros.

Documentación Microsoft consultada el 16/10/2026. Los enlaces sustentan capacidades generales; las ventajas, riesgos y recomendación son inferencias para este proyecto. No se verificaron contratos, licencias o configuración del tenant.
