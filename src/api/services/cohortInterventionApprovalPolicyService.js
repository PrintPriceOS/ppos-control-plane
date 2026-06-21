'use strict';

class CohortInterventionApprovalPolicyService {
  determineRequiredApprovers(preparationType, riskLevel) {
    let approvers = ['operator']; // default
    let policyName = 'DEFAULT_OPERATOR_REVIEW';

    switch (preparationType) {
      case 'PREPARE_COHORT_CONTINUATION':
        if (riskLevel === 'LOW') {
          approvers = ['operator'];
          policyName = 'LOW_RISK_CONTINUATION_POLICY';
        } else {
          approvers = ['operator', 'beta_lead'];
          policyName = 'MEDIUM_RISK_CONTINUATION_POLICY';
        }
        break;

      case 'PREPARE_COHORT_PAUSE':
        if (riskLevel === 'LOW' || riskLevel === 'MEDIUM') {
          approvers = ['beta_lead', 'operations_lead'];
          policyName = 'MEDIUM_RISK_PAUSE_POLICY';
        } else {
          approvers = ['operations_lead', 'governance_owner'];
          policyName = 'HIGH_RISK_PAUSE_POLICY';
        }
        break;

      case 'PREPARE_MANUAL_INTERVENTION':
        if (riskLevel === 'LOW' || riskLevel === 'MEDIUM') {
          approvers = ['operator', 'beta_lead'];
          policyName = 'LOW_MEDIUM_MANUAL_INTERVENTION_POLICY';
        } else {
          approvers = ['beta_lead', 'operations_lead'];
          policyName = 'HIGH_MANUAL_INTERVENTION_POLICY';
        }
        break;

      case 'PREPARE_RISK_ESCALATION':
        approvers = ['operations_lead', 'governance_owner'];
        policyName = 'RISK_ESCALATION_POLICY';
        break;

      case 'PREPARE_CONTROLLED_EXPANSION':
        if (riskLevel === 'HIGH' || riskLevel === 'CRITICAL') {
          approvers = ['beta_lead', 'operations_lead', 'governance_owner'];
          policyName = 'HIGH_EXPANSION_POLICY';
        } else {
          approvers = ['beta_lead', 'governance_owner'];
          policyName = 'EXPANSION_POLICY';
        }
        break;

      case 'PREPARE_PARTICIPANT_SUPPORT':
      case 'PREPARE_OBSERVATION_EXTENSION':
        if (riskLevel === 'HIGH' || riskLevel === 'CRITICAL') {
          approvers = ['operator', 'beta_lead'];
          policyName = 'HIGH_OBSERVATION_SUPPORT_POLICY';
        } else {
          approvers = ['operator'];
          policyName = 'STANDARD_OBSERVATION_SUPPORT_POLICY';
        }
        break;

      default:
        approvers = ['operator'];
        policyName = 'DEFAULT_MUTATION_FALLBACK_POLICY';
    }

    return {
      policyName,
      requiredRoles: approvers
    };
  }
}

const serviceInstance = new CohortInterventionApprovalPolicyService();
module.exports = serviceInstance;
module.exports.serviceInstance = serviceInstance;
module.exports.CohortInterventionApprovalPolicyService = CohortInterventionApprovalPolicyService;
