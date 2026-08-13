'use strict';

const crypto = require('crypto');
const mysqlClient = require('../../src/api/services/mysqlClient');
const printhouseMachineService = require('../../src/api/services/printhouseMachineService');


const LOG_PREFIX = '[Phase191D Smoke Test]';

async function runTest() {
    console.log(`${LOG_PREFIX} Starting...`);



    const tenantId = `tenant-${crypto.randomBytes(4).toString('hex')}`;
    const siteId = `site-${crypto.randomBytes(4).toString('hex')}`;

    console.log(`${LOG_PREFIX} Provisioning site (printer_node)...`);
    await mysqlClient.query(
        'INSERT INTO printer_nodes (id, tenant_id, name, email) VALUES (?, ?, ?, ?)',
        [siteId, tenantId, 'Test Site', `test-${siteId}@example.com`]
    );

    console.log(`${LOG_PREFIX} Creating Machine (Linked to Printer Node)...`);
    const created = await printhouseMachineService.createMachine(tenantId, siteId, {
        machine_name: 'HP Indigo 12000',
        machine_type: 'DIGITAL_PRESS',
        supported_color_modes_json: ['CMYK', 'SPOT'],
        supports_white_ink: true
    }, { role: 'PRINTHOUSE_ADMIN' });

    console.log(`${LOG_PREFIX} Machine Created:`, created.id);

    if (created.machine_name !== 'HP Indigo 12000' || !created.supports_white_ink) {
        throw new Error('Machine creation failed validation checks');
    }

    console.log(`${LOG_PREFIX} Updating Machine...`);
    const updated = await printhouseMachineService.updateMachine(tenantId, siteId, created.id, {
        max_sheet_width_mm: 750,
        max_sheet_height_mm: 530,
        supports_spot_uv: true
    }, { role: 'PRINTHOUSE_ADMIN' });

    if (updated.max_sheet_width_mm !== 750 || !updated.supports_spot_uv) {
        throw new Error('Machine update failed validation checks');
    }

    console.log(`${LOG_PREFIX} Listing Machines...`);
    const list = await printhouseMachineService.listMachines(tenantId, siteId);
    if (list.length !== 1 || list[0].id !== created.id) {
        throw new Error('Machine listing failed validation checks');
    }

    console.log(`${LOG_PREFIX} Archiving Machine...`);
    await printhouseMachineService.archiveMachine(tenantId, siteId, created.id, { role: 'PRINTHOUSE_ADMIN' });
    const archived = await printhouseMachineService.getMachine(tenantId, siteId, created.id);
    if (archived.status !== 'ARCHIVED') {
        throw new Error('Machine archiving failed validation checks');
    }

    console.log(`${LOG_PREFIX} SUCCESS. All smoke tests passed.`);
}

runTest()
    .then(() => {
        mysqlClient.closePool();
        process.exit(0);
    })
    .catch(err => {
        console.error(`${LOG_PREFIX} FAILED:`, err);
        mysqlClient.closePool();
        process.exit(1);
    });
