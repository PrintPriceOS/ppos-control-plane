-- DDL Migration for Phase 16: Multi-Factory Federation Mesh
-- Targets distributed state management, lease tracking, and append-only LSN capability logging.

CREATE TABLE IF NOT EXISTS federation_nodes (
    id VARCHAR(50) PRIMARY KEY,
    node_name VARCHAR(100) NOT NULL,
    base_url VARCHAR(255) NOT NULL,
    status ENUM('LIVE', 'DEGRADED', 'OFFLINE') NOT NULL DEFAULT 'OFFLINE',
    last_heartbeat_at TIMESTAMP NULL,
    current_lsn BIGINT UNSIGNED NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_nodes_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS federation_leases (
    id INT AUTO_INCREMENT PRIMARY KEY,
    lease_key VARCHAR(50) UNIQUE NOT NULL,
    holder_node_id VARCHAR(50) NOT NULL,
    acquired_at TIMESTAMP NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    version INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_leases_node FOREIGN KEY (holder_node_id) REFERENCES federation_nodes (id) ON DELETE CASCADE,
    INDEX idx_leases_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS federation_capacity_log (
    lsn BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    origin_node_id VARCHAR(50) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    capacity_delta INT NOT NULL,
    payload_json JSON NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_capacity_log_node FOREIGN KEY (origin_node_id) REFERENCES federation_nodes (id) ON DELETE CASCADE,
    INDEX idx_capacity_log_ts (timestamp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed local placeholder metadata node configuration to pass initial validation
INSERT INTO federation_nodes (id, node_name, base_url, status)
VALUES ('node_local_primary', 'Primary Node', 'http://localhost:8081', 'LIVE')
ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP;
