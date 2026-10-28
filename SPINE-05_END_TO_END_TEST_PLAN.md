# SPINE-05 — Plan de Pruebas de Extremo a Extremo (End-to-End Test Plan)

**Misión:** `SPINE-05 — CONTROL PLANE PRODUCTION READINESS`  
**Flujo Cubierto:** `Paper Materials → Spine Calculator → Budget App → Quote Revision → Preflight / Manufacturing Release Gate`  

---

## 1. Matriz de Pruebas Automatizadas Ejecutadas (`26/26` en Control Plane + `46/46` en Budget App)

| ID | Etapa del Flujo | Caso de Prueba | Resultado Esperado | Estado |
| :--- | :--- | :--- | :--- | :---: |
| **E2E-01** | `Paper Materials` | Exposición de `caliperUm`, `caliperMm`, `bulkFactor`, `caliperSource` y `caliperConfidenceStatus` en `GET /api/marketplace/paper-catalog` | Devuelve atributos técnicos desde `paper_variants` sin exponer costes mayoristas ni alterar tarifas BPE | **PASS** (`5.6`) |
| **E2E-02** | `Paper Materials → Reconciliation` | Conciliación de los `375` pares de Livonia (`60` bloques): familia simple (`G-Print 100g`), familia multi-bulk (`Munken Premium Cream 100g`), familia con transición no monótona (`Munken Pure 100g`) y conflicto con calibre medido (`Amber Graphic 100g`) | Clasifica en `SAFE_EXACT_MATCH` (pendiente de revisión), `AMBIGUOUS_MULTIPLE_BULK` y `CONFLICT_EXISTING_CALIPER`; cero auto-asignación sin aprobación | **PASS** (`4.1–4.5`) |
| **E2E-03** | `Spine Calculator (Math Parity)` | Los 5 ejemplos guardados del Excel de Livonia (Hojas 1 a 5), los 15 escalones de radio $R(x)$ de Colibri, las 4 ramas de hinchamiento (`Uzaugums`) y todas las ramas de hendido (`Rastri`) | Paridad matemática del `100 %` celda a celda con el Excel original | **PASS** (`1.1–3.3`) |
| **E2E-04** | `Spine Calculator (Same GSM ≠ Same Spine)` | Mismo gramaje (`100 gsm`) con distintos calibres (`98 µm`, `122 µm`, `175 µm`) en `200 pp`, `170×240 mm`, rústica cosida | Lomos de `11.5 mm`, `14.0 mm` y `20.0 mm`; cubiertas extendidas de `357.5 mm`, `360.0 mm` y `366.0 mm` | **PASS** (`2.1`, `5.4`) |
| **E2E-05** | `Server Authority (SPINE-05 Gate 1–3)` | Cliente envía `variantId: 'var_gprint_100'` intentando manipular `caliperUm: 150` o `gsm: 120` | Control Plane rechaza con `HTTP 422 CLIENT_VARIANT_CALIPER_MISMATCH` / `CLIENT_VARIANT_GSM_MISMATCH` | **PASS** (`5.7`) |
| **E2E-06** | `Server Authority (SPINE-05 Gate 3)` | Cliente declara `caliperConfidenceStatus: 'VERIFIED'` sobre una variante `REFERENCE_IMPORTED` o envía `caliperUm` sin `variantId` | Control Plane impone el estado persistido en `paper_variants` o degrada a `PROVISIONAL_ESTIMATED` (`PROVISIONAL_ESTIMATE`) | **PASS** (`5.7`) |
| **E2E-07** | `Hardcover & Flexi Governance (Gate 4 & 6)` | Petición `HARDCOVER` sin parámetros de perfil o con cartón no permitido (`1.75 mm`); petición `FLEXI_STANDARD` | Rechaza `HARDCOVER` inválido con `HTTP 422`; mantiene `HARDCOVER` válido en `REQUIRES_TECH_APPROVAL` y `FLEXI` en `EXPERIMENTAL_DISABLED` | **PASS** (`1.4`, `5.8`) |
| **E2E-08** | `Quote Revision → Spine Invalidation` | Aceptación de revisión de cotización (`OrderQuoteRevisionService.respondToQuoteRevision`) cambiando de `G-Print 100g (98 µm)` a `Munken Premium Cream 1.75 100g (175 µm)` | Invalida el snapshot anterior (`INVALIDATED`, `PAPER_QUOTE_REVISION_ACCEPTED`) y recalcula `effectiveSpecs.spine_geometry` (`11.5 mm → 20.0 mm`) consultando `paper_variants` | **PASS** (`5.5`) |
| **E2E-09** | `Preflight / Manufacturing Release Gate (Gate 5)` | Invocación de `POST /api/v1/spine/calculations/:id/verify-release` sobre snapshot `REQUIRES_TECH_APPROVAL`, `MATH_BRANCH_VALIDATED` o con calibre no `VERIFIED` | Bloquea liberación a fabricación con `HTTP 422` (`MANUFACTURING_RELEASE_BLOCKED_*`) | **PASS** (`5.8`) |
| **E2E-10** | `BPE Pricing Authority` | Ejecución completa de `verify_budget_01d_regression.js` (10 escenarios, 16 comprobaciones de precio) junto con `test_spine_04_integration.js` | `0.00 EUR` de desviación en ofertas y pedidos BPE | **PASS** |
