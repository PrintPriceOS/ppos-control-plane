/**
 * src/api/services/productionFileIngestionService.js
 * 
 * Industrial Ingestion Engine for PrintPrice Pro v5.3.
 * Securely fetches remote production assets (DOWNLOAD_URL) with SSRF protection.
 */
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const dns = require('dns').promises;
const db = require('./mysqlClient');
const logger = require('./logger').child('ingestion-service');

class ProductionFileIngestionService {
    constructor() {
        this.storageRoot = path.join(__dirname, '../../../storage/production_files');
        this.timeout = 30000; // 30s
    }

    /**
     * SSRF-Safe URL Validation.
     * Blocks private ranges, loopback, and non-HTTPS protocols.
     */
    async validateUrl(urlString) {
        const url = new URL(urlString);
        
        if (url.protocol !== 'https:') {
            throw new Error('Insecure protocol: HTTPS required');
        }

        const hostname = url.hostname;
        
        try {
            const addresses = await dns.resolve4(hostname);
            for (const ip of addresses) {
                if (this.isPrivateIp(ip)) {
                    throw new Error(`SSRF Block: Private IP range detected (${ip})`);
                }
            }
        } catch (dnsErr) {
            // If DNS resolution fails, we block it to be safe (or handle as host not found)
            throw new Error(`DNS Resolution failed for ${hostname}: ${dnsErr.message}`);
        }

        return true;
    }

    isPrivateIp(ip) {
        const parts = ip.split('.').map(Number);
        return (
            parts[0] === 127 ||
            parts[0] === 10 ||
            (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
            (parts[0] === 192 && parts[1] === 168) ||
            (parts[0] === 169 && parts[1] === 254)
        );
    }

    /**
     * Process all pending remote ingestions.
     */
    async processPendingIngestions() {
        logger.info({ event: 'ingestion_cycle_start' });
        
        const files = await db.query(`
            SELECT f.* 
            FROM production_files f
            WHERE f.source_type = 'DOWNLOAD_URL' 
            AND f.ingestion_status IN ('DECLARED', 'QUEUED')
            LIMIT 10
        `);

        for (const file of files) {
            try {
                await this.ingestFile(file);
            } catch (err) {
                logger.error({ event: 'ingestion_failed', file_id: file.id, error: err.message });
            }
        }

        return files.length;
    }

    /**
     * Ingest a single remote asset.
     */
    async ingestFile(file) {
        const { id, order_ref, kind, download_url } = file;
        
        logger.info({ event: 'ingestion_started', file_id: id, url: download_url });
        await this.logEvent(id, order_ref, 'FILE_FETCH_STARTED', { url: download_url });

        // Resolve tenant ID
        let tenantId = null;
        try {
            const orderRows = await db.query(
                'SELECT tenant_id FROM marketplace_orders WHERE order_id = ? OR order_id = (SELECT order_id FROM production_files WHERE id = ?)',
                [file.order_id || order_ref, file.id]
            );
            if (orderRows && orderRows.length > 0) {
                tenantId = orderRows[0].tenant_id;
            }
        } catch (dbErr) {
            logger.warn({ event: 'ingest_resolve_tenant_error', file_id: id, error: dbErr.message });
        }

        let maxFileSize = parseInt(process.env.PPOS_PRODUCTION_FILE_INFRA_MAX_MB || '5120') * 1024 * 1024;
        if (tenantId) {
            try {
                const governanceService = require('./tenantPlanGovernanceService');
                const entitlements = await governanceService.getTenantEntitlements(tenantId);
                const limitMb = entitlements.limits?.maxFileSizeMb || 500;
                maxFileSize = limitMb * 1024 * 1024;
            } catch (govErr) {
                logger.warn({ event: 'ingest_get_limits_error', tenantId, error: govErr.message });
            }
        } else {
            logger.warn({ event: 'ingest_tenant_missing', file_id: id, message: 'Tenant context missing for file ingestion, falling back to infra safety ceiling' });
        }

        try {
            await this.validateUrl(download_url);

            let currentUrl = download_url;
            let response;
            let redirectCount = 0;
            const maxRedirects = 5;

            while (redirectCount < maxRedirects) {
                response = await axios({
                    method: 'get',
                    url: currentUrl,
                    responseType: 'stream',
                    timeout: this.timeout,
                    maxContentLength: maxFileSize,
                    maxRedirects: 0, // Disable automatic redirects
                    validateStatus: (status) => (status >= 200 && status < 300) || (status >= 301 && status <= 308)
                });

                if (response.status >= 301 && response.status <= 308) {
                    const redirectUrl = response.headers.location;
                    if (!redirectUrl) throw new Error('Redirect without location header');
                    
                    // Resolve relative URLs
                    const resolvedUrl = new URL(redirectUrl, currentUrl).toString();
                    await this.validateUrl(resolvedUrl);
                    currentUrl = resolvedUrl;
                    redirectCount++;
                    continue;
                }
                break;
            }

            if (redirectCount >= maxRedirects) {
                throw new Error('Too many redirects');
            }

            // Validate Content-Type
            const contentType = response.headers['content-type'];
            if (!contentType || !contentType.includes('pdf')) {
                throw new Error(`Invalid content type: ${contentType}`);
            }

            // Check Content-Length if available
            const contentLength = parseInt(response.headers['content-length'] || '0');
            if (contentLength && contentLength > maxFileSize) {
                throw new Error(`File size (${(contentLength / 1024 / 1024).toFixed(2)} MB) exceeds allowed limit of ${(maxFileSize / 1024 / 1024).toFixed(2)} MB`);
            }

            // Prepare Storage Path
            const urlPath = new URL(download_url).pathname;
            const fileName = path.basename(urlPath) || `${kind.toLowerCase()}.pdf`;
            const relativePath = path.join(order_ref, kind, fileName);
            const absolutePath = path.join(this.storageRoot, relativePath);
            
            fs.mkdirSync(path.dirname(absolutePath), { recursive: true });

            // Stream Download & Compute Hash
            const writer = fs.createWriteStream(absolutePath);
            const hash = crypto.createHash('sha256');
            let size = 0;

            return new Promise((resolve, reject) => {
                response.data.on('data', (chunk) => {
                    size += chunk.length;
                    if (size > maxFileSize) {
                        writer.destroy();
                        reject(new Error('File size limit exceeded during stream'));
                    }
                    hash.update(chunk);
                });

                response.data.pipe(writer);

                writer.on('finish', async () => {
                    const checksum = hash.digest('hex');
                    
                    await db.query(`
                        UPDATE production_files 
                        SET ingestion_status = 'FETCHED',
                            storage_url = ?,
                            size_bytes = ?,
                            mime_type = ?,
                            checksum = ?,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = ?
                    `, [relativePath, size, contentType, checksum, id]);

                    await this.logEvent(id, order_ref, 'FILE_FETCHED', { size, checksum, path: relativePath });
                    logger.info({ event: 'ingestion_success', file_id: id, size });
                    resolve();
                });

                writer.on('error', (err) => {
                    writer.destroy();
                    reject(err);
                });
            });

        } catch (err) {
            await db.query(`
                UPDATE production_files 
                SET ingestion_status = 'FAILED',
                    validation_status = 'ERROR',
                    error_message = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `, [err.message, id]);

            await this.logEvent(id, order_ref, 'FILE_FETCH_FAILED', { error: err.message });
            throw err;
        }
    }

    async logEvent(fileId, orderRef, type, payload = {}) {
        await db.query(`
            INSERT INTO production_file_events (production_file_id, order_id, order_ref, event_type, event_payload)
            SELECT ?, order_id, ?, ?, ? FROM production_files WHERE id = ?
        `, [fileId, orderRef, type, JSON.stringify(payload), fileId]);
    }
}

module.exports = new ProductionFileIngestionService();
