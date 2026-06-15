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
    async selfRegister({ companyName, contactName, email, password, country, city, phone, website, metadata }) {
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
            const metadataStr = metadata ? JSON.stringify(metadata) : null;
            await connection.query(
                'INSERT INTO tenants (id, name, type, status, plan, metadata_json) VALUES (?, ?, ?, ?, ?, ?)',
                [tenantId, companyName, 'PRINTHOUSE', 'ACTIVE', 'FREE', metadataStr]
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

            // 7. Auto-Seed Machinery from B2B Stepper templates if present
            if (metadata && metadata.qualification && Array.isArray(metadata.qualification.presses)) {
                try {
                    const printhouseCapabilityService = require('./printhouseCapabilityService');
                    const { MACHINE_TEMPLATES } = require('../routes/printhouseCapabilities');
                    
                    const actorContext = { tenantId, userId: user.id, role: 'PRINTHOUSE_ADMIN' };
                    
                    for (const selection of metadata.qualification.presses) {
                        const template = MACHINE_TEMPLATES.find(t => t.id === selection.templateId);
                        if (template) {
                            const quantity = parseInt(selection.quantity, 10) || 1;
                            for (let i = 1; i <= quantity; i++) {
                                await printhouseCapabilityService.createMachine(printhouseId, {
                                    machine_name: `${template.manufacturer} ${template.model} #${i}`,
                                    machine_type: `${template.machine_type}_PRESS`,
                                    manufacturer: template.manufacturer,
                                    model: template.model,
                                    status: 'ACTIVE',
                                    max_sheet_width_mm: template.max_sheet_width_mm,
                                    max_sheet_height_mm: template.max_sheet_height_mm,
                                    min_sheet_width_mm: template.min_sheet_width_mm,
                                    min_sheet_height_mm: template.min_sheet_height_mm,
                                    max_print_width_mm: template.max_print_width_mm,
                                    max_print_height_mm: template.max_print_height_mm,
                                    max_tac_percent: template.max_tac_percent,
                                    supports_pdfx: template.supports_pdfx,
                                    supports_spot_uv: template.supports_spot_uv,
                                    supports_white_ink: template.supports_white_ink,
                                    metadata_json: { seeded_from_template: template.id }
                                }, actorContext);
                            }
                        }
                    }
                } catch (seedErr) {
                    console.error('[PRINTHOUSE-AUTO-SEED-ERR]', seedErr);
                }
            }

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
