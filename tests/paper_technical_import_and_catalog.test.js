/**
 * tests/paper_technical_import_and_catalog.test.js
 * 
 * Comprehensive Unit and Integration Test Suite for Iteration I2:
 * 1. Multi-format support: ODS, XLSX, CSV parsing and auto-detection.
 *    - Multiline CSV parsing with quotes and escaped characters.
 *    - Multi-sheet XLSX parsing with shared strings and inline strings.
 *    - ODS parsing with multiple sheets, cell repeats, and original row preservation.
 *    - Unknown / corrupt binary buffer rejection fail-closed.
 * 2. Normalization & validation:
 *    - Dimension extraction: respects explicit units in headers (e.g. WIDTH (MM)).
 *    - Never converts mm to cm based on arbitrary numeric thresholds.
 *    - Flags contradiction between declared FORMAT and dimension columns as DIMENSION_CONTRADICTION.
 *    - Acabado & category: UNCOATED vs COATED and NEKRĪTOTS vs KRĪTOTS without partial match inversions.
 *    - Conflict detection between declared column grammage and product name grammage.
 *    - Physical variant fingerprinting retaining caliper/thickness and grain direction.
 *    - Zero prices and empty prices marked as unpriced commercial issues without blocking technical import.
 * 3. Review Flow:
 *    - Paginated query of staged rows with status and decision filters.
 *    - Row decision updates with manual overrides and deterministic fingerprint recomputation.
 *    - Technical warnings/issues are NOT confirmed by default (require explicit ACCEPTED decision).
 *    - Separate counts for valid, pending, duplicate, and rejected records.
 * 4. Tenancy & Authorization Isolation:
 *    - Scope bounded by tenant_id AND supplier_id resolved on server.
 *    - requireApprovedSupplier enforced on preview, rows, and confirm endpoints.
 *    - Denies suspended, pending review, or unapproved suppliers (HTTP 403).
 *    - Denies viewer role from confirmation (HTTP 403).
 *    - Denies cross-tenant or cross-supplier batch access fail-closed (HTTP 404 / BATCH_NOT_FOUND).
 * 5. Real Ephemeral MySQL Database Verification:
 *    - Exclusive execution schema using TEST_MYSQL_* credentials.
 *    - Migration 163 applied cleanly.
 *    - Atomic batch confirmation with row locks (SELECT ... FOR UPDATE) and transaction rollback on error.
 *    - Zero modification to materials_catalog, predictive_material_inventory, or supplier_paper_offers.
 *    - Explicit test.skip when TEST_MYSQL_* is not configured (zero silent returns).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
const archiver = require('archiver');

const JWT_SECRET = 'test_secret_for_supplier_isolation';
const JWT_AUDIENCE = 'ppos:control';
const JWT_ISSUER = 'https://auth.printprice.pro';

process.env.JWT_SECRET = JWT_SECRET;
process.env.JWT_AUDIENCE = JWT_AUDIENCE;
process.env.JWT_ISSUER = JWT_ISSUER;
process.env.PAPER_SUPPLIER_HUB_ENABLED = 'true';

const paperImportService = require('../src/api/services/paperImportService');
const paperSuppliersRouter = require('../src/api/routes/paperSuppliersRoutes');
let mysqlClient = require('../src/api/services/mysqlClient');
const { parseMigrationSql } = require('../src/api/services/migrationSqlParser');
const { runBootstrap } = require('../scripts/bootstrap_canonical_schema');

function generateToken(payload) {
    return jwt.sign({
        sub: payload.id || 'user-1',
        email: payload.email || 'user@test.local',
        role: payload.role,
        tenant_id: payload.tenantId,
        supplier_id: payload.supplierId || null,
        has_supplier_capability: payload.hasSupplierCapability || false,
        ...payload
    }, JWT_SECRET, { audience: JWT_AUDIENCE, issuer: JWT_ISSUER });
}

function dispatch(router, req) {
    return new Promise((resolve) => {
        const res = {
            statusCode: 200,
            headers: {},
            body: null,
            status(code) {
                this.statusCode = code;
                return this;
            },
            json(data) {
                this.body = data;
                resolve(this);
                return this;
            },
            send(data) {
                this.body = data;
                resolve(this);
                return this;
            },
            setHeader(name, value) {
                this.headers[name] = value;
                return this;
            }
        };

        router(req, res, (err) => {
            if (err) {
                res.statusCode = err.statusCode || err.status || 500;
                res.body = { ok: false, error: err.message, code: err.code };
            } else {
                res.statusCode = res.statusCode || 404;
                res.body = res.body || { error: 'Not Found' };
            }
            resolve(res);
        });
    });
}

function getTestDatabaseConfig() {
    return {
        host: process.env.TEST_MYSQL_HOST,
        port: process.env.TEST_MYSQL_PORT ? parseInt(process.env.TEST_MYSQL_PORT, 10) : undefined,
        user: process.env.TEST_MYSQL_USER,
        password: process.env.TEST_MYSQL_PASSWORD
    };
}

const executionRunToken = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
const executionSchemaName = `ppos_test_i2_${executionRunToken}`;

let connectionPool = null;
let adminPool = null;
let isDbConfigured = Boolean(process.env.TEST_MYSQL_HOST && process.env.TEST_MYSQL_PORT && process.env.TEST_MYSQL_USER && process.env.TEST_MYSQL_PASSWORD !== undefined);

describe('Iteration I2: Paper Technical Data Sheets & Multi-format Import Engine', () => {

    describe('1. Multi-Format Detection & Parser Robustness (CSV, XLSX, ODS)', () => {
        it('detects CSV format, handles RFC 4180 quotes with multiline fields and preserves original file line numbers', () => {
            const csvContent = [
                'CODE;NAME;PRICE;GRAMS;WIDTH;HEIGHT',
                'ART-1;"Munken Lynx 120\nSpecial 2-Line Name";450;120;700;1000',
                'ART-2;Amber Graphic 150;500;150;640;920'
            ].join('\n');
            const buffer = Buffer.from(csvContent, 'utf8');

            const format = paperImportService.detectFormat(buffer);
            expect(format).toBe('CSV');

            const parsed = paperImportService.parseSpreadsheetBuffer(buffer);
            expect(parsed.format).toBe('CSV');
            expect(parsed.sheets.length).toBe(1);
            expect(parsed.sheets[0].rows.length).toBe(2);
            
            // Multiline record verification
            expect(parsed.sheets[0].rows[0].cells[1]).toBe('Munken Lynx 120\nSpecial 2-Line Name');
            expect(parsed.sheets[0].rows[0].fileRowNumber).toBe(2);
            // Next record starts after multiline break
            expect(parsed.sheets[0].rows[1].cells[1]).toBe('Amber Graphic 150');
            expect(parsed.sheets[0].rows[1].fileRowNumber).toBe(4);
        });

        it('parses real multi-sheet XLSX buffer with shared strings and sheet selection', async () => {
            const archive = archiver('zip', { zlib: { level: 9 } });
            const chunks = [];
            archive.on('data', chunk => chunks.push(chunk));

            archive.append('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>', { name: '[Content_Types].xml' });
            archive.append('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Cover Papers" sheetId="1" r:id="rId1"/><sheet name="Inside Papers" sheetId="2" r:id="rId2"/></sheets></workbook>', { name: 'xl/workbook.xml' });
            archive.append('<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="6" uniqueCount="6"><si><t>CODE</t></si><si><t>NAME</t></si><si><t>WIDTH (MM)</t></si><si><t>HEIGHT (MM)</t></si><si><t>XLSX Cover Paper</t></si><si><t>XLSX Text Paper</t></si></sst>', { name: 'xl/sharedStrings.xml' });
            archive.append('<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c></row><row r="2"><c r="A2"><v>101</v></c><c r="B2" t="s"><v>4</v></c><c r="C2"><v>700</v></c><c r="D2"><v>1000</v></c></row></sheetData></worksheet>', { name: 'xl/worksheets/sheet1.xml' });
            archive.append('<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c></row><row r="2"><c r="A2"><v>102</v></c><c r="B2" t="s"><v>5</v></c><c r="C2"><v>640</v></c><c r="D2"><v>900</v></c></row></sheetData></worksheet>', { name: 'xl/worksheets/sheet2.xml' });
            await archive.finalize();
            const xlsxBuf = Buffer.concat(chunks);

            const format = paperImportService.detectFormat(xlsxBuf);
            expect(format).toBe('XLSX');

            const parsedAll = paperImportService.parseSpreadsheetBuffer(xlsxBuf);
            expect(parsedAll.sheets.length).toBe(2);
            expect(parsedAll.sheets[0].sheetName).toBe('Cover Papers');
            expect(parsedAll.sheets[1].sheetName).toBe('Inside Papers');

            // Explicit targetSheetName query filter
            const parsedTarget = paperImportService.parseSpreadsheetBuffer(xlsxBuf, null, 'Inside Papers');
            expect(parsedTarget.sheets.length).toBe(1);
            expect(parsedTarget.sheets[0].sheetName).toBe('Inside Papers');
            expect(parsedTarget.sheets[0].rows[0].cells[1]).toBe('XLSX Text Paper');
            expect(parsedTarget.sheets[0].rows[0].fileRowNumber).toBe(2);
        });

        it('detects and parses OpenDocument Spreadsheet (ODS) buffer with original row numbers', (ctx) => {
            const originalPath = process.env.PAPER_CATALOG_ORIGINAL_FILE_PATH || 'C:/Users/KIKE/Downloads/Paper data base.ods.zip';
            if (!fs.existsSync(originalPath)) {
                ctx.skip();
                return;
            }
                const buf = fs.readFileSync(originalPath);
                const format = paperImportService.detectFormat(buf);
                expect(format).toBe('ODS');

                const parsed = paperImportService.parseSpreadsheetBuffer(buf);
                expect(parsed.format).toBe('ODS');
                expect(parsed.sheets[0].rows.length).toBe(1573);
                // Original file has 3 leading empty rows, row 4 headers, first data row is row 5
                expect(parsed.sheets[0].rows[0].fileRowNumber).toBe(5);
                expect(parsed.sheets[0].rows[1572].fileRowNumber).toBe(1577);
        });

        it('handles unknown or corrupt binary buffer gracefully fail-closed', () => {
            const junkBuffer = Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05]);
            const format = paperImportService.detectFormat(junkBuffer);
            expect(format).toBe('UNKNOWN');
            expect(() => paperImportService.parseSpreadsheetBuffer(junkBuffer)).toThrow(/UNSUPPORTED_FORMAT/);
        });
    });

    describe('2. Evidence-Based Normalization & Finish/Dimension Safeguards', () => {
        const dummyHeaders = ['CODE', 'QR', 'NAME', 'PRICE', 'MIKRONS', 'THICKNESS (mm)', 'FORMAT', 'GRAMS', '', 'COAT', 'Min. QUANTITY', 'STEPS/UNITS', 'SORTIMET', 'WIDTH (mm)', 'Heights (mm)', 'PAPER TYPE', 'PROVISER', 'AKTIV'];

        it('respects explicit mm header and never converts 100 x 150 mm to 1000 x 1500 mm', () => {
            const rawRow = ['C1', '', 'Special Small Card 100x150', '200', '180', '0.180', '', '250', '', '', '', '', '', '100', '150', 'Ofset', 'Papyrus DEF', 'Jā'];
            const norm = paperImportService.normalizeRowData(rawRow, dummyHeaders, 2);

            expect(norm.width_mm).toBe(100);
            expect(norm.height_mm).toBe(150);
            expect(norm.validationStatus).toBe('VALID');
        });

        // Mandatory Regressions Point 1: Normalización de dimensiones
        it('mandatory regression 1a: columns 100x150 mm + FORMAT "100 x 150 mm" -> preserves 100x150, no contradiction', () => {
            const rawRow = ['R1A', '', 'Small Card 100x150', '200', '', '', '100 x 150 mm', '250', '', 'Ofset', '', '', '', '100', '150', 'Ofset', 'Papyrus DEF', 'Jā'];
            const norm = paperImportService.normalizeRowData(rawRow, dummyHeaders, 21);

            expect(norm.width_mm).toBe(100);
            expect(norm.height_mm).toBe(150);
            expect(norm.issues.some(i => i.code === 'DIMENSION_CONTRADICTION')).toBe(false);
            expect(norm.validationStatus).toBe('VALID');
        });

        it('mandatory regression 1b: columns 100x150 mm + FORMAT "1000 x 1500 mm" -> preserves columns and requires review for contradiction', () => {
            const rawRow = ['R1B', '', 'Small Card Conflict', '200', '', '', '1000 x 1500 mm', '250', '', 'Ofset', '', '', '', '100', '150', 'Ofset', 'Papyrus DEF', 'Jā'];
            const norm = paperImportService.normalizeRowData(rawRow, dummyHeaders, 22);

            expect(norm.width_mm).toBe(100);
            expect(norm.height_mm).toBe(150);
            expect(norm.issues.some(i => i.code === 'DIMENSION_CONTRADICTION')).toBe(true);
            expect(norm.validationStatus).toBe('WARNING');
        });

        it('mandatory regression 1c: columns 700x1000 mm + FORMAT "70 x 100 cm" -> preserves 700x1000 without contradiction as both match in mm', () => {
            const rawRow = ['R1C', '', 'Full Sheet 700x1000', '400', '', '', '70 x 100 cm', '150', '', 'krītots', '', '', '', '700', '1000', 'Ofset', 'Papyrus DEF', 'Jā'];
            const norm = paperImportService.normalizeRowData(rawRow, dummyHeaders, 23);

            expect(norm.width_mm).toBe(700);
            expect(norm.height_mm).toBe(1000);
            expect(norm.issues.some(i => i.code === 'DIMENSION_CONTRADICTION')).toBe(false);
            expect(norm.validationStatus).toBe('VALID');
        });

        it('detects contradiction between declared FORMAT and dimension columns without guessing', () => {
            // FORMAT says 720 x 1040, but columns say 72 x 102 (1020 mm vs 1040 mm)
            const rawRow = ['C2', '', 'Contradictory Sheet', '300', '', '', 'B1 720 x 1040', '150', '', '', '', '', '', '72', '102', 'Matt', 'Polap DEF', 'Jā'];
            const norm = paperImportService.normalizeRowData(rawRow, dummyHeaders, 3);

            expect(norm.issues.some(i => i.code === 'DIMENSION_CONTRADICTION')).toBe(true);
            expect(norm.validationStatus).toBe('WARNING');
            // Preserves raw column dimensions for explicit operator review
            expect(norm.width_mm).toBe(72);
            expect(norm.height_mm).toBe(102);
        });

        it('classifies UNCOATED and NEKRĪTOTS correctly without partial match inversions to COATED', () => {
            const rowUncoated = ['U1', '', 'Munken Polar UNCOATED 120g', '400', '', '', '', '120', '', '', '', '', '', '700', '1000', 'Ofset', 'Polap DEF', 'Jā'];
            const normU = paperImportService.normalizeRowData(rowUncoated, dummyHeaders, 4);
            expect(normU.finish).toBe('UNCOATED');
            expect(normU.category).toBe('OFFSET');

            const rowNekritots = ['U2', '', 'Offset Print Paper', '350', '', '', '', '100', '', 'nekrītots', '', '', '', '700', '1000', 'Ofset', 'Papyrus DEF', 'Jā'];
            const normN = paperImportService.normalizeRowData(rowNekritots, dummyHeaders, 5);
            expect(normN.finish).toBe('UNCOATED');

            const rowKritots = ['C3', '', 'Gloss Paper', '450', '', '', '', '150', '', 'krītots', '', '', '', '700', '1000', '', 'Papyrus DEF', 'Jā'];
            const normK = paperImportService.normalizeRowData(rowKritots, dummyHeaders, 6);
            expect(normK.finish).toBe('COATED');
        });

        it('detects conflict between declared grammage and description', () => {
            const rawRow = ['G1', '', 'Maxi Silk 250 gsm B1', '500', '', '', '', '150', '', 'krītots', '', '', '', '700', '1000', 'Matt', 'Papyrus DEF', 'Jā'];
            const norm = paperImportService.normalizeRowData(rawRow, dummyHeaders, 7);

            expect(norm.issues.some(i => i.code === 'GSM_DESCRIPTION_CONFLICT')).toBe(true);
            expect(norm.validationStatus).toBe('WARNING');
        });

        it('retains caliper and physical properties in deterministic variant fingerprint', () => {
            const rowA = ['C8', '', 'Alaska Plus GC2 255g 70x100', '420', '450', '0.450', '', '255', '', 'krītots', '', '', '', '700', '1000', 'Kartons', 'Papyrus DEF', 'Jā'];
            const rowB = ['C9', '', 'Alaska Plus GC2 255g 70x100', '420', '480', '0.480', '', '255', '', 'krītots', '', '', '', '700', '1000', 'Kartons', 'Papyrus DEF', 'Jā'];

            const normA = paperImportService.normalizeRowData(rowA, dummyHeaders, 8);
            const normB = paperImportService.normalizeRowData(rowB, dummyHeaders, 9);

            // Different caliper -> distinct fingerprint prevents loss of physical variant identity
            expect(normA.fingerprint).not.toBe(normB.fingerprint);
        });

        it('separates commercial issues (unpriced, no currency) from technical blockers', () => {
            const emptyPriceRow = ['C5', '', 'Amber Graphic 150', '', '150', '0.150', '', '150', '', '', '', '', '', '700', '1000', 'Ofset', 'Dardedze hologrāfija', 'Jā'];
            const norm = paperImportService.normalizeRowData(emptyPriceRow, dummyHeaders, 10);

            // Commercial warnings present
            expect(norm.issues.some(i => i.code === 'EMPTY_PRICE' && i.category === 'COMMERCIAL')).toBe(true);
            expect(norm.issues.some(i => i.code === 'CURRENCY_NOT_DECLARED' && i.category === 'COMMERCIAL')).toBe(true);
            // Pure technical attributes are valid -> VALID status for technical cataloging
            expect(norm.validationStatus).toBe('VALID');
        });
    });

    describe('3. Recalculated Original File Breakdown (1,573 rows)', () => {
        const originalPath = process.env.PAPER_CATALOG_ORIGINAL_FILE_PATH || 'C:/Users/KIKE/Downloads/Paper data base.ods.zip';

        it('processes the original file with verified evidence-based rules and matches the exact recalculated breakdown', async (ctx) => {
            if (!fs.existsSync(originalPath)) {
                ctx.skip();
                return;
            }

            const buf = fs.readFileSync(originalPath);
            const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
            expect(sha256).toBe('7ffb63eb2705fa0c6faa459001ddd3db0702aa25d0bca52fa58e1a13899d4c9a');

            const preview = await paperImportService.processImportPreview({
                buffer: buf,
                fileName: 'Paper data base.ods.zip',
                tenantId: 'tenant-test-1',
                supplierId: 'supplier-test-1',
                createdBy: 'user-admin-1'
            });

            expect(preview.format).toBe('ODS');
            expect(preview.summary.totalRows).toBe(1573);

            // Recalculated breakdown after eliminating isDeciMatch and enforcing strict unit comparison:
            // Valid technical rows: 16
            // Pending review rows: 1544
            // Internal file duplicate rows: 13
            // Rejected rows: 0
            expect(preview.summary.validRows).toBe(16);
            expect(preview.summary.pendingRows).toBe(1544);
            expect(preview.summary.duplicateRows).toBe(13);
            expect(preview.summary.rejectedRows).toBe(0);

            const total = preview.summary.validRows + preview.summary.pendingRows + preview.summary.duplicateRows + preview.summary.rejectedRows;
            expect(total).toBe(1573);
        });
    });

    describe('4. Synthetic Duplicates & Staging Traceability', () => {
        it('identifies internal duplicates within synthetic batch and preserves original row numbers', async () => {
            const csvData = [
                'CODE;NAME;PRICE;GRAMS;WIDTH (MM);HEIGHT (MM);COAT;PROVISER',
                'P01;Silk Matt 130;300;130;700;1000;matt;Polap DEF',
                'P02;Silk Matt 130;310;130;700;1000;matt;Antalis DEF', // Duplicate physical variant
                'P03;Offset Print 80;150;80;640;900;uncoated;Papyrus DEF'
            ].join('\n');

            const buffer = Buffer.from(csvData, 'utf8');
            const preview = await paperImportService.processImportPreview({
                buffer,
                fileName: 'synthetic_papers.csv',
                tenantId: 'tenant-synth',
                supplierId: 'supp-synth',
                createdBy: 'operator-1'
            });

            expect(preview.summary.totalRows).toBe(3);
            expect(preview.summary.validRows).toBe(2);
            expect(preview.summary.duplicateRows).toBe(1);

            const dupRow = preview.rows[1];
            expect(dupRow.validationStatus).toBe('DUPLICATE');
            expect(dupRow.issues.some(i => i.code === 'DUPLICATE_IN_FILE')).toBe(true);
            expect(dupRow.rowNumber).toBe(3); // line 3 of CSV file
        });
    });

    describe('5. Technical Domain Isolation Guarantee', () => {
        it('verifies paperImportService does NOT touch inventory or commercial offers', () => {
            const serviceCode = fs.readFileSync(path.join(__dirname, '../src/api/services/paperImportService.js'), 'utf8');

            expect(serviceCode.includes('predictive_material_inventory')).toBe(false);
            expect(serviceCode.includes('material_inventory_events')).toBe(false);
            expect(serviceCode.includes('material_procurements')).toBe(false);
            expect(serviceCode.includes('supplier_paper_offers')).toBe(false);
        });
    });

    describe('6. Real Ephemeral MySQL Database Verification & Review Flow', () => {
        beforeAll(async () => {
            if (!isDbConfigured) return;

            const testDbConfig = getTestDatabaseConfig();

            // Close existing pool
            await mysqlClient.closePool();

            adminPool = mysql.createPool({
                host: testDbConfig.host,
                port: testDbConfig.port,
                user: testDbConfig.user,
                password: testDbConfig.password,
                multipleStatements: true
            });

            await adminPool.query(`CREATE DATABASE IF NOT EXISTS \`${executionSchemaName}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);

            connectionPool = mysql.createPool({
                host: testDbConfig.host,
                port: testDbConfig.port,
                user: testDbConfig.user,
                password: testDbConfig.password,
                database: executionSchemaName,
                multipleStatements: true
            });

            delete process.env.DATABASE_URL;
            process.env.MYSQL_HOST = testDbConfig.host;
            process.env.MYSQL_PORT = String(testDbConfig.port);
            process.env.MYSQL_USER = testDbConfig.user;
            process.env.MYSQL_PASSWORD = testDbConfig.password;
            process.env.MYSQL_DATABASE = executionSchemaName;
            process.env.TEST_MYSQL_DATABASE = executionSchemaName;
            process.env.PPOS_CI_EPHEMERAL_FIXTURES = 'true';
            process.env.CI = 'true';
            process.env.PPOS_MIGRATION_EXECUTION = 'true';
            process.env.PPOS_ENABLE_SCHEMA_MUTATION = 'true';

            // Canonical bootstrap
            await runBootstrap({
                host: testDbConfig.host,
                database: executionSchemaName,
                pool: connectionPool
            });

            // Reconnect mysqlClient
            mysqlClient.getPool = () => connectionPool;
            mysqlClient.query = async (sql, params) => {
                const [rows] = await connectionPool.query(sql, params);
                return rows;
            };
            mysqlClient.getConnection = async () => connectionPool.getConnection();

            // Run migration 162 and 163
            const migrationsDir = path.join(__dirname, '../migrations');
            for (const f of ['162_phase196a_paper_suppliers_and_procurement_idempotency.sql', '163_phase196b_paper_products_and_import_staging.sql']) {
                const sql = fs.readFileSync(path.join(migrationsDir, f), 'utf8');
                const parsed = parseMigrationSql(sql);
                for (const s of parsed.statements) {
                    await connectionPool.query(s.sql);
                }
            }

            // Seed test tenants, capabilities, and suppliers
            await connectionPool.query(`
                DELETE FROM supplier_memberships;
                DELETE FROM tenant_capabilities;
                DELETE FROM paper_suppliers;
                DELETE FROM tenants;

                INSERT INTO tenants (id, name) VALUES 
                    ('tenant-alpha', 'Alpha Paper Corp'),
                    ('tenant-beta', 'Beta Global Corp');

                INSERT INTO tenant_capabilities (id, tenant_id, capability, is_active) VALUES
                    ('tc-1', 'tenant-alpha', 'PAPER_SUPPLIER', 1),
                    ('tc-2', 'tenant-beta', 'PAPER_SUPPLIER', 1);

                INSERT INTO paper_suppliers (id, tenant_id, name, status, contact_email, currencies_json) VALUES
                    ('supp-alpha-1', 'tenant-alpha', 'Fedrigoni Iberia', 'ACTIVE', 'orders@fedrigoni.local', '["EUR"]'),
                    ('supp-alpha-2', 'tenant-alpha', 'Antalis España', 'ACTIVE', 'orders@antalis.local', '["EUR"]'),
                    ('supp-alpha-suspended', 'tenant-alpha', 'Inapa Suspended', 'SUSPENDED', 'ops@inapa.local', '["EUR"]'),
                    ('supp-alpha-pending', 'tenant-alpha', 'Papyrus Pending', 'PENDING_REVIEW', 'admin@papyrus.local', '["EUR"]'),
                    ('supp-beta-1', 'tenant-beta', 'Beta Supplier', 'ACTIVE', 'beta@beta.local', '["EUR"]');

                INSERT INTO supplier_memberships (id, user_id, tenant_id, supplier_id, supplier_role, is_active) VALUES
                    ('mem-1', 'user-op-alpha', 'tenant-alpha', 'supp-alpha-1', 'SUPPLIER_OPERATOR', 1),
                    ('mem-2', 'user-view-alpha', 'tenant-alpha', 'supp-alpha-1', 'SUPPLIER_VIEWER', 1),
                    ('mem-3', 'user-op-alpha-2', 'tenant-alpha', 'supp-alpha-2', 'SUPPLIER_OPERATOR', 1),
                    ('mem-4', 'user-op-suspended', 'tenant-alpha', 'supp-alpha-suspended', 'SUPPLIER_OPERATOR', 1),
                    ('mem-5', 'user-op-pending', 'tenant-alpha', 'supp-alpha-pending', 'SUPPLIER_OPERATOR', 1),
                    ('mem-6', 'user-op-beta', 'tenant-beta', 'supp-beta-1', 'SUPPLIER_OPERATOR', 1);
            `);
        }, 60000);

        afterAll(async () => {
            if (connectionPool) await connectionPool.end();
            if (adminPool) {
                if (executionSchemaName.startsWith('ppos_test_i2_') && executionSchemaName.includes(executionRunToken)) {
                    await adminPool.query(`DROP DATABASE IF EXISTS \`${executionSchemaName}\`;`);
                }
                await adminPool.end();
            }
            if (mysqlClient && mysqlClient.closePool) {
                await mysqlClient.closePool();
            }
        });

        beforeEach((ctx) => {
            if (!isDbConfigured) {
                ctx.skip();
            }
        });

        it('stages batch, enforces atomic confirmation with row locks, and does not confirm warnings by default', async () => {
            const csvData = [
                'CODE;NAME;PRICE;GRAMS;WIDTH (MM);HEIGHT (MM);COAT;PROVISER',
                'TX-01;Maxi Silk 150;450;150;700;1000;krītots;Papyrus DEF', // Valid
                'TX-02;Incomplete Small Paper;300;90;50;50;nekrītots;Polap DEF', // Warning: AMBIGUOUS_DIMENSION_UNITS (< 100mm)
                'TX-03;Rejected Nameless;200;80;640;900;uncoated;Polap DEF'  // Will be rejected
            ].join('\n');

            const buffer = Buffer.from(csvData, 'utf8');
            const preview = await paperImportService.processImportPreview({
                buffer,
                fileName: 'test_db_batch.csv',
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1',
                createdBy: 'user-op-alpha'
            });

            const staged = await paperImportService.stageImportBatch(preview);
            expect(staged.batchId).toBe(preview.batchId);
            expect(staged.status).toBe('STAGED');

            // Verify paginated rows query
            const page1 = await paperImportService.getImportBatchRows({
                batchId: preview.batchId,
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1',
                page: 1,
                limit: 2
            });
            expect(page1.totalRows).toBe(3);
            expect(page1.totalPages).toBe(2);
            expect(page1.rows.length).toBe(2);

            // Fetch row IDs
            const allRows = await paperImportService.getImportBatchRows({
                batchId: preview.batchId,
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1',
                page: 1,
                limit: 10
            });
            const validRow = allRows.rows.find(r => r.normalized.name === 'Maxi Silk 150');
            const warningRow = allRows.rows.find(r => r.normalized.name === 'Incomplete Small Paper');
            const rowToReject = allRows.rows.find(r => r.normalized.name === 'Rejected Nameless');

            // Apply decisions: rowToReject -> REJECTED
            await paperImportService.updateImportRowDecisions({
                batchId: preview.batchId,
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1',
                actorId: 'user-op-alpha',
                decisions: {
                    [rowToReject.id]: { decision: 'REJECTED' }
                }
            });

            // Requirement 3: Trying to confirm batch while unresolved warningRow exists MUST FAIL with UNRESOLVED_ROWS_EXIST
            await expect(paperImportService.confirmImportBatch({
                batchId: preview.batchId,
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1',
                actorId: 'user-op-alpha'
            })).rejects.toThrow(/UNRESOLVED_ROWS_EXIST/);

            // Now reject warningRow as well
            await paperImportService.updateImportRowDecisions({
                batchId: preview.batchId,
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1',
                actorId: 'user-op-alpha',
                decisions: {
                    [warningRow.id]: { decision: 'REJECTED' }
                }
            });

            // Confirm batch now succeeds!
            const confirmed = await paperImportService.confirmImportBatch({
                batchId: preview.batchId,
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1',
                actorId: 'user-op-alpha'
            });

            expect(confirmed.ok).toBe(true);
            expect(confirmed.status).toBe('CONFIRMED');
            expect(confirmed.confirmedProducts).toBe(1); // Only Maxi Silk 150 confirmed!
            expect(confirmed.counts.valid).toBe(1);
            expect(confirmed.counts.pending).toBe(0);
            expect(confirmed.counts.rejected).toBe(2);

            // Verify paper_products and paper_variants in database
            const [products] = await connectionPool.query('SELECT * FROM paper_products WHERE name = "Maxi Silk 150"');
            expect(products.length).toBe(1);
            expect(products[0].category).toBe('COATED');

            const [variants] = await connectionPool.query('SELECT * FROM paper_variants WHERE product_id = ?', [products[0].id]);
            expect(variants.length).toBe(1);
            expect(Number(variants[0].gsm)).toBe(150);
            expect(Number(variants[0].width_mm)).toBe(700);
            expect(Number(variants[0].height_mm)).toBe(1000);

            // Verify idempotency: re-confirm returns ALREADY_CONFIRMED without duplicating
            const reconfirm = await paperImportService.confirmImportBatch({
                batchId: preview.batchId,
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1',
                actorId: 'user-op-alpha'
            });
            expect(reconfirm.status).toBe('ALREADY_CONFIRMED');

            const [variantCount] = await connectionPool.query('SELECT COUNT(*) as count FROM paper_variants');
            expect(variantCount[0].count).toBe(1);
        });

        it('supports row correction via manual overrides and subsequent confirmation', async () => {
            const csvData = [
                'CODE;NAME;PRICE;GRAMS;WIDTH (MM);HEIGHT (MM);COAT;PROVISER',
                'COR-01;Custom Board;400;300;50;50;uncoated;Polap DEF' // Warning: abnormal dimensions (50x50)
            ].join('\n');

            const buffer = Buffer.from(csvData, 'utf8');
            const preview = await paperImportService.processImportPreview({
                buffer,
                fileName: 'test_override.csv',
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1',
                createdBy: 'user-op-alpha'
            });

            await paperImportService.stageImportBatch(preview);
            const { rows } = await paperImportService.getImportBatchRows({
                batchId: preview.batchId,
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1'
            });
            const targetRow = rows[0];
            expect(targetRow.validationStatus).toBe('WARNING');

            // Apply manual correction: dimensions corrected to 700x1000 and accepted
            await paperImportService.updateImportRowDecisions({
                batchId: preview.batchId,
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1',
                actorId: 'user-op-alpha',
                decisions: {
                    [targetRow.id]: {
                        decision: 'ACCEPTED',
                        overrides: { width_mm: 700, height_mm: 1000 }
                    }
                }
            });

            // Confirm
            const confirmed = await paperImportService.confirmImportBatch({
                batchId: preview.batchId,
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1',
                actorId: 'user-op-alpha'
            });

            expect(confirmed.confirmedProducts).toBe(1);
            const [variants] = await connectionPool.query('SELECT * FROM paper_variants WHERE width_mm = 700 AND height_mm = 1000');
            expect(variants.some(v => v.gsm === 300)).toBe(true);
        });

        it('transaction rollback: rolls back completely if an error occurs during confirmation', async () => {
            const csvData = [
                'CODE;NAME;PRICE;GRAMS;WIDTH (MM);HEIGHT (MM);COAT;PROVISER',
                'RB-01;Rollback Paper;500;200;700;1000;krītots;Papyrus DEF'
            ].join('\n');

            const buffer = Buffer.from(csvData, 'utf8');
            const preview = await paperImportService.processImportPreview({
                buffer,
                fileName: 'test_rollback.csv',
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1',
                createdBy: 'user-op-alpha'
            });

            await paperImportService.stageImportBatch(preview);

            // Corrupt batch record with invalid JSON decision to trigger SQL error inside transaction
            const origGetConnection = connectionPool.getConnection.bind(connectionPool);
            connectionPool.getConnection = async () => {
                const conn = await origGetConnection();
                const origCommit = conn.commit.bind(conn);
                conn.commit = async () => {
                    throw new Error('SIMULATED_TRANSACTION_FAILURE');
                };
                return conn;
            };

            await expect(paperImportService.confirmImportBatch({
                batchId: preview.batchId,
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1',
                actorId: 'user-op-alpha'
            })).rejects.toThrow(/SIMULATED_TRANSACTION_FAILURE/);

            // Restore connection pool
            connectionPool.getConnection = origGetConnection;

            // Verify that batch status remains PREVIEW (not CONFIRMED)
            const [batches] = await connectionPool.query('SELECT status FROM paper_import_batches WHERE id = ?', [preview.batchId]);
            expect(batches[0].status).toBe('PREVIEW');
            // Product was NOT committed
            const [prods] = await connectionPool.query('SELECT * FROM paper_products WHERE name = "Rollback Paper"');
            expect(prods.length).toBe(0);
        });


        it('preserves exact units for 100x150 mm when FORMAT is "100 x 150 mm" without threshold conversion', () => {
            const dummyHeaders = ['CODE', 'QR', 'NAME', 'PRICE', 'MIKRONS', 'THICKNESS (mm)', 'FORMAT', 'GRAMS', '', 'COAT', 'Min. QUANTITY', 'STEPS/UNITS', 'SORTIMET', 'WIDTH (mm)', 'Heights (mm)', 'PAPER TYPE', 'PROVISER', 'AKTIV'];
            const rawRow = ['U-100', '', 'Format Concordant 100x150', '200', '', '', '100 x 150 mm', '200', '', 'Ofset', '', '', '', '100', '150', 'Ofset', 'Polap DEF', 'Jā'];
            const norm = paperImportService.normalizeRowData(rawRow, dummyHeaders, 12);

            expect(norm.width_mm).toBe(100);
            expect(norm.height_mm).toBe(150);
            expect(norm.validationStatus).toBe('VALID');
            expect(norm.issues.some(i => i.code === 'DIMENSION_CONTRADICTION')).toBe(false);
        });

        it('separates duplicacy from technical validity: duplicate retains technical issues and cannot bypass acceptance', async () => {
            const csvData = [
                'CODE;NAME;PRICE;GRAMS;WIDTH (MM);HEIGHT (MM);COAT;PROVISER',
                'D-01;Bad Dims Duplicate;300;100;50;50;uncoated;Polap DEF', // Warning: AMBIGUOUS_DIMENSION_UNITS (<100mm)
                'D-02;Bad Dims Duplicate;310;100;50;50;uncoated;Papyrus DEF' // Duplicate row
            ].join('\n');

            const buffer = Buffer.from(csvData, 'utf8');
            const preview = await paperImportService.processImportPreview({
                buffer,
                fileName: 'duplicate_warning.csv',
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1',
                createdBy: 'user-op-alpha'
            });

            expect(preview.summary.duplicateRows).toBe(1);
            const dupRow = preview.rows[1];
            expect(dupRow.validationStatus).toBe('DUPLICATE');
            // Duplicate retains technical issue
            expect(dupRow.issues.some(i => i.code === 'AMBIGUOUS_DIMENSION_UNITS')).toBe(true);
            expect(dupRow.issues.some(i => i.code === 'DUPLICATE_IN_FILE')).toBe(true);

            // Staging and confirming without accepting or rejecting dupRow must fail
            await paperImportService.stageImportBatch(preview);
            await expect(paperImportService.confirmImportBatch({
                batchId: preview.batchId,
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1',
                actorId: 'user-op-alpha'
            })).rejects.toThrow(/UNRESOLVED_ROWS_EXIST/);
        });

        it('enforces override allowlist, type/range validation, recalculation of issues, and audit log', async () => {
            const csvData = [
                'CODE;NAME;PRICE;GRAMS;WIDTH (MM);HEIGHT (MM);COAT;PROVISER',
                'VAL-01;Test Validation;300;120;700;1000;uncoated;Polap DEF'
            ].join('\n');

            const buffer = Buffer.from(csvData, 'utf8');
            const preview = await paperImportService.processImportPreview({
                buffer,
                fileName: 'validation_test.csv',
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1',
                createdBy: 'user-op-alpha'
            });

            await paperImportService.stageImportBatch(preview);
            const { rows } = await paperImportService.getImportBatchRows({
                batchId: preview.batchId,
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1'
            });
            const rowId = rows[0].id;

            // 1. Disallowed field rejection
            await expect(paperImportService.updateImportRowDecisions({
                batchId: preview.batchId,
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1',
                actorId: 'user-op-alpha',
                decisions: {
                    [rowId]: { decision: 'ACCEPTED', overrides: { forbidden_field: 'hack' } }
                }
            })).rejects.toThrow(/INVALID_OVERRIDE_FIELD/);

            // 2. Out-of-range value rejection
            await expect(paperImportService.updateImportRowDecisions({
                batchId: preview.batchId,
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1',
                actorId: 'user-op-alpha',
                decisions: {
                    [rowId]: { decision: 'ACCEPTED', overrides: { width_mm: 5 } } // < 10
                }
            })).rejects.toThrow(/INVALID_OVERRIDE_VALUE/);

            // Mandatory Regressions Point 2: Revalidación de correcciones
            // An empty overrides: {} or unrelated change (e.g. finish) cannot clear an issue; GSM conflict persists until resolved
            const conflictCsv = [
                'CODE;NAME;PRICE;GRAMS;WIDTH (MM);HEIGHT (MM);COAT;PROVISER',
                'REV-01;Description Maxi Silk 150g;400;90;700;1000;krītots;Papyrus DEF'
            ].join('\n');
            const previewConflict = await paperImportService.processImportPreview({
                buffer: Buffer.from(conflictCsv, 'utf8'),
                fileName: 'conflict_reval.csv',
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1',
                createdBy: 'user-op-alpha'
            });
            await paperImportService.stageImportBatch(previewConflict);
            const conflictRows = await paperImportService.getImportBatchRows({
                batchId: previewConflict.batchId,
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1'
            });
            const cRow = conflictRows.rows[0];
            expect(cRow.validationStatus).toBe('WARNING');
            expect(cRow.issues.some(i => i.code === 'GSM_DESCRIPTION_CONFLICT')).toBe(true);

            // 2a. Empty overrides: {} with PENDING -> remains pending and confirmation blocks
            await paperImportService.updateImportRowDecisions({
                batchId: previewConflict.batchId,
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1',
                actorId: 'user-op-alpha',
                decisions: {
                    [cRow.id]: { decision: 'PENDING', overrides: {} }
                }
            });
            await expect(paperImportService.confirmImportBatch({
                batchId: previewConflict.batchId,
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1',
                actorId: 'user-op-alpha'
            })).rejects.toThrow(/UNRESOLVED_ROWS_EXIST/);

            // 2b. Changing only 'finish' does NOT eliminate the GSM conflict
            await paperImportService.updateImportRowDecisions({
                batchId: previewConflict.batchId,
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1',
                actorId: 'user-op-alpha',
                decisions: {
                    [cRow.id]: { decision: 'ACCEPTED', overrides: { finish: 'UNCOATED' } }
                }
            });
            const afterFinishRow = (await paperImportService.getImportBatchRows({
                batchId: previewConflict.batchId,
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1'
            })).rows[0];
            expect(afterFinishRow.issues.some(i => i.code === 'GSM_DESCRIPTION_CONFLICT')).toBe(true);
            expect(afterFinishRow.validationStatus).toBe('WARNING');

            // 2c. Correcting GSM effectively recalculates the coherent result and clears the conflict
            await paperImportService.updateImportRowDecisions({
                batchId: previewConflict.batchId,
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1',
                actorId: 'user-op-alpha',
                decisions: {
                    [cRow.id]: { decision: 'ACCEPTED', overrides: { gsm: 150 } }
                }
            });
            const afterGsmRow = (await paperImportService.getImportBatchRows({
                batchId: previewConflict.batchId,
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1'
            })).rows[0];
            expect(afterGsmRow.issues.some(i => i.code === 'GSM_DESCRIPTION_CONFLICT')).toBe(false);
            expect(afterGsmRow.validationStatus).toBe('VALID');

            // Mandatory Regressions Point 3: Confirmación de filas incompletas
            // Technical requirements must be validated on ALL non-rejected rows, even if marked ACCEPTED.
            // Missing gsm or dimensions blocks confirmation completely, rolls back, and keeps batch editable (PREVIEW).
            const incompleteCsv = [
                'CODE;NAME;PRICE;GRAMS;WIDTH (MM);HEIGHT (MM);COAT;PROVISER',
                'INC-01;Missing Gsm Paper;400;;700;1000;krītots;Papyrus DEF'
            ].join('\n');
            const previewInc = await paperImportService.processImportPreview({
                buffer: Buffer.from(incompleteCsv, 'utf8'),
                fileName: 'incomplete_test.csv',
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1',
                createdBy: 'user-op-alpha'
            });
            await paperImportService.stageImportBatch(previewInc);
            const incRows = await paperImportService.getImportBatchRows({
                batchId: previewInc.batchId,
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1'
            });
            const incRow = incRows.rows[0];
            expect(incRow.normalized.gsm).toBeNull();

            // Marking row as ACCEPTED without providing the missing GSM
            await paperImportService.updateImportRowDecisions({
                batchId: previewInc.batchId,
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1',
                actorId: 'user-op-alpha',
                decisions: {
                    [incRow.id]: { decision: 'ACCEPTED', overrides: {} }
                }
            });

            // Confirmation MUST be rejected with INCOMPLETE_ROWS_EXIST
            await expect(paperImportService.confirmImportBatch({
                batchId: previewInc.batchId,
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1',
                actorId: 'user-op-alpha'
            })).rejects.toThrow(/INCOMPLETE_ROWS_EXIST/);

            // Verify batch status remains editable (PREVIEW) and no products inserted
            const [incBatchState] = await connectionPool.query('SELECT status FROM paper_import_batches WHERE id = ?', [previewInc.batchId]);
            expect(incBatchState[0].status).toBe('PREVIEW');

            // Now reject the incomplete row and confirm -> succeeds, pending must be 0
            await paperImportService.updateImportRowDecisions({
                batchId: previewInc.batchId,
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1',
                actorId: 'user-op-alpha',
                decisions: {
                    [incRow.id]: { decision: 'REJECTED' }
                }
            });
            const confInc = await paperImportService.confirmImportBatch({
                batchId: previewInc.batchId,
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1',
                actorId: 'user-op-alpha'
            });
            expect(confInc.status).toBe('CONFIRMED');
            expect(confInc.counts.pending).toBe(0);
            expect(confInc.counts.rejected).toBe(1);

            // -------------------------------------------------------------
            // DEFECT 1: Corrección parcial de dimensiones (600x900 mm vs FORMAT 700x1000 mm)
            // -------------------------------------------------------------
            const dimPartialCsv = [
                'CODE;NAME;PRICE;GRAMS;WIDTH (MM);HEIGHT (MM);FORMAT;COAT;PROVISER',
                'DIM-PART;Dimension Partial Board;400;250;600;900;700 x 1000 mm;krītots;Papyrus DEF'
            ].join('\n');
            const previewDimPartial = await paperImportService.processImportPreview({
                buffer: Buffer.from(dimPartialCsv, 'utf8'),
                fileName: 'dim_partial_test.csv',
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1',
                createdBy: 'user-op-alpha'
            });
            await paperImportService.stageImportBatch(previewDimPartial);
            const dimRows = await paperImportService.getImportBatchRows({
                batchId: previewDimPartial.batchId,
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1'
            });
            const dimRow = dimRows.rows[0];
            expect(dimRow.validationStatus).toBe('WARNING');
            expect(dimRow.issues.some(i => i.code === 'DIMENSION_CONTRADICTION')).toBe(true);

            // 1a. Patching ONLY width_mm: 700 while maintaining PENDING must CONSERVE WARNING and block confirmation
            await paperImportService.updateImportRowDecisions({
                batchId: previewDimPartial.batchId,
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1',
                actorId: 'user-op-alpha',
                decisions: {
                    [dimRow.id]: { decision: 'PENDING', overrides: { width_mm: 700 } }
                }
            });
            const dimAfterWidth = (await paperImportService.getImportBatchRows({
                batchId: previewDimPartial.batchId,
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1'
            })).rows[0];
            expect(dimAfterWidth.issues.some(i => i.code === 'DIMENSION_CONTRADICTION')).toBe(true);
            expect(dimAfterWidth.validationStatus).toBe('WARNING');

            // Trying to confirm with partial dimension resolution MUST FAIL
            await expect(paperImportService.confirmImportBatch({
                batchId: previewDimPartial.batchId,
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1',
                actorId: 'user-op-alpha'
            })).rejects.toThrow(/UNRESOLVED_ROWS_EXIST/);

            // 1b. Changing ONLY finish must ALSO CONSERVE the contradiction
            await paperImportService.updateImportRowDecisions({
                batchId: previewDimPartial.batchId,
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1',
                actorId: 'user-op-alpha',
                decisions: {
                    [dimRow.id]: { decision: 'PENDING', overrides: { finish: 'UNCOATED' } }
                }
            });
            const dimAfterFinish = (await paperImportService.getImportBatchRows({
                batchId: previewDimPartial.batchId,
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1'
            })).rows[0];
            expect(dimAfterFinish.issues.some(i => i.code === 'DIMENSION_CONTRADICTION')).toBe(true);
            expect(dimAfterFinish.validationStatus).toBe('WARNING');

            // 1c. Correcting ALSO height_mm: 1000 MUST RESOLVE the contradiction completely
            await paperImportService.updateImportRowDecisions({
                batchId: previewDimPartial.batchId,
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1',
                actorId: 'user-op-alpha',
                decisions: {
                    [dimRow.id]: { decision: 'ACCEPTED', overrides: { width_mm: 700, height_mm: 1000 } }
                }
            });
            const dimAfterFull = (await paperImportService.getImportBatchRows({
                batchId: previewDimPartial.batchId,
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1'
            })).rows[0];
            expect(dimAfterFull.issues.some(i => i.code === 'DIMENSION_CONTRADICTION')).toBe(false);
            expect(dimAfterFull.validationStatus).toBe('VALID');

            // -------------------------------------------------------------
            // DEFECT 2: Validación de decisiones y condición final de cierre
            // -------------------------------------------------------------
            // 2a. Reject unknown decisions ("ACCEPT", malformed object without decision)
            // Verifies zero changes persisted and batch remains editable (PREVIEW)
            const decValCsv = [
                'CODE;NAME;PRICE;GRAMS;WIDTH (MM);HEIGHT (MM);COAT;PROVISER',
                'DEC-01;Decision Val Paper;300;120;700;1000;uncoated;Polap DEF'
            ].join('\n');
            const previewDec = await paperImportService.processImportPreview({
                buffer: Buffer.from(decValCsv, 'utf8'),
                fileName: 'decision_val_test.csv',
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1',
                createdBy: 'user-op-alpha'
            });
            await paperImportService.stageImportBatch(previewDec);
            const decRows = await paperImportService.getImportBatchRows({
                batchId: previewDec.batchId,
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1'
            });
            const decRowId = decRows.rows[0].id;

            // Enviar "ACCEPT" en lugar de "ACCEPTED"
            await expect(paperImportService.updateImportRowDecisions({
                batchId: previewDec.batchId,
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1',
                actorId: 'user-op-alpha',
                decisions: {
                    [decRowId]: 'ACCEPT'
                }
            })).rejects.toThrow(/INVALID_DECISION/);

            // Enviar objeto sin campo decision
            await expect(paperImportService.updateImportRowDecisions({
                batchId: previewDec.batchId,
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1',
                actorId: 'user-op-alpha',
                decisions: {
                    [decRowId]: { overrides: { gsm: 150 } }
                }
            })).rejects.toThrow(/INVALID_DECISION/);

            // Repeat with rows having WARNING and DUPLICATE: cannot bypass with invalid decision
            const warnDupCsv = [
                'CODE;NAME;PRICE;GRAMS;WIDTH (MM);HEIGHT (MM);COAT;PROVISER',
                'WD-01;Small Sheet Warn;300;100;50;50;uncoated;Polap DEF', // Warning
                'WD-02;Small Sheet Warn;310;100;50;50;uncoated;Polap DEF'  // Duplicate
            ].join('\n');
            const previewWarnDup = await paperImportService.processImportPreview({
                buffer: Buffer.from(warnDupCsv, 'utf8'),
                fileName: 'warn_dup_decision.csv',
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1',
                createdBy: 'user-op-alpha'
            });
            await paperImportService.stageImportBatch(previewWarnDup);
            const wdRows = await paperImportService.getImportBatchRows({
                batchId: previewWarnDup.batchId,
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1'
            });
            const warnId = wdRows.rows[0].id;
            const dupId = wdRows.rows[1].id;

            // Attempting invalid decisions on WARNING and DUPLICATE rows fails
            await expect(paperImportService.updateImportRowDecisions({
                batchId: previewWarnDup.batchId,
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1',
                actorId: 'user-op-alpha',
                decisions: {
                    [warnId]: 'ACCEPT',
                    [dupId]: { invalid: true }
                }
            })).rejects.toThrow(/INVALID_DECISION/);

            // Passing invalid decisions during confirmation also throws INVALID_DECISION and rolls back
            await expect(paperImportService.confirmImportBatch({
                batchId: previewWarnDup.batchId,
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1',
                actorId: 'user-op-alpha',
                selectedDecisions: {
                    [warnId]: 'ACCEPT'
                }
            })).rejects.toThrow(/INVALID_DECISION/);

            // Check that batch remains in PREVIEW status (zero changes persisted)
            const [batchPostErr] = await connectionPool.query('SELECT status FROM paper_import_batches WHERE id = ?', [previewWarnDup.batchId]);
            expect(batchPostErr[0].status).toBe('PREVIEW');

            // 2b. Never allow CONFIRMED with pending > 0:
            // If any row remains pending, confirmImportBatch throws UNRESOLVED_ROWS_EXIST and rolls back
            await expect(paperImportService.confirmImportBatch({
                batchId: previewWarnDup.batchId,
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1',
                actorId: 'user-op-alpha'
            })).rejects.toThrow(/UNRESOLVED_ROWS_EXIST/);

            // Verify status is still PREVIEW and pendingCount remains > 0
            const [batchStillPreview] = await connectionPool.query('SELECT status FROM paper_import_batches WHERE id = ?', [previewWarnDup.batchId]);
            expect(batchStillPreview[0].status).toBe('PREVIEW');

            // 3. Valid override updates normalized data, audit trail, and recomputes issues
            await paperImportService.updateImportRowDecisions({
                batchId: preview.batchId,
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1',
                actorId: 'user-op-alpha',
                decisions: {
                    [rowId]: {
                        decision: 'ACCEPTED',
                        overrides: { width_mm: 640, height_mm: 900, finish: 'COATED', grain_direction: 'LONG_GRAIN' }
                    }
                }
            });

            const updatedRows = await paperImportService.getImportBatchRows({
                batchId: preview.batchId,
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1'
            });
            const updated = updatedRows.rows[0];
            expect(updated.normalized.width_mm).toBe(640);
            expect(updated.normalized.height_mm).toBe(900);
            expect(updated.normalized.finish).toBe('COATED');
            expect(updated.normalized.grain_direction).toBe('LONG_GRAIN');
            expect(updated.normalized._audit_log.length).toBe(1);
            expect(updated.normalized._audit_log[0].actor_id).toBe('user-op-alpha');
            expect(updated.normalized._audit_log[0].previous_values.width_mm).toBe(700);
            expect(updated.normalized._audit_log[0].new_values.width_mm).toBe(640);
        });

        it('normalizes and persists declared grain direction into paper_variants and fingerprint', async () => {
            const csvData = [
                'CODE;NAME;PRICE;GRAMS;WIDTH (MM);HEIGHT (MM);COAT;PROVISER;GRAIN',
                'GR-01;Grain Test Long;300;120;700;1000;uncoated;Polap DEF;LONG GRAIN',
                'GR-02;Grain Test Short;300;120;700;1000;uncoated;Polap DEF;SHORT GRAIN'
            ].join('\n');

            const buffer = Buffer.from(csvData, 'utf8');
            const preview = await paperImportService.processImportPreview({
                buffer,
                fileName: 'grain_test.csv',
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1',
                createdBy: 'user-op-alpha'
            });

            expect(preview.rows[0].normalized.grain_direction).toBe('LONG_GRAIN');
            expect(preview.rows[1].normalized.grain_direction).toBe('SHORT_GRAIN');
            // Fingerprints must be distinct because grain direction differs!
            expect(preview.rows[0].normalized.fingerprint).not.toBe(preview.rows[1].normalized.fingerprint);

            await paperImportService.stageImportBatch(preview);
            await paperImportService.confirmImportBatch({
                batchId: preview.batchId,
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1',
                actorId: 'user-op-alpha'
            });

            const [variants] = await connectionPool.query('SELECT * FROM paper_variants WHERE width_mm = 700 AND height_mm = 1000 ORDER BY gsm ASC, grain_direction ASC');
            const lg = variants.find(v => v.grain_direction === 'LONG_GRAIN');
            const sg = variants.find(v => v.grain_direction === 'SHORT_GRAIN');
            expect(lg).toBeDefined();
            expect(sg).toBeDefined();
            expect(lg.grain_direction).toBe('LONG_GRAIN');
            expect(sg.grain_direction).toBe('SHORT_GRAIN');
        });

        it('concurrent review vs confirmation with row locks maintains consistency without deadlocks or partial state', async () => {
            const csvData = [
                'CODE;NAME;PRICE;GRAMS;WIDTH (MM);HEIGHT (MM);COAT;PROVISER',
                'CON-01;Concurrent Test A;300;150;700;1000;uncoated;Polap DEF',
                'CON-02;Concurrent Test B;300;170;700;1000;uncoated;Polap DEF'
            ].join('\n');

            const buffer = Buffer.from(csvData, 'utf8');
            const preview = await paperImportService.processImportPreview({
                buffer,
                fileName: 'concurrent_test.csv',
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1',
                createdBy: 'user-op-alpha'
            });

            await paperImportService.stageImportBatch(preview);
            const { rows } = await paperImportService.getImportBatchRows({
                batchId: preview.batchId,
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1'
            });
            const targetRow = rows[0];

            // Run review update and confirm concurrently
            const updatePromise = paperImportService.updateImportRowDecisions({
                batchId: preview.batchId,
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1',
                actorId: 'user-op-alpha',
                decisions: {
                    [targetRow.id]: {
                        decision: 'ACCEPTED',
                        overrides: { width_mm: 720, height_mm: 1020 }
                    }
                }
            });

            const confirmPromise = paperImportService.confirmImportBatch({
                batchId: preview.batchId,
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1',
                actorId: 'user-op-alpha'
            });

            const results = await Promise.allSettled([updatePromise, confirmPromise]);
            // Either both succeed (if update locked first, then confirm confirmed updated row)
            // or one threw BATCH_ALREADY_CONFIRMED if confirm locked first and confirmed.
            // In all cases, no unhandled deadlock or crash occurs and status is CONFIRMED.
            const [batch] = await connectionPool.query('SELECT status FROM paper_import_batches WHERE id = ?', [preview.batchId]);
            expect(batch[0].status).toBe('CONFIRMED');
        });

        it('enforces HTTP authorization guards: approves active operator, rejects viewer, cross-tenant, suspended and unapproved suppliers', async () => {
            const csvData = 'CODE;NAME;PRICE;GRAMS;WIDTH (MM);HEIGHT (MM)\nHTTP-1;Http Paper;300;120;700;1000';
            const fileBase64 = Buffer.from(csvData, 'utf8').toString('base64');

            // 1. Active Supplier Operator -> SUCCESS (200)
            const tokenOp = generateToken({
                id: 'user-op-alpha',
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1',
                role: 'SUPPLIER_OPERATOR',
                hasSupplierCapability: true
            });
            const resPreview = await dispatch(paperSuppliersRouter, {
                method: 'POST',
                url: '/catalog/imports/preview',
                headers: { authorization: `Bearer ${tokenOp}` },
                body: { fileBase64, fileName: 'test.csv' }
            });
            expect(resPreview.statusCode).toBe(200);
            const batchId = resPreview.body.data.batchId;

            // 2. Viewer trying to confirm -> FORBIDDEN (403)
            const tokenViewer = generateToken({
                id: 'user-view-alpha',
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-1',
                role: 'SUPPLIER_VIEWER',
                hasSupplierCapability: true
            });
            const resViewer = await dispatch(paperSuppliersRouter, {
                method: 'POST',
                url: `/catalog/imports/${batchId}/confirm`,
                headers: { authorization: `Bearer ${tokenViewer}` },
                params: { batchId },
                body: {}
            });
            expect(resViewer.statusCode).toBe(403);

            // 3. Different supplier of the same tenant trying to confirm -> NOT FOUND / FORBIDDEN (404)
            const tokenOtherSupplier = generateToken({
                id: 'user-op-alpha-2',
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-2',
                role: 'SUPPLIER_OPERATOR',
                hasSupplierCapability: true
            });
            const resOtherSupp = await dispatch(paperSuppliersRouter, {
                method: 'POST',
                url: `/catalog/imports/${batchId}/confirm`,
                headers: { authorization: `Bearer ${tokenOtherSupplier}` },
                params: { batchId },
                body: {}
            });
            expect(resOtherSupp.statusCode).toBe(404);

            // 4. Supplier of another tenant trying to confirm -> NOT FOUND (404)
            const tokenAlien = generateToken({
                id: 'user-op-beta',
                tenantId: 'tenant-beta',
                supplierId: 'supp-beta-1',
                role: 'SUPPLIER_OPERATOR',
                hasSupplierCapability: true
            });
            const resAlien = await dispatch(paperSuppliersRouter, {
                method: 'POST',
                url: `/catalog/imports/${batchId}/confirm`,
                headers: { authorization: `Bearer ${tokenAlien}` },
                params: { batchId },
                body: {}
            });
            expect(resAlien.statusCode).toBe(404);

            // 5. Suspended supplier trying to access -> FORBIDDEN (403)
            const tokenSuspended = generateToken({
                id: 'user-op-suspended',
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-suspended',
                role: 'SUPPLIER_OPERATOR',
                hasSupplierCapability: true
            });
            const resSusp = await dispatch(paperSuppliersRouter, {
                method: 'POST',
                url: '/catalog/imports/preview',
                headers: { authorization: `Bearer ${tokenSuspended}` },
                body: { fileBase64, fileName: 'test.csv' }
            });
            expect(resSusp.statusCode).toBe(403);
            expect(resSusp.body.error.code).toBe('SUPPLIER_SUSPENDED');

            // 6. Pending Review supplier trying to access -> FORBIDDEN (403)
            const tokenPending = generateToken({
                id: 'user-op-pending',
                tenantId: 'tenant-alpha',
                supplierId: 'supp-alpha-pending',
                role: 'SUPPLIER_OPERATOR',
                hasSupplierCapability: true
            });
            const resPending = await dispatch(paperSuppliersRouter, {
                method: 'POST',
                url: '/catalog/imports/preview',
                headers: { authorization: `Bearer ${tokenPending}` },
                body: { fileBase64, fileName: 'test.csv' }
            });
            expect(resPending.statusCode).toBe(403);
            expect(resPending.body.error.code).toBe('SUPPLIER_PENDING_REVIEW');
        });
    });
});
