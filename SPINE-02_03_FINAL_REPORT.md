# SPINE-02/03 — Informe Final de Implementación, Certificación y Trazabilidad

**Misión:** `SPINE-02/03 — PAPER CALIPER + CONTROL PLANE SPINE ENGINE` (incluyendo consolidación de `SPINE-01`)  
**Repositorio Principal:** `PrintPriceOS/ppos-control-plane`  
**Fuente Matemática Original:** `Livonia print spine calculator 2.0 iekšējā lietošana.xlsx`  
**Dictamen Final de la Misión:** **`SPINE-02_03_PASS`**

---

## 1. Resumen Ejecutivo por Fase

| Fase | Alcance Requerido | Implementación Entregada | Estado |
| :--- | :--- | :--- | :---: |
| **FASE 1 — Consolidar `SPINE-01` en GitHub** | Incorporar los 7 entregables de `SPINE-01` al repositorio Control Plane distinguiendo explícitamente los 4 niveles de certificación (`EXCEL_EXAMPLE_PARITY`, `MATH_BRANCH_VALIDATED`, `PRINTHOUSE_TECHNICALLY_VALIDATED`, `PRODUCTION_CERTIFIED`). | Los 7 documentos y fixtures (`SPINE-01_*.md` y [`SPINE-01_TEST_FIXTURES.json`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/SPINE-01_TEST_FIXTURES.json)) están consolidados en la rama junto con [`CERTIFICATION_TIERS`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/spine/spineCalculationEngine.js#L35-L41). | **PASS** |
| **FASE 2 — Modelo de Espesor de Papel (`SPINE-02`)** | Migración aditiva sobre `paper_variants`, biblioteca técnica de referencia con los 375 pares de Livonia y reconciliación sin auto-asignación ni sobrescritura. | [`migrations/172_phase197a_paper_caliper_and_livonia_reference.sql`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/migrations/172_phase197a_paper_caliper_and_livonia_reference.sql), [`livoniaPaperReferenceData.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/spine/livoniaPaperReferenceData.js) y [`paperCaliperReconciliationService.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/spine/paperCaliperReconciliationService.js). | **PASS** |
| **FASE 3 — Motor `SpineCalculator` (`SPINE-03`)** | Funciones puras por etapas, redondeos compatibles con Excel (`CEILING.MATH`, `FLOOR.MATH`, `MROUND` a `0.5 mm`), perfiles versionados, Flexi deshabilitado, Tapa Dura sujeta a aprobación técnica. | [`src/api/services/spine/spineCalculationEngine.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/spine/spineCalculationEngine.js) con las 5 etapas puras, los 15 escalones de radio $R(x)$, las 4 ramas de `Uzaugums` y las tablas `Rastri`. | **PASS** |
| **FASE 4 — API en Control Plane** | Endpoints versionados (`POST /api/v1/spine/calculate`, `GET /api/v1/spine/profiles`, `GET /api/v1/spine/calculations/:id`) con Auth, RBAC, aislamiento multi-tenant e idempotencia. | [`src/api/routes/spineRoutes.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/routes/spineRoutes.js) montado en [`server.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/server.js#L384-L418) y exposición de espesor en [`marketplacePublic.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/routes/marketplacePublic.js#L211-L240). | **PASS** |
| **FASE 5 — Persistencia y Trazabilidad** | Snapshots inmutables (`spine_calculation_snapshots`), invalidación automática ante cambios de papel/páginas/encuadernación y en aceptación de Quote Revision. | [`migrations/173_phase197b_spine_binding_profiles_and_snapshots.sql`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/migrations/173_phase197b_spine_binding_profiles_and_snapshots.sql), [`spineCalculationService.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/spine/spineCalculationService.js) e integración en [`orderQuoteRevisionService.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/orderQuoteRevisionService.js#L2160-L2231). | **PASS** |
| **FASE 6 — Pruebas Automatizadas** | Ejecutar y pasar pruebas cubriendo los 9 bloques obligatorios y las suites de regresión de Paper Decisions y Quote Revision. | [`tests/spine02_03_engine_and_api.test.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/tests/spine02_03_engine_and_api.test.js): **24/24 tests PASS** (`76/76` tests totales incluyendo regresiones `budget02b01` y `budget02c01r`). | **PASS** |

---

## 2. Arquitectura Entregada y Contratos API

### 2.1 Migraciones SQL Aditivas (Sin Ejecución en Producción)
1. [`migrations/172_phase197a_paper_caliper_and_livonia_reference.sql`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/migrations/172_phase197a_paper_caliper_and_livonia_reference.sql):
   - Extiende `paper_variants` con `caliper_um DECIMAL(8,2)`, `bulk_factor DECIMAL(6,3)`, `caliper_source`, `caliper_confidence_status`, `caliper_verified_at`, `caliper_verified_by`, `caliper_revision`.
   - Crea `paper_technical_caliper_reference` y siembra de forma idempotente los **375 pares `(gsm, caliper_um)`** (60 bloques) de Livonia.
   - Crea `paper_caliper_reconciliation_candidates` para gobernar las propuestas de reconciliación sin auto-asignar ni sobrescribir datos verificados.
2. [`migrations/173_phase197b_spine_binding_profiles_and_snapshots.sql`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/migrations/173_phase197b_spine_binding_profiles_and_snapshots.sql):
   - Crea `spine_binding_profiles` con separación explícita entre `operational_status` (`PRODUCTION_CERTIFIED`, `MATH_VALIDATED_ACTIVE`, `REQUIRES_TECH_APPROVAL`, `EXPERIMENTAL_DISABLED`, `DEPRECATED`) y `certification_tier` (`EXCEL_EXAMPLE_PARITY`, `MATH_BRANCH_VALIDATED`, `PRINTHOUSE_TECHNICALLY_VALIDATED`, `PRODUCTION_CERTIFIED`).
   - Crea `spine_calculation_snapshots` con huella canónica de entrada (`input_canonical_hash`), huella de salida (`output_canonical_hash`), `idempotency_key` único por tenant y ciclo de vida (`ACTIVE`, `SUPERSEDED`, `INVALIDATED`).

### 2.2 Endpoints Protegidos en Control Plane (`/api/v1/spine`)
- **`GET /api/v1/spine/profiles`**
  - Requiere autenticación y RBAC (`requireAdmin`).
  - Rechaza cualquier intento de suplantación de `tenantId` (`403 FORBIDDEN_TENANT_MISMATCH`).
  - Devuelve los perfiles autorizados para el tenant/imprenta, excluyendo por defecto los perfiles `EXPERIMENTAL_DISABLED` (`livonia-colibri-flexi@2.0.0`).
- **`POST /api/v1/spine/calculate`**
  - Requiere autenticación, RBAC y soporta cabecera `Idempotency-Key` (o `idempotencyKey` en body).
  - Resuelve el perfil de encuadernación desde la configuración autorizada del tenant/imprenta (nunca únicamente por elección libre del cliente).
  - Si un segmento referencia `variantId` del catálogo, resuelve autoritativamente `caliper_um`, `caliper_source` y `caliper_confidence_status` desde `paper_variants`.
  - Si `persistSnapshot: true` o se adjunta `externalOrderIntentId` / `canonicalOrderId` / `Idempotency-Key`, persiste el snapshot inmutable y marca automáticamente como `SUPERSEDED` cualquier snapshot `ACTIVE` previo del mismo pedido.
  - Si se reutiliza el mismo `Idempotency-Key` con parámetros alterados (p. ej. distinto número de páginas o papel), devuelve `409 IDEMPOTENCY_KEY_COLLISION`.
- **`GET /api/v1/spine/calculations/:id`**
  - Recupera un snapshot inmutable verificando aislamiento estricto de tenant (`403 FORBIDDEN_TENANT_MISMATCH` si otro tenant intenta leerlo).

### 2.3 Invalidación Obligatoria en `orderQuoteRevisionService.js`
En [`src/api/services/orderQuoteRevisionService.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/orderQuoteRevisionService.js#L2160-L2231), cuando un cliente acepta una revisión de cotización por cambio de papel (`decision === 'ACCEPT'`):
1. Se marca `effectiveSpecs.previous_spine_geometry_invalidated = true`.
2. Se invalidan en base de datos todos los snapshots activos en `spine_calculation_snapshots` asociados al pedido con `snapshot_lifecycle_status = 'INVALIDATED'` e `invalidation_reason = 'PAPER_QUOTE_REVISION_ACCEPTED'`.
3. Se resuelve la procedencia de espesor (`resolveVariantCaliperProvenance`) de la variante alternativa aceptada y se recalcula `effectiveSpecs.spine_geometry` con el nuevo `caliper_um` (o se marca `spine_recalculation_required = true` si la variante aún no tiene espesor acreditado).
4. **Invariante garantizado:** Jamás se conservan dimensiones de lomo o cubierta calculadas con el papel sustituido.

---

## 3. Resultados de Pruebas Automatizadas (Fase 6)

Ejecución verificada mediante `npx vitest run tests/spine02_03_engine_and_api.test.js tests/budget02b01_order_paper_decisions.test.js tests/budget02c01r_security_and_bpe_adversarial.test.js`:

| Bloque de Prueba Requerido | Test(s) en `tests/spine02_03_engine_and_api.test.js` | Resultado |
| :--- | :--- | :---: |
| **1. Los 5 ejemplos guardados del Excel** | `1.1`, `1.2`, `1.3`, `1.4` (paridad celda a celda en hojas 1 a 5) | **PASS** |
| **2. Los 7 escenarios complementarios de `SPINE-01`** | `2.1` a `2.6` (combinación de 2 papeles, páginas impares, solapa excesiva, bloque $>78\text{ mm}$, variante sin `caliper_um`) | **PASS** |
| **3. Cobertura de ramas y límites** | `3.1` (los 15 radios $R(x)$ y overflow $>78\text{ mm}$), `3.2` (las 4 ramas de `Uzaugums` y warning $>29\text{ mm}`), `3.3` (todas las ramas de `Rastri`, cartones y cejas) | **PASS** |
| **4. Mismo gramaje, distinto espesor y distinto lomo** | `2.1` (`100 gsm` en G-Print $98\,\mu\text{m} \to 11.5\text{ mm}$, Amber Graphic $122\,\mu\text{m} \to 14.0\text{ mm}$, Munken $1.75$ $175\,\mu\text{m} \to 20.0\text{ mm}$) | **PASS** |
| **5. Variantes sin espesor acreditado y reconciliación** | `2.6`, `4.1` (375 pares / 60 bloques), `4.2` (`SAFE_EXACT_MATCH`), `4.3` (`AMBIGUOUS_MULTIPLE_BULK`), `4.4` (resolución con mano explícita), `4.5` (`CONFLICT_EXISTING_CALIPER` no sobrescribe) | **PASS** |
| **6. Aislamiento por tenant** | `5.3` (`403 FORBIDDEN_TENANT_MISMATCH` en `POST /calculate` y `GET /calculations/:id`) | **PASS** |
| **7. Invalidación por cambio de papel en Quote Revision** | `5.4` y `5.5` (aceptación E2E en `OrderQuoteRevisionService` invalida el snapshot previo de $11.5\text{ mm}$ / cubierta $357.5\text{ mm}$ y recalcula $20.0\text{ mm}$ / cubierta $366.0\text{ mm}$) | **PASS** |
| **8. Concurrencia e idempotencia** | `5.2` (replay idempotente devuelve `200` con `idempotentReplay: true`; mutación con misma clave devuelve `409 IDEMPOTENCY_KEY_COLLISION`) | **PASS** |
| **9. Compatibilidad con Paper Materials y BPE** | `5.6` (`GET /api/marketplace/paper-catalog` expone `caliperUm`, `caliperMm`, `bulkFactor`, `caliperSource`, `caliperConfidenceStatus` sin alterar precios BPE) + suites `budget02b01` (28 tests) y `budget02c01r` (24 tests) | **PASS** |

---

## 4. Cumplimiento de Restricciones Operativas

- **Cero despliegue en producción:** No se ha desplegado código en producción ni reiniciado contenedores productivos.
- **Cero migración sobre BD productiva:** Las migraciones `172` y `173` están entregadas en el repositorio como SQL aditivo y no se han ejecutado contra la base de datos de producción.
- **Cero alteración de tarifas BPE:** `BPE` conserva el 100 % de la autoridad económica; `SpineCalculator` calcula exclusivamente geometría física de encuadernación.
- **Gobierno industrial intacto:** `livonia-colibri-flexi@2.0.0` permanece en `EXPERIMENTAL_DISABLED`, `livonia-colibri-hardcover@2.0.0` en `REQUIRES_TECH_APPROVAL`, y ningún perfil habilita fabricación autónoma sin `PRODUCTION_CERTIFIED` + espesor `VERIFIED`.
