'use strict';

/**
 * src/services/migrationIntegrity.js
 *
 * Convenience wrapper around `scripts/lib/migrationIntegrity.js` that defaults
 * `migrationsDir` and `baselinePath` to the repository's canonical `migrations/`
 * folder when invoked without arguments.
 */

const path = require('path');
const lib = require('../../scripts/lib/migrationIntegrity');

const DEFAULT_MIGRATIONS_DIR = path.resolve(__dirname, '../../migrations');
const DEFAULT_BASELINE_PATH = path.resolve(__dirname, '../../migrations/migration-integrity-baseline.json');

function verifyMigrationBaseline(migrationsDir = DEFAULT_MIGRATIONS_DIR, baselinePath = DEFAULT_BASELINE_PATH) {
    return lib.verifyMigrationBaseline(migrationsDir, baselinePath);
}

module.exports = {
    ...lib,
    verifyMigrationBaseline
};

