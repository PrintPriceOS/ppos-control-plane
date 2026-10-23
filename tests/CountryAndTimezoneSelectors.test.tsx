/**
 * tests/CountryAndTimezoneSelectors.test.tsx
 *
 * Dedicated verification suite for unified CountrySelect & TimezoneSelect contracts,
 * multi-language search (ES, EN, DE), canonical ISO 3166-1 alpha-2 / IANA persistence,
 * non-overwriting country suggestions, legacy value preservation, and status.suspended localization.
 */

import { describe, it, expect, vi } from 'vitest';
import React, { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { CountrySelect } from '../src/ui/components/common/CountrySelect';
import { TimezoneSelect } from '../src/ui/components/common/TimezoneSelect';
import { ProductionSitesPanel } from '../src/ui/components/printhouse/setup/ProductionSitesPanel';
import { LocaleProvider } from '../src/ui/i18n';
import {
    getLocalizedCountryName,
    filterCountries,
    isValidIso2Country,
    COUNTRIES
} from '../src/ui/lib/countryCatalog';
import {
    getTimezones,
    filterTimezones,
    formatTimezoneOffset,
    COUNTRY_TIMEZONE_MAP
} from '../src/ui/lib/timezoneCatalog';

describe('Country Catalog & CountrySelect Component', () => {
    it('1. Resolves localized country names correctly across ES, EN, and DE', () => {
        expect(getLocalizedCountryName('ES', 'es')).toBe('España');
        expect(getLocalizedCountryName('ES', 'en')).toBe('Spain');
        expect(getLocalizedCountryName('ES', 'de')).toBe('Spanien');

        expect(getLocalizedCountryName('DE', 'es')).toBe('Alemania');
        expect(getLocalizedCountryName('DE', 'en')).toBe('Germany');
        expect(getLocalizedCountryName('DE', 'de')).toBe('Deutschland');

        expect(getLocalizedCountryName('PT', 'es')).toBe('Portugal');
        expect(getLocalizedCountryName('NL', 'es')).toBe('Países Bajos');
    });

    it('2. Searches across multilingual names (e.g. searching "Alemania" in EN locale matches DE)', () => {
        const matchesDE = filterCountries('Alemania', 'en');
        expect(matchesDE.some(c => c.code === 'DE')).toBe(true);

        const matchesES = filterCountries('Spain', 'es');
        expect(matchesES.some(c => c.code === 'ES')).toBe(true);

        const matchesCode = filterCountries('PT', 'en');
        expect(matchesCode.some(c => c.code === 'PT')).toBe(true);
    });

    it('3. CountrySelect renders canonical code and preserves unrecognized legacy value without overwriting', () => {
        const onChange = vi.fn();
        const { rerender } = render(
            <LocaleProvider initialLocale="es">
                <CountrySelect
                    id="test-country"
                    value="LEGACY_UNKNOWN"
                    onChange={onChange}
                />
            </LocaleProvider>
        );

        // Expect warning badge with the preserved legacy value
        expect(screen.getByText(/Legacy \/ Unrecognized \(LEGACY_UNKNOWN\)/i)).toBeDefined();
        expect(onChange).not.toHaveBeenCalled();

        // Switch to valid canonical code PT
        rerender(
            <LocaleProvider initialLocale="es">
                <CountrySelect
                    id="test-country"
                    value="PT"
                    onChange={onChange}
                />
            </LocaleProvider>
        );
        expect(screen.getByText(/Portugal \(PT\)/i)).toBeDefined();
    });
});

describe('Timezone Catalog & TimezoneSelect Component', () => {
    it('4. Provides full canonical IANA list with dynamic DST-aware offsets', () => {
        const all = getTimezones();
        expect(all.length).toBeGreaterThan(50);
        expect(all.some(t => t.id === 'Europe/Madrid')).toBe(true);
        expect(all.some(t => t.id === 'Atlantic/Madeira')).toBe(true);
        expect(all.some(t => t.id === 'Atlantic/Azores')).toBe(true);
        expect(all.some(t => t.id === 'America/La_Paz')).toBe(true);
        expect(all.some(t => t.id === 'UTC')).toBe(true);

        // Check offset format
        const offsetMadrid = formatTimezoneOffset('Europe/Madrid');
        expect(offsetMadrid).toMatch(/^GMT[+-]\d+$/);

        const offsetMadeira = formatTimezoneOffset('Atlantic/Madeira');
        expect(offsetMadeira).toMatch(/^GMT[+-]\d+$/);
    });

    it('5. Prioritizes country suggestions (e.g. Madeira for PT) WITHOUT altering existing selection', () => {
        const { suggested } = filterTimezones('', 'PT');
        const suggestedIds = suggested.map(s => s.id);
        expect(suggestedIds).toContain('Europe/Lisbon');
        expect(suggestedIds).toContain('Atlantic/Madeira');
        expect(suggestedIds).toContain('Atlantic/Azores');

        // Render with existing Europe/Madrid for a plant in PT (preserves user selection)
        const onChange = vi.fn();
        render(
            <LocaleProvider initialLocale="es">
                <TimezoneSelect
                    id="test-site-tz"
                    value="Europe/Madrid"
                    countryCode="PT"
                    onChange={onChange}
                />
            </LocaleProvider>
        );

        // Value must NOT be overridden automatically
        expect(screen.getByText(/Europe\/Madrid/i)).toBeDefined();
        expect(onChange).not.toHaveBeenCalled();
    });

    it('6. TimezoneSelect preserves custom/legacy timezone values', () => {
        const onChange = vi.fn();
        render(
            <LocaleProvider initialLocale="es">
                <TimezoneSelect
                    id="test-tz-legacy"
                    value="Custom/Legacy_Zone"
                    onChange={onChange}
                />
            </LocaleProvider>
        );

        expect(screen.getByText(/Legacy \/ Custom \(Custom\/Legacy_Zone\)/i)).toBeDefined();
        expect(onChange).not.toHaveBeenCalled();
    });
});

describe('ProductionSitesPanel Localization & Shared Selectors', () => {
    it('7. Displays translated label for SUSPENDED site rather than raw literal status.suspended', () => {
        const sites = [
            {
                siteId: 'site-1',
                siteName: 'Madeira Printing Plant',
                country: 'PT',
                city: 'Funchal',
                timezone: 'Atlantic/Madeira',
                status: 'SUSPENDED',
                isPrimary: true
            }
        ];

        const { unmount } = render(
            <LocaleProvider key="es" initialLocale="es">
                <ProductionSitesPanel sites={sites} />
            </LocaleProvider>
        );

        // Should render "Suspendido" in ES, NOT "status.suspended"
        expect(screen.queryByText('status.suspended')).toBeNull();
        expect(screen.getByText('Suspendido')).toBeDefined();
        unmount();

        // Switch to EN
        const { unmount: unmountEn } = render(
            <LocaleProvider key="en" initialLocale="en">
                <ProductionSitesPanel sites={sites} />
            </LocaleProvider>
        );
        expect(screen.queryByText('status.suspended')).toBeNull();
        expect(screen.getByText('Suspended')).toBeDefined();
        unmountEn();

        // Switch to DE
        render(
            <LocaleProvider key="de" initialLocale="de">
                <ProductionSitesPanel sites={sites} />
            </LocaleProvider>
        );
        expect(screen.queryByText('status.suspended')).toBeNull();
        expect(screen.getByText('Ausgesetzt')).toBeDefined();
    });
});
