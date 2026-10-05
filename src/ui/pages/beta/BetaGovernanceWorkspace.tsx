import React, { useMemo } from 'react';
import { BetaWorkspaceShell, WorkspaceTab } from '../../components/BetaWorkspaceShell';
import { ControlledBetaCohortInterventionPreparation } from './ControlledBetaCohortInterventionPreparation';
import { ControlledBetaCohortInterventionApproval } from './ControlledBetaCohortInterventionApproval';
import { ControlledBetaCohortInterventionExecution } from './ControlledBetaCohortInterventionExecution';
import { ControlledBetaCohortInterventionSimulation } from './ControlledBetaCohortInterventionSimulation';
import { ControlledBetaCohortInterventionSimulationReview } from './ControlledBetaCohortInterventionSimulationReview';
import { useLocale } from '../../i18n';

export const BetaGovernanceWorkspace: React.FC = () => {
  const { t } = useLocale();

  const tabs: WorkspaceTab[] = useMemo(() => [
    { id: 'interventions', label: t('beta.governance.tabInterventions') || 'Intervenciones', component: ControlledBetaCohortInterventionPreparation },
    { id: 'approvals', label: t('beta.governance.tabApprovals') || 'Aprobaciones', component: ControlledBetaCohortInterventionApproval },
    { id: 'executions', label: t('beta.governance.tabExecutions') || 'Ejecuciones', component: ControlledBetaCohortInterventionExecution },
    { id: 'simulations', label: t('beta.governance.tabSimulations') || 'Simulaciones', component: ControlledBetaCohortInterventionSimulation },
    { id: 'simulation-reviews', label: t('beta.governance.tabSimulationReviews') || 'Revisiones de Simulación', component: ControlledBetaCohortInterventionSimulationReview }
  ], [t]);

  return (
    <BetaWorkspaceShell
      title={t('beta.governance.workspaceTitle') || 'Gobernanza de Cohorte Beta'}
      description={t('beta.governance.workspaceDesc') || 'Gobernanza de propuestas de intervención, aprobaciones, ejecuciones operativas y simulaciones.'}
      breadcrumbGroup={t('beta.governance.breadcrumb') || 'Gobernanza'}
      tabs={tabs}
      defaultTab="interventions"
    />
  );
};
export default BetaGovernanceWorkspace;
