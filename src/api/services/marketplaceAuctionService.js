const mysqlClient = require('../../utils/mysqlClient');
const ledgerService = require('./marketplaceLedgerService');
const logger = require('./logger').child('marketplace-auction');

class MarketplaceAuctionService {
  /**
   * Instantiates a new capacity allocation block on the network
   */
  async createAuction(auctionId, ownerNodeId, machineCategory, capacityQty, reservePrice, slotStart, slotEnd, closeAt) {
    const minLeadTime = 15 * 60 * 1000; // 15 minutes minimum margin window requirement
    if (new Date(slotStart).getTime() - new Date(closeAt).getTime() < minLeadTime) {
      throw new Error('Auction constraints violation: Bidding window close_at must terminate at least 15 minutes prior to slot start.');
    }

    await mysqlClient.query(
      `INSERT INTO marketplace_auctions 
       (id, owner_node_id, machine_category, capacity_quantity, reserve_price, slot_start_time, slot_end_time, close_at, status) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'OPEN')`,
      [auctionId, ownerNodeId, machineCategory, capacityQty, reservePrice, slotStart, slotEnd, closeAt]
    );

    logger.info({ event: 'auction_created', message: `Auction ${auctionId} opened for ${machineCategory} capacity slots.` });
    return { auctionId, status: 'OPEN' };
  }

  /**
   * Submits a sealed bid to an active capacity auction block
   */
  async placeBid(bidId, auctionId, bidderNodeId, bidAmount) {
    const auctions = await mysqlClient.query('SELECT * FROM marketplace_auctions WHERE id = ?', [auctionId]);
    if (!auctions || auctions.length === 0) throw new Error('Target auction not found.');

    const auction = auctions[0];
    if (auction.status !== 'OPEN' || new Date().getTime() >= new Date(auction.close_at).getTime()) {
      throw new Error('Bid rejected: Targeting a finalized, matched, or closed auction timeline.');
    }

    if (parseFloat(bidAmount) < parseFloat(auction.reserve_price)) {
      throw new Error(`Bid rejected: Bid amount drops below the stated reserve price baseline of ${auction.reserve_price}.`);
    }

    await mysqlClient.query(
      'INSERT INTO marketplace_bids (id, auction_id, bidder_node_id, bid_amount, status) VALUES (?, ?, ?, ?, "PENDING")',
      [bidId, auctionId, bidderNodeId, bidAmount]
    );

    return { bidId, status: 'PENDING' };
  }

  /**
   * Finalizes an open auction window using Sealed-Bid First-Price clearing criteria
   */
  async closeAuctionAndMatch(auctionId) {
    const auctions = await mysqlClient.query('SELECT * FROM marketplace_auctions WHERE id = ?', [auctionId]);
    if (!auctions || auctions.length === 0) throw new Error('Target auction not found.');

    const auction = auctions[0];
    if (auction.status !== 'OPEN') throw new Error('Auction is already processed.');

    // Enforce T-15 Minute Operational Safety-Margin Rule
    const currentTs = Date.now();
    const safetyLimit = new Date(auction.slot_start_time).getTime() - (15 * 60 * 1000);
    
    if (currentTs >= safetyLimit) {
      await mysqlClient.query('UPDATE marketplace_auctions SET status = "EXPIRED" WHERE id = ?', [auctionId]);
      await mysqlClient.query('UPDATE marketplace_bids SET status = "REJECTED" WHERE auction_id = ?', [auctionId]);
      logger.warn({ event: 'auction_safety_expiry', message: `Auction ${auctionId} expired out. Execution limit caught inside the 15-minute padding barrier.` });
      return { auctionId, status: 'EXPIRED', matchFound: false };
    }

    // Retrieve highest valid bidder payload
    const bids = await mysqlClient.query(
      'SELECT * FROM marketplace_bids WHERE auction_id = ? AND status = "PENDING" ORDER BY bid_amount DESC, timestamp ASC LIMIT 1',
      [auctionId]
    );

    if (!bids || bids.length === 0) {
      await mysqlClient.query('UPDATE marketplace_auctions SET status = "EXPIRED" WHERE id = ?', [auctionId]);
      return { auctionId, status: 'EXPIRED', matchFound: false };
    }

    const winningBid = bids[0];

    // Mark remaining losing bids
    await mysqlClient.query(
      'UPDATE marketplace_bids SET status = "LOST" WHERE auction_id = ? AND id != ?',
      [auctionId, winningBid.id]
    );

    // Build the double-entry transaction block allocation payload
    const txId = `tx_mkt_${Date.now()}_${auctionId.substr(0, 6)}`;
    const clearingPrice = parseFloat(winningBid.bid_amount);
    const capacityQty = parseInt(auction.capacity_quantity);

    const entries = [
      // Account 1: Debit currency allocation away from winning buyer node
      { account_id: `${winningBid.bidder_node_id}_currency`, entry_type: 'DEBIT', asset_type: 'CURRENCY', amount: clearingPrice },
      // Account 2: Credit currency allocation straight over to capacity selling node owner
      { account_id: `${auction.owner_node_id}_currency`, entry_type: 'CREDIT', asset_type: 'CURRENCY', amount: clearingPrice },
      // Account 3: Debit capacity units ownership out from the seller profile
      { account_id: `${auction.owner_node_id}_capacity`, entry_type: 'DEBIT', asset_type: 'CAPACITY_UNITS', amount: capacityQty },
      // Account 4: Credit capacity units ownership directly over to the winning bidder profile
      { account_id: `${winningBid.bidder_node_id}_capacity`, entry_type: 'CREDIT', asset_type: 'CAPACITY_UNITS', amount: capacityQty }
    ];

    // Seal everything immutably into the ledger via unified atomic execution
    await ledgerService.recordLedgerTransaction(txId, entries);

    // Finalize state modifications safely inside the persistent layer tables
    await mysqlClient.query('UPDATE marketplace_bids SET status = "WON" WHERE id = ?', [winningBid.id]);
    await mysqlClient.query('UPDATE marketplace_auctions SET status = "MATCHED" WHERE id = ?', [auctionId]);

    logger.info({ event: 'auction_matched_successfully', message: `Auction ${auctionId} cleared to node ${winningBid.bidder_node_id} at price ${clearingPrice}.` });
    return { auctionId, status: 'MATCHED', matchFound: true, winnerNodeId: winningBid.bidder_node_id, clearingPrice };
  }
}

module.exports = new MarketplaceAuctionService();
