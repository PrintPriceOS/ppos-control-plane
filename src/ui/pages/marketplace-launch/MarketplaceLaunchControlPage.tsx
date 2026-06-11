import React, { useState } from 'react';
import { LaunchReadinessPanel } from './LaunchReadinessPanel';
import { LaunchDomainChecklist } from './LaunchDomainChecklist';
import { LaunchCohortPanel } from './LaunchCohortPanel';
import { LaunchApprovalWorkflowPanel } from './LaunchApprovalWorkflowPanel';
import { PublicExposureFlagsPanel } from './PublicExposureFlagsPanel';
import { PublicGuardDecisionsPanel } from './PublicGuardDecisionsPanel';
import { EmergencyStopPanel } from './EmergencyStopPanel';
import { LaunchRollbackPanel } from './LaunchRollbackPanel';
import { LaunchAuditTimelinePanel } from './LaunchAuditTimelinePanel';

export const MarketplaceLaunchControlPage = () => {
    const [confirmApprove, setConfirmApprove] = useState('');
    const [confirmRollout, setConfirmRollout] = useState('');
    const [confirmStop, setConfirmStop] = useState('');
    const [confirmRollback, setConfirmRollback] = useState('');

    return (
        <div className="marketplace-launch-control" data-testid="MarketplaceLaunchControlPage">
            <div className="banner">
                Launch control — public marketplace launch is disabled until explicitly approved and activated.
            </div>
            
            <LaunchReadinessPanel />
            <LaunchDomainChecklist />
            <LaunchCohortPanel />
            <LaunchApprovalWorkflowPanel />
            <PublicExposureFlagsPanel />
            <PublicGuardDecisionsPanel />
            <EmergencyStopPanel />
            <LaunchRollbackPanel />
            <LaunchAuditTimelinePanel />
            
            <div className="dangerous-controls">
                <input value={confirmApprove} onChange={e => setConfirmApprove(e.target.value)} placeholder="Type APPROVE MARKETPLACE LAUNCH" />
                <button disabled={confirmApprove !== 'APPROVE MARKETPLACE LAUNCH'}>Approve</button>
                
                <input value={confirmRollout} onChange={e => setConfirmRollout(e.target.value)} placeholder="Type ACTIVATE LIMITED ROLLOUT" />
                <button disabled={confirmRollout !== 'ACTIVATE LIMITED ROLLOUT'}>Activate Rollout</button>
                
                <input value={confirmStop} onChange={e => setConfirmStop(e.target.value)} placeholder="Type EMERGENCY STOP MARKETPLACE" />
                <button disabled={confirmStop !== 'EMERGENCY STOP MARKETPLACE'}>Emergency Stop</button>
                
                <input value={confirmRollback} onChange={e => setConfirmRollback(e.target.value)} placeholder="Type ROLLBACK MARKETPLACE LAUNCH" />
                <button disabled={confirmRollback !== 'ROLLBACK MARKETPLACE LAUNCH'}>Rollback</button>
            </div>
        </div>
    );
};
