/**
 * src/api/services/printhousePricingRuleService.js
 * 
 * Manages pricing rules and quantity tiers within a Printhouse Price Book.
 */
const db = require('./mysqlClient');
const crypto = require('crypto');
const priceBookService = require('./printhousePriceBookService');

class PrinthousePricingRuleService {
    /**
     * Retrieve all pricing rules for a price book, including their quantity tiers.
     */
    async getRules(tenantId, priceBookId) {
        const pb = await priceBookService.getPriceBook(tenantId, priceBookId);
        if (!pb) {
            throw new Error('Price book not found');
        }

        const rules = await db.query(
            'SELECT * FROM printhouse_pricing_rules WHERE price_book_id = ? AND tenant_id = ? ORDER BY created_at ASC',
            [priceBookId, tenantId]
        );

        const rulesWithTiers = [];
        for (const r of rules || []) {
            const tiers = await db.query(
                'SELECT * FROM printhouse_quantity_tiers WHERE pricing_rule_id = ? ORDER BY min_quantity ASC',
                [r.id]
            );
            rulesWithTiers.push({
                ...r,
                tiers: tiers || []
            });
        }

        return rulesWithTiers;
    }

    /**
     * Add a new pricing rule with optional quantity tiers.
     */
    async addRule(tenantId, priceBookId, ruleData) {
        const pb = await priceBookService.getPriceBook(tenantId, priceBookId);
        if (!pb) {
            throw new Error('Price book not found');
        }

        if (pb.status !== 'DRAFT') {
            throw new Error('Only draft price books can be modified');
        }

        const {
            scope, site_id, machine_id, material_catalog_id, capability_name,
            pricing_unit, base_price, setup_charge, minimum_order_value, provenance,
            tiers
        } = ruleData;

        if (!scope || !pricing_unit) {
            throw new Error('Scope and pricing unit are required');
        }

        const connection = await db.getPool().getConnection();
        await connection.beginTransaction();

        try {
            const ruleId = `pr_${crypto.randomUUID()}`;

            // Insert rule
            await connection.query(
                `INSERT INTO printhouse_pricing_rules (
                    id, price_book_id, tenant_id, scope, site_id, machine_id, 
                    material_catalog_id, capability_name, pricing_unit, base_price, 
                    setup_charge, minimum_order_value, provenance
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    ruleId,
                    priceBookId,
                    tenantId,
                    scope,
                    site_id || null,
                    machine_id || null,
                    material_catalog_id || null,
                    capability_name || null,
                    pricing_unit,
                    base_price || 0,
                    setup_charge || 0,
                    minimum_order_value || 0,
                    provenance || 'TENANT_DEFINED'
                ]
            );

            // Insert tiers if provided
            if (Array.isArray(tiers)) {
                for (const t of tiers) {
                    await connection.query(
                        `INSERT INTO printhouse_quantity_tiers (
                            id, pricing_rule_id, min_quantity, max_quantity, unit_rate, flat_charge, method
                        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                        [
                            `qt_${crypto.randomUUID()}`,
                            ruleId,
                            t.min_quantity || 0,
                            t.max_quantity === undefined ? null : t.max_quantity,
                            t.unit_rate || 0,
                            t.flat_charge || 0,
                            t.method || 'UNIT_PRICE'
                        ]
                    );
                }
            }

            await connection.commit();
            connection.release();

            return await this.getRule(tenantId, priceBookId, ruleId);
        } catch (err) {
            await connection.rollback();
            connection.release();
            throw err;
        }
    }

    /**
     * Update a pricing rule and replace its quantity tiers.
     */
    async updateRule(tenantId, priceBookId, ruleId, ruleData) {
        const pb = await priceBookService.getPriceBook(tenantId, priceBookId);
        if (!pb) {
            throw new Error('Price book not found');
        }

        if (pb.status !== 'DRAFT') {
            throw new Error('Only draft price books can be modified');
        }

        const existingRule = await this.getRule(tenantId, priceBookId, ruleId);
        if (!existingRule) {
            throw new Error('Pricing rule not found');
        }

        const {
            scope, site_id, machine_id, material_catalog_id, capability_name,
            pricing_unit, base_price, setup_charge, minimum_order_value, provenance,
            tiers
        } = ruleData;

        const connection = await db.getPool().getConnection();
        await connection.beginTransaction();

        try {
            // Update rule metadata/prices
            await connection.query(
                `UPDATE printhouse_pricing_rules SET
                    scope = ?, site_id = ?, machine_id = ?, material_catalog_id = ?,
                    capability_name = ?, pricing_unit = ?, base_price = ?,
                    setup_charge = ?, minimum_order_value = ?, provenance = ?
                 WHERE id = ? AND tenant_id = ? AND price_book_id = ?`,
                [
                    scope || existingRule.scope,
                    site_id !== undefined ? site_id : existingRule.site_id,
                    machine_id !== undefined ? machine_id : existingRule.machine_id,
                    material_catalog_id !== undefined ? material_catalog_id : existingRule.material_catalog_id,
                    capability_name !== undefined ? capability_name : existingRule.capability_name,
                    pricing_unit || existingRule.pricing_unit,
                    base_price !== undefined ? base_price : existingRule.base_price,
                    setup_charge !== undefined ? setup_charge : existingRule.setup_charge,
                    minimum_order_value !== undefined ? minimum_order_value : existingRule.minimum_order_value,
                    provenance || existingRule.provenance,
                    ruleId,
                    tenantId,
                    priceBookId
                ]
            );

            // If tiers array is explicitly provided, delete existing and re-insert
            if (Array.isArray(tiers)) {
                await connection.query('DELETE FROM printhouse_quantity_tiers WHERE pricing_rule_id = ?', [ruleId]);
                for (const t of tiers) {
                    await connection.query(
                        `INSERT INTO printhouse_quantity_tiers (
                            id, pricing_rule_id, min_quantity, max_quantity, unit_rate, flat_charge, method
                        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                        [
                            `qt_${crypto.randomUUID()}`,
                            ruleId,
                            t.min_quantity || 0,
                            t.max_quantity === undefined ? null : t.max_quantity,
                            t.unit_rate || 0,
                            t.flat_charge || 0,
                            t.method || 'UNIT_PRICE'
                        ]
                    );
                }
            }

            await connection.commit();
            connection.release();

            return await this.getRule(tenantId, priceBookId, ruleId);
        } catch (err) {
            await connection.rollback();
            connection.release();
            throw err;
        }
    }

    /**
     * Delete/archive a pricing rule.
     */
    async deleteRule(tenantId, priceBookId, ruleId) {
        const pb = await priceBookService.getPriceBook(tenantId, priceBookId);
        if (!pb) {
            throw new Error('Price book not found');
        }

        if (pb.status !== 'DRAFT') {
            throw new Error('Only draft price books can be modified');
        }

        const existingRule = await this.getRule(tenantId, priceBookId, ruleId);
        if (!existingRule) {
            throw new Error('Pricing rule not found');
        }

        await db.query(
            'DELETE FROM printhouse_pricing_rules WHERE id = ? AND tenant_id = ? AND price_book_id = ?',
            [ruleId, tenantId, priceBookId]
        );

        return { deleted: true };
    }

    /**
     * Retrieve a specific rule.
     */
    async getRule(tenantId, priceBookId, ruleId) {
        const [r] = await db.query(
            'SELECT * FROM printhouse_pricing_rules WHERE id = ? AND tenant_id = ? AND price_book_id = ?',
            [ruleId, tenantId, priceBookId]
        );
        if (!r) return null;

        const tiers = await db.query(
            'SELECT * FROM printhouse_quantity_tiers WHERE pricing_rule_id = ? ORDER BY min_quantity ASC',
            [ruleId]
        );

        return {
            ...r,
            tiers: tiers || []
        };
    }
}

module.exports = new PrinthousePricingRuleService();
