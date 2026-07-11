import React from 'react';
import { BetaWorkspaceShell, WorkspaceTab } from '../../components/BetaWorkspaceShell';
import { ControlledBetaCohortInterventionPreparation } from './ControlledBetaCohortInterventionPreparation';
import { ControlledBetaCohortInterventionApproval } from './ControlledBetaCohortInterventionApproval';
import { ControlledBetaCohortInterventionExecution } from './ControlledBetaCohortInterventionExecution';
import { ControlledBetaCohortInterventionSimulation } from './ControlledBetaCohortInterventionSimulation';
import { ControlledBetaCohortInterventionSimulationReview } from './ControlledBetaCohortInterventionSimulationReview';

const tabs: WorkspaceTab[] = [
  { id: 'interventions', label: 'Interventions', component: ControlledBetaCohortInterventionPreparation },
  { id: 'approvals', label: 'Approvals', component: ControlledBetaCohortInterventionApproval },
  { id: 'executions', label: 'Executions', component: ControlledBetaCohortInterventionExecution },
  { id: 'simulations', label: 'Simulations', component: ControlledBetaCohortInterventionSimulation },
  { id: 'simulation-reviews', label: 'Simulation Reviews', component: ControlledBetaCohortInterventionSimulationReview }
];

export const BetaGovernanceWorkspace: React.FC = () => {
  return (
    <BetaWorkspaceShell
      title="Beta Governance"
      description="Govern cohort intervention proposals, approvals, operational executions, and simulations."
      breadcrumbGroup="Governance"
      tabs={tabs}
      defaultTab="interventions"
    />
  );
};
export default BetaGovernanceWorkspace;
