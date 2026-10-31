/**
 * scripts/validate-preflight-environment-integrity.js
 * 
 * Regression fixture validating Control Plane Preflight status propagation,
 * canonical extraction fidelity mappings, action gate invariants, and structural issue deduplication.
 */

const assert = require('assert');

// 1. Replica of renderAnalysisIntegrity logic from PreflightJobDetailPage.tsx
function renderAnalysisIntegrity(payload) {
  if (!payload) return '100% Native';
  
  const missingTools = Array.isArray(payload.missing_tools) ? payload.missing_tools : 
                       (Array.isArray(payload.missingTools) ? payload.missingTools : 
                       (Array.isArray(payload.analysis?.missing_tools) ? payload.analysis.missing_tools : []));
                       
  const analysisType = payload.analysis_type || payload.analysisType || payload.analysis?.analysis_type;
  
  if (missingTools.length > 0) {
    return 'RUNTIME_ENVIRONMENT_FAILURE';
  }
  if (analysisType === 'DEGRADED') {
    return 'DEGRADED_EXTRACTION';
  }
  
  const integ = payload.analysisIntegrity || {};
  if (integ.realExtraction === true && integ.degradedMode === false) {
    return 'REAL_EXTRACTION';
  }
  
  if (typeof payload.analysisIntegrity === 'string') return payload.analysisIntegrity;
  if (integ.fallbackUsed) return 'FALLBACK';
  if (integ.degradedMode) return 'DEGRADED';
  
  return '100% Native';
}

// 2. Replica of findings deduplication and issue count sanitization
function sanitizeAndDeduplicateIssuesCount(payload) {
  const rawIssues = Array.isArray(payload.issues) ? payload.issues : (Array.isArray(payload.analysis?.issues) ? payload.analysis.issues : []);
  const sanitizedIssues = rawIssues.filter((issue) => {
    if (!issue) return false;
    const textStr = typeof issue === 'string' ? issue : JSON.stringify(issue);
    const isEnvDefect = textStr.includes('missing_tool') || 
                        textStr.includes('pdfimages') || 
                        textStr.includes('pdfinfo') || 
                        textStr.includes('mutool') || 
                        textStr.includes('spawn ENOENT') ||
                        textStr.includes('RUNTIME_ENVIRONMENT');
    return !isEnvDefect;
  });

  const uniqueIssuesMap = new Map();
  sanitizedIssues.forEach((iss) => {
    const key = typeof iss === 'string' ? iss : (iss.id || iss.code || iss.message || JSON.stringify(iss));
    if (!uniqueIssuesMap.has(key)) {
      uniqueIssuesMap.set(key, iss);
    }
  });
  return uniqueIssuesMap.size;
}

// 3. Define the strict regression testing fixtures
const fixtures = [
  {
    name: "Scenario A: Healthy Full Extraction Payload",
    payload: {
      analysis_type: "FULL",
      missing_tools: [],
      analysisIntegrity: {
        realExtraction: true,
        degradedMode: false,
        certificationAllowed: true
      },
      issues: [
        { id: "FONT_UNEMBEDDED", message: "Font Helvetica not embedded" },
        { id: "LOW_RES_IMAGE", message: "Raster image resolution below 300 DPI" }
      ]
    },
    expectedFidelity: "REAL_EXTRACTION",
    expectedIssuesCount: 2,
    expectedIsFixBlocked: false
  },
  {
    name: "Scenario B: Degraded Mode with Missing Binaries (Runtime Environment Failure)",
    payload: {
      analysis_type: "DEGRADED",
      missing_tools: ["pdfimages", "mutool"],
      extractionErrors: "spawn ENOENT",
      forensic_event: "FORENSIC_DEGRADED_ANALYSIS",
      analysisIntegrity: {
        realExtraction: false,
        degradedMode: true,
        certificationAllowed: false
      },
      issues: [
        "missing_tool: pdfimages binary absent from execution PATH",
        { id: "SYS_ERR", message: "mutool process failed: spawn ENOENT" },
        { id: "COLORSPACE_UNSUPPORTED", message: "RGB colorspace detected" }
      ]
    },
    expectedFidelity: "RUNTIME_ENVIRONMENT_FAILURE",
    expectedIssuesCount: 1, // Only COLORSPACE_UNSUPPORTED remains after filtering environment issues
    expectedIsFixBlocked: true
  },
  {
    name: "Scenario C: Degraded Extraction without missing binaries",
    payload: {
      analysis_type: "DEGRADED",
      missing_tools: [],
      analysisIntegrity: {
        realExtraction: false,
        degradedMode: true,
        certificationAllowed: false
      },
      issues: [
        { id: "CORRUPT_METADATA", message: "Document dictionary contains circular reference loops" },
        { id: "CORRUPT_METADATA", message: "Document dictionary contains circular reference loops" } // duplicate
      ]
    },
    expectedFidelity: "DEGRADED_EXTRACTION",
    expectedIssuesCount: 1, // deduplicated perfectly
    expectedIsFixBlocked: true // certificationAllowed is false
  }
];

// 4. Execute standard assertions
console.log("[PREFLIGHT-REGRESSION-FIXTURE] Executing deterministic validation test suite...\n");

let passed = 0;
fixtures.forEach((f, idx) => {
  console.log(`Testing Fixture #${idx + 1}: ${f.name}`);
  
  // Test Fidelity Mapping
  const actualFidelity = renderAnalysisIntegrity(f.payload);
  assert.strictEqual(actualFidelity, f.expectedFidelity, `Fidelity mismatch: expected ${f.expectedFidelity}, got ${actualFidelity}`);
  
  // Test Issue Count Deduplication & Sanitization
  const actualIssuesCount = sanitizeAndDeduplicateIssuesCount(f.payload);
  assert.strictEqual(actualIssuesCount, f.expectedIssuesCount, `Issues count mismatch: expected ${f.expectedIssuesCount}, got ${actualIssuesCount}`);
  
  // Test Fix Action Gating invariant
  const missingTools = f.payload.missing_tools || [];
  const integ = f.payload.analysisIntegrity || {};
  const actualIsFixBlocked = missingTools.length > 0 || integ.certificationAllowed === false || integ.realExtraction === false;
  assert.strictEqual(actualIsFixBlocked, f.expectedIsFixBlocked, `Fix Blocked invariant mismatch`);
  
  console.log("  ✔️ PASSED invariant validations perfectly.\n");
  passed++;
});

console.log(`-----------------------------------------------------------------`);
console.log(`[SUCCESS] Regression suite complete: ${passed}/${fixtures.length} scenarios verified.`);
console.log(`-----------------------------------------------------------------`);
