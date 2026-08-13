-- migrations/141_phase191f_governed_pricing_configuration.sql
-- Phase 191F — Governed Pricing Configuration schema tables and triggers.

CREATE TABLE IF NOT EXISTS printhouse_price_books (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    name VARCHAR(255) NOT NULL,
    status ENUM('DRAFT', 'VALIDATING', 'READY_FOR_REVIEW', 'APPROVED', 'PUBLISHED', 'RETIRED') NOT NULL DEFAULT 'DRAFT',
    currency VARCHAR(10) NOT NULL DEFAULT 'EUR',
    effective_from TIMESTAMP NULL,
    effective_to TIMESTAMP NULL,
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    UNIQUE KEY uk_pb_tenant_id (id, tenant_id),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS printhouse_pricing_rules (
    id VARCHAR(64) PRIMARY KEY,
    price_book_id VARCHAR(64) NOT NULL,
    tenant_id VARCHAR(64) NOT NULL,
    scope ENUM('TENANT_DEFAULT', 'SITE_OVERRIDE', 'MACHINE_OVERRIDE', 'MATERIAL_RULE', 'FINISHING_RULE', 'SURCHARGE') NOT NULL,
    site_id VARCHAR(64) NULL,
    machine_id VARCHAR(64) NULL,
    material_catalog_id VARCHAR(64) NULL,
    capability_name VARCHAR(255) NULL,
    pricing_unit VARCHAR(64) NOT NULL, -- PER_JOB, PER_UNIT, PER_SHEET, PER_IMPRESSION, PER_HOUR, PER_SETUP
    base_price DECIMAL(12,4) NOT NULL DEFAULT 0,
    setup_charge DECIMAL(12,4) NOT NULL DEFAULT 0,
    minimum_order_value DECIMAL(12,4) NOT NULL DEFAULT 0,
    provenance VARCHAR(64) NOT NULL DEFAULT 'TENANT_DEFINED',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (price_book_id, tenant_id) REFERENCES printhouse_price_books(id, tenant_id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (site_id, tenant_id) REFERENCES printer_nodes(id, tenant_id) ON DELETE CASCADE,
    FOREIGN KEY (machine_id, tenant_id) REFERENCES printhouse_machines(id, tenant_id) ON DELETE CASCADE,
    FOREIGN KEY (material_catalog_id, tenant_id) REFERENCES materials_catalog(id, tenant_id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS printhouse_quantity_tiers (
    id VARCHAR(64) PRIMARY KEY,
    pricing_rule_id VARCHAR(64) NOT NULL,
    min_quantity INT NOT NULL,
    max_quantity INT NULL,
    unit_rate DECIMAL(12,4) NOT NULL DEFAULT 0,
    flat_charge DECIMAL(12,4) NOT NULL DEFAULT 0,
    method ENUM('UNIT_PRICE', 'FLAT_PRICE', 'BASE_PLUS_UNIT') NOT NULL DEFAULT 'UNIT_PRICE',

    FOREIGN KEY (pricing_rule_id) REFERENCES printhouse_pricing_rules(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- Triggers to Enforce Price Book Mutability Rules at DB Level
-- Single statement CASE-WHEN expressions to avoid DELIMITER and eager function evaluation
-- -----------------------------------------------------------------------------

CREATE TRIGGER trg_pricing_rules_before_insert
BEFORE INSERT ON printhouse_pricing_rules
FOR EACH ROW
SELECT CASE
    WHEN (SELECT status FROM printhouse_price_books WHERE id = NEW.price_book_id) IN ('PUBLISHED', 'RETIRED', 'APPROVED')
    THEN CAST('PRICE_BOOK_NOT_EDITABLE' AS JSON)
    ELSE 1
END INTO @dummy;

CREATE TRIGGER trg_pricing_rules_before_update
BEFORE UPDATE ON printhouse_pricing_rules
FOR EACH ROW
SELECT CASE
    WHEN (SELECT status FROM printhouse_price_books WHERE id = OLD.price_book_id) IN ('PUBLISHED', 'RETIRED', 'APPROVED')
    THEN CAST('PRICE_BOOK_NOT_EDITABLE' AS JSON)
    ELSE 1
END INTO @dummy;

CREATE TRIGGER trg_pricing_rules_before_delete
BEFORE DELETE ON printhouse_pricing_rules
FOR EACH ROW
SELECT CASE
    WHEN (SELECT status FROM printhouse_price_books WHERE id = OLD.price_book_id) IN ('PUBLISHED', 'RETIRED', 'APPROVED')
    THEN CAST('PRICE_BOOK_NOT_EDITABLE' AS JSON)
    ELSE 1
END INTO @dummy;

CREATE TRIGGER trg_quantity_tiers_before_insert
BEFORE INSERT ON printhouse_quantity_tiers
FOR EACH ROW
SELECT CASE
    WHEN (SELECT pb.status FROM printhouse_price_books pb JOIN printhouse_pricing_rules pr ON pb.id = pr.price_book_id WHERE pr.id = NEW.pricing_rule_id) IN ('PUBLISHED', 'RETIRED', 'APPROVED')
    THEN CAST('PRICE_BOOK_NOT_EDITABLE' AS JSON)
    ELSE 1
END INTO @dummy;

CREATE TRIGGER trg_quantity_tiers_before_update
BEFORE UPDATE ON printhouse_quantity_tiers
FOR EACH ROW
SELECT CASE
    WHEN (SELECT pb.status FROM printhouse_price_books pb JOIN printhouse_pricing_rules pr ON pb.id = pr.price_book_id WHERE pr.id = OLD.pricing_rule_id) IN ('PUBLISHED', 'RETIRED', 'APPROVED')
    THEN CAST('PRICE_BOOK_NOT_EDITABLE' AS JSON)
    ELSE 1
END INTO @dummy;

CREATE TRIGGER trg_quantity_tiers_before_delete
BEFORE DELETE ON printhouse_quantity_tiers
FOR EACH ROW
SELECT CASE
    WHEN (SELECT pb.status FROM printhouse_price_books pb JOIN printhouse_pricing_rules pr ON pb.id = pr.price_book_id WHERE pr.id = OLD.pricing_rule_id) IN ('PUBLISHED', 'RETIRED', 'APPROVED')
    THEN CAST('PRICE_BOOK_NOT_EDITABLE' AS JSON)
    ELSE 1
END INTO @dummy;
