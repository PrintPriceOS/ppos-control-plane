/**
 * src/ui/lib/timezoneCatalog.ts
 *
 * Canonical Master IANA Timezone Catalog & Utility for PrintPrice OS.
 * Provides complete IANA timezone identification, dynamic reference-date offset calculation (respecting DST),
 * country-aware suggestions without silent overrides, legacy alias mapping, and browser-safe fallbacks.
 */

export interface TimezoneItem {
    id: string;          // Canonical IANA identifier, e.g. "Europe/Madrid", "Atlantic/Madeira"
    label: string;       // Formatted human-readable label, e.g. "Europe/Madrid (GMT+2)"
    offset: string;      // Current dynamic offset, e.g. "GMT+2", "GMT-4", "GMT+0"
    region: string;      // Top-level geographic region, e.g. "Europe", "Atlantic", "America"
    city: string;        // Specific city/location, e.g. "Madrid", "Madeira"
}

// Country to IANA timezones suggestions map
// Used to prioritize suggestions in search/pickers WITHOUT overwriting existing selections.
export const COUNTRY_TIMEZONE_MAP: Record<string, string[]> = {
    PT: ['Europe/Lisbon', 'Atlantic/Madeira', 'Atlantic/Azores'],
    ES: ['Europe/Madrid', 'Atlantic/Canary'],
    DE: ['Europe/Berlin', 'Europe/Busingen'],
    FR: ['Europe/Paris'],
    IT: ['Europe/Rome'],
    GB: ['Europe/London'],
    NL: ['Europe/Amsterdam'],
    BE: ['Europe/Brussels'],
    CH: ['Europe/Zurich'],
    AT: ['Europe/Vienna'],
    PL: ['Europe/Warsaw'],
    SE: ['Europe/Stockholm'],
    NO: ['Europe/Oslo'],
    DK: ['Europe/Copenhagen'],
    FI: ['Europe/Helsinki'],
    IE: ['Europe/Dublin'],
    GR: ['Europe/Athens'],
    CZ: ['Europe/Prague'],
    RO: ['Europe/Bucharest'],
    HU: ['Europe/Budapest'],
    US: [
        'America/New_York',
        'America/Chicago',
        'America/Denver',
        'America/Los_Angeles',
        'America/Phoenix',
        'America/Anchorage',
        'Pacific/Honolulu'
    ],
    CA: ['America/Toronto', 'America/Vancouver', 'America/Edmonton', 'America/Winnipeg', 'America/Halifax', 'America/St_Johns'],
    MX: ['America/Mexico_City', 'America/Monterrey', 'America/Tijuana'],
    BR: ['America/Sao_Paulo', 'America/Manaus', 'America/Fortaleza'],
    AR: ['America/Argentina/Buenos_Aires'],
    CL: ['America/Santiago'],
    CO: ['America/Bogota'],
    PE: ['America/Lima'],
    BO: ['America/La_Paz'],
    UY: ['America/Montevideo'],
    AU: ['Australia/Sydney', 'Australia/Melbourne', 'Australia/Brisbane', 'Australia/Perth', 'Australia/Adelaide'],
    NZ: ['Pacific/Auckland'],
    JP: ['Asia/Tokyo'],
    CN: ['Asia/Shanghai'],
    SG: ['Asia/Singapore'],
    HK: ['Asia/Hong_Kong'],
    IN: ['Asia/Kolkata'],
    AE: ['Asia/Dubai'],
    ZA: ['Africa/Johannesburg'],
    MA: ['Africa/Casablanca'],
    EG: ['Africa/Cairo']
};

// Known legacy aliases mapped to standard IANA identifiers
const TIMEZONE_ALIASES: Record<string, string> = {
    'CET': 'Europe/Madrid',
    'CEST': 'Europe/Madrid',
    'WET': 'Europe/Lisbon',
    'WEST': 'Europe/Lisbon',
    'GMT': 'UTC',
    'BST': 'Europe/London',
    'EST': 'America/New_York',
    'EDT': 'America/New_York',
    'CST': 'America/Chicago',
    'CDT': 'America/Chicago',
    'MST': 'America/Denver',
    'MDT': 'America/Denver',
    'PST': 'America/Los_Angeles',
    'PDT': 'America/Los_Angeles'
};

// Comprehensive browser-safe fallback list if Intl.supportedValuesOf is not supported
const FALLBACK_TIMEZONES: string[] = [
    'UTC',
    'Atlantic/Azores',
    'Atlantic/Canary',
    'Atlantic/Madeira',
    'Atlantic/Reykjavik',
    'Europe/Amsterdam',
    'Europe/Andorra',
    'Europe/Athens',
    'Europe/Belgrade',
    'Europe/Berlin',
    'Europe/Bratislava',
    'Europe/Brussels',
    'Europe/Bucharest',
    'Europe/Budapest',
    'Europe/Busingen',
    'Europe/Copenhagen',
    'Europe/Dublin',
    'Europe/Gibraltar',
    'Europe/Helsinki',
    'Europe/Isle_of_Man',
    'Europe/Istanbul',
    'Europe/Jersey',
    'Europe/Kaliningrad',
    'Europe/Kyiv',
    'Europe/Lisbon',
    'Europe/Ljubljana',
    'Europe/London',
    'Europe/Luxembourg',
    'Europe/Madrid',
    'Europe/Malta',
    'Europe/Monaco',
    'Europe/Moscow',
    'Europe/Oslo',
    'Europe/Paris',
    'Europe/Prague',
    'Europe/Riga',
    'Europe/Rome',
    'Europe/Sofia',
    'Europe/Stockholm',
    'Europe/Tallinn',
    'Europe/Tirane',
    'Europe/Vienna',
    'Europe/Vilnius',
    'Europe/Warsaw',
    'Europe/Zagreb',
    'Europe/Zurich',
    'America/Argentina/Buenos_Aires',
    'America/Bogota',
    'America/Caracas',
    'America/Chicago',
    'America/Denver',
    'America/Halifax',
    'America/La_Paz',
    'America/Lima',
    'America/Los_Angeles',
    'America/Manaus',
    'America/Mexico_City',
    'America/Montevideo',
    'America/New_York',
    'America/Phoenix',
    'America/Santiago',
    'America/Sao_Paulo',
    'America/Toronto',
    'America/Vancouver',
    'Asia/Bangkok',
    'Asia/Dubai',
    'Asia/Hong_Kong',
    'Asia/Jerusalem',
    'Asia/Kolkata',
    'Asia/Seoul',
    'Asia/Shanghai',
    'Asia/Singapore',
    'Asia/Tokyo',
    'Australia/Melbourne',
    'Australia/Perth',
    'Australia/Sydney',
    'Pacific/Auckland',
    'Pacific/Honolulu'
];

/**
 * Calculates dynamically formatted offset string (e.g. "GMT+2", "GMT-4", "GMT+0")
 * for a specific IANA timezone and reference date.
 */
export function formatTimezoneOffset(tzId: string, refDate: Date = new Date()): string {
    try {
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: tzId,
            timeZoneName: 'shortOffset'
        }).formatToParts(refDate);
        const match = parts.find(p => p.type === 'timeZoneName');
        return match?.value || 'GMT+0';
    } catch {
        return 'GMT';
    }
}

/**
 * Returns raw list of all supported IANA timezones.
 */
export function getAllIanaTimezones(): string[] {
    try {
        if (typeof Intl !== 'undefined' && typeof (Intl as any).supportedValuesOf === 'function') {
            const list = (Intl as any).supportedValuesOf('timeZone') as string[];
            if (Array.isArray(list) && list.length > 0) {
                // Ensure UTC is included
                if (!list.includes('UTC')) {
                    return ['UTC', ...list];
                }
                return list;
            }
        }
    } catch {}
    return FALLBACK_TIMEZONES;
}

/**
 * Parses and maps a timezone item with dynamic offset calculation.
 */
export function parseTimezoneItem(tzId: string, refDate: Date = new Date()): TimezoneItem {
    const offset = formatTimezoneOffset(tzId, refDate);
    const slashIdx = tzId.indexOf('/');
    let region = 'Global';
    let city = tzId;

    if (slashIdx !== -1) {
        region = tzId.slice(0, slashIdx);
        city = tzId.slice(slashIdx + 1).replace(/_/g, ' ');
    }

    return {
        id: tzId,
        label: `${tzId.replace(/_/g, ' ')} (${offset})`,
        offset,
        region,
        city
    };
}

let cachedTimezones: TimezoneItem[] | null = null;
let lastCacheTime = 0;

/**
 * Returns complete catalog of TimezoneItems, cached for 1 hour.
 */
export function getTimezones(refDate: Date = new Date()): TimezoneItem[] {
    const now = Date.now();
    if (cachedTimezones && (now - lastCacheTime < 3600000)) {
        return cachedTimezones;
    }

    const rawList = getAllIanaTimezones();
    const items = rawList.map(tz => parseTimezoneItem(tz, refDate));
    cachedTimezones = items;
    lastCacheTime = now;
    return items;
}

/**
 * Resolves a timezone string (including aliases) to a canonical IANA identifier.
 */
export function resolveCanonicalTimezone(input?: string): string {
    if (!input || typeof input !== 'string') return 'Europe/Madrid';
    const clean = input.trim();
    if (TIMEZONE_ALIASES[clean.toUpperCase()]) {
        return TIMEZONE_ALIASES[clean.toUpperCase()];
    }
    return clean;
}

/**
 * Checks whether an input is a recognized IANA timezone identifier.
 */
export function isKnownIanaTimezone(tzId: string): boolean {
    if (!tzId || typeof tzId !== 'string') return false;
    const all = getTimezones();
    return all.some(t => t.id.toLowerCase() === tzId.trim().toLowerCase());
}

/**
 * Filters timezones by search query and groups by country suggestions.
 */
export function filterTimezones(
    query: string,
    countryCode?: string,
    refDate: Date = new Date()
): { suggested: TimezoneItem[]; other: TimezoneItem[] } {
    const all = getTimezones(refDate);
    const normCountry = (countryCode || '').trim().toUpperCase();
    const suggestedIds = new Set(COUNTRY_TIMEZONE_MAP[normCountry] || []);

    const q = (query || '').trim().toLowerCase();

    const matchesQuery = (item: TimezoneItem): boolean => {
        if (!q) return true;
        return (
            item.id.toLowerCase().includes(q) ||
            item.city.toLowerCase().includes(q) ||
            item.offset.toLowerCase().includes(q) ||
            item.region.toLowerCase().includes(q)
        );
    };

    const suggested: TimezoneItem[] = [];
    const other: TimezoneItem[] = [];

    for (const item of all) {
        if (!matchesQuery(item)) continue;
        if (suggestedIds.has(item.id)) {
            suggested.push(item);
        } else {
            other.push(item);
        }
    }

    // Sort suggested by the order defined in COUNTRY_TIMEZONE_MAP
    if (COUNTRY_TIMEZONE_MAP[normCountry]) {
        const orderMap = new Map(COUNTRY_TIMEZONE_MAP[normCountry].map((id, idx) => [id, idx]));
        suggested.sort((a, b) => (orderMap.get(a.id) ?? 99) - (orderMap.get(b.id) ?? 99));
    }

    return { suggested, other };
}
