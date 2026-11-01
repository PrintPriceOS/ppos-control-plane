import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import http from 'http';
import express from 'express';

const require = createRequire(import.meta.url);
process.env.JWT_SECRET = process.env.JWT_SECRET || 'ppos-unit-test-jwt-secret-key-2026-normative';
process.env.PPOS_MARKETPLACE_INTAKE_TOKEN = 'mkt-test-secret-token-2026';
process.env.PPOS_CONTROL_TOKEN = 'ctrl-test-secret-token-2026';

const customerPortalRouter = require('../src/api/routes/customerPortalRoutes');
const marketplaceOrdersRouter = require('../src/api/routes/marketplaceOrders');

function startTestServer() {
    const app = express();
    app.use(express.json({ limit: '50mb' }));
    app.use('/api/customer', customerPortalRouter);
    app.use('/api/marketplace/orders', marketplaceOrdersRouter);
    const server = http.createServer(app);
    return new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => {
            const addr = server.address();
            resolve({
                server,
                baseUrl: `http://127.0.0.1:${addr.port}`
            });
        });
    });
}

describe('Phase 16 (Option 3): B2B Multi-User Governance & Editorial RBAC Matrix', () => {
    let serverInfo;

    beforeEach(async () => {
        serverInfo = await startTestServer();
    });

    afterEach(async () => {
        if (serverInfo && serverInfo.server) {
            await new Promise((resolve) => serverInfo.server.close(resolve));
        }
    });

    it('1. PREPRESS_DESIGNER: can upload PDF/X-4 production assets (200 OK), but is strictly blocked from 3D Soft-Proof sign-off (403) and financial checkout/wire-proof (403)', async () => {
        const { baseUrl } = serverInfo;
        const headers = {
            'Content-Type': 'application/json',
            'x-marketplace-token': 'mkt-test-secret-token-2026',
            'x-b2b-role': 'PREPRESS_DESIGNER',
            'x-b2b-member-id': 'MEM_2026_0004',
            'x-b2b-email': 'prepress@printprice.pro'
        };

        // 1A. Can upload production PDF/X-4 asset -> 200 OK
        const uploadRes = await fetch(`${baseUrl}/api/marketplace/orders/ORD_2026_RBAC_01/files/upload`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                role: 'INTERIOR_PDF',
                originalName: 'interior_prepress_v1.pdf',
                sizeBytes: 24500,
                contentBase64: Buffer.from('%PDF-1.6\n% Prepress Designer Upload\n%%EOF').toString('base64')
            })
        });
        expect(uploadRes.status).toBe(200);
        const uploadBody = await uploadRes.json();
        expect(uploadBody.ok).toBe(true);

        // 1B. Cannot approve 3D Soft-Proof -> 403 FORBIDDEN_RBAC_INSUFFICIENT_SIGN_OFF_RIGHTS
        const approveRes = await fetch(`${baseUrl}/api/customer/orders/ORD_2026_RBAC_01/soft-proof/approve`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                decision: 'APPROVED',
                comments: 'Attempting sign-off as Prepress Designer',
                geometry: { trimWidthMm: 150, trimHeightMm: 230, spineThicknessMm: 14.5, bleedMarginMm: 3.0 }
            })
        });
        expect(approveRes.status).toBe(403);
        const approveBody = await approveRes.json();
        expect(approveBody.ok).toBe(false);
        expect(approveBody.error).toBe('FORBIDDEN_RBAC_INSUFFICIENT_SIGN_OFF_RIGHTS');
        expect(approveBody.actorRole).toBe('PREPRESS_DESIGNER');

        // 1C. Cannot execute checkout session -> 403 FORBIDDEN_RBAC_FINANCE_RIGHTS_REQUIRED
        const checkoutRes = await fetch(`${baseUrl}/api/marketplace/orders/ORD_2026_RBAC_01/checkout/session`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ paymentMethod: 'STRIPE_CARD' })
        });
        expect(checkoutRes.status).toBe(403);
        const checkoutBody = await checkoutRes.json();
        expect(checkoutBody.error).toBe('FORBIDDEN_RBAC_FINANCE_RIGHTS_REQUIRED');

        // 1D. Cannot upload wire transfer proof -> 403 FORBIDDEN_RBAC_FINANCE_RIGHTS_REQUIRED
        const wireRes = await fetch(`${baseUrl}/api/marketplace/orders/ORD_2026_RBAC_01/payment/wire-proof`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ originalName: 'swift_receipt.pdf', reference: 'PPOS-WIRE-01' })
        });
        expect(wireRes.status).toBe(403);
        const wireBody = await wireRes.json();
        expect(wireBody.error).toBe('FORBIDDEN_RBAC_FINANCE_RIGHTS_REQUIRED');
    });

    it('2. PRODUCTION_MANAGER: can upload PDF/X-4 assets and cryptographically sign 3D Soft-Proof Imprimatur (200 OK), but is blocked from financial checkout and wire-proof (403)', async () => {
        const { baseUrl } = serverInfo;
        const headers = {
            'Content-Type': 'application/json',
            'x-marketplace-token': 'mkt-test-secret-token-2026',
            'x-b2b-role': 'PRODUCTION_MANAGER',
            'x-b2b-member-id': 'MEM_2026_0002',
            'x-b2b-email': 'production@printprice.pro'
        };

        // 2A. Can sign 3D Soft-Proof Imprimatur -> 200 OK with SHA-256 signature
        const approveRes = await fetch(`${baseUrl}/api/customer/orders/ORD_2026_RBAC_01/soft-proof/approve`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                decision: 'APPROVED',
                comments: 'Approved by Production Manager',
                geometry: { trimWidthMm: 150, trimHeightMm: 230, spineThicknessMm: 14.5, bleedMarginMm: 3.0 }
            })
        });
        expect(approveRes.status).toBe(200);
        const approveBody = await approveRes.json();
        expect(approveBody.ok).toBe(true);
        expect(approveBody.proofStatus).toBe('APPROVED_FOR_PRESS');
        expect(approveBody.proofSignatureHash).toMatch(/^SHA256:/);

        // 2B. Cannot execute checkout session -> 403 FORBIDDEN_RBAC_FINANCE_RIGHTS_REQUIRED
        const checkoutRes = await fetch(`${baseUrl}/api/marketplace/orders/ORD_2026_RBAC_01/checkout/session`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ paymentMethod: 'BANK_TRANSFER_B2B' })
        });
        expect(checkoutRes.status).toBe(403);
        const checkoutBody = await checkoutRes.json();
        expect(checkoutBody.error).toBe('FORBIDDEN_RBAC_FINANCE_RIGHTS_REQUIRED');
    });

    it('3. FINANCE_APPROVER: can execute checkout session and upload wire-proof (200 OK), but is blocked from 3D Soft-Proof sign-off (403) and PDF/X-4 production asset upload (403)', async () => {
        const { baseUrl } = serverInfo;
        const headers = {
            'Content-Type': 'application/json',
            'x-marketplace-token': 'mkt-test-secret-token-2026',
            'x-b2b-role': 'FINANCE_APPROVER',
            'x-b2b-member-id': 'MEM_2026_0003',
            'x-b2b-email': 'finance@printprice.pro'
        };

        // 3A. First create an order in marketplace store so checkout/session finds it
        const createOrderRes = await fetch(`${baseUrl}/api/marketplace/orders`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-marketplace-token': 'mkt-test-secret-token-2026'
            },
            body: JSON.stringify({
                customerEmail: 'finance@printprice.pro',
                title: 'Financial Audit Edition',
                specs: { copies: 1000, interior_pages: 240, book_size: 'A5' },
                totals: { subtotal: 2500, packaging: 80, shipping: 180, tax: 110.4, total: 2870.4 }
            })
        });
        const createdOrderData = await createOrderRes.json();
        const targetOrderId = createdOrderData.orderId || 'ORD_2026_RBAC_FIN';

        // 3B. Can initiate checkout session -> 200 OK
        const checkoutRes = await fetch(`${baseUrl}/api/marketplace/orders/${encodeURIComponent(targetOrderId)}/checkout/session`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ paymentMethod: 'BANK_TRANSFER_B2B' })
        });
        expect(checkoutRes.status).toBe(200);
        const checkoutBody = await checkoutRes.json();
        expect(checkoutBody.ok).toBe(true);

        // 3C. Can upload bank wire transfer proof -> 200 OK
        const wireRes = await fetch(`${baseUrl}/api/marketplace/orders/${encodeURIComponent(targetOrderId)}/payment/wire-proof`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                originalName: 'comprobante_sepa_b2b.pdf',
                reference: 'PPOS-ORD-FINANCE',
                contentBase64: Buffer.from('%PDF-1.4\n% SEPA Wire Proof\n%%EOF').toString('base64')
            })
        });
        expect(wireRes.status).toBe(200);
        const wireBody = await wireRes.json();
        expect(wireBody.ok).toBe(true);

        // 3D. Cannot approve 3D Soft-Proof -> 403 FORBIDDEN_RBAC_INSUFFICIENT_SIGN_OFF_RIGHTS
        const approveRes = await fetch(`${baseUrl}/api/customer/orders/${encodeURIComponent(targetOrderId)}/soft-proof/approve`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ decision: 'APPROVED' })
        });
        expect(approveRes.status).toBe(403);
        const approveBody = await approveRes.json();
        expect(approveBody.error).toBe('FORBIDDEN_RBAC_INSUFFICIENT_SIGN_OFF_RIGHTS');

        // 3E. Cannot upload production PDF/X-4 assets -> 403 FORBIDDEN_RBAC_ASSET_UPLOAD_RIGHTS_REQUIRED
        const uploadRes = await fetch(`${baseUrl}/api/marketplace/orders/${encodeURIComponent(targetOrderId)}/files/upload`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                role: 'COVER_PDF',
                originalName: 'cover_unauthorized.pdf'
            })
        });
        expect(uploadRes.status).toBe(403);
        const uploadBody = await uploadRes.json();
        expect(uploadBody.error).toBe('FORBIDDEN_RBAC_ASSET_UPLOAD_RIGHTS_REQUIRED');
    });

    it('4. ORG_ADMIN: has full privileges across all endpoints and manages customer_b2b_members lifecycle (GET, POST, PUT role, DELETE revoke)', async () => {
        const { baseUrl } = serverInfo;
        const adminHeaders = {
            'Content-Type': 'application/json',
            'x-marketplace-token': 'mkt-test-secret-token-2026',
            'x-b2b-role': 'ORG_ADMIN',
            'x-b2b-member-id': 'MEM_2026_0001',
            'x-b2b-email': 'publisher@printprice.pro'
        };

        // 4A. List organization members
        const listRes = await fetch(`${baseUrl}/api/customer/organization/members`, {
            headers: adminHeaders
        });
        expect(listRes.status).toBe(200);
        const listData = await listRes.json();
        expect(listData.ok).toBe(true);
        expect(listData.members.length).toBeGreaterThanOrEqual(4);

        // 4B. Invite a new member (POST /api/customer/organization/members)
        const inviteRes = await fetch(`${baseUrl}/api/customer/organization/members`, {
            method: 'POST',
            headers: adminHeaders,
            body: JSON.stringify({
                email: 'sofia.layout@printprice.pro',
                fullName: 'Sofía Martín (Diseñadora Editorial)',
                role: 'PREPRESS_DESIGNER'
            })
        });
        expect(inviteRes.status).toBe(201);
        const inviteData = await inviteRes.json();
        expect(inviteData.ok).toBe(true);
        expect(inviteData.member.role).toBe('PREPRESS_DESIGNER');
        const createdMemberId = inviteData.member.memberId;

        // 4C. Promote member to PRODUCTION_MANAGER (PUT /api/customer/organization/members/:memberId/role)
        const promoteRes = await fetch(
            `${baseUrl}/api/customer/organization/members/${encodeURIComponent(createdMemberId)}/role`,
            {
                method: 'PUT',
                headers: adminHeaders,
                body: JSON.stringify({ role: 'PRODUCTION_MANAGER' })
            }
        );
        expect(promoteRes.status).toBe(200);
        const promoteData = await promoteRes.json();
        expect(promoteData.member.role).toBe('PRODUCTION_MANAGER');

        // 4D. Non-admin cannot invite or change roles -> 403 FORBIDDEN_RBAC_ORG_ADMIN_REQUIRED
        const nonAdminRes = await fetch(`${baseUrl}/api/customer/organization/members`, {
            method: 'POST',
            headers: {
                ...adminHeaders,
                'x-b2b-role': 'PRODUCTION_MANAGER',
                'x-b2b-member-id': 'MEM_2026_0002'
            },
            body: JSON.stringify({
                email: 'hacker@printprice.pro',
                role: 'ORG_ADMIN'
            })
        });
        expect(nonAdminRes.status).toBe(403);
        const nonAdminBody = await nonAdminRes.json();
        expect(nonAdminBody.error).toBe('FORBIDDEN_RBAC_ORG_ADMIN_REQUIRED');

        // 4E. Revoke member access (DELETE /api/customer/organization/members/:memberId)
        const revokeRes = await fetch(
            `${baseUrl}/api/customer/organization/members/${encodeURIComponent(createdMemberId)}`,
            {
                method: 'DELETE',
                headers: adminHeaders
            }
        );
        expect(revokeRes.status).toBe(200);
        const revokeData = await revokeRes.json();
        expect(revokeData.ok).toBe(true);
        expect(revokeData.member.status).toBe('SUSPENDED');
    });
});
