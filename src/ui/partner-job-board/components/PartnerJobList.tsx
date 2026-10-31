import React, { useEffect, useState } from 'react';

interface PartnerJobListProps {
    onSelectJob: (id: string) => void;
    onError: (err: string) => void;
}

export const PartnerJobList: React.FC<PartnerJobListProps> = ({ onSelectJob, onError }) => {
    const [jobs, setJobs] = useState<any[]>([]);

    useEffect(() => {
        // Mock fetch
        setJobs([
            { id: 'j_1', job_number: 'PJ-100', status: 'AWAITING_ACCEPTANCE' },
            { id: 'j_2', job_number: 'PJ-101', status: 'ACCEPTED' },
            { id: 'j_3', job_number: 'PJ-102', status: 'IN_PRODUCTION' },
        ]);
    }, []);

    return (
        <div className="partner-job-list" data-testid="partner-job-list">
            <h3>Assigned Jobs</h3>
            <ul>
                {jobs.map(job => (
                    <li key={job.id} onClick={() => onSelectJob(job.id)} data-testid={`job-item-${job.id}`}>
                        <strong>{job.job_number}</strong> - <span>{job.status}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
};
