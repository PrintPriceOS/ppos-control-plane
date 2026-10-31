/**
 * tests/PaperThicknessFields.test.tsx
 *
 * PAPER-CALIPER-UI-01 — UI contract for Paper Thickness in Printhouse Materials.
 */
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LocaleProvider } from '../src/ui/i18n';
import { PaperThicknessFields, PaperThicknessInline } from '../src/ui/components/materials/PaperThicknessFields';

const base = {
    linkedVariantId: 'var_amber_100',
    isLinkedToMasterCatalog: true,
    caliperUm: 122,
    caliperSource: 'MANUFACTURER_DATASHEET',
    verificationStatus: 'VERIFIED',
    isAuthoritative: true,
    pendingProposals: [],
    unlinkedProposal: null
};

const wrap = (ui: React.ReactElement) => render(<LocaleProvider initialLocale="en">{ui}</LocaleProvider>);

describe('PaperThicknessFields (English UI)', () => {
    it('shows thickness, source and verification status for a linked material with known thickness', () => {
        wrap(<PaperThicknessFields thickness={base} />);
        expect(screen.getByText('Paper Thickness (µm)')).toBeTruthy();
        expect(screen.getByText('Thickness Source')).toBeTruthy();
        expect(screen.getByText('Verification Status')).toBeTruthy();
        expect(screen.getByTestId('paper-thickness-value').textContent).toBe('122 µm');
        expect(screen.getByTestId('paper-thickness-source').textContent).toBe('MANUFACTURER DATASHEET');
        expect(screen.getByTestId('paper-thickness-status').textContent).toBe('VERIFIED');
    });

    it('shows "Not available" (never a GSM-derived value) when thickness is missing', () => {
        wrap(<PaperThicknessFields thickness={{ ...base, caliperUm: null, caliperSource: 'NONE', verificationStatus: 'MISSING', isAuthoritative: false }} />);
        expect(screen.getByTestId('paper-thickness-value').textContent).toBe('Not available');
        expect(screen.getByTestId('paper-thickness-source').textContent).toBe('Not available');
        expect(screen.getByTestId('paper-thickness-status').textContent).toBe('Not available');
    });

    it('explains GSM vs micrometres in an accessible tooltip', () => {
        wrap(<PaperThicknessFields thickness={base} />);
        const tip = screen.getByRole('tooltip');
        expect(tip.textContent).toMatch(/GSM is mass per unit area/);
        expect(tip.textContent).toMatch(/micrometres/);
    });

    it('add-form preview reflects the selected master catalog item, and manual entries show Not available', () => {
        const { rerender } = wrap(<PaperThicknessFields previewLinked previewCaliperUm={133} previewSource="SUPPLIER_IMPORT" previewStatus="REFERENCE_IMPORTED" />);
        expect(screen.getByTestId('paper-thickness-value').textContent).toBe('133 µm');
        rerender(<LocaleProvider initialLocale="en"><PaperThicknessFields previewLinked={false} previewCaliperUm={null} /></LocaleProvider>);
        expect(screen.getByTestId('paper-thickness-value').textContent).toBe('Not available');
        expect(screen.getByText(/Manually created material/)).toBeTruthy();
    });

    it('lists pending proposals separately from the authoritative value', () => {
        wrap(<PaperThicknessFields thickness={{ ...base, pendingProposals: [{ evidenceId: 'e1', kind: 'PHYSICAL_MEASUREMENT', reviewStatus: 'PENDING_TECH_REVIEW', proposedCaliperUm: 125 }] }} />);
        expect(screen.getByTestId('paper-thickness-value').textContent).toBe('122 µm');
        expect(screen.getByTestId('paper-thickness-pending').textContent).toMatch(/Pending review: 125 µm · Physically measured \(ISO 534\) · PENDING TECH REVIEW/);
    });

    it('supplier-reported proposal requires a datasheet URL and submits the proposed value', async () => {
        const onPropose = vi.fn(async () => {});
        wrap(<PaperThicknessFields thickness={base} onPropose={onPropose} />);
        fireEvent.click(screen.getByTestId('paper-thickness-propose-btn'));
        fireEvent.change(screen.getByLabelText('Proposed thickness (µm)'), { target: { value: '125' } });
        fireEvent.click(screen.getByText('Submit for technical review'));
        expect(await screen.findByRole('alert')).toBeTruthy();
        expect(onPropose).not.toHaveBeenCalled();
        fireEvent.change(screen.getByLabelText('Datasheet URL'), { target: { value: 'https://mill.example/ds.pdf' } });
        fireEvent.click(screen.getByText('Submit for technical review'));
        await waitFor(() => expect(onPropose).toHaveBeenCalledWith({ kind: 'SUPPLIER_REPORTED', proposedCaliperUm: 125, documentUrl: 'https://mill.example/ds.pdf' }));
        expect(await screen.findByRole('status')).toBeTruthy();
    });

    it('physical measurement proposal requires 10 ISO 534 readings and calibration data', async () => {
        const onPropose = vi.fn(async () => {});
        wrap(<PaperThicknessFields thickness={base} onPropose={onPropose} />);
        fireEvent.click(screen.getByTestId('paper-thickness-propose-btn'));
        fireEvent.click(screen.getByRole('radio', { name: 'Physically measured (ISO 534)' }));
        fireEvent.change(screen.getByLabelText(/Micrometer readings/), { target: { value: '121,122,123' } });
        fireEvent.click(screen.getByText('Submit for technical review'));
        expect((await screen.findByRole('alert')).textContent).toMatch(/at least 10/);
        fireEvent.change(screen.getByLabelText(/Micrometer readings/), { target: { value: '121,122,123,122,121,122,123,122,122,121' } });
        fireEvent.change(screen.getByLabelText('Calibration certificate ID'), { target: { value: 'CAL-1' } });
        fireEvent.change(screen.getByLabelText('Calibration valid until'), { target: { value: '2027-12-31' } });
        fireEvent.click(screen.getByText('Submit for technical review'));
        await waitFor(() => expect(onPropose).toHaveBeenCalledTimes(1));
        expect(onPropose.mock.calls[0][0]).toMatchObject({ kind: 'PHYSICAL_MEASUREMENT', micrometerCalibrationCertId: 'CAL-1' });
        expect((onPropose.mock.calls[0][0] as any).readingsUm).toHaveLength(10);
    });

    it('inline summary shows µm or Not available', () => {
        const { rerender } = wrap(<PaperThicknessInline thickness={base} />);
        expect(screen.getByTestId('paper-thickness-inline').textContent).toBe('122 µm');
        rerender(<LocaleProvider initialLocale="en"><PaperThicknessInline thickness={null} /></LocaleProvider>);
        expect(screen.getByTestId('paper-thickness-inline').textContent).toBe('Not available');
    });
});

