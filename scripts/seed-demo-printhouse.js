/**
 * scripts/seed-demo-printhouse.js
 * 
 * Idempotent seeder for a Demo Printhouse environment.
 */
require('dotenv').config();
const db = require('../src/api/services/mysqlClient');
const userService = require('../src/api/services/controlUserService');
const printhouseService = require('../src/api/services/printhouseService');

async function seed() {
    console.log('### Starting Demo Printhouse Seeding...');

    const demoEmail = 'demo-printhouse@printprice.pro';
    const demoPassword = 'DemoPrintHouse123!';
    const demoName = 'Demo Industrial Printhouse';

    try {
        // 1. Check if user already exists
        const existingUser = await userService.findByEmail(demoEmail);
        if (existingUser) {
            console.log(`[INFO] Demo user ${demoEmail} already exists. Skipping creation.`);
            process.exit(0);
        }

        // 2. Perform registration logic
        const result = await printhouseService.selfRegister({
            companyName: demoName,
            contactName: 'Demo Manager',
            email: demoEmail,
            password: demoPassword,
            country: 'ES',
            city: 'Madrid',
            phone: '+34600000000',
            website: 'https://demo.printprice.pro'
        });

        console.log(`[SUCCESS] Created Demo Tenant: ${result.tenantId}`);
        console.log(`[SUCCESS] Created Demo Printhouse: ${result.printhouseId}`);
        console.log(`[SUCCESS] Created Demo User: ${demoEmail}`);

        // 3. Seed some dummy operational data
        await db.query(
            'INSERT INTO printer_machines (node_id, name, type, capabilities) VALUES (?, ?, ?, ?)',
            [result.printhouseId, 'Heidelberg Speedmaster XL 106', 'OFFSET', JSON.stringify({ format: 'B1', colors: 8 })]
        ).catch(e => console.warn('[WARN] Could not seed machines (table may not exist yet)'));

        await db.query(
            'INSERT INTO printer_papers (node_id, name, weight_gsm) VALUES (?, ?, ?)',
            [result.printhouseId, 'Coated Silk', 150]
        ).catch(e => console.warn('[WARN] Could not seed papers (table may not exist yet)'));

        console.log('### Seeding Completed Successfully.');
        process.exit(0);
    } catch (err) {
        console.error('[ERROR] Seeding failed:', err.message);
        process.exit(1);
    }
}

seed();
