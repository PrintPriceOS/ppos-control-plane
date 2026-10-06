-- ============================================================================
-- PrintPrice OS Control Plane — Authentication & Session Contract Schemas
-- ============================================================================
-- Source 1: migrations/158_phase195e_auth_sessions_and_mfa.sql
-- Source 2: src/api/services/controlPlaneSchemaService.js (control_users)
-- ============================================================================

-- 1. Control Users Table (Authentic Operator & Admin Identity Table)
CREATE TABLE IF NOT EXISTS control_users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('SUPER_ADMIN', 'OPS_ADMIN', 'TENANT_ADMIN', 'PRINTHOUSE_ADMIN', 'PRINTHOUSE_OPERATOR', 'VIEWER') DEFAULT 'VIEWER',
    tenant_id VARCHAR(64) NOT NULL DEFAULT 'ppos-production',
    printhouse_id VARCHAR(64) NULL,
    status ENUM('ACTIVE', 'SUSPENDED', 'DELETED') DEFAULT 'ACTIVE',
    last_login_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_email (email),
    INDEX idx_tenant (tenant_id),
    INDEX idx_printhouse (printhouse_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Server-side User Sessions Table (Phase 195E Identifiable & Revocable Sessions)
CREATE TABLE IF NOT EXISTS user_sessions (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    tenant_id VARCHAR(255) NOT NULL,
    role VARCHAR(64) NOT NULL,
    ip_address VARCHAR(64) NULL,
    user_agent TEXT NULL,
    status ENUM('ACTIVE', 'REVOKED', 'EXPIRED') NOT NULL DEFAULT 'ACTIVE',
    last_activity_at DATETIME NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revoked_at DATETIME NULL,
    revoked_reason VARCHAR(255) NULL,
    INDEX idx_user_sessions_user_tenant (user_id, tenant_id),
    INDEX idx_user_sessions_status_exp (status, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- Identity Contract Alignment Analysis:
-- ----------------------------------------------------------------------------
-- 1. `control_users.id` (INT) -> stringified as `userId = String(insertId)`.
-- 2. `userSessionService.createSession({ userId, tenantId, role, ... })`:
--    - Stores `userId` in `user_sessions.user_id`
--    - Stores `tenantId` in `user_sessions.tenant_id`
--    - Generates `effectiveSessionId = sessionId || uuidv4()` as `user_sessions.id`
--    - Returns `{ sessionId: effectiveSessionId, userId, tenantId, expiresAt }`
-- 3. JWT Signing (in harness / auth routes):
--    - `sub`: `userId` (matches `control_users.id` and `user_sessions.user_id`)
--    - `jti`: `session.sessionId` (matches `user_sessions.id`)
--    - `tenant_id`: `tenantId` (matches `user_sessions.tenant_id`)
--    - `role`: `role`
-- 4. `auth.js` Middleware Verification:
--    - Verifies token signature, issuer, audience
--    - Extracts `decoded.jti`, `decoded.tenant_id`, `decoded.sub`
--    - Calls `userSessionService.validateSession(decoded.jti, decoded.tenant_id, decoded.sub)`
--    - `validateSession` queries:
--      `SELECT id, user_id, tenant_id, role, status, last_activity_at, expires_at FROM user_sessions WHERE id = ?`
--      using `decoded.jti` (matching `user_sessions.id`)
--    - Asserts `session.tenant_id === decoded.tenant_id` (rejects with SESSION_TENANT_MISMATCH)
--    - Asserts `session.user_id === decoded.sub` (rejects with SESSION_USER_MISMATCH)
--    - Populates `req.user` with `id: decoded.sub`, `tenantId: decoded.tenant_id`, `sessionId: decoded.jti`
-- 5. Relational Enforcement & Foreign Key Clarification:
--    - `user_sessions` does NOT declare an SQL FOREIGN KEY constraint to `control_users(id)` in MySQL.
--    - Referential integrity and identity binding are enforced strictly at the application layer:
--      `userSessionService.validateSession` confirms `session.user_id === decoded.sub`, and
--      `userSessionService.createSession` validates the operator identity before session issuance.
-- ============================================================================
