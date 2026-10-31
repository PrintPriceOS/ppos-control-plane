/**
 * scripts/inspect_node_329a3bc4_rates.js
 *
 * SELECT-only live rates key inspector for node-329a3bc4.
 * Carga .env y muestra las claves específicas de tarifas y signatures.
 */
require('dotenv').config();
const db = require('../src/api/services/mysqlClient');

async function inspectRates() {
    try {
        const rows = await db.query(
            'SELECT id, signatures, rates_json FROM printer_nodes WHERE id = ?',
            ['node-329a3bc4']
        );

        if (!rows || rows.length === 0) {
            console.error('Nodo node-329a3bc4 no encontrado.');
            process.exitCode = 1;
            return;
        }

        const node = rows[0];
        const rates = typeof node.rates_json === 'string' ? JSON.parse(node.rates_json) : node.rates_json;
        const signatures = typeof node.signatures === 'string' ? JSON.parse(node.signatures) : node.signatures;

        const result = {
            node_id: node.id,
            signatures: signatures || null,
            paper_price_interior_by_kilo: rates?.paper_price_interior_by_kilo ?? 'CLAVE_AUSENTE',
            paper_price_cover_by_kilo: rates?.paper_price_cover_by_kilo ?? 'CLAVE_AUSENTE',
            interior_full_colour_fixed: rates?.interior_full_colour_fixed ?? 'CLAVE_AUSENTE',
            interior_full_colour_var: rates?.interior_full_colour_var ?? 'CLAVE_AUSENTE',
            cover_fixed_by_colours: rates?.cover_fixed_by_colours ?? 'CLAVE_AUSENTE',
            cover_var_per_1000_by_colours: rates?.cover_var_per_1000_by_colours ?? 'CLAVE_AUSENTE',
            binding_hc_fixed_by_sections: rates?.binding_hc_fixed_by_sections ?? 'CLAVE_AUSENTE',
            binding_hc_var_per_1000_by_sections: rates?.binding_hc_var_per_1000_by_sections ?? 'CLAVE_AUSENTE'
        };

        console.log(JSON.stringify(result, null, 2));
    } catch (err) {
        console.error('Error al consultar BD:', err.message);
        process.exitCode = 1;
    } finally {
        await db.closePool();
    }
}

inspectRates();
