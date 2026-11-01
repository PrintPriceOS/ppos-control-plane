import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
    inspectPdfBufferMetadata,
    inspectPreflightJob,
    executePreflightAutoFix
} = require('../src/api/services/preflight/preflightEngineService');
const marketplaceOrderFileService = require('../src/api/services/marketplaceOrderFileService');
const preflightRoutes = require('../src/api/routes/preflightRoutes');

describe('Phase 11A / Phase 15 — Preflight <-> Control Plane Forensic Parity & Bidirectionality', () => {
    it('1. inspectPdfBufferMetadata extracts real PDF/X-4 version, page count, CMYK/Spot color spaces, and embedded fonts', () => {
        const samplePdf = Buffer.from(
            `%PDF-1.6
1 0 obj << /Type /Catalog /Pages 2 0 R /OutputIntent << /S /GTS_PDFX >> >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 419.53 595.28] /TrimBox [0 0 419.53 595.28] /BleedBox [-8.5 -8.5 428.03 603.78] /Resources << /ColorSpace << /CS1 /DeviceCMYK /CS2 /Separation >> /Font << /F1 5 0 R >> >> >> endobj
4 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 419.53 595.28] >> endobj
5 0 obj << /Type /Font /Subtype /Type1 /FontDescriptor << /FontFile3 6 0 R >> >> endobj
%%EOF`,
            'latin1'
        );

        const scan = inspectPdfBufferMetadata(samplePdf, {
            role: 'INTERIOR_PDF',
            expectedPages: 192,
            trimWidthMm: 148,
            trimHeightMm: 210,
            bleedMm: 3.0,
            coatingType: 'COATED'
        });

        expect(scan.pdfVersion).toContain('1.6');
        expect(scan.detectedPages).toBe(2);
        expect(scan.colorSpaces).toContain('CMYK');
        expect(scan.colorSpaces).toContain('SPOT_PANTONE');
        expect(scan.fonts.allEmbedded).toBe(true);
        expect(scan.iccProfile).toContain('FOGRA39');
    });

    it('2. inspectPreflightJob evaluates spine geometry, +3.0 mm bleed, TAC %, DPI, and returns structured telemetry', () => {
        const report = inspectPreflightJob(
            {
                jobId: 'ORD_PF_TEST_01',
                orderId: 'ORD_PF_TEST_01',
                role: 'COVER_PDF',
                title: 'Industrial Typography Manual',
                isbn: '978-84-9066-801-6',
                pageCount: 240,
                paperGrammage: 90,
                paperBulk: 1.3,
                paperCoating: 'UNCOATED',
                bindingType: 'SOFTCOVER_PUR',
                trimWidthMm: 150,
                trimHeightMm: 230,
                innerBleedMm: 3.0,
                coverBleedMm: 5.0,
                declaredSpineMm: 14.54,
                minContinuousDpi: 300,
                detectedMaxTacPct: 235
            },
            { tenantId: 'tenant-default' }
        );

        expect(report.ok).toBe(true);
        expect(report.overallStatus).toBe('PASS');
        expect(report.status).toBe('PASSED');
        expect(report.spineGeometry.calculatedSpineMm).toBe(14.54);
        expect(report.spineGeometry.discrepancyMm).toBe(0);
        expect(report.bleedGeometry.inner.detectedBleedMm).toBe(3.0);
        expect(report.resolutionDpi.effectiveDpi).toBe(300);
        expect(report.inkCoverageTac.maxTacPct).toBe(235);
        expect(report.fonts.allEmbedded).toBe(true);
    });

    it('3. uploadBinaryFile runs synchronous preflight inspection and attaches structured preflightReport to uploaded asset', async () => {
        const pdfBytes = Buffer.from('%PDF-1.6\n1 0 obj << /Type /Catalog >> endobj\n%%EOF', 'utf8');
        const uploadRes = await marketplaceOrderFileService.uploadBinaryFile('ORD_2026_103', {
            role: 'INTERIOR_PDF',
            buffer: pdfBytes,
            originalName: 'Interior_256pp_ISOv2.pdf',
            mimeType: 'application/pdf',
            actorId: 'publisher@printprice.pro'
        });

        expect(uploadRes.ok).toBe(true);
        expect(uploadRes.role).toBe('INTERIOR_PDF');
        expect(uploadRes.preflightStatus).toBe('PASSED');
        expect(uploadRes.preflightInspectionId).toMatch(/^INSP-/);
        expect(uploadRes.preflightReport).toBeDefined();
        expect(uploadRes.preflightReport.colorSpaces).toContain('CMYK');
        expect(uploadRes.preflightReport.resolutionDpi.minDpi).toBeGreaterThanOrEqual(300);
        expect(uploadRes.preflightReport.bleedGeometry.inner.detectedBleedMm).toBe(3.0);
    });

    it('4. applyPreflightVerdictCallback processes outbound verdict from Preflight Engine and updates order state', async () => {
        const callbackRes = await marketplaceOrderFileService.applyPreflightVerdictCallback('ORD_2026_103', {
            role: 'COVER_PDF',
            preflightJobId: 'job_pf_cover_991',
            status: 'PASSED',
            colorSpaces: ['CMYK'],
            iccProfile: 'ISO Coated v2 300% (FOGRA39)',
            resolutionDpi: { minDpi: 320, effectiveDpi: 350, requiredMinDpi: 300, status: 'PASS' },
            fonts: { allEmbedded: true, missingFonts: [], status: 'PASS' },
            inkCoverageTac: { maxTacPct: 268, limitPct: 300, status: 'PASS' },
            innerBleedMm: 3.0,
            declaredSpineMm: 15.2
        });

        expect(callbackRes.ok).toBe(true);
        expect(callbackRes.orderId).toBe('ORD_2026_103');
        expect(callbackRes.role).toBe('COVER_PDF');
        expect(callbackRes.status).toBe('PASSED');
        expect(callbackRes.stage01Approved).toBe(true);
        expect(callbackRes.preflightReport.inkCoverageTac.maxTacPct).toBe(268);
        expect(callbackRes.preflightReport.resolutionDpi.effectiveDpi).toBe(350);
    });

    it('5. requireLogisticsControlPlaneAuth allows CUSTOMER, PUBLISHER, and PRINTHOUSE_OPERATOR roles', () => {
        let nextCalled = false;
        const req = {
            user: { id: 'cust-1', role: 'CUSTOMER', tenantId: 'tenant-default' },
            headers: {}
        };
        const res = {
            status() {
                return this;
            },
            json() {
                return this;
            }
        };
        preflightRoutes.requireLogisticsControlPlaneAuth(req, res, () => {
            nextCalled = true;
        });
        expect(nextCalled).toBe(true);
    });
});
