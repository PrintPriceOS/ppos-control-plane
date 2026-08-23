const db = require('./mysqlClient');

const MAX_REVISION_DEPTH = 64;

class CalibrationEstablishedPathsService {
    async resolveLockedPaths(tenantId, printerNodeId, baselineChecksum) {
        if (!tenantId || !printerNodeId || !baselineChecksum) {
            const err = new Error('INVALID_ESTABLISHED_PATHS_INPUT');
            err.code = 'INVALID_ESTABLISHED_PATHS_INPUT';
            throw err;
        }

        const roots = await db.query(
            `SELECT id, tenant_id, printer_node_id,
                    source_type, source_calibration_run_id, parent_revision_id,
                    rates_checksum, baseline_rates_checksum
             FROM printhouse_pricing_revisions
             WHERE tenant_id = ?
               AND printer_node_id = ?
               AND rates_checksum = ?
             ORDER BY created_at DESC, id DESC
             LIMIT 1`,
            [tenantId, printerNodeId, baselineChecksum]
        );

        if (!roots || roots.length === 0) {
            return [];
        }

        const locked = new Set();
        const visited = new Set();

        let revision = roots[0];
        let depth = 0;

        while (revision) {
            depth++;

            if (depth > MAX_REVISION_DEPTH) {
                const err = new Error('PRICING_REVISION_CHAIN_TOO_DEEP');
                err.code = 'PRICING_REVISION_CHAIN_TOO_DEEP';
                throw err;
            }
	 if (visited.has(revision.id)) {
                const err = new Error('PRICING_REVISION_CHAIN_CYCLE');
                err.code = 'PRICING_REVISION_CHAIN_CYCLE';
                throw err;
            }

            visited.add(revision.id);

            if (
                revision.tenant_id !== tenantId ||
                revision.printer_node_id !== printerNodeId
            ) {
                const err = new Error('PRICING_REVISION_OWNERSHIP_MISMATCH');
                err.code = 'PRICING_REVISION_OWNERSHIP_MISMATCH';
                throw err;
            }

            if (revision.source_calibration_run_id && revision.source_type !== 'CALIBRATION_ACCEPTANCE') {
                const err = new Error('INVALID_PRICING_REVISION_SOURCE_TYPE');
                err.code = 'INVALID_PRICING_REVISION_SOURCE_TYPE';
                err.revisionId = revision.id;
                throw err;
            }

            if (revision.source_calibration_run_id) {
                const runs = await db.query(
                    `SELECT id, tenant_id, printer_node_id,
                            rate_snapshot_checksum, active_rate_paths_json
                     FROM printhouse_pricing_calibration_runs
                     WHERE id = ?
                       AND tenant_id = ?
                       AND printer_node_id = ?
                     LIMIT 1`,
                    [
                        revision.source_calibration_run_id,
                        tenantId,
                        printerNodeId
                    ]
                );
                if (!runs || runs.length !== 1) {
                    const err = new Error('PRICING_REVISION_SOURCE_RUN_MISSING');
                    err.code = 'PRICING_REVISION_SOURCE_RUN_MISSING';
                    err.revisionId = revision.id;
                    throw err;
                }

                const run = runs[0];

                if (revision.baseline_rates_checksum !== run.rate_snapshot_checksum) {
                    const err = new Error('PRICING_REVISION_RUN_BASELINE_MISMATCH');
                    err.code = 'PRICING_REVISION_RUN_BASELINE_MISMATCH';
                    err.revisionId = revision.id;
                    err.runId = run.id;
                    throw err;
                }

                let activeRatePaths;
                try {
                    activeRatePaths =
                        typeof run.active_rate_paths_json === 'string'
                            ? JSON.parse(run.active_rate_paths_json)
                            : run.active_rate_paths_json;
                } catch {
                    const err = new Error('INVALID_HISTORICAL_ACTIVE_RATE_PATHS');
                    err.code = 'INVALID_HISTORICAL_ACTIVE_RATE_PATHS';
                    err.runId = run.id;
                    throw err;
                }

                if (
                    !Array.isArray(activeRatePaths) ||
                    activeRatePaths.some(
                        p => typeof p !== 'string' || p.length === 0
                    )
                ) {
                    const err = new Error('INVALID_HISTORICAL_ACTIVE_RATE_PATHS');
                    err.code = 'INVALID_HISTORICAL_ACTIVE_RATE_PATHS';
                    err.runId = run.id;
                    throw err;
                }

                for (const path of activeRatePaths) {
                    locked.add(path);
                }
            }

            if (!revision.parent_revision_id) {
                break;
            }

            const parents = await db.query(
                `SELECT id, tenant_id, printer_node_id,
                        source_type, source_calibration_run_id, parent_revision_id,
                        rates_checksum, baseline_rates_checksum
                 FROM printhouse_pricing_revisions
                 WHERE id = ?
                   AND tenant_id = ?
                   AND printer_node_id = ?
                 LIMIT 1`,
                [
                    revision.parent_revision_id,
                    tenantId,
                    printerNodeId
                ]
            );

            if (!parents || parents.length !== 1) {
                const err = new Error('PRICING_REVISION_PARENT_MISSING');
                err.code = 'PRICING_REVISION_PARENT_MISSING';
                err.revisionId = revision.id;
                throw err;
            }

            const parent = parents[0];

            if (revision.baseline_rates_checksum !== parent.rates_checksum) {
                const err = new Error('PRICING_REVISION_PARENT_CHECKSUM_MISMATCH');
                err.code = 'PRICING_REVISION_PARENT_CHECKSUM_MISMATCH';
                err.revisionId = revision.id;
                err.parentRevisionId = parent.id;
                throw err;
            }

            revision = parent;
        }

        return [...locked].sort();
    }
}

module.exports = new CalibrationEstablishedPathsService();
