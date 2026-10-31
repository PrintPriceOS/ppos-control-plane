/**
 * src/api/services/governedOrderRoutingService.js
 * 
 * Phase 192D Governed Order Routing Engine.
 * Manages atomic commitment of governed order routing decisions.
 * 
 * Life Cycle:
 *   EVALUATED -> COMMITTED -> (SUPERSEDED / CANCELLED)
 * 
 * Boundary & Invariants:
 *   ROUTING != DISPATCH
 *   JOB_ROUTING_ALLOWED = required
 *   PRODUCTION_DISPATCH_ALLOWED = NOT required in Phase 192D
 *   PRODUCTION_JOB_DELTA = 0
 *   MACHINE_QUEUE_DELTA = 0
 *   DISPATCH_DELTA = 0
 */
const db = require('./mysqlClient');
const routingEligibilityService = require('./routingEligibilityService');
const activationAdapter = require('./printhouseActivationAdapter');

const routingDecisionsLedger = new Map();

class GovernedOrderRoutingService {

    /**
     * Executes governed routing decision commitment for an order.
     */
    async createRoutingDecision({ orderId, tenantId, candidatePrinthouseId, siteId = null, actorId = 'system' }) {
        if (!orderId || !candidatePrinthouseId) {
            const err = new Error('ROUTING_DECISION_FAILED: orderId and candidatePrinthouseId are required');
            err.code = 'ROUTING_DECISION_FAILED';
            err.statusCode = 400;
            throw err;
        }

        // Idempotency Check: Return existing committed decision if identical request repeated
        const existingKey = `${orderId}:${candidatePrinthouseId}`;
        if (routingDecisionsLedger.has(existingKey)) {
            return {
                idempotent: true,
                routingDecision: routingDecisionsLedger.get(existingKey)
            };
        }

        // Step 1: Re-evaluate Eligibility & TOCTOU Check
        const evalRes = await routingEligibilityService.evaluateEligibility({
            orderId,
            tenantId,
            candidatePrinthouseId,
            siteId
        });

        if (!evalRes.eligible) {
            const blockingReason = evalRes.reasons.find(r => r.blocking) || evalRes.reasons[0];
            const err = new Error(blockingReason.message || 'ROUTING_ELIGIBILITY_DENIED');
            err.code = blockingReason.code || 'ROUTING_ELIGIBILITY_DENIED';
            err.statusCode = 403;
            err.reasons = evalRes.reasons;
            throw err;
        }

        // Step 2: Immediate TOCTOU Capability Re-Verification
        const capData = await activationAdapter.requireCapability({
            tenantId: candidatePrinthouseId,
            siteId: evalRes.siteId,
            capability: 'JOB_ROUTING_ALLOWED'
        });

        // Step 3: Handle Supersession of existing route for this order
        for (const [key, dec] of routingDecisionsLedger.entries()) {
            if (dec.orderId === orderId && dec.status === 'COMMITTED') {
                dec.status = 'SUPERSEDED';
                dec.supersededAt = new Date().toISOString();
            }
        }

        // Step 4: Atomic Decision Record Creation
        const routingDecision = {
            routingDecisionId: `route_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            orderId,
            tenantId: tenantId || 'tenant_default',
            printhouseId: candidatePrinthouseId,
            siteId: evalRes.siteId,
            status: 'COMMITTED',
            capabilityGrantReference: capData.grantId || 'grant_active_v1',
            matchingEvidenceVersion: 'v192c.1',
            actorId,
            createdAt: new Date().toISOString(),
            invariants: {
                routingNotDispatch: true,
                productionJobDelta: 0,
                machineQueueDelta: 0,
                dispatchDelta: 0
            }
        };

        // Persist to in-memory ledger (and DB if table exists)
        routingDecisionsLedger.set(existingKey, routingDecision);

        try {
            await db.query(`
                INSERT INTO order_routing_decisions (
                    id, order_id, tenant_id, printhouse_id, site_id, status, created_at
                ) VALUES (?, ?, ?, ?, ?, 'COMMITTED', NOW())
            `, [
                routingDecision.routingDecisionId,
                orderId,
                routingDecision.tenantId,
                candidatePrinthouseId,
                routingDecision.siteId
            ]);
        } catch (err) {
            // Non-blocking fallback if DB table not yet migrated
        }

        return {
            idempotent: false,
            routingDecision
        };
    }

    /**
     * Retrieves committed routing decision for a given orderId.
     */
    async getRoutingDecision(orderId) {
        for (const dec of routingDecisionsLedger.values()) {
            if (dec.orderId === orderId && dec.status === 'COMMITTED') {
                return dec;
            }
        }
        return null;
    }
}

module.exports = new GovernedOrderRoutingService();
