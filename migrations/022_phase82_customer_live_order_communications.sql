-- migrations/022_phase82_customer_live_order_communications.sql
-- Migration for Customer Live Order Communications

CREATE TABLE IF NOT EXISTS customer_live_order_messages (
    id VARCHAR(255) PRIMARY KEY,
    tenant_id VARCHAR(255) NOT NULL,
    live_order_id VARCHAR(255) NOT NULL,
    customer_id VARCHAR(255),
    message_type VARCHAR(50) NOT NULL, -- STATUS_UPDATE, ACTION_REQUIRED, etc.
    channel VARCHAR(50) NOT NULL, -- PORTAL, EMAIL, SMS, WEBHOOK, INTERNAL_ONLY
    delivery_status VARCHAR(50) NOT NULL, -- CREATED, QUEUED, SENT, FAILED, READ, DISMISSED
    subject VARCHAR(255),
    body TEXT,
    safe_payload_json JSON,
    template_key VARCHAR(100),
    created_by VARCHAR(255),
    created_by_role VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    sent_at TIMESTAMP,
    read_at TIMESTAMP
);

CREATE INDEX idx_customer_live_order_messages_live_order_id ON customer_live_order_messages(live_order_id);
CREATE INDEX idx_customer_live_order_messages_tenant_id ON customer_live_order_messages(tenant_id);

CREATE TABLE IF NOT EXISTS customer_live_order_notification_events (
    id VARCHAR(255) PRIMARY KEY,
    tenant_id VARCHAR(255) NOT NULL,
    live_order_id VARCHAR(255) NOT NULL,
    customer_id VARCHAR(255),
    event_type VARCHAR(100) NOT NULL,
    channel VARCHAR(50),
    status VARCHAR(50),
    provider VARCHAR(100),
    provider_message_id VARCHAR(255),
    metadata_json JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_customer_live_order_notification_events_live_order_id ON customer_live_order_notification_events(live_order_id);
