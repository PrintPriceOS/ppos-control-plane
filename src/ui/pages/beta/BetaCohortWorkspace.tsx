import React, { useMemo } from 'react';
import { BetaWorkspaceShell, WorkspaceTab } from '../../components/BetaWorkspaceShell';
import { ControlledBetaCohortActivation } from './ControlledBetaCohortActivation';
import { ControlledBetaInviteIssuance } from './ControlledBetaInviteIssuance';
import { ControlledBetaInviteAcceptance } from './ControlledBetaInviteAcceptance';
import { useLocale } from '../../i18n';

export const BetaCohortWorkspace: React.FC = () => {
  const { t } = useLocale();

  const tabs: WorkspaceTab[] = useMemo(() => [
    { id: 'activation', label: t('beta.cohort.tabActivation') || 'Activación', component: ControlledBetaCohortActivation },
    { id: 'invitations', label: t('beta.cohort.tabInvitations') || 'Invitaciones', component: ControlledBetaInviteIssuance },
    { id: 'participants', label: t('beta.cohort.tabParticipants') || 'Participantes', component: ControlledBetaInviteAcceptance }
  ], [t]);

  return (
    <BetaWorkspaceShell
      title={t('beta.cohort.workspaceTitle') || 'Gestión de Cohorte Beta'}
      description={t('beta.cohort.workspaceDesc') || 'Gestión de activación de cohorte, emisión de invitaciones y auditoría de participantes activos.'}
      breadcrumbGroup={t('beta.cohort.breadcrumb') || 'Cohortes'}
      tabs={tabs}
      defaultTab="activation"
    />
  );
};
export default BetaCohortWorkspace;
