const fs = require('fs');
const path = require('path');

const uiDir = path.join(__dirname, '..', 'src', 'ui', 'pages', 'beta');
const apiDir = path.join(__dirname, '..', 'src', 'ui', 'api');
const typesDir = path.join(__dirname, '..', 'src', 'ui', 'types');

[uiDir, apiDir, typesDir].forEach(d => {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

fs.writeFileSync(path.join(uiDir, 'BetaInviteRedeemPage.tsx'), `// Beta Invite Redeem Page
// Banner: Invite-only beta — access is limited, reviewed, and subject to marketplace safeguards.
`);

fs.writeFileSync(path.join(uiDir, 'BetaRegistrationPage.tsx'), `// Beta Registration Page
`);

fs.writeFileSync(path.join(uiDir, 'BetaTermsPanel.tsx'), `// Beta Terms Panel
`);

fs.writeFileSync(path.join(uiDir, 'BetaLimitationsPanel.tsx'), `// Beta Limitations Panel
// beta can be paused or revoked.
// no guaranteed delivery.
// orders subject to review.
// files subject to preflight and approval.
// payment/proof gates may be required.
`);

fs.writeFileSync(path.join(uiDir, 'BetaOfferPage.tsx'), `// Beta Offer Page
// ACTIVATE CUSTOMER BETA COHORT
`);

fs.writeFileSync(path.join(uiDir, 'BetaOrderStartPage.tsx'), `// Beta Order Start Page
`);

fs.writeFileSync(path.join(uiDir, 'BetaSupportPanel.tsx'), `// Beta Support Panel
`);

fs.writeFileSync(path.join(apiDir, 'betaClient.ts'), `// Beta API Client
`);

fs.writeFileSync(path.join(typesDir, 'beta.ts'), `// Beta Types
`);

console.log('UI files scaffolded successfully.');
