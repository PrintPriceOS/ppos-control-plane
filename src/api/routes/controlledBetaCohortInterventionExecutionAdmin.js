const express = require('express');
const router = express.Router();
const db = require('../services/mysqlClient');
const builderService = require('../services/cohortInterventionExecutionBuilderService').serviceInstance || require('../services/cohortInterventionExecutionBuilderService');
const dryRunService = require('../services/cohortInterventionExecutionDryRunService').serviceInstance || require('../services/cohortInterventionExecutionDryRunService');
const rollbackService = require('../services/cohortInterventionExecutionRollbackService').serviceInstance || require('../services/cohortInterventionExecutionRollbackService');
const operatorConfirmationService = require('../services/cohortInterventionExecutionOperatorConfirmationService').serviceInstance || require('../services/cohortInterventionExecutionOperatorConfirmationService');
const runnerService = require('../services/cohortInterventionExecutionRunnerService').serviceInstance || require('../services/cohortInterventionExecutionRunnerService');
const evidenceService = require('../services/cohortInterventionExecutionEvidencePackService').serviceInstance || require('../services/cohortInterventionExecutionEvidencePackService');

// Admin verification middleware
router.use((req, res, next) => {
  if (!req.admin) {
    return res.status(403).json({ ok: false, error: 'Admin access required' });
  }
  next();
});

router.get('/executions', async (req, res) => {
  try {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    let list = [];
    if (!isProdLike) {
      list = Array.from(builderService._mockState.executions.values());
    } else {
      list = await db.query("SELECT * FROM controlled_beta_cohort_intervention_executions ORDER BY created_at DESC");
    }
    res.json({ ok: true, executions: list });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/executions/:executionId', async (req, res) => {
  try {
    const execution = await builderService.getExecution(req.params.executionId);
    if (!execution) return res.status(404).json({ ok: false, error: 'Execution not found' });
    const steps = await builderService.getSteps(req.params.executionId);
    res.json({ ok: true, execution, steps });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/executions/from-approval/:approvalId', async (req, res) => {
  try {
    const actorId = req.user ? req.user.id || req.user.email || 'admin' : 'admin';
    const result = await builderService.createExecution(req.params.approvalId, actorId);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/executions/:executionId/dry-run', async (req, res) => {
  try {
    const actorId = req.user ? req.user.id || req.user.email || 'admin' : 'admin';
    const result = await dryRunService.generateDryRun(req.params.executionId, actorId);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/executions/:executionId/rollback-plan', async (req, res) => {
  try {
    const actorId = req.user ? req.user.id || req.user.email || 'admin' : 'admin';
    const result = await rollbackService.createRollbackPlan(req.params.executionId, actorId);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/executions/:executionId/confirm', async (req, res) => {
  try {
    const { signature, phrase } = req.body;
    const actorId = req.user ? req.user.id || req.user.email || 'admin' : 'admin';
    const result = await operatorConfirmationService.confirmExecution(req.params.executionId, actorId, signature, phrase);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/executions/:executionId/execute', async (req, res) => {
  try {
    const actorId = req.user ? req.user.id || req.user.email || 'admin' : 'admin';
    const result = await runnerService.runExecution(req.params.executionId, actorId);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/executions/:executionId/cancel', async (req, res) => {
  try {
    const { reason } = req.body;
    const actorId = req.user ? req.user.id || req.user.email || 'admin' : 'admin';
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    const exec = await builderService.getExecution(req.params.executionId);
    if (!exec) return res.status(404).json({ ok: false, error: 'Execution not found' });

    if (!isProdLike) {
      exec.execution_status = 'CANCELLED';
      exec.cancelled_at = new Date();
      exec.cancelled_by = actorId;
      exec.cancelled_reason = reason;
      builderService._mockState.executions.set(req.params.executionId, exec);
    } else {
      await db.query(
        "UPDATE controlled_beta_cohort_intervention_executions SET execution_status = 'CANCELLED', cancelled_at = NOW(), cancelled_by = ?, cancelled_reason = ? WHERE execution_id = ?",
        [actorId, reason, req.params.executionId]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/executions/:executionId/rollback', async (req, res) => {
  try {
    const actorId = req.user ? req.user.id || req.user.email || 'admin' : 'admin';
    const result = await rollbackService.executeRollback(req.params.executionId, actorId);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/executions/:executionId/supersede', async (req, res) => {
  try {
    const { supersededByExecutionId, reason } = req.body;
    const actorId = req.user ? req.user.id || req.user.email || 'admin' : 'admin';
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    const exec = await builderService.getExecution(req.params.executionId);
    if (!exec) return res.status(404).json({ ok: false, error: 'Execution not found' });

    if (!isProdLike) {
      exec.execution_status = 'SUPERSEDED';
      exec.superseded_at = new Date();
      exec.superseded_by_execution_id = supersededByExecutionId;
      exec.superseded_reason = reason;
      builderService._mockState.executions.set(req.params.executionId, exec);
    } else {
      await db.query(
        "UPDATE controlled_beta_cohort_intervention_executions SET execution_status = 'SUPERSEDED', superseded_at = NOW(), superseded_by_execution_id = ?, superseded_reason = ? WHERE execution_id = ?",
        [supersededByExecutionId, reason, req.params.executionId]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/executions/:executionId/evidence-pack', async (req, res) => {
  try {
    const record = await evidenceService.getEvidencePack(req.params.executionId);
    if (!record) return res.status(404).json({ ok: false, error: 'Evidence pack not found' });
    res.json({ ok: true, evidencePack: record });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/approvals/:approvalId/execution-readiness', async (req, res) => {
  try {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    let execution = null;
    if (!isProdLike) {
      for (const val of builderService._mockState.executions.values()) {
        if (val.source_approval_id === req.params.approvalId) {
          execution = val;
          break;
        }
      }
    } else {
      const list = await db.query("SELECT * FROM controlled_beta_cohort_intervention_executions WHERE source_approval_id = ?", [req.params.approvalId]);
      if (list.length > 0) execution = list[0];
    }
    res.json({ ok: true, execution });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/cohorts/:cohortId/execution-history', async (req, res) => {
  try {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    let list = [];
    if (!isProdLike) {
      for (const val of builderService._mockState.executions.values()) {
        if (val.cohort_id === req.params.cohortId) list.push(val);
      }
    } else {
      list = await db.query("SELECT * FROM controlled_beta_cohort_intervention_executions WHERE cohort_id = ?", [req.params.cohortId]);
    }
    res.json({ ok: true, executions: list });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
module.exports.serviceInstance = runnerService;
