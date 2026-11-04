import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
    getPublisherOrders,
    getPublisherOrderDetail,
    getPublisherTimeline,
    createPublisherOrder
} = require('../src/api/services/publisher/publisherHubService');
const marketplaceOrderService = require('../src/api/services/marketplaceOrderService');

describe('Publisher Hub — Dynamic Order Sync & Clean-Slate Zero-State', () => {
    it('1. Returns clean-slate empty state (0 titles, 0 copies) for a real tenant with no orders', async () => {
        const cleanTenantId = 'tenant-clean-publisher-' + Date.now();
        const result = await getPublisherOrders({
            publisherTenantId: cleanTenantId,
            role: 'PUBLISHER'
        });

        expect(result.ok).toBe(true);
        expect(result.publisherTenantId).toBe(cleanTenantId);
        expect(result.orders).toHaveLength(0);
        expect(result.summaryKpis.activeTitles).toBe(0);
        expect(result.summaryKpis.copiesInPress).toBe(0);
        expect(result.summaryKpis.awaitingApproval).toBe(0);
        expect(result.summaryKpis.onTimeDeliveryPct).toBeNull();
    });

    it('2. Asserts PUB-ORD-2026-101, PUB-ORD-2026-102, and PUB-ORD-2026-103 do NOT appear for clean tenants', async () => {
        const realPublisherTenantId = 'ph-d65e4e8b';
        const result = await getPublisherOrders({
            publisherTenantId: realPublisherTenantId,
            role: 'PUBLISHER'
        });

        expect(result.ok).toBe(true);
        const orderIds = result.orders.map(o => o.orderId);
        expect(orderIds).not.toContain('PUB-ORD-2026-101');
        expect(orderIds).not.toContain('PUB-ORD-2026-102');
        expect(orderIds).not.toContain('PUB-ORD-2026-103');
    });

    it('3. Retains seeded baseline mock orders only for authorized demo tenants', async () => {
        const demoTenantId = 'tenant-demo-agency';
        const result = await getPublisherOrders({
            publisherTenantId: demoTenantId,
            role: 'PUBLISHER'
        });

        expect(result.ok).toBe(true);
        expect(result.orders.length).toBeGreaterThanOrEqual(3);
        expect(result.summaryKpis.activeTitles).toBeGreaterThan(0);
        expect(result.summaryKpis.copiesInPress).toBeGreaterThan(0);
    });

    it('4. Dynamically synchronizes orders from marketplaceOrderService into getPublisherOrders', async () => {
        const dynamicTenantId = 'tenant-sync-test-99';
        const dynamicEmail = 'publisher99@printprice.pro';

        // Mock listOrders to return a real marketplace order
        const listOrdersSpy = vi.spyOn(marketplaceOrderService, 'listOrders').mockResolvedValueOnce({
            ok: true,
            orders: [
                {
                    order_id: 'ORD_DYNAMIC_TEST_01',
                    tenant_id: dynamicTenantId,
                    customer_email: dynamicEmail,
                    status: 'AWAITING_PAYMENT',
                    estimated_price: 3450.50,
                    book_spec: {
                        title: 'Antología de Poesía Impresa',
                        isbn: '978-84-12345-67-8',
                        edition: 'Primera Edición 2026',
                        copies: 1500,
                        pages: 192,
                        paper_grammage: 100,
                        paper_bulk: 1.3,
                        binding_method: 'softcover_pur',
                        format_width: 148,
                        format_height: 210,
                        cover_finish: 'MATE_ANTIRAYAS',
                        inner_paper: '100g/m² Offset Blanco'
                    },
                    selected_offer: {
                        totalPrice: 3450.50
                    }
                }
            ]
        });

        const result = await getPublisherOrders({
            publisherTenantId: dynamicTenantId,
            customerEmail: dynamicEmail,
            role: 'PUBLISHER'
        });

        expect(result.ok).toBe(true);
        expect(result.orders.length).toBe(1);
        const order = result.orders[0];
        expect(order.orderId).toBe('ORD_DYNAMIC_TEST_01');
        expect(order.title).toBe('Antología de Poesía Impresa');
        expect(order.printRunCopies).toBe(1500);
        expect(order.agreedPurchasePriceEur).toBe(3450.50);
        expect(order.unitPurchasePriceEur).toBe(2.3);
        expect(order.calculatedSpineMm).toBeGreaterThan(5);
        expect(order.currentStage).toBe('SOFT_PROOF_APPROVED');
        expect(result.summaryKpis.activeTitles).toBe(1);
        expect(result.summaryKpis.copiesInPress).toBe(1500);

        listOrdersSpy.mockRestore();
    });

    it('5. Asserts the 6-stage manufacturing timeline references the selected order ID and never contains 003401234500000018', async () => {
        const dynamicTenantId = 'tenant-timeline-test-77';
        const dynamicOrderId = 'ORD_TIMELINE_GENUINE_77';

        createPublisherOrder(
            {
                orderId: dynamicOrderId,
                title: 'Genuine Production Run Edition',
                isbn: '978-0-999-88877-6',
                pageCount: 200,
                paperGrammageGsm: 90,
                bindingType: 'SOFTCOVER_PUR'
            },
            { publisherTenantId: dynamicTenantId, role: 'PUBLISHER' }
        );

        const timeline = await getPublisherTimeline({
            orderId: dynamicOrderId,
            publisherTenantId: dynamicTenantId,
            role: 'PUBLISHER'
        });

        expect(timeline.ok).toBe(true);
        expect(timeline.orderId).toBe(dynamicOrderId);
        expect(timeline.milestones).toHaveLength(6);
        expect(timeline.milestones[0].code).toBe('PREFLIGHT_VALIDATED');
        expect(timeline.milestones[5].code).toBe('DISPATCHED_AND_DELIVERED');
        // Must not contain hardcoded mock SSCC
        expect(timeline.logisticsTracking.sscc18).not.toBe('003401234500000018');
        expect(timeline.logisticsTracking.sscc18).not.toBe('040481234500000010');
    });

    it('6. Enforces strict cross-tenant isolation and blocks cross-tenant access to dynamic orders', async () => {
        const tenantA = 'tenant-sync-corp-a';
        const tenantB = 'tenant-sync-corp-b';

        // Create order in tenantA
        createPublisherOrder(
            {
                orderId: 'PUB-DYNAMIC-ISOLATION-01',
                title: 'Private Edition A',
                isbn: '978-0-123-45678-0',
                pageCount: 160,
                paperGrammageGsm: 90,
                bindingType: 'SOFTCOVER_PUR'
            },
            { publisherTenantId: tenantA, role: 'PUBLISHER' }
        );

        // Tenant B must not receive Tenant A's orders in getPublisherOrders
        const listB = await getPublisherOrders({
            publisherTenantId: tenantB,
            role: 'PUBLISHER'
        });
        expect(listB.orders.some(o => o.orderId === 'PUB-DYNAMIC-ISOLATION-01')).toBe(false);

        // Direct getPublisherOrderDetail from Tenant B must throw 403 FORBIDDEN_CROSS_TENANT_ACCESS
        expect(() =>
            getPublisherOrderDetail({
                orderId: 'PUB-DYNAMIC-ISOLATION-01',
                publisherTenantId: tenantB,
                role: 'PUBLISHER'
            })
        ).toThrow(/FORBIDDEN_CROSS_TENANT_ACCESS/);
    });
});
