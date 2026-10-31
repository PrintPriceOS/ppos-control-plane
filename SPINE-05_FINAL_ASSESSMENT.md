# SPINE-05 — Dictamen Final de Preparación para Activación en Producción

**Misión:** `SPINE-05 — CONTROL PLANE PRODUCTION READINESS`  
**Fecha:** `2026-10-28`  
**Estados Oficiales Emitidos:**
- **`SPINE-04R_MERGED`** (en `PrintPriceOS/PrintPricePro_BookPrice`, Merge Commit SHA: `ee5f1d8870cf79aa4fdb37f73e0e737568eb99ef`)
- **`SPINE-05_READY_FOR_PRODUCTION_APPROVAL`** (en `PrintPriceOS/ppos-control-plane`, [PR #11](https://github.com/PrintPriceOS/ppos-control-plane/pull/11))

---

## 1. Resumen Ejecutivo

1. **Merge de Budget App ([PR #3](https://github.com/PrintPriceOS/PrintPricePro_BookPrice/pull/3)) Completado (`SPINE-04R_MERGED`)**:
   - Fusionado en `main` mediante merge commit (`ee5f1d8870cf79aa4fdb37f73e0e737568eb99ef`), conservando el historial íntegro de commits.
   - El pipeline posterior al merge en `main` ([Run #40726920363](https://github.com/PrintPriceOS/PrintPricePro_BookPrice/actions/runs/40726920363)) ha finalizado en **`SUCCESS`**.
   - **No se ha desplegado Budget App en producción**, cumpliendo estrictamente el límite de autorización.

2. **Autoridad de Servidor y Seguridad en Control Plane ([PR #11](https://github.com/PrintPriceOS/ppos-control-plane/pull/11)) Reforzadas (`SPINE-05_READY_FOR_PRODUCTION_APPROVAL`)**:
   - **Verificación contra tabla real `paper_variants`**: Confirmado mediante [`migrations/163_phase196b_paper_products_and_import_staging.sql`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/migrations/163_phase196b_paper_products_and_import_staging.sql) y [`migrations/172_phase197a_paper_caliper_and_livonia_reference.sql`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/migrations/172_phase197a_paper_caliper_and_livonia_reference.sql) que el esquema canónico utiliza `paper_variants` JOIN `paper_products`.
   - **Rechazo de manipulación de `caliperUm` o `gsm` (`HTTP 422`)**: [`SpineCalculationService.calculateSpine`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/spine/spineCalculationService.js#L326-L364) contrasta cualquier `variantId` contra `paper_variants` y rechaza discrepancias con `CLIENT_VARIANT_CALIPER_MISMATCH` o `CLIENT_VARIANT_GSM_MISMATCH`.
   - **Prohibición de elevar nivel de confianza desde el cliente**: Si el cliente declara `caliperConfidenceStatus: 'VERIFIED'` sobre una variante que en `paper_variants` es `REFERENCE_IMPORTED` o `PROVISIONAL_ESTIMATED`, Control Plane impone el valor de base de datos (`CLIENT_PROVENANCE_OVERRIDDEN_BY_DB`). Si el cliente envía `caliperUm` sin `variantId`, Control Plane degrada la confianza a `PROVISIONAL_ESTIMATED` (`UNBACKED_CLIENT_CONFIDENCE_DOWNGRADED`).
   - **Gobernanza de Perfiles y Liberación Industrial (`POST /api/v1/spine/calculations/:id/verify-release`)**:
     - Tapa dura (`livonia-colibri-hardcover@2.0.0`) permanece en `REQUIRES_TECH_APPROVAL` y exige parámetros explícitos dentro de las reglas del perfil.
     - Flexibound (`livonia-colibri-flexi@2.0.0`) permanece en `EXPERIMENTAL_DISABLED` (`INVALID_BLOCKED`).
     - Ningún snapshot puede liberarse autónomamente a fabricación sin `certificationTier === 'PRODUCTION_CERTIFIED'` y `caliperConfidenceSummary === 'VERIFIED'` (no se declara `PRODUCTION_CERTIFIED` para ningún perfil hasta validación física en planta).
   - **Recorrido de Extremo a Extremo Verificado**: `OrderQuoteRevisionService.respondToQuoteRevision` invalida automáticamente el snapshot de lomo anterior al aceptar un cambio de papel y recalcula `effectiveSpecs.spine_geometry` consultando la variante autoritativa en `paper_variants`, sin usar constantes sintéticas de cubierta (`270 µm`) ni alterar la autoridad económica de BPE.
