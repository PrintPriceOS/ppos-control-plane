const fs = require('fs');
let code = fs.readFileSync('src/ui/pages/preflight/PreflightJobDetailPage.tsx', 'utf8');

const helper = `function getArtifactDownloadId(artifact: any): string | null {
  if (!artifact) return null;
  if (typeof artifact === 'string') return artifact;

  const candidate =
    artifact.download_id ||
    artifact.alias ||
    artifact.id ||
    artifact.artifact_id;

  return typeof candidate === 'string' && candidate.trim()
    ? candidate.trim()
    : null;
}

`;

if (!code.includes('function getArtifactDownloadId')) {
    code = code.replace('async function handleDownloadArtifact(artifact: any) {', helper + 'async function handleDownloadArtifact(artifact: any) {');
    fs.writeFileSync('src/ui/pages/preflight/PreflightJobDetailPage.tsx', code);
    console.log('Injected getArtifactDownloadId.');
} else {
    console.log('Already injected.');
}
