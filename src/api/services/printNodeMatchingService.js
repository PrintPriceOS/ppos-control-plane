/**
 * Print Node Matching Engine
 * 
 * Deterministic rule-based system for finding compatible PrintHouse nodes
 * for a specific Manufacturing Package.
 */
const persistence = require('./ManufacturingPersistenceService');
const preflightPersistence = require('./preflightPersistenceService');
const auditLogger = require('./auditLoggerService');
const machineRegistry = require('./machineRegistryService');
const materialAvailabilityService = require('./materialAvailabilityService');

class PrintNodeMatchingService {
  /**
   * Find compatible nodes for a package
   * @param {string} packageId
   * @param {Object} context { userId, tenantId, role }
   */
  async findMatches(packageId, context) {
    // 1. Fetch Package and associated data
    const pkg = await persistence.getPackage(packageId);
    if (!pkg) throw new Error('NOT_FOUND: Manufacturing package missing or inaccessible in datastore');

    const artifact = await preflightPersistence.getArtifact(pkg.source_artifact_id);
    if (!artifact) throw new Error('NOT_FOUND: Primary certified preflight source artifact missing');

    // 2. Fetch all operational Print Nodes
    const nodes = await persistence.listNodes({ status: 'ONLINE', licenseStatus: 'ACTIVE' });

    const matches = [];

    for (const node of nodes) {
      // Fetch machine profiles for deep matching precision
      const machines = await machineRegistry.getMachinesForNode(node.id);
      
      const matchResult = this.evaluateMatch(pkg, artifact, node);

      // Verify material inventory availability forecast
      try {
        const shortages = await materialAvailabilityService.forecastDepletion(node.id);
        if (shortages && shortages.length > 0) {
          matchResult.warnings.push(`Material availability forecast flags impending consumable shortage risk: ${shortages.map(s => s.material).join(', ')}`);
          matchResult.details.materialWarning = true;
        }
      } catch (err) {
        // Tolerant non-blocking evaluation check
      }
      
      // Check individual machine-level compatibility
      const compatibleMachines = [];
      if (machines && machines.length > 0) {
        for (const m of machines) {
          const evalRes = this.evaluateMachineMatch(pkg, artifact, m);
          if (evalRes.isCompatible) {
            m._evalResult = evalRes;
            compatibleMachines.push(m);
          }
        }

        if (compatibleMachines.length === 0) {
          // Hard fallback evaluation constraint: if machines exist, at least one must explicitly map format capabilities
          matchResult.isCompatible = false;
          matchResult.reasons.push('Node online but no individual machine supports requested format dimensions/capabilities');
        } else {
          matchResult.score = Math.min(100, matchResult.score + 10); // Precision mapping structural bonus
          matchResult.matchedMachines = compatibleMachines.map(m => m.profile_name);
        }
      }

      if (matchResult.isCompatible) {
        matches.push({
          // Normalized Canonical Response Structure
          federationNodeId: node.id,
          printHouseId: node.company_name || node.id,
          machineIds: compatibleMachines.map(m => m.id),
          compatibleMachines: compatibleMachines.map(m => ({
            id: m.id,
            profileName: m.profile_name,
            profileType: m.profile_type,
            manufacturer: m.manufacturer,
            model: m.model,
            capabilities: m.normalized_capabilities_json || {},
            reasons: m._evalResult?.reasons || []
          })),

          // Preserved Backwards Compatibility bindings
          printNodeId: node.id,
          companyName: node.company_name,
          matchScore: matchResult.score,
          reasons: matchResult.reasons,
          warnings: matchResult.warnings,
          matchedMachines: matchResult.matchedMachines || [],
          details: matchResult.details
        });
      }
    }

    // Sort by final score descending
    matches.sort((a, b) => b.matchScore - a.matchScore);

    await auditLogger.log({
      type: 'NODE_MATCHING',
      tenantId: pkg.tenant_id,
      userId: context.userId,
      status: 'SUCCESS',
      metadata: { packageId, matchCount: matches.length }
    });

    return { 
      compatibleNodes: matches,
      matches // Alias mapping export for broad client fallback compatibility
    };
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

    const details = {
      paper: true,
      binding: true,
      trim: true,
      fileSize: true,
      policy: true,
      geographyBonus: false,
      materialWarning: false
    };

    // 1. Binding Check (HARD)
    if (specs.binding && capabilities.supportedBindings) {
      if (!capabilities.supportedBindings.includes(specs.binding)) {
        isCompatible = false;
        details.binding = false;
        reasons.push(`Node binding restrictions bypass target: ${specs.binding}`);
      }
    }

    // 2. Trim Size Check (HARD)
    if (specs.trim && capabilities.trimSizeRanges) {
      const { widthMm, heightMm } = specs.trim;
      const { minWidthMm, maxWidthMm, minHeightMm, maxHeightMm } = capabilities.trimSizeRanges;
      
      if (widthMm < minWidthMm || widthMm > maxWidthMm || heightMm < minHeightMm || heightMm > maxHeightMm) {
        isCompatible = false;
        details.trim = false;
        reasons.push(`Trim dimensions (${widthMm}x${heightMm}mm) fall out of target printable physical constraints bounds`);
      }
    }

    // 3. File Size Check (HARD)
    const fileSizeMb = (artifact.size_bytes || 0) / (1024 * 1024);
    if (fileSizeMb > (node.max_file_size_mb || 500)) {
      isCompatible = false;
      details.fileSize = false;
      reasons.push(`Payload sizing block (${fileSizeMb.toFixed(1)}MB) exceeds max input limit capacity bounds`);
    }

    // 4. Color Mode Check (SOFT)
    if (specs.color && capabilities.supportedColorModes) {
      if (!capabilities.supportedColorModes.includes(specs.color)) {
        score -= 20;
        warnings.push(`Node target lacks hardware match; requires color mode conversion layer from ${specs.color}`);
      }
    }

    // 5. Policy Alignment (SOFT)
    if (pkg.policy_id && node.supported_policies_json) {
      if (!node.supported_policies_json.includes(pkg.policy_id)) {
        score -= 10;
        details.policy = false;
        warnings.push(`Target node unmapped for explicitly assigned governance protocol policy token: ${pkg.policy_id}`);
      }
    }

    // 6. Paper GSM Check (SOFT)
    if (specs.paperGsm && capabilities.paperGsmRanges) {
      const { min, max } = capabilities.paperGsmRanges;
      if (specs.paperGsm < min || specs.paperGsm > max) {
        score -= 15;
        details.paper = false;
        warnings.push(`Requested paper density (${specs.paperGsm}gsm) unoptimized for physical sheet feeds`);
      }
    }

    // 7. Geographic scoring (Bonus strictly checked against defined explicit physical destinations)
    if (specs.destinationCountry && typeof specs.destinationCountry === 'string' && specs.destinationCountry.trim() !== '') {
      if (node.country && specs.destinationCountry.trim().toLowerCase() === node.country.trim().toLowerCase()) {
        score += 10; 
        details.geographyBonus = true;
      }
    }

    // Clamp score scalar bounds securely
    score = Math.max(0, Math.min(100, score));

    return {
      isCompatible,
      score,
      reasons,
      warnings,
      details
    };
  }

  /**
   * Evaluate compatibility for a specific machine
   */
  evaluateMachineMatch(pkg, artifact, machine) {
    const specs = pkg.book_spec_json || {};
    const caps = machine.normalized_capabilities_json || {};
    
    const result = { isCompatible: true, reasons: [] };

    // 1. Paper Substrate Check
    if (specs.paperType && caps.paper_types) {
        if (!caps.paper_types.includes(specs.paperType)) {
            result.isCompatible = false;
            result.reasons.push(`Hardware does not map requested paper profile: ${specs.paperType}`);
        }
    }

    // 2. Format / Maximum Sheet Capacity Check
    if (specs.trim && caps.max_sheet) {
        if (specs.trim.widthMm > caps.max_sheet.width || specs.trim.heightMm > caps.max_sheet.height) {
            result.isCompatible = false;
            result.reasons.push(`Target trim geometry overshoots physical sheet tray constraints: ${caps.max_sheet.width}x${caps.max_sheet.height}mm`);
        }
    }

    // 3. Run Length Allocation Rules Check
    const runLength = Number(specs.runLength || specs.copies || 0);
    if (runLength > 0) {
        if (caps.max_run > 0 && runLength > caps.max_run) {
            result.isCompatible = false;
            result.reasons.push(`Allocated batch units (${runLength}) exceeds ideal frame scale ceiling (${caps.max_run})`);
        }
        if (caps.min_run > 0 && runLength < caps.min_run) {
            result.isCompatible = false;
            result.reasons.push(`Allocated batch units (${runLength}) fails minimum setup overhead runs (${caps.min_run})`);
        }
    }

    return result;
  }
}

module.exports = new PrintNodeMatchingService();
