/**
 * src/api/services/userSessionService.js
 * 
 * Phase 195E — Server-Side Identifiable and Revocable Sessions.
 */
const { v4: uuidv4 } = require('uuid');
const db = require('./mysqlClient');
const logger = require('./logger').child('user-sessions');

const DEFAULT_INACTIVITY_MINUTES = 60;
const DEFAULT_ABSOLUTE_HOURS = 24;

class UserSessionService {

    /**
     * Ensures table exists if migration hasn't run yet.
     */
    async ensureTableExists() {
        try {
            await db.query(`
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
            `);
        } catch (err) {
            logger.warn('Failed to auto-ensure user_sessions table', { error: err.message });
        }
    }

    /**
     * Creates a new trackable server session.
     */
    async createSession({ userId, tenantId, role, ipAddress = null, userAgent = null, inactivityMinutes = DEFAULT_INACTIVITY_MINUTES, absoluteHours = DEFAULT_ABSOLUTE_HOURS }) {
        await this.ensureTableExists();

        const sessionId = uuidv4();
        const now = new Date();
        const expiresAt = new Date(now.getTime() + (absoluteHours * 60 * 60 * 1000));

        await db.query(
            `INSERT INTO user_sessions (id, user_id, tenant_id, role, ip_address, user_agent, status, last_activity_at, expires_at, created_at)
             VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', NOW(), ?, NOW())`,
            [sessionId, userId, tenantId, role, ipAddress, userAgent ? userAgent.slice(0, 500) : null, expiresAt]
        );

        return {
            sessionId,
            userId,
            tenantId,
            expiresAt,
            inactivityMinutes
        };
    }

    /**
     * Validates session state, expiry, and inactivity timeout on the server side.
     */
    async validateSession(sessionId, tenantId = null, inactivityMinutes = DEFAULT_INACTIVITY_MINUTES) {
        if (!sessionId) {
            return { valid: false, reason: 'MISSING_SESSION_ID' };
        }

        try {
            await this.ensureTableExists();

            let query = `SELECT id, user_id, tenant_id, role, status, last_activity_at, expires_at FROM user_sessions WHERE id = ?`;
            let params = [sessionId];

            if (tenantId) {
                query += ` AND tenant_id = ?`;
                params.push(tenantId);
            }

            const [session] = await db.query(query, params).catch(() => []);

            if (!session) {
                return { valid: false, reason: 'SESSION_NOT_FOUND' };
            }

            if (session.status === 'REVOKED') {
                return { valid: false, reason: 'SESSION_REVOKED' };
            }

            const now = new Date();

            // 1. Absolute Expiration Check
            if (now > new Date(session.expires_at)) {
                await this.markExpired(session.id, 'ABSOLUTE_EXPIRATION');
                return { valid: false, reason: 'SESSION_EXPIRED' };
            }

            // 2. Inactivity Timeout Check
            const lastActivity = new Date(session.last_activity_at);
            const inactivityMs = inactivityMinutes * 60 * 1000;
            if ((now.getTime() - lastActivity.getTime()) > inactivityMs) {
                await this.markExpired(session.id, 'INACTIVITY_TIMEOUT');
                return { valid: false, reason: 'SESSION_INACTIVE' };
            }

            // 3. Throttled activity update (at most once every 60s)
            if ((now.getTime() - lastActivity.getTime()) > 60000) {
                db.query(`UPDATE user_sessions SET last_activity_at = NOW() WHERE id = ?`, [session.id]).catch(() => {});
            }

            return {
                valid: true,
                session
            };
        } catch (err) {
            logger.error('Session validation error', { error: err.message, sessionId });
            // Fail closed
            return { valid: false, reason: 'SESSION_VALIDATION_ERROR' };
        }
    }

    async markExpired(sessionId, reason = 'EXPIRED') {
        await db.query(
            `UPDATE user_sessions SET status = 'EXPIRED', revoked_reason = ? WHERE id = ? AND status = 'ACTIVE'`,
            [reason, sessionId]
        ).catch(() => {});
    }

    /**
     * Revokes a specific session.
     */
    async revokeSession(sessionId, tenantId = null, reason = 'USER_LOGOUT') {
        await this.ensureTableExists();

        let query = `UPDATE user_sessions SET status = 'REVOKED', revoked_at = NOW(), revoked_reason = ? WHERE id = ?`;
        let params = [reason, sessionId];

        if (tenantId) {
            query += ` AND tenant_id = ?`;
            params.push(tenantId);
        }

        const result = await db.query(query, params);
        return { ok: true, affectedRows: result.affectedRows || 0 };
    }

    /**
     * Revokes all active sessions for a user.
     */
    async revokeAllUserSessions(userId, tenantId = null, reason = 'REVOKE_ALL') {
        await this.ensureTableExists();

        let query = `UPDATE user_sessions SET status = 'REVOKED', revoked_at = NOW(), revoked_reason = ? WHERE user_id = ? AND status = 'ACTIVE'`;
        let params = [reason, userId];

        if (tenantId) {
            query += ` AND tenant_id = ?`;
            params.push(tenantId);
        }

        const result = await db.query(query, params);
        return { ok: true, revokedCount: result.affectedRows || 0 };
    }

    /**
     * Lists active sessions for a given user or tenant.
     */
    async listSessions(userId, tenantId) {
        await this.ensureTableExists();

        const rows = await db.query(
            `SELECT id, user_id, tenant_id, role, ip_address, user_agent, status, last_activity_at, expires_at, created_at
             FROM user_sessions
             WHERE user_id = ? AND tenant_id = ?
             ORDER BY created_at DESC
             LIMIT 50`,
            [userId, tenantId]
        );

        return rows.map(r => ({
            id: r.id,
            userId: r.user_id,
            tenantId: r.tenant_id,
            role: r.role,
            ipAddress: r.ip_address,
            userAgent: r.user_agent,
            status: r.status,
            lastActivityAt: r.last_activity_at,
            expiresAt: r.expires_at,
            createdAt: r.created_at
        }));
    }
}

module.exports = new UserSessionService();
