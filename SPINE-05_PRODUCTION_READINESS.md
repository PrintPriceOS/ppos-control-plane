# SPINE-05 — Preparación para Activación en Producción (Production Readiness)

**Misión:** `SPINE-05 — CONTROL PLANE PRODUCTION READINESS`  
**Repositorio:** `PrintPriceOS/ppos-control-plane`  
**PR de Referencia:** [PR #11 (`feat/spine-03r-caliper-and-engine`)](https://github.com/PrintPriceOS/ppos-control-plane/pull/11)  

---

## 1. Integridad de Migraciones `172` y `173` y Checksums (`Phase 183`)

| Migración | Archivo | Tamaño (`bytes`) | Checksum SHA-256 (`utf8-lf-v1`) | Verificación `npm run migration:integrity` |
| :--- | :--- | :---: | :--- | :---: |
| **`172`** | [`migrations/172_phase197a_paper_caliper_and_livonia_reference.sql`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/migrations/172_phase197a_paper_caliper_and_livonia_reference.sql) | `77,304` | `96f083c4f4e263bcc4d1616ac10a76d6dbe4e2eff04bc1d0eac04453a56daa5c` | **PASSED** (`176/176` migraciones verificadas) |
| **`173`** | [`migrations/173_phase197b_spine_binding_profiles_and_snapshots.sql`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/migrations/173_phase197b_spine_binding_profiles_and_snapshots.sql) | `5,244` | `29275551c2fc770880a4dfa66121f29859852e97bf3ec055a1118f1261b7a9ae` | **PASSED** (`176/176` migraciones verificadas) |

### Compatibilidad con el Esquema de Producción Existente (MySQL 8.0)
1. **Tabla autoritativa de variantes (`paper_variants`)**:
   - Creada en [`migrations/163_phase196b_paper_products_and_import_staging.sql`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/migrations/163_phase196b_paper_products_and_import_staging.sql#L22-L42) con `caliper_um INT NULL` y `caliper_mm DECIMAL(8, 4) NULL`.
   - La migración `172` ejecuta una ampliación **100 % aditiva y no destructiva**:
     - `MODIFY COLUMN caliper_um DECIMAL(8, 2) NULL` (conserva intactos cualesquiera enteros existentes y permite micras decimales como `67.50 µm` en *Maxi Gloss 90g*).
     - `ADD COLUMN bulk_factor DECIMAL(6, 3) NULL`
     - `ADD COLUMN caliper_source ENUM('MEASURED_MICROMETER', 'MANUFACTURER_DATASHEET', 'LIVONIA_REFERENCE_IMPORT', 'SUPPLIER_IMPORT', 'BULK_DERIVED', 'NONE') NOT NULL DEFAULT 'NONE'`
     - `ADD COLUMN caliper_confidence_status ENUM('VERIFIED', 'REFERENCE_IMPORTED', 'PROVISIONAL_ESTIMATED', 'MISSING') NOT NULL DEFAULT 'MISSING'`
     - `ADD COLUMN caliper_verified_at TIMESTAMP NULL`, `caliper_verified_by VARCHAR(64) NULL`, `caliper_revision INT NOT NULL DEFAULT 1`
2. **Cero alteración de registros comerciales o verificados en `paper_variants`**:
   - La migración `172` **no ejecuta ningún `UPDATE` ni `DELETE` sobre `paper_variants` ni `supplier_paper_offers`**. Las `1.524` variantes del catálogo comercial permanecen intactas.
3. **Aislamiento de los 375 pares de Livonia (`paper_technical_caliper_reference`)**:
   - Los `375` pares `(gsm, caliper_um)` de las `60` familias del Excel de Livonia se insertan exclusivamente en la tabla de referencia técnica `paper_technical_caliper_reference` (`INSERT IGNORE`).
   - La conciliación contra `paper_variants` se gobierna a través de `paper_caliper_reconciliation_candidates` y [`evaluateVariantCaliperReconciliation`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/spine/paperCaliperReconciliationService.js#L78-L246), impidiendo asignaciones automáticas en familias multi-bulk (*Munken Premium Cream*, *Munken Print*, *Salzer Eos*, *Lux Cream*, *Holmen Book Cream*), familias con transición de mano interna (*Munken Pure*, *Munken Lynx/Polar*) o variantes que ya posean un `caliper_um` verificado (`CONFLICT_EXISTING_CALIPER`).

---

## 2. Estado de la Pila de Pull Requests en `PrintPriceOS/ppos-control-plane`

Para activar `SPINE-05` en el servidor de producción de Control Plane de forma limpia y trazable, el repositorio mantiene la pila ordenada de PRs verificados en CI:

| Orden | PR | Rama (`headRefName` $\to$ `baseRefName`) | Contenido Principal | Migraciones |
| :---: | :---: | :--- | :--- | :---: |
| 1 | [PR #6](https://github.com/PrintPriceOS/ppos-control-plane/pull/6) | `feat/budget-01-marketplace-paper-catalog` | Catálogo público `/api/marketplace/paper-catalog` (`1.524` variantes) | `162`–`166` |
| 2 | [PR #7](https://github.com/PrintPriceOS/ppos-control-plane/pull/7) | `feat/budget-02b01-paper-decisions` | Decisiones gobernadas de papel (`order_paper_decisions`) | `167` |
| 3 | [PR #8](https://github.com/PrintPriceOS/ppos-control-plane/pull/8) | `feat/budget-02c01-quote-revisions` | Revisiones gobernadas de cotización (`order_quote_revisions`, `SEC-C01..C06`) | `168` |
| 4 | [PR #9](https://github.com/PrintPriceOS/ppos-control-plane/pull/9) | `feat/budget-02d01-e2e-remediation` | Especificaciones técnicas efectivas (`order_effective_technical_specifications`) | `169`–`171` |
| 5 | [**PR #11**](https://github.com/PrintPriceOS/ppos-control-plane/pull/11) | `feat/spine-03r-caliper-and-engine` $\to$ `feat/budget-02d01-e2e-remediation` | **Motor SpineCalculator, procedencia de espesor (`caliper_um`), snapshots y guardas `SPINE-05`** | **`172`–`173`** |

---

## 3. Verificación de Desacoplamiento Económico BPE

- BPE (`/api/marketplace/offers` y `recalculateDeterministicBpePrice` en [`orderQuoteRevisionService.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/orderQuoteRevisionService.js#L567-L795)) calcula precios exclusivamente a partir de gramaje (`gsm`), formato de pliego (`width_mm × height_mm`), tirada, páginas y tarifas congeladas por kilo (`paper_price_interior_by_kilo`).
- El motor Spine (`/api/v1/spine/*`) calcula exclusivamente geometría física (`netPaperBlockMm`, `spineWidthMm`, `flatCoverWidthMm`, `flatCoverHeightMm`, `boardWidthMm`, `leftHingeScoreMm`, `turnInMm`). **No lee ni modifica ningún campo económico ni tarifa de BPE.**
