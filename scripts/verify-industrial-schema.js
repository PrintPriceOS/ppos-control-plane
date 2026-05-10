/**
 * scripts/verify-industrial-schema.js
 *
 * Phase 23 — Database Schema Integrity Verification
 *
 * Verifies that ALL tables and critical columns from Phases 12–22 exist.
 * Safe to run at any time — READ ONLY, no mutations.
 *
 * Usage:
 *   node scripts/verify-industrial-schema.js
 *   PPOS_CONTROL_PLANE_URL=http://127.0.0.1:8081 node scripts/verify-industrial-schema.js
 */
require('dotenv').config();

const REQUIRED_TABLES = [
    // Core
    'jobs', 'print_nodes', 'print_node_machine_profiles',
    // Phase 12
    'manufacturing_dispatches', 'manufacturing_capacity_reservations', 'manufacturing_dispatch_events',
    // Phase 13-14
    'predictive_bottleneck_snapshots', 'material_availability_snapshots',
    'digital_twin_snapshots', 'anomaly_detection_events', 'failure_prediction_snapshots',
    // Phase 15
    'economic_optimization_snapshots', 'swarm_coordination_snapshots',
    // Phase 16
    'federation_registry', 'federation_delegation_log', 'federated_twin_snapshots',
    // Phase 17
    'marketplace_listings', 'marketplace_bids', 'marketplace_trade_ledger',
    // Phase 18
    'governance_policy_registry', 'governance_audit_log', 'governance_digital_twin_snapshots',
    // Phase 19
    'civilization_state_snapshots', 'planetary_cognition_snapshots',
    // Phase 20
    'interplanetary_federations', 'orbital_manufacturing_clusters', 'stellar_logistics_routes',
    'civilization_survival_snapshots', 'synthetic_consciousness_telemetry',
    'deep_space_expansion_zones', 'galactic_risk_forecasts',
    'infinite_optimization_cycles', 'civilization_continuity_registry',
    'interplanetary_digital_twin_snapshots',
    // Phase 21
    'reality_simulation_snapshots', 'timeline_optimization_graph',
    'parallel_civilization_models', 'universal_governance_constraints',
    'synthetic_reality_events', 'omniscient_digital_twin_snapshots',
    // Phase 22
    'omniversal_consciousness_snapshots', 'post_reality_singularity_events',
    'infinite_dimensional_routes', 'universal_entropy_registry',
    'causal_manufacturing_chains', 'omniversal_singularity_twin_snapshots',
];

const REQUIRED_COLUMNS = [
    // Phase 15
    { table: 'manufacturing_dispatches', column: 'economic_score' },
    { table: 'manufacturing_dispatches', column: 'profitability_score' },
    { table: 'manufacturing_dispatches', column: 'energy_efficiency_score' },
    // Phase 16
    { table: 'manufacturing_dispatches', column: 'federation_node_id' },
    // Phase 18
    { table: 'manufacturing_dispatches', column: 'governance_policy_score' },
    // Phase 19
    { table: 'manufacturing_dispatches', column: 'planetary_priority_score' },
    { table: 'manufacturing_dispatches', column: 'civilization_risk_score' },
    // Phase 20
    { table: 'manufacturing_dispatches', column: 'interplanetary_priority_score' },
    { table: 'manufacturing_dispatches', column: 'existential_risk_score' },
    { table: 'manufacturing_dispatches', column: 'continuity_weight' },
    // Phase 21
    { table: 'manufacturing_dispatches', column: 'timeline_weight' },
    { table: 'manufacturing_dispatches', column: 'reality_risk_score' },
    // Phase 22
    { table: 'manufacturing_dispatches', column: 'singularity_weight' },
    { table: 'manufacturing_dispatches', column: 'entropy_score' },
    // Node profiles
    { table: 'print_node_machine_profiles', column: 'industrial_efficiency_score' },
    { table: 'print_node_machine_profiles', column: 'civilization_survival_score' },
    { table: 'print_node_machine_profiles', column: 'singularity_stability' },
    { table: 'print_node_machine_profiles', column: 'omniversal_coherence' },
];

async function main() {
    console.log('\n╔══════════════════════════════════════════════════════╗');
    console.log('║  INDUSTRIAL SCHEMA INTEGRITY VERIFICATION (PH 12-22) ║');
    console.log('╚══════════════════════════════════════════════════════╝\n');

    let db;
    try {
        db = require('../src/api/services/mysqlClient');
    } catch (e) {
        console.error('FATAL: Could not connect to database:', e.message);
        process.exit(1);
    }

    let passed = 0;
    let failed = 0;
    const failures = [];

    // --- TABLE VERIFICATION ---
    console.log(`[1/2] Verifying ${REQUIRED_TABLES.length} required tables...\n`);
    for (const table of REQUIRED_TABLES) {
        try {
            const rows = await db.query(
                `SELECT COUNT(*) AS cnt FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?`,
                [table]
            );
            const exists = rows[0].cnt > 0;
            if (exists) {
                console.log(`  ✓  ${table}`);
                passed++;
            } else {
                console.error(`  ✗  ${table}  ← MISSING`);
                failures.push(`Table missing: ${table}`);
                failed++;
            }
        } catch (err) {
            console.error(`  !  ${table}  ← ERROR: ${err.message}`);
            failures.push(`Table error: ${table} → ${err.message}`);
            failed++;
        }
    }

    // --- COLUMN VERIFICATION ---
    console.log(`\n[2/2] Verifying ${REQUIRED_COLUMNS.length} required columns...\n`);
    for (const { table, column } of REQUIRED_COLUMNS) {
        try {
            const rows = await db.query(
                `SELECT COUNT(*) AS cnt FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
                [table, column]
            );
            const exists = rows[0].cnt > 0;
            if (exists) {
                console.log(`  ✓  ${table}.${column}`);
                passed++;
            } else {
                console.error(`  ✗  ${table}.${column}  ← MISSING`);
                failures.push(`Column missing: ${table}.${column}`);
                failed++;
            }
        } catch (err) {
            console.error(`  !  ${table}.${column}  ← ERROR: ${err.message}`);
            failures.push(`Column error: ${table}.${column} → ${err.message}`);
            failed++;
        }
    }

    // --- SUMMARY ---
    const total = passed + failed;
    const score = Math.round((passed / total) * 100);

    console.log('\n╔══════════════════════════════════════════╗');
    console.log('║             SCHEMA AUDIT REPORT          ║');
    console.log('╠══════════════════════════════════════════╣');
    console.log(`║  Total Checks : ${String(total).padEnd(24)}║`);
    console.log(`║  Passed       : ${String(passed).padEnd(24)}║`);
    console.log(`║  Failed       : ${String(failed).padEnd(24)}║`);
    console.log(`║  Schema Score : ${String(score + '%').padEnd(24)}║`);
    console.log('╚══════════════════════════════════════════╝');

    if (failures.length > 0) {
        console.error('\n  FAILURES:');
        failures.forEach(f => console.error(`    - ${f}`));
    }

    if (failed === 0) {
        console.log('\n  ✓ SCHEMA INTEGRITY: VERIFIED — ALL PHASES 12-22 INTACT\n');
        process.exit(0);
    } else {
        console.error('\n  ✗ SCHEMA INTEGRITY: DEGRADED — run provisioning to repair missing tables\n');
        process.exit(1);
    }
}

main();
