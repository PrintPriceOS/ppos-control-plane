/**
 * Admin Production Operations Routes
 * 
 * Secure backend API for control plane operators to manage print nodes and production capacity.
 */
const express = require('express');
const router = express.Router();
const { requireAdmin, resolveActorContext, requireApprovedPrinthouse } = require('../middleware/auth');
const nodeService = require('../services/ManufacturingNodeService');
const packageService = require('../services/ManufacturingPackageService');
const bundleService = require('../services/ManufacturingBundleService');
const matchingService = require('../services/printNodeMatchingService');
const dispatchService = require('../services/ManufacturingDispatchService');
const eventService = require('../services/ManufacturingEventService');
const machineRegistry = require('../services/machineRegistryService');

// Apply admin protection to all routes
router.use(requireAdmin);
// Security: For production operations, ensure the printhouse node is APPROVED
router.use(requireApprovedPrinthouse);

/**
 * GET /api/admin/production/nodes
 * List all nodes with filtering support
 */
router.get('/nodes', async (req, res) => {
  try {
    const filters = { ...req.query };
    const context = resolveActorContext(req);
    
    const nodes = await nodeService.listNodes(filters, context);
    res.json({ ok: true, nodes });
  } catch (error) {
    res.status(500).json({ ok: false, error: { code: 'NODE_LIST_FAILED', message: error.message } });
  }
});

/**
 * GET /api/admin/production/nodes/:nodeId
 * Detailed node information
 */
router.get('/nodes/:nodeId', async (req, res) => {
  try {
    const context = resolveActorContext(req);
    const node = await nodeService.getNode(req.params.nodeId, context);
    
    if (!node) {
      return res.status(404).json({ ok: false, error: { code: 'NODE_NOT_FOUND', message: 'Print node not found' } });
    }
    
    res.json({ ok: true, node });
  } catch (error) {
    const status = error.message.includes('FORBIDDEN') ? 403 : 500;
    res.status(status).json({ ok: false, error: { code: 'NODE_FETCH_FAILED', message: error.message } });
  }
});

/**
 * POST /api/admin/production/nodes
 * Register a new print node from a machine profile
 */
router.post('/nodes', async (req, res) => {
  try {
    const context = resolveActorContext(req);
    const nodeData = req.body;

    if (!nodeData.companyName || !nodeData.machineProfile) {
      return res.status(400).json({ 
        ok: false, 
        error: { code: 'MISSING_PARAMS', message: 'companyName and machineProfile are required' } 
      });
    }

    const node = await nodeService.createNode(nodeData, context);
    res.status(201).json({ ok: true, node });
  } catch (error) {
    const status = error.message.includes('UNAUTHORIZED') ? 401 : 500;
    res.status(status).json({ ok: false, error: { code: 'NODE_CREATION_FAILED', message: error.message } });
  }
});

/**
 * PATCH /api/admin/production/nodes/:nodeId
 * Update node status, metadata, or machine profile
 */
router.patch('/nodes/:nodeId', async (req, res) => {
  try {
    const context = resolveActorContext(req);
    const updates = req.body;

    const node = await nodeService.updateNode(req.params.nodeId, updates, context);
    res.json({ ok: true, node });
  } catch (error) {
    const status = error.message.includes('NOT_FOUND') ? 404 : (error.message.includes('FORBIDDEN') ? 403 : 500);
    res.status(status).json({ ok: false, error: { code: 'NODE_UPDATE_FAILED', message: error.message } });
  }
});

// --- Machine Registry ---

/**
 * GET /api/admin/production/nodes/:nodeId/machines
 * List all machines for a specific node
 */
router.get('/nodes/:nodeId/machines', async (req, res) => {
  try {
    const machines = await machineRegistry.getMachinesForNode(req.params.nodeId);
    res.json({ ok: true, machines });
  } catch (error) {
    res.status(500).json({ ok: false, error: { code: 'MACHINE_LIST_FAILED', message: error.message } });
  }
});

/**
 * POST /api/admin/production/nodes/:nodeId/machines
 * Register or update a machine in a node
 */
router.post('/nodes/:nodeId/machines', async (req, res) => {
  try {
    const machine = await machineRegistry.registerMachine(req.params.nodeId, req.body);
    res.status(201).json({ ok: true, machine });
  } catch (error) {
    res.status(500).json({ ok: false, error: { code: 'MACHINE_REGISTRATION_FAILED', message: error.message } });
  }
});

// --- Production Packages ---

/**
 * GET /api/admin/production/packages
 */
router.get('/packages', async (req, res) => {
  try {
    const filters = { ...req.query };
    const context = resolveActorContext(req);
    
    const packages = await packageService.listPackages(filters, context);
    res.json({ ok: true, packages });
  } catch (error) {
    res.status(500).json({ ok: false, error: { code: 'PACKAGE_LIST_FAILED', message: error.message } });
  }
});

/**
 * GET /api/admin/production/packages/:packageId
 */
router.get('/packages/:packageId', async (req, res) => {
  try {
    const context = resolveActorContext(req);
    const pkg = await packageService.getPackage(req.params.packageId, context);
    
    if (!pkg) {
      return res.status(404).json({ ok: false, error: { code: 'PACKAGE_NOT_FOUND', message: 'Production package not found' } });
    }
    
    res.json({ ok: true, package: pkg });
  } catch (error) {
    const status = error.message.includes('FORBIDDEN') ? 403 : 500;
    res.status(status).json({ ok: false, error: { code: 'PACKAGE_FETCH_FAILED', message: error.message } });
  }
});

/**
 * POST /api/admin/production/packages
 * Create a new production package from preflight job/artifact
 */
router.post('/packages', async (req, res) => {
  try {
    const context = resolveActorContext(req);
    const packageData = req.body;

    if (!packageData.sourceJobId || !packageData.sourceArtifactId) {
      return res.status(400).json({ 
        ok: false, 
        error: { code: 'MISSING_PARAMS', message: 'sourceJobId and sourceArtifactId are required' } 
      });
    }

    const pkg = await packageService.createPackage(packageData, context);
    res.status(201).json({ ok: true, package: pkg });
  } catch (error) {
    const status = error.message.includes('NOT_FOUND') ? 404 : (error.message.includes('FORBIDDEN') ? 403 : 400);
    res.status(status).json({ ok: false, error: { code: 'PACKAGE_CREATION_FAILED', message: error.message } });
  }
});

/**
 * PATCH /api/admin/production/packages/:packageId/status
 * Transition package status
 */
router.patch('/packages/:packageId/status', async (req, res) => {
  try {
    const context = resolveActorContext(req);
    const { status } = req.body;

    if (!status) {
        return res.status(400).json({ ok: false, error: { code: 'MISSING_PARAMS', message: 'status is required' } });
    }

    const pkg = await packageService.updatePackageStatus(req.params.packageId, status, context);
    res.json({ ok: true, package: pkg });
  } catch (error) {
    const status = error.message.includes('NOT_FOUND') ? 404 : (error.message.includes('INVALID_TRANSITION') ? 400 : 403);
    res.status(status).json({ ok: false, error: { code: 'STATUS_UPDATE_FAILED', message: error.message } });
  }
});

/**
 * GET /api/admin/production/packages/:packageId/bundle
 * Download the production-ready ZIP bundle
 */
router.get('/packages/:packageId/bundle', async (req, res) => {
  const context = resolveActorContext(req);
  const packageId = req.params.packageId;

  try {
    const { stream, filename } = await bundleService.generateBundle(packageId, context);

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    stream.pipe(res);

    // Archiver error handling
    stream.on('error', (err) => {
      console.error(`[BUNDLE-STREAM-ERROR][${packageId}]`, err);
      if (!res.headersSent) {
        res.status(500).json({ ok: false, error: { code: 'STREAM_ERROR', message: err.message } });
      }
    });

  } catch (error) {
    const status = error.message.includes('NOT_FOUND') ? 404 : (error.message.includes('FORBIDDEN') ? 403 : 500);
    res.status(status).json({ ok: false, error: { code: 'BUNDLE_FAILED', message: error.message } });
  }
});

/**
 * POST /api/admin/production/packages/:packageId/match
 * Find compatible print nodes for a package
 */
router.post('/packages/:packageId/match', async (req, res) => {
  const context = resolveActorContext(req);
  const packageId = req.params.packageId;

  try {
    const result = await matchingService.findMatches(packageId, context);
    res.json({ ok: true, ...result });
  } catch (error) {
    const status = error.message.includes('NOT_FOUND') ? 404 : (error.message.includes('FORBIDDEN') ? 403 : 500);
    res.status(status).json({ ok: false, error: { code: 'MATCHING_FAILED', message: error.message } });
  }
});

// --- Production Dispatches ---

/**
 * GET /api/admin/production/dispatches
 */
router.get('/dispatches', async (req, res) => {
  try {
    const filters = { ...req.query };
    const context = resolveActorContext(req);
    
    const dispatches = await dispatchService.listDispatches(filters, context);
    res.json({ ok: true, dispatches });
  } catch (error) {
    res.status(500).json({ ok: false, error: { code: 'DISPATCH_LIST_FAILED', message: error.message } });
  }
});

/**
 * GET /api/admin/production/dispatches/:dispatchId
 */
router.get('/dispatches/:dispatchId', async (req, res) => {
  try {
    const context = resolveActorContext(req);
    const dispatch = await dispatchService.getDispatch(req.params.dispatchId, context);
    
    if (!dispatch) {
      return res.status(404).json({ ok: false, error: { code: 'DISPATCH_NOT_FOUND', message: 'Dispatch record not found' } });
    }
    
    res.json({ ok: true, dispatch });
  } catch (error) {
    const status = error.message.includes('FORBIDDEN') ? 403 : 500;
    res.status(status).json({ ok: false, error: { code: 'DISPATCH_FETCH_FAILED', message: error.message } });
  }
});

/**
 * POST /api/admin/production/packages/:packageId/dispatch
 * Dispatch a package to a specific node
 */
router.post('/packages/:packageId/dispatch', async (req, res) => {
  try {
    const context = resolveActorContext(req);
    const { nodeId, message, expiresAt } = req.body;

    if (!nodeId) {
      return res.status(400).json({ ok: false, error: { code: 'MISSING_PARAMS', message: 'nodeId is required' } });
    }

    const dispatch = await dispatchService.createDispatch(req.params.packageId, nodeId, { message, expiresAt }, context);
    res.status(201).json({ ok: true, dispatch });
  } catch (error) {
    const status = error.message.includes('NOT_FOUND') ? 404 : (error.message.includes('FORBIDDEN') ? 403 : 400);
    res.status(status).json({ ok: false, error: { code: 'DISPATCH_FAILED', message: error.message } });
  }
});

/**
 * POST /api/admin/production/dispatches/:dispatchId/accept
 */
router.post('/dispatches/:dispatchId/accept', async (req, res) => {
  try {
    const context = resolveActorContext(req);
    const dispatch = await dispatchService.acceptDispatch(req.params.dispatchId, context);
    res.json({ ok: true, dispatch });
  } catch (error) {
    const status = error.message.includes('NOT_FOUND') ? 404 : (error.message.includes('FORBIDDEN') ? 403 : 400);
    res.status(status).json({ ok: false, error: { code: 'ACCEPT_FAILED', message: error.message } });
  }
});

/**
 * POST /api/admin/production/dispatches/:dispatchId/reject
 */
router.post('/dispatches/:dispatchId/reject', async (req, res) => {
  try {
    const context = resolveActorContext(req);
    const { reason } = req.body;
    const dispatch = await dispatchService.rejectDispatch(req.params.dispatchId, reason, context);
    res.json({ ok: true, dispatch });
  } catch (error) {
    const status = error.message.includes('NOT_FOUND') ? 404 : (error.message.includes('FORBIDDEN') ? 403 : 400);
    res.status(status).json({ ok: false, error: { code: 'REJECT_FAILED', message: error.message } });
  }
});

// --- Production Events ---

/**
 * GET /api/admin/production/events
 * Global event list with RBAC
 */
router.get('/events', async (req, res) => {
  try {
    const filters = { ...req.query };
    const context = resolveActorContext(req);
    
    const events = await eventService.listGlobalEvents(filters, context);
    res.json({ ok: true, events });
  } catch (error) {
    res.status(500).json({ ok: false, error: { code: 'EVENT_LIST_FAILED', message: error.message } });
  }
});

/**
 * GET /api/admin/production/packages/:packageId/events
 * Package-specific timeline
 */
router.get('/packages/:packageId/events', async (req, res) => {
  try {
    const context = resolveActorContext(req);
    const events = await eventService.getPackageTimeline(req.params.packageId, context);
    res.json({ ok: true, events });
  } catch (error) {
    const status = error.message.includes('NOT_FOUND') ? 404 : (error.message.includes('FORBIDDEN') ? 403 : 500);
    res.status(status).json({ ok: false, error: { code: 'TIMELINE_FAILED', message: error.message } });
  }
});

// --- Production Financials ---

/**
 * GET /api/admin/production/financials
 * List financial ledger entries related to production
 */
router.get('/financials', async (req, res) => {
  try {
    const context = resolveActorContext(req);
    const db = require('../services/db');
    
    // Security: Only allow searching by tenant or if super admin
    let sql = `
      SELECT le.*, pkg.id as package_id
      FROM financial_ledger_entries le
      JOIN manufacturing_packages pkg ON le.transaction_id = CONCAT('prod_tx_', SUBSTRING(pkg.id, 1, 12))
      WHERE 1=1
    `;
    const params = [];

    if (context.role !== 'SUPER_ADMIN') {
      sql += ' AND (pkg.tenant_id = ? OR pkg.assigned_printer_tenant_id = ?)';
      params.push(context.tenantId, context.tenantId);
    }

    sql += ' ORDER BY le.created_at DESC LIMIT 100';

    const { rows } = await db.query(sql, params);
    res.json({ ok: true, financials: rows });
  } catch (error) {
    console.error('[ADMIN-PRODUCTION] Financial fetch error:', error);
    res.status(500).json({ ok: false, error: { code: 'FINANCIAL_LIST_FAILED', message: error.message } });
  }
});

// --- Manufacturing Queue (Phase 10 Intelligence Layer Integration) ---

/**
 * GET /api/admin/manufacturing/queue
 * Authoritative canonical source for the production manufacturing dispatch line.
 * Filters out engineering seeds/test dispatches by default to keep operator view clear.
 */
router.get('/queue', async (req, res) => {
  const mysqlClient = require('../services/mysqlClient');
  const includeSeeds = req.query.includeSeeds === 'true';

  try {
    // Fetch raw dispatches
    const dispatches = await mysqlClient.query('SELECT * FROM manufacturing_dispatches ORDER BY created_at DESC LIMIT 1000').catch(() => []);
    
    // Fetch preflight registry records to enrich job objects
    const preflightRows = await mysqlClient.query('SELECT job_id, status, type, policy, original_filename, canonical_payload_json FROM preflight_job_registry ORDER BY created_at DESC LIMIT 2000').catch(() => []);
    
    const preflightMap = new Map();
    preflightRows.forEach(row => {
      if (row.job_id) preflightMap.set(row.job_id, row);
    });

    const parseJson = (val) => {
      if (!val) return {};
      if (typeof val === 'object') return val;
      try { return JSON.parse(val); } catch (e) { return {}; }
    };

    let counts = {
      pending: 0,
      active: 0,
      rejected: 0,
      expired: 0,
      assigned: 0,
      completed: 0,
      capacityBlocked: 0,
      slaAtRisk: 0,
      seedsFiltered: 0
    };

    const allJobs = [];
    let hasProductionDispatches = false;

    dispatches.forEach(row => {
      const jobId = String(row.job_id || '').trim();
      const packageId = String(row.production_package_id || row.package_id || '').trim();
      const meta = parseJson(row.metadata_json);
      const reason = String(meta.reason || '').trim();

      // Seed row detection logic matching all requirements
      let isSeedRow = false;
      if (jobId.startsWith('TEST-JOB-') || packageId.startsWith('TEST-JOB-')) {
        isSeedRow = true;
      } else if (reason === 'INDUSTRIAL_VALIDATION_SEED') {
        isSeedRow = true;
      } else if (meta.validation_seed === true || meta.validation_seed === 'true') {
        isSeedRow = true;
      } else if (reason.startsWith('AUTONOMOUS_RECOVERY')) {
        const prevDispatch = String(meta.previous_dispatch || meta.previousDispatch || '').trim();
        if (prevDispatch.includes('TEST-JOB')) {
          isSeedRow = true;
        }
      }

      if (isSeedRow) {
        counts.seedsFiltered++;
      } else {
        hasProductionDispatches = true;
      }

      // Check SLA and capacity flags
      const statusStr = String(row.status || '').toUpperCase();
      const slaStr = String(row.sla_status || '').toUpperCase();
      const combinedMetaStr = JSON.stringify(meta).toUpperCase();

      const isSlaAtRisk = statusStr === 'SLA_AT_RISK' || slaStr === 'SLA_AT_RISK' || combinedMetaStr.includes('SLA_AT_RISK');
      const isCapacityBlocked = statusStr === 'CAPACITY_BLOCKED' || slaStr === 'CAPACITY_BLOCKED' || combinedMetaStr.includes('CAPACITY_BLOCKED');

      // Populate counts only for non-seed rows (or maintain standard counts as requested)
      if (!isSeedRow) {
        if (statusStr === 'PENDING') counts.pending++;
        else if (statusStr === 'ASSIGNED') counts.assigned++;
        else if (statusStr === 'IN_PRODUCTION' || statusStr === 'PROCESSING' || statusStr === 'ACTIVE') counts.active++;
        else if (statusStr === 'REJECTED') counts.rejected++;
        else if (statusStr === 'EXPIRED') counts.expired++;
        else if (statusStr === 'COMPLETED') counts.completed++;

        if (isCapacityBlocked) counts.capacityBlocked++;
        if (isSlaAtRisk) counts.slaAtRisk++;
      }

      // Populate Job details from Preflight Registry
      let jobObj = {
        filename: 'unassigned_carrier.pdf',
        policy: 'STANDARD BASELINE PERMIT',
        preflightStatus: 'UNPROCESSED',
        riskScore: 0,
        certifiable: false,
        issueCount: 0,
        artifactStatus: 'NONE'
      };

      if (jobId && preflightMap.has(jobId)) {
        const pJob = preflightMap.get(jobId);
        const payload = parseJson(pJob.canonical_payload_json);
        const resObj = payload?.result || payload || {};

        const fName = pJob.original_filename || pJob.filename || payload.filename || resObj.filename;
        if (fName) jobObj.filename = fName;

        if (pJob.policy) jobObj.policy = pJob.policy;

        jobObj.preflightStatus = pJob.status || resObj.analysis_status || 'ANALYZED';
        jobObj.riskScore = resObj.risk_score !== undefined ? resObj.risk_score : (resObj.riskScore || 0);
        jobObj.certifiable = !!resObj.certifiable;
        jobObj.issueCount = resObj.summary?.issue_count || resObj.summary?.issueCount || 0;

        const artStatus = resObj.artifactIntegrity?.status || resObj.artifactStatus;
        if (artStatus) {
          jobObj.artifactStatus = artStatus;
        } else if (resObj.analysis_status === 'COMPLETE_ARTIFACTS' || resObj.analysis_status === 'CERTIFIED') {
          jobObj.artifactStatus = 'READY';
        } else if (resObj.analysis_status === 'PARTIAL_ARTIFACTS') {
          jobObj.artifactStatus = 'PARTIAL';
        } else {
          jobObj.artifactStatus = 'READY';
        }
      } else if (isSeedRow) {
        jobObj.filename = 'validation_seed_spec.pdf';
        jobObj.preflightStatus = 'VALIDATION_SEED';
        jobObj.artifactStatus = 'READY';
        jobObj.policy = 'INDUSTRIAL_SEED_POLICY';
      }

      // Build normalized row
      const normalizedRow = {
        ...row,
        id: row.id || row.dispatch_id || `disp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        dispatchId: row.id || row.dispatch_id || `disp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        jobId: row.job_id || '',
        job_id: row.job_id || '',
        node_id: row.node_id || row.print_node_id || '',
        machine_id: row.machine_id || '',
        productionPackageId: row.production_package_id || row.package_id || '',
        tenantId: row.tenant_id || '',
        nodeId: row.node_id || row.print_node_id || '',
        machineId: row.machine_id || '',
        printhouseId: row.printhouse_id || row.node_id || row.print_node_id || '',
        status: row.status || 'PENDING',
        slaStatus: row.sla_status || (isSlaAtRisk ? 'SLA_AT_RISK' : 'NORMAL'),
        priority: row.priority || 'STANDARD',
        estimatedCost: row.estimated_cost !== undefined ? parseFloat(row.estimated_cost || 0) : 0,
        estimatedMargin: row.estimated_margin !== undefined ? parseFloat(row.estimated_margin || 0) : 0,
        reservedFrom: row.reserved_from || null,
        reservedUntil: row.reserved_until || null,
        createdAt: row.created_at || null,
        updatedAt: row.updated_at || null,
        isSeed: isSeedRow,
        sourceStatus: "LIVE_MES",
        job: jobObj
      };

      // Filter based on includeSeeds toggle
      if (includeSeeds || !isSeedRow) {
        allJobs.push(normalizedRow);
      }
    });

    // Handle Task 7 condition exactly:
    if (!hasProductionDispatches && counts.seedsFiltered > 0 && !includeSeeds) {
      return res.json({
        ok: true,
        source_status: "SEEDS_ONLY",
        counts,
        jobs: [],
        message: "Only validation seed dispatches are present. No production manufacturing dispatches registered."
      });
    }

    res.json({
      ok: true,
      source_status: "LIVE_MES",
      counts,
      jobs: allJobs
    });

  } catch (err) {
    console.error('[MANUFACTURING-QUEUE] Error fetching authoritative dispatches:', err);
    res.status(500).json({
      ok: false,
      source_status: "SOURCE_UNAVAILABLE",
      counts: { pending: 0, active: 0, rejected: 0, expired: 0, assigned: 0, completed: 0, capacityBlocked: 0, slaAtRisk: 0, seedsFiltered: 0 },
      jobs: [],
      error: err.message
    });
  }
});

module.exports = router;
