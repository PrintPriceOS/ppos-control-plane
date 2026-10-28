# SPINE-05 — Auditoría de Autoridad de Servidor y Seguridad Técnica

**Misión:** `SPINE-05 — CONTROL PLANE PRODUCTION READINESS`  
**Repositorio:** `PrintPriceOS/ppos-control-plane`  
**PR de Referencia:** [PR #11 (`feat/spine-03r-caliper-and-engine`)](https://github.com/PrintPriceOS/ppos-control-plane/pull/11)  

---

## 1. Verificación del Nombre Real de la Tabla Autoritativa de Variantes

Se inspeccionaron las migraciones productivas del esquema de Paper Materials en `migrations/`:
- [`migrations/163_phase196b_paper_products_and_import_staging.sql`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/migrations/163_phase196b_paper_products_and_import_staging.sql#L22-L42): define la tabla canónica **`paper_variants`** (`id`, `product_id`, `gsm`, `caliper_um`, `caliper_mm`, `width_mm`, `height_mm`, `finish`, `grain_direction`, `fingerprint`) vinculada por clave foránea a **`paper_products`**.
- [`migrations/172_phase197a_paper_caliper_and_livonia_reference.sql`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/migrations/172_phase197a_paper_caliper_and_livonia_reference.sql#L14-L21): extiende aditivamente **`paper_variants`** con `caliper_um DECIMAL(8, 2) NULL`, `bulk_factor`, `caliper_source`, `caliper_confidence_status`, `caliper_verified_at`, `caliper_verified_by` y `caliper_revision`.
- **Confirmación:** El código de [`SpineCalculationService.resolveCatalogVariantProvenance`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/spine/spineCalculationService.js#L211-L245) y [`OrderQuoteRevisionService.respondToQuoteRevision`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/orderQuoteRevisionService.js#L2164-L2178) consulta exclusivamente **`paper_variants` JOIN `paper_products`**. No existe ninguna referencia huérfana a `paper_product_variants`.

---

## 2. Las 6 Guardas de Autoridad de Servidor Verificadas y Reforzadas en Control Plane

### Guarda 1 — Resolución obligatoria de `variantId` contra `paper_variants`
- En [`SpineCalculationService.resolveCatalogVariantProvenance`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/spine/spineCalculationService.js#L211-L245), todo `variantId` enviado en `segments[]` o `cover` se busca en `paper_variants`. Si no existe, el servidor responde inmediatamente con `HTTP 404` (`PAPER_VARIANT_NOT_FOUND`).

### Guarda 2 — Obtención de `caliper_um`, procedencia y confianza desde la base de datos
- El espesor (`caliper_um`), factor de mano (`bulk_factor`), origen (`caliper_source`) y nivel de confianza (`caliper_confidence_status`) se extraen del registro persistido en `paper_variants` a través de [`resolveVariantCaliperProvenance`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/spine/paperCaliperReconciliationService.js#L252-L315).
- En [`paperCaliperReconciliationService.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/spine/paperCaliperReconciliationService.js#L283-L306), se eliminó cualquier asunción de `SUPPLIER_IMPORT` por defecto cuando `caliper_source` es `NONE` o nulo, y se impide que un registro sin fuente `MEASURED_MICROMETER` o `MANUFACTURER_DATASHEET` conserve `caliperConfidenceStatus = 'VERIFIED'`.

### Guarda 3 — Rechazo o degradación de discrepancias entre cliente y base de datos
En [`SpineCalculationService.calculateSpine`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/spine/spineCalculationService.js#L311-L466):
1. **Discrepancia en `caliperUm` sobre variante persistida (`variantId`)**: Si el cliente envía `caliperUm` distinto del valor persistido en `paper_variants` ($|\Delta| > 0.01\,\mu\text{m}$), Control Plane rechaza la petición con **`HTTP 422 CLIENT_VARIANT_CALIPER_MISMATCH`** (o `CLIENT_COVER_CALIPER_MISMATCH` en cubierta).
2. **Discrepancia en `gsm` sobre variante persistida (`variantId`)**: Si el cliente envía `gsm` distinto del persistido en `paper_variants`, Control Plane rechaza la petición con **`HTTP 422 CLIENT_VARIANT_GSM_MISMATCH`**.
3. **Intento de elevar confianza sobre variante persistida (`variantId`)**: Si el cliente envía `caliperConfidenceStatus: 'VERIFIED'` pero en `paper_variants` la variante figura como `REFERENCE_IMPORTED` o `PROVISIONAL_ESTIMATED`, Control Plane impone el estado de la base de datos y registra el aviso `CLIENT_PROVENANCE_OVERRIDDEN_BY_DB`.
4. **Envío de `caliperUm` manual sin `variantId` reclamando `VERIFIED`**: Si el cliente omite `variantId` y declara `caliperConfidenceStatus: 'VERIFIED'` o `REFERENCE_IMPORTED`, Control Plane degrada forzosamente el segmento a `caliperSource: 'NONE'` y `caliperConfidenceStatus: 'PROVISIONAL_ESTIMATED'`, emitiendo `UNBACKED_CLIENT_CONFIDENCE_DOWNGRADED` y situando el resultado en `PROVISIONAL_ESTIMATE`.

### Guarda 4 — Resolución de perfiles industriales y validación de parámetros de tapa dura
- [`SpineCalculationService.resolveAuthoritativeProfile`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/spine/spineCalculationService.js#L131-L205) resuelve el perfil desde `spine_binding_profiles` para el `(tenant_id, printhouse_id, bindingCategory)` o el perfil builtin autorizado (`livonia-alegro-softcover@2.0.0`, `livonia-colibri-hardcover@2.0.0`, `livonia-colibri-flexi@2.0.0`). Cualquier intento de forzar un perfil incompatible devuelve `HTTP 422 UNAUTHORIZED_PROFILE_SELECTION`.
- `GET /api/v1/spine/profiles` expone las reglas autoritativas (`rules`) de cada perfil.
- Para `HARDCOVER`, [`SpineCalculationService.calculateSpine`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/spine/spineCalculationService.js#L468-L518) exige parámetros explícitos de tapa dura y valida que `boardThicknessMm` $\in [1.0, 2.0, 2.4, 3.0]$, `overhangMm` $\in [2.5, 3.0]$ y `foldingSignaturePages` $\in [16, 32]$ según las reglas del perfil (`HTTP 422 HARDCOVER_PROFILE_PARAMETERS_REQUIRED` / `INVALID_HARDCOVER_BOARD_THICKNESS`).

### Guarda 5 — Bloqueo de liberación industrial (`verifySnapshotForManufacturingRelease`)
- Se implementó [`SpineCalculationService.verifySnapshotForManufacturingRelease`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/spine/spineCalculationService.js#L702-L788) y el endpoint protegido `POST /api/v1/spine/calculations/:id/verify-release` en [`spineRoutes.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/routes/spineRoutes.js#L189-L220).
- Rechaza la liberación a fabricación (`HTTP 409` / `HTTP 422`) si:
  - El snapshot no está `ACTIVE` (`SUPERSEDED` o `INVALIDATED` $\to$ `MANUFACTURING_RELEASE_BLOCKED_INACTIVE_SNAPSHOT`).
  - El perfil está en `REQUIRES_TECH_APPROVAL` o `EXPERIMENTAL_DISABLED` ($\to$ `MANUFACTURING_RELEASE_BLOCKED_PROFILE_APPROVAL_REQUIRED`).
  - El perfil no tiene `certificationTier === 'PRODUCTION_CERTIFIED'` ($\to$ `MANUFACTURING_RELEASE_BLOCKED_UNCERTIFIED_PROFILE`).
  - El resumen de confianza de calibre no es `VERIFIED` o `canReleaseToManufacturing !== true` ($\to$ `MANUFACTURING_RELEASE_BLOCKED_UNVERIFIED_CALIPER`).

### Guarda 6 — Tapa dura bajo aprobación técnica y Flexi deshabilitado
- `livonia-colibri-hardcover@2.0.0`: `operationalStatus = 'REQUIRES_TECH_APPROVAL'`, `canReleaseToManufacturing = false`.
- `livonia-colibri-flexi@2.0.0`: `operationalStatus = 'EXPERIMENTAL_DISABLED'`, `validation_status = 'INVALID_BLOCKED'`, `spineWidthMm = null`.
