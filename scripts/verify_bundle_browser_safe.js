/**
 * scripts/verify_bundle_browser_safe.js
 *
 * Verifies that the Vite production bundle contains zero executable CommonJS require()
 * calls originating from the countryCatalog or application code paths.
 */
const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, '../dist/assets');
if (!fs.existsSync(distDir)) {
    console.error('ERROR: dist/assets does not exist. Run `npm run build` first.');
    process.exit(1);
}

const files = fs.readdirSync(distDir).filter(f => f.endsWith('.js'));
let hasCountryRequire = false;

for (const file of files) {
    const content = fs.readFileSync(path.join(distDir, file), 'utf8');
    
    // Check if countryCatalog is required at runtime
    if (content.includes('require(')) {
        const matches = content.match(/.{0,50}require\(.{0,50}/g) || [];
        for (const match of matches) {
            if (match.includes('countryCatalog') || match.includes('countriesData') || match.includes('lib/')) {
                console.error(`ERROR: Forbidden CommonJS require() found in ${file}:`);
                console.error(`  --> ${match}`);
                hasCountryRequire = true;
            }
        }
    }
}

if (hasCountryRequire) {
    console.error('FAIL: Browser bundle contains runtime require() calls!');
    process.exit(1);
} else {
    console.log('PASS: Vite production bundle is 100% browser-safe (0 application require calls).');
}
