/**
 * Manufacturing Bundle Service
 * 
 * Generates downloadable ZIP bundles for Manufacturing Packages.
 */
const archiver = require('archiver');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const persistence = require('./ManufacturingPersistenceService');
const preflightPersistence = require('./preflightPersistenceService');
const storage = require('./preflightStorageService');
const auditLogger = require('./auditLoggerService');
const eventService = require('./ManufacturingEventService');

class ManufacturingBundleService {
  /**
   * Generate a ZIP bundle for a production package
   * @param {string} packageId
   * @param {Object} context { userId, tenantId, role }
   * @returns {Object} { stream, filename }
   */
  async generateBundle(packageId, context) {
    // 1. Fetch Package
    const pkg = await persistence.getPackage(packageId);
    if (!pkg) throw new Error('NOT_FOUND: Manufacturing package not found');

    // 2. RBAC Validation
    const isOwner = pkg.tenant_id === context.tenantId;
    const isAssignedPrinter = pkg.assigned_printer_tenant_id === context.tenantId;
    if (!isOwner && !isAssignedPrinter && context.role !== 'SUPER_ADMIN') {
      throw new Error('FORBIDDEN: Access to this package bundle is restricted');
    }

    // 3. Resolve Artifacts
    const artifactIds = [
      pkg.source_artifact_id,
      pkg.fixed_pdf_artifact_id,
      pkg.certified_pdf_artifact_id
    ].filter(id => !!id);

    const artifactRecords = await Promise.all(
      artifactIds.map(id => preflightPersistence.getArtifact(id))
    );

    // 4. Validate Artifact Ownership (Crucial Hardening)
    for (const record of artifactRecords) {
      if (!record) continue;
      if (record.tenant_id !== pkg.tenant_id) {
        await auditLogger.log({
          type: 'SECURITY_ALERT',
          tenantId: context.tenantId,
          userId: context.userId,
          status: 'FAILURE',
          metadata: { packageId, artifactId: record.id, reason: 'CROSS_TENANT_ARTIFACT_ACCESS_ATTEMPT' }
        });
        throw new Error('FORBIDDEN: Package contains artifacts not owned by the tenant');
      }
    }

    // 5. Initialize Archiver
    const archive = archiver('zip', { zlib: { level: 9 } });
    const checksums = [];

    // 5. Add Artifacts to ZIP
    for (const record of artifactRecords) {
      if (!record) continue;
      
      const physicalPath = storage.resolveStorageKey(record.storage_key);
      if (fs.existsSync(physicalPath)) {
        const zipName = this._getZipNameForArtifact(record.type, record.filename);
        archive.file(physicalPath, { name: zipName });
        
        // Use existing checksum or calculate if missing
        const hash = record.checksum || await this._calculateFileHash(physicalPath);
        checksums.push(`${hash} ${zipName}`);
      }
    }

    // 6. Add Metadata & Specs
    archive.append(JSON.stringify(pkg.book_spec_json, null, 2), { name: 'book-spec.json' });
    archive.append(JSON.stringify(pkg.preflight_report_json, null, 2), { name: 'preflight-report.json' });

    // 7. Add Production Ticket
    const ticket = {
      packageId: pkg.id,
      tenantId: pkg.tenant_id,
      sourceJobId: pkg.source_job_id,
      policyId: pkg.policy_id,
      status: pkg.status,
      generatedAt: new Date().toISOString(),
      generatedBy: context.userId
    };
    archive.append(JSON.stringify(ticket, null, 2), { name: 'production-ticket.json' });

    // 8. Add Audit Log Snapshot
    // Note: In a real system, we'd fetch actual events from a manufacturing_dispatch_events table.
    // For now, we'll provide a placeholder or fetch from audit_logs if available.
    archive.append(JSON.stringify({ note: 'Operational audit log snapshot included in manufacturing package.' }, null, 2), { name: 'audit-log.json' });

    // 9. Add Checksums File
    archive.append(checksums.join('\n'), { name: 'checksums.txt' });

    // Finalize
    archive.finalize();

    await auditLogger.log({
      type: 'BUNDLE_GENERATE',
      tenantId: pkg.tenant_id,
      userId: context.userId,
      status: 'SUCCESS',
      metadata: { packageId, artifactCount: artifactRecords.length }
    });

    await eventService.record({
      tenantId: pkg.tenant_id,
      packageId,
      type: 'BUNDLE_DOWNLOADED',
      actorType: 'USER',
      actorId: context.userId,
      message: `Manufacturing bundle generated for download (ZIP)`,
      metadata: { packageId, artifactCount: artifactRecords.length }
    });

    return {
      stream: archive,
      filename: `manufacturing-bundle-${pkg.id.substring(0, 8)}.zip`
    };
  }

  /**
   * Map internal artifact types to bundle filenames
   */
  _getZipNameForArtifact(type, originalName) {
    // Final sanitization to prevent path traversal
    const safeName = originalName ? path.basename(originalName) : 'unknown-asset.pdf';
    
    if (type === 'INPUT') return 'original-source.pdf';
    if (type === 'AUTOFIX' || type === 'FIXED') return 'fixed.pdf';
    if (type === 'CERTIFIED') return 'certified.pdf';
    if (type === 'REPORT') return 'preflight-report.pdf';
    return safeName;
  }

  /**
   * Helper to calculate SHA256 hash for files that don't have one
   */
  async _calculateFileHash(filePath) {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);
      stream.on('data', data => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', err => reject(err));
    });
  }
}

module.exports = new ManufacturingBundleService();
