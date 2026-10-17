'use strict';

const db = require('./mysqlClient');
const logger = require('./logger').child('migration-ledger-read');

class MigrationLedgerReadService {
  /**
   * Evaluates the database ledger state for readiness.
   * Compares against the baseline list where appropriate.
   * @param {Object} baseline - Phase 183 baseline object.
   * @param {number} staleTimeoutMinutes - Minutes after which a STARTED migration is stale.
   */
  async evaluateLedgerStatus(baseline, staleTimeoutMinutes = 30) {
    try {
      // 1. Verify table exists. If not, ledger is empty/not ready
      const tableCheckRows = await db.query(`
        SELECT TABLE_NAME FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'schema_versions'
      `);
      const tableCheck = Array.isArray(tableCheckRows) ? tableCheckRows[0] : tableCheckRows;
      if (!tableCheck) {
        return { status: 'MIGRATION_LEDGER_INCOMPATIBLE', reason: 'Table schema_versions does not exist' };
      }

      // 2. Fetch all ledger entries
      // Handle fallback schema structure if Phase 185 upgrade has not run yet.
      const columnsRows = await db.query(`
        SELECT COLUMN_NAME FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'schema_versions'
      `);
      const columns = Array.isArray(columnsRows) ? columnsRows : [];
      const hasGovColumns = columns.some(c => c.COLUMN_NAME === 'state');

      if (!hasGovColumns) {
        // Legacy table structure: verify only row count or trigger migration required
        const [rows] = await db.query('SELECT COUNT(*) as count FROM schema_versions');
        if (!rows || rows.count === 0) {
          return { status: 'PENDING_MIGRATIONS', reason: 'Legacy ledger table is empty' };
        }
        return { status: 'READY', legacy: true };
      }

      // 3. Process evolved ledger state machine checks
      const entries = await db.query(`
        SELECT version, description, record_type, migration_path, checksum, state, started_at, heartbeat_at, failure_code
        FROM schema_versions
        ORDER BY started_at ASC
      `);

      const failedRecords = entries.filter(e => e.state === 'FAILED');
      // Governed reconciliation allowlist for persistent staging: only migrations with certified idempotent recovery hooks
      const GOVERNED_RECONCILIATION_MIGRATIONS = new Set([
        'migrations/092_phase144_governed_high_risk_cohort_intervention_approval_gate.sql',
        'migrations/140_phase191e_materials_capacity_leadtimes.sql',
        'migrations/161_phase184g_industrial_persistence_ledger.sql'
      ]);

      for (const failedRecord of failedRecords) {
        // Enforce fail-closed security: accidental env var cannot retry general migrations
        const allowRetryEnv = process.env.PPOS_ALLOW_MIGRATION_RETRY === 'true';
        let eligible = false;

        if (allowRetryEnv && failedRecord.migration_path) {
          const isGovernedMigration = GOVERNED_RECONCILIATION_MIGRATIONS.has(failedRecord.migration_path);
          if (isGovernedMigration) {
            const baselineEntry = baseline.migrations.find(m => (m.path || m.relativePath) === failedRecord.migration_path);
            if (baselineEntry) {
              const expectedChecksum = baselineEntry.canonicalSha256 || baselineEntry.sha256;
              if (expectedChecksum === failedRecord.checksum) {
                const hasApplied = entries.some(e => e.migration_path === failedRecord.migration_path && e.state === 'APPLIED');
                if (!hasApplied) {
                  eligible = true;
                }
              }
            }
          } else {
            logger.warn({
              event: 'migration_retry_rejected_ungoverned',
              migration_path: failedRecord.migration_path,
              message: 'General migration retry rejected: no certified physical schema reconciliation hook exists for this migration'
            });
          }
        }

        if (eligible) {
          logger.info({ event: 'migration_retry_eligible', migration_path: failedRecord.migration_path, message: 'Failed migration eligible for governed retry' });
        } else {
          return { 
            status: 'MIGRATION_FAILED', 
            reason: `Migration failed: ${failedRecord.migration_path || 'unknown'}. Error: ${failedRecord.failure_code}`
          };
        }
      }

      // Stale STARTED detection (only for real migrations)
      const startedRecords = entries.filter(e => e.state === 'STARTED' && (!e.record_type || e.record_type === 'MIGRATION'));
      const now = Date.now();
      for (const record of startedRecords) {
        const referenceTime = new Date(record.heartbeat_at || record.started_at).getTime();
        const durationMinutes = (now - referenceTime) / (1000 * 60);

        if (durationMinutes > staleTimeoutMinutes) {
          return { 
            status: 'MIGRATION_FAILED', 
            reason: `Stale started execution detected for: ${record.migration_path}`
          };
        } else {
          return { 
            status: 'MIGRATION_IN_PROGRESS', 
            reason: `Active migration in progress: ${record.migration_path}`
          };
        }
      }

      // 4. Verify checksum matching and unknown migrations
      const baselineMap = new Map();
      const filenameMap = new Map();
      for (const m of baseline.migrations) {
        const p = m.path || m.relativePath;
        const c = m.canonicalSha256 || m.sha256;
        baselineMap.set(p, c);
        const fname = p.split('/').pop();
        filenameMap.set(fname, p);
      }

      // Filter and normalize applied records (ignoring baseline and phase markers)
      const applied = [];
      for (const entry of entries) {
        if (entry.state !== 'APPLIED') continue;

        // Skip explicit non-migration markers
        if (entry.record_type === 'BASELINE_MARKER' || entry.record_type === 'PHASE_MARKER') {
          continue;
        }

        // Skip legacy 1.0.0 initial baseline row even if typed as MIGRATION
        if (entry.version === '1.0.0' && entry.description === 'Initial Production Baseline') {
          continue;
        }

        // Skip legacy phase markers
        if (/^\d{3}$/.test(entry.version) && /^Phase \d+:/.test(entry.description || '') && !entry.checksum) {
          continue;
        }

        // Only evaluate MIGRATION records (or legacy untyped records)
        if (entry.record_type && entry.record_type !== 'MIGRATION') {
          continue;
        }

        // Derive migration_path if null from description or version
        let derivedPath = entry.migration_path;
        if (!derivedPath) {
          const fileKey = entry.description && entry.description.endsWith('.sql')
            ? entry.description
            : `${entry.version}.sql`;
          if (filenameMap.has(fileKey)) {
            derivedPath = filenameMap.get(fileKey);
            entry.migration_path = derivedPath;
          }
        }

        applied.push(entry);
      }

      for (const entry of applied) {
        if (!entry.migration_path || !baselineMap.has(entry.migration_path)) {
          return { status: 'MIGRATION_LEDGER_INCOMPATIBLE', reason: `Unknown applied migration in database: ${entry.migration_path}` };
        }
        const expectedChecksum = baselineMap.get(entry.migration_path);
        if (expectedChecksum !== entry.checksum) {
          return { 
            status: 'MIGRATION_CHECKSUM_MISMATCH', 
            reason: `Checksum mismatch for applied migration: ${entry.migration_path}. Expected ${expectedChecksum}, database has ${entry.checksum}`
          };
        }
      }

      // Check for pending migrations (baseline records not in database ledger)
      const appliedPaths = new Set(applied.map(e => e.migration_path));
      for (const m of baseline.migrations) {
        const p = m.path || m.relativePath;
        if (!appliedPaths.has(p)) {
          return { status: 'PENDING_MIGRATIONS', reason: `Pending required migration: ${p}` };
        }
      }


      return { status: 'READY' };
    } catch (err) {
      logger.error({ event: 'ledger_read_error', error: err.message });
      return { status: 'DATABASE_UNREACHABLE', reason: err.message };
    }
  }
}

module.exports = new MigrationLedgerReadService();
