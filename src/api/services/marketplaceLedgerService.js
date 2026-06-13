const mysqlClient = require('../../utils/mysqlClient');
const logger = require('./logger').child('marketplace-ledger');
const crypto = require('crypto');

class MarketplaceLedgerService {
  /**
   * Records balanced double-entry rows and seals them into the cryptographic chain
   */
  async recordLedgerTransaction(txId, entries) {
    // 1. Enforce double-entry validation check inside the app layer
    let balanceCheck = 0;
    for (const entry of entries) {
      const modifier = entry.entry_type === 'CREDIT' ? 1 : -1;
      balanceCheck += parseFloat(entry.amount) * modifier;
    }
    
    // Validate entry parity (Tolerance threshold grouping to absorb JS float rounding)
    if (Math.abs(balanceCheck) > 0.0001) {
      throw new Error(`Ledger Transaction rejected: Unbalanced entries detected. Imbalance: ${balanceCheck}`);
    }

    // 2. Retrieve the absolute head of the cryptographic ledger string to extract parent_hash
    const lastEntries = await mysqlClient.query(
      'SELECT cryptographic_hash FROM marketplace_ledger ORDER BY entry_id DESC LIMIT 1'
    );
    let parentHash = lastEntries[0]?.cryptographic_hash || '0000000000000000000000000000000000000000000000000000000000000000';

    const recordedEntries = [];

    // 3. Write entries sequentially to build the immutable cryptographic chain
    for (const entry of entries) {
      const contentString = `${txId}|${entry.account_id}|${entry.entry_type}|${entry.asset_type}|${entry.amount}|${parentHash}`;
      const cryptographicHash = crypto.createHash('sha256').update(contentString).digest('hex');

      await mysqlClient.query(
        `INSERT INTO marketplace_ledger 
         (transaction_id, account_id, entry_type, asset_type, amount, parent_hash, cryptographic_hash) 
         VALUES (?, ?, ?, ?, ?, ?, ?)` ,
        [txId, entry.account_id, entry.entry_type, entry.asset_type, entry.amount, parentHash, cryptographicHash]
      );

      // The current block's hash shifts into the parent pointer position for the next record row
      parentHash = cryptographicHash;
      recordedEntries.push({ txId, accountId: entry.account_id, cryptographicHash });
    }

    logger.info({ event: 'ledger_chain_extended', message: `Transaction ${txId} successfully sealed into ledger ledger chain.` });
    return recordedEntries;
  }
}

module.exports = new MarketplaceLedgerService();
