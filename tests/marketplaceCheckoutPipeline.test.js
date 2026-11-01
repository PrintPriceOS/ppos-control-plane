import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const mysqlClient = require('../src/api/services/mysqlClient');
const marketplaceOrderService = require('../src/api/services/marketplaceOrderService');
const marketplaceOrderFileService = require('../src/api/services/marketplaceOrderFileService');
const marketplaceInvoicePaymentService = require('../src/api/services/marketplaceInvoicePaymentService');
const escrowSettlementService = require('../src/api/services/financials/escrowSettlementService');

describe('PrintPrice OS — PHASE-15: Marketplace Order Pipeline, Dual Checkout & Commercial Settlement Engine', () => {
    let mockOrdersTable = [];
    let mockOrderFilesTable = [];
    let mockOrderEventsTable = [];
    let mockSettlementsTable = [];

    beforeEach(() => {
        mockOrdersTable = [];
        mockOrderFilesTable = [];
        mockOrderEventsTable = [];
        mockSettlementsTable = [];

        vi.spyOn(mysqlClient, 'query').mockImplementation(async (sql, params = []) => {
            const q = String(sql).trim();

            if (q.startsWith('SELECT order_id FROM marketplace_orders WHERE order_id = ?')) {
                const found = mockOrdersTable.filter(
                    r => r.order_id === params[0] || (r.external_order_ref && r.external_order_ref === params[1])
                );
                return found;
            }

            if (q.startsWith('INSERT INTO marketplace_orders')) {
                const row = {
                    order_id: params[0],
                    external_order_ref: params[1],
                    pricing_session_id: params[2],
                    session_id: params[3],
                    selected_offer_id: params[4],
                    customer_id: params[5],
                    tenant_id: params[6],
                    printhouse_id: params[7],
                    status: params[8],
                    currency: params[9],
                    estimated_price: params[10],
                    subtotal_manufacturing_eur: params[11],
                    packaging_handling_eur: params[12],
                    shipping_freight_eur: params[13],
                    tax_rate_pct: params[14],
                    tax_amount_eur: params[15],
                    total_amount_eur: params[16],
                    payment_method: params[17],
                    payment_status: params[18],
                    bank_transfer_reference: params[19],
                    settlement_modality: params[20],
                    platform_fee_pct: params[21],
                    platform_fee_eur: params[22],
                    net_printhouse_payout_eur: params[23],
                    escrow_status: params[24],
                    book_spec_json: params[25],
                    selected_offer_json: params[26],
                    customer_json: params[27],
                    readiness_json: params[28],
                    metadata_json: params[29],
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                };
                mockOrdersTable.push(row);
                return { affectedRows: 1 };
            }

            if (q.startsWith('SELECT * FROM marketplace_orders WHERE order_id = ?')) {
                return mockOrdersTable.filter(r => r.order_id === params[0] || r.external_order_ref === params[0]);
            }

            if (q.startsWith('SELECT * FROM marketplace_orders WHERE 1=1')) {
                let rows = [...mockOrdersTable];
                if (q.includes('printhouse_id IN')) {
                    rows = rows.filter(r => params.includes(r.printhouse_id) || params.includes(r.tenant_id));
                }
                return rows;
            }

            if (q.startsWith('UPDATE marketplace_orders')) {
                const orderId = params[params.length - 1];
                const row = mockOrdersTable.find(r => r.order_id === orderId || r.external_order_ref === orderId);
                if (row) {
                    if (q.includes('SET readiness_json = ?, status = ?')) {
                        row.readiness_json = params[0];
                        row.status = params[1];
                    } else if (q.includes("SET status = 'FILES_REQUIRED'")) {
                        row.status = 'FILES_REQUIRED';
                    } else if (q.includes('SET payment_method = ?')) {
                        row.payment_method = params[0];
                        row.payment_status = params[1];
                        row.stripe_checkout_session_id = params[2];
                        row.stripe_payment_intent_id = params[3];
                        row.bank_transfer_reference = params[4];
                        row.settlement_modality = params[5];
                        row.platform_fee_pct = params[6];
                        row.platform_fee_eur = params[7];
                        row.net_printhouse_payout_eur = params[8];
                        row.escrow_status = params[9];
                        row.metadata_json = params[10];
                    } else if (q.includes("SET payment_status = 'CONFIRMED'")) {
                        row.payment_status = 'CONFIRMED';
                        row.escrow_status = params[0];
                        row.stripe_payment_intent_id = params[1] || row.stripe_payment_intent_id;
                        row.status = 'READY_FOR_PRODUCTION';
                        row.metadata_json = params[2];
                    } else if (q.includes('SET metadata_json = ?, status = ?')) {
                        row.metadata_json = params[0];
                        row.status = params[1];
                    } else if (q.includes('SET metadata_json = ?')) {
                        row.metadata_json = params[0];
                    }
                }
                return { affectedRows: row ? 1 : 0 };
            }

            if (q.startsWith('SELECT * FROM marketplace_order_files WHERE order_id = ? AND role = ?')) {
                return mockOrderFilesTable.filter(f => f.order_id === params[0] && f.role === params[1]);
            }

            if (q.startsWith('SELECT * FROM marketplace_order_files WHERE order_id = ?')) {
                return mockOrderFilesTable.filter(f => f.order_id === params[0]);
            }

            if (q.startsWith('INSERT INTO marketplace_order_files')) {
                if (q.includes("'REQUIRED'")) {
                    mockOrderFilesTable.push({
                        file_id: params[0],
                        order_id: params[1],
                        role: params[2],
                        version: 1,
                        original_name: params[3],
                        mime_type: 'application/pdf',
                        size_bytes: 0,
                        status: 'REQUIRED',
                        findings_count: 0,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    });
                } else {
                    mockOrderFilesTable.push({
                        file_id: params[0],
                        order_id: params[1],
                        role: params[2],
                        version: 1,
                        original_name: params[3],
                        mime_type: params[4],
                        size_bytes: params[5],
                        checksum_sha256: params[6],
                        storage_path: params[7],
                        source_type: params[8] || 'DIRECT_UPLOAD',
                        external_url: params[9] || null,
                        ingestion_status: params[10] || 'COMPLETED',
                        metadata_json: params[11] || null,
                        status: 'UPLOADED',
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    });
                }
                return { affectedRows: 1 };
            }

            if (q.startsWith('UPDATE marketplace_order_files')) {
                const fileId = params[params.length - 1];
                const fileRow = mockOrderFilesTable.find(f => f.file_id === fileId);
                if (fileRow && q.includes("status = 'UPLOADED'")) {
                    fileRow.original_name = params[0];
                    fileRow.mime_type = params[1];
                    fileRow.size_bytes = params[2];
                    fileRow.checksum_sha256 = params[3];
                    fileRow.storage_path = params[4];
                    fileRow.source_type = params[5] || 'DIRECT_UPLOAD';
                    fileRow.external_url = params[6] || null;
                    fileRow.ingestion_status = params[7] || 'COMPLETED';
                    fileRow.status = 'UPLOADED';
                }
                return { affectedRows: fileRow ? 1 : 0 };
            }

            if (q.startsWith('INSERT INTO marketplace_order_events')) {
                mockOrderEventsTable.push({
                    event_id: params[0],
                    order_id: params[1],
                    file_id: params[2],
                    type: params[3],
                    actor_type: params[4],
                    actor_id: params[5],
                    payload_json: params[6],
                    created_at: new Date().toISOString()
                });
                return { affectedRows: 1 };
            }

            if (q.startsWith('SELECT * FROM marketplace_order_events WHERE order_id = ?')) {
                return mockOrderEventsTable.filter(e => e.order_id === params[0]);
            }

            if (q.startsWith('SELECT * FROM marketplace_order_preflight_bindings WHERE order_id = ?')) {
                return [];
            }

            if (q.startsWith('INSERT INTO partner_settlement_records')) {
                mockSettlementsTable.push({ id: params[0], orderId: params[3] });
                return { affectedRows: 1 };
            }

            return [];
        });
    });

    it('1. Creates a unified Marketplace Order with ORD_ external_order_ref, financial breakdown, and initial REQUIRED file slots', async () => {
        const created = await marketplaceOrderService.createOrder({
            orderId: 'ORD_1775001234_ABCD12',
            externalOrderRef: 'ORD_1775001234_ABCD12',
            pricingSessionId: 'psess-phase15-001',
            sessionId: 'sess-phase15-001',
            tenantId: 'tenant-graficas-latinas',
            printhouseId: 'ph-graficas-latinas-01',
            selectedOfferId: 'off-001',
            customer: { name: 'Editorial Planeta Sur', email: 'produccion@planetasur.es' },
            bookSpec: { format: '150x230', copies: 1000, interior_pages: 256, binding_method: 'PUR' },
            selectedOffer: {
                offerId: 'off-001',
                printhouseId: 'ph-graficas-latinas-01',
                printerName: 'Gráficas Latinas S.A.',
                totalPrice: 2200.0,
                leadTimeDays: 6
            },
            subtotalManufacturingEur: 2200.0,
            packagingHandlingEur: 100.0,
            shippingFreightEur: 200.0,
            taxRatePct: 21.0,
            settlementModality: 'MODALITY_A_ESCROW_MOR',
            platformFeePct: 10.0,
            paymentMethod: 'BANK_TRANSFER_B2B'
        });

        expect(created).toBeDefined();
        expect(created.orderIntentId).toBe('ORD_1775001234_ABCD12');
        expect(created.externalOrderRef).toBe('ORD_1775001234_ABCD12');
        expect(created.tenantId).toBe('tenant-graficas-latinas');
        expect(created.printhouse.assignedPrinthouseId).toBe('ph-graficas-latinas-01');

        // Verify strict separation: Manufacturing (2200) + Packaging (100) + Shipping (200) = 2500 Net + 21% VAT (525) = 3025 Total
        expect(created.totals.subtotal).toBe(2200.0);
        expect(created.totals.packaging).toBe(100.0);
        expect(created.totals.shipping).toBe(200.0);
        expect(created.totals.tax).toBe(525.0);
        expect(created.totals.total).toBe(3025.0);

        // Verify Settlement calculation (10% of 2200 manufacturing = 220 EUR fee; Net PH = 2200 + 100 - 220 = 2080 EUR)
        expect(created.settlement.modality).toBe('MODALITY_A_ESCROW_MOR');
        expect(created.settlement.platformFeeEur).toBe(220.0);
        expect(created.settlement.netPrinthousePayoutEur).toBe(2080.0);

        // Verify initial file slots are REQUIRED (not falsely UPLOADED)
        expect(created.productionFiles).toHaveLength(2);
        expect(created.productionFiles.every(f => f.status === 'REQUIRED')).toBe(true);
    });

    it('2. Ingests both Binary PDF Uploads and External Links (with anti-SSRF validation) and transitions order to FILES_UPLOADED', async () => {
        await marketplaceOrderService.createOrder({
            orderId: 'ORD_1775009999_FILES',
            pricingSessionId: 'psess-phase15-002',
            sessionId: 'sess-phase15-002',
            tenantId: 'tenant-graficas-latinas',
            printhouseId: 'ph-graficas-latinas-01',
            selectedOfferId: 'off-002',
            customer: { name: 'Ediciones Norte', email: 'arte@edicionesnorte.es' },
            bookSpec: { format: '170x240', copies: 500, interior_pages: 192, binding_method: 'PUR' },
            selectedOffer: { offerId: 'off-002', printhouseId: 'ph-graficas-latinas-01', totalPrice: 1500 }
        });

        // 2A. Reject SSRF private IP external link
        await expect(
            marketplaceOrderFileService.registerExternalFileLink('ORD_1775009999_FILES', {
                role: 'INTERIOR_PDF',
                externalUrl: 'https://169.254.169.254/latest/meta-data/'
            })
        ).rejects.toThrow(/SSRF_BLOCKED/);

        // 2B. Accept valid HTTPS external link for INTERIOR_PDF
        const extResult = await marketplaceOrderFileService.registerExternalFileLink('ORD_1775009999_FILES', {
            role: 'INTERIOR_PDF',
            externalUrl: 'https://cdn.printprice.pro/assets/ORD_1775009999_FILES_interior.pdf',
            originalName: 'interior_final_v2.pdf',
            skipNetworkValidation: true
        });

        expect(extResult.ok).toBe(true);
        expect(extResult.role).toBe('INTERIOR_PDF');
        expect(extResult.sourceType).toBe('EXTERNAL_LINK');
        expect(extResult.status).toBe('UPLOADED');

        // 2C. Upload binary PDF for COVER_PDF
        const pdfBuffer = Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF', 'utf-8');
        const uploadResult = await marketplaceOrderFileService.uploadBinaryFile('ORD_1775009999_FILES', {
            role: 'COVER_PDF',
            buffer: pdfBuffer,
            originalName: 'cover_spread_cmyk.pdf',
            mimeType: 'application/pdf'
        });

        expect(uploadResult.ok).toBe(true);
        expect(uploadResult.role).toBe('COVER_PDF');
        expect(uploadResult.checksumSha256).toHaveLength(64);

        const updatedOrder = await marketplaceOrderService.getOrder('ORD_1775009999_FILES');
        expect(updatedOrder.status).toBe('FILES_UPLOADED');
        expect(updatedOrder.productionFiles.every(f => f.status === 'UPLOADED')).toBe(true);
    });

    it('3. Executes Dual Checkout (Stripe Card/SEPA & B2B Bank Transfer) and transitions order on Payment Confirmation', async () => {
        await marketplaceOrderService.createOrder({
            orderId: 'ORD_1775008888_PAY',
            pricingSessionId: 'psess-phase15-003',
            sessionId: 'sess-phase15-003',
            tenantId: 'tenant-graficas-latinas',
            printhouseId: 'ph-graficas-latinas-01',
            selectedOfferId: 'off-003',
            customer: { name: 'Grupo Editorial Ibérico', email: 'pagos@grupoiberico.es' },
            bookSpec: { format: '150x230', copies: 2000, interior_pages: 320, binding_method: 'HARDCOVER' },
            selectedOffer: { offerId: 'off-003', printhouseId: 'ph-graficas-latinas-01', totalPrice: 4000 },
            subtotalManufacturingEur: 4000.0
        });

        // 3A. Create Stripe Checkout Session (Modality B: Direct Commission)
        const stripeCheckout = await marketplaceInvoicePaymentService.createMarketplaceOrderCheckoutSession('ORD_1775008888_PAY', {
            paymentMethod: 'STRIPE_CARD',
            settlementModality: 'MODALITY_B_DIRECT_COMMISSION',
            platformFeePct: 10
        });

        expect(stripeCheckout.ok).toBe(true);
        expect(stripeCheckout.paymentMethod).toBe('STRIPE_CARD');
        expect(stripeCheckout.settlementModality).toBe('MODALITY_B_DIRECT_COMMISSION');
        expect(stripeCheckout.checkout.checkoutUrl).toBeTruthy();

        // 3B. Create B2B Bank Transfer Checkout Session (Modality A: Escrow MoR)
        const wireCheckout = await marketplaceInvoicePaymentService.createMarketplaceOrderCheckoutSession('ORD_1775008888_PAY', {
            paymentMethod: 'BANK_TRANSFER_B2B',
            settlementModality: 'MODALITY_A_ESCROW_MOR',
            platformFeePct: 10
        });

        expect(wireCheckout.ok).toBe(true);
        expect(wireCheckout.paymentMethod).toBe('BANK_TRANSFER_B2B');
        expect(wireCheckout.paymentStatus).toBe('AWAITING_WIRE');
        expect(wireCheckout.checkout.instructions.reference).toMatch(/^PPOS-ORD-/);
        expect(wireCheckout.checkout.instructions.iban).toBeTruthy();

        // 3C. Confirm payment (simulating Stripe Webhook / Admin Wire Confirmation)
        const confirmedRes = await marketplaceInvoicePaymentService.confirmMarketplaceOrderPayment('ORD_1775008888_PAY', {
            bankTransferReference: wireCheckout.checkout.instructions.reference,
            confirmedBy: 'ADMIN_FINANCE'
        });

        expect(confirmedRes.ok).toBe(true);
        expect(confirmedRes.paymentStatus).toBe('CONFIRMED');
        expect(confirmedRes.operationalStatus).toBe('READY_FOR_PRODUCTION');
        expect(confirmedRes.escrowStatus).toBe('ESCROW_FUNDED');
    });

    it('4. Computes and persists Dual Commercial Settlement (Modality A Escrow MoR vs Modality B Direct Commission)', async () => {
        // Modality A: PrintPrice Escrow Merchant of Record
        const lockedModalityA = escrowSettlementService.lockEscrowFundsOnProofApproval(
            {
                orderId: 'ORD_1775007777_MOD_A',
                title: 'Catálogo Industrial 2026 (Modality A)',
                grossEscrowEur: 3400.0,
                packagingShareEur: 150.0,
                freightShareEur: 250.0,
                platformFeePct: 10.0,
                settlementModality: 'MODALITY_A_ESCROW_MOR'
            },
            { tenantId: 'tenant-graficas-latinas' }
        );

        expect(lockedModalityA.ok).toBe(true);
        expect(lockedModalityA.escrow.settlementModality).toBe('MODALITY_A_ESCROW_MOR');
        expect(lockedModalityA.escrow.platformFeeEur).toBe(340.0);
        expect(lockedModalityA.escrow.netPrinthousePayoutEur).toBe(2810.0);

        // Modality B: Direct PrintHouse Commission (Envato / Marketplace Facilitator)
        const lockedModalityB = escrowSettlementService.lockEscrowFundsOnProofApproval(
            {
                orderId: 'ORD_1775007777_MOD_B',
                title: 'Novela Contemporánea (Modality B)',
                grossEscrowEur: 2000.0,
                packagingShareEur: 100.0,
                freightShareEur: 150.0,
                platformFeePct: 10.0,
                settlementModality: 'MODALITY_B_DIRECT_COMMISSION'
            },
            { tenantId: 'tenant-graficas-latinas' }
        );

        expect(lockedModalityB.ok).toBe(true);
        expect(lockedModalityB.escrow.settlementModality).toBe('MODALITY_B_DIRECT_COMMISSION');
        expect(lockedModalityB.escrow.platformFeeEur).toBe(200.0);
        expect(lockedModalityB.escrow.netPrinthousePayoutEur).toBe(1650.0);
    });

    it('5. Enforces Multi-Tenant & Printhouse Visibility in /ops/marketplace', async () => {
        await marketplaceOrderService.createOrder({
            orderId: 'ORD_TENANT_A',
            pricingSessionId: 'psess-t-a',
            sessionId: 'sess-t-a',
            tenantId: 'tenant-alpha',
            printhouseId: 'ph-alpha-node',
            selectedOfferId: 'off-a',
            customer: { name: 'Alpha Client', email: 'alpha@client.com' },
            bookSpec: { format: 'A5', copies: 100 },
            selectedOffer: { offerId: 'off-a', printhouseId: 'ph-alpha-node', totalPrice: 500 }
        });

        await marketplaceOrderService.createOrder({
            orderId: 'ORD_TENANT_B',
            pricingSessionId: 'psess-t-b',
            sessionId: 'sess-t-b',
            tenantId: 'tenant-beta',
            printhouseId: 'ph-beta-node',
            selectedOfferId: 'off-b',
            customer: { name: 'Beta Client', email: 'beta@client.com' },
            bookSpec: { format: 'A4', copies: 200 },
            selectedOffer: { offerId: 'off-b', printhouseId: 'ph-beta-node', totalPrice: 900 }
        });

        const alphaResult = await marketplaceOrderService.listOrders({
            allowedPrinthouseIds: ['ph-alpha-node'],
            tenantId: 'tenant-alpha'
        });

        expect(alphaResult.ok).toBe(true);
        expect(alphaResult.orders).toHaveLength(1);
        expect(alphaResult.orders[0].orderIntentId).toBe('ORD_TENANT_A');
    });
});
