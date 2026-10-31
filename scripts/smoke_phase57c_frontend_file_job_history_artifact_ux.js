const fs = require('fs');
const path = require('path');

const UI_DIR = path.join(__dirname, '../src/ui');

// Target files for Phase 57C verification
const TARGET_FILES = [
  'components/JobDetailDrawer.tsx',
  'pages/preflight/PreflightArtifactsPage.tsx',
  'pages/public/PublicHumanReportPage.tsx'
];

const FORBIDDEN_STRINGS = [
  '"Certified PDF"',
  "'Certified PDF'",
  '"Print-ready"',
  "'Print-ready'",
  '"PDF/X certified"',
  "'PDF/X certified'"
];

function runSmokeTest() {
  console.log('Running Phase 57C Frontend History & Drawer UX Smoke Test...');

  let allChecksPassed = true;

  for (const fileRelPath of TARGET_FILES) {
    const fullPath = path.join(UI_DIR, fileRelPath);
    if (!fs.existsSync(fullPath)) {
      console.error(`❌ Missing file: ${fileRelPath}`);
      allChecksPassed = false;
      continue;
    }

    const content = fs.readFileSync(fullPath, 'utf8');

    // 1. Check if getArtifactUxForArtifact is imported and used
    if (!content.includes('getArtifactUxForArtifact')) {
      console.error(`❌ getArtifactUxForArtifact NOT used in ${fileRelPath}`);
      allChecksPassed = false;
    } else {
      console.log(`✅ ${fileRelPath} uses getArtifactUxForArtifact`);
    }

    // 2. Check for forbidden hardcoded claims
    for (const forbidden of FORBIDDEN_STRINGS) {
      if (content.includes(forbidden)) {
        console.error(`❌ ${fileRelPath} contains forbidden hardcoded claim: ${forbidden}`);
        allChecksPassed = false;
      }
    }
  }

  // Global search for forbidden strings in all src/ui/pages and src/ui/components
  const searchDirs = [path.join(UI_DIR, 'pages'), path.join(UI_DIR, 'components')];
  for (const dir of searchDirs) {
    if (!fs.existsSync(dir)) continue;
    
    function scanDir(currentPath) {
      const entries = fs.readdirSync(currentPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);
        if (entry.isDirectory()) {
          scanDir(fullPath);
        } else if (entry.isFile() && (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts'))) {
          const content = fs.readFileSync(fullPath, 'utf8');
          for (const forbidden of FORBIDDEN_STRINGS) {
            // We ignore specific test or translation files if necessary, but here we strictly enforce it
            if (content.includes(forbidden)) {
              console.error(`❌ Global search: Forbidden string ${forbidden} found in ${fullPath.replace(UI_DIR, '')}`);
              allChecksPassed = false;
            }
          }
        }
      }
    }
    
    scanDir(dir);
  }

  if (allChecksPassed) {
    console.log('✅ All Phase 57C checks passed: File & Job history UI correctly leverages artifact_ux.');
    process.exit(0);
  } else {
    console.error('❌ Phase 57C smoke test failed.');
    process.exit(1);
  }
}

runSmokeTest();
