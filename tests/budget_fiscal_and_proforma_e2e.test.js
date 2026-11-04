/**
 * tests/budget_fiscal_and_proforma_e2e.test.js
 *
 * Vitest E2E Suite for:
 * 1. Fiscal Profile Clean-Slate Enforcement (Zero-Mock for unseeded accounts).
 * 2. Saving Fiscal Profile with VIES Validation.
 * 3. High-End DIN A4 Vector Proforma Invoice PDF Generation with Official Latvian Entity.
 * 4. Absense of legacy mocked entities ("Critical Publishing & Editions S.L.").
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import http from 'http';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const customerPortalRouter = require('../src/api/routes/customerPortalRoutes');
const { generateProformaInvoicePdf, CORPORATE_ISSUER } = require('../src/api/services/publisher/proformaInvoicePdfService');

describe('Budget Fiscal Clean-Slate & High-End Proforma Invoice E2E', () => {
    let app;
    let server;
    let baseUrl;

    beforeAll(async () => {
        app = express();
        app.use(express.json());
        app.use('/api/customer', customerPortalRouter);

        await new Promise((resolve) => {
            server = http.createServer(app);
            server.listen(0, '127.0.0.1', () => {
                const port = server.address().port;
                baseUrl = `http://127.0.0.1:${port}`;
                resolve();
            });
        });
    });

    afterAll(async () => {
        if (server) {
            await new Promise((resolve) => server.close(resolve));
        }
    });

    describe('1. Fiscal Profile Clean-Slate Enforcement', () => {
        it('returns empty strings/nulls and PENDING_COMPLETION for unseeded new account', async () => {
            const res = await fetch(`${baseUrl}/api/customer/profile`, {
                headers: {
                    'x-customer-id': 'test-new-author-unseeded',
                    'x-customer-email': 'author@fresh-debut.eu'
                }
            });

            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.ok).toBe(true);
            expect(data.status).toBe('PENDING_COMPLETION');
            expect(data.profile).toBeDefined();

            const fiscal = data.profile.fiscal;
            expect(fiscal.legalEntityName).toBe('');
            expect(fiscal.taxIdVat).toBe('');
            expect(fiscal.fiscalAddress).toBe('');
            expect(fiscal.postalCode).toBe('');
            expect(fiscal.city).toBe('');
            expect(fiscal.dir3Code).toBeNull();
            expect(fiscal.leitwegId).toBeNull();
            expect(fiscal.viesValidated).toBe(false);

            // Assert absence of any mocked legacy company
            expect(fiscal.legalEntityName).not.toContain('Critical Publishing');
            expect(fiscal.legalEntityName).not.toContain('Penguin Random House');
            expect(fiscal.taxIdVat).not.toBe('ESB87654321');
            expect(fiscal.fiscalAddress).not.toContain('Alcala');
        });

        it('saves valid EU VAT profile and updates VIES validation', async () => {
            const updatePayload = {
                fiscal: {
                    legalEntityName: 'Editorial Acantilado S.L.U.',
                    taxIdVat: 'ESB62145892',
                    fiscalAddress: 'Carrer de Mallorca 244',
                    postalCode: '08008',
                    city: 'Barcelona',
                    country: 'ES',
                    billingEmail: 'facturacion@acantilado-editorial.com'
                }
            };

            const res = await fetch(`${baseUrl}/api/customer/profile`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'x-customer-id': 'test-acantilado-publisher',
                    'x-customer-email': 'facturacion@acantilado-editorial.com'
                },
                body: JSON.stringify(updatePayload)
            });

            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.ok).toBe(true);
            expect(data.profile.fiscal.legalEntityName).toBe('Editorial Acantilado S.L.U.');
            expect(data.profile.fiscal.viesValidated).toBe(true);
            expect(data.vatValidation.valid).toBe(true);
            expect(data.vatValidation.countryCode).toBe('ES');
        });

        it('rejects malformed EU VAT format with 400 Bad Request', async () => {
            const badPayload = {
                fiscal: {
                    legalEntityName: 'Invalid Tax Entity',
                    taxIdVat: '123'
                }
            };

            const res = await fetch(`${baseUrl}/api/customer/profile`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'x-customer-id': 'test-invalid-vat'
                },
                body: JSON.stringify(badPayload)
            });

            expect(res.status).toBe(400);
            const data = await res.json();
            expect(data.ok).toBe(false);
            expect(data.error).toBe('INVALID_EU_VAT_NUMBER');
        });
    });

    describe('2. High-End DIN A4 Vector Proforma Invoice PDF Generation', () => {
        it('generates a valid DIN A4 Vector PDF containing official Latvian corporate data', () => {
            const sampleOrder = {
                orderId: 'ORD_2026_9881',
                reconciliationCode: 'PPOS-ORD-9881',
                bookTitle: 'Architectural Monograph 2026',
                isbn: '978-84-12345-67-8',
                totalPriceEur: 4250.00,
                created_at: '2026-11-04T00:00:00.000Z',
                specs: {
                    title: 'Architectural Monograph 2026',
                    book_size: 'Royal Hardcover (170 x 240 mm)',
                    interior_pages: 256,
                    copies: 1500,
                    paper_type_interior: 'Munken Lynx 120g',
                    paper_type_cover: 'Balacron Dark Grey with Hot Foil'
                },
                offer_print_house: 'Livonia Print AS (ISO 12647-2 Plant)'
            };

            const sampleFiscal = {
                legalEntityName: 'Editorial Acantilado S.L.U.',
                taxIdVat: 'ESB62145892',
                fiscalStreet: 'Carrer de Mallorca 244',
                fiscalPostalCode: '08008',
                fiscalCity: 'Barcelona',
                fiscalCountryCode: 'ES',
                billingEmail: 'facturacion@acantilado-editorial.com'
            };

            const pdfResult = generateProformaInvoicePdf(sampleOrder, {
                fiscalProfile: sampleFiscal
            });

            expect(pdfResult).toBeDefined();
            expect(pdfResult.buffer).toBeInstanceOf(Buffer);
            expect(pdfResult.buffer.length).toBeGreaterThan(4000);

            const pdfAscii = pdfResult.buffer.toString('binary');
            // Must begin with PDF magic header
            expect(pdfAscii.startsWith('%PDF-')).toBe(true);

            // Mandatory Latvian Corporate Identity Checks
            expect(pdfAscii).toContain('Print Price Pro SIA');
            expect(pdfAscii).toContain('40203631570');
            expect(pdfAscii).toContain('LV40203631570');
            expect(pdfAscii).toContain('Bruninieku iela 60-8');
            expect(pdfAscii).toContain('Riga, LV-1009, Latvia');

            // Buyer Data Checks
            expect(pdfAscii).toContain('Editorial Acantilado S.L.U.');
            expect(pdfAscii).toContain('ESB62145892');
            expect(pdfAscii).toContain('Carrer de Mallorca 244');

            // Legal hyperlinks and standards
            expect(pdfAscii).toContain('https://printprice.pro/terms');
            expect(pdfAscii).not.toContain('b2b-conditions');
            expect(pdfAscii).toContain('https://printprice.pro/privacy');
            expect(pdfAscii).toContain('EN 16931-1:2017');

            // Wire transfer escrow assignment pending & zero mock IBAN
            expect(pdfAscii).not.toContain('ES91');
            expect(pdfAscii).toContain('ESCROW ACCOUNT ASSIGNMENT IN PROGRESS');
            expect(pdfAscii).toContain('https://budget.printprice.pro/portal/orders');
            expect(pdfResult.grossAmount).toBeGreaterThan(0);
        });

        it('renders sensible non-zero default and draft warning for unpriced/incomplete fiscal order', () => {
            const incompleteOrder = {
                orderId: 'ORD_2026_9882'
            };

            const pdfResult = generateProformaInvoicePdf(incompleteOrder, {
                fiscalProfile: {} // Empty fiscal profile
            });

            expect(pdfResult.grossAmount).toBeGreaterThan(0);
            expect(pdfResult.netAmount).toBe(1850.00);

            const pdfAscii = pdfResult.buffer.toString('binary');
            expect(pdfAscii).toContain('[TAX DETAILS PENDING COMPLETION - DRAFT ESTIMATE ONLY]');
            expect(pdfAscii).toContain('PENDING VAT DECLARATION');
            expect(pdfAscii).not.toContain('ES91');
        });

        it('streams proforma PDF via GET /api/customer/orders/:orderId/proforma.pdf', async () => {
            const res = await fetch(`${baseUrl}/api/customer/orders/ORD_2026_101/proforma.pdf`, {
                headers: {
                    'x-customer-id': 'test-publisher',
                    'x-customer-email': 'publisher@test.eu'
                }
            });

            expect(res.status).toBe(200);
            expect(res.headers.get('content-type')).toBe('application/pdf');
            expect(res.headers.get('content-disposition')).toContain('inline; filename="Proforma_ORD_2026_101.pdf"');

            const buffer = Buffer.from(await res.arrayBuffer());
            expect(buffer.length).toBeGreaterThan(4000);
            expect(buffer.toString('binary')).toContain('Print Price Pro SIA');
        });
    });
});
