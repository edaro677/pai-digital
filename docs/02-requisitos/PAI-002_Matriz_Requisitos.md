# PAI-002 — Matriz de requisitos funcionales

Versión 0.1 para revisión, 16 de octubre de 2026. Rama: `feature/analisis-funcional-pai`.

## 1. Fuentes y criterio de interpretación

- **Q:** [Cuestionario respondido por Planeación](<../../insumos/planeacion/PAI_Digital_Revision_Requisitos_Planeacion cuetionario resuelto..docx>), «Revisión de funcionalidades y reglas del Plan de Acción Institucional», versión 0.1 del 13/10/2026; registro de revisión §7 del **15/10/2026**. Las referencias Q §4.1 a §4.8 corresponden al número de pregunta, no a páginas variables de Word.
- **X:** [Excel institucional V1 (6)](<../../insumos/planeacion/01. Plan de Acción 2026 Consolidado V1 (6).xlsx>). Hojas/celdas se documentan en [PAI-006](../03-arquitectura/PAI-006_Diccionario_Excel.md).
- **A:** [Arquitectura actual](../arquitectura-actual-pai.md), especialmente §§4–7: los seis módulos son vistas, salvo navegación, acceso MSAL y protección de presentación.
- **P:** [Ciclo completo](../../referencias/PAI_ciclo_completo.html) y [Validación de avances](../../referencias/PAI_validacion_avances.html): referencias visuales, no fuentes de reglas aprobadas. [Acta de inicio](../01-inicio/PAI-001_Acta_Inicio.md): borrador preliminar, no aprobación del almacenamiento.

El registro general dice **«Aprobado con ajustes»**. Q §3 marca los grupos A, B, D y E como «De acuerdo» y C como «Requiere ajustes». No hay una aprobación individual incondicional para cada RF. Esta matriz hereda el estado del grupo y explicita sus condiciones. Una casilla no elimina las restricciones de las respuestas posteriores; las contradicciones deben resolverse con Planeación.

Estados: **AC** = aceptado en su grupo, condicionado a ajustes y precisiones; **AJ** = requiere ajustes explícitos. Los criterios CA son propuestas verificables para la siguiente aprobación, no pruebas ejecutadas ni nuevas reglas obligatorias. P-xx remite a [PAI-004](PAI-004_Pendientes_Planeacion.md). El detalle de reglas está en [PAI-003](PAI-003_Reglas_Negocio.md).

## 2. Matriz RF-001 a RF-026

| RF / grupo | Requisito original resumido | Estado y observaciones de Planeación | Evidencia verificable | Restricción / pendiente |
|---|---|---|---|---|
| RF-001 / A | Organizar por líneas e iniciativas estratégicas | AC. Q §1 pide línea/eje e iniciativa/objetivo; §3 A permite modificaciones por Planeación previa aprobación de solicitud | Q §§1, 3 A; X `Consolidado!B1:D2` | Jerarquía 2027 y equivalencia de nombres por aprobar: P-07, P-05 |
| RF-002 / A | Registrar compromisos y fuentes | AC. Conservar componentes de las fichas | Q §§2, 3 A; X `VA01!B5:C5`, `Consolidado!D1:E1` | «Compromiso/programa/proyecto» no es todavía catálogo definido; fuente de planeación no es evidencia: P-07 |
| RF-003 / A | Código y descripción de meta | AC. Q §4.5 prohíbe modificar metas después del inicio del año | X `VA01!D9:E9`; Q §§3 A, 4.5 | Códigos inconsistentes; precisar alta, baja y corrección de errores: P-05, P-07, P-15 |
| RF-004 / A | Actividades e indicadores asociados a metas | AC. Q §4.7 exige separar ejecución de actividades de indicador de resultado | X `GTI05!D8:G9`; Q §§3 A, 4.7 | G varía entre actividades de una misma meta; no elegir un indicador arbitrariamente: P-02 |
| RF-005 / A | Peso porcentual por actividad | AC. Q §4.1 pide suma de pesos de actividades por meta del 100 % | X `ADQ06!H8:H10`, `FISP04!H33`; Q §4.1 | Origen contradice 100 % en dos grupos; tolerancia y efecto de cambios pendientes: P-01, P-14 |
| RF-006 / A | Programación trimestral y anual | AC. Se conserva programación; Q §4.5 permite cambiarla solo a Planeación | X `GTI05!I9:M9`, `Consolidado!K2:O2` | Distinguir ausencia, cero y reprogramación; no sumar todo tipo de indicador: P-01, P-20 |
| RF-007 / A | Productos o resultados esperados | AC. Conservar componentes de formulación | X `VA01!N5`, `GTI05!N8`; Q §§2, 3 A | Obligatoriedad, tipología y relación con evidencia pendientes: P-06 |
| RF-008 / A | Presupuesto por actividad | AC. Sin observación particular adicional | X `GTI05!O8`, `Consolidado!Q1:Q2`; Q §3 A | Unidad monetaria, precisión, nulos y validación pendientes; el consolidado transforma presupuesto a texto: P-20 |
| RF-009 / B | Registrar avances trimestrales | AC. Q §3 B pide denominarlos «logros» y registrar valor numérico del indicador; §1 admite enteros y decimales | X `GTI05!P9:S9`; Q §§1, 3 B | No confundir valor reportado, narración y porcentaje calculado; definir captura del indicador de meta: P-02, P-20 |
| RF-010 / B | Calcular cumplimiento trimestral y anual | AC. Q §4.2 remite al consolidado y a ponderaciones, sin resolver todas las excepciones | X `Consolidado!W2:AA2`, `AD2`; Q §4.2 | Fórmulas distintas en fichas; blancos/ceros/cierre/cortes y agregación institucional pendientes: P-01, P-18 |
| RF-011 / B | Describir logros trimestrales | AC. Se mantiene narración de logros | X `GTI05!Z4`, `AD4`, `AH4`, `AL4`; Q §3 B | Mantener separada del valor numérico; longitud y obligatoriedad pendientes: P-06 |
| RF-012 / B | Dificultades y observaciones de seguimiento | AC. Sin ajuste específico al grupo | X `GTI05!AA4`, `AE4`, `AI4`, `AM4`; Q §3 B | Diferenciar comentario del gestor de anotación del validador: P-06 |
| RF-013 / B | Fuentes de verificación del avance | AC. Q §4.4 las liga a la formulación y validación por periodo | X `GTI05!AB4`, `AF4`, `AJ4`, `AN4`; Q §4.4 | Una celda con texto o código no acredita archivo cargado; validar enlaces/archivos y requisitos: P-06 |
| RF-014 / B | Observaciones o ajustes de Planeación | AC. Q §4.4 exige conservar anotaciones de evidencias | X `GTI05!AC4`, `AG4`, `AK4`, `AO4`; Q §§3 B, 4.4 | No sobrescribir historia; precisar quién corrige qué y tras qué autorización: P-03, P-04 |
| RF-015 / C | Consolidado institucional y por dependencia | AJ. Solicita consulta equivalente al dashboard enlazado al inicio de Q | Q §§1, 3 C; X `Consolidado!A1:AD2` | Panel, filtros, alcance y reglas de totalización no aprobados en detalle: P-10, P-01 |
| RF-016 / C | Catálogo de dependencias y códigos | AJ. Hereda «Requiere ajustes» de C; no hay validación individual diferenciada | X `Resumen!A6:B48`; Q §3 C | Catálogo activo 2027, sedes/programas y equivalencias por acordar: P-07, P-17 |
| RF-017 / D | Solo Planeación crea/modifica estructura | AC. §1 pide cargar, crear, modificar/eliminar filas; §4.5 restringe metas y autoriza cambios de actividades/programación a Planeación | Q §§1, 3 D, 4.5 | No habilita eliminación indiscriminada ni modificación de metas iniciada la vigencia: P-05, P-15 |
| RF-018 / D | Acceso con cuenta institucional | AC. No se solicitan cambios al mecanismo existente | Q §3 D; A §5; `src/auth/msalConfig.ts` | MSAL implementado; autorización de datos no implementada. No equivale a crear cuentas Entra: P-16, P-13 |
| RF-019 / D | Responsable consulta/reporta su dependencia | AC. §1 habla de ficha habilitada; §4.3 identifica líder, director de sede o programa | Q §§1, 3 D, 4.3 | Asignación por ficha, delegación y múltiples roles requieren aprobación; validar en servicio: P-17, P-03 |
| RF-020 / D | Enviar, aprobar o devolver con observaciones | AC. Planeación valida evidencia; vicerrectores se informan y pueden pedir reapertura; solo Planeación reabre | Q §§3 D, 4.3–4.4 | Validar evidencia no define inequívocamente aprobador final del reporte ni responsable de cierre: P-03, P-04 |
| RF-021 / D | Adjuntar evidencias | AC. §4.4 contempla ajustes posteriores y autorización del vicerrector para el mismo trimestre tras cierre | Q §§3 D, 4.4; X `GTI05!AF8` | Tipos, tamaños, retención, permisos y almacenamiento pendientes; no confundir código con archivo: P-06, P-13, P-15 |
| RF-022 / D | Historial de cambios y decisiones | AC. §4.4 exige conservar observaciones e informe de modificaciones poscierre | Q §§3 D, 4.4 | Identidad, fecha, versión, motivo y alcance de consulta propuestos; retención pendiente: P-04, P-15 |
| RF-023 / E | Tableros de cumplimiento y filtros | AC en E, condicionado al ajuste del grupo C y al dashboard solicitado | Q §§1, 3 C, 3 E; A §6 | No inventar semáforos, umbrales ni fórmulas de indicadores: P-10, P-01, P-02 |
| RF-024 / E | Descargar informes institucionales | AC. §4.8 concreta exportación trimestral en Excel para consultas/Power BI | Q §§3 E, 4.8 | Formato, datos incluidos, cortes, versiones y permisos por definir: P-12 |
| RF-025 / E | Avisos/recordatorios de reportes y revisiones | AC. No precisa canales ni periodicidad | Q §3 E | No automatizar envíos a personas sin definir destinatarios, calendario y disparadores: P-11 |
| RF-026 / E | Histórico e importación cuando se apruebe | AC, condicionado en su redacción. §4.6 propone 2027 y diez años siguientes | Q §§3 E, 4.6, 5 | No autoriza migración masiva 2026 ni resuelve 2027–2036 frente a 2027+10: P-08, P-09 |

## 3. Criterios de aceptación propuestos y trazabilidad

Todos requieren validación funcional. «Configurado/aprobado» significa que debe existir previamente una decisión registrada, no que el equipo pueda suplirla por defecto.

| Criterio | RF | Evidencia requerida para aceptar la futura implementación |
|---|---|---|
| CA-001 | 001 | Una ficha muestra su línea e iniciativa según catálogo aprobado, sin mezclar vigencias. |
| CA-002 | 002 | Compromiso y fuente se conservan tras guardar/consultar y permanecen separados de la evidencia de ejecución. |
| CA-003 | 003 | El código identifica la meta dentro de su contexto aprobado; no permite modificar la meta en los supuestos prohibidos por Planeación. |
| CA-004 | 004 | Actividades e indicadores quedan vinculados sin perder los diferentes textos de origen durante la conciliación. |
| CA-005 | 005 | Casos con pesos 0.50 y 1.20 generan hallazgos; el comportamiento de bloqueo se ajusta a la regla aprobada, sin normalización automática. |
| CA-006 | 006 | Los cuatro trimestres y el total se recuperan sin convertir ausencia en cero; reprogramar deja trazabilidad y aplica permisos aprobados. |
| CA-007 | 007 | El producto esperado puede consultarse desde la actividad y conserva el texto aprobado. |
| CA-008 | 008 | Presupuestos válidos conservan unidad y precisión; valores vacíos o no interpretables siguen la política aprobada. |
| CA-009 | 009 | Se guarda un logro cuantitativo decimal y se distingue de la descripción y del indicador de resultado. |
| CA-010 | 010 | El motor reproduce casos de referencia aprobados para vacío, cero, exceso, programación parcial y anual, con versión de fórmula. |
| CA-011 | 011 | La narración del trimestre se guarda asociada a actividad, periodo y versión de reporte correctos. |
| CA-012 | 012 | Dificultades del gestor y observaciones de Planeación tienen autoría y propósito diferenciados. |
| CA-013 | 013 | Se consulta la fuente de verificación del reporte sin asumir que un texto libre es un archivo accesible. |
| CA-014 | 014 | Una nueva observación no elimina la anterior; se puede reconstruir su relación con la revisión. |
| CA-015 | 015 | Consolidado y filtros concuerdan con el conjunto de datos y las agregaciones aprobadas; se detectan las cuatro filas faltantes actuales. |
| CA-016 | 016 | Dependencia, sede/programa y código se resuelven con catálogo y tabla de equivalencias aprobados. |
| CA-017 | 017 | Un gestor no puede alterar estructura ni por petición directa; Planeación solo modifica lo autorizado y registra la solicitud. |
| CA-018 | 018 | Sin sesión no se muestran módulos; acceso/salida/recarga funcionan en navegador sin bucles. La prueba de autorización de datos es independiente. |
| CA-019 | 019 | Dos responsables de fichas diferentes no pueden leer/escribir datos ajenos por cambiar identificadores en solicitudes. |
| CA-020 | 020 | Envío, decisión y devolución respetan la matriz aprobada y conservan versión, actor y motivo; no se puede eludir un cierre. |
| CA-021 | 021 | La evidencia autorizada se carga/consulta con versión y metadatos; un usuario no autorizado no accede por URL directa. |
| CA-022 | 022 | Se reconstruye una modificación poscierre y su autorización sin sustituir silenciosamente el corte anterior. |
| CA-023 | 023 | El dashboard distingue ejecución de actividades de resultado de metas y aplica filtros y permisos acordados. |
| CA-024 | 024 | La exportación Excel de un trimestre reconcilia sus filas y cifras con el corte/versiones aprobados. |
| CA-025 | 025 | Un aviso configurado llega una vez al destinatario correcto y conserva resultado; pruebas con destinatarios controlados. |
| CA-026 | 026 | Vigencias autorizadas se consultan aisladamente; una importación repetida no crea duplicados y registra su origen. |

## 4. Alcances complementarios expresados en las respuestas

No se renumeran los RF originales. Estos complementos requieren detalle y trazabilidad antes de construirlos:

| ID de análisis | Alcance | Fuente | Relación / pendiente |
|---|---|---|---|
| EXT-01 | Importación de estructura y creación individual de filas | Q §1 | RF-001–008, 017; P-19 |
| EXT-02 | Administración de perfiles y asignaciones, con varias funciones por usuario | Q §1 | RF-018–020; P-16, P-17 |
| EXT-03 | Seguimiento de metas sin reporte y retrasadas de otros periodos | Q §1 | RF-009, 015, 023; P-01, P-10 |
| EXT-04 | Corrección de evidencias tras cierre e informe de modificaciones | Q §4.4 | RF-014, 020–022; P-04 |
| EXT-05 | Captura independiente del resultado de indicador de meta | Q §4.7 | RF-004, 009–010, 023; P-02 |

## 5. Estado del producto y límites

Según A §§4–6, RF-018 tiene base técnica implementada (MSAL y protección de interfaz), sin autorización de negocio. Los demás RF no están implementados como operaciones persistentes; tarjetas, filtros de módulos y prototipos no acreditan formularios, carga de archivos o decisiones reales. No se cambió código en este análisis ni se ejecutaron pruebas de aceptación de negocio.

La referencia PAI-002A citada al final de Q no está entre los archivos encontrados en el repositorio; no se presume revisada. Q menciona un Excel anterior `(2)(1)`; esta matriz contrasta sus respuestas con la versión **(6)** aportada, sin suponer equivalencia entre archivos.
