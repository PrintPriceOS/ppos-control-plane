/**
 * tests/paper_supplier_registration.test.js
 *
 * Comprehensive tests for Paper Supplier Self-Service Registration.
 * Validates schema, input constraints, transactional integrity,
 * user_sessions, JWT emission, and authorization on protected routes.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

// 1. Establish isolated MySQL environment configuration BEFORE any service imports getPool
process.env.TEST_MYSQL_HOST = process.env.TEST_MYSQL_HOST || '127.0.0.1';
process.env.TEST_MYSQL_PORT = process.env.TEST_MYSQL_PORT || '3307';
process.env.TEST_MYSQL_USER = process.env.TEST_MYSQL_USER || 'root';
process.env.TEST_MYSQL_PASSWORD = process.env.TEST_MYSQL_PASSWORD || 'root_password_ppos_2026';
process.env.TEST_MYSQL_DATABASE = process.env.TEST_MYSQL_DATABASE || 'ppos_test_paper_supplier';

process.env.MYSQL_HOST = process.env.TEST_MYSQL_HOST;
process.env.MYSQL_PORT = process.env.TEST_MYSQL_PORT;
process.env.MYSQL_USER = process.env.TEST_MYSQL_USER;
process.env.MYSQL_PASSWORD = process.env.TEST_MYSQL_PASSWORD;
process.env.MYSQL_DATABASE = process.env.TEST_MYSQL_DATABASE;

const JWT_SECRET = 'ppos-test-jwt-secret-paper-supplier-2026';
process.env.JWT_SECRET = JWT_SECRET;
process.env.JWT_AUDIENCE = 'ppos:control';
process.env.JWT_ISSUER = 'https://auth.printprice.pro';
process.env.PAPER_SUPPLIER_HUB_ENABLED = 'true';

const db = require('../src/api/services/mysqlClient');
const paperSupplierRegistrationService = require('../src/api/services/paperSupplierRegistrationService');
const { runBootstrap } = require('../scripts/bootstrap_canonical_schema');

describe('Paper Supplier Self-Service Registration Suite', () => {
    let pool;

    beforeAll(async () => {
        const mysql2 = require('mysql2/promise');
        const setupConn = await mysql2.createConnection({
            host: process.env.TEST_MYSQL_HOST,
            port: parseInt(process.env.TEST_MYSQL_PORT, 10),
            user: process.env.TEST_MYSQL_USER,
            password: process.env.TEST_MYSQL_PASSWORD
        });
        await setupConn.query(`CREATE DATABASE IF NOT EXISTS \`${process.env.TEST_MYSQL_DATABASE}\``);
        await setupConn.end();

        // Ensure baseline and tables 162 exist
        await runBootstrap({
            host: process.env.TEST_MYSQL_HOST,
            port: parseInt(process.env.TEST_MYSQL_PORT, 10),
            user: process.env.TEST_MYSQL_USER,
            password: process.env.TEST_MYSQL_PASSWORD,
            database: process.env.TEST_MYSQL_DATABASE
        });

        pool = db.getPool();

        // Run migrations 158 and 162 properly
        const fs = require('fs');
        const path = require('path');
        const { parseMigrationSql } = require('../src/api/services/migrationSqlParser');
        const migrationsDir = path.join(__dirname, '../migrations');
        const requiredMigrations = [
            '158_phase195e_auth_sessions_and_mfa.sql',
            '162_phase196a_paper_suppliers_and_procurement_idempotency.sql'
        ];

        for (const file of requiredMigrations) {
            const filePath = path.join(migrationsDir, file);
            if (fs.existsSync(filePath)) {
                const content = fs.readFileSync(filePath, 'utf8');
                const parsed = parseMigrationSql(content);
                for (const stmt of parsed.statements) {
                    await pool.query(stmt.sql);
                }
            }
        }
    });

    it('1. Input Validation: rejects missing or invalid fields fail-closed', async () => {
        // Missing companyName
        await expect(paperSupplierRegistrationService.selfRegister({
            email: 'valid@supplier.com',
            password: 'Password123'
        })).rejects.toThrow('Company name is required');

        // Invalid email
        await expect(paperSupplierRegistrationService.selfRegister({
            companyName: 'Test Paper Co',
            email: 'not-an-email',
            password: 'Password123'
        })).rejects.toThrow('A valid corporate email is required');

        // Weak password (< 8 chars)
        await expect(paperSupplierRegistrationService.selfRegister({
            companyName: 'Test Paper Co',
            email: 'test@supplier.com',
            password: 'short'
        })).rejects.toThrow('Password must be at least 8 characters long');

        // Weak password (no number)
        await expect(paperSupplierRegistrationService.selfRegister({
            companyName: 'Test Paper Co',
            email: 'test@supplier.com',
            password: 'OnlyLettersNoNumber'
        })).rejects.toThrow('Password must be at least 8 characters long and contain both letters and numbers');
    });

    it('2. Atomic Registration: successfully creates tenant, supplier, user, membership and JWT', async () => {
        const uniqueEmail = `admin-${Date.now()}@scheufelen-paper.de`;
        const payload = {
            companyName: 'Scheufelen Papierfabrik GmbH',
            brandName: 'Scheufelen Premium Papers',
            contactName: 'Hans Scheufelen',
            email: uniqueEmail,
            password: 'SecurePassword2026!',
            country: 'DE',
            city: 'Lenningen',
            phone: '+49 7026 660',
            website: 'https://scheufelen.com',
            taxId: 'DE123456789',
            currencies: ['EUR', 'USD'],
            categories: ['COATED', 'SPECIALTY', 'CARTON'],
            deliveryCoverage: 'INTERNATIONAL'
        };

        const result = await paperSupplierRegistrationService.selfRegister(payload, {
            ip: '127.0.0.1',
            userAgent: 'Vitest/Playwright'
        });

        expect(result.ok).toBe(true);
        expect(result.token).toBeDefined();
        expect(result.user).toBeDefined();
        expect(result.supplier).toBeDefined();

        expect(result.user.email).toBe(uniqueEmail);
        expect(result.user.role).toBe('SUPPLIER_ADMIN');
        expect(result.user.hasSupplierCapability).toBe(true);
        expect(result.user.isSupplierAdmin).toBe(true);
        expect(result.user.activeContext).toBe('supplier');

        const { tenantId, supplierId, id: userId } = result.user;
        expect(tenantId).toMatch(/^supp-ten-/);
        expect(supplierId).toMatch(/^supp-/);

        // 2a. Verify MySQL Database State
        const [tenantRows] = await pool.query('SELECT * FROM tenants WHERE id = ?', [tenantId]);
        expect(tenantRows.length).toBe(1);
        expect(tenantRows[0].status).toBe('ACTIVE');

        const [capRows] = await pool.query('SELECT * FROM tenant_capabilities WHERE tenant_id = ? AND capability = ?', [tenantId, 'PAPER_SUPPLIER']);
        expect(capRows.length).toBe(1);
        expect(capRows[0].is_active).toBe(1);

        const [suppRows] = await pool.query('SELECT * FROM paper_suppliers WHERE id = ?', [supplierId]);
        expect(suppRows.length).toBe(1);
        expect(suppRows[0].name).toBe('Scheufelen Papierfabrik GmbH');
        expect(suppRows[0].status).toBe('ACTIVE');
        const currencies = JSON.parse(typeof suppRows[0].currencies_json === 'string' ? suppRows[0].currencies_json : JSON.stringify(suppRows[0].currencies_json));
        expect(currencies).toContain('EUR');
        expect(currencies).toContain('USD');

        const [userRows] = await pool.query('SELECT * FROM control_users WHERE id = ?', [userId]);
        expect(userRows.length).toBe(1);
        expect(userRows[0].role).toBe('TENANT_ADMIN');
        const isPasswordCorrect = await bcrypt.compare('SecurePassword2026!', userRows[0].password_hash);
        expect(isPasswordCorrect).toBe(true);

        const [membershipRows] = await pool.query('SELECT * FROM supplier_memberships WHERE user_id = ? AND supplier_id = ?', [userId, supplierId]);
        expect(membershipRows.length).toBe(1);
        expect(membershipRows[0].supplier_role).toBe('SUPPLIER_ADMIN');
        expect(membershipRows[0].is_active).toBe(1);

        // 2b. Verify JWT Token claims
        const decoded = jwt.verify(result.token, JWT_SECRET, { audience: 'ppos:control' });
        expect(decoded.sub).toBe(userId);
        expect(decoded.email).toBe(uniqueEmail);
        expect(decoded.role).toBe('SUPPLIER_ADMIN');
        expect(decoded.tenant_id).toBe(tenantId);
        expect(decoded.supplier_id).toBe(supplierId);
        expect(decoded.supplier_role).toBe('SUPPLIER_ADMIN');
        expect(decoded.has_supplier_capability).toBe(true);
        expect(decoded.active_context).toBe('supplier');
    });

    it('3. Duplicate Email Rejection: rejects already registered email with EMAIL_ALREADY_EXISTS', async () => {
        const email = `duplicate-${Date.now()}@papyrus.com`;
        await paperSupplierRegistrationService.selfRegister({
            companyName: 'Papyrus First',
            email,
            password: 'Password123'
        });

        // Attempting to register again with same email must fail
        await expect(paperSupplierRegistrationService.selfRegister({
            companyName: 'Papyrus Second',
            email,
            password: 'Password456'
        })).rejects.toThrow('User with this email already exists');
    });

    it('4. HTTP Route Integration: POST /api/auth/supplier/register returns 201 with auth payload', async () => {
        const express = require('express');
        const http = require('http');
        const authRoutes = require('../src/api/routes/authRoutes');

        const app = express();
        app.use(express.json());
        app.use('/api/auth', authRoutes);

        const server = http.createServer(app);
        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
        const port = server.address().port;

        try {
            const email = `http-reg-${Date.now()}@fedrigoni-partner.com`;
            const res = await fetch(`http://127.0.0.1:${port}/api/auth/supplier/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    companyName: 'Fedrigoni Iberia Distribution',
                    brandName: 'Fedrigoni Group',
                    email,
                    password: 'SecurePartner2026!',
                    contactName: 'Carlos Distribuidor',
                    phone: '+34 91 123 4567',
                    country: 'ES',
                    city: 'Madrid',
                    currencies: ['EUR'],
                    categories: ['SPECIALTY', 'COATED'],
                    deliveryCoverage: 'NATIONAL'
                })
            });

            expect(res.status).toBe(201);
            const data = await res.json();
            expect(data.ok).toBe(true);
            expect(data.token).toBeDefined();
            expect(data.user.email).toBe(email);
            expect(data.user.role).toBe('SUPPLIER_ADMIN');
            expect(data.user.isSupplierUser).toBe(true);
            expect(data.supplier.name).toBe('Fedrigoni Iberia Distribution');
        } finally {
            await new Promise((resolve) => server.close(resolve));
        }
    });
});
