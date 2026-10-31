import React, { useMemo } from 'react';
import { BetaWorkspaceShell, WorkspaceTab } from '../../components/BetaWorkspaceShell';
import { LimitedBetaRuntime } from './LimitedBetaRuntime';
import { ControlledBetaRuntimeSession } from './ControlledBetaRuntimeSession';
import { ControlledBetaRuntimeActivityObservation } from './ControlledBetaRuntimeActivityObservation';
import { ControlledBetaRuntimeActivityReview } from './ControlledBetaRuntimeActivityReview';
import { useLocale } from '../../i18n';

export const LimitedBetaRuntimeWorkspace: React.FC = () => {
  const { t } = useLocale();

  const tabs: WorkspaceTab[] = useMemo(() => [
    { id: 'overview', label: t('beta.runtime.tabOverview') || 'Resumen', component: LimitedBetaRuntime },
    { id: 'sessions', label: t('beta.runtime.tabSessions') || 'Sesiones', component: ControlledBetaRuntimeSession },
    { id: 'activity', label: t('beta.runtime.tabActivity') || 'Actividad', component: ControlledBetaRuntimeActivityObservation },
    { id: 'health', label: t('beta.runtime.tabHealth') || 'Salud de Cohorte', component: ControlledBetaRuntimeActivityReview }
  ], [t]);

  return (
    <BetaWorkspaceShell
      title={t('beta.runtime.workspaceTitle') || 'Entorno Beta Controlado'}
      description={t('beta.runtime.workspaceDesc') || 'Supervisión de sesiones activas, registro de actividad y revisiones de salud de cohorte.'}
      breadcrumbGroup={t('beta.runtime.breadcrumb') || 'Ejecución'}
      tabs={tabs}
      defaultTab="overview"
    />
  );
};
export default LimitedBetaRuntimeWorkspace;
