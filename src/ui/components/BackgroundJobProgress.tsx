import React, { useEffect, useState } from 'react';
import { getBackgroundJobs } from './BackgroundJobMonitor';
import { CheckCircleIcon, ArrowPathIcon, ExclamationCircleIcon, ShieldExclamationIcon } from "@heroicons/react/24/outline";

export const BackgroundJobProgress: React.FC = () => {
  const [jobs, setJobs] = useState(getBackgroundJobs());

  useEffect(() => {
    const handleUpdate = () => {
      setJobs(getBackgroundJobs());
    };
    
    window.addEventListener('ppos:background-job-added', handleUpdate);
    window.addEventListener('ppos:background-jobs-updated', handleUpdate);
    
    return () => {
      window.removeEventListener('ppos:background-job-added', handleUpdate);
      window.removeEventListener('ppos:background-jobs-updated', handleUpdate);
    };
  }, []);

  const activeJobs = Object.values(jobs).filter(
    j => !['COMPLETED', 'COMPLETED_WITH_FINDINGS', 'COMPLETED_WITH_REVIEW', 'SUCCESS_WITH_FINDINGS', 'REVIEW_REQUIRED', 'AUTOFIX_REVIEW_REQUIRED', 'FAILED', 'DEGRADED', 'CANCELLED'].includes(j.status)
  );

  if (activeJobs.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
        <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
        Processing in background — safe to leave this page.
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {activeJobs.map(job => {
          let p = job.progress || 20;
          if (job.status === 'QUEUED') p = 5;

          return (
            <div key={job.jobId} className="glass p-3 border ppos-border relative overflow-hidden group">
              <div className="flex justify-between items-start mb-2 relative z-10">
                <div className="flex flex-col max-w-[70%]">
                  <span className="font-mono text-[9px] font-bold text-primary truncate" title={job.jobId}>
                    #{job.jobId}
                  </span>
                  <span className="text-xs font-bold text-slate-800 dark:text-white truncate" title={job.filename}>
                    {job.filename}
                  </span>
                </div>
                <div className="px-1.5 py-0.5 bg-slate-100 dark:bg-white/10 text-[8px] font-black uppercase text-slate-600 dark:text-zinc-300">
                  {job.status}
                </div>
              </div>
              <div className="w-full bg-slate-200 dark:bg-white/10 h-1 mt-2 relative z-10">
                <div className="bg-primary h-full transition-all duration-500 ease-out" style={{ width: `${p}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
