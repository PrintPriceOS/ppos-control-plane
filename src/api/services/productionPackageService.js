/**
 * Production Package Service
 * 
 * Handles business logic for Production Packages, bridging Preflight and Production.
 */
const persistence = require('./productionPersistenceService');
const preflightPersistence = require('./preflightPersistenceService');
const auditLogger = require('./auditLoggerService');
const eventService = require('./productionEventService');

class ProductionPackageService {
  /**
   * Create a new Production Package from a preflight job/artifact
   * @param {Object} packageData
   * @param {Object} context { userId, tenantId, role }
   */
  async createPackage(packageData, context) {
    const { sourceJobId, sourceArtifactId, bookSpec, productionMetadata } = packageData;

    // 1. Validate Job Existence and Ownership
    const job = await preflightPersistence.getJob(sourceJobId);
    if (!job) {
      throw new Error('NOT_FOUND: Source preflight job not found');
    }
    if (job.tenant_id !== context.tenantId && context.role !== 'SUPER_ADMIN') {
      throw new Error('FORBIDDEN: You do not own this preflight job');
    }

    // 2. Validate Artifact Existence and Ownership
    const artifact = await preflightPersistence.getArtifact(sourceArtifactId);
    if (!artifact) {
      throw new Error('NOT_FOUND: Source artifact not found');
    }
    if (artifact.tenant_id !== context.tenantId && context.role !== 'SUPER_ADMIN') {
      throw new Error('FORBIDDEN: You do not own this artifact');
    }
    if (artifact.job_id !== sourceJobId) {
      throw new Error('BAD_REQUEST: Artifact does not belong to the specified job');
    }

    // 3. Gather linked artifacts (Fixed PDF, Report) if available
    const artifacts = await preflightPersistence.listArtifacts({ jobId: sourceJobId });
    const fixedPdf = artifacts.find(a => a.type === 'AUTOFIX' || a.type === 'FIXED');
    const certifiedPdf = artifacts.find(a => a.type === 'CERTIFIED');
    const report = artifacts.find(a => a.type === 'REPORT' || a.type === 'PREFLIGHT_REPORT');

    // 4. Create the Package
    const newPackage = await persistence.createPackage({
      tenantId: context.tenantId,
      createdByUserId: context.userId,
      source: 'PREFLIGHT',
      sourceJobId,
      sourceArtifactId,
      fixedPdfArtifactId: fixedPdf?.id,
      certifiedPdfArtifactId: certifiedPdf?.id,
      bookSpec: bookSpec || {},
      preflightReport: report?.metadata_json || {},
      policyId: job.policy,
      status: 'DRAFT'
    });

    await auditLogger.log({
      type: 'PACKAGE_CREATE',
      tenantId: context.tenantId,
      userId: context.userId,
      status: 'SUCCESS',
      metadata: { packageId: newPackage.id, sourceJobId }
    });

    await eventService.record({
      tenantId: context.tenantId,
      packageId: newPackage.id,
      type: 'PACKAGE_CREATED',
      actorType: 'USER',
      actorId: context.userId,
      message: `Production package initialized from preflight job #${sourceJobId.substring(0,8)}`,
      metadata: { sourceJobId, policy: job.policy }
    });

    return newPackage;
  }

  /**
   * Get a single package by ID
   */
  async getPackage(packageId, context) {
    const pkg = await persistence.getPackage(packageId);
    if (!pkg) return null;

    // RBAC: Owners, Assigned Printers, or SuperAdmins only
    const isOwner = pkg.tenant_id === context.tenantId;
    const isAssignedPrinter = pkg.assigned_printer_tenant_id === context.tenantId;
    
    if (!isOwner && !isAssignedPrinter && context.role !== 'SUPER_ADMIN') {
      throw new Error('FORBIDDEN: Access to this package is restricted');
    }

    return pkg;
  }

  /**
   * List packages
   */
  async listPackages(filters, context) {
    const finalFilters = { ...filters };

    // RBAC: If not SuperAdmin, filter by tenantId (as owner or printer)
    if (context.role !== 'SUPER_ADMIN') {
        // This is a simplification; a more robust listPackages in persistence
        // should handle (tenant_id = ? OR assigned_printer_tenant_id = ?)
        finalFilters.tenantId = context.tenantId;
    }

    return persistence.listPackages(finalFilters);
  }

  /**
   * Update package status (Lifecycle management)
   */
  async updatePackageStatus(packageId, newStatus, context) {
    const pkg = await persistence.getPackage(packageId);
    if (!pkg) throw new Error('NOT_FOUND: Package not found');

    // Lifecycle validation
    const allowedTransitions = {
        'DRAFT': ['READY_FOR_DISPATCH', 'CANCELLED'],
        'READY_FOR_DISPATCH': ['DISPATCHED', 'CANCELLED'],
        'DISPATCHED': ['ACCEPTED_BY_PRINTER', 'REJECTED_BY_PRINTER', 'CANCELLED'],
        'ACCEPTED_BY_PRINTER': ['IN_PRODUCTION', 'CANCELLED'],
        'REJECTED_BY_PRINTER': ['READY_FOR_DISPATCH', 'CANCELLED'],
        'IN_PRODUCTION': ['COMPLETED', 'CANCELLED'],
        'COMPLETED': [],
        'CANCELLED': []
    };

    if (!allowedTransitions[pkg.status].includes(newStatus)) {
        throw new Error(`INVALID_TRANSITION: Cannot move package from ${pkg.status} to ${newStatus}`);
    }

    const updatedPackage = await persistence.updatePackage(packageId, { status: newStatus });

    await auditLogger.log({
      type: 'PACKAGE_STATUS_UPDATE',
      tenantId: context.tenantId,
      userId: context.userId,
      status: 'SUCCESS',
      metadata: { packageId, oldStatus: pkg.status, newStatus }
    });

    await eventService.record({
      tenantId: context.tenantId,
      packageId: packageId,
      type: `PRODUCTION_${newStatus}`,
      actorType: 'USER',
      actorId: context.userId,
      message: `Package transitioned to ${newStatus}`,
      metadata: { oldStatus: pkg.status, newStatus }
    });

    return updatedPackage;
  }
}

module.exports = new ProductionPackageService();
