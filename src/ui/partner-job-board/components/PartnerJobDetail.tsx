import React from 'react';
import { PartnerProductionControls } from './PartnerProductionControls';
import { PartnerIncidentReporter } from './PartnerIncidentReporter';

interface PartnerJobDetailProps {
    jobId: string;
    onError: (err: string) => void;
}

export const PartnerJobDetail: React.FC<PartnerJobDetailProps> = ({ jobId, onError }) => {
    const isMockGovernanceOverclaim = false;

    if (isMockGovernanceOverclaim) {
        return <div data-testid="error-overclaim">Overclaim detected</div>;
    }

    return (
        <div className="partner-job-detail" data-testid="partner-job-detail">
            <h3>Job Details: {jobId}</h3>
            
            <section className="safe-payloads" data-testid="safe-payloads-section">
                <h4>Production Specifications</h4>
                <div data-testid="spec-viewer">Safe spec data shown</div>
                <div data-testid="handoff-viewer">Safe handoff reference shown</div>
                {/* Intentionally missing raw governance and billing blocks */}
            </section>

            <section className="controls">
                <PartnerProductionControls jobId={jobId} onError={onError} />
            </section>
            
            <section className="incidents">
                <PartnerIncidentReporter jobId={jobId} onError={onError} />
            </section>
        </div>
    );
};
