# BUDGET-02C-01R4V — Validación Final de Esquema y Aislamiento

**Proyecto:** PrintPrice OS Control Plane  
**Módulo:** Intelligence Layer / Quote Revisions (BUDGET-02C)  
**PR:** #8 (`feat/budget-02c01-quote-revisions`) — **DRAFT**  
**Commit Definitivo:** `0b7d0eb75080c3d9fe2df380bb4c90fe3499e98e`  
**CI Actions:** [Run 40576341359](https://github.com/PrintPriceOS/ppos-control-plane/actions/runs/40576341359) (SUCCESS)  
**Veredicto:** `BUDGET-02C01R4V_PASS`  
**Restricciones Absolutas:** NO MERGE / NO DEPLOY / NO PRODUCTION CHANGES / NO PRODUCTION DATABASE CHANGES

---

## 1. Resumen Ejecutivo

La fase **BUDGET-02C-01R4V** verifica y certifica de manera reproducible las dos garantías residuales finales del ciclo BUDGET-02C-01 sin ampliar su alcance funcional:

1. **VALIDACIÓN 1 — Contrato Real de `printhouse_profiles`**:
   - Creación de la migración formal [`migrations/169_phase196h_printhouse_profiles.sql`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/migrations/169_phase196h_printhouse_profiles.sql) con tipado canónico MySQL 8, llaves foráneas, checks de integridad y rollback verificado en [`migrations/rollback/rollback_169_phase196h_printhouse_profiles.sql`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/migrations/rollback/rollback_169_phase196h_printhouse_profiles.sql).
   - Verificación de integridad de línea base de migraciones ([`migrations/migration-integrity-baseline.json`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/migrations/migration-integrity-baseline.json)) mediante `npm run migration:integrity` (172 migraciones verificadas, 0 discrepancias).
   - Verificación de consulta real del servicio contra esquema MySQL 8 a través del script ejecutor [`scripts/test_budget02c01r4v_real_mysql_schema_and_sealing.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/scripts/test_budget02c01r4v_real_mysql_schema_and_sealing.js) e integrado en el pipeline de GitHub Actions ([`.github/workflows/ci.yml`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/.github/workflows/ci.yml)).

2. **VALIDACIÓN 2 — Integridad Obligatoria de Sello y Aislamiento de Snapshot**:
   - Imposición estricta en [`src/api/services/orderQuoteRevisionService.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/orderQuoteRevisionService.js) (`validateBpeSnapshotProvenance`) de vinculación obligatoria de `tenant_id` y `order_id` con el contexto autorizado.
   - Rechazo riguroso de registros sin `tenant_id`, sin `order_id`, con valores nulos, en blanco, o con referencias cruzadas contradictorias entre el registro sellado y el payload interno.
   - Inmutabilidad estricta post-validación mediante `deepFreeze` recursivo del payload validado, impidiendo cualquier manipulación de `rates`, `specs` o `base_net_price` antes y durante el recálculo determinista BPE.
   - Doble verificación criptográfica de checksum (`_verifiedChecksum`) al momento de evaluar el cálculo autoritativo.
   - Suite completa de regresiones adversariales (Sección 5 de [`tests/budget02c01r4_bpe_integrity_and_business_calendar.test.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/tests/budget02c01r4_bpe_integrity_and_business_calendar.test.js)).

---

## 2. VALIDACIÓN 1 — Contrato Real de `printhouse_profiles`

### 2.1 Especificación de la Migración 169

Para asegurar la existencia real y tipado del contrato en MySQL 8 efímero, se implementó la migración:
- Archivo: [`migrations/169_phase196h_printhouse_profiles.sql`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/migrations/169_phase196h_printhouse_profiles.sql)
- Rollback: [`migrations/rollback/rollback_169_phase196h_printhouse_profiles.sql`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/migrations/rollback/rollback_169_phase196h_printhouse_profiles.sql)

#### Definición DDL

```sql
CREATE TABLE IF NOT EXISTS printhouse_profiles (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL,
  printhouse_id VARCHAR(64) NOT NULL,
  target_margin_pct DECIMAL(5, 2) NOT NULL DEFAULT 15.00,
  timezone VARCHAR(64) NOT NULL DEFAULT 'Europe/Madrid',
  jurisdiction VARCHAR(16) NOT NULL DEFAULT 'ES',
  has_lunch_break TINYINT(1) NOT NULL DEFAULT 0,
  custom_holidays_json JSON NULL,
  business_hours_ttl INT NOT NULL DEFAULT 48,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  metadata_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_printhouse_profiles_printhouse UNIQUE (printhouse_id),
  CONSTRAINT chk_printhouse_profiles_margin CHECK (target_margin_pct >= 0 AND target_margin_pct <= 100),
  CONSTRAINT chk_printhouse_profiles_ttl CHECK (business_hours_ttl > 0 AND business_hours_ttl <= 720)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 2.2 Verificación de Tipos de Columna

| Columna | Tipo de Datos MySQL 8 | Nullable | Valor por Defecto | Constraint / Validación |
| :--- | :--- | :--- | :--- | :--- |
| `target_margin_pct` | `DECIMAL(5, 2)` | `NO` | `15.00` | `CHECK (>= 0 AND <= 100)` |
| `timezone` | `VARCHAR(64)` | `NO` | `'Europe/Madrid'` | Formato IANA |
| `jurisdiction` | `VARCHAR(16)` | `NO` | `'ES'` | Código de jurisdicción |
| `has_lunch_break` | `TINYINT(1)` | `NO` | `0` | Boolean (0 o 1) |
| `custom_holidays_json`| `JSON` | `YES` | `NULL` | Array JSON de strings ISO |
| `business_hours_ttl` | `INT` | `NO` | `48` | `CHECK (> 0 AND <= 720)` |

### 2.3 Ejecución de la Consulta Real del Servicio

El servicio `orderQuoteRevisionService.js` ejecuta la siguiente consulta parametrizada para resolver el perfil de imprenta:

```sql
SELECT 
  id, tenant_id, printhouse_id, target_margin_pct, timezone,
  jurisdiction, has_lunch_break, custom_holidays_json, business_hours_ttl
FROM printhouse_profiles
WHERE printhouse_id = ?
LIMIT 1;
```

El script [`scripts/test_budget02c01r4v_real_mysql_schema_and_sealing.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/scripts/test_budget02c01r4v_real_mysql_schema_and_sealing.js) ejecuta esta consulta directamente contra MySQL 8, inserta registros válidos, valida el retorno exacto de tipos numéricos y JSON, y prueba la migración de rollback (`DROP TABLE IF EXISTS printhouse_profiles`) y re-aplicación limpia.

---

## 3. VALIDACIÓN 2 — Integridad Obligatoria de Sello y Aislamiento

### 3.1 Reglas de Validación Criptográfica e Identidad de Sello

En [`src/api/services/orderQuoteRevisionService.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/orderQuoteRevisionService.js), la función `validateBpeSnapshotProvenance` audita los sellos bajo los siguientes controles inviolables:

1. **`tenant_id` obligatorio y vinculante**:
   - `!sealedRecord.tenant_id || !sealedRecord.tenant_id.trim()` $\rightarrow$ Error `MISSING_SEALED_TENANT_ID` (HTTP 422).
   - `tenantId && sealedRecord.tenant_id !== tenantId` $\rightarrow$ Error `SNAPSHOT_TENANT_MISMATCH` (HTTP 409).
2. **`order_id` obligatorio y vinculante**:
   - `!sealedRecord.order_id || !sealedRecord.order_id.trim()` $\rightarrow$ Error `MISSING_SEALED_ORDER_ID` (HTTP 422).
   - `orderId && sealedRecord.order_id !== orderId` $\rightarrow$ Error `SNAPSHOT_ORDER_MISMATCH` (HTTP 409).
3. **Coherencia interna Payload vs Sealed Record**:
   - Si el payload contiene `order_id` o `tenant_id`, deben coincidir con exactitud con los del registro sellado (`SNAPSHOT_ORDER_PAYLOAD_MISMATCH` / `SNAPSHOT_TENANT_PAYLOAD_MISMATCH`).
4. **Metadatos obligatorios de cálculo**:
   - `formula_version` obligatoria $\rightarrow$ `MISSING_SEALED_FORMULA_VERSION`.
   - `rate_card_checksum` obligatorio $\rightarrow$ `MISSING_SEALED_RATE_CARD_CHECKSUM`.
   - `final_amount` / importe numérico válido obligatorio $\rightarrow$ `MISSING_SEALED_FINAL_AMOUNT`.
   - `snapshot_checksum` obligatorio $\rightarrow$ `MISSING_SEALED_CHECKSUM`.
5. **Inmutabilidad Post-Validación (`deepFreeze`)**:
   - El payload validado es congelado recursivamente mediante `deepFreeze(validatedPayload)`.
   - Cualquier intento de mutar `rates`, `specs` o `base_net_price` produce un `TypeError: Cannot assign to read only property`.
   - Durante `recalculateDeterministicBpePrice`, se comprueba `_verifiedChecksum === calculatePricingSnapshotChecksum(...)` para garantizar cero alteración.

### 3.2 Batería de Pruebas Adversariales (Sección 5)

En [`tests/budget02c01r4_bpe_integrity_and_business_calendar.test.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/tests/budget02c01r4_bpe_integrity_and_business_calendar.test.js):

| Test ID | Condición Evaluada | Entrada / Mutación | Resultado Esperado | Estado |
| :--- | :--- | :--- | :--- | :--- |
| **5.1** | Omisión de `tenant_id` | `tenant_id: null` / `undefined` / `""` | `MISSING_SEALED_TENANT_ID` (422) | **PASS** |
| **5.2** | Omisión de `order_id` | `order_id: null` / `undefined` / `""` | `MISSING_SEALED_ORDER_ID` (422) | **PASS** |
| **5.3** | Mismatch de Tenant | `sealedRecord.tenant_id: 'tenant-intruder'` | `SNAPSHOT_TENANT_MISMATCH` (409) | **PASS** |
| **5.4** | Mismatch de Order | `sealedRecord.order_id: 'ord-unauthorized-999'` | `SNAPSHOT_ORDER_MISMATCH` (409) | **PASS** |
| **5.5** | Mismatch Payload vs Sealed | Payload `order_id: 'ord-spoofed-payload'` | `SNAPSHOT_ORDER_PAYLOAD_MISMATCH` (409) | **PASS** |
| **5.6** | Checksum Incompatible | Modificación de `base_net_price` en payload | `INVALID_SNAPSHOT_CHECKSUM` (422) | **PASS** |
| **5.7** | Omisión de Checksum | `snapshot_checksum: null` / `""` | `MISSING_SEALED_CHECKSUM` (422) | **PASS** |
| **5.8** | Omisión de Rate Card Checksum | `rate_card_checksum: null` / `""` | `MISSING_SEALED_RATE_CARD_CHECKSUM` (422) | **PASS** |
| **5.9** | Omisión de Formula Version | `formula_version: null` / `""` | `MISSING_SEALED_FORMULA_VERSION` (422) | **PASS** |
| **5.10**| Omisión de Final Amount | `final_amount: null` / `NaN` | `MISSING_SEALED_FINAL_AMOUNT` (422) | **PASS** |
| **5.11**| Inmutabilidad de Tarifas e Importes | Modificación de `rates.run_rate_per_sheet` | `TypeError` por `deepFreeze` | **PASS** |

---

## 4. Matriz de Verificación y Reproducibilidad

```
+-------------------------------------------------------------------------------+
|                      MATRIZ DE VERIFICACIÓN BUDGET-02C-01R4V                  |
+-------------------------------------------------------------------------------+
| Requisito                             | Evidencia / Comando        | Resultado|
+---------------------------------------+----------------------------+----------+
| Migración 169 DDL tipado y constraints| migrations/169_...sql      | PASS     |
| Migración 169 Rollback DDL            | migrations/rollback/169... | PASS     |
| Baseline Integrity (172 migraciones)  | npm run migration:integrity| PASS     |
| Consulta real MySQL 8 servicio        | scripts/test_budget02c...js| PASS     |
| Rechazo tenant_id / order_id ausentes | Tests 5.1, 5.2             | PASS     |
| Rechazo tenant_id / order_id alterados| Tests 5.3, 5.4, 5.5        | PASS     |
| Rechazo checksum corrupto / omitido   | Tests 5.6, 5.7             | PASS     |
| Inmutabilidad deepFreeze post-sello   | Test 5.11                  | PASS     |
| Suite completa Vitest (148 tests)     | npx vitest run             | PASS     |
| CI GitHub Actions con MySQL 8 real    | ci.yml                     | PASS     |
+-------------------------------------------------------------------------------+
```

---

## 5. Dictamen y Certificación

Habiéndose demostrado de forma reproducible:
1. El contrato DDL real de `printhouse_profiles` con todos los 6 campos requeridos, sus tipos canónicos MySQL 8 y rollback verificado.
2. La integridad obligatoria del sellado de snapshots, con enlace exacto de tenant/order y protección contra manipulación post-validación mediante inmutabilidad criptográfica y estructural.
3. Cero impacto en producción, sin merge, sin despliegue y conservando el PR #8 estrictamente en estado **DRAFT**.

Se emite formalmente el veredicto:

```
BUDGET-02C01R4V_PASS
```
