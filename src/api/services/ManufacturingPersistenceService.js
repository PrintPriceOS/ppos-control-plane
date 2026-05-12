/**
 * Production Persistence Service
 * 
 * Handles persistent storage of Print Nodes and Machine Profiles.
 */
const db = require('./mysqlClient');
const { v4: uuidv4 } = require('uuid');

class ManufacturingPersistenceService {
  /**
   * Initialize tables if they don't exist
   */
  async init() {
    try {
      console.log('[PRODUCTION-PERSISTENCE] Initializing tables...');
      
      await db.query(`
        CREATE TABLE IF NOT EXISTS print_nodes (
          id VARCHAR(64) PRIMARY KEY,
          tenant_id VARCHAR(64) NOT NULL,
          company_name VARCHAR(255) NOT NULL,
          status ENUM('ONLINE', 'OFFLINE', 'BUSY', 'MAINTENANCE', 'DEGRADED', 'SATURATED', 'RECOVERING', 'DESYNCHRONIZED') DEFAULT 'OFFLINE',
          license_status ENUM('ACTIVE', 'EXPIRED', 'PENDING', 'SUSPENDED') DEFAULT 'PENDING',
          country VARCHAR(64) NULL,
          city VARCHAR(64) NULL,
          capabilities_json JSON NULL,
          machine_profile_json JSON NULL,
          supported_policies_json JSON NULL,
          max_file_size_mb INT DEFAULT 500,
          api_enabled BOOLEAN DEFAULT FALSE,
          rates_json JSON NULL,
          last_heartbeat_at TIMESTAMP NULL,
          capacity_utilization_pct INT DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_tenant (tenant_id),
          INDEX idx_status (status),
          INDEX idx_license (license_status),
          INDEX idx_heartbeat (last_heartbeat_at)
        ) ENGINE=InnoDB;
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS node_heartbeats (
          id INT AUTO_INCREMENT PRIMARY KEY,
          node_id VARCHAR(64) NOT NULL,
          printhouse_id VARCHAR(64) NULL,
          status VARCHAR(32) NOT NULL,
          queue_depth INT DEFAULT 0,
          active_jobs INT DEFAULT 0,
          utilization_pct INT DEFAULT 0,
          machine_state VARCHAR(64) NULL,
          worker_state VARCHAR(64) NULL,
          dispatches_active INT DEFAULT 0,
          dispatches_delayed INT DEFAULT 0,
          storage_pressure INT DEFAULT 0,
          sync_version VARCHAR(32) NULL,
          heartbeat_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_node (node_id),
          INDEX idx_printhouse (printhouse_id),
          INDEX idx_timestamp (heartbeat_at),
          CONSTRAINT fk_heartbeat_node FOREIGN KEY (node_id) REFERENCES print_nodes(id) ON DELETE CASCADE
        ) ENGINE=InnoDB;
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS print_node_machine_profiles (
          id VARCHAR(64) PRIMARY KEY,
          node_id VARCHAR(64) NOT NULL,
          profile_name VARCHAR(128) NOT NULL,
          profile_type VARCHAR(64) NOT NULL,
          raw_data_json JSON NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_node (node_id),
          CONSTRAINT fk_node_profile FOREIGN KEY (node_id) REFERENCES print_nodes(id) ON DELETE CASCADE
        ) ENGINE=InnoDB;
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS manufacturing_packages (
          id VARCHAR(64) PRIMARY KEY,
          tenant_id VARCHAR(64) NOT NULL,
          source VARCHAR(32) DEFAULT 'PREFLIGHT',
          source_job_id VARCHAR(64) NOT NULL,
          source_artifact_id VARCHAR(64) NOT NULL,
          fixed_pdf_artifact_id VARCHAR(64) NULL,
          certified_pdf_artifact_id VARCHAR(64) NULL,
          book_spec_json JSON NULL,
          preflight_report_json JSON NULL,
          policy_id VARCHAR(64) NULL,
          status ENUM('DRAFT', 'READY_FOR_DISPATCH', 'DISPATCHED', 'ACCEPTED_BY_PRINTER', 'REJECTED_BY_PRINTER', 'IN_PRODUCTION', 'COMPLETED', 'CANCELLED') DEFAULT 'DRAFT',
          created_by_user_id VARCHAR(64) NOT NULL,
          assigned_printer_tenant_id VARCHAR(64) NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_tenant (tenant_id),
          INDEX idx_status (status),
          INDEX idx_printer (assigned_printer_tenant_id),
          INDEX idx_source_job (source_job_id)
        ) ENGINE=InnoDB;
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS manufacturing_dispatches (
          id VARCHAR(64) PRIMARY KEY,
          manufacturing_package_id VARCHAR(64) NULL,
          print_node_id VARCHAR(64) NULL,
          node_id VARCHAR(64) NULL,
          job_id VARCHAR(64) NULL,
          machine_id VARCHAR(64) NULL,
          sender_tenant_id VARCHAR(64) NULL,
          receiver_tenant_id VARCHAR(64) NULL,
          status VARCHAR(32) DEFAULT 'PENDING',
          message TEXT NULL,
          score_snapshot_json JSON NULL,
          routing_state_json JSON NULL,
          sla_estimate_json JSON NULL,
          orchestration_metadata_json JSON NULL,
          operator_id VARCHAR(64) NULL,
          estimated_cost DECIMAL(10,2) DEFAULT 0,
          estimated_margin DECIMAL(10,2) DEFAULT 0,
          reserved_from TIMESTAMP NULL,
          reserved_until TIMESTAMP NULL,
          economic_score FLOAT DEFAULT 0,
          profitability_score FLOAT DEFAULT 0,
          energy_efficiency_score FLOAT DEFAULT 0,
          federation_node_id VARCHAR(64) NULL,
          governance_policy_score FLOAT DEFAULT 0,
          evidence_snapshot_json JSON NULL,
          metadata_json JSON NULL,
          expires_at TIMESTAMP NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          accepted_at TIMESTAMP NULL,
          rejected_at TIMESTAMP NULL,
          INDEX idx_package (manufacturing_package_id),
          INDEX idx_print_node (print_node_id),
          INDEX idx_node (node_id),
          INDEX idx_job (job_id),
          INDEX idx_sender (sender_tenant_id),
          INDEX idx_receiver (receiver_tenant_id),
          INDEX idx_status (status),
          CONSTRAINT fk_dispatch_package FOREIGN KEY (manufacturing_package_id) REFERENCES manufacturing_packages(id) ON DELETE CASCADE
        ) ENGINE=InnoDB;
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS manufacturing_capacity_reservations (
          id VARCHAR(64) PRIMARY KEY,
          node_id VARCHAR(64) NOT NULL,
          dispatch_id VARCHAR(64) NULL,
          job_input_snapshot_json JSON NULL,
          status ENUM('PENDING', 'CONFIRMED', 'EXPIRED', 'RELEASED', 'ROLLED_BACK') DEFAULT 'PENDING',
          expires_at TIMESTAMP NOT NULL,
          released_at TIMESTAMP NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_node (node_id),
          INDEX idx_dispatch (dispatch_id),
          INDEX idx_status (status),
          INDEX idx_expires (expires_at),
          CONSTRAINT fk_res_node FOREIGN KEY (node_id) REFERENCES print_nodes(id) ON DELETE CASCADE
        ) ENGINE=InnoDB;
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS manufacturing_dispatch_events (
          id VARCHAR(64) PRIMARY KEY,
          tenant_id VARCHAR(64) NOT NULL,
          manufacturing_package_id VARCHAR(64) NULL,
          dispatch_id VARCHAR(64) NULL,
          event_type VARCHAR(64) NOT NULL,
          actor_type ENUM('USER', 'SYSTEM', 'NODE', 'API') NOT NULL,
          actor_id VARCHAR(64) NOT NULL,
          message TEXT NOT NULL,
          metadata_json JSON NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_tenant (tenant_id),
          INDEX idx_package (manufacturing_package_id),
          INDEX idx_dispatch (dispatch_id),
          INDEX idx_type (event_type)
        ) ENGINE=InnoDB;
      `);
      
      await db.query(`
        CREATE TABLE IF NOT EXISTS manufacturing_notifications (
          id VARCHAR(64) PRIMARY KEY,
          tenant_id VARCHAR(64) NOT NULL,
          user_id VARCHAR(64) NULL,
          title VARCHAR(255) NOT NULL,
          message TEXT NULL,
          severity ENUM('info', 'warning', 'error', 'success') DEFAULT 'info',
          type VARCHAR(64) NULL,
          related_entity_type VARCHAR(64) NULL,
          related_entity_id VARCHAR(64) NULL,
          is_read BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_tenant (tenant_id),
          INDEX idx_user (user_id),
          INDEX idx_read (is_read),
          INDEX idx_created (created_at)
        ) ENGINE=InnoDB;
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS predictive_bottleneck_snapshots (
          id INT AUTO_INCREMENT PRIMARY KEY,
          node_id VARCHAR(64) NOT NULL,
          congestion_score FLOAT DEFAULT 0,
          predicted_delay_minutes INT DEFAULT 0,
          risk_level VARCHAR(32) DEFAULT 'LOW',
          snapshot_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_node (node_id),
          INDEX idx_risk (risk_level),
          CONSTRAINT fk_bottleneck_node FOREIGN KEY (node_id) REFERENCES print_nodes(id) ON DELETE CASCADE
        ) ENGINE=InnoDB;
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS failure_prediction_snapshots (
          id INT AUTO_INCREMENT PRIMARY KEY,
          dispatch_id VARCHAR(64) NOT NULL,
          failure_probability FLOAT DEFAULT 0,
          reason_code VARCHAR(64) NULL,
          mitigation_recommendation TEXT NULL,
          snapshot_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_dispatch (dispatch_id),
          CONSTRAINT fk_failure_dispatch FOREIGN KEY (dispatch_id) REFERENCES manufacturing_dispatches(id) ON DELETE CASCADE
        ) ENGINE=InnoDB;
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS industrial_memory_graph (
          id INT AUTO_INCREMENT PRIMARY KEY,
          node_id VARCHAR(64) NOT NULL,
          entity_type VARCHAR(64) NOT NULL,
          entity_id VARCHAR(64) NOT NULL,
          relationship_type VARCHAR(64) NOT NULL,
          weight FLOAT DEFAULT 1.0,
          metadata_json JSON NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_node (node_id),
          INDEX idx_entity (entity_type, entity_id)
        ) ENGINE=InnoDB;
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS manufacturing_learning_cycles (
          id INT AUTO_INCREMENT PRIMARY KEY,
          cycle_type VARCHAR(64) NOT NULL,
          input_size INT DEFAULT 0,
          improvement_delta FLOAT DEFAULT 0,
          metadata_json JSON NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB;
      `);

      // Backward Compatibility Views
      await db.query('CREATE OR REPLACE VIEW production_packages AS SELECT * FROM manufacturing_packages');
      await db.query('CREATE OR REPLACE VIEW production_events AS SELECT * FROM manufacturing_dispatch_events');
      await db.query('CREATE OR REPLACE VIEW production_notifications AS SELECT * FROM manufacturing_notifications');
      await db.query('CREATE OR REPLACE VIEW capacity_reservations AS SELECT * FROM manufacturing_capacity_reservations');
      await db.query('CREATE OR REPLACE VIEW production_dispatches AS SELECT * FROM manufacturing_dispatches');

      await db.query(`
        CREATE TABLE IF NOT EXISTS manufacturing_evidence_ledger (
          id INT AUTO_INCREMENT PRIMARY KEY,
          dispatch_id VARCHAR(64) NOT NULL,
          node_id VARCHAR(64) NULL,
          tenant_id VARCHAR(64) NULL,
          evidence_type VARCHAR(64) NOT NULL,
          payload_json JSON NULL,
          hash VARCHAR(64) NOT NULL,
          previous_hash VARCHAR(64) NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_dispatch (dispatch_id),
          INDEX idx_node (node_id)
        ) ENGINE=InnoDB;
      `);
      await db.query('CREATE OR REPLACE VIEW production_evidence_ledger AS SELECT * FROM manufacturing_evidence_ledger');

      await db.query(`
        CREATE TABLE IF NOT EXISTS manufacturing_offers (
          id VARCHAR(64) PRIMARY KEY,
          job_id VARCHAR(64) NOT NULL,
          printer_id VARCHAR(64) NOT NULL,
          machine_id VARCHAR(64) NULL,
          quote_id VARCHAR(64) NULL,
          routing_audit_id VARCHAR(64) NULL,
          economic_routing_audit_id VARCHAR(64) NULL,
          production_cost DECIMAL(10,2) DEFAULT 0,
          suggested_price DECIMAL(10,2) DEFAULT 0,
          estimated_margin DECIMAL(10,2) DEFAULT 0,
          margin_pct DECIMAL(5,2) DEFAULT 0,
          lead_time_days INT DEFAULT 0,
          offer_expires_at TIMESTAMP NULL,
          offer_status VARCHAR(32) DEFAULT 'PENDING',
          marketplace_session_id VARCHAR(64) NULL,
          offer_rank INT NULL,
          offer_priority_score FLOAT NULL,
          offer_selected BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_job (job_id),
          INDEX idx_printer (printer_id),
          INDEX idx_session (marketplace_session_id)
        ) ENGINE=InnoDB;
      `);
      await db.query(`
        CREATE TABLE IF NOT EXISTS manufacturing_offer_events (
          id VARCHAR(64) PRIMARY KEY,
          offer_id VARCHAR(64) NOT NULL,
          event_type VARCHAR(64) NOT NULL,
          metadata_json JSON NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_offer (offer_id)
        ) ENGINE=InnoDB;
      `);
      await db.query('CREATE OR REPLACE VIEW production_offers AS SELECT * FROM manufacturing_offers');
      await db.query('CREATE OR REPLACE VIEW production_offer_events AS SELECT * FROM manufacturing_offer_events');

      console.log('[MANUFACTURING-PERSISTENCE] Canonical tables and views initialized.');

      await db.query(`
        CREATE TABLE IF NOT EXISTS dispatch_outcome_history (
          id INT AUTO_INCREMENT PRIMARY KEY,
          dispatch_id VARCHAR(64) NOT NULL,
          node_id VARCHAR(64) NOT NULL,
          outcome_status VARCHAR(32) NOT NULL,
          sla_met BOOLEAN DEFAULT TRUE,
          latency_ms INT DEFAULT 0,
          quality_score INT DEFAULT 100,
          recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_node (node_id),
          INDEX idx_dispatch (dispatch_id)
        ) ENGINE=InnoDB;
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS printer_reliability_metrics (
          printer_id VARCHAR(64) PRIMARY KEY,
          sla_success_rate FLOAT DEFAULT 1.0,
          reroute_frequency FLOAT DEFAULT 0,
          delivery_accuracy FLOAT DEFAULT 1.0,
          capacity_stability FLOAT DEFAULT 1.0,
          heartbeat_stability FLOAT DEFAULT 1.0,
          failure_probability FLOAT DEFAULT 0,
          trust_score INT DEFAULT 100,
          last_updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          CONSTRAINT fk_rel_printer FOREIGN KEY (printer_id) REFERENCES print_nodes(id) ON DELETE CASCADE
        ) ENGINE=InnoDB;
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS predictive_congestion_forecasts (
          id INT AUTO_INCREMENT PRIMARY KEY,
          node_id VARCHAR(64) NOT NULL,
          forecast_window_minutes INT DEFAULT 60,
          predicted_utilization_pct INT DEFAULT 0,
          confidence_score FLOAT DEFAULT 0,
          forecast_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_node (node_id),
          INDEX idx_forecast (forecast_at)
        ) ENGINE=InnoDB;
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS federated_intelligence_snapshots (
          id INT AUTO_INCREMENT PRIMARY KEY,
          region VARCHAR(64) NOT NULL,
          health_score INT DEFAULT 100,
          bottleneck_count INT DEFAULT 0,
          resilience_score INT DEFAULT 100,
          snapshot_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_region (region)
        ) ENGINE=InnoDB;
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS regional_capacity_forecasts (
          id INT AUTO_INCREMENT PRIMARY KEY,
          region VARCHAR(64) NOT NULL,
          forecast_date DATE NOT NULL,
          predicted_load_pct INT DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_region_date (region, forecast_date)
        ) ENGINE=InnoDB;
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS optimization_learning_snapshots (
          id INT AUTO_INCREMENT PRIMARY KEY,
          optimization_type VARCHAR(64) NOT NULL,
          pre_score FLOAT DEFAULT 0,
          post_score FLOAT DEFAULT 0,
          efficiency_gain_pct FLOAT DEFAULT 0,
          metadata_json JSON NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB;
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS industrial_prediction_cycles (
          id INT AUTO_INCREMENT PRIMARY KEY,
          model_version VARCHAR(32) DEFAULT 'v1',
          accuracy_score FLOAT DEFAULT 0,
          predictions_made INT DEFAULT 0,
          false_positives INT DEFAULT 0,
          false_negatives INT DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB;
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS economic_optimization_snapshots (
          id INT AUTO_INCREMENT PRIMARY KEY,
          optimization_type VARCHAR(64) NOT NULL,
          projected_margin_delta FLOAT DEFAULT 0,
          efficiency_score INT DEFAULT 100,
          metadata_json JSON NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB;
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS industrial_profitability_history (
          id INT AUTO_INCREMENT PRIMARY KEY,
          node_id VARCHAR(64) NOT NULL,
          dispatch_id VARCHAR(64) NOT NULL,
          gross_revenue FLOAT DEFAULT 0,
          operational_cost FLOAT DEFAULT 0,
          logistics_cost FLOAT DEFAULT 0,
          energy_cost FLOAT DEFAULT 0,
          net_margin FLOAT DEFAULT 0,
          recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_node (node_id),
          INDEX idx_dispatch (dispatch_id)
        ) ENGINE=InnoDB;
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS economic_risk_forecasts (
          id INT AUTO_INCREMENT PRIMARY KEY,
          region VARCHAR(64) NOT NULL,
          risk_type VARCHAR(64) NOT NULL,
          probability FLOAT DEFAULT 0,
          impact_score INT DEFAULT 0,
          forecast_window_hours INT DEFAULT 24,
          forecast_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_region (region)
        ) ENGINE=InnoDB;
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS economic_pressure_snapshots (
          id INT AUTO_INCREMENT PRIMARY KEY,
          node_id VARCHAR(64) NOT NULL,
          energy_load_pct INT DEFAULT 0,
          logistics_latency_ms INT DEFAULT 0,
          margin_compression_pct FLOAT DEFAULT 0,
          snapshot_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_node (node_id)
        ) ENGINE=InnoDB;
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS federation_economic_snapshots (
          id INT AUTO_INCREMENT PRIMARY KEY,
          federation_id VARCHAR(64) NOT NULL,
          total_revenue FLOAT DEFAULT 0,
          avg_margin_pct FLOAT DEFAULT 0,
          operational_efficiency_score INT DEFAULT 100,
          snapshot_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_federation (federation_id)
        ) ENGINE=InnoDB;
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS regional_profitability_forecasts (
          id INT AUTO_INCREMENT PRIMARY KEY,
          region VARCHAR(64) NOT NULL,
          forecast_date DATE NOT NULL,
          predicted_margin_pct FLOAT DEFAULT 0,
          risk_level VARCHAR(32) DEFAULT 'LOW',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_region_date (region, forecast_date)
        ) ENGINE=InnoDB;
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS governance_resilience_snapshots (
          id INT AUTO_INCREMENT PRIMARY KEY,
          federation_id VARCHAR(64) NOT NULL,
          resilience_score INT DEFAULT 100,
          survivability_index INT DEFAULT 100,
          governance_status VARCHAR(32) DEFAULT 'OPTIMAL',
          metadata_json JSON NULL,
          snapshot_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_federation (federation_id)
        ) ENGINE=InnoDB;
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS continuity_policy_evaluations (
          id INT AUTO_INCREMENT PRIMARY KEY,
          policy_id VARCHAR(64) NOT NULL,
          target_entity VARCHAR(64) NOT NULL,
          evaluation_result VARCHAR(32) NOT NULL,
          violation_details TEXT NULL,
          evaluated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_policy (policy_id)
        ) ENGINE=InnoDB;
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS cascading_failure_snapshots (
          id INT AUTO_INCREMENT PRIMARY KEY,
          source_region VARCHAR(64) NOT NULL,
          target_region VARCHAR(64) NOT NULL,
          failure_probability FLOAT DEFAULT 0,
          propagation_vector VARCHAR(64) NULL,
          snapshot_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_source (source_region)
        ) ENGINE=InnoDB;
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS systemic_risk_forecasts (
          id INT AUTO_INCREMENT PRIMARY KEY,
          risk_type VARCHAR(64) NOT NULL,
          systemic_impact_pct INT DEFAULT 0,
          probability FLOAT DEFAULT 0,
          forecast_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_risk (risk_type)
        ) ENGINE=InnoDB;
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS federation_resilience_snapshots (
          id INT AUTO_INCREMENT PRIMARY KEY,
          region VARCHAR(64) NOT NULL,
          redundancy_ratio FLOAT DEFAULT 1.0,
          diversity_score INT DEFAULT 100,
          criticality_index FLOAT DEFAULT 0,
          snapshot_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_region (region)
        ) ENGINE=InnoDB;
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS regional_survivability_forecasts (
          id INT AUTO_INCREMENT PRIMARY KEY,
          region VARCHAR(64) NOT NULL,
          forecast_window_hours INT DEFAULT 48,
          survivability_score INT DEFAULT 100,
          risk_mitigation_plan TEXT NULL,
          forecast_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_region (region)
        ) ENGINE=InnoDB;
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS temporal_intelligence_snapshots (
          id INT AUTO_INCREMENT PRIMARY KEY,
          forecast_type VARCHAR(64) NOT NULL,
          stability_score INT DEFAULT 100,
          divergence_index FLOAT DEFAULT 0,
          snapshot_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_type (forecast_type)
        ) ENGINE=InnoDB;
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS future_state_forecasts (
          id INT AUTO_INCREMENT PRIMARY KEY,
          horizon_hours INT NOT NULL,
          predicted_congestion_pct FLOAT DEFAULT 0,
          survivability_index INT DEFAULT 100,
          forecast_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB;
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS parallel_timeline_models (
          id INT AUTO_INCREMENT PRIMARY KEY,
          timeline_id VARCHAR(64) NOT NULL,
          description TEXT NULL,
          stability_ranking INT DEFAULT 100,
          simulated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_timeline (timeline_id)
        ) ENGINE=InnoDB;
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS timeline_branch_evaluations (
          id INT AUTO_INCREMENT PRIMARY KEY,
          branch_name VARCHAR(64) NOT NULL,
          survivability_score INT DEFAULT 100,
          economic_viability FLOAT DEFAULT 0,
          evaluation_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB;
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS temporal_risk_forecasts (
          id INT AUTO_INCREMENT PRIMARY KEY,
          risk_type VARCHAR(64) NOT NULL,
          probability FLOAT DEFAULT 0,
          time_to_impact_hours INT DEFAULT 0,
          forecast_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB;
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS future_governance_snapshots (
          id INT AUTO_INCREMENT PRIMARY KEY,
          policy_id VARCHAR(64) NOT NULL,
          survivability_score INT DEFAULT 100,
          evolution_path VARCHAR(128) NULL,
          snapshot_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB;
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS long_horizon_resilience_snapshots (
          id INT AUTO_INCREMENT PRIMARY KEY,
          region VARCHAR(64) NOT NULL,
          decade_survivability_pct FLOAT DEFAULT 100,
          resilience_erosion_rate FLOAT DEFAULT 0,
          snapshot_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB;
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS reality_simulation_runs (
          id INT AUTO_INCREMENT PRIMARY KEY,
          simulation_id VARCHAR(64) NOT NULL,
          simulation_type VARCHAR(64) NOT NULL,
          config JSON NULL,
          status VARCHAR(32) DEFAULT 'PENDING',
          started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          completed_at TIMESTAMP NULL,
          INDEX idx_sim_id (simulation_id)
        ) ENGINE=InnoDB;
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS synthetic_operations_snapshots (
          id INT AUTO_INCREMENT PRIMARY KEY,
          simulation_id VARCHAR(64) NOT NULL,
          snapshot_data JSON NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_sim_id (simulation_id),
          INDEX idx_created (created_at)
        ) ENGINE=InnoDB;
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS simulation_outcome_evaluations (
          id INT AUTO_INCREMENT PRIMARY KEY,
          simulation_id VARCHAR(64) NOT NULL,
          survivability_delta FLOAT DEFAULT 0,
          economic_impact_pct FLOAT DEFAULT 0,
          governance_delta FLOAT DEFAULT 0,
          evaluation_data JSON NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_sim_id (simulation_id)
        ) ENGINE=InnoDB;
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS autonomous_simulation_recommendations (
          id INT AUTO_INCREMENT PRIMARY KEY,
          simulation_id VARCHAR(64) NOT NULL,
          action VARCHAR(32) NOT NULL, -- EXECUTE, HOLD, REROUTE, REJECT, ESCALATE
          reason TEXT NULL,
          confidence_score FLOAT DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_sim_id (simulation_id),
          INDEX idx_action (action)
        ) ENGINE=InnoDB;
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS future_outcome_projections (
          id INT AUTO_INCREMENT PRIMARY KEY,
          simulation_id VARCHAR(64) NOT NULL,
          horizon_hours INT NOT NULL,
          projected_state JSON NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_sim_id (simulation_id)
        ) ENGINE=InnoDB;
      `);
      
      console.log('[PRODUCTION-PERSISTENCE] Tables verified.');
    } catch (err) {
      console.error('[PRODUCTION-PERSISTENCE] Initialization failed:', err.message);
    }
  }

  async createNode(nodeData) {
    const id = uuidv4();
    const { 
      tenantId, companyName, country, city, capabilities, 
      machineProfile, supportedPolicies, maxFileSizeMb, apiEnabled 
    } = nodeData;
    
    await db.query(`
      INSERT INTO print_nodes 
      (id, tenant_id, company_name, country, city, capabilities_json, machine_profile_json, supported_policies_json, max_file_size_mb, api_enabled)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id, tenantId, companyName, country || null, city || null, 
      JSON.stringify(capabilities || {}), JSON.stringify(machineProfile || {}), 
      JSON.stringify(supportedPolicies || []), maxFileSizeMb || 500, apiEnabled || false
    ]);
    
    return this.getNode(id);
  }

  async getNode(id) {
    const rows = await db.query('SELECT * FROM print_nodes WHERE id = ?', [id]);
    return rows[0] || null;
  }

  async listNodes(filters = {}) {
    let sql = 'SELECT * FROM print_nodes WHERE 1=1';
    const params = [];

    if (filters.tenantId) {
      sql += ' AND tenant_id = ?';
      params.push(filters.tenantId);
    }
    if (filters.status) {
      sql += ' AND status = ?';
      params.push(filters.status);
    }
    if (filters.country) {
      sql += ' AND country = ?';
      params.push(filters.country);
    }
    if (filters.licenseStatus) {
      sql += ' AND license_status = ?';
      params.push(filters.licenseStatus);
    }

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(filters.limit || '50'));
    params.push(parseInt(filters.offset || '0'));

    return db.query(sql, params);
  }

  async updateNode(id, updates) {
    const fields = [];
    const params = [];
    
    if (updates.status) { fields.push('status = ?'); params.push(updates.status); }
    if (updates.licenseStatus) { fields.push('license_status = ?'); params.push(updates.licenseStatus); }
    if (updates.companyName) { fields.push('company_name = ?'); params.push(updates.companyName); }
    if (updates.capabilities) { fields.push('capabilities_json = ?'); params.push(JSON.stringify(updates.capabilities)); }
    if (updates.machineProfile) { fields.push('machine_profile_json = ?'); params.push(JSON.stringify(updates.machineProfile)); }
    if (updates.supportedPolicies) { fields.push('supported_policies_json = ?'); params.push(JSON.stringify(updates.supportedPolicies)); }
    if (updates.maxFileSizeMb !== undefined) { fields.push('max_file_size_mb = ?'); params.push(updates.maxFileSizeMb); }
    if (updates.apiEnabled !== undefined) { fields.push('api_enabled = ?'); params.push(updates.apiEnabled); }

    if (fields.length === 0) return this.getNode(id);

    params.push(id);
    await db.query(`UPDATE print_nodes SET ${fields.join(', ')} WHERE id = ?`, params);
    return this.getNode(id);
  }

  async createMachineProfile(profileData) {
    const id = profileData.id || uuidv4();
    const { 
      nodeId, profileName, profileType, manufacturer, model, 
      rawData, normalizedCapabilities, status 
    } = profileData;

    await db.query(`
      INSERT INTO print_node_machine_profiles
      (id, node_id, profile_name, profile_type, manufacturer, model, raw_data_json, normalized_capabilities_json, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        profile_name = VALUES(profile_name),
        profile_type = VALUES(profile_type),
        manufacturer = VALUES(manufacturer),
        model = VALUES(model),
        raw_data_json = VALUES(raw_data_json),
        normalized_capabilities_json = VALUES(normalized_capabilities_json),
        status = VALUES(status)
    `, [
      id, nodeId, profileName, profileType || 'OFFSET', 
      manufacturer || 'UNKNOWN', model || 'UNKNOWN',
      JSON.stringify(rawData || {}), JSON.stringify(normalizedCapabilities || {}),
      status || 'ACTIVE'
    ]);

    return id;
  }

  async getMachineProfiles(nodeId) {
    const rows = await db.query('SELECT * FROM print_node_machine_profiles WHERE node_id = ?', [nodeId]);
    return rows.map(row => ({
      ...row,
      raw_data_json: typeof row.raw_data_json === 'string' ? JSON.parse(row.raw_data_json) : row.raw_data_json,
      normalized_capabilities_json: typeof row.normalized_capabilities_json === 'string' ? JSON.parse(row.normalized_capabilities_json) : row.normalized_capabilities_json
    }));
  }

  // --- Production Packages ---

  async createPackage(packageData) {
    const id = uuidv4();
    const { 
      tenantId, source, sourceJobId, sourceArtifactId, 
      fixedPdfArtifactId, certifiedPdfArtifactId, bookSpec, 
      preflightReport, policyId, createdByUserId, status 
    } = packageData;

    await db.query(`
      INSERT INTO manufacturing_packages 
      (id, tenant_id, source, source_job_id, source_artifact_id, fixed_pdf_artifact_id, certified_pdf_artifact_id, book_spec_json, preflight_report_json, policy_id, created_by_user_id, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id, tenantId, source || 'PREFLIGHT', sourceJobId, sourceArtifactId, 
      fixedPdfArtifactId || null, certifiedPdfArtifactId || null, 
      JSON.stringify(bookSpec || {}), JSON.stringify(preflightReport || {}), 
      policyId || null, createdByUserId, status || 'DRAFT'
    ]);

    return this.getPackage(id);
  }

  async getPackage(id) {
    const rows = await db.query('SELECT * FROM manufacturing_packages WHERE id = ?', [id]);
    return rows[0] || null;
  }

  async listPackages(filters = {}) {
    let sql = 'SELECT * FROM manufacturing_packages WHERE 1=1';
    const params = [];

    if (filters.actorTenantId) {
      sql += ' AND (tenant_id = ? OR assigned_printer_tenant_id = ?)';
      params.push(filters.actorTenantId, filters.actorTenantId);
    } else if (filters.tenantId) {
      sql += ' AND tenant_id = ?';
      params.push(filters.tenantId);
    }
    if (filters.status) {
      sql += ' AND status = ?';
      params.push(filters.status);
    }
    if (filters.assignedPrinterTenantId) {
      sql += ' AND assigned_printer_tenant_id = ?';
      params.push(filters.assignedPrinterTenantId);
    }

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(filters.limit || '50'));
    params.push(parseInt(filters.offset || '0'));

    return db.query(sql, params);
  }

  async updatePackage(id, updates) {
    const fields = [];
    const params = [];

    if (updates.status) { fields.push('status = ?'); params.push(updates.status); }
    if (updates.assignedPrinterTenantId) { fields.push('assigned_printer_tenant_id = ?'); params.push(updates.assignedPrinterTenantId); }
    if (updates.bookSpec) { fields.push('book_spec_json = ?'); params.push(JSON.stringify(updates.bookSpec)); }
    if (updates.preflightReport) { fields.push('preflight_report_json = ?'); params.push(JSON.stringify(updates.preflightReport)); }

    if (fields.length === 0) return this.getPackage(id);

    params.push(id);
    await db.query(`UPDATE manufacturing_packages SET ${fields.join(', ')} WHERE id = ?`, params);
    return this.getPackage(id);
  }

  // --- Production Dispatches ---

  async createDispatch(dispatchData) {
    const id = uuidv4();
    const { 
      packageId, nodeId, senderTenantId, receiverTenantId, 
      message, expiresAt, status 
    } = dispatchData;

    await db.query(`
      INSERT INTO manufacturing_dispatches 
      (id, manufacturing_package_id, print_node_id, sender_tenant_id, receiver_tenant_id, message, expires_at, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id, packageId, nodeId, senderTenantId, receiverTenantId, 
      message || null, expiresAt || null, status || 'PENDING'
    ]);

    return this.getDispatch(id);
  }

  async getDispatch(id) {
    const rows = await db.query('SELECT * FROM manufacturing_dispatches WHERE id = ?', [id]);
    return rows[0] || null;
  }

  async listDispatches(filters = {}) {
    let sql = 'SELECT * FROM manufacturing_dispatches WHERE 1=1';
    const params = [];

    if (filters.senderTenantId && filters.receiverTenantId) {
      sql += ' AND (sender_tenant_id = ? OR receiver_tenant_id = ?)';
      params.push(filters.senderTenantId, filters.receiverTenantId);
    } else if (filters.senderTenantId) {
      sql += ' AND sender_tenant_id = ?';
      params.push(filters.senderTenantId);
    } else if (filters.receiverTenantId) {
      sql += ' AND receiver_tenant_id = ?';
      params.push(filters.receiverTenantId);
    }

    if (filters.status) {
      sql += ' AND status = ?';
      params.push(filters.status);
    }

    if (filters.packageId) {
      sql += ' AND manufacturing_package_id = ?';
      params.push(filters.packageId);
    }

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(filters.limit || '50'));
    params.push(parseInt(filters.offset || '0'));

    return db.query(sql, params);
  }

  async updateDispatch(id, updates) {
    const fields = [];
    const params = [];

    if (updates.status) { 
      fields.push('status = ?'); 
      params.push(updates.status);
      if (updates.status === 'ACCEPTED') {
        fields.push('accepted_at = CURRENT_TIMESTAMP');
      } else if (updates.status === 'REJECTED') {
        fields.push('rejected_at = CURRENT_TIMESTAMP');
      }
    }
    
    if (updates.message) { fields.push('message = ?'); params.push(updates.message); }

    if (fields.length === 0) return this.getDispatch(id);

    params.push(id);
    await db.query(`UPDATE manufacturing_dispatches SET ${fields.join(', ')} WHERE id = ?`, params);
    return this.getDispatch(id);
  }

  // --- Production Events ---

  async createEvent(eventData) {
    const id = uuidv4();
    const { 
      tenantId, packageId, dispatchId, eventType, 
      actorType, actorId, message, metadata 
    } = eventData;

    await db.query(`
      INSERT INTO manufacturing_dispatch_events 
      (id, tenant_id, manufacturing_package_id, dispatch_id, event_type, actor_type, actor_id, message, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id, tenantId, packageId || null, dispatchId || null, eventType, 
      actorType || 'SYSTEM', actorId || 'system', message, 
      JSON.stringify(metadata || {})
    ]);

    return id;
  }

  async listEvents(filters = {}) {
    let sql = 'SELECT * FROM manufacturing_dispatch_events WHERE 1=1';
    const params = [];

    if (filters.tenantId) {
      sql += ' AND tenant_id = ?';
      params.push(filters.tenantId);
    }
    if (filters.packageId) {
      sql += ' AND manufacturing_package_id = ?';
      params.push(filters.packageId);
    }
    if (filters.dispatchId) {
      sql += ' AND dispatch_id = ?';
      params.push(filters.dispatchId);
    }
    if (filters.eventType) {
      sql += ' AND event_type = ?';
      params.push(filters.eventType);
    }

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(filters.limit || '100'));
    params.push(parseInt(filters.offset || '0'));

    return db.query(sql, params);
  }

  // --- Notifications ---

  async createNotification(data) {
    const id = uuidv4();
    const { 
      tenantId, userId, title, message, severity, 
      type, relatedEntityType, relatedEntityId 
    } = data;

    await db.query(`
      INSERT INTO manufacturing_notifications 
      (id, tenant_id, user_id, title, message, severity, type, related_entity_type, related_entity_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id, tenantId, userId || null, title, message || null, severity || 'info', 
      type || 'GENERAL', relatedEntityType || null, relatedEntityId || null
    ]);

    return { id, ...data };
  }

  async listNotifications(filters = {}) {
    let sql = 'SELECT * FROM manufacturing_notifications WHERE 1=1';
    const params = [];

    if (filters.tenantId) {
      sql += ' AND tenant_id = ?';
      params.push(filters.tenantId);
    }
    if (filters.userId) {
      sql += ' AND user_id = ?';
      params.push(filters.userId);
    }
    if (filters.isRead !== undefined) {
      sql += ' AND is_read = ?';
      params.push(filters.isRead ? 1 : 0);
    }

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(filters.limit || '50'));
    params.push(parseInt(filters.offset || '0'));

    return db.query(sql, params);
  }

  async markNotificationRead(id, tenantId) {
    await db.query('UPDATE manufacturing_notifications SET is_read = 1 WHERE id = ? AND tenant_id = ?', [id, tenantId]);
    return true;
  }

  async markAllNotificationsRead(tenantId, userId) {
    let sql = 'UPDATE manufacturing_notifications SET is_read = 1 WHERE tenant_id = ?';
    const params = [tenantId];
    if (userId) {
      sql += ' AND user_id = ?';
      params.push(userId);
    }
    await db.query(sql, params);
    return true;
  }
}

const service = new ManufacturingPersistenceService();
service.init().catch(err => console.error('[MANUFACTURING-PERSISTENCE] Critical init error:', err));

module.exports = service;
