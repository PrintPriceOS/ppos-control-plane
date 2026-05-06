/**
 * src/api/services/controlUserService.js
 * 
 * User management service with bcrypt hashing.
 */
const bcrypt = require('bcrypt');
const db = require('./mysqlClient');

class ControlUserService {
    /**
     * Create a new control user.
     */
    async createUser(email, role, tenantId, password) {
        const passwordHash = await bcrypt.hash(password, 10);
        
        const result = await db.query(
            'INSERT INTO control_users (email, role, tenant_id, password_hash) VALUES (?, ?, ?, ?)',
            [email, role, tenantId, passwordHash]
        );
        
        return { id: result.insertId, email, role, tenantId };
    }

    /**
     * Find user by email for authentication.
     */
    async findByEmail(email) {
        const users = await db.query(
            'SELECT * FROM control_users WHERE email = ? AND status = "ACTIVE"',
            [email]
        );
        return users && users.length > 0 ? users[0] : null;
    }

    /**
     * Update last login timestamp.
     */
    async updateLastLogin(userId) {
        await db.query(
            'UPDATE control_users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?',
            [userId]
        );
    }
}

module.exports = new ControlUserService();
