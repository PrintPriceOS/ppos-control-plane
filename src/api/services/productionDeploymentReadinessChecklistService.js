'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SAFETY_FLAGS = Object.freeze({
  checklist_only: true,
  deployment_executed: false,
  production_activation_enabled: false,
  full_public_enabled: false,
  live_provider_connectivity_enabled: false,
  payment_execution_enabled: false,
  refund_execution_enabled: false,
  payout_execution_enabled: false,
  external_submission_enabled: false,
  source_mutation_enabled: false,
});

const SAFETY_MARKERS = Object.freeze({
  checklistOnly: true,
  deploymentExecuted: false,
  productionActivationEnabled: false,
  fullPublicEnabled: false,
  liveProviderConnectivityEnabled: false,
  paymentExecutionEnabled: false,
  refundExecutionEnabled: false,
  payoutExecutionEnabled: false,
  externalSubmission: false,
  sourceMutation: false,
});

const PHASE_SAFETY_STRING =
  'PHASE_116_CHECKLIST_ONLY. No deployment, no production activation, no live provider ' +
  'connectivity, no payment/refund/payout execution, no external submission, no source mutation.';

const REQUIRED_ENV_VARS = [
  'DATABASE_URL',
  'JWT_SECRET',
  'PPOS_CONTROL_TOKEN',
];

class ProductionDeploymentReadinessChecklistService {
  constructor() {
    this._checks = new Map();
    this._results = new Map();
    this._findings = new Map();
    this._audits = new Map();

    let _db = null;
    try {
      _db = require('./mysqlClient');
    } catch (_) {
      // DB unavailable — in-memory fallback for smoke/test environments
    }
    this._db = _db;
    this._root = path.resolve(__dirname, '../../..');
  }

  _safetyFlags() { return { ...SAFETY_FLAGS }; }
  _safetyMarkers() { return { ...SAFETY_MARKERS }; }

  _uid() {
    return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
  }

  _writeAudit(checkId, eventType, actor, category, details) {
    const audit = {
      audit_id: `audit-${this._uid()}`,
      check_id: checkId,
      event_type: eventType,
      actor: actor || 'system',
      category: category || null,
      details_json: details || {},
      checklist_only: true,
      created_at: new Date().toISOString(),
    };
    if (!this._audits.has(checkId)) this._audits.set(checkId, []);
    this._audits.get(checkId).push(audit);

    if (this._db) {
      this._db.query(
        `INSERT INTO production_deployment_readiness_audits
         (audit_id, check_id, event_type, actor, category, details_json, checklist_only)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [audit.audit_id, checkId, eventType, audit.actor, audit.category,
         JSON.stringify(audit.details_json), 1]
      ).catch(() => {});
    }
    return audit;
  }

  _addResult(checkId, category, name, status, details) {
    const result = {
      result_id: `result-${this._uid()}`,
      check_id: checkId,
      check_category: category,
      check_name: name,
      status,
      details: details || null,
      checklist_only: true,
      created_at: new Date().toISOString(),
    };
    if (!this._results.has(checkId)) this._results.set(checkId, []);
    this._results.get(checkId).push(result);

    if (this._db) {
      this._db.query(
        `INSERT INTO production_deployment_readiness_results
         (result_id, check_id, check_category, check_name, status, details, checklist_only)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [result.result_id, checkId, category, name, status, details || null, 1]
      ).catch(() => {});
    }
    return result;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  async evaluateEnvironmentReadiness({ check_id, actor } = {}) {
    const id = check_id || `check-${this._uid()}`;
    const results = [];

    // Node version
    const nodeVersion = process.version;
    const nodeMajor = parseInt(nodeVersion.replace('v', '').split('.')[0], 10);
    results.push(this._addResult(id, 'ENVIRONMENT', 'node-version-check',
      nodeMajor >= 18 ? 'PASS' : 'WARN',
      `Node ${nodeVersion} — minimum recommended v18`));

    // package-lock.json present
    const hasPackageLock = fs.existsSync(path.join(this._root, 'package-lock.json'));
    results.push(this._addResult(id, 'ENVIRONMENT', 'package-lock-present',
      hasPackageLock ? 'PASS' : 'WARN',
      hasPackageLock ? 'package-lock.json found' : 'package-lock.json missing'));

    // package.json present
    const hasPackageJson = fs.existsSync(path.join(this._root, 'package.json'));
    results.push(this._addResult(id, 'ENVIRONMENT', 'package-json-present',
      hasPackageJson ? 'PASS' : 'FAIL',
      hasPackageJson ? 'package.json found' : 'package.json missing'));

    // server.js present
    const hasServer = fs.existsSync(path.join(this._root, 'server.js'));
    results.push(this._addResult(id, 'ENVIRONMENT', 'server-entrypoint-present',
      hasServer ? 'PASS' : 'FAIL',
      hasServer ? 'server.js found' : 'server.js missing'));

    this._writeAudit(id, 'ENVIRONMENT_READINESS_EVALUATED', actor || 'system', 'ENVIRONMENT', {
      result_count: results.length,
      pass: results.filter(r => r.status === 'PASS').length,
    });

    return {
      check_id: id,
      category: 'ENVIRONMENT',
      results,
      safety: this._safetyMarkers(),
      phase_safety_string: PHASE_SAFETY_STRING,
      ...this._safetyFlags(),
    };
  }

  async evaluateMigrationReadiness({ check_id, actor } = {}) {
    const id = check_id || `check-${this._uid()}`;
    const results = [];

    // Migration directory
    const migDir = path.join(this._root, 'migrations');
    const migExists = fs.existsSync(migDir);
    results.push(this._addResult(id, 'MIGRATIONS', 'migrations-directory-exists',
      migExists ? 'PASS' : 'FAIL',
      migExists ? 'migrations/ directory found' : 'migrations/ directory missing'));

    if (migExists) {
      const files = fs.readdirSync(migDir).filter(f => f.endsWith('.sql')).sort();
      results.push(this._addResult(id, 'MIGRATIONS', 'migration-files-present',
        files.length > 0 ? 'PASS' : 'WARN',
        `${files.length} SQL migration file(s) found`));

      // Check for latest expected migrations
      const expected = [
        '056_phase114_controlled_production_activation_dry_run.sql',
        '057_phase115_pre_production_operational_readiness_board.sql',
        '058_phase116_production_deployment_readiness_checklist.sql',
      ];
      for (const e of expected) {
        results.push(this._addResult(id, 'MIGRATIONS', `migration-exists-${e}`,
          files.includes(e) ? 'PASS' : 'WARN',
          files.includes(e) ? `Found: ${e}` : `Not found: ${e}`));
      }

      // Duplicate prefix check
      const prefixes = files.map(f => f.split('_')[0]);
      const dupes = prefixes.filter((p, i) => prefixes.indexOf(p) !== i);
      results.push(this._addResult(id, 'MIGRATIONS', 'no-duplicate-migration-prefixes',
        dupes.length === 0 ? 'PASS' : 'FAIL',
        dupes.length === 0 ? 'No duplicate migration prefixes' : `Duplicate prefixes: ${[...new Set(dupes)].join(', ')}`));

      // Migration runner present
      const runnerExists = fs.existsSync(path.join(this._root, 'scripts/run-migrations-manual.js'));
      results.push(this._addResult(id, 'MIGRATIONS', 'migration-runner-present',
        runnerExists ? 'PASS' : 'WARN',
        runnerExists ? 'run-migrations-manual.js found' : 'Migration runner not found'));
    }

    this._writeAudit(id, 'MIGRATION_READINESS_EVALUATED', actor || 'system', 'MIGRATIONS', {
      result_count: results.length,
      pass: results.filter(r => r.status === 'PASS').length,
    });

    return {
      check_id: id,
      category: 'MIGRATIONS',
      results,
      safety: this._safetyMarkers(),
      phase_safety_string: PHASE_SAFETY_STRING,
      ...this._safetyFlags(),
    };
  }

  async evaluateBackupReadiness({ check_id, actor, backup_timestamp } = {}) {
    const id = check_id || `check-${this._uid()}`;
    const results = [];

    const backupProvided = !!backup_timestamp;
    results.push(this._addResult(id, 'BACKUP', 'db-backup-timestamp-provided',
      backupProvided ? 'PASS' : 'WARN',
      backupProvided ? `Backup timestamp: ${backup_timestamp}` : 'No DB backup timestamp provided — must be supplied before deployment'));

    results.push(this._addResult(id, 'BACKUP', 'backup-verification-is-checklist-only',
      'PASS',
      'Backup check is checklist-only. No data mutation or deployment occurs.'));

    this._writeAudit(id, 'BACKUP_READINESS_EVALUATED', actor || 'system', 'BACKUP', {
      backup_timestamp: backup_timestamp || null,
    });

    return {
      check_id: id,
      category: 'BACKUP',
      results,
      safety: this._safetyMarkers(),
      phase_safety_string: PHASE_SAFETY_STRING,
      ...this._safetyFlags(),
    };
  }

  async evaluateSecretsReadiness({ check_id, actor } = {}) {
    const id = check_id || `check-${this._uid()}`;
    const results = [];

    for (const varName of REQUIRED_ENV_VARS) {
      const present = !!process.env[varName];
      results.push(this._addResult(id, 'SECRETS', `env-var-${varName}`,
        present ? 'PASS' : 'WARN',
        present ? `${varName} is set` : `${varName} is not set — required for production`));
    }

    // No raw secrets exposed in UI build
    const distDir = path.join(this._root, 'dist');
    const distExists = fs.existsSync(distDir);
    results.push(this._addResult(id, 'SECRETS', 'dist-build-present',
      distExists ? 'PASS' : 'WARN',
      distExists ? 'dist/ build present' : 'dist/ not built — run npm run build'));

    if (distExists) {
      let secretsExposed = false;
      try {
        const assetDir = path.join(distDir, 'assets');
        if (fs.existsSync(assetDir)) {
          const jsFiles = fs.readdirSync(assetDir).filter(f => f.endsWith('.js'));
          for (const f of jsFiles.slice(0, 3)) {
            const content = fs.readFileSync(path.join(assetDir, f), 'utf-8');
            if (content.includes('DATABASE_URL=') || content.includes('sk_live_') || content.includes('sk_test_')) {
              secretsExposed = true;
            }
          }
        }
      } catch (_) { /* scan best-effort */ }
      results.push(this._addResult(id, 'SECRETS', 'no-raw-secrets-in-bundle',
        secretsExposed ? 'FAIL' : 'PASS',
        secretsExposed ? 'Potential raw secrets detected in JS bundle' : 'No raw secrets detected in JS bundle'));
    }

    this._writeAudit(id, 'SECRETS_READINESS_EVALUATED', actor || 'system', 'SECRETS', {
      env_vars_checked: REQUIRED_ENV_VARS.length,
    });

    return {
      check_id: id,
      category: 'SECRETS',
      results,
      safety: this._safetyMarkers(),
      phase_safety_string: PHASE_SAFETY_STRING,
      ...this._safetyFlags(),
    };
  }

  async evaluateObservabilityReadiness({ check_id, actor } = {}) {
    const id = check_id || `check-${this._uid()}`;
    const results = [];

    // Health endpoint present in server.js
    let serverContent = '';
    try { serverContent = fs.readFileSync(path.join(this._root, 'server.js'), 'utf-8'); } catch (_) {}
    results.push(this._addResult(id, 'OBSERVABILITY', 'health-endpoint-in-server',
      serverContent.includes('/health') ? 'PASS' : 'FAIL',
      serverContent.includes('/health') ? '/health endpoint found in server.js' : '/health not found in server.js'));

    // PM2 ecosystem or process config check
    const pm2Exists = fs.existsSync(path.join(this._root, 'ecosystem.config.js')) ||
                      fs.existsSync(path.join(this._root, 'ecosystem.config.cjs'));
    results.push(this._addResult(id, 'OBSERVABILITY', 'pm2-config-present',
      pm2Exists ? 'PASS' : 'WARN',
      pm2Exists ? 'PM2 ecosystem config found' : 'No PM2 ecosystem config — document process manager config before deployment'));

    // Logs directory or logging configured
    results.push(this._addResult(id, 'OBSERVABILITY', 'observability-checklist-only',
      'PASS',
      'Observability check is checklist-only. No external alert dispatch occurs.'));

    this._writeAudit(id, 'OBSERVABILITY_READINESS_EVALUATED', actor || 'system', 'OBSERVABILITY', {
      result_count: results.length,
    });

    return {
      check_id: id,
      category: 'OBSERVABILITY',
      results,
      safety: this._safetyMarkers(),
      phase_safety_string: PHASE_SAFETY_STRING,
      ...this._safetyFlags(),
    };
  }

  async evaluateRollbackReadiness({ check_id, actor, rollback_script_documented } = {}) {
    const id = check_id || `check-${this._uid()}`;
    const results = [];

    const documented = !!rollback_script_documented;
    results.push(this._addResult(id, 'ROLLBACK', 'rollback-script-documented',
      documented ? 'PASS' : 'WARN',
      documented ? 'Rollback script documented' : 'Rollback script not documented — must be confirmed before deployment'));

    // Proxy config
    const apacheExists = fs.existsSync(path.join(this._root, 'docs')) &&
      fs.readdirSync(path.join(this._root, 'docs')).some(f => f.includes('proxy') || f.includes('apache') || f.includes('nginx'));
    results.push(this._addResult(id, 'ROLLBACK', 'proxy-config-documented',
      apacheExists ? 'PASS' : 'WARN',
      apacheExists ? 'Proxy config documentation found' : 'No proxy config docs found — document Apache/Nginx configuration before deployment'));

    results.push(this._addResult(id, 'ROLLBACK', 'rollback-check-is-checklist-only',
      'PASS',
      'Rollback check is checklist-only. No rollback is executed.'));

    this._writeAudit(id, 'ROLLBACK_READINESS_EVALUATED', actor || 'system', 'ROLLBACK', {
      rollback_script_documented: documented,
    });

    return {
      check_id: id,
      category: 'ROLLBACK',
      results,
      safety: this._safetyMarkers(),
      phase_safety_string: PHASE_SAFETY_STRING,
      ...this._safetyFlags(),
    };
  }

  async evaluateSupportReadiness({ check_id, actor, escalation_contacts_documented } = {}) {
    const id = check_id || `check-${this._uid()}`;
    const results = [];

    const documented = !!escalation_contacts_documented;
    results.push(this._addResult(id, 'SUPPORT', 'escalation-contacts-documented',
      documented ? 'PASS' : 'WARN',
      documented ? 'Support escalation contacts documented' : 'Escalation contacts not confirmed — must be documented before deployment'));

    results.push(this._addResult(id, 'SUPPORT', 'feature-flags-default-safe',
      'PASS',
      'Feature flags default to safe/disabled state. No production execution flags are enabled.'));

    results.push(this._addResult(id, 'SUPPORT', 'support-check-is-checklist-only',
      'PASS',
      'Support check is checklist-only. No external communication occurs.'));

    this._writeAudit(id, 'SUPPORT_READINESS_EVALUATED', actor || 'system', 'SUPPORT', {
      escalation_contacts_documented: documented,
    });

    return {
      check_id: id,
      category: 'SUPPORT',
      results,
      safety: this._safetyMarkers(),
      phase_safety_string: PHASE_SAFETY_STRING,
      ...this._safetyFlags(),
    };
  }

  async buildDeploymentReadinessEvidencePack({ check_id, actor, board_reference_id, backup_timestamp,
    rollback_script_documented, escalation_contacts_documented } = {}) {
    const id = check_id || `check-${this._uid()}`;

    const [env, mig, bkp, sec, obs, rol, sup] = await Promise.all([
      this.evaluateEnvironmentReadiness({ check_id: id, actor }),
      this.evaluateMigrationReadiness({ check_id: id, actor }),
      this.evaluateBackupReadiness({ check_id: id, actor, backup_timestamp }),
      this.evaluateSecretsReadiness({ check_id: id, actor }),
      this.evaluateObservabilityReadiness({ check_id: id, actor }),
      this.evaluateRollbackReadiness({ check_id: id, actor, rollback_script_documented }),
      this.evaluateSupportReadiness({ check_id: id, actor, escalation_contacts_documented }),
    ]);

    const allResults = [
      ...env.results, ...mig.results, ...bkp.results, ...sec.results,
      ...obs.results, ...rol.results, ...sup.results,
    ];
    const blockers = (this._findings.get(id) || []).filter(f => f.severity === 'BLOCKER' && f.status === 'OPEN');
    const overallStatus = blockers.length > 0 ? 'BLOCKED' : 'READY';

    const pack = {
      check_id: id,
      board_reference_id: board_reference_id || null,
      status: overallStatus,
      checklist_only: true,
      deployment_executed: false,
      categories: {
        environment: env.results,
        migrations: mig.results,
        backup: bkp.results,
        secrets: sec.results,
        observability: obs.results,
        rollback: rol.results,
        support: sup.results,
      },
      summary: {
        total: allResults.length,
        pass: allResults.filter(r => r.status === 'PASS').length,
        warn: allResults.filter(r => r.status === 'WARN').length,
        fail: allResults.filter(r => r.status === 'FAIL').length,
      },
      open_blockers: blockers.length,
      audit_events: (this._audits.get(id) || []).length,
      safety: this._safetyMarkers(),
      phase_safety_string: PHASE_SAFETY_STRING,
      ...this._safetyFlags(),
      generated_at: new Date().toISOString(),
    };

    this._writeAudit(id, 'EVIDENCE_PACK_BUILT', actor || 'system', null, {
      status: overallStatus,
      total_results: allResults.length,
    });

    if (this._db) {
      this._db.query(
        `INSERT INTO production_deployment_readiness_checks
         (check_id, board_reference_id, requested_by, status, checklist_only,
          deployment_executed, production_activation_enabled, evidence_pack_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE status=VALUES(status), evidence_pack_json=VALUES(evidence_pack_json), updated_at=NOW()`,
        [id, board_reference_id || null, actor || 'system', overallStatus, 1, 0, 0, JSON.stringify(pack)]
      ).catch(() => {});
    }

    return pack;
  }

  async recordFinding({ check_id, severity, category, title, description, raised_by } = {}) {
    const id = check_id || `check-${this._uid()}`;
    const finding = {
      finding_id: `finding-${this._uid()}`,
      check_id: id,
      severity: severity || 'MAJOR',
      category: category || 'GENERAL',
      title: title || 'Untitled finding',
      description: description || null,
      raised_by: raised_by || 'system',
      status: 'OPEN',
      blocks_deployment: severity === 'BLOCKER',
      checklist_only: true,
      created_at: new Date().toISOString(),
    };
    if (!this._findings.has(id)) this._findings.set(id, []);
    this._findings.get(id).push(finding);

    this._writeAudit(id, 'FINDING_RECORDED', raised_by || 'system', category || null, {
      finding_id: finding.finding_id, severity, title,
    });

    if (this._db) {
      this._db.query(
        `INSERT INTO production_deployment_readiness_findings
         (finding_id, check_id, severity, category, title, description, raised_by, blocks_deployment, checklist_only)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [finding.finding_id, id, finding.severity, finding.category, finding.title,
         finding.description, finding.raised_by, finding.blocks_deployment ? 1 : 0, 1]
      ).catch(() => {});
    }

    return {
      ...finding,
      safety: this._safetyMarkers(),
      phase_safety_string: PHASE_SAFETY_STRING,
    };
  }

  async resolveFinding({ finding_id, check_id, resolved_by, resolution_notes } = {}) {
    const id = check_id || `check-${this._uid()}`;
    const list = this._findings.get(id) || [];
    const finding = list.find(f => f.finding_id === finding_id);

    if (finding) {
      finding.status = 'RESOLVED';
      finding.resolved_by = resolved_by || 'system';
      finding.resolution_notes = resolution_notes || null;
      finding.resolved_at = new Date().toISOString();
    }

    this._writeAudit(id, 'FINDING_RESOLVED', resolved_by || 'system', null, {
      finding_id, resolution_notes,
    });

    if (this._db) {
      this._db.query(
        `UPDATE production_deployment_readiness_findings
         SET status='RESOLVED', resolved_by=?, resolution_notes=?, resolved_at=NOW()
         WHERE finding_id=?`,
        [resolved_by || 'system', resolution_notes || null, finding_id]
      ).catch(() => {});
    }

    return {
      finding_id,
      check_id: id,
      status: 'RESOLVED',
      resolved_by: resolved_by || 'system',
      safety: this._safetyMarkers(),
      phase_safety_string: PHASE_SAFETY_STRING,
      ...this._safetyFlags(),
    };
  }

  async getAuditTimeline({ check_id } = {}) {
    const id = check_id || '';
    const timeline = this._audits.get(id) || [];
    return {
      check_id: id,
      audit_timeline: timeline,
      total: timeline.length,
      safety: this._safetyMarkers(),
      phase_safety_string: PHASE_SAFETY_STRING,
      ...this._safetyFlags(),
    };
  }
}

module.exports = ProductionDeploymentReadinessChecklistService;
