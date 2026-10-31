/**
 * src/api/services/marketplaceDigitalTwinService.js
 * 
 * Economic observability layer for marketplace health, federation economic pressure,
 * and capacity liquidity index.
 */
const db = require('./mysqlClient');
const logger = require('./logger').child('marketplace-twin');
const { v4: uuidv4 } = require('uuid');

class MarketplaceDigitalTwinService {
    async generateMarketplaceSnapshot() {
        const id = uuidv4();
        const snapshot = {
            id,
            liquidity_index: await this.computeLiquidityIndex(),
            trade_velocity: await this.computeTradeVelocity(),
            economic_pressure: await this.computeEconomicPressure(),
            timestamp: new Date().toISOString()
        };
        try {
            await db.query(`
                INSERT INTO marketplace_economic_snapshots 
                (id, liquidity_index, trade_velocity, economic_pressure)
                VALUES (?, ?, ?, ?)
            `, [snapshot.id, snapshot.liquidity_index, snapshot.trade_velocity, snapshot.economic_pressure]);
            return snapshot;
        } catch (err) {
            logger.error({ event: 'marketplace_snapshot_failed', error: err.message });
            return { ...snapshot, degraded: true };
        }
    }

    async computeLiquidityIndex() {
        try {
            const [rows] = await db.query('SELECT COUNT(*) as active FROM marketplace_capacity_offers WHERE status = "ACTIVE"');
            return Math.min(100, (rows?.active || 0) * 10);
        } catch (err) {
            return 50;
        }
    }

    async computeTradeVelocity() {
        try {
            const [rows] = await db.query('SELECT COUNT(*) as trades FROM federation_trade_ledger WHERE created_at >= NOW() - INTERVAL 1 HOUR');
            return rows?.trades || 0;
        } catch (err) {
            return 0;
        }
    }

    async computeEconomicPressure() {
        // Mock computation
        return 35.5;
    }

    async getLatestSnapshot() {
        try {
            const [row] = await db.query('SELECT * FROM marketplace_economic_snapshots ORDER BY created_at DESC LIMIT 1');
            return row || this.generateDegradedSnapshot();
        } catch (err) {
            return this.generateDegradedSnapshot();
        }
    }

    generateDegradedSnapshot() {
        return {
            id: 'mock_snapshot',
            liquidity_index: 0,
            trade_velocity: 0,
            economic_pressure: 0,
            degraded: true,
            timestamp: new Date().toISOString()
        };
    }
}

module.exports = new MarketplaceDigitalTwinService();
