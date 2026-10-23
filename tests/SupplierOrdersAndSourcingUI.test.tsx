import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LocaleProvider, Locale } from '../src/ui/i18n';
import { SupplierDashboardPage } from '../src/ui/pages/supplier/SupplierDashboardPage';
import { SupplierOrdersPage } from '../src/ui/pages/supplier/SupplierOrdersPage';
import { PaperSourcingModal } from '../src/ui/components/printhouse/PaperSourcingModal';
import { setAuthUser, clearAuthToken, setAuthToken } from '../src/ui/lib/authStore';

// Hoisted mocks for APIs
const { mockPaperSupplierFetch, mockAdminApi } = vi.hoisted(() => {
    return {
        mockPaperSupplierFetch: vi.fn(),
        mockAdminApi: {
            searchPaperSourcingOffers: vi.fn(),
            placePaperSourcingOrder: vi.fn(),
            listPrinthousePaperOrders: vi.fn(),
            acceptPaperRfqQuote: vi.fn(),
            receivePaperProcurementOrder: vi.fn()
        }
    };
});

vi.mock('../src/ui/lib/paperSupplierApi', () => ({
    paperSupplierFetch: mockPaperSupplierFetch,
    SupplierApiError: class extends Error {
        public status: number;
        public code: string;
        constructor(details: any) {
            super(details?.message || 'API Error');
            this.status = details?.status || 500;
            this.code = details?.code || 'API_ERROR';
        }
    }
}));

vi.mock('../src/ui/lib/adminApi', () => ({
    searchPaperSourcingOffers: (...args: any[]) => mockAdminApi.searchPaperSourcingOffers(...args),
    placePaperSourcingOrder: (...args: any[]) => mockAdminApi.placePaperSourcingOrder(...args),
    listPrinthousePaperOrders: (...args: any[]) => mockAdminApi.listPrinthousePaperOrders(...args),
    acceptPaperRfqQuote: (...args: any[]) => mockAdminApi.acceptPaperRfqQuote(...args),
    receivePaperProcurementOrder: (...args: any[]) => mockAdminApi.receivePaperProcurementOrder(...args)
}));

describe('Paper Supplier Hub & Printhouse Sourcing UI Suite', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        setAuthToken('test-bearer-token');
        setAuthUser({
            id: 'usr-supp-001',
            email: 'sales@torras.com',
            role: 'SUPPLIER_ADMIN',
            supplierRole: 'SUPPLIER_ADMIN',
            tenantId: 'tenant-torras-es',
            supplierId: 'supp-torras-01',
            printhouseId: 'node_plant_frankfurt',
            companyName: 'Torraspapel S.A.',
            isSupplierUser: true
        });
    });

    afterEach(() => {
        clearAuthToken();
    });

    const renderWithContext = (ui: React.ReactElement, initialLocale: Locale = 'en') => {
        return render(
            <LocaleProvider initialLocale={initialLocale}>
                <MemoryRouter>
                    {ui}
                </MemoryRouter>
            </LocaleProvider>
        );
    };

    describe('SupplierDashboardPage Component', () => {
        it('renders real KPI metrics from API and navigates to orders', async () => {
            mockPaperSupplierFetch.mockImplementation(async (path: string) => {
                if (path === '/api/v1/paper-suppliers/me') {
                    return {
                        ok: true,
                        data: {
                            id: 'supp-torras-01',
                            name: 'Torraspapel S.A.',
                            status: 'APPROVED',
                            tenantId: 'tenant-torras-es'
                        }
                    };
                }
                if (path.startsWith('/api/v1/paper-suppliers/dashboard/stats')) {
                    return {
                        ok: true,
                        data: {
                            catalogVariants: 1250,
                            offers: { total: 45, active: 40 },
                            pendingRequests: 4,
                            activeOrders: 7,
                            completedOrders: 19
                        }
                    };
                }
                return { ok: false, error: { message: `Unhandled path: ${path}` } };
            });

            renderWithContext(<SupplierDashboardPage />, 'en');

            await waitFor(() => {
                expect(screen.getByText('Torraspapel S.A.')).toBeInTheDocument();
            });

            // Verify KPI metrics rendered in cards
            expect(screen.getByText('1250')).toBeInTheDocument();
            expect(screen.getByText('40')).toBeInTheDocument();
            expect(screen.getByText('4')).toBeInTheDocument();
            expect(screen.getByText('7')).toBeInTheDocument();
            expect(screen.getByText(/19 completed/)).toBeInTheDocument();

            // Verify status and role badges
            expect(screen.getByText('APPROVED')).toBeInTheDocument();
            expect(screen.getByText('SUPPLIER_ADMIN')).toBeInTheDocument();
        });
    });

    describe('SupplierOrdersPage Component', () => {
        const mockOrderList = [
            {
                id: 'po-001',
                orderNumber: 'PO-2026-0001',
                type: 'ORDER',
                status: 'CONFIRMED',
                totalSheets: 10000,
                receivedSheets: 0,
                orderedQuantity: 500,
                quantityBasis: 'KG',
                printhouseName: 'Graphica Gutenberg GmbH',
                deliveryCenterName: 'Frankfurt Central Plant',
                snapshotProductName: 'Creator Silk 150g',
                snapshotGsm: 150,
                snapshotWidthMm: 700,
                snapshotHeightMm: 1000,
                snapshotFinish: 'SILK',
                currency: 'EUR',
                totalAmount: 1250.00,
                createdAt: '2026-10-22T10:00:00Z',
                updatedAt: '2026-10-22T11:00:00Z'
            },
            {
                id: 'rfq-002',
                orderNumber: 'RFQ-2026-0002',
                type: 'RFQ',
                status: 'SUBMITTED',
                totalSheets: 50000,
                receivedSheets: 0,
                orderedQuantity: 2500,
                quantityBasis: 'KG',
                printhouseName: 'Alpha Print S.L.',
                deliveryCenterName: 'Barcelona Plant',
                snapshotProductName: 'Creator Gloss 250g',
                snapshotGsm: 250,
                snapshotWidthMm: 720,
                snapshotHeightMm: 1020,
                snapshotFinish: 'GLOSS',
                currency: 'EUR',
                totalAmount: 0,
                createdAt: '2026-10-23T08:00:00Z',
                updatedAt: '2026-10-23T08:00:00Z'
            }
        ];

        const mockOrderDetailRfq = {
            ...mockOrderList[1],
            printhouseId: 'node_plant_barcelona',
            deliveryAddress: 'Poligono Industrial del Besos, Nave 4, 08030 Barcelona, Spain',
            buyerNotes: 'Urgent production run for November catalog edition.',
            snapshotCaliperMicrons: 240,
            snapshotGrainDirection: 'LONG_GRAIN',
            snapshotPricePerBasis: 2.10,
            snapshotPricingFormula: 'WEIGHT_BASED',
            receipts: []
        };

        it('renders orders table, tabs, and opens detail modal on row click', async () => {
            mockPaperSupplierFetch.mockImplementation(async (path: string) => {
                if (path.startsWith('/api/v1/paper-suppliers/orders/rfq-002')) {
                    return {
                        ok: true,
                        data: mockOrderDetailRfq
                    };
                }
                if (path.startsWith('/api/v1/paper-suppliers/orders')) {
                    return {
                        ok: true,
                        data: {
                            page: 1,
                            limit: 15,
                            total: 2,
                            totalPages: 1,
                            counts: {
                                all: 2,
                                submitted: 1,
                                quoted: 0,
                                confirmed: 1,
                                dispatched: 0,
                                received: 0,
                                rejected: 0
                            },
                            items: mockOrderList
                        }
                    };
                }
                return { ok: false, error: { message: `Unhandled path: ${path}` } };
            });

            renderWithContext(<SupplierOrdersPage />, 'en');

            // Wait for orders table to load
            await waitFor(() => {
                expect(screen.getByText('PO-2026-0001')).toBeInTheDocument();
                expect(screen.getByText('RFQ-2026-0002')).toBeInTheDocument();
            });

            expect(screen.getByText('Graphica Gutenberg GmbH')).toBeInTheDocument();
            expect(screen.getByText('Alpha Print S.L.')).toBeInTheDocument();
            expect(screen.getByText('Creator Silk 150g')).toBeInTheDocument();
            expect(screen.getByText('Creator Gloss 250g')).toBeInTheDocument();

            // Click on RFQ row to open modal
            const rfqRow = screen.getByText('RFQ-2026-0002');
            fireEvent.click(rfqRow);

            // Modal should load and display technical specs
            await waitFor(() => {
                expect(screen.getByText(/RFQ Request: RFQ-2026-0002/)).toBeInTheDocument();
            });

            // Verify technical snapshot details
            expect(screen.getAllByText('720 × 1020 mm').length).toBeGreaterThanOrEqual(1);
            expect(screen.getAllByText(/250\s*g/i).length).toBeGreaterThanOrEqual(1);
            expect(screen.getByText('240 µm')).toBeInTheDocument();
            expect(screen.getByText('LONG_GRAIN')).toBeInTheDocument();

            // Click Prepare Quote Proposal button to open action panel form
            const prepareQuoteBtn = screen.getByText('Prepare Quote Proposal');
            fireEvent.click(prepareQuoteBtn);

            // Verify proposal preparation action panel for RFQ
            await waitFor(() => {
                expect(screen.getByText('Submit Custom Volume Quote')).toBeInTheDocument();
                expect(screen.getByText('Transmit Quote to Buyer')).toBeInTheDocument();
            });
        });
    });

    describe('PaperSourcingModal Component', () => {
        const mockOffers = [
            {
                id: 'off-001',
                variantId: 'var-101',
                productName: 'Creator Silk 150g',
                supplierName: 'Torraspapel S.A.',
                supplierSku: 'TOR-SILK-150',
                priceBasis: 'KG',
                priceAmount: 2.50,
                currency: 'EUR',
                minOrderQuantity: 100,
                moq: 100,
                orderMultiple: 50,
                variant: {
                    id: 'var-101',
                    productName: 'Creator Silk 150g',
                    gsm: 150,
                    widthMm: 700,
                    heightMm: 1000,
                    finish: 'SILK',
                    caliperMicrons: 142
                }
            }
        ];

        const mockPrinthouseOrders = [
            {
                id: 'po-buy-001',
                orderNumber: 'PO-2026-0001',
                type: 'ORDER',
                status: 'DISPATCHED',
                orderedQuantity: 500,
                quantityBasis: 'KG',
                totalSheets: 4762,
                receivedSheets: 0,
                currency: 'EUR',
                totalAmount: 1250.00,
                supplierName: 'Torraspapel S.A.',
                snapshotProductName: 'Creator Silk 150g',
                snapshotGsm: 150,
                snapshotWidthMm: 700,
                snapshotHeightMm: 1000,
                carrierName: 'DHL Freight',
                trackingNumber: 'TRACK-998811',
                dispatchedAt: '2026-10-23T09:00:00Z',
                receipts: []
            }
        ];

        it('searches paper offers, calculates live sheets and price, and switches tabs', async () => {
            mockAdminApi.searchPaperSourcingOffers.mockResolvedValue({
                ok: true,
                data: {
                    items: mockOffers,
                    total: 1
                }
            });
            mockAdminApi.listPrinthousePaperOrders.mockResolvedValue({
                ok: true,
                data: {
                    items: mockPrinthouseOrders,
                    total: 1
                }
            });

            renderWithContext(
                <PaperSourcingModal
                    isOpen={true}
                    onClose={() => {}}
                />,
                'en'
            );

            // Verify offers list rendered
            await waitFor(() => {
                expect(screen.getByText('Creator Silk 150g')).toBeInTheDocument();
            });

            expect(screen.getByText('Torraspapel S.A.')).toBeInTheDocument();
            expect(screen.getByText('EUR 2.50')).toBeInTheDocument();

            // Click offer to configure purchase order
            fireEvent.click(screen.getByText('Creator Silk 150g'));

            // Formulation card should display
            await waitFor(() => {
                expect(screen.getByText(/Direct Order/i)).toBeInTheDocument();
            });

            // Change quantity input to 1050 kg
            // For 700x1000 mm, 150 gsm -> 1 sheet is 0.7 * 0.15 = 0.105 kg.
            // 1050 kg / 0.105 kg = 10,000 sheets!
            // Estimated price: 1050 kg * 2.50 EUR = 2,625.00 EUR.
            const qtyInput = screen.getByLabelText(/Order Quantity/i);
            fireEvent.change(qtyInput, { target: { value: '1050' } });


            await waitFor(() => {
                expect(screen.getByText(/10[.,]000|10000/)).toBeInTheDocument();
                expect(screen.getByText(/2625\.00/)).toBeInTheDocument();
            });

            // Switch to My Procurements tab
            const myOrdersTab = screen.getByText('Plant Procurements & Intakes');
            fireEvent.click(myOrdersTab);

            // Verify procurement orders list rendered
            await waitFor(() => {
                expect(screen.getByText('PO-2026-0001')).toBeInTheDocument();
                expect(screen.getByText('DISPATCHED')).toBeInTheDocument();
            });

            expect(screen.getByText('Receive')).toBeInTheDocument();
        });
    });
});
