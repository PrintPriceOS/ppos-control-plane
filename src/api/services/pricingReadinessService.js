'use strict';

const mysqlClient = require('./mysqlClient');
const pricingGovernance = require('../../config/pricingGovernance');

class PricingReadinessService {
    
    async _fetchPrinthouses(actorScope) {
        let query = `
            SELECT p.id, p.name 
            FROM printhouses p 
            WHERE p.status = 'ACTIVE'
        `;
        let params = [];

        // If scoped to a specific printhouse actor
        if (actorScope && actorScope.printhouseId) {
            query += ` AND p.id = ?`;
            params.push(actorScope.printhouseId);
        }

        return mysqlClient.query(query, params);
    }

    async _evaluateForScope(actorScope) {
        const printhouses = await this._fetchPrinthouses(actorScope);
        const results = [];

        for (const ph of printhouses) {
            const result = {
                printhouseId: ph.id,
                printhouseName: ph.name,
                pricingReadinessStatus: 'UNKNOWN',
                activeRateCardIntegrity: false,
                formulasVerified: false,
                recentOrderIsolation: false,
                legacySupportRequired: false,
                lastAuditAt: new Date().toISOString()
            };

            // Check if there are active rate cards
            try {
                const [rateCards] = await mysqlClient.query(`
                    SELECT * FROM print_rate_cards 
                    WHERE printhouse_id = ? AND status = 'ACTIVE' LIMIT 1
                `, [ph.id]);
                if (rateCards && rateCards.length > 0) {
                    result.activeRateCardIntegrity = true;
                    if (rateCards[0].formulas_json && rateCards[0].formulas_json.length > 10) {
                        result.formulasVerified = true;
                    }
                }
            } catch (e) {
                result.pricingReadinessStatus = 'ERROR';
                results.push(result);
                continue;
            }

            // Check for recent orders
            try {
                const [recentOrders] = await mysqlClient.query(`
                    SELECT created_at, active_pricing_snapshot_id 
                    FROM orders 
                    WHERE assigned_printhouse_id = ? 
                    ORDER BY created_at DESC LIMIT 50
                `, [ph.id]);

                if (recentOrders && recentOrders.length > 0) {
                    result.recentOrderIsolation = recentOrders.every(o => o.active_pricing_snapshot_id !== null);
                    
                    const hasLegacy = recentOrders.some(o => 
                        o.active_pricing_snapshot_id === null && 
                        pricingGovernance.isLegacyOrderEligibleByDate(o.created_at)
                    );
                    result.legacySupportRequired = hasLegacy;
                } else {
                    result.recentOrderIsolation = true; // No recent orders means isolation is fine
                }
            } catch (e) {
                // Ignore DB errors on orders if table missing
            }

            // Classification Logic
            if (!result.activeRateCardIntegrity || !result.formulasVerified) {
                result.pricingReadinessStatus = 'NOT_READY';
            } else if (result.legacySupportRequired && !result.recentOrderIsolation) {
                result.pricingReadinessStatus = 'LEGACY_NEEDS_REVIEW';
            } else if (result.legacySupportRequired && result.recentOrderIsolation) {
                result.pricingReadinessStatus = 'PARTIALLY_READY';
            } else if (result.recentOrderIsolation) {
                result.pricingReadinessStatus = 'READY_FOR_SUPPORTED_CAPABILITIES';
            } else {
                result.pricingReadinessStatus = 'INVALID_STATE';
            }

            results.push(result);
        }

        return results;
    }

    /**
     * Used by Super Admin
     */
    async evaluateGlobalReadiness() {
        return this._evaluateForScope(null);
    }

    /**
     * Used by Printhouse actor
     */
    async evaluateOwnReadiness(actor) {
        if (!actor || !actor.printhouseId) {
            throw new Error('Actor must be a printhouse to evaluate own readiness');
        }
        return this._evaluateForScope(actor);
    }

    /**
     * Build sanitized summary for CLI Operator.
     */
    async buildSanitizedOperatorSummary() {
        const fullResults = await this.evaluateGlobalReadiness();
        
        const summary = {
            totalPrinthouses: fullResults.length,
            ready: 0,
            partiallyReady: 0,
            legacyNeedsReview: 0,
            notReady: 0,
            invalidState: 0,
            error: 0
        };

        for (const r of fullResults) {
            if (r.pricingReadinessStatus === 'READY_FOR_SUPPORTED_CAPABILITIES') summary.ready++;
            else if (r.pricingReadinessStatus === 'PARTIALLY_READY') summary.partiallyReady++;
            else if (r.pricingReadinessStatus === 'LEGACY_NEEDS_REVIEW') summary.legacyNeedsReview++;
            else if (r.pricingReadinessStatus === 'NOT_READY') summary.notReady++;
            else if (r.pricingReadinessStatus === 'ERROR') summary.error++;
            else summary.invalidState++;
        }

        return {
            timestamp: new Date().toISOString(),
            status: 'SUCCESS',
            summary
        };
    }
}

module.exports = new PricingReadinessService();
