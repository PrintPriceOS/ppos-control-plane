const fs = require('fs');

// 1. Update PreflightJobDetailPage.tsx
let uiCode = fs.readFileSync('src/ui/pages/preflight/PreflightJobDetailPage.tsx', 'utf8');

const helperCode = `
function getArtifactDownloadId(artifact: any): string | null {
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

// Insert helper before PreflightJobDetailPage function
uiCode = uiCode.replace('export default function PreflightJobDetailPage() {', helperCode + '\nexport default function PreflightJobDetailPage() {');

const oldHandlerRegex = /const handleDirectDownload = async \(artifact: any\) => \{[\s\S]*?window\.URL\.revokeObjectURL\(objectUrl\);\s+\} catch \(err: any\) \{\s+console\.error\('\[DETAIL-ACTION\] Direct download error:', err\);\s+setActionError\(err\.message \|\| "Browser download failed\. Please retry or open the artifact in a new tab\."\);\s+setActionStatus\('error'\);\s+\}\s+\};/;

const newHandler = `const handleDirectDownload = async (artifact: any) => {
    try {
      const artifactId = getArtifactDownloadId(artifact);

      if (!artifactId) {
        setActionError('Artifact has no valid download identifier.');
        setActionStatus('error');
        return;
      }

      console.debug('[PREFLIGHT-UI][DOWNLOAD_ARTIFACT]', {
        jobId,
        artifactId,
        artifactType: artifact?.type,
        filename: artifact?.filename
      });

      const url = artifact.download_url || \`/api/admin/preflight/jobs/\${jobId}/artifacts/\${artifactId}\`;
      const token = localStorage.getItem('ppos_control_token') || localStorage.getItem('admin_token') || '';
      const response = await fetch(url, {
        headers: token ? { 'Authorization': \`Bearer \${token}\` } : {}
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error("Requested artifact could not be found.");
        } else if (response.status === 409) {
          throw new Error("Artifact is not downloadable yet.");
        } else {
          const json = await response.json().catch(() => null);
          throw new Error(json?.message || json?.error || \`Download failed: \${response.statusText}\`);
        }
      }

      const blob = await response.blob();
      if (blob.size === 0) {
        throw new Error("Downloaded artifact is empty.");
      }

      const objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.setAttribute('download', artifact.filename || "artifact.pdf");
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(objectUrl);
    } catch (err: any) {
      console.error('[DETAIL-ACTION] Direct download error:', err);
      setActionError(err.message || "Browser download failed. Please retry or open the artifact in a new tab.");
      setActionStatus('error');
    }
  };`;

uiCode = uiCode.replace(oldHandlerRegex, newHandler);

fs.writeFileSync('src/ui/pages/preflight/PreflightJobDetailPage.tsx', uiCode);

// 2. Update adminApi.ts
let apiCode = fs.readFileSync('src/ui/lib/adminApi.ts', 'utf8');

const oldAdminApiFunc = /export async function downloadAdminPreflightArtifact\(jobId: string, artifactId: string\) \{[\s\S]*?return res\.blob\(\);\s+\}/;

const newAdminApiFunc = `export async function downloadAdminPreflightArtifact(jobId: string, artifactId: string, filename?: string) {
    if (typeof artifactId !== 'string') {
        throw new Error('artifactId must be a string');
    }
    const token = getAuthToken() || localStorage.getItem('ppos_control_token') || localStorage.getItem('admin_token') || '';
    const res = await fetch(\`/api/admin/preflight/jobs/\${encodeURIComponent(jobId)}/artifacts/\${encodeURIComponent(artifactId)}\`, {
        headers: token ? { 'Authorization': \`Bearer \${token}\` } : {}
    });
    if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw { status: res.status, message: \`Download failed: \${res.statusText}\`, ...errorData };
    }
    return res.blob();
}`;

apiCode = apiCode.replace(oldAdminApiFunc, newAdminApiFunc);

fs.writeFileSync('src/ui/lib/adminApi.ts', apiCode);
