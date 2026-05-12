/**
 * Manufacturing Package Service
 * 
 * Handles business logic for Manufacturing Packages, bridging Preflight and Manufacturing.
 */
const persistence = require('./ManufacturingPersistenceService');
const preflightPersistence = require('./preflightPersistenceService');
const auditLogger = require('./auditLoggerService');
const eventService = require('./ManufacturingEventService');

class ManufacturingPackageService {
  /**
   * Create a new Manufacturing Package from a preflight job/artifact
   * @param {Object} packageData
   * @param {Object} context { userId, tenantId, role }
   */
  async createPackage(packageData, context) {
    const { sourceJobId, sourceArtifactId, bookSpec, manufacturingMetadata } = packageData;

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
      message: `Manufacturing package initialized from preflight job #${sourceJobId.substring(0,8)}`,
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
        finalFilters.actorTenantId = context.tenantId;
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

    // 4. Trigger Billing Integration (COMPLETED)
    if (newStatus === 'COMPLETED') {
      try {
        await this.handleBilling(updatedPackage, context);
      } catch (err) {
        console.error('[PACKAGE-SERVICE] Billing integration failed:', err);
        // We don't fail the whole operation, but we should log it
      }
    }

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
      type: `MANUFACTURING_${newStatus}`,
      actorType: 'USER',
      actorId: context.userId,
      message: `Package transitioned to ${newStatus}`,
      metadata: { oldStatus: pkg.status, newStatus }
    });

    return updatedPackage;
  }

  /**
   * Internal: Calculate costs and record financial transactions
   */
  async handleBilling(pkg, context) {
    const financialLedger = require('./financialLedgerService');
    const bookSpec = pkg.book_spec_json || {};
    
    // Simple Pricing Logic (Mock for Phase 12.2)
    const baseFee = 5.00;
    const pageCount = bookSpec.pageCount || 0;
    const pricePerPage = 0.05;
    const totalGross = baseFee + (pageCount * pricePerPage);
    const printerCost = totalGross * 0.85; // Platform takes 15%
    const currency = bookSpec.currency || 'EUR';

    // 1. Create a "Virtual" Transaction ID
    const transactionId = `prod_tx_${pkg.id.substring(0, 12)}`;

    // 2. Record Ledger Entries
    await financialLedger.createLedgerEntries(transactionId, [
        { 
          type: 'DEBIT', 
          account: 'CUSTOMER', 
          amount: totalGross, 
          currency,
          metadata: { packageId: pkg.id, note: 'Production Completion Payment' }
        },
        { 
          type: 'CREDIT', 
          account: 'PRINTER', 
          amount: printerCost, 
          currency,
          metadata: { packageId: pkg.id, note: 'Production Payout', printerTenantId: pkg.assigned_printer_tenant_id }
        },
        { 
          type: 'CREDIT', 
          account: 'PLATFORM_REVENUE', 
          amount: totalGross - printerCost, 
          currency,
          metadata: { packageId: pkg.id, note: 'Platform Fee' }
        }
    ]);

    // 3. Record Billing Event
    await eventService.record({
      tenantId: pkg.tenant_id,
      packageId: pkg.id,
      type: 'BILLING_PROCESSED',
      actorType: 'SYSTEM',
      actorId: 'billing-engine',
      message: `Financial settlement processed: ${totalGross.toFixed(2)} ${currency}`,
      metadata: { totalGross, printerCost, currency }
    });
  }
}

module.exports = new ManufacturingPackageService();
