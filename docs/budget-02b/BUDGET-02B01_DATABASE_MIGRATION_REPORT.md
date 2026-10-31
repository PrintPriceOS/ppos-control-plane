# INFORME DE MIGRACIÓN DE BASE DE DATOS — BUDGET-02B-01
## Registro de Persistencia Relacional para `order_paper_decisions`

**Proyecto:** PrintPrice OS Control Plane  
**Misión:** BUDGET-02B-01  
**Archivo de Migración:** `migrations/167_phase196f_order_paper_decisions.sql`  
**Archivo de Rollback:** `migrations/rollback/rollback_167_phase196f_order_paper_decisions.sql`  
**Motor de Persistencia:** MySQL 8.0 / InnoDB  
**Compatibilidad:** UTF8MB4 / collation `utf8mb4_unicode_ci`  
**Estado de Verificación:** `INTEGRITY_VERIFIED_PASS`  

---

## 1. Convención de Numeración y Registro Canónico

La migración se numera secuencialmente como `167`, sucediendo a la migración `166_phase196e_supplier_paper_procurement_orders.sql` (commit `0851de60`) e integrando la fase `196F` correspondiente al ciclo industrial de aprovisionamiento y confirmación de papel.

### Metadatos de Integridad (Phase 183 Baseline)
- **Ruta relativa:** `migrations/167_phase196f_order_paper_decisions.sql`
- **Prefijo numérico:** `167`
- **Checksum canónico SHA-256 (utf8-lf-v1):** `b9ffb533904842c140b7a84e2d6d981a28d1511a4e1cab4f3a59bdc95ecb329c`
- **Tamaño:** 3.735 bytes
- **Clasificación SQL:** DDL (`CREATE TABLE`, `CREATE INDEX`, `FOREIGN KEY`) y DML compatible.

---

## 2. Definición DDL de la Entidad `order_paper_decisions`

```sql
CREATE TABLE IF NOT EXISTS order_paper_decisions (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    
    -- Referencias de Pedido (Híbridas: Externa e Interna)
    external_order_intent_id VARCHAR(64) NOT NULL,
    canonical_order_id VARCHAR(64) NULL,
    printhouse_tenant_id VARCHAR(64) NOT NULL,
    operator_id VARCHAR(64) NOT NULL,
    
    -- Rol de Material Evaluado
    paper_role ENUM('INTERIOR', 'COVER', 'ENDPAPER') NOT NULL,
    
    -- Claves Foráneas SQL Internas hacia Catálogo Maestro de Control Plane
    requested_variant_id VARCHAR(64) NOT NULL,
    decision_action ENUM('CONFIRM', 'PROPOSE_ALTERNATIVE', 'REJECT') NOT NULL,
    alternative_variant_id VARCHAR(64) NULL,
    
    -- Snapshot Técnico Incrustado del Papel Solicitado (Inmune a cambios externos)
    snapshot_requested_gsm INT NOT NULL,
    snapshot_requested_width_mm DECIMAL(10, 2) NOT NULL,
    snapshot_requested_height_mm DECIMAL(10, 2) NOT NULL,
    snapshot_requested_finish VARCHAR(64) NULL,
    snapshot_requested_category VARCHAR(64) NOT NULL,
    
    -- Desacoplamiento Económico (BUDGET-02B-01: Inmutabilidad de cotización de cliente)
    estimated_cost_delta DECIMAL(12, 4) NOT NULL DEFAULT 0.0000,
    currency VARCHAR(10) NOT NULL DEFAULT 'EUR',
    economic_status ENUM('DELTA_ZERO_CONFIRMED', 'REQUIRES_ECONOMIC_REVISION', 'REVISION_NOT_APPLICABLE') NOT NULL DEFAULT 'DELTA_ZERO_CONFIRMED',
    
    -- Justificación y Notas Técnicas
    technical_reason VARCHAR(255) NULL,
    printhouse_notes TEXT NULL,
    
    -- Versionado, Secuencia y Estado
    decision_number INT NOT NULL DEFAULT 1,
    status ENUM('ACTIVE', 'SUPERSEDED', 'CANCELLED') NOT NULL DEFAULT 'ACTIVE',
    idempotency_key VARCHAR(128) NOT NULL,
    
    -- Metadatos Mínimos de Auditoría
    metadata_json JSON NULL,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_opd_tenant (tenant_id),
    INDEX idx_opd_ext_intent (external_order_intent_id),
    INDEX idx_opd_order (canonical_order_id),
    INDEX idx_opd_printer (printhouse_tenant_id),
    INDEX idx_opd_variant (requested_variant_id),
    INDEX idx_opd_alt_variant (alternative_variant_id),
    INDEX idx_opd_order_role (tenant_id, external_order_intent_id, paper_role),
    INDEX idx_opd_created_at (created_at),
    UNIQUE KEY uk_opd_idempotency (tenant_id, idempotency_key),
    
    -- Restricciones de Clave Foránea en Control Plane
    CONSTRAINT fk_opd_requested_variant FOREIGN KEY (requested_variant_id) REFERENCES paper_variants(id) ON DELETE RESTRICT,
    CONSTRAINT fk_opd_alternative_variant FOREIGN KEY (alternative_variant_id) REFERENCES paper_variants(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

---

## 3. Análisis de Integridad Referencial y Límites de Base de Datos

1. **Aislamiento de Límites entre Aplicaciones:**
   - La tabla no establece claves foráneas SQL hacia la base de datos o almacenamiento local de Budget App.
   - La correlación se realiza mediante `external_order_intent_id VARCHAR(64) NOT NULL`, indexada en `idx_opd_ext_intent`.
   - Se incluye `canonical_order_id VARCHAR(64) NULL` para correlación opcional con `marketplace_orders` o `orders` en Control Plane.
2. **Claves Foráneas Estrictas dentro de Control Plane:**
   - `fk_opd_requested_variant`: vincula `requested_variant_id` con `paper_variants(id)` mediante `ON DELETE RESTRICT`, garantizando que ninguna variante cotizada pueda ser purgada del catálogo maestro mientras existan decisiones asociadas.
   - `fk_opd_alternative_variant`: vincula `alternative_variant_id` con `paper_variants(id)` mediante `ON DELETE RESTRICT`.
3. **Snapshot Técnico Inmutable Incrustado:**
   - Para evitar que la consulta histórica dependa de estados mutables del catálogo de variantes, se persisten como valores numéricos y literales las propiedades físicas esenciales del material: `snapshot_requested_gsm`, `snapshot_requested_width_mm`, `snapshot_requested_height_mm`, `snapshot_requested_finish`, `snapshot_requested_category`.
4. **Idempotencia Garantizada por Índice Único:**
   - `UNIQUE KEY uk_opd_idempotency (tenant_id, idempotency_key)` previene a nivel de motor de base de datos la inserción accidental de decisiones duplicadas bajo la misma clave.

---

## 4. Plan de Rollback Seguro

Archivo: `migrations/rollback/rollback_167_phase196f_order_paper_decisions.sql`

```sql
DROP TABLE IF EXISTS order_paper_decisions;
```

**Evaluación de Riesgo de Reversión:**
- **Blast Radius:** Acotado estrictamente a la tabla `order_paper_decisions`.
- **Impacto sobre Tablas Existentes:** Cero (`paper_variants`, `paper_products`, `orders`, `marketplace_orders` no son modificadas ni alteradas).
- **Dependencias Inversas:** Ninguna tabla preexistente depende de `order_paper_decisions` en esta fase.

---

## 5. Verificación de Integridad y CI

La migración fue evaluada contra el motor de verificación canónico:
- Comando: `npm run migration:integrity`
- Resultado: **`PASSED`** (170 migraciones clasificadas, cero colisiones no autorizadas, baseline actualizado).
