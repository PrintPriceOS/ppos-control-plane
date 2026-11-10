import { describe, it, expect, beforeEach } from 'vitest';
const jwt = require('jsonwebtoken');

const JWT_SECRET = 'test_secret_for_supplier_hub_multi_tenant';
const JWT_AUDIENCE = 'ppos:control';
const JWT_ISSUER = 'https://auth.printprice.pro';

process.env.JWT_SECRET = JWT_SECRET;
process.env.JWT_AUDIENCE = JWT_AUDIENCE;
process.env.JWT_ISSUER = JWT_ISSUER;
process.env.PAPER_SUPPLIER_HUB_ENABLED = 'true';

const paperProcurementService = require('../src/api/services/paperProcurementService');
const paperCostIntegrationService = require('../src/api/services/paperCostIntegrationService');
const {
    listIndustrialMaterials,
    upsertIndustrialMaterial
} = require('../src/api/services/materials/industrialMaterialsCatalogService');
const paperSuppliersRoutes = require('../src/api/routes/paperSuppliersRoutes');

function generateToken(tenantId) {
    return jwt.sign(
        {
            sub: `admin-${tenantId}`,
            email: `admin@${tenantId}.local`,
            role: 'SUPER_ADMIN',
            tenant_id: tenantId,
            printhouse_id: `ph-${tenantId}`
        },
        JWT_SECRET,
        { audience: JWT_AUDIENCE, issuer: JWT_ISSUER }
    );
}

function dispatchRoute(method, url, tenantId, body = null, query = {}) {
    const req = {
        method,
        url,
        path: url.split('?')[0],
        query,
        params: {},
        headers: {
            authorization: `Bearer ${generateToken(tenantId)}`,
            'x-tenant-id': tenantId
        },
        body: body || {}
    };

    return new Promise((resolve) => {
        let isResolved = false;
        const res = {
            statusCode: null,
            headers: {},
            body: null,
            status(code) {
                this.statusCode = code;
                return this;
            },
            json(data) {
                if (this.statusCode === null) this.statusCode = 200;
                this.body = data;
                if (!isResolved) {
                    isResolved = true;
                    resolve(this);
                }
                return this;
            },
            send(data) {
                if (this.statusCode === null) this.statusCode = 200;
                this.body = data;
                if (!isResolved) {
                    isResolved = true;
                    resolve(this);
                }
                return this;
            },
            setHeader(name, value) {
                this.headers[name] = value;
                return this;
            }
        };

        paperSuppliersRoutes(req, res, (err) => {
            if (isResolved) return;
            isResolved = true;
            if (err) {
                res.statusCode = err.statusCode || 500;
                res.body = { ok: false, error: err.message };
            }
            resolve(res);
        });
    });
}

describe('Paper Supplier Hub — Multi-Tenant Rate Agreements, Master Mapping & BPE Fallback', () => {
    const TENANT_A = 'tenant-printhouse-alpha';
    const TENANT_B = 'tenant-printhouse-bravo';

    beforeEach(() => {
        process.env.PPOS_CI_EPHEMERAL_FIXTURES = 'true';
        if (paperProcurementService._runtimeAgreementsByTenant) {
            paperProcurementService._runtimeAgreementsByTenant.clear();
        }
    });

    it('1. Enforces strict multi-tenant isolation: Tenant A cannot read Tenant B contracted paper agreements or custom material rates', async () => {
        // Tenant B ingests a confidential negotiated rate with Lecta / Torraspapel (€1.12/kg vs €1.28/kg benchmark)
        const ingestResB = await dispatchRoute('POST', '/agreements/ingest', TENANT_B, {
            supplierId: 'SUP-LECTA-TORRASPAPEL',
            agreementName: 'Tenant B Confidential Lecta Rate 2026',
            validFrom: '2026-01-01T00:00:00.000Z',
            validUntil: '2027-12-31T23:59:59.000Z',
            items: [
                {
                    vendorSku: 'LECTA-CORAL-90-B',
                    masterVariantId: 'MAT-OFFSET-CORAL-90',
                    contractedPriceEurKg: 1.12,
                    minOrderQtyKg: 1000
                }
            ]
        });

        expect(ingestResB.statusCode).toBe(201);
        expect(ingestResB.body.ok).toBe(true);
        expect(ingestResB.body.data.tenantId).toBe(TENANT_B);
        expect(ingestResB.body.data.ingestedCount).toBe(1);

        // Tenant A queries GET /api/suppliers/agreements -> MUST receive 0 items (never sees Tenant B's agreement)
        const listResA = await dispatchRoute('GET', '/agreements', TENANT_A);

        expect(listResA.statusCode).toBe(200);
        expect(listResA.body.ok).toBe(true);
        expect(listResA.body.data.tenantId).toBe(TENANT_A);
        expect(listResA.body.data.items).toHaveLength(0);

        // Tenant B queries GET /api/suppliers/agreements -> receives its own 1 agreement
        const listResB = await dispatchRoute('GET', '/agreements', TENANT_B);

        expect(listResB.statusCode).toBe(200);
        expect(listResB.body.data.items).toHaveLength(1);
        expect(listResB.body.data.items[0].contractedPriceEurKg).toBe(1.12);

        // Verify BPE resolution isolation:
        // Tenant B gets its contracted €1.12/kg rate
        const bpeRateB = await paperCostIntegrationService.resolveEffectivePaperRateForBpe(TENANT_B, {
            masterVariantId: 'MAT-OFFSET-CORAL-90',
            gsm: 90
        });
        expect(bpeRateB.rateSource).toBe('TENANT_CONTRACTED_AGREEMENT');
        expect(bpeRateB.effective_paper_cost_eur_kg).toBe(1.12);

        // Tenant A resolves the exact same substrate -> MUST fall back to Catalog Benchmark Rate (never Tenant B's €1.12/kg)
        const bpeRateA = await paperCostIntegrationService.resolveEffectivePaperRateForBpe(TENANT_A, {
            masterVariantId: 'MAT-OFFSET-CORAL-90',
            gsm: 90
        });
        expect(bpeRateA.rateSource).toBe('CATALOG_BENCHMARK_RATE');
        expect(bpeRateA.effective_paper_cost_eur_kg).toBe(1.28);

        // Also verify `listIndustrialMaterials` tenant isolation when Tenant B upserts a custom material cost
        await upsertIndustrialMaterial(
            {
                id: 'MAT-OFFSET-CORAL-90',
                name: 'Coral Book White 1.25',
                basis_weight_gsm: 90,
                bulk_volume: 1.25,
                cost_per_kg_eur: 0.99
            },
            { tenantId: TENANT_B, printhouseId: 'ph-bravo' },
            null,
            true
        );

        const catalogA = await listIndustrialMaterials({}, { tenantId: TENANT_A, printhouseId: 'ph-alpha' }, null);
        const coralForA = catalogA.materials.find((m) => m.id === 'MAT-OFFSET-CORAL-90');
        expect(coralForA).toBeDefined();
        expect(coralForA.cost_per_kg_eur).toBe(1.28);
    });

    it('2. Automatically falls back to Master Catalog Benchmark rates in BPE calculations when a tenant agreement is expired', async () => {
        // Tenant A ingests an agreement that expired in 2025
        const expiredIngest = await dispatchRoute('POST', '/agreements/ingest', TENANT_A, {
            supplierId: 'SUP-ARCTIC-PAPER',
            agreementName: '2025 Expired Munken Contract',
            validFrom: '2025-01-01T00:00:00.000Z',
            validUntil: '2025-12-31T23:59:59.000Z',
            items: [
                {
                    vendorSku: 'ARC-MUNKEN-90-EXP',
                    masterVariantId: 'MAT-MUNKEN-PRINT-WHITE-90',
                    contractedPriceEurKg: 1.05,
                    minOrderQtyKg: 500
                }
            ]
        });

        expect(expiredIngest.statusCode).toBe(201);
        expect(expiredIngest.body.data.items[0].status).toBe('EXPIRED');

        // Resolve effective rate for BPE in 2026 -> must NOT use expired €1.05/kg; must fall back to benchmark (€1.42/kg)
        const resolved = await paperCostIntegrationService.resolveEffectivePaperRateForBpe(TENANT_A, {
            masterVariantId: 'MAT-MUNKEN-PRINT-WHITE-90',
            gsm: 90,
            referenceDate: '2026-06-15T12:00:00.000Z'
        });

        expect(resolved.rateSource).toBe('CATALOG_BENCHMARK_RATE');
        expect(resolved.isFallbackBenchmark).toBe(true);
        expect(resolved.effective_paper_cost_eur_kg).toBe(1.42);

        // Also verify `buildBpePaperPatch` with `allowBenchmarkFallback: true`
        const patch = await paperCostIntegrationService.buildBpePaperPatch(TENANT_A, {
            interiorPaperType: 'cream',
            interiorGsm: 90,
            interiorMasterVariantId: 'MAT-MUNKEN-PRINT-WHITE-90',
            allowBenchmarkFallback: true,
            referenceDate: '2026-06-15T12:00:00.000Z'
        });

        expect(patch.hasResolvedInterior).toBe(true);
        expect(patch.snapshotMetadata.interior.rateSource).toBe('CATALOG_BENCHMARK_RATE');
        expect(patch.candidateOverrides.paper_price_interior_by_kilo.cream).toBe(1.42);
    });

    it('3. Validates date consistency (validUntil > validFrom), maps accurately to canonical masterVariantId, and increments version on upsert', async () => {
        // 3a. Reject invalid date range (validUntil <= validFrom)
        const badDatesRes = await dispatchRoute('POST', '/agreements/ingest', TENANT_A, {
            supplierId: 'SUP-SAPPI-EUROPE',
            agreementName: 'Invalid Date Range Contract',
            validFrom: '2026-10-01T00:00:00.000Z',
            validUntil: '2026-05-01T00:00:00.000Z',
            items: [
                {
                    vendorSku: 'SAP-MAGNO-135',
                    masterVariantId: 'MAT-SAPPI-MAGNO-SATIN-135',
                    contractedPriceEurKg: 1.19,
                    minOrderQtyKg: 300
                }
            ]
        });

        expect(badDatesRes.statusCode).toBe(400);
        expect(badDatesRes.body.ok).toBe(false);
        expect(badDatesRes.body.error.code).toBe('INVALID_AGREEMENT_DATE_RANGE');

        // 3b. Reject unknown masterVariantId not present in the 1,524 master catalog
        const unknownVariantRes = await dispatchRoute('POST', '/agreements/ingest', TENANT_A, {
            supplierId: 'SUP-SAPPI-EUROPE',
            agreementName: 'Unknown Variant Contract',
            validFrom: '2026-01-01T00:00:00.000Z',
            validUntil: '2027-01-01T00:00:00.000Z',
            items: [
                {
                    vendorSku: 'FAKE-SKU-999',
                    masterVariantId: 'NON-EXISTENT-SUBSTRATE-9999',
                    contractedPriceEurKg: 1.5,
                    minOrderQtyKg: 300
                }
            ]
        });

        expect(unknownVariantRes.statusCode).toBe(400);
        expect(unknownVariantRes.body.ok).toBe(false);
        expect(unknownVariantRes.body.error.code).toBe('UNKNOWN_MASTER_VARIANT_ID');

        // 3c. Valid ingestion without 'MAT-' prefix maps to canonical 'MAT-SAPPI-MAGNO-SATIN-135' (v1) and increments to v2 on re-ingest
        const v1Res = await dispatchRoute('POST', '/agreements/ingest', TENANT_A, {
            supplierId: 'SUP-SAPPI-EUROPE',
            agreementName: 'Sappi 2026 Q1 Agreement',
            validFrom: '2026-01-01T00:00:00.000Z',
            validUntil: '2027-06-30T23:59:59.000Z',
            items: [
                {
                    vendorSku: 'SAP-MAGNO-135',
                    masterVariantId: 'SAPPI-MAGNO-SATIN-135',
                    contractedPriceEurKg: 1.22,
                    minOrderQtyKg: 300
                }
            ]
        });

        expect(v1Res.statusCode).toBe(201);
        expect(v1Res.body.data.items[0].masterVariantId).toBe('MAT-SAPPI-MAGNO-SATIN-135');
        expect(v1Res.body.data.items[0].versionNumber).toBe(1);

        const v2Res = await dispatchRoute('POST', '/agreements/ingest', TENANT_A, {
            supplierId: 'SUP-SAPPI-EUROPE',
            agreementName: 'Sappi 2026 Q2 Renegotiated Agreement',
            validFrom: '2026-01-01T00:00:00.000Z',
            validUntil: '2027-12-31T23:59:59.000Z',
            items: [
                {
                    vendorSku: 'SAP-MAGNO-135-V2',
                    masterVariantId: 'MAT-SAPPI-MAGNO-SATIN-135',
                    contractedPriceEurKg: 1.16,
                    minOrderQtyKg: 250
                }
            ]
        });

        expect(v2Res.statusCode).toBe(201);
        expect(v2Res.body.data.items[0].versionNumber).toBe(2);
        expect(v2Res.body.data.items[0].contractedPriceEurKg).toBe(1.16);
    });
});
