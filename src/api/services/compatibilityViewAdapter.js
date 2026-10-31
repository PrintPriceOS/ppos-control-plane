'use strict';

/**
 * src/api/services/compatibilityViewAdapter.js
 *
 * Governed Compatibility View Adapter for Migration 161 & Industrial Persistence.
 *
 * Handles MySQL error ER_WRONG_OBJECT (errno 1347: "'<name>' is not VIEW") when
 * executing `CREATE OR REPLACE VIEW <viewName> AS ...` on schemas where legacy
 * BASE TABLEs already exist with data.
 *
 * Invariants & Policies:
 * - Scoped strictly to authorized compatibility view names:
 *   - production_packages
 *   - production_events
 *   - production_notifications
 *   - capacity_reservations
 *   - production_dispatches
 *   - production_offers
 *   - production_offer_events
 * - If the object already exists in INFORMATION_SCHEMA.TABLES as 'BASE TABLE':
 *   - Verifies the table is readable (SELECT 1 FROM <tableName> LIMIT 1).
 *   - Preserves the physical BASE TABLE and all its existing rows without mutation.
 *   - Returns { handled: true, action: 'PRESERVED_BASE_TABLE', objectName }.
 * - If the object is NOT a readable BASE TABLE, rethrows the original error (fail-closed).
 */

const logger = require('./logger').child('compatibility-view-adapter');
const { stripLeadingSqlComments } = require('./legacyPhaseMarkerAdapter');

const AUTHORIZED_COMPATIBILITY_VIEWS = Object.freeze([
  'production_packages',
  'production_events',
  'production_notifications',
  'capacity_reservations',
  'production_dispatches',
  'production_offers',
  'production_offer_events'
]);

const CREATE_VIEW_REGEX = /^\s*CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:`?([a-zA-Z0-9_]+)`?\.)?`?([a-zA-Z0-9_]+)`?/i;

/**
 * Checks if a SQL string is a CREATE VIEW statement targeting an authorized compatibility view.
 * @param {string} sql
 * @returns {{ isCompatView: boolean, viewName: string|null }}
 */
function inspectCompatibilityViewStatement(sql) {
  if (!sql || typeof sql !== 'string') {
    return { isCompatView: false, viewName: null };
  }
  const clean = stripLeadingSqlComments(sql);
  const match = clean.match(CREATE_VIEW_REGEX);
  if (!match) {
    return { isCompatView: false, viewName: null };
  }
  const viewName = match[2] || match[1];
  const isAuthorized = AUTHORIZED_COMPATIBILITY_VIEWS.includes(viewName.toLowerCase());
  return {
    isCompatView: isAuthorized,
    viewName: isAuthorized ? viewName.toLowerCase() : null
  };
}

/**
 * Governed error handler for ER_WRONG_OBJECT / errno 1347 during view creation.
 *
 * @param {object} connection - MySQL connection
 * @param {string} sql - Statement that failed
 * @param {Error} err - MySQL error thrown
 * @returns {Promise<boolean>} - true if handled and safely bypassed, false if unhandled
 */
async function handleCompatibilityViewError(connection, sql, err) {
  const isWrongObject = err && (err.code === 'ER_WRONG_OBJECT' || err.errno === 1347);
  if (!isWrongObject) {
    return false;
  }

  const { isCompatView, viewName } = inspectCompatibilityViewStatement(sql);
  if (!isCompatView || !viewName) {
    return false;
  }

  // Inspect INFORMATION_SCHEMA to confirm the conflicting object is a BASE TABLE
  const [rows] = await connection.query(`
    SELECT TABLE_TYPE
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
  `, [viewName]);

  if (!rows || rows.length === 0) {
    return false;
  }

  const tableType = rows[0].TABLE_TYPE;
  if (tableType !== 'BASE TABLE') {
    return false;
  }

  // Verify functional readability of the existing legacy base table
  try {
    await connection.query(`SELECT 1 FROM \`${viewName}\` LIMIT 1`);
  } catch (verifyErr) {
    logger.error({
      event: 'compatibility_view_base_table_unreadable',
      viewName,
      error: verifyErr.message
    });
    return false;
  }

  logger.info({
    event: 'compatibility_view_preserved_base_table',
    viewName,
    message: `Preserved existing BASE TABLE '${viewName}' and bypassed CREATE OR REPLACE VIEW due to pre-existing legacy table.`
  });

  return true;
}

module.exports = {
  AUTHORIZED_COMPATIBILITY_VIEWS,
  inspectCompatibilityViewStatement,
  handleCompatibilityViewError
};
