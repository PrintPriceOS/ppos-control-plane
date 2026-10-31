-- docs/migrations/control_users.sql
-- Idempotent migration for Control Plane Users

CREATE TABLE IF NOT EXISTS control_users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('super_admin', 'ops_admin', 'tenant_admin', 'viewer') DEFAULT 'viewer',
    tenant_id VARCHAR(64) NOT NULL DEFAULT 'ppos-production',
    status ENUM('ACTIVE', 'SUSPENDED', 'DELETED') DEFAULT 'ACTIVE',
    last_login_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_email (email),
    INDEX idx_tenant (tenant_id)
) ENGINE=InnoDB;
