'use strict';

const fs = require('fs');
const path = require('path');
const { runAudit, classifyVariable, isSensitive, SAFETY_FLAGS, DATABASE_VARS, RUNTIME_GOVERNANCE } = require('./audit_env_variable_completeness');

function generatePatch() {
  const audit = runAudit();
  const missing = audit.missing;

  let patchContent = '';
  patchContent += `# ==========================================================================\n`;
  patchContent += `# PRINTPRICE OS — PHASE 135.1 AUTOMATIC ENV PATCH\n`;
  patchContent += `# Generated at: ${new Date().toISOString()}\n`;
  patchContent += `# ==========================================================================\n\n`;

  let hasSafety = false;
  let hasFallback = false;
  let hasRuntime = false;
  let hasDatabase = false;
  let hasSensitive = false;
  let hasOther = false;

  const safetyLines = [];
  const fallbackLines = [];
  const runtimeLines = [];
  const dbLines = [];
  const sensitiveLines = [];
  const otherLines = [];

  for (const name of missing) {
    const cat = classifyVariable(name);

    if (SAFETY_FLAGS.has(name)) {
      safetyLines.push(`${name}=false`);
    } else if (name === 'FORCE_REAL_DB_SMOKE' || name === 'ALLOW_SCHEMA_SMOKE_FALLBACK' || name === 'ALLOW_SMOKE_FALLBACK' || name === 'ALLOW_MOCK_DB' || name === 'ALLOW_IN_MEMORY_DB') {
      fallbackLines.push(`${name}=false`);
    } else if (DATABASE_VARS.has(name)) {
      dbLines.push(`# ${name}=REQUIRED_MANUAL_DATABASE_VALUE`);
    } else if (cat === 'sensitive') {
      sensitiveLines.push(`# ${name}=REQUIRED_MANUAL_SECRET_VALUE`);
    } else if (name === 'NODE_ENV') {
      runtimeLines.push(`${name}=production`);
    } else if (name === 'LOG_LEVEL') {
      runtimeLines.push(`${name}=info`);
    } else if (name === 'AUDIT_LOG_REDACTION_ENABLED' || name === 'EVIDENCE_PACK_REDACTION_ENABLED' || name === 'REDACT_SECRETS_IN_LOGS') {
      runtimeLines.push(`${name}=true`);
    } else {
      // General fallbacks
      const upper = name.toUpperCase();
      if (upper.includes('ENABLED') || upper.includes('ALLOW')) {
        otherLines.push(`${name}=false`);
      } else if (upper.includes('PORT')) {
        otherLines.push(`${name}=3000`);
      } else {
        otherLines.push(`${name}=`);
      }
    }
  }

  if (safetyLines.length > 0) {
    patchContent += `# --- SAFETY INVARIANTS (FORCE DISABLED) ---\n`;
    patchContent += safetyLines.join('\n') + '\n\n';
  }

  if (fallbackLines.length > 0) {
    patchContent += `# --- SMOKE & FALLBACK GOVERNANCE (DISABLED) ---\n`;
    patchContent += fallbackLines.join('\n') + '\n\n';
  }

  if (runtimeLines.length > 0) {
    patchContent += `# --- RUNTIME GOVERNANCE ---\n`;
    patchContent += runtimeLines.join('\n') + '\n\n';
  }

  if (dbLines.length > 0) {
    patchContent += `# --- REQUIRED MANUAL DATABASE CONFIGURATION (DO NOT INVENT) ---\n`;
    patchContent += dbLines.join('\n') + '\n\n';
  }

  if (sensitiveLines.length > 0) {
    patchContent += `# --- REQUIRED MANUAL SECRETS & KEYS (DO NOT INVENT PLACEHOLDERS) ---\n`;
    patchContent += sensitiveLines.join('\n') + '\n\n';
  }

  if (otherLines.length > 0) {
    patchContent += `# --- OTHER DETECTED VARIABLES ---\n`;
    patchContent += otherLines.join('\n') + '\n\n';
  }

  // Ensure /tmp directory exists on Windows or Linux
  // /tmp is resolved relative to drive root (C:\tmp) on Windows
  const tmpDir = path.resolve('/tmp');
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }

  const patchPath = path.join(tmpDir, 'ppos_missing_env_additions.env');
  fs.writeFileSync(patchPath, patchContent, 'utf8');

  return {
    patchPath,
    missingCount: missing.length,
    addedVars: [
      ...safetyLines.map(l => l.split('=')[0]),
      ...fallbackLines.map(l => l.split('=')[0]),
      ...runtimeLines.map(l => l.split('=')[0]),
      ...otherLines.map(l => l.split('=')[0])
    ],
    manualVars: [
      ...dbLines.map(l => l.replace('# ', '').split('=')[0]),
      ...sensitiveLines.map(l => l.replace('# ', '').split('=')[0])
    ]
  };
}

if (require.main === module) {
  const result = generatePatch();
  console.log(`=== ENV PATCH GENERATION ===`);
  console.log(`Patch written to: ${result.patchPath}`);
  console.log(`Variables added with defaults: ${result.addedVars.length}`);
  console.log(`Variables requiring manual configuration: ${result.manualVars.length}`);
  console.log('\nAdded variables:');
  console.log(result.addedVars.join(', '));
  console.log('\nManual required variables (written as comments):');
  console.log(result.manualVars.join(', '));
}

module.exports = { generatePatch };
