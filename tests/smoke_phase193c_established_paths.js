const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const service = require('../src/api/services/calibrationEstablishedPathsService');

const originalQuery = db.query;

async function expectReject(fn, code) {
    try {
        await fn();
        throw new Error(`Expected rejection with ${code}`);
    } catch (err) {
        assert.strictEqual(err.code, code);
    }
}

(async () => {
    // T1: No matching baseline revision -> no locked paths
    db.query = async () => [];
    assert.deepStrictEqual(
        await service.resolveLockedPaths('tenant-1', 'node-1', 'checksum-x'),
        []
    );

    // T2: Two accepted revisions -> union of historical active paths
    let step = 0;
    db.query = async () => {
        step++;

        if (step === 1) {
            return [{
                id: 'rev-2',
                tenant_id: 'tenant-1',
                printer_node_id: 'node-1',
                source_type: 'CALIBRATION_ACCEPTANCE',
                source_calibration_run_id: 'run-2',
                parent_revision_id: 'rev-1',
                rates_checksum: 'checksum-2',
                baseline_rates_checksum: 'checksum-1'
            }];
        }

        if (step === 2) {
            return [{
                id: 'run-2',
                tenant_id: 'tenant-1',
                printer_node_id: 'node-1',
                rate_snapshot_checksum: 'checksum-1',
                active_rate_paths_json: JSON.stringify(['path.b', 'path.c'])
            }];
        }

        if (step === 3) {
            return [{
                id: 'rev-1',
                tenant_id: 'tenant-1',
                printer_node_id: 'node-1',
                source_type: 'CALIBRATION_ACCEPTANCE',
                source_calibration_run_id: 'run-1',
                parent_revision_id: null,
                rates_checksum: 'checksum-1',
                baseline_rates_checksum: 'checksum-0'
            }];
        }

        if (step === 4) {
            return [{
                id: 'run-1',
                tenant_id: 'tenant-1',
                printer_node_id: 'node-1',
                rate_snapshot_checksum: 'checksum-0',
                active_rate_paths_json: JSON.stringify(['path.a', 'path.b'])
            }];
        }

        throw new Error(`Unexpected query step ${step}`);
    };

    assert.deepStrictEqual(
        await service.resolveLockedPaths('tenant-1', 'node-1', 'checksum-2'),
        ['path.a', 'path.b', 'path.c']
    );

    // T3: Missing parent -> fail closed
    step = 0;
    db.query = async () => {
        step++;
        if (step === 1) {
            return [{
                id: 'rev-2',
                tenant_id: 'tenant-1',
                printer_node_id: 'node-1',
                source_type: 'CALIBRATION_ACCEPTANCE',
                source_calibration_run_id: null,
                parent_revision_id: 'missing-parent',
                rates_checksum: 'checksum-2',
                baseline_rates_checksum: 'checksum-1'
            }];
        }
        return [];
    };

    await expectReject(
        () => service.resolveLockedPaths('tenant-1', 'node-1', 'checksum-2'),
        'PRICING_REVISION_PARENT_MISSING'
    );

    // T4: Invalid historical path payload -> fail closed
    step = 0;
    db.query = async () => {
        step++;
        if (step === 1) {
            return [{
                id: 'rev-1',
                tenant_id: 'tenant-1',
                printer_node_id: 'node-1',
                source_type: 'CALIBRATION_ACCEPTANCE',
                source_calibration_run_id: 'run-1',
                parent_revision_id: null,
                rates_checksum: 'checksum-1',
                baseline_rates_checksum: 'checksum-0'
            }];
        }

        return [{
            id: 'run-1',
            tenant_id: 'tenant-1',
            printer_node_id: 'node-1',
            rate_snapshot_checksum: 'checksum-0',
            active_rate_paths_json: '{"not":"an-array"}'
        }];
    };

    await expectReject(
        () => service.resolveLockedPaths('tenant-1', 'node-1', 'checksum-1'),
        'INVALID_HISTORICAL_ACTIVE_RATE_PATHS'
    );

    // T5: Run/revision baseline mismatch -> fail closed
    step = 0;
    db.query = async () => {
        step++;
        if (step === 1) {
            return [{
                id: 'rev-1',
                tenant_id: 'tenant-1',
                printer_node_id: 'node-1',
                source_type: 'CALIBRATION_ACCEPTANCE',
                source_calibration_run_id: 'run-1',
                parent_revision_id: null,
                rates_checksum: 'checksum-1',
                baseline_rates_checksum: 'checksum-0'
            }];
        }

        return [{
            id: 'run-1',
            tenant_id: 'tenant-1',
            printer_node_id: 'node-1',
            rate_snapshot_checksum: 'DIFFERENT',
            active_rate_paths_json: JSON.stringify(['path.a'])
        }];
    };

    await expectReject(
        () => service.resolveLockedPaths('tenant-1', 'node-1', 'checksum-1'),
        'PRICING_REVISION_RUN_BASELINE_MISMATCH'
    );

    db.query = originalQuery;
    console.log('PASS: established paths resolver');
})().catch(err => {
    db.query = originalQuery;
    console.error(err);
    process.exit(1);
});
