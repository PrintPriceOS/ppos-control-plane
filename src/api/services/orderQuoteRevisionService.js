'use strict';

/**
 * src/api/services/orderQuoteRevisionService.js
 * 
 * PrintPrice OS — Phase 196G: Governed Order Quote Revision & Single-Use Token Service (BUDGET-02C-01R)
 *
 * Implements SEC-C01 to SEC-C06:
 * 1. SEC-C01: Real CSPRNG OTP challenge (6-digit), salt + SHA-256 hash storage, 15-min TTL,
 *    transactional retry limit (3 max), proof-of-delivery requirement, fail-closed without delivery channel,
 *    and cryptographically bound authenticated session verification.
 * 2. SEC-C02: Strict server-side authority over economic data (tenant, BPE snapshot, rates, margin,
 *    variant, tax classification, and prices resolved from authoritative systems of record).
 * 3. SEC-C03: Real BPE engine calculation parity, prohibition of client cost overrides,
 *    unaffected line items strictly frozen, and fail-closed RECALCULATION_BLOCKED on missing data.
 * 4. SEC-C04: Strictly read-only GET endpoint (zero SQL writes, in-memory clock expiration evaluation,
 *    separate transactional operation for persistent state transitions).
 * 5. SEC-C05: Multi-tenant and printhouse authorization for revision issuance and revocation,
 *    trusted context resolution (req.actor.tenantId), no superadmin bypass for misconfigured orders.
 * 6. SEC-C06: Cryptographically bound tokens (amount, currency, recipient, order, revision),
 *    replay prevention, POST-only mutation, express consent logging, token redaction in logs,
 *    and decoupled triple gates.
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const mysqlClient = require('./mysqlClient');
const logger = require('./logger').child('order-quote-revision-service');
const TaxVatReadinessClassifierService = require('./taxVatReadinessClassifierService');
const pricingSnapshotCanonicalizer = require('./pricingSnapshotCanonicalizer');

const taxClassifier = new TaxVatReadinessClassifierService();

class OrderQuoteRevisionError extends Error {
    constructor(message, code, statusCode = 400, details = null) {
        super(message);
        this.name = 'OrderQuoteRevisionError';
        this.code = code;
        this.statusCode = statusCode;
        this.details = details;
    }
}

/**
 * Redacts raw cryptographic tokens for safe logging and error reporting (SEC-C06).
 */
function redactToken(token) {
    if (!token || typeof token !== 'string') return '[REDACTED]';
    if (token.length <= 8) return '***';
    return `${token.slice(0, 4)}***${token.slice(-4)}`;
}

/**
 * Safely parses UTC dates whether returned as JS Date, ISO string, or MySQL DATETIME string.
 */
function parseUtcDate(val) {
    if (!val) return null;
    if (val instanceof Date) return val;
    const str = String(val).trim();
    if (str.endsWith('Z') || str.includes('+') || str.includes('GMT')) {
        return new Date(str);
    }
    return new Date(str.replace(' ', 'T') + 'Z');
}

/**
 * Recursively canonicalizes an object with sorted keys to produce deterministic hashes.
 */
function canonicalizeObject(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(canonicalizeObject);
    const sorted = {};
    for (const key of Object.keys(obj).sort()) {
        if (key !== '__proto__' && key !== 'constructor' && key !== 'prototype' && obj[key] !== undefined) {
            sorted[key] = canonicalizeObject(obj[key]);
        }
    }
    return sorted;
}

/**
 * Computes SHA-256 hash of canonicalized JSON.
 */
function sha256Canonical(obj) {
    const canonicalStr = JSON.stringify(canonicalizeObject(obj));
    return crypto.createHash('sha256').update(canonicalStr).digest('hex');
}

/**
 * Recursively freezes an object and all nested properties to guarantee complete immutability.
 */
function deepFreeze(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    Object.freeze(obj);
    for (const key of Object.getOwnPropertyNames(obj)) {
        if (obj[key] !== null && typeof obj[key] === 'object' && !Object.isFrozen(obj[key])) {
            deepFreeze(obj[key]);
        }
    }
    return obj;
}

/**
 * Computes salted OTP hash bound to a specific revision (SEC-C01).
 */
function computeSaltedOtpHash(otpCode, salt, revisionId) {
    return crypto.createHash('sha256')
        .update(`${String(otpCode).trim()}:${salt}:${revisionId}`)
        .digest('hex');
}

/**
 * Computes official statutory holidays for any supported Spanish jurisdiction for a given calendar year.
 * Includes fixed national holidays, jurisdictional holidays, and variable Easter holidays computed deterministically
 * via the Meeus/Butcher Western Easter algorithm. Also merges any custom/municipal printhouse holidays.
 */
function getOfficialHolidaysForJurisdiction(year, jurisdiction = 'ES-MD', customHolidays = null) {
    const pad2 = (n) => String(n).padStart(2, '0');
    const fixed = [
        `${year}-01-01`, // Año Nuevo
        `${year}-01-06`, // Epifanía del Señor / Reyes
        `${year}-05-01`, // Fiesta del Trabajo
        `${year}-08-15`, // Asunción de la Virgen
        `${year}-10-12`, // Fiesta Nacional de España
        `${year}-11-01`, // Todos los Santos
        `${year}-12-06`, // Día de la Constitución Española
        `${year}-12-08`, // Inmaculada Concepción
        `${year}-12-25`  // Natividad del Señor
    ];

    // Meeus/Butcher Western Easter algorithm
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;

    const easterSunday = new Date(Date.UTC(year, month - 1, day));
    const holyThursday = new Date(easterSunday.getTime() - 3 * 86400000);
    const goodFriday = new Date(easterSunday.getTime() - 2 * 86400000);
    const easterMonday = new Date(easterSunday.getTime() + 1 * 86400000);

    const fmt = (d) => `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
    const holyThursdayStr = fmt(holyThursday);
    const goodFridayStr = fmt(goodFriday);
    const easterMondayStr = fmt(easterMonday);

    const jurisdictionalHolidays = [];
    // Good Friday is a statutory national holiday across all Spain
    jurisdictionalHolidays.push(goodFridayStr);

    const jur = String(jurisdiction || 'ES-MD').toUpperCase();
    if (jur === 'ES-MD') {
        jurisdictionalHolidays.push(holyThursdayStr);
        jurisdictionalHolidays.push(`${year}-05-02`); // Fiesta de la Comunidad de Madrid
    } else if (jur === 'ES-CT') {
        jurisdictionalHolidays.push(easterMondayStr);
        jurisdictionalHolidays.push(`${year}-06-24`); // Sant Joan
        jurisdictionalHolidays.push(`${year}-09-11`); // Diada Nacional de Catalunya
        jurisdictionalHolidays.push(`${year}-12-26`); // Sant Esteve
    } else if (jur === 'ES-VC') {
        jurisdictionalHolidays.push(`${year}-03-19`); // San José
        jurisdictionalHolidays.push(easterMondayStr);
        jurisdictionalHolidays.push(`${year}-06-24`); // Sant Joan
        jurisdictionalHolidays.push(`${year}-10-09`); // Día de la Comunitat Valenciana
    } else if (jur === 'ES-AN') {
        jurisdictionalHolidays.push(`${year}-02-28`); // Día de Andalucía
        jurisdictionalHolidays.push(holyThursdayStr);
    } else if (jur === 'ES-GA') {
        jurisdictionalHolidays.push(holyThursdayStr);
        jurisdictionalHolidays.push(`${year}-05-17`); // Letras Galegas
        jurisdictionalHolidays.push(`${year}-07-25`); // Santiago Apóstol
    } else if (jur === 'ES-PV') {
        jurisdictionalHolidays.push(holyThursdayStr);
        jurisdictionalHolidays.push(easterMondayStr);
        jurisdictionalHolidays.push(`${year}-07-25`); // Santiago Apóstol
    } else {
        jurisdictionalHolidays.push(holyThursdayStr);
    }

    const holidaySet = new Set([...fixed, ...jurisdictionalHolidays]);

    if (customHolidays && Array.isArray(customHolidays)) {
        for (const ch of customHolidays) {
            if (!ch || typeof ch !== 'string') continue;
            const str = ch.trim();
            if (str.length === 5) {
                holidaySet.add(`${year}-${str}`);
            } else if (str.length === 10) {
                holidaySet.add(str);
            }
        }
    }

    return holidaySet;
}

/**
 * Backward-compatible wrapper for Madrid official holidays.
 */
function getMadridOfficialHolidays(year) {
    return getOfficialHolidaysForJurisdiction(year, 'ES-MD');
}

/**
 * Extracts localized calendar components in the target IANA timezone (e.g. 'Europe/Madrid').
 * Fully accounts for Daylight Saving Time (CET UTC+1 vs CEST UTC+2).
 */
function getZonedDateTimeParts(date, timeZone = 'Europe/Madrid') {
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        weekday: 'short',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
        hourCycle: 'h23'
    });
    const parts = formatter.formatToParts(date);
    const map = {};
    for (const p of parts) map[p.type] = p.value;
    return {
        year: parseInt(map.year, 10),
        month: map.month,
        day: map.day,
        weekday: map.weekday, // 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'
        hour: parseInt(map.hour, 10),
        minute: parseInt(map.minute, 10),
        second: parseInt(map.second, 10),
        isoDate: `${map.year}-${map.month}-${map.day}`
    };
}

/**
 * Calculates expiration timestamp based on authoritative printhouse business hours (TIME-01R).
 * Operates Mon-Fri 09:00 to 18:00 in IANA timezone, seamlessly handling:
 * - Minute precision (exact calculations from 09:15, 13:30, 17:45, partial starts).
 * - Effective operating hours: 8 hours/day with 1-hour lunch break (14:00-15:00) by default,
 *   or 9 continuous hours/day when hasLunchBreak = false.
 * - Jurisdictional calendar of the printhouse (ES-MD, ES-CT, ES-VC, ES-AN, customHolidays).
 * - Exact CET/CEST daylight saving transitions.
 * - Weekends and official statutory holidays.
 * Returns exact UTC Date.
 */
function calculateBusinessHoursExpirationUtc({
    startDate = new Date(),
    businessHours = 48,
    timezone = 'Europe/Madrid',
    jurisdiction = 'ES-MD',
    customHolidays = null,
    hasLunchBreak = true
} = {}) {
    if (businessHours <= 0) return new Date(startDate.getTime());

    let current = new Date(startDate.getTime());
    let remainingMinutes = Math.round(businessHours * 60);
    const holidayCache = new Map();

    const isHoliday = (isoDate, year) => {
        if (!holidayCache.has(year)) {
            holidayCache.set(year, getOfficialHolidaysForJurisdiction(year, jurisdiction, customHolidays));
        }
        return holidayCache.get(year).has(isoDate);
    };

    const isWorkingDay = (local) => {
        if (local.weekday === 'Sat' || local.weekday === 'Sun') return false;
        if (isHoliday(local.isoDate, local.year)) return false;
        return true;
    };

    while (remainingMinutes > 0) {
        let local = getZonedDateTimeParts(current, timezone);

        // 1. If not a working day (weekend or statutory holiday), advance 1 hour
        if (!isWorkingDay(local)) {
            current = new Date(current.getTime() + 60 * 60 * 1000);
            continue;
        }

        // 2. Working day, before 09:00 opening: advance directly to 09:00:00
        if (local.hour < 9) {
            const minutesToNine = (9 - local.hour) * 60 - local.minute - (local.second > 0 ? 1 : 0);
            current = new Date(current.getTime() + Math.max(1, minutesToNine) * 60 * 1000);
            continue;
        }

        // 3. Working day, during lunch break (14:00 - 15:00) when hasLunchBreak is true
        if (hasLunchBreak && local.hour === 14) {
            const minutesToFifteen = (15 - local.hour) * 60 - local.minute - (local.second > 0 ? 1 : 0);
            current = new Date(current.getTime() + Math.max(1, minutesToFifteen) * 60 * 1000);
            continue;
        }

        // 4. Working day, after 18:00 closing: advance 1 hour into night
        if (local.hour >= 18) {
            current = new Date(current.getTime() + 60 * 60 * 1000);
            continue;
        }

        // 5. Active working segment:
        // Segment 1: [09:00, 14:00) if hasLunchBreak, else [09:00, 18:00)
        // Segment 2: [15:00, 18:00) if hasLunchBreak
        let boundaryHour = 18;
        if (hasLunchBreak && local.hour < 14) {
            boundaryHour = 14;
        }

        const minutesLeftInSegment = (boundaryHour - local.hour) * 60 - local.minute;
        const minutesToConsume = Math.min(remainingMinutes, minutesLeftInSegment);

        current = new Date(current.getTime() + minutesToConsume * 60 * 1000);
        remainingMinutes -= minutesToConsume;
    }

    return current;
}

/**
 * Validates BPE calculation snapshot provenance and cryptographic integrity (BPE-01R).
 * Eliminates all self-declared provenance flags (e.g. bpe_snapshot_provenance_verified).
 * Strictly requires verifiable evidence from order_pricing_snapshots:
 * 1. Sealed record existence and status === 'SEALED'.
 * 2. Non-empty sealing authority (sealed_by).
 * 3. Exact order identity and tenant identity binding.
 * 4. Formula version and BPE engine version correspondence.
 * 5. Effective tariff / rate card checksum matching.
 * 6. Baseline commercial amount correspondence.
 * 7. Recalculated canonical SHA-256 fingerprint matching the sealed snapshot_checksum.
 */
function validateBpeSnapshotProvenance(snapshot, { orderId, orderRef, tenantId, sealedRecord, rawPayload } = {}) {
    if (!snapshot || typeof snapshot !== 'object') {
        return { valid: false, code: 'INVALID_SNAPSHOT_STRUCTURE', message: 'Calculation snapshot is not an object.' };
    }

    // 1. Technical completeness: specs, rates, and breakdown
    if (!snapshot.specs || typeof snapshot.specs !== 'object') {
        return { valid: false, code: 'INCOMPLETE_SNAPSHOT_SPECS', message: 'Calculation snapshot missing specifications.' };
    }
    if (!snapshot.rates || typeof snapshot.rates !== 'object') {
        return { valid: false, code: 'INCOMPLETE_SNAPSHOT_RATES', message: 'Calculation snapshot missing baseline rates.' };
    }
    if (!snapshot.breakdown || typeof snapshot.breakdown !== 'object') {
        return { valid: false, code: 'INCOMPLETE_SNAPSHOT_BREAKDOWN', message: 'Calculation snapshot missing cost breakdown.' };
    }

    // 2. Engine version presence and format
    const engineVersion = snapshot.bpe_engine_version || snapshot.formula_version || snapshot.engine_version;
    if (!engineVersion || typeof engineVersion !== 'string' || !engineVersion.trim()) {
        return { valid: false, code: 'MISSING_BPE_ENGINE_VERSION', message: 'Calculation snapshot lacks verifiable BPE engine version.' };
    }

    // 3. Tariff / Rate card checksum presence and format
    const ratesChecksum = snapshot.rates_checksum || snapshot.rate_card_checksum;
    if (!ratesChecksum || typeof ratesChecksum !== 'string' || !ratesChecksum.trim()) {
        return { valid: false, code: 'MISSING_RATES_CHECKSUM', message: 'Calculation snapshot lacks verifiable tariff checksum.' };
    }
    if (ratesChecksum.length < 8 || !/^[a-zA-Z0-9_\-\.]+$/.test(ratesChecksum)) {
        return { valid: false, code: 'INCOMPATIBLE_RATES_CHECKSUM', message: 'Calculation snapshot tariff checksum format is invalid or corrupted.' };
    }

    // 4. Authoritative database sealing evidence (BPE-01R)
    // Elimination of self-declared flags: bpe_snapshot_provenance_verified is strictly ignored
    if (!sealedRecord || typeof sealedRecord !== 'object') {
        return {
            valid: false,
            code: 'UNVERIFIED_SNAPSHOT_PROVENANCE',
            message: 'Calculation snapshot lacks authoritative cryptographic sealing record in order_pricing_snapshots.'
        };
    }

    // 5. Sealed Status & Sealing Authority
    if (sealedRecord.status !== 'SEALED') {
        return {
            valid: false,
            code: 'UNVERIFIED_SNAPSHOT_STATUS',
            message: `Snapshot status in order_pricing_snapshots is '${sealedRecord.status}', expected 'SEALED'.`
        };
    }
    if (!sealedRecord.sealed_by || typeof sealedRecord.sealed_by !== 'string' || !sealedRecord.sealed_by.trim()) {
        return {
            valid: false,
            code: 'MISSING_SEAL_AUTHORITY',
            message: 'Pricing snapshot record lacks verifiable sealing authority identity (sealed_by).'
        };
    }

    // 6. Order Identity & Tenant Isolation Binding (VALIDACIÓN 2)
    if (!sealedRecord.tenant_id || typeof sealedRecord.tenant_id !== 'string' || !sealedRecord.tenant_id.trim()) {
        return {
            valid: false,
            code: 'MISSING_SEALED_TENANT_ID',
            message: 'Pricing snapshot record in order_pricing_snapshots lacks valid non-empty tenant_id.'
        };
    }
    if (!sealedRecord.order_id || typeof sealedRecord.order_id !== 'string' || !sealedRecord.order_id.trim()) {
        return {
            valid: false,
            code: 'MISSING_SEALED_ORDER_ID',
            message: 'Pricing snapshot record in order_pricing_snapshots lacks valid non-empty order_id.'
        };
    }
    if (tenantId && sealedRecord.tenant_id !== tenantId) {
        return {
            valid: false,
            code: 'SNAPSHOT_TENANT_MISMATCH',
            message: `Snapshot sealed for tenant '${sealedRecord.tenant_id}', but requested for '${tenantId}'.`
        };
    }
    const isOrderMatch = (orderId && sealedRecord.order_id === orderId) || (orderRef && sealedRecord.order_id === orderRef);
    if (!isOrderMatch) {
        return {
            valid: false,
            code: 'SNAPSHOT_ORDER_MISMATCH',
            message: `Snapshot sealed for order '${sealedRecord.order_id}', but requested for '${orderId || orderRef}'.`
        };
    }
    const payloadOrderId = snapshot.order_id || snapshot.order_intent_id;
    if (payloadOrderId && payloadOrderId !== orderId && payloadOrderId !== orderRef && payloadOrderId !== sealedRecord.order_id) {
        return {
            valid: false,
            code: 'SNAPSHOT_ORDER_MISMATCH',
            message: `Snapshot payload contains order '${payloadOrderId}', mismatched with requested order '${orderId || orderRef}'.`
        };
    }
    const payloadTenantId = snapshot.tenant_id;
    if (payloadTenantId && tenantId && payloadTenantId !== tenantId) {
        return {
            valid: false,
            code: 'SNAPSHOT_TENANT_MISMATCH',
            message: `Snapshot payload contains tenant '${payloadTenantId}', mismatched with requested tenant '${tenantId}'.`
        };
    }
    if (payloadTenantId && sealedRecord.tenant_id && payloadTenantId !== sealedRecord.tenant_id) {
        return {
            valid: false,
            code: 'SNAPSHOT_TENANT_MISMATCH',
            message: `Snapshot payload contains tenant '${payloadTenantId}', mismatched with sealed tenant '${sealedRecord.tenant_id}'.`
        };
    }

    // 7. Engine version match with sealed record
    if (!sealedRecord.formula_version || typeof sealedRecord.formula_version !== 'string' || !sealedRecord.formula_version.trim()) {
        return {
            valid: false,
            code: 'MISSING_SEALED_FORMULA_VERSION',
            message: 'Pricing snapshot record lacks verifiable formula_version.'
        };
    }
    if (sealedRecord.formula_version !== engineVersion) {
        return {
            valid: false,
            code: 'BPE_ENGINE_VERSION_MISMATCH',
            message: `Snapshot engine version '${engineVersion}' does not match sealed formula version '${sealedRecord.formula_version}'.`
        };
    }

    // 8. Tariff checksum match with sealed record
    if (!sealedRecord.rate_card_checksum || typeof sealedRecord.rate_card_checksum !== 'string' || !sealedRecord.rate_card_checksum.trim()) {
        return {
            valid: false,
            code: 'MISSING_SEALED_RATE_CARD_CHECKSUM',
            message: 'Pricing snapshot record lacks verifiable rate_card_checksum.'
        };
    }
    if (sealedRecord.rate_card_checksum !== ratesChecksum) {
        return {
            valid: false,
            code: 'INCOMPATIBLE_RATES_CHECKSUM',
            message: `Snapshot rates checksum '${ratesChecksum}' does not match sealed rate card checksum '${sealedRecord.rate_card_checksum}'.`
        };
    }

    // 9. Baseline net price correspondence
    if (sealedRecord.final_amount === null || sealedRecord.final_amount === undefined || isNaN(Number(sealedRecord.final_amount))) {
        return {
            valid: false,
            code: 'MISSING_SEALED_FINAL_AMOUNT',
            message: 'Pricing snapshot record in order_pricing_snapshots lacks valid numeric final_amount.'
        };
    }
    const snapshotBaseNet = snapshot.base_net_price !== undefined ? Number(snapshot.base_net_price) : (snapshot.final_amount !== undefined ? Number(snapshot.final_amount) : null);
    const sealedFinalAmount = Number(sealedRecord.final_amount);
    if (snapshotBaseNet === null || isNaN(snapshotBaseNet)) {
        return {
            valid: false,
            code: 'MISSING_SNAPSHOT_BASE_PRICE',
            message: 'Calculation snapshot lacks valid baseline base_net_price or final_amount.'
        };
    }
    if (Math.abs(snapshotBaseNet - sealedFinalAmount) > 0.0001) {
        return {
            valid: false,
            code: 'BASELINE_AMOUNT_MISMATCH',
            message: `Snapshot baseline net price '${snapshotBaseNet}' does not match sealed final amount '${sealedFinalAmount}'.`
        };
    }

    // 10. Cryptographic Fingerprint Integrity Check (Canonical SHA-256)
    if (!sealedRecord.snapshot_checksum || typeof sealedRecord.snapshot_checksum !== 'string' || !sealedRecord.snapshot_checksum.trim()) {
        return {
            valid: false,
            code: 'MISSING_SEALED_CHECKSUM',
            message: 'Pricing snapshot record in order_pricing_snapshots lacks cryptographic snapshot_checksum.'
        };
    }
    let calculatedChecksum;
    try {
        calculatedChecksum = pricingSnapshotCanonicalizer.calculatePricingSnapshotChecksum(snapshot);
    } catch (err) {
        return {
            valid: false,
            code: 'CANONICALIZATION_FAILED',
            message: `Failed to canonicalize calculation snapshot: ${err.message}`
        };
    }

    let isMatch = (calculatedChecksum === sealedRecord.snapshot_checksum);
    if (!isMatch && rawPayload && typeof rawPayload === 'object') {
        try {
            const rawChecksum = pricingSnapshotCanonicalizer.calculatePricingSnapshotChecksum(rawPayload);
            if (rawChecksum === sealedRecord.snapshot_checksum) {
                isMatch = true;
                calculatedChecksum = rawChecksum;
            }
        } catch (_) {}
    }

    if (!isMatch) {
        return {
            valid: false,
            code: 'SNAPSHOT_INTEGRITY_TAMPERED',
            message: `Cryptographic fingerprint mismatch. Calculated '${calculatedChecksum}', expected sealed '${sealedRecord.snapshot_checksum}'.`
        };
    }

    // Return immutable deep-frozen copy of verified calculation payload to prevent any post-validation tampering
    const validatedPayload = JSON.parse(JSON.stringify(snapshot));
    validatedPayload._source = 'ORDER_PRICING_SNAPSHOTS';
    if (sealedRecord.snapshot_id) {
        validatedPayload._sealedSnapshotId = sealedRecord.snapshot_id;
    }
    validatedPayload._verifiedChecksum = calculatedChecksum;
    deepFreeze(validatedPayload);

    return { valid: true, checksum: calculatedChecksum, validatedPayload };
}

/**
 * Deterministic BPE Interior Paper Recalculation Engine (SEC-C03).
 * Recomputes paper weight and type substitution, preserving all other line items strictly frozen.
 * Prohibits client cost overrides and eliminates fictitious fallback constants.
 */
function recalculateDeterministicBpePrice({
    originalCalculation,
    alternativeVariant,
    targetMarginPct,
    clientOverrides
}) {
    if (!originalCalculation || typeof originalCalculation !== 'object') {
        throw new OrderQuoteRevisionError(
            'Missing baseline calculation snapshot. Cannot reproduce BPE pricing deterministically.',
            'RECALCULATION_BLOCKED',
            422,
            { reason: 'MISSING_BASELINE_CALCULATION' }
        );
    }

    const {
        bpe_engine_version,
        rates_checksum,
        specs,
        rates,
        breakdown
    } = originalCalculation;

    if (!bpe_engine_version || !rates_checksum || !specs || !rates || !breakdown) {
        throw new OrderQuoteRevisionError(
            'Incomplete baseline snapshot. Rates, specs, or engine version missing for reproducible calculation.',
            'RECALCULATION_BLOCKED',
            422,
            { reason: 'INCOMPLETE_SNAPSHOT_METADATA' }
        );
    }

    // SEC-C03: Strict prohibition of client paper cost overrides
    if (!alternativeVariant || typeof alternativeVariant !== 'object') {
        throw new OrderQuoteRevisionError(
            'Alternative variant must be specified as an object.',
            'INVALID_ALTERNATIVE_VARIANT',
            400
        );
    }

    if (
        alternativeVariant.interior_paper_cost_override !== undefined ||
        clientOverrides?.interior_paper_cost_override !== undefined ||
        clientOverrides?.cost_override !== undefined
    ) {
        throw new OrderQuoteRevisionError(
            'Client paper cost override is strictly prohibited. Costs must be derived from authoritative rates.',
            'COST_OVERRIDE_PROHIBITED',
            400
        );
    }

    // 1. Validate unchanged specs (Fail-closed on missing specs)
    const copies = specs.copies;
    const pages = specs.interior_pages;
    const baseGsm = specs.paper_weight_interior;

    if (!copies || !pages || !baseGsm) {
        throw new OrderQuoteRevisionError(
            'Baseline specs must contain copies, interior_pages, and paper_weight_interior.',
            'RECALCULATION_BLOCKED',
            422,
            { reason: 'INCOMPLETE_SPECS' }
        );
    }

    const altVariantWidth = alternativeVariant.width_mm || alternativeVariant.sheet_width || alternativeVariant.custom_width;
    const altVariantHeight = alternativeVariant.height_mm || alternativeVariant.sheet_height || alternativeVariant.custom_height;

    const sheetWidth = altVariantWidth || specs.sheet_width;
    const sheetHeight = altVariantHeight || specs.sheet_height;

    if (!sheetWidth || !sheetHeight) {
        throw new OrderQuoteRevisionError(
            'Sheet dimensions (width and height) must be specified for paper calculation.',
            'RECALCULATION_BLOCKED',
            422,
            { reason: 'MISSING_DIMENSIONS' }
        );
    }

    // SEC-C03R: Strict dimensional parity & imposition preservation
    // When alternative sheet format differs from the baseline printing press sheet,
    // imposition changes and cannot be approximated without full BPE re-engineering.
    if (specs.sheet_width && specs.sheet_height && altVariantWidth && altVariantHeight) {
        if (Number(altVariantWidth) !== Number(specs.sheet_width) || Number(altVariantHeight) !== Number(specs.sheet_height)) {
            throw new OrderQuoteRevisionError(
                `Alternative sheet dimensions (${altVariantWidth}x${altVariantHeight} mm) do not match baseline press sheet (${specs.sheet_width}x${specs.sheet_height} mm). Imposition alteration requires full BPE re-engineering. Recalculation blocked.`,
                'RECALCULATION_BLOCKED',
                422,
                {
                    reason: 'UNSUPPORTED_DIMENSIONAL_SUBSTITUTION',
                    original_sheet: { width_mm: specs.sheet_width, height_mm: specs.sheet_height },
                    alternative_sheet: { width_mm: altVariantWidth, height_mm: altVariantHeight }
                }
            );
        }
    }

    const sheetAreaM2 = (sheetWidth * sheetHeight) / 1000000;

    // 2. Kilos and Paper Cost from Frozen Rates
    // SEC-C02 & SEC-C03: Zero fictitious fallback constants. Fails closed if category is missing in frozen rates.
    const altCategory = (alternativeVariant.category || alternativeVariant.paper_type || specs.paper_type_interior || '').toLowerCase();
    const paperPricePerKilo = rates.paper_price_interior_by_kilo?.[altCategory];

    if (paperPricePerKilo === undefined || paperPricePerKilo === null || isNaN(paperPricePerKilo)) {
        throw new OrderQuoteRevisionError(
            `Paper price per kilo missing for category '${altCategory}' in frozen rates.`,
            'RECALCULATION_BLOCKED',
            422,
            { reason: 'MISSING_TARIFF_RATE', category: altCategory }
        );
    }

    const basePaperCost = breakdown.interior_paper_cost;
    if (basePaperCost === undefined || basePaperCost === null || isNaN(basePaperCost)) {
        throw new OrderQuoteRevisionError(
            'Baseline interior paper cost missing in breakdown.',
            'RECALCULATION_BLOCKED',
            422,
            { reason: 'MISSING_BASE_PAPER_COST' }
        );
    }

    // SEC-C03: Verify all frozen line items are present without fictitious fallback defaults
    const requiredFrozenLines = [
        'cover_paper_cost',
        'interior_print_cost',
        'cover_print_cost',
        'endpapers_cost',
        'binding_cost'
    ];
    for (const line of requiredFrozenLines) {
        if (breakdown[line] === undefined || breakdown[line] === null || isNaN(breakdown[line])) {
            throw new OrderQuoteRevisionError(
                `Baseline component '${line}' missing in breakdown. Cannot guarantee frozen components.`,
                'RECALCULATION_BLOCKED',
                422,
                { reason: 'INCOMPLETE_SNAPSHOT_BREAKDOWN', component: line }
            );
        }
    }
    const freightCost = breakdown.freight_cost !== undefined ? breakdown.freight_cost : 0.00;

    const baseKilos = breakdown.kilos_interior !== undefined 
        ? breakdown.kilos_interior 
        : Math.round((basePaperCost / paperPricePerKilo) * 100) / 100;
    const totalSheets = breakdown.sheets_interior !== undefined 
        ? breakdown.sheets_interior 
        : Math.round(baseKilos / (sheetAreaM2 * (baseGsm / 1000)));

    const altGsm = alternativeVariant.gsm;
    if (!altGsm || isNaN(altGsm) || altGsm <= 0) {
        throw new OrderQuoteRevisionError(
            'Alternative variant gsm must be a positive number.',
            'INVALID_ALTERNATIVE_VARIANT',
            400
        );
    }

    if (altGsm < 60 || altGsm > 350) {
        throw new OrderQuoteRevisionError(
            `Alternative paper grammage (${altGsm} gsm) is outside supported printing press range (60-350 gsm). Recalculation blocked.`,
            'RECALCULATION_BLOCKED',
            422,
            { reason: 'UNSUPPORTED_GRAMMAGE_RANGE', gsm: altGsm }
        );
    }

    // Exact BPE formula for revised weight and cost:
    const altKilos = Math.round(totalSheets * sheetAreaM2 * (altGsm / 1000) * 10000) / 10000;
    const altPaperCost = Math.round(altKilos * paperPricePerKilo * 100) / 100;
    const paperCostDelta = Math.round((altPaperCost - basePaperCost) * 100) / 100;

    // 3. Base industrial production cost
    const baseIndustrialCost = breakdown.total_industrial_cost !== undefined
        ? breakdown.total_industrial_cost
        : (basePaperCost + breakdown.cover_paper_cost + breakdown.interior_print_cost + breakdown.cover_print_cost + breakdown.endpapers_cost + breakdown.binding_cost + freightCost);

    const revisedIndustrialCost = Math.round((baseIndustrialCost + paperCostDelta) * 10000) / 10000;

    // 4. Commercial margin application: Price = Cost / (1 - (targetMarginPct / 100))
    const margin = targetMarginPct !== undefined ? targetMarginPct : originalCalculation.target_margin_pct;
    if (margin === undefined || margin === null || isNaN(margin) || margin < 0 || margin >= 100) {
        throw new OrderQuoteRevisionError(
            'Invalid or missing target margin percentage.',
            'RECALCULATION_BLOCKED',
            422,
            { reason: 'INVALID_TARGET_MARGIN' }
        );
    }

    const marginDivisor = 1 - (margin / 100.0);
    const baseNetPrice = originalCalculation.base_net_price !== undefined
        ? originalCalculation.base_net_price
        : Math.round((baseIndustrialCost / marginDivisor) * 10000) / 10000;
    const revisedNetPrice = Math.round((revisedIndustrialCost / marginDivisor) * 10000) / 10000;
    const deltaNetPrice = Math.round((revisedNetPrice - baseNetPrice) * 10000) / 10000;

    return {
        bpe_calculation_id: `bpe_calc_${crypto.randomUUID()}`,
        bpe_engine_version,
        bpe_rates_checksum: rates_checksum,
        base_industrial_cost: baseIndustrialCost,
        revised_industrial_cost: revisedIndustrialCost,
        industrial_cost_delta: paperCostDelta,
        base_net_price: Math.round(baseNetPrice * 10000) / 10000,
        revised_net_price: revisedNetPrice,
        delta_net_price: deltaNetPrice,
        target_margin_pct: margin,
        breakdown: {
            interior_paper_cost_original: basePaperCost,
            interior_paper_cost_revised: altPaperCost,
            interior_paper_cost_delta: paperCostDelta,
            kilos_interior_original: baseKilos,
            kilos_interior_revised: altKilos,
            sheets_interior: totalSheets,
            // Guaranteed Frozen Components
            cover_paper_cost: breakdown.cover_paper_cost,
            interior_print_cost: breakdown.interior_print_cost,
            cover_print_cost: breakdown.cover_print_cost,
            endpapers_cost: breakdown.endpapers_cost,
            binding_cost: breakdown.binding_cost,
            freight_cost: freightCost
        }
    };
}

/**
 * Provider-agnostic OTP Delivery Service (SEC-C01R).
 * Requires an active, tested delivery provider implementing sendOtp or sendMail.
 * Distinguishes provider acceptance (ACCEPTED_FOR_DISPATCH) from unconfirmed device receipts.
 */
class OtpDeliveryService {
    constructor(dependencies = {}) {
        this.provider = dependencies.deliveryProvider || dependencies.emailDeliveryService || dependencies.provider || null;
        this.isExplicitlyConfigured = dependencies.isConfigured !== undefined ? dependencies.isConfigured : null;
    }

    /**
     * Verifies whether an authorized delivery channel is active and tested.
     * SEC-C01R: Zero simulated delivery. Requires a real provider implementing sendOtp or sendMail.
     */
    isDeliveryChannelConfigured() {
        if (this.isExplicitlyConfigured !== null) {
            return this.isExplicitlyConfigured;
        }
        if (!this.provider) return false;
        return typeof this.provider.sendOtp === 'function' || typeof this.provider.sendMail === 'function';
    }

    /**
     * Delivers the OTP to the verified recipient.
     */
    async deliverOtp({ recipientEmail, otpCode, revisionId, deltaNet, tenantId }) {
        if (!this.provider) {
            return {
                ok: false,
                status: 'PROVIDER_MISSING',
                delivered: false,
                reason: 'NO_VERIFIED_DELIVERY_CHANNEL_CONFIGURED'
            };
        }

        if (typeof this.provider.sendOtp !== 'function' && typeof this.provider.sendMail !== 'function') {
            return {
                ok: false,
                status: 'PROVIDER_UNIMPLEMENTED',
                delivered: false,
                reason: 'DELIVERY_PROVIDER_UNIMPLEMENTED'
            };
        }

        if (!this.isDeliveryChannelConfigured()) {
            return {
                ok: false,
                status: 'PROVIDER_MISSING',
                delivered: false,
                reason: 'NO_VERIFIED_DELIVERY_CHANNEL_CONFIGURED'
            };
        }

        try {
            let providerResponse = null;
            if (typeof this.provider.sendOtp === 'function') {
                providerResponse = await this.provider.sendOtp({
                    recipient: recipientEmail,
                    recipientEmail,
                    otpCode,
                    revisionId,
                    deltaNet,
                    tenantId
                });
            } else {
                providerResponse = await this.provider.sendMail({
                    to: recipientEmail,
                    subject: `[PrintPrice OS] Código de Autorización Económica (Delta: ${Number(deltaNet).toFixed(2)} €)`,
                    text: `Su código de verificación para autorizar la revisión económica ${revisionId} es: ${otpCode}. Expira en 15 minutos.`
                });
            }

            if (!providerResponse) {
                return {
                    ok: false,
                    status: 'PROVIDER_EMPTY_RESPONSE',
                    delivered: false,
                    reason: 'PROVIDER_RETURNED_EMPTY_RESPONSE'
                };
            }

            if (
                providerResponse.accepted === false ||
                (Array.isArray(providerResponse.rejected) && providerResponse.rejected.length > 0) ||
                providerResponse.ok === false
            ) {
                return {
                    ok: false,
                    status: 'PROVIDER_REJECTED',
                    delivered: false,
                    reason: providerResponse.error || providerResponse.rejectionReason || 'DISPATCH_REJECTED_BY_PROVIDER'
                };
            }

            const messageId = providerResponse.messageId 
                || providerResponse.message_id 
                || providerResponse.delivery_reference 
                || providerResponse.id 
                || providerResponse.reference;

            if (!messageId) {
                return {
                    ok: false,
                    status: 'MISSING_PROVIDER_ACCEPTANCE_PROOF',
                    delivered: false,
                    reason: 'PROVIDER_DID_NOT_RETURN_MESSAGE_ID'
                };
            }

            return {
                ok: true,
                status: 'PROVIDER_ACCEPTED',
                delivered: true,
                proof: {
                    channel: 'EMAIL',
                    recipient: recipientEmail,
                    provider_message_id: String(messageId),
                    accepted_at: new Date().toISOString(),
                    delivery_status: 'ACCEPTED_FOR_DISPATCH',
                    handset_receipt_proven: false
                }
            };
        } catch (err) {
            const isNetwork = err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT' || err.code === 'ENOTFOUND' || err.isNetworkError;
            return {
                ok: false,
                status: isNetwork ? 'NETWORK_ERROR' : 'DISPATCH_ERROR',
                delivered: false,
                reason: err.message || 'DELIVERY_DISPATCH_EXCEPTION'
            };
        }
    }
}

/**
 * Main Service Implementation for Governed Order Quote Revisions.
 */
class OrderQuoteRevisionService {
    constructor(dependencies = {}) {
        this.classifier = dependencies.taxClassifier || taxClassifier;
        this.otpDeliveryService = dependencies.otpDeliveryService || new OtpDeliveryService(dependencies);
        this.jwtSecret = dependencies.jwtSecret || process.env.JWT_SECRET || 'ppos-secret';
        this.defaultTtlHours = dependencies.defaultTtlHours || 48;
        this.defaultOtpThresholdEur = dependencies.defaultOtpThresholdEur || 50.00;
    }

    /**
     * Creates a governed order quote revision and issues a single-use token (SEC-C01, SEC-C02, SEC-C05, SEC-C06).
     */
    async createQuoteRevision({
        tenantId,
        printhouseId = null,
        externalOrderIntentId = null,
        canonicalOrderId = null,
        paperDecisionId,
        originalCalculation = null,
        alternativeVariant = null,
        targetMarginPct = null,
        taxResolutionContext = {},
        recipientEmail = null,
        printhouseConfig = {},
        actorContext = {},
        allowSupersede = false
    }) {
        // SEC-C05: Require authenticated tenant context
        if (!tenantId) {
            throw new OrderQuoteRevisionError(
                'Authenticated tenant context is required. Cannot issue revision without verified tenant.',
                'UNAUTHORIZED_TENANT',
                403
            );
        }

        if (!paperDecisionId) {
            throw new OrderQuoteRevisionError(
                'paperDecisionId is required to issue an economic revision.',
                'INVALID_INPUT_PARAMS',
                400
            );
        }

        const conn = await mysqlClient.getConnection();

        try {
            await conn.beginTransaction();

            // 1. Verify Parent Order Decision Under Lock (SEC-C02, SEC-C05)
            const [decisions] = await conn.query(
                `SELECT id, tenant_id, external_order_intent_id, canonical_order_id, printhouse_tenant_id,
                        paper_role, requested_variant_id, decision_action, alternative_variant_id,
                        snapshot_requested_gsm, snapshot_requested_width_mm, snapshot_requested_height_mm,
                        snapshot_requested_category, status, economic_status, metadata_json
                 FROM order_paper_decisions 
                 WHERE id = ? AND tenant_id = ? 
                 FOR UPDATE`,
                [paperDecisionId, tenantId]
            );

            if (!decisions || decisions.length === 0) {
                throw new OrderQuoteRevisionError(
                    `Paper decision '${paperDecisionId}' not found for tenant '${tenantId}'`,
                    'DECISION_NOT_FOUND',
                    404
                );
            }

            const decision = decisions[0];

            // SEC-C05: Validate Printhouse Authorization on the decision
            const effectivePrinthouseId = printhouseId || actorContext.printhouseId;
            if (!actorContext.isSuperAdmin && effectivePrinthouseId && decision.printhouse_tenant_id !== effectivePrinthouseId) {
                throw new OrderQuoteRevisionError(
                    `Access denied: Decision is assigned to printhouse '${decision.printhouse_tenant_id}', caller is '${effectivePrinthouseId}'`,
                    'PRINTHOUSE_UNAUTHORIZED',
                    403
                );
            }

            if (decision.status !== 'ACTIVE') {
                throw new OrderQuoteRevisionError(
                    `Cannot issue revision for non-active decision (status: ${decision.status})`,
                    'DECISION_INACTIVE',
                    422
                );
            }

            if (decision.decision_action !== 'PROPOSE_ALTERNATIVE' || decision.economic_status !== 'REQUIRES_ECONOMIC_REVISION') {
                throw new OrderQuoteRevisionError(
                    `Decision '${paperDecisionId}' is not eligible for economic revision (action: ${decision.decision_action}, economic_status: ${decision.economic_status})`,
                    'DECISION_NOT_ELIGIBLE_FOR_REVISION',
                    422
                );
            }

            // Resolve order reference
            const resolvedOrderRef = decision.external_order_intent_id || externalOrderIntentId;
            const resolvedCanonicalOrderId = decision.canonical_order_id || canonicalOrderId;

            // 2. Authoritative Order Lookup Under Lock (SEC-C02, BLK-02)
            let orderRow = null;
            let orderModel = null;

            try {
                const [orderRows] = await conn.query(
                    `SELECT * FROM orders 
                     WHERE order_ref = ? OR id = ? 
                     FOR UPDATE`,
                    [resolvedOrderRef, resolvedOrderRef]
                );
                if (orderRows && orderRows.length > 0) {
                    orderRow = orderRows[0];
                    orderModel = 'orders';
                }
            } catch (err) {
                // If query fails, continue to check marketplace_orders
            }

            if (!orderRow) {
                try {
                    const [mpRows] = await conn.query(
                        `SELECT id, order_id, tenant_id, printhouse_id, estimated_price, currency, status, customer_json, book_spec_json, selected_offer_json, metadata_json, created_at 
                         FROM marketplace_orders 
                         WHERE order_id = ? OR id = ? 
                         FOR UPDATE`,
                        [resolvedOrderRef, resolvedOrderRef]
                    );
                    if (mpRows && mpRows.length > 0) {
                        orderRow = mpRows[0];
                        orderModel = 'marketplace_orders';
                    }
                } catch (err) {
                    // Fallthrough to null check
                }
            }

            // SEC-C02R & SEC-C03R: Order Existence Verification
            if (!orderRow) {
                throw new OrderQuoteRevisionError(
                    `Order '${resolvedOrderRef}' not found in authoritative registry. Revision issuance blocked.`,
                    'ORDER_NOT_FOUND',
                    404
                );
            }

            // SEC-C02: Order Verification
            if (orderRow.tenant_id && orderRow.tenant_id !== tenantId && !actorContext.isSuperAdmin) {
                throw new OrderQuoteRevisionError(
                    `Cross-tenant access denied: Order belongs to another tenant`,
                    'TENANT_MISMATCH',
                    403
                );
            }

            const assignedPrinter = orderRow.offer_print_house || orderRow.assigned_printhouse_id || orderRow.printhouse_id;
            if (assignedPrinter && effectivePrinthouseId && assignedPrinter !== effectivePrinthouseId && !actorContext.isSuperAdmin) {
                throw new OrderQuoteRevisionError(
                    `Access denied: Order is assigned to another printhouse`,
                    'PRINTHOUSE_UNAUTHORIZED',
                    403
                );
            }

            const orderStatus = String(orderRow.status || '').toUpperCase();
            if (['CANCELLED', 'CLOSED', 'REJECTED', 'ABANDONED', 'VOIDED'].includes(orderStatus)) {
                throw new OrderQuoteRevisionError(
                    `Cannot issue quote revision: Order is in ${orderStatus} state`,
                    'ORDER_INELIGIBLE',
                    422
                );
            }

            // SEC-C03R & BLK-02: Authoritative Resolution of Contractual Recipient Identity
            let authoritativeRecipientEmail = null;

            if (orderModel === 'marketplace_orders') {
                if (orderRow.customer_json) {
                    const cust = typeof orderRow.customer_json === 'string'
                        ? JSON.parse(orderRow.customer_json)
                        : orderRow.customer_json;
                    authoritativeRecipientEmail = cust.email || cust.customer_email || cust.contact_email;
                }
            } else {
                // Model 'orders'
                if (orderRow.customer_email) {
                    authoritativeRecipientEmail = orderRow.customer_email;
                } else if (orderRow.recipient_email) {
                    authoritativeRecipientEmail = orderRow.recipient_email;
                } else if (orderRow.customer) {
                    try {
                        const cust = typeof orderRow.customer === 'string'
                            ? JSON.parse(orderRow.customer)
                            : orderRow.customer;
                        authoritativeRecipientEmail = cust.email || cust.customer_email || cust.contact_email;
                    } catch (e) {}
                }
            }

            // Fallback to metadata_json for either model
            if (!authoritativeRecipientEmail && orderRow.metadata_json) {
                try {
                    const meta = typeof orderRow.metadata_json === 'string' ? JSON.parse(orderRow.metadata_json) : orderRow.metadata_json;
                    authoritativeRecipientEmail = meta.customer_email || meta.customer?.email || meta.client_email || meta.recipient_email || meta.billing_address?.email;
                } catch (e) {}
            }

            if (!authoritativeRecipientEmail && orderRow.user_id) {
                try {
                    const [userRows] = await conn.query('SELECT email FROM users WHERE id = ? LIMIT 1', [orderRow.user_id]);
                    if (userRows && userRows.length > 0 && userRows[0].email) {
                        authoritativeRecipientEmail = userRows[0].email;
                    }
                } catch (e) {}
            }

            if (!authoritativeRecipientEmail) {
                throw new OrderQuoteRevisionError(
                    'Order lacks an authenticated contractual customer identity. Revision issuance blocked.',
                    'UNVERIFIED_RECIPIENT_IDENTITY',
                    422,
                    { reason: 'MISSING_CONTRACTUAL_RECIPIENT' }
                );
            }

            const cleanEmail = String(authoritativeRecipientEmail).trim().toLowerCase();
            const emailDomain = cleanEmail.split('@')[1] || '';
            if (!cleanEmail.includes('@') || emailDomain === 'order.local' || emailDomain.endsWith('.local') || !emailDomain.includes('.')) {
                throw new OrderQuoteRevisionError(
                    `Fictitious customer identity '${cleanEmail}' is prohibited for quote revision issuance.`,
                    'UNVERIFIED_RECIPIENT_IDENTITY',
                    422,
                    { reason: 'FICTITIOUS_RECIPIENT_IDENTITY', email: cleanEmail }
                );
            }

            if (recipientEmail && recipientEmail.trim().toLowerCase() !== cleanEmail) {
                throw new OrderQuoteRevisionError(
                    `Provided recipient email '${recipientEmail}' does not match authenticated contractual recipient '${cleanEmail}'.`,
                    'FORBIDDEN_RECIPIENT_MISMATCH',
                    403
                );
            }

            // 3. Concurrency Control: Check Existing Pending Revisions (SEC-C06)
            const [existingPending] = await conn.query(
                `SELECT id, status FROM order_quote_revisions 
                 WHERE tenant_id = ? AND external_order_intent_id = ? AND status = 'PENDING' 
                 FOR UPDATE`,
                [tenantId, resolvedOrderRef]
            );

            if (existingPending && existingPending.length > 0) {
                if (!allowSupersede) {
                    throw new OrderQuoteRevisionError(
                        `A pending quote revision already exists for order intent '${resolvedOrderRef}'. Concurrent creation rejected.`,
                        'CONCURRENT_REVISION_PENDING',
                        409,
                        { existingRevisionId: existingPending[0].id }
                    );
                }

                // Supersede existing pending revision and revoke its tokens
                for (const row of existingPending) {
                    await conn.query(
                        `UPDATE order_quote_revisions SET status = 'SUPERSEDED' WHERE id = ?`,
                        [row.id]
                    );
                    await conn.query(
                        `UPDATE quote_revision_tokens SET status = 'REVOKED' WHERE revision_id = ? AND status = 'PENDING'`,
                        [row.id]
                    );
                    await this._recordAuditEvent(conn, {
                        tenantId,
                        revisionId: row.id,
                        eventType: 'REVISION_SUPERSEDED',
                        actorType: actorContext.role || 'SYSTEM',
                        actorId: actorContext.userId || 'system',
                        payload: { supersededByNewRevision: true }
                    });
                }
            }

            // 4. Authoritative Resolution of BPE Calculation Snapshot (SEC-C02R, BPE-01R)
            let authoritativeCalculation = null;

            if (orderRow && orderRow.id) {
                let [snapRows] = await conn.query(
                    `SELECT snapshot_id, order_id, tenant_id, printhouse_id, snapshot_json, snapshot_checksum, 
                            rate_card_checksum, formula_version, final_amount, status, sealed_by, sealed_at 
                     FROM order_pricing_snapshots 
                     WHERE order_id = ? AND tenant_id = ? AND status = 'SEALED' 
                     ORDER BY snapshot_revision DESC LIMIT 1`,
                    [orderRow.id, tenantId]
                );

                if (!snapRows || snapRows.length === 0) {
                    const altId = orderRow.order_id || resolvedOrderRef;
                    if (altId && altId !== orderRow.id) {
                        const [altRows] = await conn.query(
                            `SELECT snapshot_id, order_id, tenant_id, printhouse_id, snapshot_json, snapshot_checksum, 
                                    rate_card_checksum, formula_version, final_amount, status, sealed_by, sealed_at 
                             FROM order_pricing_snapshots 
                             WHERE order_id = ? AND tenant_id = ? AND status = 'SEALED' 
                             ORDER BY snapshot_revision DESC LIMIT 1`,
                            [altId, tenantId]
                        );
                        if (altRows && altRows.length > 0) {
                            snapRows = altRows;
                        }
                    }
                }

                if (snapRows && snapRows.length > 0) {
                    const snap = snapRows[0];
                    const rawPayload = typeof snap.snapshot_json === 'string' 
                        ? JSON.parse(snap.snapshot_json) 
                        : snap.snapshot_json;
                    if (rawPayload) {
                        const calculationPayload = (rawPayload && rawPayload.snapshot && typeof rawPayload.snapshot === 'object')
                            ? rawPayload.snapshot
                            : rawPayload;

                        const validation = validateBpeSnapshotProvenance(calculationPayload, {
                            orderId: orderRow.id || orderRow.order_id,
                            orderRef: resolvedOrderRef,
                            tenantId,
                            sealedRecord: snap,
                            rawPayload
                        });

                        if (!validation.valid) {
                            throw new OrderQuoteRevisionError(
                                `Cryptographic sealing validation failed for order_pricing_snapshots: ${validation.message}`,
                                'RECALCULATION_BLOCKED',
                                422,
                                { reason: validation.code, details: validation.message }
                            );
                        }
                        authoritativeCalculation = validation.validatedPayload || calculationPayload;
                    }
                }
            }

            // BPE-01R: Zero fallback to request body originalCalculation or unverified metadata!
            if (!authoritativeCalculation) {
                throw new OrderQuoteRevisionError(
                    'Missing cryptographically sealed pricing snapshot in order_pricing_snapshots for this order and tenant. Recalculation blocked.',
                    'RECALCULATION_BLOCKED',
                    422,
                    { reason: 'UNVERIFIED_SNAPSHOT_PROVENANCE' }
                );
            }

            // 5. Authoritative Resolution of Alternative Variant (SEC-C02R)
            let authoritativeVariant = null;
            const altVariantId = decision.alternative_variant_id;

            if (altVariantId) {
                const [variantRows] = await conn.query(
                    `SELECT v.id, v.gsm, v.width_mm, v.height_mm, v.finish, p.category, p.name AS product_name 
                     FROM paper_variants v 
                     LEFT JOIN paper_products p ON v.product_id = p.id 
                     WHERE v.id = ? LIMIT 1`,
                    [altVariantId]
                );

                if (variantRows && variantRows.length > 0) {
                    const v = variantRows[0];
                    authoritativeVariant = {
                        id: v.id,
                        gsm: v.gsm,
                        width_mm: Number(v.width_mm),
                        height_mm: Number(v.height_mm),
                        finish: v.finish,
                        category: v.category || v.finish || 'offset'
                    };
                }
            }

            if (!authoritativeVariant) {
                const meta = typeof decision.metadata_json === 'string' ? JSON.parse(decision.metadata_json) : (decision.metadata_json || {});
                if (meta.alternative_variant) {
                    authoritativeVariant = meta.alternative_variant;
                }
            }

            // SEC-C02R: ZERO fallback to request body alternativeVariant!
            if (!authoritativeVariant) {
                throw new OrderQuoteRevisionError(
                    'Alternative variant not found in master catalog or decision metadata.',
                    'RECALCULATION_BLOCKED',
                    422,
                    { reason: 'ALTERNATIVE_VARIANT_NOT_FOUND', variant_id: altVariantId }
                );
            }

            // 6. Authoritative Commercial Margin & Printhouse Profile Policy (SEC-C02R, BPE-01, TIME-01R)
            let effectiveMargin = authoritativeCalculation.target_margin_pct;
            let printhouseTz = 'Europe/Madrid';
            let printhouseJurisdiction = 'ES-MD';
            let printhouseHasLunchBreak = true;
            let printhouseCustomHolidays = null;
            let businessHoursTtl = 48;

            const [phProfiles] = await conn.query(
                `SELECT target_margin_pct, timezone, jurisdiction, has_lunch_break, custom_holidays_json, business_hours_ttl 
                 FROM printhouse_profiles 
                 WHERE printhouse_id = ? LIMIT 1`,
                [effectivePrinthouseId || decision.printhouse_tenant_id || orderRow.offer_print_house || orderRow.printhouse_id || tenantId]
            );

            if (phProfiles && phProfiles.length > 0) {
                const pProfile = phProfiles[0];
                if (pProfile.target_margin_pct !== null && pProfile.target_margin_pct !== undefined) {
                    effectiveMargin = Number(pProfile.target_margin_pct);
                }
                if (pProfile.timezone) printhouseTz = pProfile.timezone;
                if (pProfile.jurisdiction) printhouseJurisdiction = pProfile.jurisdiction;
                if (pProfile.has_lunch_break !== undefined && pProfile.has_lunch_break !== null) {
                    printhouseHasLunchBreak = Boolean(pProfile.has_lunch_break);
                }
                if (pProfile.custom_holidays_json) {
                    try {
                        printhouseCustomHolidays = typeof pProfile.custom_holidays_json === 'string'
                            ? JSON.parse(pProfile.custom_holidays_json)
                            : pProfile.custom_holidays_json;
                    } catch (_) {}
                }
                if (pProfile.business_hours_ttl && Number(pProfile.business_hours_ttl) > 0) {
                    businessHoursTtl = Number(pProfile.business_hours_ttl);
                }
            }

            // SEC-C02R: ZERO fallback to request body targetMarginPct, ZERO 18.5% hardcoded default!
            if (effectiveMargin === undefined || effectiveMargin === null || isNaN(effectiveMargin) || effectiveMargin < 0 || effectiveMargin >= 100) {
                throw new OrderQuoteRevisionError(
                    'No authoritative commercial margin registered in baseline pricing snapshot or tenant registry. Recalculation blocked.',
                    'RECALCULATION_BLOCKED',
                    422,
                    { reason: 'MISSING_AUTHORITATIVE_MARGIN' }
                );
            }

            // 7. Deterministic BPE Recalculation (SEC-C03)
            const bpeResult = recalculateDeterministicBpePrice({
                originalCalculation: authoritativeCalculation,
                alternativeVariant: authoritativeVariant,
                targetMarginPct: effectiveMargin
            });

            // 8. Fiscal Gate (Gate 2): Server-Authoritative Tax Readiness Resolution (SEC-C02R, FISC-01)
            const orderMeta = typeof orderRow.metadata_json === 'string'
                ? JSON.parse(orderRow.metadata_json || '{}')
                : (orderRow.metadata_json || {});

            // FISC-01: Eliminate unsafe 'ES' destination fallback. Require verified destination jurisdiction.
            const authoritativeCustomerCountry = orderRow.delivery_country 
                || orderMeta.delivery_country 
                || orderMeta.shipping_country 
                || orderMeta.shipping_address?.country 
                || null;

            // FISC-01: Eliminate interior_pages inference! Having interior pages does NOT confer book VAT status.
            const isEditorialBook = Boolean(
                orderRow.product_type === 'BOOK' || 
                orderMeta.product_type === 'BOOK' || 
                orderMeta.is_editorial_book === true ||
                orderRow.is_editorial_book === 1 ||
                orderRow.is_editorial_book === true
            );
            const isB2B = Boolean(orderRow.vat_number || orderMeta.vat_number || orderMeta.customer_type === 'B2B');

            const authoritativeProductCategory = orderRow.product_type 
                || orderMeta.product_type 
                || (isEditorialBook ? 'BOOK' : orderMeta.product_category || null);

            const authoritativeTaxContext = {
                amount: bpeResult.revised_net_price,
                currency: 'EUR',
                seller_country: 'ES',
                supplier_country: 'ES',
                customer_country: authoritativeCustomerCountry,
                customer_vat_id: orderRow.vat_number || orderMeta.vat_number || null,
                customer_type: isB2B ? 'B2B' : 'B2C',
                vies_valid: Boolean(orderMeta.vies_valid),
                cross_border_transport_verified: Boolean(orderMeta.has_proof_of_transport),
                supply_type: 'SUPPLY_OF_GOODS',
                product_category: authoritativeProductCategory,
                is_editorial_book: isEditorialBook
            };

            const taxClassification = this.classifier.classifyReadiness(authoritativeTaxContext);

            if (taxClassification.readiness_status === 'TAX_CLASSIFICATION_BLOCKED') {
                throw new OrderQuoteRevisionError(
                    `Fiscal evaluation blocked: ${taxClassification.warnings.join('; ')}`,
                    'TAX_CLASSIFICATION_BLOCKED',
                    422,
                    { findings: taxClassification.findings, warnings: taxClassification.warnings }
                );
            }

            const taxRatePct = taxClassification.tax_rate_pct;
            const taxBreakdown = this.classifier.calculateGovernedTaxBreakdown({
                baseNetAmount: bpeResult.base_net_price,
                revisedNetAmount: bpeResult.revised_net_price,
                taxRatePct
            });

            // 9. Authoritative Expiration Projection (TIME-01R, bounded by Supplier Offer)
            const now = new Date();
            const calculatedExpirationUtc = calculateBusinessHoursExpirationUtc({
                startDate: now,
                businessHours: businessHoursTtl,
                timezone: printhouseTz,
                jurisdiction: printhouseJurisdiction,
                customHolidays: printhouseCustomHolidays,
                hasLunchBreak: printhouseHasLunchBreak
            });

            let expiresAt = calculatedExpirationUtc;

            const decisionMeta = typeof decision.metadata_json === 'string'
                ? JSON.parse(decision.metadata_json || '{}')
                : (decision.metadata_json || {});
            const supplierOfferValidUntilStr = decisionMeta.supplier_offer_valid_until || orderMeta.supplier_offer_valid_until;
            let supplierOfferValidUntil = null;

            if (supplierOfferValidUntilStr) {
                supplierOfferValidUntil = parseUtcDate(supplierOfferValidUntilStr);
                if (supplierOfferValidUntil && supplierOfferValidUntil < expiresAt) {
                    expiresAt = supplierOfferValidUntil;
                }
            }

            // 10. Cryptographic Single-Use Token Generation (SEC-C06)
            const rawToken = crypto.randomBytes(32).toString('hex'); // 256 bits CSPRNG
            const tokenPrefix = `qrt_${rawToken.substring(0, 8)}`;
            const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

            const recipientEmailHash = crypto.createHash('sha256').update(cleanEmail).digest('hex');

            const revisionId = `oqr_${crypto.randomUUID()}`;
            const tokenId = `qrt_${crypto.randomUUID()}`;

            // 11. Real CSPRNG OTP Generation & Delivery Proof (SEC-C01R)
            const deltaNet = taxBreakdown.delta_net_amount;
            const otpThreshold = this.defaultOtpThresholdEur;

            // Generate real 6-digit numeric OTP and 16-byte salt
            const rawOtpCode = crypto.randomInt(100000, 1000000).toString();
            const otpSalt = crypto.randomBytes(16).toString('hex');
            const otpHash = computeSaltedOtpHash(rawOtpCode, otpSalt, revisionId);
            const otpExpiresAt = new Date(now.getTime() + 15 * 60 * 1000); // 15 minutes TTL

            let otpDeliveryStatus = 'NOT_APPLICABLE';
            let otpDeliveredAt = null;
            let otpDeliveryProof = null;

            if (deltaNet > otpThreshold) {
                // Attempt delivery through verified adapter (SEC-C01R)
                const deliveryResult = await this.otpDeliveryService.deliverOtp({
                    recipientEmail: cleanEmail,
                    otpCode: rawOtpCode,
                    revisionId,
                    deltaNet,
                    tenantId
                });

                if (!deliveryResult.ok || deliveryResult.status !== 'PROVIDER_ACCEPTED') {
                    // Fail closed! If channel unavailable, unimplemented, or rejected, block revision!
                    throw new OrderQuoteRevisionError(
                        `OTP delivery channel unavailable or dispatch rejected: ${deliveryResult.reason}`,
                        'OTP_DELIVERY_UNAVAILABLE',
                        403,
                        {
                            delivery_status: deliveryResult.status,
                            reason: deliveryResult.reason,
                            recipient: cleanEmail
                        }
                    );
                }

                otpDeliveryStatus = 'PROVIDER_ACCEPTED';
                otpDeliveredAt = new Date();
                otpDeliveryProof = deliveryResult.proof;
            }

            // 12. Canonical Snapshots & Integrity Hash
            const technicalSpecsSnapshot = {
                paper_role: decision.paper_role || 'INTERIOR',
                requested_variant_id: decision.requested_variant_id,
                alternative_variant: authoritativeVariant,
                original_specs: authoritativeCalculation.specs
            };

            const appliedPolicies = {
                target_margin_pct: bpeResult.target_margin_pct,
                effective_business_hours: businessHoursTtl,
                otp_delta_threshold_eur: otpThreshold,
                tax_treatment: taxClassification.tax_treatment
            };

            const snapshotCanonicalHash = sha256Canonical({
                bpe_calculation_id: bpeResult.bpe_calculation_id,
                breakdown: bpeResult.breakdown,
                technical_specs: technicalSpecsSnapshot,
                applied_policies: appliedPolicies,
                tax_breakdown: taxBreakdown
            });

            // 13. Insert into order_quote_revisions
            await conn.query(
                `INSERT INTO order_quote_revisions (
                    id, tenant_id, printhouse_id, external_order_intent_id, canonical_order_id, paper_decision_id,
                    revision_number, status, currency,
                    base_net_amount, delta_net_amount, revised_net_amount,
                    base_tax_amount, delta_tax_amount, revised_tax_amount, tax_rate_pct,
                    base_gross_amount, delta_gross_amount, revised_gross_amount,
                    bpe_calculation_id, bpe_engine_version, bpe_rates_checksum,
                    snapshot_canonical_hash, breakdown_json, technical_specs_snapshot_json,
                    applied_policies_json, tax_resolution_snapshot_json,
                    expires_at, effective_business_hours, supplier_offer_valid_until, printhouse_timezone
                ) VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    revisionId, tenantId, decision.printhouse_tenant_id, resolvedOrderRef, resolvedCanonicalOrderId, paperDecisionId,
                    1, 'EUR',
                    taxBreakdown.base_net_amount, taxBreakdown.delta_net_amount, taxBreakdown.revised_net_amount,
                    taxBreakdown.base_tax_amount, taxBreakdown.delta_tax_amount, taxBreakdown.revised_tax_amount, taxRatePct,
                    taxBreakdown.base_gross_amount, taxBreakdown.delta_gross_amount, taxBreakdown.revised_gross_amount,
                    bpeResult.bpe_calculation_id, bpeResult.bpe_engine_version, bpeResult.bpe_rates_checksum,
                    snapshotCanonicalHash, JSON.stringify(bpeResult.breakdown), JSON.stringify(technicalSpecsSnapshot),
                    JSON.stringify(appliedPolicies), JSON.stringify(taxClassification),
                    expiresAt.toISOString().slice(0, 19).replace('T', ' '),
                    businessHoursTtl,
                    supplierOfferValidUntil ? supplierOfferValidUntil.toISOString().slice(0, 19).replace('T', ' ') : null,
                    printhouseTz
                ]
            );

            // 14. Insert Single-Use Token with Bound Amount & Cryptographic Real OTP (SEC-C01, SEC-C06)
            await conn.query(
                `INSERT INTO quote_revision_tokens (
                    id, tenant_id, revision_id, token_hash, token_prefix, recipient_email_hash,
                    bound_amount, bound_currency, status, expires_at, attempt_count, max_attempts,
                    otp_hash, otp_salt, otp_expires_at, otp_attempts, otp_max_attempts,
                    otp_delivery_channel, otp_delivery_status, otp_delivered_at, otp_delivery_proof_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, 'EUR', 'PENDING', ?, 0, 5, ?, ?, ?, 0, 3, 'EMAIL', ?, ?, ?)`,
                [
                    tokenId, tenantId, revisionId, tokenHash, tokenPrefix, recipientEmailHash,
                    taxBreakdown.delta_net_amount,
                    expiresAt.toISOString().slice(0, 19).replace('T', ' '),
                    otpHash, otpSalt, otpExpiresAt.toISOString().slice(0, 19).replace('T', ' '),
                    otpDeliveryStatus,
                    otpDeliveredAt ? otpDeliveredAt.toISOString().slice(0, 19).replace('T', ' ') : null,
                    otpDeliveryProof ? JSON.stringify(otpDeliveryProof) : null
                ]
            );

            // 15. Audit Event Ledger
            await this._recordAuditEvent(conn, {
                tenantId,
                revisionId,
                eventType: 'REVISION_ISSUED',
                actorType: actorContext.role || 'PRINTHOUSE_OPERATOR',
                actorId: actorContext.userId || 'system',
                payload: {
                    delta_net_amount: taxBreakdown.delta_net_amount,
                    delta_gross_amount: taxBreakdown.delta_gross_amount,
                    token_prefix: tokenPrefix,
                    expires_at: expiresAt.toISOString(),
                    otp_delivery_status: otpDeliveryStatus
                }
            });

            await conn.commit();

            logger.info({
                event: 'quote_revision_issued',
                tenant_id: tenantId,
                revision_id: revisionId,
                token_prefix: tokenPrefix,
                delta_net: taxBreakdown.delta_net_amount,
                otp_delivery_status: otpDeliveryStatus
            });

            return {
                revision_id: revisionId,
                status: 'PENDING',
                currency: 'EUR',
                base_net_amount: taxBreakdown.base_net_amount,
                delta_net_amount: taxBreakdown.delta_net_amount,
                revised_net_amount: taxBreakdown.revised_net_amount,
                base_gross_amount: taxBreakdown.base_gross_amount,
                delta_gross_amount: taxBreakdown.delta_gross_amount,
                revised_gross_amount: taxBreakdown.revised_gross_amount,
                tax_rate_pct: taxRatePct,
                expires_at: expiresAt.toISOString(),
                effective_business_hours: businessHoursTtl,
                token_prefix: tokenPrefix,
                otp_delivery_status: otpDeliveryStatus,
                rawToken, // Delivered once to the issuing caller, never logged or stored in DB plaintext
                // Only exposed in non-production test harnesses when explicit delivery adapter is mocked
                _debugOtp: process.env.NODE_ENV === 'test' ? rawOtpCode : undefined
            };
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    }

    /**
     * Strictly Read-Only Lookup by Token (SEC-C04).
     * Safe against prefetching, bots, and crawlers.
     * ZERO SQL WRITES: Does not execute UPDATE, INSERT, DELETE, or attempt counting.
     */
    async getQuoteRevisionByToken({ rawToken }) {
        if (!rawToken || typeof rawToken !== 'string') {
            throw new OrderQuoteRevisionError('Missing rawToken', 'INVALID_TOKEN', 400);
        }

        const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
        const conn = await mysqlClient.getConnection();

        try {
            const [rows] = await conn.query(
                `SELECT t.id AS token_id, t.token_prefix, t.status AS token_status, t.expires_at AS token_expires_at,
                        t.attempt_count, t.max_attempts, t.bound_amount, t.bound_currency,
                        t.otp_delivery_status,
                        r.id AS revision_id, r.tenant_id, r.external_order_intent_id, r.status AS revision_status,
                        r.currency, r.base_net_amount, r.delta_net_amount, r.revised_net_amount,
                        r.base_tax_amount, r.delta_tax_amount, r.revised_tax_amount, r.tax_rate_pct,
                        r.base_gross_amount, r.delta_gross_amount, r.revised_gross_amount,
                        r.technical_specs_snapshot_json, r.applied_policies_json, r.expires_at AS revision_expires_at
                 FROM quote_revision_tokens t
                 INNER JOIN order_quote_revisions r ON t.revision_id = r.id
                 WHERE t.token_hash = ? LIMIT 1`,
                [tokenHash]
            );

            if (!rows || rows.length === 0) {
                throw new OrderQuoteRevisionError('Revision token not found or invalid', 'TOKEN_NOT_FOUND', 404);
            }

            const item = rows[0];
            const now = new Date();
            const tokenExpires = parseUtcDate(item.token_expires_at || item.expires_at);

            // SEC-C04: Determine expiration strictly in memory via authoritative server clock
            // ZERO writes to the database during GET request!
            if (tokenExpires && now > tokenExpires) {
                throw new OrderQuoteRevisionError('Quote revision token has expired', 'TOKEN_EXPIRED', 410);
            }

            if (item.token_status !== 'PENDING') {
                throw new OrderQuoteRevisionError(
                    `Quote revision token is no longer pending (status: ${item.token_status})`,
                    'TOKEN_INACTIVE',
                    410
                );
            }

            return {
                revision_id: item.revision_id,
                tenant_id: item.tenant_id,
                order_intent_id: item.external_order_intent_id,
                token_prefix: item.token_prefix,
                currency: item.currency,
                amounts: {
                    base_net: Number(item.base_net_amount),
                    delta_net: Number(item.delta_net_amount),
                    revised_net: Number(item.revised_net_amount),
                    base_tax: Number(item.base_tax_amount),
                    delta_tax: Number(item.delta_tax_amount),
                    revised_tax: Number(item.revised_tax_amount),
                    tax_rate_pct: Number(item.tax_rate_pct),
                    base_gross: Number(item.base_gross_amount),
                    delta_gross: Number(item.delta_gross_amount),
                    revised_gross: Number(item.revised_gross_amount)
                },
                technical_specs: typeof item.technical_specs_snapshot_json === 'string' 
                    ? JSON.parse(item.technical_specs_snapshot_json) 
                    : item.technical_specs_snapshot_json,
                expires_at: item.token_expires_at,
                otp_delivery_status: item.otp_delivery_status
            };
        } finally {
            conn.release();
        }
    }

    /**
     * Governed Customer Acceptance / Rejection (POST with Idempotency, Concurrency & Gate Decoupling) (SEC-C01, SEC-C06).
     */
    async respondToQuoteRevision({
        rawToken,
        decision, // 'ACCEPT' or 'REJECT'
        actorContext = {},
        clientIp = '127.0.0.1',
        userAgent = 'unknown',
        otpCode = null,
        sessionToken = null
    }) {
        if (!rawToken || !decision || !['ACCEPT', 'REJECT'].includes(decision)) {
            throw new OrderQuoteRevisionError(
                'Invalid parameters: rawToken and decision (ACCEPT | REJECT) are required',
                'INVALID_RESPONSE_PARAMS',
                400
            );
        }

        const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
        const conn = await mysqlClient.getConnection();

        try {
            await conn.beginTransaction();

            // Lock token row for update
            const [tokenRows] = await conn.query(
                `SELECT t.id AS token_id, t.status AS token_status, t.expires_at, t.attempt_count, t.max_attempts,
                        t.bound_amount, t.bound_currency, t.recipient_email_hash,
                        t.otp_hash, t.otp_salt, t.otp_expires_at, t.otp_attempts, t.otp_max_attempts,
                        t.otp_delivery_status,
                        r.id AS revision_id, r.tenant_id, r.external_order_intent_id, r.canonical_order_id,
                        r.paper_decision_id, r.printhouse_id, r.status AS revision_status,
                        r.base_net_amount, r.delta_net_amount, r.revised_net_amount,
                        r.delta_gross_amount, r.applied_policies_json, r.bpe_calculation_id,
                        r.technical_specs_snapshot_json, r.breakdown_json
                 FROM quote_revision_tokens t
                 INNER JOIN order_quote_revisions r ON t.revision_id = r.id
                 WHERE t.token_hash = ?
                 FOR UPDATE`,
                [tokenHash]
            );

            if (!tokenRows || tokenRows.length === 0) {
                throw new OrderQuoteRevisionError('Token not found', 'TOKEN_NOT_FOUND', 404);
            }

            const token = tokenRows[0];
            const revision = token;

            // 1. Expiration check with persistent transition (SEC-C04)
            const now = new Date();
            const tokenExp = parseUtcDate(token.expires_at || token.token_expires_at);
            if (tokenExp && now > tokenExp) {
                await conn.query(`UPDATE quote_revision_tokens SET status = 'EXPIRED' WHERE id = ?`, [token.token_id]);
                await conn.query(`UPDATE order_quote_revisions SET status = 'EXPIRED' WHERE id = ?`, [token.revision_id]);
                await conn.commit();
                throw new OrderQuoteRevisionError('Token has expired', 'TOKEN_EXPIRED', 410);
            }

            // 2. Replay & Status check (SEC-C06)
            if (token.token_status !== 'PENDING' || revision.revision_status !== 'PENDING') {
                throw new OrderQuoteRevisionError(
                    `Token or revision is already consumed or resolved (token: ${token.token_status}, revision: ${revision.revision_status}) (TOKEN_ALREADY_CONSUMED)`,
                    'TOKEN_ALREADY_CONSUMED',
                    410
                );
            }

            // 3. Anti-Bruteforce Attempt Check on Token (SEC-C06)
            if (token.attempt_count >= token.max_attempts) {
                await conn.query(`UPDATE quote_revision_tokens SET status = 'REVOKED' WHERE id = ?`, [token.token_id]);
                await conn.commit();
                throw new OrderQuoteRevisionError('Maximum verification attempts exceeded. Token revoked.', 'MAX_ATTEMPTS_EXCEEDED', 429);
            }

            // 3b. Authoritative Parent Order & Printhouse Integrity Under Lock (BLK-05)
            const parentOrderRef = revision.external_order_intent_id || revision.canonical_order_id;
            let parentOrderRow = null;
            let parentOrderModel = null;

            try {
                const [ordRows] = await conn.query('SELECT * FROM orders WHERE id = ? OR order_ref = ? FOR UPDATE', [parentOrderRef, parentOrderRef]);
                if (ordRows && ordRows.length > 0) {
                    parentOrderRow = ordRows[0];
                    parentOrderModel = 'orders';
                }
            } catch (_) {}

            if (!parentOrderRow) {
                try {
                    const [mpRows] = await conn.query('SELECT * FROM marketplace_orders WHERE order_id = ? OR id = ? FOR UPDATE', [parentOrderRef, parentOrderRef]);
                    if (mpRows && mpRows.length > 0) {
                        parentOrderRow = mpRows[0];
                        parentOrderModel = 'marketplace_orders';
                    }
                } catch (_) {}
            }

            if (!parentOrderRow) {
                throw new OrderQuoteRevisionError(
                    `Parent order '${parentOrderRef}' not found in authoritative registry.`,
                    'ORDER_NOT_FOUND',
                    404
                );
            }

            const parentOrderStatus = String(parentOrderRow.status || '').toUpperCase();
            if (['CANCELLED', 'CLOSED', 'REJECTED', 'ABANDONED', 'VOIDED'].includes(parentOrderStatus)) {
                await conn.query(`UPDATE quote_revision_tokens SET status = 'REVOKED' WHERE id = ?`, [token.token_id]);
                await conn.query(`UPDATE order_quote_revisions SET status = 'REVOKED' WHERE id = ?`, [token.revision_id]);
                await this._recordAuditEvent(conn, {
                    tenantId: revision.tenant_id,
                    revisionId: revision.revision_id,
                    eventType: 'REVISION_BLOCKED_ORDER_INELIGIBLE',
                    actorType: 'SYSTEM',
                    actorId: 'governance_gate',
                    payload: { reason: 'ORDER_INELIGIBLE', orderStatus: parentOrderStatus }
                });
                await conn.commit();
                throw new OrderQuoteRevisionError(
                    `Cannot accept quote revision: Parent order is in ${parentOrderStatus} state (ORDER_INELIGIBLE)`,
                    'ORDER_INELIGIBLE',
                    409
                );
            }

            const assignedPrinter = parentOrderRow.offer_print_house || parentOrderRow.assigned_printhouse_id || parentOrderRow.printhouse_id;
            if (assignedPrinter && revision.printhouse_id && assignedPrinter !== revision.printhouse_id) {
                await conn.query(`UPDATE quote_revision_tokens SET status = 'REVOKED' WHERE id = ?`, [token.token_id]);
                await conn.query(`UPDATE order_quote_revisions SET status = 'SUPERSEDED' WHERE id = ?`, [token.revision_id]);
                await this._recordAuditEvent(conn, {
                    tenantId: revision.tenant_id,
                    revisionId: revision.revision_id,
                    eventType: 'REVISION_BLOCKED_PRINTHOUSE_REASSIGNED',
                    actorType: 'SYSTEM',
                    actorId: 'governance_gate',
                    payload: { originalPrinter: revision.printhouse_id, currentPrinter: assignedPrinter }
                });
                await conn.commit();
                throw new OrderQuoteRevisionError(
                    `Cannot accept quote revision: Order has been reassigned to another printhouse ('${assignedPrinter}') (PRINTHOUSE_REASSIGNED)`,
                    'PRINTHOUSE_REASSIGNED',
                    409
                );
            }

            // Check if another revision has already been accepted for this order
            const [otherAccepted] = await conn.query(
                `SELECT id FROM order_quote_revisions 
                 WHERE tenant_id = ? AND external_order_intent_id = ? AND id != ? AND status = 'ACCEPTED' 
                 LIMIT 1 FOR UPDATE`,
                [revision.tenant_id, revision.external_order_intent_id, revision.revision_id]
            );
            if (otherAccepted && otherAccepted.length > 0) {
                await conn.query(`UPDATE quote_revision_tokens SET status = 'REVOKED' WHERE id = ?`, [token.token_id]);
                await conn.query(`UPDATE order_quote_revisions SET status = 'SUPERSEDED' WHERE id = ?`, [token.revision_id]);
                await conn.commit();
                throw new OrderQuoteRevisionError(
                    `Order has already accepted another quote revision ('${otherAccepted[0].id}') (REVISION_ALREADY_SUPERSEDED)`,
                    'REVISION_ALREADY_SUPERSEDED',
                    409
                );
            }

            // Check underlying paper decision status
            if (revision.paper_decision_id) {
                const [decisionRows] = await conn.query(
                    `SELECT id, status FROM order_paper_decisions WHERE id = ? FOR UPDATE`,
                    [revision.paper_decision_id]
                );
                if (decisionRows && decisionRows.length > 0 && decisionRows[0].status !== 'ACTIVE') {
                    await conn.query(`UPDATE quote_revision_tokens SET status = 'REVOKED' WHERE id = ?`, [token.token_id]);
                    await conn.query(`UPDATE order_quote_revisions SET status = 'SUPERSEDED' WHERE id = ?`, [token.revision_id]);
                    await conn.commit();
                    throw new OrderQuoteRevisionError(
                        `Underlying paper decision is no longer active (status: ${decisionRows[0].status}) (DECISION_NO_LONGER_ACTIVE)`,
                        'DECISION_NO_LONGER_ACTIVE',
                        409
                    );
                }
            }

            // 4. Anti-Fraud & Real OTP Verification (SEC-C01)
            const appliedPolicies = typeof revision.applied_policies_json === 'string'
                ? JSON.parse(revision.applied_policies_json)
                : (revision.applied_policies_json || {});
            
            const otpThreshold = appliedPolicies.otp_delta_threshold_eur || this.defaultOtpThresholdEur;
            const deltaNet = Number(revision.delta_net_amount);

            let verifiedVia = 'DIRECT_TOKEN';

            if (decision === 'ACCEPT' && deltaNet > otpThreshold) {
                let sessionVerified = false;

                // SEC-C01: Cryptographically Bound Authenticated Session Check
                if (sessionToken) {
                    try {
                        const decoded = jwt.verify(sessionToken, this.jwtSecret);
                        const sessionEmail = String(decoded.email || '').trim().toLowerCase();
                        const sessionEmailHash = crypto.createHash('sha256').update(sessionEmail).digest('hex');

                        if (sessionEmailHash === token.recipient_email_hash) {
                            sessionVerified = true;
                            verifiedVia = 'CRYPTOGRAPHIC_SESSION';
                        } else {
                            throw new OrderQuoteRevisionError(
                                'Authenticated session email does not match designated revision recipient.',
                                'SESSION_RECIPIENT_MISMATCH',
                                403
                            );
                        }
                    } catch (err) {
                        if (err instanceof OrderQuoteRevisionError) throw err;
                        throw new OrderQuoteRevisionError(
                            `Invalid or expired authenticated session: ${err.message}`,
                            'INVALID_AUTHENTICATED_SESSION',
                            401
                        );
                    }
                }

                // If not verified via session, enforce real OTP challenge
                if (!sessionVerified) {
                    // SEC-C01R: Require proof of delivery through verified channel
                    if (token.otp_delivery_status !== 'PROVIDER_ACCEPTED' && token.otp_delivery_status !== 'DELIVERED') {
                        throw new OrderQuoteRevisionError(
                            'No verified delivery channel available or OTP dispatch unconfirmed. Acceptance blocked fail-closed.',
                            'OTP_DELIVERY_UNAVAILABLE',
                            403,
                            { delta_net: deltaNet, threshold: otpThreshold, delivery_status: token.otp_delivery_status }
                        );
                    }

                    if (!otpCode) {
                        await conn.query(`UPDATE quote_revision_tokens SET attempt_count = attempt_count + 1 WHERE id = ?`, [token.token_id]);
                        await conn.commit();
                        throw new OrderQuoteRevisionError(
                            `Delta exceeds ${otpThreshold} EUR. Secondary OTP verification required.`,
                            'OTP_CHALLENGE_REQUIRED',
                            403,
                            { delta_net: deltaNet, threshold: otpThreshold }
                        );
                    }

                    // Check OTP expiration
                    if (token.otp_expires_at && now > parseUtcDate(token.otp_expires_at)) {
                        throw new OrderQuoteRevisionError(
                            'OTP challenge code has expired. A new code must be requested.',
                            'OTP_EXPIRED',
                            410
                        );
                    }

                    // Check OTP attempts limit
                    if (token.otp_attempts >= token.otp_max_attempts) {
                        await conn.query(`UPDATE quote_revision_tokens SET status = 'REVOKED' WHERE id = ?`, [token.token_id]);
                        await conn.commit();
                        throw new OrderQuoteRevisionError(
                            'Maximum OTP verification attempts exceeded. Token revoked.',
                            'MAX_OTP_ATTEMPTS_EXCEEDED',
                            429
                        );
                    }

                    // Real cryptographic OTP verification against salt and revisionId
                    const submittedHash = computeSaltedOtpHash(otpCode, token.otp_salt, token.revision_id);

                    if (submittedHash !== token.otp_hash) {
                        const newAttempts = token.otp_attempts + 1;
                        await conn.query(
                            `UPDATE quote_revision_tokens SET otp_attempts = ? WHERE id = ?`,
                            [newAttempts, token.token_id]
                        );
                        await conn.commit();

                        throw new OrderQuoteRevisionError(
                            'Invalid OTP verification code.',
                            'INVALID_OTP_CODE',
                            403,
                            { attemptsRemaining: Math.max(0, token.otp_max_attempts - newAttempts) }
                        );
                    }

                    verifiedVia = 'VERIFIED_OTP';
                }
            }

            // 5. Apply Decision & State Machine Transition
            const newRevisionStatus = decision === 'ACCEPT' ? 'ACCEPTED' : 'REJECTED';
            const clientIpHash = crypto.createHash('sha256').update(clientIp).digest('hex');
            const userAgentHash = crypto.createHash('sha256').update(userAgent).digest('hex');

            const consentRecord = {
                decision,
                responded_at: now.toISOString(),
                client_ip_hash: clientIpHash,
                user_agent_hash: userAgentHash,
                verified_via: verifiedVia
            };

            // Update Revision
            await conn.query(
                `UPDATE order_quote_revisions 
                 SET status = ?, consent_record_json = ?, responded_at = CURRENT_TIMESTAMP 
                 WHERE id = ?`,
                [newRevisionStatus, JSON.stringify(consentRecord), revision.revision_id]
            );

            // Update Token to CONSUMED (Anti-Replay)
            await conn.query(
                `UPDATE quote_revision_tokens 
                 SET status = 'CONSUMED', consumed_at = CURRENT_TIMESTAMP, 
                     consumed_ip_hash = ?, consumed_user_agent_hash = ? 
                 WHERE id = ?`,
                [clientIpHash, userAgentHash, token.token_id]
            );

            // 6. Decoupled Triple Gates Evaluation & Financial Reconciliation (BLK-06)
            let financialReconciliation = null;
            let gateFinancial = 'PASSED';

            if (decision === 'ACCEPT') {
                if (deltaNet > 0) {
                    gateFinancial = 'PAYMENT_PENDING';
                    financialReconciliation = {
                        type: 'SUPPLEMENTARY_PAYMENT_PENDING',
                        delta_amount: deltaNet,
                        currency: token.bound_currency,
                        settled: false,
                        description: `Supplementary payment required: +${deltaNet.toFixed(2)} ${token.bound_currency}`
                    };
                } else if (deltaNet === 0) {
                    gateFinancial = 'PASSED';
                    financialReconciliation = {
                        type: 'ZERO_DELTA_PARITY',
                        delta_amount: 0,
                        currency: token.bound_currency,
                        settled: true,
                        description: 'Economic parity confirmed. Zero delta.'
                    };
                } else {
                    // deltaNet < 0: strictly NOT PASSED!
                    let isOriginalPaid = false;
                    try {
                        if (parentOrderRow.invoice_payment) {
                            const invPay = typeof parentOrderRow.invoice_payment === 'string'
                                ? JSON.parse(parentOrderRow.invoice_payment)
                                : parentOrderRow.invoice_payment;
                            if (invPay.payment_status === 'PAID') isOriginalPaid = true;
                        }
                    } catch (_) {}

                    if (['PAID', 'CONFIRMED', 'in_production', 'shipped', 'delivered', 'READY_FOR_PRINTHOUSE'].includes(parentOrderStatus)) {
                        isOriginalPaid = true;
                    }

                    if (isOriginalPaid) {
                        gateFinancial = 'REFUND_PENDING';
                        financialReconciliation = {
                            type: 'REFUND_PENDING',
                            refund_amount: Math.abs(deltaNet),
                            original_net: Number(revision.base_net_amount),
                            revised_net: Number(revision.revised_net_amount),
                            currency: token.bound_currency,
                            settled: false,
                            obligation_id: `obl_ref_${crypto.randomUUID()}`,
                            description: `Credit balance/refund pending to customer: ${Math.abs(deltaNet).toFixed(2)} ${token.bound_currency}`
                        };
                    } else {
                        gateFinancial = 'PAYMENT_PENDING';
                        financialReconciliation = {
                            type: 'REDUCED_PAYMENT_PENDING',
                            original_amount: Number(revision.base_net_amount),
                            new_amount_due: Number(revision.revised_net_amount),
                            delta_amount: deltaNet,
                            currency: token.bound_currency,
                            settled: false,
                            description: `Reduced amount pending payment: ${Number(revision.revised_net_amount).toFixed(2)} ${token.bound_currency} (lesser amount due)`
                        };
                    }
                }
            } else {
                gateFinancial = 'VOIDED';
            }

            const gates = {
                gate_contractual: decision === 'ACCEPT' ? 'PASSED' : 'REJECTED',
                gate_financial: gateFinancial,
                gate_industrial: decision === 'ACCEPT' ? 'PREFLIGHT_PENDING' : 'BLOCKED'
            };

            // 6b. Persist Authoritative Effective Technical Specification (BLK-03)
            let effectiveSpecificationRecord = null;
            if (decision === 'ACCEPT') {
                let originalSpecs = {};
                try {
                    originalSpecs = typeof parentOrderRow.specs === 'string'
                        ? JSON.parse(parentOrderRow.specs)
                        : (parentOrderRow.specs || (parentOrderRow.book_spec_json ? (typeof parentOrderRow.book_spec_json === 'string' ? JSON.parse(parentOrderRow.book_spec_json) : parentOrderRow.book_spec_json) : {}));
                } catch (_) {}

                let revisedTechnicalSpecs = {};
                try {
                    revisedTechnicalSpecs = typeof revision.technical_specs_snapshot_json === 'string'
                        ? JSON.parse(revision.technical_specs_snapshot_json)
                        : (revision.technical_specs_snapshot_json || {});
                } catch (_) {}

                const altVar = revisedTechnicalSpecs.alternative_variant || revisedTechnicalSpecs;

                const effectiveSpecs = {
                    ...originalSpecs,
                    variant_id: altVar.id || altVar.variant_id || originalSpecs.variant_id,
                    gsm: altVar.gsm || originalSpecs.gsm,
                    finish: altVar.finish || originalSpecs.finish,
                    paper_name: altVar.product_name || altVar.name || altVar.paper_name || originalSpecs.paper_name,
                    paper_role: revisedTechnicalSpecs.paper_role || 'INTERIOR',
                    effective_revision_id: revision.revision_id,
                    effective_consent_responded_at: now.toISOString()
                };

                if ((revisedTechnicalSpecs.paper_role || 'INTERIOR').toUpperCase() === 'INTERIOR') {
                    effectiveSpecs.paper_weight_interior = altVar.gsm || originalSpecs.paper_weight_interior || originalSpecs.gsm;
                } else if ((revisedTechnicalSpecs.paper_role || '').toUpperCase() === 'COVER') {
                    effectiveSpecs.paper_weight_cover = altVar.gsm || originalSpecs.paper_weight_cover || originalSpecs.gsm;
                }

                const effectiveId = `oets_${crypto.randomUUID()}`;

                // Mark any previous effective specs as SUPERSEDED
                try {
                    await conn.query(
                        `UPDATE order_effective_technical_specifications 
                         SET effective_status = 'SUPERSEDED' 
                         WHERE tenant_id = ? AND (external_order_intent_id = ? OR canonical_order_id = ?) AND effective_status = 'ACTIVE'`,
                        [revision.tenant_id, revision.external_order_intent_id, revision.canonical_order_id || parentOrderRef]
                    );

                    // Insert new active effective technical specification
                    await conn.query(
                        `INSERT INTO order_effective_technical_specifications (
                            id, tenant_id, canonical_order_id, external_order_intent_id,
                            paper_decision_id, revision_id, bpe_calculation_id,
                            effective_status, specs_json, pricing_summary_json, consent_record_json,
                            financial_reconciliation_status, industrial_gate_status
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?, ?)`,
                        [
                            effectiveId,
                            revision.tenant_id,
                            revision.canonical_order_id || parentOrderRef,
                            revision.external_order_intent_id,
                            revision.paper_decision_id || null,
                            revision.revision_id,
                            revision.bpe_calculation_id || null,
                            JSON.stringify(effectiveSpecs),
                            JSON.stringify({
                                base_net: revision.base_net_amount,
                                revised_net: revision.revised_net_amount,
                                delta_net: revision.delta_net_amount,
                                currency: token.bound_currency,
                                financial_reconciliation: financialReconciliation
                            }),
                            JSON.stringify(consentRecord),
                            gates.gate_financial,
                            gates.gate_industrial
                        ]
                    );

                    // Synchronize orders.specs / marketplace_orders.book_spec_json without mutating original order_pricing_snapshots
                    if (parentOrderModel === 'orders') {
                        await conn.query(
                            `UPDATE orders SET specs = ? WHERE id = ? OR order_ref = ?`,
                            [JSON.stringify(effectiveSpecs), parentOrderRef, parentOrderRef]
                        );
                    } else if (parentOrderModel === 'marketplace_orders') {
                        await conn.query(
                            `UPDATE marketplace_orders SET book_spec_json = ? WHERE order_id = ? OR id = ?`,
                            [JSON.stringify(effectiveSpecs), parentOrderRef, parentOrderRef]
                        );
                    }
                } catch (tableErr) {
                    logger.warn({ event: 'effective_specs_persistence_warning', message: tableErr.message });
                }

                effectiveSpecificationRecord = {
                    id: effectiveId,
                    effective_status: 'ACTIVE',
                    specs: effectiveSpecs,
                    financial_reconciliation_status: gates.gate_financial
                };
            }

            // 7. Audit Event
            await this._recordAuditEvent(conn, {
                tenantId: revision.tenant_id,
                revisionId: revision.revision_id,
                eventType: decision === 'ACCEPT' ? 'REVISION_ACCEPTED' : 'REVISION_REJECTED',
                actorType: actorContext.role || 'CUSTOMER',
                actorId: actorContext.userId || 'anonymous_customer',
                payload: {
                    decision,
                    gates,
                    financial_reconciliation: financialReconciliation,
                    consent: consentRecord,
                    effective_specification_id: effectiveSpecificationRecord ? effectiveSpecificationRecord.id : null
                }
            });

            await conn.commit();

            logger.info({
                event: 'quote_revision_responded',
                revision_id: revision.revision_id,
                decision,
                verified_via: verifiedVia,
                gates,
                financial_reconciliation: financialReconciliation
            });

            return {
                revision_id: revision.revision_id,
                status: newRevisionStatus,
                decision,
                gates,
                financial_reconciliation: financialReconciliation,
                effective_specification: effectiveSpecificationRecord,
                verified_via: verifiedVia,
                responded_at: now.toISOString()
            };
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    }

    /**
     * Revokes an existing quote revision (SEC-C05).
     */
    async revokeQuoteRevision({ tenantId, printhouseId = null, revisionId, reason = 'Operator revocation', actorContext = {} }) {
        if (!tenantId) {
            throw new OrderQuoteRevisionError('Authenticated tenant context is required to revoke revision.', 'UNAUTHORIZED_TENANT', 403);
        }

        const conn = await mysqlClient.getConnection();

        try {
            await conn.beginTransaction();

            const [rows] = await conn.query(
                `SELECT id, tenant_id, printhouse_id, status FROM order_quote_revisions 
                 WHERE id = ? AND tenant_id = ? 
                 FOR UPDATE`,
                [revisionId, tenantId]
            );

            if (!rows || rows.length === 0) {
                throw new OrderQuoteRevisionError(`Revision '${revisionId}' not found`, 'REVISION_NOT_FOUND', 404);
            }

            const rev = rows[0];

            // SEC-C05: Printhouse authorization check
            const effectivePrinthouseId = printhouseId || actorContext.printhouseId;
            if (!actorContext.isSuperAdmin && effectivePrinthouseId && rev.printhouse_id !== effectivePrinthouseId) {
                throw new OrderQuoteRevisionError(
                    `Access denied: Revision belongs to another printhouse`,
                    'PRINTHOUSE_UNAUTHORIZED',
                    403
                );
            }

            if (rev.status !== 'PENDING') {
                throw new OrderQuoteRevisionError(`Cannot revoke non-pending revision (status: ${rev.status})`, 'INVALID_REVISION_STATE', 409);
            }

            await conn.query(
                `UPDATE order_quote_revisions SET status = 'REVOKED', revocation_reason = ? WHERE id = ?`,
                [reason, revisionId]
            );
            await conn.query(
                `UPDATE quote_revision_tokens SET status = 'REVOKED' WHERE revision_id = ? AND status = 'PENDING'`,
                [revisionId]
            );

            await this._recordAuditEvent(conn, {
                tenantId,
                revisionId,
                eventType: 'REVISION_REVOKED',
                actorType: actorContext.role || 'PRINTHOUSE_OPERATOR',
                actorId: actorContext.userId || 'operator',
                payload: { reason }
            });

            await conn.commit();
            return { revision_id: revisionId, status: 'REVOKED', reason };
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    }

    /**
     * Authorized separate transactional operation for persistent expiration state transitions (SEC-C04).
     */
    async expireStaleQuoteRevisions() {
        const conn = await mysqlClient.getConnection();
        try {
            await conn.beginTransaction();
            const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

            const [expiredTokens] = await conn.query(
                `SELECT t.id AS token_id, t.revision_id, t.tenant_id 
                 FROM quote_revision_tokens t 
                 WHERE t.status = 'PENDING' AND t.expires_at < ? 
                 FOR UPDATE`,
                [now]
            );

            let expiredCount = 0;
            for (const item of expiredTokens) {
                await conn.query(`UPDATE quote_revision_tokens SET status = 'EXPIRED' WHERE id = ?`, [item.token_id]);
                await conn.query(`UPDATE order_quote_revisions SET status = 'EXPIRED' WHERE id = ? AND status = 'PENDING'`, [item.revision_id]);
                await this._recordAuditEvent(conn, {
                    tenantId: item.tenant_id,
                    revisionId: item.revision_id,
                    eventType: 'REVISION_EXPIRED',
                    actorType: 'SYSTEM_EXPIRATION_WORKER',
                    actorId: 'scheduler',
                    payload: { expired_at: now }
                });
                expiredCount++;
            }

            await conn.commit();
            return { ok: true, expiredCount };
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    }

    async _recordAuditEvent(conn, { tenantId, revisionId, eventType, actorType, actorId, payload }) {
        const eventId = `orae_${crypto.randomUUID()}`;
        await conn.query(
            `INSERT INTO order_revision_audit_events (
                event_id, tenant_id, revision_id, event_type, actor_type, actor_id, payload_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [eventId, tenantId, revisionId, eventType, actorType, actorId, JSON.stringify(payload || {})]
        );
    }
}

module.exports = {
    OrderQuoteRevisionService,
    OrderQuoteRevisionError,
    OtpDeliveryService,
    recalculateDeterministicBpePrice,
    calculateBusinessHoursExpirationUtc,
    getOfficialHolidaysForJurisdiction,
    getMadridOfficialHolidays,
    validateBpeSnapshotProvenance,
    sha256Canonical,
    computeSaltedOtpHash,
    redactToken
};
