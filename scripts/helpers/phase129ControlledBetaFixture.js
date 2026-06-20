'use strict';

const mysql = require('mysql2/promise');
const crypto = require('crypto');

class Phase129ControlledBetaFixture {
  constructor(dbConfig) {
    this.pool = mysql.createPool(dbConfig);
  }

  async close() {
    await this.pool.end();
  }

  _generateId(prefix) {
    return `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  }

  async setupPrerequisites(activationId, prefix = 'test_129') {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();

      let usedDrillId = null;

      // 1. Prefer real completed Phase 128.1 evidence
      const [drills] = await conn.query(`
        SELECT drill_id FROM limited_beta_runtime_restart_drills 
        WHERE restart_recovery_status IN ('VERIFIED_AFTER_RESTART', 'COMPLETED')
          AND recovery_integrity_hash IS NOT NULL
        ORDER BY started_at DESC LIMIT 1
      `);
      
      const [sessions] = await conn.query(`
        SELECT session_id FROM limited_beta_runtime_sessions
        WHERE recovered_from_db = 1 AND memory_state_detected = 0 AND restart_safe = 1
        LIMIT 1
      `);

      if (drills.length > 0 && sessions.length > 0) {
        usedDrillId = drills[0].drill_id;
      } else {
        // Need synthetic evidence
        if (process.env.ALLOW_PHASE129_SYNTHETIC_EVIDENCE !== 'true') {
          throw new Error('Real Phase 128.1 evidence missing and synthetic evidence generation not explicitly allowed via ALLOW_PHASE129_SYNTHETIC_EVIDENCE=true');
        }

        // Check schema for limited_beta_runtime_restart_drills
        const [cols] = await conn.query(`
          SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
          WHERE TABLE_NAME = 'limited_beta_runtime_restart_drills'
        `);
        const colNames = cols.map(c => c.COLUMN_NAME);

        const requiredCols = [
          'drill_id', 'gate_id', 'cohort_id', 'participant_id', 'tenant_id', 
          'restart_recovery_status', 'runtime_truth_status', 'persistence_status', 'recovery_integrity_hash'
        ];

        for (const req of requiredCols) {
          if (!colNames.includes(req)) {
            throw new Error(`PHASE_128_1_SCHEMA_MISMATCH: Missing column ${req} in limited_beta_runtime_restart_drills`);
          }
        }

        const missingPreRestartCols = ['pre_restart_snapshot_id', 'pre_restart_pid', 'pre_restart_uptime'].some(c => colNames.includes(c));
        if (missingPreRestartCols) {
          // This just checks if those bad columns somehow exist, but we won't insert them.
        }

        usedDrillId = this._generateId(`drill_${prefix}`);
        const possibleCols = {
          drill_id: usedDrillId,
          gate_id: 'gate_123',
          cohort_id: 'cohort_123',
          participant_id: 'part_123',
          tenant_id: 'tenant_123',
          restart_recovery_status: 'COMPLETED',
          runtime_truth_status: 'VERIFIED',
          persistence_status: 'PERSISTED',
          recovery_integrity_hash: 'hash_129',
          recovered_from_db: 1,
          memory_state_detected: 0,
          restart_safe: 1,
          last_verified_after_restart_at: new Date(),
          completed_at: new Date(),
          created_at: new Date()
        };

        const insertObj = {};
        for (const [col, val] of Object.entries(possibleCols)) {
          if (colNames.includes(col)) {
            insertObj[col] = val;
          }
        }

        const keys = Object.keys(insertObj);
        const vals = Object.values(insertObj);
        const insertCols = keys.join(', ');
        const insertVals = keys.map(() => '?').join(', ');
        
        await conn.query(`
          INSERT INTO limited_beta_runtime_restart_drills (${insertCols})
          VALUES (${insertVals})
          ON DUPLICATE KEY UPDATE restart_recovery_status='COMPLETED'
        `, vals);

        const sessionId = this._generateId(`sess_${prefix}`);
        await conn.query(`
          INSERT INTO limited_beta_runtime_sessions
          (session_id, gate_id, participant_id, recovered_from_db, memory_state_detected, restart_safe)
          VALUES
          (?, 'gate_123', 'part_129', 1, 0, 1)
          ON DUPLICATE KEY UPDATE recovered_from_db=1, memory_state_detected=0, restart_safe=1
        `, [sessionId]);
      }

      // 2. Setup Phase 127.1 Evidence
      const packId = this._generateId(`pack_${prefix}`);
      await conn.query(`
        INSERT INTO limited_beta_evidence_packs
        (evidence_pack_id, gate_id, evidence_schema_version, evidence_data_json, evidence_integrity_hash)
        VALUES
        (?, 'gate_123', '128.0', '{}', 'hash_129')
        ON DUPLICATE KEY UPDATE evidence_schema_version='128.0'
      `, [packId]);

      // 3. Update specific activation fields that the service doesn't have explicit setters for yet
      if (activationId) {
        await conn.query(`
          UPDATE controlled_beta_cohort_activations
          SET rollback_ready = 1, kill_switch_ready = 1
          WHERE activation_id = ?
        `, [activationId]);
      }

      await conn.commit();
      return { packId, usedDrillId };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  async cleanupPhase129Fixture(testPrefix) {
    if (!testPrefix) throw new Error("cleanupPhase129Fixture requires a testPrefix");
    
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      
      const likeQuery = `%_${testPrefix}_%`;
      const likeQueryStart = `${testPrefix}_%`;
      
      // Cleanup synthetic evidence
      await conn.query("DELETE FROM limited_beta_runtime_restart_drills WHERE drill_id LIKE ?", [likeQueryStart]);
      await conn.query("DELETE FROM limited_beta_runtime_sessions WHERE session_id LIKE ?", [likeQueryStart]);
      await conn.query("DELETE FROM limited_beta_evidence_packs WHERE evidence_pack_id LIKE ?", [likeQueryStart]);

      // Cleanup 129 tracking tables
      const tables = [
        'controlled_beta_activation_evidence_packs',
        'controlled_beta_activation_findings',
        'controlled_beta_activation_kill_switch_events',
        'controlled_beta_activation_incident_events',
        'controlled_beta_activation_support_events',
        'controlled_beta_activation_monitoring_events',
        'controlled_beta_activation_session_limits',
        'controlled_beta_activation_scope_bindings',
        'controlled_beta_activation_invites',
        'controlled_beta_activation_participants',
        'controlled_beta_cohort_activations'
      ];

      for (const table of tables) {
        // We assume test records have the prefix somewhere in their keys
        // or we can use the activation_id. Let's delete by activation_id.
        if (table === 'controlled_beta_cohort_activations') {
          await conn.query(`DELETE FROM ${table} WHERE activation_id LIKE ?`, [likeQuery]);
        } else {
          // They all have activation_id except maybe some that don't, but all of the above do.
          await conn.query(`DELETE FROM ${table} WHERE activation_id LIKE ?`, [likeQuery]);
        }
      }

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }
}

module.exports = Phase129ControlledBetaFixture;
