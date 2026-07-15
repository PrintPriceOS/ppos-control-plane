CREATE TABLE IF NOT EXISTS order_pricing_snapshots (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,

  snapshot_id VARCHAR(64) NOT NULL,
  order_id VARCHAR(64) NOT NULL,
  tenant_id VARCHAR(64) NOT NULL,
  printhouse_id VARCHAR(64) NULL,
  quote_id VARCHAR(64) NOT NULL,

  quote_revision INT NOT NULL,
  snapshot_revision INT NOT NULL,

  status ENUM(
    'SEALED',
    'SUPERSEDED',
    'VOIDED'
  ) NOT NULL DEFAULT 'SEALED',

  currency CHAR(3) NOT NULL,
  final_amount DECIMAL(18,4) NOT NULL,

  formula_version VARCHAR(64) NOT NULL,
  rate_card_id VARCHAR(64) NULL,
  rate_card_revision INT NULL,
  rate_card_checksum VARCHAR(128) NULL,

  snapshot_json JSON NOT NULL,
  snapshot_checksum VARCHAR(128) NOT NULL,

  sealed_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  sealed_by VARCHAR(255) NOT NULL,

  superseded_at TIMESTAMP(6) NULL,
  superseded_by VARCHAR(255) NULL,
  superseded_by_snapshot_id VARCHAR(64) NULL,

  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

  UNIQUE KEY uq_order_snapshot_revision (order_id, snapshot_revision),
  UNIQUE KEY uq_quote_snapshot (quote_id, quote_revision),
  UNIQUE KEY uq_snapshot_id (snapshot_id)
);

-- Note: In this system, DDL changes might need to be tracked or schema checked. 
-- For now, this adds the missing active_pricing_snapshot_id pointer to orders without dropping anything.
-- However, we must ensure orders exists. We use a stored procedure to add the column safely if not exists.

DELIMITER $$
CREATE PROCEDURE AddOrderPricingSnapshotId()
BEGIN
    IF NOT EXISTS (
        SELECT * FROM information_schema.columns 
        WHERE table_schema = DATABASE() 
        AND table_name = 'orders' 
        AND column_name = 'active_pricing_snapshot_id'
    ) THEN
        ALTER TABLE orders ADD COLUMN active_pricing_snapshot_id VARCHAR(64) NULL;
    END IF;
END $$
DELIMITER ;

CALL AddOrderPricingSnapshotId();
DROP PROCEDURE AddOrderPricingSnapshotId;

-- Add a status column to job_quotes if it doesn't exist
DELIMITER $$
CREATE PROCEDURE AddJobQuoteStatusAndRevision()
BEGIN
    IF NOT EXISTS (
        SELECT * FROM information_schema.columns 
        WHERE table_schema = DATABASE() 
        AND table_name = 'job_quotes' 
        AND column_name = 'status'
    ) THEN
        ALTER TABLE job_quotes ADD COLUMN status ENUM('DRAFT', 'ACCEPTED', 'EXPIRED', 'REJECTED', 'SUPERSEDED', 'VOIDED') NOT NULL DEFAULT 'DRAFT';
    END IF;

    IF NOT EXISTS (
        SELECT * FROM information_schema.columns 
        WHERE table_schema = DATABASE() 
        AND table_name = 'job_quotes' 
        AND column_name = 'revision'
    ) THEN
        ALTER TABLE job_quotes ADD COLUMN revision INT NOT NULL DEFAULT 1;
    END IF;
END $$
DELIMITER ;

CALL AddJobQuoteStatusAndRevision();
DROP PROCEDURE AddJobQuoteStatusAndRevision;

-- -----------------------------------------------------------------------------
-- Immutability Guards for order_pricing_snapshots
-- -----------------------------------------------------------------------------
DELIMITER $$

CREATE TRIGGER trg_order_pricing_snapshots_before_update
BEFORE UPDATE ON order_pricing_snapshots
FOR EACH ROW
BEGIN
    IF OLD.status = 'SEALED' THEN
        -- Allow transitions of status and metadata, but strictly forbid modifying immutable columns
        IF NOT (NEW.snapshot_json <=> OLD.snapshot_json)
           OR NOT (NEW.snapshot_checksum <=> OLD.snapshot_checksum)
           OR NOT (NEW.final_amount <=> OLD.final_amount)
           OR NOT (NEW.currency <=> OLD.currency)
           OR NOT (NEW.formula_version <=> OLD.formula_version)
           OR NOT (NEW.rate_card_id <=> OLD.rate_card_id)
           OR NOT (NEW.rate_card_revision <=> OLD.rate_card_revision)
           OR NOT (NEW.rate_card_checksum <=> OLD.rate_card_checksum)
           OR NOT (NEW.quote_id <=> OLD.quote_id)
           OR NOT (NEW.order_id <=> OLD.order_id)
           OR NOT (NEW.tenant_id <=> OLD.tenant_id)
           OR NOT (NEW.printhouse_id <=> OLD.printhouse_id)
           OR NOT (NEW.quote_revision <=> OLD.quote_revision)
           OR NOT (NEW.snapshot_revision <=> OLD.snapshot_revision)
           OR NOT (NEW.sealed_at <=> OLD.sealed_at)
           OR NOT (NEW.sealed_by <=> OLD.sealed_by)
        THEN
            SIGNAL SQLSTATE '45000'
                SET MESSAGE_TEXT = 'SEALED_PRICING_SNAPSHOT_IMMUTABLE';
        END IF;
    END IF;

    -- Prevent status transition + financial mutation at the same time
    IF OLD.status = 'SEALED' AND NEW.status = 'SUPERSEDED' THEN
        IF NOT (NEW.final_amount <=> OLD.final_amount) THEN
            SIGNAL SQLSTATE '45000'
                SET MESSAGE_TEXT = 'FINANCIAL_MUTATION_DURING_LIFECYCLE_TRANSITION_REJECTED';
        END IF;
    END IF;
END $$

CREATE TRIGGER trg_order_pricing_snapshots_before_delete
BEFORE DELETE ON order_pricing_snapshots
FOR EACH ROW
BEGIN
    IF OLD.status IN ('SEALED', 'SUPERSEDED') THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'PRICING_SNAPSHOT_DELETE_FORBIDDEN';
    END IF;
END $$

-- -----------------------------------------------------------------------------
-- Consistency Guard for active_pricing_snapshot_id on orders
-- -----------------------------------------------------------------------------
CREATE TRIGGER trg_orders_before_insert
BEFORE INSERT ON orders
FOR EACH ROW
BEGIN
    IF NEW.active_pricing_snapshot_id IS NOT NULL THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'ACTIVE_PRICING_SNAPSHOT_NOT_ALLOWED_ON_ORDER_INSERT';
    END IF;
END $$

CREATE TRIGGER trg_orders_active_pricing_snapshot_consistency
BEFORE UPDATE ON orders
FOR EACH ROW
BEGIN
    DECLARE snap_order_id VARCHAR(64);
    DECLARE snap_tenant_id VARCHAR(64);
    DECLARE snap_printhouse_id VARCHAR(64);
    DECLARE snap_status VARCHAR(64);
    DECLARE snap_currency CHAR(3);

    IF NEW.active_pricing_snapshot_id IS NOT NULL AND NEW.active_pricing_snapshot_id != COALESCE(OLD.active_pricing_snapshot_id, '') THEN
        SELECT order_id, tenant_id, printhouse_id, status, currency 
        INTO snap_order_id, snap_tenant_id, snap_printhouse_id, snap_status, snap_currency
        FROM order_pricing_snapshots
        WHERE snapshot_id = NEW.active_pricing_snapshot_id;

        IF snap_order_id IS NULL THEN
            SIGNAL SQLSTATE '45000'
                SET MESSAGE_TEXT = 'ACTIVE_PRICING_SNAPSHOT_NOT_FOUND';
        END IF;

        IF snap_order_id != NEW.id THEN
            SIGNAL SQLSTATE '45000'
                SET MESSAGE_TEXT = 'ACTIVE_PRICING_SNAPSHOT_ORDER_MISMATCH';
        END IF;

        IF snap_tenant_id != NEW.tenant_id THEN
            SIGNAL SQLSTATE '45000'
                SET MESSAGE_TEXT = 'ACTIVE_PRICING_SNAPSHOT_TENANT_MISMATCH';
        END IF;

        IF snap_printhouse_id IS NOT NULL AND NEW.assigned_printhouse_id IS NOT NULL AND snap_printhouse_id != NEW.assigned_printhouse_id THEN
            SIGNAL SQLSTATE '45000'
                SET MESSAGE_TEXT = 'ACTIVE_PRICING_SNAPSHOT_PRINTHOUSE_MISMATCH';
        END IF;

        IF snap_status != 'SEALED' THEN
            SIGNAL SQLSTATE '45000'
                SET MESSAGE_TEXT = 'ACTIVE_PRICING_SNAPSHOT_NOT_SEALED';
        END IF;

        IF snap_currency != NEW.currency THEN
            SIGNAL SQLSTATE '45000'
                SET MESSAGE_TEXT = 'ACTIVE_PRICING_SNAPSHOT_CURRENCY_MISMATCH';
        END IF;
    END IF;
END $$

DELIMITER ;
