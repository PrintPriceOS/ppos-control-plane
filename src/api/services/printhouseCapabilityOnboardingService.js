'use strict';

/**
 * src/api/services/printhouseCapabilityOnboardingService.js
 *
 * Phase 191D.1 — Production Capability Onboarding Service
 *
 * Manages the provenance of production capabilities attached to machines.
 * Each capability is a declarative statement: "this machine CAN do X".
 * Capabilities are tenant-scoped and machine-scoped.
 *
 * Capability records are stored in `printhouse_capability_audit` (audit trail)
 * and derived from `printhouse_machines` column flags + `printhouse_policy_profiles`.
 */
const db = require('./mysqlClient');
const crypto = require('crypto');

// ──── Capability Type Registry ─────────────────────────────────────────────────

const CAPABILITY_TYPES = {
    // Print capabilities (derived from machine flags)
    PRINT_CMYK:         { label: 'CMYK Printing', module: 'PRINT', source: 'machine_color_modes' },
    PRINT_SPOT_COLOR:   { label: 'Spot Color Printing', module: 'PRINT', source: 'machine_color_modes' },
    PRINT_WHITE_INK:    { label: 'White Ink Printing', module: 'PRINT', source: 'machine_flag' },
    PRINT_VARIABLE_DATA:{ label: 'Variable Data Printing', module: 'PRINT', source: 'machine_flag' },

    // Finishing capabilities (derived from machine flags)
    FINISH_LAMINATION:  { label: 'Lamination', module: 'FINISHING', source: 'machine_flag' },
    FINISH_SPOT_UV:     { label: 'Spot UV Coating', module: 'FINISHING', source: 'machine_flag' },
    FINISH_SADDLE_STITCH: { label: 'Saddle Stitch Binding', module: 'FINISHING', source: 'machine_flag' },
    FINISH_PERFECT_BIND: { label: 'Perfect Binding', module: 'FINISHING', source: 'machine_flag' },
    FINISH_CASE_BIND:   { label: 'Case Binding', module: 'FINISHING', source: 'machine_flag' },
    FINISH_HARDCOVER:   { label: 'Hardcover Production', module: 'FINISHING', source: 'machine_flag' },
    FINISH_SOFTCOVER:   { label: 'Softcover Production', module: 'FINISHING', source: 'machine_flag' },

    // Quality capabilities (derived from policy profiles or manual declaration)
    QUALITY_PDFX:       { label: 'PDF/X Compliance', module: 'QUALITY', source: 'machine_flag' },
    QUALITY_PDFA:       { label: 'PDF/A Compliance', module: 'QUALITY', source: 'machine_flag' },

    // Format capabilities (derived from machine dimensions)
    FORMAT_A4:          { label: 'A4 Format Support', module: 'FORMAT', source: 'computed' },
    FORMAT_A3:          { label: 'A3 Format Support', module: 'FORMAT', source: 'computed' },
    FORMAT_SRA3:        { label: 'SRA3 Format Support', module: 'FORMAT', source: 'computed' },
    FORMAT_B1:          { label: 'B1 Format Support', module: 'FORMAT', source: 'computed' },
    FORMAT_LARGE:       { label: 'Large Format (>700mm)', module: 'FORMAT', source: 'computed' }
};

// Standard paper sizes in mm (width x height)
const PAPER_SIZES = {
    A4:  { w: 210, h: 297 },
    A3:  { w: 297, h: 420 },
    SRA3:{ w: 320, h: 450 },
    B1:  { w: 707, h: 1000 }
};

// ──── Service ──────────────────────────────────────────────────────────────────

class PrinthouseCapabilityOnboardingService {
    /**
     * Determine if a machine provides at least one canonical production capability.
     * Evaluates color modes, capability flags, and dimensional format support.
     * Print methods and sides are descriptive attributes, not independent capabilities.
     */
    hasMeaningfulMachineCapability(machine) {
        if (!machine) return false;
        return this.deriveCapabilitiesFromMachine(machine).length > 0;
    }

    /**
     * Derive the set of capabilities from a machine record.
     * This is the canonical provenance model: capabilities are COMPUTED from
     * machine configuration, not manually maintained.
     */
    deriveCapabilitiesFromMachine(machine) {
        if (!machine) return [];
        const capabilities = [];

        // Color mode capabilities (representation-safe self-normalization)
        const rawColorModes = this._safeParseJson(machine.supported_color_modes_json, []);
        const colorModes = Array.isArray(rawColorModes) ? rawColorModes : [];
        if (colorModes.some(m => typeof m === 'string' && m.includes('CMYK'))) {
            capabilities.push({ type: 'PRINT_CMYK', active: true, source_machine_id: machine.id });
        }
        if (colorModes.some(m => typeof m === 'string' && m.includes('SPOT'))) {
            capabilities.push({ type: 'PRINT_SPOT_COLOR', active: true, source_machine_id: machine.id });
        }

        // Flag-based capabilities
        const flagMap = {
            supports_white_ink: 'PRINT_WHITE_INK',
            supports_variable_data: 'PRINT_VARIABLE_DATA',
            supports_lamination: 'FINISH_LAMINATION',
            supports_spot_uv: 'FINISH_SPOT_UV',
            supports_saddle_stitch: 'FINISH_SADDLE_STITCH',
            supports_perfect_binding: 'FINISH_PERFECT_BIND',
            supports_case_binding: 'FINISH_CASE_BIND',
            supports_hardcover: 'FINISH_HARDCOVER',
            supports_softcover: 'FINISH_SOFTCOVER',
            supports_pdfx: 'QUALITY_PDFX',
            supports_pdfa: 'QUALITY_PDFA'
        };

        for (const [field, capType] of Object.entries(flagMap)) {
            if (machine[field] === 1 || machine[field] === true) {
                capabilities.push({ type: capType, active: true, source_machine_id: machine.id });
            }
        }

        // Format capabilities (derived from dimensions)
        const maxW = Number(machine.max_sheet_width_mm) || 0;
        const maxH = Number(machine.max_sheet_height_mm) || 0;

        if (maxW > 0 && maxH > 0) {
            for (const [formatName, dims] of Object.entries(PAPER_SIZES)) {
                // Machine can handle this format if its max sheet size contains the paper in either orientation
                const fitsNormal = maxW >= dims.w && maxH >= dims.h;
                const fitsRotated = maxW >= dims.h && maxH >= dims.w;
                if (fitsNormal || fitsRotated) {
                    capabilities.push({ type: `FORMAT_${formatName}`, active: true, source_machine_id: machine.id });
                }
            }

            if (maxW > 700 || maxH > 700) {
                capabilities.push({ type: 'FORMAT_LARGE', active: true, source_machine_id: machine.id });
            }
        }

        return capabilities;
    }

    /**
     * Compute the aggregated capability profile for a production site.
     * Merges capabilities from all active machines at the site.
     */
    async computeSiteCapabilities(tenantId, siteId) {
        const machines = await db.query(
            'SELECT * FROM printhouse_machines WHERE printhouse_id = ? AND tenant_id = ? AND status != ?',
            [siteId, tenantId, 'ARCHIVED']
        );

        const capabilityMap = new Map();

        for (const machine of machines) {
            const derived = this.deriveCapabilitiesFromMachine(machine);
            const isMachineActive = machine.status === 'ACTIVE';
            for (const cap of derived) {
                if (!capabilityMap.has(cap.type)) {
                    const meta = CAPABILITY_TYPES[cap.type] || { label: cap.type, module: 'UNKNOWN', source: 'unknown' };
                    capabilityMap.set(cap.type, {
                        type: cap.type,
                        label: meta.label,
                        module: meta.module,
                        active: isMachineActive,
                        source_machine_ids: [cap.source_machine_id]
                    });
                } else {
                    const capEntry = capabilityMap.get(cap.type);
                    capEntry.source_machine_ids.push(cap.source_machine_id);
                    if (isMachineActive) {
                        capEntry.active = true;
                    }
                }
            }
        }

        return {
            site_id: siteId,
            tenant_id: tenantId,
            machine_count: machines.length,
            capabilities: Array.from(capabilityMap.values()),
            capability_count: capabilityMap.size
        };
    }

    /**
     * Compute the aggregated capability profile for a tenant (all sites).
     */
    async computeTenantCapabilities(tenantId) {
        const sites = await db.query(
            'SELECT id, name, country, city FROM printer_nodes WHERE tenant_id = ? AND status != ?',
            [tenantId, 'DELETED']
        );

        const siteProfiles = [];
        let totalCapabilities = 0;
        let totalMachines = 0;

        for (const site of sites) {
            const profile = await this.computeSiteCapabilities(tenantId, site.id);
            siteProfiles.push({
                site_id: site.id,
                site_name: site.name,
                ...profile
            });
            totalCapabilities += profile.capability_count;
            totalMachines += profile.machine_count;
        }

        // Flatten unique capabilities across all sites
        const allCapTypes = new Set();
        for (const sp of siteProfiles) {
            for (const cap of sp.capabilities) {
                allCapTypes.add(cap.type);
            }
        }

        return {
            tenant_id: tenantId,
            site_count: sites.length,
            total_machines: totalMachines,
            unique_capability_count: allCapTypes.size,
            sites: siteProfiles
        };
    }

    /**
     * Get the list of all known capability types.
     */
    getCapabilityTypes() {
        return Object.entries(CAPABILITY_TYPES).map(([key, val]) => ({
            type: key,
            ...val
        }));
    }

    /**
     * Record a capability audit event.
     */
    async recordCapabilityEvent(tenantId, siteId, eventType, actor, beforeJson, afterJson) {
        await db.query(
            `INSERT INTO printhouse_capability_audit
             (printhouse_id, tenant_id, event_type, actor_user_id, actor_role, before_json, after_json)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                siteId, tenantId, eventType,
                actor?.userId || 'system',
                actor?.role || 'SYSTEM',
                beforeJson ? JSON.stringify(beforeJson) : null,
                afterJson ? JSON.stringify(afterJson) : null
            ]
        );
    }

    _safeParseJson(val, fallback = {}) {
        if (val === null || val === undefined || val === '') return fallback;
        if (typeof val === 'object') return val;
        if (typeof val !== 'string') return fallback;
        try {
            const parsed = JSON.parse(val);
            return (parsed !== null && parsed !== undefined) ? parsed : fallback;
        } catch {
            return fallback;
        }
    }
}

module.exports = new PrinthouseCapabilityOnboardingService();
