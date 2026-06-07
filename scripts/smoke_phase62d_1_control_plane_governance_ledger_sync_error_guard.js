/**
 * Smoke Test — Phase 62D.1
 * Control Plane Governance Ledger: sync_error_json Type Guard
 *
 * Validates that normalizeSyncErrorText() handles every realistic value that the
 * preflight_job_registry.sync_error_json column may carry when read from MySQL
 * (raw string, already-parsed object, array, null, undefined, number, circular ref).
 *
 * Run:
 *   node scripts/smoke_phase62d_1_control_plane_governance_ledger_sync_error_guard.js
 */

'use strict';

// ─── Inline the helper so the test is self-contained ──────────────────────────
function normalizeSyncErrorText(value) {
    if (value == null) return '';
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.join(' ');
    try {
        return JSON.stringify(value);
    } catch {
        return String(value || '');
    }
}

// ─── Derive sourceStatus the same way the ledger service does ─────────────────
function deriveSourceStatus(sync_error_json) {
    return normalizeSyncErrorText(sync_error_json).includes('live_hydration_disabled')
        ? 'PERSISTENT_REGISTRY'
        : 'LIVE_UPSTREAM';
}

// ─── Test runner ──────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function assert(condition, label, extra) {
    if (condition) {
        console.log(`  ✅  ${label}`);
        passed++;
    } else {
        console.error(`  ❌  FAIL: ${label}`, extra !== undefined ? `| got: ${JSON.stringify(extra)}` : '');
        failed++;
    }
}

console.log('\n══════════════════════════════════════════════════════════');
console.log('  Phase 62D.1 — sync_error_json Type Guard Smoke Tests');
console.log('══════════════════════════════════════════════════════════\n');

// ─── 1. String containing the sentinel ────────────────────────────────────────
console.log('1. sync_error_json as string (with sentinel)');
{
    const val = 'live_hydration_disabled=true; reason=upstream_timeout';
    const normalized = normalizeSyncErrorText(val);
    assert(typeof normalized === 'string', 'Returns a string');
    assert(normalized === val, 'Preserves original string value');
    assert(deriveSourceStatus(val) === 'PERSISTENT_REGISTRY', 'sourceStatus → PERSISTENT_REGISTRY');
}

console.log('\n2. sync_error_json as string (without sentinel)');
{
    const val = 'upstream returned 502 Bad Gateway';
    const normalized = normalizeSyncErrorText(val);
    assert(typeof normalized === 'string', 'Returns a string');
    assert(deriveSourceStatus(val) === 'LIVE_UPSTREAM', 'sourceStatus → LIVE_UPSTREAM');
}

// ─── 2. Object (parsed JSON from MySQL JSON column) ───────────────────────────
console.log('\n3. sync_error_json as plain object (contains sentinel)');
{
    const val = { live_hydration_disabled: true, reason: 'upstream_timeout', code: 503 };
    const normalized = normalizeSyncErrorText(val);
    assert(typeof normalized === 'string', 'Returns a string');
    assert(normalized.includes('live_hydration_disabled'), 'Serialized text contains sentinel key');
    assert(deriveSourceStatus(val) === 'PERSISTENT_REGISTRY', 'sourceStatus → PERSISTENT_REGISTRY');
    // Must NOT throw
    let threw = false;
    try { normalizeSyncErrorText(val).includes('x'); } catch { threw = true; }
    assert(!threw, 'No TypeError on .includes() after normalization');
}

console.log('\n4. sync_error_json as plain object (no sentinel)');
{
    const val = { status: 404, message: 'job not found' };
    const normalized = normalizeSyncErrorText(val);
    assert(typeof normalized === 'string', 'Returns a string');
    assert(deriveSourceStatus(val) === 'LIVE_UPSTREAM', 'sourceStatus → LIVE_UPSTREAM');
}

// ─── 3. Array ─────────────────────────────────────────────────────────────────
console.log('\n5. sync_error_json as array (contains sentinel in element)');
{
    const val = ['live_hydration_disabled', 'upstream_error'];
    const normalized = normalizeSyncErrorText(val);
    assert(typeof normalized === 'string', 'Returns a string');
    assert(normalized.includes('live_hydration_disabled'), 'Joined array contains sentinel');
    assert(deriveSourceStatus(val) === 'PERSISTENT_REGISTRY', 'sourceStatus → PERSISTENT_REGISTRY');
}

console.log('\n6. sync_error_json as array (no sentinel)');
{
    const val = ['timeout', 'connection_reset'];
    assert(deriveSourceStatus(val) === 'LIVE_UPSTREAM', 'sourceStatus → LIVE_UPSTREAM');
    let threw = false;
    try { deriveSourceStatus(val); } catch { threw = true; }
    assert(!threw, 'No TypeError');
}

// ─── 4. null ──────────────────────────────────────────────────────────────────
console.log('\n7. sync_error_json as null');
{
    const val = null;
    const normalized = normalizeSyncErrorText(val);
    assert(normalized === '', 'Returns empty string for null');
    assert(deriveSourceStatus(val) === 'LIVE_UPSTREAM', 'sourceStatus → LIVE_UPSTREAM');
    let threw = false;
    try { normalizeSyncErrorText(val).includes('anything'); } catch { threw = true; }
    assert(!threw, 'No TypeError on .includes() after normalization');
}

// ─── 5. undefined ─────────────────────────────────────────────────────────────
console.log('\n8. sync_error_json as undefined');
{
    const val = undefined;
    const normalized = normalizeSyncErrorText(val);
    assert(normalized === '', 'Returns empty string for undefined');
    assert(deriveSourceStatus(val) === 'LIVE_UPSTREAM', 'sourceStatus → LIVE_UPSTREAM');
}

// ─── 6. Number ────────────────────────────────────────────────────────────────
console.log('\n9. sync_error_json as number');
{
    const val = 503;
    const normalized = normalizeSyncErrorText(val);
    assert(typeof normalized === 'string', 'Returns a string');
    assert(deriveSourceStatus(val) === 'LIVE_UPSTREAM', 'sourceStatus → LIVE_UPSTREAM');
    let threw = false;
    try { normalizeSyncErrorText(val).includes('x'); } catch { threw = true; }
    assert(!threw, 'No TypeError');
}

// ─── 7. Circular / malformed object (stringify would throw) ──────────────────
console.log('\n10. sync_error_json as circular object (JSON.stringify would throw)');
{
    const val = {};
    val.self = val; // circular reference
    let normalized;
    let threw = false;
    try {
        normalized = normalizeSyncErrorText(val);
    } catch {
        threw = true;
    }
    assert(!threw, 'normalizeSyncErrorText does not throw on circular object');
    assert(typeof normalized === 'string', 'Returns a string even for circular objects');
    // deriveSourceStatus must also be safe
    let threw2 = false;
    try { deriveSourceStatus(val); } catch { threw2 = true; }
    assert(!threw2, 'deriveSourceStatus does not throw on circular object');
}

// ─── 8. Empty string ─────────────────────────────────────────────────────────
console.log('\n11. sync_error_json as empty string');
{
    const val = '';
    const normalized = normalizeSyncErrorText(val);
    assert(normalized === '', 'Empty string returned as-is');
    assert(deriveSourceStatus(val) === 'LIVE_UPSTREAM', 'sourceStatus → LIVE_UPSTREAM');
}

// ─── 9. Boolean false ────────────────────────────────────────────────────────
console.log('\n12. sync_error_json as boolean false');
{
    const val = false;
    const normalized = normalizeSyncErrorText(val);
    assert(typeof normalized === 'string', 'Returns a string for boolean');
    let threw = false;
    try { deriveSourceStatus(val); } catch { threw = true; }
    assert(!threw, 'No TypeError for boolean false');
}

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════════════════');
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log('══════════════════════════════════════════════════════════\n');

if (failed > 0) {
    process.exit(1);
}
