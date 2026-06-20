'use strict';

const mysql = require('mysql2/promise');

class Phase129ControlledBetaFixture {
  constructor(dbConfig) {
    this.pool = mysql.createPool(dbConfig);
  }

  async close() {
    await this.pool.end();
  }

  async setupPrerequisites(activationId) {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();

      // 1. Setup Phase 128.1 Evidence (schema versions should exist if migration ran)
      // We assume migrations 074 and 075 are already present in DB from normal execution.
      // Insert mock restart drill if needed
      await conn.query(`
        INSERT INTO limited_beta_runtime_restart_drills 
        (drill_id, pre_restart_snapshot_id, pre_restart_pid, pre_restart_uptime, 
         restart_recovery_status, recovery_integrity_hash)
        VALUES 
        ('drill_fix_129', 'snap_129', 1234, 100, 'COMPLETED', 'hash_129')
        ON DUPLICATE KEY UPDATE restart_recovery_status='COMPLETED'
      `);

      // Insert mock runtime session
      await conn.query(`
        INSERT INTO limited_beta_runtime_sessions
        (session_id, gate_id, participant_id, recovered_from_db, memory_state_detected, restart_safe)
        VALUES
        ('sess_fix_129', 'gate_123', 'part_129', 1, 0, 1)
        ON DUPLICATE KEY UPDATE recovered_from_db=1, memory_state_detected=0, restart_safe=1
      `);

      // 2. Setup Phase 127.1 Evidence
      // We assume migration 073 is present.
      // Insert mock evidence pack
      await conn.query(`
        INSERT INTO limited_beta_evidence_packs
        (evidence_pack_id, gate_id, evidence_schema_version, evidence_data_json, evidence_integrity_hash)
        VALUES
        ('pack_fix_129', 'gate_123', '128.0', '{}', 'hash_129')
        ON DUPLICATE KEY UPDATE evidence_schema_version='128.0'
      `);

      // 3. Update specific activation fields that the service doesn't have explicit setters for yet
      if (activationId) {
        await conn.query(`
          UPDATE controlled_beta_cohort_activations
          SET rollback_ready = 1, kill_switch_ready = 1
          WHERE activation_id = ?
        `, [activationId]);
      }

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  async cleanupPrerequisites() {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      
      await conn.query("DELETE FROM limited_beta_runtime_restart_drills WHERE drill_id = 'drill_fix_129'");
      await conn.query("DELETE FROM limited_beta_runtime_sessions WHERE session_id = 'sess_fix_129'");
      await conn.query("DELETE FROM limited_beta_evidence_packs WHERE evidence_pack_id = 'pack_fix_129'");

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
