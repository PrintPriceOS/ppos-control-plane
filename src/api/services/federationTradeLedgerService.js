/**
 * src/api/services/federationTradeLedgerService.js
 * 
 * Persist inter-factory commercial activity, margin tracking, transaction history,
 * and cross-factory settlements.
 */
const db = require('./mysqlClient');
const logger = require('./logger').child('trade-ledger');
const { v4: uuidv4 } = require('uuid');

class FederationTradeLedgerService {
    async registerTrade(tradeDef) {
        const id = uuidv4();
        try {
            await db.query(`
                INSERT INTO federation_trade_ledger 
                (id, source_factory_id, target_factory_id, dispatch_id, margin_transferred, status)
                VALUES (?, ?, ?, ?, ?, 'COMPLETED')
            `, [id, tradeDef.sourceId, tradeDef.targetId, tradeDef.dispatchId, tradeDef.margin]);
            return id;
        } catch (err) {
            logger.error({ event: 'trade_registration_failed', error: err.message });
            return null;
        }
    }

    async computeFactoryBalance(factoryId) {
        try {
            const rows = await db.query('SELECT SUM(margin_transferred) as balance FROM federation_trade_ledger WHERE target_factory_id = ? AND status = "COMPLETED"', [factoryId]);
            return rows[0]?.balance || 0;
        } catch (err) {
            return 0;
        }
    }

    async getFederationRevenue() {
        try {
            const rows = await db.query('SELECT SUM(margin_transferred) as revenue FROM federation_trade_ledger WHERE status = "COMPLETED"');
            return rows[0]?.revenue || 0;
        } catch (err) {
            return 0;
        }
    }

    async getTradeHistory() {
        try {
            return await db.query('SELECT * FROM federation_trade_ledger ORDER BY created_at DESC LIMIT 50');
        } catch (err) {
            return [];
        }
    }
}

module.exports = new FederationTradeLedgerService();
