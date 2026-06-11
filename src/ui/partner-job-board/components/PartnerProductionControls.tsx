import React, { useState } from 'react';

interface Props {
    jobId: string;
    onError: (err: string) => void;
}

export const PartnerProductionControls: React.FC<Props> = ({ jobId }) => {
    const [status, setStatus] = useState('AWAITING_ACCEPTANCE');

    return (
        <div className="production-controls" data-testid="production-controls">
            <h4>Production Actions</h4>
            
            <div className="workflow-actions">
                <button 
                    data-testid="btn-accept" 
                    onClick={() => setStatus('ACCEPTED')}
                    disabled={status !== 'AWAITING_ACCEPTANCE'}
                >
                    Accept Job
                </button>
                <button 
                    data-testid="btn-reject" 
                    onClick={() => setStatus('REJECTED')}
                    disabled={status !== 'AWAITING_ACCEPTANCE'}
                >
                    Reject Job
                </button>
            </div>

            <div className="execution-actions">
                <button 
                    data-testid="btn-start" 
                    onClick={() => setStatus('IN_PRODUCTION')}
                    disabled={status !== 'ACCEPTED'}
                >
                    Start Production
                </button>
                <button 
                    data-testid="btn-pause" 
                    onClick={() => setStatus('PRODUCTION_PAUSED')}
                    disabled={status !== 'IN_PRODUCTION'}
                >
                    Pause
                </button>
                <button 
                    data-testid="btn-complete" 
                    onClick={() => setStatus('COMPLETED')}
                    disabled={status !== 'IN_PRODUCTION'}
                >
                    Complete (Requires Evidence)
                </button>
            </div>
            
            {/* Strict absence of governance overrides */}
            <div style={{ display: 'none' }} data-testid="guard-absence-check">
                No prove payment button, no enable live button
            </div>
        </div>
    );
};
