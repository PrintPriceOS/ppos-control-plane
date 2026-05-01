/**
 * Admin Production Operations Routes
 * 
 * Secure backend API for control plane operators to manage print nodes and production capacity.
 */
const express = require('express');
const router = express.Router();
const requireAdmin = require('../middleware/requireAdmin');
const nodeService = require('../services/productionNodeService');
const packageService = require('../services/productionPackageService');
const bundleService = require('../services/productionBundleService');
const matchingService = require('../services/printNodeMatchingService');
const dispatchService = require('../services/productionDispatchService');
const eventService = require('../services/productionEventService');

// Apply admin protection to all routes
router.use(requireAdmin);

/**
 * Helper: Resolve Tenant Identity from user context
 */
function resolveContext(req) {
    return {
        userId: req.user.id,
        tenantId: req.user.tenantId || 'system',
        role: req.user.role
    };
}

/**
 * GET /api/admin/production/nodes
 * List all nodes with filtering support
 */
router.get('/nodes', async (req, res) => {
  try {
    const filters = { ...req.query };
    const context = resolveContext(req);
    
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
    const context = resolveContext(req);
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
    const context = resolveContext(req);
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
    const context = resolveContext(req);
    const updates = req.body;

    const node = await nodeService.updateNode(req.params.nodeId, updates, context);
    res.json({ ok: true, node });
  } catch (error) {
    const status = error.message.includes('NOT_FOUND') ? 404 : (error.message.includes('FORBIDDEN') ? 403 : 500);
    res.status(status).json({ ok: false, error: { code: 'NODE_UPDATE_FAILED', message: error.message } });
  }
});

// --- Production Packages ---

/**
 * GET /api/admin/production/packages
 */
router.get('/packages', async (req, res) => {
  try {
    const filters = { ...req.query };
    const context = resolveContext(req);
    
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
    const context = resolveContext(req);
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
    const context = resolveContext(req);
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
    const context = resolveContext(req);
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
  const context = resolveContext(req);
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
  const context = resolveContext(req);
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
    const context = resolveContext(req);
    
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
    const context = resolveContext(req);
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
    const context = resolveContext(req);
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
    const context = resolveContext(req);
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
    const context = resolveContext(req);
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
    const context = resolveContext(req);
    
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
    const context = resolveContext(req);
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
    const context = resolveContext(req);
    const db = require('../services/db');
    
    // Security: Only allow searching by tenant or if super admin
    let sql = `
      SELECT le.*, pkg.id as package_id
      FROM financial_ledger_entries le
      JOIN production_packages pkg ON le.transaction_id = CONCAT('prod_tx_', SUBSTRING(pkg.id, 1, 12))
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

module.exports = router;
