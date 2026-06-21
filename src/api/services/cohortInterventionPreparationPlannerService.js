'use strict';

class CohortInterventionPreparationPlannerService {
  planIntervention(recommendedDecision) {
    let preparationType = 'PREPARE_MANUAL_INTERVENTION';
    let proposedActions = [];
    let requiredApprovals = ['admin'];
    let rollbackConsiderations = ['Verify database backup is intact before any state recovery.'];
    let communicationPlan = ['notify_ops_team_slack'];
    let summary = `Proposed review-only intervention preparation for decision ${recommendedDecision}.`;

    switch (recommendedDecision) {
      case 'CONTINUE_COHORT':
        preparationType = 'PREPARE_COHORT_CONTINUATION';
        proposedActions = [
          { action_key: 'log_continuation', description: 'Log cohort continuation decision' },
          { action_key: 'verify_monitoring_active', description: 'Confirm telemetry alerts are active' }
        ];
        break;

      case 'PAUSE_COHORT':
        preparationType = 'PREPARE_COHORT_PAUSE';
        proposedActions = [
          { action_key: 'prepare_warning_notice', description: 'Draft warning notice for participants' },
          { action_key: 'mark_restricted_access_draft', description: 'Draft cohort access restriction policy (review-only)' }
        ];
        requiredApprovals = ['admin', 'security_officer'];
        rollbackConsiderations = [
          'Verify baseline health checks pass before restoring full access.',
          'Trigger notification to all participants when cohort status is restored.'
        ];
        communicationPlan = ['notify_support_desk', 'email_operations_director'];
        break;

      case 'REQUIRE_MANUAL_INTERVENTION':
        preparationType = 'PREPARE_MANUAL_INTERVENTION';
        proposedActions = [
          { action_key: 'assign_engineer', description: 'Assign dedicated support engineer to review logs' },
          { action_key: 'compile_incident_report', description: 'Aggregate error logs and telemetry graphs' }
        ];
        requiredApprovals = ['admin', 'engineering_lead'];
        rollbackConsiderations = [
          'Confirm system state is stable before closing the intervention ticket.'
        ];
        communicationPlan = ['create_jira_incident', 'page_oncall_engineer'];
        break;

      case 'MARK_OPERATIONAL_RISK':
        preparationType = 'PREPARE_RISK_ESCALATION';
        proposedActions = [
          { action_key: 'flag_risk_dashboard', description: 'Display risk indicator on admin panel' },
          { action_key: 'schedule_compliance_call', description: 'Schedule daily triage meeting' }
        ];
        requiredApprovals = ['admin', 'risk_compliance_officer'];
        rollbackConsiderations = [
          'Verify all compliance blockers are resolved and signed off.'
        ];
        communicationPlan = ['email_risk_committee', 'notify_compliance_slack'];
        break;

      case 'PREPARE_CONTROLLED_EXPANSION':
        preparationType = 'PREPARE_CONTROLLED_EXPANSION';
        proposedActions = [
          { action_key: 'prepare_capacity_check', description: 'Verify node capacity and load tolerance' },
          { action_key: 'draft_invite_pipeline', description: 'Identify next candidates in queue (review-only)' }
        ];
        requiredApprovals = ['admin', 'operations_lead'];
        rollbackConsiderations = [
          'Revert capacity configuration changes if resource exhaustion occurs.'
        ];
        communicationPlan = ['email_marketing_team', 'notify_growth_slack'];
        break;

      case 'REQUEST_MORE_OBSERVATION':
        preparationType = 'PREPARE_OBSERVATION_EXTENSION';
        proposedActions = [
          { action_key: 'extend_monitoring_window', description: 'Extend observation window by 48 hours' },
          { action_key: 'increase_metrics_frequency', description: 'Increase logging frequency for active cohorts' }
        ];
        requiredApprovals = ['admin'];
        rollbackConsiderations = [
          'Restore normal metrics collecting intervals post-observation.'
        ];
        communicationPlan = ['notify_triage_team'];
        break;

      default:
        proposedActions = [
          { action_key: 'generic_manual_intervention', description: 'Review cohort health and manually resolve' }
        ];
    }

    return {
      preparationType,
      proposedActions,
      requiredApprovals,
      rollbackConsiderations,
      communicationPlan,
      summary
    };
  }
}

const serviceInstance = new CohortInterventionPreparationPlannerService();
module.exports = serviceInstance;
module.exports.serviceInstance = serviceInstance;
module.exports.CohortInterventionPreparationPlannerService = CohortInterventionPreparationPlannerService;
