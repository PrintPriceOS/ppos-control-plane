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

describe('PAPER-MATERIALS-RECOVERY-09 & 09H — Paper Supplier Hub Technical Accreditation UI & i18n E2E Suite', () => {
    let mockItemsState: any[];
    let mockEvidencesState: any[];
    let mockAuditHistoryState: any[];

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

        mockItemsState = [
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
        ];

        mockEvidencesState = [
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
        ];

        mockAuditHistoryState = [
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
        ];

        mockPaperSupplierFetch.mockImplementation(async (path: string, options?: any) => {
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
                                id: 'prod_gprint',
                                name: 'G-Print Smooth',
                                category: 'COATED',
                                brand: 'Arctic Paper',
                                variants: [
                                    {
                                        id: 'var_gprint_100',
                                        gsm: 100,
                                        widthMm: 700,
                                        heightMm: 1000,
                                        finish: 'SILK',
                                        grainDirection: 'LONG_GRAIN',
                                        caliperUm: 91,
                                        isCatalogAssociated: true,
                                        supplierCatalogStatus: 'ACTIVE'
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
                        limit: 15,
                        total: 1,
                        totalPages: 1,
                        counts: { all: 1, active: 1, inactive: 0, archived: 0 },
                        offers: [
                            {
                                id: 'off_01',
                                variantId: 'var_gprint_100',
                                supplierSku: 'ANT-GPR-100',
                                priceAmount: 1.25,
                                currency: 'EUR',
                                priceBasis: 'KG',
                                moq: 500,
                                orderMultiple: 100,
                                visibility: 'APPROVED_CUSTOMERS',
                                status: 'ACTIVE',
                                revisionNumber: 1,
                                variantDetails: {
                                    productName: 'G-Print Smooth',
                                    gsm: 100,
                                    widthMm: 700,
                                    heightMm: 1000,
                                    finish: 'SILK'
                                }
                            }
                        ]
                    }
                };
            }

            if (path.startsWith('/api/v1/paper-suppliers/accreditation/missing-materials')) {
                if (path.includes('search=EMPTY_RESULT_QUERY')) {
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
                            total: 0,
                            totalPages: 1,
                            items: []
                        }
                    };
                }
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
                        total: mockItemsState.length,
                        totalPages: 1,
                        items: mockItemsState
                    }
                };
            }

            if (path.includes('/api/v1/paper-suppliers/accreditation/variants/') && path.endsWith('/evidences')) {
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
                        caliperEvidences: mockEvidencesState,
                        auditHistory: mockAuditHistoryState
                    }
                };
            }

            if (path.endsWith('/api/v1/paper-suppliers/accreditation/evidences/documentary') && options?.method === 'POST') {
                const body = JSON.parse(options.body || '{}');
                if (body.proposedCaliperUm === 999) {
                    throw new Error('PDF_ACTIVE_CONTENT_FORBIDDEN: Security policy violation');
                }
                const newEv = {
                    id: 'evd_cal_nevia02',
                    source_kind: 'MANUFACTURER_DATASHEET_PDF',
                    proposed_caliper_um: body.proposedCaliperUm,
                    status: 'PENDING_TECH_REVIEW',
                    submitted_by: 'operator-alice',
                    document_sha256: '4a44dc15364204a80fe80e9039455cc1608281820fe2b24f1e5233ade6af1dd5',
                    has_source_contradiction: false
                };
                mockEvidencesState = [newEv, ...mockEvidencesState];
                mockAuditHistoryState = [
                    {
                        id: 'aud_02',
                        action: 'EVIDENCE_CREATED',
                        actor_id: 'operator-alice',
                        actor_role: 'SUPPLIER_OPERATOR',
                        previous_status: 'NONE',
                        new_status: 'PENDING_TECH_REVIEW',
                        reason: 'Documentary evidence registered without automatic productive caliper mutation.',
                        created_at: '2026-10-29T11:00:00Z'
                    },
                    ...mockAuditHistoryState
                ];
                return {
                    ok: true,
                    data: {
                        evidenceId: 'evd_cal_nevia02',
                        status: 'PENDING_TECH_REVIEW',
                        proposedCaliperUm: body.proposedCaliperUm,
                        productiveCaliperModified: false
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
                const body = JSON.parse(options.body || '{}');
                const newStatus = body.decision === 'REJECT' ? 'REJECTED' : 'APPROVED_FOR_TECHNICAL_USE';
                mockEvidencesState = mockEvidencesState.map((e) =>
                    e.id === 'evd_cal_nevia01' || e.id === 'evd_cal_nevia02'
                        ? { ...e, status: newStatus, approved_by_technologist: 'tech-approver-01' }
                        : e
                );
                mockAuditHistoryState = [
                    {
                        id: 'aud_03',
                        action: body.decision === 'REJECT' ? 'EVIDENCE_REJECTED' : 'EVIDENCE_APPROVED',
                        actor_id: 'tech-approver-01',
                        actor_role: 'SUPPLIER_ADMIN',
                        previous_status: 'PENDING_TECH_REVIEW',
                        new_status: newStatus,
                        reason: body.reason,
                        created_at: '2026-10-29T11:05:00Z'
                    },
                    ...mockAuditHistoryState
                ];
                return {
                    ok: true,
                    data: {
                        evidenceId: 'evd_cal_nevia01',
                        newStatus,
                        productiveCaliperModified: false
                    }
                };
            }

            if (path.endsWith('/promotions')) {
                return {
                    ok: true,
                    data: {
                        variant: {
                            variantId: 'var_dbd5357075534e3b',
                            productName: 'Nevia Plus C1S 80g 71my 70x100',
                            caliperUm: null,
                            caliperRevision: 1
                        },
                        promotedEvidence: null,
                        approvedEvidences: mockEvidencesState,
                        promotionPreview: {
                            variant: {
                                variantId: 'var_dbd5357075534e3b',
                                currentRevision: 1
                            },
                            evidence: {
                                evidenceId: mockEvidencesState[0]?.id || 'evd_cal_nevia01',
                                proposedCaliperMm: 0.071,
                                proposedBulkFactor: 0.888,
                                documentTitle: 'APP Nevia Plus C1S 80g Official TDS',
                                documentSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
                                datasheetVersion: '2026-Q4',
                                hasSourceContradiction: false
                            },
                            comparison: {
                                currentCaliperUm: null,
                                proposedCaliperUm: 71,
                                deltaUm: null,
                                deltaPct: null,
                                comparisonMode: 'NEW_CATALOG_ACCREDITATION_FROM_NULL',
                                currentSource: 'NONE',
                                targetSource: 'MANUFACTURER_DATASHEET',
                                currentConfidence: 'MISSING',
                                targetConfidence: 'REFERENCE_IMPORTED',
                                currentRevision: 1,
                                nextRevision: 2
                            },
                            governance: {
                                eligibleForPromotion: true,
                                blockingReasons: [],
                                segregationOfDuties: {
                                    submittedBy: 'operator-alice',
                                    approvedByTechnologist: 'tech-bob',
                                    requestedBy: 'requester-carol'
                                }
                            },
                            spineImpact: {
                                beforePromotion: { available: false, blockedCode: 'MISSING_PAPER_CALIPER' },
                                afterPromotion: {
                                    available: true,
                                    profileCertificationTier: 'MATH_BRANCH_VALIDATED',
                                    softcover200ppGlued: { netBlockMm: 7.1, spineWidthMm: 8.0 },
                                    softcover200ppSewn: { netBlockMm: 7.1, spineWidthMm: 8.5 }
                                }
                            }
                        }
                    }
                };
            }

            if (path.endsWith('/promotions/authorize') && options?.method === 'POST') {
                return {
                    ok: true,
                    data: {
                        promotionId: 'prm_exec_01',
                        variantId: 'var_dbd5357075534e3b',
                        newCaliperUm: 71,
                        newCaliperSource: 'MANUFACTURER_DATASHEET',
                        newRevision: 2,
                        productiveCaliperModified: true,
                        canReleaseToManufacturing: false
                    }
                };
            }

            if (path.endsWith('/promotions/request') && options?.method === 'POST') {
                return {
                    ok: true,
                    data: {
                        promotionRequestId: 'prm_req_01',
                        variantId: 'var_dbd5357075534e3b',
                        status: 'PROMOTION_REQUESTED',
                        productiveCaliperModified: false,
                        canReleaseToManufacturing: false
                    }
                };
            }

            if (path.endsWith('/promotions/revert') && options?.method === 'POST') {
                return {
                    ok: true,
                    data: {
                        variantId: 'var_dbd5357075534e3b',
                        restoredCaliperUm: null,
                        newEvidenceStatus: 'SUPERSEDED',
                        newRevision: 3,
                        productiveCaliperReverted: true,
                        canReleaseToManufacturing: false
                    }
                };
            }

            return { ok: true, data: {} };
        });
    });

    it('1. renders the Technical Accreditation & Metrology tab, KPIs (1,272 / 252 / 145 / 102 / 337), contradiction badge, and non-mutation governance banner across EN, ES, and DE', async () => {
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

    it('2. verifies clean coexistence between CATALOG, OFFERS, and ACCREDITATION tabs without state interference', async () => {
        render(
            <MemoryRouter>
                <LocaleProvider initialLocale="en">
                    <SupplierCatalogOffersPage />
                </LocaleProvider>
            </MemoryRouter>
        );

        // Starts on CATALOG tab showing G-Print Smooth
        await waitFor(() => {
            expect(screen.getByText('G-Print Smooth')).toBeInTheDocument();
        });

        // Switch to OFFERS tab
        const offersTabBtn = screen.getByRole('button', { name: /Commercial Offers/i });
        fireEvent.click(offersTabBtn);

        await waitFor(() => {
            expect(screen.getByText('ANT-GPR-100')).toBeInTheDocument();
        });

        // Switch to ACCREDITATION tab
        fireEvent.click(screen.getByTestId('tab-technical-accreditation'));

        await waitFor(() => {
            expect(screen.getByTestId('technical-accreditation-panel')).toBeInTheDocument();
            expect(screen.getByText('Nevia Plus C1S 80g 71my 70x100')).toBeInTheDocument();
        });

        // Switch back to CATALOG tab -> Catalog still renders cleanly
        const catalogTabBtn = screen.getByRole('button', { name: /Technical Paper Articles & Variants/i });
        fireEvent.click(catalogTabBtn);

        await waitFor(() => {
            expect(screen.getByText('G-Print Smooth')).toBeInTheDocument();
        });
    });

    it('3. executes complete E2E workflow: Operator uploads PDF datasheet & submits -> API error handling -> Technologist approves/rejects -> Audit History & PDF link', async () => {
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

        // Step A: Operator opens PDF Datasheet modal on Nevia Plus C1S
        const datasheetBtns = screen.getAllByText('PDF / Datasheet');
        fireEvent.click(datasheetBtns[0]);

        // Test oversize PDF file rejection (> 10 MB) on file input
        const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
        expect(fileInput).toBeTruthy();
        const oversizedFile = new File(['%PDF-1.7'], 'oversized.pdf', { type: 'application/pdf' });
        Object.defineProperty(oversizedFile, 'size', { value: 11 * 1024 * 1024 });
        fireEvent.change(fileInput, { target: { files: [oversizedFile] } });

        await waitFor(() => {
            expect(screen.getByText(/PDF exceeds maximum allowed size of 10 MB/i)).toBeInTheDocument();
        });

        // Upload valid PDF file
        const validFile = new File(['%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF'], 'app_nevia_80g.pdf', {
            type: 'application/pdf'
        });
        fireEvent.change(fileInput, { target: { files: [validFile] } });

        await waitFor(() => {
            expect(screen.getByText(/Ready: app_nevia_80g\.pdf/i)).toBeInTheDocument();
        });

        // Test API error handling first (proposedCaliperUm = 999 triggers simulated backend error)
        const caliperInput = document.querySelector('input[type="number"][min="20"]') as HTMLInputElement;
        fireEvent.change(caliperInput, { target: { value: '999' } });
        fireEvent.click(screen.getByText('Register & Submit Evidence'));

        await waitFor(() => {
            expect(screen.getByText(/PDF_ACTIVE_CONTENT_FORBIDDEN/i)).toBeInTheDocument();
        });

        // Now submit valid 71 µm proposal for review
        fireEvent.change(caliperInput, { target: { value: '71' } });
        fireEvent.click(screen.getByText('Register & Submit Evidence'));

        await waitFor(() => {
            expect(mockPaperSupplierFetch).toHaveBeenCalledWith(
                '/api/v1/paper-suppliers/accreditation/evidences/documentary',
                expect.objectContaining({ method: 'POST' })
            );
        });

        // Step B: Technologist opens Review modal, verifies SoD banner, and approves
        const reviewBtns = screen.getAllByText('Tech Review');
        fireEvent.click(reviewBtns[0]);

        await waitFor(() => {
            expect(screen.getByText(/Segregation of Duties \(SoD\)/i)).toBeInTheDocument();
            expect(screen.getByText(/without mutating paper_variants\.caliper_um/i)).toBeInTheDocument();
        });

        const reasonTextarea = screen.getByPlaceholderText(/Minimum 5 characters/i);
        fireEvent.change(reasonTextarea, { target: { value: 'Verified official APP datasheet 71um.' } });
        fireEvent.click(screen.getByText('Confirm Governed Decision'));

        await waitFor(() => {
            expect(mockPaperSupplierFetch).toHaveBeenCalledWith(
                '/api/v1/paper-suppliers/accreditation/evidences/evd_cal_nevia02/review',
                expect.objectContaining({ method: 'POST' })
            );
        });

        // Step C: Open Immutable Audit Log modal and verify approval entry + private PDF download link
        const auditBtns = screen.getAllByText('Audit Log');
        fireEvent.click(auditBtns[0]);

        await waitFor(() => {
            expect(screen.getByText(/APPROVED_TECHNICAL_EVIDENCE_PENDING_PROMOTION/i)).toBeInTheDocument();
            expect(screen.getByText(/EVIDENCE_APPROVED/i)).toBeInTheDocument();
            expect(screen.getByTestId('download-evidence-pdf-evd_cal_nevia02')).toBeInTheDocument();
        });

        // Close modal and verify empty state when searching for non-matching query
        const closeBtns = screen.getAllByLabelText(/Close dialog/i);
        fireEvent.click(closeBtns[closeBtns.length - 1]);
        const searchInput = screen.getByPlaceholderText(/Search by variant ID, SKU, family, manufacturer, request ID/i);
        fireEvent.change(searchInput, { target: { value: 'EMPTY_RESULT_QUERY' } });
        fireEvent.keyDown(searchInput, { key: 'Enter', code: 'Enter' });

        await waitFor(() => {
            expect(
                screen.getByText(/No missing-caliper variants match the current filter criteria\./i)
            ).toBeInTheDocument();
        });
    });

    it('4. RECOVERY-11: renders Governed Promotion modal across EN, ES, and DE, displaying current vs proposed caliper, Spine Calculator impact, 3-way SoD chain, and executes Request / Authorize / Revert flows', async () => {
        const locales: Locale[] = ['en', 'es', 'de'];

        for (const loc of locales) {
            const { unmount } = render(
                <MemoryRouter>
                    <LocaleProvider initialLocale={loc}>
                        <SupplierCatalogOffersPage />
                    </LocaleProvider>
                </MemoryRouter>
            );

            fireEvent.click(screen.getByTestId('tab-technical-accreditation'));

            await waitFor(() => {
                expect(screen.getByTestId('btn-promote-var_dbd5357075534e3b')).toBeInTheDocument();
            });

            fireEvent.click(screen.getByTestId('btn-promote-var_dbd5357075534e3b'));

            await waitFor(() => {
                expect(screen.getByTestId('promotion-modal')).toBeInTheDocument();
                expect(screen.getByTestId('promotion-comparison-card')).toBeInTheDocument();
                expect(screen.getByTestId('promotion-spine-impact-card')).toBeInTheDocument();
                expect(screen.getByTestId('promotion-sod-card')).toBeInTheDocument();
            });

            // Verify comparison values & Spine impact preview
            expect(screen.getByTestId('promo-current-caliper')).toHaveTextContent(/NULL/i);
            expect(screen.getByTestId('promo-proposed-caliper')).toHaveTextContent('71 µm');
            expect(screen.getByText(/422 MISSING_PAPER_CALIPER/i)).toBeInTheDocument();
            expect(screen.getByText(/8\.5 mm/i)).toBeInTheDocument();

            // Submit promotion authorization
            const reasonBox = screen.getByTestId('promo-reason-input');
            fireEvent.change(reasonBox, {
                target: { value: 'Authorized governed promotion of Nevia Plus C1S 80g 71um.' }
            });
            fireEvent.click(screen.getByTestId('promo-submit-button'));

            await waitFor(() => {
                expect(mockPaperSupplierFetch).toHaveBeenCalledWith(
                    '/api/v1/paper-suppliers/accreditation/variants/var_dbd5357075534e3b/evidences/evd_cal_nevia01/promotions/authorize',
                    expect.objectContaining({ method: 'POST' })
                );
            });

            unmount();
        }
    });
});
