-- migrations/001_create_schema_version.sql
CREATE TABLE IF NOT EXISTS schema_versions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    version VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    checksum VARCHAR(64) NOT NULL
);

INSERT IGNORE INTO schema_versions (version, description, checksum)
VALUES ('1.0.0', 'Initial Production Baseline', '0000000000000000000000000000000000000000000000000000000000000000');
