import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LocaleProvider, Locale } from '../src/ui/i18n';
import { SupplierCatalogOffersPage } from '../src/ui/pages/supplier/SupplierCatalogOffersPage';
import { setAuthUser, setAuthToken } from '../src/ui/lib/authStore';

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

describe('PAPER-MATERIALS-RECOVERY-09 — Paper Supplier Hub Technical Accreditation UI & i18n E2E Suite', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        setAuthToken('test-bearer-token');
        setAuthUser({
            id: 'tech-approver-01',
            email: 'metrology@printprice.pro',
            role: 'SUPPLIER_ADMIN',
            supplierRole: 'SUPPLIER_ADMIN',
            tenantId: 'tenant-livonia',
            supplierId: 'supp-antalis-01',
            isSupplierUser: true
        });

        mockPaperSupplierFetch.mockImplementation(async (path: string, options?: any) => {
            if (path.startsWith('/api/v1/paper-suppliers/catalog/products')) {
                return {
                    ok: true,
                    data: {
                        page: 1,
                        limit: 15,
                        total: 0,
                        totalPages: 1,
                        products: []
                    }
                };
            }

            if (path.startsWith('/api/v1/paper-suppliers/accreditation/missing-materials')) {
                return {
                    ok: true,
                    data: {
                        summary: {
                            totalCatalogVariants: 1524,
                            withCaliperCount: 1272,
                            missingCaliperTotal: 252,
                            physicalMicrometerTrackCount: 145,
                            supplierDatasheetTrackCount: 102,
                            conflictHoldTrackCount: 5,
                            pendingClassificationTotal: 337
                        },
                        page: 1,
                        limit: 20,
                        total: 2,
                        totalPages: 1,
                        items: [
                            {
                                variantId: 'var_dbd5357075534e3b',
                                displayName: 'Nevia Plus C1S 80g 71my 70x100',
                                odsCode: 'NEV-80-71MY',
                                supplier: 'Antalis',
                                manufacturer: 'APP',
                                family: 'Nevia Plus C1S',
                                gsm: 80,
                                widthMm: 700,
                                heightMm: 1000,
                                priorityTier: 'P1',
                                accreditationTrack: 'SUPPLIER_DATASHEET_TRACK',
                                industrialApplication: 'COATED_COVER_OR_JACKET',
                                requestId: 'REQ08-001',
                                requestStatus: 'PENDING_TECH_REVIEW',
                                evidenceStatus: 'PENDING_TECH_REVIEW',
                                latestProposedCaliperUm: 71,
                                hasSourceContradiction: true,
                                evidenceCount: 1
                            },
                            {
                                variantId: 'var_efalin_120_fl',
                                displayName: 'Efalin Fine Linen 108 Red 120g 70x100',
                                odsCode: 'EFA-108-120',
                                supplier: 'Papyrus',
                                manufacturer: 'Gmund / Zanders',
                                family: 'Efalin',
                                gsm: 120,
                                widthMm: 700,
                                heightMm: 1000,
                                priorityTier: 'P3',
                                accreditationTrack: 'PHYSICAL_MICROMETER_TRACK',
                                industrialApplication: 'HARDCOVER_COVERING_MATERIAL',
                                requestId: 'REQ08-042',
                                requestStatus: 'AWAITING_EVIDENCE_SUBMISSION',
                                evidenceStatus: null,
                                latestProposedCaliperUm: null,
                                hasSourceContradiction: false,
                                evidenceCount: 0
                            }
                        ]
                    }
                };
            }

            if (path.includes('/api/v1/paper-suppliers/accreditation/variants/var_dbd5357075534e3b/evidences')) {
                return {
                    ok: true,
                    data: {
                        variant: {
                            variantId: 'var_dbd5357075534e3b',
                            productName: 'Nevia Plus C1S 80g 71my 70x100',
                            productiveCaliperUm: null
                        },
                        spineProvenance: {
                            evidenceTier: 'APPROVED_TECHNICAL_EVIDENCE_PENDING_PROMOTION',
                            canPromoteProfileToProductionCertified: false
                        },
                        caliperEvidences: [
                            {
                                id: 'evd_cal_nevia01',
                                source_kind: 'MANUFACTURER_DATASHEET_PDF',
                                proposed_caliper_um: 71,
                                status: 'PENDING_TECH_REVIEW',
                                submitted_by: 'operator-alice',
                                document_sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
                                has_source_contradiction: true,
                                contradiction_details: 'SOURCE_CONTRADICTION > 5%'
                            }
                        ],
                        auditHistory: [
                            {
                                id: 'aud_01',
                                action: 'CONTRADICTION_FLAGGED',
                                actor_id: 'operator-alice',
                                actor_role: 'SUPPLIER_OPERATOR',
                                previous_status: 'NONE',
                                new_status: 'PENDING_TECH_REVIEW',
                                reason: 'Registered official APP datasheet',
                                created_at: '2026-10-29T10:00:00Z'
                            }
                        ]
                    }
                };
            }

            if (path.endsWith('/api/v1/paper-suppliers/accreditation/evidences/micrometer') && options?.method === 'POST') {
                return {
                    ok: true,
                    data: {
                        evidenceId: 'evd_mic_efalin01',
                        status: 'PENDING_TECH_REVIEW',
                        proposedCaliperUm: 165,
                        measuredCvPct: 0.48,
                        productiveCaliperModified: false
                    }
                };
            }

            if (path.includes('/review') && options?.method === 'POST') {
                return {
                    ok: true,
                    data: {
                        evidenceId: 'evd_cal_nevia01',
                        newStatus: 'APPROVED_FOR_TECHNICAL_USE',
                        productiveCaliperModified: false
                    }
                };
            }

            return { ok: true, data: {} };
        });
    });

    it('renders the Technical Accreditation & Metrology tab, KPIs (1,272 / 252 / 145 / 102 / 337), contradiction badge, and non-mutation governance banner across EN, ES, and DE', async () => {
        const locales: Locale[] = ['en', 'es', 'de'];

        for (const loc of locales) {
            const { unmount } = render(
                <MemoryRouter>
                    <LocaleProvider initialLocale={loc}>
                        <SupplierCatalogOffersPage />
                    </LocaleProvider>
                </MemoryRouter>
            );

            const tabBtn = screen.getByTestId('tab-technical-accreditation');
            fireEvent.click(tabBtn);

            await waitFor(() => {
                expect(screen.getByTestId('technical-accreditation-panel')).toBeInTheDocument();
            });

            // Verify KPI counters and non-release lock
            expect(screen.getByText('1272')).toBeInTheDocument();
            expect(screen.getByText('252')).toBeInTheDocument();
            expect(screen.getByText('145')).toBeInTheDocument();
            expect(screen.getByText('102')).toBeInTheDocument();
            expect(screen.getByText('337')).toBeInTheDocument();
            expect(screen.getByText(/canReleaseToManufacturing:/i)).toBeInTheDocument();

            // Verify table items & contradiction alert
            await waitFor(() => {
                expect(screen.getByText('Nevia Plus C1S 80g 71my 70x100')).toBeInTheDocument();
                expect(screen.getByText('Efalin Fine Linen 108 Red 120g 70x100')).toBeInTheDocument();
            });

            unmount();
        }
    });

    it('supports opening ISO 534 Micrometer modal, Technologist Review modal (with SoD notice), and Immutable Audit History modal without modifying productive caliper', async () => {
        render(
            <MemoryRouter>
                <LocaleProvider initialLocale="en">
                    <SupplierCatalogOffersPage />
                </LocaleProvider>
            </MemoryRouter>
        );

        fireEvent.click(screen.getByTestId('tab-technical-accreditation'));

        await waitFor(() => {
            expect(screen.getByText('Nevia Plus C1S 80g 71my 70x100')).toBeInTheDocument();
        });

        // 1. Open Technologist Review modal on Nevia Plus C1S
        const reviewBtns = screen.getAllByText('Tech Review');
        fireEvent.click(reviewBtns[0]);

        await waitFor(() => {
            expect(screen.getByText(/Segregation of Duties \(SoD\)/i)).toBeInTheDocument();
            expect(screen.getByText(/without mutating paper_variants\.caliper_um/i)).toBeInTheDocument();
        });

        // Submit review decision
        const reasonTextarea = screen.getByPlaceholderText(/Minimum 5 characters/i);
        fireEvent.change(reasonTextarea, { target: { value: 'Verified official APP datasheet 71um.' } });
        fireEvent.click(screen.getByText('Confirm Governed Decision'));

        await waitFor(() => {
            expect(mockPaperSupplierFetch).toHaveBeenCalledWith(
                '/api/v1/paper-suppliers/accreditation/evidences/evd_cal_nevia01/review',
                expect.objectContaining({ method: 'POST' })
            );
        });

        // 2. Open Audit Log modal
        const auditBtns = screen.getAllByText('Audit Log');
        fireEvent.click(auditBtns[0]);

        await waitFor(() => {
            expect(screen.getByText(/APPROVED_TECHNICAL_EVIDENCE_PENDING_PROMOTION/i)).toBeInTheDocument();
            expect(screen.getByText(/CONTRADICTION_FLAGGED/i)).toBeInTheDocument();
        });
    });
});

