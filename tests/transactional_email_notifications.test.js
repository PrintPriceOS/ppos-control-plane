import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-smtp-notifications-32b';
process.env.PPOS_CONTROL_TOKEN = process.env.PPOS_CONTROL_TOKEN || 'ppos-dev-secret-2026';

const express = require('express');
const customerPortalRoutes = require('../src/api/routes/customerPortalRoutes');
const {
  TEMPLATE_IDS,
  buildTemplatePayload,
  sendTransactionalOrderEmail,
  listOrderNotifications,
} = require('../src/api/services/notifications/transactionalEmailService');

describe('Transactional SMTP Email Engine & Outbox Governance (Option A)', () => {
  let server;
  let baseUrl;
  const authHeaders = {
    'Content-Type': 'application/json',
    'x-marketplace-token': 'ppos-dev-secret-2026',
    'x-ppos-role': 'CUSTOMER',
    'x-ppos-user-email': 'produccion@editorial-planeta.es',
    'x-ppos-tenant-id': 'tenant-editorial-planeta',
  };

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/customer', customerPortalRoutes);

    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('1. Builds all 3 industrial HTML/Text templates and attaches DIN A4 Imprimatur PDF on IMPRIMATUR_SIGNED_ESCROW_LOCKED', () => {
    const sampleOrder = {
      orderId: 'ORD_2026_103',
      title: 'Offset Imposition & PUR Binding Technical Manual',
      isbn: '978-84-19022-44-1',
      specs: {
        trimWidthMm: 170,
        trimHeightMm: 240,
        interior_pages: 256,
        paper_weight_interior: 90,
        calculatedSpineMm: 15.2,
      },
      shipment: {
        carrier: 'Dachser European Logistics B2B',
        tracking_number: 'DACHSER-EU-778899',
        sscc18: '(00) 3 8412345 000010492 1',
      },
    };

    // Template 1: ASSETS_READY_FOR_3D_PROOF
    const tpl1 = buildTemplatePayload(TEMPLATE_IDS.ASSETS_READY_FOR_3D_PROOF, sampleOrder);
    expect(tpl1.subject).toContain('ORD_2026_103');
    expect(tpl1.html).toContain('https://budget.printprice.pro/order/ORD_2026_103/files');
    expect(tpl1.html).toContain('170 × 240 mm');
    expect(tpl1.html).toContain('15.20 mm');
    expect(tpl1.attachments).toHaveLength(0);

    // Template 2: IMPRIMATUR_SIGNED_ESCROW_LOCKED (with attached DIN A4 PDF)
    const tpl2 = buildTemplatePayload(TEMPLATE_IDS.IMPRIMATUR_SIGNED_ESCROW_LOCKED, sampleOrder, {
      recipientEmail: 'produccion@editorial-planeta.es',
    });
    expect(tpl2.subject).toContain('CERT-SP-2026-');
    expect(tpl2.html).toContain('FUNDS_LOCKED_ON_PROOF_APPROVAL');
    expect(tpl2.proofSignatureHash).toMatch(/^SHA256:[a-f0-9]{64}$/);
    expect(tpl2.attachments).toHaveLength(1);
    expect(tpl2.attachments[0].filename).toBe('Imprimatur_Certificate_ORD_2026_103.pdf');
    expect(tpl2.attachments[0].contentType).toBe('application/pdf');
    expect(Buffer.isBuffer(tpl2.attachments[0].content)).toBe(true);
    expect(tpl2.attachments[0].content.toString('latin1').startsWith('%PDF-1.4')).toBe(true);

    // Template 3: ORDER_SHIPPED_POD_DISPATCH
    const tpl3 = buildTemplatePayload(TEMPLATE_IDS.ORDER_SHIPPED_POD_DISPATCH, sampleOrder);
    expect(tpl3.subject).toContain('Dachser European Logistics B2B');
    expect(tpl3.html).toContain('DACHSER-EU-778899');
    expect(tpl3.html).toContain('(00) 3 8412345 000010492 1');
    expect(tpl3.html).toContain('https://budget.printprice.pro/portal/tracking/ORD_2026_103');
  });

  it('2. Auto-dispatches notifications on 3D Soft-Proof approval and Stage 05 transition, and exposes GET/POST /notifications endpoints', async () => {
    // 2A. Approve 3D Soft-Proof -> triggers IMPRIMATUR_SIGNED_ESCROW_LOCKED with PDF attachment
    const approveRes = await fetch(
      `${baseUrl}/api/customer/orders/ORD_2026_103/soft-proof/approve`,
      {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          comments: 'Approved for press with automatic SMTP notification.',
          approvedBy: 'produccion@editorial-planeta.es',
          geometry: {
            trimWidthMm: 170,
            trimHeightMm: 240,
            spineThicknessMm: 15.2,
            bleedMarginMm: 3.0,
          },
        }),
      }
    );
    expect(approveRes.status).toBe(200);
    const approveBody = await approveRes.json();
    expect(approveBody.ok).toBe(true);
    expect(approveBody.notification).toBeTruthy();
    expect(approveBody.notification.templateId).toBe('IMPRIMATUR_SIGNED_ESCROW_LOCKED');
    expect(approveBody.notification.attachmentsCount).toBe(1);
    expect(approveBody.notification.deliveryHash).toMatch(/^SHA256:[a-f0-9]{64}$/);

    // 2B. Transition order to Stage 05 (SHIPPED) -> triggers ORDER_SHIPPED_POD_DISPATCH
    const stage5Res = await fetch(`${baseUrl}/api/customer/orders/ORD_2026_103/stage`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        status: 'SHIPPED',
        shipment: {
          carrier: 'Dachser European Logistics B2B',
          tracking_number: 'DACHSER-EU-554433',
        },
      }),
    });
    expect(stage5Res.status).toBe(200);
    const stage5Body = await stage5Res.json();
    expect(stage5Body.ok).toBe(true);
    expect(stage5Body.notification).toBeTruthy();
    expect(stage5Body.notification.templateId).toBe('ORDER_SHIPPED_POD_DISPATCH');

    // 2C. On-demand POST /api/customer/orders/:orderId/notifications/send for ASSETS_READY_FOR_3D_PROOF
    const manualSendRes = await fetch(
      `${baseUrl}/api/customer/orders/ORD_2026_103/notifications/send`,
      {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          templateId: 'ASSETS_READY_FOR_3D_PROOF',
          recipientEmail: 'editor-jefe@editorial-planeta.es',
          forceSimulate: true,
        }),
      }
    );
    expect(manualSendRes.status).toBe(200);
    const manualSendBody = await manualSendRes.json();
    expect(manualSendBody.ok).toBe(true);
    expect(manualSendBody.notification.templateId).toBe('ASSETS_READY_FOR_3D_PROOF');
    expect(manualSendBody.notification.recipient).toBe('editor-jefe@editorial-planeta.es');
    expect(manualSendBody.notification.simulated).toBe(true);

    // 2D. Query GET /api/customer/orders/:orderId/notifications outbox history
    const listRes = await fetch(
      `${baseUrl}/api/customer/orders/ORD_2026_103/notifications`,
      { headers: authHeaders }
    );
    expect(listRes.status).toBe(200);
    const listBody = await listRes.json();
    expect(listBody.ok).toBe(true);
    expect(listBody.count).toBeGreaterThanOrEqual(3);
    const templatesSent = listBody.notifications.map((n) => n.templateId);
    expect(templatesSent).toContain('IMPRIMATUR_SIGNED_ESCROW_LOCKED');
    expect(templatesSent).toContain('ORDER_SHIPPED_POD_DISPATCH');
    expect(templatesSent).toContain('ASSETS_READY_FOR_3D_PROOF');
  });
});

