import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LocaleProvider, Locale } from '../src/ui/i18n';
import { SupplierCatalogOffersPage } from '../src/ui/pages/supplier/SupplierCatalogOffersPage';
import { setAuthUser, clearAuthToken, setAuthToken } from '../src/ui/lib/authStore';

// Hoisted mock for paperSupplierApi
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

describe('Supplier Batch History Contract, Date Parsing, Counters & Localization Suite', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        setAuthToken('test-bearer-token');
        setAuthUser({
            id: 'usr-supp-001',
            email: 'operator@torras.com',
            role: 'SUPPLIER_ADMIN',
            supplierRole: 'SUPPLIER_ADMIN',
            tenantId: 'tenant-torras-es',
            supplierId: 'supp-torras-01',
            isSupplierUser: true
        });

        // Default mock routing
        mockPaperSupplierFetch.mockImplementation(async (path: string) => {
            if (path.startsWith('/api/v1/paper-suppliers/catalog/products')) {
                return {
                    ok: true,
                    data: {
                        page: 1,
                        limit: 15,
                        total: 1,
                        totalPages: 1,
                        products: [
                            {
                                id: 'prod-1',
                                name: 'Torras Creator Silk',
                                category: 'COATED',
                                finishSummary: 'SILK',
                                variants: [
                                    {
                                        id: 'var-1',
                                        productId: 'prod-1',
                                        productName: 'Torras Creator Silk',
                                        gsm: 150,
                                        widthMm: 700,
                                        heightMm: 1000,
                                        finish: 'SILK',
                                        category: 'COATED',
                                        status: 'ACTIVE',
                                        isAssociated: true,
                                        activeOffersCount: 1
                                    }
                                ]
                            }
                        ]
                    }
                };
            }
            if (path.startsWith('/api/v1/paper-suppliers/offers')) {
                return {
                    ok: true,
                    data: {
                        page: 1,
                        limit: 50,
                        total: 0,
                        totalPages: 0,
                        offers: []
                    }
                };
            }
            if (path === '/api/v1/paper-suppliers/catalog/imports') {
                return {
                    ok: true,
                    data: {
                        page: 1,
                        limit: 20,
                        total: 2,
                        totalPages: 1,
                        batches: [
                            {
                                id: 'imp_batch_confirmed_01',
                                fileName: 'catalog_compatible_all.csv',
                                file_name: 'catalog_compatible_all.csv',
                                original_filename: 'catalog_compatible_all.csv',
                                totalRows: 1544,
                                total_rows: 1544,
                                validRows: 1522,
                                valid_rows: 1522,
                                issueRows: 6,
                                issue_rows: 6,
                                rejectedRows: 22,
                                rejected_rows: 22,
                                pendingRows: 0,
                                pending_rows: 0,
                                duplicateRows: 16,
                                duplicate_rows: 16,
                                status: 'CONFIRMED',
                                createdAt: '2026-10-23T04:38:32.000Z',
                                created_at: '2026-10-23T04:38:32.000Z',
                                confirmedAt: '2026-10-23T04:38:36.000Z',
                                confirmed_at: '2026-10-23T04:38:36.000Z',
                                metadata: {
                                    valid_count: 1522,
                                    rejected_count: 22,
                                    pending_count: 0
                                }
                            },
                            {
                                id: 'imp_batch_preview_02',
                                fileName: 'import_batch_staging.csv',
                                file_name: 'import_batch_staging.csv',
                                original_filename: 'import_batch_staging.csv',
                                totalRows: 50,
                                total_rows: 50,
                                validRows: 37,
                                valid_rows: 37,
                                issueRows: 13,
                                issue_rows: 13,
                                rejectedRows: 0,
                                rejected_rows: 0,
                                pendingRows: 13,
                                pending_rows: 13,
                                duplicateRows: 0,
                                duplicate_rows: 0,
                                status: 'PREVIEW',
                                createdAt: '2026-10-22T19:32:41.000Z',
                                created_at: '2026-10-22T19:32:41.000Z',
                                confirmedAt: null,
                                confirmed_at: null,
                                metadata: {}
                            }
                        ]
                    }
                };
            }
            return { ok: true, data: {} };
        });
    });

    afterEach(() => {
        clearAuthToken();
    });

    const renderWithContext = (initialLocale: Locale = 'es') => {
        return render(
            <LocaleProvider initialLocale={initialLocale}>
                <MemoryRouter>
                    <SupplierCatalogOffersPage />
                </MemoryRouter>
            </LocaleProvider>
        );
    };

    it('renders confirmed batches with strictly ZERO pending rows and separated rejected count (Spanish)', async () => {
        renderWithContext('es');

        // Wait for page to load
        await waitFor(() => {
            expect(screen.getByText('Torras Creator Silk')).toBeInTheDocument();
        });

        // Open Batch History modal
        const batchBtn = screen.getByText('Historial de Lotes');
        fireEvent.click(batchBtn);

        // Modal should open
        await waitFor(() => {
            expect(screen.getByText('catalog_compatible_all.csv')).toBeInTheDocument();
        });

        // 1. Confirmed batch must show 0 pending and explicit rejected count:
        // Tot: 1544 · Vál: 1522 · Rech: 22 · Pend: 0
        expect(screen.getByText(/Tot: 1544 · Vál: 1522 · Rech: 22 · Pend: 0/)).toBeInTheDocument();

        // 2. Preview batch must show issues and unreviewed pending count:
        // Tot: 50 · Vál: 37 · Incid: 13 · Pend: 13
        expect(screen.getByText(/Tot: 50 · Vál: 37 · Incid: 13 · Pend: 13/)).toBeInTheDocument();

        // 3. Never display "Invalid Date"
        expect(screen.queryByText(/Invalid Date/i)).not.toBeInTheDocument();

        // 4. Filename is clean and not truncated as ID
        expect(screen.queryByText(/^imp_batc/)).not.toBeInTheDocument();
    });

    it('renders English batch history with correct English headers, labels, and zero pending for confirmed batch', async () => {
        renderWithContext('en');

        await waitFor(() => {
            expect(screen.getByText('Torras Creator Silk')).toBeInTheDocument();
        });

        const batchBtn = screen.getByText('Batch History');
        fireEvent.click(batchBtn);

        await waitFor(() => {
            expect(screen.getByText('catalog_compatible_all.csv')).toBeInTheDocument();
        });

        // Headers in English
        expect(screen.getByText('Date')).toBeInTheDocument();
        expect(screen.getByText('File')).toBeInTheDocument();
        expect(screen.getByText('Status')).toBeInTheDocument();
        expect(screen.getByText('Rows')).toBeInTheDocument();
        expect(screen.getAllByText('Actions').length).toBeGreaterThanOrEqual(1);

        // Confirmed row counter in English:
        // Tot: 1544 · Valid: 1522 · Rej: 22 · Pending: 0
        expect(screen.getByText(/Tot: 1544 · Valid: 1522 · Rej: 22 · Pending: 0/)).toBeInTheDocument();

        // Preview row counter in English:
        // Tot: 50 · Valid: 37 · Issues: 13 · Pending: 13
        expect(screen.getByText(/Tot: 50 · Valid: 37 · Issues: 13 · Pending: 13/)).toBeInTheDocument();
    });

    it('renders German batch history with correct German headers, labels, and zero pending for confirmed batch', async () => {
        renderWithContext('de');

        await waitFor(() => {
            expect(screen.getByText('Torras Creator Silk')).toBeInTheDocument();
        });

        const batchBtn = screen.getByText('Chargen-Historie');
        fireEvent.click(batchBtn);

        await waitFor(() => {
            expect(screen.getByText('catalog_compatible_all.csv')).toBeInTheDocument();
        });

        // Headers in German
        expect(screen.getByText('Datum')).toBeInTheDocument();
        expect(screen.getByText('Datei')).toBeInTheDocument();
        expect(screen.getByText('Status')).toBeInTheDocument();
        expect(screen.getByText('Zeilen')).toBeInTheDocument();
        expect(screen.getAllByText('Aktionen').length).toBeGreaterThanOrEqual(1);

        // Confirmed row counter in German:
        // Ges: 1544 · Gült: 1522 · Abgel: 22 · Ausst: 0
        expect(screen.getByText(/Ges: 1544 · Gült: 1522 · Abgel: 22 · Ausst: 0/)).toBeInTheDocument();

        // Preview row counter in German:
        // Ges: 50 · Gült: 37 · Probleme: 13 · Ausst: 13
        expect(screen.getByText(/Ges: 50 · Gült: 37 · Probleme: 13 · Ausst: 13/)).toBeInTheDocument();
    });

    it('safely handles missing or malformed date strings with fallback em-dash and never produces Invalid Date', async () => {
        mockPaperSupplierFetch.mockImplementation(async (path: string) => {
            if (path === '/api/v1/paper-suppliers/catalog/imports') {
                return {
                    ok: true,
                    data: {
                        page: 1,
                        limit: 20,
                        total: 1,
                        totalPages: 1,
                        batches: [
                            {
                                id: 'imp_batch_malformed_date',
                                fileName: 'test_fallback.csv',
                                totalRows: 10,
                                validRows: 10,
                                issueRows: 0,
                                status: 'CONFIRMED',
                                createdAt: null, // Malformed/null date
                                created_at: undefined,
                                metadata: { pending_count: 0, rejected_count: 0 }
                            }
                        ]
                    }
                };
            }
            if (path.startsWith('/api/v1/paper-suppliers/catalog/variants')) {
                return { ok: true, data: { items: [], total: 0 } };
            }
            if (path.startsWith('/api/v1/paper-suppliers/offers')) {
                return { ok: true, data: { offers: [], total: 0 } };
            }
            return { ok: true, data: {} };
        });

        renderWithContext('es');

        await waitFor(() => {
            expect(screen.getByText('Historial de Lotes')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByText('Historial de Lotes'));

        await waitFor(() => {
            expect(screen.getByText('test_fallback.csv')).toBeInTheDocument();
        });

        // The date column must render '—' and NOT 'Invalid Date'
        expect(screen.getByText('—')).toBeInTheDocument();
        expect(screen.queryByText(/Invalid Date/i)).not.toBeInTheDocument();
    });
});
