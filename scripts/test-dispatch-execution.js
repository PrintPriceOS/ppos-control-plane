/**
 * Industrial Dispatch Execution Validation Script
 * Phase 26 - Autonomous Dispatch Execution Layer.
 */
const executionService = require('../src/api/services/industrialDispatchExecutionService');
const db = require('../src/api/services/mysqlClient');
const persistence = require('../src/api/services/productionPersistenceService');

async function testExecution() {
  console.log('--- STARTING DISPATCH EXECUTION VALIDATION ---');

  try {
    // 1. Setup Test Data
    const testNodeId = 'test-node-' + Date.now();
    await db.query(`
      INSERT INTO print_nodes (id, tenant_id, company_name, status, country, city, region)
      VALUES (?, 'test-tenant', 'Test Node', 'ONLINE', 'IE', 'Dublin', 'EU-WEST')
    `, [testNodeId]);

    const jobInput = {
      package_id: 'test-pkg-' + Date.now(),
      destination_country: 'IE',
      product_type: 'SOFTCOVER_BOOK'
    };

    const selectedCandidate = {
      node_id: testNodeId,
      display_name: 'Test Node',
      receiver_tenant_id: 'test-tenant'
    };

    // 2. Test Dispatch Creation
    console.log('Testing createManufacturingDispatch...');
    const dispatch = await executionService.createManufacturingDispatch(jobInput, selectedCandidate, {
      senderTenantId: 'ADMIN-TENANT',
      operatorId: 'admin-1'
    });

    console.log('Dispatch Created:', dispatch.dispatchId);
    if (dispatch.status !== 'RESERVED') throw new Error('Status should be RESERVED');

    // 3. Verify Persistence
    console.log('Verifying persistence...');
    const savedDispatch = await persistence.getDispatch(dispatch.dispatchId);
    if (!savedDispatch) throw new Error('Dispatch not found in DB');
    console.log('Saved Status:', savedDispatch.status);

    // 4. Verify Reservation
    const [res] = await db.query('SELECT * FROM manufacturing_reservations WHERE id = ?', [dispatch.reservationId]);
    if (!res) throw new Error('Reservation not found');
    console.log('Reservation Status:', res.status);

    // 5. Test Rollback
    console.log('Testing rollbackDispatch...');
    await executionService.rollbackDispatch(dispatch.dispatchId, 'admin-1', 'Validation Test Rollback');

    const rolledDispatch = await persistence.getDispatch(dispatch.dispatchId);
    if (rolledDispatch.status !== 'ROLLED_BACK') throw new Error('Rollback failed');

    const [rolledRes] = await db.query('SELECT * FROM manufacturing_reservations WHERE id = ?', [dispatch.reservationId]);
    if (rolledRes.status !== 'ROLLED_BACK') throw new Error('Reservation rollback failed');

    console.log('--- VALIDATION SUCCESSFUL ---');
    process.exit(0);
  } catch (err) {
    console.error('--- VALIDATION FAILED ---');
    console.error(err);
    process.exit(1);
  }
}

testExecution();
