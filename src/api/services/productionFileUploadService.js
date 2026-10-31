/**
 * src/api/services/productionFileUploadService.js
 * 
 * Industrial Upload Engine for PrintPrice Pro v5.3.
 * Manages direct PDF uploads with forensic validation and integrity checks.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('./mysqlClient');
const logger = require('./logger').child('upload-service');

class ProductionFileUploadService {
    constructor() {
        this.storageRoot = path.join(__dirname, '../../../storage/production_files');
    }

    /**
     * Handle forensic upload of a production PDF.
     */
    async handleUpload(orderRef, kind, fileBuffer, originalName) {
        logger.info({ event: 'upload_received', order_ref: orderRef, kind });

        // 1. Validate Order Existence
        const { rows: [order] } = await db.query('SELECT * FROM orders WHERE order_ref = ?', [orderRef]);
        if (!order) throw new Error(`Order not found: ${orderRef}`);

        // 2. Validate PDF Magic Bytes (%PDF-)
        const magic = fileBuffer.slice(0, 4).toString();
        if (magic !== '%PDF') {
            throw new Error('Invalid file format: Not a PDF (Magic bytes mismatch)');
        }

        // 3. Find or Create Repository
        let { rows: [repo] } = await db.query('SELECT * FROM production_file_repositories WHERE order_ref = ?', [orderRef]);
        if (!repo) {
            const repoId = crypto.randomUUID();
            await db.query(`
                INSERT INTO production_file_repositories (id, order_id, order_ref, user_id, status)
                VALUES (?, ?, ?, ?, 'ACTIVE')
            `, [repoId, order.id, orderRef, order.user_id]);
            repo = { id: repoId };
        }

        // 4. Deterministic Storage Mapping
        const relativePath = path.join(orderRef, kind, originalName);
        const absolutePath = path.join(this.storageRoot, relativePath);
        
        fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
        fs.writeFileSync(absolutePath, fileBuffer);

        // 5. Integrity Check (SHA-256)
        const checksum = crypto.createHash('sha256').update(fileBuffer).digest('hex');
        const size = fileBuffer.length;

        // 6. Upsert Production File Record
        const { rows: [existing] } = await db.query(
            'SELECT id FROM production_files WHERE order_ref = ? AND kind = ?',
            [orderRef, kind]
        );

        let fileId = existing?.id;
        if (fileId) {
            await db.query(`
                UPDATE production_files 
                SET ingestion_status = 'UPLOADED',
                    storage_url = ?,
                    size_bytes = ?,
                    mime_type = 'application/pdf',
                    checksum = ?,
                    original_filename = ?,
                    source_type = 'UPLOAD',
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `, [relativePath, size, checksum, originalName, fileId]);
        } else {
            fileId = crypto.randomUUID();
            await db.query(`
                INSERT INTO production_files (
                    id, order_id, order_ref, repository_id, kind, source_type,
                    original_filename, storage_url, size_bytes, mime_type, checksum, ingestion_status
                ) VALUES (?, ?, ?, ?, ?, 'UPLOAD', ?, ?, ?, 'application/pdf', ?, 'UPLOADED')
            `, [fileId, order.id, orderRef, repo.id, kind, originalName, relativePath, size, checksum]);
        }

        // 7. Forensic Audit
        await this.logEvent(fileId, order.id, orderRef, 'FILE_UPLOADED', { 
            originalName, size, checksum, path: relativePath 
        });

        return {
            file_id: fileId,
            repository_id: repo.id,
            repository_path: relativePath,
            checksum,
            status: 'UPLOADED'
        };
    }

    async logEvent(fileId, orderId, orderRef, type, payload = {}) {
        await db.query(`
            INSERT INTO production_file_events (production_file_id, order_id, order_ref, event_type, event_payload)
            VALUES (?, ?, ?, ?, ?)
        `, [fileId, orderId, orderRef, type, JSON.stringify(payload)]);
    }
}

module.exports = new ProductionFileUploadService();
