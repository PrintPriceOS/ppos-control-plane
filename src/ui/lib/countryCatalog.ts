/**
 * src/ui/lib/countryCatalog.ts
 *
 * Canonical Master Country Catalog & Region Preset Utility (UI Adapter / Browser ESM).
 * Imports directly from the browser-safe canonical JSON data in src/lib/countriesData.json.
 * Enhanced with multi-language resolution (ES, EN, DE) via Intl.DisplayNames and canonical code preservation.
 */

import countriesJson from '../../lib/countriesData.json';

export interface CountryItem {
    code: string;
    name: string;
}

export interface RegionPreset {
    id: string;
    label: string;
    description: string;
    defaultCodes: string[];
}

export const COUNTRIES: CountryItem[] = countriesJson.COUNTRIES;
export const ISO_COUNTRY_CODES_SET: Set<string> = new Set(COUNTRIES.map(c => c.code));
export const EU_COUNTRY_CODES: string[] = countriesJson.EU_COUNTRY_CODES;
export const EUROPE_NON_EU_CODES: string[] = countriesJson.EUROPE_NON_EU_CODES;
export const EURASIA_CODES: string[] = countriesJson.EURASIA_CODES;
export const REGION_PRESETS: RegionPreset[] = countriesJson.REGION_PRESETS;

const displayNamesCache: Record<string, Intl.DisplayNames> = {};

function getDisplayNames(locale: string = 'es'): Intl.DisplayNames | null {
    const loc = (locale || 'es').toLowerCase().slice(0, 2);
    if (!displayNamesCache[loc]) {
        try {
            if (typeof Intl !== 'undefined' && typeof (Intl as any).DisplayNames === 'function') {
                displayNamesCache[loc] = new Intl.DisplayNames([loc], { type: 'region' });
            }
        } catch {
            return null;
        }
    }
    return displayNamesCache[loc] || null;
}

export function getCountryName(code: string): string {
    const upper = (code || '').toUpperCase().trim();
    const found = COUNTRIES.find(c => c.code === upper);
    return found ? found.name : upper;
}

/**
 * Returns localized country name for a given ISO code in specified locale (defaults to es).
 */
export function getLocalizedCountryName(code: string, locale: string = 'es'): string {
    const upper = (code || '').toUpperCase().trim();
    if (!upper) return '';
    const dn = getDisplayNames(locale);
    if (dn) {
        try {
            const locName = dn.of(upper);
            if (locName) return locName;
        } catch {}
    }
    const found = COUNTRIES.find(c => c.code === upper);
    return found ? found.name : upper;
}

export function getCountryDisplayName(code: string, locale: string = 'es'): string {
    const upper = (code || '').toUpperCase().trim();
    const name = getLocalizedCountryName(upper, locale);
    return name ? `${name} (${upper})` : upper;
}

export function isValidIso2Country(code: string): boolean {
    if (!code || typeof code !== 'string') return false;
    if (!/^[A-Z]{2}$/.test(code)) return false;
    return ISO_COUNTRY_CODES_SET.has(code);
}

export function normalizeIso2Country(code: string): string | null {
    if (!code || typeof code !== 'string') return null;
    const upper = code.trim().toUpperCase();
    if (!isValidIso2Country(upper)) return null;
    return upper;
}

/**
 * Filters countries by search query matching code, English canonical name,
 * and localized names across ES, EN, and DE.
 */
export function filterCountries(
    query: string,
    locale: string = 'es',
    sourceList: CountryItem[] = COUNTRIES
): CountryItem[] {
    if (!query || typeof query !== 'string' || !query.trim()) {
        return sourceList;
    }
    const q = query.trim().toLowerCase();

    // Secondary display name providers for cross-lingual searching (e.g. typing "Alemania" in EN mode or "Spain" in ES mode)
    const dnUser = getDisplayNames(locale);
    const dnES = getDisplayNames('es');
    const dnDE = getDisplayNames('de');
    const dnEN = getDisplayNames('en');

    return sourceList.filter(c => {
        if (c.code.toLowerCase().includes(q)) return true;
        if (c.name.toLowerCase().includes(q)) return true;

        if (dnUser) {
            try {
                const uName = dnUser.of(c.code);
                if (uName && uName.toLowerCase().includes(q)) return true;
            } catch {}
        }
        if (dnES) {
            try {
                const esName = dnES.of(c.code);
                if (esName && esName.toLowerCase().includes(q)) return true;
            } catch {}
        }
        if (dnDE) {
            try {
                const deName = dnDE.of(c.code);
                if (deName && deName.toLowerCase().includes(q)) return true;
            } catch {}
        }
        if (dnEN) {
            try {
                const enName = dnEN.of(c.code);
                if (enName && enName.toLowerCase().includes(q)) return true;
            } catch {}
        }

        return false;
    });
}
