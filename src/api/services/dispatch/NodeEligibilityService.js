/**
 * src/api/services/dispatch/NodeEligibilityService.js
 * 
 * Real-time evaluation of print nodes for industrial dispatch eligibility.
 * REJECTS nodes based on live operational telemetry and policy compliance.
 */
const persistence = require('../ManufacturingPersistenceService');

class NodeEligibilityService {
  /**
   * Evaluates all known nodes for a specific job input.
   * @param {Object} jobInput { productType, fileSizeMb, requiredPolicy, ... }
   * @returns {Object} { eligible, rejected, diagnostics }
   */
  async evaluateNodeEligibility(jobInput) {
    const allNodes = await persistence.listNodes({ limit: 1000 });
    
    const eligible = [];
    const rejected = [];
    const diagnostics = {
      total_nodes: allNodes.length,
      rejected_offline: 0,
      rejected_stale: 0,
      rejected_capacity: 0,
      rejected_policy: 0,
      rejected_file_size: 0,
      rejected_license: 0
    };

    const NOW = new Date();
    const HEARTBEAT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

    for (const node of allNodes) {
      let isEligible = true;
      const reasons = [];

      // 1. License Check
      if (node.license_status !== 'ACTIVE') {
        isEligible = false;
        diagnostics.rejected_license++;
        reasons.push(`LICENSE_${node.license_status}`);
      }

      // 2. Status Check
      if (node.status === 'OFFLINE' || node.status === 'MAINTENANCE') {
        isEligible = false;
        diagnostics.rejected_offline++;
        reasons.push(`STATUS_${node.status}`);
      }

      // 3. Heartbeat Freshness
      if (!node.last_heartbeat_at || (NOW - new Date(node.last_heartbeat_at)) > HEARTBEAT_TIMEOUT_MS) {
        isEligible = false;
        diagnostics.rejected_stale++;
        reasons.push('HEARTBEAT_STALE');
      }

      // 4. Capacity / Utilization
      if (node.capacity_utilization_pct >= 90 || node.status === 'SATURATED') {
        isEligible = false;
        diagnostics.rejected_capacity++;
        reasons.push('CAPACITY_SATURATED');
      }

      // 5. File Size Constraints
      if (jobInput.fileSizeMb && node.max_file_size_mb < jobInput.fileSizeMb) {
        isEligible = false;
        diagnostics.rejected_file_size++;
        reasons.push('FILE_SIZE_EXCEEDED');
      }

      // 6. Policy / Capability Match
      const supportedPolicies = typeof node.supported_policies_json === 'string' 
        ? JSON.parse(node.supported_policies_json) 
        : (node.supported_policies_json || []);
        
      if (jobInput.requiredPolicy && !supportedPolicies.includes(jobInput.requiredPolicy)) {
        isEligible = false;
        diagnostics.rejected_policy++;
        reasons.push('POLICY_MISMATCH');
      }

      if (isEligible) {
        eligible.push({
          id: node.id,
          companyName: node.company_name,
          utilization: node.capacity_utilization_pct,
          latency_ms: node.avg_latency_ms || 0, // Assume this exists or is 0
          region: node.region || node.country
        });
      } else {
        rejected.push({
          id: node.id,
          companyName: node.company_name,
          reasons
        });
      }
    }

    return {
      eligible,
      rejected,
      diagnostics
    };
  }
}

module.exports = new NodeEligibilityService();
