# PAI-004 — Decisiones y conciliaciones pendientes de Planeación

Versión 0.1 para revisión, 16/10/2026. Rama `feature/analisis-funcional-pai`.

## 1. Contexto y fuentes

El [cuestionario respondido](<../../insumos/planeacion/PAI_Digital_Revision_Requisitos_Planeacion cuetionario resuelto..docx>) (Q), revisado el 15/10/2026, registra «Aprobado con ajustes». No está totalmente pendiente ni totalmente aprobado sin restricciones. Sus respuestas ya aportan reglas; este registro separa lo respondido de lo que aún falta precisar.

Se contrastó con el [Excel V1 (6)](<../../insumos/planeacion/01. Plan de Acción 2026 Consolidado V1 (6).xlsx>) (X), el [inventario técnico](../arquitectura-actual-pai.md) (A) y los prototipos HTML. Q §5 acepta revisar inconsistencias durante el piloto; el piloto no autoriza cargar datos inconsistentes como si fueran oficiales.

Prioridad: **B** = bloquea la capacidad asociada, no todo el proyecto; **D** = se puede especificar en paralelo, pero debe cerrarse antes de su entrega. Los responsables indicados son propuestos, no asignaciones ya aceptadas. Todas las decisiones siguen abiertas; no se fijan plazos no acordados.

## 2. Registro de decisiones

| ID / prioridad | Lo respondido y evidencia | Pregunta concreta / entregable de decisión | Responsable propuesto | Bloquea o condiciona |
|---|---|---|---|---|
| P-01 / B | Q §4.1 exige pesos 100 % y §4.2 remite al consolidado. X `Consolidado!W2:AA2`, `AD2`; variantes `FCS02!Y9`, `BB19!Y9` | Aprobar fórmula trimestral, anual y agregación de meta/dependencia/línea/institución; decidir blancos, ceros, negativos, exceso, periodos futuros, arrastre, peso 0, tolerancia y bloqueo. Entregar casos CAL de PAI-003 con resultados esperados | Planeación con Sistemas | RF-005, 006, 010, 015, 023 |
| P-02 / B | Q §4.7 separa actividad e indicador. G varía en 109 grupos meta/ficha; `GTI05!G8:G9` | ¿Una meta tiene uno o varios indicadores? ¿Cuáles G son indicadores de actividad? Definir ficha por indicador: unidad, objetivo, línea base, fórmula, sentido, periodicidad y responsable de medición | Planeación | RF-004, 009, 010, 023; migración de G |
| P-03 / B | Q §§1, 3 D, 4.3: Planeación valida evidencia; vicerrectores reciben informes y tienen doble rol | Confirmar aprobador/devolutor final, separación entre administración y validación, visibilidad de borradores, alcance del validador y si una persona puede aprobar su propio PAI. Aprobar matriz de PAI-005 | Planeación y autoridad funcional competente | RF-017, 019–022; autorización |
| P-04 / B | Q §§4.3–4.4: solo Planeación reabre; vicerrector puede autorizar ajustes tras cierre | ¿Se cierra reporte, ficha, trimestre o vigencia? ¿Quién cierra? Precisar solicitud, autorización del vicerrector, apertura por Planeación, plazo y campos editables; diferenciar ajuste en siguiente periodo del ajuste retroactivo | Planeación y vicerrector competente | RF-014, 020–022; informe poscierre |
| P-05 / B | Q §1 pide editar/eliminar filas; §3 A exige solicitud aprobada; §4.5 no permite modificar metas iniciada la vigencia | Definir congelación y excepciones materiales, alta/baja de metas, modificaciones permitidas de actividad/peso/programación, quién aprueba solicitud y cómo afectan reportes/cortes existentes | Planeación | RF-001–006, 017, 022 |
| P-06 / B | Q §4.4 liga evidencia a formulación, pero no enumera campos obligatorios | Aprobar formulario mínimo por etapa, obligatoriedad de cantidad/narración/dificultad/producto/evidencia; archivo frente a enlace, tipos, tamaño y criterios de validación. Definir cuándo falta evidencia | Planeación con gestión documental y Sistemas | RF-007, 009, 011–014, 021 |
| P-07 / B | Q §4.6 responde años, no catálogo inicial; `Resumen!A15`, `A21`, `A48`; `GTI05!AF8` | Entregar catálogo oficial 2027 de líneas, iniciativas, compromisos, dependencias, sedes y programas; tabla de equivalencias de códigos. Resolver `FoSC010` sin ficha homónima, `AE16/ADM16`, `INFR07/INF07`, `CTI05/GTI05`, `NDSP014/NDSP14` | Planeación | RF-001–004, 016, 019; claves de importación |
| P-08 / B | Q §4.6: «2027 en adelante. Por los 10 años siguientes» | ¿Diez vigencias 2027–2036, o 2027 más diez siguientes hasta 2037? Definir plan plurianual, apertura anual y disponibilidad histórica; no inferir del PDI mencionado en textos | Planeación | RF-026; catálogo de vigencias |
| P-09 / D | RF-026 condiciona la importación a aprobación; Q §5 aporta Excel actualizado 2026 | ¿2026 se usa solo como referencia/piloto o se migra como histórico? Definir archivo maestro, fecha, alcance y responsables de validación; Q cita versión `(2)(1)` no comparada con `(6)` | Planeación | Carga histórica y RF-026 |
| P-10 / B | Q §§1, 3 C pide dashboard enlazado; grupo C requiere ajustes | Aprobar pantallas, filtros por componente/sede/programa, indicadores, visibilidad, definición de sin reporte/retraso, semáforos y umbrales. Facilitar especificación o evidencia del dashboard externo | Planeación y receptores de informes | RF-015, 016, 023 |
| P-11 / D | RF-025 aceptado por grupo sin detalle | Definir eventos, calendario de cierre, zona horaria, canal, destinatarios, sustituciones, reintentos y control de duplicados; decidir si se usará Power Automate | Planeación con Sistemas | RF-025 |
| P-12 / D | Q §4.8 pide Excel trimestral y consulta posterior; §4.4 pide informe poscierre | Aprobar esquema de exportación, presentación, corte inicial/corregido, versiones, permisos de descarga y campos del informe poscierre. ¿Se conserva archivo emitido o se regenera? | Planeación y receptores | RF-022, 024; trazabilidad de cifras |
| P-13 / B | Acta propone SharePoint; A no identifica persistencia implementada | Elegir alternativa PAI-007 mediante prueba de seguridad/concurrencia/volumen; verificar licencias, retención y administración. Aprobar permisos de datos mínimos antes de cualquier cambio en Entra/Graph | Sistemas, seguridad y Planeación; administración Microsoft 365 | Toda escritura/lectura persistente |
| P-14 / B | X tiene pesos 0.50/1.20, referencias rotas y 4 filas sin consolidar | Confirmar/corregir cada hallazgo de PAI-006 en una copia controlada por Planeación. Entregar dataset y fórmulas de referencia con criterio de conciliación; no basta aceptar los resultados actuales | Planeación con apoyo de Sistemas | Homologación de fórmulas y migración oficial |
| P-15 / B | Q pide eliminar filas y conservar historial; no define retención | Decidir baja lógica, retención de versiones/evidencias/decisiones, derecho de eliminación y recuperación; quién puede ver el historial y por cuánto tiempo. No habilitar borrado destructivo por defecto | Planeación, gestión documental y seguridad | RF-017, 021, 022, 026 |
| P-16 / B | Q §1 dice creación de usuario/perfiles; A §5 ya tiene Entra | ¿Administrar asignación de usuarios existentes o crear identidades? Precisar altas, bajas, sustituciones y soporte. No añadir capacidades de administración del directorio sin decisión específica | Planeación y administrador Entra | EXT-02 y RF-018–019 |
| P-17 / B | Q §1 habilita ficha; §4.3 refiere dependencia/sede/programa y vicerrector gestor/receptor | ¿Uno o varios responsables por ficha? ¿Varias fichas por dependencia? ¿Delegación temporal o cogestión? Definir alcance por rol/ficha/vigencia y conservación de asignaciones históricas | Planeación | Modelo de ficha, asignaciones y RF-019 |
| P-18 / B | X `Consolidado!AB102=2025`, `AB47=2027`, `AB304=2035`; fechas AC varían | Determinar vigencia/corte oficial; no deducirlos de valores dispersos o del nombre del archivo. Precisar si medición es del trimestre, acumulada o anual, y si se recalculan cortes anteriores | Planeación | RF-006, 010, 015, 023, 024, 026 |
| P-19 / D | Q §1 requiere carga Excel y alta individual; no define plantilla | Aprobar formato de importación, validaciones, vista previa, quién autoriza aplicación, tratamiento de errores, repetición idempotente y conflictos con datos ya reportados | Planeación con Sistemas | EXT-01 y RF-001–008, 017 |
| P-20 / B | Q admite enteros/decimales, pero §4.7 no define tipos sí/no, monetarios o porcentuales | Definir unidades, escala 0–1/0–100, precisión/redondeo, rango, valores negativos y significado de nulo/cero/no aplica. Aclarar sumabilidad de cantidades e indicador | Planeación | Formularios, cálculos y diccionario |

## 3. Hallazgos que no deben confundirse con duplicados a eliminar

Las 789 filas con código de meta no representan 789 metas. Se detectaron 568 grupos `(hoja de ficha, código literal de meta)`; es un recuento técnico, no un catálogo depurado. Varias actividades comparten meta legítimamente. Las repeticiones de `CC11!F12/F15` y `F13/F14` pueden responder a programaciones diferentes; no se debe fusionarlas por texto. Cinco grupos tienen descripciones E diferentes tras normalizar espacios/mayúsculas (algunas diferencias son puntuación) y 109 tienen textos G distintos. Planeación debe resolver semántica antes de convertir filas en entidades.

## 4. Evidencia externa y documentos no disponibles

Q §1 remite a [Dashboard PAI 2026 — Seguimiento T3](https://katherinecastrillon.github.io/Seguimiento-PAI-2026/). El enlace no fue accesible mediante la herramienta de navegación durante la revisión previa; no se presume validado su contenido ni se convierte en definición suficiente de RF-015/023. P-10 solicita evidencia revisable.

La matriz PAI-002A y el Excel `(2)(1)` citados al final de Q no están entre los archivos inventariados para este trabajo. No se afirma haberlos comparado. Los prototipos internos usan datos simulados y no resuelven estos pendientes.

## 5. Cómo registrar el cierre de cada pendiente

Propuesta: registrar ID, fecha, decisor competente, respuesta, evidencia/versiones, RF/RN afectados, casos esperados y aprobaciones necesarias. Una respuesta parcial conserva el estado abierto para lo restante. Todo cambio de regla debe actualizar PAI-002, PAI-003, PAI-005/006 y las pruebas dependientes, sin reemplazar el original institucional ni su historial.

Puede avanzarse en extracción de componentes, contratos y diseño de formularios mientras se resuelven decisiones independientes. No debe publicarse cálculo oficial, migración definitiva ni autorización de datos apoyándose en una suposición pendiente.
