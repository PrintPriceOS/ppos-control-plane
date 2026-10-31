import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const {
    generateSsccLabelsPdf,
    generateDeliveryNotePdf
} = require('../services/logistics/deliveryNotePdfService');

const {
    createLogisticsRouter,
    requireLogisticsControlPlaneAuth
} = require('../routes/logisticsRoutes');

function findRouteLayer(router, routePath, method) {
    for (const layer of router.stack) {
        if (layer.route && layer.route.path === routePath && layer.route.methods[method.toLowerCase()]) {
            return layer.route;
        }
    }
    return null;
}

async function invokeRouterEndpoint(router, { method = 'GET', routePath, params = {}, query = {}, body = {}, headers = {}, user = null }) {
    let statusCode = 200;
    let responseBody = null;
    const responseHeaders = {};
    let nextCalled = false;

    const req = {
        method,
        url: routePath,
        path: routePath,
        headers: { ...headers },
        query: { ...query },
        params: { ...params },
        body: { ...body },
        user
    };

    const res = {
        setHeader(key, value) {
            responseHeaders[key.toLowerCase()] = value;
            return this;
        },
        status(code) {
            statusCode = code;
            return this;
        },
        json(data) {
            responseBody = data;
            return this;
        },
        send(data) {
            responseBody = data;
            return this;
        }
    };

    requireLogisticsControlPlaneAuth(req, res, () => {
        nextCalled = true;
    });

    if (!nextCalled) {
        return { statusCode, headers: responseHeaders, body: responseBody };
    }

    const route = findRouteLayer(router, routePath, method);
    if (!route) {
        return { statusCode: 404, headers: responseHeaders, body: { ok: false, error: 'Route not found' } };
    }

    const handler = route.stack[route.stack.length - 1].handle;
    await handler(req, res, () => {});
    return { statusCode, headers: responseHeaders, body: responseBody };
}

describe('Phase 198C (LOGISTICS-05) — Automated GS1-128 SSCC Pallet Labels & Delivery Note PDF Generation', () => {
    it('Test 1: generates valid A6 (105x148 mm) GS1-128 SSCC pallet label PDF buffer (1 page per pallet) and A4_SHEET_4UP layout', async () => {
        const a6Result = await generateSsccLabelsPdf({
            shipmentId: 'SHP-2026-ERFURT-01',
            format: 'A6',
            shipmentData: {
                poNumber: 'PO-SUHRKAMP-9901',
                isbn: '978-3-518-42910-5',
                bookTitle: 'Der Druckprozess im 21. Jahrhundert',
                warehouseProfileCode: 'ZEITFRACHT_ERFURT',
                palletCount: 3,
                unitsPerCarton: 44,
                cartonsPerPallet: 32,
                companyPrefix: '8412345',
                startSerial: 1
            }
        });

        expect(Buffer.isBuffer(a6Result.buffer)).toBe(true);
        expect(a6Result.buffer.length).toBeGreaterThan(2500);
        expect(a6Result.pageCount).toBe(3); // 1 page per pallet in A6 mode
        expect(a6Result.labels).toHaveLength(3);

        const pdfText = a6Result.buffer.toString('latin1');
        expect(pdfText.startsWith('%PDF-1.4')).toBe(true);
        expect(pdfText).toContain('%%EOF');
        expect(pdfText).toContain('/Count 3');
        // Verify A6 MediaBox in points (105 mm = 297.638 pt, 148 mm = 419.528 pt)
        expect(pdfText).toContain('/MediaBox [0 0 297.638 419.528]');
        // Verify HRI and key metadata inside stream (parentheses in PDF text strings are escaped as \(00\))
        expect(pdfText).toContain('\\(00\\) 0 8412345 000000001 0');
        expect(pdfText).toContain('PALLET 1 OF 3');
        expect(pdfText).toContain('PALLET 3 OF 3');
        expect(pdfText).toContain('SLOT BOOKED / 48H AVIS');

        // Verify A4_SHEET_4UP mode (3 pallets fit onto 1 A4 sheet)
        const a4SheetResult = await generateSsccLabelsPdf({
            shipmentId: 'SHP-2026-ERFURT-01',
            format: 'A4_SHEET_4UP',
            shipmentData: {
                palletCount: 3
            }
        });
        expect(Buffer.isBuffer(a4SheetResult.buffer)).toBe(true);
        expect(a4SheetResult.pageCount).toBe(1);
        const a4Text = a4SheetResult.buffer.toString('latin1');
        expect(a4Text.startsWith('%PDF-1.4')).toBe(true);
        expect(a4Text).toContain('/Count 1');
    });

    it('Test 2: generates valid DIN A4 Delivery Note / Lieferschein PDF buffer with SSCC table, LDM, taxable weight, EPAL 14-day box & CMR signature blocks', async () => {
        const dnResult = await generateDeliveryNotePdf({
            shipmentId: 'SHP-2026-VVA-02',
            shipmentData: {
                poNumber: 'PO-BERTELSMANN-774',
                isbn: '978-3-442-31492-8',
                bookTitle: 'Handbuch der Buchbinderei & Logistik',
                warehouseProfileCode: 'ARVATO_VVA_GUETERSLOH',
                trimWidthMm: 148,
                trimHeightMm: 210,
                pages: 320,
                quantity: 2500,
                stackabilityHandling: 'STRICT_LDM_NON_STACKABLE',
                assignedSlotNumber: 'SLOT-VVA-GT-1100',
                vehiclePlate: 'GT-AR 2026'
            }
        });

        expect(Buffer.isBuffer(dnResult.buffer)).toBe(true);
        expect(dnResult.buffer.length).toBeGreaterThan(2000);
        expect(dnResult.pageCount).toBe(1);

        const pdfText = dnResult.buffer.toString('latin1');
        expect(pdfText.startsWith('%PDF-1.4')).toBe(true);
        expect(pdfText).toContain('%%EOF');
        // Verify DIN A4 MediaBox in points (210 mm = 595.276 pt, 297 mm = 841.89 pt)
        expect(pdfText).toContain('/MediaBox [0 0 595.276 841.89]');
        expect(pdfText).toContain('DELIVERY NOTE / LIEFERSCHEIN / ALBARAN DE ENTREGA');
        expect(pdfText).toContain('PO-BERTELSMANN-774');
        expect(pdfText).toContain('978-3-442-31492-8');
        expect(pdfText).toContain('STRICT_LDM_NON_STACKABLE');
        expect(pdfText).toContain('0.4 LDM / Euro-Pallet 1200x800 mm');
        expect(pdfText).toContain('PALETTENSCHEIN \\(CANJE 14 DIAS\\)');
        expect(pdfText).toContain('GT-AR 2026');
    });

    it('Test 3: exposes POST /api/logistics/shipments/:id/labels/sscc-pdf and GET /api/logistics/shipments/:id/delivery-note/pdf with RBAC & tenant isolation', async () => {
        const router = createLogisticsRouter();

        // 1. Unauthorized role rejected with 403
        const forbiddenRes = await invokeRouterEndpoint(router, {
            method: 'POST',
            routePath: '/shipments/:id/labels/sscc-pdf',
            params: { id: 'SHP-900' },
            headers: { 'x-user-role': 'GUEST' }
        });
        expect(forbiddenRes.statusCode).toBe(403);

        // 2. Cross-tenant spoofing rejected with 403 FORBIDDEN_TENANT_MISMATCH
        const tenantSpoofRes = await invokeRouterEndpoint(router, {
            method: 'POST',
            routePath: '/shipments/:id/labels/sscc-pdf',
            params: { id: 'SHP-900' },
            user: { id: 'op-1', role: 'PRINTHOUSE_OPERATOR', tenantId: 'tenant-alpha' },
            body: { tenantId: 'tenant-beta' }
        });
        expect(tenantSpoofRes.statusCode).toBe(403);
        expect(tenantSpoofRes.body.error).toContain('FORBIDDEN_TENANT_MISMATCH');

        // 3. Valid POST /shipments/:id/labels/sscc-pdf returns binary PDF with %PDF-1.4 header
        const labelRes = await invokeRouterEndpoint(router, {
            method: 'POST',
            routePath: '/shipments/:id/labels/sscc-pdf',
            params: { id: 'SHP-900' },
            query: { format: 'A6' },
            user: { id: 'op-1', role: 'PRINTHOUSE_OPERATOR', tenantId: 'tenant-alpha' },
            body: {
                tenantId: 'tenant-alpha',
                palletCount: 2,
                poNumber: 'PO-900'
            }
        });
        expect(labelRes.statusCode).toBe(200);
        expect(labelRes.headers['content-type']).toBe('application/pdf');
        expect(labelRes.headers['x-ppos-label-format']).toBe('A6');
        expect(labelRes.headers['x-ppos-page-count']).toBe('2');
        expect(Buffer.isBuffer(labelRes.body)).toBe(true);
        expect(labelRes.body.toString('latin1').startsWith('%PDF-1.4')).toBe(true);

        // 4. Valid GET /shipments/:id/delivery-note/pdf returns binary DIN A4 PDF
        const deliveryNoteRes = await invokeRouterEndpoint(router, {
            method: 'GET',
            routePath: '/shipments/:id/delivery-note/pdf',
            params: { id: 'SHP-900' },
            user: { id: 'admin-1', role: 'PRINTHOUSE_ADMIN', tenantId: 'tenant-alpha' },
            query: {
                poNumber: 'PO-900',
                warehouseProfileCode: 'ZEITFRACHT_ERFURT'
            }
        });
        expect(deliveryNoteRes.statusCode).toBe(200);
        expect(deliveryNoteRes.headers['content-type']).toBe('application/pdf');
        expect(Buffer.isBuffer(deliveryNoteRes.body)).toBe(true);
        expect(deliveryNoteRes.body.toString('latin1').startsWith('%PDF-1.4')).toBe(true);
    });
});
