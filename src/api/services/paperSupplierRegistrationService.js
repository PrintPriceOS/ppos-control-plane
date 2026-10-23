/**
 * src/api/services/paperSupplierRegistrationService.js
 *
 * Self-service registration service for Paper Suppliers.
 * Establishes tenant, PAPER_SUPPLIER capability, paper_suppliers organization,
 * admin control_user, supplier_memberships, session, and JWT token.
 */
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('./mysqlClient');
const userService = require('./controlUserService');
const userSessionService = require('./userSessionService');

const JWT_SECRET = process.env.JWT_SECRET || 'ppos-dev-jwt-secret-do-not-use-in-production-2026';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';
const JWT_ISSUER = process.env.JWT_ISSUER || 'https://auth.printprice.pro';
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || 'ppos:control';

class PaperSupplierRegistrationService {
    /**
     * Validates email format.
     */
    isValidEmail(email) {
        if (!email || typeof email !== 'string') return false;
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
    }

    /**
     * Validates password strength (min 8 chars, at least one letter and one number).
     */
    isValidPassword(password) {
        if (!password || typeof password !== 'string') return false;
        if (password.length < 8) return false;
        const hasLetter = /[a-zA-Z]/.test(password);
        const hasNumber = /[0-9]/.test(password);
        return hasLetter && hasNumber;
    }

    /**
     * Self-registers a new paper supplier.
     */
    async selfRegister(payload = {}, clientInfo = {}) {
        const companyName = String(payload.companyName || '').trim();
        const contactName = String(payload.contactName || '').trim();
        const email = String(payload.email || '').trim().toLowerCase();
        const password = String(payload.password || '');
        const country = String(payload.country || 'ES').trim().toUpperCase();
        const city = String(payload.city || '').trim();
        const phone = String(payload.phone || '').trim();
        const website = String(payload.website || '').trim();
        const taxId = String(payload.taxId || '').trim();
        const brandName = String(payload.brandName || '').trim();
        const deliveryCoverage = String(payload.deliveryCoverage || 'NATIONAL').trim().toUpperCase();

        const rawCurrencies = Array.isArray(payload.currencies) && payload.currencies.length > 0
            ? payload.currencies
            : ['EUR'];
        const currencies = [...new Set(rawCurrencies.map(c => String(c).trim().toUpperCase()).filter(Boolean))];

        const rawCategories = Array.isArray(payload.categories) && payload.categories.length > 0
            ? payload.categories
            : ['COATED', 'UNCOATED', 'OFFSET'];
        const categories = [...new Set(rawCategories.map(c => String(c).trim().toUpperCase()).filter(Boolean))];

        // 1. Validation
        if (!companyName) {
            throw new Error('Company name is required');
        }
        if (!email || !this.isValidEmail(email)) {
            throw new Error('A valid corporate email is required');
        }
        if (!this.isValidPassword(password)) {
            throw new Error('Password must be at least 8 characters long and contain both letters and numbers');
        }

        // 2. Check if user already exists
        const existingUser = await userService.findByEmail(email);
        if (existingUser) {
            const err = new Error('User with this email already exists');
            err.code = 'EMAIL_ALREADY_EXISTS';
            throw err;
        }

        const tenantId = `supp-ten-${uuidv4().substring(0, 8)}`;
        const supplierId = `supp-${uuidv4().substring(0, 8)}`;
        const capabilityId = `cap-${uuidv4().substring(0, 8)}`;
        const membershipId = `sm-${uuidv4().substring(0, 8)}`;

        const supplierMetadata = {
            contactName,
            brandName: brandName || companyName,
            taxId,
            phone,
            website,
            country,
            city,
            categories,
            deliveryCoverage,
            registeredAt: new Date().toISOString()
        };

        const tenantMetadata = {
            businessType: 'PAPER_SUPPLIER',
            country,
            city,
            contactEmail: email,
            phone,
            website,
            registeredVia: 'PUBLIC_SUPPLIER_REGISTER',
            registeredAt: new Date().toISOString()
        };

        const connection = await db.getPool().getConnection();
        await connection.beginTransaction();

        let userId = null;

        try {
            // 3. Create Tenant
            await connection.query(
                `INSERT INTO tenants (id, name, status, metadata_json)
                 VALUES (?, ?, 'ACTIVE', ?)`,
                [tenantId, companyName, JSON.stringify(tenantMetadata)]
            );

            // 4. Create Tenant Capability
            await connection.query(
                `INSERT INTO tenant_capabilities (id, tenant_id, capability, is_active)
                 VALUES (?, ?, 'PAPER_SUPPLIER', 1)`,
                [capabilityId, tenantId]
            );

            // 5. Create Paper Supplier Record
            await connection.query(
                `INSERT INTO paper_suppliers (id, tenant_id, name, status, contact_email, currencies_json, metadata_json)
                 VALUES (?, ?, ?, 'ACTIVE', ?, ?, ?)`,
                [
                    supplierId,
                    tenantId,
                    companyName,
                    email,
                    JSON.stringify(currencies),
                    JSON.stringify(supplierMetadata)
                ]
            );

            // 6. Create Control User with password hash
            const passwordHash = await bcrypt.hash(password, 10);
            const [userResult] = await connection.query(
                `INSERT INTO control_users (email, role, tenant_id, printhouse_id, password_hash)
                 VALUES (?, 'TENANT_ADMIN', ?, NULL, ?)`,
                [email, tenantId, passwordHash]
            );
            userId = String(userResult.insertId);

            // 7. Create Supplier Membership
            await connection.query(
                `INSERT INTO supplier_memberships (id, user_id, tenant_id, supplier_id, supplier_role, is_active)
                 VALUES (?, ?, ?, ?, 'SUPPLIER_ADMIN', 1)`,
                [membershipId, userId, tenantId, supplierId]
            );

            await connection.commit();
        } catch (txErr) {
            await connection.rollback();
            throw txErr;
        } finally {
            connection.release();
        }

        // 8. Create Server Session
        const sessionRecord = await userSessionService.createSession({
            userId,
            tenantId,
            role: 'SUPPLIER_ADMIN',
            ipAddress: clientInfo.ip,
            userAgent: clientInfo.userAgent
        });

        // 9. Sign JWT Token with Supplier Identity & Capabilities
        const token = jwt.sign(
            {
                sub: userId,
                jti: sessionRecord.sessionId,
                email,
                role: 'SUPPLIER_ADMIN',
                tenant_id: tenantId,
                printhouse_id: null,
                supplier_id: supplierId,
                supplier_role: 'SUPPLIER_ADMIN',
                has_supplier_capability: true,
                active_context: 'supplier'
            },
            JWT_SECRET,
            {
                expiresIn: JWT_EXPIRES_IN,
                issuer: JWT_ISSUER,
                audience: JWT_AUDIENCE
            }
        );

        return {
            ok: true,
            token,
            user: {
                id: userId,
                email,
                role: 'SUPPLIER_ADMIN',
                tenantId,
                supplierId,
                supplierRole: 'SUPPLIER_ADMIN',
                hasSupplierCapability: true,
                isSupplierUser: true,
                isSupplierAdmin: true,
                activeContext: 'supplier'
            },
            supplier: {
                id: supplierId,
                name: companyName,
                status: 'ACTIVE',
                tenantId,
                currencies,
                categories,
                country,
                city
            }
        };
    }
}

module.exports = new PaperSupplierRegistrationService();
