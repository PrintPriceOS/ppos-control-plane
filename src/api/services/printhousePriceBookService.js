/**
 * src/api/services/printhousePriceBookService.js
 * 
 * Manages the lifecycle and metadata operations for governed Printhouse Price Books.
 */
const db = require('./mysqlClient');
const crypto = require('crypto');

class PrinthousePriceBookService {
    /**
     * List all price books for a tenant.
     */
    async listPriceBooks(tenantId) {
        const rows = await db.query(
            'SELECT * FROM printhouse_price_books WHERE tenant_id = ? ORDER BY created_at DESC',
            [tenantId]
        );
        return rows || [];
    }

    /**
     * Create a new draft price book.
     */
    async createPriceBook(tenantId, { name, currency, effective_from, effective_to }) {
        if (!name || !currency) {
            throw new Error('Name and currency are required');
        }

        const id = `pb_${crypto.randomUUID()}`;
        await db.query(
            `INSERT INTO printhouse_price_books (
                id, tenant_id, name, status, currency, effective_from, effective_to, version
            ) VALUES (?, ?, ?, 'DRAFT', ?, ?, ?, 1)`,
            [
                id,
                tenantId,
                name,
                currency.toUpperCase(),
                effective_from ? new Date(effective_from) : null,
                effective_to ? new Date(effective_to) : null
            ]
        );

        return await this.getPriceBook(tenantId, id);
    }

    /**
     * Retrieve a specific price book by ID.
     */
    async getPriceBook(tenantId, priceBookId) {
        const [pb] = await db.query(
            'SELECT * FROM printhouse_price_books WHERE tenant_id = ? AND id = ?',
            [tenantId, priceBookId]
        );
        return pb || null;
    }

    /**
     * Update metadata for a draft price book.
     */
    async updatePriceBookMetadata(tenantId, priceBookId, { name, effective_from, effective_to }) {
        const pb = await this.getPriceBook(tenantId, priceBookId);
        if (!pb) {
            throw new Error('Price book not found');
        }

        if (pb.status !== 'DRAFT') {
            throw new Error('Only draft price books can be updated');
        }

        const fields = [];
        const params = [];

        if (name !== undefined) {
            fields.push('name = ?');
            params.push(name);
        }
        if (effective_from !== undefined) {
            fields.push('effective_from = ?');
            params.push(effective_from ? new Date(effective_from) : null);
        }
        if (effective_to !== undefined) {
            fields.push('effective_to = ?');
            params.push(effective_to ? new Date(effective_to) : null);
        }

        if (fields.length === 0) return pb;

        params.push(priceBookId, tenantId);
        await db.query(
            `UPDATE printhouse_price_books SET ${fields.join(', ')} WHERE id = ? AND tenant_id = ?`,
            params
        );

        return await this.getPriceBook(tenantId, priceBookId);
    }

    /**
     * Clone an existing price book into a new draft price book.
     * Clones metadata, rules, and quantity tiers.
     */
    async clonePriceBook(tenantId, sourcePriceBookId, { name }) {
        const sourcePb = await this.getPriceBook(tenantId, sourcePriceBookId);
        if (!sourcePb) {
            throw new Error('Source price book not found');
        }

        const connection = await db.getPool().getConnection();
        await connection.beginTransaction();

        try {
            const newPbId = `pb_${crypto.randomUUID()}`;
            const targetName = name || `${sourcePb.name} (Copy)`;

            // 1. Insert cloned Price Book record
            await connection.query(
                `INSERT INTO printhouse_price_books (
                    id, tenant_id, name, status, currency, effective_from, effective_to, version
                ) VALUES (?, ?, ?, 'DRAFT', ?, ?, ?, ?)`,
                [
                    newPbId,
                    tenantId,
                    targetName,
                    sourcePb.currency,
                    sourcePb.effective_from,
                    sourcePb.effective_to,
                    sourcePb.version + 1
                ]
            );

            // 2. Fetch rules to clone
            const rules = await connection.query(
                'SELECT * FROM printhouse_pricing_rules WHERE price_book_id = ? AND tenant_id = ?',
                [sourcePriceBookId, tenantId]
            );

            for (const r of rules || []) {
                const newRuleId = `pr_${crypto.randomUUID()}`;
                await connection.query(
                    `INSERT INTO printhouse_pricing_rules (
                        id, price_book_id, tenant_id, scope, site_id, machine_id, 
                        material_catalog_id, capability_name, pricing_unit, base_price, 
                        setup_charge, minimum_order_value, provenance
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        newRuleId,
                        newPbId,
                        tenantId,
                        r.scope,
                        r.site_id,
                        r.machine_id,
                        r.material_catalog_id,
                        r.capability_name,
                        r.pricing_unit,
                        r.base_price,
                        r.setup_charge,
                        r.minimum_order_value,
                        r.provenance
                    ]
                );

                // 3. Fetch quantity tiers to clone
                const tiers = await connection.query(
                    'SELECT * FROM printhouse_quantity_tiers WHERE pricing_rule_id = ?',
                    [r.id]
                );

                for (const t of tiers || []) {
                    await connection.query(
                        `INSERT INTO printhouse_quantity_tiers (
                            id, pricing_rule_id, min_quantity, max_quantity, unit_rate, flat_charge, method
                        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                        [
                            `qt_${crypto.randomUUID()}`,
                            newRuleId,
                            t.min_quantity,
                            t.max_quantity,
                            t.unit_rate,
                            t.flat_charge,
                            t.method
                        ]
                    );
                }
            }

            await connection.commit();
            connection.release();

            return await this.getPriceBook(tenantId, newPbId);
        } catch (err) {
            await connection.rollback();
            connection.release();
            throw err;
        }
    }

    /**
     * Update price book status obeying the lifecycle state machine.
     */
    async updatePriceBookStatus(tenantId, priceBookId, newStatus) {
        const pb = await this.getPriceBook(tenantId, priceBookId);
        if (!pb) {
            throw new Error('Price book not found');
        }

        const allowedTransitions = {
            DRAFT: ['VALIDATING', 'RETIRED'],
            VALIDATING: ['DRAFT', 'READY_FOR_REVIEW'],
            READY_FOR_REVIEW: ['APPROVED', 'DRAFT'],
            APPROVED: ['PUBLISHED', 'RETIRED'],
            PUBLISHED: ['RETIRED'],
            RETIRED: []
        };

        const currentStatus = pb.status;
        if (!allowedTransitions[currentStatus] || !allowedTransitions[currentStatus].includes(newStatus)) {
            throw new Error(`Invalid status transition from ${currentStatus} to ${newStatus}`);
        }

        // If transitioning to PUBLISHED, retire other active published price books for the tenant
        if (newStatus === 'PUBLISHED') {
            await db.query(
                "UPDATE printhouse_price_books SET status = 'RETIRED' WHERE tenant_id = ? AND status = 'PUBLISHED'",
                [tenantId]
            );
        }

        await db.query(
            'UPDATE printhouse_price_books SET status = ? WHERE id = ? AND tenant_id = ?',
            [newStatus, priceBookId, tenantId]
        );

        return await this.getPriceBook(tenantId, priceBookId);
    }

    /**
     * Archive or delete a price book.
     */
    async archivePriceBook(tenantId, priceBookId) {
        const pb = await this.getPriceBook(tenantId, priceBookId);
        if (!pb) {
            throw new Error('Price book not found');
        }

        if (pb.status === 'DRAFT') {
            // Delete draft books entirely
            await db.query('DELETE FROM printhouse_price_books WHERE id = ? AND tenant_id = ?', [priceBookId, tenantId]);
            return { deleted: true };
        } else {
            // Move non-draft price books to RETIRED status
            return await this.updatePriceBookStatus(tenantId, priceBookId, 'RETIRED');
        }
    }
}

module.exports = new PrinthousePriceBookService();
