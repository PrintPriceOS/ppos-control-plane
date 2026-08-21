/**
 * src/api/services/calibrationRunService.js
 *
 * Phase 193C — Calibration Run Persistence & Lifecycle Service.
 *
 * Responsibilities:
 * 1. Enforces that session is in READY status before calculation.
 * 2. Invokes DeterministicInversePricingSolver entirely in memory.
 * 3. Persists calibration run records with complete provenance into
 *    printhouse_pricing_calibration_runs.
 * 4. Provides tenant-isolated listing and retrieval of solver runs.
 * 5. Does NOT mutate printer_nodes.rates_json or calibration session input.
 */
const { v4: uuidv4 } = require('uuid');
const db = require('./mysqlClient');
const calibrationSessionService = require('./calibrationSessionService');
const solver = require('./deterministicInversePricingSolver');
const logger = require('./logger').child('calibration-runs');
const { CANONICAL_ACCEPTABLE_RUN_STATUSES, ALL_CANONICAL_PERSISTED_RUN_STATUSES } = require('./calibrationGovernanceTolerances');

class CalibrationRunService {

    /**
     * Executes a deterministic calibration run on a READY session.
     */
    async executeRun(tenantId, sessionId, user, clientConfig = {}) {
        // 1. Fetch and validate session state
        const session = await calibrationSessionService.getSession(tenantId, sessionId);

        if (session.status !== 'READY') {
            const err = new Error('SESSION_NOT_READY_FOR_CALCULATION');
            err.code = 'SESSION_NOT_READY_FOR_CALCULATION';
            err.statusCode = 409;
            err.details = `Cannot calculate session in ${session.status} status. Only READY sessions can be calibrated.`;
            throw err;
        }

        // 2. Compute input and snapshot checksums for immutable provenance
        const sessionChecksum = calibrationSessionService.computeRatesChecksum(session.bookSpec);
        const snapshotChecksum = session.currentRatesChecksum || calibrationSessionService.computeRatesChecksum(session.currentRatesSnapshot || {});

        // 3. Execute pure in-memory deterministic solver
        const solverResult = solver.solve(session);

        // Application-side defense: Ensure solver output status is within canonical DB domain
        if (!solverResult || !ALL_CANONICAL_PERSISTED_RUN_STATUSES.includes(solverResult.status)) {
            const statusErr = new Error('INVALID_SOLVER_RUN_STATUS');
            statusErr.code = 'INVALID_SOLVER_RUN_STATUS';
            statusErr.statusCode = 500;
            statusErr.details = `Solver returned unknown or unpersisted status: ${solverResult?.status}`;
            throw statusErr;
        }

        // 4. Create and persist run record
        const runId = `crun-${uuidv4().substring(0, 8)}`;
        const actorJson = {
            id: user.id || null,
            email: user.email || null,
            role: user.role || null,
            timestamp: new Date().toISOString()
        };

        const isAcceptableStatus = CANONICAL_ACCEPTABLE_RUN_STATUSES.includes(solverResult.status);

        const connection = await db.getPool().getConnection();
        try {
            await connection.beginTransaction();

            await connection.query(
                `INSERT INTO printhouse_pricing_calibration_runs
                (id, tenant_id, calibration_session_id, printer_node_id,
                 solver_version, solver_config_json, status,
                 session_input_checksum, rate_snapshot_checksum,
                 evaluations_count, execution_duration_ms,
                 engine_price_before, engine_price_after, target_price,
                 absolute_residual, percent_residual,
                 active_rate_paths_json, proposed_patch_json, proposed_patch_checksum, candidate_parameters_json,
                 identifiability_report_json, warnings_json, created_by_json, completed_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(6))`,
                [
                    runId,
                    tenantId,
                    sessionId,
                    session.printerNodeId,
                    solverResult.solverVersion,
                    JSON.stringify(solverResult.solverConfig),
                    solverResult.status,
                    sessionChecksum,
                    snapshotChecksum,
                    solverResult.evaluationsCount,
                    solverResult.executionDurationMs,
                    solverResult.enginePriceBefore,
                    solverResult.enginePriceAfter,
                    solverResult.targetPrice,
                    solverResult.absoluteResidual,
                    solverResult.percentResidual,
                    JSON.stringify(solverResult.activeRatePaths),
                    JSON.stringify(solverResult.proposedPatch),
                    solverResult.proposedPatchChecksum,
                    JSON.stringify(solverResult.candidateParameters),
                    JSON.stringify(solverResult.identifiabilityReport),
                    JSON.stringify(solverResult.warnings),
                    JSON.stringify(actorJson)
                ]
            );

            // 5. If solver succeeded and is acceptance-eligible, transition session READY -> CALCULATED
            if (isAcceptableStatus) {
                const [updateResult] = await connection.query(
                    `UPDATE printhouse_pricing_calibration_sessions
                     SET status = 'CALCULATED', updated_at = NOW(6)
                     WHERE id = ? AND tenant_id = ? AND status = 'READY'`,
                    [sessionId, tenantId]
                );

                if (!updateResult || updateResult.affectedRows !== 1) {
                    const conflictErr = new Error('SESSION_STATE_TRANSITION_CONFLICT');
                    conflictErr.code = 'SESSION_STATE_TRANSITION_CONFLICT';
                    conflictErr.statusCode = 409;
                    conflictErr.details = `Could not promote session ${sessionId} from READY to CALCULATED. Concurrent state change or invalid session state.`;
                    throw conflictErr;
                }
            }

            await connection.commit();
        } catch (err) {
            await connection.rollback();
            throw err;
        } finally {
            connection.release();
        }

        logger.info({
            event: 'calibration_run_completed',
            runId,
            sessionId,
            tenantId,
            status: solverResult.status,
            absoluteResidual: solverResult.absoluteResidual,
            sessionStatusTransition: isAcceptableStatus ? 'CALCULATED' : 'REMAINED_READY'
        });

        return this.getRun(tenantId, sessionId, runId);
    }

    /**
     * Retrieves a single calibration run. Tenant & session scoped.
     */
    async getRun(tenantId, sessionId, runId) {
        const rows = await db.query(
            `SELECT * FROM printhouse_pricing_calibration_runs
             WHERE id = ? AND calibration_session_id = ? AND tenant_id = ?`,
            [runId, sessionId, tenantId]
        );

        if (rows.length === 0) {
            const err = new Error('CALIBRATION_RUN_NOT_FOUND');
            err.code = 'CALIBRATION_RUN_NOT_FOUND';
            err.statusCode = 404;
            throw err;
        }

        return this._deserializeRun(rows[0]);
    }

    /**
     * Lists all historical calibration runs for a session.
     */
    async listRuns(tenantId, sessionId) {
        // Verify session belongs to tenant
        await calibrationSessionService.getSession(tenantId, sessionId);

        const rows = await db.query(
            `SELECT * FROM printhouse_pricing_calibration_runs
             WHERE calibration_session_id = ? AND tenant_id = ?
             ORDER BY started_at DESC`,
            [sessionId, tenantId]
        );

        return rows.map(r => this._deserializeRun(r));
    }

    _deserializeRun(row) {
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
            calibrationSessionId: row.calibration_session_id,
            printerNodeId: row.printer_node_id,
            solverVersion: row.solver_version,
            solverConfig: parseJson(row.solver_config_json),
            status: row.status,
            sessionInputChecksum: row.session_input_checksum,
            rateSnapshotChecksum: row.rate_snapshot_checksum,
            evaluationsCount: row.evaluations_count,
            executionDurationMs: row.execution_duration_ms,
            enginePriceBefore: parseFloat(row.engine_price_before),
            enginePriceAfter: parseFloat(row.engine_price_after),
            targetPrice: parseFloat(row.target_price),
            absoluteResidual: parseFloat(row.absolute_residual),
            percentResidual: parseFloat(row.percent_residual),
            activeRatePaths: parseJson(row.active_rate_paths_json),
            proposedPatch: parseJson(row.proposed_patch_json),
            candidateParameters: parseJson(row.candidate_parameters_json),
            identifiabilityReport: parseJson(row.identifiability_report_json),
            warnings: parseJson(row.warnings_json) || [],
            error: parseJson(row.error_json),
            createdBy: parseJson(row.created_by_json),
            startedAt: row.started_at,
            completedAt: row.completed_at
        };
    }
}

module.exports = new CalibrationRunService();
