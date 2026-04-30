/**
 * Print Node Matching Engine
 * 
 * Deterministic rule-based system for finding compatible PrintHouse nodes
 * for a specific Production Package.
 */
const persistence = require('./productionPersistenceService');
const preflightPersistence = require('./preflightPersistenceService');
const auditLogger = require('./auditLoggerService');

class PrintNodeMatchingService {
  /**
   * Find compatible nodes for a package
   * @param {string} packageId
   * @param {Object} context { userId, tenantId, role }
   */
  async findMatches(packageId, context) {
    // 1. Fetch Package and associated data
    const pkg = await persistence.getPackage(packageId);
    if (!pkg) throw new Error('NOT_FOUND: Package not found');

    const artifact = await preflightPersistence.getArtifact(pkg.source_artifact_id);
    if (!artifact) throw new Error('NOT_FOUND: Source artifact not found');

    // 2. Fetch all operational Print Nodes
    // For Phase 11, we evaluate all ONLINE nodes with ACTIVE licenses
    const nodes = await persistence.listNodes({ status: 'ONLINE', licenseStatus: 'ACTIVE' });

    const matches = [];

    for (const node of nodes) {
      const matchResult = this.evaluateMatch(pkg, artifact, node);
      if (matchResult.isCompatible) {
        matches.push({
          printNodeId: node.id,
          companyName: node.company_name,
          matchScore: matchResult.score,
          reasons: matchResult.reasons,
          warnings: matchResult.warnings
        });
      }
    }

    // 3. Sort by score descending
    matches.sort((a, b) => b.matchScore - a.matchScore);

    await auditLogger.log({
      type: 'NODE_MATCHING',
      tenantId: pkg.tenant_id,
      userId: context.userId,
      status: 'SUCCESS',
      metadata: { packageId, matchCount: matches.length }
    });

    return { compatibleNodes: matches };
  }

  /**
   * Evaluate compatibility between a package and a node
   */
  evaluateMatch(pkg, artifact, node) {
    const specs = pkg.book_spec_json || {};
    const capabilities = node.capabilities_json || {};
    
    const reasons = [];
    const warnings = [];
    let score = 100;
    let isCompatible = true;

    // 1. Binding Check (HARD)
    if (specs.binding && capabilities.supportedBindings) {
      if (!capabilities.supportedBindings.includes(specs.binding)) {
        isCompatible = false;
        reasons.push(`Node does not support binding: ${specs.binding}`);
      }
    }

    // 2. Trim Size Check (HARD)
    if (specs.trim && capabilities.trimSizeRanges) {
      const { widthMm, heightMm } = specs.trim;
      const { minWidthMm, maxWidthMm, minHeightMm, maxHeightMm } = capabilities.trimSizeRanges;
      
      if (widthMm < minWidthMm || widthMm > maxWidthMm || heightMm < minHeightMm || heightMm > maxHeightMm) {
        isCompatible = false;
        reasons.push(`Trim size (${widthMm}x${heightMm}mm) out of node range`);
      }
    }

    // 3. File Size Check (HARD)
    const fileSizeMb = artifact.size_bytes / (1024 * 1024);
    if (fileSizeMb > (node.max_file_size_mb || 500)) {
      isCompatible = false;
      reasons.push(`File size (${fileSizeMb.toFixed(1)}MB) exceeds node limit`);
    }

    // 4. Color Mode Check (SOFT/Score)
    if (specs.color && capabilities.supportedColorModes) {
      if (!capabilities.supportedColorModes.includes(specs.color)) {
        score -= 20;
        warnings.push(`Node may require color mode conversion from ${specs.color}`);
      }
    }

    // 5. Policy Alignment (SOFT/Score)
    if (pkg.policy_id && node.supported_policies_json) {
      if (!node.supported_policies_json.includes(pkg.policy_id)) {
        score -= 10;
        warnings.push(`Node is not pre-certified for policy: ${pkg.policy_id}`);
      }
    }

    // 6. Paper GSM Check (SOFT/Score)
    if (specs.paperGsm && capabilities.paperGsmRanges) {
      const { min, max } = capabilities.paperGsmRanges;
      if (specs.paperGsm < min || specs.paperGsm > max) {
        score -= 15;
        warnings.push(`Paper weight (${specs.paperGsm}gsm) outside ideal range for this node`);
      }
    }

    // 7. Geographic scoring (Bonus)
    // If we had the destination in the package, we'd score based on distance.
    // For now, let's assume a default bonus if they are in the same country.
    // (Requires package to have destinationCountry)
    if (specs.destinationCountry && node.country && specs.destinationCountry === node.country) {
      score += 10; 
    }

    // Cap score
    score = Math.max(0, Math.min(100, score));

    return {
      isCompatible,
      score,
      reasons,
      warnings
    };
  }
}

module.exports = new PrintNodeMatchingService();
