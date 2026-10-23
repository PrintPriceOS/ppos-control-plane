import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LocaleProvider, Locale } from '../src/ui/i18n';
import { SupplierCatalogOffersPage } from '../src/ui/pages/supplier/SupplierCatalogOffersPage';
import { setAuthUser, clearAuthToken, setAuthToken } from '../src/ui/lib/authStore';

const { mockPaperSupplierFetch } = vi.hoisted(() => {
    return {
        mockPaperSupplierFetch: vi.fn()
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

const mockProducts = [
    {
        id: 'prod-munken-1',
        name: 'Munken Lynx',
        brand: 'Arctic Paper',
        category: 'UNCOATED',
        finish: 'ROUGH',
        variants: [
            {
                id: 'var-munken-120',
                productId: 'prod-munken-1',
                gsm: 120,
                widthMm: 700,
                heightMm: 1000,
                finish: 'ROUGH',
                grainDirection: 'LONG_GRAIN',
                supplierCatalogStatus: 'ACTIVE',
                isWithdrawn: false
            },
            {
                id: 'var-munken-150',
                productId: 'prod-munken-1',
                gsm: 150,
                widthMm: 700,
                heightMm: 1000,
                finish: 'ROUGH',
                grainDirection: 'LONG_GRAIN',
                supplierCatalogStatus: 'ACTIVE',
                isWithdrawn: false
            }
        ]
    },
    {
        id: 'prod-coral-1',
        name: 'Coral Book',
        brand: 'Torraspapel',
        category: 'OFFSET',
        finish: 'NATURAL',
        variants: [
            {
                id: 'var-coral-80',
                productId: 'prod-coral-1',
                gsm: 80,
                widthMm: 650,
                heightMm: 900,
                finish: 'NATURAL',
                grainDirection: 'SHORT_GRAIN',
                supplierCatalogStatus: 'ACTIVE',
                isWithdrawn: false
            }
        ]
    }
];

describe('Supplier Catalog Technical Variant Selection & Lifecycle UI Suite', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        setAuthToken('test-bearer-token');
        setAuthUser({
            id: 'usr-supp-001',
            email: 'operator@supplier.local',
            role: 'SUPPLIER_ADMIN',
            supplierRole: 'SUPPLIER_ADMIN',
            tenantId: 'tenant-alpha',
            supplierId: 'supp-alpha-1',
            companyName: 'Alpha Paper Mills'
        });

        mockPaperSupplierFetch.mockImplementation((path: string, options?: any) => {
            if (path.startsWith('/api/v1/paper-suppliers/catalog/products')) {
                return Promise.resolve({
                    ok: true,
                    data: {
                        total: 15,
                        page: 1,
                        limit: 20,
                        totalPages: 1,
                        products: mockProducts
                    }
                });
            }
            if (path.startsWith('/api/v1/paper-suppliers/offers/counts')) {
                return Promise.resolve({
                    ok: true,
                    data: { total: 2, active: 2, inactive: 0, archived: 0 }
                });
            }
            if (path.startsWith('/api/v1/paper-suppliers/offers')) {
                return Promise.resolve({
                    ok: true,
                    data: { total: 0, page: 1, limit: 20, totalPages: 1, offers: [] }
                });
            }
            if (path === '/api/v1/paper-suppliers/catalog/variants/preview-action') {
                const body = JSON.parse(options?.body || '{}');
                return Promise.resolve({
                    ok: true,
                    data: {
                        action: body.action,
                        scope: body.scope,
                        targetCount: body.variantIds?.length || 2,
                        affectedProducts: 1,
                        activeOffersCount: 1,
                        archivedOffersCount: 0,
                        blockedCount: 0,
                        canProceed: true,
                        warnings: [
                            'La retirada desvinculará las variantes de su catálogo y retirará 1 oferta comercial.',
                            'Las fichas de especificación técnica compartidas se conservarán intactas para los demás proveedores.'
                        ],
                        items: [
                            {
                                variantId: 'var-munken-120',
                                productName: 'Munken Lynx',
                                gsm: 120,
                                dimensions: '700x1000 mm',
                                supplierCatalogStatus: 'ACTIVE',
                                isWithdrawn: false,
                                activeOffersCount: 1,
                                isBlocked: false,
                                sharedWithOtherSuppliers: true,
                                actionImpact: 'Retirará la asociación del proveedor. La ficha técnica compartida se conserva intacta.'
                            }
                        ]
                    }
                });
            }
            if (path === '/api/v1/paper-suppliers/catalog/variants/bulk-withdraw') {
                return Promise.resolve({
                    ok: true,
                    data: {
                        action: 'WITHDRAW',
                        totalProcessed: 2,
                        succeededCount: 2,
                        failedCount: 0,
                        results: [
                            { id: 'var-munken-120', success: true, message: 'Variant association withdrawn from supplier catalog.' },
                            { id: 'var-munken-150', success: true, message: 'Variant association withdrawn from supplier catalog.' }
                        ]
                    }
                });
            }
            return Promise.reject(new Error(`Unhandled mock path: ${path}`));
        });
    });

    afterEach(() => {
        clearAuthToken();
    });

    const renderPage = (initialLocale: Locale = 'es') => {
        return render(
            <LocaleProvider initialLocale={initialLocale}>
                <MemoryRouter>
                    <SupplierCatalogOffersPage />
                </MemoryRouter>
            </LocaleProvider>
        );
    };

    it('renders technical catalog and selects individual variants with sticky action bar update', async () => {
        renderPage('es');

        await waitFor(() => {
            expect(screen.getByText('Munken Lynx')).toBeInTheDocument();
            expect(screen.getByText('Coral Book')).toBeInTheDocument();
        });

        // Initially no sticky action bar
        expect(screen.queryByText(/variantes seleccionadas/i)).not.toBeInTheDocument();

        // Find all checkboxes
        const checkboxes = screen.getAllByRole('checkbox');
        // Checkboxes: [0: header page master, 1: Munken product, 2: var-120, 3: var-150, 4: Coral product, 5: var-coral-80]
        expect(checkboxes.length).toBe(6);

        // Click var-munken-120 checkbox
        fireEvent.click(checkboxes[2]);

        // Sticky action bar should appear showing "1 variantes seleccionadas"
        await waitFor(() => {
            expect(screen.getByText(/1 variantes seleccionadas/i)).toBeInTheDocument();
        });

        // Click var-munken-150 checkbox
        fireEvent.click(checkboxes[3]);

        await waitFor(() => {
            expect(screen.getByText(/2 variantes seleccionadas/i)).toBeInTheDocument();
        });

        // Clear selection button
        const clearBtn = screen.getByText(/Limpiar selección/i);
        fireEvent.click(clearBtn);

        await waitFor(() => {
            expect(screen.queryByText(/variantes seleccionadas/i)).not.toBeInTheDocument();
        });
    });

    it('product-level checkbox toggles all variants belonging to that product and displays count badge', async () => {
        renderPage('es');

        await waitFor(() => {
            expect(screen.getByText('Munken Lynx')).toBeInTheDocument();
        });

        const checkboxes = screen.getAllByRole('checkbox');
        // Click Munken product checkbox (index 1)
        fireEvent.click(checkboxes[1]);

        await waitFor(() => {
            // Both variants of Munken Lynx selected (count = 2)
            expect(screen.getByText(/2 variantes seleccionadas/i)).toBeInTheDocument();
            // Product row should show explicit affected indicator: (2 de 2 sel.)
            expect(screen.getByText('(2 de 2 sel.)')).toBeInTheDocument();
        });

        // Deselect one variant (index 2: var-munken-120)
        fireEvent.click(checkboxes[2]);

        await waitFor(() => {
            expect(screen.getByText(/1 variantes seleccionadas/i)).toBeInTheDocument();
            expect(screen.getByText('(1 de 2 sel.)')).toBeInTheDocument();
        });
    });

    it('page master checkbox and "select all matching filtered variants across pagination" flow', async () => {
        renderPage('es');

        await waitFor(() => {
            expect(screen.getByText('Munken Lynx')).toBeInTheDocument();
        });

        const masterCheckbox = screen.getByTitle('Seleccionar visibles (página actual)');
        fireEvent.click(masterCheckbox);

        await waitFor(() => {
            // All 3 visible variants selected (appears in sticky bar and in page banner)
            expect(screen.getAllByText(/3 variantes seleccionadas/i).length).toBeGreaterThanOrEqual(1);
            // Since total is 15 (> 3), the cross-page banner should appear
            expect(screen.getByText(/Seleccionar las 15 variantes que coinciden con los filtros actuales/i)).toBeInTheDocument();
        });

        // Click banner to select all matching across pagination
        const selectAllBannerBtn = screen.getByText(/Seleccionar las 15 variantes que coinciden con los filtros actuales/i);
        fireEvent.click(selectAllBannerBtn);

        await waitFor(() => {
            expect(screen.getByText(/Las 15 variantes filtradas están seleccionadas/i)).toBeInTheDocument();
        });
    });

    it('opens catalog action preview modal and shows affected counts, shared spec protection, and warnings', async () => {
        renderPage('es');

        await waitFor(() => {
            expect(screen.getByText('Munken Lynx')).toBeInTheDocument();
        });

        const checkboxes = screen.getAllByRole('checkbox');
        // Select Munken Lynx product
        fireEvent.click(checkboxes[1]);

        await waitFor(() => {
            expect(screen.getByText(/Retirar del Ámbito/i)).toBeInTheDocument();
        });

        // Click "Retirar del Ámbito"
        const withdrawBtn = screen.getByText(/Retirar del Ámbito/i);
        fireEvent.click(withdrawBtn);

        // Modal should open with preview details
        await waitFor(() => {
            expect(screen.getByText(/Previsualización de Acción de Catálogo: WITHDRAW/i)).toBeInTheDocument();
            expect(screen.getByText(/Advertencias de Dependencias y Preservación:/i)).toBeInTheDocument();
            expect(screen.getByText(/Ficha Compartida/i)).toBeInTheDocument();
            expect(screen.getByText(/La ficha técnica compartida se conserva intacta/i)).toBeInTheDocument();
        });

        // Click confirm in modal
        const confirmBtn = screen.getByText(/Confirmar y Ejecutar Acción/i);
        fireEvent.click(confirmBtn);

        // Operation report modal should display execution results
        await waitFor(() => {
            expect(screen.getByText(/Reporte de Operación: WITHDRAW/i)).toBeInTheDocument();
            expect(screen.getByText(/Acción WITHDRAW completada: 2 procesadas correctamente/i)).toBeInTheDocument();
        });
    });
});
