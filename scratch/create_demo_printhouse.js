/**
 * scratch/create_demo_printhouse.js
 * 
 * Script to create a demo Printhouse account.
 */
const printhouseService = require('../src/api/services/printhouseService');

async function main() {
    try {
        console.log('--- Creating Demo Printhouse Account ---');
        
        const demoData = {
            companyName: 'Demo Printhouse SL',
            contactName: 'Demo Manager',
            email: 'demo.printhouse@printprice.pro',
            password: 'demo1234',
            country: 'ES',
            city: 'Madrid',
            phone: '+34 912 345 678',
            website: 'https://demo-printhouse.es'
        };

        const result = await printhouseService.selfRegister(demoData);
        
        console.log('Successfully created demo account:');
        console.log(`Email: ${result.user.email}`);
        console.log(`Role: ${result.user.role}`);
        console.log(`Tenant ID: ${result.tenantId}`);
        console.log(`Printhouse ID: ${result.printhouseId}`);
        console.log(`License Key: ${result.licenseKey}`);
        console.log('---------------------------------------');
        process.exit(0);
    } catch (err) {
        console.error('Failed to create demo account:', err.message);
        process.exit(1);
    }
}

main();
