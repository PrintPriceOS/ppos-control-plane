const fs = require('fs');
let code = fs.readFileSync('src/ui/pages/preflight/PreflightJobDetailPage.tsx', 'utf8');

const newHandler = `async function handleDownloadArtifact(artifact: any) {
  const artifactId = getArtifactDownloadId(artifact);

  if (!artifactId) {
    alert('Artifact has no valid download identifier.');
    return;
  }

  console.debug('[PREFLIGHT-UI][DOWNLOAD_ARTIFACT]', {
    jobId,
    artifactId,
    artifactType: artifact?.type,
    filename: artifact?.filename
  });

  try {
    const url = \`/api/admin/preflight/jobs/\${encodeURIComponent(jobId!)}/artifacts/\${encodeURIComponent(artifactId)}\`;
    const token = localStorage.getItem('ppos_control_token') || localStorage.getItem('admin_token') || '';
    const response = await fetch(url, { headers: token ? { 'Authorization': \`Bearer \${token}\` } : {} });
    
    if (!response.ok) {
      let message = 'Requested artifact could not be found.';
      try {
        const payload = await response.json();
        message = payload.message || payload.error || message;
      } catch {}
      throw new Error(message);
    }

    const blob = await response.blob();
    if (!blob || blob.size === 0) {
      throw new Error('Downloaded artifact is empty.');
    }

    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = artifact?.filename || 'artifact.pdf';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
  } catch (err: any) {
      alert(\`Direct download error: \${err.message || 'File stream unavailable'}\`);
  }
}
`;

const oldRegex = /const handleDirectDownload = async \(artifactId: string, filename\?: string\) => \{[\s\S]*?alert\(`Direct download error: \$\{err\.message \|\| 'File stream unavailable'\}`\);\s+\}\s+\};/;

if (oldRegex.test(code)) {
    code = code.replace(oldRegex, newHandler);
    console.log('Replaced old handleDirectDownload implementation.');
} else {
    // If it was already replaced with a different variant, try to replace handleDownloadArtifact
    const alternateRegex = /const handleDirectDownload = async \(artifact: any\) => \{[\s\S]*?setActionStatus\('error'\);\s+\}\s+\};/;
    if (alternateRegex.test(code)) {
        code = code.replace(alternateRegex, newHandler);
        console.log('Replaced alternate handleDirectDownload implementation.');
    } else {
        console.log('Could not find download handler to replace. Searching for signature...');
    }
}

code = code.replace(/onClick=\{\(\)\s*=>\s*handleDirectDownload\(primaryItem\)\}/g, 'onClick={() => handleDownloadArtifact(primaryItem)}');
code = code.replace(/onClick=\{\(\)\s*=>\s*handleDirectDownload\(a\)\}/g, 'onClick={() => handleDownloadArtifact(a)}');

code = code.replace(/onClick=\{\(\)\s*=>\s*handleDirectDownload\(primaryItem\.download_id \|\| primaryItem\.alias \|\| primaryItem\.id, primaryItem\.filename\)\}/g, 'onClick={() => handleDownloadArtifact(primaryItem)}');
code = code.replace(/onClick=\{\(\)\s*=>\s*handleDirectDownload\(a\.download_id \|\| a\.alias \|\| a\.id, a\.filename\)\}/g, 'onClick={() => handleDownloadArtifact(a)}');

fs.writeFileSync('src/ui/pages/preflight/PreflightJobDetailPage.tsx', code);
