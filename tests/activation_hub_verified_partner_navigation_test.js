/**
 * tests/activation_hub_verified_partner_navigation_test.js
 * 
 * Verifies contract and structure for the Activation Hub modal navigation behavior.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

async function runTests() {
    console.log('Running Activation Hub Verified Partner navigation tests...');

    const modalPath = path.resolve(__dirname, '../src/ui/components/activation/VerifiedBadgeModal.tsx');
    const modalContent = fs.readFileSync(modalPath, 'utf8');

    // 1. Separate onClose and onGoToDashboard props must be defined
    assert(modalContent.includes('onClose: () => void;'), 'VerifiedBadgeModal must define onClose callback');
    assert(modalContent.includes('onGoToDashboard: () => void;'), 'VerifiedBadgeModal must define onGoToDashboard callback');
    console.log('✓ VerifiedBadgeModal defines separate onClose and onGoToDashboard props');

    // 2. Button must have type="button", aria-label="Go to Dashboard", and onClick={onGoToDashboard}
    assert(modalContent.includes('type="button"'), 'Button must have type="button" attribute');
    assert(modalContent.includes('aria-label="Go to Dashboard"'), 'Button must have aria-label');
    assert(modalContent.includes('onClick={onGoToDashboard}'), 'Button onClick must trigger onGoToDashboard');
    console.log('✓ Button element is fully compliant with type, accessibility and callback expectations');

    // 3. ActivationHub must implement handleGoToDashboard and handleCloseModal separately
    const hubPath = path.resolve(__dirname, '../src/ui/pages/connect/ActivationHub.tsx');
    const hubContent = fs.readFileSync(hubPath, 'utf8');

    assert(hubContent.includes('const handleCloseModal = () => {'), 'ActivationHub must implement handleCloseModal');
    assert(hubContent.includes('const handleGoToDashboard = async () => {'), 'ActivationHub must implement handleGoToDashboard');
    assert(hubContent.includes('onClose={handleCloseModal}'), 'ActivationHub must pass handleCloseModal as onClose');
    assert(hubContent.includes('onGoToDashboard={handleGoToDashboard}'), 'ActivationHub must pass handleGoToDashboard as onGoToDashboard');
    console.log('✓ ActivationHub passes distinct Close and GoToDashboard handlers to the modal');

    console.log('All Activation Hub Verified Partner navigation tests passed!');
}

runTests().catch(err => {
    console.error('Activation Hub Verified Partner navigation test failed:', err);
    process.exit(1);
});
