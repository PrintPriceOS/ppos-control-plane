import React from 'react';
import { BetaWorkspaceShell, WorkspaceTab } from '../../components/BetaWorkspaceShell';
import { LimitedBetaRuntime } from './LimitedBetaRuntime';
import { ControlledBetaRuntimeSession } from './ControlledBetaRuntimeSession';
import { ControlledBetaRuntimeActivityObservation } from './ControlledBetaRuntimeActivityObservation';
import { ControlledBetaRuntimeActivityReview } from './ControlledBetaRuntimeActivityReview';

const tabs: WorkspaceTab[] = [
  { id: 'overview', label: 'Overview', component: LimitedBetaRuntime },
  { id: 'sessions', label: 'Sessions', component: ControlledBetaRuntimeSession },
  { id: 'activity', label: 'Activity', component: ControlledBetaRuntimeActivityObservation },
  { id: 'health', label: 'Cohort Health', component: ControlledBetaRuntimeActivityReview }
];

export const LimitedBetaRuntimeWorkspace: React.FC = () => {
  return (
    <BetaWorkspaceShell
      title="Limited Beta Runtime"
      description="Monitor active sessions, activity tracking, and cohort health reviews."
      breadcrumbGroup="Runtime"
      tabs={tabs}
      defaultTab="overview"
    />
  );
};
export default LimitedBetaRuntimeWorkspace;
