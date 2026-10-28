# BUDGET-02D-02 — Auditoría de Compatibilidad e Integridad de Base de Datos (Migraciones 167 a 171)

> **Misión**: `BUDGET-02D-02 — Auditoría final de integración de PR #8 y PR #9`  
> **Proyecto**: PrintPrice OS Control Plane  
> **Repositorio**: `PrintPriceOS/ppos-control-plane`  
> **Fecha de Auditoría**: 28 de Octubre de 2026  
> **Modalidad**: Auditoría Independiente, READ-ONLY  
> **Restricciones Absolutas**: **NO MERGE / NO DEPLOY / NO MODIFICAR CÓDIGO / NO PRODUCTION DB CHANGES / NO MOVIMIENTOS REALES**  

---

## 1. Inventario Formal de Migraciones y Rollbacks

Se auditaron los archivos DDL y sus correspondientes scripts de reversión ubicados en `migrations/` y `migrations/rollback/`:

| Migración | Tabla Afectada / Creada | Tipo DDL | Rollback Verificado | Fase / Misión |
| :--- | :--- | :--- | :--- | :--- |
| **167** | `order_paper_decisions` | `CREATE TABLE IF NOT EXISTS` | `rollback_167_phase196f_order_paper_decisions.sql` | Phase 196F (BUDGET-02B) |
| **168** | `order_quote_revisions`<br>`quote_revision_tokens`<br>`order_revision_audit_events` | `CREATE TABLE IF NOT EXISTS` | `rollback_168_phase196g_order_quote_revisions.sql` | Phase 196G (BUDGET-02C) |
| **169** | `printhouse_profiles` | `CREATE TABLE IF NOT EXISTS` | `rollback_169_phase196h_printhouse_profiles.sql` | Phase 196H (BUDGET-02C-R4V) |
| **170** | `order_effective_technical_specifications` | `CREATE TABLE IF NOT EXISTS` | `rollback_170_phase196i_order_effective_technical_specifications.sql` | Phase 196I (BUDGET-02D) |
| **171** | `financial_settlement_vouchers` | `CREATE TABLE IF NOT EXISTS` | `rollback_171_phase196j_financial_settlement_vouchers.sql` | Phase 196J (BUDGET-02D-R5V/F) |

---

## 2. Análisis Detallado de Integridad Relacional y Claves por Tabla

### 2.1 `order_paper_decisions` (Migración 167)
- **Clave Primaria**: `id VARCHAR(64) PRIMARY KEY`.
- **Claves Foráneas (FKs)**:
  - `fk_opd_requested_variant`: `requested_variant_id` referencia `paper_variants(id)` con `ON DELETE RESTRICT`. Impide borrar papeles maestros asignados a decisiones en curso.
  - `fk_opd_alternative_variant`: `alternative_variant_id` referencia `paper_variants(id)` con `ON DELETE RESTRICT`.
- **Serialización Concurrente por Columna Generada**:
  - `active_role_slot VARCHAR(192) GENERATED ALWAYS AS (IF(status = 'ACTIVE', CONCAT(tenant_id, ':', external_order_intent_id, ':', paper_role), NULL)) STORED`.
  - `UNIQUE KEY uk_opd_active_role (active_role_slot)`: Garantiza que a nivel de motor físico MySQL, **solo puede existir exactamente una decisión activa por cada rol de papel (`INTERIOR`, `COVER`, `ENDPAPER`) en un pedido**.
- **Idempotencia**:
  - `UNIQUE KEY uk_opd_idempotency (tenant_id, idempotency_key)`: Impide duplicaciones de peticiones operativas.

### 2.2 `order_pricing_snapshots` (Migración 136 - Precedente Intacto)
- **Rol en el Flujo**: Conserva el presupuesto original congelado en el momento de la confirmación comercial inicial.
- **Inmutabilidad Absoluta por Triggers**:
  - `trg_order_pricing_snapshots_before_update`: Bloquea cualquier instrucción `UPDATE` sobre un snapshot sellado.
  - `trg_order_pricing_snapshots_before_delete`: Bloquea cualquier instrucción `DELETE`.
- **Garantía R5F/PR #9**: Ninguna operación en PR #8 o PR #9 altera ni intenta sobreescribir la tabla `order_pricing_snapshots`. Todas las variaciones posteriores se persisten en entidades derivadas independientes.

### 2.3 `order_quote_revisions` y `quote_revision_tokens` (Migración 168)
- **Clave Primaria**: `id VARCHAR(64) PRIMARY KEY`.
- **FK**: `fk_oqr_paper_decision` a `order_paper_decisions(id)` con `ON DELETE RESTRICT`.
- **Precisión Económica**: Campos monetarios definidos como `DECIMAL(12, 4)` (`base_net_amount`, `delta_net_amount`, `revised_net_amount`, `base_tax_amount`, `delta_tax_amount`, `revised_tax_amount`, `base_gross_amount`, `delta_gross_amount`, `revised_gross_amount`). Previene desajustes de redondeo financiero.
- **Serialización Concurrente**:
  - `active_revision_slot VARCHAR(192) GENERATED ALWAYS AS (IF(status = 'PENDING', CONCAT(tenant_id, ':', external_order_intent_id), NULL)) STORED`.
  - `UNIQUE KEY uk_oqr_active_slot (active_revision_slot)`: Impide la emisión simultánea de dos revisiones pendientes sobre el mismo pedido.
- **Seguridad en `quote_revision_tokens`**:
  - `token_hash CHAR(64) NOT NULL` con `UNIQUE KEY uk_qrt_token_hash`: El token en texto plano nunca se guarda en base de datos; solo se almacena su hash criptográfico SHA-256.
  - FK a `order_quote_revisions(id)` con `ON DELETE CASCADE`.

### 2.4 `printhouse_profiles` (Migración 169)
- **Clave Primaria**: `id VARCHAR(64) PRIMARY KEY`.
- **Unicidad**: `UNIQUE KEY uk_pp_printhouse (printhouse_id)`.
- **Constraints a Nivel de Motor**:
  - `chk_pp_margin`: `CHECK (target_margin_pct IS NULL OR (target_margin_pct >= 0 AND target_margin_pct < 100))`.
  - `chk_pp_ttl`: `CHECK (business_hours_ttl > 0)`.
- **Gobernanza Operativa**: Campos para huso horario IANA (`Europe/Madrid`), calendario autonómico/estatutario (`ES-MD`), pausa de comida (`has_lunch_break`) y festivos municipales (`custom_holidays_json`).

### 2.5 `order_effective_technical_specifications` (Migración 170)
- **Clave Primaria**: `id VARCHAR(64) PRIMARY KEY`.
- **Desacoplamiento Estricto**: Registra la versión técnica efectiva final para fabricación, enlazando `canonical_order_id`, `paper_decision_id`, `revision_id`, `bpe_calculation_id` y `pricing_snapshot_id`.
- **Trazabilidad Forense**: Almacena de forma inmutable `specs_json`, `pricing_summary_json` y `consent_record_json` (con IP, timestamp, hash de navegador y firma del cliente).
- **Gobernanza Industrial**: Controla el avance mediante `financial_reconciliation_status` y `industrial_gate_status`.

### 2.6 `financial_settlement_vouchers` (Migración 171)
- **Clave Primaria**: `id VARCHAR(64) PRIMARY KEY`.
- **Garantía Anti-Replay / Doble Liquidación**:
  - `UNIQUE KEY uq_provider_voucher (provider, provider_voucher_id)`.
  - En caso de reintentos concurrentes de liquidación con el mismo comprobante, el motor InnoDB dispara `ER_DUP_ENTRY` (SQL 1062), provocando el rollback atómico inmediato de la transacción y devolviendo `EVIDENCE_ALREADY_CONSUMED` (HTTP 409).
- **Control Monetario y Auditoría**:
  - `amount_cents BIGINT NOT NULL` (unidades menores enteras, evitando problemas de coma flotante).
  - `currency VARCHAR(16) NOT NULL`.
  - `beneficiary VARCHAR(255) NOT NULL`.
  - `is_mock_sandbox TINYINT(1) NOT NULL DEFAULT 0`.
  - `settled_by VARCHAR(128) NOT NULL`.

---

## 3. Integridad de la Línea Base de Migraciones (`migration-integrity-baseline.json`)

Se ejecutó la prueba de certificación `smoke_phase183_migration_integrity.js`, validando la ausencia de colisiones y la coincidencia criptográfica de firmas:

```
=== Phase 183 Migration Integrity & Schema Baseline Validation ===
  PASS: 176 SQL/baseline files discovered under migrations/.
  PASS: 174 files classified as migrations.
  PASS: All baseline paths are present.
  PASS: All SHA-256 checksums match.
  PASS: Approved collisions (013, 014, 015) match baseline.
  PASS: No unapproved prefix collisions found.
  PASS: Import-time schema init is disabled.
Phase 183: PASSED
```

Las 5 migraciones añadidas (167, 168, 169, 170 y 171) están formalmente registradas en el baseline oficial con sus respectivos hashes SHA-256.

---

## 4. Compatibilidad con Datos Históricos (Backward Compatibility)

Un requerimiento crítico del sistema es no romper ni degradar los pedidos creados antes de la implementación de estas tablas:

1. **Naturaleza Aditiva Pura**:
   Ninguna de las migraciones 167 a 171 ejecuta `ALTER TABLE ... DROP COLUMN`, `ALTER TABLE ... MODIFY COLUMN` destructivos ni bloqueos sobre tablas existentes (`orders`, `marketplace_orders`, `users`, `tenants`). Todas son instrucciones `CREATE TABLE IF NOT EXISTS`.
2. **Pedidos Históricos sin Decisión de Papel**:
   En [MarketplaceDispatchGatingService.js](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/MarketplaceDispatchGatingService.js), si un pedido histórico no cuenta con registro en `order_paper_decisions`, el servicio comprueba si el pedido requería confirmación de papel. Si es una orden preexistente estándar, no se rechaza arbitrariamente, sino que se valida la existencia de la especificación técnica base.
3. **Pedidos Históricos con `REFUND_SETTLED` Pre-Tabla 171**:
   - Si una orden histórica previa a la migración 171 tenía registrado el estado `REFUND_SETTLED` en `order_effective_technical_specifications` pero no posee comprobante formal en `financial_settlement_vouchers`, el sistema **no sintetiza comprobantes ni genera escrituras automáticas en runtime**.
   - Ante cualquier reintento de liquidación sobre dicho pedido histórico, el sistema falla cerrado emitiendo:
     ```
     HISTORICAL_SETTLEMENT_RECONCILIATION_REQUIRED (HTTP 409 Conflict)
     ```
   - Se ha diseñado y auditado un procedimiento de migración verificable en frío (ver [BUDGET-02D01R5V_FINAL_VERIFICATION.md](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/docs/budget-02d/BUDGET-02D01R5V_FINAL_VERIFICATION.md#L207-L228)) para incorporar registros pasados con firma de un auditor financiero humano sin mutaciones descontroladas.

---

## 5. Dictamen de Compatibilidad de Base de Datos

```
================================================================================
          DICTAMEN DE COMPATIBILIDAD DE BASE DE DATOS (BUDGET-02D-02)
================================================================================
MIGRACIONES 167-171: VÁLIDAS, DETERMINISTAS Y 100% REGISTRADAS EN BASELINE
ROLLBACKS 167-171: SCRIPT DE REVERSIÓN DISPONIBLE Y PROBADO PARA CADA TABLA
INTEGRIDAD RELACIONAL: CONSTRAINTS INNODB, UNIQUE KEYS Y GENERATED SLOTS VERIFICADOS
COMPATIBILIDAD HISTÓRICA: ADITIVA PURA, SIN ROTURA DE ESQUEMAS PREVIOS
TRATAMIENTO HISTÓRICO: FAIL-CLOSED ANTE ÓRDENES PRE-TABLA 171 (SIN HOT-MUTATIONS)
================================================================================
```
