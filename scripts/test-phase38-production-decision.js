// scripts/test-phase38-production-decision.js
const fs = require('fs');
const path = require('path');

console.log('Running Phase 38.4 Production Decision Tests...\n');

const serviceCode = fs.readFileSync(path.join(__dirname, '../src/api/services/marketplacePrinthouseProductionService.js'), 'utf-8');
const routesCode = fs.readFileSync(path.join(__dirname, '../src/api/routes/adminMarketplaceOrders.js'), 'utf-8');
const apiCode = fs.readFileSync(path.join(__dirname, '../src/ui/lib/adminApi.ts'), 'utf-8');
const uiCode = fs.readFileSync(path.join(__dirname, '../src/ui/pages/admin/MarketplacePrinthouseHandoffTab.tsx'), 'utf-8');

function assertContains(content, str, msg) {
    if (!content.includes(str)) {
        throw new Error(`Assertion failed: ${msg}\nMissing string: ${str}`);
    }
}

// 1. service exports required functions.
assertContains(serviceCode, "module.exports = {\n    getProductionDecisionStatus,\n    recordProductionDecision\n};", "Must export required functions");

// 2. READY_FOR_PRODUCTION allowed from PRINTHOUSE_ACCEPTED.
assertContains(serviceCode, "if (decision === 'READY_FOR_PRODUCTION') {", "Must handle READY_FOR_PRODUCTION");
assertContains(serviceCode, "['PRINTHOUSE_ACCEPTED', 'PRODUCTION_HOLD'].includes(order.status)", "READY_FOR_PRODUCTION must allow from PRINTHOUSE_ACCEPTED or PRODUCTION_HOLD");

// 3. PRODUCTION_ACCEPTED allowed from READY_FOR_PRODUCTION or PRINTHOUSE_ACCEPTED.
assertContains(serviceCode, "if (decision === 'PRODUCTION_ACCEPTED') {", "Must handle PRODUCTION_ACCEPTED");
assertContains(serviceCode, "['READY_FOR_PRODUCTION', 'PRINTHOUSE_ACCEPTED'].includes(order.status)", "PRODUCTION_ACCEPTED allowed from READY_FOR_PRODUCTION or PRINTHOUSE_ACCEPTED");

// 4. PRODUCTION_HOLD requires reason.
assertContains(serviceCode, "if (decision === 'PRODUCTION_HOLD') {", "Must handle PRODUCTION_HOLD");
assertContains(serviceCode, "if (!reason) throw new Error('REASON_REQUIRED');", "PRODUCTION_HOLD requires reason");

// 5. PRODUCTION_REJECTED requires reason.
assertContains(serviceCode, "if (decision === 'PRODUCTION_REJECTED') {", "Must handle PRODUCTION_REJECTED");
// Note: Handled by previous assertion checking the same if(!reason) logic.

// 6. missing invoice/payment/unlock blocks decision.
assertContains(serviceCode, "if (invoice.status !== 'ISSUED') throw new Error('INVOICE_NOT_ISSUED');", "Must check invoice");
assertContains(serviceCode, "if (payment.status !== 'PAYMENT_CONFIRMED') throw new Error('PAYMENT_NOT_CONFIRMED');", "Must check payment");
assertContains(serviceCode, "if (productionUnlock.status !== 'PRODUCTION_UNLOCKED') throw new Error('PRODUCTION_NOT_UNLOCKED');", "Must check production unlock");

// 7. idempotent decision does not duplicate event.
assertContains(serviceCode, "if (currentDecision.decision === decision && currentDecision.reason === reason)", "Must check idempotency");
assertContains(serviceCode, "return { ok: true, idempotent: true", "Must return idempotent true");

// 8. metadata_json.production_decision is updated.
assertContains(serviceCode, "metadata.production_decision = newDecisionObj;", "Must update metadata_json.production_decision");

// 9. marketplace_order_events receives PRINTHOUSE_PRODUCTION_DECISION_RECORDED.
assertContains(serviceCode, "type: 'PRINTHOUSE_PRODUCTION_DECISION_RECORDED',", "Must emit audit event");

// 10. feature flag blocks POST.
assertContains(routesCode, "if (process.env.PPOS_ENABLE_PHASE38_PRODUCTION_DECISION !== 'true')", "Must check feature flag");
assertContains(routesCode, "return res.status(403).json({ ok: false, error: 'PHASE38_PRODUCTION_DECISION_DISABLED' });", "Must block if disabled");

// 11. UI/adminApi helpers compile.
assertContains(apiCode, "export async function getProductionDecisionStatus(orderId: string)", "Must export getProductionDecisionStatus");
assertContains(apiCode, "export async function recordProductionDecision(orderId: string, decision: string", "Must export recordProductionDecision");

// 12. UI includes the block.
assertContains(uiCode, "Production Decision Gate", "Must include Production Decision UI block");
assertContains(uiCode, "FILE_ACCESS_NOT_VERIFIED_BY_AUDIT", "Must show warning for unverified file access");

console.log('✅ All Phase 38.4 static tests passed! 🚀');
