# BUDGET-02D-01 — Especificaciones Técnicas Efectivas para Fabricación Industrial

**Proyecto:** PrintPrice OS  
**Misión:** BUDGET-02D-01 — Remediación de las fracturas críticas de integración E2E  
**Estado:** CERTIFIED  
**Rama:** `feat/budget-02d01-e2e-remediation`  
**Referencia Base:** `744bdd89676c92de2c612152e1be58fe48698fd9`  

---

## 1. El Desafío Industrial: La Desconexión de Fábrica (BLK-03)

Uno de los hallazgos más graves de la auditoría E2E ([BUDGET-02D-00](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/docs/budget-02d/BUDGET-02D00_FINAL_AUDIT_REPORT.md)) fue la ruptura entre el consentimiento comercial del cliente y el despacho a la máquina de impresión en planta.

### 1.1 Escenario del Defecto Original
1. Una imprenta sufría rotura de stock de papel estucado de 135 g/m² y proponía a través del sistema sustituirlo por offset de 120 g/m².
2. El cliente recibía el enlace, validaba el OTP y aceptaba formalmente el cambio.
3. El servicio de revisiones marcaba la revisión como `ACCEPTED`.
4. Sin embargo, el registro maestro de la orden (`orders.specs` y `marketplace_orders.book_spec_json`) no reflejaba el cambio.
5. Al producirse la orden de despacho a máquina, el despachador (`MarketplaceDispatchGatingService`) leía los datos originales obsoletos y enviaba a imprimir el trabajo con el papel agotado de 135 g/m², ocasionando paradas en línea, desperdicio de pliegos y reclamaciones contractuales.

### 1.2 Dilema Arquitectónico
- **No se debe mutar destructivamente el registro de precios original**: El snapshot en `order_pricing_snapshots` debe permanecer inmutable por imperativo legal y contable.
- **No se deben sobrescribir ciegamente campos de texto libre**: Sobrescribir `specs` en `orders` destruye la trazabilidad histórica de lo que se contrató inicialmente.

---

## 2. Solución Arquitectónica: Modelo de Especificación Efectiva (Migración 170)

Se introdujo la tabla `order_effective_technical_specifications` mediante la migración [`170_phase196i_order_effective_technical_specifications.sql`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/migrations/170_phase196i_order_effective_technical_specifications.sql), proporcionando una capa de especificación técnica activa, versionada e indisoluble.

### 2.1 Esquema DDL en MySQL 8

```sql
CREATE TABLE IF NOT EXISTS order_effective_technical_specifications (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    order_id VARCHAR(64) NOT NULL,
    canonical_order_id VARCHAR(64) NULL,
    revision_id VARCHAR(64) NOT NULL,
    specification_version INT UNSIGNED NOT NULL DEFAULT 1,
    status ENUM('ACTIVE', 'SUPERSEDED', 'REVOKED') NOT NULL DEFAULT 'ACTIVE',
    paper_role ENUM('INTERIOR', 'COVER') NOT NULL,
    paper_type VARCHAR(64) NOT NULL,
    paper_weight_interior INT UNSIGNED NULL,
    paper_weight_cover INT UNSIGNED NULL,
    finish_type VARCHAR(64) NULL,
    effective_specs_json LONGTEXT NOT NULL,
    effective_from TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_oets_order_status (order_id, status),
    INDEX idx_oets_canonical_status (canonical_order_id, status),
    INDEX idx_oets_tenant_order (tenant_id, order_id),
    CONSTRAINT fk_oets_revision FOREIGN KEY (revision_id) REFERENCES order_quote_revisions(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 2.2 Integridad en el Registro de Migraciones
La migración 170 fue incorporada al archivo de gobernanza [`migrations/migration-integrity-baseline.json`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/migrations/migration-integrity-baseline.json) con su hash SHA-256 verificado, superando al 100% las pruebas de integridad de migraciones del sistema.

---

## 3. Persistencia en Aceptación y Población de Campos

En [`src/api/services/orderQuoteRevisionService.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/orderQuoteRevisionService.js), cuando el cliente acepta la revisión, dentro de la misma transacción atómica se genera el registro efectivo asignando los campos específicos según el rol de papel:

```javascript
// Construcción de la especificación técnica efectiva:
const effectiveSpecs = {
    ...originalSpecs,
    paper_role: revision.paper_role,
    paper_type: revision.proposed_paper_type || variant.category,
    finish_type: variant.finish_type || originalSpecs.finish_type,
    // Población estricta orientada al rol técnico:
    paper_weight_interior: revision.paper_role === 'INTERIOR' ? variant.gsm : originalSpecs.paper_weight_interior,
    paper_weight_cover: revision.paper_role === 'COVER' ? variant.gsm : originalSpecs.paper_weight_cover,
    revision_id: revision.id,
    effective_version: nextVersion,
    activated_at: new Date().toISOString()
};

await connection.query(
    `INSERT INTO order_effective_technical_specifications (
        id, tenant_id, order_id, canonical_order_id, revision_id,
        specification_version, status, paper_role, paper_type,
        paper_weight_interior, paper_weight_cover, finish_type,
        effective_specs_json, effective_from
    ) VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?, ?, ?, NOW())`,
    [
        specId,
        tenantId,
        revision.order_id,
        parentOrder.canonical_order_id || revision.order_id,
        revision.id,
        nextVersion,
        revision.paper_role,
        effectiveSpecs.paper_type,
        effectiveSpecs.paper_weight_interior || null,
        effectiveSpecs.paper_weight_cover || null,
        effectiveSpecs.finish_type || null,
        JSON.stringify(effectiveSpecs)
    ]
);
```

---

## 4. Consumo en Despacho Industrial ([`MarketplaceDispatchGatingService.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/MarketplaceDispatchGatingService.js))

Al invocar `dispatchOrder` para enviar la orden a los nodos de impresión (`node_alpha_press` u homólogos):

1. **Consulta Prioritaria**: El servicio consulta `order_effective_technical_specifications` buscando un registro con `status = 'ACTIVE'` ordenado por `specification_version DESC LIMIT 1`.
2. **Inyección en Paquete de Producción**:
   - Si existe especificación efectiva: Se extrae el payload JSON y se inyecta en el paquete de producción JDF/JMF con metadato `technical_specification_source: 'EFFECTIVE_ACTIVE'`.
   - Si no existe: Se utilizan las especificaciones originales con `technical_specification_source: 'ORIGINAL_PRESERVED'`.
3. **Bloqueo Preventivo**: Si existe una revisión en estado `PENDING` o si la compuerta financiera está pendiente de pago (`PAYMENT_PENDING`), el despachador rechaza el envío con error fail-closed impidiendo la fabricación prematura o no autorizada.
