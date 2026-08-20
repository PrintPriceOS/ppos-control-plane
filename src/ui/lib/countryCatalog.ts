/**
 * src/ui/lib/countryCatalog.ts
 *
 * Canonical Master Country Catalog & Region Preset Utility (UI Adapter / Browser ESM).
 * Imports directly from the browser-safe canonical JSON data in src/lib/countriesData.json.
 * Zero CommonJS require() calls emitted to the Vite browser bundle.
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

export function getCountryName(code: string): string {
    const upper = (code || '').toUpperCase().trim();
    const found = COUNTRIES.find(c => c.code === upper);
    return found ? found.name : upper;
}

export function getCountryDisplayName(code: string): string {
    const upper = (code || '').toUpperCase().trim();
    const found = COUNTRIES.find(c => c.code === upper);
    return found ? `${found.name} (${found.code})` : upper;
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
