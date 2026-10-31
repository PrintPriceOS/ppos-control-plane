/**
 * src/api/services/marketplacePreflightBindingService.js
 * 
 * Implements Phase 36.4: Preflight Binding from Uploaded Marketplace Files.
 * Resolves logical BPE storage paths to physical files, validates PDF headers,
 * sends them to the preflight contract gateway, registers the jobs, and binds them to files.
 */

const fs = require('fs');
const path = require('path');
const mysqlClient = require('./mysqlClient');
const preflightContractGateway = require('./preflightContractGateway');
const marketplaceOrderService = require('./marketplaceOrderService');
const logger = require('./logger').child('preflight-binding-service');

// Helper: Safe JSON parsing
function safeParseJson(str, fallback = {}) {
    if (!str) return fallback;
    if (typeof str !== 'string') return str;
    try {
        return JSON.parse(str);
    } catch (e) {
        return fallback;
    }
}

/**
 * Resolves the physical file path and loads it into a buffer.
 * First checks if the path is an absolute path within allowed roots.
 * If not, extracts the production file ID (pf_*) and checks production_files DB table.
 * Falls back to BPE physical filesystem candidate paths.
 */
async function resolveFileBuffer(file) {
    const storagePath = file.storage_path;
    if (!storagePath) {
        return { buffer: null, resolver: null, pathUsed: null, error: 'FILE_STORAGE_UNRESOLVED' };
    }

    const allowedRoots = [];
    if (process.env.BPE_PRODUCTION_FILES_ROOT) allowedRoots.push(process.env.BPE_PRODUCTION_FILES_ROOT);
    if (process.env.BUDGET_PRODUCTION_FILES_ROOT) allowedRoots.push(process.env.BUDGET_PRODUCTION_FILES_ROOT);
    
    // Canonical default roots
    allowedRoots.push('/var/www/vhosts/printprice.pro/budget.printprice.pro/server/storage/production-files');
    allowedRoots.push(path.resolve(__dirname, '../../../storage/production_files'));
    
    // Support local test folder if it exists in scratch or local environment
    const workspaceRoot = path.resolve(__dirname, '../../..');
    allowedRoots.push(path.join(workspaceRoot, 'storage/production_files'));
    allowedRoots.push(path.join(workspaceRoot, 'storage/production-files'));
    allowedRoots.push(path.join(workspaceRoot, 'scratch'));

    const cleanRoots = [...new Set(allowedRoots)].map(r => path.resolve(r));

    const isAbsolute = storagePath.startsWith('/') || path.isAbsolute(storagePath);
    if (isAbsolute) {
        const resolvedPath = path.resolve(storagePath);
        // Normalize for cross-platform checking
        const normFile = resolvedPath.replace(/\\/g, '/').toLowerCase();
        const isWithin = cleanRoots.some(root => {
            const normRoot = root.replace(/\\/g, '/').toLowerCase();
            return normFile.startsWith(normRoot);
        });

        if (isWithin && fs.existsSync(resolvedPath)) {
            try {
                const buffer = await fs.promises.readFile(resolvedPath);
                return { buffer, resolver: 'bpe_filesystem', pathUsed: resolvedPath };
            } catch (err) {
                logger.warn({ event: 'FILE_READ_FAILED', path: resolvedPath, error: err.message });
            }
        }
    }

    // Extract production file ID
    const match = storagePath.match(/(pf_[a-zA-Z0-9_]+)/);
    const productionFileId = match ? match[1] : null;

    if (productionFileId) {
        // Option A: Try ControlPlane production_files first
        try {
            const cpRows = await mysqlClient.query(
                'SELECT * FROM production_files WHERE id = ?',
                [productionFileId]
            );
            if (cpRows && cpRows.length > 0) {
                const cpFile = cpRows[0];
                if (cpFile.storage_url) {
                    const cpPath = path.resolve(__dirname, '../../../storage/production_files', cpFile.storage_url);
                    if (fs.existsSync(cpPath)) {
                        const buffer = await fs.promises.readFile(cpPath);
                        return { buffer, resolver: 'production_files', pathUsed: cpPath, productionFileId };
                    }
                }
            }
        } catch (dbErr) {
            logger.warn({ event: 'PRODUCTION_FILES_QUERY_FAILED', productionFileId, error: dbErr.message });
        }

        // Option B: Fallback to BPE physical filesystem candidate paths
        const rootsToCheck = [
            process.env.BPE_PRODUCTION_FILES_ROOT,
            process.env.BUDGET_PRODUCTION_FILES_ROOT,
            '/var/www/vhosts/printprice.pro/budget.printprice.pro/server/storage/production-files',
            path.resolve(__dirname, '../../../storage/production_files'),
            path.join(workspaceRoot, 'storage/production-files'),
            path.join(workspaceRoot, 'storage/production_files'),
            path.join(workspaceRoot, 'scratch')
        ].filter(Boolean);

        for (const root of [...new Set(rootsToCheck)]) {
            const bpePath = path.resolve(root, `${productionFileId}.pdf`);
            if (fs.existsSync(bpePath)) {
                try {
                    const buffer = await fs.promises.readFile(bpePath);
                    return { buffer, resolver: 'bpe_filesystem', pathUsed: bpePath, productionFileId };
                } catch (err) {
                    logger.warn({ event: 'BPE_FILE_READ_FAILED', path: bpePath, error: err.message });
                }
            }
        }
    }

    return { buffer: null, resolver: null, pathUsed: null, error: 'FILE_STORAGE_UNRESOLVED' };
}

/**
 * Main service orchestrating resolving, analyzing, registering, binding, and recomputing order.
 */
async function bindPreflightFromMarketplaceFiles(orderId, options = {}) {
    logger.info({ event: 'BIND_PREFLIGHT_FROM_MARKETPLACE_FILES_START', orderId });

    // 1. Retrieve the order
    const orders = await mysqlClient.query('SELECT * FROM marketplace_orders WHERE order_id = ?', [orderId]);
    if (!orders || orders.length === 0) {
        throw new Error('ORDER_NOT_FOUND');
    }
    const order = orders[0];

    // 2. Retrieve all files registered for the order
    const files = await mysqlClient.query('SELECT * FROM marketplace_order_files WHERE order_id = ?', [orderId]);
    
    const results = [];

    for (const file of files) {
        // Idempotency: Skip already bound files
        if (file.preflight_job_id) {
            results.push({
                fileId: file.file_id,
                role: file.role,
                resolved: true,
                skipped: true,
                reason: 'already_bound',
                storageResolver: file.metadata_json ? (safeParseJson(file.metadata_json).storage_resolver || null) : null,
                sourcePathUsed: file.metadata_json ? (safeParseJson(file.metadata_json).source_path_used || null) : null,
                error: null,
                preflightJobId: file.preflight_job_id,
                preflightStatus: file.preflight_status,
                outcomeCategory: file.preflight_outcome_category
            });
            continue;
        }

        // Skip files that are not uploaded yet
        if (file.status !== 'UPLOADED') {
            results.push({
                fileId: file.file_id,
                role: file.role,
                resolved: false,
                error: 'FILE_NOT_UPLOADED',
                message: `File status is '${file.status}' instead of 'UPLOADED'`
            });
            continue;
        }

        // 3. Resolve file buffer
        const resolved = await module.exports.resolveFileBuffer(file);
        if (resolved.error) {
            results.push({
                fileId: file.file_id,
                role: file.role,
                resolved: false,
                error: 'FILE_STORAGE_UNRESOLVED',
                message: 'Could not resolve physical file storage'
            });
            continue;
        }

        const { buffer, resolver, pathUsed, productionFileId } = resolved;

        // 4. Validate PDF header
        if (!buffer || buffer.length < 4 || buffer.slice(0, 4).toString('utf-8') !== '%PDF') {
            results.push({
                fileId: file.file_id,
                role: file.role,
                resolved: false,
                error: 'FILE_STORAGE_UNRESOLVED',
                message: 'Physical file signature does not start with %PDF'
            });
            continue;
        }

        // 5. Build Upstream Request context
        const traceId = options.traceId || `trace_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        const requestId = options.requestId || `req_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        
        const context = {
            tenantId: order.tenant_id || 'marketplace',
            printhouseId: order.printhouse_id || order.selected_printhouse_id || '',
            operatorId: options.operatorId || 'control-plane',
            type: 'ANALYZE',
            policy: options.policy || process.env.PREFLIGHT_DEFAULT_POLICY || 'OFFSET_MODERN_COATED',
            traceId,
            requestId
        };

        // 6. Submit to Preflight Service via Gateway
        let jobResponse;
        try {
            jobResponse = await preflightContractGateway.createJob(buffer, file.original_name, context);
        } catch (gateErr) {
            logger.error({ event: 'PREFLIGHT_SUBMISSION_ERROR', fileId: file.file_id, error: gateErr.message });
            results.push({
                fileId: file.file_id,
                role: file.role,
                resolved: true,
                storageResolver: resolver,
                sourcePathUsed: pathUsed,
                error: 'PREFLIGHT_SUBMISSION_FAILED',
                message: gateErr.message
            });
            continue;
        }

        // 7. Extract Job ID robustly
        const jobId = jobResponse.jobId || 
                      jobResponse.id || 
                      (jobResponse.job && jobResponse.job.id) || 
                      (jobResponse.data && jobResponse.data.jobId);
        
        if (!jobId) {
            results.push({
                fileId: file.file_id,
                role: file.role,
                resolved: true,
                storageResolver: resolver,
                sourcePathUsed: pathUsed,
                error: 'PREFLIGHT_JOB_ID_MISSING',
                message: 'Upstream preflight response did not contain a valid job ID'
            });
            continue;
        }

        // 8. Normalize status
        let normalizedStatus = 'PENDING';
        if (jobResponse.status) {
            normalizedStatus = jobResponse.status.toUpperCase();
        } else if (jobResponse.job && jobResponse.job.status) {
            normalizedStatus = jobResponse.job.status.toUpperCase();
        } else if (jobResponse.data && jobResponse.data.status) {
            normalizedStatus = jobResponse.data.status.toUpperCase();
        }
        
        if (['SUCCESS', 'SUCCEEDED', 'PASSED'].includes(normalizedStatus)) {
            normalizedStatus = 'COMPLETED';
        } else if (['ERROR'].includes(normalizedStatus)) {
            normalizedStatus = 'FAILED';
        }

        const outcomeCategory = jobResponse.outcomeCategory || 
                                jobResponse.outcome_category || 
                                jobResponse.risk_level || 
                                (normalizedStatus === 'COMPLETED' ? 'COMPLETED' : 'PENDING');

        // 9. Register Job locally
        try {
            await mysqlClient.query(`
                INSERT INTO preflight_job_registry 
                (job_id, tenant_id, printhouse_id, operator_id, status, policy, type, progress, file_size_bytes, original_filename, canonical_payload_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE 
                status = VALUES(status), canonical_payload_json = VALUES(canonical_payload_json), updated_at = NOW()
            `, [
                jobId,
                context.tenantId,
                context.printhouseId,
                context.operatorId,
                normalizedStatus,
                context.policy,
                context.type,
                normalizedStatus === 'COMPLETED' ? 100 : 10,
                buffer.length,
                file.original_name || 'document.pdf',
                JSON.stringify(jobResponse)
            ]);
        } catch (regErr) {
            logger.error({ event: 'JOB_REGISTRY_SAVE_FAILED', jobId, error: regErr.message });
        }

        // 10. Bind via existing bindPreflightJob
        try {
            await marketplaceOrderService.bindPreflightJob(orderId, file.file_id, jobId);
        } catch (bindErr) {
            logger.error({ event: 'BIND_PREFLIGHT_JOB_METHOD_FAILED', fileId: file.file_id, jobId, error: bindErr.message });
            results.push({
                fileId: file.file_id,
                role: file.role,
                resolved: true,
                storageResolver: resolver,
                sourcePathUsed: pathUsed,
                error: 'PREFLIGHT_BINDING_FAILED',
                message: bindErr.message,
                preflightJobId: jobId
            });
            continue;
        }

        // 11. Update file metadata with details required by Phase 36.4
        try {
            const fileRows = await mysqlClient.query(
                'SELECT metadata_json FROM marketplace_order_files WHERE file_id = ?',
                [file.file_id]
            );
            let existingMetadata = {};
            if (fileRows && fileRows.length > 0 && fileRows[0].metadata_json) {
                existingMetadata = safeParseJson(fileRows[0].metadata_json);
            }

            const mergedMetadata = {
                ...existingMetadata,
                phase: '36.4',
                storage_resolver: resolver,
                production_file_id: productionFileId || null,
                source_path_used: pathUsed,
                traceId,
                bound_at: new Date().toISOString(),
                preflight_response_summary: {
                    jobId,
                    status: normalizedStatus,
                    outcomeCategory
                }
            };

            await mysqlClient.query(
                'UPDATE marketplace_order_files SET metadata_json = ? WHERE file_id = ?',
                [JSON.stringify(mergedMetadata), file.file_id]
            );
        } catch (metaErr) {
            logger.warn({ event: 'FILE_METADATA_UPDATE_FAILED', fileId: file.file_id, error: metaErr.message });
        }

        results.push({
            fileId: file.file_id,
            role: file.role,
            resolved: true,
            storageResolver: resolver,
            sourcePathUsed: pathUsed,
            error: null,
            preflightJobId: jobId,
            preflightStatus: normalizedStatus,
            outcomeCategory
        });
    }

    // 12. Final computeReadiness
    const finalReadiness = await marketplaceOrderService.computeReadiness(orderId);

    return {
        ok: true,
        orderId,
        results,
        readiness: finalReadiness
    };
}

module.exports = {
    bindPreflightFromMarketplaceFiles,
    resolveFileBuffer
};
