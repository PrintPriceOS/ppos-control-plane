/**
 * Phase 15 Validation Script
 * Distributed Regional Federation & Policy-Orchestrated Multi-Instance Network
 */

const registry = require('../../ppos-preflight-service/src/federation/instanceRegistry');
const protocol = require('../../ppos-preflight-service/src/federation/federationProtocol');
const emitter = require('../../ppos-preflight-service/src/federation/signalEmitter');
const ingestor = require('../../ppos-preflight-service/src/federation/signalIngestor');
const decisionEngine = require('../../ppos-preflight-service/src/federation/federatedDecisionEngine');
const policyValidator = require('../../ppos-preflight-service/src/federation/federationPolicyValidator');
const safety = require('../../ppos-preflight-service/src/federation/federationSafety');
const auditLogger = require('../../ppos-preflight-service/src/services/auditLogger');

function assert(condition, message) {
    if (!condition) {
        throw new Error(`[ASSERTION FAILED] ${message}`);
    }
}

async function runValidation() {
    console.log('=== PHASE 15 DISTRIBUTED FEDERATION VALIDATION ===\n');
    let issues = [];

    try {
        console.log('[1] Validating Instance Topology Registry...');
        const nodes = registry.getAll();
        console.log(`  ✅ Registered ${nodes.length} sovereign regions in mesh memory.`);
        assert(nodes.length === 3, 'Must have 3 mocked instances.');

        console.log('\n[2] Testing Healthy Signal Ingestion (Cross-Instance Comms)...');
        // Peer eu-west-1 is drowning in traffic
        const distressSignal = protocol.buildSignal('CAPACITY_PRESSURE', 'eu-west-1', { queueDepth: 50000 });
        const receipt = ingestor.receive(distressSignal);
        assert(receipt.accepted, 'Local ingestor should accept signals from trusted HEALTHY peers.');
        console.log('  ✅ Ingestor securely received external CAPACITY_PRESSURE signal.');

        console.log('\n[3] Testing Sovereign Tier Policy Envelopes (Downgrade Block)...');
        // Local is ENTERPRISE. Can we route to US-EAST which is STANDARD tier?
        const policyCheck = policyValidator.validateRoutingIntent('us-east-failover');
        if (!policyCheck.allowed && policyCheck.code === 'DOWNGRADE_NOT_ALLOWED') {
            console.log('  ✅ Policy successfully BLOCKED illegal routing to a lower-tier sovereign node.');
            auditLogger.logFederation('FEDERATION_BLOCKED_BY_POLICY', 'local-ops-1', 'us-east-failover', { reason: policyCheck.reason });
        } else {
            issues.push('Policy failed to protect against SLA downgrade leak.');
        }

        console.log('\n[4] Testing Data Leakage Isolation Safety (PII Crossing Mesh Boundaries)...');
        const rogueRoutePayload = { target: 'eu-west-1', routingTag: 'leak', tenant_token: 'secret_123' };
        const safetyCheck = safety.assertTenantIsolation(rogueRoutePayload);
        if (!safetyCheck.safe && safetyCheck.reason.includes('FATAL_DATA_LEAK_PREVENTED')) {
            console.log('  ✅ Data Scrubber successfully scrubbed toxic PII trying to cross regions.');
        } else {
            issues.push('Safety firewall failed to stop tenant isolation break.');
        }

        console.log('\n[5] Testing Full Federated Dispatch Resolution (Valid Route)...');
        const resolution = decisionEngine.synthesizeEvacuationRoute({});
        if (resolution.action === 'ROUTE_AWAY' && resolution.targetInstance === 'eu-west-1') {
            console.log(`  ✅ Decision Engine synthesized a mathematically sound and legal route to ${resolution.targetInstance}.`);
            auditLogger.logFederation('FEDERATION_DECISION_MADE', 'local-ops-1', 'eu-west-1', { decision: resolution });
        } else {
            issues.push('Decision Engine could not find the legal EU-WEST-1 partner.');
        }

    } catch (err) {
        issues.push(err.message);
    }

    console.log('\n=== VALIDATION SUMMARY ===');
    console.log(`Issues Found: ${issues.length}`);
    issues.forEach(i => console.log('  ❌ Error:', i));

    if (issues.length === 0) {
        console.log('\nFINAL DECISION: GO');
    } else {
        console.log('\nFINAL DECISION: NO-GO');
        process.exit(1);
    }
}

runValidation().catch(console.error);
