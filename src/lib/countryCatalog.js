/**
 * src/lib/countryCatalog.js
 *
 * Universal Canonical Master Country Catalog (ISO 3166-1 alpha-2 standard dataset).
 * Single shared source of truth for Backend (Node.js/CJS) environments.
 * Data is sourced from canonical JSON in src/lib/countriesData.json.
 */

const data = require('./countriesData.json');

const COUNTRIES = data.COUNTRIES;
const EU_COUNTRY_CODES = data.EU_COUNTRY_CODES;
const EUROPE_NON_EU_CODES = data.EUROPE_NON_EU_CODES;
const EURASIA_CODES = data.EURASIA_CODES;
const REGION_PRESETS = data.REGION_PRESETS;

const ISO_COUNTRY_CODES_SET = new Set(COUNTRIES.map(c => c.code));

function getCountryName(code) {
    const upper = (code || '').toUpperCase().trim();
    const found = COUNTRIES.find(c => c.code === upper);
    return found ? found.name : upper;
}

function getCountryDisplayName(code) {
    const upper = (code || '').toUpperCase().trim();
    const found = COUNTRIES.find(c => c.code === upper);
    return found ? `${found.name} (${found.code})` : upper;
}

function isValidIso2Country(code) {
    if (!code || typeof code !== 'string') return false;
    if (!/^[A-Z]{2}$/.test(code)) return false;
    return ISO_COUNTRY_CODES_SET.has(code);
}

function normalizeIso2Country(code) {
    if (!code || typeof code !== 'string') return null;
    const upper = code.trim().toUpperCase();
    if (!isValidIso2Country(upper)) return null;
    return upper;
}

module.exports = {
    COUNTRIES,
    ISO_COUNTRY_CODES_SET,
    EU_COUNTRY_CODES,
    EUROPE_NON_EU_CODES,
    EURASIA_CODES,
    REGION_PRESETS,
    getCountryName,
    getCountryDisplayName,
    isValidIso2Country,
    normalizeIso2Country
};
