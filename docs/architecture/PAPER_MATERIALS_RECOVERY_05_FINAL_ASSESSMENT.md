# PAPER-MATERIALS-RECOVERY-05 — Evaluación Final y Plan de Ejecución por Fases

**Proyecto:** PrintPrice OS  
**Misión:** `PAPER-MATERIALS-RECOVERY-05 — Resolución basada en evidencia de atributos y espesores pendientes`  
**Rama:** `feat/paper-materials-recovery-05` (creada desde la rama consolidada `feat/spine-03r-caliper-and-engine` @ `9fb66b0af2c045b82f8505195374838448e4ea48`)  
**Alcance de esta fase (Fase D):** Análisis técnico, inventario de fuentes y matriz de revisión auditable. **Sin escrituras en la base de datos productiva.**  
**Dictamen:** **`PAPER_MATERIALS_RECOVERY_05_READY_FOR_REVIEW`**

---

## 1. Síntesis del Estado Actual y de los 4 Grupos Analizados

Tras la consolidación productiva y en Git de `PAPER-CALIPER-RECOVERY-02` (`1.171` variantes con espesor) y `PAPER-MATERIALS-RECOVERY-04` (`943` variantes con clasificación técnica recuperada del origen), se han auditado las **`713` variantes únicas** que presentan algún atributo técnico o espesor pendiente en `Control.paper_variants`:

| Grupo de Trabajo (`RECOVERY-05`) | Total de Variantes en el Grupo | Subconjunto Acreditado con Evidencia Documental (Listo para Aprobación) | Subconjunto en Espera de Sign-Off Humano o Medición Física (`HOLD`) | Criterio de Separación |
| :--- | :---: | :---: | :---: | :--- |
| **Grupo A — `STRONG_MATCH_REVIEW`** | **`501`** | **`348`** (`102` `PT_SILK_WITH_GLOSS_PRODUCT_NAME` + `246` `DOCUMENTED_MILL_FAMILY_RULE` de familias estándar *Arctic Volume*, *G-Print*, *G-Silk*, *Galerie Art*, *Maxi Satin/Gloss*, *Amber Graphic*, *IQ Print*, *Serixo*, *Olin*, *Keaykolour*, *Sirio Color*, *Efalin*, *Ensocoat*, *Invercote*, *Kappa*) | **`153`** (`84` con `UNSPECIFIED_COAT_KEPT_UNKNOWN` y `69` especialidades sin ficha unívoca en el lote) | Solo pasan las `348` variantes cuya marca comercial + `PAPER TYPE` del ODS están respaldadas por ficha técnica oficial de fabricante. Las `153` restantes conservan `UNKNOWN`. |
| **Grupo B — `ATTRIBUTE_CONFLICT`** | **`62`** | **`0`** (No se auto-corrigen conflictos) | **`62`** (`35` con `COAT = Jautāt`, `16` con `COAT = dizaina`, `2` con `Matt` vs `silk`, `2` con `Matt` vs `nekrītots`, `7` con valores no canónicos) | Contradicciones explícitas en la fuente original documentadas fila por fila para decisión humana separada. |
| **Grupo C — `AMBIGUOUS_MATCH`** | **`16`** | **`15`** (`14` donde las 2 filas del ODS coinciden al `100 %` en clasificación y espesor + `1` *Maestro Print 170 64x90* donde ambas filas coinciden en `OFFSET / UNCOATED` manteniendo su conflicto de caliper separado) | **`1`** (`var_24529f375c1b6341` · *Munken Pure Rough 100 90x64*, donde las dos filas del ODS difieren entre `Matt/nekrītots` y `Ofset/<EMPTY>`) | Desambiguación determinista por código original (`ods_code`), proveedor (`ods_provider`) y concordancia de atributos entre filas duplicadas. |
| **Grupo D — `MISSING_CALIPER` (`caliper_um IS NULL`)** | **`353`** | **`179`** (`67` del Tramo D1 por variante hermana del mismo papel y `gsm` en otro formato de pliego en el ODS + `112` del Tramo D2 por ficha técnica oficial del fabricante para ese exacto `(familia, gsm)`) | **`174`** (papeles tintados/especiales sin espesor en ficha pública y los `9` conflictos de espesor preservados de `RECOVERY-02`) | Prohibido deducir micras solo desde `gsm`. Se distingue explícitamente `SIBLING_FORMAT_ODS_IMPORT`, `MANUFACTURER_DATASHEET` y `PHYSICAL_MICROMETER_ISO534`. |

---

## 2. Proyección de Cobertura del Catálogo tras Aprobación de los Subconjuntos Acreditados

| Indicador del Catálogo (`1.524` Variantes) | Estado Actual (`RECOVERY-04`) | Tras Lote Acreditado `RECOVERY-05` (Proyectado) | Mejora Neta |
| :--- | :---: | :---: | :---: |
| **Variantes con Clasificación Técnica Acreditada (`paperType`, `coatingStatus`, `finish`)** | `945 / 1.524` (`62,01 %`)<br>(`943` `SAFE_UNIQUE_MATCH` + `2` `ALREADY_VERIFIED`) | **`1.308 / 1.524` (`85,83 %`)**<br>(`945` + `348` Grupo A + `15` Grupo C) | **`+363` variantes (`+23,82 %`)** |
| **Variantes con Espesor Físico Acreditado (`caliper_um > 0`)** | `1.171 / 1.524` (`76,84 %`) | **`1.350 / 1.524` (`88,58 %`)**<br>(`1.171` + `67` Tramo D1 + `112` Tramo D2) | **`+179` variantes (`+11,74 %`)** |
| **Variantes con Conflictos o Sin Evidencia Mantenidas Honestamente en `UNKNOWN` / `MISSING`** | `579` atributos / `353` espesores | **`216` atributos / `174` espesores** | **Cero valores inventados o por defecto** |

---

## 3. Artefactos de `PAPER-MATERIALS-RECOVERY-05` Entregados

1. [`docs/architecture/PAPER_MATERIALS_RECOVERY_05_SOURCE_INVENTORY.md`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/docs/architecture/PAPER_MATERIALS_RECOVERY_05_SOURCE_INVENTORY.md) — Jerarquía epistémica de las 5 fuentes técnicas autorizadas y desglose técnico de los Grupos A (`501`), B (`62`) y C (`16`).
2. [`docs/architecture/PAPER_MATERIALS_RECOVERY_05_REVIEW_MATRIX.csv`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/docs/architecture/PAPER_MATERIALS_RECOVERY_05_REVIEW_MATRIX.csv) — Matriz completa de las **`713` variantes únicas** pendientes en los Grupos A, B, C y D, incluyendo clasificación actual, valores crudos del ODS, propuesta basada en evidencia, referencia documental (`attr_evidence_source`), estado de brecha de caliper (`caliper_gap_status`), espesor candidato (`candidate_caliper_um`), procedencia (`candidate_caliper_provenance`) y prioridad para testers de Spine Calculator (`spine_tester_priority`).
3. [`docs/architecture/PAPER_MATERIALS_RECOVERY_05_CALIPER_GAP_PLAN.md`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/docs/architecture/PAPER_MATERIALS_RECOVERY_05_CALIPER_GAP_PLAN.md) — Plan de cierre de brecha para las `353` variantes sin espesor, priorizado por uso en Spine Calculator (`173` alta prioridad de bloque interior, `66` media prioridad de cubierta/cartulina, `114` baja prioridad de recubrimiento/especialidades) y dividido en Tramo D1 (`67` formatos hermanos), Tramo D2 (`112` fichas técnicas oficiales de fábrica) y Tramo D3 (`174` pendientes de medición con micrómetro ISO 534).
4. [`docs/architecture/PAPER_MATERIALS_RECOVERY_05_FINAL_ASSESSMENT.md`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/docs/architecture/PAPER_MATERIALS_RECOVERY_05_FINAL_ASSESSMENT.md) — Este documento de evaluación y propuesta de ejecución escalonada.
