import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
    SENSITIVE_WORKSHOP_COST_FIELDS,
    PUBLISHER_NOTIFICATION_EVENTS,
    getPublisherOrders,
    getPublisherOrderDetail,
    getPublisherTimeline,
    submitProofApproval,
    createPublisherOrder,
    listPublisherLifecycleNotifications
} = require('../src/api/services/publisher/publisherHubService');
const { requirePublisherHubAuth } = require('../src/api/routes/publisherRoutes');

describe('PHASE-11C — Publisher B2B Hub & 3D Soft-Proofing Engine', () => {
    it('1. Enforces strict cross-tenant isolation between different publisherTenantId scopes', () => {
        // Create an order exclusively for Publisher A ('tenant-publisher-anagrama')
        const orderA = createPublisherOrder(
            {
                orderId: 'PUB-ANAGRAMA-9001',
                title: 'Colección Narrativa Hispánica',
                isbn: '978-84-339-9001-2',
                pageCount: 288,
                paperGrammageGsm: 90,
                paperBulkCm3G: 1.3,
                bindingType: 'SOFTCOVER_PUR'
            },
            { publisherTenantId: 'tenant-publisher-anagrama', role: 'PUBLISHER' }
        );

        expect(orderA.orderId).toBe('PUB-ANAGRAMA-9001');
        expect(orderA.publisherTenantId).toBe('tenant-publisher-anagrama');

        // Publisher B ('tenant-publisher-taschen') must NOT see Publisher A's order in their list
        const listB = getPublisherOrders({
            publisherTenantId: 'tenant-publisher-taschen',
            role: 'PUBLISHER'
        });
        expect(listB.orders.some(o => o.orderId === 'PUB-ANAGRAMA-9001')).toBe(false);

        // Direct detail or telemetry lookup by Publisher B on Publisher A's orderId must throw 403 FORBIDDEN_CROSS_TENANT_ACCESS
        expect(() =>
            getPublisherOrderDetail({
                orderId: 'PUB-ANAGRAMA-9001',
                publisherTenantId: 'tenant-publisher-taschen',
                role: 'PUBLISHER'
            })
        ).toThrow(/FORBIDDEN_CROSS_TENANT_ACCESS/);

        expect(() =>
            getPublisherTimeline({
                orderId: 'PUB-ANAGRAMA-9001',
                publisherTenantId: 'tenant-publisher-taschen',
                role: 'PUBLISHER'
            })
        ).toThrow(/FORBIDDEN_CROSS_TENANT_ACCESS/);

        // Route middleware also blocks a PUBLISHER user from spoofing another publisherTenantId in query/body
        let statusCode = 200;
        let jsonPayload = null;
        const req = {
            user: { id: 'editor-b', role: 'PUBLISHER', publisherTenantId: 'tenant-publisher-taschen' },
            query: { publisherTenantId: 'tenant-publisher-anagrama' },
            headers: {}
        };
        const res = {
            status(code) {
                statusCode = code;
                return this;
            },
            json(body) {
                jsonPayload = body;
                return this;
            }
        };

        requirePublisherHubAuth(req, res, () => {});
        expect(statusCode).toBe(403);
        expect(jsonPayload.error).toMatch(/FORBIDDEN_CROSS_TENANT_ACCESS/);
    });

    it('2. Strictly strips all internal printhouse workshop costs (CTP plates, make-ready waste, margins) for PUBLISHER role', () => {
        const result = getPublisherOrders({
            publisherTenantId: 'tenant-publisher-penguin',
            role: 'PUBLISHER'
        });

        expect(result.ok).toBe(true);
        expect(result.orders.length).toBeGreaterThanOrEqual(3);

        for (const order of result.orders) {
            // Agreed commercial purchase price and technical specs ARE visible
            expect(order.agreedPurchasePriceEur).toBeGreaterThan(0);
            expect(order.calculatedSpineMm).toBeGreaterThan(0);
            expect(order.softProof3DGeometry).toBeDefined();

            // Internal workshop cost & margin fields MUST be completely undefined
            for (const sensitiveField of SENSITIVE_WORKSHOP_COST_FIELDS) {
                expect(order[sensitiveField]).toBeUndefined();
            }
        }
    });

    it('3. Records formal 3D Soft-Proof telematic approval (APPROVE FOR PRESS) and advances the 6-stage manufacturing timeline', () => {
        const approvalResult = submitProofApproval({
            orderId: 'PUB-ORD-2026-101',
            publisherTenantId: 'tenant-publisher-penguin',
            userId: 'publisher-art-director-07',
            role: 'PUBLISHER',
            decision: 'APPROVED',
            comments: '3D hardcover spine (27.66 mm) and 3.0 mm bleed corners verified.'
        });

        expect(approvalResult.ok).toBe(true);
        expect(approvalResult.proofStatus).toBe('APPROVED_FOR_PRESS');
        expect(approvalResult.currentStage).toBe('PLATES_AND_IMPOSITION');
        expect(approvalResult.proofApprovalRecord.decision).toBe('APPROVED');
        expect(approvalResult.proofApprovalRecord.approvedByUserId).toBe(
            'publisher-art-director-07'
        );
        expect(approvalResult.proofApprovalRecord.digitalSignatureHash).toMatch(/^SHA256:/);

        // Verify the 6-stage manufacturing timeline reflects completed stages 1 & 2 and active stage 3
        const telemetry = getPublisherTimeline({
            orderId: 'PUB-ORD-2026-101',
            publisherTenantId: 'tenant-publisher-penguin',
            role: 'PUBLISHER'
        });

        expect(telemetry.milestones).toHaveLength(6);
        expect(telemetry.milestones[0].code).toBe('PREFLIGHT_VALIDATED');
        expect(telemetry.milestones[0].status).toBe('COMPLETED');
        expect(telemetry.milestones[1].code).toBe('SOFT_PROOF_APPROVED');
        expect(telemetry.milestones[1].status).toBe('COMPLETED');
        expect(telemetry.milestones[2].code).toBe('PLATES_AND_IMPOSITION');
        expect(telemetry.milestones[2].status).toBe('IN_PROGRESS');
        expect(telemetry.logisticsTracking.documents.deliveryNotePdfUrl).toBe(
            '/api/logistics/shipments/SHP-2026-9901/delivery-note/pdf'
        );
    });

    it('4. Emits transactional Email/Webhook notifications scoped strictly by publisherTenantId on 3D proof sign-off', () => {
        const notifications = listPublisherLifecycleNotifications({
            publisherTenantId: 'tenant-publisher-penguin'
        });

        expect(notifications.length).toBeGreaterThanOrEqual(1);
        expect(
            notifications.some(
                n =>
                    n.eventType === PUBLISHER_NOTIFICATION_EVENTS.PROOF_SIGNED_AND_QUEUED &&
                    n.orderId === 'PUB-ORD-2026-101'
            )
        ).toBe(true);

        // Ensure another tenant does not see Penguin's notifications
        const otherTenantNotifications = listPublisherLifecycleNotifications({
            publisherTenantId: 'tenant-publisher-suhrkamp'
        });
        expect(
            otherTenantNotifications.every(
                n => n.publisherTenantId === 'tenant-publisher-suhrkamp'
            )
        ).toBe(true);
    });
});

