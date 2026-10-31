import React, { useEffect } from 'react';
import { adminFetch } from '../lib/adminApi';
import { shouldRemoveBackgroundJob, normalizeBackgroundJobStatus, isTerminalPreflightStatus } from '../lib/jobMonitorHelpers';

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
  failedPollCount?: number;
  lastError?: string | null;
}

const safeLog = (msg: string, data?: any) => {
  if (process.env.NODE_ENV !== 'production' || localStorage.getItem('PPOS_DEBUG') === 'true') {
    if (data) console.log(msg, data);
    else console.log(msg);
  }
};

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
    failedPollCount: 0,
    lastError: null,
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

    const cleanupStaleBackgroundJobs = (jobs: Record<string, MonitoredJob>): boolean => {
      let modified = false;
      const now = Date.now();
      for (const id of Object.keys(jobs)) {
        const { remove, reason } = shouldRemoveBackgroundJob(jobs[id], now);
        if (remove) {
          safeLog(`[PREFLIGHT-BG-MONITOR][${reason}] Removing ${id}`);
          if (reason === 'TERMINAL_ERROR' || reason === 'POLL_FAILURE_LIMIT') {
            window.dispatchEvent(new CustomEvent('ppos:background-job-removed', { detail: { jobId: id, reason: 'STALE_NOT_FOUND' } }));
          }
          delete jobs[id];
          modified = true;
        }
      }
      return modified;
    };

    // Initial cleanup on mount
    const jobs = getBackgroundJobs();
    if (cleanupStaleBackgroundJobs(jobs)) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
    }

    const pollJobs = async () => {
      const currentJobs = getBackgroundJobs();
      let modified = cleanupStaleBackgroundJobs(currentJobs);

      const activeJobIds = Object.keys(currentJobs).filter(id => !isTerminalPreflightStatus(currentJobs[id].status));

      if (activeJobIds.length === 0) {
        if (modified) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(currentJobs));
        }
        timeoutId = setTimeout(pollJobs, 5000); // Backoff if no active jobs
        return;
      }

      for (const id of activeJobIds) {
        try {
          const res = await adminFetch<any>(`/api/admin/preflight/jobs/${id}`);
          if (res && res.jobId) {
            const displayStatus = normalizeBackgroundJobStatus(res.display_status, res.upstream_status, res.status);
            const isTerminal = isTerminalPreflightStatus(displayStatus);

            if (currentJobs[id].status !== displayStatus || currentJobs[id].progress !== res.progress) {
              currentJobs[id].status = displayStatus;
              currentJobs[id].progress = res.progress || currentJobs[id].progress;
              modified = true;
            }
            
            currentJobs[id].lastCheckedAt = Date.now();
            currentJobs[id].failedPollCount = 0;
            currentJobs[id].lastError = null;

            if (isTerminal && !currentJobs[id].notifiedTerminal) {
              currentJobs[id].notifiedTerminal = true;
              modified = true;
              safeLog(`[PREFLIGHT-BG-MONITOR][TERMINAL_REMOVED] Job ${id} reached terminal state.`);
              
              // Trigger frontend events
              window.dispatchEvent(new Event('ppos:notifications:refresh'));
              window.dispatchEvent(new CustomEvent('ppos:preflight-job-completed', { detail: { jobId: id, status: displayStatus } }));
            }
          }
        } catch (err: any) {
          const is404 = err.status === 404 || (err.message && err.message.includes('404')) || (err.message && err.message.includes('not found'));
          currentJobs[id].failedPollCount = (currentJobs[id].failedPollCount || 0) + 1;
          currentJobs[id].lastError = is404 ? '404' : (err.message || 'UNKNOWN_ERROR');
          currentJobs[id].lastCheckedAt = Date.now();
          
          safeLog(`[PREFLIGHT-BG-MONITOR][POLL_FAILED] Failed to poll ${id}. Count: ${currentJobs[id].failedPollCount}. Error: ${currentJobs[id].lastError}`);
          modified = true;
        }
      }

      // Cleanup again in case errors or terminal states were reached
      if (cleanupStaleBackgroundJobs(currentJobs)) {
          modified = true;
      }

      if (modified) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(currentJobs));
        window.dispatchEvent(new Event('ppos:background-jobs-updated'));
      }

      timeoutId = setTimeout(pollJobs, 3000);
    };

    pollJobs();

    return () => clearTimeout(timeoutId);
  }, []);

  return null;
};
