export const TERMINAL_STATUSES = [
  'COMPLETED',
  'COMPLETED_WITH_FINDINGS',
  'COMPLETED_WITH_REVIEW',
  'SUCCESS_WITH_FINDINGS',
  'REVIEW_REQUIRED',
  'AUTOFIX_REVIEW_REQUIRED',
  'FAILED',
  'DEGRADED',
  'CANCELLED'
];

export const isTerminalPreflightStatus = (status) => {
  if (!status) return false;
  return TERMINAL_STATUSES.includes(status.toUpperCase());
};

export const normalizeBackgroundJobStatus = (displayStatus, upstreamStatus, registryStatus) => {
  return displayStatus || upstreamStatus || registryStatus || 'UNKNOWN';
};

export const shouldRemoveBackgroundJob = (job, now = Date.now()) => {
  if (!job) return { remove: false };

  // Rule 1: Remove any job whose submittedAt is older than 24 hours
  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
  if (job.submittedAt && (now - job.submittedAt) > TWENTY_FOUR_HOURS) {
    return { remove: true, reason: 'STALE_TIME_EXCEEDED' };
  }

  // Rule 2: Remove any job with terminal status
  if (isTerminalPreflightStatus(job.status)) {
    return { remove: true, reason: 'TERMINAL_STATUS' };
  }

  // Rule 3: Remove any job with failedPollCount >= 3
  if (job.failedPollCount && job.failedPollCount >= 3) {
    return { remove: true, reason: 'POLL_FAILURE_LIMIT' };
  }

  // Rule 4: Remove any job whose last error is NOT_FOUND, 404, ACCESS_DENIED, or JOB_NOT_FOUND.
  const terminalErrors = ['NOT_FOUND', '404', 'ACCESS_DENIED', 'JOB_NOT_FOUND'];
  if (job.lastError && terminalErrors.includes(String(job.lastError).toUpperCase())) {
    return { remove: true, reason: 'TERMINAL_ERROR' };
  }

  return { remove: false };
};
