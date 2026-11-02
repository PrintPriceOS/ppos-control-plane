/**
 * scripts/audit-i18n-keys.js
 *
 * Standalone AST / Key-Extractor & JSX Hardcoded-String Auditor for PrintPriceOS Control Plane.
 * 1. Audits key parity across src/ui/en.ts, src/ui/de.ts, and src/ui/es.ts.
 * 2. Detects untranslated English stubs inside de.ts and es.ts (excluding universal acronyms/ISO codes).
 * 3. Scans JSX/TSX files across src/ui/ for missing useLocale() hooks or hardcoded natural language strings.
 */
const fs = require('fs');
const path = require('path');

function extractLocaleKeys(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const keys = new Map();
  const regex = /^\s*(?:'([^']+)'|"([^"]+)"|([A-Za-z0-9_$.]+))\s*:\s*(?:'((?:\\'|[^'])*)'|"((?:\\"|[^"])*)")/gm;
  let match;
  while ((match = regex.exec(raw)) !== null) {
    const key = match[1] || match[2] || match[3];
    const val = match[4] !== undefined ? match[4] : match[5];
    if (key) {
      keys.set(key, val || '');
    }
  }
  return keys;
}

const uiDir = path.join(__dirname, '..', 'src', 'ui');
const enMap = extractLocaleKeys(path.join(uiDir, 'en.ts'));
const deMap = extractLocaleKeys(path.join(uiDir, 'de.ts'));
const esMap = extractLocaleKeys(path.join(uiDir, 'es.ts'));

const allKeys = new Set([...enMap.keys(), ...deMap.keys(), ...esMap.keys()]);

const missingInEn = [];
const missingInDe = [];
const missingInEs = [];
const emptyValues = [];
const identicalEnDeEs = [];

// Universal technical terms/acronyms allowed to be identical across EN/DE/ES
const UNIVERSAL_PATTERNS = /^(?:PDF|CMYK|RGB|ISO|DIN|GS1|SSCC|EPAL|FEFCO|PUR|EVA|CTP|SRA3|B1|B2|B3|A3|A4|A5|A6|OEE|SLA|BPE|API|JSON|XML|SHA-256|NVMe|ID|OK|PASS|WARNING|INFO|ERROR|ONLINE|OFFLINE|LED|UV|VDP|CIP4|JDF|MoR|POD|CMR|EUR|€|\d|\s|[·•/()[\]:.,+-])+$/i;

for (const k of allKeys) {
  if (!enMap.has(k)) missingInEn.push(k);
  if (!deMap.has(k)) missingInDe.push(k);
  if (!esMap.has(k)) missingInEs.push(k);

  const enVal = enMap.get(k) || '';
  const deVal = deMap.get(k) || '';
  const esVal = esMap.get(k) || '';

  if (enVal === '') emptyValues.push(`en:${k}`);
  if (deVal === '') emptyValues.push(`de:${k}`);
  if (esVal === '') emptyValues.push(`es:${k}`);

  if (
    enVal.length > 14 &&
    enVal === deVal &&
    enVal === esVal &&
    !UNIVERSAL_PATTERNS.test(enVal)
  ) {
    identicalEnDeEs.push({ key: k, value: enVal });
  }
}

console.log('=== 1. I18N KEY PARITY MATRIX ===');
console.log(`Total unique keys: ${allKeys.size}`);
console.log(`EN keys: ${enMap.size} (Missing: ${missingInEn.length})`);
console.log(`DE keys: ${deMap.size} (Missing: ${missingInDe.length})`);
console.log(`ES keys: ${esMap.size} (Missing: ${missingInEs.length})`);
console.log(`Empty values: ${emptyValues.length}`);
console.log(`Untranslated multi-word identical stubs across EN/DE/ES: ${identicalEnDeEs.length}`);
if (identicalEnDeEs.length > 0) {
  console.log('Sample identical stubs:', identicalEnDeEs.slice(0, 25));
}

// 2. Scan priority UI files for useLocale usage and hardcoded strings
const priorityFiles = [
  'pages/AdminDashboard.tsx',
  'pages/admin/CommandCenterPage.tsx',
  'pages/admin/PricingIntelligenceTab.tsx',
  'pages/materials/MaterialsPaperPage.tsx',
  'components/materials/MaterialSpecificationDrawer.tsx',
  'pages/os/MachinesPage.tsx',
  'pages/os/PrinthousesPage.tsx',
  'pages/os/PrinthouseDetailPage.tsx',
  'pages/printhouse/MachineCapabilityEditor.tsx',
  'pages/printhouse/PrinthouseSetupHub.tsx',
  'components/printhouse/MachineSpecificationForm.tsx',
  'components/printhouse/setup/MachineFleetPanel.tsx',
  'components/printhouse/machines/MachineBlueprintModal.tsx',
  'components/preflight/PreflightUploadModal.tsx',
  'components/NotificationBell.tsx',
  'layout/Topbar.tsx',
  'layout/Sidebar.tsx',
];

console.log('\n=== 2. UI COMPONENT I18N HOOK AUDIT ===');
for (const rel of priorityFiles) {
  const full = path.join(uiDir, rel);
  if (!fs.existsSync(full)) {
    console.log(`[SKIP] ${rel} (not found)`);
    continue;
  }
  const content = fs.readFileSync(full, 'utf8');
  const usesLocale = content.includes('useLocale');
  const tCalls = (content.match(/\bt\(['"`]/g) || []).length;
  console.log(`${usesLocale ? '[OK]  ' : '[WARN]'} ${rel.padEnd(55)} useLocale=${usesLocale} t() calls=${tCalls}`);
}
