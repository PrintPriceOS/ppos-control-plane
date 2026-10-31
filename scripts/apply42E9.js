const fs = require('fs');

// 1. Update src/api/middleware/auth.js
let authCode = fs.readFileSync('src/api/middleware/auth.js', 'utf8');
const ticketLogic = `    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        if (req.query.ticket) {
            try {
                const decoded = jwt.verify(req.query.ticket, JWT_SECRET, {
                    audience: JWT_AUDIENCE,
                    issuer: JWT_ISSUER
                });
                req.user = {
                    id: decoded.sub,
                    email: decoded.email,
                    role: (decoded.role || 'VIEWER').toUpperCase(),
                    tenantId: decoded.tenant_id,
                    printhouseId: decoded.printhouse_id,
                    scopes: decoded.scopes || [],
                    authMode: 'JWT_TICKET',
                    issuedAt: decoded.iat,
                    expiresAt: decoded.exp
                };
                return next();
            } catch (err) {
                return fail(req, res, 'Invalid or expired download ticket');
            }
        }
        return fail(req, res, 'Bearer token required');
    }`;

if (!authCode.includes('req.query.ticket')) {
    authCode = authCode.replace(`    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return fail(req, res, 'Bearer token required');
    }`, ticketLogic);
    fs.writeFileSync('src/api/middleware/auth.js', authCode);
    console.log('Updated auth.js to support JWT tickets.');
}

// 2. Update src/api/routes/adminPreflightJobs.js
let jobsCode = fs.readFileSync('src/api/routes/adminPreflightJobs.js', 'utf8');

// Add Ticket route
const ticketRoute = `
// --- 7a. POST /api/admin/preflight/jobs/:jobId/artifacts/:artifactId/download-ticket ---
router.post('/jobs/:jobId/artifacts/:artifactId/download-ticket', async (req, res) => {
    const context = buildGatewayContext(req);
    const { jobId, artifactId } = req.params;

    try {
        const expiresInSec = 60;
        const payload = {
            sub: req.user.id,
            email: req.user.email,
            role: req.user.role,
            tenant_id: req.user.tenantId,
            printhouse_id: req.user.printhouseId,
            scopes: req.user.scopes
        };

        const ticket = require('jsonwebtoken').sign(payload, process.env.JWT_SECRET, {
            audience: process.env.JWT_AUDIENCE || 'ppos:control',
            issuer: process.env.JWT_ISSUER || 'https://auth.printprice.pro',
            expiresIn: expiresInSec
        });

        console.log('[CONTROL][PREFLIGHT][DOWNLOAD-TICKET-CREATED]', { jobId, artifactId, expiresInSec });

        return res.json({
            ok: true,
            download_url: \`/api/admin/preflight/jobs/\${encodeURIComponent(jobId)}/artifacts/\${encodeURIComponent(artifactId)}?ticket=\${encodeURIComponent(ticket)}\`
        });
    } catch (err) {
        return res.status(500).json({ ok: false, error: 'Failed to generate ticket' });
    }
});

router.get('/jobs/:jobId/artifacts/:artifactId', async (req, res) => {`;

if (!jobsCode.includes('/download-ticket')) {
    jobsCode = jobsCode.replace(`router.get('/jobs/:jobId/artifacts/:artifactId', async (req, res) => {`, ticketRoute);
    console.log('Added download-ticket route.');
}

// Update GET /jobs/:jobId payload return
const getJobReturnOld = /res\.json\(\{\s*ok: true,\s*jobId,\s*status: mappedStatus,\s*source_status: sourceStatus,/;
const getJobReturnNew = `
        if (sourceStatus === 'LIVE_UPSTREAM') {
            console.log('[CONTROL][PREFLIGHT][STATUS-HYDRATED]', {
                jobId,
                registryStatus: localRecord?.status || 'UNKNOWN',
                upstreamStatus: currentStatus,
                displayStatus: mappedStatus,
                source: 'LIVE_UPSTREAM'
            });
        }
        res.json({
            ok: true,
            jobId,
            status: mappedStatus,
            display_status: mappedStatus,
            upstream_status: currentStatus,
            registry_status: localRecord?.status || 'UNKNOWN',
            status_source: sourceStatus,
            source_status: sourceStatus,`;

if (jobsCode.match(getJobReturnOld)) {
    jobsCode = jobsCode.replace(getJobReturnOld, getJobReturnNew);
    console.log('Updated GET /jobs/:jobId return.');
}

// Ensure TICKET-USED logging in download route
const downloadLogOld = /console\.log\(\`\[CONTROL\]\[PREFLIGHT\]\[ARTIFACT-DOWNLOAD-RESOLVE-START\]/;
const downloadLogNew = `if (req.query.ticket) {
        console.log('[CONTROL][PREFLIGHT][DOWNLOAD-TICKET-USED]', { jobId, artifactId });
    }
    console.log(\`[CONTROL][PREFLIGHT][ARTIFACT-DOWNLOAD-RESOLVE-START]`;

if (jobsCode.match(downloadLogOld) && !jobsCode.includes('DOWNLOAD-TICKET-USED')) {
    jobsCode = jobsCode.replace(downloadLogOld, downloadLogNew);
    console.log('Updated DOWNLOAD-TICKET-USED log.');
}

fs.writeFileSync('src/api/routes/adminPreflightJobs.js', jobsCode);

// 3. Update PreflightJobDetailPage.tsx
let uiCode = fs.readFileSync('src/ui/pages/preflight/PreflightJobDetailPage.tsx', 'utf8');

const newUiHandler = `async function triggerArtifactDownload(artifact: any) {
  const artifactId = getArtifactDownloadId(artifact);

  if (!artifactId) {
    alert('Artifact has no valid download identifier.');
    return;
  }

  try {
    const ticketUrl = \`/api/admin/preflight/jobs/\${encodeURIComponent(jobId!)}/artifacts/\${encodeURIComponent(artifactId)}/download-ticket\`;
    const token = localStorage.getItem('ppos_control_token') || localStorage.getItem('admin_token') || '';
    const res = await fetch(ticketUrl, { 
        method: 'POST',
        headers: token ? { 'Authorization': \`Bearer \${token}\` } : {} 
    });

    if (!res.ok) {
        throw new Error('Could not request secure download ticket');
    }

    const { download_url } = await res.json();

    const a = document.createElement('a');
    a.href = download_url;
    a.download = artifact.filename || 'artifact.pdf';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch (err: any) {
    alert(\`Download failed: \${err.message}\`);
  }
}`;

const oldUiHandlerRegex = /function triggerArtifactDownload\(artifact: any\) \{[\s\S]*?a\.remove\(\);\s+\}/;

if (oldUiHandlerRegex.test(uiCode)) {
    uiCode = uiCode.replace(oldUiHandlerRegex, newUiHandler);
    console.log('Updated UI handler to use download-ticket');
} else {
    console.log('Could not find triggerArtifactDownload in UI to replace.');
}

fs.writeFileSync('src/ui/pages/preflight/PreflightJobDetailPage.tsx', uiCode);
