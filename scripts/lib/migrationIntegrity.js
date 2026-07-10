'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function discoverMigrations(migrationsDir) {
  if (!fs.existsSync(migrationsDir)) {
    return { migrations: [], excluded: [] };
  }
  const files = fs.readdirSync(migrationsDir);
  const migrations = [];
  const excluded = [];

  for (const f of files) {
    const isSql = f.endsWith('.sql');
    const match = f.match(/^(\d+)[_-]/);
    
    if (isSql && match) {
      migrations.push({
        filename: f,
        relativePath: `migrations/${f}`,
        absolutePath: path.join(migrationsDir, f),
        prefix: match[1]
      });
    } else {
      excluded.push({
        filename: f,
        relativePath: `migrations/${f}`,
        reason: !isSql ? 'file does not have .sql extension' : 'filename does not match migration convention prefix (e.g. 001_...)'
      });
    }
  }

  migrations.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  excluded.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

  return { migrations, excluded };
}

function calculateFileChecksum(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const normalized = content.replace(/\r\n/g, '\n');
  return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
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

function verifyMigrationBaseline(migrationsDir, baselinePath) {
  try {
    const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
    const { migrations } = discoverMigrations(migrationsDir);
    
    const baselineMap = new Map();
    for (const m of baseline.migrations) {
      baselineMap.set(m.relativePath.replace(/\\/g, '/'), m);
    }
    
    if (migrations.length !== baseline.migrations.length) {
      return { ok: false, error: `Migration file count mismatch. Repo: ${migrations.length}, Baseline: ${baseline.migrations.length}` };
    }
    
    for (const m of migrations) {
      const relPath = m.relativePath.replace(/\\/g, '/');
      if (!baselineMap.has(relPath)) {
        return { ok: false, error: `Untracked migration file: ${relPath}` };
      }
      const record = baselineMap.get(relPath);
      const rawContent = fs.readFileSync(m.absolutePath);
      const checksumRaw = crypto.createHash('sha256').update(rawContent).digest('hex');
      const checksumLf = crypto.createHash('sha256').update(rawContent.toString('utf8').replace(/\r\n/g, '\n'), 'utf8').digest('hex');
      
      if (record.sha256 !== checksumRaw && record.sha256 !== checksumLf) {
        return { ok: false, error: `Checksum mismatch for ${relPath}. Expected: ${record.sha256}, Found Raw: ${checksumRaw}, LF: ${checksumLf}` };
      }
    }
    
    // Prefix collision validation
    const collisions = findPrefixCollisions(migrations);
    const baselineCollisions = baseline.approvedPrefixCollisions || {};
    
    for (const [prefix, paths] of Object.entries(collisions)) {
      const normPaths = paths.map(p => p.replace(/\\/g, '/'));
      const approved = baselineCollisions[prefix];
      if (!approved) {
        return { ok: false, error: `Unapproved prefix collision for "${prefix}"` };
      }
      const sortedApproved = [...approved].sort();
      const sortedNormPaths = [...normPaths].sort();
      if (JSON.stringify(sortedApproved) !== JSON.stringify(sortedNormPaths)) {
        return { ok: false, error: `Approved collision membership changed for prefix "${prefix}"` };
      }
    }
    
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = {
  discoverMigrations,
  calculateFileChecksum,
  classifySqlStatements,
  loadMigrationBaseline,
  findPrefixCollisions,
  scanRuntimeSchemaMutations,
  verifyMigrationBaseline
};
