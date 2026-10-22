import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LocaleProvider, Locale } from '../src/ui/i18n';
import { SupplierDashboardPage } from '../src/ui/pages/supplier/SupplierDashboardPage';
import { SupplierSettingsPage } from '../src/ui/pages/supplier/SupplierSettingsPage';
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

describe('Supplier Hub Loading Loop & Fallback Resilience Regression Suite', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        setAuthToken('test-bearer-token');
    });

    afterEach(() => {
        clearAuthToken();
    });

    const renderWithContext = (ui: React.ReactElement, initialLocale: Locale = 'es') => {
        return render(
            <LocaleProvider initialLocale={initialLocale}>
                <MemoryRouter>
                    {ui}
                </MemoryRouter>
            </LocaleProvider>
        );
    };

    describe('SupplierDashboardPage', () => {
        it('does not re-trigger fetch on rerender when user identity primitives remain unchanged', async () => {
            setAuthUser({
                id: 'usr-supp-001',
                email: 'operator@torras.com',
                role: 'SUPPLIER_ADMIN',
                supplierRole: 'SUPPLIER_ADMIN',
                tenantId: 'tenant-torras-es',
                supplierId: 'supp-torras-01',
                companyName: 'Torraspapel S.A.'
            });

            mockPaperSupplierFetch.mockImplementation((path: string) => {
                if (path === '/api/v1/paper-suppliers/me') {
                    return Promise.resolve({
                        ok: true,
                        data: {
                            name: 'Torraspapel S.A.',
                            status: 'APPROVED',
                            tenantId: 'tenant-torras-es',
                            supplierId: 'supp-torras-01'
                        }
                    });
                }
                if (path.startsWith('/api/v1/paper-suppliers/catalog/products')) {
                    return Promise.resolve({
                        ok: true,
                        data: { total: 1573, products: [] }
                    });
                }
                if (path.startsWith('/api/v1/paper-suppliers/offers')) {
                    return Promise.resolve({
                        ok: true,
                        data: { total: 42, offers: [] }
                    });
                }
                return Promise.reject(new Error(`Unhandled path: ${path}`));
            });

            const { rerender } = renderWithContext(<SupplierDashboardPage />, 'es');

            // Wait for initial load to complete
            await waitFor(() => {
                expect(screen.getByText('Torraspapel S.A.')).toBeInTheDocument();
            });

            expect(screen.getByText('1573')).toBeInTheDocument();
            expect(screen.getByText('42')).toBeInTheDocument();

            // Initial fetch count: 3 requests (/me, /catalog, /offers)
            expect(mockPaperSupplierFetch).toHaveBeenCalledTimes(3);

            // Re-render component without changing user identity.
            // Note: getAuthUser() will parse localStorage again and return a new object reference,
            // but primitive identity dependencies must prevent useEffect from re-running.
            rerender(
                <LocaleProvider initialLocale="es">
                    <MemoryRouter>
                        <SupplierDashboardPage />
                    </MemoryRouter>
                </LocaleProvider>
            );

            // Ensure no additional calls were made
            expect(mockPaperSupplierFetch).toHaveBeenCalledTimes(3);

            // Now simulate a genuine tenant/supplier identity change
            setAuthUser({
                id: 'usr-supp-001',
                email: 'operator@torras.com',
                role: 'SUPPLIER_ADMIN',
                supplierRole: 'SUPPLIER_ADMIN',
                tenantId: 'tenant-torras-fr', // tenant changed
                supplierId: 'supp-torras-02', // supplier changed
                companyName: 'Torraspapel France'
            });

            rerender(
                <LocaleProvider initialLocale="es">
                    <MemoryRouter>
                        <SupplierDashboardPage />
                    </MemoryRouter>
                </LocaleProvider>
            );

            // Must have re-fetched because tenantId / supplierId genuinely changed
            await waitFor(() => {
                expect(mockPaperSupplierFetch).toHaveBeenCalledTimes(6);
            });
        });

        it('displays real fetched profile data, counts, and finishes loading cleanly', async () => {
            setAuthUser({
                id: 'usr-100',
                role: 'SUPPLIER_OPERATOR',
                supplierRole: 'SUPPLIER_OPERATOR',
                tenantId: 'tenant-sappi',
                supplierId: 'supp-sappi-eu'
            });

            mockPaperSupplierFetch.mockImplementation((path: string) => {
                if (path === '/api/v1/paper-suppliers/me') {
                    return Promise.resolve({
                        ok: true,
                        data: {
                            name: 'Sappi Fine Paper Europe',
                            status: 'APPROVED',
                            tenantId: 'tenant-sappi',
                            supplierId: 'supp-sappi-eu'
                        }
                    });
                }
                if (path.startsWith('/api/v1/paper-suppliers/catalog/products')) {
                    return Promise.resolve({
                        ok: true,
                        data: { total: 240, products: [] }
                    });
                }
                if (path.startsWith('/api/v1/paper-suppliers/offers')) {
                    return Promise.resolve({
                        ok: true,
                        data: { total: 18, offers: [] }
                    });
                }
                return Promise.reject(new Error(`Unhandled path: ${path}`));
            });

            renderWithContext(<SupplierDashboardPage />, 'es');

            await waitFor(() => {
                expect(screen.getByText('Sappi Fine Paper Europe')).toBeInTheDocument();
            });

            expect(screen.getByText('APPROVED')).toBeInTheDocument();
            expect(screen.getByText('240')).toBeInTheDocument();
            expect(screen.getByText('18')).toBeInTheDocument();

            // Verify loading "..." is gone
            expect(screen.queryByText('...')).not.toBeInTheDocument();
        });

        it('terminates loading on error and does NOT invent ACTIVE, EUR or 0 counts', async () => {
            setAuthUser({
                id: 'usr-broken',
                role: 'SUPPLIER_VIEWER',
                supplierRole: 'SUPPLIER_VIEWER'
                // No companyName, tenantId, or supplierId
            });

            mockPaperSupplierFetch.mockImplementation(() => {
                return Promise.reject(new Error('DATABASE_CONNECTION_REFUSED'));
            });

            renderWithContext(<SupplierDashboardPage />, 'es');

            // Must display error message
            await waitFor(() => {
                expect(screen.getByText('DATABASE_CONNECTION_REFUSED')).toBeInTheDocument();
            });

            // Loading state must terminate
            expect(screen.queryByText('...')).not.toBeInTheDocument();

            // Must NOT invent 'ACTIVE'
            expect(screen.queryByText('ACTIVE')).not.toBeInTheDocument();

            // Must NOT invent '0' count for catalog or offers
            expect(screen.queryByText('0')).not.toBeInTheDocument();

            // Must display localized "No disponible"
            const notAvailableElements = screen.getAllByText('No disponible');
            expect(notAvailableElements.length).toBeGreaterThanOrEqual(2);
        });

        it('renders localized missing data fallbacks in English and German', async () => {
            setAuthUser({
                id: 'usr-en-de',
                role: 'SUPPLIER_VIEWER'
            });

            mockPaperSupplierFetch.mockImplementation(() => {
                return Promise.resolve({
                    ok: false,
                    error: { message: 'SERVICE_UNAVAILABLE' }
                });
            });

            // Test English
            const { unmount: unmountEn } = renderWithContext(<SupplierDashboardPage />, 'en');
            await waitFor(() => {
                expect(screen.getAllByText('Not available').length).toBeGreaterThanOrEqual(2);
            });
            unmountEn();

            // Test German
            const { unmount: unmountDe } = renderWithContext(<SupplierDashboardPage />, 'de');
            await waitFor(() => {
                expect(screen.getAllByText('Nicht verfügbar').length).toBeGreaterThanOrEqual(2);
            });
            unmountDe();
        });
    });

    describe('SupplierSettingsPage', () => {
        it('does not re-trigger fetch on rerender when user identity primitives remain unchanged', async () => {
            setAuthUser({
                id: 'usr-sett-001',
                email: 'admin@fedrigoni.it',
                role: 'SUPPLIER_ADMIN',
                supplierRole: 'SUPPLIER_ADMIN',
                tenantId: 'tenant-fedrigoni',
                supplierId: 'supp-fed-01',
                companyName: 'Fedrigoni Papers'
            });

            mockPaperSupplierFetch.mockImplementation((path: string) => {
                if (path === '/api/v1/paper-suppliers/me') {
                    return Promise.resolve({
                        ok: true,
                        data: {
                            name: 'Fedrigoni Papers',
                            status: 'APPROVED',
                            contactEmail: 'admin@fedrigoni.it',
                            tenantId: 'tenant-fedrigoni',
                            supplierId: 'supp-fed-01',
                            currencies: ['EUR', 'USD']
                        }
                    });
                }
                return Promise.reject(new Error(`Unhandled path: ${path}`));
            });

            const { rerender } = renderWithContext(<SupplierSettingsPage />, 'es');

            await waitFor(() => {
                expect(screen.getByText('Fedrigoni Papers')).toBeInTheDocument();
            });

            expect(mockPaperSupplierFetch).toHaveBeenCalledTimes(1);

            // Re-render component with same identity
            rerender(
                <LocaleProvider initialLocale="es">
                    <MemoryRouter>
                        <SupplierSettingsPage />
                    </MemoryRouter>
                </LocaleProvider>
            );

            // Ensure no loop / no extra request
            expect(mockPaperSupplierFetch).toHaveBeenCalledTimes(1);
        });

        it('displays real profile settings and currencies correctly without inventing EUR fallback', async () => {
            setAuthUser({
                id: 'usr-uk-paper',
                role: 'SUPPLIER_ADMIN',
                tenantId: 'tenant-uk',
                supplierId: 'supp-uk-01'
            });

            mockPaperSupplierFetch.mockImplementation((path: string) => {
                if (path === '/api/v1/paper-suppliers/me') {
                    return Promise.resolve({
                        ok: true,
                        data: {
                            name: 'G.F Smith Fine Papers',
                            status: 'APPROVED',
                            contactEmail: 'orders@gfsmith.com',
                            tenantId: 'tenant-uk',
                            supplierId: 'supp-uk-01',
                            currencies: ['GBP', 'USD'] // Specifically not EUR
                        }
                    });
                }
                return Promise.reject(new Error(`Unhandled path: ${path}`));
            });

            renderWithContext(<SupplierSettingsPage />, 'es');

            await waitFor(() => {
                expect(screen.getByText('G.F Smith Fine Papers')).toBeInTheDocument();
            });

            expect(screen.getByText('GBP')).toBeInTheDocument();
            expect(screen.getByText('USD')).toBeInTheDocument();
            // Should NOT have invented EUR since it was not in the approved currencies list
            expect(screen.queryByText('EUR')).not.toBeInTheDocument();
        });

        it('terminates loading on failure, displays error, and never invents ACTIVE or EUR', async () => {
            setAuthUser({
                id: 'usr-err',
                role: 'SUPPLIER_VIEWER'
            });

            mockPaperSupplierFetch.mockImplementation(() => {
                return Promise.reject(new Error('SUPPLIER_TENANT_SUSPENDED'));
            });

            renderWithContext(<SupplierSettingsPage />, 'es');

            // Must display error
            await waitFor(() => {
                expect(screen.getByText('SUPPLIER_TENANT_SUSPENDED')).toBeInTheDocument();
            });

            // Loading "..." must be gone
            expect(screen.queryByText('...')).not.toBeInTheDocument();

            // Must NOT invent 'ACTIVE'
            expect(screen.queryByText('ACTIVE')).not.toBeInTheDocument();

            // Must NOT invent 'EUR'
            expect(screen.queryByText('EUR')).not.toBeInTheDocument();

            // Must display localized "No disponible"
            const notAvailableElements = screen.getAllByText('No disponible');
            expect(notAvailableElements.length).toBeGreaterThanOrEqual(1);
        });
    });
});
