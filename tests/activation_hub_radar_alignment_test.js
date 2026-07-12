/**
 * tests/activation_hub_radar_alignment_test.js
 * 
 * Verifies contract and structure for the OrdersRadar SVG group and sweep animation.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

async function runTests() {
    console.log('Running Activation Hub Radar alignment tests...');

    const radarPath = path.resolve(__dirname, '../src/ui/components/activation/OrdersRadar.tsx');
    const content = fs.readFileSync(radarPath, 'utf8');

    // 1. Radar must use a square viewBox (centered at 0,0)
    assert(content.includes('viewBox="-160 -160 320 320"'), 'OrdersRadar must use square viewBox centered at origin');
    console.log('✓ Radar uses square viewBox centered at local origin');

    // 2. Rotation animation must be applied to a group <motion.g> instead of the <line>
    assert(content.includes('<motion.g'), 'OrdersRadar must use <motion.g> group for rotation animation');
    assert(content.includes('animate={{ rotate: 360 }}'), 'Group must define rotation animation');
    console.log('✓ Rotation animation is applied to a group container');

    // 3. Group must define transformOrigin "0px 0px"
    assert(content.includes('style={{ transformOrigin: "0px 0px" }}'), 'Group must specify transformOrigin: "0px 0px"');
    console.log('✓ Group rotates around the exact geometric center (0px 0px)');

    // 4. Line element starts exactly at local origin (0, 0)
    assert(content.includes('x1="0"'), 'Line must start at x=0');
    assert(content.includes('y1="0"'), 'Line must start at y=0');
    console.log('✓ Sweep line starts exactly at local origin (0, 0)');

    console.log('All Activation Hub Radar alignment tests passed!');
}

runTests().catch(err => {
    console.error('Activation Hub Radar alignment test failed:', err);
    process.exit(1);
});
