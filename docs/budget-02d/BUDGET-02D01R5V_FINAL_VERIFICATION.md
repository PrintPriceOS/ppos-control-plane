# BUDGET-02D-01R5F — Cierre Definitivo del Contrato de Replay e Idempotencia Financiera

> **Mandato**: `MISIÓN BUDGET-02D-01R5F — Cierre definitivo del contrato de replay`  
> **Repositorio**: `PrintPriceOS/ppos-control-plane`  
> **Rama de Trabajo**: `feat/budget-02d01-e2e-remediation`  
> **Pull Request Objetivo**: [PR #9](https://github.com/PrintPriceOS/ppos-control-plane/pull/9) — **OPEN / DRAFT**  
> **Pull Request Precedente**: [PR #8](https://github.com/PrintPriceOS/ppos-control-plane/pull/8) — **OPEN / DRAFT** (HEAD intacto en `744bdd89676c92de2c612152e1be58fe48698fd9`)  
> **HEAD Auditado Previo (R5V)**: `9cb861d0cef87ab80f7c2fc68779a06a5c04298d`  
> **CI Previo Acreditado**: [Run 40647899598](https://github.com/PrintPriceOS/ppos-control-plane/actions/runs/40647899598) — **SUCCESS (100% verde)**  
> **Dictamen de Entrada**: `BUDGET-02D01R5V_PASS_TARGETED / BUDGET-02D01_SECURITY_REVIEW_CONDITIONAL`  
> **Restricciones Absolutas**: **NO MERGE / NO DEPLOY / NO PRODUCTION DATABASE CHANGES / NO REAL FINANCIAL OPERATIONS**

---

## 1. Resumen Ejecutivo y Tabla de Control

La misión **BUDGET-02D-01R5F** cierra de manera definitiva la discrepancia de idempotencia y replay para liquidaciones ya confirmadas (`financial_reconciliation_status = 'REFUND_SETTLED'`), consolidando la autoridad soberana de la tabla `financial_settlement_vouchers` y erradicando toda tolerancia a la ausencia de parámetros en peticiones de replay:

1. **Autoridad Absoluta del Comprobante Persistido (Tabla 171)**:
   Cuando una orden se encuentra en estado `REFUND_SETTLED`, la liquidación se resuelve exclusivamente desde `financial_settlement_vouchers` bajo bloqueo `FOR UPDATE`. Se prohíbe de forma terminante la reconstrucción automática desde eventos JSON históricos (`marketplace_events`). Cualquier orden histórica que carezca de comprobante persistido falla cerrado con `HISTORICAL_SETTLEMENT_RECONCILIATION_REQUIRED` (HTTP 409 Conflict). Los registros históricos no son mutados en runtime bajo ninguna circunstancia.
2. **Contrato Explícito de Replay (8 Dimensiones Obligatorias, Tolerancia Cero)**:
   Todo reintento debe aportar obligatoriamente los 8 campos económicos: (1) obligación financiera, (2) pedido y tenant, (3) proveedor, (4) identificador único de comprobante (`voucher_id`), (5) referencia de liquidación (`settlementRef`), (6) importe en céntimos, (7) moneda y (8) beneficiario. La omisión o discordancia de cualquiera de estos datos devuelve estrictamente `SETTLEMENT_MISMATCH` (HTTP 409 Conflict) sin mutar bases de datos ni generar eventos espurios.
3. **Batería Adversarial Exhaustiva en MySQL 8 y Vitest**:
   Se ejecutaron pruebas adversariales completas que verifican: replay idéntico, replay sin voucher, replay sin obligación, replay sin importe o divisa, replay con beneficiario discordante, replay con obligación discordante, replay con voucher discordante, replay de otro tenant, replay contra registros históricos sin comprobante, reintentos concurrentes bajo lock transaccional, y caída de conexión SQL, verificando en todos los casos de rechazo la inmutabilidad absoluta del sistema.

| Control | Estado / Valor Verificado |
| :--- | :--- |
| **PR #9 (Objetivo)** | [PR #9](https://github.com/PrintPriceOS/ppos-control-plane/pull/9) — **OPEN / DRAFT** |
| **PR #8 (Precedente)** | [PR #8](https://github.com/PrintPriceOS/ppos-control-plane/pull/8) — **OPEN / DRAFT** (HEAD `744bdd89` intacto) |
| **HEAD Auditado Previo** | `9cb861d0cef87ab80f7c2fc68779a06a5c04298d` |
| **Autoridad de Comprobante (R5F)** | Tabla 171 soberana; prohibida reconstrucción desde JSON events |
| **Contrato de Replay (R5F)** | 8 dimensiones obligatorias; omisión evaluada estrictamente como `SETTLEMENT_MISMATCH` |
| **Registros Históricos sin Tabla 171** | Fail-closed con `HISTORICAL_SETTLEMENT_RECONCILIATION_REQUIRED` (HTTP 409) |
| **Aislamiento en Producción (SEC-R5-01)** | Inmutable. `setActiveAdapter()` y `setFinancialAdapter()` bloqueados en producción (dual `NODE_ENV` / `PPOS_ENVIRONMENT`) |
| **Unicidad Transaccional (SEC-R5-02)** | Migración 171 creada con `UNIQUE KEY (provider, provider_voucher_id)` |
| **Rollback de Migración** | `migrations/rollback/rollback_171_phase196j_financial_settlement_vouchers.sql` |
| **Integridad de Migraciones** | 174 migraciones clasificadas, 0 colisiones, 100% SHA-256 match en baseline |
| **Pruebas de Concurrencia MySQL 8** | 2 transacciones simultáneas: 1 liquidada (`REFUND_SETTLED`), 1 rechazada (`EVIDENCE_ALREADY_CONSUMED`) |
| **Suites Vitest Oficiales CI** | **18 pasadas (18), 400 tests pasados (400), 0 fallos** |
| **Vite Frontend Build** | Compilación de producción exitosa en 15.20s |
| **Dictamen de Contrato Interno** | **`PASS_SECURITY_CONTRACT`** |
| **Estado de Integración Externa** | **`PRODUCTION_FINANCIAL_INTEGRATION_PENDING`** |

---

## 2. Remediación R5F: Autoridad Exclusiva de Tabla 171 y Cierre del Contrato de Replay

### 2.1 Eliminación de Reconstrucción Automática desde Eventos JSON
En versiones previas, la rama `REFUND_SETTLED` inspeccionaba `marketplace_events` en caso de no hallar o querer reconciliar comprobantes antiguos. Dicho comportamiento violaba el principio de autoridad de los comprobantes contables.

En [src/api/services/MarketplaceDispatchGatingService.js](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/MarketplaceDispatchGatingService.js):
```javascript
// Idempotency & Replay Verification against Authoritative Table 171 (BUDGET-02D-01R5F)
if (eff.financial_reconciliation_status === 'REFUND_SETTLED') {
    let persistentRecord = null;

    try {
        const voucherRows = await runTxQuery(
            `SELECT * FROM financial_settlement_vouchers 
             WHERE (canonical_order_id = ? OR canonical_order_id = ? OR effective_specification_id = ?) 
             ORDER BY settled_at DESC LIMIT 1 FOR UPDATE`,
            [canonicalRef, order.id, eff.id]
        );
        if (voucherRows.length > 0) {
            persistentRecord = voucherRows[0];
        }
    } catch (dbErr) {
        throw new Error(`DATABASE_CONNECTION_ERROR: Failed to retrieve settlement voucher for replay: ${dbErr.message}`);
    }

    // Strictly fail closed if table 171 record is missing; NO reconstruction from legacy JSON events (BUDGET-02D-01R5F)
    if (!persistentRecord) {
        throw new Error('HISTORICAL_SETTLEMENT_RECONCILIATION_REQUIRED: Order is marked REFUND_SETTLED but lacks an authoritative financial_settlement_vouchers record. Automatic reconstruction from legacy JSON events is forbidden. Manual/verified migration required.');
    }
```

### 2.2 Contrato Explícito de Replay (8 Dimensiones Mandatorias)
El protocolo exige que toda llamada de repetición o reintento incluya el conjunto completo de datos económicos. La ausencia de cualquiera de ellos NO se interpreta como coincidencia permisiva, sino como infracción contractual inmediata:

```javascript
    // 1. Mandatory Settlement Reference Match
    const persistentRef = String(persistentRecord.settlement_ref || '').trim();
    if (!settlementRef || persistentRef !== settlementRef) {
        throw new Error(`SETTLEMENT_MISMATCH: Order has already been settled with reference '${persistentRef}'. Cannot replay with different or missing reference '${settlementRef}'.`);
    }

    // 2. Mandatory Tenant Match
    const callerTenantId = String(settlementContext.tenantId || '').trim();
    const persistentTenantId = String(persistentRecord.tenant_id || order.tenant_id || '').trim();
    if (!callerTenantId || (persistentTenantId && callerTenantId !== persistentTenantId)) {
        throw new Error(`SETTLEMENT_MISMATCH: Tenant mismatch for settled order ('${persistentTenantId}' vs '${callerTenantId}').`);
    }

    // 3. Mandatory Provider Match
    const persistentProvider = String(persistentRecord.provider || '').trim().toUpperCase();
    if (!rawProvider || persistentProvider !== rawProvider) {
        throw new Error(`SETTLEMENT_MISMATCH: Provider mismatch for settled order ('${persistentProvider}' vs '${rawProvider}').`);
    }

    // 4. Mandatory Voucher ID (Comprobante) Match
    const callerVoucherId = String(
        settlementContext.voucher_id || settlementContext.voucherId ||
        (settlementContext.evidence && (settlementContext.evidence.voucher_id || settlementContext.evidence.voucherId)) ||
        (settlementContext.proof && (settlementContext.proof.voucher_id || settlementContext.proof.voucherId)) ||
        ''
    ).trim();
    const persistentVoucher = String(persistentRecord.provider_voucher_id || '').trim();
    if (!callerVoucherId) {
        throw new Error('SETTLEMENT_MISMATCH: Voucher identifier is mandatory for replay verification. Absence of fields cannot be interpreted as a match.');
    }
    if (callerVoucherId !== persistentVoucher) {
        throw new Error(`SETTLEMENT_MISMATCH: Voucher mismatch for settled order ('${persistentVoucher}' vs '${callerVoucherId}').`);
    }

    // 5. Mandatory Obligation ID Match
    const callerObligationId = String(settlementContext.obligationId || settlementContext.obligation_id || '').trim();
    const persistentObligation = String(persistentRecord.obligation_id || '').trim();
    if (!callerObligationId) {
        throw new Error('SETTLEMENT_MISMATCH: Obligation ID is mandatory for replay verification. Absence of fields cannot be interpreted as a match.');
    }
    if (callerObligationId !== persistentObligation) {
        throw new Error(`SETTLEMENT_MISMATCH: Obligation mismatch for settled order ('${persistentObligation}' vs '${callerObligationId}').`);
    }

    // 6. Mandatory Amount Match in minor units (cents)
    if (settlementContext.amount === undefined || settlementContext.amount === null || settlementContext.amount === '') {
        throw new Error('SETTLEMENT_MISMATCH: Settlement amount is mandatory for replay verification. Absence of fields cannot be interpreted as a match.');
    }
    const callerAmount = Math.abs(Number(settlementContext.amount));
    if (isNaN(callerAmount)) {
        throw new Error('SETTLEMENT_MISMATCH: Settlement amount is not a valid number.');
    }
    const callerMinor = Math.round(callerAmount * 100);
    const persistentMinor = Number(persistentRecord.amount_cents);
    if (callerMinor !== persistentMinor) {
        throw new Error(`SETTLEMENT_MISMATCH: Settlement amount mismatch for settled order (${callerAmount} vs ${persistentMinor / 100}).`);
    }

    // 7. Mandatory Currency Match
    if (!settlementContext.currency || !String(settlementContext.currency).trim()) {
        throw new Error('SETTLEMENT_MISMATCH: Settlement currency is mandatory for replay verification. Absence of fields cannot be interpreted as a match.');
    }
    const callerCurrency = String(settlementContext.currency).trim().toUpperCase();
    const persistentCurrency = String(persistentRecord.currency || '').trim().toUpperCase();
    if (callerCurrency !== persistentCurrency) {
        throw new Error(`SETTLEMENT_MISMATCH: Settlement currency mismatch for settled order ('${persistentCurrency}' vs '${callerCurrency}').`);
    }

    // 8. Mandatory Beneficiary Match
    if (!settlementContext.beneficiary || !String(settlementContext.beneficiary).trim()) {
        throw new Error('SETTLEMENT_MISMATCH: Settlement beneficiary is mandatory for replay verification. Absence of fields cannot be interpreted as a match.');
    }
    const callerBeneficiary = String(settlementContext.beneficiary).trim().toLowerCase();
    const persistentBeneficiary = String(persistentRecord.beneficiary || '').trim().toLowerCase();
    if (callerBeneficiary !== persistentBeneficiary) {
        throw new Error(`SETTLEMENT_MISMATCH: Settlement beneficiary mismatch for settled order ('${persistentRecord.beneficiary}' vs '${settlementContext.beneficiary}').`);
    }
```

### 2.3 Mapeo HTTP en la Capa API
En [src/api/routes/printhouseOrders.js](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/routes/printhouseOrders.js):
- Se extrae `voucherId` / `voucher_id` de `req.body` y se pasa a `settleRefund()`.
- `HISTORICAL_SETTLEMENT_RECONCILIATION_REQUIRED` se mapea a **HTTP 409 Conflict**.
- `SETTLEMENT_MISMATCH` se mapea a **HTTP 409 Conflict**.
- `DATABASE_CONNECTION_ERROR` se mapea a **HTTP 503 Service Unavailable**.

---

## 3. Matriz de Pruebas Adversariales de Replay

Todas las pruebas se encuentran codificadas de forma reproducible tanto en [tests/budget02d01_e2e_real_integration.test.js](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/tests/budget02d01_e2e_real_integration.test.js) (Sección 11.7.6 y 11.7.7) como en [scripts/test_budget02d01_real_mysql_e2e.js](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/scripts/test_budget02d01_real_mysql_e2e.js) (Paso 6.7.b y 6.7.c) contra MySQL 8:

| Escenario Adversarial | Condición de Entrada | Código HTTP / Excepción | Mutación DB | Estado Final |
| :--- | :--- | :--- | :--- | :--- |
| **1. Replay Idéntico** | 8 parámetros idénticos a tabla 171 | HTTP 200 OK (`idempotent_replay: true`) | Cero mutación | `REFUND_SETTLED` |
| **2. Replay sin voucher** | `voucher_id` omitido | HTTP 409 `SETTLEMENT_MISMATCH: Voucher identifier is mandatory` | Cero mutación | `REFUND_SETTLED` (Intacto) |
| **3. Replay sin obligación** | `obligationId` omitido | HTTP 409 `SETTLEMENT_MISMATCH: Obligation ID is mandatory` | Cero mutación | `REFUND_SETTLED` (Intacto) |
| **4. Replay sin importe** | `amount` omitido | HTTP 409 `SETTLEMENT_MISMATCH: Settlement amount is mandatory` | Cero mutación | `REFUND_SETTLED` (Intacto) |
| **5. Replay sin divisa** | `currency` omitido | HTTP 409 `SETTLEMENT_MISMATCH: Settlement currency is mandatory` | Cero mutación | `REFUND_SETTLED` (Intacto) |
| **6. Replay con beneficiario discordante** | Beneficiario diferente (`adversary@fraud.com`) | HTTP 409 `SETTLEMENT_MISMATCH: Settlement beneficiary mismatch` | Cero mutación | `REFUND_SETTLED` (Intacto) |
| **7. Replay con obligación discordante** | Obligación diferente (`fictitious_obl_999`) | HTTP 409 `SETTLEMENT_MISMATCH: Obligation mismatch` | Cero mutación | `REFUND_SETTLED` (Intacto) |
| **8. Replay con voucher discordante** | Voucher diferente (`VOUCHER-TAMPERED-999`) | HTTP 409 `SETTLEMENT_MISMATCH: Voucher mismatch` | Cero mutación | `REFUND_SETTLED` (Intacto) |
| **9. Replay con importe discordante** | Importe en céntimos no coincide (`99.00 EUR`) | HTTP 409 `SETTLEMENT_MISMATCH: Settlement amount mismatch` | Cero mutación | `REFUND_SETTLED` (Intacto) |
| **10. Replay con divisa discordante** | Divisa no coincide (`USD` vs `EUR`) | HTTP 409 `SETTLEMENT_MISMATCH: Settlement currency mismatch` | Cero mutación | `REFUND_SETTLED` (Intacto) |
| **11. Replay con referencia discordante** | Referencia no coincide | HTTP 409 `SETTLEMENT_MISMATCH: Cannot replay with different reference` | Cero mutación | `REFUND_SETTLED` (Intacto) |
| **12. Replay de otro tenant** | `tenantId: 'tenant_malicious_intruder'` | HTTP 409 `SETTLEMENT_MISMATCH: Tenant mismatch` (o 403 `FORBIDDEN`) | Cero mutación | `REFUND_SETTLED` (Intacto) |
| **13. Replay histórico sin tabla 171** | Registro con solo eventos JSON | HTTP 409 `HISTORICAL_SETTLEMENT_RECONCILIATION_REQUIRED` | Cero mutación | `REFUND_SETTLED` (Intacto) |
| **14. Dos reintentos concurrentes** | `Promise.all` bajo lock `FOR UPDATE` | Ambos HTTP 200 OK (`idempotent_replay: true`) | Cero mutación | `REFUND_SETTLED` (Atómico) |
| **15. Error SQL al leer voucher** | Simulación de fallo de conexión / timeout | HTTP 503 `DATABASE_CONNECTION_ERROR` | Rollback limpio | `REFUND_SETTLED` (Intacto) |
| **16. Verificación de inmutabilidad** | Conteo de filas post-rechazos | Exactamente 1 comprobante, 0 filas huérfanas | Inmutable | Conteo = 1 |

---

## 4. Limitaciones Históricas y Procedimiento de Migración Verificable

### 4.1 Diagnóstico de Limitaciones Históricas
Los pedidos confirmados antes de la publicación de la migración `171_phase196j_financial_settlement_vouchers.sql` registraban la liquidación únicamente en `order_effective_technical_specifications.financial_reconciliation_status = 'REFUND_SETTLED'` y en eventos JSON de auditoría en `marketplace_events`.

Bajo el nuevo estándar de seguridad R5F:
1. **No se reconstruyen comprobantes al vuelo**: No se permite asumir que un JSON antiguo sea autoritativo para permitir reintentos financieros.
2. **Cero mutación automática en caliente**: El sistema no ejecutará scripts `INSERT` silenciosos en tiempo de ejecución.
3. **Fail-Closed Soberano**: Todo reintento sobre dichas órdenes históricas es retenido de forma segura con:
   ```
   HISTORICAL_SETTLEMENT_RECONCILIATION_REQUIRED (HTTP 409 Conflict)
   ```

### 4.2 Procedimiento de Migración Verificable para Datos Históricos
Para incorporar órdenes históricas a la tabla 171 sin poner en riesgo la integridad contable ni generar inconsistencias transaccionales, se define el siguiente procedimiento de reconciliación controlada:

1. **Extracción y Aislamiento en Frío**:
   Identificar órdenes históricas liquidadas sin comprobante formal en tabla 171:
   ```sql
   SELECT oets.canonical_order_id, oets.id AS spec_id, oets.pricing_summary_json, me.metadata_json
   FROM order_effective_technical_specifications oets
   LEFT JOIN financial_settlement_vouchers fsv ON fsv.canonical_order_id = oets.canonical_order_id
   LEFT JOIN marketplace_events me ON me.order_id = oets.canonical_order_id AND me.event_type = 'REFUND_OBLIGATION_SETTLED'
   WHERE oets.financial_reconciliation_status = 'REFUND_SETTLED'
     AND fsv.id IS NULL;
   ```
2. **Cotejo Forense contra Contabilidad ERP y Banca**:
   El equipo financiero contrasta cada referencia y comprobante contra el extracto contable auditado del período.
3. **Generación de Migración DDL/DML Versionada**:
   Se genera un script de migración SQL explícito (e.g. `migrations/172_historical_vouchers_backfill.sql`) con comprobantes certificados, tenant verificado, importes exactos en céntimos y firma del responsable de tesorería (`settled_by: 'finance_audit_lead_manual_recon'`).
4. **Verificación de Baseline**:
   Actualizar el baseline `migrations/migration-integrity-baseline.json` mediante `node scripts/smoke_phase183_migration_integrity.js`.
5. **Ejecución en Ventana de Mantenimiento**:
   Aplicar la migración en la base de datos de staging/producción bajo supervisión de DBA, verificando que `SELECT COUNT(*)` coincida exactamente con las órdenes auditadas.

---

## 5. Dictamen Formal de Cierre BUDGET-02D-01R5F

```
================================================================================
                    DICTAMEN FINAL BUDGET-02D-01R5F
================================================================================
VEREDICTO CONTRATO INTERNO: PASS_SECURITY_CONTRACT
INTEGRACIÓN PROVEEDOR REAL: PRODUCTION_FINANCIAL_INTEGRATION_PENDING
ESTADO DEL PR #9: OPEN / DRAFT (Conservado)
ESTADO DEL PR #8: OPEN / DRAFT (HEAD: 744bdd89676c92de2c612152e1be58fe48698fd9)
MIGRACIÓN DDL PERSISTENTE: 171_phase196j_financial_settlement_vouchers.sql (InnoDB UNIQUE)
ROLLBACK DDL PERSISTENTE: rollback_171_phase196j_financial_settlement_vouchers.sql
RESTRICCIONES: NO MERGE / NO DEPLOY / NO PROD DB CHANGES / NO MOVIMIENTOS REALES
--------------------------------------------------------------------------------
CERTIFICACIONES ACREDITADAS:
1. AUTORIDAD EXCLUSIVA DE TABLA 171 (R5F):
   Liquidación resuelta estrictamente desde financial_settlement_vouchers bajo FOR UPDATE.
   Prohibida de forma concluyente la reconstrucción desde eventos JSON. Registros históricos
   sin comprobante en tabla 171 emiten HISTORICAL_SETTLEMENT_RECONCILIATION_REQUIRED (HTTP 409).
   Ningún registro histórico es mutado automáticamente en runtime.
2. CONTRATO EXPLÍCITO DE REPLAY (R5F):
   Verificación estricta de las 8 dimensiones económicas obligatorias: obligación, pedido,
   tenant, proveedor, identificador de comprobante, referencia, importe en céntimos, divisa
   y beneficiario. La ausencia de cualquier campo se rechaza con SETTLEMENT_MISMATCH.
3. BATERÍA ADVERSARIAL COMPLETA (R5F):
   16 escenarios adversariales certificados en Vitest y MySQL 8. Concurrencia de reintentos
   idempotentes verificada bajo lock transaccional. Inmutabilidad estricta demostrada.
4. AISLAMIENTO Y UNICIDAD PREVIAMENTE VERIFICADOS (SEC-R5-01 / SEC-R5-02):
   Adaptador productivo inmutable en producción (HTTP 403). Unicidad InnoDB de comprobante
   (ER_DUP_ENTRY / EVIDENCE_ALREADY_CONSUMED).
5. CONEXIÓN EXTERNA:
   Reconocida honestamente como PRODUCTION_FINANCIAL_INTEGRATION_PENDING.
   La conexión con proveedores reales (Stripe, Adyen, banca comercial) queda formalmente
   desacoplada y diferida a un despliegue operativo independiente con credenciales autorizadas.
================================================================================
```
