/**
 * src/api/services/printhouseRouteRuleService.js
 *
 * Phase 195D — Governed Machine Route Rules Service
 *
 * Responsibilities:
 * 1. Manages versioned, auditable, immutable operator & commercial route rules.
 * 2. Computes deterministic SHA-256 checksums over rule conditions & actions.
 * 3. Enforces rule status transitions (DRAFT -> VALIDATED -> SUPERSEDED).
 * 4. Provides scoped rule lookup for shadow route selection evaluation.
 */

const crypto = require('crypto');
const db = require('./mysqlClient');
const logger = require('./logger').child('printhouse-route-rules');

const RULE_TYPES = Object.freeze({
  OPERATOR_RULE: 'OPERATOR_RULE',
  COMMERCIAL_TIER: 'COMMERCIAL_TIER',
  GOVERNED_ROUTE_OVERRIDE: 'GOVERNED_ROUTE_OVERRIDE',
  CAPACITY_CONSTRAINT: 'CAPACITY_CONSTRAINT'
});

const RULE_STATUSES = Object.freeze({
  DRAFT: 'DRAFT',
  VALIDATED: 'VALIDATED',
  SUPERSEDED: 'SUPERSEDED'
});

function _isDbFallbackAllowed() {
  return process.env.NODE_ENV === 'test' ||
    Boolean(process.env.ALLOW_DB_FALLBACK_FOR_SMOKE) ||
    !process.env.MYSQL_HOST ||
    process.env.MYSQL_HOST === 'NOT_SET';
}

const mockRuleStore = new Map();

class PrinthouseRouteRuleService {

  constructor() {
    this.TYPES = RULE_TYPES;
    this.STATUSES = RULE_STATUSES;
  }

  computeChecksum(rulePayload) {
    const norm = {
      rule_name: rulePayload.rule_name || rulePayload.ruleName,
      rule_type: rulePayload.rule_type || rulePayload.ruleType,
      target_machine_id: rulePayload.target_machine_id || rulePayload.targetMachineId || null,
      conditions: rulePayload.conditions_json || rulePayload.conditions || {},
      action: rulePayload.action_json || rulePayload.action || {},
      reason_code: rulePayload.reason_code || rulePayload.reasonCode || 'GOVERNED_ROUTE_RULE'
    };
    return crypto.createHash('sha256').update(JSON.stringify(norm)).digest('hex').substring(0, 16);
  }

  async createRouteRule(tenantId, printhouseId, ruleData, actor = {}) {
    if (!tenantId || !printhouseId) {
      throw new Error('INVALID_TENANT_CONTEXT');
    }

    const ruleName = ruleData.rule_name || ruleData.ruleName;
    const ruleType = ruleData.rule_type || ruleData.ruleType || RULE_TYPES.OPERATOR_RULE;
    const targetMachineId = ruleData.target_machine_id || ruleData.targetMachineId || null;
    const conditions = ruleData.conditions_json || ruleData.conditions || {};
    const action = ruleData.action_json || ruleData.action || {};
    const reasonCode = ruleData.reason_code || ruleData.reasonCode || 'OPERATOR_GOVERNED_RULE';
    const operatorNote = ruleData.operator_note || ruleData.operatorNote || null;
    const initialStatus = ruleData.status === 'VALIDATED' ? 'VALIDATED' : 'DRAFT';

    if (!ruleName) {
      throw new Error('INVALID_RULE_DATA: missing rule_name');
    }

    const id = `rule-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const checksum = this.computeChecksum({
      rule_name: ruleName,
      rule_type: ruleType,
      target_machine_id: targetMachineId,
      conditions_json: conditions,
      action_json: action,
      reason_code: reasonCode
    });

    let version = 1;
    let existingList = [];

    try {
      const pool = db.getPool();
      const [rows] = await pool.query(
        'SELECT * FROM printhouse_machine_route_rules WHERE tenant_id = ? AND printhouse_id = ? AND rule_name = ? ORDER BY version DESC',
        [tenantId, printhouseId, ruleName]
      );
      existingList = rows || [];
    } catch (e) {
      logger.warn(`DB route rule lookup skipped/failed: ${e.message}`);
      if (_isDbFallbackAllowed()) {
        const key = `${tenantId}:${printhouseId}`;
        existingList = (mockRuleStore.get(key) || []).filter(r => r.rule_name === ruleName);
      }
    }

    if (existingList.length > 0) {
      version = existingList[0].version + 1;
    }

    const newRecord = {
      id,
      tenant_id: tenantId,
      printhouse_id: printhouseId,
      rule_name: ruleName,
      rule_type: ruleType,
      version,
      status: initialStatus,
      target_machine_id: targetMachineId,
      conditions_json: conditions,
      action_json: action,
      reason_code: reasonCode,
      operator_note: operatorNote,
      checksum,
      created_by: actor.id || actor.email || 'SYSTEM',
      created_at: new Date().toISOString(),
      superseded_at: null
    };

    try {
      const pool = db.getPool();
      if (initialStatus === 'VALIDATED') {
        await pool.query(
          `UPDATE printhouse_machine_route_rules 
           SET status = 'SUPERSEDED', superseded_at = NOW() 
           WHERE tenant_id = ? AND printhouse_id = ? AND rule_name = ? AND status = 'VALIDATED'`,
          [tenantId, printhouseId, ruleName]
        );
      }

      await pool.query(
        `INSERT INTO printhouse_machine_route_rules 
         (id, tenant_id, printhouse_id, rule_name, rule_type, version, status, target_machine_id, conditions_json, action_json, reason_code, operator_note, checksum, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          id,
          tenantId,
          printhouseId,
          ruleName,
          ruleType,
          version,
          initialStatus,
          targetMachineId,
          JSON.stringify(conditions),
          JSON.stringify(action),
          reasonCode,
          operatorNote,
          checksum,
          newRecord.created_by
        ]
      );
    } catch (e) {
      logger.warn(`DB route rule creation skipped/failed: ${e.message}`);
      if (_isDbFallbackAllowed()) {
        const key = `${tenantId}:${printhouseId}`;
        const current = mockRuleStore.get(key) || [];
        if (initialStatus === 'VALIDATED') {
          current.forEach(r => {
            if (r.rule_name === ruleName && r.status === 'VALIDATED') {
              r.status = 'SUPERSEDED';
              r.superseded_at = new Date().toISOString();
            }
          });
        }
        current.push(newRecord);
        mockRuleStore.set(key, current);
      }
    }

    return newRecord;
  }

  async getActiveRouteRules(tenantId, printhouseId) {
    let rules = [];
    try {
      const pool = db.getPool();
      const [rows] = await pool.query(
        'SELECT * FROM printhouse_machine_route_rules WHERE tenant_id = ? AND printhouse_id = ? AND status = "VALIDATED" ORDER BY id ASC',
        [tenantId, printhouseId]
      );
      rules = (rows || []).map(r => ({
        ...r,
        conditions_json: typeof r.conditions_json === 'string' ? JSON.parse(r.conditions_json) : r.conditions_json,
        action_json: typeof r.action_json === 'string' ? JSON.parse(r.action_json) : r.action_json
      }));
    } catch (e) {
      logger.warn(`DB active route rules lookup skipped/failed: ${e.message}`);
      if (_isDbFallbackAllowed()) {
        const key = `${tenantId}:${printhouseId}`;
        rules = (mockRuleStore.get(key) || []).filter(r => r.status === 'VALIDATED');
      }
    }
    return rules;
  }

  async listRouteRules(tenantId, printhouseId) {
    let rules = [];
    try {
      const pool = db.getPool();
      const [rows] = await pool.query(
        'SELECT * FROM printhouse_machine_route_rules WHERE tenant_id = ? AND printhouse_id = ? ORDER BY version DESC',
        [tenantId, printhouseId]
      );
      rules = (rows || []).map(r => ({
        ...r,
        conditions_json: typeof r.conditions_json === 'string' ? JSON.parse(r.conditions_json) : r.conditions_json,
        action_json: typeof r.action_json === 'string' ? JSON.parse(r.action_json) : r.action_json
      }));
    } catch (e) {
      logger.warn(`DB route rules listing skipped/failed: ${e.message}`);
      if (_isDbFallbackAllowed()) {
        const key = `${tenantId}:${printhouseId}`;
        rules = mockRuleStore.get(key) || [];
      }
    }
    return rules;
  }
}

module.exports = new PrinthouseRouteRuleService();
module.exports.RULE_TYPES = RULE_TYPES;
module.exports.RULE_STATUSES = RULE_STATUSES;
