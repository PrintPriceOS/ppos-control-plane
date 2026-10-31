-- Migration 156: Tenant Notification Preferences Schema Synchronization
-- Phase 194F: Safely adds email_order_alerts, email_qc_alerts, email_sla_alerts, and webhook_endpoint columns if missing.

DELIMITER $$
DROP PROCEDURE IF EXISTS sync_tenant_notification_preferences_cols $$
CREATE PROCEDURE sync_tenant_notification_preferences_cols()
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tenant_notification_preferences' AND COLUMN_NAME = 'email_order_alerts'
    ) THEN
        ALTER TABLE tenant_notification_preferences ADD COLUMN email_order_alerts TINYINT(1) DEFAULT 1;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tenant_notification_preferences' AND COLUMN_NAME = 'email_qc_alerts'
    ) THEN
        ALTER TABLE tenant_notification_preferences ADD COLUMN email_qc_alerts TINYINT(1) DEFAULT 1;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tenant_notification_preferences' AND COLUMN_NAME = 'email_sla_alerts'
    ) THEN
        ALTER TABLE tenant_notification_preferences ADD COLUMN email_sla_alerts TINYINT(1) DEFAULT 1;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tenant_notification_preferences' AND COLUMN_NAME = 'webhook_endpoint'
    ) THEN
        ALTER TABLE tenant_notification_preferences ADD COLUMN webhook_endpoint VARCHAR(512) NULL;
    END IF;
END $$
DELIMITER ;

CALL sync_tenant_notification_preferences_cols();
DROP PROCEDURE IF EXISTS sync_tenant_notification_preferences_cols;
