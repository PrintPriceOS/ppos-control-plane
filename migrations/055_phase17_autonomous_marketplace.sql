-- DDL Migration for Phase 17: Autonomous Manufacturing Marketplace
-- Implements sealed-bid auctions, real-time bid validation, and an audited, tamper-evident double-entry ledger chain.

CREATE TABLE IF NOT EXISTS marketplace_auctions (
    id VARCHAR(50) PRIMARY KEY,
    owner_node_id VARCHAR(50) NOT NULL,
    machine_category VARCHAR(100) NOT NULL,
    capacity_quantity INT NOT NULL DEFAULT 1,
    reserve_price DECIMAL(12, 4) NOT NULL,
    slot_start_time TIMESTAMP NOT NULL,
    slot_end_time TIMESTAMP NOT NULL,
    close_at TIMESTAMP NOT NULL,
    status ENUM('OPEN', 'MATCHED', 'EXPIRED') NOT NULL DEFAULT 'OPEN',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_auctions_node FOREIGN KEY (owner_node_id) REFERENCES federation_nodes (id) ON DELETE CASCADE,
    INDEX idx_auctions_status_close (status, close_at),
    INDEX idx_auctions_slot_start (slot_start_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS marketplace_bids (
    id VARCHAR(50) PRIMARY KEY,
    auction_id VARCHAR(50) NOT NULL,
    bidder_node_id VARCHAR(50) NOT NULL,
    bid_amount DECIMAL(12, 4) NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status ENUM('PENDING', 'WON', 'LOST', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    CONSTRAINT fk_bids_auction FOREIGN KEY (auction_id) REFERENCES marketplace_auctions (id) ON DELETE CASCADE,
    CONSTRAINT fk_bids_node FOREIGN KEY (bidder_node_id) REFERENCES federation_nodes (id) ON DELETE CASCADE,
    INDEX idx_bids_auction_amount (auction_id, bid_amount DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS marketplace_ledger (
    entry_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    transaction_id VARCHAR(50) NOT NULL,
    account_id VARCHAR(50) NOT NULL, -- e.g., 'node_andalucia_01_currency' or 'node_berlin_02_capacity'
    entry_type ENUM('DEBIT', 'CREDIT') NOT NULL,
    asset_type ENUM('CURRENCY', 'CAPACITY_UNITS') NOT NULL,
    amount DECIMAL(16, 4) NOT NULL,
    parent_hash VARCHAR(64) NOT NULL,
    cryptographic_hash VARCHAR(64) NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_ledger_tx (transaction_id),
    INDEX idx_ledger_hash (cryptographic_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
