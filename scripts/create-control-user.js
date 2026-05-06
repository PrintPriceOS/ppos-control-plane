/**
 * scripts/create-control-user.js
 * 
 * Seeding script for Control Plane users.
 * 
 * Usage:
 * node scripts/create-control-user.js admin@printprice.pro super_admin ppos-production
 */
require('dotenv').config();
const userService = require('../src/api/services/controlUserService');

const email = process.argv[2];
const role = process.argv[3] || 'viewer';
const tenantId = process.argv[4] || 'ppos-production';
const password = process.env.CONTROL_USER_PASSWORD;

if (!email || !password) {
    console.error('Usage: CONTROL_USER_PASSWORD=\'...\' node scripts/create-control-user.js <email> [role] [tenant_id]');
    process.exit(1);
}

async function run() {
    try {
        console.log(`[CREATE-USER] Initializing user creation for ${email}...`);
        const user = await userService.createUser(email, role, tenantId, password);
        console.log(`[CREATE-USER] SUCCESS: User ${user.email} created with ID ${user.id} and role ${user.role}`);
        process.exit(0);
    } catch (err) {
        console.error(`[CREATE-USER] FAILED: ${err.message}`);
        process.exit(1);
    }
}

run();
