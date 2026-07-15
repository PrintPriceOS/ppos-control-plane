const db = require('./db');
const mysqlClient = require('./mysqlClient');
const crypto = require('crypto');
const pricingIntelligenceService = require('./pricingIntelligenceService');
const industrialEconomics = require('./economics/IndustrialEconomicService');

class QuoteService {
    /**
     * Creates a new job quote for a given printer/machine candidate.
     */
    async createJobQuote(jobId, printerId, machineId, routingAuditId = null) {
        const id = crypto.randomUUID();

        try {
            // 1. Resolve Profile
            const profile = await pricingIntelligenceService.resolvePricingProfile(printerId, machineId);
            if (!profile) return null; // No pricing available for this node

            // 2. Gather Inputs (In a real scenario, this would fetch Job features/report)
            // Mocking inputs for Phase 190.1 implementation foundation
            const inputs = {
                volume: 50,
                is_rush: false,
                lead_time_days: 3
            };

            // 3. Calculate True Operational Cost
            let rateData;
            try {
                rateData = await industrialEconomics.estimateProductionCost(printerId, inputs);
            } catch (pricingErr) {
                // Return explicit null if pricing is incomplete or fails validation
                console.warn(`[QUOTE-SERVICE] Candidate rejected: ${pricingErr.code} - ${pricingErr.message}`);
                return null;
            }

            // 4. Apply Commercial Strategy
            const strategyResult = pricingIntelligenceService.applyCommercialStrategy(rateData.operationalCost, profile, inputs);

            // Generate snapshot
            const breakdown = {
                snapshot: {
                    operationalCost: strategyResult.operationalCost,
                    rateCardCurrency: rateData.rateCardCurrency || 'EUR',
                    quoteCurrency: inputs.currency || 'EUR',
                    rateCardSchemaVersion: rateData.rateCardSchemaVersion,
                    rateCardRevision: rateData.rateCardRevision,
                    rateCardChecksum: rateData.rateCardChecksum,
                    strategyVersion: 3,
                    formulaVersion: 'commercial-strategy-v2',
                    platformMarkupPct: strategyResult.platformMarkupPct,
                    routingPremiumPct: strategyResult.routingPremiumPct,
                    targetMarginPct: strategyResult.targetMarginPct,
                    priceAfterMarkup: strategyResult.priceAfterMarkup,
                    priceAfterPremium: strategyResult.priceAfterPremium,
                    finalSuggestedPriceRaw: strategyResult.finalSuggestedPriceRaw,
                    finalSuggestedPrice: strategyResult.finalSuggestedPrice,
                    calculatedAt: new Date().toISOString()
                },
                ...pricingIntelligenceService.buildBreakdown(inputs, profile, strategyResult)
            };

            const marginAmount = (Number(strategyResult.finalSuggestedPriceRaw) - Number(strategyResult.operationalCost)).toFixed(4);

            // 5. Persist
            await db.query(`
                INSERT INTO job_quotes (
                    id, job_id, printer_id, machine_id, routing_audit_id,
                    production_cost, suggested_price, estimated_margin, margin_pct,
                    pricing_version, calculation_breakdown_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                id, jobId, printerId, machineId, routingAuditId,
                strategyResult.operationalCost, strategyResult.finalSuggestedPriceRaw, marginAmount, strategyResult.targetMarginPct,
                'v190.2', JSON.stringify(breakdown)
            ]);

            await this.logEvent(id, 'QUOTE_CREATED', { jobId, printerId });

            return {
                id,
                production_cost: strategyResult.operationalCost,
                suggested_price: strategyResult.finalSuggestedPrice,
                estimated_margin: marginAmount,
                margin_pct: strategyResult.targetMarginPct,
                breakdown
            };
        } catch (err) {
            console.error('[QUOTE-SERVICE] Failed to create quote:', err.message);
            return null;
        }
    }

    /**
     * Logs pricing events.
     */
    async logEvent(quoteId, type, metadata) {
        const id = crypto.randomUUID();
        try {
            await db.query(
                "INSERT INTO pricing_events (id, job_quote_id, event_type, metadata_json) VALUES (?, ?, ?, ?)",
                [id, quoteId, type, JSON.stringify(metadata)]
            );
        } catch (err) {
            console.error('[QUOTE-SERVICE] Event logging failed:', err.message);
        }
    }

    /**
     * Retrieves quotes for a job.
     */
    async getQuotesForJob(jobId) {
        const { rows } = await db.query("SELECT * FROM job_quotes WHERE job_id = ?", [jobId]);
        return rows;
    }

    /**
     * Accepts a quote and strictly seals its order pricing snapshot in an append-only atomic transaction.
     */
    async acceptQuoteAndSealOrderPricing({ quoteId, orderId, actor }) {
        const pool = mysqlClient.getPool();
        const conn = await pool.getConnection();
        await conn.beginTransaction();

        try {
            // 1 & 2. Lock quote and order rows FOR UPDATE
            const [quotes] = await conn.query('SELECT * FROM job_quotes WHERE id = ? FOR UPDATE', [quoteId]);
            const quote = quotes[0];
            if (!quote) throw new Error("Quote not found");

            const [orders] = await conn.query('SELECT * FROM orders WHERE id = ? FOR UPDATE', [orderId]);
            const order = orders[0];
            if (!order) throw new Error("Order not found");

            // Idempotency check: If this order already points to a snapshot from THIS quote, return it.
            if (order.active_pricing_snapshot_id) {
                const [existingSnaps] = await conn.query(
                    'SELECT * FROM order_pricing_snapshots WHERE snapshot_id = ? AND quote_id = ?',
                    [order.active_pricing_snapshot_id, quoteId]
                );
                if (existingSnaps.length > 0) {
                    await conn.commit();
                    return { status: 'ALREADY_ACCEPTED', snapshotId: order.active_pricing_snapshot_id };
                }
            }

            // 3. Validate quote state
            if (quote.status !== 'DRAFT') {
                throw new Error(`Cannot accept quote in state ${quote.status}`);
            }

            // 4. Validate quote belongs to order context
            if (quote.job_id !== orderId && quote.job_id !== order.job_id) {
                if (quote.job_id !== orderId) {
                    throw new Error("Quote does not belong to this order");
                }
            }
            if (quote.tenant_id && order.tenant_id && quote.tenant_id !== order.tenant_id) {
                throw new Error("Cross-tenant sealing attempt blocked");
            }
            if (order.assigned_printhouse_id && quote.printer_id && quote.printer_id !== order.assigned_printhouse_id) {
                throw new Error("Quote printer does not match order assigned printhouse");
            }

            // Parse snapshot payload to extract commercial truth
            const snapshotPayload = JSON.parse(quote.calculation_breakdown_json);
            const snapshotDetails = snapshotPayload.snapshot;

            // Generate canonical JSON and SHA-256 Checksum
            const canonicalizer = require('./pricingSnapshotCanonicalizer');
            const checksum = canonicalizer.calculatePricingSnapshotChecksum(snapshotPayload);

            const snapshotId = `ops_${crypto.randomUUID()}`;

            // 9. Insert order_pricing_snapshot
            await conn.query(`
                INSERT INTO order_pricing_snapshots (
                    snapshot_id, order_id, quote_id, quote_revision, snapshot_revision,
                    status, currency, final_amount, formula_version,
                    rate_card_id, rate_card_revision, rate_card_checksum,
                    snapshot_json, snapshot_checksum, sealed_by
                ) VALUES (?, ?, ?, ?, ?, 'SEALED', ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                snapshotId, orderId, quoteId, quote.revision || 1, 1,
                snapshotDetails.quoteCurrency || 'EUR', snapshotDetails.finalSuggestedPriceRaw, snapshotDetails.formulaVersion || 'v1',
                null, snapshotDetails.rateCardRevision || 1, snapshotDetails.rateCardChecksum || 'mock',
                JSON.stringify(snapshotPayload), checksum, actor ? actor.userId : 'system'
            ]);

            // 10. Mark quote ACCEPTED
            await conn.query('UPDATE job_quotes SET status = "ACCEPTED" WHERE id = ?', [quoteId]);

            // 12. Link active snapshot to order
            await conn.query('UPDATE orders SET active_pricing_snapshot_id = ? WHERE id = ?', [snapshotId, orderId]);

            // 13. Emit audit event
            await conn.query(`
                INSERT INTO pricing_events (id, job_quote_id, event_type, metadata_json)
                VALUES (?, ?, 'QUOTE_ACCEPTED_AND_SEALED', ?)
            `, [
                crypto.randomUUID(), quoteId,
                JSON.stringify({ orderId, snapshotId, actorId: actor ? actor.userId : 'system' })
            ]);

            await conn.commit();
            return { status: 'ACCEPTED', snapshotId };
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    }
}

module.exports = new QuoteService();
