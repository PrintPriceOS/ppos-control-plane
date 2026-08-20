/**
 * src/api/services/calibrationSessionService.js
 *
 * Phase 193B — Reference Book Calibration Session Service
 *
 * Implements durable persistence for structured known-book examples against
 * owned printer nodes. Enforces strict state machine, tenant-scoped ownership,
 * ambiguity detection, and immutable provenance.
 *
 * State Machine:
 *   DRAFT → READY → CALCULATED → ACCEPTED
 *                               → REJECTED
 *   DRAFT → REJECTED
 *   READY → REJECTED
 *   CALCULATED → REJECTED
 *
 * ACCEPTED and REJECTED are terminal states.
 *
 * Phase 193B boundary:
 *   - READY is the maximum achievable state
 *   - CALCULATED and ACCEPTED require Phase 193C solver
 *   - No rate mutation occurs under any calibration endpoint
 *   - Solver output lives in calibration_runs (193C), not here
 */
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const db = require('./mysqlClient');
const logger = require('./logger').child('calibration-session');

// ── Canonical Reference Book Taxonomy (Physical Job Specification) ──────────

// Interior print (physical job format consumed by BPE):
// 193C mapping: '1/1' -> interior_one_colour_*, '2/2' -> interior_two_colour_*, '4/4' -> interior_full_colour_*
const VALID_INTERIOR_PRINT = ['1/1', '2/2', '4/4'];

// Cover print (physical job format consumed by BPE):
// Format is {front}/{back} colors (e.g., '4/0', '4/4', '1/0', '1/1', '2/0', '2/2', '3/0', '3/3', '5/0', '5/5')
const VALID_COVER_PRINT = [
    '1/0', '1/1',
    '2/0', '2/2',
    '3/0', '3/3',
    '4/0', '4/4',
    '5/0', '5/5'
];

// Binding method (canonical physical job names):
// 193C mapping: 'perfect bound' -> binding_pb_*, 'saddle stitch' -> binding_ss_*, 'thread sewn' -> binding_ts_*,
//               'hardcover' -> binding_hc_*, 'wire-o' -> binding_wo_*, 'spiral' -> binding_sp_*
const VALID_BINDING_METHOD = [
    'perfect bound',
    'saddle stitch',
    'thread sewn',
    'hardcover',
    'wire-o',
    'spiral'
];

// Paper types: maps to paper_price_{component}_by_kilo[value] rate keys
const VALID_PAPER_TYPE_INTERIOR = ['offset', 'mc', 'lux', 'munken', 'other'];
const VALID_PAPER_TYPE_COVER = ['mc', 'artboard', 'offset', 'wfmc', 'other'];
const VALID_PAPER_TYPE_ENDPAPER = ['offset', 'mc', 'other'];

// Lamination: maps to lam_fixed[value] + lam_var_per_1000[value] rate keys
const VALID_LAMINATION = ['gloss', 'matt', 'varnish'];

// Orientation (informational, not consumed by rates)
const VALID_ORIENTATION = ['portrait', 'landscape'];

// Currencies
const VALID_CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'PLN', 'HUF', 'SEK', 'DKK', 'NOK', 'CZK'];

// ISO-2 country pattern
const ISO2_COUNTRY_PATTERN = /^[A-Z]{2}$/;

// UI guard rails — not BPE constraints.
// BPE internally applies its own validation per house.
const TECHNICAL_GUARD_RAILS = {
    book_width_mm: { min: 50, max: 500 },
    book_height_mm: { min: 50, max: 700 },
    paper_weight_interior: { min: 40, max: 400 },
    paper_weight_cover: { min: 100, max: 600 },
    paper_weight_endpapers: { min: 80, max: 300 }
};

// ── State Machine ───────────────────────────────────────────────────────────

const ALLOWED_TRANSITIONS = {
    'DRAFT': ['READY', 'REJECTED'],
    'READY': ['CALCULATED', 'REJECTED'],
    'CALCULATED': ['ACCEPTED', 'REJECTED'],
    'ACCEPTED': [],   // Terminal
    'REJECTED': []    // Terminal
};

class CalibrationSessionService {

    // ── B8: Reference Book Validation ───────────────────────────────────────

    /**
     * Validates a structured reference book specification against the
     * canonical BPE taxonomy.
     *
     * @param {Object} spec - The book specification to validate
     * @returns {{ valid: boolean, errors: string[] }}
     */
    validateBookSpec(spec) {
        const errors = [];

        if (!spec || typeof spec !== 'object') {
            return { valid: false, errors: ['book_spec_json must be a non-null object'] };
        }

        // Required numeric fields
        if (!Number.isInteger(spec.copies) || spec.copies < 1) {
            errors.push('copies must be a positive integer');
        }
        if (!Number.isInteger(spec.interior_pages) || spec.interior_pages < 1) {
            errors.push('interior_pages must be a positive integer');
        }

        // Dimension guard rails
        if (typeof spec.book_width_mm !== 'number' ||
            spec.book_width_mm < TECHNICAL_GUARD_RAILS.book_width_mm.min ||
            spec.book_width_mm > TECHNICAL_GUARD_RAILS.book_width_mm.max) {
            errors.push(`book_width_mm must be between ${TECHNICAL_GUARD_RAILS.book_width_mm.min} and ${TECHNICAL_GUARD_RAILS.book_width_mm.max}`);
        }
        if (typeof spec.book_height_mm !== 'number' ||
            spec.book_height_mm < TECHNICAL_GUARD_RAILS.book_height_mm.min ||
            spec.book_height_mm > TECHNICAL_GUARD_RAILS.book_height_mm.max) {
            errors.push(`book_height_mm must be between ${TECHNICAL_GUARD_RAILS.book_height_mm.min} and ${TECHNICAL_GUARD_RAILS.book_height_mm.max}`);
        }

        // Required BPE taxonomy enums
        if (!VALID_INTERIOR_PRINT.includes(spec.interior_print)) {
            errors.push(`interior_print must be one of: ${VALID_INTERIOR_PRINT.join(', ')}`);
        }
        if (!VALID_COVER_PRINT.includes(String(spec.cover_print))) {
            errors.push(`cover_print must be one of: ${VALID_COVER_PRINT.join(', ')}`);
        }
        if (!VALID_PAPER_TYPE_INTERIOR.includes(spec.paper_type_interior)) {
            errors.push(`paper_type_interior must be one of: ${VALID_PAPER_TYPE_INTERIOR.join(', ')}`);
        }
        if (typeof spec.paper_weight_interior !== 'number' ||
            spec.paper_weight_interior < TECHNICAL_GUARD_RAILS.paper_weight_interior.min ||
            spec.paper_weight_interior > TECHNICAL_GUARD_RAILS.paper_weight_interior.max) {
            errors.push(`paper_weight_interior must be between ${TECHNICAL_GUARD_RAILS.paper_weight_interior.min} and ${TECHNICAL_GUARD_RAILS.paper_weight_interior.max}`);
        }
        if (!VALID_PAPER_TYPE_COVER.includes(spec.paper_type_cover)) {
            errors.push(`paper_type_cover must be one of: ${VALID_PAPER_TYPE_COVER.join(', ')}`);
        }
        if (typeof spec.paper_weight_cover !== 'number' ||
            spec.paper_weight_cover < TECHNICAL_GUARD_RAILS.paper_weight_cover.min ||
            spec.paper_weight_cover > TECHNICAL_GUARD_RAILS.paper_weight_cover.max) {
            errors.push(`paper_weight_cover must be between ${TECHNICAL_GUARD_RAILS.paper_weight_cover.min} and ${TECHNICAL_GUARD_RAILS.paper_weight_cover.max}`);
        }
        if (!VALID_BINDING_METHOD.includes(spec.binding_method)) {
            errors.push(`binding_method must be one of: ${VALID_BINDING_METHOD.join(', ')}`);
        }
        if (!spec.delivery_country || !ISO2_COUNTRY_PATTERN.test(spec.delivery_country)) {
            errors.push('delivery_country must be an ISO-2 uppercase country code (e.g. ES, DE, FR)');
        }

        // Optional enum fields
        if (spec.orientation !== undefined && spec.orientation !== null &&
            !VALID_ORIENTATION.includes(spec.orientation)) {
            errors.push(`orientation must be one of: ${VALID_ORIENTATION.join(', ')}`);
        }
        if (spec.cover_pages !== undefined && spec.cover_pages !== null &&
            (!Number.isInteger(spec.cover_pages) || spec.cover_pages < 0)) {
            errors.push('cover_pages must be a non-negative integer');
        }

        // Lamination — flat field, maps to lam_fixed[value]
        if (spec.lamination !== undefined && spec.lamination !== null &&
            !VALID_LAMINATION.includes(spec.lamination)) {
            errors.push(`lamination must be one of: ${VALID_LAMINATION.join(', ')}, or null`);
        }

        // Endpapers validation
        if (spec.endpapers === true) {
            if (spec.endpapers_print !== undefined && spec.endpapers_print !== null &&
                !['1/0', '1/1', '4/0', '4/4'].includes(String(spec.endpapers_print))) {
                errors.push('endpapers_print must be one of: 1/0, 1/1, 4/0, 4/4');
            }
            if (spec.paper_type_endpaper !== undefined && spec.paper_type_endpaper !== null &&
                !VALID_PAPER_TYPE_ENDPAPER.includes(spec.paper_type_endpaper)) {
                errors.push(`paper_type_endpaper must be one of: ${VALID_PAPER_TYPE_ENDPAPER.join(', ')}`);
            }
            if (spec.paper_weight_endpapers !== undefined && spec.paper_weight_endpapers !== null) {
                if (typeof spec.paper_weight_endpapers !== 'number' ||
                    spec.paper_weight_endpapers < TECHNICAL_GUARD_RAILS.paper_weight_endpapers.min ||
                    spec.paper_weight_endpapers > TECHNICAL_GUARD_RAILS.paper_weight_endpapers.max) {
                    errors.push(`paper_weight_endpapers must be between ${TECHNICAL_GUARD_RAILS.paper_weight_endpapers.min} and ${TECHNICAL_GUARD_RAILS.paper_weight_endpapers.max}`);
                }
            }
        }

        return { valid: errors.length === 0, errors };
    }

    // ── B9: Ambiguity Preflight ─────────────────────────────────────────────

    /**
     * Checks whether the calibration session has enough explicit semantics
     * for deterministic calibration. All includes_* must be explicitly set
     * (true or false), not NULL.
     *
     * @param {Object} session - The calibration session record (deserialized)
     * @returns {{ ready: boolean, blockingFields: string[] }}
     */
    checkAmbiguity(session) {
        const blockingFields = [];

        // Manufacturing price must be positive
        if (!session.targetManufacturingPrice || session.targetManufacturingPrice <= 0) {
            blockingFields.push('target_manufacturing_price must be a positive value');
        }

        // Currency must be valid
        if (!VALID_CURRENCIES.includes(session.currency)) {
            blockingFields.push(`currency must be one of: ${VALID_CURRENCIES.join(', ')}`);
        }

        // All four includes_* must be explicitly answered (not null)
        const inclusionFields = ['includesPaper', 'includesBinding', 'includesFinishing', 'includesPackaging'];
        const dbFields = ['includes_paper', 'includes_binding', 'includes_finishing', 'includes_packaging'];
        inclusionFields.forEach((field, idx) => {
            if (session[field] === null || session[field] === undefined) {
                blockingFields.push(`${dbFields[idx]} must be explicitly set before READY`);
            }
        });

        // Transport price if provided must be non-negative
        if (session.transportPricePerKg !== null && session.transportPricePerKg !== undefined) {
            if (session.transportPricePerKg < 0) {
                blockingFields.push('transport_price_per_kg cannot be negative');
            }
            if (session.transportCurrency && !VALID_CURRENCIES.includes(session.transportCurrency)) {
                blockingFields.push(`transport_currency must be one of: ${VALID_CURRENCIES.join(', ')}`);
            }
        }

        return { ready: blockingFields.length === 0, blockingFields };
    }

    // ── B6/B7: Rates Snapshot ───────────────────────────────────────────────

    /**
     * Reads raw rates_json from printer_nodes without hydration.
     * Preserves exact zero vs missing semantics.
     *
     * @param {string} tenantId
     * @param {string} nodeId
     * @returns {Promise<{ snapshot: Object|null, checksum: string|null }>}
     */
    async snapshotRates(tenantId, nodeId) {
        const rows = await db.query(
            'SELECT rates_json FROM printer_nodes WHERE id = ? AND tenant_id = ?',
            [nodeId, tenantId]
        );

        if (rows.length === 0) {
            return { snapshot: null, checksum: null };
        }

        const raw = rows[0].rates_json;
        if (!raw) {
            return { snapshot: null, checksum: null };
        }

        // B7: Raw parse — no hydration, no default injection
        const snapshot = typeof raw === 'string' ? JSON.parse(raw) : raw;
        const checksum = this.computeRatesChecksum(snapshot);

        return { snapshot, checksum };
    }

    /**
     * Computes a deterministic SHA-256 checksum of rates JSON.
     * Uses sorted-key recursive serialization for canonical form.
     *
     * @param {Object} ratesJson
     * @returns {string|null} hex-encoded SHA-256 hash
     */
    computeRatesChecksum(ratesJson) {
        if (!ratesJson) return null;
        const canonical = this._canonicalStringify(ratesJson);
        return crypto.createHash('sha256').update(canonical).digest('hex');
    }

    /**
     * Recursive sorted-key JSON serialization for deterministic checksums.
     */
    _canonicalStringify(obj) {
        if (obj === null || obj === undefined) return 'null';
        if (typeof obj !== 'object') return JSON.stringify(obj);
        if (Array.isArray(obj)) {
            return '[' + obj.map(v => this._canonicalStringify(v)).join(',') + ']';
        }
        const keys = Object.keys(obj).sort();
        const pairs = keys.map(k => JSON.stringify(k) + ':' + this._canonicalStringify(obj[k]));
        return '{' + pairs.join(',') + '}';
    }

    // ── B5: Node Ownership Resolution ───────────────────────────────────────

    /**
     * Resolves and verifies node ownership.
     * Never trusts tenantId from request body — always from JWT.
     *
     * @param {string} tenantId - From authenticated JWT context
     * @param {string} printerNodeId - Requested node ID
     * @returns {Promise<{ id: string, name: string }>}
     * @throws {Error} with code and statusCode
     */
    async resolveNodeOwnership(tenantId, printerNodeId) {
        if (!printerNodeId) {
            const err = new Error('PRINTER_NODE_ID_REQUIRED');
            err.code = 'PRINTER_NODE_ID_REQUIRED';
            err.statusCode = 400;
            throw err;
        }

        const rows = await db.query(
            'SELECT id, name FROM printer_nodes WHERE id = ? AND tenant_id = ?',
            [printerNodeId, tenantId]
        );

        if (rows.length === 0) {
            const err = new Error('NODE_NOT_FOUND_OR_NOT_OWNED');
            err.code = 'NODE_NOT_FOUND_OR_NOT_OWNED';
            err.statusCode = 404;
            throw err;
        }

        return rows[0];
    }

    // ── CRUD Operations ─────────────────────────────────────────────────────

    /**
     * Creates a new calibration session in DRAFT status.
     * Rates snapshot is NOT taken here — deferred to READY.
     */
    async createSession(tenantId, user, body) {
        const {
            printerNodeId,
            bookSpec,
            targetManufacturingPrice,
            currency = 'EUR',
            transportPricePerKg = null,
            transportCurrency = null,
            includesPaper = null,
            includesBinding = null,
            includesFinishing = null,
            includesPackaging = null
        } = body;

        // B5: Resolve ownership server-side
        const node = await this.resolveNodeOwnership(tenantId, printerNodeId);

        // B8: Validate reference book
        const validation = this.validateBookSpec(bookSpec);
        if (!validation.valid) {
            const err = new Error('INVALID_BOOK_SPEC');
            err.code = 'INVALID_BOOK_SPEC';
            err.statusCode = 400;
            err.details = validation.errors;
            throw err;
        }

        // B2: Validate target price
        if (typeof targetManufacturingPrice !== 'number' || targetManufacturingPrice <= 0) {
            const err = new Error('INVALID_MANUFACTURING_PRICE');
            err.code = 'INVALID_MANUFACTURING_PRICE';
            err.statusCode = 400;
            throw err;
        }
        if (!VALID_CURRENCIES.includes(currency)) {
            const err = new Error('INVALID_CURRENCY');
            err.code = 'INVALID_CURRENCY';
            err.statusCode = 400;
            throw err;
        }
        if (transportPricePerKg !== null && transportPricePerKg !== undefined) {
            if (typeof transportPricePerKg !== 'number' || transportPricePerKg < 0) {
                const err = new Error('INVALID_TRANSPORT_PRICE');
                err.code = 'INVALID_TRANSPORT_PRICE';
                err.statusCode = 400;
                throw err;
            }
        }

        // Actor as JSON (project convention from Phase 191H)
        const actorJson = {
            id: user.id || null,
            email: user.email || null,
            role: user.role || null,
            timestamp: new Date().toISOString()
        };

        const sessionId = `cal-${uuidv4().substring(0, 8)}`;

        await db.query(
            `INSERT INTO printhouse_pricing_calibration_sessions
            (id, tenant_id, printer_node_id, printer_node_name_snapshot, created_by_json,
             status, book_spec_json,
             target_manufacturing_price, currency, transport_price_per_kg, transport_currency,
             includes_paper, includes_binding, includes_finishing, includes_packaging)
            VALUES (?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                sessionId,
                tenantId,
                printerNodeId,
                node.name || null,
                JSON.stringify(actorJson),
                JSON.stringify(bookSpec),
                targetManufacturingPrice,
                currency,
                transportPricePerKg,
                transportCurrency,
                includesPaper,
                includesBinding,
                includesFinishing,
                includesPackaging
            ]
        );

        logger.info({
            event: 'calibration_session_created',
            sessionId,
            tenantId,
            printerNodeId,
            status: 'DRAFT'
        });

        return this.getSession(tenantId, sessionId);
    }

    /**
     * Retrieves a single calibration session. B5: tenant-scoped.
     */
    async getSession(tenantId, sessionId) {
        const rows = await db.query(
            `SELECT * FROM printhouse_pricing_calibration_sessions
             WHERE id = ? AND tenant_id = ?`,
            [sessionId, tenantId]
        );

        if (rows.length === 0) {
            const err = new Error('CALIBRATION_SESSION_NOT_FOUND');
            err.code = 'CALIBRATION_SESSION_NOT_FOUND';
            err.statusCode = 404;
            throw err;
        }

        return this._deserializeSession(rows[0]);
    }

    /**
     * Lists all calibration sessions for a tenant. B5: tenant-scoped.
     */
    async listSessions(tenantId) {
        const rows = await db.query(
            `SELECT * FROM printhouse_pricing_calibration_sessions
             WHERE tenant_id = ?
             ORDER BY created_at DESC`,
            [tenantId]
        );

        return rows.map(r => this._deserializeSession(r));
    }

    /**
     * Updates a DRAFT calibration session. B4: only DRAFT is editable.
     */
    async updateSession(tenantId, sessionId, body) {
        const session = await this.getSession(tenantId, sessionId);

        if (session.status !== 'DRAFT') {
            const err = new Error('SESSION_NOT_EDITABLE');
            err.code = 'SESSION_NOT_EDITABLE';
            err.statusCode = 409;
            err.details = `Cannot edit session in ${session.status} status`;
            throw err;
        }

        const updates = [];
        const params = [];

        if (body.bookSpec !== undefined) {
            const validation = this.validateBookSpec(body.bookSpec);
            if (!validation.valid) {
                const err = new Error('INVALID_BOOK_SPEC');
                err.code = 'INVALID_BOOK_SPEC';
                err.statusCode = 400;
                err.details = validation.errors;
                throw err;
            }
            updates.push('book_spec_json = ?');
            params.push(JSON.stringify(body.bookSpec));
        }
        if (body.targetManufacturingPrice !== undefined) {
            if (typeof body.targetManufacturingPrice !== 'number' || body.targetManufacturingPrice <= 0) {
                const err = new Error('INVALID_MANUFACTURING_PRICE');
                err.code = 'INVALID_MANUFACTURING_PRICE';
                err.statusCode = 400;
                throw err;
            }
            updates.push('target_manufacturing_price = ?');
            params.push(body.targetManufacturingPrice);
        }
        if (body.currency !== undefined) {
            if (!VALID_CURRENCIES.includes(body.currency)) {
                const err = new Error('INVALID_CURRENCY');
                err.code = 'INVALID_CURRENCY';
                err.statusCode = 400;
                throw err;
            }
            updates.push('currency = ?');
            params.push(body.currency);
        }
        if (body.transportPricePerKg !== undefined) {
            if (body.transportPricePerKg !== null && (typeof body.transportPricePerKg !== 'number' || body.transportPricePerKg < 0)) {
                const err = new Error('INVALID_TRANSPORT_PRICE');
                err.code = 'INVALID_TRANSPORT_PRICE';
                err.statusCode = 400;
                throw err;
            }
            updates.push('transport_price_per_kg = ?');
            params.push(body.transportPricePerKg);
        }
        if (body.transportCurrency !== undefined) {
            updates.push('transport_currency = ?');
            params.push(body.transportCurrency);
        }
        // Nullable boolean fields — accepts true, false, or null
        if (body.includesPaper !== undefined) {
            updates.push('includes_paper = ?');
            params.push(body.includesPaper);
        }
        if (body.includesBinding !== undefined) {
            updates.push('includes_binding = ?');
            params.push(body.includesBinding);
        }
        if (body.includesFinishing !== undefined) {
            updates.push('includes_finishing = ?');
            params.push(body.includesFinishing);
        }
        if (body.includesPackaging !== undefined) {
            updates.push('includes_packaging = ?');
            params.push(body.includesPackaging);
        }

        if (updates.length === 0) {
            return session;
        }

        params.push(sessionId, tenantId);
        await db.query(
            `UPDATE printhouse_pricing_calibration_sessions
             SET ${updates.join(', ')}
             WHERE id = ? AND tenant_id = ?`,
            params
        );

        return this.getSession(tenantId, sessionId);
    }

    /**
     * Promotes a DRAFT session to READY.
     * B4, B6, B8, B9: validates book, snapshots rates, checks ambiguity.
     * Rates snapshot is taken HERE (only), and becomes immutable.
     */
    async promoteToReady(tenantId, sessionId) {
        const session = await this.getSession(tenantId, sessionId);

        // B4: Only DRAFT can transition to READY
        if (session.status !== 'DRAFT') {
            const err = new Error('INVALID_STATE_TRANSITION');
            err.code = 'INVALID_STATE_TRANSITION';
            err.statusCode = 409;
            err.details = `Cannot promote ${session.status} to READY. Only DRAFT sessions can be promoted.`;
            throw err;
        }

        // B8: Re-validate book spec
        const validation = this.validateBookSpec(session.bookSpec);
        if (!validation.valid) {
            const err = new Error('INVALID_BOOK_SPEC');
            err.code = 'INVALID_BOOK_SPEC';
            err.statusCode = 400;
            err.details = validation.errors;
            throw err;
        }

        // B9: Check ambiguity preflight (includes_* must be explicitly set)
        const ambiguity = this.checkAmbiguity(session);
        if (!ambiguity.ready) {
            const err = new Error('AMBIGUITY_PREVENTS_READY');
            err.code = 'AMBIGUITY_PREVENTS_READY';
            err.statusCode = 409;
            err.details = ambiguity.blockingFields;
            throw err;
        }

        // B5: Verify node still owned
        await this.resolveNodeOwnership(tenantId, session.printerNodeId);

        // B6: Snapshot rates at READY time — this is the only moment
        const { snapshot, checksum } = await this.snapshotRates(tenantId, session.printerNodeId);

        await db.query(
            `UPDATE printhouse_pricing_calibration_sessions
             SET status = 'READY',
                 current_rates_snapshot_json = ?,
                 current_rates_checksum = ?,
                 rates_snapshot_at = NOW(6)
             WHERE id = ? AND tenant_id = ? AND status = 'DRAFT'`,
            [
                snapshot ? JSON.stringify(snapshot) : null,
                checksum,
                sessionId,
                tenantId
            ]
        );

        logger.info({
            event: 'calibration_session_promoted',
            sessionId,
            tenantId,
            status: 'READY',
            ratesChecksum: checksum
        });

        return this.getSession(tenantId, sessionId);
    }

    /**
     * Rejects a calibration session. B4: terminal transition.
     * Allowed from DRAFT, READY, or CALCULATED.
     */
    async rejectSession(tenantId, sessionId, reason) {
        const session = await this.getSession(tenantId, sessionId);

        // B4: Check allowed transitions
        const allowed = ALLOWED_TRANSITIONS[session.status];
        if (!allowed || !allowed.includes('REJECTED')) {
            const err = new Error('INVALID_STATE_TRANSITION');
            err.code = 'INVALID_STATE_TRANSITION';
            err.statusCode = 409;
            err.details = `Cannot reject session in ${session.status} status`;
            throw err;
        }

        await db.query(
            `UPDATE printhouse_pricing_calibration_sessions
             SET status = 'REJECTED',
                 rejected_at = NOW(6),
                 rejection_reason = ?
             WHERE id = ? AND tenant_id = ?`,
            [reason || null, sessionId, tenantId]
        );

        logger.info({
            event: 'calibration_session_rejected',
            sessionId,
            tenantId,
            reason: reason || 'No reason provided'
        });

        return this.getSession(tenantId, sessionId);
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    /**
     * Deserializes a database row into a clean session object.
     * Handles JSON string/object parsing for all JSON columns.
     */
    _deserializeSession(row) {
        const parseJson = (val) => {
            if (val === null || val === undefined) return null;
            if (typeof val === 'string') {
                try { return JSON.parse(val); } catch { return null; }
            }
            return val;
        };

        return {
            id: row.id,
            tenantId: row.tenant_id,
            printerNodeId: row.printer_node_id,
            printerNodeNameSnapshot: row.printer_node_name_snapshot,
            createdBy: parseJson(row.created_by_json),
            status: row.status,
            bookSpec: parseJson(row.book_spec_json),
            targetManufacturingPrice: row.target_manufacturing_price !== null
                ? parseFloat(row.target_manufacturing_price) : null,
            currency: row.currency,
            transportPricePerKg: row.transport_price_per_kg !== null
                ? parseFloat(row.transport_price_per_kg) : null,
            transportCurrency: row.transport_currency,
            // Nullable booleans — preserve null for unanswered
            includesPaper: row.includes_paper === null ? null : Boolean(row.includes_paper),
            includesBinding: row.includes_binding === null ? null : Boolean(row.includes_binding),
            includesFinishing: row.includes_finishing === null ? null : Boolean(row.includes_finishing),
            includesPackaging: row.includes_packaging === null ? null : Boolean(row.includes_packaging),
            currentRatesSnapshot: parseJson(row.current_rates_snapshot_json),
            currentRatesChecksum: row.current_rates_checksum,
            ratesSnapshotAt: row.rates_snapshot_at,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            acceptedAt: row.accepted_at,
            rejectedAt: row.rejected_at,
            rejectionReason: row.rejection_reason
        };
    }
}

module.exports = new CalibrationSessionService();
