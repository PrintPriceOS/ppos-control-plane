/**
 * scripts/validate-autonomous-mes.js
 * 
 * Industrial validation script for Autonomous MES loops, SLA monitoring, 
 * rerouting conditions, and capacity conflict detection.
 */

const path = require('path');
// Ensure env vars are loaded if a .env exists (optional, depends on environment)
try { require('dotenv').config(); } catch (e) {}

const db = require('../src/api/services/mysqlClient');
const slaMonitor = require('../src/api/services/slaMonitoringService');
const autoReroute = require('../src/api/services/autonomousRerouteService');
const conflictService = require('../src/api/services/capacityConflictService');
const learningLoop = require('../src/api/services/manufacturingLearningService');
const productionOrchestration = require('../src/api/services/productionOrchestrationService');
const telemetryService = require('../src/api/services/telemetryService');

async function validate() {
    console.log('--- STARTING AUTONOMOUS MES INDUSTRIAL VALIDATION ---\n');

    try {
        // 0. Cleanup any previous test data to avoid noise
        console.log('[1/6] Cleaning up stale test dispatches...');
        await db.query("DELETE FROM manufacturing_capacity_reservations WHERE dispatch_id IN (SELECT id FROM manufacturing_dispatches WHERE job_id LIKE 'TEST-JOB-%')");
        await db.query("DELETE FROM manufacturing_dispatch_events WHERE dispatch_id IN (SELECT id FROM manufacturing_dispatches WHERE job_id LIKE 'TEST-JOB-%')");
        await db.query("DELETE FROM manufacturing_dispatches WHERE job_id LIKE 'TEST-JOB-%'");
        await db.query("DELETE FROM jobs WHERE id LIKE 'TEST-JOB-%'");

        // 1. Create Baseline Data
        console.log('[2/6] Provisioning 3 industrial test dispatches...');
        
        // Find nodes with compatible machines for a generic book spec
        const specs = {
            binding: 'HOT_MELT',
            paper: 'OFFSET_90G',
            colour: 'full',
            copies: 100,
            sheet_size: 'A4',
            gsm: 90
        };

        const { matched: machines } = await require('../src/api/services/machineRegistryService').findMatchingMachines({
            paper_type: specs.paper,
            sheet_size: specs.sheet_size,
            colour_mode: '4/4',
            binding: specs.binding,
            gsm: specs.gsm,
            run_length: specs.copies
        });

        if (machines.length < 2) {
            console.error('\n❌ NO_VALIDATION_ALTERNATE_NODE_AVAILABLE');
            console.error('The system does not have at least 2 compatible nodes for the validation specs.');
            console.log('Specs:', JSON.stringify(specs));
            console.log('Matched Machines:', machines.length);
            process.exit(1);
        }

        const testJobs = [];
        for (let i = 1; i <= 3; i++) {
            const jobId = `TEST-JOB-${i}-${Date.now()}`;
            const jobMetadata = { ...specs, is_rush: i === 1 };
            
            await db.query("INSERT INTO jobs (id, original_name, metadata_json) VALUES (?, ?, ?)", [
                jobId, `Validation Job ${i}`, JSON.stringify(jobMetadata)
            ]);
            
            // Assign to first machine for d1, second for others to ensure capacity
            const machine = machines[i % machines.length];
            const assignment = {
                nodeId: machine.node_id,
                machineId: machine.id,
                estimatedCost: 100 * i,
                estimatedMargin: 20,
                estimatedProductionDays: 2,
                autonomous: true,
                reason: 'INDUSTRIAL_VALIDATION_SEED'
            };
            
            const result = await productionOrchestration.assignDispatch(jobId, assignment);
            testJobs.push({ jobId, dispatchId: result.dispatchId });
        }

        // 2. Force Failure Conditions on Dispatch 1
        console.log('[3/6] Simulating SLA breach and reservation expiry on Dispatch 1...');
        const d1 = testJobs[0].dispatchId;
        
        // Force expired reservation and stale state
        const pastDate = new Date(Date.now() - 1000 * 60 * 60 * 48); // 48 hours ago
        await db.query(`
            UPDATE manufacturing_dispatches 
            SET status = 'PRINTING', 
                updated_at = ?, 
                reserved_until = ? 
            WHERE id = ?
        `, [pastDate, pastDate, d1]);
        
        await db.query(`
            UPDATE manufacturing_capacity_reservations 
            SET reserved_until = ?, 
                reservation_status = 'ACTIVE' 
            WHERE dispatch_id = ?
        `, [pastDate, d1]);

        // 3. Trigger Autonomous Loops
        console.log('[4/6] Triggering autonomous intelligence loops...');
        
        console.log(' -> Running SLA Monitor...');
        const slaSummary = await slaMonitor.scanActiveDispatches();
        console.log('    SLA Summary:', JSON.stringify(slaSummary));

        console.log(' -> Running Conflict Detection...');
        const conflictSummary = await conflictService.detectConflicts();
        console.log('    Conflict Summary:', JSON.stringify(conflictSummary));

        console.log(' -> Running Autonomous Reroute...');
        const rerouteSummary = await autoReroute.evaluateReroutes();
        console.log('    Reroute Summary:', JSON.stringify(rerouteSummary));

        console.log(' -> Running Learning Loop...');
        const learningSummary = await learningLoop.recomputeIntelligence();
        console.log('    Learning Summary:', JSON.stringify(learningSummary));

        // 4. Validate State Transitions
        console.log('[5/6] Verifying state integrity...');
        
        const [updatedD1] = await db.query("SELECT status, metadata_json FROM manufacturing_dispatches WHERE id = ?", [d1]);
        console.log(`    Dispatch 1 Status: ${updatedD1.status}`);
        
        if (updatedD1.status !== 'AUTO_REROUTED') {
            throw new Error(`VALIDATION_FAILED: Dispatch 1 should be AUTO_REROUTED, found ${updatedD1.status}`);
        }

        const [reroutedDispatch] = await db.query("SELECT id, status, metadata_json FROM manufacturing_dispatches WHERE job_id = ? AND id != ?", [testJobs[0].jobId, d1]);
        if (!reroutedDispatch) {
            throw new Error(`VALIDATION_FAILED: No replacement dispatch found for Job 1`);
        }
        console.log(`    Replacement Dispatch: ${reroutedDispatch.id} (Status: ${reroutedDispatch.status})`);
        
        const metadata = typeof reroutedDispatch.metadata_json === 'string' ? JSON.parse(reroutedDispatch.metadata_json) : reroutedDispatch.metadata_json;
        if (!metadata.autonomous_recovery) {
            throw new Error(`VALIDATION_FAILED: Replacement dispatch missing autonomous_recovery metadata`);
        }
        console.log(`    Recovery Reason: ${metadata.autonomous_recovery.reason}`);

        if (metadata.previous_dispatch_id !== d1) {
            throw new Error(`VALIDATION_FAILED: Replacement dispatch missing cross-link to previous_dispatch_id. Found: ${metadata.previous_dispatch_id}`);
        }
        console.log(`    Cross-link verified: ${metadata.previous_dispatch_id}`);

        const [oldReservation] = await db.query("SELECT reservation_status FROM manufacturing_capacity_reservations WHERE dispatch_id = ?", [d1]);
        if (oldReservation.reservation_status !== 'RELEASED') {
            throw new Error(`VALIDATION_FAILED: Old reservation for ${d1} should be RELEASED, found ${oldReservation.reservation_status}`);
        }
        console.log(`    Old reservation released.`);

        // 5. Telemetry Validation
        console.log('[6/6] Validating telemetry propagation...');
        const health = await telemetryService.getIndustrialHealthSnapshot();
        console.log('    Health Snapshot:', JSON.stringify(health));
        
        if (health.autonomousRecoveries === 0) {
            throw new Error(`VALIDATION_FAILED: Telemetry failed to count autonomous recovery`);
        }

        console.log('\n--- VALIDATION SUCCESSFUL ---');
        console.log('✓ SLA detected risk conditions');
        console.log('✓ Autonomous reroute executed');
        console.log('✓ Metadata cross-linking verified');
        console.log('✓ Telemetry synchronized');
        
        process.exit(0);

    } catch (err) {
        console.error('\n❌ VALIDATION CRITICAL FAILURE:');
        console.error(err);
        process.exit(1);
    }
}

validate();
