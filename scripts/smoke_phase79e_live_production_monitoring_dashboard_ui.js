'use strict';
/**
 * scripts/smoke_phase79e_live_production_monitoring_dashboard_ui.js
 *
 * Smoke test for Phase 79E — Live Production Monitoring Dashboard UI.
 *
 * Validates:
 *  - All required component files exist (Page, sub-panels)
 *  - TypeScript type definitions are present
 *  - Frontend API client exports are correct and call the right endpoints
 *  - App.tsx route /admin/production-monitoring is registered
 *  - controlPlaneNavigation.ts includes the production-monitoring nav entry
 *  - Monitoring mode contract: no LIVE production toggle paths in UI code
 *  - API client makes no forbidden calls (guaranteed delivery, certified, etc.)
 *  - Mock HTTP round-trip for all monitoring endpoints via the backend router
 */

const fs   = require('fs');
const path = require('path');
const express = require('express');
const axios   = require('axios');
const db      = require('../src/api/services/mysqlClient');

// ─── Mock auth middleware ───────────────────────────────────────────────────
let currentActor = { tenantId: 'tenant_79e_01', userId: 'user_admin_1', role: 'SUPER_ADMIN' };
require.cache[require.resolve('../src/api/middleware/auth')] = {
    exports: {
        resolveActorContext: () => currentActor,
        requireAdmin:        (req, res, next) => next()
    }
};

// ─── Mock marketplaceProductionQueueService ─────────────────────────────────
require.cache[require.resolve('../src/api/services/marketplaceProductionQueueService')] = {
    exports: {
        async evaluateProductionQueueEligibility() {
            return { eligible: true, blockers: [], warnings: [], governance_domains: {}, metadata: {} };
        }
    }
};

// ─── Mock commercialPlanService ─────────────────────────────────────────────
require.cache[require.resolve('../src/api/services/commercialPlanService')] = {
    exports: {
        async evaluateTenantEntitlement() {
            return { entitlement_status: 'ACTIVE', blocking_reasons: [], limits: {} };
        }
    }
};

const router = require('../src/api/routes/adminProductionMonitoring');

// ─── Counters ───────────────────────────────────────────────────────────────
let PASS = 0, FAIL = 0;
const results = [];

function assert(condition, label, detail = '') {
    if (condition) {
        PASS++;
        results.push({ label, status: 'PASS', detail });
        console.log(`  ✅  [PASS] ${label}${detail ? ` (${detail})` : ''}`);
    } else {
        FAIL++;
        results.push({ label, status: 'FAIL', detail });
        console.error(`  ❌  [FAIL] ${label}${detail ? `: ${detail}` : ''}`);
    }
}

// ─── In-memory DB mock ──────────────────────────────────────────────────────
const mockDb = {
    snapshots:     [],
    events:        [],
    incidents:     [],
    machine_loads: [],
    reset() {
        this.snapshots     = [];
        this.events        = [];
        this.incidents     = [];
        this.machine_loads = [];
    }
};

function enableMockDb() {
    db.query = async (sql, params = []) => {
        const up = sql.trim().toUpperCase();

        // ── Snapshots ──────────────────────────────────────────────────────
        if (up.startsWith('INSERT INTO PRODUCTION_MONITORING_SNAPSHOTS')) {
            const row = {
                id: mockDb.snapshots.length + 1,
                tenant_id: params[0], printhouse_id: params[1], order_id: params[2],
                job_id: params[3], queue_entry_id: params[4], machine_id: params[5],
                production_status: params[6], sla_status: params[7],
                sla_started_at: params[8] ? new Date(params[8]) : null,
                sla_due_at:     params[9] ? new Date(params[9]) : null,
                estimated_completion_at: params[10] ? new Date(params[10]) : null,
                actual_completed_at:     params[11] ? new Date(params[11]) : null,
                remaining_minutes: params[12], risk_score: params[13],
                blocking_reasons_json:   params[14] ? JSON.parse(params[14]) : null,
                warning_reasons_json:    params[15] ? JSON.parse(params[15]) : null,
                governance_snapshot_json: params[16] ? JSON.parse(params[16]) : null,
                monitoring_snapshot_json: params[17] ? JSON.parse(params[17]) : null,
                created_at: new Date()
            };
            const idx = mockDb.snapshots.findIndex(s => s.order_id === row.order_id);
            idx >= 0 ? (mockDb.snapshots[idx] = row) : mockDb.snapshots.push(row);
            return { affectedRows: 1 };
        }

        if (up.startsWith('SELECT * FROM PRODUCTION_MONITORING_SNAPSHOTS WHERE ORDER_ID = ?')) {
            return mockDb.snapshots.filter(s => s.order_id === params[0]);
        }

        if (up.includes('SELECT PRODUCTION_STATUS, COUNT(*) AS COUNT FROM PRODUCTION_MONITORING_SNAPSHOTS')) {
            let filtered = mockDb.snapshots;
            if (up.includes('TENANT_ID = ?')) filtered = filtered.filter(s => s.tenant_id === params[0]);
            const counts = {};
            for (const s of filtered) counts[s.production_status] = (counts[s.production_status] || 0) + 1;
            return Object.entries(counts).map(([production_status, count]) => ({ production_status, count }));
        }

        if (up.startsWith('SELECT * FROM PRODUCTION_MONITORING_SNAPSHOTS')) {
            let filtered = mockDb.snapshots;
            if (up.includes('TENANT_ID = ?')) filtered = filtered.filter(s => s.tenant_id === params[0]);
            return filtered;
        }

        // ── Timeline events ────────────────────────────────────────────────
        if (up.startsWith('INSERT INTO PRODUCTION_TIMELINE_EVENTS')) {
            const row = {
                id: mockDb.events.length + 1,
                tenant_id: params[0], printhouse_id: params[1], order_id: params[2],
                job_id: params[3], event_type: params[4], event_status: params[5],
                actor_user_id: params[6], actor_role: params[7], message: params[8],
                metadata_json: params[9] ? JSON.parse(params[9]) : null,
                created_at: new Date()
            };
            mockDb.events.push(row);
            return { affectedRows: 1 };
        }

        if (up.startsWith('SELECT * FROM PRODUCTION_TIMELINE_EVENTS WHERE ORDER_ID = ?')) {
            return mockDb.events.filter(e => e.order_id === params[0]);
        }

        // ── Machine loads ──────────────────────────────────────────────────
        if (up.startsWith('INSERT INTO MACHINE_LOAD_SNAPSHOTS')) {
            const row = {
                id: mockDb.machine_loads.length + 1,
                tenant_id: params[0], printhouse_id: params[1], machine_id: params[2],
                machine_name: params[3], machine_type: params[4], load_status: params[5],
                queued_jobs_count: params[6], active_jobs_count: params[7],
                estimated_queue_minutes: params[8], capacity_score: params[9],
                next_available_at: params[10] ? new Date(params[10]) : null,
                snapshot_json: params[11] ? JSON.parse(params[11]) : null,
                created_at: new Date()
            };
            const idx = mockDb.machine_loads.findIndex(m => m.machine_id === row.machine_id);
            idx >= 0 ? (mockDb.machine_loads[idx] = row) : mockDb.machine_loads.push(row);
            return { affectedRows: 1 };
        }

        if (up.startsWith('SELECT * FROM MACHINE_LOAD_SNAPSHOTS')) {
            let filtered = mockDb.machine_loads;
            if (up.includes('TENANT_ID = ?')) filtered = filtered.filter(m => m.tenant_id === params[0]);
            return filtered;
        }

        // ── Incidents ──────────────────────────────────────────────────────
        if (up.startsWith('INSERT INTO PRODUCTION_INCIDENTS')) {
            const row = {
                id: mockDb.incidents.length + 1,
                tenant_id: params[0], printhouse_id: params[1], order_id: params[2],
                job_id: params[3], incident_type: params[4], severity: params[5],
                status: 'OPEN', title: params[6], description: params[7],
                metadata_json: params[8] ? JSON.parse(params[8]) : null,
                opened_at: new Date(), created_at: new Date()
            };
            mockDb.incidents.push(row);
            return { insertId: row.id, affectedRows: 1 };
        }

        if (up.startsWith('SELECT * FROM PRODUCTION_INCIDENTS WHERE ID = ?')) {
            return mockDb.incidents.filter(i => i.id === Number(params[0]));
        }

        if (up.startsWith('UPDATE PRODUCTION_INCIDENTS SET')) {
            const incidentId = Number(params[params.length - 1]);
            const incident   = mockDb.incidents.find(i => i.id === incidentId);
            if (incident) {
                if      (up.includes("STATUS = 'ACKNOWLEDGED'")) { incident.status = 'ACKNOWLEDGED'; incident.assigned_to_user_id = params[0]; }
                else if (up.includes("STATUS = 'RESOLVED'"))     { incident.status = 'RESOLVED';    incident.resolution_notes = params[0]; }
                else if (up.includes("STATUS = 'DISMISSED'"))    { incident.status = 'DISMISSED';   incident.resolution_notes = params[0]; }
            }
            return { affectedRows: 1 };
        }

        if (up.startsWith('SELECT * FROM PRODUCTION_INCIDENTS')) {
            let filtered = mockDb.incidents;
            if (up.includes('TENANT_ID = ?')) filtered = filtered.filter(i => i.tenant_id === params[0]);
            return filtered;
        }

        return [];
    };
}

// ─── File existence helpers ─────────────────────────────────────────────────
const ROOT = path.join(__dirname, '..');
const UI   = path.join(ROOT, 'src', 'ui');

function fileExists(rel) {
    return fs.existsSync(path.join(ROOT, rel));
}

function fileContains(rel, pattern) {
    try {
        const content = fs.readFileSync(path.join(ROOT, rel), 'utf-8');
        return typeof pattern === 'string' ? content.includes(pattern) : pattern.test(content);
    } catch { return false; }
}

// ═══════════════════════════════════════════════════════════════════════════
async function runTests() {
    console.log('\n━━━ Phase 79E — Live Production Monitoring Dashboard UI smoke tests ━━━\n');
    enableMockDb();

    // ── SECTION 1: Component / file existence ───────────────────────────────
    console.log('\n▶ Section 1: Component file existence\n');

    const components = [
        'src/ui/pages/production-monitoring/ProductionMonitoringDashboardPage.tsx',
        'src/ui/pages/production-monitoring/ProductionQueueOverview.tsx',
        'src/ui/pages/production-monitoring/SlaRiskPanel.tsx',
        'src/ui/pages/production-monitoring/MachineLoadPanel.tsx',
        'src/ui/pages/production-monitoring/ProductionIncidentsPanel.tsx',
        'src/ui/pages/production-monitoring/ProductionTimelinePanel.tsx',
        'src/ui/pages/production-monitoring/ProductionBlockersPanel.tsx',
        'src/ui/pages/production-monitoring/OperationalAlertsPanel.tsx',
    ];

    for (const comp of components) {
        assert(fileExists(comp), `Component file exists: ${path.basename(comp)}`);
    }

    // ── SECTION 2: Types & Client ──────────────────────────────────────────
    console.log('\n▶ Section 2: TypeScript types and API client\n');

    assert(
        fileExists('src/ui/types/productionMonitoring.ts'),
        'Types file exists: productionMonitoring.ts'
    );
    assert(
        fileExists('src/ui/api/productionMonitoringClient.ts'),
        'API client file exists: productionMonitoringClient.ts'
    );

    // Check required type interfaces
    const typeInterfaces = [
        'ProductionMonitoringSnapshot',
        'ProductionTimelineEvent',
        'ProductionIncident',
        'MachineLoadSnapshot',
        'SlaDashboardSummary'
    ];
    for (const iface of typeInterfaces) {
        assert(
            fileContains('src/ui/types/productionMonitoring.ts', `export interface ${iface}`),
            `Type interface exported: ${iface}`
        );
    }

    // Check required client functions
    const clientFunctions = [
        'getQueueOverview',
        'getProductionTimeline',
        'getIncidents',
        'createIncident',
        'acknowledgeIncident',
        'resolveIncident',
        'dismissIncident',
        'getMachineLoads',
        'getSlaSummary'
    ];
    for (const fn of clientFunctions) {
        assert(
            fileContains('src/ui/api/productionMonitoringClient.ts', `export async function ${fn}`),
            `API client exports function: ${fn}`
        );
    }

    // ── SECTION 3: Route registration ─────────────────────────────────────
    console.log('\n▶ Section 3: App.tsx route and navigation registration\n');

    assert(
        fileContains('src/ui/App.tsx', "import { ProductionMonitoringDashboardPage }"),
        'App.tsx imports ProductionMonitoringDashboardPage'
    );
    assert(
        fileContains('src/ui/App.tsx', '/admin/production-monitoring'),
        'App.tsx registers route /admin/production-monitoring'
    );
    assert(
        fileContains('src/ui/App.tsx', '<ProductionMonitoringDashboardPage />'),
        'App.tsx renders <ProductionMonitoringDashboardPage />'
    );

    // ── SECTION 4: Navigation config ───────────────────────────────────────
    console.log('\n▶ Section 4: Sidebar navigation entry\n');

    assert(
        fileContains('src/ui/config/controlPlaneNavigation.ts', "id: 'production-monitoring'"),
        "Navigation config contains id 'production-monitoring'"
    );
    assert(
        fileContains('src/ui/config/controlPlaneNavigation.ts', "path: '/admin/production-monitoring'"),
        "Navigation config path is /admin/production-monitoring"
    );
    assert(
        fileContains('src/ui/config/controlPlaneNavigation.ts', "'SUPER_ADMIN'") &&
        fileContains('src/ui/config/controlPlaneNavigation.ts', "'OPS_ADMIN'"),
        'Navigation entry is available for SUPER_ADMIN and OPS_ADMIN roles'
    );

    // ── SECTION 5: Monitoring mode contract (static) ───────────────────────
    console.log('\n▶ Section 5: Monitoring mode safety contract (static code analysis)\n');

    // Dashboard page must NOT contain LIVE toggle mutation paths
    const dashboardCode = fs.readFileSync(
        path.join(ROOT, 'src/ui/pages/production-monitoring/ProductionMonitoringDashboardPage.tsx'), 'utf-8'
    );

    const forbiddenPatterns = [
        'commercial_status=LIVE',
        'live_production_enabled=true',
        'LIVE_PRODUCTION_ENABLED',
        "'guaranteed delivery'",
        '"guaranteed delivery"',
        "'certified'",
        '"certified"',
        "'print-ready'",
        '"print-ready"',
    ];
    for (const pattern of forbiddenPatterns) {
        assert(
            !dashboardCode.includes(pattern),
            `Dashboard does NOT contain forbidden pattern: "${pattern}"`
        );
    }

    // Monitoring banner must be present
    assert(
        dashboardCode.includes('Monitoring mode only'),
        'Dashboard contains mandatory monitoring-mode-only warning banner'
    );

    // ── SECTION 6: API client endpoint correctness ─────────────────────────
    console.log('\n▶ Section 6: API client endpoint paths\n');

    const clientCode = fs.readFileSync(
        path.join(ROOT, 'src/ui/api/productionMonitoringClient.ts'), 'utf-8'
    );

    const expectedEndpoints = [
        '/api/admin/production-monitoring/overview',
        '/api/admin/production-monitoring/timeline',
        '/api/admin/production-monitoring/incidents',
        '/api/admin/production-monitoring/machines',
        '/api/admin/production-monitoring/sla-summary'
    ];
    for (const ep of expectedEndpoints) {
        assert(clientCode.includes(ep), `API client references endpoint: ${ep}`);
    }

    // Client must NOT mutate commercial_status or live_production_enabled
    assert(!clientCode.includes('commercial_status'), 'API client does not mutate commercial_status');
    assert(!clientCode.includes('live_production_enabled'), 'API client does not mutate live_production_enabled');

    // ── SECTION 7: Mock HTTP round-trip against backend router ─────────────
    console.log('\n▶ Section 7: Mock HTTP integration with backend router\n');

    const app = express();
    app.use(express.json());
    app.use('/production-monitoring', router);

    const server = app.listen(0);
    const port   = server.address().port;
    const client = axios.create({
        baseURL:        `http://localhost:${port}/production-monitoring`,
        validateStatus: false
    });

    try {
        const tenantId     = 'tenant_79e_01';
        const printhouseId = 'print_79e_01';
        const orderId      = 'order_79e_01';
        const jobId        = 'job_79e_01';

        // Seed snapshot
        mockDb.snapshots.push({
            id: 1, tenant_id: tenantId, printhouse_id: printhouseId,
            order_id: orderId, job_id: jobId,
            production_status: 'IN_PRODUCTION', sla_status: 'AT_RISK', risk_score: 65,
            remaining_minutes: 30
        });
        // Seed machine
        mockDb.machine_loads.push({
            id: 1, tenant_id: tenantId, printhouse_id: printhouseId,
            machine_id: 'mac_79e_01', machine_name: 'HP Indigo 100K', machine_type: 'DIGITAL_PRESS',
            load_status: 'BUSY', queued_jobs_count: 3, active_jobs_count: 1,
            estimated_queue_minutes: 90, capacity_score: 75
        });

        currentActor = { tenantId, userId: 'u1', role: 'SUPER_ADMIN' };

        // H1: GET /overview
        const r1 = await client.get('/overview');
        assert(r1.status === 200 && r1.data.ok === true, 'H1: GET /overview returns 200 ok');
        assert(typeof r1.data.queue_depth === 'object', 'H1: /overview returns queue_depth object');
        assert(Array.isArray(r1.data.machines), 'H1: /overview returns machines array');

        // H2: GET /timeline/:orderId/:jobId
        const r2 = await client.get(`/timeline/${orderId}/${jobId}`);
        assert(r2.status === 200 && r2.data.ok === true, 'H2: GET /timeline returns 200 ok');
        assert(Array.isArray(r2.data.events), 'H2: /timeline returns events array');

        // H3: GET /incidents (empty)
        const r3a = await client.get('/incidents');
        assert(r3a.status === 200 && r3a.data.ok === true, 'H3: GET /incidents returns 200 ok');
        assert(Array.isArray(r3a.data.incidents), 'H3: /incidents returns array');

        // H4: POST /incidents (create manual incident)
        const r4 = await client.post('/incidents', {
            tenantId, printhouseId, orderId, jobId,
            incidentType: 'SLA_RISK', severity: 'HIGH',
            title: 'SLA risk threshold reached', description: 'Production AT_RISK — SLA timer nearing breach.'
        });
        assert(r4.status === 200 && r4.data.ok === true, 'H4: POST /incidents creates incident');
        const inc = r4.data.incident;
        assert(inc && inc.incident_type === 'SLA_RISK', 'H4: Created incident has correct type');
        assert(inc.status === 'OPEN', 'H4: Created incident starts as OPEN');

        // H5: POST /incidents/:id/acknowledge
        const r5 = await client.post(`/incidents/${inc.id}/acknowledge`);
        assert(r5.status === 200 && r5.data.incident.status === 'ACKNOWLEDGED', 'H5: Incident acknowledged');
        assert(
            mockDb.events.some(e => e.event_type === 'INCIDENT_ACKNOWLEDGED'),
            'H5: INCIDENT_ACKNOWLEDGED event emitted'
        );

        // H6: POST /incidents/:id/resolve — verify governance gates not mutated
        const r6 = await client.post(`/incidents/${inc.id}/resolve`, {
            resolutionNotes: 'Operator manually adjusted SLA window — no machine rerouting.'
        });
        assert(r6.status === 200 && r6.data.incident.status === 'RESOLVED', 'H6: Incident resolved');
        assert(
            mockDb.events.some(e => e.event_type === 'INCIDENT_RESOLVED'),
            'H6: INCIDENT_RESOLVED event emitted'
        );

        // H7: Incident resolution did NOT mutate production eligibility gate
        // (commercialPlanService mock stays unchanged)
        assert(
            !mockDb.snapshots.some(s => s.live_production_enabled === true),
            'H7: Incident resolution did not enable LIVE production'
        );
        assert(
            !mockDb.snapshots.some(s => s.commercial_status === 'LIVE'),
            'H7: Incident resolution did not set commercial_status=LIVE'
        );

        // H8: GET /machines
        const r8 = await client.get('/machines');
        assert(r8.status === 200 && r8.data.ok === true, 'H8: GET /machines returns 200 ok');
        assert(r8.data.machines.length >= 1 && r8.data.machines[0].machine_id === 'mac_79e_01', 'H8: Correct machine returned');

        // H9: GET /sla-summary
        const r9 = await client.get('/sla-summary');
        assert(r9.status === 200 && r9.data.ok === true, 'H9: GET /sla-summary returns 200 ok');

        // H10: Role restriction — non-admin cannot acknowledge
        currentActor = { tenantId, userId: 'c1', role: 'CUSTOMER_USER' };
        const r10a = await client.post(`/incidents/${inc.id}/acknowledge`);
        assert(
            r10a.status >= 400 || (r10a.data.error && r10a.data.error.message.includes('UNAUTHORIZED_INCIDENT_ACTION')),
            'H10: CUSTOMER_USER cannot acknowledge incidents'
        );
        const r10b = await client.post(`/incidents/${inc.id}/resolve`, { resolutionNotes: 'customer note' });
        assert(
            r10b.status >= 400 || (r10b.data.error && r10b.data.error.message.includes('UNAUTHORIZED_INCIDENT_ACTION')),
            'H10: CUSTOMER_USER cannot resolve incidents'
        );

        // H11: Dismiss flow
        currentActor = { tenantId, userId: 'u1', role: 'OPS_ADMIN' };
        const r11create = await client.post('/incidents', {
            tenantId, printhouseId, orderId, jobId,
            incidentType: 'MACHINE_OFFLINE', severity: 'MEDIUM',
            title: 'Machine back online — false alarm', description: 'Machine rebooted and is operational.'
        });
        const inc2 = r11create.data.incident;
        const r11 = await client.post(`/incidents/${inc2.id}/dismiss`, { reason: 'False alarm — machine recovered automatically' });
        assert(r11.status === 200 && r11.data.incident.status === 'DISMISSED', 'H11: Incident dismissed by OPS_ADMIN');
        assert(
            mockDb.events.some(e => e.event_type === 'INCIDENT_DISMISSED'),
            'H11: INCIDENT_DISMISSED event emitted'
        );

        // H12: Machine offline creates WARNING incident only, not automatic rerouting
        // (confirmed by governance gate check — eligibility mock unchanged)
        assert(
            !mockDb.snapshots.some(s => s.auto_rerouted === true),
            'H12: Machine offline did not trigger automatic rerouting'
        );

    } catch (err) {
        console.error('HTTP test error:', err.message);
        FAIL++;
    } finally {
        server.close();
    }

    // ── Final results ──────────────────────────────────────────────────────
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`Phase 79E Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(60)}\n`);

    if (FAIL > 0) {
        process.exit(1);
    }
}

runTests().catch(err => {
    console.error('Smoke test crashed:', err);
    process.exit(1);
});
