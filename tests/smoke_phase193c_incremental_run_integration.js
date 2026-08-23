const assert = require('assert');

const db = require('../src/api/services/mysqlClient');
const sessions = require('../src/api/services/calibrationSessionService');
const established = require('../src/api/services/calibrationEstablishedPathsService');
const solver = require('../src/api/services/deterministicInversePricingSolver');
const runs = require('../src/api/services/calibrationRunService');

(async () => {
    const session = {
        id: 'cal-test',
        status: 'READY',
        printerNodeId: 'node-1',
        bookSpec: { copies: 500 },
        currentRatesChecksum: 'checksum-r2',
        currentRatesSnapshot: {}
    };

    const locked = [
        'cover_fixed_by_colours.4',
        'cover_var_per_1000_by_colours.4'
    ];

    let resolverArgs = null;
    let solverArgs = null;

    sessions.getSession = async () => session;
    sessions.resolveNodeOwnership = async () => ({ signatures: [16] });
    sessions.computeRatesChecksum = () => 'session-checksum';

    established.resolveLockedPaths = async (...args) => {
        resolverArgs = args;
        return locked;
    };

    solver.solve = (...args) => {
        solverArgs = args;
        return {
            status: 'SUCCEEDED',
            solverVersion: 'test',
            solverConfig: {},
            evaluationsCount: 1,
            executionDurationMs: 1,
            enginePriceBefore: 100,
            enginePriceAfter: 100,
            targetPrice: 100,
            absoluteResidual: 0,
            percentResidual: 0,
            activeRatePaths: [...locked, 'novel.path'],
            proposedPatch: { novel: { path: 1 } },
            proposedPatchChecksum: 'patch-checksum',
            candidateParameters: {},
            identifiabilityReport: {},
            warnings: []
        };
    };

    const connection = {
        beginTransaction: async () => {},
        query: async sql => {
            if (sql.includes('UPDATE printhouse_pricing_calibration_sessions')) {
                return [{ affectedRows: 1 }];
            }
            return [{}];
        },
        commit: async () => {},
        rollback: async () => {},
        release: () => {}
    };

    db.getPool = () => ({
        getConnection: async () => connection
    });

    runs.getRun = async () => ({ id: 'mock-run' });

    await runs.executeRun(
        'tenant-1',
        'cal-test',
        { id: 12, role: 'PRINTHOUSE_ADMIN' }
    );

    assert.deepStrictEqual(
        resolverArgs,
        ['tenant-1', 'node-1', 'checksum-r2']
    );

    assert.strictEqual(solverArgs[0], session);
    assert.deepStrictEqual(solverArgs[1], { signatures: [16] });
    assert.deepStrictEqual(solverArgs[2], { lockedRatePaths: locked });

    console.log('PASS: incremental run integration');
})().catch(err => {
    console.error(err);
    process.exit(1);
});
