/**
 * Print Node Matching Engine
 * 
 * Deterministic rule-based system for finding compatible PrintHouse nodes
 * for a specific Production Package.
 */
const persistence = require('./productionPersistenceService');
const preflightPersistence = require('./preflightPersistenceService');
const auditLogger = require('./auditLoggerService');
const machineRegistry = require('./machineRegistryService');

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
      // PHASE 2: Fetch machine profiles for deep matching precision
      const machines = await machineRegistry.getMachinesForNode(node.id);
      
      const matchResult = this.evaluateMatch(pkg, artifact, node);
      
      // If node-level is compatible, verify machine-level compatibility
      if (matchResult.isCompatible && machines.length > 0) {
        const compatibleMachines = machines.filter(m => this.evaluateMachineMatch(pkg, artifact, m).isCompatible);
        if (compatibleMachines.length === 0) {
          matchResult.isCompatible = false;
          matchResult.reasons.push('Node online but no individual machine supports these technical specs');
        } else {
          matchResult.score = Math.min(100, matchResult.score + 10); // Bonus for explicit machine match
          matchResult.matchedMachines = compatibleMachines.map(m => m.profile_name);
        }
      }

      if (matchResult.isCompatible) {
        matches.push({
          printNodeId: node.id,
          companyName: node.company_name,
          matchScore: matchResult.score,
          reasons: matchResult.reasons,
          warnings: matchResult.warnings,
          matchedMachines: matchResult.matchedMachines || []
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

    // PHASE 2: Machine-level precision check
    // If the node has machines registered, at least one must be compatible
    // Note: This is an async check in a sync method, so we should have fetched machines earlier 
    // or we'll stick to the node-level capabilities for the core loop and use machine-level for scoring.
    // However, findMatches is async, so we can fetch machines there.

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

  /**
   * Evaluate compatibility for a specific machine
   */
  evaluateMachineMatch(pkg, artifact, machine) {
    const specs = pkg.book_spec_json || {};
    const caps = machine.normalized_capabilities_json || {};
    
    const result = { isCompatible: true, reasons: [] };

    // 1. Paper Type
    if (specs.paperType && caps.paper_types) {
        if (!caps.paper_types.includes(specs.paperType)) {
            result.isCompatible = false;
            result.reasons.push(`Machine does not support paper type: ${specs.paperType}`);
        }
    }

    // 2. Format / Sheet Size
    if (specs.trim && caps.max_sheet) {
        if (specs.trim.widthMm > caps.max_sheet.width || specs.trim.heightMm > caps.max_sheet.height) {
            result.isCompatible = false;
            result.reasons.push(`Trim size exceeds machine max sheet: ${caps.max_sheet.width}x${caps.max_sheet.height}mm`);
        }
    }

    // 3. Run Length
    const runLength = specs.runLength || 0;
    if (runLength > 0) {
        if (caps.max_run > 0 && runLength > caps.max_run) {
            result.isCompatible = false;
            result.reasons.push(`Run length (${runLength}) exceeds machine max run (${caps.max_run})`);
        }
        if (runLength < caps.min_run) {
            result.isCompatible = false;
            result.reasons.push(`Run length (${runLength}) below machine minimum (${caps.min_run})`);
        }
    }

    return result;
  }
}

module.exports = new PrintNodeMatchingService();
