const fs = require('fs');
let code = fs.readFileSync('src/ui/pages/preflight/PreflightJobDetailPage.tsx', 'utf8');

// 1. Add ChevronDownIcon
code = code.replace(
  'WrenchScrewdriverIcon\n} from "@heroicons/react/24/outline";',
  'WrenchScrewdriverIcon,\n  ChevronDownIcon\n} from "@heroicons/react/24/outline";'
);

// 2. Update handleDirectDownload
const oldHandlerRegex = /const handleDirectDownload = async \(artifactId: string, filename\?: string\) => \{[\s\S]*?window\.URL\.revokeObjectURL\(url\);\s+\} catch \(err: any\) \{\s+console\.error\('\[DETAIL-ACTION\] Direct download error:', err\);\s+setActionError\(err\.message \|\| "Browser download failed\. Please retry or open the artifact in a new tab\."\);\s+setActionStatus\('error'\);\s+\}\s+\};/;

const newHandler = `const handleDirectDownload = async (artifact: any) => {
    try {
      const artifactId = artifact.download_id || artifact.alias || artifact.id;
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

code = code.replace(oldHandlerRegex, newHandler);

// 3. Update onClick handlers
code = code.replace(
  /onClick=\{\(\) => handleDirectDownload\(primaryItem\.download_id \|\| primaryItem\.alias \|\| primaryItem\.id, primaryItem\.filename\)\}/g,
  'onClick={() => handleDirectDownload(primaryItem)}'
);

code = code.replace(
  /onClick=\{\(\) => handleDirectDownload\(a\.download_id \|\| a\.alias \|\| a\.id, a\.filename\)\}/g,
  'onClick={() => handleDirectDownload(a)}'
);

fs.writeFileSync('src/ui/pages/preflight/PreflightJobDetailPage.tsx', code);
