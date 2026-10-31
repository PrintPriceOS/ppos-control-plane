/**
 * src/api/services/moneyUtil.js
 * 
 * Canonical Money & Integer Minor Units Arithmetic Utility for Phase 192B.1.
 * Eliminates IEEE-754 floating point precision drift by performing all monetary
 * operations in integer minor units (cents) prior to formatting exact decimal strings.
 */

/**
 * Converts a main currency unit (dollars/euros) to integer minor units (cents).
 * E.g., 19.99 -> 1999, "0.10" -> 10, "150" -> 15000
 */
function toCents(amount) {
    if (amount === null || amount === undefined) return 0;
    if (typeof amount === 'number') {
        return Math.round((amount + Number.EPSILON) * 100);
    }
    const parsed = parseFloat(String(amount).replace(/,/g, ''));
    if (isNaN(parsed)) return 0;
    return Math.round((parsed + Number.EPSILON) * 100);
}

/**
 * Converts integer minor units (cents) to an exact 2-decimal string representation.
 * E.g., 1999 -> "19.99", 30 -> "0.30", 5997 -> "59.97"
 */
function fromCents(cents) {
    const safeCents = Math.round(Number(cents) || 0);
    const negative = safeCents < 0;
    const absCents = Math.abs(safeCents);
    const dollars = Math.floor(absCents / 100);
    const remainder = absCents % 100;
    const centsStr = remainder < 10 ? `0${remainder}` : `${remainder}`;
    return `${negative ? '-' : ''}${dollars}.${centsStr}`;
}

/**
 * Adds multiple minor unit (cents) values deterministically.
 */
function addCents(...centsArray) {
    return centsArray.reduce((sum, val) => sum + (Math.round(Number(val) || 0)), 0);
}

/**
 * Multiplies cents by a numeric multiplier with explicit half-up rounding.
 * E.g., multiplyCents(1999, 3) -> 5997
 */
function multiplyCents(cents, multiplier) {
    const safeCents = Math.round(Number(cents) || 0);
    return Math.round((safeCents * Number(multiplier || 0)) + Number.EPSILON);
}

/**
 * Calculates percentage of minor units (cents) with explicit half-up rounding.
 * E.g., calculatePercentageCents(1999, 21) -> Math.round((1999 * 21) / 100) = 420 cents (€4.20)
 */
function calculatePercentageCents(cents, percentageRate) {
    const safeCents = Math.round(Number(cents) || 0);
    return Math.round(((safeCents * Number(percentageRate || 0)) / 100) + Number.EPSILON);
}

module.exports = {
    toCents,
    fromCents,
    addCents,
    multiplyCents,
    calculatePercentageCents
};
