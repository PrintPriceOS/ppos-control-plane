'use strict';

/**
 * src/api/services/pricing/routingDecisionEngineService.js
 *
 * PrintPrice OS — Phase 14D: Algorithmic Multi-Variable Dispatch & Routing Decision Engine
 *
 * Responsibilities:
 * 1. Evaluates incoming book orders (`orderSpec`) across all active Printhouse Nodes and their
 *    Machinery Fleet (`printhouse_machines`, `printer_nodes`, `pricing_profiles`, `materials_catalog`).
 * 2. Implements the deterministic 5-axis mathematical scoring model (0 to 100 points):
 *    - Axis 0 (Hard Gate — Technical Compatibility):
 *      0 if the machine does not support the required sheet format (`minSheetWidthMm..maxSheetWidthMm`)
 *      or binding family (`SOFTCOVER`, `HARDCOVER`, `WIRE_O`, `SADDLE_STITCH`), or if queue load exceeds
 *      `maxQueueCongestionPct` (e.g. 85%).
 *    - Axis 1 (Industrial Manufacturing Cost — Default Weight: 40%):
 *      Consolidated cost (Paper + CTP Plates + Setup + Press Run + Binding) computed via `calibrateQuote`.
 *    - Axis 2 (Geospatial & Freight Logistics — Default Weight: 30%):
 *      Haversine distance (km) from factory coordinates (`lat`, `lng`) to destination city/country,
 *      EPAL pallet count, and cross-border surcharge factor.
 *    - Axis 3 (SLA, Lead Time & Queue Saturation — Default Weight: 20%):
 *      Production lead days + press queue load (< 70% load = maximum score).
 *    - Axis 4 (OEE & Historical Reliability — Default Weight: 10%):
 *      OEE health percentage, preflight pass rate, and historical incident score.
 * 3. Persists and retrieves active dispatch governance rules (`routing_governance_rules` table + in-memory store)
 *    and automated dispatch audit events (`GET /api/pricing/routing-decisions/history`).
 */

const crypto = require('crypto');
const db = require('../mysqlClient');
const {
    getPricingProfilesAsync,
    calibrateQuote
} = require('./pricingIntelligenceService');
const {
    evaluateAndEmitRoutingDecisionEvents,
    emitRoutingNotification,
    ROUTING_EVENT_TYPES
} = require('./routingNotificationService');

const routingStateStore = new Map();

const DESTINATION_COORDINATES = {
    MADRID_ES: {
        code: 'MADRID_ES',
        label: 'Madrid, ES (28001 · Iberia Hub)',
        city: 'Madrid',
        country: 'ES',
        postalCode: '28001',
        latitude: 40.416775,
        longitude: -3.70379
    },
    BARCELONA_ES: {
        code: 'BARCELONA_ES',
        label: 'Barcelona, ES (08001 · Mediterranean Hub)',
        city: 'Barcelona',
        country: 'ES',
        postalCode: '08001',
        latitude: 41.3874,
        longitude: 2.1686
    },
    FRANKFURT_DE: {
        code: 'FRANKFURT_DE',
        label: 'Frankfurt am Main, DE (60311 · DACH Central)',
        city: 'Frankfurt',
        country: 'DE',
        postalCode: '60311',
        latitude: 50.110924,
        longitude: 8.682127
    },
    MUNICH_DE: {
        code: 'MUNICH_DE',
        label: 'München, DE (80331 · Bavaria Hub)',
        city: 'Munich',
        country: 'DE',
        postalCode: '80331',
        latitude: 48.135125,
        longitude: 11.581981
    },
    PARIS_FR: {
        code: 'PARIS_FR',
        label: 'Paris, FR (75001 · Île-de-France)',
        city: 'Paris',
        country: 'FR',
        postalCode: '75001',
        latitude: 48.856614,
        longitude: 2.352222
    },
    BRUSSELS_BE: {
        code: 'BRUSSELS_BE',
        label: 'Brussels, BE (1000 · Benelux Hub)',
        city: 'Brussels',
        country: 'BE',
        postalCode: '1000',
        latitude: 50.85034,
        longitude: 4.35171
    },
    WARSAW_PL: {
        code: 'WARSAW_PL',
        label: 'Warszawa, PL (00-001 · CEE Logistics)',
        city: 'Warsaw',
        country: 'PL',
        postalCode: '00-001',
        latitude: 52.229676,
        longitude: 21.012229
    },
    LISBON_PT: {
        code: 'LISBON_PT',
        label: 'Lisboa, PT (1100 · Atlantic Hub)',
        city: 'Lisbon',
        country: 'PT',
        postalCode: '1100',
        latitude: 38.722252,
        longitude: -9.139337
    }
};

const NODE_GEO_CATALOG = {
    'philologica.ai Printhouse': {
        city: 'Funchal / Lisboa',
        country: 'PT',
        latitude: 38.722252,
        longitude: -9.139337,
        baseLeadDays: 4,
        queueLoadPct: 54,
        oeeHealthPct: 96.2
    },
    'Adv 2025': {
        city: 'Madrid',
        country: 'ES',
        latitude: 40.416775,
        longitude: -3.70379,
        baseLeadDays: 3,
        queueLoadPct: 62,
        oeeHealthPct: 95.4
    },
    'Demo Balto 3': {
        city: 'Erfurt / Frankfurt',
        country: 'DE',
        latitude: 50.984768,
        longitude: 11.02988,
        baseLeadDays: 4,
        queueLoadPct: 48,
        oeeHealthPct: 94.8
    },
    'Heidelberg Speedmaster XL 106-8P': {
        city: 'Madrid',
        country: 'ES',
        latitude: 40.416775,
        longitude: -3.70379,
        baseLeadDays: 4,
        queueLoadPct: 58,
        oeeHealthPct: 95.8
    },
    'Komori Lithrone G29 (B2)': {
        city: 'Barcelona',
        country: 'ES',
        latitude: 41.3874,
        longitude: 2.1686,
        baseLeadDays: 3,
        queueLoadPct: 51,
        oeeHealthPct: 93.6
    },
    'HP Indigo 12000 HD Digital Press': {
        city: 'Madrid',
        country: 'ES',
        latitude: 40.416775,
        longitude: -3.70379,
        baseLeadDays: 2,
        queueLoadPct: 38,
        oeeHealthPct: 97.1
    },
    'Manroland Lithoman IV Web Offset': {
        city: 'Stuttgart',
        country: 'DE',
        latitude: 48.775846,
        longitude: 9.182932,
        baseLeadDays: 5,
        queueLoadPct: 88,
        oeeHealthPct: 91.2
    }
};

const POLICY_PRESETS = {
    BALANCED_HYBRID: {
        dispatchPolicy: 'BALANCED_HYBRID',
        weights: { cost: 0.4, freight: 0.3, leadTime: 0.2, oee: 0.1 }
    },
    LOWEST_COST: {
        dispatchPolicy: 'LOWEST_COST',
        weights: { cost: 0.6, freight: 0.2, leadTime: 0.1, oee: 0.1 }
    },
    FASTEST_DELIVERY: {
        dispatchPolicy: 'FASTEST_DELIVERY',
        weights: { cost: 0.2, freight: 0.2, leadTime: 0.5, oee: 0.1 }
    },
    LOCAL_LOW_CARBON: {
        dispatchPolicy: 'LOCAL_LOW_CARBON',
        weights: { cost: 0.2, freight: 0.55, leadTime: 0.15, oee: 0.1 }
    }
};

function round2(n) {
    return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function haversineDistanceKm(lat1, lon1, lat2, lon2) {
    const toRad = (deg) => (deg * Math.PI) / 180;
    const R = 6371; // Earth radius in km
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.max(15, Math.round(R * c));
}

function createDefaultGovernanceRules(tenantId = 'tenant-default') {
    return {
        tenantId: String(tenantId || 'tenant-default'),
        dispatchPolicy: 'BALANCED_HYBRID', // LOWEST_COST | FASTEST_DELIVERY | BALANCED_HYBRID | LOCAL_LOW_CARBON
        maxQueueCongestionPct: 85,
        crossBorderPenaltyFactor: 1.18,
        maxRadiusKm: 2500,
        slaToleranceDays: 7,
        enablePushAlarms: true,
        autoWebhookToAssignedPrinthouse: true,
        weights: {
            cost: 0.4,
            freight: 0.3,
            leadTime: 0.2,
            oee: 0.1
        },
        updatedAt: new Date().toISOString()
    };
}

function createDefaultAutomatedRoutingEvents(tenantId = 'tenant-default') {
    return [
        {
            id: 'rt-evt-901',
            tenantId,
            orderId: 'PUB-ORD-2026-8841',
            job_id: 'PUB-ORD-2026-8841',
            job_name: 'Catálogo Industrial Primavera (1.500 ej · 192 pp · Rústica PUR)',
            productSpec: '1.500 copias · 150×230 mm · 192 pp · SOFTCOVER PUR',
            destination: 'Madrid, ES (28001 · 38 km)',
            assignedPrinthouse: 'philologica.ai Printhouse · Heidelberg Speedmaster XL 106-8P',
            decisionDriver: 'Cost Optimal',
            status: 'DISPATCHED',
            finalScore: 94.6,
            industrialCostEur: 2145.8,
            freightCostEur: 95.0,
            totalLandedEur: 2240.8,
            leadTimeDays: 4,
            queueLoadPct: 54,
            created_at: '2026-11-02T09:15:00.000Z',
            final_decision_json: {
                printer_id: 'mach_node329a_komori_g40',
                printer_name: 'Heidelberg Speedmaster XL 106-8P (Offset B1)',
                node_name: 'philologica.ai Printhouse',
                technology: 'OFFSET_B1',
                final_routing_score: 94.6,
                margin_pct: 28,
                estimated_margin: 627.4,
                crossover_threshold_copies: 410,
                selected_reason: 'Tirada (1.500 ej.) superior al umbral Digital/Offset (410 ej.). Amortización óptima de planchas CTP B1 y flete peninsular directo.'
            }
        },
        {
            id: 'rt-evt-902',
            tenantId,
            orderId: 'PUB-ORD-2026-8842',
            job_id: 'PUB-ORD-2026-8842',
            job_name: 'Manual Técnico Serie Corta (200 ej · 96 pp · Rústica PUR)',
            productSpec: '200 copias · 148×210 mm (A5) · 96 pp · SOFTCOVER PUR',
            destination: 'Frankfurt, DE (60311 · 185 km)',
            assignedPrinthouse: 'Demo Balto 3 · HP Indigo 100K Digital Press',
            decisionDriver: 'SLA Protected',
            status: 'IN_PRODUCTION',
            finalScore: 96.8,
            industrialCostEur: 492.4,
            freightCostEur: 68.0,
            totalLandedEur: 560.4,
            leadTimeDays: 2,
            queueLoadPct: 42,
            created_at: '2026-11-02T09:42:00.000Z',
            final_decision_json: {
                printer_id: 'mach_b21429c1649e1f08d8104e48bec4d7b9',
                printer_name: 'HP Indigo 100K Digital Press',
                node_name: 'Demo Balto 3',
                technology: 'DIGITAL_TONER',
                final_routing_score: 96.8,
                margin_pct: 35,
                estimated_margin: 196.1,
                crossover_threshold_copies: 410,
                selected_reason: 'Tirada corta (200 ej.) inferior al punto de cruce (410 ej.). Cero planchas CTP, entrega DACH en 48h y prensa al 42% de carga.'
            }
        },
        {
            id: 'rt-evt-903',
            tenantId,
            orderId: 'PUB-ORD-2026-8845',
            job_id: 'PUB-ORD-2026-8845',
            job_name: 'Novela Editorial Bolsillo (650 ej · 256 pp · Tapa Dura)',
            productSpec: '650 copias · 150×230 mm · 256 pp · HARDCOVER',
            destination: 'Barcelona, ES (08001 · 45 km)',
            assignedPrinthouse: 'philologica.ai Printhouse · Komori Lithrone G29 (Offset B2)',
            decisionDriver: 'Low Carbon / Local',
            status: 'DISPATCHED',
            finalScore: 92.4,
            industrialCostEur: 1680.5,
            freightCostEur: 74.0,
            totalLandedEur: 1754.5,
            leadTimeDays: 3,
            queueLoadPct: 51,
            created_at: '2026-11-02T10:05:00.000Z',
            final_decision_json: {
                printer_id: 'mach_node329a_komori_g29',
                printer_name: 'Komori Lithrone G29 (Offset B2)',
                node_name: 'philologica.ai Printhouse',
                technology: 'OFFSET_B2',
                final_routing_score: 92.4,
                margin_pct: 30,
                estimated_margin: 526.3,
                crossover_threshold_copies: 385,
                selected_reason: 'Formato medio B2 optimiza puesta a punto frente a B1 para tirada de 650 ejemplares en encuadernación Cartoné.'
            }
        }
    ];
}

function getRoutingTenantState(tenantId = 'tenant-default') {
    const key = String(tenantId || 'tenant-default');
    if (!routingStateStore.has(key)) {
        routingStateStore.set(key, {
            rules: createDefaultGovernanceRules(key),
            events: createDefaultAutomatedRoutingEvents(key)
        });
    }
    return routingStateStore.get(key);
}

async function getRoutingGovernanceRulesAsync(tenantId = 'tenant-default', dbClient = db) {
    const state = getRoutingTenantState(tenantId);
    if (dbClient && typeof dbClient.query === 'function') {
        try {
            const rows = await dbClient
                .query('SELECT * FROM routing_governance_rules WHERE tenant_id = ? ORDER BY updated_at DESC LIMIT 1', [
                    tenantId
                ])
                .catch(() => []);
            if (Array.isArray(rows) && rows.length > 0) {
                const r = rows[0];
                const parsedWeights =
                    typeof r.weights_json === 'string'
                        ? JSON.parse(r.weights_json)
                        : r.weights_json || state.rules.weights;
                state.rules = {
                    ...state.rules,
                    dispatchPolicy: r.dispatch_policy || state.rules.dispatchPolicy,
                    maxQueueCongestionPct: Number(r.max_queue_congestion_pct ?? state.rules.maxQueueCongestionPct),
                    crossBorderPenaltyFactor: Number(
                        r.cross_border_penalty_factor ?? state.rules.crossBorderPenaltyFactor
                    ),
                    maxRadiusKm: Number(r.max_radius_km ?? state.rules.maxRadiusKm),
                    slaToleranceDays: Number(r.sla_tolerance_days ?? state.rules.slaToleranceDays),
                    weights: parsedWeights,
                    updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : state.rules.updatedAt
                };
            }
        } catch (_) {
            // Keep in-memory governance rules when table doesn't exist yet
        }
    }
    return {
        ok: true,
        tenantId: String(tenantId || 'tenant-default'),
        rules: state.rules,
        destinations: Object.values(DESTINATION_COORDINATES)
    };
}

async function saveRoutingGovernanceRulesAsync(tenantId = 'tenant-default', payload = {}, dbClient = db) {
    const state = getRoutingTenantState(tenantId);
    const policyKey = String(payload.dispatchPolicy || state.rules.dispatchPolicy || 'BALANCED_HYBRID').toUpperCase();
    const presetWeights = POLICY_PRESETS[policyKey]?.weights || state.rules.weights;

    const updatedRules = {
        ...state.rules,
        dispatchPolicy: POLICY_PRESETS[policyKey] ? policyKey : 'BALANCED_HYBRID',
        maxQueueCongestionPct: Math.min(
            100,
            Math.max(40, Number(payload.maxQueueCongestionPct ?? state.rules.maxQueueCongestionPct ?? 85))
        ),
        crossBorderPenaltyFactor: Math.min(
            2.5,
            Math.max(1.0, Number(payload.crossBorderPenaltyFactor ?? state.rules.crossBorderPenaltyFactor ?? 1.18))
        ),
        maxRadiusKm: Math.max(100, Number(payload.maxRadiusKm ?? state.rules.maxRadiusKm ?? 2500)),
        slaToleranceDays: Math.max(1, Number(payload.slaToleranceDays ?? state.rules.slaToleranceDays ?? 7)),
        enablePushAlarms:
            payload.enablePushAlarms !== undefined
                ? Boolean(payload.enablePushAlarms)
                : Boolean(state.rules.enablePushAlarms ?? true),
        autoWebhookToAssignedPrinthouse:
            payload.autoWebhookToAssignedPrinthouse !== undefined
                ? Boolean(payload.autoWebhookToAssignedPrinthouse)
                : Boolean(state.rules.autoWebhookToAssignedPrinthouse ?? true),
        weights: payload.weights && typeof payload.weights === 'object'
            ? {
                  cost: Number(payload.weights.cost ?? presetWeights.cost),
                  freight: Number(payload.weights.freight ?? presetWeights.freight),
                  leadTime: Number(payload.weights.leadTime ?? presetWeights.leadTime),
                  oee: Number(payload.weights.oee ?? presetWeights.oee)
              }
            : presetWeights,
        updatedAt: new Date().toISOString()
    };

    state.rules = updatedRules;

    if (dbClient && typeof dbClient.query === 'function') {
        try {
            await dbClient
                .query(
                    `CREATE TABLE IF NOT EXISTS routing_governance_rules (
                        tenant_id VARCHAR(128) PRIMARY KEY,
                        dispatch_policy VARCHAR(64) NOT NULL DEFAULT 'BALANCED_HYBRID',
                        max_queue_congestion_pct DECIMAL(5,2) NOT NULL DEFAULT 85.00,
                        cross_border_penalty_factor DECIMAL(5,2) NOT NULL DEFAULT 1.18,
                        max_radius_km INT NOT NULL DEFAULT 2500,
                        sla_tolerance_days INT NOT NULL DEFAULT 7,
                        weights_json JSON NULL,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                    )`
                )
                .catch(() => {});

            await dbClient
                .query(
                    `INSERT INTO routing_governance_rules
                     (tenant_id, dispatch_policy, max_queue_congestion_pct, cross_border_penalty_factor, max_radius_km, sla_tolerance_days, weights_json)
                     VALUES (?, ?, ?, ?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE
                       dispatch_policy = VALUES(dispatch_policy),
                       max_queue_congestion_pct = VALUES(max_queue_congestion_pct),
                       cross_border_penalty_factor = VALUES(cross_border_penalty_factor),
                       max_radius_km = VALUES(max_radius_km),
                       sla_tolerance_days = VALUES(sla_tolerance_days),
                       weights_json = VALUES(weights_json)`,
                    [
                        String(tenantId || 'tenant-default'),
                        updatedRules.dispatchPolicy,
                        updatedRules.maxQueueCongestionPct,
                        updatedRules.crossBorderPenaltyFactor,
                        updatedRules.maxRadiusKm,
                        updatedRules.slaToleranceDays,
                        JSON.stringify(updatedRules.weights)
                    ]
                )
                .catch(() => {});
        } catch (_) {
            // Non-fatal in isolated tests
        }
    }

    return {
        ok: true,
        tenantId: String(tenantId || 'tenant-default'),
        rules: updatedRules
    };
}

function parseTrimDimensionsMm(trimSize = '150x230') {
    const match = String(trimSize).match(/(\d+)\s*[x×]\s*(\d+)/i);
    if (!match) return { widthMm: 150, heightMm: 230 };
    return { widthMm: Number(match[1]), heightMm: Number(match[2]) };
}

/**
 * Deterministic Multi-Variable Algorithmic Routing Evaluator:
 * `calculateRoutingDecisions(tenantId, orderSpec, options)`
 */
async function calculateRoutingDecisions(tenantId = 'tenant-default', orderSpec = {}, options = {}, dbClient = db) {
    const pricingData = await getPricingProfilesAsync(tenantId, dbClient);
    const state = getRoutingTenantState(tenantId);
    const activeRules = {
        ...state.rules,
        ...(options.rulesOverride || {})
    };

    const dispatchPolicy = String(
        options.dispatchPolicy || orderSpec.dispatchPolicy || activeRules.dispatchPolicy || 'BALANCED_HYBRID'
    ).toUpperCase();
    const maxQueueCongestionPct = Number(
        options.maxQueueCongestionPct ?? orderSpec.maxQueueCongestionPct ?? activeRules.maxQueueCongestionPct ?? 85
    );
    const crossBorderPenaltyFactor = Number(
        options.crossBorderPenaltyFactor ??
            orderSpec.crossBorderPenaltyFactor ??
            activeRules.crossBorderPenaltyFactor ??
            1.18
    );

    const weights =
        POLICY_PRESETS[dispatchPolicy]?.weights ||
        activeRules.weights || { cost: 0.4, freight: 0.3, leadTime: 0.2, oee: 0.1 };

    const copies = Math.max(10, Number(orderSpec.copies || 1000));
    const pages = Math.max(8, Number(orderSpec.pages || 240));
    const trimSize = String(orderSpec.trimSize || '148x210');
    const { widthMm, heightMm } = parseTrimDimensionsMm(trimSize);
    const productFamily = String(
        orderSpec.productFamily ||
            (orderSpec.bindingType === 'HARDCOVER'
                ? 'HARDCOVER'
                : orderSpec.bindingType === 'WIRE_O'
                  ? 'WIRE_O'
                  : orderSpec.bindingType === 'SADDLE' || orderSpec.bindingType === 'SADDLE_STITCH'
                    ? 'SADDLE_STITCH'
                    : 'SOFTCOVER')
    ).toUpperCase();
    const bindingType =
        productFamily === 'HARDCOVER'
            ? 'HARDCOVER'
            : productFamily === 'WIRE_O'
              ? 'WIRE_O'
              : productFamily === 'SADDLE_STITCH'
                ? 'SADDLE'
                : 'PUR';

    const destKey = String(orderSpec.destination || 'MADRID_ES').toUpperCase();
    const destination =
        DESTINATION_COORDINATES[destKey] ||
        Object.values(DESTINATION_COORDINATES).find(
            (d) =>
                d.city.toLowerCase() === String(orderSpec.destinationCity || '').toLowerCase() ||
                d.country.toLowerCase() === String(orderSpec.destinationCountry || '').toLowerCase()
        ) ||
        DESTINATION_COORDINATES.MADRID_ES;

    const profiles = Array.isArray(pricingData.profiles) ? pricingData.profiles : [];

    // Raw candidate evaluations
    const rawEvaluations = profiles.map((profile, idx) => {
        const nodeGeo =
            NODE_GEO_CATALOG[profile.nodeName] ||
            NODE_GEO_CATALOG[profile.printerName] || {
                city: idx % 2 === 0 ? 'Madrid' : 'Frankfurt',
                country: idx % 2 === 0 ? 'ES' : 'DE',
                latitude: idx % 2 === 0 ? 40.416775 : 50.110924,
                longitude: idx % 2 === 0 ? -3.70379 : 8.682127,
                baseLeadDays: profile.technology === 'DIGITAL_TONER' ? 2 : 4,
                queueLoadPct: profile.technology === 'WEB_ROTARY' ? 88 : 48 + ((idx * 11) % 32),
                oeeHealthPct: Number(profile.oeeHealthPct || 94.2)
            };

        const queueLoadPct = Number(profile.queueLoadPct ?? nodeGeo.queueLoadPct ?? 54);
        const oeeHealthPct = Number(profile.oeeHealthPct ?? nodeGeo.oeeHealthPct ?? 94.2);

        // 0. Hard Gate — Technical Compatibility (Sheet format & Binding family & Queue congestion lock)
        const supportedFamilies = Array.isArray(profile.supportedFamilies)
            ? profile.supportedFamilies
            : profile.technology === 'WEB_ROTARY'
              ? ['SOFTCOVER', 'SADDLE_STITCH']
              : ['SOFTCOVER', 'HARDCOVER', 'WIRE_O', 'SADDLE_STITCH'];

        const supportsFamily = supportedFamilies.includes(productFamily);
        const maxSheetW = Number(profile.maxSheetWidthMm || 750);
        const maxSheetH = Number(profile.maxSheetHeightMm || 530);
        // Open spread requires 2 * widthMm + bleed (10mm) and heightMm + bleed (10mm)
        const requiredSpreadW = widthMm * 2 + 10;
        const requiredSpreadH = heightMm + 10;
        const fitsSheet =
            (requiredSpreadW <= maxSheetW && requiredSpreadH <= maxSheetH) ||
            (requiredSpreadH <= maxSheetW && requiredSpreadW <= maxSheetH);

        const isQueueSaturated = queueLoadPct > maxQueueCongestionPct;

        let compatible = true;
        let incompatibilityReason = null;

        if (!supportsFamily) {
            compatible = false;
            incompatibilityReason = `Incompatible Binding Family (${productFamily} not supported on ${profile.technology})`;
        } else if (!fitsSheet) {
            compatible = false;
            incompatibilityReason = `Incompatible Sheet Format (Spread ${requiredSpreadW}×${requiredSpreadH} mm exceeds ${maxSheetW}×${maxSheetH} mm)`;
        } else if (isQueueSaturated) {
            compatible = false;
            incompatibilityReason = `Queue Saturated (${queueLoadPct}% > ${maxQueueCongestionPct}% Max Congestion Lock)`;
        }

        // 1. Industrial Manufacturing Cost via `calibrateQuote`
        const quote = calibrateQuote(tenantId, {
            profileId: profile.id,
            copies,
            pages,
            trimSize,
            bindingType,
            productFamily,
            colorMode: orderSpec.colorMode || '4/4_CMYK'
        });

        const industrialCostEur = Number(quote.breakdown.totalSellingPriceEur);
        const paperWeightKg = Number(quote.breakdown.paperWeightKg || 120);

        // 2. Geospatial & Freight Calculation (DIN A4 / Euro-Pallet EPAL)
        const distanceKm = haversineDistanceKm(
            nodeGeo.latitude,
            nodeGeo.longitude,
            destination.latitude,
            destination.longitude
        );
        const epalPallets = Math.max(1, Math.ceil(paperWeightKg / 450));
        const isCrossBorder = String(nodeGeo.country).toUpperCase() !== String(destination.country).toUpperCase();
        const baseFreightEur = 45 + epalPallets * 28 + distanceKm * 0.085 * Math.sqrt(epalPallets);
        const freightCostEur = round2(baseFreightEur * (isCrossBorder ? crossBorderPenaltyFactor : 1.0));
        const totalLandedCostEur = round2(industrialCostEur + freightCostEur);

        // 3. Lead Time Calculation (Production + Transit + Queue Congestion Delay)
        const transitDays = distanceKm > 1200 ? 3 : distanceKm > 450 ? 2 : 1;
        const queueDelayDays = queueLoadPct >= 75 ? 2 : queueLoadPct >= 60 ? 1 : 0;
        const totalLeadTimeDays = Number(nodeGeo.baseLeadDays || 3) + transitDays + queueDelayDays;

        return {
            profileId: profile.id,
            printerId: profile.printerId,
            printerName: profile.printerName,
            nodeId: profile.nodeId || 'node-primary',
            nodeName: profile.nodeName || 'Printhouse Hub',
            technology: profile.technology,
            originCity: nodeGeo.city,
            originCountry: nodeGeo.country,
            destinationLabel: destination.label,
            distanceKm,
            isCrossBorder,
            epalPallets,
            compatible,
            incompatibilityReason,
            industrialCostEur,
            freightCostEur,
            totalLandedCostEur,
            unitLandedCostEur: round2(totalLandedCostEur / copies),
            totalLeadTimeDays,
            queueLoadPct,
            oeeHealthPct,
            targetMarginPct: Number(profile.targetMarginPct || 28),
            estimatedMarginEur: Number(quote.breakdown.marginAmountEur || 0),
            breakdown: quote.breakdown
        };
    });

    const compatibleCandidates = rawEvaluations.filter((c) => c.compatible);
    const minIndustrialCost =
        compatibleCandidates.length > 0
            ? Math.min(...compatibleCandidates.map((c) => c.industrialCostEur))
            : Math.min(...rawEvaluations.map((c) => c.industrialCostEur), 100);
    const minFreightCost =
        compatibleCandidates.length > 0
            ? Math.min(...compatibleCandidates.map((c) => c.freightCostEur))
            : Math.min(...rawEvaluations.map((c) => c.freightCostEur), 50);

    // Compute 0..100 composite score for each candidate
    const scoredCandidates = rawEvaluations.map((cand) => {
        if (!cand.compatible) {
            return {
                ...cand,
                axisScores: {
                    compatibilityScore: 0,
                    costScore: 0,
                    freightScore: 0,
                    leadTimeScore: 0,
                    oeeScore: round2(cand.oeeHealthPct)
                },
                finalScore: 0,
                routeBadge: 'EXCLUDED_GATE',
                rejectionReason: cand.incompatibilityReason || 'Technical / Congestion Gate Excluded'
            };
        }

        // Axis 1: Industrial Cost Score (0-100)
        const costRatio = minIndustrialCost / Math.max(1, cand.industrialCostEur);
        const costScore = round2(Math.min(100, Math.max(25, Math.pow(costRatio, 0.85) * 100)));

        // Axis 2: Geospatial & Freight Score (0-100)
        const freightRatio = minFreightCost / Math.max(1, cand.freightCostEur);
        const distancePenalty = Math.min(35, cand.distanceKm / 65);
        const crossBorderPenaltyPts = cand.isCrossBorder ? (crossBorderPenaltyFactor - 1) * 40 : 0;
        const freightScore = round2(
            Math.min(100, Math.max(20, freightRatio * 65 + (40 - distancePenalty) - crossBorderPenaltyPts))
        );

        // Axis 3: Lead Time & Queue Saturation Score (0-100)
        // <70% queue load gives full queue bonus
        const queueScore = cand.queueLoadPct <= 70 ? 100 : Math.max(30, 100 - (cand.queueLoadPct - 70) * 3.2);
        const leadDaysScore = Math.max(35, 100 - Math.max(0, cand.totalLeadTimeDays - 2) * 11);
        const leadTimeScore = round2(queueScore * 0.55 + leadDaysScore * 0.45);

        // Axis 4: OEE & Historical Reliability Score (0-100)
        const oeeScore = round2(Math.min(100, Math.max(50, cand.oeeHealthPct)));

        const composite = round2(
            costScore * weights.cost +
                freightScore * weights.freight +
                leadTimeScore * weights.leadTime +
                oeeScore * weights.oee
        );

        return {
            ...cand,
            axisScores: {
                compatibilityScore: 100,
                costScore,
                freightScore,
                leadTimeScore,
                oeeScore
            },
            finalScore: composite,
            routeBadge: 'FALLBACK_NODE',
            rejectionReason: null
        };
    });

    // Sort descending by finalScore, then ascending by totalLandedCostEur
    scoredCandidates.sort((a, b) => {
        if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
        return a.totalLandedCostEur - b.totalLandedCostEur;
    });

    const winner = scoredCandidates.find((c) => c.compatible) || null;

    const rankedCandidates = scoredCandidates.map((cand, index) => {
        if (winner && cand.profileId === winner.profileId) {
            return {
                ...cand,
                rank: 1,
                routeBadge: 'OPTIMAL ROUTE',
                decisionDriver:
                    dispatchPolicy === 'FASTEST_DELIVERY'
                        ? 'SLA Protected'
                        : dispatchPolicy === 'LOCAL_LOW_CARBON'
                          ? 'Low Carbon / Local'
                          : 'Cost Optimal',
                rejectionReason: 'Primary Optimal Node Selected'
            };
        }

        let differentialReason = cand.rejectionReason;
        if (!differentialReason && winner) {
            const costDiff = round2(cand.industrialCostEur - winner.industrialCostEur);
            const freightDiff = round2(cand.freightCostEur - winner.freightCostEur);
            if (cand.queueLoadPct >= 75) {
                differentialReason = `Queue Congestion (${cand.queueLoadPct}% load vs ${winner.queueLoadPct}%)`;
            } else if (freightDiff > 45 && freightDiff > costDiff) {
                differentialReason = `Higher Freight Cost (+€${freightDiff.toFixed(2)} · ${cand.distanceKm} km)`;
            } else if (costDiff > 0) {
                differentialReason =
                    copies >= 450 && cand.technology === 'DIGITAL_TONER'
                        ? `Higher Click Cost on Medium/Long Run (+€${costDiff.toFixed(2)})`
                        : copies < 400 && cand.technology.startsWith('OFFSET')
                          ? `Unamortized CTP Plates on Short Run (+€${costDiff.toFixed(2)})`
                          : `Higher Manufacturing Cost (+€${costDiff.toFixed(2)})`;
            } else if (cand.totalLeadTimeDays > winner.totalLeadTimeDays) {
                differentialReason = `Longer Lead Time (${cand.totalLeadTimeDays}d vs ${winner.totalLeadTimeDays}d)`;
            } else {
                differentialReason = 'Non-optimal Composite Score';
            }
        }

        return {
            ...cand,
            rank: index + 1,
            routeBadge: cand.compatible ? 'FALLBACK NODE' : 'EXCLUDED (HARD GATE)',
            rejectionReason: differentialReason || 'Secondary Fallback'
        };
    });

    // Record simulated dispatch in recent automated routing events if requested
    const generatedOrderId = orderSpec.orderId || `PUB-ORD-2026-${Math.floor(8900 + Math.random() * 900)}`;
    if (winner && options.recordEvent !== false) {
        const simEvent = {
            id: `rt-sim-${Date.now().toString().slice(-5)}`,
            tenantId: String(tenantId || 'tenant-default'),
            orderId: generatedOrderId,
            job_id: generatedOrderId,
            job_name: `${copies.toLocaleString()} ej · ${trimSize} mm · ${pages} pp (${productFamily})`,
            productSpec: `${copies.toLocaleString()} copias · ${trimSize} mm · ${pages} pp · ${productFamily}`,
            destination: `${destination.city}, ${destination.country} (${winner.distanceKm} km)`,
            assignedPrinthouse: `${winner.nodeName} · ${winner.printerName}`,
            decisionDriver:
                dispatchPolicy === 'FASTEST_DELIVERY'
                    ? 'SLA Protected'
                    : dispatchPolicy === 'LOCAL_LOW_CARBON'
                      ? 'Low Carbon / Local'
                      : 'Cost Optimal',
            status: options.forcedManual ? 'FORCED_MANUAL' : 'OPTIMAL_SIMULATED',
            finalScore: winner.finalScore,
            industrialCostEur: winner.industrialCostEur,
            freightCostEur: winner.freightCostEur,
            totalLandedEur: winner.totalLandedCostEur,
            leadTimeDays: winner.totalLeadTimeDays,
            queueLoadPct: winner.queueLoadPct,
            created_at: new Date().toISOString(),
            final_decision_json: {
                printer_id: winner.printerId,
                printer_name: winner.printerName,
                node_name: winner.nodeName,
                technology: winner.technology,
                final_routing_score: winner.finalScore,
                margin_pct: winner.targetMarginPct,
                estimated_margin: winner.estimatedMarginEur,
                selected_reason: `Score ${winner.finalScore}/100 (${dispatchPolicy}) · Landed €${winner.totalLandedCostEur} (Fab €${winner.industrialCostEur} + Flete €${winner.freightCostEur})`
            }
        };
        state.events = [simEvent, ...state.events.slice(0, 14)];
    }

    const baseResult = {
        ok: true,
        tenantId: String(tenantId || 'tenant-default'),
        policyApplied: {
            dispatchPolicy,
            maxQueueCongestionPct,
            crossBorderPenaltyFactor,
            enablePushAlarms: Boolean(options.enablePushAlarms ?? activeRules.enablePushAlarms ?? true),
            autoWebhookToAssignedPrinthouse: Boolean(
                options.autoWebhookToAssignedPrinthouse ?? activeRules.autoWebhookToAssignedPrinthouse ?? true
            ),
            weights
        },
        orderSpec: {
            orderId: generatedOrderId,
            copies,
            pages,
            trimSize,
            productFamily,
            bindingType,
            destination: destination.label,
            destinationCode: destination.code
        },
        optimalNode: rankedCandidates.find((c) => c.compatible) || null,
        candidates: rankedCandidates,
        recentEvents: state.events
    };

    // Emit real-time notifications, SSE frames, operational_events & signed webhooks (< 500ms)
    let notificationsResult = { emitted: [], primaryNotification: null };
    if (options.emitNotifications !== false) {
        notificationsResult = await evaluateAndEmitRoutingDecisionEvents(baseResult, {
            orderId: generatedOrderId,
            forcedManual: Boolean(options.forcedManual),
            previousWinnerName: options.previousWinnerName,
            enablePushAlarms: baseResult.policyApplied.enablePushAlarms,
            autoWebhookToAssignedPrinthouse: baseResult.policyApplied.autoWebhookToAssignedPrinthouse,
            webhookTargets: options.webhookTargets,
            webhookOptions: options.webhookOptions,
            dbClient
        });
    }

    return {
        ...baseResult,
        notifications: notificationsResult.emitted.map((e) => e.notification),
        primaryNotification: notificationsResult.primaryNotification,
        notificationPipeline: notificationsResult
    };
}

/**
 * Forces a manual operator override (`ROUTING_FORCED_MANUAL`) onto a specific candidate profileId.
 */
async function forceManualRoutingDecisionAsync(
    tenantId = 'tenant-default',
    payload = {},
    options = {},
    dbClient = db
) {
    const state = getRoutingTenantState(tenantId);
    const orderId = String(payload.orderId || `PUB-ORD-2026-${Math.floor(8900 + Math.random() * 900)}`).trim();
    const targetCandidate = payload.candidate || {};
    const previousWinnerName = payload.previousWinnerName || 'Top-1 Algorítmico';

    const winner = {
        profileId: targetCandidate.profileId || 'prof-manual',
        printerId: targetCandidate.printerId || targetCandidate.profileId || 'mach-manual',
        printerName: targetCandidate.printerName || 'Prensa Asignada Manualmente',
        nodeId: targetCandidate.nodeId || 'node-primary',
        nodeName: targetCandidate.nodeName || 'Printhouse Hub',
        technology: targetCandidate.technology || 'OFFSET_B1',
        distanceKm: Number(targetCandidate.distanceKm || 150),
        isCrossBorder: Boolean(targetCandidate.isCrossBorder),
        industrialCostEur: Number(targetCandidate.industrialCostEur || 1200),
        freightCostEur: Number(targetCandidate.freightCostEur || 85),
        totalLandedCostEur: Number(targetCandidate.totalLandedCostEur || 1285),
        totalLeadTimeDays: Number(targetCandidate.totalLeadTimeDays || 4),
        queueLoadPct: Number(targetCandidate.queueLoadPct || 52),
        finalScore: Number(targetCandidate.finalScore || 88.5),
        targetMarginPct: Number(targetCandidate.targetMarginPct || 28),
        estimatedMarginEur: Number(targetCandidate.estimatedMarginEur || 320)
    };

    const manualAuditRow = {
        id: `rt-man-${Date.now().toString().slice(-5)}`,
        tenantId: String(tenantId || 'tenant-default'),
        orderId,
        job_id: orderId,
        job_name: payload.productSpec || `Asignación Manual Operador (${winner.printerName})`,
        productSpec: payload.productSpec || `Desvío Manual · ${winner.nodeName} · ${winner.printerName}`,
        destination: payload.destination || targetCandidate.destinationLabel || 'Madrid, ES',
        assignedPrinthouse: `${winner.nodeName} · ${winner.printerName}`,
        decisionDriver: 'Manual Override',
        status: 'FORCED_MANUAL',
        finalScore: winner.finalScore,
        industrialCostEur: winner.industrialCostEur,
        freightCostEur: winner.freightCostEur,
        totalLandedEur: winner.totalLandedCostEur,
        leadTimeDays: winner.totalLeadTimeDays,
        queueLoadPct: winner.queueLoadPct,
        created_at: new Date().toISOString(),
        final_decision_json: {
            printer_id: winner.printerId,
            printer_name: winner.printerName,
            node_name: winner.nodeName,
            technology: winner.technology,
            final_routing_score: winner.finalScore,
            margin_pct: winner.targetMarginPct,
            estimated_margin: winner.estimatedMarginEur,
            selected_reason: `ROUTING_FORCED_MANUAL: Operador anuló '${previousWinnerName}' y asignó manualmente ${winner.nodeName} · ${winner.printerName} (Landed €${winner.totalLandedCostEur.toFixed(2)}).`
        }
    };

    state.events = [manualAuditRow, ...state.events.slice(0, 14)];

    const emittedEvt = await emitRoutingNotification(
        ROUTING_EVENT_TYPES.ROUTING_FORCED_MANUAL,
        {
            tenantId,
            printhouseId: winner.nodeId,
            orderId,
            winner,
            previousWinnerName,
            orderSpec: payload.orderSpec || {
                copies: payload.copies || 1000,
                pages: payload.pages || 240,
                trimSize: payload.trimSize || '148x210',
                productFamily: payload.productFamily || 'SOFTCOVER',
                destination: payload.destination || 'Madrid, ES'
            },
            actorId: options.actorId || 'PRINTHOUSE_ADMIN',
            actorRole: options.actorRole || 'PRINTHOUSE_ADMIN',
            actor: options.actor || 'Operador de Despacho Manual'
        },
        {
            enablePushAlarms: state.rules.enablePushAlarms !== false,
            autoWebhookToAssignedPrinthouse: state.rules.autoWebhookToAssignedPrinthouse !== false,
            ...options,
            dbClient
        }
    );

    return {
        ok: true,
        tenantId: String(tenantId || 'tenant-default'),
        orderId,
        forcedNode: winner,
        event: manualAuditRow,
        notification: emittedEvt.notification,
        recentEvents: state.events
    };
}

async function getRoutingDecisionsHistoryAsync(tenantId = 'tenant-default') {
    const state = getRoutingTenantState(tenantId);
    return {
        ok: true,
        tenantId: String(tenantId || 'tenant-default'),
        history: state.events
    };
}

module.exports = {
    calculateRoutingDecisions,
    forceManualRoutingDecisionAsync,
    getRoutingGovernanceRulesAsync,
    saveRoutingGovernanceRulesAsync,
    getRoutingDecisionsHistoryAsync,
    haversineDistanceKm,
    DESTINATION_COORDINATES,
    POLICY_PRESETS
};

