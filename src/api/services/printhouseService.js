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

        // Extract pricing and visibility details from B2B qualification metadata
        const qualification = metadata?.qualification || {};
        const selectedPlan = (qualification.selectedPlan || 'starter').toUpperCase(); // STARTER / GROWTH / ENTERPRISE
        const integrationLevel = qualification.integrationLevel || 'Dashboard Only';
        const billingInterval = qualification.billingInterval || 'monthly';

        // Budgeter Visibility Priority: HIGH (enterprise), STANDARD (growth), LOW (trial/starter)
        let budgeterPriority = 'LOW';
        if (selectedPlan === 'ENTERPRISE') {
            budgeterPriority = 'HIGH';
        } else if (selectedPlan === 'GROWTH') {
            budgeterPriority = 'STANDARD';
        }

        // AI Credits Allocation: STARTER (Trial): 10, GROWTH: 100, ENTERPRISE: unlimited (null)
        let aiCreditsAllocation = 10;
        if (selectedPlan === 'GROWTH') {
            aiCreditsAllocation = 100;
        } else if (selectedPlan === 'ENTERPRISE') {
            aiCreditsAllocation = null; // Unlimited
        }

        // Orchestration Permissions (JDF/JMF) based on selectedPlan
        let orchestrationPermissions = [];
        if (selectedPlan === 'ENTERPRISE' || selectedPlan === 'GROWTH') {
            orchestrationPermissions = ['JDF', 'JMF'];
        }

        // Webhook Provisioning based on integrationLevel
        let webhooksEnabled = false;
        let provisionedEndpoints = [];
        if (integrationLevel === 'Fully automated routing' || integrationLevel === 'API-ready') {
            webhooksEnabled = true;
            provisionedEndpoints = [
                { type: 'ORDER_CREATED', url: 'pending_configuration', status: 'INACTIVE' },
                { type: 'JOB_STATE_CHANGED', url: 'pending_configuration', status: 'INACTIVE' }
            ];
            if (integrationLevel === 'Fully automated routing') {
                // Add specific automated routing endpoint for direct machine instructions
                provisionedEndpoints.push({ type: 'JDF_TICKET_DELIVERY', url: 'pending_configuration', status: 'INACTIVE' });
            }
        }

        // Inject computed properties into metadata JSON
        if (metadata) {
            metadata.ai_credits_allocation = aiCreditsAllocation;
            metadata.budgeter_priority = budgeterPriority;
            metadata.orchestration_permissions = orchestrationPermissions;
            if (webhooksEnabled) {
                metadata.webhooks = provisionedEndpoints;
            }
        }

        const connection = await db.getPool().getConnection();
        await connection.beginTransaction();

        try {
            // 2. Create Tenant (Printhouse Mode) - store selectedPlan in the 'plan' column
            const tenantId = `ph-${uuidv4().substring(0, 8)}`;
            const metadataStr = metadata ? JSON.stringify(metadata) : null;
            await connection.query(
                'INSERT INTO tenants (id, name, type, status, plan, metadata_json) VALUES (?, ?, ?, ?, ?, ?)',
                [tenantId, companyName, 'PRINTHOUSE', 'ACTIVE', selectedPlan, metadataStr]
            );

            // 3. Create Printer Node (Node Record) with budgeter_priority (stored in metadata or column if exists; assuming metadata first or fallback)
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

            // 5. Create Admin User
            const user = await userService.createUser(
                email,
                'PRINTHOUSE_ADMIN',
                tenantId,
                password,
                printhouseId
            );

            // 6. Create Tenant License
            const trialDays = selectedPlan === 'STARTER' ? 14 : 30;
            await connection.query(
                `INSERT INTO tenant_licenses (tenant_id, license_type, status, plan, expires_at)
                 VALUES (?, 'PRINTER_OPERATIONS', 'ACTIVE', ?, DATE_ADD(NOW(), INTERVAL ? DAY))`,
                [tenantId, selectedPlan, trialDays]
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
                user
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

    /**
     * Admin-controlled provisioning of a new Printhouse partner.
     * 
     * Unlike selfRegister:
     * - Status is set to ACTIVE immediately (admin has verified the partner offline).
     * - No auto-login JWT is returned.
     * - The provisioning admin's ID is recorded in the audit log.
     * - A welcome notification is logged (email dispatch can be wired in later).
     * 
     * @param {object} data - Same payload as selfRegister (from 7-step form in adminMode)
     * @param {string} adminId - The ID/email of the super admin performing the action
     */
    async adminProvision(data, adminId) {
        const { companyName, contactName, email, password, country, city, phone, website, metadata } = data;

        // Validate
        const existingUser = await userService.findByEmail(email);
        if (existingUser) {
            throw new Error(`A user with email ${email} already exists`);
        }

        // Reuse same plan/capability logic as selfRegister
        const qualification = metadata?.qualification || {};
        const selectedPlan = (qualification.selectedPlan || 'starter').toUpperCase();
        const integrationLevel = qualification.integrationLevel || 'Dashboard Only';
        const billingInterval = qualification.billingInterval || 'monthly';

        let budgeterPriority = 'LOW';
        if (selectedPlan === 'ENTERPRISE') budgeterPriority = 'HIGH';
        else if (selectedPlan === 'GROWTH') budgeterPriority = 'STANDARD';

        let aiCreditsAllocation = 10;
        if (selectedPlan === 'GROWTH') aiCreditsAllocation = 100;
        else if (selectedPlan === 'ENTERPRISE') aiCreditsAllocation = null;

        let orchestrationPermissions = [];
        if (selectedPlan === 'ENTERPRISE' || selectedPlan === 'GROWTH') {
            orchestrationPermissions = ['JDF', 'JMF'];
        }

        let webhooksEnabled = false;
        let provisionedEndpoints = [];
        if (integrationLevel === 'Fully automated routing' || integrationLevel === 'API-ready') {
            webhooksEnabled = true;
            provisionedEndpoints = [
                { type: 'ORDER_CREATED', url: 'pending_configuration', status: 'INACTIVE' },
                { type: 'JOB_STATE_CHANGED', url: 'pending_configuration', status: 'INACTIVE' }
            ];
            if (integrationLevel === 'Fully automated routing') {
                provisionedEndpoints.push({ type: 'JDF_TICKET_DELIVERY', url: 'pending_configuration', status: 'INACTIVE' });
            }
        }

        if (metadata) {
            metadata.ai_credits_allocation = aiCreditsAllocation;
            metadata.budgeter_priority = budgeterPriority;
            metadata.orchestration_permissions = orchestrationPermissions;
            metadata.provisioned_by_admin = adminId;
            metadata.provisioned_at = new Date().toISOString();
            if (webhooksEnabled) metadata.webhooks = provisionedEndpoints;
        }

        const connection = await db.getPool().getConnection();
        await connection.beginTransaction();

        try {
            // Tenant
            const tenantId = `ph-${require('uuid').v4().substring(0, 8)}`;
            const metadataStr = metadata ? JSON.stringify(metadata) : null;
            await connection.query(
                'INSERT INTO tenants (id, name, type, status, plan, metadata_json) VALUES (?, ?, ?, ?, ?, ?)',
                [tenantId, companyName, 'PRINTHOUSE', 'ACTIVE', selectedPlan, metadataStr]
            );

            // Printer Node — ACTIVE immediately (admin-provisioned partners bypass pending_review)
            const printhouseId = `node-${require('uuid').v4().substring(0, 8)}`;
            await connection.query(
                `INSERT INTO printer_nodes 
                (id, tenant_id, name, country, city, email, phone, website, status, marketplace_enabled, visibility_scope) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [printhouseId, tenantId, companyName, country, city, email, phone, website, 'active', false, 'private']
            );

            // Capabilities
            await connection.query(
                `INSERT INTO printhouse_capabilities (printhouse_id, tenant_id, supported_countries) VALUES (?, ?, ?)`,
                [printhouseId, tenantId, JSON.stringify([country || 'ES'])]
            );

            // Admin User for the partner
            const user = await userService.createUser(email, 'PRINTHOUSE_ADMIN', tenantId, password, printhouseId);

            // Tenant License
            const licenseDays = selectedPlan === 'STARTER' ? 30 : selectedPlan === 'GROWTH' ? 365 : 3650;
            await connection.query(
                `INSERT INTO tenant_licenses (tenant_id, license_type, status, plan, expires_at)
                 VALUES (?, 'PRINTER_OPERATIONS', 'ACTIVE', ?, DATE_ADD(NOW(), INTERVAL ? DAY))`,
                [tenantId, selectedPlan, licenseDays]
            );

            // Auto-seed machinery from stepper templates
            if (metadata?.qualification && Array.isArray(metadata.qualification.presses)) {
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
                                    metadata_json: { seeded_from_template: template.id, provisioned_by_admin: adminId }
                                }, actorContext);
                            }
                        }
                    }
                } catch (seedErr) {
                    console.error('[ADMIN-PROVISION-SEED-ERR]', seedErr);
                }
            }

            // Audit log entry
            try {
                await connection.query(
                    `INSERT INTO audit_log (actor_id, actor_role, action, resource_type, resource_id, metadata_json, created_at)
                     VALUES (?, ?, ?, ?, ?, ?, NOW())`,
                    [adminId, 'SUPER_ADMIN', 'ADMIN_PROVISIONED_PARTNER', 'printhouse', printhouseId,
                     JSON.stringify({ companyName, email, plan: selectedPlan, tenantId })]
                );
            } catch (auditErr) {
                // Non-blocking: audit failure should not fail provisioning
                console.warn('[ADMIN-PROVISION-AUDIT-WARN]', auditErr.message);
            }

            await connection.commit();

            // Welcome notification (logs until email service is wired)
            const baseUrl = process.env.APP_BASE_URL || 'https://control.printprice.pro';
            console.log(`[ADMIN-PROVISION] Welcome email dispatch → ${email} | Partner: ${companyName} | Login: ${baseUrl}/login`);

            return {
                tenantId,
                printhouseId,
                welcomeEmailSent: false,
                loginUrl: `${baseUrl}/login`
            };
        } catch (err) {
            await connection.rollback();
            throw err;
        } finally {
            connection.release();
        }
    }
}

module.exports = new PrinthouseService();
