import React, { useEffect } from 'react';
import { adminFetch } from '../lib/adminApi';

const STORAGE_KEY = 'ppos.background.preflight.jobs';

interface MonitoredJob {
  jobId: string;
  filename: string;
  type: string;
  tenantId: string;
  status: string;
  progress: number;
  submittedAt: number;
  lastCheckedAt: number;
  notifiedTerminal: boolean;
}

export function addBackgroundJob(job: Partial<MonitoredJob> & { jobId: string }) {
  const jobs = getBackgroundJobs();
  jobs[job.jobId] = {
    jobId: job.jobId,
    filename: job.filename || 'Unknown File',
    type: job.type || 'ANALYZE',
    tenantId: job.tenantId || 'system',
    status: job.status || 'QUEUED',
    progress: job.progress || 0,
    submittedAt: job.submittedAt || Date.now(),
    lastCheckedAt: Date.now(),
    notifiedTerminal: false,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
  window.dispatchEvent(new Event('ppos:background-job-added'));
}

export function getBackgroundJobs(): Record<string, MonitoredJob> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

export const BackgroundJobMonitor: React.FC = () => {
  useEffect(() => {
    let timeoutId: any;

    const pollJobs = async () => {
      const jobs = getBackgroundJobs();
      const activeJobIds = Object.keys(jobs).filter(
        id => !['COMPLETED', 'COMPLETED_WITH_FINDINGS', 'COMPLETED_WITH_REVIEW', 'SUCCESS_WITH_FINDINGS', 'REVIEW_REQUIRED', 'AUTOFIX_REVIEW_REQUIRED', 'FAILED', 'DEGRADED', 'CANCELLED'].includes(jobs[id].status)
      );

      if (activeJobIds.length === 0) {
        timeoutId = setTimeout(pollJobs, 5000); // Backoff if no active jobs
        return;
      }

      let modified = false;

      for (const id of activeJobIds) {
        try {
          const res = await adminFetch<any>(`/api/admin/preflight/jobs/${id}`);
          if (res && res.jobId) {
            const displayStatus = res.display_status || res.upstream_status || res.status;
            const isTerminal = ['COMPLETED', 'COMPLETED_WITH_FINDINGS', 'COMPLETED_WITH_REVIEW', 'SUCCESS_WITH_FINDINGS', 'REVIEW_REQUIRED', 'AUTOFIX_REVIEW_REQUIRED', 'FAILED', 'DEGRADED', 'CANCELLED'].includes(displayStatus);

            if (jobs[id].status !== displayStatus || jobs[id].progress !== res.progress) {
              jobs[id].status = displayStatus;
              jobs[id].progress = res.progress || jobs[id].progress;
              jobs[id].lastCheckedAt = Date.now();
              modified = true;
            }

            if (isTerminal && !jobs[id].notifiedTerminal) {
              jobs[id].notifiedTerminal = true;
              modified = true;
              
              // Trigger frontend events
              window.dispatchEvent(new Event('ppos:notifications:refresh'));
              window.dispatchEvent(new CustomEvent('ppos:preflight-job-completed', { detail: { jobId: id, status: displayStatus } }));
              
              // Optional Toast logic here if you have a toast manager
            }
          }
        } catch (err) {
          console.warn(`[BackgroundJobMonitor] Failed to poll ${id}`, err);
        }
      }

      if (modified) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
        window.dispatchEvent(new Event('ppos:background-jobs-updated'));
      }

      timeoutId = setTimeout(pollJobs, 3000);
    };

    pollJobs();

    return () => clearTimeout(timeoutId);
  }, []);

  return null;
};
