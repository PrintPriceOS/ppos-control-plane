/**
 * src/api/services/industrialAuctionService.js
 * 
 * Auction high-priority manufacturing jobs and select the best federation execution path.
 */
const db = require('./mysqlClient');
const logger = require('./logger').child('industrial-auction');
const { v4: uuidv4 } = require('uuid');

class IndustrialAuctionService {
    async createAuction(dispatchId, auctionConfig) {
        const id = uuidv4();
        try {
            await db.query(`
                INSERT INTO marketplace_dispatch_auctions 
                (id, dispatch_id, starting_bid, max_acceptable_bid, status)
                VALUES (?, ?, ?, ?, 'OPEN')
            `, [id, dispatchId, auctionConfig.startingBid || 0, auctionConfig.maxBid || 0]);
            logger.info({ event: 'auction_created', auctionId: id, dispatchId });
            return id;
        } catch (err) {
            logger.error({ event: 'auction_creation_failed', error: err.message });
            return null;
        }
    }

    async collectBids(auctionId) {
        try {
            const rows = await db.query('SELECT * FROM autonomous_factory_bids WHERE auction_id = ?', [auctionId]);
            return rows || [];
        } catch (err) {
            return [];
        }
    }

    async evaluateWinningFactory(auctionId) {
        const bids = await this.collectBids(auctionId);
        if (!bids || bids.length === 0) return null;
        
        // Simple mock evaluation: highest confidence score wins
        const sorted = bids.sort((a, b) => b.confidence_score - a.confidence_score);
        return sorted[0].factory_id;
    }

    async finalizeAuction(auctionId, winningFactoryId) {
        try {
            await db.query('UPDATE marketplace_dispatch_auctions SET status = "CLOSED", winning_factory_id = ? WHERE id = ?', [winningFactoryId, auctionId]);
            return true;
        } catch (err) {
            return false;
        }
    }
}

module.exports = new IndustrialAuctionService();
