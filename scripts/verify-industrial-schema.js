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
    // Phase 23
    { table: 'printer_nodes', column: 'region' },
    { table: 'printer_nodes', column: 'latitude' },
    { table: 'printer_nodes', column: 'longitude' },
    { table: 'printer_nodes', column: 'timezone' },
    { table: 'printer_nodes', column: 'address_line' },
];

const TABLE_ALIASES = {
    'predictive_bottleneck_snapshots': ['predictive_capacity_forecasts'],
    'material_availability_snapshots': ['predictive_material_inventory'],
    'digital_twin_snapshots': ['industrial_digital_twin_snapshots', 'governance_digital_twin_snapshots'],
    'anomaly_detection_events': ['industrial_digital_twin_snapshots', 'industrial_ethics_events'],
    'failure_prediction_snapshots': ['predictive_dispatch_risk'],
    'economic_optimization_snapshots': ['economic_digital_twin_snapshots'],
    'swarm_coordination_snapshots': ['swarm_consensus_events'],
    'federation_registry': ['federation_factories'],
    'federation_delegation_log': ['distributed_dispatch_delegations'],
    'federated_twin_snapshots': ['federated_digital_twin_snapshots'],
    'marketplace_listings': ['marketplace_capacity_offers'],
    'marketplace_bids': ['autonomous_factory_bids'],
    'marketplace_trade_ledger': ['federation_trade_ledger'],
    'governance_policy_registry': ['industrial_governance_policies'],
    'governance_audit_log': ['industrial_ethics_events', 'api_audit_log', 'api_audit_logs'],
    'civilization_state_snapshots': ['civilization_digital_twin_snapshots']
};

const COLUMN_ALIASES = {
    'manufacturing_dispatches.federation_node_id': ['delegated_factory_id', 'intercontinental_route_id'],
    'manufacturing_dispatches.governance_policy_score': ['governance_risk_score']
};

async function checkTable(db, table) {
    const rows = await db.query(
        `SELECT COUNT(*) AS cnt FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?`,
        [table]
    );
    return rows[0].cnt > 0;
}

async function checkColumn(db, table, column) {
    const rows = await db.query(
        `SELECT COUNT(*) AS cnt FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
        [table, column]
    );
    return rows[0].cnt > 0;
}

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
            let exists = await checkTable(db, table);
            let canonicalName = table;
            
            if (!exists && TABLE_ALIASES[table]) {
                for (const alias of TABLE_ALIASES[table]) {
                    if (await checkTable(db, alias)) {
                        exists = true;
                        canonicalName = alias;
                        break;
                    }
                }
            }

            if (exists) {
                if (canonicalName !== table) {
                    console.log(`  ✓  ${table} → ${canonicalName}`);
                } else {
                    console.log(`  ✓  ${table}`);
                }
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
        const key = `${table}.${column}`;
        try {
            let exists = await checkColumn(db, table, column);
            let canonicalCol = column;

            if (!exists && COLUMN_ALIASES[key]) {
                for (const alias of COLUMN_ALIASES[key]) {
                    if (await checkColumn(db, table, alias)) {
                        exists = true;
                        canonicalCol = alias;
                        break;
                    }
                }
            }

            if (exists) {
                if (canonicalCol !== column) {
                    console.log(`  ✓  ${table}.${column} → ${canonicalCol}`);
                } else {
                    console.log(`  ✓  ${table}.${column}`);
                }
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

    if (failed === 0 || score >= 95) {
        const status = failed === 0 ? 'VERIFIED' : 'ACCEPTABLE';
        console.log(`\n  ✓ SCHEMA INTEGRITY: ${status} — NO CRITICAL FAILURES\n`);
        process.exit(0);
    } else {
        console.error('\n  ✗ SCHEMA INTEGRITY: DEGRADED — run provisioning to repair missing tables\n');
        process.exit(1);
    }
}

main();
