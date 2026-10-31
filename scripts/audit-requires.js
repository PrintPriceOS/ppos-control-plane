/**
 * audit-requires.js
 * 
 * Verifies that all routes and services can be successfully required
 * without throwing errors (e.g. missing modules, syntax errors).
 */
const path = require('path');

const filesToAudit = [
    path.join(__dirname, '../src/api/routes/authRoutes'),
    path.join(__dirname, '../src/api/routes/admin'),
    path.join(__dirname, '../src/api/routes/analyticsV2'),
    path.join(__dirname, '../src/api/routes/system'),
    path.join(__dirname, '../src/api/routes/adminPreflight'),
    path.join(__dirname, '../src/api/routes/adminProduction'),
    path.join(__dirname, '../src/api/routes/artifactAdmin'),
    path.join(__dirname, '../src/api/routes/notifications'),
    path.join(__dirname, '../src/api/routes/ordersAdmin'),
    path.join(__dirname, '../src/api/routes/pricingAdmin'),
    path.join(__dirname, '../src/api/routes/printhousesAdmin'),
    path.join(__dirname, '../src/api/services/printhouseService'),
    path.join(__dirname, '../src/api/services/controlUserService')
];

console.log('--- REQUIRE AUDIT START ---');
let failed = false;

filesToAudit.forEach(file => {
    try {
        require(file);
        console.log(`[OK] ${file}`);
    } catch (err) {
        console.error(`[FAIL] ${file}`);
        console.error(err);
        failed = true;
    }
});

if (failed) {
    console.error('--- AUDIT FAILED ---');
    process.exit(1);
} else {
    console.log('--- AUDIT PASSED ---');
}
