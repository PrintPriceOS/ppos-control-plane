'use strict';

const db = require('./mysqlClient');
const manifest = require('../schema/schemaCapabilityManifest');
const SchemaNotReadyError = require('../errors/SchemaNotReadyError');

async function evaluateSchemaCompatibility() {
  try {
    // Fetch all tables and columns in the active database in a single query
    const rows = await db.query(`
      SELECT TABLE_NAME, COLUMN_NAME 
      FROM information_schema.columns 
      WHERE table_schema = DATABASE()
    `);

    // Organize into active schema map
    const activeSchema = {};
    for (const row of rows) {
      const tableName = row.TABLE_NAME.toLowerCase();
      const columnName = row.COLUMN_NAME.toLowerCase();
      if (!activeSchema[tableName]) {
        activeSchema[tableName] = new Set();
      }
      activeSchema[tableName].add(columnName);
    }

    const checks = [];
    let isOverallReady = true;

    for (const [capabilityName, cap] of Object.entries(manifest.capabilities)) {
      const missingTables = [];
      const missingColumns = [];

      for (const [tableName, tableSpec] of Object.entries(cap.tables)) {
        const lowerTableName = tableName.toLowerCase();
        if (!activeSchema[lowerTableName]) {
          missingTables.push(tableName);
          if (cap.required) {
            isOverallReady = false;
          }
          continue;
        }

        const activeCols = activeSchema[lowerTableName];
        for (const col of tableSpec.columns) {
          const lowerColName = col.toLowerCase();
          if (!activeCols.has(lowerColName)) {
            missingColumns.push(`${tableName}.${col}`);
            if (cap.required) {
              isOverallReady = false;
            }
          }
        }
      }

      checks.push({
        capability: capabilityName,
        status: (missingTables.length === 0 && missingColumns.length === 0) ? 'READY' : 'SCHEMA_NOT_READY',
        missingTables,
        missingColumns
      });
    }

    return {
      status: isOverallReady ? 'READY' : 'SCHEMA_NOT_READY',
      manifestVersion: manifest.manifestVersion,
      checkedAt: new Date().toISOString(),
      checks
    };
  } catch (err) {
    return {
      status: 'DATABASE_UNREACHABLE',
      manifestVersion: manifest.manifestVersion,
      checkedAt: new Date().toISOString(),
      checks: [],
      error: err.message
    };
  }
}

async function assertSchemaReady(capabilityName) {
  const result = await evaluateSchemaCompatibility();
  if (result.status === 'DATABASE_UNREACHABLE') {
    throw new SchemaNotReadyError(capabilityName || 'ALL', [{ message: 'Database unreachable', details: result.error }]);
  }
  
  if (capabilityName) {
    const check = result.checks.find(c => c.capability === capabilityName);
    if (!check || check.status !== 'READY') {
      throw new SchemaNotReadyError(capabilityName, check ? [...check.missingTables, ...check.missingColumns] : ['Capability not registered']);
    }
  } else {
    if (result.status !== 'READY') {
      const failedChecks = result.checks.filter(c => c.status !== 'READY');
      const allMissing = failedChecks.reduce((acc, curr) => acc.concat(curr.missingTables).concat(curr.missingColumns), []);
      throw new SchemaNotReadyError('MANDATORY_CAPABILITIES', allMissing);
    }
  }
}

module.exports = {
  evaluateSchemaCompatibility,
  assertSchemaReady
};
