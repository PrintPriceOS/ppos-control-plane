# SPINE-03R — Informe de Reconciliación de Historia Git, Aislamiento de PR y Certificación CI

**Misión:** `SPINE-03R — RECONCILIACIÓN DEL PR #10`  
**Repositorio:** `PrintPriceOS/ppos-control-plane`  
**Rama Limpia Acotada:** `feat/spine-03r-caliper-and-engine`  
**Rama Base Correcta de la Pila (`baseRefName`):** `feat/budget-02d01-e2e-remediation` (`564a50bceba06a6cc76bbbc6be4d091629f478eb`)  
**Dictamen:** **`SPINE-03R_PASS`**

---

## 1. Diagnóstico Exacto del Problema de Historia Git en el PR #10

### 1.1 ¿Por qué el PR #10 mostraba 1.164 commits y 6.626 archivos modificados frente a `main`?

Al inspeccionar el grafo de commits (`git rev-list` y `gh pr list --state all`) en `PrintPriceOS/ppos-control-plane`, se confirmó la estructura real de ramas del repositorio:

| Rama en `PrintPriceOS/ppos-control-plane` | HEAD SHA | Nº Total de Commits | PR Asociado | Rama Base (`baseRefName`) |
| :--- | :--- | :---: | :---: | :--- |
| `origin/main` | `d9d08e43c74217ab60824c400c86d4be02b9ebf3` | **10** | — | Bootstrap inicial v2.1.0 (sin directorio `migrations/`, sin Paper Materials, sin Quote Revision) |
| `origin/phase-39.2-tenant-management-console` | `d18a919...` | **1.026** | PRs #1–#5 (MERGED) | Troncal histórica de las Fases 10 a 195 |
| `origin/feat/paper-supplier-hub-completion` | `4c99201...` | **1.120** | — | `phase-39.2-tenant-management-console` (Migraciones `162`–`166`, `paper_variants`) |
| `origin/feat/budget-01-marketplace-paper-catalog` | `a378ff534125cb2f3ed6b4c016388bda2035254a` | **1.123** | **PR #6** (OPEN) | `feat/paper-supplier-hub-completion` (`src/api/routes/marketplacePublic.js`) |
| `origin/feat/budget-02b01-paper-decisions` | `94b205eddd22fbd5544e476d876ec37ebcad2506` | **1.129** | **PR #7** (OPEN) | `feat/budget-01-marketplace-paper-catalog` (Migración `167`, `order_paper_decisions`) |
| `origin/feat/budget-02c01-quote-revisions` | `744bdd89676c92de2c612152e1be58fe48698fd9` | **1.142** | **PR #8** (OPEN) | `feat/budget-01-marketplace-paper-catalog` (Migración `168`, `orderQuoteRevisionService.js`) |
| `origin/feat/budget-02d01-e2e-remediation` | `564a50bceba06a6cc76bbbc6be4d091629f478eb` | **1.173** | **PR #9** (OPEN) | `feat/budget-02c01-quote-revisions` (Migraciones `169`–`171`, `order_effective_technical_specifications`) |
| `origin/feat/spine-01-02-03-caliper-and-engine` | `bb285a8c29a9cfe78657d24bf0bebe9ccc99e567` | **1.174** | **PR #10** (SUPERSEDED) | Creado por error con `--base main` ($1174 - 10 = \mathbf{1.164\text{ commits}}$) |

### 1.2 Comparación de Dependencias Funcionales con `origin/main` vs `feat/budget-02d01-e2e-remediation`

Se verificó en `origin/main` (`d9d08e43c74217ab60824c400c86d4be02b9ebf3`) la existencia de las dependencias funcionales directas de `SPINE-02/03`:
1. **Directorio `migrations/` y tabla `paper_variants`:** No existen en `origin/main` (fueron introducidos en la pila `phase-39.2` $\to$ `feat/paper-supplier-hub-completion` en la migración `163_phase196b_paper_products_and_import_staging.sql`).
2. **Catálogo público `src/api/routes/marketplacePublic.js`:** No existe en `origin/main` (introducido en PR #6 `feat/budget-01-marketplace-paper-catalog`).
3. **Servicio `src/api/services/orderQuoteRevisionService.js` y tabla `order_effective_technical_specifications`:** No existen en `origin/main` (introducidos en PR #8 `feat/budget-02c01-quote-revisions` y PR #9 `feat/budget-02d01-e2e-remediation`, migraciones `168` y `170`).
4. **Cliente `src/api/services/mysqlClient.js` y RBAC `requireAdmin.js`:** En `origin/main`, `requireAdmin.js` es solo un stub de bootstrap y `mysqlClient.js` no existe.

**Conclusión arquitectónica:** Todos los PRs recientes de Control Plane (**PR #6, PR #7, PR #8, PR #9**) siguen el patrón de **Stacked PRs (PRs apilados)** donde cada fase apunta a la rama inmediatamente anterior (`feat/budget-02d01-e2e-remediation` en `564a50bceba06a6cc76bbbc6be4d091629f478eb`), preservando el 100 % de las integraciones de Paper Materials, Quote Revision, autenticación y gobernanza con **un único commit de diferencia y exactamente 24 archivos tocados**.

---

## 2. Verificación y Reconciliación del Registro de Migraciones (`Phase 183`) y MySQL 8.0

Durante la auditoría del pipeline CI de GitHub Actions sobre el commit `bb285a8c`, se detectaron y remediaron dos aspectos técnicos clave para garantizar `CI SUCCESS` en el runner efímero MySQL 8.0:

1. **Actualización del Baseline Criptográfico (`migrations/migration-integrity-baseline.json`):**
   - El verificador `scripts/run_control_plane_migrations.js` valida que cada archivo `.sql` en `migrations/` esté registrado con su hash SHA-256 canónico (`utf8-lf-v1`) en [`migrations/migration-integrity-baseline.json`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/migrations/migration-integrity-baseline.json).
   - Se registraron las migraciones `172_phase197a_paper_caliper_and_livonia_reference.sql` (`sha256: f5f1bc98...`) y `173_phase197b_spine_binding_profiles_and_snapshots.sql` (`sha256: e86087e8...`), pasando de `174` a `176` migraciones verificadas (`npm run migration:integrity` $\to$ **PASSED**).
2. **Compatibilidad Sintáctica Estricta con MySQL 8.0 en `172_phase197a_paper_caliper_and_livonia_reference.sql`:**
   - MySQL 8.0 (a diferencia de MariaDB) no soporta `ADD COLUMN IF NOT EXISTS` dentro de `ALTER TABLE`. Se normalizó la sentencia `ALTER TABLE paper_variants` a `ADD COLUMN` estándar, idéntico a las migraciones `163`–`171`.
3. **Incorporación de `tests/spine02_03_engine_and_api.test.js` al Workflow Oficial de CI (`.github/workflows/ci.yml`):**
   - Se añadió `tests/spine02_03_engine_and_api.test.js` al paso `Automated Tests Execution (Vitest)` de [`.github/workflows/ci.yml`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/.github/workflows/ci.yml) para que GitHub Actions ejecute y certifique automáticamente las 24 pruebas de `SPINE-02/03` en cada push y pull request.

---

## 3. Lista Exacta de los 24 Archivos Incluidos en el Nuevo PR Acotado

| # | Archivo | Tipo | Propósito |
| :---: | :--- | :---: | :--- |
| 1 | [`.github/workflows/ci.yml`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/.github/workflows/ci.yml) | `M` | Ejecución automática de `tests/spine02_03_engine_and_api.test.js` en GitHub Actions CI. |
| 2 | [`SPINE-01_BINDING_PROFILES_SPEC.md`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/SPINE-01_BINDING_PROFILES_SPEC.md) | `A` | Especificación de perfiles de encuadernación (`SPINE-01`). |
| 3 | [`SPINE-01_BUDGET_CONTROL_INTEGRATION.md`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/SPINE-01_BUDGET_CONTROL_INTEGRATION.md) | `A` | Diseño de integración entre Paper Materials, BPE, Spine Calculator y Control Plane (`SPINE-01`). |
| 4 | [`SPINE-01_ENGINE_CONTRACT.md`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/SPINE-01_ENGINE_CONTRACT.md) | `A` | Contrato de entrada/salida y etapas del motor (`SPINE-01`). |
| 5 | [`SPINE-01_EXCEL_FORMULA_INVENTORY.md`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/SPINE-01_EXCEL_FORMULA_INVENTORY.md) | `A` | Inventario completo de las 6 hojas y 63 controles VML del Excel de Livonia (`SPINE-01`). |
| 6 | [`SPINE-01_FINAL_ASSESSMENT.md`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/SPINE-01_FINAL_ASSESSMENT.md) | `A` | Evaluación documental de fase `SPINE-01`. |
| 7 | [`SPINE-01_PAPER_CALIPER_MAPPING.md`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/SPINE-01_PAPER_CALIPER_MAPPING.md) | `A` | Mapeo de las 60 familias y 375 pares de la hoja `Papers` de Livonia (`SPINE-01`). |
| 8 | [`SPINE-01_TEST_FIXTURES.json`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/SPINE-01_TEST_FIXTURES.json) | `A` | Fixtures JSON de los 5 ejemplos guardados del Excel y escenarios límite (`SPINE-01`). |
| 9 | [`SPINE-02_03_CALIPER_RECONCILIATION_MATRIX.md`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/SPINE-02_03_CALIPER_RECONCILIATION_MATRIX.md) | `A` | Matriz de reconciliación de los 375 pares de espesor y familias multi-bulk (`SPINE-02`). |
| 10 | [`SPINE-02_03_FINAL_REPORT.md`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/SPINE-02_03_FINAL_REPORT.md) | `A` | Informe final de implementación `SPINE-02/03`. |
| 11 | [`SPINE-02_03_LIVONIA_CORRESPONDENCE_REPORT.md`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/SPINE-02_03_LIVONIA_CORRESPONDENCE_REPORT.md) | `A` | Informe de correspondencia matemática celda a celda y separación de los 4 niveles de certificación. |
| 12 | [`SPINE-03R_GIT_RECONCILIATION_REPORT.md`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/SPINE-03R_GIT_RECONCILIATION_REPORT.md) | `A` | Este informe de reconciliación Git y aislamiento del PR (`SPINE-03R`). |
| 13 | [`migrations/172_phase197a_paper_caliper_and_livonia_reference.sql`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/migrations/172_phase197a_paper_caliper_and_livonia_reference.sql) | `A` | Migración aditiva `172` (`paper_variants` + 375 pares en `paper_technical_caliper_reference`). |
| 14 | [`migrations/173_phase197b_spine_binding_profiles_and_snapshots.sql`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/migrations/173_phase197b_spine_binding_profiles_and_snapshots.sql) | `A` | Migración aditiva `173` (`spine_binding_profiles` y `spine_calculation_snapshots`). |
| 15 | [`migrations/migration-integrity-baseline.json`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/migrations/migration-integrity-baseline.json) | `M` | Registro de checksums SHA-256 de las migraciones `172` y `173` (total: 176 migraciones). |
| 16 | [`server.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/server.js) | `M` | Montaje de `/api/v1/spine` en el puente Express/Fastify (+3 líneas). |
| 17 | [`src/api/routes/marketplacePublic.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/routes/marketplacePublic.js) | `M` | Exposición de `caliperUm`, `caliperMm`, `bulkFactor`, `caliperSource`, `caliperConfidenceStatus` y `caliperRevision`. |
| 18 | [`src/api/routes/spineRoutes.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/routes/spineRoutes.js) | `A` | Endpoints `GET /api/v1/spine/profiles`, `POST /api/v1/spine/calculate`, `GET /api/v1/spine/calculations/:id`. |
| 19 | [`src/api/services/orderQuoteRevisionService.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/orderQuoteRevisionService.js) | `M` | Invalidación obligatoria del snapshot de lomo previo y recálculo de `effectiveSpecs.spine_geometry` al aceptar cambio de papel. |
| 20 | [`src/api/services/spine/livoniaPaperReferenceData.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/spine/livoniaPaperReferenceData.js) | `A` | Dataset inmutable de los 375 pares `(gsm, caliper_um)` y 60 bloques de Livonia. |
| 21 | [`src/api/services/spine/paperCaliperReconciliationService.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/spine/paperCaliperReconciliationService.js) | `A` | Servicio de reconciliación y resolución de procedencia de espesor. |
| 22 | [`src/api/services/spine/spineCalculationEngine.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/spine/spineCalculationEngine.js) | `A` | Motor matemático puro `SpineCalculator` (5 etapas, 15 radios, 4 ramas `Uzaugums`, `Rastri`, 4 niveles de certificación). |
| 23 | [`src/api/services/spine/spineCalculationService.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/spine/spineCalculationService.js) | `A` | Servicio de dominio con resolución autoritativa de perfil por tenant/imprenta, snapshots e idempotencia. |
| 24 | [`tests/spine02_03_engine_and_api.test.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/tests/spine02_03_engine_and_api.test.js) | `A` | Suite completa de 24 pruebas automatizadas de `SPINE-02/03`. |

