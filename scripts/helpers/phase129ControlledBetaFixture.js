'use strict';

const mysql = require('mysql2/promise');
const crypto = require('crypto');

class Phase129ControlledBetaFixture {
  constructor(dbConfig) {
    this.pool = mysql.createPool(dbConfig);
    this._columnsCache = {};
  }

  async close() {
    await this.pool.end();
  }

  _generateId(prefix) {
    return `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  }

  async getTableColumns(tableName) {
    if (this._columnsCache[tableName]) return this._columnsCache[tableName];

    const [cols] = await this.pool.query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
    `, [tableName]);

    this._columnsCache[tableName] = cols.map(c => c.COLUMN_NAME);
    return this._columnsCache[tableName];
  }

  async hasColumn(tableName, columnName) {
    const cols = await this.getTableColumns(tableName);
    return cols.includes(columnName);
  }

  async buildInsertForExistingColumns(tableName, desiredData) {
    const cols = await this.getTableColumns(tableName);
    const insertObj = {};
    for (const [col, val] of Object.entries(desiredData)) {
      if (cols.includes(col)) {
        insertObj[col] = val;
      }
    }
    return insertObj;
  }

  async findCompletedPhase128RestartDrill() {
    const drillsCols = await this.getTableColumns('limited_beta_runtime_restart_drills');
    let query = "SELECT drill_id FROM limited_beta_runtime_restart_drills WHERE restart_recovery_status IN ('VERIFIED_AFTER_RESTART', 'COMPLETED')";
    
    if (drillsCols.includes('recovery_integrity_hash')) {
      query += " AND recovery_integrity_hash IS NOT NULL";
    }
    query += " ORDER BY started_at DESC LIMIT 1";
    
    const [drills] = await this.pool.query(query);
    
    const sessionsCols = await this.getTableColumns('limited_beta_runtime_sessions');
    let sessQuery = "SELECT session_id FROM limited_beta_runtime_sessions WHERE recovered_from_db = 1";
    if (sessionsCols.includes('memory_state_detected')) sessQuery += " AND memory_state_detected = 0";
    if (sessionsCols.includes('restart_safe')) sessQuery += " AND restart_safe = 1";
    sessQuery += " LIMIT 1";

    const [sessions] = await this.pool.query(sessQuery);
    if (drills.length > 0 && sessions.length > 0) {
      return drills[0].drill_id;
    }
    return null;
  }

  async findExistingEvidencePackAdaptive() {
    const cols = await this.getTableColumns('limited_beta_evidence_packs');
    
    let query = "SELECT evidence_pack_id FROM limited_beta_evidence_packs WHERE 1=1";
    if (cols.includes('evidence_schema_version')) {
      query += " AND evidence_schema_version IN ('127.1', '128.0', '128.1', '129.0')";
    }
    if (cols.includes('gate_id')) {
      query += " AND gate_id IS NOT NULL";
    }
    if (cols.includes('evidence_status')) {
      query += " AND evidence_status IN ('VERIFIED', 'VALID', 'COMPLETED')";
    }
    if (cols.includes('evidence_integrity_hash')) {
      query += " AND evidence_integrity_hash IS NOT NULL";
    } else if (cols.includes('integrity_hash')) {
      query += " AND integrity_hash IS NOT NULL";
    }
    query += " LIMIT 1";

    const [packs] = await this.pool.query(query);
    if (packs.length > 0) {
      return packs[0].evidence_pack_id;
    }
    return null;
  }

  async upsertEvidencePackAdaptive(conn, prefix) {
    const packId = this._generateId(`pack_${prefix}`);
    
    const desiredData = {
      evidence_pack_id: packId,
      gate_id: 'gate_123',
      evidence_schema_version: '128.0',
      evidence_data_json: '{}',
      evidence_json: '{}',
      pack_json: '{}',
      evidence_status: 'VERIFIED',
      evidence_integrity_hash: 'hash_129',
      integrity_hash: 'hash_129',
      created_at: new Date(),
      updated_at: new Date()
    };

    const insertObj = await this.buildInsertForExistingColumns('limited_beta_evidence_packs', desiredData);
    
    const keys = Object.keys(insertObj);
    const vals = Object.values(insertObj);
    const insertCols = keys.join(', ');
    const insertVals = keys.map(() => '?').join(', ');

    let onDup = "ON DUPLICATE KEY UPDATE ";
    if (keys.includes('evidence_schema_version')) {
      onDup += "evidence_schema_version='128.0'";
    } else if (keys.includes('updated_at')) {
      onDup += "updated_at=CURRENT_TIMESTAMP";
    } else {
      onDup += "evidence_pack_id=VALUES(evidence_pack_id)"; // Dummy update
    }

    await conn.query(`
      INSERT INTO limited_beta_evidence_packs (${insertCols})
      VALUES (${insertVals})
      ${onDup}
    `, vals);

    return packId;
  }

  async setupPrerequisites(activationId, prefix = 'test_129') {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();

      let usedDrillId = await this.findCompletedPhase128RestartDrill();
      let usedPackId = await this.findExistingEvidencePackAdaptive();

      const needSynthetic = (!usedDrillId || !usedPackId);

      if (needSynthetic) {
        if (process.env.ALLOW_PHASE129_SYNTHETIC_EVIDENCE !== 'true') {
          throw new Error('Real Phase 128.1/127.1 evidence missing and synthetic evidence generation not explicitly allowed via ALLOW_PHASE129_SYNTHETIC_EVIDENCE=true');
        }

        if (!usedDrillId) {
          const colNames = await this.getTableColumns('limited_beta_runtime_restart_drills');
          
          const requiredCols = [
            'drill_id', 'gate_id', 'cohort_id', 'participant_id', 'tenant_id', 
            'restart_recovery_status', 'runtime_truth_status', 'persistence_status'
          ];
  
          for (const req of requiredCols) {
            if (!colNames.includes(req)) {
              throw new Error(`PHASE_128_1_SCHEMA_MISMATCH: Missing column ${req} in limited_beta_runtime_restart_drills`);
            }
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
  
          const insertObj = await this.buildInsertForExistingColumns('limited_beta_runtime_restart_drills', possibleCols);
          const keys = Object.keys(insertObj);
          const vals = Object.values(insertObj);
          
          await conn.query(`
            INSERT INTO limited_beta_runtime_restart_drills (${keys.join(', ')})
            VALUES (${keys.map(() => '?').join(', ')})
            ON DUPLICATE KEY UPDATE restart_recovery_status='COMPLETED'
          `, vals);
  
          const sessionId = this._generateId(`sess_${prefix}`);
          const sessCols = await this.getTableColumns('limited_beta_runtime_sessions');
          
          const sessObj = {
            session_id: sessionId,
            gate_id: 'gate_123',
            participant_id: 'part_129'
          };
          if (sessCols.includes('recovered_from_db')) sessObj.recovered_from_db = 1;
          if (sessCols.includes('memory_state_detected')) sessObj.memory_state_detected = 0;
          if (sessCols.includes('restart_safe')) sessObj.restart_safe = 1;

          const sKeys = Object.keys(sessObj);
          const sVals = Object.values(sessObj);
          
          let sOnDup = "ON DUPLICATE KEY UPDATE ";
          if (sKeys.includes('recovered_from_db')) sOnDup += "recovered_from_db=1";
          else sOnDup += "session_id=VALUES(session_id)";

          await conn.query(`
            INSERT INTO limited_beta_runtime_sessions (${sKeys.join(', ')})
            VALUES (${sKeys.map(() => '?').join(', ')})
            ${sOnDup}
          `, sVals);
        }

        if (!usedPackId) {
          usedPackId = await this.upsertEvidencePackAdaptive(conn, prefix);
        }
      }

      if (activationId) {
        await conn.query(`
          UPDATE controlled_beta_cohort_activations
          SET rollback_ready = 1, kill_switch_ready = 1
          WHERE activation_id = ?
        `, [activationId]);
      }

      await conn.commit();
      return { packId: usedPackId, usedDrillId };
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
      
      await conn.query("DELETE FROM limited_beta_runtime_restart_drills WHERE drill_id LIKE ?", [likeQueryStart]);
      await conn.query("DELETE FROM limited_beta_runtime_sessions WHERE session_id LIKE ?", [likeQueryStart]);
      
      const packCols = await this.getTableColumns('limited_beta_evidence_packs');
      if (packCols.includes('evidence_pack_id')) {
        await conn.query("DELETE FROM limited_beta_evidence_packs WHERE evidence_pack_id LIKE ?", [likeQueryStart]);
      }

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
        await conn.query(`DELETE FROM ${table} WHERE activation_id LIKE ?`, [likeQuery]);
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
