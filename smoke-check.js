/**
 * Smoke Test: ppos-control-plane
 */
const FederatedHealthAggregator = require('./services/FederatedHealthAggregator');

async function test() {
    console.log('--- TESTING: ppos-control-plane ---');

    const aggregator = new FederatedHealthAggregator([
        { id: 'mock-region', endpoint: 'http://localhost' }
    ]);

    if (aggregator.aggregateHealth) {
        console.log('PASS: FederatedHealthAggregator instantiated');
    }

    try {
        const status = aggregator.calculateGlobalStatus([{ status: 'HEALTHY' }]);
        if (status === 'HEALTHY') {
            console.log('PASS: Global status logic valid');
        }
    } catch (e) {
        console.error('FAIL: Status logic error:', e.message);
    }

    console.log('DONE: ppos-control-plane ready for federation.');
}

test();
