import React from 'react';
import { BetaWorkspaceShell, WorkspaceTab } from '../../components/BetaWorkspaceShell';
import { ControlledBetaCohortActivation } from './ControlledBetaCohortActivation';
import { ControlledBetaInviteIssuance } from './ControlledBetaInviteIssuance';
import { ControlledBetaInviteAcceptance } from './ControlledBetaInviteAcceptance';

const tabs: WorkspaceTab[] = [
  { id: 'activation', label: 'Activation', component: ControlledBetaCohortActivation },
  { id: 'invitations', label: 'Invitations', component: ControlledBetaInviteIssuance },
  { id: 'participants', label: 'Participants', component: ControlledBetaInviteAcceptance }
];

export const BetaCohortWorkspace: React.FC = () => {
  return (
    <BetaWorkspaceShell
      title="Beta Cohort Management"
      description="Manage cohort activation, issue invites, and audit active participants."
      breadcrumbGroup="Cohorts"
      tabs={tabs}
      defaultTab="activation"
    />
  );
};
export default BetaCohortWorkspace;
