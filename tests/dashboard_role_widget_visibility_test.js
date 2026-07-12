/**
 * tests/dashboard_role_widget_visibility_test.js
 *
 * Validates CommandCenterPage role-based widget logic by parsing the source file directly.
 * Confirms:
 *   - PRINTHOUSE_ADMIN/OPERATOR only see Printhouse widgets
 *   - SYSTEM_ADMIN/SUPER_ADMIN/OPS_ADMIN see global widgets
 *   - Unknown roles fail closed (Security Exception)
 *   - Global queries disabled for Printhouse users (empty SWR key)
 *   - Printhouse queries disabled for global admins (empty SWR key)
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

function runTests() {
    console.log('Running Dashboard Role Widget Visibility tests...');

    const filePath = path.join(__dirname, '../src/ui/pages/admin/CommandCenterPage.tsx');
    const src = fs.readFileSync(filePath, 'utf8');

    // 1. Global admin role list is defined
    assert.ok(src.includes("['SUPER_ADMIN', 'OPS_ADMIN', 'SYSTEM_ADMIN']"), 'isGlobalAdmin must be defined with explicit role list');
    console.log('✓ isGlobalAdmin role list is explicit and defined');

    // 2. Printhouse user role list is defined
    assert.ok(src.includes("['PRINTHOUSE_ADMIN', 'PRINTHOUSE_OPERATOR']"), 'isPrinthouseUser must be defined with explicit role list');
    console.log('✓ isPrinthouseUser role list is explicit and defined');

    // 3. Unknown roles fail closed (Security Exception render guard)
    assert.ok(src.includes('Security Exception: Unauthorized Role Context.'), 'Unknown roles must be rejected with security exception');
    console.log('✓ Unknown role context fails closed with Security Exception render guard');

    // 4. Global queries are gated by !isPrinthouseUser (empty SWR key for Printhouse)
    const globalQueryGates = [
        "!isPrinthouseUser ? 'hawk-eye:industrial' : ''",
        "!isPrinthouseUser ? 'hawk-eye:network' : ''",
        "!isPrinthouseUser ? 'hawk-eye:capacity' : ''",
        "!isPrinthouseUser ? 'hawk-eye:routing' : ''",
        "!isPrinthouseUser ? 'hawk-eye:audit' : ''",
        "!isPrinthouseUser ? 'hawk-eye:blocks' : ''",
        "!isPrinthouseUser ? 'hawk-eye:registry' : ''"
    ];
    for (const gate of globalQueryGates) {
        assert.ok(src.includes(gate), `Global query must be gated: ${gate}`);
    }
    console.log('✓ All 7 global queries are gated with !isPrinthouseUser → empty SWR key');

    // 5. Printhouse queries are gated by isPrinthouseUser (empty SWR key for admins)
    const phQueryGates = [
        "isPrinthouseUser ? 'ph:summary' : ''",
        "isPrinthouseUser ? 'ph:machines' : ''",
        "isPrinthouseUser ? 'ph:queue' : ''",
        "isPrinthouseUser ? 'ph:incidents' : ''",
        "isPrinthouseUser ? 'ph:activity' : ''"
    ];
    for (const gate of phQueryGates) {
        assert.ok(src.includes(gate), `Printhouse query must be gated: ${gate}`);
    }
    console.log('✓ All 5 Printhouse queries are gated with isPrinthouseUser → empty SWR key');

    // 6. Printhouse layout is isolated in a separate branch
    assert.ok(src.includes('isPrinthouseUser ? ('), 'Layout must branch on isPrinthouseUser at render level');
    assert.ok(src.includes('PRINTHOUSE OPERATIONAL DASHBOARD'), 'Printhouse layout section must be labelled');
    console.log('✓ Printhouse layout is rendered in an isolated conditional branch');

    // 7. Extract ONLY the Printhouse layout block (between the two ternary branches)
    //    The source structure is:
    //      {isPrinthouseUser ? (
    //        /* PRINTHOUSE OPERATIONAL DASHBOARD */
    //        ...printhouse JSX...
    //      ) : (
    //        /* GLOBAL ADMIN LAYOUT */
    //        ...global JSX...
    //      )}
    //    We slice from the printhouse marker to the ternary false-arm separator.
    const phStart = src.indexOf('PRINTHOUSE OPERATIONAL DASHBOARD');
    assert.ok(phStart !== -1, 'Printhouse branch marker not found');

    // The false arm of the ternary is: "\n      ) : ("
    const ternaryFalseArm = ') : (';
    const ternaryFalseIdx = src.indexOf(ternaryFalseArm, phStart);
    assert.ok(ternaryFalseIdx !== -1, 'Ternary false arm separator not found after Printhouse block');

    const printhouseBlock = src.slice(phStart, ternaryFalseIdx);

    // 8. Global-only widgets must NOT appear inside the Printhouse branch
    // FederationMap is at line 764, well within the global branch
    const globalOnlyPatterns = [
        '<FederationMap',           // Manufacturing Heatmap
        'ManufacturingDispatchConsole',  // Dispatch Console
        'RoutingSimulationPanel',   // Routing Simulation
        'IndustrialHeartbeatMatrix' // Heartbeat Matrix
    ];
    for (const pattern of globalOnlyPatterns) {
        assert.ok(!printhouseBlock.includes(pattern), `Global widget "${pattern}" must NOT appear in Printhouse layout block`);
    }
    console.log('✓ Global-only widgets (FederationMap, DispatchConsole, RoutingSimulation, HeartbeatMatrix) excluded from Printhouse layout');

    // 9. Printhouse layout must contain its expected operational widgets (by component/prop identifier)
    const requiredPrinthouseWidgets = [
        { name: 'Preflight panel', pattern: '"Preflight"' },
        { name: 'Fleet panel', pattern: '"Fleet"' },
        { name: 'IncidentBridge component', pattern: '<IncidentBridge' },
        { name: 'Operational Summary panel', pattern: '"Operational Summary"' },
        { name: 'LiveOrdersFeed', pattern: '<LiveOrdersFeed' }
    ];
    for (const w of requiredPrinthouseWidgets) {
        assert.ok(printhouseBlock.includes(w.pattern), `Printhouse layout must contain: ${w.name} (pattern: ${w.pattern})`);
    }
    console.log('✓ All required Printhouse operational widgets present in Printhouse layout block');

    // 10. Header title branch confirms correct context label
    assert.ok(src.includes("isPrinthouseUser ? 'Printhouse Portal' : 'Control Plane'"), 'Header title must reflect correct role context');
    console.log('✓ Header title correctly branches between "Printhouse Portal" and "Control Plane"');

    console.log('All role widget visibility tests passed.');
}

runTests();
