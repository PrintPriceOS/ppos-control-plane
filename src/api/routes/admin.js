// routes/admin.js
const express = require("express");
const { requireAdmin, resolveActorContext } = require("../middleware/auth");
const db = require("../services/mysqlClient");

const router = express.Router();
router.use(express.json()); // Ensure req.body is parsed for POST requests

// PUBLIC DIAGNOSTICS (No Auth)
router.get('/test-trace', (req, res) => {
  res.json({
    ok: true,
    message: 'Admin Router Reachable',
    path: req.path,
    originalUrl: req.originalUrl,
    baseUrl: req.baseUrl
  });
});

router.get('/test-headers', (req, res) => {
  res.json({
    ok: true,
    headers: req.headers,
    authHeaderFound: !!req.headers['authorization'],
    authHeaderValue: req.headers['authorization'] ? 'PRESENT (HIDDEN)' : 'MISSING'
  });
});

router.use(requireAdmin);

// PROTECTED DIAGNOSTICS (Require Auth)
router.get('/verify', (req, res) => {
  res.json({
    ok: true,
    message: 'Token Validated',
    user: req.user
  });
});

router.get('/routes/debug', (req, res) => {
  res.json({
    ok: true,
    mountedGroups: [
      '/machines (Forensic Machine Intelligence)',
      '/connect',
      '/network',
      '/routing/economic',
      '/routing',
      '/marketplace/ready',
      '/marketplace',
      '/governance',
      '/civilization',
      '/interplanetary',
      '/reality',
      '/singularity',
      '/pricing',
      '/offers',
      '/commercial',
      '/autonomous',
      '/finance',
      '/control',
      '/intelligence',
      '/optimization',
      '/learning',
      '/optimization-autonomy',
      '/agents',
      '/federation',
      '/global',
      '/printhouses',
      '/orders',
      '/preflight (Jobs & Policies)',
      '/production/notifications',
      '/manufacturing/notifications',
      '/production',
      '/manufacturing',
      '/forensics',
      '/telemetry',
      '/artifacts',
      '/workers',
      '/orchestration',
      '/provisioning',
      '/routing/decision',
      '/dispatch',
      '/nodes',
      '/predictive',
      '/anomaly',
      '/economic',
      '/materials',
      '/audit',
      '/jobs'
    ],
    timestamp: new Date().toISOString()
  });
});

router.use((req, res, next) => {
  const context = resolveActorContext(req);
  const path = req.path;
  const method = req.method;

  // 1. Scoped Worker Access Control
  if (context.role === 'WORKER_AGENT') {
    const isAllowedMachineEndpoint = 
      (method === 'POST' && path === '/workers/heartbeat') || 
      (method === 'POST' && path === '/artifacts/register');

    if (!isAllowedMachineEndpoint) {
      return res.status(403).json({ 
        ok: false, 
        error: { code: 'FORBIDDEN', message: 'Machine account restricted to heartbeat and artifact registration.' } 
      });
    }
  }

  // 2. Suppress Noise for frequent endpoints in Production
  const isFrequent = [
    '/workers/heartbeat',
    '/telemetry/industrial',
    '/production/notifications',
    '/manufacturing/notifications'
  ].includes(path);

  const showDebug = process.env.PPOS_DEBUG_ADMIN_ROUTER === 'true';

  if (showDebug && !isFrequent) {
    console.log(`[DEBUG-ADMIN-ROUTER] Incoming: ${method} ${req.originalUrl} | BasePath: ${req.baseUrl} | Path: ${path}`);
  }

  next();
});

// Import sub-routers
const connectAdminRouter = require('./connectAdmin');
const routingAdminRouter = require('./routingAdmin');
const marketplaceAdminRouter = require('./marketplaceAdmin');
const governanceAdminRouter = require('./governanceAdmin');
const civilizationAdminRouter = require('./civilizationAdmin');
const interplanetaryAdminRouter = require('./interplanetaryAdmin');
const realityAdminRouter = require('./realityAdmin');
const singularityAdminRouter = require('./singularityAdmin');
const economicRoutingAdminRouter = require('./economicRoutingAdmin');
const pricingAdminRouter = require('./pricingAdmin');
const offersAdminRouter = require('./offersAdmin');
const negotiationAdminRouter = require('./negotiationAdmin');
const commercialCommitmentAdminRouter = require('./commercialCommitmentAdmin');
const autonomyAdminRouter = require('./autonomyAdmin');
const autonomyFinanceRouter = require('./autonomyFinanceAdmin');
const adminControlRoutes = require('./adminControl');
const intelligenceAdminRouter = require('./intelligenceAdmin');
const optimizationAdminRouter = require('./optimizationAdmin');
const learningAdminRouter = require('./learningAdmin');
const optimizationAutonomyAdminRouter = require('./optimizationAutonomyAdmin');
const agentAdminRouter = require('./agentAdmin');
const federationAdminRouter = require('./federationAdmin');
const globalGovernanceAdminRouter = require('./globalGovernanceAdmin');
const printhousesAdminRouter = require('./printhousesAdmin');
const printhouseCapabilitiesRouter = require('./printhouseCapabilities');
const ordersAdminRouter = require('./ordersAdmin');
const adminPreflightJobsRouter = require('./adminPreflightJobs');
const preflightAdminRouter = require('./adminPreflight');
const productionAdminRouter = require('./adminProduction');
const notificationsRouter = require('./notifications');
const forensicsAdminRouter = require('./forensicsAdmin');
const telemetryAdminRouter = require('./telemetryAdmin');
const artifactAdminRouter = require('./artifactAdmin');
const workerAdminRouter = require('./workerAdmin');
const orchestrationAdminRouter = require('./orchestrationAdmin');
const industrialProvisioningAdminRouter = require('./industrialProvisioningAdmin');
const industrialRoutingAdminRouter = require('./industrialRoutingAdmin');
const productionDispatchAdminRouter = require('./productionDispatchAdmin');
const machineDetailsAdminRouter = require('./machineDetailsAdmin');
const adminAssetsRouter = require('./adminAssets');
const adminMarketplaceOrdersRouter = require('./adminMarketplaceOrders');
const adminMarketplacePrinthouseHandoffRouter = require('./adminMarketplacePrinthouseHandoff');
const adminTenantGovernanceRouter = require('./adminTenantGovernance');
const adminTenantPilotRouter = require('./adminTenantPilot');
const adminTenantBillingRouter = require('./adminTenantBilling');
const adminProductionMonitoringRouter = require('./adminProductionMonitoring');
const adminBillingRouter = require('./adminBilling');

// Financial Operations Routers
const adminFinancialOperationsComplianceReporting = require('./adminFinancialOperationsComplianceReporting');
const adminFinancialOperationsDataRetentionPrivacy = require('./adminFinancialOperationsDataRetentionPrivacy');
const adminFinancialOperationsFinalReleaseCandidate = require('./adminFinancialOperationsFinalReleaseCandidate');
const adminFinancialOperationsGoLiveSimulation = require('./adminFinancialOperationsGoLiveSimulation');
const adminFinancialOperationsPartnerSandbox = require('./adminFinancialOperationsPartnerSandbox');
const adminFinancialOperationsPilotMode = require('./adminFinancialOperationsPilotMode');
const adminFinancialOperationsPreProductionRunbook = require('./adminFinancialOperationsPreProductionRunbook');
const adminFinancialOperationsProductionActivationReview = require('./adminFinancialOperationsProductionActivationReview');
const adminFinancialOperationsProductionHardening = require('./adminFinancialOperationsProductionHardening');
const adminFinancialOperationsProviderContractSla = require('./adminFinancialOperationsProviderContractSla');
const adminFinancialOperationsProviderCredentialVault = require('./adminFinancialOperationsProviderCredentialVault');
const adminFinancialOperationsProviderEventReconciliation = require('./adminFinancialOperationsProviderEventReconciliation');
const adminFinancialOperationsProviderFailureRetry = require('./adminFinancialOperationsProviderFailureRetry');
const adminFinancialOperationsProviderSandbox = require('./adminFinancialOperationsProviderSandbox');
const adminFinancialOperationsProviderSettlementFiles = require('./adminFinancialOperationsProviderSettlementFiles');
const adminFinancialOperationsProviderWebhookSandbox = require('./adminFinancialOperationsProviderWebhookSandbox');
const adminFinancialOperationsReadiness = require('./adminFinancialOperationsReadiness');
const adminFinancialOperationsReleaseGates = require('./adminFinancialOperationsReleaseGates');
const adminFinancialReconciliation = require('./adminFinancialReconciliation');
const adminGovernedInvoices = require('./adminGovernedInvoices');
const adminPartnerSettlement = require('./adminPartnerSettlement');
const adminTaxVatReadiness = require('./adminTaxVatReadiness');
const adminProductionActivationGateRouter = require('./financialOperationsProductionActivationAdmin');
const financialOperationsProductionActivationDryRunAdmin = require('./financialOperationsProductionActivationDryRunAdmin');
const preProductionOperationalReadinessBoardAdmin = require('./preProductionOperationalReadinessBoardAdmin');
const productionDeploymentReadinessChecklistAdmin = require('./productionDeploymentReadinessChecklistAdmin');
const productionDeploymentDryRunAdmin = require('./productionDeploymentDryRunAdmin');
const productionObservabilityIncidentReadinessAdmin = require('./productionObservabilityIncidentReadinessAdmin');
const prelaunchSecurityComplianceHardeningAdmin = require('./prelaunchSecurityComplianceHardeningAdmin');
const finalPreproductionReleaseCandidateAdmin = require('./finalPreproductionReleaseCandidateAdmin');
const controlledProductionPilotActivationAdmin = require('./controlledProductionPilotActivationAdmin');
const internalOrderLifecyclePilotAdmin = require('./internalOrderLifecyclePilotAdmin');
const internalOrderLifecycleRuntimeVerificationAdmin = require('./internalOrderLifecycleRuntimeVerificationAdmin');
const foundingPrinthousePilotGateAdmin = require('./foundingPrinthousePilotGateAdmin');
const controlledPrinthouseHandoffPackageAdmin = require('./controlledPrinthouseHandoffPackageAdmin');
const sandboxCommercialPilotAdmin = require('./sandboxCommercialPilotAdmin');
const pilotEvidenceReviewGoNoGoAdmin = require('./pilotEvidenceReviewGoNoGoAdmin');
const limitedBetaPreparationGateAdmin = require('./limitedBetaPreparationGateAdmin');
const limitedBetaRuntimeAdmin = require('./limitedBetaRuntimeAdmin');
const controlledBetaCohortActivationAdmin = require('./controlledBetaCohortActivationAdmin');
const controlledBetaRuntimeObservationAdmin = require('./controlledBetaRuntimeObservationAdmin');
const controlledBetaOperationalReviewAdmin = require('./controlledBetaOperationalReviewAdmin');
const controlledBetaExpansionPreparationAdmin = require('./controlledBetaExpansionPreparationAdmin');
const controlledBetaInviteIssuanceAdmin = require('./controlledBetaInviteIssuanceAdmin');




/**
 * Mount Sub-routers (Core)
 */

// Moved Financial Operations and Root catch-alls to the bottom of the router mounts

router.use('/beta/runtime-observation', controlledBetaRuntimeObservationAdmin);
router.use('/beta/operational-review', controlledBetaOperationalReviewAdmin);
router.use('/beta/expansion-preparation', controlledBetaExpansionPreparationAdmin);
router.use('/beta/invite-issuance', controlledBetaInviteIssuanceAdmin);
router.use('/routing', routingAdminRouter);
router.use('/marketplace', marketplaceAdminRouter);
router.use('/governance', governanceAdminRouter);
router.use('/civilization', civilizationAdminRouter);
router.use('/interplanetary', interplanetaryAdminRouter);
router.use('/reality', realityAdminRouter);
router.use('/singularity', singularityAdminRouter);
router.use('/pricing', pricingAdminRouter);
router.use('/offers', offersAdminRouter);
router.use('/commercial', commercialCommitmentAdminRouter);
router.use('/autonomous', autonomyAdminRouter);
router.use('/finance', autonomyFinanceRouter);
router.use('/control', adminControlRoutes);
router.use('/intelligence', intelligenceAdminRouter);
router.use('/optimization', optimizationAdminRouter);
router.use('/learning', learningAdminRouter);
router.use('/optimization-autonomy', optimizationAutonomyAdminRouter);
router.use('/agents', agentAdminRouter);
router.use('/federation', federationAdminRouter);
router.use('/global', globalGovernanceAdminRouter);
router.use('/printhouses', printhousesAdminRouter);
router.use('/printhouse-capabilities', printhouseCapabilitiesRouter);
router.get('/machine-templates', async (req, res) => {
  try {
    const query = (req.query.q || '').trim().toLowerCase();
    const templates = printhouseCapabilitiesRouter.MACHINE_TEMPLATES || [];
    const filtered = templates.filter(t => 
        (t.manufacturer || '').toLowerCase().includes(query) || 
        (t.model || '').toLowerCase().includes(query)
    );
    res.json({ ok: true, templates: filtered });
  } catch (err) {
    console.error('[ADMIN-ROUTER] Error listing templates:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});
router.use('/orders', ordersAdminRouter);
router.use('/preflight', adminPreflightJobsRouter);
router.use('/preflight', preflightAdminRouter);
router.use('/notifications', require('./adminNotifications'));
router.use('/production/notifications', notificationsRouter);
router.use('/manufacturing/notifications', notificationsRouter);
router.use('/production', productionAdminRouter);
router.use('/manufacturing', productionAdminRouter);
router.use('/forensics', forensicsAdminRouter);
router.use('/telemetry', telemetryAdminRouter);
router.use('/artifacts', artifactAdminRouter);
router.use('/workers', workerAdminRouter);
router.use('/orchestration', orchestrationAdminRouter);
router.use('/provisioning', industrialProvisioningAdminRouter);
router.use('/routing/decision', industrialRoutingAdminRouter); // Autonomous Routing
router.use('/dispatch', productionDispatchAdminRouter); // Execution Layer
router.use('/assets', adminAssetsRouter); // Production Asset Management
router.use('/nodes', require('./printNodeAgentAdmin')); // Agent Layer
router.use('/predictive', require('./predictiveAdmin')); // Forecasting Layer
router.use('/anomaly', require('./anomalyAdmin')); // Anomaly & Drift Layer
router.use('/economic', require('./economicAdmin')); // Economic Optimization Layer
router.use('/machines', require('./machinesAdmin')); // Machine Fleet Layer
router.use('/materials', require('./materialsAdmin')); // Materials & Paper Catalog
router.use('/audit', require('./auditExplorerAdmin')); // Forensic Audit Explorer
router.use('/jobs', require('./jobsAdmin')); // Forensic Jobs Observability Layer
router.use('/dashboard', require('./adminDashboard')); // Production Mission Control Layer
router.use('/observability', require('./adminOnboardingObservability')); // Phase 6: De-mocking Observability



function rangeToInterval(range) {
  // soporta: 24h, 7d, 30d
  switch (range) {
    case "24h": return "INTERVAL 1 DAY";
    case "7d": return "INTERVAL 7 DAY";
    case "30d": return "INTERVAL 30 DAY";
    default: return "INTERVAL 1 DAY";
  }
}


// GET /api/admin/metrics/overview?range=24h
router.get("/metrics/overview", async (req, res) => {
  const interval = rangeToInterval(req.query.range);
  const context = resolveActorContext(req);
  
  let filterSql = '';
  const params = [];
  
  if (context.isPrinthouseUser) {
    filterSql = 'AND printhouse_id = ?';
    params.push(context.printhouseId);
  }

  try {
    const overviewRows = await db.query(
      `
      SELECT 
        COUNT(*) as total_jobs,
        (SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) / NULLIF(COUNT(*),0)) * 100 as success_rate,
        AVG(processing_ms) as avg_latency_ms,
        MAX(processing_ms) as max_latency_ms,
        (SUM(processing_ms) / 1000) as cost_proxy_seconds,
        SUM(value_generated) as total_value_generated,
        SUM(hours_saved) as total_hours_saved,
        AVG(risk_score_before) as avg_risk_before,
        AVG(risk_score_after) as avg_risk_after
      FROM metrics
      WHERE created_at >= NOW() - ${interval} ${filterSql};
      `,
      params
    );

    const overview = overviewRows[0] || {};

    const improveRows = await db.query(
      `
      SELECT 
        ((SUM(CASE WHEN delta_score > 0 THEN 1 ELSE 0 END) / NULLIF(COUNT(*),0)) * 100) as improvement_rate
      FROM metrics
      WHERE success = 1
        AND created_at >= NOW() - ${interval};
      `
    );
    const improve = improveRows[0] || {};

    const queueStatsRows = await db.query(
      `
      SELECT 
        SUM(CASE WHEN status IN ('QUEUED', 'RUNNING', 'FAILED') THEN 1 ELSE 0 END) as backlog,
        SUM(CASE WHEN status = 'RUNNING' THEN 1 ELSE 0 END) as active_jobs,
        COALESCE(TIMESTAMPDIFF(SECOND, MIN(CASE WHEN status = 'QUEUED' THEN created_at ELSE NULL END), NOW()), 0) as oldest_age_seconds
      FROM jobs;
      `
    );
    const queueStats = queueStatsRows[0] || {};

    res.json({
      totalJobs: Number(overview.total_jobs || 0),
      successRate: Number(overview.success_rate || 0),
      avgLatencyMs: Math.round(Number(overview.avg_latency_ms || 0)),
      maxLatencyMs: Math.round(Number(overview.max_latency_ms || 0)),
      p95LatencyMs: null,
      deltaImprovementRate: Number(improve.improvement_rate || 0),
      costProxy: Number(overview.cost_proxy_seconds || 0),
      totalValueGenerated: Number(overview.total_value_generated || 0),
      totalHoursSaved: Number(overview.total_hours_saved || 0),
      avgRiskBefore: Number(overview.avg_risk_before || 0),
      avgRiskAfter: Number(overview.avg_risk_after || 0),
      queueBacklog: Number(queueStats?.backlog || 0),
      activeJobs: Number(queueStats?.active_jobs || 0),
      oldestAgeSeconds: Number(queueStats?.oldest_age_seconds || 0)
    });
  } catch (err) {
    console.error('[ADMIN-API] Error fetching overview metrics:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/admin/metrics/tenants?range=7d
router.get("/metrics/tenants", async (req, res) => {
  const interval = rangeToInterval(req.query.range || "7d");

  try {
    const rows = await db.query(
      `
      SELECT 
        tenant_id,
        COUNT(*) as total_jobs,
        (SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) / NULLIF(COUNT(*),0)) * 100 as success_rate,
        AVG(processing_ms) as avg_latency_ms,
        SUM(value_generated) as total_value_generated,
        SUM(hours_saved) as total_hours_saved,
        MAX(created_at) as last_activity
      FROM metrics
      WHERE created_at >= NOW() - ${interval}
      GROUP BY tenant_id
      ORDER BY total_jobs DESC;
      `
    );

    res.json(rows.map(r => ({
      tenant_id: r.tenant_id,
      totalJobs: Number(r.total_jobs || 0),
      successRate: Number(r.success_rate || 0),
      avgLatencyMs: Math.round(Number(r.avg_latency_ms || 0)),
      totalValueGenerated: Number(r.total_value_generated || 0),
      totalHoursSaved: Number(r.total_hours_saved || 0),
      topPolicy: null,
      lastActivity: r.last_activity
    })));
  } catch (err) {
    console.error('[ADMIN-API] Error fetching tenant metrics:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/admin/tenants - Detailed tenant list for management (Phase 19)
router.get("/tenants", async (req, res) => {
  try {
    const rows = await db.query(`
      SELECT 
        id, name, status, plan, rate_limit_rpm, 
        plan_expires_at, last_active_at, daily_job_limit, 
        max_batch_size, created_at, metadata_json,
        plan_code, commercial_status, access_level,
        grace_started_at, grace_ends_at, grace_extended_until,
        limits_json, entitlements_json, module_access_json, governance_notes_json
      FROM tenants
      ORDER BY last_active_at DESC, created_at DESC;
    `);

    // Fetch API Keys count per tenant
    const keyCounts = await db.query(`
      SELECT tenant_id, COUNT(*) as key_count
      FROM api_keys
      WHERE revoked = FALSE
      GROUP BY tenant_id;
    `);

    // Fetch Daily Job Usage (Phase 19.5)
    const usageCounts = await db.query(`
      SELECT tenant_id, COUNT(*) as daily_count
      FROM jobs
      WHERE created_at >= CURDATE()
      GROUP BY tenant_id;
    `);

    const keyMap = keyCounts.reduce((acc, current) => {
      acc[current.tenant_id] = current.key_count;
      return acc;
    }, {});

    const usageMap = usageCounts.reduce((acc, current) => {
      acc[current.tenant_id] = current.daily_count;
      return acc;
    }, {});

    res.json(rows.map(t => ({
      ...t,
      keyCount: keyMap[t.id] || 0,
      dailyUsage: usageMap[t.id] || 0
    })));
  } catch (err) {
    console.error('[ADMIN-API] Error fetching detailed tenants:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/admin/tenants/:id - Update tenant settings (Phase 19)
// POST /api/admin/tenants/:id
router.post("/tenants/:id", async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  try {
    // 1. Get current state for history (Phase 20)
    const [current] = await db.query('SELECT plan, status FROM tenants WHERE id = ?', [id]);
    if (!current) return res.status(404).json({ ok: false, error: 'Tenant not found' });

    // 2. Perform Update
    const allowedFields = ['name', 'status', 'plan', 'rate_limit_rpm', 'plan_expires_at', 'daily_job_limit', 'max_batch_size', 'metadata_json', 'notification_settings_json'];
    const fieldsToUpdate = Object.keys(updates).filter(k => allowedFields.includes(k));

    if (fieldsToUpdate.length > 0) {
      const setClause = fieldsToUpdate.map(k => `${k} = ?`).join(', ');
      const values = fieldsToUpdate.map(k => {
        const val = updates[k];
        if (k === 'plan_expires_at' && !val) return null;
        if ((k === 'metadata_json' || k === 'notification_settings_json') && typeof val === 'object') {
          return JSON.stringify(val);
        }
        return val;
      });

      await db.query(`UPDATE tenants SET ${setClause} WHERE id = ?`, [...values, id]);
    }

    // 3. Log lifecycle events if plan or status changed
    if (updates.plan && updates.plan !== current.plan) {
      await db.query(`
        INSERT INTO tenant_plan_history (tenant_id, old_plan, new_plan, reason)
        VALUES (?, ?, ?, ?)
      `, [id, current.plan, updates.plan, 'Manual update via Admin Dashboard']);
    }

    if (updates.status && updates.status !== current.status) {
      await db.query(`
        INSERT INTO tenant_alerts_history (tenant_id, alert_type, details_json)
        VALUES (?, ?, ?)
      `, [id, 'STATUS_CHANGE', JSON.stringify({ old: current.status, new: updates.status })]);
    }

    res.json({ ok: true, message: `Tenant ${id} updated.` });
  } catch (err) {
    console.error('[ADMIN-API] Error updating tenant:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/admin/tenants/:id/usage?days=7
router.get("/tenants/:id/usage", async (req, res) => {
  const { id } = req.params;
  const days = Math.min(Number(req.query.days || 7), 30);

  try {
    const rows = await db.query(`
      SELECT date, jobs_count, batches_count, value_generated, hours_saved
      FROM tenant_usage_stats
      WHERE tenant_id = ?
      ORDER BY date DESC
      LIMIT ?
    `, [id, days]);

    res.json(rows.reverse()); // Return in chronological order
  } catch (err) {
    console.error('[ADMIN-API] Error fetching tenant usage stats:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/admin/tenants/:id/timeline
router.get("/tenants/:id/timeline", async (req, res) => {
  const { id } = req.params;

  try {
    const rows = await db.query(`
      (SELECT 'ALERT' as type, alert_type as event, details_json as details, created_at as timestamp 
       FROM tenant_alerts_history WHERE tenant_id = ?)
      UNION ALL
      (SELECT 'PLAN' as type, CONCAT(old_plan, ' -> ', new_plan) as event, JSON_OBJECT('reason', reason) as details, changed_at as timestamp
       FROM tenant_plan_history WHERE tenant_id = ?)
      ORDER BY timestamp DESC
      LIMIT 100
    `, [id, id]);

    res.json(rows);
  } catch (err) {
    console.error('[ADMIN-API] Error fetching tenant timeline:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/admin/tenants/:id/billing/:year/:month
// Support for range queries: ?from=YYYY-MM-DD&to=YYYY-MM-DD
// Precedence: If ?from and ?to are present, they override :year and :month.
router.get("/tenants/:id/billing/:year/:month", async (req, res) => {
  const { id, year, month } = req.params;
  const { from, to } = req.query;

  try {
    let startDate, endDate;

    if (from && to) {
      startDate = from;
      endDate = to;
    } else {
      startDate = `${year}-${month.padStart(2, '0')}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      endDate = `${year}-${month.padStart(2, '0')}-${lastDay}`;
    }

    // Prepend time to dates for precision
    const startTs = `${startDate} 00:00:00`;
    const nextDayDate = new Date(new Date(endDate).getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const endTsLimit = `${nextDayDate} 00:00:00`;

    const stats = await db.query(`
      SELECT 
        SUM(jobs_count) as total_jobs,
        SUM(batches_count) as total_batches,
        SUM(value_generated) as total_value,
        SUM(hours_saved) as total_hours,
        MAX(jobs_count) as peak_daily_jobs,
        AVG(jobs_count) as avg_jobs_per_day,
        (SELECT date FROM tenant_usage_stats 
         WHERE tenant_id = ? AND date >= ? AND date < ?
         ORDER BY jobs_count DESC LIMIT 1) as peak_day,
        (SELECT SUM(risk_reduction) FROM tenant_usage_stats
         WHERE tenant_id = ? AND date >= ? AND date < ?) as total_risk_reduction
      FROM tenant_usage_stats
      WHERE tenant_id = ? AND date >= ? AND date < ?
    `, [id, startDate, nextDayDate, id, startDate, nextDayDate, id, startDate, nextDayDate]);

    // Enhanced metrics: Policy distribution (as object)
    const policies = await db.query(`
      SELECT JSON_EXTRACT(metadata_json, '$.policy_slug') as policy_slug, COUNT(*) as count
      FROM api_audit_logs
      WHERE tenant_id = ? AND created_at >= ? AND created_at < ?
        AND JSON_EXTRACT(metadata_json, '$.policy_slug') IS NOT NULL
      GROUP BY policy_slug
      ORDER BY count DESC
    `, [id, startTs, endTsLimit]);

    const policyMap = policies.reduce((acc, curr) => {
      acc[curr.policy_slug] = curr.count;
      return acc;
    }, {});

    if (!stats[0] || stats[0].total_jobs === null) {
      return res.json({
        ok: true,
        period: from && to ? `${from} to ${to}` : `${year}-${month}`,
        usage: { total_jobs: 0, total_batches: 0, total_value: 0, total_hours: 0, total_risk_reduction: 0, avg_jobs_per_day: 0, policy_distribution: {} },
        message: "No usage data found for this period."
      });
    }

    res.json({
      ok: true,
      period: from && to ? `${from} to ${to}` : `${year}-${month}`,
      usage: {
        ...stats[0],
        policy_distribution: policyMap
      }
    });
  } catch (err) {
    console.error('[ADMIN-API] Error fetching billing data:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/admin/jobs implementation delegated to jobsAdmin.js router

// GET /api/admin/errors/top?range=24h
router.get("/errors/top", async (req, res) => {
  const interval = rangeToInterval(req.query.range || "7d");

  try {
    const rows = await db.query(
      `
    SELECT
    COALESCE(JSON_UNQUOTE(JSON_EXTRACT(error, '$.code')), 'UNKNOWN') as error_code,
      COUNT(*) as error_count,
      MAX(updated_at) as last_seen
  FROM jobs
  WHERE status = 'FAILED'
    AND created_at >= NOW() - ${interval}
    AND error IS NOT NULL
  GROUP BY error_code
  ORDER BY error_count DESC
  LIMIT 10;
    `
    );

    res.json(rows.map(r => ({
      errorCode: r.error_code || "UNKNOWN",
      count: Number(r.error_count || 0),
      lastSeen: r.last_seen
    })));
  } catch (err) {
    console.error('[ADMIN-API] Error fetching top errors:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Delegated to canonical auditExplorerAdmin router mounted at top priority under /audit

// GET /api/admin/queue  (stats BullMQ)
router.get("/queue", async (_req, res) => {
  try {
    const queue = require("../services/queue");
    if (queue && queue.getAdminStats) {
      const stats = await queue.getAdminStats();
      res.json(stats);
    } else {
      res.json({ ok: true, note: "queue stats not implemented in queue.js" });
    }
  } catch (err) {
    res.json({ ok: true, note: "queue stats not available", error: err.message });
  }
});

// POST /api/admin/help/analytics
router.post("/help/analytics", async (req, res) => {
  const { event_type, article_id, search_query, tenant_id, user_id } = req.body;

  if (!event_type) {
    return res.status(400).json({ ok: false, error: "event_type is required" });
  }

  try {
    const result = await db.query(
      `
      INSERT INTO audit_help_analytics(event_type, article_id, search_query, tenant_id, user_id)
    VALUES(?, ?, ?, ?, ?)
      `,
      [event_type, article_id || null, search_query || null, tenant_id || null, user_id || null]
    );

    res.json({ ok: true, id: result.insertId });
  } catch (err) {
    console.error('[ADMIN-API] Error saving help analytics:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});



// POST /api/admin/notifications/:id/cancel
router.post("/notifications/:id/cancel", async (req, res) => {
  try {
    await db.query("UPDATE notifications SET status = 'CANCELED' WHERE id = ? AND status = 'PENDING'", [req.params.id]);
    await db.query(`
        INSERT INTO notification_events (notification_id, event, metadata_json)
        VALUES (?, ?, ?)
    `, [req.params.id, 'NOTIFICATION_CANCELED', JSON.stringify({ trigger: 'admin_manual' })]);

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/admin/tenants/:id/notification-preferences
router.get("/tenants/:id/notification-preferences", async (req, res) => {
  try {
    const [prefs] = await db.query("SELECT * FROM tenant_notification_preferences WHERE tenant_id = ?", [req.params.id]);
    res.json({ ok: true, prefs: prefs || null });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// PUT /api/admin/tenants/:id/notification-preferences
router.put("/tenants/:id/notification-preferences", async (req, res) => {
  const { id } = req.params;
  const body = req.body;

  const fields = Object.keys(body).filter(k => k !== 'tenant_id' && k !== 'created_at' && k !== 'updated_at');
  if (fields.length === 0) return res.status(400).json({ ok: false, error: "No fields to update" });

  const setClause = fields.map(f => `${f} = ?`).join(", ");
  const values = fields.map(f => (f === 'email_recipients_json' ? JSON.stringify(body[f]) : body[f]));

  try {
    await db.query(`
            INSERT INTO tenant_notification_preferences (tenant_id, ${fields.join(", ")})
            VALUES (?, ${fields.map(() => "?").join(", ")})
            ON DUPLICATE KEY UPDATE ${setClause}
        `, [id, ...values, ...values]);

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/admin/engagement-signals
router.get('/engagement-signals', async (req, res) => {
  try {
    const rows = await db.query(`
            SELECT 
                ee.*,
                t.name as tenant_name
            FROM engagement_events ee
            JOIN tenants t ON ee.tenant_id = t.id
            ORDER BY ee.created_at DESC
            LIMIT 100
        `);
    res.json({ ok: true, signals: rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/admin/engagement-stats
router.get('/engagement-stats', async (req, res) => {
  try {
    const rows = await db.query(`
            SELECT 
                signal_type, 
                COUNT(*) as count,
                COUNT(DISTINCT tenant_id) as unique_tenants
            FROM engagement_events
            GROUP BY signal_type
        `);
    res.json({ ok: true, stats: rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/admin/cs-workflows
router.get('/cs-workflows', async (req, res) => {
  try {
    const rows = await db.query(`
            SELECT 
                cw.*,
                t.name as tenant_name
            FROM cs_workflows cw
            JOIN tenants t ON cw.tenant_id = t.id
            ORDER BY cw.updated_at DESC
            LIMIT 100
        `);
    res.json({ ok: true, workflows: rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Sub-routers moved to the top for priority matching

// ---------------------------------------------------------
// RE-MOUNT Root Sub-routers and Financial Operations AT THE BOTTOM
// These use '/' as base path, which can act as catch-alls and swallow other routes
// if placed too high in the middleware chain.
// ---------------------------------------------------------
router.use('/connect', connectAdminRouter);
router.use('/network', require('./networkOpsAdmin'));
router.use('/routing/economic', economicRoutingAdminRouter); // Important: more specific first
router.use('/marketplace/ready', negotiationAdminRouter); // Important: more specific first
router.use('/marketplace/orders', adminMarketplaceOrdersRouter);
router.use('/marketplace/printhouse-handoff', adminMarketplacePrinthouseHandoffRouter);
router.use('/tenant-governance', adminTenantGovernanceRouter);
router.use('/tenant-pilots', adminTenantPilotRouter);
router.use('/tenant-billing', adminTenantBillingRouter);
router.use('/billing', adminBillingRouter);           // Stripe Paywall Billing
router.use('/production-monitoring', adminProductionMonitoringRouter);

router.use('/', machineDetailsAdminRouter); // Forensic Machine Intelligence

// Mount Financial Operations Sub-routers under /financial-operations
router.use('/financial-operations', adminFinancialOperationsComplianceReporting);
router.use('/financial-operations', adminFinancialOperationsDataRetentionPrivacy);
router.use('/financial-operations', adminFinancialOperationsFinalReleaseCandidate);
router.use('/financial-operations', adminFinancialOperationsGoLiveSimulation);
router.use('/financial-operations', adminFinancialOperationsPartnerSandbox);
router.use('/financial-operations', adminFinancialOperationsPilotMode);
router.use('/financial-operations', adminFinancialOperationsPreProductionRunbook);
router.use('/financial-operations', adminFinancialOperationsProductionActivationReview);
router.use('/financial-operations', adminFinancialOperationsProductionHardening);
router.use('/financial-operations', adminFinancialOperationsProviderContractSla);
router.use('/financial-operations', adminFinancialOperationsProviderCredentialVault);
router.use('/financial-operations', adminFinancialOperationsProviderEventReconciliation);
router.use('/financial-operations', adminFinancialOperationsProviderFailureRetry);
router.use('/financial-operations', adminFinancialOperationsProviderSandbox);
router.use('/financial-operations', adminFinancialOperationsProviderSettlementFiles);
router.use('/financial-operations', adminFinancialOperationsProviderWebhookSandbox);
router.use('/financial-operations', adminFinancialOperationsReadiness);
router.use('/financial-operations', adminFinancialOperationsReleaseGates);
router.use('/financials/activation', adminProductionActivationGateRouter);
router.use('/financials/activation-dry-run', financialOperationsProductionActivationDryRunAdmin);
router.use('/pre-production/readiness-board', preProductionOperationalReadinessBoardAdmin);
router.use('/deployment/readiness', productionDeploymentReadinessChecklistAdmin);
router.use('/deployment/dry-run', productionDeploymentDryRunAdmin);
router.use('/operations/incident-readiness', productionObservabilityIncidentReadinessAdmin);
router.use('/prelaunch/security-compliance', prelaunchSecurityComplianceHardeningAdmin);
router.use('/preproduction/release-candidate', finalPreproductionReleaseCandidateAdmin);
router.use('/production/pilot-activation', controlledProductionPilotActivationAdmin);
router.use('/production/internal-order-lifecycle-pilot', internalOrderLifecyclePilotAdmin);
router.use('/production/internal-order-lifecycle-runtime-verification', internalOrderLifecycleRuntimeVerificationAdmin);
router.use('/production/founding-printhouse-pilot', foundingPrinthousePilotGateAdmin);
router.use('/production/printhouse-handoff-package', controlledPrinthouseHandoffPackageAdmin);
router.use('/production/sandbox-commercial-pilot', sandboxCommercialPilotAdmin);
router.use('/production/pilot-evidence-review', pilotEvidenceReviewGoNoGoAdmin);
router.use('/beta/preparation-gate', limitedBetaPreparationGateAdmin);
router.use('/beta/runtime', limitedBetaRuntimeAdmin);
router.use('/beta/cohort-activation', controlledBetaCohortActivationAdmin);



router.use('/financial-reconciliation', adminFinancialReconciliation);
router.use('/', adminGovernedInvoices);
router.use('/', adminPartnerSettlement);
router.use('/', adminTaxVatReadiness);


// Diagnostic Catch-all for Admin
router.all(/^(.*)$/, (req, res) => {
  console.warn(`[ADMIN-ROUTER-FALLTHROUGH] ${req.method} ${req.originalUrl} | Path: ${req.path}`);
  res.status(404).json({
    error: `[ADMIN-ROUTER-FALLTHROUGH] Route not found in admin router: ${req.originalUrl}`,
    method: req.method,
    path: req.path,
    baseUrl: req.baseUrl
  });
});

module.exports = router;
