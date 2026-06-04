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

function normalizePreflightArtifacts(jobPayload, registryRow, upstreamPayload, jobId) {
  let sourceArtifacts = [];
  
  if (registryRow && registryRow.artifact_list_json) {
    let parsed = registryRow.artifact_list_json;
    if (typeof parsed === 'string') {
      try { parsed = JSON.parse(parsed); } catch (e) { parsed = null; }
    }
    if (Array.isArray(parsed)) sourceArtifacts = sourceArtifacts.concat(parsed);
  }

  if (jobPayload) {
    const raw = jobPayload.artifacts || jobPayload.artifact_list || jobPayload.availableArtifacts || jobPayload.available_artifacts || [];
    if (Array.isArray(raw)) sourceArtifacts = sourceArtifacts.concat(raw);
    else if (typeof raw === 'object') {
       for (const [k, v] of Object.entries(raw)) {
         if (typeof v === 'string') sourceArtifacts.push({ type: k, path: v, filename: v });
         else if (typeof v === 'object') sourceArtifacts.push({ type: k, ...v });
       }
    }
  }

  if (upstreamPayload) {
    const raw = upstreamPayload.artifacts || upstreamPayload.artifact_list || upstreamPayload.availableArtifacts || upstreamPayload.available_artifacts || [];
    if (Array.isArray(raw)) sourceArtifacts = sourceArtifacts.concat(raw);
    else if (typeof raw === 'object') {
       for (const [k, v] of Object.entries(raw)) {
         if (typeof v === 'string') sourceArtifacts.push({ type: k, path: v, filename: v });
         else if (typeof v === 'object') sourceArtifacts.push({ type: k, ...v });
       }
    }
  }

  const seen = new Set();
  const normalized = [];

  const ALIAS_PRIORITY = [
    'final_fixed_pdf', 'fixed_pdf', 'corrected_pdf', 'repaired_pdf', 'repair_pdf',
    'production_pdf', 'printable_pdf', 'certified_pdf', 'review_pdf', 'normalized_pdf',
    'final_fixed', 'fixed', 'corrected', 'certified'
  ];

  const inferAlias = (item) => {
    const id = item.id || item.artifactId || item.artifact_id || '';
    const type = item.type || item.artifactType || '';
    const name = item.name || item.filename || item.fileName || '';
    const searchStr = `${id}:${type}:${name}`.toLowerCase();

    // Check compound patterns first
    if (searchStr.includes('final_fixed_pdf')) return 'final_fixed_pdf';
    if (searchStr.includes('fixed_pdf')) return 'fixed_pdf';
    if (searchStr.includes('corrected_pdf')) return 'corrected_pdf';
    if (searchStr.includes('repaired_pdf')) return 'repaired_pdf';
    if (searchStr.includes('repair_pdf')) return 'repair_pdf';
    if (searchStr.includes('production_pdf')) return 'production_pdf';
    if (searchStr.includes('printable_pdf')) return 'printable_pdf';
    if (searchStr.includes('certified_pdf')) return 'certified_pdf';
    if (searchStr.includes('review_pdf')) return 'review_pdf';
    if (searchStr.includes('normalized_pdf')) return 'normalized_pdf';
    
    // Exact or legacy matches
    if (searchStr.includes('final_fixed')) return 'final_fixed_pdf';
    if (searchStr.includes('fixed')) return 'fixed_pdf';
    if (searchStr.includes('corrected')) return 'corrected_pdf';
    if (searchStr.includes('certified') || searchStr.includes('certification_pdf')) return 'certified_pdf';
    
    // JSON / Audit reports
    if (searchStr.includes('analysis_report')) return 'analysis_report';
    if (searchStr.includes('report_json') || searchStr.includes('preflight_report') || searchStr.includes('report.json')) return 'report_json';
    if (searchStr.includes('fix_audit') || searchStr.includes('audit_json') || searchStr.includes('repair_audit') || searchStr.includes('audit.json')) return 'fix_audit';
    
    // Summaries
    if (searchStr.includes('client_change_summary') || searchStr.includes('human_summary') || searchStr.includes('change_summary')) return 'change_summary';
    
    return type.toLowerCase() || 'unknown';
  };

  const getLabel = (alias) => {
    if (['fixed_pdf', 'final_fixed_pdf', 'corrected_pdf', 'repaired_pdf', 'repair_pdf', 'production_pdf', 'printable_pdf'].includes(alias)) return 'Fixed PDF';
    if (alias === 'review_pdf') return 'Review PDF';
    if (alias === 'certified_pdf') return 'Certified PDF';
    if (alias === 'fix_audit') return 'Fix Audit JSON';
    if (['analysis_report', 'report_json'].includes(alias)) return 'Analysis Report';
    if (alias === 'change_summary') return 'Change Summary';
    return alias.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  for (const item of sourceArtifacts) {
    if (!item) continue;
    if (typeof item === 'string') continue;
    
    const id = item.id || item.artifactId || item.artifact_id || `art_${Math.random().toString(36).substr(2,9)}`;
    const alias = inferAlias(item);
    
    // Deduplicate by alias for known PDF types to avoid duplicate buttons
    // For other types, deduplicate by alias + id
    const isPrimaryPdf = ['fixed_pdf', 'final_fixed_pdf', 'certified_pdf', 'review_pdf', 'corrected_pdf', 'production_pdf', 'printable_pdf', 'repaired_pdf'].includes(alias);
    const key = isPrimaryPdf ? `alias:${getLabel(alias)}` : `${id}-${alias}`;
    
    if (!seen.has(key)) {
      seen.add(key);
      const isPdf = alias.includes('pdf') || String(item.filename || '').toLowerCase().endsWith('.pdf') || String(item.type || '').toLowerCase().includes('pdf') || String(item.mime_type || '').includes('pdf');
      
      const size_bytes = item.sizeBytes || item.size_bytes || item.size || 0;
      
      normalized.push({
        id,
        alias,
        type: item.type || item.artifactType || 'OUTPUT',
        label: getLabel(alias),
        filename: item.filename || item.name || item.fileName || (isPdf ? 'artifact.pdf' : 'artifact.json'),
        mime_type: item.mime_type || item.mimeType || (isPdf ? 'application/pdf' : 'application/json'),
        size_bytes,
        downloadable: size_bytes > 0,
        download_url: jobId ? `/api/admin/preflight/jobs/${jobId}/artifacts/${alias || id}` : null,
        source: item.storagePath || item.path || item.storageKey || 'upstream',
        priority: ALIAS_PRIORITY.indexOf(alias) !== -1 ? ALIAS_PRIORITY.indexOf(alias) : 999
      });
    }
  }

  normalized.sort((a, b) => a.priority - b.priority);

  return normalized;
}

function normalizeArtifacts(source) {
  // Legacy backward compatible wrapper
  return normalizePreflightArtifacts({ artifacts: source }, null, null, null);
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
  normalizeArtifacts,
  normalizePreflightArtifacts
};
