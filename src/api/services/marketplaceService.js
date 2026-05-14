// src/api/services/marketplaceService.js
/**
 * Phase 5 Service Layer: Deterministic Marketplace Interaction Service
 * Orchestrates multi-offer sessions, live pricing engine integrations, and transactional handoffs.
 */
const db = require('./db');
const mysqlClient = require('./mysqlClient');
const crypto = require('crypto');
const productionOfferService = require('./ManufacturingOfferService');
const pricingEngineClient = require('./pricingEngineClient');

class MarketplaceService {
    // ========================================================================
    // NEW CONTRACT METHODS (PHASE 5 INTEGRATION WITH BPE)
    // ========================================================================

    /**
     * Proactively creates a complete marketplace session from an incoming order ingestion event.
     */
    async createMarketplaceSessionFromOrder(order, options = {}) {
        const orderId = order.id || order.order_id || options.orderId || null;
        const jobId = order.job_id || options.jobId || orderId || `job_${Date.now()}`;
        const source = order.source || options.source || 'BPE';
        const sourceRef = order.source_ref || options.sourceRef || order.order_ref || null;
        const tenantId = order.tenant_id || options.tenantId || 'default';
        const traceId = order.metadata_json?.trace_id || options.traceId || `trace_${Date.now()}`;

        const baseCtx = { orderId, jobId, tenantId, source, sourceRef, traceId };

        console.log(`[MARKETPLACE][ORDER-INGESTION] Intercepted incoming order intake for orchestration`, baseCtx);

        // Check if a marketplace session already exists for this order/job to guarantee idempotency
        let existingSessionRows = [];
        if (orderId && jobId) {
            existingSessionRows = await mysqlClient.query(
                `SELECT * FROM job_marketplace_sessions WHERE order_id = ? OR job_id = ? LIMIT 1`, 
                [orderId, jobId]
            );
        } else if (orderId) {
            existingSessionRows = await mysqlClient.query(
                `SELECT * FROM job_marketplace_sessions WHERE order_id = ? LIMIT 1`, 
                [orderId]
            );
        } else {
            existingSessionRows = await mysqlClient.query(
                `SELECT * FROM job_marketplace_sessions WHERE job_id = ? LIMIT 1`, 
                [jobId]
            );
        }

        if (existingSessionRows && existingSessionRows.length > 0) {
            const existing = existingSessionRows[0];
            console.log(`[MARKETPLACE][SESSION-CREATED] Session already exists, returning stable session to avoid duplicates`, { ...baseCtx, sessionId: existing.id });
            
            // Count offers
            const offerCountRows = await mysqlClient.query(`SELECT COUNT(*) as cnt FROM manufacturing_offers WHERE marketplace_session_id = ?`, [existing.id]);
            return {
                id: existing.id,
                status: existing.session_status,
                offerCount: offerCountRows[0] ? Number(offerCountRows[0].cnt) : 0,
                selectedOfferId: existing.selected_offer_id
            };
        }

        // Provision new persistent marketplace session
        const sessionId = `sess_${crypto.randomUUID()}`;
        const metadataJsonStr = JSON.stringify({
            orderContext: order,
            traceId,
            options
        });

        await mysqlClient.query(`
            INSERT INTO job_marketplace_sessions (
                id, job_id, order_id, tenant_id, source, source_ref, 
                selection_mode, session_status, metadata_json
            ) VALUES (?, ?, ?, ?, ?, ?, 'AUTO', 'OPEN', ?)
        `, [sessionId, jobId, orderId, tenantId, source, sourceRef, metadataJsonStr]);

        const sessionCtx = { ...baseCtx, sessionId };
        console.log(`[MARKETPLACE][SESSION-CREATED] Provisioned persistent marketplace session row`, sessionCtx);

        // Write immutable timeline ledger events
        await this.writeEvent({ ...sessionCtx, eventType: 'ORDER_INGESTED', message: 'Order metadata successfully ingested for marketplace lifecycle' });
        await this.writeEvent({ ...sessionCtx, eventType: 'SESSION_CREATED', message: 'Competitive orchestration session created' });

        // Invoke Pricing Engine Client to calculate real deterministic multi-house offers
        await this.writeEvent({ ...sessionCtx, eventType: 'PRICING_ENGINE_REQUESTED', message: 'Requesting deterministic calculations from Pricing Engine' });
        
        const bpeResult = await pricingEngineClient.generateMarketplaceOffers(order, { ...options, sessionId, traceId });

        // Persist returned Pricing Engine diagnostic traces onto session registry
        await mysqlClient.query(`
            UPDATE job_marketplace_sessions 
            SET pricing_engine = ?, pricing_engine_trace_id = ?
            WHERE id = ?
        `, [bpeResult.engine || 'BPE', bpeResult.trace_id || traceId, sessionId]);

        await this.writeEvent({ ...sessionCtx, eventType: 'PRICING_ENGINE_RESPONDED', message: `Pricing Engine responded using endpoint ${bpeResult.endpoint_used}` });

        let persistedOffersCount = 0;
        let bestOfferId = null;

        if (!bpeResult.ok) {
            // Store error state, write ORCHESTRATION_FAILED event without faking offers
            const errStr = JSON.stringify(bpeResult.errors || { message: 'Unknown pricing engine error' });
            await mysqlClient.query(`
                UPDATE job_marketplace_sessions 
                SET error_json = ?, session_status = 'FAILED'
                WHERE id = ?
            `, [errStr, sessionId]);

            console.error(`[MARKETPLACE][ORCHESTRATION-FAILED] Pricing engine client returned failure outcome`, { ...sessionCtx, endpointUsed: bpeResult.endpoint_used });
            await this.writeEvent({ ...sessionCtx, eventType: 'ORCHESTRATION_FAILED', level: 'ERROR', message: `Pricing Engine failure: ${bpeResult.errors?.message || 'Unknown'}` });
            await this.writeEvent({ ...sessionCtx, eventType: 'SESSION_FAILED', level: 'ERROR', message: 'Orchestration could not generate valid offers' });
        } else if (bpeResult.offers && bpeResult.offers.length > 0) {
            // Persist real print-house candidates natively as manufacturing_offers
            for (const off of bpeResult.offers) {
                const offerId = off.id || `off_${crypto.randomUUID()}`;
                const rawEstimateStr = off.raw_estimate_json ? JSON.stringify(off.raw_estimate_json) : null;
                
                await mysqlClient.query(`
                    INSERT INTO manufacturing_offers (
                        id, job_id, order_id, marketplace_session_id, tenant_id,
                        printer_id, printer_name, house_id, machine_id, currency,
                        production_cost, suggested_price, estimated_margin, margin_pct,
                        lead_time_days, production_lead_days, shipping_days, delivery_time,
                        offer_status, offer_rank, offer_priority_score, offer_selected, raw_estimate_json
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    offerId, jobId, orderId, sessionId, tenantId,
                    off.printer_id, off.printer_name, off.house_id || off.printer_id, off.machine_id, off.currency || 'EUR',
                    off.production_cost, off.suggested_price, off.estimated_margin, off.margin_pct,
                    off.lead_time_days, off.production_lead_days, off.shipping_days, off.delivery_time,
                    off.offer_selected ? 'ACCEPTED' : 'SENT', off.offer_rank || 1, off.offer_priority_score || 0, off.offer_selected ? 1 : 0, rawEstimateStr
                ]);

                persistedOffersCount++;
                if (off.offer_selected) bestOfferId = offerId;

                console.log(`[MARKETPLACE][OFFER-GENERATED] Persisted deterministic manufacturing offer`, { ...sessionCtx, offerId, printerName: off.printer_name });
                await this.writeEvent({ ...sessionCtx, offerId, eventType: 'OFFER_GENERATED', message: `Offer generated for candidate ${off.printer_name || off.printer_id}` });
            }

            // If an offer was selected deterministically by the source engine, mirror selection on session layer
            if (bestOfferId) {
                await mysqlClient.query(`
                    UPDATE job_marketplace_sessions 
                    SET session_status = 'SELECTED', selected_offer_id = ?
                    WHERE id = ?
                `, [bestOfferId, sessionId]);
            }
        } else {
            console.log(`[MARKETPLACE][NO-OFFERS] Pricing engine returned zero executable candidate offers`, sessionCtx);
            await this.writeEvent({ ...sessionCtx, eventType: 'NO_OFFERS_RETURNED', level: 'WARN', message: 'Pricing engine returned zero offers' });
            await this.writeEvent({ ...sessionCtx, eventType: 'NO_CANDIDATES_FOUND', level: 'WARN', message: 'No viable print houses matched requirements' });
        }

        // Return summary contract
        const finalSessionRows = await mysqlClient.query(`SELECT session_status, selected_offer_id FROM job_marketplace_sessions WHERE id = ?`, [sessionId]);
        const finalStatus = finalSessionRows[0]?.session_status || 'OPEN';
        const finalSelectedOffer = finalSessionRows[0]?.selected_offer_id || null;

        return {
            id: sessionId,
            status: finalStatus,
            offerCount: persistedOffersCount,
            selectedOfferId: finalSelectedOffer
        };
    }

    /**
     * Lists active marketplace sessions matching provided pagination and query parameters.
     */
    async listSessions(filters = {}) {
        const limit = parseInt(filters.limit) || 20;
        const offset = parseInt(filters.offset) || 0;
        const status = filters.status || null;
        const source = filters.source || null;
        const tenant = filters.tenant || null;
        const printer = filters.printer || null;

        let sql = `
            SELECT s.*, 
                   COALESCE(o.order_ref, o.source_ref, s.source_ref) AS order_ref,
                   o.customer AS order_customer,
                   o.specs AS order_specs,
                   (SELECT COUNT(*) FROM manufacturing_offers mo WHERE mo.marketplace_session_id = s.id) AS offerCount
            FROM job_marketplace_sessions s
            LEFT JOIN orders o ON s.order_id = o.id OR s.job_id = o.id
            WHERE 1=1
        `;
        const params = [];

        if (status) {
            sql += ` AND s.session_status = ?`;
            params.push(status);
        }
        if (source) {
            sql += ` AND s.source = ?`;
            params.push(source);
        }
        if (tenant) {
            sql += ` AND s.tenant_id = ?`;
            params.push(tenant);
        }
        if (printer) {
            sql += ` AND EXISTS (SELECT 1 FROM manufacturing_offers mo WHERE mo.marketplace_session_id = s.id AND (mo.printer_id = ? OR mo.printer_name LIKE ?))`;
            params.push(printer, `%${printer}%`);
        }

        sql += ` ORDER BY s.created_at DESC LIMIT ? OFFSET ?`;
        params.push(limit, offset);

        // Fetch stable aggregation metrics
        let countSql = `SELECT COUNT(*) AS total FROM job_marketplace_sessions s WHERE 1=1`;
        const countParams = [];
        if (status) { countSql += ` AND s.session_status = ?`; countParams.push(status); }
        if (source) { countSql += ` AND s.source = ?`; countParams.push(source); }
        if (tenant) { countSql += ` AND s.tenant_id = ?`; countParams.push(tenant); }
        if (printer) { 
            countSql += ` AND EXISTS (SELECT 1 FROM manufacturing_offers mo WHERE mo.marketplace_session_id = s.id AND (mo.printer_id = ? OR mo.printer_name LIKE ?))`;
            countParams.push(printer, `%${printer}%`);
        }

        const countRows = await mysqlClient.query(countSql, countParams);
        const total = countRows[0] ? Number(countRows[0].total) : 0;

        const rows = await mysqlClient.query(sql, params);

        const sessions = [];
        for (const r of rows) {
            let bestOfferSql = `
                SELECT * FROM manufacturing_offers 
                WHERE marketplace_session_id = ? 
                ORDER BY offer_selected DESC, offer_rank ASC, offer_priority_score DESC, production_cost ASC 
                LIMIT 1
            `;
            const bestOfferRows = await mysqlClient.query(bestOfferSql, [r.id]);
            const bestOffer = bestOfferRows[0] || null;

            const safeParse = (str) => {
                if (typeof str === 'string') {
                    try { return JSON.parse(str); } catch(e) { return null; }
                }
                return str;
            };

            let orderSummary = null;
            if (r.order_customer || r.order_specs) {
                orderSummary = {
                    customer: safeParse(r.order_customer),
                    specs: safeParse(r.order_specs)
                };
            } else if (r.metadata_json) {
                const meta = safeParse(r.metadata_json);
                if (meta && (meta.customer || meta.specs || meta.orderContext)) {
                    orderSummary = { 
                        customer: meta.customer || meta.orderContext?.customer, 
                        specs: meta.specs || meta.orderContext?.specs 
                    };
                }
            }

            sessions.push({
                id: r.id,
                jobId: r.job_id,
                orderId: r.order_id,
                tenantId: r.tenant_id,
                source: r.source,
                sourceRef: r.source_ref || r.order_ref,
                sessionStatus: r.session_status,
                selectionMode: r.selection_mode,
                selectedOfferId: r.selected_offer_id,
                offerCount: Number(r.offerCount || 0),
                bestOffer: bestOffer ? {
                    id: bestOffer.id,
                    printerId: bestOffer.printer_id,
                    printerName: bestOffer.printer_name || bestOffer.printer_id,
                    productionCost: bestOffer.production_cost,
                    suggestedPrice: bestOffer.suggested_price,
                    estimatedMargin: bestOffer.estimated_margin,
                    marginPct: bestOffer.margin_pct,
                    leadTimeDays: bestOffer.lead_time_days,
                    offerSelected: bestOffer.offer_selected
                } : null,
                createdAt: r.created_at,
                updatedAt: r.updated_at,
                orderSummary
            });
        }

        return {
            ok: true,
            sessions,
            total,
            limit,
            offset
        };
    }

    /**
     * Retrieves robust session details including immutable events timeline and candidate offers.
     */
    async getSessionDetail(sessionId) {
        const sessionRows = await mysqlClient.query(`SELECT * FROM job_marketplace_sessions WHERE id = ?`, [sessionId]);
        const session = sessionRows[0];
        if (!session) return { ok: false, error: 'MARKETPLACE_SESSION_NOT_FOUND' };

        const safeParse = (str) => {
            if (typeof str === 'string') {
                try { return JSON.parse(str); } catch(e) { return null; }
            }
            return str;
        };

        const metadata = safeParse(session.metadata_json) || {};
        const error = safeParse(session.error_json) || null;

        let order = metadata.orderContext || null;
        if (!order && (session.order_id || session.job_id)) {
            const ordRows = await mysqlClient.query(`SELECT * FROM orders WHERE id = ? OR order_ref = ? LIMIT 1`, [session.order_id || session.job_id, session.source_ref || '']);
            if (ordRows[0]) {
                const r = ordRows[0];
                order = {
                    id: r.id,
                    order_ref: r.order_ref,
                    source: r.source,
                    source_ref: r.source_ref,
                    tenant_id: r.tenant_id,
                    customer: safeParse(r.customer),
                    specs: safeParse(r.specs),
                    pricing: safeParse(r.pricing),
                    delivery: safeParse(r.delivery),
                    currency: r.currency,
                    status: r.status,
                    offer_price: r.offer_price,
                    offer_print_house: r.offer_print_house
                };
            }
        }

        // Sort offers transactionally: offer_selected DESC, offer_rank ASC, offer_priority_score DESC, production_cost ASC
        const offerRows = await mysqlClient.query(`
            SELECT * FROM manufacturing_offers 
            WHERE marketplace_session_id = ?
            ORDER BY offer_selected DESC, offer_rank ASC, offer_priority_score DESC, production_cost ASC
        `, [sessionId]);

        const offers = offerRows.map(o => ({
            id: o.id,
            jobId: o.job_id,
            orderId: o.order_id,
            marketplaceSessionId: o.marketplace_session_id,
            tenantId: o.tenant_id,
            printerId: o.printer_id,
            printerName: o.printer_name || o.printer_id,
            houseId: o.house_id,
            machineId: o.machine_id,
            quoteId: o.quote_id,
            currency: o.currency,
            productionCost: o.production_cost != null ? Number(o.production_cost) : null,
            suggestedPrice: o.suggested_price != null ? Number(o.suggested_price) : null,
            estimatedMargin: o.estimated_margin != null ? Number(o.estimated_margin) : null,
            marginPct: o.margin_pct != null ? Number(o.margin_pct) : null,
            leadTimeDays: o.lead_time_days != null ? Number(o.lead_time_days) : null,
            productionLeadDays: o.production_lead_days,
            shippingDays: o.shipping_days,
            deliveryTime: o.delivery_time,
            offerExpiresAt: o.offer_expires_at,
            offerStatus: o.offer_status,
            offerRank: o.offer_rank,
            offerPriorityScore: o.offer_priority_score != null ? Number(o.offer_priority_score) : null,
            offerSelected: o.offer_selected === 1,
            rawEstimate: safeParse(o.raw_estimate_json),
            metadata: safeParse(o.metadata_json),
            error: safeParse(o.error_json),
            createdAt: o.created_at,
            updatedAt: o.updated_at
        }));

        // Sort events chronologically
        const eventRows = await mysqlClient.query(`
            SELECT * FROM marketplace_events 
            WHERE marketplace_session_id = ?
            ORDER BY created_at ASC
        `, [sessionId]);

        const events = eventRows.map(e => ({
            id: e.id,
            eventType: e.event_type,
            eventLevel: e.event_level,
            message: e.message,
            offerId: e.offer_id,
            source: e.source,
            sourceRef: e.source_ref,
            metadata: safeParse(e.metadata_json),
            createdAt: e.created_at
        }));

        return {
            ok: true,
            session: {
                id: session.id,
                jobId: session.job_id,
                orderId: session.order_id,
                tenantId: session.tenant_id,
                source: session.source,
                sourceRef: session.source_ref,
                sessionStatus: session.session_status,
                selectionMode: session.selection_mode,
                selectedOfferId: session.selected_offer_id,
                pricingEngine: session.pricing_engine,
                pricingEngineTraceId: session.pricing_engine_trace_id,
                metadata,
                error,
                order,
                offers,
                events,
                createdAt: session.created_at,
                updatedAt: session.updated_at
            }
        };
    }

    /**
     * Executes robust transactional offer selection override.
     * Note: Prepares handoff point but intentionally refrains from auto-dispatching manufacturing operations yet.
     */
    async selectOffer(sessionId, offerId, selectionMode = 'ADMIN_OVERRIDE') {
        const pool = mysqlClient.getPool();
        const conn = await pool.getConnection();
        await conn.beginTransaction();

        try {
            // 1. Validate session presence
            const [sessionRows] = await conn.query('SELECT * FROM job_marketplace_sessions WHERE id = ? FOR UPDATE', [sessionId]);
            const session = sessionRows[0];
            if (!session) {
                const err = new Error('MARKETPLACE_SESSION_NOT_FOUND');
                err.status = 404;
                throw err;
            }

            // 2. Validate offer presence within given session
            const [offerRows] = await conn.query('SELECT * FROM manufacturing_offers WHERE id = ? AND marketplace_session_id = ?', [offerId, sessionId]);
            const targetOffer = offerRows[0];
            if (!targetOffer) {
                const err = new Error('MARKETPLACE_OFFER_NOT_FOUND');
                err.status = 404;
                throw err;
            }

            // 3. Deselect competing candidate offers
            await conn.query(`
                UPDATE manufacturing_offers 
                SET offer_selected = 0, offer_status = 'REJECTED' 
                WHERE marketplace_session_id = ? AND id != ?
            `, [sessionId, offerId]);

            // 4. Accept the winning offer
            await conn.query(`
                UPDATE manufacturing_offers 
                SET offer_selected = 1, offer_status = 'ACCEPTED' 
                WHERE id = ?
            `, [offerId]);

            // 5. Apply session state mutation
            await conn.query(`
                UPDATE job_marketplace_sessions 
                SET session_status = 'SELECTED', selected_offer_id = ?, selection_mode = ? 
                WHERE id = ?
            `, [offerId, selectionMode, sessionId]);

            // 6. Deposit immutable handoff event ledger note
            const eventId = crypto.randomUUID();
            const logCtx = {
                orderId: session.order_id || session.job_id,
                jobId: session.job_id,
                tenantId: session.tenant_id,
                source: session.source,
                sourceRef: session.source_ref,
                sessionId,
                offerId
            };

            await conn.query(`
                INSERT INTO marketplace_events (
                    id, job_id, order_id, marketplace_session_id, offer_id, 
                    tenant_id, source, source_ref, event_type, event_level, message
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                eventId, session.job_id, session.order_id, sessionId, offerId,
                session.tenant_id, session.source, session.source_ref, 'OFFER_SELECTED', 'INFO', 
                `Offer explicitly selected via ${selectionMode}`
            ]);

            await conn.commit();
            conn.release();

            console.log(`[MARKETPLACE][OFFER-SELECTED] Winning marketplace proposal locked transactionally`, logCtx);

            // Returns complete session handoff contract
            return await this.getSessionDetail(sessionId);
        } catch (err) {
            await conn.rollback();
            conn.release();
            console.error(`[MARKETPLACE][ORCHESTRATION-FAILED] Selection process failed transactionally: ${err.message}`, { sessionId, offerId });
            throw err;
        }
    }

    async writeEvent({ orderId, jobId, tenantId, source, sourceRef, sessionId, offerId, eventType, level = 'INFO', message = null, metadata = {} }) {
        const id = crypto.randomUUID();
        try {
            await mysqlClient.query(`
                INSERT INTO marketplace_events (
                    id, job_id, order_id, marketplace_session_id, offer_id,
                    tenant_id, source, source_ref, event_type, event_level, message, metadata_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                id, jobId || orderId || 'unknown', orderId || null, sessionId || null, offerId || null,
                tenantId || null, source || null, sourceRef || null, eventType, level, message, JSON.stringify(metadata)
            ]);
        } catch (e) {
            console.error('[MARKETPLACE][EVENT-LOG-FAILED] Failed writing to marketplace_events ledger:', e.message);
        }
    }

    // ========================================================================
    // LEGACY MONOLITH METHODS (PRESERVED FOR BACKWARDS PARITY)
    // ========================================================================

    async createMarketplaceSession(jobId, mode = 'AUTO') {
        const id = crypto.randomUUID();
        try {
            await db.query(`
                INSERT INTO job_marketplace_sessions (id, job_id, selection_mode)
                VALUES (?, ?, ?)
            `, [id, jobId, mode]);

            await this.logMarketplaceEvent(jobId, id, null, 'SESSION_CREATED', { mode });
            return id;
        } catch (err) {
            console.error('[MARKETPLACE] Failed to create session:', err.message);
            throw err;
        }
    }

    async generateOffersForSession(sessionId, jobId, candidates) {
        const topCandidates = candidates.slice(0, 3);
        const offers = [];

        for (let i = 0; i < topCandidates.length; i++) {
            const candidate = topCandidates[i];
            const priorityScore = this.calculatePriorityScore(candidate);

            const offerId = await productionOfferService.createOfferFromRouting(
                jobId,
                candidate,
                candidate.routing_audit_id || null,
                candidate.economic_routing_audit_id || null
            );

            await db.query(`
                UPDATE manufacturing_offers 
                SET marketplace_session_id = ?, 
                    offer_rank = ?, 
                    offer_priority_score = ? 
                WHERE id = ?
            `, [sessionId, i + 1, priorityScore, offerId]);

            offers.push({ id: offerId, ...candidate, priorityScore });
        }

        await this.logMarketplaceEvent(jobId, sessionId, null, 'OFFERS_GENERATED', { count: offers.length });
        return offers;
    }

    calculatePriorityScore(candidate) {
        const techScore = (candidate.final_routing_score || 0) / 100;
        const marginFactor = (candidate.margin_pct || 0) / 40;
        const leadTimeFactor = Math.max(0, 1 - (candidate.lead_time_days || 5) / 10);

        return (techScore * 0.6 + Math.min(1, marginFactor) * 0.2 + leadTimeFactor * 0.2) * 100;
    }

    async getMarketplaceSessions() {
        const { rows } = await db.query(`
            SELECT s.id, 
                   COALESCE(o.order_ref, CONCAT('Job ', j.type, ' #', SUBSTRING(j.id, 1, 8)), s.job_id) AS job_name,
                   s.session_status, 
                   s.created_at,
                   (SELECT COUNT(*) FROM manufacturing_offers mo WHERE mo.marketplace_session_id = s.id) AS offer_count
            FROM job_marketplace_sessions s
            LEFT JOIN orders o ON s.job_id = o.id
            LEFT JOIN jobs j ON s.job_id = j.id
            ORDER BY s.created_at DESC 
            LIMIT 100
        `);
        return rows;
    }

    async getMarketplaceSessionDetail(sessionId) {
        const { rows } = await db.query(`
            SELECT s.*, 
                   COALESCE(o.order_ref, CONCAT('Job ', j.type, ' #', SUBSTRING(j.id, 1, 8)), s.job_id) AS job_name
            FROM job_marketplace_sessions s
            LEFT JOIN orders o ON s.job_id = o.id
            LEFT JOIN jobs j ON s.job_id = j.id
            WHERE s.id = ?
        `, [sessionId]);

        const session = rows[0];
        if (!session) return null;

        const { rows: offers } = await db.query(`
            SELECT mo.id, mo.printer_id, mo.suggested_price, mo.margin_pct, mo.lead_time_days, 
                   mo.offer_priority_score, mo.offer_selected,
                   COALESCE(p.name, mo.printer_id) AS printer_name
            FROM manufacturing_offers mo
            LEFT JOIN printer_nodes p ON mo.printer_id = p.id
            WHERE mo.marketplace_session_id = ?
            ORDER BY mo.offer_rank ASC, mo.offer_priority_score DESC
        `, [sessionId]);

        const { rows: events } = await db.query(`
            SELECT event_type, created_at, metadata_json
            FROM marketplace_events
            WHERE marketplace_session_id = ?
            ORDER BY created_at DESC
        `, [sessionId]);

        return {
            ...session,
            offers,
            events
        };
    }

    async logMarketplaceEvent(jobId, sessionId, offerId, type, metadata = {}) {
        const id = crypto.randomUUID();
        await db.query(`
            INSERT INTO marketplace_events (id, job_id, marketplace_session_id, offer_id, event_type, metadata_json)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [id, jobId, sessionId, offerId, type, JSON.stringify(metadata)]);
    }
}

module.exports = new MarketplaceService();
