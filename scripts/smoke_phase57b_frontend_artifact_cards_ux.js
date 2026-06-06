const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const outJsonPath = path.resolve(__dirname, '../reports/phase57b_frontend_artifact_cards_ux.json');
const outMdPath = path.resolve(__dirname, '../reports/phase57b_frontend_artifact_cards_ux.md');

// Ensure reports directory exists
if (!fs.existsSync(path.dirname(outJsonPath))) {
    fs.mkdirSync(path.dirname(outJsonPath), { recursive: true });
}

const scenarios = [
    {
        id: 1,
        name: "Check PreflightJobDetailPage for getArtifactUxForArtifact usage",
        validate: () => {
            const content = fs.readFileSync(path.resolve(__dirname, '../src/ui/pages/preflight/PreflightJobDetailPage.tsx'), 'utf-8');
            if (!content.includes('getArtifactUxForArtifact')) {
                throw new Error("PreflightJobDetailPage is not using getArtifactUxForArtifact mapper");
            }
        }
    },
    {
        id: 2,
        name: "Check HumanReportPanel for getArtifactUxForArtifact usage",
        validate: () => {
            const content = fs.readFileSync(path.resolve(__dirname, '../src/ui/components/preflight/HumanReportPanel.tsx'), 'utf-8');
            if (!content.includes('getArtifactUxForArtifact')) {
                throw new Error("HumanReportPanel is not using getArtifactUxForArtifact mapper");
            }
        }
    },
    {
        id: 3,
        name: "Ensure PreflightJobDetailPage does not hardcode Download Fixed PDF",
        validate: () => {
            const content = fs.readFileSync(path.resolve(__dirname, '../src/ui/pages/preflight/PreflightJobDetailPage.tsx'), 'utf-8');
            if (content.includes('>Download Fixed PDF<')) {
                throw new Error("Hardcoded 'Download Fixed PDF' found in PreflightJobDetailPage");
            }
        }
    },
    {
        id: 4,
        name: "Ensure artifactUx fallback mapper is conservative",
        validate: () => {
            const tsPath = path.resolve(__dirname, '../src/lib/artifactUx.ts');
            // We can compile and test, or just parse text
            const content = fs.readFileSync(tsPath, 'utf-8');
            if (content.includes('Certified PDF') && !content.includes('display_label: "Certified PDF"')) {
                // If it exists, ensure it's not being used as a display label
            }
            if (content.includes('display_label: "Certified PDF"')) {
                throw new Error("Fallback mapper grants Certified PDF claim improperly");
            }
        }
    }
];

async function runSmokeTests() {
    console.log("Running Phase 57B Frontend Artifact Cards UX Smoke Tests");
    let passed = 0;
    let failed = 0;
    const results = [];

    for (const scenario of scenarios) {
        try {
            scenario.validate();
            results.push({ id: scenario.id, name: scenario.name, status: "PASS", error: null });
            passed++;
        } catch (e) {
            results.push({ id: scenario.id, name: scenario.name, status: "FAIL", error: e.message });
            failed++;
        }
    }

    const report = {
        timestamp: new Date().toISOString(),
        total: scenarios.length,
        passed,
        failed,
        results
    };

    fs.writeFileSync(outJsonPath, JSON.stringify(report, null, 2));

    let md = `# Phase 57B Frontend Artifact Cards UX Report\n\n`;
    md += `**Date:** ${report.timestamp}\n\n`;
    md += `## Summary\n`;
    md += `- Total: ${report.total}\n`;
    md += `- Passed: ${report.passed}\n`;
    md += `- Failed: ${report.failed}\n\n`;
    md += `## Scenarios\n`;
    report.results.forEach(r => {
        md += `### ${r.id}. ${r.name}\n`;
        md += `- Status: ${r.status}\n`;
        if (r.error) {
            md += `- Error: ${r.error}\n`;
        }
        md += `\n`;
    });

    fs.writeFileSync(outMdPath, md);

    if (failed > 0) {
        console.error("Smoke tests failed.");
        process.exit(1);
    } else {
        console.log("All smoke tests passed.");
    }
}

runSmokeTests();
