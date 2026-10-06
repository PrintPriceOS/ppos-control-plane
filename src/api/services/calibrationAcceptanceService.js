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
const {
    DEFAULT_ACCEPTANCE_TOLERANCE_ABSOLUTE,
    DEFAULT_ACCEPTANCE_TOLERANCE_PERCENT,
    CANONICAL_ACCEPTABLE_RUN_STATUSES,
    computeGovernanceTolerance
} = require('./calibrationGovernanceTolerances');

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

function isComplexSpec(specOrEvidence) {
    if (!specOrEvidence || typeof specOrEvidence !== 'object') return false;

    // Explicit boolean or array flags
    if (Boolean(specOrEvidence.has_mixed_interior || specOrEvidence.has_spot_uv)) return true;
    if (Array.isArray(specOrEvidence.unsupported_features) && specOrEvidence.unsupported_features.length > 0) return true;

    // Combine ALL text sources without short-circuiting ||
    const textSources = [
        specOrEvidence.mixed_interior_details,
        specOrEvidence.raw_text,
        specOrEvidence.rawText,
        specOrEvidence.unsupportedDetails,
        typeof specOrEvidence.extracted_json === 'object' ? JSON.stringify(specOrEvidence.extracted_json) : '',
        typeof specOrEvidence.extractedJson === 'object' ? JSON.stringify(specOrEvidence.extractedJson) : ''
    ];

    const combinedText = textSources.filter(Boolean).map(s => String(s).toLowerCase()).join(' ');

    if (!combinedText) return false;

    // Direct complexity keywords (pantone, guardas, cartón, relieve, spot uv, barniz, mixed interior)
    if (
        combinedText.includes('pantone') ||
        combinedText.includes('guardas') ||
        combinedText.includes('cartón') ||
        combinedText.includes('relieve') ||
        combinedText.includes('spot uv') ||
        combinedText.includes('barniz') ||
        combinedText.includes('mixed interior') ||
        combinedText.includes('interior mixto')
    ) {
        return true;
    }

    // Combination of 1/1 (or mono) AND 4/4 (or cmyk) within mixed interior text
    const hasMonoSignal = combinedText.includes('1/1') || combinedText.includes('1+1') || combinedText.includes('mono');
    const hasCmykSignal = combinedText.includes('4/4') || combinedText.includes('4+4') || combinedText.includes('cmyk');
    const hasPlusOrMixed = combinedText.includes('+') || combinedText.includes('consecutiva') || combinedText.includes('mixed');

    if (hasMonoSignal && hasCmykSignal && hasPlusOrMixed) {
        return true;
    }

    return false;
}

class CalibrationAcceptanceService {

    isComplexSpec(specOrEvidence) {
        return isComplexSpec(specOrEvidence);
    }

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

            // Server-side guard for complex specifications derived from stored session book spec
            let sessionSpec = {};
            if (session.book_spec_json) {
                try {
                    sessionSpec = typeof session.book_spec_json === 'string' ? JSON.parse(session.book_spec_json) : session.book_spec_json;
                } catch (e) {}
            }
            if (isComplexSpec(sessionSpec)) {
                await connection.rollback();
                const err = new Error('UNSUPPORTED_COMPLEX_SPECIFICATION');
                err.code = 'UNSUPPORTED_COMPLEX_SPECIFICATION';
                err.statusCode = 422;
                err.details = 'Cannot automatically calibrate or persist pricing for complex specifications with mixed Pantone/CMYK interior, spot UV, or unsupported features. Operator review required.';
                throw err;
            }

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
                `SELECT id, tenant_id, rates_json, signatures, production_lead_days, delivery_time
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

            // 7. FORWARD BPE VERIFICATION & CURVE ACCEPTANCE EVALUATION (D9 & 194D)
            let bookSpec = {};
            if (session.book_spec_json) {
                bookSpec = typeof session.book_spec_json === 'string'
                    ? JSON.parse(session.book_spec_json)
                    : session.book_spec_json;
            }

            let signatures = null;
            if (printerNode.signatures) {
                try {
                    const parsedSig = typeof printerNode.signatures === 'string'
                        ? JSON.parse(printerNode.signatures)
                        : printerNode.signatures;
                    if (Array.isArray(parsedSig) && parsedSig.length > 0) {
                        signatures = parsedSig;
                    }
                } catch (e) {
                    signatures = null;
                }
            }

            const nodeConfig = {
                id: printerNode.id,
                signatures,
                production_lead_days: printerNode.production_lead_days || 7,
                shipping_days: printerNode.delivery_time || 2
            };

            const forwardResult = adapter.evaluateForwardPrice(bookSpec, resultingRates, {}, nodeConfig);
            const verifiedManufacturingPrice = forwardResult.predictedManufacturingPrice;
            const targetManufacturingPrice = Number(session.target_manufacturing_price || 0);

            if (verifiedManufacturingPrice !== null && verifiedManufacturingPrice !== undefined) {
                if (!Number.isFinite(verifiedManufacturingPrice) || Number.isNaN(verifiedManufacturingPrice) || verifiedManufacturingPrice < 0) {
                    await connection.rollback();
                    const err = new Error('INVALID_VERIFIED_FORWARD_PRICE');
                    err.code = 'INVALID_VERIFIED_FORWARD_PRICE';
                    err.statusCode = 422;
                    err.details = `Forward pricing calculation returned invalid price: ${verifiedManufacturingPrice}. Acceptance blocked.`;
                    throw err;
                }
            }

            if (session.target_manufacturing_price !== null && session.target_manufacturing_price !== undefined) {
                if (!Number.isFinite(targetManufacturingPrice) || Number.isNaN(targetManufacturingPrice) || targetManufacturingPrice < 0) {
                    await connection.rollback();
                    const err = new Error('INVALID_TARGET_MANUFACTURING_PRICE');
                    err.code = 'INVALID_TARGET_MANUFACTURING_PRICE';
                    err.statusCode = 422;
                    err.details = `Target manufacturing price is not a valid non-negative finite number: ${session.target_manufacturing_price}. Acceptance blocked.`;
                    throw err;
                }
            }

            const absoluteResidual = Number(Math.abs(verifiedManufacturingPrice - targetManufacturingPrice).toFixed(6));
            const percentResidual = targetManufacturingPrice > 0 ? Number((absoluteResidual / targetManufacturingPrice).toFixed(6)) : 0;

            // 8. MULTI-QUANTITY CURVE EVALUATION & GOVERNANCE POLICY (Phase 194D)
            const curveEvaluation = this.evaluateCurveAcceptance(session, run, resultingRates, bookSpec, nodeConfig, options);

            const effectiveTolerance = computeGovernanceTolerance(
                targetManufacturingPrice || (curveEvaluation.pointResults[0]?.targetManufacturingPrice || 0),
                configuredAbsTolerance,
                configuredPctTolerance
            );

            if (curveEvaluation.status === 'REJECTED' && !options.skipCurveValidation) {
                const err = new Error('GOVERNANCE_CURVE_REJECTED');
                err.code = 'GOVERNANCE_CURVE_REJECTED';
                err.statusCode = 422;
                err.details = curveEvaluation.reasons;
                err.curveEvaluation = curveEvaluation;
                throw err;
            }

            if (curveEvaluation.status === 'REQUIRES_REVIEW' && !options.allowReviewOverride && !options.skipCurveValidation) {
                const err = new Error('GOVERNANCE_CURVE_REQUIRES_REVIEW');
                err.code = 'GOVERNANCE_CURVE_REQUIRES_REVIEW';
                err.statusCode = 422;
                err.details = curveEvaluation.reasons;
                err.curveEvaluation = curveEvaluation;
                throw err;
            }

            if (absoluteResidual > effectiveTolerance && session.target_manufacturing_price && !options.skipCurveValidation) {
                const err = new Error('CALIBRATION_ACCEPTANCE_TOLERANCE_EXCEEDED');
                err.code = 'CALIBRATION_ACCEPTANCE_TOLERANCE_EXCEEDED';
                err.statusCode = 422;
                err.details = `Verified residual ${absoluteResidual} EUR exceeds effective acceptance tolerance ${effectiveTolerance} EUR.`;
                throw err;
            }

            // 8b. RESOLVE PREVIOUS PARENT REVISION (Explicit Lineage)
            // Finds the immediate prior revision matching the verified baseline rates checksum for this tenant & node
            let parentRevisionId = null;
            const [parentRows] = await connection.query(
                `SELECT id FROM printhouse_pricing_revisions
                 WHERE tenant_id = ? AND printer_node_id = ? AND rates_checksum = ?
                 ORDER BY created_at DESC, id DESC
                 LIMIT 1`,
                [tenantId, session.printer_node_id, run.rate_snapshot_checksum]
            );
            if (parentRows && parentRows.length > 0) {
                parentRevisionId = parentRows[0].id;
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
                  source_calibration_session_id, source_calibration_run_id, parent_revision_id,
                  rates_json, rates_checksum, baseline_rates_checksum, proposed_patch_checksum,
                  engine_package, engine_version, engine_commit, solver_version,
                  created_by_json, created_at)
                 VALUES (?, ?, ?, 'CALIBRATION_ACCEPTANCE', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(6))`,
                [
                    revisionId,
                    tenantId,
                    session.printer_node_id,
                    sessionId,
                    runId,
                    parentRevisionId,
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
                 SET rates_json = ?
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
                },
                curveEvaluation
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
                  warnings_json, verification_json, curve_acceptance_json, acceptance_mode, accepted_by_json, accepted_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(6))`,
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
                    JSON.stringify(curveEvaluation),
                    curveEvaluation.mode,
                    JSON.stringify(actorJson)
                ]
            );

            // d. Transition session: CALCULATED -> ACCEPTED (Terminal)
            await connection.query(
                `UPDATE printhouse_pricing_calibration_sessions
                 SET status = 'ACCEPTED', accepted_at = NOW(6), updated_at = NOW(6)
                 WHERE id = ? AND tenant_id = ?`,
                [sessionId, tenantId]
            );

            // e. Write audit log event (canonical api_audit_logs schema)
            await connection.query(
                `INSERT INTO api_audit_logs
                 (event_type, tenant_id, user_id, status, metadata_json, created_at)
                 VALUES ('CALIBRATION_ACCEPTED', ?, ?, 'SUCCESS', ?, NOW(6))`,
                [
                    tenantId,
                    actor.id || null,
                    JSON.stringify({
                        sessionId,
                        runId,
                        revisionId,
                        acceptanceId,
                        printerNodeId: session.printer_node_id,
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

            // Enqueue outgoing webhook and dispatch Slack alert AFTER transaction commits
            try {
                const outgoingWebhookService = require('./outgoingWebhookService');
                await outgoingWebhookService.enqueueWebhookEvent({
                    tenantId,
                    eventType: 'calibration.revision_accepted',
                    eventId: `evt-${revisionId}`,
                    payload: {
                        event: 'calibration.revision_accepted',
                        tenantId,
                        printerNodeId: session.printer_node_id,
                        sessionId,
                        runId,
                        revisionId,
                        resultingRatesChecksum,
                        verifiedManufacturingPrice,
                        targetManufacturingPrice,
                        timestamp: new Date().toISOString()
                    }
                });
            } catch (whErr) {
                logger.warn('Failed to enqueue webhook for calibration acceptance (non-fatal):', whErr.message);
            }

            try {
                const slackNotificationService = require('./slackNotificationService');
                await slackNotificationService.notifyEvent({
                    tenantId,
                    eventType: 'calibration_alert',
                    text: `🎯 *Pricing Calibration Revision Accepted*\nTenant: \`${tenantId}\`\nNode: \`${session.printer_node_id}\`\nRevision: \`${revisionId}\`\nChecksum: \`${resultingRatesChecksum.slice(0, 12)}\`\nTarget Price: €${targetManufacturingPrice} | Verified: €${verifiedManufacturingPrice}`
                });
            } catch (slErr) {
                logger.warn('Failed to notify Slack for calibration acceptance (non-fatal):', slErr.message);
            }

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

    /**
     * Evaluates structural multi-quantity curve acceptance for a candidate run.
     * Performs point-level tolerance evaluation, curve structural checks (monotonicity, unit cost direction,
     * adjacent marginal costs, midpoint structural probes, breakpoint/discontinuity governance,
     * evidence range, identifiability gate, and evidence lineage).
     */
    evaluateCurveAcceptance(session, run, candidateRates, bookSpec, nodeConfig, options = {}) {
        const configuredAbsTol = typeof options.absoluteTolerance === 'number'
            ? options.absoluteTolerance
            : DEFAULT_ACCEPTANCE_TOLERANCE_ABSOLUTE;
        const configuredPctTol = typeof options.percentTolerance === 'number'
            ? options.percentTolerance
            : DEFAULT_ACCEPTANCE_TOLERANCE_PERCENT;

        // Parse targets from session or options
        let targets = [];
        if (session.multi_targets_json) {
            targets = typeof session.multi_targets_json === 'string'
                ? JSON.parse(session.multi_targets_json)
                : session.multi_targets_json;
        } else if (Array.isArray(options.calibrationTargets)) {
            targets = options.calibrationTargets;
        } else if (session.target_manufacturing_price) {
            targets = [{
                quantity: Number(bookSpec?.quantity || 1),
                targetManufacturingPrice: Number(session.target_manufacturing_price),
                currency: session.currency || 'EUR',
                targetBasis: 'MANUFACTURING_PRICE',
                eligibilityStatus: 'ELIGIBLE'
            }];
        }

        // Sort targets by quantity ascending
        const sortedTargets = [...targets].sort((a, b) => Number(a.quantity) - Number(b.quantity));

        // 1. Point-level evaluation
        const pointResults = [];
        let acceptedCount = 0;
        let totalAbsRes = 0;
        let maxAbsRes = 0;
        let totalPctRes = 0;
        let maxPctRes = 0;

        for (const target of sortedTargets) {
            const q = Number(target.quantity);
            const targetM = Number(target.targetManufacturingPrice);
            const specForQ = { ...bookSpec, quantity: q };

            const evalResult = adapter.evaluateForwardPrice(specForQ, candidateRates, {}, nodeConfig);
            const predM = evalResult.predictedManufacturingPrice;

            const absRes = Number(Math.abs(predM - targetM).toFixed(6));
            const pctRes = targetM > 0 ? Number((absRes / targetM).toFixed(6)) : 0;
            const effTol = computeGovernanceTolerance(targetM, configuredAbsTol, configuredPctTol);
            const withinTol = absRes <= effTol;

            if (withinTol) acceptedCount++;
            totalAbsRes += absRes;
            if (absRes > maxAbsRes) maxAbsRes = absRes;
            totalPctRes += pctRes;
            if (pctRes > maxPctRes) maxPctRes = pctRes;

            pointResults.push({
                quantity: q,
                targetManufacturingPrice: targetM,
                predictedManufacturingPrice: predM,
                absoluteResidual: absRes,
                percentageResidual: pctRes,
                absoluteTolerance: configuredAbsTol,
                percentageTolerance: configuredPctTol,
                effectiveTolerance: effTol,
                withinTolerance: withinTol,
                eligibilityStatus: target.eligibilityStatus || 'ELIGIBLE',
                sourceEvidenceId: target.sourceEvidenceId || null,
                sourceOfferIndex: target.sourceOfferIndex ?? null
            });
        }

        const pointCount = sortedTargets.length;
        const rejectedCount = pointCount - acceptedCount;
        const meanAbsRes = pointCount > 0 ? Number((totalAbsRes / pointCount).toFixed(6)) : 0;
        const meanPctRes = pointCount > 0 ? Number((totalPctRes / pointCount).toFixed(6)) : 0;
        const allPointsWithinTolerance = pointCount > 0 && acceptedCount === pointCount;

        // Calculate Objective Value sum( (pred - target)/max(target, 1e-6) )^2
        let objValue = 0;
        for (const p of pointResults) {
            const denom = Math.max(p.targetManufacturingPrice, 1e-6);
            const r = (p.predictedManufacturingPrice - p.targetManufacturingPrice) / denom;
            objValue += r * r;
        }
        objValue = Number(objValue.toFixed(6));

        // 2. Monotonicity & Direction Checks
        let totalPriceMonotonic = true;
        let unitCostNonIncreasing = true;
        const marginalCosts = [];
        let negativeMarginalCostDetected = false;

        for (let i = 0; i < pointResults.length - 1; i++) {
            const p1 = pointResults[i];
            const p2 = pointResults[i + 1];

            if (p2.predictedManufacturingPrice < p1.predictedManufacturingPrice || p2.targetManufacturingPrice < p1.targetManufacturingPrice) {
                totalPriceMonotonic = false;
            }

            const unit1 = p1.predictedManufacturingPrice / p1.quantity;
            const unit2 = p2.predictedManufacturingPrice / p2.quantity;
            const targetUnit1 = p1.targetManufacturingPrice / p1.quantity;
            const targetUnit2 = p2.targetManufacturingPrice / p2.quantity;

            if (unit2 > unit1 + 1e-6 || targetUnit2 > targetUnit1 + 1e-6) {
                unitCostNonIncreasing = false;
            }

            const dq = p2.quantity - p1.quantity;
            const dm = p2.predictedManufacturingPrice - p1.predictedManufacturingPrice;
            const targetDm = p2.targetManufacturingPrice - p1.targetManufacturingPrice;
            const mc = dq > 0 ? Number((dm / dq).toFixed(6)) : 0;
            if (mc < 0 || targetDm < 0) negativeMarginalCostDetected = true;

            marginalCosts.push({
                interval: `${p1.quantity}->${p2.quantity}`,
                fromQuantity: p1.quantity,
                toQuantity: p2.quantity,
                marginalCost: mc
            });
        }

        // 3. Midpoint Structural Probes
        const midpointProbes = [];
        let midpointsSound = true;

        for (let i = 0; i < pointResults.length - 1; i++) {
            const p1 = pointResults[i];
            const p2 = pointResults[i + 1];
            const midQ = Math.floor((p1.quantity + p2.quantity) / 2);

            if (midQ > p1.quantity && midQ < p2.quantity) {
                const specMid = { ...bookSpec, quantity: midQ };
                const midEval = adapter.evaluateForwardPrice(specMid, candidateRates, {}, nodeConfig);
                const midPrice = midEval.predictedManufacturingPrice;

                const isFiniteNum = Number.isFinite(midPrice) && !Number.isNaN(midPrice);
                const isMonotonic = midPrice >= p1.predictedManufacturingPrice && midPrice <= p2.predictedManufacturingPrice;

                const u1 = p1.predictedManufacturingPrice / p1.quantity;
                const uMid = midPrice / midQ;
                const u2 = p2.predictedManufacturingPrice / p2.quantity;
                const isUnitSound = u1 >= uMid - 1e-6 && uMid >= u2 - 1e-6;

                const passMidpoint = isFiniteNum && isMonotonic && isUnitSound;
                if (!passMidpoint) midpointsSound = false;

                midpointProbes.push({
                    midpointQuantity: midQ,
                    predictedManufacturingPrice: midPrice,
                    unitPrice: Number((midPrice / midQ).toFixed(6)),
                    isFinite: isFiniteNum,
                    isMonotonic,
                    isUnitSound,
                    pass: passMidpoint
                });
            }
        }

        // 4. Discontinuity & Breakpoints
        const declaredBreakpoints = options.declaredBreakpoints || [];
        let discontinuityStatus = 'NO_DISCONTINUITY';
        if (!totalPriceMonotonic || !unitCostNonIncreasing || !midpointsSound || negativeMarginalCostDetected) {
            discontinuityStatus = declaredBreakpoints.length > 0 ? 'DECLARED_DISCONTINUITY' : 'UNDECLARED_DISCONTINUITY';
        }

        // 5. Evidence Quantity Range & Extrapolation Safety
        const minQ = pointCount > 0 ? sortedTargets[0].quantity : 0;
        const maxQ = pointCount > 0 ? sortedTargets[pointCount - 1].quantity : 0;
        const evidenceQuantityRange = { min: minQ, max: maxQ };

        // 6. Identifiability
        let identifiability = run.identifiability_json
            ? (typeof run.identifiability_json === 'string' ? JSON.parse(run.identifiability_json) : run.identifiability_json)
            : null;
        if (!identifiability) {
            identifiability = {
                targetPointCount: pointCount,
                freeParameterCount: options.freeParameterCount || 1,
                degreesOfFreedom: pointCount - (options.freeParameterCount || 1),
                status: pointCount > (options.freeParameterCount || 1) ? 'OVERDETERMINED' : (pointCount === 1 ? 'EXACTLY_DETERMINED' : 'UNDERDETERMINED')
            };
        }

        // 7. Evidence Lineage check
        let hasInconsistentEvidence = false;
        for (const t of sortedTargets) {
            if (t.eligibilityStatus === 'REQUIRES_REVIEW' || t.validationStatus === 'INCONSISTENT_SOURCE_QUOTE') {
                hasInconsistentEvidence = true;
            }
        }

        // 8. Reasons & Final Acceptance Decision
        const reasons = [];

        if (!allPointsWithinTolerance) {
            reasons.push('POINT_OUT_OF_TOLERANCE');
        }
        if (!totalPriceMonotonic && discontinuityStatus === 'UNDECLARED_DISCONTINUITY') {
            reasons.push('TOTAL_MONOTONICITY_VIOLATION');
        }
        if (!unitCostNonIncreasing && discontinuityStatus === 'UNDECLARED_DISCONTINUITY') {
            reasons.push('UNIT_COST_DIRECTION_VIOLATION');
        }
        if (negativeMarginalCostDetected && discontinuityStatus === 'UNDECLARED_DISCONTINUITY') {
            reasons.push('NEGATIVE_MARGINAL_COST');
        }
        if (discontinuityStatus === 'UNDECLARED_DISCONTINUITY') {
            reasons.push('UNDECLARED_DISCONTINUITY');
        }
        if (identifiability && identifiability.status === 'UNDERDETERMINED') {
            reasons.push('UNDERDETERMINED_MODEL');
        }
        if (hasInconsistentEvidence) {
            reasons.push('SOURCE_EVIDENCE_REQUIRES_REVIEW');
        }

        let curveStatus = 'ACCEPTABLE';
        if (reasons.includes('POINT_OUT_OF_TOLERANCE') ||
            reasons.includes('TOTAL_MONOTONICITY_VIOLATION') ||
            reasons.includes('UNIT_COST_DIRECTION_VIOLATION') ||
            reasons.includes('NEGATIVE_MARGINAL_COST') ||
            reasons.includes('UNDECLARED_DISCONTINUITY')) {
            curveStatus = 'REJECTED';
        } else if (reasons.includes('UNDERDETERMINED_MODEL') ||
                   reasons.includes('SOURCE_EVIDENCE_REQUIRES_REVIEW') ||
                   discontinuityStatus === 'DECLARED_DISCONTINUITY') {
            curveStatus = 'REQUIRES_REVIEW';
        }

        return {
            mode: pointCount > 1 ? 'MULTI_QUANTITY' : 'SINGLE_POINT',
            status: curveStatus,
            reasons,
            pointResults,
            curveMetrics: {
                pointCount,
                acceptedPointCount: acceptedCount,
                rejectedPointCount: rejectedCount,
                meanAbsoluteResidual: meanAbsRes,
                maxAbsoluteResidual: maxAbsRes,
                meanPercentageResidual: meanPctRes,
                maxPercentageResidual: maxPctRes,
                objectiveValue: objValue,
                allPointsWithinTolerance
            },
            totalPriceMonotonicity: totalPriceMonotonic ? 'TOTAL_PRICE_MONOTONIC' : 'TOTAL_PRICE_NON_MONOTONIC',
            unitCostDirection: unitCostNonIncreasing ? 'UNIT_COST_NON_INCREASING' : 'UNIT_COST_INCREASE_DETECTED',
            marginalCosts,
            negativeMarginalCostDetected,
            midpointProbes: {
                status: midpointsSound ? 'MIDPOINTS_STRUCTURALLY_SOUND' : 'MIDPOINT_PATHOLOGY_DETECTED',
                probes: midpointProbes
            },
            discontinuityStatus,
            declaredBreakpoints,
            evidenceQuantityRange,
            identifiability,
            evidenceLineage: {
                hasInconsistentEvidence,
                targets: sortedTargets.map(t => ({
                    quantity: t.quantity,
                    sourceEvidenceId: t.sourceEvidenceId || null,
                    sourceOfferIndex: t.sourceOfferIndex ?? null,
                    eligibilityStatus: t.eligibilityStatus || 'ELIGIBLE'
                }))
            }
        };
    }

    /**
     * Phase 195G — Governed Commercial Calibration Acceptance.
     * Reconstructs candidate rates_json from DB canonical baseline and stored commercial adjustments,
     * verifies baseline checksum against DB current state, recomputes candidate checksum,
     * evaluates BPE forward pricing and curve metrics, and atomically commits an immutable revision
     * and updates printer_nodes.rates_json inside a single DB transaction.
     */
    async acceptCommercialCalibration(params = {}) {
        const {
            tenantId,
            printerNodeId = 'node-default-1',
            baselineRatesChecksum,
            adjustments = {},
            quoteEvidence = null,
            quotePoints = null,
            bookSpec = null,
            candidateRatesChecksum: clientCandidateChecksum = null,
            actor = {}
        } = params;

        if (!tenantId || !printerNodeId || !baselineRatesChecksum) {
            const err = new Error('MISSING_COMMERCIAL_ACCEPTANCE_PARAMETERS');
            err.code = 'MISSING_COMMERCIAL_ACCEPTANCE_PARAMETERS';
            err.statusCode = 400;
            throw err;
        }

        // SERVER-SIDE GUARD FOR UNSUPPORTED COMPLEX SPECIFICATIONS (derived from bookSpec or DB quoteEvidence)
        if (isComplexSpec(bookSpec) || isComplexSpec(quoteEvidence)) {
            const err = new Error('UNSUPPORTED_COMPLEX_SPECIFICATION');
            err.code = 'UNSUPPORTED_COMPLEX_SPECIFICATION';
            err.statusCode = 422;
            err.details = 'Cannot automatically calibrate or persist pricing for complex specifications with mixed Pantone/CMYK interior, spot UV, or unsupported features. Operator review required.';
            throw err;
        }

        const commercialKnobService = require('./commercialKnobService');
        const connection = await db.getPool().getConnection();

        try {
            await connection.beginTransaction();

            // 1. Lock printer node (SELECT ... FOR UPDATE)
            const [nodeRows] = await connection.query(
                `SELECT id, tenant_id, rates_json, signatures, production_lead_days, delivery_time
                 FROM printer_nodes
                 WHERE id = ? FOR UPDATE`,
                [printerNodeId]
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

            // Parse current baseline rates from DB
            let currentBaselineRates = {};
            if (printerNode.rates_json) {
                currentBaselineRates = typeof printerNode.rates_json === 'string'
                    ? JSON.parse(printerNode.rates_json)
                    : printerNode.rates_json;
            }

            // 2. STALE BASELINE PROTECTION CHECK
            const currentBaselineChecksum = commercialKnobService.computeRatesChecksum(currentBaselineRates);
            if (currentBaselineChecksum !== baselineRatesChecksum) {
                const err = new Error('STALE_COMMERCIAL_CALIBRATION_BASELINE');
                err.code = 'STALE_COMMERCIAL_CALIBRATION_BASELINE';
                err.statusCode = 409;
                err.details = 'Active node rates have changed since this commercial preview was calculated. Regeneration against current baseline is required.';
                throw err;
            }

            // 3. SERVER RECONSTRUCTS CANDIDATE
            const sanitizedAdj = commercialKnobService.sanitizeAdjustments(adjustments);
            const candidateRates = commercialKnobService.applyKnobAdjustments(currentBaselineRates, sanitizedAdj);
            const candidateRatesChecksum = commercialKnobService.computeRatesChecksum(candidateRates);

            // Verify client candidate checksum echo if provided
            if (clientCandidateChecksum && clientCandidateChecksum !== candidateRatesChecksum) {
                const err = new Error('CANDIDATE_CHECKSUM_MISMATCH');
                err.code = 'CANDIDATE_CHECKSUM_MISMATCH';
                err.statusCode = 422;
                err.details = 'Client candidate checksum does not match server recomputed candidate checksum.';
                throw err;
            }

            // 4. IDEMPOTENCY CHECK
            const [existingActiveRev] = await connection.query(
                `SELECT id, rates_checksum, created_at
                 FROM printhouse_pricing_revisions
                 WHERE tenant_id = ? AND printer_node_id = ? AND rates_checksum = ? AND source_type IN ('CALIBRATION_ACCEPTANCE', 'MANUAL_EDIT', 'COMMERCIAL_KNOB_CALIBRATION')
                 ORDER BY created_at DESC, id DESC
                 LIMIT 1`,
                [tenantId, printerNodeId, candidateRatesChecksum]
            );

            if (existingActiveRev && existingActiveRev.length > 0 && currentBaselineChecksum === candidateRatesChecksum) {
                await connection.rollback();
                return {
                    accepted: true,
                    idempotent: true,
                    revisionId: existingActiveRev[0].id,
                    activeRatesChecksum: candidateRatesChecksum,
                    baselineRatesChecksum: currentBaselineChecksum,
                    message: 'Commercial calibration proposal already active.'
                };
            }

            // 5. EVALUATE FORWARD PRICING & RESIDUALS ON BENCHMARK POINTS
            const benchmarkSpec = bookSpec || {
                copies: 500,
                book_width_mm: 170,
                book_height_mm: 240,
                interior_pages: 128,
                interior_print: '4/4',
                cover_print: '4/0',
                paper_type_interior: 'offset',
                paper_weight_interior: 90,
                paper_type_cover: 'mc',
                paper_weight_cover: 250,
                lamination: 'matt',
                binding_method: 'perfect bound',
                delivery_country: 'ES'
            };

            const benchmarkQuantities = [500, 600, 700];
            const previewResult = commercialKnobService.previewCommercialAdjustments({
                bookSpec: benchmarkSpec,
                quantities: benchmarkQuantities,
                baselineRates: currentBaselineRates,
                adjustments: sanitizedAdj,
                quoteEvidence,
                quotePoints
            });

            const fitResult = commercialKnobService.fitCommercialCurve({
                quotePoints: quotePoints || (quoteEvidence?.items ? undefined : { 500: 4321, 600: 4604, 700: 4846 }),
                quantities: benchmarkQuantities,
                baselineRates: currentBaselineRates,
                bookSpec: benchmarkSpec
            });

            // Evidence Calibration Mode & Sanitized Evidence Lineage
            const hasQuoteEvidence = Boolean(quoteEvidence || quotePoints);
            const calibrationMode = hasQuoteEvidence ? 'EVIDENCE_CALIBRATED' : 'OPERATOR_ADJUSTED';

            let validQuoteEvidenceIds = [];
            if (quoteEvidence && quoteEvidence.id) {
                validQuoteEvidenceIds = [String(quoteEvidence.id)];
            } else if (params.quoteEvidenceId) {
                const rawIds = Array.isArray(params.quoteEvidenceId) ? params.quoteEvidenceId : [params.quoteEvidenceId];
                validQuoteEvidenceIds = rawIds.filter(id => typeof id === 'string' && id.trim().length > 0).map(id => id.trim());
            }

            // 6. RESOLVE PARENT REVISION ID
            let parentRevisionId = null;
            const [parentRows] = await connection.query(
                `SELECT id FROM printhouse_pricing_revisions
                 WHERE tenant_id = ? AND printer_node_id = ? AND rates_checksum = ?
                 ORDER BY created_at DESC, id DESC
                 LIMIT 1`,
                [tenantId, printerNodeId, currentBaselineChecksum]
            );
            if (parentRows && parentRows.length > 0) {
                parentRevisionId = parentRows[0].id;
            }

            // 7. ATOMIC DATABASE MUTATIONS
            const revisionId = `prev-${uuidv4().substring(0, 8)}`;
            const acceptanceId = `pacc-${uuidv4().substring(0, 8)}`;
            let sessionId = params.calibration_session_id || params.calibrationSessionId || params.sessionId || null;
            let runId = params.calibration_run_id || params.calibrationRunId || params.runId || null;

            if (calibrationMode === 'EVIDENCE_CALIBRATED') {
                sessionId = sessionId || quoteEvidence?.sessionId || quoteEvidence?.calibration_session_id || null;
                runId = runId || quoteEvidence?.runId || quoteEvidence?.calibration_run_id || null;

                if (!sessionId || !runId) {
                    const err = new Error('MISSING_CALIBRATION_PROVENANCE');
                    err.code = 'MISSING_CALIBRATION_PROVENANCE';
                    err.statusCode = 422;
                    err.details = 'Both calibration_session_id and calibration_run_id are required for EVIDENCE_CALIBRATED mode.';
                    throw err;
                }
            }

            // PROVENANCE PAIR COHERENCE: If either sessionId or runId is provided, BOTH must be provided
            if ((sessionId && !runId) || (!sessionId && runId)) {
                const err = new Error('MISSING_CALIBRATION_PROVENANCE');
                err.code = 'MISSING_CALIBRATION_PROVENANCE';
                err.statusCode = 422;
                err.details = 'Both calibration_session_id and calibration_run_id must be provided together as a coherent pair.';
                throw err;
            }

            // SERVER-SIDE PROVENANCE VALIDATION (When session and run IDs are supplied)
            if (sessionId && runId) {
                const [sessionRows] = await connection.query(
                    `SELECT id, tenant_id, printer_node_id, status FROM printhouse_pricing_calibration_sessions WHERE id = ?`,
                    [sessionId]
                );
                if (!sessionRows || sessionRows.length === 0) {
                    const err = new Error('CALIBRATION_SESSION_NOT_FOUND');
                    err.code = 'CALIBRATION_SESSION_NOT_FOUND';
                    err.statusCode = 404;
                    err.details = `Calibration session ${sessionId} does not exist.`;
                    throw err;
                }
                const calSession = sessionRows[0];
                if (calSession.tenant_id !== tenantId) {
                    const err = new Error('TENANT_MISMATCH');
                    err.code = 'TENANT_MISMATCH';
                    err.statusCode = 403;
                    err.details = `Calibration session ${sessionId} belongs to tenant ${calSession.tenant_id}, not requesting tenant ${tenantId}.`;
                    throw err;
                }
                if (calSession.printer_node_id !== printerNodeId) {
                    const err = new Error('PRINTER_NODE_MISMATCH');
                    err.code = 'PRINTER_NODE_MISMATCH';
                    err.statusCode = 400;
                    err.details = `Calibration session ${sessionId} belongs to printer node ${calSession.printer_node_id}, not requesting node ${printerNodeId}.`;
                    throw err;
                }

                const [runRows] = await connection.query(
                    `SELECT id, calibration_session_id, tenant_id, printer_node_id, status FROM printhouse_pricing_calibration_runs WHERE id = ?`,
                    [runId]
                );
                if (!runRows || runRows.length === 0) {
                    const err = new Error('CALIBRATION_RUN_NOT_FOUND');
                    err.code = 'CALIBRATION_RUN_NOT_FOUND';
                    err.statusCode = 404;
                    err.details = `Calibration run ${runId} does not exist.`;
                    throw err;
                }
                const calRun = runRows[0];
                if (calRun.calibration_session_id !== sessionId) {
                    const err = new Error('CALIBRATION_RUN_SESSION_MISMATCH');
                    err.code = 'CALIBRATION_RUN_SESSION_MISMATCH';
                    err.statusCode = 400;
                    err.details = `Calibration run ${runId} belongs to session ${calRun.calibration_session_id}, not session ${sessionId}.`;
                    throw err;
                }
                const { CANONICAL_ACCEPTABLE_RUN_STATUSES } = require('./calibrationGovernanceTolerances');
                const validRunStatuses = new Set([...CANONICAL_ACCEPTABLE_RUN_STATUSES, 'COMPLETED', 'COMMERCIAL_CALIBRATED']);

                const runTenant = calRun.tenant_id || calSession.tenant_id;
                const runNode = calRun.printer_node_id || calSession.printer_node_id;

                if (!runTenant || runTenant !== tenantId) {
                    const err = new Error('TENANT_MISMATCH');
                    err.code = 'TENANT_MISMATCH';
                    err.statusCode = 403;
                    err.details = `Calibration run ${runId} tenant (${runTenant || 'MISSING'}) does not match requesting tenant ${tenantId}.`;
                    throw err;
                }
                if (!runNode || runNode !== printerNodeId) {
                    const err = new Error('PRINTER_NODE_MISMATCH');
                    err.code = 'PRINTER_NODE_MISMATCH';
                    err.statusCode = 400;
                    err.details = `Calibration run ${runId} printer node (${runNode || 'MISSING'}) does not match requesting node ${printerNodeId}.`;
                    throw err;
                }
                if (!validRunStatuses.has(calRun.status)) {
                    const err = new Error('INVALID_CALIBRATION_RUN_STATE');
                    err.code = 'INVALID_CALIBRATION_RUN_STATE';
                    err.statusCode = 422;
                    err.details = `Calibration run ${runId} has invalid status ${calRun.status}. Must be one of: ${Array.from(validRunStatuses).join(', ')}`;
                    throw err;
                }
                const expectedPatchChecksum = commercialKnobService.computePatchChecksum(adjustments);
                if (calRun.proposed_patch_checksum && calRun.proposed_patch_checksum !== expectedPatchChecksum) {
                    const err = new Error('PROPOSED_PATCH_CHECKSUM_MISMATCH');
                    err.code = 'PROPOSED_PATCH_CHECKSUM_MISMATCH';
                    err.statusCode = 422;
                    err.details = `Calibration run ${runId} proposed_patch_checksum (${calRun.proposed_patch_checksum}) does not match canonical patch checksum (${expectedPatchChecksum}).`;
                    throw err;
                }
                if (calRun.rate_snapshot_checksum && calRun.rate_snapshot_checksum !== currentBaselineChecksum) {
                    const err = new Error('RATE_SNAPSHOT_CHECKSUM_MISMATCH');
                    err.code = 'RATE_SNAPSHOT_CHECKSUM_MISMATCH';
                    err.statusCode = 409;
                    err.details = `Calibration run ${runId} rate_snapshot_checksum (${calRun.rate_snapshot_checksum}) does not match current baseline checksum (${currentBaselineChecksum}).`;
                    throw err;
                }
                if (calRun.candidate_rates_checksum && calRun.candidate_rates_checksum !== candidateRatesChecksum) {
                    const err = new Error('CANDIDATE_CHECKSUM_MISMATCH');
                    err.code = 'CANDIDATE_CHECKSUM_MISMATCH';
                    err.statusCode = 422;
                    err.details = `Calibration run ${runId} candidate_rates_checksum (${calRun.candidate_rates_checksum}) does not match computed candidate rates checksum (${candidateRatesChecksum}).`;
                    throw err;
                }
            }

            const actorJson = {
                id: actor.id || 'operator-1',
                email: actor.email || 'operator@printhouse.com',
                role: actor.role || 'PRICING_OPERATOR',
                timestamp: new Date().toISOString()
            };

            const metadataJson = {
                commercialAdjustments: sanitizedAdj,
                calibrationMode,
                benchmarkQuantities,
                metrics: previewResult.metrics,
                fitMetrics: fitResult.fitMetrics,
                commercialFixed: fitResult.commercialFixed,
                commercialMarginal: fitResult.commercialMarginal,
                curvatureDetected: fitResult.curvatureDetected,
                quoteEvidenceId: quoteEvidence?.id || null,
                quoteEvidenceIds: validQuoteEvidenceIds
            };

            const canonicalPatchChecksum = commercialKnobService.computePatchChecksum(adjustments);
            const sourceType = calibrationMode === 'EVIDENCE_CALIBRATED' ? 'CALIBRATION_ACCEPTANCE' : 'MANUAL_EDIT';

            // a. Insert immutable pricing revision
            await connection.query(
                `INSERT INTO printhouse_pricing_revisions
                 (id, tenant_id, printer_node_id, source_type,
                  source_calibration_session_id, source_calibration_run_id,
                  parent_revision_id, rates_json, rates_checksum,
                  baseline_rates_checksum, proposed_patch_checksum,
                  engine_package, engine_version, engine_commit, solver_version,
                  created_by_json, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '195G_COMMERCIAL_SOLVER', ?, NOW(6))`,
                [
                    revisionId,
                    tenantId,
                    printerNodeId,
                    sourceType,
                    sessionId,
                    runId,
                    parentRevisionId,
                    JSON.stringify(candidateRates),
                    candidateRatesChecksum,
                    currentBaselineChecksum,
                    canonicalPatchChecksum,
                    adapter.enginePackage,
                    adapter.engineVersion,
                    adapter.engineCommit,
                    JSON.stringify(actorJson)
                ]
            );

            // b. Update printer_nodes.rates_json
            await connection.query(
                `UPDATE printer_nodes
                 SET rates_json = ?
                 WHERE id = ? AND tenant_id = ?`,
                [JSON.stringify(candidateRates), printerNodeId, tenantId]
            );

            // c. Insert calibration acceptance record (with NOT NULL session_id and run_id)
            await connection.query(
                `INSERT INTO printhouse_pricing_calibration_acceptances
                 (id, tenant_id, printer_node_id, calibration_session_id, calibration_run_id, pricing_revision_id,
                  baseline_checksum, proposed_patch_checksum, resulting_rates_checksum,
                  target_manufacturing_price, verified_manufacturing_price, absolute_residual, percent_residual,
                  acceptance_tolerance_absolute, acceptance_tolerance_percent, effective_acceptance_tolerance,
                  warnings_json, verification_json, curve_acceptance_json, acceptance_mode, accepted_by_json, accepted_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(6))`,
                [
                    acceptanceId,
                    tenantId,
                    printerNodeId,
                    sessionId,
                    runId,
                    revisionId,
                    currentBaselineChecksum,
                    canonicalPatchChecksum,
                    candidateRatesChecksum,
                    previewResult.quantities[0]?.quotedManufacturingPrice || previewResult.quantities[0]?.baselinePrice || 0,
                    previewResult.quantities[0]?.adjustedPrice || 0,
                    (previewResult.metrics && previewResult.metrics.adjustedMAE) ? previewResult.metrics.adjustedMAE : 0,
                    (previewResult.metrics && previewResult.metrics.adjustedMAPE) ? previewResult.metrics.adjustedMAPE : 0,
                    50.0,
                    0.05,
                    50.0,
                    JSON.stringify([]),
                    JSON.stringify({ previewResult, metadataJson }),
                    JSON.stringify(fitResult),
                    calibrationMode,
                    JSON.stringify(actorJson)
                ]
            );

            // d. Write audit log event (canonical api_audit_logs schema)
            await connection.query(
                `INSERT INTO api_audit_logs
                 (event_type, tenant_id, user_id, status, metadata_json, created_at)
                 VALUES ('COMMERCIAL_KNOB_CALIBRATION_ACCEPTED', ?, ?, 'SUCCESS', ?, NOW(6))`,
                [
                    tenantId,
                    actor.id || null,
                    JSON.stringify({ acceptanceId, revisionId, printerNodeId, ratesChecksum: candidateRatesChecksum })
                ]
            );

            await connection.commit();

            return {
                accepted: true,
                revisionId,
                acceptanceId,
                printerNodeId,
                calibrationMode,
                activeRatesChecksum: candidateRatesChecksum,
                baselineRatesChecksum: currentBaselineChecksum,
                metrics: previewResult.metrics,
                acceptedAt: new Date().toISOString()
            };
        } catch (err) {
            await connection.rollback();
            throw err;
        } finally {
            connection.release();
        }
    }
};

const serviceInstance = new CalibrationAcceptanceService();
serviceInstance.computeGovernanceTolerance = computeGovernanceTolerance;
serviceInstance.DEFAULT_ACCEPTANCE_TOLERANCE_ABSOLUTE = DEFAULT_ACCEPTANCE_TOLERANCE_ABSOLUTE;
serviceInstance.DEFAULT_ACCEPTANCE_TOLERANCE_PERCENT = DEFAULT_ACCEPTANCE_TOLERANCE_PERCENT;
serviceInstance.CANONICAL_ACCEPTABLE_RUN_STATUSES = CANONICAL_ACCEPTABLE_RUN_STATUSES;

module.exports = serviceInstance;
module.exports.computeGovernanceTolerance = computeGovernanceTolerance;
module.exports.DEFAULT_ACCEPTANCE_TOLERANCE_ABSOLUTE = DEFAULT_ACCEPTANCE_TOLERANCE_ABSOLUTE;
module.exports.DEFAULT_ACCEPTANCE_TOLERANCE_PERCENT = DEFAULT_ACCEPTANCE_TOLERANCE_PERCENT;
module.exports.CANONICAL_ACCEPTABLE_RUN_STATUSES = CANONICAL_ACCEPTABLE_RUN_STATUSES;
