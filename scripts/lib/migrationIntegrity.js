'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function discoverMigrations(migrationsDir) {
  if (!fs.existsSync(migrationsDir)) {
    return [];
  }
  const files = fs.readdirSync(migrationsDir);
  return files
    .filter(f => f.endsWith('.sql'))
    .map(f => {
      const match = f.match(/^(\d+)[_-]/);
      const prefix = match ? match[1] : null;
      return {
        filename: f,
        relativePath: `migrations/${f}`,
        absolutePath: path.join(migrationsDir, f),
        prefix: prefix
      };
    })
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

function calculateFileChecksum(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

function classifySqlStatements(content) {
  // Strip comments (simple check for -- and /* */)
  const noComments = content
    .replace(/--.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  const ddlKeywords = [
    'CREATE TABLE', 'ALTER TABLE', 'DROP TABLE',
    'CREATE INDEX', 'DROP INDEX', 'RENAME TABLE',
    'TRUNCATE', 'CREATE VIEW', 'DROP VIEW',
    'CREATE TRIGGER', 'DROP TRIGGER', 'CREATE PROCEDURE',
    'DROP PROCEDURE'
  ];

  const dmlKeywords = [
    'INSERT INTO', 'UPDATE ', 'DELETE FROM', 'REPLACE INTO'
  ];

  const statementTypes = [];
  let containsDdl = false;
  let containsDml = false;

  const upperContent = noComments.toUpperCase();

  for (const kw of ddlKeywords) {
    // Exact or word boundary matches
    const regex = new RegExp(`\\b${kw.replace(' ', '\\s+')}\\b`, 'i');
    if (regex.test(upperContent)) {
      statementTypes.push(kw.replace(' ', '_'));
      containsDdl = true;
    }
  }

  for (const kw of dmlKeywords) {
    const regex = new RegExp(`\\b${kw.trim().replace(' ', '\\s+')}\\b`, 'i');
    if (regex.test(upperContent)) {
      containsDml = true;
    }
  }

  const transactionKeywords = ['START TRANSACTION', 'COMMIT', 'ROLLBACK'];
  let containsTransaction = false;
  for (const kw of transactionKeywords) {
    const regex = new RegExp(`\\b${kw.replace(' ', '\\s+')}\\b`, 'i');
    if (regex.test(upperContent)) {
      containsTransaction = true;
    }
  }

  return {
    containsDdl,
    containsDml,
    containsTransaction,
    statementTypes
  };
}

function loadMigrationBaseline(baselinePath) {
  if (!fs.existsSync(baselinePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
  } catch (err) {
    throw new Error(`Failed to parse baseline JSON: ${err.message}`);
  }
}

function findPrefixCollisions(migrations) {
  const prefixes = {};
  for (const m of migrations) {
    if (m.prefix) {
      if (!prefixes[m.prefix]) {
        prefixes[m.prefix] = [];
      }
      prefixes[m.prefix].push(m.relativePath);
    }
  }
  const collisions = {};
  for (const [prefix, paths] of Object.entries(prefixes)) {
    if (paths.length > 1) {
      collisions[prefix] = paths.sort();
    }
  }
  return collisions;
}

function scanRuntimeSchemaMutations(rootDir) {
  const targets = [
    'src/api/services/controlPlaneSchemaService.js',
    'src/api/services/industrialProvisioningService.js',
    'src/api/services/preflightRegistrySyncService.js',
    'src/api/routes/adminPreflightJobs.js',
    'server.js'
  ];

  const ddlPatterns = [
    { op: 'CREATE TABLE', regex: /\bcreate\s+table\b/i },
    { op: 'ALTER TABLE', regex: /\balter\s+table\b/i },
    { op: 'DROP TABLE', regex: /\bdrop\s+table\b/i },
    { op: 'CREATE INDEX', regex: /\bcreate\s+index\b/i },
    { op: 'DROP INDEX', regex: /\bdrop\s+index\b/i },
    { op: 'RENAME TABLE', regex: /\brename\s+table\b/i },
    { op: 'TRUNCATE', regex: /\btruncate\b/i }
  ];

  const findings = [];

  for (const relPath of targets) {
    const absPath = path.join(rootDir, relPath);
    if (!fs.existsSync(absPath)) {
      continue;
    }

    const lines = fs.readFileSync(absPath, 'utf8').split('\n');
    lines.forEach((line, index) => {
      // Basic comment skipping for Javascript
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
        return;
      }

      for (const p of ddlPatterns) {
        if (p.regex.test(line)) {
          findings.push({
            file: relPath.replace(/\\/g, '/'),
            line: index + 1,
            operation: p.op,
            snippet: trimmed,
            startupReachable: relPath === 'server.js' || relPath.includes('controlPlaneSchemaService') || relPath.includes('industrialProvisioningService') ? 'Possible/Analyzed' : 'No',
            requestReachable: relPath.includes('adminPreflightJobs') ? 'Yes' : 'No'
          });
        }
      }
    });
  }

  return findings;
}

module.exports = {
  discoverMigrations,
  calculateFileChecksum,
  classifySqlStatements,
  loadMigrationBaseline,
  findPrefixCollisions,
  scanRuntimeSchemaMutations
};
