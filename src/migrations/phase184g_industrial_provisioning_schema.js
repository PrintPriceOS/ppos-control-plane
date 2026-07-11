'use strict';

/**
 * src/migrations/phase184g_industrial_provisioning_schema.js
 *
 * Phase 184G: Structural DDL Extraction
 *
 * This module contains all DDL that was previously embedded inside
 * src/api/services/industrialProvisioningService.js (ensureCoreColumns).
 *
 * It is ONLY callable from the migration CLI runner under
 * PPOS_MIGRATION_EXECUTION=true. It must never be required by any
 * runtime entrypoint (server.js, src/api/routes/, src/api/services/).
 *
 * To apply: node scripts/run_control_plane_migrations.js
 */

async function up(db) {
  if (process.env.PPOS_MIGRATION_EXECUTION !== 'true') {
    throw new Error('DDL_EXECUTION_FORBIDDEN_OUTSIDE_MIGRATION_CONTEXT');
  }

  const ddlStatements = [
    // Phase 34: Live Capacity Snapshots
    `CREATE TABLE IF NOT EXISTS live_capacity_snapshots (
      id INT AUTO_INCREMENT PRIMARY KEY,
      node_id VARCHAR(64) NOT NULL,
      status VARCHAR(32),
      utilization_pct INT,
      freshness_state VARCHAR(32),
      routing_eligible BOOLEAN,
      saturation_risk VARCHAR(32),
      captured_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_node (node_id),
      INDEX idx_captured (captured_at)
    ) ENGINE=InnoDB`,

    // Phase 34: Immutable Evidence Ledger
    `CREATE TABLE IF NOT EXISTS production_evidence_ledger (
      id INT AUTO_INCREMENT PRIMARY KEY,
      dispatch_id VARCHAR(64) NOT NULL,
      node_id VARCHAR(64),
      tenant_id VARCHAR(64),
      evidence_type VARCHAR(64) NOT NULL,
      payload_json JSON NOT NULL,
      hash VARCHAR(64) NOT NULL,
      previous_hash VARCHAR(64),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_dispatch (dispatch_id),
      INDEX idx_evidence_type (evidence_type)
    ) ENGINE=InnoDB`,

    // Phase 34: Live SLA Evidence Snapshots
    `CREATE TABLE IF NOT EXISTS sla_evidence_snapshots (
      id INT AUTO_INCREMENT PRIMARY KEY,
      dispatch_id VARCHAR(64) NOT NULL,
      promised_delivery_at DATETIME,
      estimated_completion_at DATETIME,
      sla_drift_minutes INT DEFAULT 0,
      risk_level ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') DEFAULT 'LOW',
      evidence_count INT DEFAULT 0,
      last_node_seen_at TIMESTAMP NULL,
      captured_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_dispatch (dispatch_id),
      INDEX idx_risk (risk_level)
    ) ENGINE=InnoDB`,

    // Phase 16: Federation Factories (Industrial Hubs)
    `CREATE TABLE IF NOT EXISTS federation_factories (
      id VARCHAR(64) PRIMARY KEY,
      company_name VARCHAR(255) NOT NULL,
      factory_name VARCHAR(255) NOT NULL,
      region VARCHAR(64),
      timezone VARCHAR(64) DEFAULT 'UTC',
      specialization VARCHAR(128),
      capacity_index DECIMAL(5,2) DEFAULT 0.00,
      reliability_index DECIMAL(5,2) DEFAULT 0.00,
      latency_score DECIMAL(5,2) DEFAULT 0.00,
      economic_score DECIMAL(5,2) DEFAULT 0.00,
      energy_score DECIMAL(5,2) DEFAULT 0.00,
      federation_state VARCHAR(32) DEFAULT 'ACTIVE',
      last_heartbeat TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB`,

    // Phase 34: Autonomous Routing Infrastructure
    `CREATE TABLE IF NOT EXISTS routing_decisions (
      id VARCHAR(64) PRIMARY KEY,
      job_id VARCHAR(64),
      selected_machine_id VARCHAR(64),
      routing_score DECIMAL(5,2),
      explanation TEXT,
      status ENUM('PENDING', 'COMMITTED', 'REJECTED') DEFAULT 'PENDING',
      metadata_json JSON,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_job (job_id),
      INDEX idx_machine (selected_machine_id)
    ) ENGINE=InnoDB`,

    `CREATE TABLE IF NOT EXISTS routing_scores (
      id INT AUTO_INCREMENT PRIMARY KEY,
      decision_id VARCHAR(64) NOT NULL,
      cost_score DECIMAL(5,2),
      time_score DECIMAL(5,2),
      capability_score DECIMAL(5,2),
      risk_score DECIMAL(5,2),
      geographic_score DECIMAL(5,2),
      carbon_score DECIMAL(5,2),
      total_score DECIMAL(5,2),
      INDEX idx_decision (decision_id)
    ) ENGINE=InnoDB`,

    `CREATE TABLE IF NOT EXISTS routing_history (
      id INT AUTO_INCREMENT PRIMARY KEY,
      job_id VARCHAR(64),
      action VARCHAR(128),
      details_json JSON,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_job (job_id)
    ) ENGINE=InnoDB`
  ];

  // ALTER TABLE column additions extracted from ensureCoreColumns
  const columnAdditions = [
    // Phase 18 Governance columns
    { table: 'print_nodes',                  column: 'rates_json',                   type: 'JSON NULL' },
    { table: 'printer_pricing_profiles',     column: 'rates_json',                   type: 'JSON NULL' },
    { table: 'manufacturing_dispatches',     column: 'federation_node_id',           type: 'VARCHAR(64) NULL' },
    { table: 'manufacturing_dispatches',     column: 'governance_policy_score',      type: 'FLOAT DEFAULT 0.0' },
    { table: 'manufacturing_dispatches',     column: 'governance_risk_score',        type: 'DECIMAL(5,2) DEFAULT 0.00' },
    { table: 'manufacturing_dispatches',     column: 'constitutional_compliance',    type: 'DECIMAL(5,2) DEFAULT 100.00' },
    { table: 'manufacturing_dispatches',     column: 'cognition_priority',           type: 'INT DEFAULT 0' },
    { table: 'manufacturing_dispatches',     column: 'recursive_generation_id',      type: 'VARCHAR(64) NULL' },
    { table: 'print_node_machine_profiles',  column: 'governance_stability_score',   type: 'DECIMAL(5,2) DEFAULT 100.00' },
    { table: 'print_node_machine_profiles',  column: 'federation_learning_score',    type: 'DECIMAL(5,2) DEFAULT 0.00' },
    { table: 'print_node_machine_profiles',  column: 'ethics_compliance_score',      type: 'DECIMAL(5,2) DEFAULT 100.00' },
    // Phase 19 Civilization columns
    { table: 'manufacturing_dispatches',     column: 'planetary_priority_score',     type: 'DECIMAL(5,2) DEFAULT 0.00' },
    { table: 'manufacturing_dispatches',     column: 'civilization_risk_score',      type: 'DECIMAL(5,2) DEFAULT 0.00' },
    { table: 'manufacturing_dispatches',     column: 'intercontinental_route_id',    type: 'VARCHAR(64) NULL' },
    { table: 'manufacturing_dispatches',     column: 'planetary_equilibrium_weight', type: 'DECIMAL(5,2) DEFAULT 1.00' },
    { table: 'print_node_machine_profiles',  column: 'continental_cluster_id',       type: 'VARCHAR(64) NULL' },
    { table: 'print_node_machine_profiles',  column: 'planetary_reliability_index',  type: 'DECIMAL(5,2) DEFAULT 100.00' },
    { table: 'print_node_machine_profiles',  column: 'civilization_contribution_score', type: 'DECIMAL(5,2) DEFAULT 0.00' },
    // Phase 20 Interplanetary columns
    { table: 'manufacturing_dispatches',     column: 'interplanetary_priority_score', type: 'DECIMAL(5,2) DEFAULT 0.00' },
    { table: 'manufacturing_dispatches',     column: 'existential_risk_score',        type: 'DECIMAL(5,2) DEFAULT 0.00' },
    { table: 'manufacturing_dispatches',     column: 'orbital_route_id',              type: 'VARCHAR(64) NULL' },
    { table: 'manufacturing_dispatches',     column: 'continuity_weight',             type: 'DECIMAL(5,2) DEFAULT 1.00' },
    { table: 'print_node_machine_profiles',  column: 'orbital_cluster_id',            type: 'VARCHAR(64) NULL' },
    { table: 'print_node_machine_profiles',  column: 'synthetic_awareness_score',     type: 'DECIMAL(5,2) DEFAULT 0.00' },
    { table: 'print_node_machine_profiles',  column: 'civilization_survival_score',   type: 'DECIMAL(5,2) DEFAULT 100.00' },
    // Phase 21 Reality columns
    { table: 'manufacturing_dispatches',     column: 'timeline_weight',       type: 'DECIMAL(5,2) DEFAULT 1.00' },
    { table: 'manufacturing_dispatches',     column: 'existence_priority',    type: 'DECIMAL(5,2) DEFAULT 0.00' },
    { table: 'manufacturing_dispatches',     column: 'reality_risk_score',    type: 'DECIMAL(5,2) DEFAULT 0.00' },
    { table: 'manufacturing_dispatches',     column: 'universal_dependency',  type: 'DECIMAL(5,2) DEFAULT 0.00' },
    { table: 'print_node_machine_profiles',  column: 'simulation_coherence',  type: 'DECIMAL(5,2) DEFAULT 100.00' },
    { table: 'print_node_machine_profiles',  column: 'universal_synchronization', type: 'DECIMAL(5,2) DEFAULT 100.00' },
    { table: 'print_node_machine_profiles',  column: 'reality_stability_index',   type: 'DECIMAL(5,2) DEFAULT 100.00' },
    { table: 'print_node_machine_profiles',  column: 'recursive_continuity',      type: 'DECIMAL(5,2) DEFAULT 100.00' },
    // Phase 22 Singularity columns
    { table: 'manufacturing_dispatches',     column: 'singularity_weight',     type: 'DECIMAL(5,2) DEFAULT 1.00' },
    { table: 'manufacturing_dispatches',     column: 'omniversal_priority',    type: 'DECIMAL(5,2) DEFAULT 0.00' },
    { table: 'manufacturing_dispatches',     column: 'causal_chain_id',        type: 'VARCHAR(64) NULL' },
    { table: 'manufacturing_dispatches',     column: 'entropy_score',          type: 'DECIMAL(5,2) DEFAULT 0.00' },
    { table: 'print_node_machine_profiles',  column: 'dimensional_cluster_id', type: 'VARCHAR(64) NULL' },
    { table: 'print_node_machine_profiles',  column: 'omniversal_coherence',   type: 'DECIMAL(5,2) DEFAULT 100.00' },
    { table: 'print_node_machine_profiles',  column: 'transcendent_awareness', type: 'DECIMAL(5,2) DEFAULT 0.00' },
    { table: 'print_node_machine_profiles',  column: 'singularity_stability',  type: 'DECIMAL(5,2) DEFAULT 100.00' },
    // Phase 23 Geolocation columns
    { table: 'printer_nodes', column: 'region',       type: 'VARCHAR(128) NULL' },
    { table: 'printer_nodes', column: 'latitude',     type: 'DECIMAL(10, 8) NULL' },
    { table: 'printer_nodes', column: 'longitude',    type: 'DECIMAL(11, 8) NULL' },
    { table: 'printer_nodes', column: 'timezone',     type: 'VARCHAR(64) NULL' },
    { table: 'printer_nodes', column: 'address_line', type: 'TEXT NULL' },
    { table: 'printer_nodes', column: 'federation_id', type: 'VARCHAR(64) NULL' },
    { table: 'printer_nodes', column: 'cluster_id',    type: 'VARCHAR(64) NULL' },
    // Phase 34 Agent columns
    { table: 'printer_nodes', column: 'printer_api_key_hash', type: 'VARCHAR(255) NULL' },
    { table: 'printer_nodes', column: 'machine_state',        type: 'VARCHAR(64) NULL' },
    { table: 'printer_nodes', column: 'worker_state',         type: 'VARCHAR(64) NULL' },
    { table: 'printer_nodes', column: 'sync_version',         type: 'VARCHAR(32) NULL' },
    { table: 'printer_nodes', column: 'queue_depth',          type: 'INT DEFAULT 0' },
    { table: 'printer_nodes', column: 'active_jobs',          type: 'INT DEFAULT 0' },
    { table: 'printer_nodes', column: 'capacity_utilization_pct', type: 'INT DEFAULT 0' },
    { table: 'printer_nodes', column: 'company_name',         type: 'VARCHAR(255) NULL' },
    { table: 'printer_nodes', column: 'primary_contact_name', type: 'VARCHAR(255) NULL' },
    { table: 'printer_nodes', column: 'primary_contact_email', type: 'VARCHAR(255) NULL' },
    { table: 'orders', column: 'selected_offer_id',   type: 'VARCHAR(64) NULL' },
    { table: 'orders', column: 'recommended_offer_id', type: 'VARCHAR(64) NULL' },
    { table: 'orders', column: 'offers_snapshot',     type: 'JSON NULL' },
    { table: 'orders', column: 'production_files',    type: 'JSON NULL' },
    { table: 'orders', column: 'invoice_payment',     type: 'JSON NULL' },
    { table: 'print_nodes', column: 'active_jobs',   type: 'INT DEFAULT 0' },
    { table: 'print_nodes', column: 'queue_depth',   type: 'INT DEFAULT 0' },
    { table: 'print_nodes', column: 'region',        type: 'VARCHAR(128) NULL' },
    { table: 'print_nodes', column: 'federation_id', type: 'VARCHAR(64) NULL' },
    { table: 'print_nodes', column: 'cluster_id',    type: 'VARCHAR(64) NULL' },
    { table: 'print_nodes', column: 'latitude',      type: 'DECIMAL(10, 8) NULL' },
    { table: 'print_nodes', column: 'longitude',     type: 'DECIMAL(11, 8) NULL' },
    // Phase 1 Industrial Integration columns
    { table: 'printer_nodes', column: 'supported_products',   type: 'JSON NULL' },
    { table: 'printer_nodes', column: 'binding_capabilities', type: 'JSON NULL' },
    { table: 'printer_nodes', column: 'color_profiles',       type: 'JSON NULL' },
    { table: 'printer_nodes', column: 'throughput',           type: 'DECIMAL(12,2) DEFAULT 0.00' },
    { table: 'printer_nodes', column: 'uptime_score',         type: 'DECIMAL(5,2) DEFAULT 100.00' },
    { table: 'printer_nodes', column: 'economic_efficiency',  type: 'DECIMAL(5,2) DEFAULT 1.00' },
    { table: 'print_nodes',   column: 'supported_products',   type: 'JSON NULL' },
    { table: 'print_nodes',   column: 'binding_capabilities', type: 'JSON NULL' },
    { table: 'print_nodes',   column: 'color_profiles',       type: 'JSON NULL' },
    { table: 'print_nodes',   column: 'throughput',           type: 'DECIMAL(12,2) DEFAULT 0.00' },
    { table: 'print_nodes',   column: 'uptime_score',         type: 'DECIMAL(5,2) DEFAULT 100.00' },
    { table: 'print_nodes',   column: 'economic_efficiency',  type: 'DECIMAL(5,2) DEFAULT 1.00' },
    { table: 'print_node_machine_profiles', column: 'throughput',          type: 'DECIMAL(12,2) DEFAULT 0.00' },
    { table: 'print_node_machine_profiles', column: 'uptime_score',        type: 'DECIMAL(5,2) DEFAULT 100.00' },
    { table: 'print_node_machine_profiles', column: 'economic_efficiency', type: 'DECIMAL(5,2) DEFAULT 1.00' },
    // Phase 1 Dispatch Hardening columns
    { table: 'manufacturing_dispatches', column: 'economic_score',         type: 'DECIMAL(5,2) DEFAULT 0.00' },
    { table: 'manufacturing_dispatches', column: 'profitability_score',    type: 'DECIMAL(5,2) DEFAULT 0.00' },
    { table: 'manufacturing_dispatches', column: 'energy_efficiency_score', type: 'DECIMAL(5,2) DEFAULT 0.00' },
    { table: 'manufacturing_dispatches', column: 'evidence_snapshot_json', type: 'JSON NULL' },
    { table: 'manufacturing_dispatches', column: 'certification_state',    type: 'VARCHAR(64) DEFAULT "PENDING"' },
    { table: 'manufacturing_dispatches', column: 'forensic_risk',          type: 'DECIMAL(5,2) DEFAULT 0.00' },
    { table: 'manufacturing_dispatches', column: 'autofix_state',          type: 'VARCHAR(64) DEFAULT "NONE"' },
    { table: 'manufacturing_dispatches', column: 'artifact_count',         type: 'INT DEFAULT 0' },
    { table: 'manufacturing_dispatches', column: 'certified_pdf_url',      type: 'TEXT NULL' },
    { table: 'manufacturing_dispatches', column: 'normalized_pdf_url',     type: 'TEXT NULL' },
    // Phase 1 Capacity Reservation Hardening
    { table: 'manufacturing_capacity_reservations', column: 'utilization_snapshot', type: 'INT DEFAULT 0' },
    // Phase C Event Orchestration columns
    { table: 'manufacturing_dispatch_events', column: 'trace_id',               type: 'VARCHAR(64) NULL' },
    { table: 'manufacturing_dispatch_events', column: 'correlation_id',         type: 'VARCHAR(64) NULL' },
    { table: 'manufacturing_dispatch_events', column: 'source_service',         type: 'VARCHAR(128) NULL' },
    { table: 'manufacturing_dispatch_events', column: 'routing_reason',         type: 'VARCHAR(255) NULL' },
    { table: 'manufacturing_dispatch_events', column: 'orchestration_metadata', type: 'JSON NULL' },
    { table: 'federation_factories',           column: 'company_name',           type: 'VARCHAR(255) NULL' }
  ];

  // Apply CREATE TABLE statements
  for (const sql of ddlStatements) {
    await db.query(sql);
  }

  // Apply ALTER TABLE ADD COLUMN (idempotent: skip if column exists)
  for (const col of columnAdditions) {
    try {
      const rows = await db.query(
        `SELECT COLUMN_NAME FROM information_schema.columns
         WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
        [col.table, col.column]
      );
      if (rows.length === 0) {
        await db.query(`ALTER TABLE ${col.table} ADD COLUMN ${col.column} ${col.type}`);
      }
    } catch (err) {
      // Non-fatal: table may not exist yet, will be created by its own migration
      if (err.code !== 'ER_NO_SUCH_TABLE') throw err;
    }
  }
}

module.exports = { up };
