import React, { useState, useEffect } from 'react';
import { PartnerJobList } from './components/PartnerJobList';
import { PartnerJobDetail } from './components/PartnerJobDetail';

export const PartnerJobBoardPage: React.FC = () => {
    const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
    const [role] = useState('PRINTHOUSE_ADMIN'); // Mocked context
    const [error, setError] = useState<string | null>(null);

    if (role === 'CUSTOMER') {
        return <div data-testid="error-unauthorized">Unauthorized access</div>;
    }

    return (
        <div className="partner-job-board" data-testid="partner-job-board-page">
            <header>
                <h1>Partner Production Job Board</h1>
                {error && <div className="error-banner">{error}</div>}
            </header>
            <main style={{ display: 'flex', gap: '2rem' }}>
                <div style={{ flex: 1 }}>
                    <PartnerJobList onSelectJob={setSelectedJobId} onError={setError} />
                </div>
                <div style={{ flex: 2 }}>
                    {selectedJobId ? (
                        <PartnerJobDetail jobId={selectedJobId} onError={setError} />
                    ) : (
                        <p data-testid="no-job-selected">Select a job to view details</p>
                    )}
                </div>
            </main>
        </div>
    );
};
