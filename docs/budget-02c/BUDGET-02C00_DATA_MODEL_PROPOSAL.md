# PROPUESTA DE MODELO DE DATOS Y PERSISTENCIA — BUDGET-02C-00
## Esquema Relacional de Revisiones Económicas, Tokens Criptográficos y Trazabilidad

**Proyecto:** PrintPrice OS  
**Misión:** BUDGET-02C-00 — Propuesta de Modelo de Datos  
**Estado:** `BUDGET-02C00_DESIGN_APPROVED`  
**Modalidad Operativa:** READ-ONLY / DESIGN FIRST  
**Restricciones:** NO MERGE / NO DEPLOY / NO CODE MUTATION / NO DATABASE CHANGES  
**Fecha:** 27 de octubre de 2026  
**Autor:** Antigravity (Advanced Agentic Architecture)

---

## 1. Principios de Diseño del Modelo Relacional

El modelo de datos propuesto para **BUDGET-02C** implementa las siguientes garantías arquitectónicas:
1. **Límites de Integridad Relacional Estrictos:**  
   Las claves foráneas de MySQL operan exclusivamente **dentro** de la base de datos de Control Plane:
   - `order_quote_revisions.paper_decision_id` $\to$ `order_paper_decisions(id)` (`ON DELETE RESTRICT`).
   - `quote_revision_tokens.revision_id` $\to$ `order_quote_revisions(id)` (`ON DELETE CASCADE`).
   - La correlación con la intención de compra de Budget App se preserva mediante la columna indexada `external_order_intent_id VARCHAR(64) NOT NULL` sin crear dependencias acopladas entre motores de base de datos disjuntos.
2. **Serialización Transaccional por Pedido (Zero Race Conditions):**  
   Se utiliza una columna virtual almacenada (`active_revision_slot`) con un índice único estricto para garantizar a nivel de motor InnoDB que **solo puede existir exactamente UNA revisión en estado `PENDING` por pedido simultáneamente**.
3. **Almacenamiento Criptográfico Seguro de Tokens (Zero Plaintext Persistence):**  
   El token en texto claro (`rawToken`) emitido al cliente **nunca se almacena en la base de datos**. La tabla `quote_revision_tokens` almacena únicamente `token_hash` (SHA-256) y un prefijo público seguro (`token_prefix`) para auditoría y logs.
4. **Inmutabilidad y Auditoría Append-Only:**  
   Una vez aceptada, rechazada o expirada, una fila de `order_quote_revisions` se congela. Toda transición produce un registro en `order_revision_audit_events`.

---

## 2. Diagrama Entidad-Relación (Control Plane MySQL)

```
┌──────────────────────────────────────┐
│        order_paper_decisions         │  (Implementada en Migración 167 - PR #7)
├──────────────────────────────────────┤
│ PK  id                               │
│     external_order_intent_id         │
│     paper_role (INTERIOR/COVER/...)  │
│     requested_variant_id (FK Cat.)   │
│     alternative_variant_id (FK Cat.) │
│     decision_action                  │
│     status ('ACTIVE', ...)           │
└──────────────────┬───────────────────┘
                   │
                   │ 1:N (ON DELETE RESTRICT)
                   ▼
┌──────────────────────────────────────┐
│        order_quote_revisions         │  (NUEVA ENTIDAD - SoR de Revisiones)
├──────────────────────────────────────┤
│ PK  id                               │
│ FK  paper_decision_id                │
│     external_order_intent_id         │
│     revision_number (1, 2, 3...)     │
│     status (PENDING/ACCEPTED/...)    │
│     base_gross_amount (1782.3000)    │
│     delta_gross_amount               │
│     revised_gross_amount             │
│     snapshot_canonical_hash (SHA256) │
│     active_revision_slot (UK)        │
│     expires_at (UTC)                 │
└──────────────────┬───────────────────┘
                   │
                   │ 1:N (ON DELETE CASCADE)
                   ▼
┌──────────────────────────────────────┐
│        quote_revision_tokens         │  (NUEVA ENTIDAD - Autorizaciones Monouso)
├──────────────────────────────────────┤
│ PK  id                               │
│ FK  revision_id                      │
│     token_hash (SHA256(rawToken)) UK │
│     token_prefix ('qrt_a1b2c3d4')    │
│     status (PENDING/CONSUMED/...)    │
│     recipient_email_hash             │
│     expires_at (UTC)                 │
│     attempt_count / max_attempts     │
└──────────────────┬───────────────────┘
                   │
                   │ Auditoría Continua
                   ▼
┌──────────────────────────────────────┐
│     order_revision_audit_events      │  (NUEVA ENTIDAD - Ledger Append-Only)
├──────────────────────────────────────┤
│ PK  id (BIGINT AUTO_INCREMENT)       │
│     event_id (UUID)                  │
│     revision_id                      │
│     event_type                       │
│     actor_type / actor_id            │
│     payload_json                     │
│     created_at                       │
└──────────────────────────────────────┘
```

---

## 3. Especificación DDL (Data Definition Language)

A continuación se presenta la propuesta formal de DDL para la migración de base de datos (preparada para su fase de implementación en BUDGET-02C-01):

### 3.1 Tabla: `order_quote_revisions`
```sql
CREATE TABLE IF NOT EXISTS order_quote_revisions (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    
    -- Enlaces Relacionales Híbridos
    external_order_intent_id VARCHAR(64) NOT NULL,
    canonical_order_id VARCHAR(64) NULL,
    paper_decision_id VARCHAR(64) NOT NULL,
    
    -- Versionado Secuencial
    revision_number INT NOT NULL DEFAULT 1,
    
    -- Máquina de Estados Económica
    status ENUM(
        'PENDING',
        'ACCEPTED',
        'REJECTED',
        'EXPIRED',
        'REVOKED',
        'SUPERSEDED'
    ) NOT NULL DEFAULT 'PENDING',
    
    -- Desglose Monetario Canónico (Cuatro decimales para precisión de redondeo)
    currency VARCHAR(10) NOT NULL DEFAULT 'EUR',
    base_net_amount DECIMAL(12, 4) NOT NULL,
    delta_net_amount DECIMAL(12, 4) NOT NULL,
    revised_net_amount DECIMAL(12, 4) NOT NULL,
    
    -- Liquidación Fiscal Resuelta Autoritativamente por Control Plane (sin default hardcodeado)
    -- delta_tax_amount = revised_tax_amount - base_tax_amount
    -- donde base_tax = round2(base_net * (tax_rate_pct/100)) y revised_tax = round2(revised_net * (tax_rate_pct/100))
    base_tax_amount DECIMAL(12, 4) NOT NULL,
    delta_tax_amount DECIMAL(12, 4) NOT NULL,
    revised_tax_amount DECIMAL(12, 4) NOT NULL,
    tax_rate_pct DECIMAL(5, 2) NOT NULL,
    
    base_gross_amount DECIMAL(12, 4) NOT NULL,
    delta_gross_amount DECIMAL(12, 4) NOT NULL,
    revised_gross_amount DECIMAL(12, 4) NOT NULL,
    
    -- Metadatos y Trazabilidad del Cálculo Determinista BPE
    bpe_calculation_id VARCHAR(128) NOT NULL,
    bpe_engine_version VARCHAR(32) NOT NULL,
    bpe_rates_checksum VARCHAR(128) NOT NULL,
    
    -- Huella Criptográfica Inmutable de Especificaciones Técnicas, Desglose y Políticas (E-04)
    snapshot_canonical_hash CHAR(64) NOT NULL,
    breakdown_json JSON NOT NULL,
    technical_specs_snapshot_json JSON NOT NULL,
    applied_policies_json JSON NOT NULL, -- { target_margin_pct, tax_jurisdiction, rounding_policy }
    
    -- Vigencia Temporal Absoluta en UTC
    issued_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    effective_business_hours INT NOT NULL DEFAULT 48,
    supplier_offer_valid_until TIMESTAMP NULL,
    printhouse_timezone VARCHAR(64) NOT NULL DEFAULT 'Europe/Madrid',
    
    -- Registro Forense de Consentimiento
    consent_record_json JSON NULL,
    responded_at TIMESTAMP NULL,
    revocation_reason VARCHAR(255) NULL,
    revoked_at TIMESTAMP NULL,
    
    -- Idempotencia de Emisión
    idempotency_key VARCHAR(128) NOT NULL,
    
    -- Motor de Concurrencia: Máximo UNA revisión PENDING por pedido
    active_revision_slot VARCHAR(192) GENERATED ALWAYS AS (
        IF(status = 'PENDING', CONCAT(tenant_id, ':', external_order_intent_id), NULL)
    ) STORED,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    -- Índices Operativos y Claves Únicas
    INDEX idx_oqr_tenant (tenant_id),
    INDEX idx_oqr_ext_intent (external_order_intent_id),
    INDEX idx_oqr_order (canonical_order_id),
    INDEX idx_oqr_status (status),
    INDEX idx_oqr_expires_at (expires_at),
    UNIQUE KEY uk_oqr_idempotency (tenant_id, idempotency_key),
    UNIQUE KEY uk_oqr_version (tenant_id, external_order_intent_id, revision_number),
    UNIQUE KEY uk_oqr_active_slot (active_revision_slot),
    
    -- Restricción de Integridad Foránea
    CONSTRAINT fk_oqr_paper_decision FOREIGN KEY (paper_decision_id)
        REFERENCES order_paper_decisions(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

---

### 3.2 Tabla: `quote_revision_tokens`
```sql
CREATE TABLE IF NOT EXISTS quote_revision_tokens (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    revision_id VARCHAR(64) NOT NULL,
    
    -- Criptografía del Token (Hash SHA-256; NUNCA texto claro)
    token_hash CHAR(64) NOT NULL,
    token_prefix VARCHAR(16) NOT NULL,
    
    -- Vinculación Contextual del Destinatario
    recipient_email_hash CHAR(64) NOT NULL,
    
    -- Estado del Ciclo de Vida del Token
    status ENUM('PENDING', 'CONSUMED', 'EXPIRED', 'REVOKED') NOT NULL DEFAULT 'PENDING',
    
    -- Control de Intentos y Fuerza Bruta
    attempt_count INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 5,
    locked_until TIMESTAMP NULL,
    
    -- Fechas de Vigencia y Consumo
    issued_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    consumed_at TIMESTAMP NULL,
    consumed_ip_hash VARCHAR(128) NULL,
    consumed_user_agent VARCHAR(255) NULL,
    consumption_method ENUM('POST_ACCEPT', 'POST_REJECT') NULL,
    consumption_payload_hash CHAR(64) NULL,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_qrt_tenant (tenant_id),
    INDEX idx_qrt_revision (revision_id),
    INDEX idx_qrt_status (status),
    INDEX idx_qrt_expires_at (expires_at),
    UNIQUE KEY uk_qrt_token_hash (token_hash),
    
    -- Eliminación en Cascada Controlada si la Revisión es Purgada
    CONSTRAINT fk_qrt_revision FOREIGN KEY (revision_id)
        REFERENCES order_quote_revisions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

---

### 3.3 Tabla: `order_revision_audit_events`
```sql
CREATE TABLE IF NOT EXISTS order_revision_audit_events (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    event_id VARCHAR(64) NOT NULL,
    tenant_id VARCHAR(64) NOT NULL,
    revision_id VARCHAR(64) NOT NULL,
    order_ref VARCHAR(128) NOT NULL,
    
    event_type ENUM(
        'REVISION_CREATED',
        'TOKEN_GENERATED',
        'PREVIEW_ACCESSED',
        'CHALLENGE_FAILED',
        'REVISION_ACCEPTED',
        'REVISION_REJECTED',
        'REVISION_EXPIRED',
        'REVISION_REVOKED',
        'REVISION_SUPERSEDED',
        'GATE_EVALUATION'
    ) NOT NULL,
    
    actor_type ENUM('PRINTHOUSE_OPERATOR', 'CUSTOMER', 'SYSTEM_DAEMON', 'CONTROL_PLANE_ADMIN') NOT NULL,
    actor_id VARCHAR(128) NOT NULL,
    
    ip_hash VARCHAR(128) NULL,
    user_agent VARCHAR(255) NULL,
    payload_json JSON NOT NULL,
    
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_orae_revision (revision_id),
    INDEX idx_orae_order (order_ref),
    INDEX idx_orae_type (event_type),
    INDEX idx_orae_created (created_at),
    UNIQUE KEY uk_orae_event_id (event_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

---

## 4. Estructura del Snapshot Canónico y Hash de Integridad

Para asegurar que ni el cliente ni un actor interno puedan modificar de forma espuria las condiciones aceptadas, se define el algoritmo de cálculo de `snapshot_canonical_hash`:

1. **Objeto Canónico Estrictamente Ordenado:**
```json
{
  "currency": "EUR",
  "delta_gross_amount": "110.8200",
  "delta_net_amount": "91.5800",
  "expires_at": "2026-10-29T18:00:00Z",
  "external_order_intent_id": "oi_20261027_dar2025_001",
  "paper_decision_id": "opd_987654321",
  "paper_role": "INTERIOR",
  "revised_gross_amount": "1893.1200",
  "revised_net_amount": "1564.5600",
  "revision_number": 1,
  "selected_variant_id": "pv_munken_pure_120_640x900",
  "tenant_id": "tenant_industrial_01"
}
```
2. **Serialización Determinista:**  
   Se serializa mediante codificación JSON sin espacios (`JSON.stringify` canónico con ordenación alfabética de propiedades).
3. **Cálculo SHA-256:**
   $$\text{snapshot\_canonical\_hash} = \text{SHA256}(\text{canonical\_json\_string})$$
4. **Verificación en Aceptación:**  
   Al enviar la aceptación POST, el servidor recalcula la huella. Si el hash resultante no coincide de forma exacta con `order_quote_revisions.snapshot_canonical_hash`, la petición es rechazada de inmediato (`409 CONFLICT`).
