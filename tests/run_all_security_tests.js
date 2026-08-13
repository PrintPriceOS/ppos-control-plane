/**
 * tests/run_all_security_tests.js
 * 
 * Runs all security isolation and multi-tenant test suites.
 */
const { execSync } = require('child_process');

const testSuites = [
    'tests/security_activation_hub_isolation_test.js',
    'tests/security_onboarding_isolation_test.js',
    'tests/security_jobs_queue_isolation_test.js',
    'tests/security_machines_materials_isolation_test.js',
    'tests/security_pricing_marketplace_isolation_test.js',
    'tests/security_files_artifacts_isolation_test.js',
    'tests/security_metrics_audit_isolation_test.js',
    'tests/security_frontend_route_visibility_test.js',
    'tests/security_settings_tenant_config_isolation_test.js',
    'tests/security_production_monitoring_industrial_ops_isolation_test.js',
    'tests/security_legacy_alternate_routes_isolation_test.js',
    'tests/security_printhouse_dashboard_isolation_test.js',
    'tests/dashboard_no_mock_data_test.js',
    'tests/dashboard_role_widget_visibility_test.js',
    'tests/dashboard_printhouse_endpoint_matrix_test.js',
    'tests/shipping_ssrf_secret_security_test.js',
    'tests/marketplace_activation_governance_test.js',
    'tests/printhouse_activation_adapter_test.js',
    'tests/network_ops_discovery_remediation_test.js',
    'tests/industrial_provisioning_routing_remediation_test.js',
    'tests/industrial_provisioning_dispatch_remediation_test.js',
    'tests/printer_sync_capability_remediation_test.js',
    'tests/production_dispatch_reliability_test.js',
    'tests/production_telemetry_state_machine_test.js',
    'tests/production_dispatch_distributed_idempotency_test.js',
    'tests/production_telemetry_persistent_replay_test.js',
    'tests/smoke_phase192f_http_routes.js',
    'tests/runtime_kill_switch_security_test.js',
    'tests/runtime_kill_switch_effectiveness_test.js',
    'tests/runtime_kill_switch_recovery_test.js',
    'tests/phase192g_end_to_end_golden_path_test.js'
];

console.log('Starting execution of all security isolation test suites...');

let failed = false;

for (const suite of testSuites) {
    console.log(`\n=== Running ${suite} ===`);
    try {
        execSync(`node ${suite}`, {
            env: {
                ...process.env,
                JWT_SECRET: 'test_secret'
            },
            stdio: 'inherit'
        });
        console.log(`✓ ${suite} passed successfully.`);
    } catch (err) {
        console.error(`✗ ${suite} failed.`);
        failed = true;
    }
}

if (failed) {
    console.error('\nSome security test suites failed.');
    process.exit(1);
} else {
    console.log('\nAll security test suites passed successfully!');
    process.exit(0);
}
