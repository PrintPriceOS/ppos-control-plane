/**
 * src/api/services/calibrationAcceptanceService.js
 *
 * Phase 193D — Governed Calibration Acceptance & Immutable Pricing Revisions.
 *
 * Responsibilities:
 * 1. Executes governed calibration patch acceptance strictly on the server side.
 * 2. Enforces atomic transactional isolation with SELECT ... FOR UPDATE.
 * 3. Enforces strict baseline drift check: verifies current printer node rates_json
 *    matches the exact baseline snapshot checksum captured by the calibration run.
 * 4. Recalculates and verifies proposed_patch_checksum from run.proposed_patch_json.
 * 5. Safely merges proposed active rates into current rates_json preserving explicit zeros,
 *    uncalibrated rates, and legacy metadata.
 * 6. Executes canonical BPE forward pricing verification on resulting rates using
 *    @ppos/pricing-engine buildPrice(params, house) excluding Shipping.
 * 7. Evaluates governance acceptance tolerance:
 *    effectiveTolerance = max(configuredAbsoluteTolerance, targetManufacturingPrice * configuredPercentTolerance)
 * 8. Atomically inserts printhouse_pricing_revisions, updates printer_nodes.rates_json,
 *    inserts printhouse_pricing_calibration_acceptances, transitions session to ACCEPTED,
 *    and writes audit log.
 * 9. Leaves marketplace activation grants completely untouched.
 */
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const db = require('./mysqlClient');
const calibrationSessionService = require('./calibrationSessionService');
const adapter = require('./buildPriceCalibrationAdapter');
const logger = require('./logger').child('calibration-acceptance');

const CANONICAL_ACCEPTABLE_RUN_STATUSES = ['SUCCEEDED', 'CONVERGED', 'UNDERDETERMINED_ANCHOR'];

// Governance Acceptance Tolerances (Distinct from solver numerical convergence thresholds)
const DEFAULT_ACCEPTANCE_TOLERANCE_ABSOLUTE = 0.50; // 0.50 EUR
const DEFAULT_ACCEPTANCE_TOLERANCE_PERCENT = 0.005;  // 0.50%

function isPlainObject(obj) {
    return obj !== null && typeof obj === 'object' && !Array.isArray(obj);
}

function safeDeepMergeRates(target, source) {
    if (!isPlainObject(target)) target = {};
    if (!isPlainObject(source)) return target;

    const result = { ...target };

    for (const key of Object.keys(source)) {
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
            continue;
        }

        const sourceVal = source[key];
        const targetVal = target[key];

        if (isPlainObject(sourceVal) && isPlainObject(targetVal)) {
            result[key] = safeDeepMergeRates(targetVal, sourceVal);
        } else {
            result[key] = sourceVal;
        }
    }

    return result;
}

class CalibrationAcceptanceService {

    /**
     * Executes governed acceptance of a calibration run.
     *
     * @param {string} tenantId - Authenticated tenant ID (from JWT)
     * @param {string} sessionId - Calibration session ID
     * @param {string} runId - Calibration run ID to accept
     * @param {Object} actor - Authenticated user details { id, email, role }
     * @param {Object} [options] - Optional tolerance overrides (for testing/policy)
     * @returns {Promise<Object>} The accepted revision and provenance record
     */
    async acceptCalibrationRun(tenantId, sessionId, runId, actor, options = {}) {
        if (!tenantId || !sessionId || !runId) {
            const err = new Error('MISSING_REQUIRED_ACCEPTANCE_PARAMETERS');
            err.code = 'MISSING_REQUIRED_ACCEPTANCE_PARAMETERS';
            err.statusCode = 400;
            throw err;
        }

        const configuredAbsTolerance = typeof options.absoluteTolerance === 'number'
            ? options.absoluteTolerance
            : DEFAULT_ACCEPTANCE_TOLERANCE_ABSOLUTE;

        const configuredPctTolerance = typeof options.percentTolerance === 'number'
            ? options.percentTolerance
            : DEFAULT_ACCEPTANCE_TOLERANCE_PERCENT;

        // Execute inside single database transaction with lock
        const connection = await db.getPool().getConnection();
        try {
            await connection.beginTransaction();

            // 1. Fetch and lock session (SELECT ... FOR UPDATE)
            const [sessionRows] = await connection.query(
                `SELECT id, tenant_id, printer_node_id, book_spec_json, target_manufacturing_price,
                        currency, status, current_rates_checksum
                 FROM printhouse_pricing_calibration_sessions
                 WHERE id = ? FOR UPDATE`,
                [sessionId]
            );

            if (!sessionRows || sessionRows.length === 0) {
                const err = new Error('CALIBRATION_SESSION_NOT_FOUND');
                err.code = 'CALIBRATION_SESSION_NOT_FOUND';
                err.statusCode = 404;
                throw err;
            }

            const session = sessionRows[0];

            // Tenant Isolation
            if (session.tenant_id !== tenantId) {
                const err = new Error('ACCESS_DENIED_FOREIGN_TENANT_SESSION');
                err.code = 'ACCESS_DENIED_FOREIGN_TENANT_SESSION';
                err.statusCode = 403;
                throw err;
            }

            // Terminal status / state check
            if (session.status === 'ACCEPTED') {
                const err = new Error('CALIBRATION_ALREADY_ACCEPTED');
                err.code = 'CALIBRATION_ALREADY_ACCEPTED';
                err.statusCode = 409;
                throw err;
            }

            if (session.status !== 'CALCULATED') {
                const err = new Error('INVALID_SESSION_STATUS_FOR_ACCEPTANCE');
                err.code = 'INVALID_SESSION_STATUS_FOR_ACCEPTANCE';
                err.statusCode = 409;
                err.details = `Cannot accept session in status ${session.status}. Must be CALCULATED.`;
                throw err;
            }

            // 2. Fetch and lock calibration run (SELECT ... FOR UPDATE)
            const [runRows] = await connection.query(
                `SELECT id, tenant_id, calibration_session_id, printer_node_id,
                        solver_version, status, rate_snapshot_checksum,
                        target_price, proposed_patch_json, proposed_patch_checksum,
                        active_rate_paths_json, warnings_json
                 FROM printhouse_pricing_calibration_runs
                 WHERE id = ? FOR UPDATE`,
                [runId]
            );

            if (!runRows || runRows.length === 0) {
                const err = new Error('CALIBRATION_RUN_NOT_FOUND');
                err.code = 'CALIBRATION_RUN_NOT_FOUND';
                err.statusCode = 404;
                throw err;
            }

            const run = runRows[0];

            // Run validation
            if (run.tenant_id !== tenantId || run.calibration_session_id !== sessionId) {
                const err = new Error('RUN_SESSION_MISMATCH');
                err.code = 'RUN_SESSION_MISMATCH';
                err.statusCode = 403;
                throw err;
            }

            if (!CANONICAL_ACCEPTABLE_RUN_STATUSES.includes(run.status)) {
                const err = new Error('CANNOT_ACCEPT_UNSUCCESSFUL_RUN');
                err.code = 'CANNOT_ACCEPT_UNSUCCESSFUL_RUN';
                err.statusCode = 409;
                err.details = `Run status is ${run.status}. Only acceptance-eligible runs (${CANONICAL_ACCEPTABLE_RUN_STATUSES.join(', ')}) may be accepted.`;
                throw err;
            }

            // 3. Fetch and lock printer node (SELECT ... FOR UPDATE)
            const [nodeRows] = await connection.query(
                `SELECT id, tenant_id, rates_json, signatures, production_lead_days, shipping_days
                 FROM printer_nodes
                 WHERE id = ? FOR UPDATE`,
                [session.printer_node_id]
            );

            if (!nodeRows || nodeRows.length === 0) {
                const err = new Error('PRINTER_NODE_NOT_FOUND');
                err.code = 'PRINTER_NODE_NOT_FOUND';
                err.statusCode = 404;
                throw err;
            }

            const printerNode = nodeRows[0];

            if (printerNode.tenant_id !== tenantId) {
                const err = new Error('ACCESS_DENIED_FOREIGN_PRINTER_NODE');
                err.code = 'ACCESS_DENIED_FOREIGN_PRINTER_NODE';
                err.statusCode = 403;
                throw err;
            }

            // Parse printer node current rates_json
            let currentRates = {};
            if (printerNode.rates_json) {
                currentRates = typeof printerNode.rates_json === 'string'
                    ? JSON.parse(printerNode.rates_json)
                    : printerNode.rates_json;
            }

            // 4. CANONICAL DRIFT CHECK (D5)
            const currentBaselineChecksum = calibrationSessionService.computeRatesChecksum(currentRates || {});
            if (currentBaselineChecksum !== run.rate_snapshot_checksum) {
                const err = new Error('BASELINE_DRIFT_DETECTED');
                err.code = 'BASELINE_DRIFT_DETECTED';
                err.statusCode = 409;
                err.details = 'Active node rates have changed since this calibration run was computed. A new calibration run is required.';
                throw err;
            }

            // 5. PROPOSAL IMMUTABILITY & INTEGRITY CHECK (D6)
            let proposedPatch = {};
            if (run.proposed_patch_json) {
                proposedPatch = typeof run.proposed_patch_json === 'string'
                    ? JSON.parse(run.proposed_patch_json)
                    : run.proposed_patch_json;
            }

            const recomputedPatchChecksum = calibrationSessionService.computeRatesChecksum(proposedPatch || {});
            if (recomputedPatchChecksum !== run.proposed_patch_checksum) {
                const err = new Error('PROPOSED_PATCH_INTEGRITY_FAILURE');
                err.code = 'PROPOSED_PATCH_INTEGRITY_FAILURE';
                err.statusCode = 500;
                throw err;
            }

            // 6. PATCH PATH GOVERNANCE (D7 & RT4)
            // Parse active rate paths and verify no prototype pollution or unauthorized keys
            let activeRatePaths = [];
            if (run.active_rate_paths_json) {
                activeRatePaths = typeof run.active_rate_paths_json === 'string'
                    ? JSON.parse(run.active_rate_paths_json)
                    : run.active_rate_paths_json;
            }

            // Verify every key in proposedPatch maps directly to an activeRatePath
            function extractLeafPaths(obj, prefix = '') {
                const paths = [];
                for (const k of Object.keys(obj || {})) {
                    const full = prefix ? `${prefix}.${k}` : k;
                    if (isPlainObject(obj[k])) {
                        paths.push(...extractLeafPaths(obj[k], full));
                    } else {
                        paths.push(full);
                    }
                }
                return paths;
            }

            const patchLeafPaths = extractLeafPaths(proposedPatch);
            for (const leaf of patchLeafPaths) {
                if (!activeRatePaths.includes(leaf)) {
                    const err = new Error('INACTIVE_RATE_PATH_IN_PROPOSAL');
                    err.code = 'INACTIVE_RATE_PATH_IN_PROPOSAL';
                    err.statusCode = 422;
                    err.details = `Patch path '${leaf}' was not part of the active calibration rate paths.`;
                    throw err;
                }
            }

            // Safe merge resulting rates
            const resultingRates = safeDeepMergeRates(currentRates, proposedPatch);
            const resultingRatesChecksum = calibrationSessionService.computeRatesChecksum(resultingRates);

            // 7. FORWARD BPE VERIFICATION (D9)
            let bookSpec = {};
            if (session.book_spec_json) {
                bookSpec = typeof session.book_spec_json === 'string'
                    ? JSON.parse(session.book_spec_json)
                    : session.book_spec_json;
            }

            const nodeConfig = {
                id: printerNode.id,
                signatures: printerNode.signatures ? JSON.parse(printerNode.signatures) : [16, 24, 32, 8, 4],
                production_lead_days: printerNode.production_lead_days || 7,
                shipping_days: printerNode.shipping_days || 2
            };

            const forwardResult = adapter.evaluateForwardPrice(bookSpec, resultingRates, {}, nodeConfig);
            const verifiedManufacturingPrice = forwardResult.predictedManufacturingPrice;
            const targetManufacturingPrice = Number(session.target_manufacturing_price);

            const absoluteResidual = Number(Math.abs(verifiedManufacturingPrice - targetManufacturingPrice).toFixed(6));
            const percentResidual = Number((absoluteResidual / targetManufacturingPrice).toFixed(6));

            // 8. ACCEPTANCE TOLERANCE POLICY (D10)
            const effectiveTolerance = Number(Math.max(
                configuredAbsTolerance,
                targetManufacturingPrice * configuredPctTolerance
            ).toFixed(4));

            if (absoluteResidual > effectiveTolerance) {
                const err = new Error('CALIBRATION_ACCEPTANCE_TOLERANCE_EXCEEDED');
                err.code = 'CALIBRATION_ACCEPTANCE_TOLERANCE_EXCEEDED';
                err.statusCode = 422;
                err.details = `Verified residual ${absoluteResidual} EUR exceeds effective acceptance tolerance ${effectiveTolerance} EUR.`;
                throw err;
            }

            // 9. ATOMIC DATABASE MUTATIONS (D12)
            const revisionId = `prev-${uuidv4().substring(0, 8)}`;
            const acceptanceId = `pacc-${uuidv4().substring(0, 8)}`;

            const actorJson = {
                id: actor.id || null,
                email: actor.email || null,
                role: actor.role || null,
                timestamp: new Date().toISOString()
            };

            // a. Insert immutable printhouse_pricing_revisions
            await connection.query(
                `INSERT INTO printhouse_pricing_revisions
                 (id, tenant_id, printer_node_id, source_type,
                  source_calibration_session_id, source_calibration_run_id,
                  rates_json, rates_checksum, baseline_rates_checksum, proposed_patch_checksum,
                  engine_package, engine_version, engine_commit, solver_version,
                  created_by_json, created_at)
                 VALUES (?, ?, ?, 'CALIBRATION_ACCEPTANCE', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(6))`,
                [
                    revisionId,
                    tenantId,
                    session.printer_node_id,
                    sessionId,
                    runId,
                    JSON.stringify(resultingRates),
                    resultingRatesChecksum,
                    run.rate_snapshot_checksum,
                    run.proposed_patch_checksum,
                    adapter.enginePackage,
                    adapter.engineVersion,
                    adapter.engineCommit,
                    run.solver_version,
                    JSON.stringify(actorJson)
                ]
            );

            // b. Update printer_nodes.rates_json with complete resulting document
            await connection.query(
                `UPDATE printer_nodes
                 SET rates_json = ?, updated_at = NOW(6)
                 WHERE id = ? AND tenant_id = ?`,
                [JSON.stringify(resultingRates), session.printer_node_id, tenantId]
            );

            // c. Insert printhouse_pricing_calibration_acceptances
            const verificationJson = {
                forwardResult,
                verifiedManufacturingPrice,
                targetManufacturingPrice,
                absoluteResidual,
                percentResidual,
                effectiveTolerance,
                tolerancePolicy: {
                    configuredAbsoluteTolerance: configuredAbsTolerance,
                    configuredPercentTolerance: configuredPctTolerance
                }
            };

            let warnings = [];
            if (run.warnings_json) {
                warnings = typeof run.warnings_json === 'string'
                    ? JSON.parse(run.warnings_json)
                    : run.warnings_json;
            }

            await connection.query(
                `INSERT INTO printhouse_pricing_calibration_acceptances
                 (id, tenant_id, printer_node_id, calibration_session_id, calibration_run_id, pricing_revision_id,
                  baseline_checksum, proposed_patch_checksum, resulting_rates_checksum,
                  target_manufacturing_price, verified_manufacturing_price, absolute_residual, percent_residual,
                  acceptance_tolerance_absolute, acceptance_tolerance_percent, effective_acceptance_tolerance,
                  warnings_json, verification_json, accepted_by_json, accepted_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(6))`,
                [
                    acceptanceId,
                    tenantId,
                    session.printer_node_id,
                    sessionId,
                    runId,
                    revisionId,
                    run.rate_snapshot_checksum,
                    run.proposed_patch_checksum,
                    resultingRatesChecksum,
                    targetManufacturingPrice,
                    verifiedManufacturingPrice,
                    absoluteResidual,
                    percentResidual,
                    configuredAbsTolerance,
                    configuredPctTolerance,
                    effectiveTolerance,
                    JSON.stringify(warnings),
                    JSON.stringify(verificationJson),
                    JSON.stringify(actorJson)
                ]
            );

            // d. Transition session: CALCULATED -> ACCEPTED (Terminal)
            await connection.query(
                `UPDATE printhouse_pricing_calibration_sessions
                 SET status = 'ACCEPTED', updated_at = NOW(6)
                 WHERE id = ? AND tenant_id = ?`,
                [sessionId, tenantId]
            );

            // e. Write audit log event
            await connection.query(
                `INSERT INTO api_audit_logs
                 (id, tenant_id, actor_id, event_type, resource_type, resource_id, payload_json, created_at)
                 VALUES (?, ?, ?, 'CALIBRATION_ACCEPTED', 'pricing_calibration_session', ?, ?, NOW(6))`,
                [
                    `audit-${uuidv4().substring(0, 8)}`,
                    tenantId,
                    actor.id || 'system',
                    sessionId,
                    JSON.stringify({
                        runId,
                        revisionId,
                        acceptanceId,
                        resultingRatesChecksum,
                        verifiedManufacturingPrice,
                        targetManufacturingPrice,
                        absoluteResidual
                    })
                ]
            ).catch(err => {
                logger.warn('Audit log insertion failed (non-fatal):', err.message);
            });

            await connection.commit();

            logger.info('Calibration run accepted successfully', {
                tenantId,
                sessionId,
                runId,
                revisionId,
                resultingRatesChecksum
            });

            return {
                ok: true,
                acceptanceId,
                revisionId,
                sessionId,
                runId,
                printerNodeId: session.printer_node_id,
                status: 'ACCEPTED',
                resultingRatesChecksum,
                verifiedManufacturingPrice,
                targetManufacturingPrice,
                absoluteResidual,
                percentResidual,
                effectiveTolerance,
                acceptedBy: actorJson
            };

        } catch (err) {
            await connection.rollback();
            logger.error('Calibration acceptance failed, transaction rolled back', {
                tenantId,
                sessionId,
                runId,
                error: err.message
            });
            throw err;
        } finally {
            connection.release();
        }
    }

    /**
     * Lists immutable pricing revisions for a tenant / node.
     */
    async listRevisions(tenantId, printerNodeId = null) {
        let sql = `SELECT id, tenant_id, printer_node_id, source_type,
                          source_calibration_session_id, source_calibration_run_id,
                          rates_checksum, baseline_rates_checksum, proposed_patch_checksum,
                          engine_package, engine_version, engine_commit, solver_version,
                          created_by_json, created_at
                   FROM printhouse_pricing_revisions
                   WHERE tenant_id = ?`;
        const params = [tenantId];

        if (printerNodeId) {
            sql += ' AND printer_node_id = ?';
            params.push(printerNodeId);
        }

        sql += ' ORDER BY created_at DESC';

        const rows = await db.query(sql, params);
        return rows.map(r => ({
            id: r.id,
            tenantId: r.tenant_id,
            printerNodeId: r.printer_node_id,
            sourceType: r.source_type,
            sourceCalibrationSessionId: r.source_calibration_session_id,
            sourceCalibrationRunId: r.source_calibration_run_id,
            ratesChecksum: r.rates_checksum,
            baselineRatesChecksum: r.baseline_rates_checksum,
            proposedPatchChecksum: r.proposed_patch_checksum,
            enginePackage: r.engine_package,
            engineVersion: r.engine_version,
            engineCommit: r.engine_commit,
            solverVersion: r.solver_version,
            createdBy: typeof r.created_by_json === 'string' ? JSON.parse(r.created_by_json) : r.created_by_json,
            createdAt: r.created_at
        }));
    }

    /**
     * Gets a single immutable pricing revision by ID.
     */
    async getRevision(tenantId, revisionId) {
        const rows = await db.query(
            `SELECT id, tenant_id, printer_node_id, source_type,
                    source_calibration_session_id, source_calibration_run_id,
                    rates_json, rates_checksum, baseline_rates_checksum, proposed_patch_checksum,
                    engine_package, engine_version, engine_commit, solver_version,
                    created_by_json, created_at
             FROM printhouse_pricing_revisions
             WHERE id = ? AND tenant_id = ?`,
            [revisionId, tenantId]
        );

        if (!rows || rows.length === 0) {
            const err = new Error('PRICING_REVISION_NOT_FOUND');
            err.code = 'PRICING_REVISION_NOT_FOUND';
            err.statusCode = 404;
            throw err;
        }

        const r = rows[0];
        return {
            id: r.id,
            tenantId: r.tenant_id,
            printerNodeId: r.printer_node_id,
            sourceType: r.source_type,
            sourceCalibrationSessionId: r.source_calibration_session_id,
            sourceCalibrationRunId: r.source_calibration_run_id,
            rates: typeof r.rates_json === 'string' ? JSON.parse(r.rates_json) : r.rates_json,
            ratesChecksum: r.rates_checksum,
            baselineRatesChecksum: r.baseline_rates_checksum,
            proposedPatchChecksum: r.proposed_patch_checksum,
            enginePackage: r.engine_package,
            engineVersion: r.engine_version,
            engineCommit: r.engine_commit,
            solverVersion: r.solver_version,
            createdBy: typeof r.created_by_json === 'string' ? JSON.parse(r.created_by_json) : r.created_by_json,
            createdAt: r.created_at
        };
    }
}

module.exports = new CalibrationAcceptanceService();
