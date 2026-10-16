# PAI-006 — Diccionario y auditoría del Excel institucional

Versión 0.1 para revisión, 16/10/2026. Rama `feature/analisis-funcional-pai`.

## 1. Fuentes, método y alcance

**X:** [01. Plan de Acción 2026 Consolidado V1 (6).xlsx](<../../insumos/planeacion/01. Plan de Acción 2026 Consolidado V1 (6).xlsx>). **Q:** [Cuestionario respondido](<../../insumos/planeacion/PAI_Digital_Revision_Requisitos_Planeacion cuetionario resuelto..docx>), §§2, 4 y 5. Q cita en su referencia final una versión `(2)(1)` no disponible para comparación; este análisis corresponde exclusivamente a **(6)**. El [inventario de arquitectura](../arquitectura-actual-pai.md) describe el código, no un importador implementado.

Se abrió cada XLSX/DOCX como contenedor ZIP en modo lectura. Para Excel se inspeccionaron `xl/workbook.xml`, relaciones, cadenas compartidas y los nodos de celda realmente almacenados en las 54 hojas. Se reconstruyeron las fórmulas compartidas desplazando sus referencias relativas; no se contó solo la primera fórmula del grupo. Los valores guardados de fórmulas se trataron como cachés, no como recálculo certificado.

No se iteró hasta `max_row` ni se visitaron millones de filas vacías. Se distinguieron dimensiones declaradas, celdas con contenido/fórmula y filas con código de meta en D. Un máximo de fila con valor tampoco equivale al rango de negocio: `FISC06!AF1048542` contiene `N/A`, fuera de la ficha. El análisis encontró 87.098 celdas con contenido/fórmula y 38.261 expresiones de fórmula tras expandir las compartidas. Las celdas vacías con formato no se importan como registros.

No se modificaron los originales ni se incorporaron a Git. Huellas SHA-256 para reproducir esta revisión:

| Archivo | SHA-256 |
|---|---|
| `01. Plan de Acción 2026 Consolidado V1 (6).xlsx` | `eeecf07a7f19557ae32901144c4a192927575bd235f796e785032eacf31173f9` |
| `PAI_Digital_Revision_Requisitos_Planeacion cuetionario resuelto..docx` | `5a653b628f2138b2f95103699953a9ff1ff79446e6628ab2f67b119e4baaac58` |

## 2. Inventario de las 54 hojas

Hay **42 visibles** y **12 ocultas**. Entre las visibles, **40 fichas combinan formulación y seguimiento**, más `Consolidado` y `Resumen`. Visibilidad no acredita vigencia, completitud ni validación. Las ocultas también contienen datos y resultados; no son todas hojas vacías ni deben importarse como dependencias activas.

La columna «filas D» muestra el intervalo de códigos y su cantidad, no todas las filas intermedias como válidas. «Última fila» es la última celda con contenido/fórmula, aunque sea residual. «Fórmulas» incluye las compartidas expandidas. En el nombre `Plan de acción L2 RE  ` se conservan dos espacios finales.

| Hoja | Visible | Función inferida de encabezados/contenido | Dimensión declarada | Última fila con contenido | Filas D / cantidad | Fórmulas |
|---|---|---|---|---:|---|---:|
| `Plan de acción L1 CA` | No | Formulación/seguimiento por línea; referencia con rótulos 2025 | `A1:AM598` | 191 | — | 1281 |
| `Plan de acción L2 RE  ` | No | Formulación/seguimiento por línea; referencia histórica por confirmar | `A1:AB387` | 150 | — | 970 |
| `Plan de acción L3 GI` | No | Formulación/seguimiento por línea; referencia histórica por confirmar | `A1:AM273` | 132 | — | 840 |
| `Tabla Dinamica` | No | Auxiliar: control agregado de pesos por meta | `A3:B563` | 563 | — | 0 |
| `Logros-Retos-Conclusiones` | No | Resumen cualitativo por línea; contiene narración, no catálogo | `A1:E4` | 4 | — | 0 |
| `Hoja4` | No | Auxiliar: segundo control de pesos por meta | `A1:B1190` | 564 | — | 0 |
| `Consolidado` | Sí | Consolidación calculada de fichas; entradas/copias y cálculos | `A1:AE1387` | 786 | — | 20404 |
| `Ing Extension` | No | Auxiliar: correspondencias/códigos y metas relacionadas con extensión | `A2:G22` | 22 | — | 0 |
| `Resumen` | Sí | Índice de responsables/códigos y resumen de conteos | `A3:G58` | 58 | — | 10 |
| `VA01` | Sí | Formulación + seguimiento de ficha con datos capturados | `A1:AO451` | 44 | 9–44 / 36 | 247 |
| `FCS02` | Sí | Formulación + seguimiento de ficha con datos capturados | `A1:AO410` | 18 | 9–18 / 10 | 69 |
| `FI03` | Sí | Formulación + seguimiento de ficha con datos capturados | `A1:AO428` | 33 | 9–33 / 25 | 178 |
| `FISP04` | Sí | Formulación + seguimiento de ficha con datos capturados | `A1:AO438` | 37 | 9–37 / 29 | 205 |
| `FISN05` | Sí | Formulación + seguimiento de ficha con datos capturados | `A1:AO427` | 35 | 9–35 / 27 | 169 |
| `FISC06` | Sí | Formulación + seguimiento de ficha con datos capturados | `A1:AP1048542` | 1048542 | 9–36 / 28 | 180 |
| `Fo07` | Sí | Formulación + seguimiento de ficha con datos capturados | `A1:AO429` | 29 | 9–28 / 20 | 124 |
| `FoSP08` | Sí | Formulación + seguimiento de ficha con datos capturados | `A1:AO455` | 35 | 9–35 / 27 | 173 |
| `FoSN09` | Sí | Formulación + seguimiento de ficha con datos capturados | `A1:AO434` | 36 | 9–36 / 28 | 172 |
| `PS011` | Sí | Formulación + seguimiento de ficha con datos capturados | `A1:AU440` | 31 | 9–31 / 23 | 163 |
| `TO12` | Sí | Formulación + seguimiento de ficha con datos capturados | `A1:AO436` | 29 | 9–29 / 21 | 147 |
| `ND013` | Sí | Formulación + seguimiento de ficha con datos capturados | `A1:AO421` | 27 | 9–27 / 19 | 119 |
| `NDSP14` | Sí | Formulación + seguimiento de ficha con datos capturados | `A1:AO409` | 27 | 9–27 / 19 | 116 |
| `CP15` | Sí | Formulación + seguimiento de ficha con datos capturados | `A1:AZ427` | 85 | 9–31 / 23 | 154 |
| `ADM16` | Sí | Formulación + seguimiento de ficha con datos capturados | `A1:AO402` | 96 | 9–34 / 26 | 211 |
| `FIN17` | Sí | Formulación + seguimiento de ficha con datos capturados | `A1:AO426` | 30 | 9–30 / 22 | 154 |
| `PRA18` | Sí | Formulación + seguimiento de ficha con datos capturados | `A1:AO421` | 18 | 9–18 / 10 | 70 |
| `BB19` | Sí | Formulación + seguimiento de ficha con datos capturados | `A1:AO430` | 27 | 9–27 / 19 | 133 |
| `MCV20` | Sí | Formulación + seguimiento de ficha con datos capturados | `A1:AO421` | 23 | 9–23 / 15 | 89 |
| `LAB21` | Sí | Formulación + seguimiento de ficha con datos capturados | `A1:AO421` | 17 | 9–17 / 9 | 57 |
| `INV22` | Sí | Formulación + seguimiento de ficha con datos capturados | `A1:AP424` | 23 | 9–23 / 15 | 98 |
| `INN23` | Sí | Formulación + seguimiento de ficha con datos capturados | `A1:AO410` | 14 | 6–14 / 9 | 63 |
| `VE01` | Sí | Formulación + seguimiento de ficha con datos capturados | `A1:AO254` | 27 | 8–27 / 20 | 140 |
| `CO02` | Sí | Formulación + seguimiento de ficha con datos capturados | `A1:AO242` | 24 | 8–24 / 17 | 110 |
| `ME03` | Sí | Formulación + seguimiento de ficha con datos capturados | `A1:AO242` | 19 | 8–19 / 12 | 80 |
| `BI04` | Sí | Formulación + seguimiento de ficha con datos capturados | `A1:AO267` | 39 | 7–38 / 32 | 194 |
| `FC05` | Sí | Formulación + seguimiento de ficha con datos capturados | `A1:AP256` | 25 | 7–25 / 19 | 133 |
| `CI06` | Sí | Formulación + seguimiento de ficha con datos capturados | `A1:AO254` | 29 | 8–29 / 22 | 152 |
| `EG07` | Sí | Formulación + seguimiento de ficha con datos capturados | `A1:AO259` | 28 | 8–28 / 21 | 137 |
| `RI08` | Sí | Formulación + seguimiento de ficha con datos capturados | `A1:AO259` | 28 | 8–28 / 21 | 121 |
| `PE09` | Sí | Formulación + seguimiento de ficha con datos capturados | `A1:AO250` | 19 | 9–19 / 11 | 70 |
| `IPS10` | Sí | Formulación + seguimiento de ficha con datos capturados | `A1:AP254` | 24 | 8–24 / 17 | 120 |
| `CC11` | Sí | Formulación + seguimiento de ficha con datos capturados | `A1:AO252` | 24 | 8–24 / 17 | 91 |
| `SGE01` | Sí | Formulación + seguimiento de ficha con datos capturados | `A1:AO148` | 26 | 8–26 / 19 | 130 |
| `PLA02` | Sí | Formulación + seguimiento de ficha con datos capturados | `A1:AO162` | 39 | 8–39 / 32 | 219 |
| `FIN03` | Sí | Formulación + seguimiento de ficha con datos capturados | `A1:AO156` | 18 | 8–18 / 11 | 70 |
| `GH04` | Sí | Formulación + seguimiento de ficha con datos capturados | `A1:AO168` | 29 | 8–29 / 22 | 153 |
| `GTI05` | Sí | Formulación + seguimiento de ficha con datos capturados | `A1:AO156` | 21 | 8–21 / 14 | 95 |
| `IPS` | No | Formulación de referencia; formato antiguo, uso activo no confirmado | `A1:AC363` | 25 | — | 2 |
| `Mercadeo` | No | Formulación/seguimiento de referencia; uso activo no confirmado | `A1:AB284` | 40 | — | 28 |
| `Hoja1` | No | Consolidación auxiliar/legada, formato con rótulos 2025 | `A2:AC1361` | 1361 | — | 9482 |
| `Hoja3` | No | Auxiliar: extracto de programación T2–T4 por dependencia/meta | `A1:E1379` | 1379 | — | 0 |
| `Hoja2` | No | Auxiliar: listado de metas y programación T2 | `A3:B385` | 385 | — | 0 |
| `ADQ06` | Sí | Formulación + seguimiento de ficha con datos capturados | `A1:AO152` | 18 | 8–18 / 11 | 75 |
| `INF07` | Sí | Formulación + seguimiento de ficha con datos capturados | `A1:AO155` | 18 | 8–18 / 11 | 63 |

### Qué conservar y qué no convertir en módulos

Q §2 pide conservar fichas, índice y consolidado. Los controles auxiliares pueden sustituirse por validaciones de formulación y conciliación; su contenido no se elimina de la evidencia histórica sin decisión de Planeación. Las 40 fichas tienen textos y valores de seguimiento, aunque eso no acredita aprobación de cada dato. `Consolidado` contiene datos derivados y metadatos escritos; no es una fuente independiente más confiable por ser consolidado.

`Tabla Dinamica!A3:B563` y `Hoja4!A4:B564` presentan controles de pesos, con «Total general» 558 en `B563` y `B564`, respectivamente. No equiparar ese total ponderado con conteo oficial de metas. `Hoja3!A1:E1` presenta programación T2–T4 y códigos invertidos como `M01-VA01` en B2, frente a `VA01-M01` de fichas. `Hoja2!A3:B3` es un extracto T2. `Hoja1` no debe duplicar las actividades del consolidado actual.

`CP15!N43:Q85` y `ADM16!N47:Q96` contienen cuadros adicionales de matrículas (por ejemplo `CP15!N43:P43`, `ADM16!N47:P47` y fórmulas `Q45`, `Q49`). Son datos auxiliares dentro de una ficha, no nuevas actividades por ocupar filas. El formato real de importación debe aislarlos sin perder su procedencia (P-19).

## 3. Columnas de las fichas visibles

Ejemplos de encabezados: `VA01!A5:AO5` y `GTI05!A4:AO4`. Las filas de encabezado y primer dato varían: VA01 inicia en 9, GTI05 en 8, BI04/FC05 en 7 e INN23 en 6. No fijar universalmente «datos desde fila 9». Los nombres siguientes son conceptos propuestos; obligatoriedad, escala y límites deben aprobarse.

| Columnas de ficha | Rótulo observado / contenido | Tipo conceptual propuesto | Destino / relación | Precaución |
|---|---|---|---|---|
| A | INICIATIVA ESTRATÉGICA | Texto/referencia | Iniciativa | La línea no está en una columna uniforme de ficha |
| B | COMPROMISOS | Texto/referencia | Compromiso | Resolver programa/proyecto/componente |
| C | FUENTE | Texto o referencia documental | FuentePlaneacion/MetaFuente | No confundir con evidencia de ejecución |
| D | No. META | Código textual | Meta y RegistroOrigen | Identidad contextual; no ID de actividad |
| E | METAS | Texto largo | Meta.descripcion | Distintas descripciones bajo un mismo código requieren conciliación |
| F | ACTIVIDADES | Texto largo | Actividad.descripcion | Sin identificador estable de actividad uniforme |
| G | INDICADOR META | Texto | Indicador candidato / registro de origen | Varía por actividad; no es valor medido |
| H | PESO X ACT. | Decimal, escala fracción observada | Actividad/version.peso | 0.2 representa 20 %; suma por meta debe ser 1 tras conciliación |
| I:L | META PLANEADA T1–T4 | Decimal con unidad y estado de captura | Programacion por actividad/periodo | Blancos y ceros distintos; algunos encabezados dicen 2025 |
| M | Total programado | Decimal derivado o valor fijo de origen | Proyección de programación | Se observan sumas y valores escritos; no sumar indicadores no aditivos sin regla |
| N | PRODUCTOS | Texto | Producto esperado de actividad | No acredita entrega o archivo |
| O | PRESUPUESTO | Decimal/unidad monetaria, por definir | Actividad/version | Puede estar vacío o en 0; no inferir moneda ni financiación |
| P:S | AVANCE META T1–T4 | Decimal con unidad | DetalleReporte.logroCuantitativo | La etiqueta «meta» no convierte la fila en medición de indicador de meta |
| T | Total reportado | Decimal derivado o valor fijo | Proyección de reportes | No reemplaza desglose por periodo |
| U:X | % DE AVANCE T1–T4 | Decimal calculado | ResultadoCalculo de actividad | Hay valores fijos, fórmulas desplazadas y referencias rotas |
| Y | AVANCE | Decimal derivado | Aporte/cumplimiento anual por conciliar | Al menos tres familias de fórmula; no renombrar universalmente como resultado de meta |
| Z, AD, AH, AL | PRINCIPALES AVANCES (LOGROS), T1–T4 | Texto | DetalleReporte.narracion | Asociar al periodo correcto |
| AA, AE, AI, AM | OBSERVACIONES Y/O DIFICULTADES | Texto | DetalleReporte.dificultades | Autor/fecha no están estructurados uniformemente |
| AB, AF, AJ, AN | EVIDENCIAS – FUENTES DE VERIFICACIÓN | Texto, código o enlace | Evidencia/VinculoEvidencia/RegistroOrigen | No todos son archivos, ni los enlaces prueban permisos o disponibilidad |
| AC, AG, AK, AO | MODIFICACIONES / OBSERVACIONES / VALIDACIÓN DIRECCIÓN DE PLANEACIÓN | Texto | Observacion y dato histórico de origen | Rótulos cambian por trimestre/hoja; no inferir aprobación de un comentario |

Las fichas carecen de campos estructurados uniformes para ID de actividad, autor/instante de reporte, estado de envío, aprobación/devolución/reapertura, medición independiente de resultado, unidad/objetivo/sentido del indicador e historial de versiones. Esos datos no pueden reconstruirse de manera confiable solo con los textos existentes.

## 4. Mapeo del consolidado

Rango de contenido con registros: encabezado fila 1 y filas 2–786 (785 filas). Dimensión declarada `A1:AE1387`, mayor que el contenido. La columna AE no aporta un campo en los encabezados revisados.

| Consolidado | Concepto / correspondencia con ficha | Ejemplo verificable |
|---|---|---|
| A | Dependencia, etiqueta explícita | A2 identifica Vicerrectoría Académica |
| B | Línea estratégica, etiqueta explícita | B2: `01. Calidad Académica` |
| C, D, E | Iniciativa, compromiso, fuente = A, B, C de ficha | C2 limpia `'VA01'!A9` |
| F, G, H, I | Código meta, meta, actividad, indicador = D, E, F, G | F2 referencia `'VA01'!D9` |
| J | Peso = H | J2 referencia `'VA01'!H9` |
| K:N / O | Programación T1–T4 / total = I:L / M | K2 conserva blanco; O2 suma K:N |
| P | Producto = N | P2 limpia texto de `'VA01'!N9` |
| Q | Presupuesto = O | Q2 aplica `TRIM/CLEAN/SUBSTITUTE` a `'VA01'!O9`, devolviendo texto |
| R:U / V | Valores reportados T1–T4 / total = P:S / T | V2 suma R:U |
| W:Z | Evaluación trimestral recalculada | W2: cantidad reportada / programada con techo y tratamiento de error |
| AA | Avance ponderado recalculado | AA2: promedio de W:Z × J, con IFERROR |
| AB | AÑO | AB2=2026, pero hay valores 2025–2035 |
| AC | FECHA DE CORTE | AC2: serial 46125, formato de fecha (13/04/2026); no asumir corte vigente |
| AD | CALC. CUMPL. | AD2 divide aporte ponderado por peso; no es indicador de resultado |

La limpieza textual de C2 es:

```text
=TRIM(CLEAN(SUBSTITUTE(SUBSTITUTE('VA01'!A9, CHAR(160), ""), CHAR(10), "")))
```

Suprime espacios no separables y saltos de línea. Esta transformación puede borrar separaciones significativas; se propone conservar texto original y normalizado por separado. No copiar la transformación de Q para almacenar un importe como texto.

Las fórmulas completas y su interpretación están en [PAI-003 §3](../02-requisitos/PAI-003_Reglas_Negocio.md). Se identificó un patrón uniforme de W:Z y AA en las 785 filas; eso no homologa automáticamente las fichas ni define agregación entre metas.

## 5. Códigos y relaciones

- `Resumen!A6:B48` relaciona códigos y áreas con filas de total intermedias. No es una tabla limpia que pueda cargarse sin clasificar filas. `Resumen!D50=+D49+D29+D41` suma subtotales; no identifica relaciones de negocio.
- La ficha repite D/E por cada actividad F; H pertenece a esa actividad. Un registro mensual/trimestral se obtiene de I:L y P:S, no de duplicar una meta por trimestre.
- Línea → iniciativa → compromiso → meta es la estructura solicitada por Q §1, pero no hay códigos normalizados de iniciativa/compromiso. X pone la línea en `Consolidado!B`; no inferir que nombres iguales siempre significan la misma entidad plurianual.
- Una dependencia puede contener programas/sedes; el archivo no ofrece catálogo normalizado ni asignaciones de usuarios para resolverlo. La hoja y el prefijo de D son claves de procedencia, no prueba de permisos.
- Los identificadores de meta no incluyen de forma uniforme la vigencia. No usar D como clave global de diez años. La clave conceptual incluirá ficha/vigencia y una identidad interna (PAI-005).
- `GTI05!D8=GTI05-M01` y `AF8=CTI05-M01`: no corregir automáticamente el código de evidencia. `NDSP14!D18=NDSP014-M07` muestra diferencia de ceros en el prefijo.
- Q pide capturar resultado del indicador de meta por separado. G es una definición textual variable; no existe columna única uniforme para esa medición en el libro.

## 6. Auditoría y problemas de calidad

Método de conteo: se identificaron filas con código en D que responde al patrón alfabético/número + `-M` + número. En las 40 fichas visibles hay **789 filas** y **568 grupos `(hoja, código literal)`**. Son candidatos de origen, no conteos oficiales de metas o actividades depuradas.

| Hallazgo | Evidencia concreta | Riesgo y tratamiento propuesto |
|---|---|---|
| Ponderación incompleta | `FISP04!D33=FISP04-M18`, `H33=0.5`; única fila con ese código en ficha | Suma 50 %. P-01/P-14: confirmar faltante o valor; no completar automáticamente |
| Ponderación excesiva | `ADQ06!D8:D10=ADQ06-M01`; H8=0.2, H9=0.8, H10=0.2 | Suma 120 %. No normalizar ni eliminar una actividad por deducción |
| Cuatro filas no referenciadas desde el código F del consolidado | `ME03!D11:D12` (`ME03-M02`); `PLA02!D38` (`PLA02-M17`), `D39` (`PLA02-M18`) | 789 filas de ficha frente a 785 referencias de Consolidado F; no se detectaron referencias de código repetidas. No inferir que la ausencia sea intencional |
| Referencias rotas | `PS011!W10`, `NDSP14!X10`, `VE01!X14`, `VE01!X18` contienen `#REF!` | Errores pueden estar ocultos por IFERROR/blancos. Fórmulas completas en PAI-003 |
| Métodos anuales diferentes | `FCS02!Y9=SUM(U9:X9)`; `BB19!Y9` usa T9/M9; `VA01!Y9` promedia y pondera | No existe método universal validado para trasladar a RF-010 |
| Ventanas parciales en promedio | `FC05!Y19:Y20` promedia W:X; `ME03!Y15` promedia V:X | Confirmar exclusión de trimestres y efecto en consolidación |
| Referencias desplazadas | `PS011!V10` usa R10/J10; `NDSP14!W10` usa S10/K10; `VE01!W14`, W18 usan R/L; `PLA02!V31`, V33, V34 usan Q/K y W31 usa R/L | Podrían mezclar programación/avance de periodos. No reparar sin criterio funcional |
| Fórmula atípica fuera de columna anual | `FISP04!W37` promedia S:V y multiplica por F37 (texto de actividad) | Candidato a error de edición; el IFERROR oculta síntomas |
| Cálculos sustituidos por valores | 32 celdas U:Y en filas detectadas son valores fijos; ej. `VA01!W27=1`, `Fo07!U27=0.99` | No asumir que hay justificación oficial ni borrar ajustes manuales al importar |
| AD incompleto o fijo | Sin contenido `Consolidado!AD36:AD37`, `AD100:AD101`; ceros fijos AD487, AD717; 779 fórmulas | Comparar cálculo y origen; no tomar AD como resultado universal |
| Vigencia heterogénea en un archivo 2026 | `Consolidado!AB102=2025`, `AB47=2027`, `AB304=2035` | Entre AB2:AB786: 715 filas 2026, 28 de 2025, 24 de 2027 y 18 de 2028–2035. Posible serie accidental; causa no confirmada |
| Fechas de corte variables | `Consolidado!AC102=46124`, AC2=46125, AC47=46126, AC304=46134 | Seriales del archivo; no equivalen a periodos aprobados ni a fecha de revisión del Word |
| Encabezados heredados | `VA01!I5` indica año 2025; `FCS02!C1` indica plan 2025; `GTI05!I4` indica 2025 | Separar texto de plantilla e histórico real con Planeación |
| Índice y fichas no coinciden | `Resumen!A15=FoSC010` sin ficha homónima; A21=AE16 frente ADM16; A48=INFR07 frente INF07 | No crear dependencias ni equivalencias automáticamente |
| Descripción E variable por código | Cinco grupos: BI04-M01 (`BI04!E7:E10`), BI04-M10 (`BI04!E29:E30`), CC11-M03 (`CC11!E16:E18`), FoSP08-M16 (`FoSP08!E28:E29`), ME03-M01 (`ME03!E8:E10`) | Comparación tras normalizar espacios/mayúsculas; algunas diferencias son solo puntuación, otras agregan alcance. Resolver antes de deduplicar |
| Indicador G variable por código | 109 grupos meta/ficha; ejemplo `GTI05!G8:G9` dentro GTI05-M01 | Puede mezclar indicadores de actividad y resultado; no elegir la primera fila como definición oficial |
| Actividades repetidas por texto | `CC11!F12=F15` y `F13=F14`, bajo CC11-M02 | No prueba duplicidad: I12=5 y L15 contiene `=5+6`, por ejemplo. Conservar filas hasta decidir si son actividades/cortes distintos |
| Rangos artificiales y contenido residual | `FISC06` declara A1:AP1048542; `AF1048542=N/A`; filas con código 9–36 | No recorrer ni importar el millón de filas; poner residual en hallazgos |
| Tablas auxiliares dentro de fichas | CP15 y ADM16 después de filas de actividades | No confundir cuadros de matrículas con formulación nueva |
| Códigos históricos/invertidos | `Hoja3!B2=M01-VA01`; `Ing Extension!A2=M17-FCS02` | Conservar equivalencias solo tras aprobación, sin invertir automáticamente cualquier cadena |

«Duplicidad candidata» no significa autorización de borrado. La auditoría identifica discrepancias verificables, no corrige el Excel ni certifica validez de sus cachés. La coincidencia de textos entre dependencias puede corresponder a compromisos institucionales replicados legítimamente.

## 7. Estrategia propuesta de importación y conciliación

1. Registrar archivo/huella, versión, fecha de recepción y responsable, sin guardar el original en Git.
2. Descubrir encabezados y celdas efectivas; separar fichas, controles, resúmenes y residuos. Preservar hoja/fila/celda y texto/código originales.
3. Homologar catálogos mediante tabla aprobada, sin deducir vigencia, permisos o equivalencias por similitud de texto.
4. Construir borrador de entidades con claves internas. Separar meta, actividad, programación, reporte y definición/medición de indicador; conservar discrepancias de G.
5. Emitir vista previa: filas aceptables, rechazadas y pendientes, pesos, faltantes en consolidado, referencias rotas y posibles duplicados. Bloqueos y tolerancias requieren P-19/P-01.
6. Planeación resuelve P-14 y aprueba dataset/fórmulas de referencia. Aplicación idempotente del lote y conciliación de conteos/sumas por ficha/meta/periodo. No importar dos veces fichas y consolidado como dos juegos de actividades.
7. Definir si 2026 se migra como histórico o se usa solo como piloto; no trasladarlo automáticamente a 2027.

Esta estrategia no está implementada. No se hicieron importaciones, escrituras de negocio, recálculos en Microsoft Excel ni cambios al contenido institucional.
