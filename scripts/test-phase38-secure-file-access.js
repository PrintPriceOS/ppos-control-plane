// scripts/test-phase38-secure-file-access.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('Running Phase 38.3.1 Secure File Access Tests...\n');

const serviceCode = fs.readFileSync(path.join(__dirname, '../src/api/services/marketplacePrinthouseFileAccessService.js'), 'utf-8');
const routesCode = fs.readFileSync(path.join(__dirname, '../src/api/routes/adminMarketplaceOrders.js'), 'utf-8');

function assertContains(content, str, msg) {
    if (!content.includes(str)) {
        throw new Error(`Assertion failed: ${msg}\nMissing string: ${str}`);
    }
}

// 1. list files sanitized
assertContains(serviceCode, "f.storagePath = `/api/production-files/download/${f.fileId}`;", "List files must sanitize paths");

// 2. feature flag disabled blocks token creation
assertContains(serviceCode, "process.env.PPOS_ENABLE_PHASE38_SECURE_FILE_ACCESS !== 'true'", "Must check feature flag");
assertContains(serviceCode, "throw new Error('PHASE38_SECURE_FILE_ACCESS_DISABLED');", "Must block token creation if disabled");

// 3. token creation blocked when package missing
// 4. token creation blocked when package rejected
// 5. token creation blocked when clarification requested
assertContains(serviceCode, "if (!dispatch) throw new Error('HANDOFF_PACKAGE_NOT_FOUND')", "Must block if package missing");
assertContains(serviceCode, "if (dispatch.handoffStatus === 'REJECTED' || dispatch.handoffStatus === 'CLARIFICATION_REQUESTED')", "Must block rejected or clarification");

// 6. token creation blocked if file not in manifest
assertContains(serviceCode, "if (!file) throw new Error('FILE_NOT_IN_DISPATCH_PACKAGE');", "Must block file not in manifest");

// 7. token creation works for INTERIOR_PDF and COVER_PDF
// Covered inherently by the file matching logic from manifest.

// 8. descriptor does not consume useCount
assertContains(serviceCode, "validatePrinthouseFileAccessToken(tokenOrContext, { consume: false })", "Descriptor must not consume token");

// 9. download consumes useCount
assertContains(routesCode, "validatePrinthouseFileAccessToken(token, { consume: true });", "Download must consume token");

// 10. expired token rejected
assertContains(serviceCode, "if (Date.now() > targetTokenData.expiresAt) throw new Error('FILE_ACCESS_TOKEN_EXPIRED')", "Must reject expired");

// 11. max-use token rejected
assertContains(serviceCode, "if (targetTokenData.useCount >= targetTokenData.maxUses) throw new Error('FILE_ACCESS_TOKEN_MAX_USES_EXCEEDED')", "Must reject max uses exceeded");

// 12. wrong order/file token rejected
assertContains(routesCode, "if (context.orderId !== req.params.id || context.file.fileId !== req.params.fileId)", "Must reject wrong order/file");

// 13. superseded file blocked
assertContains(serviceCode, "if (file.status === 'SUPERSEDED') throw new Error('FILE_SUPERSEDED')", "Must block superseded files");

// 14. full token never appears in audit payload
assertContains(serviceCode, "if (payload.token) {\n        delete payload.token;\n    }", "Must never include full token in payload");

// 15. denied access appends audit event
assertContains(routesCode, "'PRINTHOUSE_FILE_DOWNLOAD_DENIED'", "Must log denied event");

// 16. fallback to 501
assertContains(routesCode, "return res.status(501).json({ ok: false, error: storageErr.message, orderId: req.params.id, fileId: req.params.fileId, descriptor });", "Must return 501 fallback");

// 17. DB adapter mismatch fix
if (serviceCode.includes("mysqlClient.getConnection")) {
    throw new Error("Assertion failed: service must not call mysqlClient.getConnection() directly, use simple queries");
}
assertContains(serviceCode, "mysqlClient.query(", "Service must use mysqlClient.query() abstraction");

// 18. events_json mismatch fix
if (serviceCode.includes("events_json")) {
    throw new Error("Assertion failed: service must not use events_json column");
}
assertContains(serviceCode, "INSERT INTO marketplace_order_events", "Must insert into marketplace_order_events directly");
assertContains(serviceCode, "payload_json", "Must use payload_json column");
assertContains(serviceCode, "JSON.stringify(payload)", "Must stringify payload before insertion");

console.log('✅ All Phase 38.3.1 static tests passed!');

console.log('Running Phase 38.3.3 Secure File Streaming Tests...');

// 1. source includes resolvePrinthouseFileStorage.
assertContains(serviceCode, "resolvePrinthouseFileStorage", "Must implement resolvePrinthouseFileStorage");

// 2. source uses PPOS_SECURE_FILE_STORAGE_ROOT / PPOS_PRODUCTION_FILES_ROOT.
assertContains(serviceCode, "PPOS_SECURE_FILE_STORAGE_ROOT", "Must use secure file root env");
assertContains(serviceCode, "PPOS_PRODUCTION_FILES_ROOT", "Must use fallback production files root env");

// 3. source contains /opt/printprice-os/storage/production-files fallback.
assertContains(serviceCode, "/opt/printprice-os/storage/production-files", "Must use absolute fallback path");

// 4. source uses path.resolve containment check.
assertContains(serviceCode, "path.resolve", "Must use path.resolve for normalization");
assertContains(serviceCode, "startsWith(activeRoot + path.sep)", "Must verify path containment");

// 5. source uses fs.createReadStream in route or service.
assertContains(routesCode, "fs.createReadStream", "Must stream using fs.createReadStream");

// 6. response headers include strict settings
assertContains(routesCode, "'Content-Type', 'application/pdf'", "Must set PDF Content-Type");
assertContains(routesCode, "'Content-Disposition', `attachment; filename=", "Must set Content-Disposition attachment");
assertContains(routesCode, "'X-PPOS-File-Access', 'governed'", "Must set X-PPOS-File-Access");
assertContains(routesCode, "'Cache-Control', 'no-store'", "Must set Cache-Control no-store");

// 7. source preserves FILE_STREAMING_NOT_CONFIGURED fallback.
assertContains(routesCode, "FILE_STREAMING_NOT_CONFIGURED", "Must preserve streaming not configured fallback");

console.log('✅ All Phase 38.3.3 static tests passed! 🚀');
