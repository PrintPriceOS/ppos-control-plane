import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
    getPricingProfiles,
    savePricingProfile,
    calibrateQuote,
    calculateCrossoverPoint
} = require('../services/pricing/pricingIntelligenceService');
const pricingRoutes = require('../src/api/routes/pricingRoutes');

describe('Phase 14: Industrial Pricing Intelligence Engine & Live Calibrator', () => {
    it('1. Seeds realistic machine-linked profiles (Offset B1, Offset B2, Digital SRA3, Web Rotary) and computes real KPI summary', () => {
        const res = getPricingProfiles('tenant-pricing-test-1');
        expect(res.ok).toBe(true);
        expect(res.profiles.length).toBeGreaterThanOrEqual(4);
        expect(res.kpiSummary.activeProfilesCount).toBe(4);
        expect(res.kpiSummary.activeMachinesCount).toBe(4);
        expect(res.kpiSummary.avgTargetMarginPct).toBeGreaterThan(20);
        expect(res.kpiSummary.technologyBreakdown).toEqual({
            OFFSET_B1: 1,
            OFFSET_B2: 1,
            DIGITAL_TONER: 1,
            WEB_ROTARY: 1
        });
    });

    it('2. Executes mathematical price calibration (Paper + CTP Plates + Setup + Press Run + Finishing = Base Cost -> Selling Price)', () => {
        const quote = calibrateQuote('tenant-pricing-test-2', {
            profileId: 'prof-offset-b1-xl106',
            trimSize: '150x230',
            copies: 1000,
            pages: 192,
            paperId: 'paper-ahuesado-90',
            bindingType: 'PUR',
            hourlyRateEur: 265,
            setupFeeEur: 240,
            targetMarginPct: 28,
            minimumJobFeeEur: 380
        });

        expect(quote.ok).toBe(true);
        const b = quote.breakdown;

        const sumComponents =
            Math.round(
                (b.paperCostEur +
                    b.platesCostEur +
                    b.setupCostEur +
                    b.runTimeCostEur +
                    b.finishingCostEur) *
                    100
            ) / 100;
        expect(b.baseIndustrialCostEur).toBeCloseTo(sumComponents, 1);
        expect(b.totalPlates).toBe(96);
        expect(b.totalSellingPriceEur).toBeGreaterThan(b.baseIndustrialCostEur);
        expect(b.unitSellingPriceEur).toBeCloseTo(b.totalSellingPriceEur / 1000, 3);
    });

    it('3. Computes Digital vs. Offset Crossover Point where Offset amortizes CTP plates and becomes cheaper per copy than Digital', () => {
        const crossover = calculateCrossoverPoint('tenant-pricing-test-3', {
            trimSize: '150x230',
            pages: 192,
            paperId: 'paper-ahuesado-90',
            bindingType: 'PUR'
        });

        expect(crossover.ok).toBe(true);
        expect(crossover.crossoverCopies).toBeGreaterThan(100);
        expect(crossover.crossoverCopies).toBeLessThan(1500);
        expect(Array.isArray(crossover.curve)).toBe(true);

        const run100 = crossover.curve.find((pt) => pt.copies === 100);
        const run5000 = crossover.curve.find((pt) => pt.copies === 5000);

        expect(run100.recommendedTechnology).toBe('DIGITAL_TONER');
        expect(run5000.recommendedTechnology).toBe('OFFSET_B1');
        expect(run5000.offsetUnitEur).toBeLessThan(run5000.digitalUnitEur);
    });

    it('4. Persists calibrated rates and enforces multi-tenant RBAC on /api/pricing/*', () => {
        const updated = savePricingProfile('tenant-pricing-test-4', {
            id: 'prof-offset-b1-xl106',
            printerId: 'mach-heidelberg-xl106',
            printerName: 'Heidelberg Speedmaster XL 106-8P',
            technology: 'OFFSET_B1',
            hourlyRateEur: 290,
            setupFeeEur: 260,
            targetMarginPct: 32,
            minimumJobFeeEur: 400
        });

        expect(updated.ok).toBe(true);
        expect(updated.profile.hourlyRateEur).toBe(290);
        expect(updated.profile.targetMarginPct).toBe(32);

        const otherTenant = getPricingProfiles('tenant-pricing-test-1');
        const otherB1 = otherTenant.profiles.find((p) => p.id === 'prof-offset-b1-xl106');
        expect(otherB1.hourlyRateEur).toBe(265);

        let statusCode = 200;
        let payload = null;
        pricingRoutes.requireLogisticsControlPlaneAuth(
            {
                user: { role: 'PRINTHOUSE_ADMIN', tenantId: 'tenant-A' },
                body: { tenantId: 'tenant-B' }
            },
            {
                status(code) {
                    statusCode = code;
                    return this;
                },
                json(obj) {
                    payload = obj;
                    return this;
                }
            },
            () => {}
        );
        expect(statusCode).toBe(403);
        expect(payload.error).toContain('FORBIDDEN_TENANT_MISMATCH');
    });
});
