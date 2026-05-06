/**
 * src/api/services/printhouseService.js
 * 
 * Orchestrates Printhouse self-registration and management.
 */
const db = require('./mysqlClient');
const userService = require('./controlUserService');
const { v4: uuidv4 } = require('uuid');

class PrinthouseService {
    /**
     * Register a new Printhouse along with its tenant and admin user.
     * Endures "Fail-Loud" behavior and Atomic creation.
     */
    async selfRegister({ companyName, contactName, email, password, country, city, phone, website }) {
        // 1. Validate if user exists
        const existingUser = await userService.findByEmail(email);
        if (existingUser) {
            throw new Error('User with this email already exists');
        }

        const connection = await db.getConnection();
        await connection.beginTransaction();

        try {
            // 2. Create Tenant (Printhouse Mode)
            const tenantId = `ph-${uuidv4().substring(0, 8)}`;
            await connection.query(
                'INSERT INTO tenants (id, name, type, status, plan) VALUES (?, ?, ?, ?, ?)',
                [tenantId, companyName, 'PRINTHOUSE', 'ACTIVE', 'FREE']
            );

            // 3. Create Printer Node (Node Record)
            // Initial status: pending_review (Marketplace locked)
            const printhouseId = `node-${uuidv4().substring(0, 8)}`;
            await connection.query(
                `INSERT INTO printer_nodes 
                (id, tenant_id, name, country, city, email, phone, website, status, marketplace_enabled, visibility_scope) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [printhouseId, tenantId, companyName, country, city, email, phone, website, 'pending_review', false, 'private']
            );

            // 4. Create Initial Capability Profile (Empty defaults)
            await connection.query(
                `INSERT INTO printhouse_capabilities (printhouse_id, tenant_id, supported_countries)
                 VALUES (?, ?, ?)`,
                [printhouseId, tenantId, JSON.stringify([country || 'ES'])]
            );

            // 5. Create Trial License (30 days)
            const licenseKey = `TRIAL-${uuidv4().substring(0, 12).toUpperCase()}`;
            await connection.query(
                `INSERT INTO licenses (tenant_id, printhouse_id, license_key, status, expires_at)
                 VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 30 DAY))`,
                [tenantId, printhouseId, licenseKey, 'trial']
            );

            // 6. Create Admin User
            const user = await userService.createUser(
                email, 
                'PRINTHOUSE_ADMIN', 
                tenantId, 
                password, 
                printhouseId
            );

            await connection.commit();

            return {
                tenantId,
                printhouseId,
                user,
                licenseKey
            };
        } catch (err) {
            await connection.rollback();
            throw err;
        } finally {
            connection.release();
        }
    }

    /**
     * Find printhouse by ID.
     */
    async findById(id) {
        const rows = await db.query('SELECT * FROM printer_nodes WHERE id = ?', [id]);
        return rows && rows.length > 0 ? rows[0] : null;
    }
}

module.exports = new PrinthouseService();
