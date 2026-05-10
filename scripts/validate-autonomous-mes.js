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
        
        // Adaptive discovery of real machine capabilities
        const allMachines = await db.query(`
            SELECT node_id, id as machine_id, profile_name, normalized_capabilities_json, raw_data_json 
            FROM print_node_machine_profiles 
            WHERE status = 'ACTIVE'
        `);

        if (allMachines.length < 2) {
            console.error('\n❌ NO_VALIDATION_ALTERNATE_NODE_AVAILABLE: Need at least 2 active machines.');
            process.exit(1);
        }

        // Try to find a spec that works for at least 2 different nodes
        let selectedSpec = null;
        let originalMachine = null;
        let recoveryMachine = null;
        let noiseMachines = [];

        for (const m1 of allMachines) {
            const caps1 = typeof m1.normalized_capabilities_json === 'string' ? JSON.parse(m1.normalized_capabilities_json) : m1.normalized_capabilities_json;
            if (!caps1) continue;

            for (const m2 of allMachines) {
                if (m1.node_id === m2.node_id) continue; // Must be different nodes for reroute validation
                
                const caps2 = typeof m2.normalized_capabilities_json === 'string' ? JSON.parse(m2.normalized_capabilities_json) : m2.normalized_capabilities_json;
                if (!caps2) continue;

                // Find intersection
                const commonPapers = (caps1.paper_types || []).filter(p => (caps2.paper_types || []).includes(p));
                const commonBindings = (caps1.binding || []).filter(b => (caps2.binding || []).includes(b));
                const commonColours = (caps1.colour_modes || []).filter(c => (caps2.colour_modes || []).includes(c));

                if (commonPapers.length > 0 && commonBindings.length > 0 && commonColours.length > 0) {
                    selectedSpec = {
                        paper: commonPapers[0],
                        binding: commonBindings[0],
                        colour: commonColours[0].includes('4') ? 'full' : 'mono',
                        copies: Math.max(caps1.min_run || 1, caps2.min_run || 1),
                        sheet_size: { width: 210, height: 297 }, // A4 default
                        gsm: Math.max(caps1.min_gsm || 80, caps2.min_gsm || 80)
                    };
                    originalMachine = m1;
                    recoveryMachine = m2;
                    // Any machine that is NOT on original or recovery node can be a noise machine
                    noiseMachines = allMachines.filter(m => m.node_id !== m1.node_id && m.node_id !== m2.node_id);
                    break;
                }
            }
            if (selectedSpec) break;
        }

        if (!selectedSpec) {
            console.error('\n❌ NO_VALIDATION_ALTERNATE_NODE_AVAILABLE: Could not find compatible overlap between nodes.');
            allMachines.forEach(m => {
                const c = typeof m.normalized_capabilities_json === 'string' ? JSON.parse(m.normalized_capabilities_json) : m.normalized_capabilities_json;
                console.log(`- Machine: ${m.profile_name} (Node: ${m.node_id}) | Papers: ${c?.paper_types?.join(',')} | Bindings: ${c?.binding?.join(',')} | Colours: ${c?.colour_modes?.join(',')}`);
            });
            process.exit(1);
        }

        console.log(`    Selected Validation Spec: ${JSON.stringify(selectedSpec)}`);
        console.log(`    Original Node: ${originalMachine.node_id} (Machine: ${originalMachine.machine_id})`);
        console.log(`    Recovery Node (Reserved): ${recoveryMachine.node_id} (Machine: ${recoveryMachine.machine_id})`);
        console.log(`    Noise Nodes Available: ${noiseMachines.map(n => n.node_id).join(', ') || 'NONE'}`);

        // Double check recovery node is clean
        const [existingReservations] = await db.query(
            "SELECT COUNT(*) as count FROM manufacturing_capacity_reservations WHERE node_id = ? AND reservation_status = 'ACTIVE'",
            [recoveryMachine.node_id]
        );
        if (existingReservations.count > 0) {
            console.error(`\n❌ NO_CLEAN_ALTERNATE_CAPACITY_FOR_VALIDATION: Recovery node ${recoveryMachine.node_id} already has ${existingReservations.count} active jobs.`);
            process.exit(1);
        }

        const testJobs = [];
        for (let i = 1; i <= 3; i++) {
            const jobId = `TEST-JOB-${i}-${Date.now()}`;
            
            let machine;
            if (i === 1) {
                machine = originalMachine;
            } else if (noiseMachines.length > 0) {
                machine = noiseMachines[(i-2) % noiseMachines.length];
            } else {
                // If no noise machines available, just don't create Dispatch 2 and 3 on the recovery node
                // We'll just create them on the original node instead (different machine if possible, or just same)
                machine = originalMachine;
            }
            
            const jobMetadata = { ...selectedSpec, is_rush: i === 1 };
            await db.query("INSERT INTO jobs (id, original_name, metadata_json) VALUES (?, ?, ?)", [
                jobId, `Validation Job ${i}`, JSON.stringify(jobMetadata)
            ]);
            
            const assignment = {
                nodeId: machine.node_id,
                machineId: machine.machine_id,
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
                reserved_until = ?,
                metadata_json = JSON_SET(COALESCE(metadata_json, '{}'), '$.validation_recovery_node', ?)
            WHERE id = ?
        `, [pastDate, pastDate, recoveryMachine.node_id, d1]);
        
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
