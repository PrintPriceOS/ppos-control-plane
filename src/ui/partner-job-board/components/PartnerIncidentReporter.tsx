import React, { useState } from 'react';

interface Props {
    jobId: string;
    onError: (err: string) => void;
}

export const PartnerIncidentReporter: React.FC<Props> = ({ jobId }) => {
    const [incidents, setIncidents] = useState<any[]>([]);

    const handleReport = (severity: string) => {
        setIncidents([...incidents, { id: `inc_${Date.now()}`, severity, status: 'OPEN' }]);
    };

    return (
        <div className="incident-reporter" data-testid="incident-reporter">
            <h4>Incidents</h4>
            <button data-testid="btn-report-warning" onClick={() => handleReport('WARNING')}>Report Warning</button>
            <button data-testid="btn-report-critical" onClick={() => handleReport('CRITICAL')}>Report Critical</button>
            
            <ul>
                {incidents.map(inc => (
                    <li key={inc.id} data-testid={`incident-${inc.severity}`}>
                        {inc.severity} - {inc.status}
                    </li>
                ))}
            </ul>
        </div>
    );
};
