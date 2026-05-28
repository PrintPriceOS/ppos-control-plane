/**
 * Preflight Status Helpers
 * 
 * Shared status classifications, maps, and findings collection.
 */

const TERMINAL_DIAGNOSTIC_STATUSES = [
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

const TERMINAL_FAILURE_STATUSES = [
  'FAILED',
  'ERROR',
  'FAILED_RUNTIME_ENVIRONMENT',
  'ENGINE_ENVIRONMENT_FAILURE',
  'AUTOFIX_FAILED'
];

function isTerminalDiagnosticStatus(status) {
  if (!status) return false;
  return TERMINAL_DIAGNOSTIC_STATUSES.includes(status.toUpperCase());
}

function isTerminalFailureStatus(status) {
  if (!status) return false;
  return TERMINAL_FAILURE_STATUSES.includes(status.toUpperCase());
}

function isTerminalStatus(status) {
  return isTerminalDiagnosticStatus(status) || isTerminalFailureStatus(status);
}

function isDegradedDiagnosticStatus(status) {
  if (!status) return false;
  const s = status.toUpperCase();
  return s === 'DEGRADED' || s === 'PARTIAL' || s === 'PARTIAL_ARTIFACTS';
}

function mapPhase10Status(status) {
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

function collectFindings(payload) {
  if (!payload) return [];
  
  let parsedPayload = payload;
  if (typeof payload === 'string') {
    try {
      parsedPayload = JSON.parse(payload);
    } catch (e) {
      return [];
    }
  }

  const findingsList = [];

  const addItems = (itemOrList) => {
    if (!itemOrList) return;
    if (Array.isArray(itemOrList)) {
      itemOrList.forEach(item => {
        if (item) findingsList.push(item);
      });
    } else {
      findingsList.push(itemOrList);
    }
  };

  const safeGet = (obj, pathStr) => {
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

  const seen = new Set();
  const uniqueFindings = [];

  findingsList.forEach(finding => {
    let item = finding;
    if (typeof finding === 'string') {
      item = { message: finding };
    }

    const id = item.id || item.uuid;
    let key;
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

function normalizeArtifacts(source) {
  if (!source) return [];
  
  if (Array.isArray(source)) {
    return source.map(item => {
      if (typeof item === 'string') {
        return { type: 'OUTPUT', filename: item, path: item, storageKey: item };
      }
      const name = item.filename || item.name || 'artifact.pdf';
      const storagePath = item.path || item.storageKey || item.storage_key || '';
      return {
        id: item.id || item.artifactId || undefined,
        type: item.type || item.artifactType || 'OUTPUT',
        filename: name,
        sizeBytes: item.sizeBytes || item.size || 0,
        path: storagePath,
        storageKey: storagePath
      };
    });
  }

  if (typeof source === 'object') {
    const list = [];
    for (const [key, val] of Object.entries(source)) {
      if (!val) continue;
      if (typeof val === 'string') {
        list.push({
          type: key,
          filename: val,
          path: val,
          storageKey: val,
          sizeBytes: 0
        });
      } else if (typeof val === 'object') {
        const name = val.filename || val.name || val.path || 'artifact.pdf';
        const storagePath = val.path || val.storageKey || val.storage_key || '';
        list.push({
          id: val.id || val.artifactId || undefined,
          type: val.type || val.artifactType || key,
          filename: name,
          sizeBytes: val.sizeBytes || val.size || 0,
          path: storagePath,
          storageKey: storagePath
        });
      }
    }
    return list;
  }

  return [];
}

module.exports = {
  TERMINAL_DIAGNOSTIC_STATUSES,
  TERMINAL_FAILURE_STATUSES,
  isTerminalDiagnosticStatus,
  isTerminalFailureStatus,
  isTerminalStatus,
  isDegradedDiagnosticStatus,
  mapPhase10Status,
  collectFindings,
  normalizeArtifacts
};
