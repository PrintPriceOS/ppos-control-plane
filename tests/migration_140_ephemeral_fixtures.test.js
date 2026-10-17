import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  checkEphemeralIsolation,
  checkDatabaseEphemeralState,
  verifyOrApplyStructuralFixtures,
  FIXTURE_CONTRACT_SPECS,
  MIGRATION_140_FIXTURE_DDL
} from '../scripts/bootstrap_canonical_schema';
import { runMigration140PreRemediation } from '../src/api/services/migrationService';

/**
 * CI-02J.6: Direct contract certification and real-code test suite for
 * Migration 140 ephemeral fixtures, safety isolation gates, and structural idempotency.
 */
describe('CI-02J.6: Migration 140 Real Bootstrap Contract & Ephemeral Isolation Suite', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  // =========================================================================
  // 1. ISOLATION & SAFETY GUARD REAL CODE TESTS
  // =========================================================================
  describe('1. Real Isolation Guard Verification (checkEphemeralIsolation)', () => {
    it('rejects execution when accredited CI environment context is missing (GITHUB_ACTIONS or CI)', () => {
      const result = checkEphemeralIsolation({
        NODE_ENV: 'test',
        PPOS_CI_EPHEMERAL_FIXTURES: 'true',
        MYSQL_HOST: '127.0.0.1',
        MYSQL_DATABASE: 'ppos_control_plane_ci'
        // Missing GITHUB_ACTIONS and CI
      });
      expect(result.ok).toBe(false);
      expect(result.reason).toContain('requires accredited CI container environment');
    });

    it('rejects execution when PPOS_CI_EPHEMERAL_FIXTURES is not true even in CI environment', () => {
      const result = checkEphemeralIsolation({
        CI: 'true',
        NODE_ENV: 'test',
        MYSQL_HOST: '127.0.0.1',
        MYSQL_DATABASE: 'ppos_ci_db'
      });
      expect(result.ok).toBe(false);
      expect(result.reason).toContain('PPOS_CI_EPHEMERAL_FIXTURES');
    });

    it('rejects execution when NODE_ENV is production even if in CI environment', () => {
      const result = checkEphemeralIsolation({
        CI: 'true',
        NODE_ENV: 'production',
        PPOS_CI_EPHEMERAL_FIXTURES: 'true',
        MYSQL_HOST: '127.0.0.1',
        MYSQL_DATABASE: 'ppos_control_plane_ci'
      });
      expect(result.ok).toBe(false);
      expect(result.reason).toContain('NODE_ENV=production');
    });

    it('rejects execution when host is non-local (remote IP or hostname)', () => {
      const remoteHosts = ['10.0.0.5', 'db.internal.ppos', 'aws-rds.amazonaws.com', '192.168.1.100'];
      for (const host of remoteHosts) {
        const result = checkEphemeralIsolation({
          CI: 'true',
          NODE_ENV: 'test',
          PPOS_CI_EPHEMERAL_FIXTURES: 'true',
          MYSQL_HOST: host,
          MYSQL_DATABASE: 'ppos_control_plane_ci'
        });
        expect(result.ok).toBe(false);
        expect(result.reason).toContain('Rejected non-local host');
      }
    });

    it('rejects execution when host is local but database name matches production patterns', () => {
      const prodDatabases = ['ppos_production', 'ppos_prod', 'printpriceos', 'printpriceos_prod', 'production', 'prod'];
      for (const db of prodDatabases) {
        const result = checkEphemeralIsolation({
          CI: 'true',
          NODE_ENV: 'test',
          PPOS_CI_EPHEMERAL_FIXTURES: 'true',
          MYSQL_HOST: '127.0.0.1',
          MYSQL_DATABASE: db
        });
        expect(result.ok).toBe(false);
        expect(result.reason).toContain('blocked as production');
      }
    });

    it('rejects execution when database name does not match disposable ephemeral naming pattern (tunnel/persistent guard)', () => {
      // Localhost tunnel targeting arbitrary non-ephemeral database
      const nonDisposableDbs = ['customer_live_data', 'billing_shard_1', 'warehouse_main', 'my_custom_db'];
      for (const db of nonDisposableDbs) {
        const result = checkEphemeralIsolation({
          CI: 'true',
          NODE_ENV: 'test',
          PPOS_CI_EPHEMERAL_FIXTURES: 'true',
          MYSQL_HOST: '127.0.0.1',
          MYSQL_DATABASE: db
        });
        expect(result.ok).toBe(false);
        expect(result.reason).toContain('disposable ephemeral naming pattern');
      }
    });

    it('accepts execution only when accredited CI, local host, flag enabled, non-prod, and disposable db name', () => {
      const validCases = [
        { host: '127.0.0.1', db: 'ppos_control_plane_ci', ciVar: { GITHUB_ACTIONS: 'true' } },
        { host: 'localhost', db: 'ppos_test_db', ciVar: { CI: 'true' } },
        { host: '::1', db: 'ephemeral_migrations_test', ciVar: { GITHUB_ACTIONS: 'true' } },
        { host: 'localhost', db: 'tmp_migration_runner', ciVar: { CI: 'true' } }
      ];
      for (const c of validCases) {
        const result = checkEphemeralIsolation({
          ...c.ciVar,
          NODE_ENV: 'test',
          PPOS_CI_EPHEMERAL_FIXTURES: 'true',
          MYSQL_HOST: c.host,
          MYSQL_DATABASE: c.db
        });
        expect(result.ok).toBe(true);
        expect(result.host).toBe(c.host);
        expect(result.database).toBe(c.db);
      }
    });

    it('correctly parses DATABASE_URL and applies the same isolation checks', () => {
      const remoteUrlResult = checkEphemeralIsolation({
        CI: 'true',
        NODE_ENV: 'test',
        PPOS_CI_EPHEMERAL_FIXTURES: 'true',
        DATABASE_URL: 'mysql://root:secret@db.prod.internal:3306/ppos_ci'
      });
      expect(remoteUrlResult.ok).toBe(false);
      expect(remoteUrlResult.reason).toContain('Rejected non-local host');

      const validUrlResult = checkEphemeralIsolation({
        CI: 'true',
        NODE_ENV: 'test',
        PPOS_CI_EPHEMERAL_FIXTURES: 'true',
        DATABASE_URL: 'mysql://root:secret@127.0.0.1:3306/ppos_control_plane_ci'
      });
      expect(validUrlResult.ok).toBe(true);
      expect(validUrlResult.database).toBe('ppos_control_plane_ci');
    });
  });

  // =========================================================================
  // 2. REAL GENERATED DDL CONTRACTS & HISTORICAL FIDELITY
  // =========================================================================
  describe('2. Real Generated DDL Contracts & Column Attributes (MIGRATION_140_FIXTURE_DDL)', () => {
    it('defines exactly the 9 required dependency tables', () => {
      const tables = Object.keys(MIGRATION_140_FIXTURE_DDL);
      expect(tables.length).toBe(9);
      expect(tables).toContain('printer_machines');
      expect(tables).toContain('printhouse_capabilities');
      expect(tables).toContain('routing_history');
      expect(tables).toContain('printer_capacity');
      expect(tables).toContain('job_outcomes');
      expect(tables).toContain('printer_contacts');
      expect(tables).toContain('printer_papers');
      expect(tables).toContain('printer_performance');
      expect(tables).toContain('printer_service_regions');
    });

    it('1. printer_machines: satisfies historical contract from printhouse_pricing_restore.sql', () => {
      const ddl = MIGRATION_140_FIXTURE_DDL.printer_machines;
      expect(ddl).toContain('CREATE TABLE IF NOT EXISTS printer_machines');
      expect(ddl).toMatch(/id\s+INT\s+AUTO_INCREMENT\s+PRIMARY\s+KEY/i);
      expect(ddl).toMatch(/printer_id\s+VARCHAR\(64\)\s+NOT\s+NULL/i);
      expect(ddl).toMatch(/nickname\s+VARCHAR\(255\)\s+NOT\s+NULL/i);
      expect(ddl).toMatch(/type\s+VARCHAR\(64\)\s+NULL/i);
      expect(ddl).toMatch(/status\s+VARCHAR\(64\)\s+DEFAULT\s+'ACTIVE'/i);
      expect(ddl).toMatch(/CONSTRAINT\s+printer_machines_ibfk_1\s+FOREIGN\s+KEY\s*\(printer_id\)\s+REFERENCES\s+printer_nodes\(id\)\s+ON\s+DELETE\s+CASCADE/i);
      // Ensure bad attributes are NOT present
      expect(ddl).not.toContain('hourly_rate');
      expect(ddl).not.toContain('machine_name');
    });

    it('2. printhouse_capabilities: satisfies historical contract from printhouse_hardening.sql with printhouse_id FK', () => {
      const ddl = MIGRATION_140_FIXTURE_DDL.printhouse_capabilities;
      expect(ddl).toContain('CREATE TABLE IF NOT EXISTS printhouse_capabilities');
      expect(ddl).toMatch(/id\s+INT\s+AUTO_INCREMENT\s+PRIMARY\s+KEY/i);
      expect(ddl).toMatch(/printhouse_id\s+VARCHAR\(64\)\s+NOT\s+NULL/i);
      expect(ddl).toMatch(/tenant_id\s+VARCHAR\(64\)\s+NOT\s+NULL/i);
      expect(ddl).toMatch(/min_quantity\s+INT\s+DEFAULT\s+1/i);
      expect(ddl).toMatch(/max_quantity\s+INT\s+DEFAULT\s+1000000/i);
      expect(ddl).toMatch(/hardcover_support\s+BOOLEAN\s+DEFAULT\s+FALSE/i);
      expect(ddl).toMatch(/softcover_support\s+BOOLEAN\s+DEFAULT\s+FALSE/i);
      expect(ddl).toMatch(/sewing_support\s+BOOLEAN\s+DEFAULT\s+FALSE/i);
      expect(ddl).toMatch(/lamination_support\s+BOOLEAN\s+DEFAULT\s+FALSE/i);
      expect(ddl).toMatch(/uv_support\s+BOOLEAN\s+DEFAULT\s+FALSE/i);
      expect(ddl).toMatch(/foil_support\s+BOOLEAN\s+DEFAULT\s+FALSE/i);
      expect(ddl).toMatch(/supported_countries\s+JSON/i);
      expect(ddl).toMatch(/INDEX\s+idx_pc_printhouse\s*\(printhouse_id\)/i);
      // Key Precondition: MUST reference printer_nodes(id) via printhouse_id
      expect(ddl).toMatch(/CONSTRAINT\s+printhouse_capabilities_ibfk_1\s+FOREIGN\s+KEY\s*\(printhouse_id\)\s+REFERENCES\s+printer_nodes\(id\)\s+ON\s+DELETE\s+CASCADE/i);
      // Ensure bad attributes are NOT present
      expect(ddl).not.toContain('capability_code');
      expect(ddl).not.toContain('is_enabled');
    });

    it('3. routing_history: satisfies historical contract from phase184g_industrial_provisioning_schema.js', () => {
      const ddl = MIGRATION_140_FIXTURE_DDL.routing_history;
      expect(ddl).toContain('CREATE TABLE IF NOT EXISTS routing_history');
      expect(ddl).toMatch(/id\s+INT\s+AUTO_INCREMENT\s+PRIMARY\s+KEY/i);
      expect(ddl).toMatch(/printer_id\s+VARCHAR\(64\)\s+NOT\s+NULL/i);
      expect(ddl).toMatch(/job_id\s+VARCHAR\(64\)\s+NULL/i);
      expect(ddl).toMatch(/action\s+VARCHAR\(128\)\s+NULL/i);
      expect(ddl).toMatch(/details_json\s+JSON\s+NULL/i);
      expect(ddl).toMatch(/CONSTRAINT\s+routing_history_ibfk_1\s+FOREIGN\s+KEY\s*\(printer_id\)\s+REFERENCES\s+printer_nodes\(id\)\s+ON\s+DELETE\s+CASCADE/i);
      // Ensure bad attributes are NOT present
      expect(ddl).not.toContain('routing_decision');
    });

    it('4. printer_capacity: satisfies canonical partial contract from printerSyncService.js and smoke_phase192j', () => {
      const ddl = MIGRATION_140_FIXTURE_DDL.printer_capacity;
      expect(ddl).toContain('CREATE TABLE IF NOT EXISTS printer_capacity');
      expect(ddl).toMatch(/id\s+VARCHAR\(64\)\s+PRIMARY\s+KEY/i);
      expect(ddl).toMatch(/printer_id\s+VARCHAR\(64\)\s+NOT\s+NULL/i);
      expect(ddl).toMatch(/date\s+DATE\s+NOT\s+NULL/i);
      expect(ddl).toMatch(/capacity_total\s+INT\s+DEFAULT\s+0/i);
      expect(ddl).toMatch(/capacity_available\s+INT\s+DEFAULT\s+0/i);
      expect(ddl).toMatch(/lead_time_days\s+INT\s+DEFAULT\s+0/i);
      expect(ddl).toMatch(/INDEX\s+idx_printer_date\s*\(printer_id,\s*date\)/i);
      expect(ddl).toMatch(/CONSTRAINT\s+printer_capacity_ibfk_1\s+FOREIGN\s+KEY\s*\(printer_id\)\s+REFERENCES\s+printer_nodes\(id\)\s+ON\s+DELETE\s+CASCADE/i);
      // Ensure bad attributes are NOT present
      expect(ddl).not.toContain('daily_sheet_capacity');
      expect(ddl).not.toContain('current_load_percentage');
    });

    it('5-9. Relational anchor fixtures: verify valid DDL with printer_id and cascade FK', () => {
      const anchorTables = ['job_outcomes', 'printer_contacts', 'printer_papers', 'printer_performance', 'printer_service_regions'];
      for (const table of anchorTables) {
        const ddl = MIGRATION_140_FIXTURE_DDL[table];
        expect(ddl).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
        expect(ddl).toMatch(/printer_id\s+VARCHAR\(64\)\s+NOT\s+NULL/i);
        expect(ddl).toMatch(new RegExp(`CONSTRAINT\\s+${table}_ibfk_1\\s+FOREIGN\\s+KEY\\s*\\(printer_id\\)\\s+REFERENCES\\s+printer_nodes\\(id\\)\\s+ON\\s+DELETE\\s+CASCADE`, 'i'));
      }
    });

    it('ensures idempotency across all 9 DDLs (CREATE TABLE IF NOT EXISTS)', () => {
      for (const [table, ddl] of Object.entries(MIGRATION_140_FIXTURE_DDL)) {
        expect(ddl).toMatch(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS/i);
      }
    });
  });

  // =========================================================================
  // 3. INTEGRATION WITH REAL PRECONDITION LOGIC (runMigration140PreRemediation)
  // =========================================================================
  describe('3. Migration 140 Pre-Remediation Verification with Real Bootstrap Schema Objects', () => {
    class MockDatabaseFor140 {
      constructor() {
        this.tables = new Set();
        this.indexes = [];
        this.foreignKeys = [];
        this.remediationState = new Map();
      }

      async query(sql) {
        const s = sql.trim().toUpperCase();

        if (s.includes('FROM INFORMATION_SCHEMA.TABLES')) {
          return [Array.from(this.tables).map(t => ({ TABLE_NAME: t }))];
        }

        if (s.includes('FROM INFORMATION_SCHEMA.STATISTICS')) {
          return [this.indexes];
        }

        if (s.includes('FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE')) {
          const rows = [];
          for (const fk of this.foreignKeys) {
            fk.childCols.forEach((col, idx) => {
              rows.push({
                CONSTRAINT_NAME: fk.name,
                TABLE_NAME: fk.childTable,
                COLUMN_NAME: col,
                ORDINAL_POSITION: idx + 1,
                REFERENCED_TABLE_NAME: fk.parentTable,
                REFERENCED_COLUMN_NAME: fk.parentCols[idx],
                UPDATE_RULE: fk.onUpdate,
                DELETE_RULE: fk.onDelete
              });
            });
          }
          return [rows];
        }

        if (s.includes('FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS')) {
          const rows = this.foreignKeys.map(fk => ({
            CONSTRAINT_NAME: fk.name,
            TABLE_NAME: fk.childTable,
            REFERENCED_TABLE_NAME: fk.parentTable,
            UPDATE_RULE: fk.onUpdate,
            DELETE_RULE: fk.onDelete
          }));
          return [rows];
        }

        if (s.includes('SELECT @@FOREIGN_KEY_CHECKS')) {
          return [[{ fk_checks: 1 }]];
        }

        if (s.includes('FROM PPOS_REMEDIATION_STATE')) {
          const rows = [];
          for (const [key, val] of this.remediationState.entries()) {
            rows.push({ state_key: key, state_value: val });
          }
          return [rows];
        }

        if (s.startsWith('INSERT INTO PPOS_REMEDIATION_STATE')) {
          this.remediationState.set('remediation_140_status', 'IN_PROGRESS');
          return [{ affectedRows: 1 }];
        }

        if (s.startsWith('ALTER TABLE') || s.startsWith('SET FOREIGN_KEY_CHECKS')) {
          return [{ affectedRows: 0 }];
        }

        return [[]];
      }
    }

    it('fails precondition when required bootstrap tables are missing', async () => {
      const mockDb = new MockDatabaseFor140();
      // Only 3 of 15 tables exist
      mockDb.tables.add('printer_nodes');
      mockDb.tables.add('printhouse_machines');
      mockDb.tables.add('materials_catalog');

      await expect(runMigration140PreRemediation(mockDb)).rejects.toThrow('PRECONDITION FAILED: Missing required tables');
    });

    it('fails precondition when FKs do not match the expected 13 constraints', async () => {
      const mockDb = new MockDatabaseFor140();
      // Populate all 15 tables
      const expectedTables = [
        'printer_nodes', 'printhouse_machines', 'printhouse_media', 'printhouse_policy_profiles',
        'printhouse_sla_profiles', 'materials_catalog', 'job_outcomes', 'printer_capacity',
        'printer_contacts', 'printer_machines', 'printer_papers', 'printer_performance',
        'printer_service_regions', 'printhouse_capabilities', 'routing_history'
      ];
      expectedTables.forEach(t => mockDb.tables.add(t));

      // Add semantic index requirements
      const addIdx = (t, n, nonUnique, cols) => {
        cols.forEach((col, seq) => {
          mockDb.indexes.push({
            TABLE_NAME: t,
            INDEX_NAME: n,
            NON_UNIQUE: nonUnique ? 1 : 0,
            SEQ_IN_INDEX: seq + 1,
            COLUMN_NAME: col,
            SUB_PART: null
          });
        });
      };

      addIdx('printer_nodes', 'PRIMARY', false, ['id']);
      addIdx('printer_nodes', 'uk_pn_id_tenant', false, ['id', 'tenant_id']);
      addIdx('printer_nodes', 'idx_pn_tenant', true, ['tenant_id']);
      addIdx('printhouse_machines', 'PRIMARY', false, ['id']);
      addIdx('printhouse_machines', 'uk_pm_id_tenant', false, ['id', 'tenant_id']);
      addIdx('printhouse_machines', 'idx_pm_printhouse_tenant', true, ['printhouse_id', 'tenant_id']);
      addIdx('materials_catalog', 'PRIMARY', false, ['id']);
      addIdx('materials_catalog', 'uk_mc_id_tenant', false, ['id', 'tenant_id']);
      addIdx('materials_catalog', 'idx_mc_tenant', true, ['tenant_id']);
      addIdx('printhouse_media', 'idx_media_p_t', true, ['printhouse_id', 'tenant_id']);
      addIdx('printhouse_policy_profiles', 'idx_pol_p_t', true, ['printhouse_id', 'tenant_id']);
      addIdx('printhouse_sla_profiles', 'idx_sla_p_t', true, ['printhouse_id', 'tenant_id']);
      addIdx('job_outcomes', 'idx_jo_printer', true, ['printer_id']);
      addIdx('printer_capacity', 'idx_printer_date', true, ['printer_id', 'date']);
      addIdx('printer_contacts', 'idx_pcon_printer', true, ['printer_id']);
      addIdx('printer_machines', 'idx_pm_printer', true, ['printer_id']);
      addIdx('printer_papers', 'idx_ppap_printer', true, ['printer_id']);
      addIdx('printer_performance', 'idx_pperf_printer', true, ['printer_id']);
      addIdx('printer_service_regions', 'idx_psr_printer', true, ['printer_id']);
      addIdx('printhouse_capabilities', 'idx_pc_printhouse', true, ['printhouse_id']);
      addIdx('routing_history', 'idx_rh_printer', true, ['printer_id']);

      // Deliberately introduce wrong FK (e.g. printhouse_capabilities referencing wrong child column)
      mockDb.foreignKeys.push({
        name: 'printhouse_capabilities_ibfk_1',
        childTable: 'printhouse_capabilities',
        childCols: ['wrong_printer_id'], // wrong column!
        parentTable: 'printer_nodes',
        parentCols: ['id'],
        onUpdate: 'NO ACTION',
        onDelete: 'CASCADE'
      });

      await expect(runMigration140PreRemediation(mockDb)).rejects.toThrow(/PRECONDITION FAILED/);
    });

    it('passes precondition and normalizes schema when all 15 tables, semantic indexes, and 13 FKs match', async () => {
      const mockDb = new MockDatabaseFor140();
      const expectedTables = [
        'printer_nodes', 'printhouse_machines', 'printhouse_media', 'printhouse_policy_profiles',
        'printhouse_sla_profiles', 'materials_catalog', 'job_outcomes', 'printer_capacity',
        'printer_contacts', 'printer_machines', 'printer_papers', 'printer_performance',
        'printer_service_regions', 'printhouse_capabilities', 'routing_history'
      ];
      expectedTables.forEach(t => mockDb.tables.add(t));

      const addIdx = (t, n, nonUnique, cols) => {
        cols.forEach((col, seq) => {
          mockDb.indexes.push({
            TABLE_NAME: t,
            INDEX_NAME: n,
            NON_UNIQUE: nonUnique ? 1 : 0,
            SEQ_IN_INDEX: seq + 1,
            COLUMN_NAME: col,
            SUB_PART: null
          });
        });
      };

      addIdx('printer_nodes', 'PRIMARY', false, ['id']);
      addIdx('printer_nodes', 'uk_pn_id_tenant', false, ['id', 'tenant_id']);
      addIdx('printer_nodes', 'idx_pn_tenant', true, ['tenant_id']);
      addIdx('printhouse_machines', 'PRIMARY', false, ['id']);
      addIdx('printhouse_machines', 'uk_pm_id_tenant', false, ['id', 'tenant_id']);
      addIdx('printhouse_machines', 'idx_pm_printhouse_tenant', true, ['printhouse_id', 'tenant_id']);
      addIdx('materials_catalog', 'PRIMARY', false, ['id']);
      addIdx('materials_catalog', 'uk_mc_id_tenant', false, ['id', 'tenant_id']);
      addIdx('materials_catalog', 'idx_mc_tenant', true, ['tenant_id']);
      addIdx('printhouse_media', 'idx_media_p_t', true, ['printhouse_id', 'tenant_id']);
      addIdx('printhouse_policy_profiles', 'idx_pol_p_t', true, ['printhouse_id', 'tenant_id']);
      addIdx('printhouse_sla_profiles', 'idx_sla_p_t', true, ['printhouse_id', 'tenant_id']);
      addIdx('job_outcomes', 'idx_jo_printer', true, ['printer_id']);
      addIdx('printer_capacity', 'idx_printer_date', true, ['printer_id', 'date']);
      addIdx('printer_contacts', 'idx_pcon_printer', true, ['printer_id']);
      addIdx('printer_machines', 'idx_pm_printer', true, ['printer_id']);
      addIdx('printer_papers', 'idx_ppap_printer', true, ['printer_id']);
      addIdx('printer_performance', 'idx_pperf_printer', true, ['printer_id']);
      addIdx('printer_service_regions', 'idx_psr_printer', true, ['printer_id']);
      addIdx('printhouse_capabilities', 'idx_pc_printhouse', true, ['printhouse_id']);
      addIdx('routing_history', 'idx_rh_printer', true, ['printer_id']);

      // 4 tenant-aware FKs
      mockDb.foreignKeys.push(
        { name: 'fk_machines_printer_node', childTable: 'printhouse_machines', childCols: ['printhouse_id', 'tenant_id'], parentTable: 'printer_nodes', parentCols: ['id', 'tenant_id'], onUpdate: 'CASCADE', onDelete: 'CASCADE' },
        { name: 'fk_media_printer_node', childTable: 'printhouse_media', childCols: ['printhouse_id', 'tenant_id'], parentTable: 'printer_nodes', parentCols: ['id', 'tenant_id'], onUpdate: 'CASCADE', onDelete: 'CASCADE' },
        { name: 'fk_policies_printer_node', childTable: 'printhouse_policy_profiles', childCols: ['printhouse_id', 'tenant_id'], parentTable: 'printer_nodes', parentCols: ['id', 'tenant_id'], onUpdate: 'CASCADE', onDelete: 'CASCADE' },
        { name: 'fk_sla_printer_node', childTable: 'printhouse_sla_profiles', childCols: ['printhouse_id', 'tenant_id'], parentTable: 'printer_nodes', parentCols: ['id', 'tenant_id'], onUpdate: 'CASCADE', onDelete: 'CASCADE' }
      );

      // 9 direct FKs (all referencing printer_nodes(id))
      mockDb.foreignKeys.push(
        { name: 'job_outcomes_ibfk_1', childTable: 'job_outcomes', childCols: ['printer_id'], parentTable: 'printer_nodes', parentCols: ['id'], onUpdate: 'NO ACTION', onDelete: 'CASCADE' },
        { name: 'printer_capacity_ibfk_1', childTable: 'printer_capacity', childCols: ['printer_id'], parentTable: 'printer_nodes', parentCols: ['id'], onUpdate: 'NO ACTION', onDelete: 'CASCADE' },
        { name: 'printer_contacts_ibfk_1', childTable: 'printer_contacts', childCols: ['printer_id'], parentTable: 'printer_nodes', parentCols: ['id'], onUpdate: 'NO ACTION', onDelete: 'CASCADE' },
        { name: 'printer_machines_ibfk_1', childTable: 'printer_machines', childCols: ['printer_id'], parentTable: 'printer_nodes', parentCols: ['id'], onUpdate: 'NO ACTION', onDelete: 'CASCADE' },
        { name: 'printer_papers_ibfk_1', childTable: 'printer_papers', childCols: ['printer_id'], parentTable: 'printer_nodes', parentCols: ['id'], onUpdate: 'NO ACTION', onDelete: 'CASCADE' },
        { name: 'printer_performance_ibfk_1', childTable: 'printer_performance', childCols: ['printer_id'], parentTable: 'printer_nodes', parentCols: ['id'], onUpdate: 'NO ACTION', onDelete: 'CASCADE' },
        { name: 'printer_service_regions_ibfk_1', childTable: 'printer_service_regions', childCols: ['printer_id'], parentTable: 'printer_nodes', parentCols: ['id'], onUpdate: 'NO ACTION', onDelete: 'CASCADE' },
        { name: 'printhouse_capabilities_ibfk_1', childTable: 'printhouse_capabilities', childCols: ['printhouse_id'], parentTable: 'printer_nodes', parentCols: ['id'], onUpdate: 'NO ACTION', onDelete: 'CASCADE' },
        { name: 'routing_history_ibfk_1', childTable: 'routing_history', childCols: ['printer_id'], parentTable: 'printer_nodes', parentCols: ['id'], onUpdate: 'NO ACTION', onDelete: 'CASCADE' }
      );

      await expect(runMigration140PreRemediation(mockDb)).resolves.not.toThrow();
    });
  });

  // =========================================================================
  // 4. UNPOLLUTED EPHEMERAL DATABASE STATE TESTS (checkDatabaseEphemeralState)
  // =========================================================================
  describe('4. Unpolluted Ephemeral Database State Verification', () => {
    it('rejects database when schema_versions already has recorded migrations', async () => {
      const mockDb = {
        async query(sql) {
          if (sql.includes('FROM information_schema.TABLES')) {
            return [[{ TABLE_NAME: 'schema_versions' }]];
          }
          if (sql.includes('SELECT COUNT(*) as count FROM schema_versions')) {
            return [[{ count: 15 }]]; // pre-existing migrations!
          }
          return [[]];
        }
      };

      const result = await checkDatabaseEphemeralState(mockDb);
      expect(result.ok).toBe(false);
      expect(result.reason).toContain('schema_versions contains 15 prior recorded migrations');
    });

    it('rejects database when tenants table has pre-existing application data', async () => {
      const mockDb = {
        async query(sql) {
          if (sql.includes('FROM information_schema.TABLES')) {
            return [[{ TABLE_NAME: 'tenants' }]];
          }
          if (sql.includes('SELECT COUNT(*) as count FROM tenants')) {
            return [[{ count: 42 }]]; // pre-existing tenants!
          }
          return [[]];
        }
      };

      const result = await checkDatabaseEphemeralState(mockDb);
      expect(result.ok).toBe(false);
      expect(result.reason).toContain('pre-existing persistent data in tenants table');
    });

    it('accepts clean empty database without pre-existing records', async () => {
      const mockDb = {
        async query(sql) {
          if (sql.includes('FROM information_schema.TABLES')) {
            return [[]]; // fresh clean database
          }
          return [[]];
        }
      };

      const result = await checkDatabaseEphemeralState(mockDb);
      expect(result.ok).toBe(true);
    });
  });

  // =========================================================================
  // 5. STRUCTURAL IDEMPOTENCY & NON-DESTRUCTIVE VERIFICATION
  // =========================================================================
  describe('5. Structural Idempotency Verification (verifyOrApplyStructuralFixtures)', () => {
    it('creates missing tables without executing destructive DROP or ALTER', async () => {
      const executedQueries = [];
      const mockDb = {
        async query(sql) {
          executedQueries.push(sql);
          if (sql.includes('FROM information_schema.TABLES')) {
            return [[]]; // none exist initially
          }
          return [{ affectedRows: 0 }];
        }
      };

      await verifyOrApplyStructuralFixtures(mockDb);

      expect(executedQueries.length).toBe(10); // 1 select + 9 table creations
      // Zero DROP TABLE queries
      expect(executedQueries.some(q => q.toUpperCase().includes('DROP TABLE'))).toBe(false);
      // Zero ALTER TABLE queries
      expect(executedQueries.some(q => q.toUpperCase().includes('ALTER TABLE'))).toBe(false);
      // Zero SET FOREIGN_KEY_CHECKS=0
      expect(executedQueries.some(q => q.includes('FOREIGN_KEY_CHECKS = 0') || q.includes('FOREIGN_KEY_CHECKS=0'))).toBe(false);
    });

    it('rejects a pre-existing table that is missing required contract columns', async () => {
      const mockDb = {
        async query(sql, params) {
          if (sql.includes('FROM information_schema.TABLES')) {
            return [[{ TABLE_NAME: 'printer_machines' }]];
          }
          if (sql.includes('FROM information_schema.COLUMNS')) {
            // Missing 'status' and 'type'!
            return [[
              { COLUMN_NAME: 'id' },
              { COLUMN_NAME: 'printer_id' },
              { COLUMN_NAME: 'nickname' }
            ]];
          }
          return [[]];
        }
      };

      await expect(verifyOrApplyStructuralFixtures(mockDb)).rejects.toThrow(
        /STRUCTURAL IDEMPOTENCY DIVERGENCE: Pre-existing table 'printer_machines' is missing required contract column 'type'/
      );
    });

    it('rejects a pre-existing table that has incompatible or missing foreign keys', async () => {
      const mockDb = {
        async query(sql, params) {
          if (sql.includes('FROM information_schema.TABLES')) {
            return [[{ TABLE_NAME: 'printhouse_capabilities' }]];
          }
          if (sql.includes('FROM information_schema.COLUMNS')) {
            return [[
              { COLUMN_NAME: 'id' },
              { COLUMN_NAME: 'printhouse_id' },
              { COLUMN_NAME: 'tenant_id' }
            ]];
          }
          if (sql.includes('FROM information_schema.KEY_COLUMN_USAGE')) {
            // Incompatible FK: points to wrong table or column
            return [[{
              CONSTRAINT_NAME: 'fk_wrong',
              COLUMN_NAME: 'printhouse_id',
              REFERENCED_TABLE_NAME: 'wrong_parent',
              REFERENCED_COLUMN_NAME: 'id'
            }]];
          }
          return [[]];
        }
      };

      await expect(verifyOrApplyStructuralFixtures(mockDb)).rejects.toThrow(
        /STRUCTURAL IDEMPOTENCY DIVERGENCE: Pre-existing table 'printhouse_capabilities' does not satisfy required foreign key/
      );
    });

    it('passes idempotently when pre-existing tables satisfy full contract specifications', async () => {
      const executedMutations = [];
      const mockDb = {
        async query(sql, params) {
          if (sql.includes('CREATE TABLE') || sql.includes('DROP') || sql.includes('ALTER')) {
            executedMutations.push(sql);
          }
          if (sql.includes('FROM information_schema.TABLES')) {
            // All 9 tables already exist
            return [Object.keys(FIXTURE_CONTRACT_SPECS).map(t => ({ TABLE_NAME: t }))];
          }
          if (sql.includes('FROM information_schema.COLUMNS')) {
            const tableName = params[0];
            const spec = FIXTURE_CONTRACT_SPECS[tableName];
            return [spec.requiredColumns.map(c => ({ COLUMN_NAME: c }))];
          }
          if (sql.includes('FROM information_schema.KEY_COLUMN_USAGE')) {
            const tableName = params[0];
            const spec = FIXTURE_CONTRACT_SPECS[tableName];
            return [spec.requiredFks.map(fk => ({
              CONSTRAINT_NAME: fk.name,
              COLUMN_NAME: fk.col,
              REFERENCED_TABLE_NAME: fk.parent,
              REFERENCED_COLUMN_NAME: fk.refCol
            }))];
          }
          return [[]];
        }
      };

      await expect(verifyOrApplyStructuralFixtures(mockDb)).resolves.not.toThrow();
      // Zero mutations executed on pre-existing compatible tables
      expect(executedMutations.length).toBe(0);
    });
  });
});
