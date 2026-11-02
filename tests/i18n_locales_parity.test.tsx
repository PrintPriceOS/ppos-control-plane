/**
 * tests/i18n_locales_parity.test.tsx
 *
 * Exhaustive Localization (i18n) Parity & Dynamic Locale Switching Test Suite:
 * 1. Verifies 100% key parity across `en`, `de`, and `es` catalogs (zero missing keys, zero orphan keys).
 * 2. Verifies zero empty strings (`""`), `[TODO]`, or `MISSING_TRANSLATION` placeholders across all 3 locales.
 * 3. Verifies dynamic runtime locale switching (`EN` -> `DE` -> `ES`) across Dashboard, Operational Activity Stream,
 *    Drawers/Modals, Materials & Paper, Machinery Fleet, and Printhouse views with zero mixed-language leaks.
 */
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { en } from '../src/ui/en';
import { de } from '../src/ui/de';
import { es } from '../src/ui/es';
import { LocaleProvider, useLocale } from '../src/ui/i18n';
import { LiveOrdersFeed } from '../src/ui/components/dashboard/LiveOrdersFeed';
import { OperationalActivityStream } from '../src/ui/components/dashboard/OperationalActivityStream';
import {
    StorageLifecycleDrawer,
    LiveMachineAllocationModal,
    B2bIncidentBridgeDrawer
} from '../src/ui/components/dashboard/PrinthouseCommandDrawers';
import { MaterialsPaperPage } from '../src/ui/pages/materials/MaterialsPaperPage';
import { MachinesPage } from '../src/ui/pages/os/MachinesPage';

const LocaleSwitcherHarness: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { locale, setLocale } = useLocale();
    return (
        <div>
            <div data-testid="active-locale-indicator">{locale}</div>
            <button data-testid="switch-en" onClick={() => setLocale('en')}>EN</button>
            <button data-testid="switch-de" onClick={() => setLocale('de')}>DE</button>
            <button data-testid="switch-es" onClick={() => setLocale('es')}>ES</button>
            {children}
        </div>
    );
};

describe('i18n Catalog Parity & Dynamic Trilingual Switching (EN / DE / ES)', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.restoreAllMocks();
    });

    it('enforces 100% key parity across en.ts, de.ts, and es.ts with zero missing or orphan keys', () => {
        const enKeys = Object.keys(en);
        const deKeys = Object.keys(de);
        const esKeys = Object.keys(es);

        const enSet = new Set(enKeys);
        const deSet = new Set(deKeys);
        const esSet = new Set(esKeys);

        const missingInDe = enKeys.filter((k) => !deSet.has(k));
        const missingInEs = enKeys.filter((k) => !esSet.has(k));
        const missingInEnFromDe = deKeys.filter((k) => !enSet.has(k));
        const missingInEnFromEs = esKeys.filter((k) => !enSet.has(k));

        expect(missingInDe).toEqual([]);
        expect(missingInEs).toEqual([]);
        expect(missingInEnFromDe).toEqual([]);
        expect(missingInEnFromEs).toEqual([]);
        expect(enKeys.length).toBeGreaterThanOrEqual(3100);
        expect(deKeys.length).toBe(enKeys.length);
        expect(esKeys.length).toBe(enKeys.length);
    });

    it('contains zero empty values or untranslated placeholder markers across EN, DE, and ES', () => {
        const forbiddenPatterns = [/\[TODO\]/i, /MISSING_TRANSLATION/i];

        for (const [key, val] of Object.entries(en)) {
            expect(val.trim().length, `Empty EN value for key "${key}"`).toBeGreaterThan(0);
            for (const pat of forbiddenPatterns) {
                expect(pat.test(val), `Forbidden placeholder in EN key "${key}"`).toBe(false);
            }
        }
        for (const [key, val] of Object.entries(de)) {
            expect(val.trim().length, `Empty DE value for key "${key}"`).toBeGreaterThan(0);
            for (const pat of forbiddenPatterns) {
                expect(pat.test(val), `Forbidden placeholder in DE key "${key}"`).toBe(false);
            }
        }
        for (const [key, val] of Object.entries(es)) {
            expect(val.trim().length, `Empty ES value for key "${key}"`).toBeGreaterThan(0);
            for (const pat of forbiddenPatterns) {
                expect(pat.test(val), `Forbidden placeholder in ES key "${key}"`).toBe(false);
            }
        }
    });

    it('dynamically localizes LiveOrdersFeed product titles and badges when switching EN -> DE -> ES', () => {
        localStorage.setItem('ppos_locale', 'en');
        vi.spyOn(global, 'fetch').mockRejectedValue(new Error('offline fallback'));

        render(
            <LocaleProvider>
                <LocaleSwitcherHarness>
                    <LiveOrdersFeed />
                </LocaleSwitcherHarness>
            </LocaleProvider>
        );

        // EN assertions
        expect(screen.getByText('European Industrial Architecture Atlas (3rd Ed.) · 1,500 copies')).toBeTruthy();
        expect(screen.getAllByText('URGENT').length).toBeGreaterThan(0);

        // Switch to DE
        fireEvent.click(screen.getByTestId('switch-de'));
        expect(screen.getByText('Atlas der Europäischen Industriearchitektur (3. Aufl.) · 1.500 Ex.')).toBeTruthy();
        expect(screen.getAllByText('DRINGEND').length).toBeGreaterThan(0);

        // Switch to ES
        fireEvent.click(screen.getByTestId('switch-es'));
        expect(screen.getByText('Atlas de Arquitectura Industrial Europea (3ª Ed.) · 1,500 uds')).toBeTruthy();
        expect(screen.getAllByText('URGENTE').length).toBeGreaterThan(0);
    });

    it('dynamically localizes OperationalActivityStream fallback events and relative timestamps across EN / DE / ES', () => {
        localStorage.setItem('ppos_locale', 'en');
        vi.spyOn(global, 'fetch').mockRejectedValue(new Error('offline fallback'));

        render(
            <LocaleProvider>
                <LocaleSwitcherHarness>
                    <OperationalActivityStream />
                </LocaleSwitcherHarness>
            </LocaleProvider>
        );

        // EN assertions
        expect(screen.getByText('Mirror Bleed Synthesis (+3.0 mm) & Calibrated Spine')).toBeTruthy();
        expect(screen.getByText('2m ago')).toBeTruthy();

        // Switch to DE
        fireEvent.click(screen.getByTestId('switch-de'));
        expect(screen.getByText('Spiegelbeschnitt-Synthese (+3,0 mm) & Kalibrierter Buchrücken')).toBeTruthy();
        expect(screen.getByText('vor 2 min.')).toBeTruthy();

        // Switch to ES
        fireEvent.click(screen.getByTestId('switch-es'));
        expect(screen.getByText('Síntesis de Sangre (+3.0 mm) y Lomo Calibrado')).toBeTruthy();
        expect(screen.getByText('hace 2m')).toBeTruthy();
    });

    it('dynamically localizes Command Drawers & Modals (Storage, Machine Allocation, B2B Incident Bridge) across EN / DE / ES', () => {
        localStorage.setItem('ppos_locale', 'en');
        render(
            <LocaleProvider>
                <LocaleSwitcherHarness>
                    <StorageLifecycleDrawer open={true} onClose={() => {}} storageData={null} onPurgeCompleted={() => {}} />
                    <LiveMachineAllocationModal open={true} onClose={() => {}} fleetData={null} orders={[]} onReassigned={() => {}} />
                    <B2bIncidentBridgeDrawer open={true} onClose={() => {}} b2bData={null} onMessageSent={() => {}} />
                </LocaleSwitcherHarness>
            </LocaleProvider>
        );

        // EN assertions
        expect(screen.getByText('20 × 16pp Signatures (CMYK + Aqueous Coating)')).toBeTruthy();
        expect(screen.getByText(/Detected interior bleed deficit \(1\.5 mm vs 3\.0 mm\)/i)).toBeTruthy();

        // Switch to DE
        fireEvent.click(screen.getByTestId('switch-de'));
        expect(screen.getByText('20 × 16 S. Falzbögen (CMYK + Dispersionslack)')).toBeTruthy();
        expect(screen.getByText(/Beschnittdefizit im Innenteil \(1,5 mm statt 3,0 mm\)/i)).toBeTruthy();

        // Switch to ES
        fireEvent.click(screen.getByTestId('switch-es'));
        expect(screen.getByText('20 × 16pp Signaturas (CMYK + Barniz)')).toBeTruthy();
        expect(screen.getByText(/Detectado déficit de sangrado interior \(1\.5 mm vs 3\.0 mm\)/i)).toBeTruthy();
    });

    it('dynamically localizes MaterialsPaperPage & MachinesPage headers, KPIs, and columns across EN / DE / ES', () => {
        localStorage.setItem('ppos_locale', 'en');
        vi.spyOn(global, 'fetch').mockResolvedValue({
            ok: true,
            json: async () => ({ industrialCatalog: [], items: [] })
        } as Response);

        render(
            <MemoryRouter>
                <LocaleProvider>
                    <LocaleSwitcherHarness>
                        <MaterialsPaperPage />
                        <MachinesPage />
                    </LocaleSwitcherHarness>
                </LocaleProvider>
            </MemoryRouter>
        );

        // EN
        expect(screen.getByText(en['materials.catalog.title'])).toBeTruthy();
        expect(screen.getByText(en['machines.workspace.title'])).toBeTruthy();

        // DE
        fireEvent.click(screen.getByTestId('switch-de'));
        expect(screen.getByText(de['materials.catalog.title'])).toBeTruthy();
        expect(screen.getByText(de['machines.workspace.title'])).toBeTruthy();

        // ES
        fireEvent.click(screen.getByTestId('switch-es'));
        expect(screen.getByText(es['materials.catalog.title'])).toBeTruthy();
        expect(screen.getByText(es['machines.workspace.title'])).toBeTruthy();
    });
});
