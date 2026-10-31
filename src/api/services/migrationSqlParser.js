'use strict';

/**
 * src/api/services/migrationSqlParser.js
 *
 * Deterministic MySQL migration SQL parser.
 *
 * Problem: naive content.split(';') cannot handle:
 *   - DELIMITER $$ ... $$ blocks (stored procedures, triggers, functions)
 *   - Internal semicolons inside BEGIN/END bodies
 *   - DELIMITER directives themselves (must never be sent to MySQL)
 *
 * This parser:
 *   1. Tracks the active delimiter (starts as ';')
 *   2. Recognises DELIMITER changes and updates tracking state
 *   3. Never emits DELIMITER directive lines as executable statements
 *   4. Accumulates chars until the active delimiter is found
 *   5. Emits each complete statement with its 1-based index and a stable fingerprint
 *   6. Handles single-line (-- and #) and block (/* … *\/) comments correctly
 *   7. Handles single-quoted and double-quoted strings correctly
 *
 * Returns: Array<{ index: number, sql: string, fingerprint: string }>
 */

const crypto = require('crypto');

/**
 * Compute a stable SHA-256 fingerprint of a SQL statement (first 16 hex chars).
 * @param {string} sql
 * @returns {string}
 */
function statementFingerprint(sql) {
    return crypto.createHash('sha256').update(sql.trim()).digest('hex').substring(0, 16);
}

/**
 * Parse a MySQL migration file into executable statements.
 *
 * @param {string} content - Raw file content (CRLF or LF)
 * @returns {{ statements: Array<{index:number, sql:string, fingerprint:string}>, delimiterChanges: number }}
 */
function parseMigrationSql(content) {
    // Normalise line endings
    const text = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    const statements = [];
    let delimiter = ';';
    let delimiterChanges = 0;
    let buf = '';
    let i = 0;
    const len = text.length;

    function pushStatement() {
        const trimmed = buf.trim();
        buf = '';
        if (trimmed.length === 0) return;
        const idx = statements.length + 1;
        statements.push({
            index: idx,
            sql: trimmed,
            fingerprint: statementFingerprint(trimmed)
        });
    }

    while (i < len) {
        // ── DELIMITER directive detection ──────────────────────────────────────
        // Must appear at the start of a line (possibly after whitespace in buf)
        // Pattern: DELIMITER <ws> <token>  (case-insensitive)
        if (/^DELIMITER\s/i.test(text.slice(i))) {
            // Flush any pending buffer (should be empty, but be safe)
            if (buf.trim().length > 0) pushStatement();
            buf = '';

            // Read to end of line
            let eol = text.indexOf('\n', i);
            if (eol === -1) eol = len;
            const directiveLine = text.slice(i, eol).trim();

            // Extract new delimiter token (everything after DELIMITER + whitespace)
            const newDelim = directiveLine.replace(/^DELIMITER\s+/i, '').trim();
            if (newDelim.length > 0) {
                delimiter = newDelim;
                delimiterChanges++;
            }

            i = eol + 1; // skip past the newline
            continue;
        }

        // ── Single-line comment -- ─────────────────────────────────────────────
        if (text[i] === '-' && text[i + 1] === '-') {
            let eol = text.indexOf('\n', i);
            if (eol === -1) eol = len;
            buf += text.slice(i, eol + 1);
            i = eol + 1;
            continue;
        }

        // ── Single-line comment # ─────────────────────────────────────────────
        if (text[i] === '#') {
            let eol = text.indexOf('\n', i);
            if (eol === -1) eol = len;
            buf += text.slice(i, eol + 1);
            i = eol + 1;
            continue;
        }

        // ── Block comment /* … */ ─────────────────────────────────────────────
        if (text[i] === '/' && text[i + 1] === '*') {
            const end = text.indexOf('*/', i + 2);
            if (end === -1) {
                buf += text.slice(i);
                i = len;
            } else {
                buf += text.slice(i, end + 2);
                i = end + 2;
            }
            continue;
        }

        // ── Quoted string (single-quote) ──────────────────────────────────────
        if (text[i] === "'") {
            let j = i + 1;
            while (j < len) {
                if (text[j] === '\\') { j += 2; continue; }
                if (text[j] === "'") { j++; break; }
                j++;
            }
            buf += text.slice(i, j);
            i = j;
            continue;
        }

        // ── Quoted string (double-quote) ──────────────────────────────────────
        if (text[i] === '"') {
            let j = i + 1;
            while (j < len) {
                if (text[j] === '\\') { j += 2; continue; }
                if (text[j] === '"') { j++; break; }
                j++;
            }
            buf += text.slice(i, j);
            i = j;
            continue;
        }

        // ── Backtick identifier ───────────────────────────────────────────────
        if (text[i] === '`') {
            let j = i + 1;
            while (j < len) {
                if (text[j] === '`') { j++; break; }
                j++;
            }
            buf += text.slice(i, j);
            i = j;
            continue;
        }

        // ── Delimiter match ───────────────────────────────────────────────────
        if (text.startsWith(delimiter, i)) {
            i += delimiter.length;
            pushStatement();
            continue;
        }

        // ── Regular character ─────────────────────────────────────────────────
        buf += text[i];
        i++;
    }

    // Flush any trailing content not terminated by a delimiter
    if (buf.trim().length > 0) pushStatement();

    return { statements, delimiterChanges };
}

module.exports = { parseMigrationSql, statementFingerprint };
