/**
 * src/api/services/printhouseReadinessService.js
 * 
 * Computes backend readiness derived from canonical tenant and printer node DB records.
 * Provides stable reason codes for frontend guidance and gates feature readiness.
 *
 * Phase 191D.1: Extended with machine and capability configuration readiness gates.
 */
const db = require('./mysqlClient');

class PrinthouseReadinessService {
    /**
     * Compute full readiness status for a given tenant.
     */
    async computeReadiness(tenantId) {
        if (!tenantId) {
            throw new Error('tenantId is required to compute readiness');
        }

        // 1. Fetch canonical Tenant record
        const [tenant] = await db.query(
            'SELECT id, name, type, status, plan, metadata_json FROM tenants WHERE id = ?',
            [tenantId]
        ).catch(() => []);

        let metadata = {};
        try {
            metadata = typeof tenant?.metadata_json === 'string'
                ? JSON.parse(tenant.metadata_json)
                : (tenant?.metadata_json || {});
        } catch (e) {}

        // 2. Fetch canonical Printer Nodes (Production Sites) for tenant
        const sites = await db.query(
            'SELECT id, name, country, city, email, phone, website, status FROM printer_nodes WHERE tenant_id = ? AND status != "DELETED"',
            [tenantId]
        ).catch(() => []);

        // 3. Evaluate Account Setup Facts
        const blockingIssues = [];
        const advisories = [];
        let completedRequirements = 0;
        const totalRequirements = 6;

        // Fact 1: Legal / Display Name
        const companyName = tenant?.name || metadata?.company_name || '';
        if (companyName && !companyName.includes('Ph-') && !companyName.includes('Configuring')) {
            completedRequirements++;
        } else {
            blockingIssues.push({ code: 'ADD_LEGAL_COMPANY_NAME', module: 'COMPANY_PROFILE', message: 'Set official legal company name' });
        }

        // Fact 2: Primary Country
        const country = metadata?.country || (sites[0]?.country) || '';
        if (country && country !== 'Pending Setup') {
            completedRequirements++;
        } else {
            blockingIssues.push({ code: 'ADD_COUNTRY', module: 'COMPANY_PROFILE', message: 'Specify primary country of operation' });
        }

        // Fact 3: Primary Contact Info
        const contactName = metadata?.contact_name || metadata?.primary_contact || '';
        const phone = metadata?.phone || (sites[0]?.phone) || '';
        if (contactName || phone) {
            completedRequirements++;
        } else {
            advisories.push({ code: 'ADD_PRIMARY_CONTACT', module: 'COMPANY_PROFILE', message: 'Add primary contact person and phone number' });
        }

        // Fact 4: First Production Site
        const validSite = (sites || []).find(s => s.name && s.country && s.country !== 'Pending Setup');
        if (validSite) {
            completedRequirements++;
        } else {
            blockingIssues.push({ code: 'ADD_FIRST_PRODUCTION_SITE', module: 'PRODUCTION_SITES', message: 'Configure primary production site' });
        }

        // Fact 5: Site City / Address
        if (validSite && validSite.city && validSite.city !== 'Pending Setup') {
            completedRequirements++;
        } else {
            blockingIssues.push({ code: 'COMPLETE_SITE_ADDRESS', module: 'PRODUCTION_SITES', message: 'Provide complete city and facility location' });
        }

        // Fact 6: Timezone / Region
        if (validSite && (validSite.region || metadata?.timezone)) {
            completedRequirements++;
        } else {
            advisories.push({ code: 'ADD_SITE_TIMEZONE', module: 'PRODUCTION_SITES', message: 'Select production site timezone' });
        }

        const accountSetupStatus = completedRequirements === totalRequirements 
            ? 'COMPLETE' 
            : completedRequirements > 0 ? 'IN_PROGRESS' : 'NOT_STARTED';

        let nextAction = null;
        if (blockingIssues.length > 0) {
            nextAction = { code: blockingIssues[0].code, module: blockingIssues[0].module };
        } else if (advisories.length > 0) {
            nextAction = { code: advisories[0].code, module: advisories[0].module };
        }

        // ──── Phase 191E / 191F: Operational Readiness (Standardize Terminology) ────
        const opConfig = await this._computeOperationalReadiness(tenantId, sites);
        const configStatus = opConfig.status === 'READY' ? 'COMPLETE' : opConfig.status;

        const configResult = {
            status: configStatus,
            available: false, // Non-authorizing
            machineCount: opConfig.machineCount,
            capabilityCount: opConfig.capabilityCount,
            sitesWithMachines: opConfig.sitesWithMachines,
            materialCount: opConfig.materialCount,
            capacityCount: opConfig.capacityCount,
            leadTimesCount: opConfig.leadTimesCount,
            completedRequirements: opConfig.completedRequirements,
            totalRequirements: opConfig.totalRequirements,
            blockingIssues: opConfig.blockingIssues,
            advisories: opConfig.advisories
        };

        // ──── Phase 191F: Pricing Readiness ────
        let priceBookCount = 0;
        let pricingStatus = 'PRICING_NOT_CONFIGURED';
        let hasPublished = false;
        let hasApproved = false;

        try {
            const pbRows = await db.query(
                'SELECT status FROM printhouse_price_books WHERE tenant_id = ?',
                [tenantId]
            );
            priceBookCount = pbRows.length;
            if (priceBookCount > 0) {
                hasPublished = pbRows.some(r => r.status === 'PUBLISHED');
                hasApproved = pbRows.some(r => r.status === 'APPROVED');
                if (hasPublished || hasApproved) {
                    pricingStatus = 'COMPLETE';
                } else {
                    pricingStatus = 'IN_PROGRESS';
                }
            }
        } catch (e) {
            // Table might not exist yet
        }

        return {
            accountSetup: {
                status: accountSetupStatus,
                completedRequirements,
                totalRequirements,
                blockingIssues,
                advisories,
                nextAction
            },
            operationalConfiguration: configResult,
            operationalReadiness: {
                ...configResult,
                status: 'IN_PROGRESS', // Force overall operational readiness to IN_PROGRESS
                available: false
            },
            pricingReadiness: {
                status: pricingStatus,
                priceBookCount,
                hasPublished,
                hasApproved,
                available: pricingStatus === 'COMPLETE'
            },
            shippingReadiness: {
                status: opConfig.shippingCount > 0 ? 'COMPLETE' : 'INCOMPLETE',
                activeRegionsCount: opConfig.shippingCount,
                available: opConfig.shippingCount > 0
            },
            integrationReadiness: {
                status: opConfig.integrationCount > 0 ? 'CONFIGURED' : 'NOT_REQUIRED',
                activeProfilesCount: opConfig.integrationCount,
                available: true
            },
            marketplaceReadiness: {
                status: (accountSetupStatus === 'COMPLETE' && configStatus === 'COMPLETE' && pricingStatus === 'COMPLETE') ? 'READY_FOR_REVIEW' : 'INCOMPLETE',
                available: accountSetupStatus === 'COMPLETE' && configStatus === 'COMPLETE' && pricingStatus === 'COMPLETE',
                message: 'Submit for review when all 6 onboarding modules are complete.'
            },
            activationReadiness: {
                status: 'NOT_ACTIVATED',
                marketplaceVisible: false,
                liveQuotingAllowed: false,
                jobRoutingAllowed: false,
                productionDispatchAllowed: false
            }
        };
    }

    /**
     * Phase 191D.1: Compute operational readiness based on machines and capabilities.
     * A tenant is "operationally ready" when:
     *   1. At least one production site has at least one ACTIVE machine
     *   2. At least one machine has at least one derived capability
     */
    async _computeOperationalReadiness(tenantId, sites) {
        const operationalBlockers = [];
        const operationalAdvisories = [];
        let machineCount = 0;
        let capabilityCount = 0;
        let sitesWithMachines = 0;
        let materialCount = 0;
        let capacityCount = 0;
        let leadTimesCount = 0;

        try {
            // Count configured (non-archived) machines across all sites
            const machineRows = await db.query(
                'SELECT COUNT(*) AS cnt FROM printhouse_machines WHERE tenant_id = ? AND status != ?',
                [tenantId, 'ARCHIVED']
            );
            machineCount = machineRows[0]?.cnt || 0;

            if (machineCount === 0) {
                operationalBlockers.push({
                    code: 'ADD_FIRST_MACHINE',
                    module: 'MACHINES',
                    message: 'Add at least one production machine to a site'
                });
            }

            // Count sites with at least one configured machine
            const siteMachineRows = await db.query(
                'SELECT printhouse_id, COUNT(*) AS cnt FROM printhouse_machines WHERE tenant_id = ? AND status != ? GROUP BY printhouse_id',
                [tenantId, 'ARCHIVED']
            );
            sitesWithMachines = siteMachineRows.length;

            // Count derived capabilities (non-archived machines with at least one capability)
            if (machineCount > 0) {
                const capRows = await db.query(
                    `SELECT COUNT(*) AS cnt FROM printhouse_machines
                     WHERE tenant_id = ? AND status != ?
                     AND (supports_pdfx = 1 OR supports_pdfa = 1 OR supports_variable_data = 1
                          OR supports_white_ink = 1 OR supports_spot_uv = 1 OR supports_lamination = 1
                          OR supports_hardcover = 1 OR supports_softcover = 1 OR supports_saddle_stitch = 1
                          OR supports_perfect_binding = 1 OR supports_case_binding = 1
                          OR supported_color_modes_json IS NOT NULL)`,
                    [tenantId, 'ARCHIVED']
                );
                capabilityCount = capRows[0]?.cnt || 0;

                if (capabilityCount === 0) {
                    operationalAdvisories.push({
                        code: 'CONFIGURE_MACHINE_CAPABILITIES',
                        module: 'CAPABILITIES',
                        message: 'Configure production capabilities on at least one machine'
                    });
                }
            }

            // Count non-archived materials
            const materialRows = await db.query(
                `SELECT COUNT(*) AS cnt FROM materials_catalog 
                 WHERE tenant_id = ? AND (JSON_EXTRACT(metadata_json, '$.archived') IS NULL OR JSON_EXTRACT(metadata_json, '$.archived') != true)`,
                [tenantId]
            );
            materialCount = materialRows[0]?.cnt || 0;

            if (materialCount === 0) {
                operationalBlockers.push({
                    code: 'ADD_FIRST_MATERIAL',
                    module: 'MATERIALS',
                    message: 'Add at least one material to the catalog'
                });
            }

            // Count configured site capacities (requiring positive jobs or sheets limit)
            const capacityRows = await db.query(
                `SELECT COUNT(*) AS cnt FROM printhouse_site_capacities 
                 WHERE tenant_id = ? 
                   AND ((daily_jobs_limit IS NOT NULL AND daily_jobs_limit > 0)
                        OR (daily_sheets_limit IS NOT NULL AND daily_sheets_limit > 0))`,
                [tenantId]
            );
            capacityCount = capacityRows[0]?.cnt || 0;

            if (capacityCount === 0) {
                operationalBlockers.push({
                    code: 'CONFIGURE_SITE_CAPACITY',
                    module: 'CAPACITY',
                    message: 'Configure daily capacity limits'
                });
            }

            // Count configured site lead times (requiring explicit valid timezone, non-empty workdays, cutoff, and non-negative lead days)
            const leadTimeRows = await db.query(
                `SELECT COUNT(*) AS cnt FROM printhouse_site_lead_times 
                 WHERE tenant_id = ? 
                   AND timezone IS NOT NULL AND timezone != ''
                   AND workdays_json IS NOT NULL AND workdays_json != '[]' AND workdays_json != ''
                   AND daily_cutoff_time IS NOT NULL AND daily_cutoff_time != ''
                   AND base_lead_time_days IS NOT NULL AND base_lead_time_days >= 0`,
                [tenantId]
            );
            leadTimesCount = leadTimeRows[0]?.cnt || 0;

            if (leadTimesCount === 0) {
                operationalBlockers.push({
                    code: 'CONFIGURE_SITE_LEAD_TIMES',
                    module: 'LEAD_TIMES',
                    message: 'Configure site lead times and cutoff rules'
                });
            }

            // Count active enabled shipping regions
            let shippingCount = 0;
            try {
                const shippingRows = await db.query(
                    'SELECT COUNT(*) AS cnt FROM printhouse_shipping_regions WHERE tenant_id = ? AND enabled = TRUE AND status = ?',
                    [tenantId, 'ACTIVE']
                );
                shippingCount = shippingRows[0]?.cnt || 0;
            } catch (e) {
                // Table may not exist yet
            }

            // Count configured integrations (non-disabled)
            let integrationCount = 0;
            try {
                const integrationRows = await db.query(
                    'SELECT COUNT(*) AS cnt FROM printhouse_integration_profiles WHERE tenant_id = ? AND status <> ?',
                    [tenantId, 'DISABLED']
                );
                integrationCount = integrationRows[0]?.cnt || 0;
            } catch (e) {
                // Table may not exist yet
            }

            // Advisory: sites without machines
            const siteCount = (sites || []).length;
            if (siteCount > 0 && sitesWithMachines < siteCount) {
                operationalAdvisories.push({
                    code: 'SITES_WITHOUT_MACHINES',
                    module: 'MACHINES',
                    message: `${siteCount - sitesWithMachines} site(s) have no machines configured`
                });
            }

            // Calculate 5 operational requirements
            const totalRequirements = 5;
            let completedRequirements = 0;
            if (machineCount > 0) completedRequirements++;
            if (capabilityCount > 0) completedRequirements++;
            if (materialCount > 0) completedRequirements++;
            if (capacityCount > 0) completedRequirements++;
            if (leadTimesCount > 0) completedRequirements++;

            let status = 'NOT_STARTED';
            if (completedRequirements === totalRequirements && operationalBlockers.length === 0) {
                status = 'READY';
            } else if (completedRequirements > 0) {
                status = 'IN_PROGRESS';
            } else {
                status = 'NOT_STARTED';
            }

            return {
                status,
                available: false,
                machineCount,
                capabilityCount,
                sitesWithMachines,
                materialCount,
                capacityCount,
                leadTimesCount,
                shippingCount,
                integrationCount,
                completedRequirements,
                totalRequirements,
                blockingIssues: operationalBlockers,
                advisories: operationalAdvisories
            };
        } catch (err) {
            // Table may not exist yet — degrade gracefully
            return {
                status: 'NOT_AVAILABLE',
                available: false,
                machineCount: 0,
                capabilityCount: 0,
                sitesWithMachines: 0,
                materialCount: 0,
                capacityCount: 0,
                leadTimesCount: 0,
                shippingCount: 0,
                integrationCount: 0,
                completedRequirements: 0,
                totalRequirements: 5,
                blockingIssues: [],
                advisories: [],
                message: 'Onboarding tables not yet fully initialized.'
            };
        }
    }
}

module.exports = new PrinthouseReadinessService();
