/**
 * src/ui/lib/countryCatalog.ts
 *
 * Canonical Master Country Catalog & Region Preset Utility (UI Adapter).
 * Re-exports the universal canonical master ISO dataset from src/lib/countryCatalog.js.
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const masterCatalog = require('../../lib/countryCatalog.js');

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

export const COUNTRIES: CountryItem[] = masterCatalog.COUNTRIES;
export const ISO_COUNTRY_CODES_SET: Set<string> = masterCatalog.ISO_COUNTRY_CODES_SET;
export const EU_COUNTRY_CODES: string[] = masterCatalog.EU_COUNTRY_CODES;
export const EUROPE_NON_EU_CODES: string[] = masterCatalog.EUROPE_NON_EU_CODES;
export const EURASIA_CODES: string[] = masterCatalog.EURASIA_CODES;
export const REGION_PRESETS: RegionPreset[] = masterCatalog.REGION_PRESETS;

export const getCountryName: (code: string) => string = masterCatalog.getCountryName;
export const getCountryDisplayName: (code: string) => string = masterCatalog.getCountryDisplayName;
export const isValidIso2Country: (code: string) => boolean = masterCatalog.isValidIso2Country;
export const normalizeIso2Country: (code: string) => string | null = masterCatalog.normalizeIso2Country;
