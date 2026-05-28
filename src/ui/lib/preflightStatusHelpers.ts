/**
 * Preflight Status Helpers
 * 
 * Shared status classifications, maps, and findings collection (Frontend TypeScript).
 */

export const TERMINAL_DIAGNOSTIC_STATUSES = [
  'COMPLETED',
  'SUCCEEDED',
  'SUCCESS',
  'PASS',
  'PASS_WITH_WARNINGS',
  'COMPLETED_WITH_FINDINGS',
  'DEGRADED',
  'PARTIAL',
  'PARTIAL_ARTIFACTS',
  'AUTOFIX_COMPLETED',
  'AUTOFIX_PARTIAL',
  'AUTOFIX_PARTIAL_REVIEW',
  'AUTOFIX_PARTIAL_REVIEW_REQUIRED',
  'AUTOFIX_REVIEW_REQUIRED',
  'COMPLETED_WITH_REVIEW',
  'AUTOFIX_DEGRADED'
];

export const TERMINAL_FAILURE_STATUSES = [
  'FAILED',
  'ERROR',
  'FAILED_RUNTIME_ENVIRONMENT',
  'ENGINE_ENVIRONMENT_FAILURE',
  'AUTOFIX_FAILED'
];

export function isTerminalDiagnosticStatus(status?: string): boolean {
  if (!status) return false;
  return TERMINAL_DIAGNOSTIC_STATUSES.includes(status.toUpperCase());
}

export function isTerminalFailureStatus(status?: string): boolean {
  if (!status) return false;
  return TERMINAL_FAILURE_STATUSES.includes(status.toUpperCase());
}

export function isTerminalStatus(status?: string): boolean {
  return isTerminalDiagnosticStatus(status) || isTerminalFailureStatus(status);
}

export function isDegradedDiagnosticStatus(status?: string): boolean {
  if (!status) return false;
  const s = status.toUpperCase();
  return s === 'DEGRADED' || s === 'PARTIAL' || s === 'PARTIAL_ARTIFACTS';
}

export function mapPhase10Status(status?: string): string {
  if (!status) return 'FAILED';
  const s = status.toUpperCase();
  
  if (TERMINAL_DIAGNOSTIC_STATUSES.includes(s) || TERMINAL_FAILURE_STATUSES.includes(s)) {
    return s;
  }
  
  switch (s) {
    case 'WAITING':
    case 'QUEUED':
    case 'DELAYED':
      return 'QUEUED';
    case 'ACTIVE':
    case 'PROCESSING':
      return 'PROCESSING';
    case 'FINISHED':
      return 'COMPLETED';
    case 'STALLED':
      return 'STALLED';
    case 'RETRYING':
      return 'RETRYING';
    case 'CANCELLED':
    case 'REMOVED':
      return 'CANCELLED';
    default:
      return s;
  }
}

export function collectFindings(payload: any): any[] {
  if (!payload) return [];
  
  let parsedPayload = payload;
  if (typeof payload === 'string') {
    try {
      parsedPayload = JSON.parse(payload);
    } catch (e) {
      return [];
    }
  }

  const findingsList: any[] = [];

  const addItems = (itemOrList: any) => {
    if (!itemOrList) return;
    if (Array.isArray(itemOrList)) {
      itemOrList.forEach(item => {
        if (item) findingsList.push(item);
      });
    } else {
      findingsList.push(itemOrList);
    }
  };

  const safeGet = (obj: any, pathStr: string): any => {
    if (!obj) return undefined;
    const parts = pathStr.split('.');
    let current = obj;
    for (const part of parts) {
      if (current === null || typeof current !== 'object') return undefined;
      current = current[part];
    }
    return current;
  };

  const paths = [
    'findings',
    'issues',
    'analysis.findings',
    'analysis.issues',
    'forensics.findings',
    'report.findings',
    'report.issues',
    'result.findings',
    'result.issues',
    'result.analysis.findings',
    'result.analysis.issues',
    'result.forensics.findings',
    'warnings',
    'analysis_warnings',
    'metadata.findings',
    'metadata.issues',
    'metadata.analysis.findings',
    'metadata.analysis.issues',
    'metadata.forensics.findings',
    'metadata.report.findings',
    'metadata.report.issues',
    'metadata.result.findings',
    'metadata.result.issues',
    'metadata.result.analysis.findings',
    'metadata.result.analysis.issues',
    'metadata.result.forensics.findings',
    'metadata.warnings',
    'metadata.analysis_warnings'
  ];

  paths.forEach(p => {
    addItems(safeGet(parsedPayload, p));
  });

  if (parsedPayload.metadata_json) {
    let meta = parsedPayload.metadata_json;
    if (typeof meta === 'string') {
      try {
        meta = JSON.parse(meta);
      } catch (e) {
        meta = null;
      }
    }
    if (meta) {
      paths.forEach(p => {
        addItems(safeGet(meta, p));
      });
    }
  }

  if (parsedPayload.canonical_payload_json) {
    let canonical = parsedPayload.canonical_payload_json;
    if (typeof canonical === 'string') {
      try {
        canonical = JSON.parse(canonical);
      } catch (e) {
        canonical = null;
      }
    }
    if (canonical) {
      paths.forEach(p => {
        addItems(safeGet(canonical, p));
      });
    }
  }

  const seen = new Set<string>();
  const uniqueFindings: any[] = [];

  findingsList.forEach(finding => {
    let item = finding;
    if (typeof finding === 'string') {
      item = { message: finding };
    }

    const id = item.id || item.uuid;
    let key: string;
    if (id) {
      key = `id:${id}`;
    } else {
      const code = item.code || '';
      const page = item.page !== undefined ? item.page : '';
      const severity = item.severity || '';
      const message = item.message || '';
      key = `fields:${code}|${page}|${severity}|${message}`;
    }

    if (!seen.has(key)) {
      seen.add(key);
      uniqueFindings.push(item);
    }
  });

  return uniqueFindings;
}
