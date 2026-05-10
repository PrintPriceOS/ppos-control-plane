/**
 * src/api/services/manufacturingMarketplaceService.js
 * 
 * Global marketplace registry for active production offers, open dispatch opportunities,
 * and capacity exchange orchestration.
 */
const db = require('./mysqlClient');
const logger = require('./logger').child('manufacturing-marketplace');
const { v4: uuidv4 } = require('uuid');

class ManufacturingMarketplaceService {
    async publishFactoryCapacity(factoryId, capacityDef) {
        const id = uuidv4();
        const sql = `
            INSERT INTO marketplace_capacity_offers 
            (id, factory_id, capacity_type, available_slots, min_margin_score, expires_at, status)
            VALUES (?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 1 HOUR), 'ACTIVE')
        `;
        try {
            await db.query(sql, [id, factoryId, capacityDef.type, capacityDef.slots, capacityDef.minMargin || 0]);
            logger.info({ event: 'capacity_published', factoryId, offerId: id });
            return id;
        } catch (err) {
            logger.error({ event: 'capacity_publish_failed', error: err.message });
            return null;
        }
    }

    async createMarketplaceOffer(offerDef) {
        // Alias for publishFactoryCapacity based on spec
        return this.publishFactoryCapacity(offerDef.factoryId, offerDef);
    }

    async assignMarketplaceOpportunity(dispatchId, factoryId) {
        try {
            await db.query('UPDATE manufacturing_dispatches SET delegated_factory_id = ?, status = ? WHERE id = ?', [factoryId, 'DELEGATED', dispatchId]);
            logger.info({ event: 'opportunity_assigned', dispatchId, factoryId });
            return true;
        } catch (err) {
            logger.error({ event: 'opportunity_assign_failed', error: err.message });
            return false;
        }
    }

    async closeMarketplaceTransaction(offerId) {
        try {
            await db.query('UPDATE marketplace_capacity_offers SET status = "CLOSED" WHERE id = ?', [offerId]);
            return true;
        } catch (err) {
            return false;
        }
    }

    async getMarketplaceHealth() {
        try {
            const [offers] = await db.query('SELECT COUNT(*) as active_offers FROM marketplace_capacity_offers WHERE status = "ACTIVE"');
            return {
                status: 'OPERATIONAL',
                active_offers: offers?.active_offers || 0,
                timestamp: new Date().toISOString()
            };
        } catch (err) {
            return { status: 'DEGRADED', error: err.message, active_offers: 0 };
        }
    }
}

module.exports = new ManufacturingMarketplaceService();
