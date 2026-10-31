const fs = require('fs');
let code = fs.readFileSync('src/ui/pages/preflight/PreflightJobDetailPage.tsx', 'utf8');

const newHandler = `function triggerArtifactDownload(artifact: any) {
  const artifactId = getArtifactDownloadId(artifact);

  if (!artifactId) {
    alert('Artifact has no valid download identifier.');
    return;
  }

  const url =
    artifact.download_url ||
    \`/api/admin/preflight/jobs/\${encodeURIComponent(jobId!)}/artifacts/\${encodeURIComponent(artifactId)}\`;

  const a = document.createElement('a');
  a.href = url;
  a.download = artifact.filename || 'artifact.pdf';
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
`;

const oldRegex = /async function handleDownloadArtifact\(artifact: any\) \{[\s\S]*?URL\.revokeObjectURL\(objectUrl\);\s+\} catch \(err: any\) \{\s+alert\(`Direct download error: \$\{err\.message \|\| 'File stream unavailable'\}`\);\s+\}\s+\}\n/;

if (oldRegex.test(code)) {
    code = code.replace(oldRegex, newHandler);
    console.log('Replaced handleDownloadArtifact with triggerArtifactDownload.');
} else {
    console.log('Could not find handleDownloadArtifact to replace.');
}

// Replace the click handlers
code = code.replace(/onClick=\{\(\)\s*=>\s*handleDownloadArtifact\(primaryItem\)\}/g, 'onClick={() => triggerArtifactDownload(primaryItem)}');
code = code.replace(/onClick=\{\(\)\s*=>\s*handleDownloadArtifact\(a\)\}/g, 'onClick={() => triggerArtifactDownload(a)}');

fs.writeFileSync('src/ui/pages/preflight/PreflightJobDetailPage.tsx', code);
