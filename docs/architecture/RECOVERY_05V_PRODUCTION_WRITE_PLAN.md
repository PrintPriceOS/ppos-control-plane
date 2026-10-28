# MISIÓN PAPER-MATERIALS-RECOVERY-05V — Plan de Escritura Productiva Gobernada y Separación en 5 Listas Independientes

**Proyecto:** PrintPrice OS  
**Repositorio:** `PrintPriceOS/ppos-control-plane`  
**Rama / PR Base:** `feat/paper-materials-recovery-05` ([PR #14](https://github.com/PrintPriceOS/ppos-control-plane/pull/14))  
**Script Ejecutor Preparado:** [`scripts/recover_paper_materials_05v.cjs`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/scripts/recover_paper_materials_05v.cjs)  
**Suite de Pruebas Unitarias:** [`tests/paper_materials_recovery_05v.test.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/tests/paper_materials_recovery_05v.test.js)  
**Estado de Ejecución en Producción en esta Misión:** **BLOQUEADO POR DISEÑO (`DRY_RUN_SIMULATION` — Cero escrituras en MySQL `Control`)**

---

## 1. Segregación Determinista en 5 Listas Independientes

De acuerdo con la Sección 5 de la orden de misión `PAPER-MATERIALS-RECOVERY-05V`, el módulo [`buildRecovery05VPlan`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/scripts/recover_paper_materials_05v.cjs#L79-L250) genera y segrega el universo revisado en **5 listas independientes y auditables**:

| Lista # | Identificador de Lista en `buildRecovery05VPlan()` | Origen Documental (`docs/architecture/`) | Registros Totales | Elegible para Escritura Automática | Condición / Regla Aplicada |
| :---: | :--- | :--- | :---: | :---: | :--- |
| **1** | **`accreditedClassifications`**<br>*(Actualización de clasificaciones acreditadas)* | [`RECOVERY_05V_CLASSIFICATION_EVIDENCE.csv`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/docs/architecture/RECOVERY_05V_CLASSIFICATION_EVIDENCE.csv)<br>(`validation_verdict = 'ACCREDITED_FOR_WRITE'`) | **185 variantes**<br>(`185` productos) | **SÍ** *(tras aprobación)* | Acreditadas por acuerdo explícito en `Paper data base.ods.zip` (`PAPER TYPE` + `COAT`) y/o tabla técnica archivada `Livonia Spine calculation.xlsx` (`coating_raw` con coordenada exacta). |
| **2** | **`accreditedCalipers`**<br>*(Actualización de espesores acreditados)* | [`RECOVERY_05V_MANUFACTURER_EVIDENCE.csv`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/docs/architecture/RECOVERY_05V_MANUFACTURER_EVIDENCE.csv) (`5` D2)<br>+ [`RECOVERY_05V_SIBLING_CALIPER_VALIDATION.csv`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/docs/architecture/RECOVERY_05V_SIBLING_CALIPER_VALIDATION.csv) (`60` D1) | **65 variantes**<br>(`5` D2 + `60` D1) | **SÍ** *(tras aprobación)* | • **5 D2**: acreditados en celdas exactas de `Spine calculation.xlsx` (`C63`, `C116`, `C142`, `C181`, `C199–C208`) y filas ODS duplicadas (`#1106/#1107`, `#1140/#1141`).<br>• **60 D1**: propagación unánime (`100 %`) desde formato hermano idéntico (`misma marca + serie/bulk + gramaje`) sin conflicto en el formato destino. |
| **3** | **`conflicts`**<br>*(Conflictos congelados y excluidos)* | [`RECOVERY_05V_CONFLICT_RECONCILIATION.md`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/docs/architecture/RECOVERY_05V_CONFLICT_RECONCILIATION.md) | **9** conflictos de caliper en BD<br>+ **62** conflictos Grupo B<br>+ **2** conflictos Grupo C (`#201/#202`, `#701/#714`)<br>+ **7** rechazos D1 / **3** conflictos D2 | **NO (PROHIBIDO)** | Protegidos mediante bloqueo explícito (`HISTORICAL_9_CONFLICT_VARIANT_IDS`) y guarda Compare-and-Swap (`caliper_um IS NULL`). |
| **4** | **`manualExceptions`**<br>*(Excepciones manuales retenidas)* | [`PAPER_MATERIALS_RECOVERY_05_REVIEW_MATRIX.csv`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/docs/architecture/PAPER_MATERIALS_RECOVERY_05_REVIEW_MATRIX.csv) | **156 variantes**<br>(`153` Grupo A sin `COAT`, `1` Grupo C drift `#1189/#1190`, `2` ya verificadas) | **NO (RETENIDO)** | Filas con `COAT` vacío en ODS ya retenidas en `RECOVERY-05` (`153`), deriva de tipo en fila duplicada (`1`) y variantes ya verificadas (`2`, que sólo reciben espesor hermano en Lista 2 sin alterar su clasificación ni `grain_direction`). |
| **5** | **`documentationRequired`**<br>*(Registros reclasificados `DOCUMENTATION_REQUIRED`)* | [`RECOVERY_05V_MANUFACTURER_EVIDENCE.csv`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/docs/architecture/RECOVERY_05V_MANUFACTURER_EVIDENCE.csv)<br>+ [`RECOVERY_05V_CLASSIFICATION_EVIDENCE.csv`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/docs/architecture/RECOVERY_05V_CLASSIFICATION_EVIDENCE.csv) | **176 clasificaciones**<br>+ **107 espesores D2**<br>+ **5 espesores D1** | **NO (BLOQUEADO)** | Reclasificados como `DOCUMENTATION_REQUIRED` al carecer de ficha oficial archivada en el repositorio o depender de inferencia nominal (*Geltex*, *Efalin*, *Wibalin*, *Surbalin*, *Olin*, *Sirio*, *Keaykolour*, *Burano*, *Colorit*, *Conqueror*, *IQ Print*, *Serixo*, *G-Silk*, *Ensocoat*, *Balance Silk*, *Munken Kristall*). |

> [!IMPORTANT]
> **Unión de Variantes Acreditadas para Escritura (`combinedWriteOperations`)**:
> - **185 variantes** reciben actualización de clasificación técnica (`category`, `finish_summary`, `finish`, `metadata_json`).
> - **65 variantes** reciben actualización de espesor (`caliper_um`, `caliper_mm`, `bulk_factor`, `caliper_source = 'SUPPLIER_IMPORT'`, `caliper_confidence_status = 'REFERENCE_IMPORTED'`).
> - **16 variantes** pertenecen simultáneamente a ambas listas (reciben tanto clasificación como espesor acreditado).
> - Total de variantes únicas a modificar cuando se autorice la ejecución: **234 variantes** (`185 + 65 - 16 = 234`).

---

## 2. Arquitectura del Script Idempotente y Reversible (`scripts/recover_paper_materials_05v.cjs`)

El script [`scripts/recover_paper_materials_05v.cjs`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/scripts/recover_paper_materials_05v.cjs) implementa cinco salvaguardas industriales verificadas mediante tests unitarios:

1. **Modo por Defecto `DRY_RUN_SIMULATION` y Doble Cerrojo de Seguridad**:
   - Invocado sin argumentos (`node scripts/recover_paper_materials_05v.cjs`), ejecuta únicamente la validación de matrices, la simulación en memoria (`simulateDryRun05V`) y la generación del script SQL de rollback (`generateRollbackSql05V`).
   - Aun pasando `--execute`, el script exige `PAPER_MATERIALS_RECOVERY_05V_APPROVED=true` y mantiene bloqueada la escritura en vivo durante la misión `05V`.
2. **Guardas Compare-and-Swap (CAS)**:
   - **Para espesores (`update_caliper`)**: exige `caliper_um IS NULL OR caliper_um = 0` en base de datos (`FOR UPDATE`) y verifica que `variant_id` no pertenezca a `HISTORICAL_9_CONFLICT_VARIANT_IDS`. Asigna siempre `caliper_confidence_status = 'REFERENCE_IMPORTED'` (nunca `VERIFIED`).
   - **Para clasificaciones (`update_classification`)**: exige `grain_direction = 'UNKNOWN'`, preserva intacto `caliper_um` antes y después de la operación y conserva trazabilidad completa en `metadata_json.ods_materials_recovery_05v`.
3. **Guarda de Producto Compartido (`allSiblingsAccredited`)**:
   - Antes de actualizar `paper_products`, comprueba que el `100 %` de las variantes asociadas a ese `product_id` estén acreditadas (`accreditedClassIds` o `eligible943VariantIds`). En las **185 variantes acreditadas en `05V`**, las 185 tienen relación `1:1` con su `product_id` (`0` productos compartidos en el lote acreditado).
4. **Invarianza Comercial y de Grano**:
   - Ninguna sentencia `UPDATE` toca `supplier_paper_offers`, precios BPE, `gsm`, `width_mm`, `height_mm` ni `grain_direction`.
5. **Reversibilidad Determinista (`generateRollbackSql05V`)**:
   - Genera una transacción SQL completa (`START TRANSACTION; ... COMMIT;`) que restaura exactamente el estado previo de `paper_products` y `paper_variants` para las 234 variantes del plan.

---

## 3. Resultado de la Simulación Dry-Run sobre el Snapshot Productivo (`1.524` Variantes)

Ejecutando `node scripts/recover_paper_materials_05v.cjs` contra el estado productivo actual (`1.524` variantes tras `RECOVERY-02` y `RECOVERY-04`):

- **Clasificaciones técnicas aplicadas en simulación**: **`185`** (pasando de `943` a **`1.128` variantes clasificadas**, `74,02 %` del catálogo).
- **Espesores aplicados en simulación**: **`65`** (pasando de `1.171` a **`1.236` variantes con espesor**, `81,10 %` del catálogo, y reduciendo los pendientes de `353` a **`288`**).
- **Conflictos históricos alterados**: **`0`**.
- **Variantes con `grain_direction != 'UNKNOWN'` alteradas en su clasificación o grano**: **`0`**.

