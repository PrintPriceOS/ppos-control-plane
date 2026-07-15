'use strict';

/**
 * Governs legacy and pricing snapshot cutovers.
 */

const PRICING_SNAPSHOT_CUTOVER_AT = '2026-07-15T00:00:00Z';

function isLegacyOrderEligibleByDate(createdAtStr) {
    if (!createdAtStr) return false;
    const orderDate = new Date(createdAtStr);
    const cutoverDate = new Date(PRICING_SNAPSHOT_CUTOVER_AT);
    
    // createdAt < cutover -> historically eligible
    return orderDate.getTime() < cutoverDate.getTime();
}

module.exports = {
    PRICING_SNAPSHOT_CUTOVER_AT,
    isLegacyOrderEligibleByDate
};
