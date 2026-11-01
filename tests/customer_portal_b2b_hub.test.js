import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-b2b-portal-verification-key-32b';
process.env.PPOS_CONTROL_TOKEN = process.env.PPOS_CONTROL_TOKEN || 'ppos-dev-secret-2026';
const express = require('express');

const customerPortalRoutes = require('../src/api/routes/customerPortalRoutes');
const marketplaceOrdersRoutes = require('../src/api/routes/marketplaceOrders');
const escrowRoutes = require('../src/api/routes/escrowRoutes');

describe('B2B Customer Self-Service Hub — End-to-End Transactional Verification', () => {
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
    app.use('/api/marketplace/orders', marketplaceOrdersRoutes);
    app.use('/api/financials/escrow', escrowRoutes);

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

  it('1. Lists historical B2B orders and performs 1-Click Reprint cloning technical specs and bypassing preflight with approved PDFs', async () => {
    // Step 1A: List historical orders
    const listRes = await fetch(`${baseUrl}/api/customer/orders?email=produccion@editorial-planeta.es`, {
      headers: authHeaders,
    });
    expect(listRes.status).toBe(200);
    const listBody = await listRes.json();
    expect(listBody.ok).toBe(true);
    expect(Array.isArray(listBody.orders)).toBe(true);
    expect(listBody.orders.length).toBeGreaterThanOrEqual(2);

    const sourceOrder = listBody.orders[0];
    expect(sourceOrder.orderId).toMatch(/^ORD_/);
    expect(sourceOrder.preflightBypassEligible).toBe(true);
    expect(Array.isArray(sourceOrder.approvedFiles)).toBe(true);
    expect(sourceOrder.approvedFiles.length).toBeGreaterThanOrEqual(2);

    // Step 1B: Execute 1-Click Reorder ("Re-order / Nueva Edición") for 1,500 copies
    const reorderRes = await fetch(`${baseUrl}/api/customer/orders/${sourceOrder.orderId}/reorder`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        copies: 1500,
        bookTitle: `${sourceOrder.bookTitle} — 2ª Edición`,
        reuseApprovedFiles: true,
      }),
    });
    expect(reorderRes.status).toBe(201);
    const reorderData = await reorderRes.json();
    expect(reorderData.ok).toBe(true);
    expect(reorderData.reprintSummary.sourceOrderId).toBe(sourceOrder.orderId);
    expect(reorderData.reprintSummary.newCopies).toBe(1500);
    expect(reorderData.reprintSummary.preflightBypassed).toBe(true);
    expect(reorderData.reprintSummary.reusedFilesCount).toBe(sourceOrder.approvedFiles.length);

    // Verify technical specifications were cloned identically except for the new copy count
    const clonedOrder = reorderData.order;
    expect(clonedOrder.orderId).toMatch(/^ORD_/);
    expect(clonedOrder.specs.copies).toBe(1500);
    expect(clonedOrder.specs.book_size).toBe(sourceOrder.specs.book_size);
    expect(clonedOrder.specs.interior_pages).toBe(sourceOrder.specs.interior_pages);
    expect(clonedOrder.specs.binding_method).toBe(sourceOrder.specs.binding_method);
    expect(clonedOrder.specs.paper_weight_interior).toBe(sourceOrder.specs.paper_weight_interior);
    expect(clonedOrder.totalPriceEur).toBeGreaterThan(0);
    expect(clonedOrder.reconciliationCode).toMatch(/^PPOS-ORD-/);

    // Step 1C: Execute New Edition Reorder with modified PDFs (reuseApprovedFiles: false -> FILES_REQUIRED)
    const revisedReorderRes = await fetch(`${baseUrl}/api/customer/orders/${sourceOrder.orderId}/reorder`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        copies: 2000,
        reprintPurpose: 'NEW_EDITION_REVISED_FILES',
        bookTitle: `${sourceOrder.bookTitle} — Revised 3rd Edition`,
        isbn: '978-84-08-99999-1',
        interiorPages: 336,
        reuseApprovedFiles: false,
      }),
    });
    expect(revisedReorderRes.status).toBe(201);
    const revisedData = await revisedReorderRes.json();
    expect(revisedData.ok).toBe(true);
    expect(revisedData.reprintSummary.reprintPurpose).toBe('NEW_EDITION_REVISED_FILES');
    expect(revisedData.reprintSummary.preflightBypassed).toBe(false);
    expect(revisedData.order.status).toBe('FILES_REQUIRED');
    expect(revisedData.order.preflightBypassEligible).toBe(false);
    expect(revisedData.order.approvedFiles).toHaveLength(0);
    expect(revisedData.order.specs.interior_pages).toBe(336);
    expect(revisedData.order.specs.isbn).toBe('978-84-08-99999-1');
  });

  it('2. Generates dual Checkout Sessions (B2B Bank Transfer with PPOS-ORD-... reconciliation + Stripe Card/SEPA) and ingests Wire Transfer Proof', async () => {
    const testOrderId = 'ORD_2026_8912';

    // Step 2A: Create B2B Bank Transfer checkout session (Modality A Escrow MoR)
    const bankSessionRes = await fetch(`${baseUrl}/api/marketplace/orders/${testOrderId}/checkout/session`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        paymentMethod: 'BANK_TRANSFER_B2B',
        modality: 'MODALITY_A_ESCROW_MOR',
        amountGrossCents: 468000,
        currency: 'EUR',
      }),
    });
    expect([200, 201]).toContain(bankSessionRes.status);
    const bankSession = await bankSessionRes.json();
    expect(bankSession.status).toBe('AWAITING_BANK_TRANSFER');
    expect(bankSession.bankTransferInstructions).toBeDefined();
    expect(bankSession.bankTransferInstructions.referenceCode).toBe(`PPOS-${testOrderId}`);
    expect(bankSession.bankTransferInstructions.iban).toContain('ES91');

    // Step 2B: Create Stripe Card / SEPA Direct Debit B2B checkout session
    const stripeSessionRes = await fetch(`${baseUrl}/api/marketplace/orders/${testOrderId}/checkout/session`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        paymentMethod: 'STRIPE_SEPA',
        modality: 'MODALITY_A_ESCROW_MOR',
        amountGrossCents: 468000,
        currency: 'EUR',
      }),
    });
    expect([200, 201]).toContain(stripeSessionRes.status);
    const stripeSession = await stripeSessionRes.json();
    expect(stripeSession.status).toBe('SESSION_CREATED');
    expect(stripeSession.sessionId).toBeTruthy();
    expect(Array.isArray(stripeSession.paymentMethodTypes)).toBe(true);
    expect(stripeSession.paymentMethodTypes).toContain('sepa_debit');

    // Step 2C: Upload Wire Transfer Proof to unlock fast-track production
    const proofRes = await fetch(`${baseUrl}/api/marketplace/orders/${testOrderId}/payment/wire-proof`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        fileName: 'resguardo_sepa_ord_8912.pdf',
        bankReference: 'SEPA-2026-998123',
        reconciliationCode: `PPOS-${testOrderId}`,
        amountEur: 4680.0,
        uploadedByEmail: 'produccion@editorial-planeta.es',
      }),
    });
    expect([200, 201]).toContain(proofRes.status);
    const proofData = await proofRes.json();
    expect(proofData.ok).toBe(true);
    expect(proofData.status).toBe('PAYMENT_PROOF_UNDER_REVIEW');
    expect(proofData.orderStatus).toBe('IN_PRODUCTION');
    expect(proofData.reconciliationCode).toBe(`PPOS-${testOrderId}`);

    // Step 2D: Trigger Stripe/Payment Confirmation Webhook to lock Escrow & confirm payment
    const webhookRes = await fetch(`${baseUrl}/api/marketplace/orders/${testOrderId}/payment/webhook`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        stripePaymentIntentId: 'pi_live_b2b_8912_confirmed',
        confirmedBy: 'STRIPE_WEBHOOK',
      }),
    });
    expect(webhookRes.status).toBe(200);
    const webhookData = await webhookRes.json();
    expect(webhookData.ok).toBe(true);
    expect(webhookData.paymentStatus).toBe('CONFIRMED');
    expect(webhookData.operationalStatus).toBe('READY_FOR_PRODUCTION');
  });

  it('3. Validates EU VIES VAT fiscal data, manages dock requirements, downloads normative EN 16931 XML e-Invoices, and syncs 5-stage workshop transitions', async () => {
    // Step 3A: Update Fiscal Profile with EU VIES VAT + DIR3 + Leitweg-ID + Dock logistics
    const profileRes = await fetch(`${baseUrl}/api/customer/profile`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({
        email: 'produccion@editorial-planeta.es',
        fiscalProfile: {
          legalEntityName: 'Editorial Planeta S.A.U.',
          taxIdVat: 'ESA08186249',
          fiscalStreet: 'Av. Diagonal 662-664',
          fiscalPostalCode: '08034',
          fiscalCity: 'Barcelona',
          fiscalCountryCode: 'ES',
          billingEmail: 'facturacion@planeta.es',
          dir3Code: 'EA0038291',
          leitwegId: '04011000-1234512345-06',
          preferredEInvoiceFormat: 'FACTURAE_3_2_2',
        },
      }),
    });
    expect(profileRes.status).toBe(200);
    const profileData = await profileRes.json();
    expect(profileData.ok).toBe(true);
    expect(profileData.profile.fiscalProfile.viesStatus.valid).toBe(true);
    expect(profileData.profile.fiscalProfile.viesStatus.countryCode).toBe('ES');
    expect(profileData.profile.fiscalProfile.dir3Code).toBe('EA0038291');
    expect(profileData.profile.fiscalProfile.leitwegId).toBe('04011000-1234512345-06');

    // Step 3B: Download Spanish Facturae 3.2.2 XML (verify injected BuyerParty fiscal data)
    const facturaeRes = await fetch(
      `${baseUrl}/api/financials/escrow/ORD_2026_101/e-invoice.xml?format=FACTURAE_3_2_2&raw=true`,
      { headers: { ...authHeaders, 'x-customer-email': 'produccion@editorial-planeta.es' } }
    );
    expect(facturaeRes.status).toBe(200);
    const facturaeXml = await facturaeRes.text();
    expect(facturaeXml).toContain('<fe:Facturae');
    expect(facturaeXml).toContain('<SchemaVersion>3.2.2</SchemaVersion>');
    expect(facturaeXml).toContain('<BuyerParty>');
    expect(facturaeXml).toContain('Editorial Planeta S.A.U.');
    expect(facturaeXml).toContain('ESA08186249');
    expect(facturaeXml).toContain('EA0038291');

    // Step 3C: Download European XRechnung 3.0 (UBL 2.1) XML (verify injected AccountingCustomerParty)
    const xrechnungRes = await fetch(
      `${baseUrl}/api/financials/escrow/ORD_2026_101/e-invoice.xml?format=XRECHNUNG_3_0&raw=true`,
      { headers: { ...authHeaders, 'x-customer-email': 'produccion@editorial-planeta.es' } }
    );
    expect(xrechnungRes.status).toBe(200);
    const xrechnungXml = await xrechnungRes.text();
    expect(xrechnungXml).toContain('<ubl:Invoice');
    expect(xrechnungXml).toContain('xrechnung_3.0');
    expect(xrechnungXml).toContain('<cac:AccountingCustomerParty>');
    expect(xrechnungXml).toContain('Editorial Planeta S.A.U.');
    expect(xrechnungXml).toContain('04011000-1234512345-06');

    // Step 3C-bis: Unknown order returns strict 404 (no silent fallback to ORD-2026-8841)
    const notFoundInvoiceRes = await fetch(
      `${baseUrl}/api/financials/escrow/ORD_NON_EXISTENT_999999/e-invoice.xml?format=FACTURAE_3_2_2`,
      { headers: authHeaders }
    );
    expect(notFoundInvoiceRes.status).toBe(404);

    // Step 3D: Verify 5-Stage Live Logistics & Signed POD Telemetry
    const trackingRes = await fetch(`${baseUrl}/api/customer/orders/ORD_2026_101/tracking`, {
      headers: authHeaders,
    });
    expect(trackingRes.status).toBe(200);
    const trackingBody = await trackingRes.json();
    expect(trackingBody.ok).toBe(true);
    expect(trackingBody.timeline).toHaveLength(5);
    expect(trackingBody.pod.available).toBe(true);
    expect(trackingBody.pod.digitalSignatureHash).toContain('eIDAS-SHA256');

    // Step 3E: Advance Workshop Stage from Stage 2 (On Press) -> Stage 3 (Binding) -> Stage 4 (Palletization) -> Stage 5 (In Transit)
    const stage3Res = await fetch(`${baseUrl}/api/customer/orders/ORD_2026_101/stage`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        stage: 'STAGE_03_BINDING',
        operatorNotes: 'PUR reactive binding started on Muller Martini line',
      }),
    });
    expect(stage3Res.status).toBe(200);
    const stage3Body = await stage3Res.json();
    expect(stage3Body.ok).toBe(true);
    expect(stage3Body.activeStageIndex).toBe(3);
    expect(stage3Body.tracking.activeStageIndex).toBe(3);

    const stage5Res = await fetch(`${baseUrl}/api/customer/orders/ORD_2026_101/stage`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        status: 'SHIPPED',
        shipment: {
          carrier: 'Dachser European Logistics B2B',
          tracking_number: 'DACHSER-EU-991044',
        },
      }),
    });
    expect(stage5Res.status).toBe(200);
    const stage5Body = await stage5Res.json();
    expect(stage5Body.ok).toBe(true);
    expect(stage5Body.activeStageIndex).toBe(5);
    expect(stage5Body.status).toBe('IN_TRANSIT');
    expect(stage5Body.tracking.carrier.trackingNumber).toBe('DACHSER-EU-991044');
  });
});
