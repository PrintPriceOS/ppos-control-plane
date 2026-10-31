import React, { useState } from 'react';
import { LiveOpsOverviewCards } from './LiveOpsOverviewCards';
import { LiveOpsQueueTable } from './LiveOpsQueueTable';
import { LiveOpsIncidentQueue } from './LiveOpsIncidentQueue';
import { LiveOpsSlaRiskQueue } from './LiveOpsSlaRiskQueue';
import { LiveOpsBlockedHandoffsPanel } from './LiveOpsBlockedHandoffsPanel';
import { LiveOpsCustomerActionsPanel } from './LiveOpsCustomerActionsPanel';
import { LiveOpsPartnerActionsPanel } from './LiveOpsPartnerActionsPanel';
import { LiveOpsRollbackPanel } from './LiveOpsRollbackPanel';
import { LiveOpsRevocationPanel } from './LiveOpsRevocationPanel';
import { LiveOpsCommandDetailDrawer } from './LiveOpsCommandDetailDrawer';
import { LiveOpsCommandActionsPanel } from './LiveOpsCommandActionsPanel';
import { LiveOpsAuditTimelinePanel } from './LiveOpsAuditTimelinePanel';
import { LiveOpsEscalationPanel } from './LiveOpsEscalationPanel';

export const AdminLiveOpsCommandCenterPage = () => {
    const [confirmRevoke, setConfirmRevoke] = useState('');
    const [confirmRollback, setConfirmRollback] = useState('');
    const [confirmPause, setConfirmPause] = useState('');

    return (
        <div className="admin-command-center" data-testid="AdminLiveOpsCommandCenterPage">
            <div className="banner">
                Admin command center — actions are audited and cannot bypass governance gates.
            </div>
            
            <LiveOpsOverviewCards />
            <LiveOpsQueueTable />
            <LiveOpsIncidentQueue />
            <LiveOpsSlaRiskQueue />
            <LiveOpsBlockedHandoffsPanel />
            <LiveOpsCustomerActionsPanel />
            <LiveOpsPartnerActionsPanel />
            
            {/* Dangerous Actions with typed confirmation */}
            <div className="dangerous-controls">
                <input value={confirmRevoke} onChange={e => setConfirmRevoke(e.target.value)} placeholder="Type REVOKE LIVE ENABLEMENT" />
                <button disabled={confirmRevoke !== 'REVOKE LIVE ENABLEMENT'}>Revoke</button>
                
                <input value={confirmRollback} onChange={e => setConfirmRollback(e.target.value)} placeholder="Type TRIGGER ROLLBACK" />
                <button disabled={confirmRollback !== 'TRIGGER ROLLBACK'}>Rollback</button>
                
                <input value={confirmPause} onChange={e => setConfirmPause(e.target.value)} placeholder="Type PAUSE LIVE ORDER" />
                <button disabled={confirmPause !== 'PAUSE LIVE ORDER'}>Pause</button>
            </div>

            <LiveOpsRollbackPanel />
            <LiveOpsRevocationPanel />
            <LiveOpsCommandDetailDrawer />
            <LiveOpsCommandActionsPanel />
            <LiveOpsAuditTimelinePanel />
            <LiveOpsEscalationPanel />
        </div>
    );
};
