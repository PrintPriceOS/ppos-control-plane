'use strict';

const fs = require('fs');
const path = require('path');

let PASS = 0, FAIL = 0;
function assert(condition, label) {
    if (condition) {
        PASS++;
        console.log(`  ✅  [PASS] ${label}`);
    } else {
        FAIL++;
        console.error(`  ❌  [FAIL] ${label}`);
    }
    return condition;
}

const ROOT = path.resolve(__dirname, '..');

async function runSmoke() {
    console.log('\n━━━ Phase 103E — Admin Provider Credential Vault API + UI Stubs Smoke ━━━\n');

    const adminRoute = path.join(ROOT, 'src/api/routes/adminFinancialOperationsProviderCredentialVault.js');
    assert(fs.existsSync(adminRoute), 'SC1: Route file exists');

    const uiAdmin = path.join(ROOT, 'src/ui/pages/financial-operations-provider-credential-vault');

    assert(fs.existsSync(path.join(uiAdmin, 'FinancialOperationsProviderCredentialVaultPage.tsx')), 'SC2: UI files exist');
    assert(fs.existsSync(path.join(uiAdmin, 'FinancialOperationsProviderCredentialVaultTable.tsx')), 'SC2: UI files exist');
    assert(fs.existsSync(path.join(uiAdmin, 'FinancialOperationsProviderCredentialRedactionPanel.tsx')), 'SC2: UI files exist');
    assert(fs.existsSync(path.join(uiAdmin, 'FinancialOperationsProviderCredentialRotationPanel.tsx')), 'SC2: UI files exist');

    const adminPageContent = fs.readFileSync(path.join(uiAdmin, 'FinancialOperationsProviderCredentialVaultPage.tsx'), 'utf-8');

    assert(adminPageContent.includes('Provider credential vault readiness only'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('This does not store live credentials'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('Live credentials are not used'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('Secrets are never displayed'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('Rotation readiness does not rotate credentials'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('This does not connect live providers'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('This does not execute payment'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('This does not execute refund'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('This does not execute payout'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('No external invoice submission is enabled'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('No tax filing is enabled'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('FULL_PUBLIC remains disabled'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('Prepared for credential vault readiness review only'), 'SC3: Required caution copy exists');

    const routeContent = fs.readFileSync(adminRoute, 'utf-8');
    assert(routeContent.includes('/vaults/:credentialVaultId/approve'), 'SC4: Vault actions exist');
    assert(routeContent.includes('/vaults/:credentialVaultId/rotation'), 'SC5: Rotation readiness actions exist');
    assert(routeContent.includes('/vaults/:credentialVaultId/guardrails'), 'SC6: Guardrail endpoint exists');
    assert(routeContent.includes('/audit'), 'SC7: Audit endpoint exists');

    assert(!routeContent.includes('executePayment') && !routeContent.includes('executeRefund'), 'SC8: No real execution exists');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 103E Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
