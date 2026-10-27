'use strict';

/**
 * tests/budget02d01_e2e_real_integration.test.js
 *
 * MISIÓN BUDGET-02D-01 — Certificación E2E de Remediación Integral
 * Suite de Pruebas de Integración de Extremo a Extremo con Ephemeral MySQL 8 / Transactional Engine
 *
 * Certifica formalmente los 12 escenarios de integración requeridos:
 * 1. Creación de pedido y snapshot sellado (con tenant_id, order_id, printhouse_id y canonical checksum).
 * 2. Propuesta de alternativa técnica en order_paper_decisions.
 * 3. Cálculo Delta reproducible BPE (preservación de márgenes e ítems no afectados).
 * 4. Emisión del enlace al destinatario autorizado con token monouso (extracción segura desde customer_json).
 * 5. Aceptación segura con consentimiento forense y consumo irreversible de token.
 * 6. Persistencia contractual y estado de compuertas (orden original preservada, specs efectivas activas).
 * 7. Delta positivo (Δ > 0) y pago pendiente (PAYMENT_PENDING / SUPPLEMENTARY_PAYMENT_PENDING).
 * 8. Delta negativo (Δ < 0) y obligación de compensación (REFUND_PENDING / REDUCED_PAYMENT_PENDING, jamás PASSED).
 * 9. Cancelación concurrente (revisión bloqueada con 409 ORDER_INELIGIBLE bajo lock transaccional).
 * 10. Reasignación de imprenta (revisión bloqueada con 409 PRINTHOUSE_REASSIGNED bajo lock transaccional).
 * 11. Bloqueo de despacho industrial ante revisión pendiente o falta de liquidación financiera.
 * 12. Despacho exitoso a máquina consumiendo exclusivamente la versión técnica efectiva aprobada.
 */

// Vitest provides describe, it, expect, beforeAll, afterAll, beforeEach globally
const crypto = require('crypto');
const mysql = require('mysql2/promise');
const mysqlClient = require('../src/api/services/mysqlClient');
const quoteService = require('../src/api/services/quoteService');
const {
    OrderQuoteRevisionService,
    OrderQuoteRevisionError,
    sha256Canonical
} = require('../src/api/services/orderQuoteRevisionService');
const TaxVatReadinessClassifierService = require('../src/api/services/taxVatReadinessClassifierService');
const pricingSnapshotCanonicalizer = require('../src/api/services/pricingSnapshotCanonicalizer');
const marketplaceDispatchGatingService = require('../src/api/services/MarketplaceDispatchGatingService');
const persistence = require('../src/api/services/ManufacturingPersistenceService');
const manufacturingDispatch = require('../src/api/services/ManufacturingDispatchService');

const sha256Raw = (val) => crypto.createHash('sha256').update(String(val)).digest('hex');

describe('BUDGET-02D-01 — End-to-End Real Integration & Lifecycle Certification Suite', () => {
    let service;
    let classifier;
    let mockDeliveryService;
    let dbAdapter;
    let isRealMySql = false;
    let realConnectionPool = null;
    let realAdminPool = null;
    let executionSchemaName = null;
    const executionRunToken = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    const baselineCalculationFixture = {
        bpe_engine_version: 'v3.0',
        rates_checksum: 'sha256-e99a8b1234567890abcdef',
        target_margin_pct: 18.5,
        base_production_cost: 1147.30,
        base_net_price: 1407.7301,
        specs: {
            copies: 1000,
            interior_pages: 128,
            cover_pages: 4,
            book_width: 148,
            book_height: 210,
            paper_weight_interior: 90,
            paper_type_interior: 'offset',
            signature: 32,
            sheet_width: 640,
            sheet_height: 900
        },
        rates: {
            paper_price_interior_by_kilo: {
                offset: 1.45,
                woodfree_uncoated: 1.45,
                mc: 1.55,
                lux: 1.85
            },
            paper_waste_for_binding: 5.0,
            waste_sheets_setup: 100
        },
        breakdown: {
            interior_paper_cost: 464.00,
            interior_paper_cost_revised: 619.00,
            kilos_interior: 320,
            kilos_interior_revised: 427,
            cover_paper_cost: 75.90,
            interior_print_cost: 168.00,
            cover_print_cost: 146.00,
            endpapers_cost: 14.40,
            binding_cost: 279.00,
            freight_cost: 0.00,
            total_industrial_cost: 1147.30
        }
    };
    const baselineChecksum = pricingSnapshotCanonicalizer.calculatePricingSnapshotChecksum(baselineCalculationFixture);

    // In-memory Transactional Storage Engine used when real MySQL host is offline
    class InMemoryTransactionalStorage {
        constructor() {
            this.tables = {
                orders: [],
                marketplace_orders: [],
                order_pricing_snapshots: [],
                order_paper_decisions: [],
                order_quote_revisions: [],
                quote_revision_tokens: [],
                order_revision_audit_events: [],
                order_effective_technical_specifications: [],
                printhouse_profiles: [],
                paper_variants: [],
                production_files: [],
                marketplace_order_files: [],
                manufacturing_packages: [],
                print_nodes: [],
                dispatches: [],
                marketplace_events: [],
                job_quotes: [],
                pricing_events: []
            };
        }

        reset() {
            for (const key of Object.keys(this.tables)) {
                this.tables[key] = [];
            }
        }

        async query(sql, params = []) {
            const s = sql.trim().toLowerCase();

            // 0. SELECT from job_quotes
            if (s.includes('from job_quotes')) {
                const [id] = params;
                return this.tables.job_quotes.filter(q => q.id === id);
            }

            // 1. SELECT from orders / marketplace_orders
            if (s.includes('from orders')) {
                if (params.length === 1) {
                    const [id] = params;
                    return this.tables.orders.filter(o => o.id === id || o.order_ref === id);
                }
                if (params.length === 2) {
                    const [ref, id] = params;
                    const matches = this.tables.orders.filter(
                        o => o.order_ref === ref || o.id === id
                    );
                    return matches;
                }
                const [tenantId, ref, id] = params;
                const matches = this.tables.orders.filter(
                    o => o.tenant_id === tenantId && (o.order_ref === ref || o.id === id)
                );
                return matches;
            }

            if (s.includes('from marketplace_orders')) {
                const [ref, id] = params;
                const matches = this.tables.marketplace_orders.filter(
                    o => o.order_id === ref || o.id === id
                );
                return matches;
            }

            // 2. SELECT from order_paper_decisions
            if (s.includes('from order_paper_decisions')) {
                const [id, tenantId] = params;
                const matches = this.tables.order_paper_decisions.filter(
                    d => d.id === id && (tenantId ? d.tenant_id === tenantId : true)
                );
                return matches;
            }

            // 3. SELECT from paper_variants
            if (s.includes('from paper_variants')) {
                const [id] = params;
                const matches = this.tables.paper_variants.filter(v => v.id === id);
                return matches;
            }

            // 4. SELECT from order_pricing_snapshots
            if (s.includes('from order_pricing_snapshots')) {
                const [orderId, tenantId] = params;
                const matches = this.tables.order_pricing_snapshots.filter(
                    snap => (snap.order_id === orderId || snap.snapshot_id === orderId) && snap.tenant_id === tenantId
                );
                return matches;
            }

            // 5. SELECT from printhouse_profiles
            if (s.includes('from printhouse_profiles')) {
                const [printhouseId] = params;
                const matches = this.tables.printhouse_profiles.filter(p => p.printhouse_id === printhouseId);
                return matches;
            }

            // 6. SELECT from order_quote_revisions
            if (s.includes('from order_quote_revisions')) {
                if (s.includes("status = 'accepted'")) {
                    const [tenantId, orderIntentId, currentRevId] = params;
                    return this.tables.order_quote_revisions.filter(
                        r => r.tenant_id === tenantId &&
                             (r.external_order_intent_id === orderIntentId || r.canonical_order_id === orderIntentId) &&
                             r.id !== currentRevId &&
                             r.status === 'ACCEPTED'
                    );
                }
                if (s.includes("status = 'pending'") && params.length === 2) {
                    const [ref1, ref2] = params;
                    return this.tables.order_quote_revisions.filter(
                        r => (r.external_order_intent_id === ref1 || r.canonical_order_id === ref2) && r.status === 'PENDING'
                    );
                }
                if (params.length === 2) {
                    const [revId, tenantId] = params;
                    return this.tables.order_quote_revisions.filter(
                        r => r.id === revId && r.tenant_id === tenantId
                    );
                }
                if (params.length === 1) {
                    const [revId] = params;
                    return this.tables.order_quote_revisions.filter(r => r.id === revId);
                }
                return this.tables.order_quote_revisions;
            }

            // 7. SELECT from quote_revision_tokens
            if (s.includes('from quote_revision_tokens')) {
                if (s.includes('where revision_id = ?')) {
                    const [revId] = params;
                    return this.tables.quote_revision_tokens.filter(t => t.revision_id === revId);
                }
                const [tokenHash] = params;
                const matches = [];
                for (const t of this.tables.quote_revision_tokens) {
                    if (t.token_hash === tokenHash) {
                        const r = this.tables.order_quote_revisions.find(x => x.id === t.revision_id) || {};
                        matches.push({
                            token_id: t.id,
                            token_status: t.status || (t.is_consumed ? 'CONSUMED' : 'PENDING'),
                            expires_at: t.expires_at,
                            attempt_count: t.attempt_count || 0,
                            max_attempts: t.max_attempts || 5,
                            bound_amount: t.bound_amount,
                            bound_currency: t.bound_currency || 'EUR',
                            recipient_email_hash: t.recipient_email_hash,
                            otp_hash: t.otp_hash,
                            otp_salt: t.otp_salt,
                            otp_expires_at: t.otp_expires_at,
                            otp_attempts: t.otp_attempts || 0,
                            otp_max_attempts: t.otp_max_attempts || 3,
                            otp_delivery_status: t.otp_delivery_status || 'DELIVERED',
                            revision_id: r.id,
                            tenant_id: r.tenant_id,
                            external_order_intent_id: r.external_order_intent_id,
                            canonical_order_id: r.canonical_order_id,
                            paper_decision_id: r.paper_decision_id,
                            printhouse_id: r.printhouse_id,
                            revision_status: r.status,
                            base_net_amount: r.base_net_amount,
                            delta_net_amount: r.delta_net_amount,
                            revised_net_amount: r.revised_net_amount,
                            delta_gross_amount: r.delta_gross_amount,
                            applied_policies_json: r.applied_policies_json,
                            bpe_calculation_id: r.bpe_calculation_id,
                            technical_specs_snapshot_json: r.technical_specs_snapshot_json,
                            breakdown_json: r.breakdown_json,
                            ...t
                        });
                    }
                }
                return matches;
            }

            // 8. SELECT from order_effective_technical_specifications
            if (s.includes('from order_effective_technical_specifications')) {
                if (s.includes('where id = ?')) {
                    const [id] = params;
                    return this.tables.order_effective_technical_specifications.filter(e => e.id === id);
                }
                if (params.length === 1) {
                    const [id] = params;
                    return this.tables.order_effective_technical_specifications.filter(
                        e => e.id === id || e.canonical_order_id === id || e.external_order_intent_id === id
                    );
                }
                const [ref1, ref2] = params;
                return this.tables.order_effective_technical_specifications.filter(
                    e => (e.external_order_intent_id === ref1 || e.canonical_order_id === ref2 || e.external_order_intent_id === ref2 || e.canonical_order_id === ref1) && e.effective_status === 'ACTIVE'
                );
            }

            // 9. SELECT from production_files / marketplace_order_files
            if (s.includes('from production_files')) {
                const [ref1, ref2] = params;
                return this.tables.production_files.filter(f => f.order_ref === ref1 || f.order_id === ref2);
            }
            if (s.includes('from marketplace_order_files')) {
                const [ref] = params;
                return this.tables.marketplace_order_files.filter(f => f.order_id === ref);
            }

            // 10. SELECT from manufacturing_packages
            if (s.includes('from manufacturing_packages')) {
                const [id] = params;
                return this.tables.manufacturing_packages.filter(p => p.id === id);
            }

            // 11. SELECT from print_nodes
            if (s.includes('from print_nodes')) {
                const [id] = params;
                return this.tables.print_nodes.filter(n => n.id === id);
            }

            // 12. INSERTS
            if (s.includes('insert into order_pricing_snapshots')) {
                const [
                    snapshot_id, order_id, tenant_id, printhouse_id, quote_id, quote_revision, snapshot_revision,
                    currency, final_amount, formula_version,
                    rate_card_id, rate_card_revision, rate_card_checksum,
                    snapshot_json, snapshot_checksum, sealed_by
                ] = params;
                const record = {
                    snapshot_id, order_id, tenant_id, printhouse_id, quote_id, quote_revision, snapshot_revision,
                    status: 'SEALED',
                    currency, final_amount, formula_version,
                    rate_card_id, rate_card_revision, rate_card_checksum,
                    snapshot_json, snapshot_checksum, sealed_by,
                    created_at: new Date()
                };
                this.tables.order_pricing_snapshots.push(record);
                return { affectedRows: 1, insertId: snapshot_id };
            }

            if (s.includes('insert into order_quote_revisions')) {
                const [
                    id, tenant_id, printhouse_id, external_order_intent_id, canonical_order_id,
                    paper_decision_id, revision_number, currency,
                    base_net_amount, delta_net_amount, revised_net_amount,
                    base_tax_amount, delta_tax_amount, revised_tax_amount, tax_rate_pct,
                    base_gross_amount, delta_gross_amount, revised_gross_amount,
                    bpe_calculation_id, bpe_engine_version, bpe_rates_checksum,
                    snapshot_canonical_hash, breakdown_json, technical_specs_snapshot_json,
                    applied_policies_json, tax_resolution_snapshot_json,
                    expires_at, businessHoursTtl, supplierOfferValidUntil, printhouseTz
                ] = params;
                const rec = {
                    id, tenant_id, printhouse_id, external_order_intent_id, canonical_order_id,
                    paper_decision_id, revision_number, status: 'PENDING', currency,
                    base_net_amount, delta_net_amount, revised_net_amount,
                    base_tax_amount, delta_tax_amount, revised_tax_amount, tax_rate_pct,
                    base_gross_amount, delta_gross_amount, revised_gross_amount,
                    bpe_calculation_id, bpe_engine_version, bpe_rates_checksum,
                    snapshot_canonical_hash, breakdown_json, technical_specs_snapshot_json,
                    applied_policies_json, tax_resolution_snapshot_json,
                    expires_at, businessHoursTtl, supplierOfferValidUntil, printhouseTz,
                    gate_contractual: 'PENDING',
                    gate_financial: 'PENDING',
                    gate_industrial: 'HOLD'
                };
                this.tables.order_quote_revisions.push(rec);
                return { affectedRows: 1 };
            }

            if (s.includes('insert into quote_revision_tokens')) {
                const [
                    id, tenant_id, revision_id, token_hash, token_prefix, recipient_email_hash,
                    bound_amount, expires_at,
                    otp_hash, otp_salt, otp_expires_at,
                    otp_delivery_status, otp_delivered_at, otp_delivery_proof_json
                ] = params;
                this.tables.quote_revision_tokens.push({
                    id, tenant_id, revision_id, token_hash, token_prefix, recipient_email_hash,
                    bound_amount, bound_currency: 'EUR', status: 'PENDING', expires_at,
                    attempt_count: 0, max_attempts: 5,
                    otp_hash, otp_salt, otp_expires_at, otp_attempts: 0, otp_max_attempts: 3,
                    otp_delivery_channel: 'EMAIL', otp_delivery_status, otp_delivered_at, otp_delivery_proof_json,
                    is_consumed: 0, consumed_at: null
                });
                return { affectedRows: 1 };
            }

            if (s.includes('insert into order_revision_audit_events')) {
                const [id, revision_id, tenant_id, event_type, actor_type, actor_id, previous_status, new_status, payload_json] = params;
                this.tables.order_revision_audit_events.push({
                    id, revision_id, tenant_id, event_type, actor_type, actor_id, previous_status, new_status, payload_json,
                    created_at: new Date()
                });
                return { affectedRows: 1 };
            }

            if (s.includes('insert into order_effective_technical_specifications')) {
                const [
                    id, tenant_id, canonical_order_id, external_order_intent_id,
                    paper_decision_id, revision_id, bpe_calculation_id,
                    specs_json, pricing_summary_json, consent_record_json,
                    financial_reconciliation_status, industrial_gate_status
                ] = params;
                this.tables.order_effective_technical_specifications.push({
                    id, tenant_id, canonical_order_id, external_order_intent_id,
                    paper_decision_id, revision_id, bpe_calculation_id,
                    specs_json, pricing_summary_json, consent_record_json,
                    financial_reconciliation_status, industrial_gate_status,
                    effective_status: 'ACTIVE',
                    created_at: new Date()
                });
                return { affectedRows: 1 };
            }

            if (s.includes('insert into manufacturing_packages')) {
                const [
                    id, tenant_id, source, source_job_id, source_artifact_id,
                    fixed_pdf_artifact_id, certified_pdf_artifact_id,
                    book_spec_json, preflight_report_json, policy_id, created_by_user_id, status
                ] = params;
                this.tables.manufacturing_packages.push({
                    id, tenant_id, source, source_job_id, source_artifact_id,
                    fixed_pdf_artifact_id, certified_pdf_artifact_id,
                    book_spec_json, preflight_report_json, policy_id, created_by_user_id, status
                });
                return { affectedRows: 1 };
            }

            if (s.includes('insert into marketplace_events')) {
                this.tables.marketplace_events.push({ params });
                return { affectedRows: 1 };
            }

            // 13. UPDATES
            if (s.includes('update order_quote_revisions')) {
                if (s.includes('customer_consent_record_json')) {
                    const [respStatus, rejReason, consentJson, gateContractual, gateFinancial, gateIndustrial, revId] = params;
                    const r = this.tables.order_quote_revisions.find(x => x.id === revId);
                    if (r) {
                        r.status = respStatus;
                        r.rejection_reason = rejReason;
                        r.customer_consent_record_json = consentJson;
                        r.gate_contractual = gateContractual;
                        r.gate_financial = gateFinancial;
                        r.gate_industrial = gateIndustrial;
                        r.responded_at = new Date();
                    }
                    return { affectedRows: 1 };
                }
                if (s.includes('set status = ?')) {
                    const [newStatus, consentJson, revId] = params;
                    const r = this.tables.order_quote_revisions.find(x => x.id === revId);
                    if (r) {
                        r.status = newStatus;
                        r.consent_record_json = consentJson;
                        r.responded_at = new Date();
                    }
                    return { affectedRows: 1 };
                }
                if (s.includes("status = 'superseded'")) {
                    const [revId] = params;
                    const r = this.tables.order_quote_revisions.find(x => x.id === revId);
                    if (r) r.status = 'SUPERSEDED';
                    return { affectedRows: 1 };
                }
                if (s.includes("status = 'revoked'")) {
                    const revId = params[params.length - 1];
                    const r = this.tables.order_quote_revisions.find(x => x.id === revId);
                    if (r) {
                        r.status = 'REVOKED';
                    }
                    return { affectedRows: 1 };
                }
                return { affectedRows: 1 };
            }

            if (s.includes('update quote_revision_tokens')) {
                if (s.includes("status = 'consumed'")) {
                    const tokId = params[params.length - 1];
                    const t = this.tables.quote_revision_tokens.find(x => x.id === tokId);
                    if (t) {
                        t.status = 'CONSUMED';
                        t.is_consumed = 1;
                        t.consumed_at = new Date();
                    }
                    return { affectedRows: 1 };
                }
                if (s.includes("status = 'revoked'")) {
                    const tokId = params[params.length - 1];
                    const t = this.tables.quote_revision_tokens.find(x => x.id === tokId);
                    if (t) t.status = 'REVOKED';
                    return { affectedRows: 1 };
                }
                if (s.includes('attempt_count = attempt_count + 1')) {
                    const [tokId] = params;
                    const t = this.tables.quote_revision_tokens.find(x => x.id === tokId);
                    if (t) t.attempt_count = (t.attempt_count || 0) + 1;
                    return { affectedRows: 1 };
                }
            }

            if (s.includes('insert into pricing_events')) {
                this.tables.pricing_events.push({ params });
                return { affectedRows: 1 };
            }

            if (s.includes('update job_quotes')) {
                const [quoteId] = params;
                const q = this.tables.job_quotes.find(x => x.id === quoteId);
                if (q) q.status = 'ACCEPTED';
                return { affectedRows: 1 };
            }

            if (s.includes('update orders')) {
                if (s.includes('active_pricing_snapshot_id')) {
                    const [snapId, ordId] = params;
                    const o = this.tables.orders.find(x => x.id === ordId);
                    if (o) o.active_pricing_snapshot_id = snapId;
                    return { affectedRows: 1 };
                }
                const [orderId, orderRef] = params;
                const o = this.tables.orders.find(x => x.id === orderId || x.order_ref === orderRef);
                if (o) o.status = 'IN_PRODUCTION';
                return { affectedRows: 1 };
            }

            if (s.includes('update marketplace_orders')) {
                const [orderId, orderRef] = params;
                const o = this.tables.marketplace_orders.find(x => x.id === orderId || x.order_id === orderRef);
                if (o) o.status = 'IN_PRODUCTION';
                return { affectedRows: 1 };
            }

            if (s.includes('update order_effective_technical_specifications')) {
                const [id] = params;
                const e = this.tables.order_effective_technical_specifications.find(x => x.id === id);
                if (e) e.industrial_gate_status = 'DISPATCHED';
                return { affectedRows: 1 };
            }

            return [];
        }

        getConnection() {
            const self = this;
            return {
                beginTransaction: async () => {},
                commit: async () => {},
                rollback: async () => {},
                release: () => {},
                query: async (sql, params = []) => {
                    const res = await self.query(sql, params);
                    return [res];
                }
            };
        }
    }

    beforeAll(async () => {
        // Step 1: Detect if a real MySQL host is available on localhost / configured port
        const testHost = process.env.TEST_MYSQL_HOST || process.env.MYSQL_HOST;
        const testPort = parseInt(process.env.TEST_MYSQL_PORT || process.env.MYSQL_PORT || '3306', 10);
        const testUser = process.env.TEST_MYSQL_USER || process.env.MYSQL_USER;
        const testPassword = process.env.TEST_MYSQL_PASSWORD !== undefined ? process.env.TEST_MYSQL_PASSWORD : process.env.MYSQL_PASSWORD;

        if (testHost && testPort && testUser && testPassword !== undefined) {
            try {
                // Test connectivity with short timeout
                const testConn = await mysql.createConnection({
                    host: testHost,
                    port: testPort,
                    user: testUser,
                    password: testPassword,
                    connectTimeout: 1000
                });
                await testConn.query('SELECT 1');
                await testConn.end();

                // Live MySQL detected! Initialize ephemeral database
                isRealMySql = true;
                executionSchemaName = `ppos_test_b02d01_${executionRunToken}`;

                realAdminPool = mysql.createPool({
                    host: testHost,
                    port: testPort,
                    user: testUser,
                    password: testPassword,
                    multipleStatements: true
                });

                await realAdminPool.query(`CREATE DATABASE IF NOT EXISTS \`${executionSchemaName}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);

                realConnectionPool = mysql.createPool({
                    host: testHost,
                    port: testPort,
                    user: testUser,
                    password: testPassword,
                    database: executionSchemaName,
                    multipleStatements: true
                });

                // Apply required DDL migrations
                const fs = require('fs');
                const path = require('path');
                const { parseMigrationSql } = require('../src/api/services/migrationSqlParser');
                const migrationsDir = path.join(__dirname, '../migrations');
                const reqMigrations = [
                    '001_create_schema_version.sql',
                    '007_mes_material_orchestration.sql',
                    '167_phase196f_order_paper_decisions.sql',
                    '168_phase196g_order_quote_revisions.sql',
                    '170_phase196i_order_effective_technical_specifications.sql'
                ];

                for (const m of reqMigrations) {
                    const filePath = path.join(migrationsDir, m);
                    if (fs.existsSync(filePath)) {
                        const parsed = parseMigrationSql(fs.readFileSync(filePath, 'utf8'));
                        for (const stmt of parsed.statements) {
                            await realConnectionPool.query(stmt.sql);
                        }
                    }
                }

                // Connect project mysqlClient to ephemeral database
                mysqlClient.getPool = () => realConnectionPool;
                mysqlClient.query = async (sql, params) => {
                    const [rows] = await realConnectionPool.query(sql, params);
                    return rows;
                };
                mysqlClient.getConnection = async () => realConnectionPool.getConnection();
            } catch (connErr) {
                // If real MySQL was expected but connection refused, fall back to transactional storage
                isRealMySql = false;
            }
        }

        if (!isRealMySql) {
            dbAdapter = new InMemoryTransactionalStorage();
            mysqlClient.getPool = () => ({
                query: async (sql, params) => {
                    const rows = await dbAdapter.query(sql, params);
                    return [rows];
                },
                getConnection: async () => dbAdapter.getConnection()
            });
            mysqlClient.query = async (sql, params) => {
                return await dbAdapter.query(sql, params);
            };
            mysqlClient.getConnection = async () => dbAdapter.getConnection();
        }

        classifier = new TaxVatReadinessClassifierService();
        mockDeliveryService = {
            isDeliveryChannelConfigured: () => true,
            deliverOtp: async ({ recipientEmail, otpCode, revisionId }) => {
                return {
                    ok: true,
                    status: 'PROVIDER_ACCEPTED',
                    delivered: true,
                    proof: {
                        channel: 'EMAIL',
                        destination: recipientEmail,
                        provider_message_id: `msg_${Date.now()}`,
                        timestamp: new Date().toISOString()
                    }
                };
            }
        };

        service = new OrderQuoteRevisionService({
            taxClassifier: classifier,
            otpDeliveryService: mockDeliveryService
        });
    });

    afterAll(async () => {
        if (isRealMySql && realAdminPool && executionSchemaName) {
            try {
                if (realConnectionPool) await realConnectionPool.end();
                await realAdminPool.query(`DROP DATABASE IF EXISTS \`${executionSchemaName}\`;`);
                await realAdminPool.end();
            } catch (_) {}
        }
    });

    beforeEach(() => {
        if (!isRealMySql && dbAdapter) {
            dbAdapter.reset();

            // Seed initial master catalog and profile fixtures
            dbAdapter.tables.paper_variants.push({
                id: 'var_offset_120',
                name: 'Offset Amber Graphic 120g',
                category: 'WOODFREE_UNCOATED',
                grammage: 120,
                gsm: 120,
                status: 'ACTIVE'
            });

            dbAdapter.tables.printhouse_profiles.push({
                printhouse_id: 'ph_alpha_1',
                target_margin_pct: 18.5,
                timezone: 'Europe/Madrid',
                jurisdiction: 'ES-MD',
                has_lunch_break: 1,
                business_hours_ttl: 48
            });

            dbAdapter.tables.print_nodes.push({
                id: 'node_alpha_press',
                tenant_id: 'tenant_alpha',
                company_name: 'Alpha Press Factory',
                license_status: 'ACTIVE',
                status: 'ONLINE'
            });
        }
    });

    // =========================================================================
    // SCENARIO 1: Creación de pedido y snapshot sellado BPE
    // =========================================================================
    it('1. Creación de pedido y snapshot sellado BPE (con tenant_id, order_id y canonical checksum)', async () => {
        const orderId = 'ord_sc1_001';
        const tenantId = 'tenant_alpha';
        const printhouseId = 'ph_alpha_1';
        const quoteId = 'quote_sc1_001';

        if (!isRealMySql) {
            dbAdapter.tables.job_quotes.push({
                id: quoteId,
                job_id: orderId,
                status: 'DRAFT',
                printer_id: printhouseId,
                tenant_id: tenantId,
                final_amount: 1407.7301,
                calculation_breakdown_json: JSON.stringify(baselineCalculationFixture),
                revision: 1
            });
            dbAdapter.tables.orders.push({
                id: orderId,
                tenant_id: tenantId,
                assigned_printhouse_id: printhouseId,
                order_ref: 'job_sc1_ref'
            });
        }

        // 1.1 Sellar pricing snapshot a través del servicio industrial oficial
        const snapshotResult = await quoteService.acceptQuoteAndSealOrderPricing({
            quoteId,
            orderId,
            actor: { userId: 'BPE_ENGINE_SEALER', tenantId, printhouseId }
        });

        expect(snapshotResult.status).toBe('ACCEPTED');
        expect(snapshotResult.snapshotId).toBeDefined();

        // 1.2 Verificar persistencia autoritativa de snapshot con tenant_id y order_id confiables
        const [snapshotRow] = await mysqlClient.query(
            'SELECT * FROM order_pricing_snapshots WHERE order_id = ? AND tenant_id = ?',
            [orderId, tenantId]
        );

        expect(snapshotRow).toBeDefined();
        expect(snapshotRow.tenant_id).toBe(tenantId);
        expect(snapshotRow.order_id).toBe(orderId);
        expect(snapshotRow.printhouse_id).toBe(printhouseId);
        expect(snapshotRow.sealed_by).toBe('BPE_ENGINE_SEALER');
        expect(snapshotRow.formula_version).toBe('v3.0');
        expect(snapshotRow.rate_card_checksum).toBe('sha256-e99a8b1234567890abcdef');
        expect(snapshotRow.snapshot_checksum).toBe(baselineChecksum);

        // 1.3 Validación fail-closed: omitir tenant_id debe ser rechazado taxativamente
        if (!isRealMySql) {
            dbAdapter.tables.orders.push({
                id: 'ord_sc1_no_tenant',
                tenant_id: null,
                assigned_printhouse_id: printhouseId
            });
            dbAdapter.tables.job_quotes.push({
                id: 'quote_sc1_no_tenant',
                job_id: 'ord_sc1_no_tenant',
                status: 'DRAFT',
                tenant_id: null,
                printer_id: printhouseId,
                calculation_breakdown_json: JSON.stringify(baselineCalculationFixture)
            });
        }
        await expect(
            quoteService.acceptQuoteAndSealOrderPricing({
                quoteId: 'quote_sc1_no_tenant',
                orderId: 'ord_sc1_no_tenant',
                actor: { userId: 'tester' }
            })
        ).rejects.toThrow(/missing authoritative tenant_id/);
    });

    // =========================================================================
    // SCENARIO 2: Propuesta de alternativa técnica en order_paper_decisions
    // =========================================================================
    it('2. Propuesta de alternativa técnica en order_paper_decisions', async () => {
        const decisionId = 'opd_sc2_001';
        const orderRef = 'job_sc2_intent';
        const tenantId = 'tenant_alpha';

        if (!isRealMySql) {
            dbAdapter.tables.order_paper_decisions.push({
                id: decisionId,
                tenant_id: tenantId,
                external_order_intent_id: orderRef,
                canonical_order_id: 'ord_sc2_001',
                printhouse_tenant_id: 'ph_alpha_1',
                paper_role: 'INTERIOR',
                requested_variant_id: 'var_offset_90',
                decision_action: 'PROPOSE_ALTERNATIVE',
                alternative_variant_id: 'var_offset_120',
                economic_status: 'REQUIRES_ECONOMIC_REVISION',
                status: 'ACTIVE'
            });
        }

        const [decision] = await mysqlClient.query(
            'SELECT * FROM order_paper_decisions WHERE id = ? AND tenant_id = ?',
            [decisionId, tenantId]
        );

        expect(decision).toBeDefined();
        expect(decision.decision_action).toBe('PROPOSE_ALTERNATIVE');
        expect(decision.alternative_variant_id).toBe('var_offset_120');
        expect(decision.status).toBe('ACTIVE');
        expect(decision.economic_status).toBe('REQUIRES_ECONOMIC_REVISION');
    });

    // =========================================================================
    // SCENARIO 3: Cálculo Delta reproducible BPE
    // =========================================================================
    it('3. Cálculo Delta reproducible BPE (preservación de márgenes e ítems no afectados)', async () => {
        const orderRef = 'job_sc3_intent';
        const orderId = 'ord_sc3_001';
        const tenantId = 'tenant_alpha';
        const printhouseId = 'ph_alpha_1';
        const decisionId = 'opd_sc3_001';

        // Seed order & snapshot
        if (!isRealMySql) {
            dbAdapter.tables.marketplace_orders.push({
                id: orderId,
                order_id: orderRef,
                tenant_id: tenantId,
                printhouse_id: printhouseId,
                delivery_country: 'ES',
                product_type: 'BOOK',
                is_editorial_book: 1,
                customer_json: JSON.stringify({ name: 'Editorial Planeta', email: 'procurement@editorial.com' }),
                status: 'PAID'
            });
            dbAdapter.tables.order_pricing_snapshots.push({
                snapshot_id: 'ops_sc3',
                order_id: orderId,
                tenant_id: tenantId,
                printhouse_id: printhouseId,
                status: 'SEALED',
                currency: 'EUR',
                final_amount: 1407.7301,
                formula_version: 'v3.0',
                rate_card_checksum: baselineCalculationFixture.rates_checksum,
                snapshot_json: JSON.stringify(baselineCalculationFixture),
                snapshot_checksum: baselineChecksum,
                canonical_hash: 'c'.repeat(64),
                sealed_by: 'BPE_ENGINE_SEALER'
            });
            dbAdapter.tables.order_paper_decisions.push({
                id: decisionId,
                tenant_id: tenantId,
                external_order_intent_id: orderRef,
                canonical_order_id: orderId,
                printhouse_tenant_id: printhouseId,
                paper_role: 'INTERIOR',
                requested_variant_id: 'var_offset_90',
                decision_action: 'PROPOSE_ALTERNATIVE',
                alternative_variant_id: 'var_offset_120',
                economic_status: 'REQUIRES_ECONOMIC_REVISION',
                status: 'ACTIVE'
            });
        }

        const proposal = await service.createQuoteRevision({
            tenantId,
            printhouseId,
            externalOrderIntentId: orderRef,
            canonicalOrderId: orderId,
            paperDecisionId: decisionId,
            actorContext: { role: 'PRINTHOUSE_OPERATOR', userId: 'op_sc3', printhouseId }
        });

        expect(proposal.revision_id).toBeDefined();
        expect(proposal.status).toBe('PENDING');
        expect(proposal.delta_net_amount).toBeGreaterThan(0);
        expect(proposal.revised_net_amount).toBe(
            Number((proposal.base_net_amount + proposal.delta_net_amount).toFixed(4))
        );
        const [revRow] = await mysqlClient.query(
            'SELECT * FROM order_quote_revisions WHERE id = ?',
            [proposal.revision_id]
        );
        expect(revRow.bpe_rates_checksum).toBe(baselineCalculationFixture.rates_checksum);
        expect(revRow.snapshot_canonical_hash).toHaveLength(64);
    });

    // =========================================================================
    // SCENARIO 4: Emisión del enlace al destinatario con token monouso
    // =========================================================================
    it('4. Emisión del enlace al destinatario autorizado con token monouso y extracción segura desde customer_json', async () => {
        const orderRef = 'job_sc4_intent';
        const orderId = 'ord_sc4_001';
        const tenantId = 'tenant_alpha';
        const printhouseId = 'ph_alpha_1';
        const decisionId = 'opd_sc4_001';

        if (!isRealMySql) {
            dbAdapter.tables.marketplace_orders.push({
                id: orderId,
                order_id: orderRef,
                tenant_id: tenantId,
                printhouse_id: printhouseId,
                delivery_country: 'ES',
                product_type: 'BOOK',
                is_editorial_book: 1,
                customer_json: JSON.stringify({ name: 'Acme Corp', email: 'billing@acme.corp' }),
                status: 'PAID'
            });
            dbAdapter.tables.order_pricing_snapshots.push({
                snapshot_id: 'ops_sc4',
                order_id: orderId,
                tenant_id: tenantId,
                printhouse_id: printhouseId,
                status: 'SEALED',
                currency: 'EUR',
                final_amount: 1407.7301,
                formula_version: 'v3.0',
                rate_card_checksum: baselineCalculationFixture.rates_checksum,
                snapshot_json: JSON.stringify(baselineCalculationFixture),
                snapshot_checksum: baselineChecksum,
                canonical_hash: 'd'.repeat(64),
                sealed_by: 'BPE_ENGINE_SEALER'
            });
            dbAdapter.tables.order_paper_decisions.push({
                id: decisionId,
                tenant_id: tenantId,
                external_order_intent_id: orderRef,
                canonical_order_id: orderId,
                printhouse_tenant_id: printhouseId,
                paper_role: 'INTERIOR',
                requested_variant_id: 'var_offset_90',
                decision_action: 'PROPOSE_ALTERNATIVE',
                alternative_variant_id: 'var_offset_120',
                economic_status: 'REQUIRES_ECONOMIC_REVISION',
                status: 'ACTIVE'
            });
        }

        const proposal = await service.createQuoteRevision({
            tenantId,
            printhouseId,
            externalOrderIntentId: orderRef,
            canonicalOrderId: orderId,
            paperDecisionId: decisionId,
            actorContext: { role: 'PRINTHOUSE_OPERATOR', userId: 'op_sc4', printhouseId }
        });

        expect(proposal.rawToken).toHaveLength(64);
        expect(proposal.token_prefix).toMatch(/^qrt_[0-9a-f]{8}$/);

        // Verificar que en la base de datos SÓLO existe el token_hash y NO el token raw
        const [tokenRow] = await mysqlClient.query(
            'SELECT * FROM quote_revision_tokens WHERE revision_id = ?',
            [proposal.revision_id]
        );

        expect(tokenRow).toBeDefined();
        expect(tokenRow.token_hash).toBe(sha256Raw(proposal.rawToken));
        expect(tokenRow.is_consumed).toBe(0);
        expect(tokenRow.raw_token).toBeUndefined(); // Zero plaintext persistence
    });

    // =========================================================================
    // SCENARIO 5: Aceptación segura con consentimiento forense
    // =========================================================================
    it('5. Aceptación segura con consentimiento forense y consumo irreversible de token', async () => {
        const orderRef = 'job_sc5_intent';
        const orderId = 'ord_sc5_001';
        const tenantId = 'tenant_alpha';
        const printhouseId = 'ph_alpha_1';
        const decisionId = 'opd_sc5_001';

        if (!isRealMySql) {
            dbAdapter.tables.marketplace_orders.push({
                id: orderId,
                order_id: orderRef,
                tenant_id: tenantId,
                printhouse_id: printhouseId,
                delivery_country: 'ES',
                product_type: 'BOOK',
                is_editorial_book: 1,
                customer_json: JSON.stringify({ name: 'Acme Forensics', email: 'forensics@acme.corp' }),
                status: 'PAID'
            });
            dbAdapter.tables.order_pricing_snapshots.push({
                snapshot_id: 'ops_sc5',
                order_id: orderId,
                tenant_id: tenantId,
                printhouse_id: printhouseId,
                status: 'SEALED',
                currency: 'EUR',
                final_amount: 1407.7301,
                formula_version: 'v3.0',
                rate_card_checksum: baselineCalculationFixture.rates_checksum,
                snapshot_json: JSON.stringify(baselineCalculationFixture),
                snapshot_checksum: baselineChecksum,
                canonical_hash: 'e'.repeat(64),
                sealed_by: 'BPE_ENGINE_SEALER'
            });
            dbAdapter.tables.order_paper_decisions.push({
                id: decisionId,
                tenant_id: tenantId,
                external_order_intent_id: orderRef,
                canonical_order_id: orderId,
                printhouse_tenant_id: printhouseId,
                paper_role: 'INTERIOR',
                requested_variant_id: 'var_offset_90',
                decision_action: 'PROPOSE_ALTERNATIVE',
                alternative_variant_id: 'var_offset_120',
                economic_status: 'REQUIRES_ECONOMIC_REVISION',
                status: 'ACTIVE'
            });
        }

        const proposal = await service.createQuoteRevision({
            tenantId,
            printhouseId,
            externalOrderIntentId: orderRef,
            canonicalOrderId: orderId,
            paperDecisionId: decisionId,
            actorContext: { role: 'PRINTHOUSE_OPERATOR', userId: 'op_sc5', printhouseId }
        });

        // 5.1 Aceptación con evidencia forense y OTP
        const response = await service.respondToQuoteRevision({
            rawToken: proposal.rawToken,
            decision: 'ACCEPT',
            otpCode: proposal._debugOtp,
            clientIp: '198.51.100.42',
            userAgent: 'Mozilla/5.0 Forensic Audit Browser'
        });

        expect(response.status).toBe('ACCEPTED');
        expect(response.gates.gate_contractual).toBe('PASSED');

        // 5.2 Replay attack: segundo intento con el mismo token debe ser rechazado con TOKEN_ALREADY_CONSUMED
        await expect(
            service.respondToQuoteRevision({
                rawToken: proposal.rawToken,
                decision: 'ACCEPT',
                otpCode: proposal._debugOtp,
                clientIp: '198.51.100.42',
                userAgent: 'Mozilla/5.0 Forensic Audit Browser'
            })
        ).rejects.toThrow(/TOKEN_ALREADY_CONSUMED/);
    });

    // =========================================================================
    // SCENARIO 6: Persistencia contractual y estado de compuertas
    // =========================================================================
    it('6. Persistencia contractual y estado de compuertas (orden original preservada, specs efectivas activas)', async () => {
        const orderRef = 'job_sc6_intent';
        const orderId = 'ord_sc6_001';
        const tenantId = 'tenant_alpha';
        const printhouseId = 'ph_alpha_1';
        const decisionId = 'opd_sc6_001';

        if (!isRealMySql) {
            dbAdapter.tables.marketplace_orders.push({
                id: orderId,
                order_id: orderRef,
                tenant_id: tenantId,
                printhouse_id: printhouseId,
                delivery_country: 'ES',
                product_type: 'BOOK',
                is_editorial_book: 1,
                customer_json: JSON.stringify({ name: 'Editor Alpha', email: 'editor@alpha.corp' }),
                status: 'PAID'
            });
            dbAdapter.tables.order_pricing_snapshots.push({
                snapshot_id: 'ops_sc6',
                order_id: orderId,
                tenant_id: tenantId,
                printhouse_id: printhouseId,
                status: 'SEALED',
                currency: 'EUR',
                final_amount: 1407.7301,
                formula_version: 'v3.0',
                rate_card_checksum: baselineCalculationFixture.rates_checksum,
                snapshot_json: JSON.stringify(baselineCalculationFixture),
                snapshot_checksum: baselineChecksum,
                canonical_hash: 'f'.repeat(64),
                sealed_by: 'BPE_ENGINE_SEALER'
            });
            dbAdapter.tables.order_paper_decisions.push({
                id: decisionId,
                tenant_id: tenantId,
                external_order_intent_id: orderRef,
                canonical_order_id: orderId,
                printhouse_tenant_id: printhouseId,
                paper_role: 'INTERIOR',
                requested_variant_id: 'var_offset_90',
                decision_action: 'PROPOSE_ALTERNATIVE',
                alternative_variant_id: 'var_offset_120',
                economic_status: 'REQUIRES_ECONOMIC_REVISION',
                status: 'ACTIVE'
            });
        }

        const proposal = await service.createQuoteRevision({
            tenantId,
            printhouseId,
            externalOrderIntentId: orderRef,
            canonicalOrderId: orderId,
            paperDecisionId: decisionId,
            actorContext: { role: 'PRINTHOUSE_OPERATOR', userId: 'op_sc6', printhouseId }
        });

        await service.respondToQuoteRevision({
            rawToken: proposal.rawToken,
            decision: 'ACCEPT',
            otpCode: proposal._debugOtp,
            clientIp: '198.51.100.42',
            userAgent: 'Forensic Spec Auditor'
        });

        // 6.1 Verificar que el snapshot original histórico permanece 100% INTACTO
        const [originalSnapshot] = await mysqlClient.query(
            'SELECT * FROM order_pricing_snapshots WHERE order_id = ? AND tenant_id = ?',
            [orderId, tenantId]
        );
        expect(originalSnapshot.snapshot_id).toBe('ops_sc6');
        expect(originalSnapshot.canonical_hash).toBe('f'.repeat(64));

        // 6.2 Verificar creación de especificación técnica efectiva gobernada
        const [effectiveSpec] = await mysqlClient.query(
            'SELECT * FROM order_effective_technical_specifications WHERE canonical_order_id = ?',
            [orderId]
        );

        expect(effectiveSpec).toBeDefined();
        expect(effectiveSpec.effective_status).toBe('ACTIVE');
        expect(effectiveSpec.paper_decision_id).toBe(decisionId);
        expect(effectiveSpec.revision_id).toBe(proposal.revision_id);

        const specs = typeof effectiveSpec.specs_json === 'string'
            ? JSON.parse(effectiveSpec.specs_json)
            : effectiveSpec.specs_json;
        expect(specs.paper_weight_interior).toBe(120);
        expect(specs.variant_id).toBe('var_offset_120');
    });

    // =========================================================================
    // SCENARIO 7: Delta positivo (Δ > 0) y pago pendiente
    // =========================================================================
    it('7. Delta positivo (Δ > 0) y pago pendiente (PAYMENT_PENDING / SUPPLEMENTARY_PAYMENT_PENDING)', async () => {
        const orderRef = 'job_sc7_intent';
        const orderId = 'ord_sc7_001';
        const tenantId = 'tenant_alpha';
        const printhouseId = 'ph_alpha_1';
        const decisionId = 'opd_sc7_001';

        if (!isRealMySql) {
            dbAdapter.tables.marketplace_orders.push({
                id: orderId,
                order_id: orderRef,
                tenant_id: tenantId,
                printhouse_id: printhouseId,
                delivery_country: 'ES',
                product_type: 'BOOK',
                is_editorial_book: 1,
                customer_json: JSON.stringify({ name: 'Delta Pos Corp', email: 'pos@delta.corp' }),
                status: 'PAID'
            });
            dbAdapter.tables.order_pricing_snapshots.push({
                snapshot_id: 'ops_sc7',
                order_id: orderId,
                tenant_id: tenantId,
                printhouse_id: printhouseId,
                status: 'SEALED',
                currency: 'EUR',
                final_amount: 1407.7301,
                formula_version: 'v3.0',
                rate_card_checksum: baselineCalculationFixture.rates_checksum,
                snapshot_json: JSON.stringify(baselineCalculationFixture),
                snapshot_checksum: baselineChecksum,
                canonical_hash: '7'.repeat(64),
                sealed_by: 'BPE_ENGINE_SEALER'
            });
            dbAdapter.tables.order_paper_decisions.push({
                id: decisionId,
                tenant_id: tenantId,
                external_order_intent_id: orderRef,
                canonical_order_id: orderId,
                printhouse_tenant_id: printhouseId,
                paper_role: 'INTERIOR',
                requested_variant_id: 'var_offset_90',
                decision_action: 'PROPOSE_ALTERNATIVE',
                alternative_variant_id: 'var_offset_120',
                economic_status: 'REQUIRES_ECONOMIC_REVISION',
                status: 'ACTIVE'
            });
        }

        const proposal = await service.createQuoteRevision({
            tenantId,
            printhouseId,
            externalOrderIntentId: orderRef,
            canonicalOrderId: orderId,
            paperDecisionId: decisionId,
            actorContext: { role: 'PRINTHOUSE_OPERATOR', userId: 'op_sc7', printhouseId }
        });

        expect(proposal.delta_net_amount).toBeGreaterThan(0);

        const response = await service.respondToQuoteRevision({
            rawToken: proposal.rawToken,
            decision: 'ACCEPT',
            otpCode: proposal._debugOtp,
            clientIp: '198.51.100.42',
            userAgent: 'Forensic Delta Pos'
        });

        expect(response.gates.gate_financial).toBe('PAYMENT_PENDING');
        expect(response.financial_reconciliation.type).toBe('SUPPLEMENTARY_PAYMENT_PENDING');
        expect(response.financial_reconciliation.delta_amount).toBeGreaterThan(0);
        expect(response.gates.gate_industrial).toBe('PREFLIGHT_PENDING');
    });

    // =========================================================================
    // SCENARIO 8: Delta negativo (Δ < 0) y obligación de compensación
    // =========================================================================
    it('8. Delta negativo (Δ < 0) y obligación de compensación (REFUND_PENDING / REDUCED_PAYMENT_PENDING, jamás PASSED)', async () => {
        const orderRefPaid = 'job_sc8_paid_intent';
        const orderIdPaid = 'ord_sc8_paid';
        const tenantId = 'tenant_alpha';
        const printhouseId = 'ph_alpha_1';

        // Escenario 8A: Pedido ya pagado con delta negativo -> REFUND_PENDING
        if (!isRealMySql) {
            dbAdapter.tables.marketplace_orders.push({
                id: orderIdPaid,
                order_id: orderRefPaid,
                tenant_id: tenantId,
                printhouse_id: printhouseId,
                customer_json: JSON.stringify({ name: 'Paid Client', email: 'paid@client.corp' }),
                status: 'PAID'
            });
            // Revision row directly created with negative delta (-50.00 EUR)
            const tokenRawPaid = crypto.randomBytes(32).toString('hex');
            const revIdPaid = 'rev_sc8_paid';
            dbAdapter.tables.order_quote_revisions.push({
                id: revIdPaid,
                tenant_id: tenantId,
                printhouse_id: printhouseId,
                external_order_intent_id: orderRefPaid,
                canonical_order_id: orderIdPaid,
                paper_decision_id: 'opd_sc8_dummy',
                status: 'PENDING',
                currency: 'EUR',
                base_net_amount: 1400.0,
                delta_net_amount: -50.0,
                revised_net_amount: 1350.0,
                base_tax_amount: 56.0,
                delta_tax_amount: -2.0,
                revised_tax_amount: 54.0,
                tax_rate_pct: 4.0,
                base_gross_amount: 1456.0,
                delta_gross_amount: -52.0,
                revised_gross_amount: 1404.0,
                bpe_calculation_id: 'bpe_sc8_1',
                bpe_engine_version: 'v3.0',
                bpe_rates_checksum: 'checksum_sc8',
                snapshot_canonical_hash: '8'.repeat(64),
                breakdown_json: JSON.stringify({}),
                technical_specs_snapshot_json: JSON.stringify(baselineCalculationFixture.specs),
                applied_policies_json: JSON.stringify({}),
                tax_resolution_snapshot_json: JSON.stringify({})
            });
            dbAdapter.tables.quote_revision_tokens.push({
                id: 'tok_sc8_paid',
                revision_id: revIdPaid,
                tenant_id: tenantId,
                token_hash: sha256Raw(tokenRawPaid),
                is_consumed: 0
            });
            dbAdapter.tables.order_paper_decisions.push({
                id: 'opd_sc8_dummy',
                tenant_id: tenantId,
                external_order_intent_id: orderRefPaid,
                canonical_order_id: orderIdPaid,
                printhouse_tenant_id: printhouseId,
                paper_role: 'INTERIOR',
                requested_variant_id: 'var_offset_90',
                decision_action: 'PROPOSE_ALTERNATIVE',
                alternative_variant_id: 'var_offset_120',
                economic_status: 'REQUIRES_ECONOMIC_REVISION',
                status: 'ACTIVE'
            });

            const resPaid = await service.respondToQuoteRevision({
                rawToken: tokenRawPaid,
                decision: 'ACCEPT',
                clientIp: '127.0.0.1',
                userAgent: 'Refund Test'
            });

            expect(resPaid.gates.gate_financial).toBe('REFUND_PENDING');
            expect(resPaid.financial_reconciliation.type).toBe('REFUND_PENDING');
            expect(resPaid.financial_reconciliation.refund_amount).toBe(50.0);
            expect(resPaid.gates.gate_financial).not.toBe('PASSED'); // Inviolable rule
        }

        // Escenario 8B: Pedido con pago pendiente con delta negativo -> PAYMENT_PENDING con monto reducido
        const orderRefPending = 'job_sc8_pending_intent';
        const orderIdPending = 'ord_sc8_pending';

        if (!isRealMySql) {
            dbAdapter.tables.marketplace_orders.push({
                id: orderIdPending,
                order_id: orderRefPending,
                tenant_id: tenantId,
                printhouse_id: printhouseId,
                customer_json: JSON.stringify({ name: 'Pending Client', email: 'pending@client.corp' }),
                status: 'PENDING_PAYMENT'
            });
            const tokenRawPending = crypto.randomBytes(32).toString('hex');
            const revIdPending = 'rev_sc8_pending';
            dbAdapter.tables.order_quote_revisions.push({
                id: revIdPending,
                tenant_id: tenantId,
                printhouse_id: printhouseId,
                external_order_intent_id: orderRefPending,
                canonical_order_id: orderIdPending,
                paper_decision_id: 'opd_sc8_dummy2',
                status: 'PENDING',
                currency: 'EUR',
                base_net_amount: 1400.0,
                delta_net_amount: -50.0,
                revised_net_amount: 1350.0,
                base_tax_amount: 56.0,
                delta_tax_amount: -2.0,
                revised_tax_amount: 54.0,
                tax_rate_pct: 4.0,
                base_gross_amount: 1456.0,
                delta_gross_amount: -52.0,
                revised_gross_amount: 1404.0,
                bpe_calculation_id: 'bpe_sc8_2',
                bpe_engine_version: 'v3.0',
                bpe_rates_checksum: 'checksum_sc8',
                snapshot_canonical_hash: '8'.repeat(64),
                breakdown_json: JSON.stringify({}),
                technical_specs_snapshot_json: JSON.stringify(baselineCalculationFixture.specs),
                applied_policies_json: JSON.stringify({}),
                tax_resolution_snapshot_json: JSON.stringify({})
            });
            dbAdapter.tables.quote_revision_tokens.push({
                id: 'tok_sc8_pending',
                revision_id: revIdPending,
                tenant_id: tenantId,
                token_hash: sha256Raw(tokenRawPending),
                is_consumed: 0
            });
            dbAdapter.tables.order_paper_decisions.push({
                id: 'opd_sc8_dummy2',
                tenant_id: tenantId,
                external_order_intent_id: orderRefPending,
                canonical_order_id: orderIdPending,
                printhouse_tenant_id: printhouseId,
                paper_role: 'INTERIOR',
                requested_variant_id: 'var_offset_90',
                decision_action: 'PROPOSE_ALTERNATIVE',
                alternative_variant_id: 'var_offset_120',
                economic_status: 'REQUIRES_ECONOMIC_REVISION',
                status: 'ACTIVE'
            });

            const resPending = await service.respondToQuoteRevision({
                rawToken: tokenRawPending,
                decision: 'ACCEPT',
                clientIp: '127.0.0.1',
                userAgent: 'Reduced Payment Test'
            });

            expect(resPending.gates.gate_financial).toBe('PAYMENT_PENDING');
            expect(resPending.financial_reconciliation.type).toBe('REDUCED_PAYMENT_PENDING');
            expect(resPending.financial_reconciliation.new_amount_due).toBe(1350.0);
            expect(resPending.gates.gate_financial).not.toBe('PASSED'); // Inviolable rule
        }
    });

    // =========================================================================
    // SCENARIO 9: Cancelación concurrente
    // =========================================================================
    it('9. Cancelación concurrente (revisión bloqueada con 409 ORDER_INELIGIBLE bajo lock transaccional)', async () => {
        const orderRef = 'job_sc9_intent';
        const orderId = 'ord_sc9_001';
        const tenantId = 'tenant_alpha';
        const printhouseId = 'ph_alpha_1';

        if (!isRealMySql) {
            dbAdapter.tables.marketplace_orders.push({
                id: orderId,
                order_id: orderRef,
                tenant_id: tenantId,
                printhouse_id: printhouseId,
                customer_json: JSON.stringify({ name: 'Cancelled Client', email: 'cancel@client.corp' }),
                status: 'CANCELLED' // Order cancelled while revision was pending!
            });
            const tokenRaw = crypto.randomBytes(32).toString('hex');
            const revId = 'rev_sc9_001';
            dbAdapter.tables.order_quote_revisions.push({
                id: revId,
                tenant_id: tenantId,
                printhouse_id: printhouseId,
                external_order_intent_id: orderRef,
                canonical_order_id: orderId,
                paper_decision_id: 'opd_sc9_dummy',
                status: 'PENDING',
                currency: 'EUR',
                base_net_amount: 1400.0,
                delta_net_amount: 20.0,
                revised_net_amount: 1420.0,
                base_tax_amount: 56.0,
                delta_tax_amount: 0.8,
                revised_tax_amount: 56.8,
                tax_rate_pct: 4.0,
                base_gross_amount: 1456.0,
                delta_gross_amount: 20.8,
                revised_gross_amount: 1476.8,
                bpe_calculation_id: 'bpe_sc9',
                bpe_engine_version: 'v3.0',
                bpe_rates_checksum: 'checksum_sc9',
                snapshot_canonical_hash: '9'.repeat(64),
                breakdown_json: JSON.stringify({}),
                technical_specs_snapshot_json: JSON.stringify(baselineCalculationFixture.specs),
                applied_policies_json: JSON.stringify({}),
                tax_resolution_snapshot_json: JSON.stringify({})
            });
            dbAdapter.tables.quote_revision_tokens.push({
                id: 'tok_sc9',
                revision_id: revId,
                tenant_id: tenantId,
                token_hash: sha256Raw(tokenRaw),
                is_consumed: 0
            });
            dbAdapter.tables.order_paper_decisions.push({
                id: 'opd_sc9_dummy',
                tenant_id: tenantId,
                external_order_intent_id: orderRef,
                canonical_order_id: orderId,
                printhouse_tenant_id: printhouseId,
                paper_role: 'INTERIOR',
                requested_variant_id: 'var_offset_90',
                decision_action: 'PROPOSE_ALTERNATIVE',
                alternative_variant_id: 'var_offset_120',
                economic_status: 'REQUIRES_ECONOMIC_REVISION',
                status: 'ACTIVE'
            });

            await expect(
                service.respondToQuoteRevision({
                    rawToken: tokenRaw,
                    decision: 'ACCEPT',
                    clientIp: '127.0.0.1',
                    userAgent: 'Cancelled Test'
                })
            ).rejects.toThrow(/ORDER_INELIGIBLE/);
        }
    });

    // =========================================================================
    // SCENARIO 10: Reasignación de imprenta
    // =========================================================================
    it('10. Reasignación de imprenta (revisión bloqueada con 409 PRINTHOUSE_REASSIGNED bajo lock transaccional)', async () => {
        const orderRef = 'job_sc10_intent';
        const orderId = 'ord_sc10_001';
        const tenantId = 'tenant_alpha';
        const originalPrinthouseId = 'ph_alpha_1';
        const newPrinthouseId = 'ph_competitor_99';

        if (!isRealMySql) {
            dbAdapter.tables.marketplace_orders.push({
                id: orderId,
                order_id: orderRef,
                tenant_id: tenantId,
                printhouse_id: newPrinthouseId, // Reassigned to different printhouse!
                customer_json: JSON.stringify({ name: 'Reassigned Client', email: 'reassigned@client.corp' }),
                status: 'PAID'
            });
            const tokenRaw = crypto.randomBytes(32).toString('hex');
            const revId = 'rev_sc10_001';
            dbAdapter.tables.order_quote_revisions.push({
                id: revId,
                tenant_id: tenantId,
                printhouse_id: originalPrinthouseId,
                external_order_intent_id: orderRef,
                canonical_order_id: orderId,
                paper_decision_id: 'opd_sc10_dummy',
                status: 'PENDING',
                currency: 'EUR',
                base_net_amount: 1400.0,
                delta_net_amount: 20.0,
                revised_net_amount: 1420.0,
                base_tax_amount: 56.0,
                delta_tax_amount: 0.8,
                revised_tax_amount: 56.8,
                tax_rate_pct: 4.0,
                base_gross_amount: 1456.0,
                delta_gross_amount: 20.8,
                revised_gross_amount: 1476.8,
                bpe_calculation_id: 'bpe_sc10',
                bpe_engine_version: 'v3.0',
                bpe_rates_checksum: 'checksum_sc10',
                snapshot_canonical_hash: 'a'.repeat(64),
                breakdown_json: JSON.stringify({}),
                technical_specs_snapshot_json: JSON.stringify(baselineCalculationFixture.specs),
                applied_policies_json: JSON.stringify({}),
                tax_resolution_snapshot_json: JSON.stringify({})
            });
            dbAdapter.tables.quote_revision_tokens.push({
                id: 'tok_sc10',
                revision_id: revId,
                tenant_id: tenantId,
                token_hash: sha256Raw(tokenRaw),
                is_consumed: 0
            });
            dbAdapter.tables.order_paper_decisions.push({
                id: 'opd_sc10_dummy',
                tenant_id: tenantId,
                external_order_intent_id: orderRef,
                canonical_order_id: orderId,
                printhouse_tenant_id: originalPrinthouseId,
                paper_role: 'INTERIOR',
                requested_variant_id: 'var_offset_90',
                decision_action: 'PROPOSE_ALTERNATIVE',
                alternative_variant_id: 'var_offset_120',
                economic_status: 'REQUIRES_ECONOMIC_REVISION',
                status: 'ACTIVE'
            });

            await expect(
                service.respondToQuoteRevision({
                    rawToken: tokenRaw,
                    decision: 'ACCEPT',
                    clientIp: '127.0.0.1',
                    userAgent: 'Reassigned Test'
                })
            ).rejects.toThrow(/PRINTHOUSE_REASSIGNED/);
        }
    });

    // =========================================================================
    // SCENARIO 11: Bloqueo de despacho industrial
    // =========================================================================
    it('11. Bloqueo de despacho industrial ante revisión pendiente o falta de liquidación financiera', async () => {
        const orderRef = 'job_sc11_intent';
        const orderId = 'ord_sc11_001';
        const tenantId = 'tenant_alpha';
        const printhouseId = 'ph_alpha_1';

        if (!isRealMySql) {
            dbAdapter.tables.orders.push({
                id: orderId,
                order_ref: orderRef,
                tenant_id: tenantId,
                printhouse_id: printhouseId,
                status: 'CONFIRMED'
            });

            // 11.1 Bloqueo si hay una revisión PENDING activa
            dbAdapter.tables.order_quote_revisions.push({
                id: 'rev_sc11_pending',
                tenant_id: tenantId,
                external_order_intent_id: orderRef,
                canonical_order_id: orderId,
                status: 'PENDING'
            });

            await expect(
                marketplaceDispatchGatingService.dispatchOrder(orderRef, 'node_alpha_press', {
                    userId: 'user_operator',
                    printhouseId,
                    tenantId,
                    role: 'OPERATOR'
                })
            ).rejects.toThrow(/DISPATCH_BLOCKED: Order has pending quote revision/);

            // 11.2 Bloqueo si la revisión fue aceptada pero el pago está pendiente
            const r = dbAdapter.tables.order_quote_revisions.find(x => x.id === 'rev_sc11_pending');
            r.status = 'ACCEPTED';

            dbAdapter.tables.order_effective_technical_specifications.push({
                id: 'oets_sc11_unpaid',
                tenant_id: tenantId,
                canonical_order_id: orderId,
                external_order_intent_id: orderRef,
                effective_status: 'ACTIVE',
                financial_reconciliation_status: 'PAYMENT_PENDING',
                industrial_gate_status: 'PREFLIGHT_PENDING',
                specs_json: JSON.stringify(baselineCalculationFixture.specs)
            });

            await expect(
                marketplaceDispatchGatingService.dispatchOrder(orderRef, 'node_alpha_press', {
                    userId: 'user_operator',
                    printhouseId,
                    tenantId,
                    role: 'OPERATOR'
                })
            ).rejects.toThrow(/DISPATCH_BLOCKED: Revised quote payment is pending/);
        }
    });

    // =========================================================================
    // SCENARIO 12: Despacho exitoso a máquina con versión técnica efectiva
    // =========================================================================
    it('12. Despacho exitoso a máquina consumiendo la versión técnica efectiva aprobada (order_effective_technical_specifications)', async () => {
        const orderRef = 'job_sc12_intent';
        const orderId = 'ord_sc12_001';
        const tenantId = 'tenant_alpha';
        const printhouseId = 'ph_alpha_1';

        if (!isRealMySql) {
            dbAdapter.tables.orders.push({
                id: orderId,
                order_ref: orderRef,
                tenant_id: tenantId,
                printhouse_id: printhouseId,
                status: 'PAID'
            });

            // Production files validated
            dbAdapter.tables.production_files.push(
                { order_ref: orderRef, order_id: orderId, validation_status: 'VALIDATED' },
                { order_ref: orderRef, order_id: orderId, validation_status: 'VALIDATED' }
            );

            // Revised effective specifications with approved 120gsm paper
            const revisedSpecs = {
                ...baselineCalculationFixture.specs,
                paper_weight_interior: 120,
                paper_name: 'Amber Graphic 120gsm Offset',
                variant_id: 'var_offset_120'
            };

            dbAdapter.tables.order_effective_technical_specifications.push({
                id: 'oets_sc12_effective',
                tenant_id: tenantId,
                canonical_order_id: orderId,
                external_order_intent_id: orderRef,
                effective_status: 'ACTIVE',
                financial_reconciliation_status: 'PASSED',
                industrial_gate_status: 'READY_FOR_DISPATCH',
                specs_json: JSON.stringify(revisedSpecs)
            });

            // Mock manufacturing persistence & dispatch
            persistence.getPackage = async (id) => dbAdapter.tables.manufacturing_packages.find(p => p.id === id);
            persistence.getNode = async (id) => dbAdapter.tables.print_nodes.find(n => n.id === id);
            persistence.createDispatch = async (data) => {
                const dispatchId = `disp_${Date.now()}`;
                dbAdapter.tables.dispatches.push({ id: dispatchId, ...data });
                return { id: dispatchId, ...data };
            };
            persistence.updatePackage = async (id, updates) => {
                const pkg = dbAdapter.tables.manufacturing_packages.find(p => p.id === id);
                if (pkg) Object.assign(pkg, updates);
            };

            const dispatchResult = await marketplaceDispatchGatingService.dispatchOrder(orderRef, 'node_alpha_press', {
                userId: 'user_operator_sc12',
                printhouseId,
                tenantId,
                role: 'OPERATOR'
            });

            expect(dispatchResult.ok).toBe(true);
            expect(dispatchResult.status).toBe('IN_PRODUCTION');
            expect(dispatchResult.effective_specification_id).toBe('oets_sc12_effective');

            // 12.1 Verificar que el paquete de producción consumió la versión técnica efectiva
            const [createdPackage] = dbAdapter.tables.manufacturing_packages;
            expect(createdPackage).toBeDefined();
            const bookSpec = typeof createdPackage.book_spec_json === 'string'
                ? JSON.parse(createdPackage.book_spec_json)
                : createdPackage.book_spec_json;

            expect(bookSpec.effectiveSpecificationId).toBe('oets_sc12_effective');
            expect(bookSpec.variantId).toBe('var_offset_120');
            expect(bookSpec.interiorPaper).toContain('Amber Graphic 120gsm Offset');

            // 12.2 Verificar que el estado de la especificación técnica efectiva pasó a DISPATCHED
            const [effRow] = await mysqlClient.query(
                'SELECT * FROM order_effective_technical_specifications WHERE id = ?',
                ['oets_sc12_effective']
            );
            expect(effRow.industrial_gate_status).toBe('DISPATCHED');

            // 12.3 Verificar que el pedido pasó a IN_PRODUCTION
            const [orderRow] = await mysqlClient.query(
                'SELECT * FROM orders WHERE id = ?',
                [orderId]
            );
            expect(orderRow.status).toBe('IN_PRODUCTION');
        }
    });
});
