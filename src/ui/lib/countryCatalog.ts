/**
 * src/ui/lib/countryCatalog.ts
 *
 * Canonical Country Catalog & Region Preset Utility.
 *
 * Provides authoritative ISO-2 country lists, human-readable display names,
 * and geographic presets for shipping region configuration.
 */

export interface CountryItem {
    code: string;
    name: string;
}

export const COUNTRIES: CountryItem[] = [
    // Europe (EU)
    { code: 'AT', name: 'Austria' },
    { code: 'BE', name: 'Belgium' },
    { code: 'BG', name: 'Bulgaria' },
    { code: 'HR', name: 'Croatia' },
    { code: 'CY', name: 'Cyprus' },
    { code: 'CZ', name: 'Czech Republic' },
    { code: 'DK', name: 'Denmark' },
    { code: 'EE', name: 'Estonia' },
    { code: 'FI', name: 'Finland' },
    { code: 'FR', name: 'France' },
    { code: 'DE', name: 'Germany' },
    { code: 'GR', name: 'Greece' },
    { code: 'HU', name: 'Hungary' },
    { code: 'IE', name: 'Ireland' },
    { code: 'IT', name: 'Italy' },
    { code: 'LV', name: 'Latvia' },
    { code: 'LT', name: 'Lithuania' },
    { code: 'LU', name: 'Luxembourg' },
    { code: 'MT', name: 'Malta' },
    { code: 'NL', name: 'Netherlands' },
    { code: 'PL', name: 'Poland' },
    { code: 'PT', name: 'Portugal' },
    { code: 'RO', name: 'Romania' },
    { code: 'SK', name: 'Slovakia' },
    { code: 'SI', name: 'Slovenia' },
    { code: 'ES', name: 'Spain' },
    { code: 'SE', name: 'Sweden' },

    // Europe (Non-EU)
    { code: 'GB', name: 'United Kingdom' },
    { code: 'CH', name: 'Switzerland' },
    { code: 'NO', name: 'Norway' },
    { code: 'IS', name: 'Iceland' },
    { code: 'RS', name: 'Serbia' },
    { code: 'AL', name: 'Albania' },
    { code: 'BA', name: 'Bosnia and Herzegovina' },
    { code: 'ME', name: 'Montenegro' },
    { code: 'MK', name: 'North Macedonia' },

    // Eurasia
    { code: 'TR', name: 'Turkey' },
    { code: 'GE', name: 'Georgia' },
    { code: 'AM', name: 'Armenia' },
    { code: 'AZ', name: 'Azerbaijan' },
    { code: 'KZ', name: 'Kazakhstan' },
    { code: 'UZ', name: 'Uzbekistan' },

    // Americas & Global
    { code: 'US', name: 'United States' },
    { code: 'CA', name: 'Canada' },
    { code: 'MX', name: 'Mexico' },
    { code: 'AU', name: 'Australia' },
    { code: 'NZ', name: 'New Zealand' },
    { code: 'AE', name: 'United Arab Emirates' },
    { code: 'SA', name: 'Saudi Arabia' },
    { code: 'IL', name: 'Israel' },
    { code: 'JP', name: 'Japan' },
    { code: 'KR', name: 'South Korea' },
    { code: 'SG', name: 'Singapore' }
];

export const EU_COUNTRY_CODES = [
    'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR',
    'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL',
    'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'
];

export const EUROPE_NON_EU_CODES = [
    'GB', 'CH', 'NO', 'IS', 'RS', 'AL', 'BA', 'ME', 'MK'
];

export const EURASIA_CODES = [
    'TR', 'GE', 'AM', 'AZ', 'KZ', 'UZ'
];

export interface RegionPreset {
    id: string;
    label: string;
    description: string;
    defaultCodes: string[];
}

export const REGION_PRESETS: RegionPreset[] = [
    {
        id: 'EU',
        label: 'European Union',
        description: '27 member states of the EU',
        defaultCodes: EU_COUNTRY_CODES
    },
    {
        id: 'EUROPE_NON_EU',
        label: 'Europe (Non-EU)',
        description: 'UK, Switzerland, Norway, Balkans & Iceland',
        defaultCodes: EUROPE_NON_EU_CODES
    },
    {
        id: 'EURASIA',
        label: 'Eurasia',
        description: 'Turkey, Georgia, Caucasus & Central Asia',
        defaultCodes: EURASIA_CODES
    }
];

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
