/**
 * scripts/diagnose_case_a_294eur_live.js
 *
 * Standalone Read-Only Diagnostic Harness for CASO A (294,69 € Live Quote Evaluation)
 * Target Node: node-329a3bc4
 *
 * ZERO-MUTATION GUARANTEE: Performs SELECT queries and in-memory BPE evaluation only.
 * Can be run directly on deployed server using existing application code without restarts.
 */
require('dotenv').config();
const db = require('../src/api/services/mysqlClient');
const calibrationSessionService = require('../src/api/services/calibrationSessionService');
const buildPriceAdapter = require('../src/api/services/buildPriceCalibrationAdapter');
const quotePreviewService = require('../src/api/services/printhouseQuotePreviewService');

async function runCaseADiagnostic() {
    console.log('================================================================================');
    console.log('=== CASO A: DIAGNÓSTICO INDEPENDIENTE DE PRECIO LIVE (294,69 €) ===');
    console.log('=== Nodo Objetivo: node-329a3bc4 (philologica.ai Printhouse) ===');
    console.log('================================================================================\n');

    try {
        // 1. Fetch Printer Node State (Tenant Scoped & Read-Only SELECT)
        let nodeRows = [];
        try {
            nodeRows = await db.query(
                'SELECT id, tenant_id, name, rates_json, signatures, limits, production_lead_days, delivery_time FROM printer_nodes WHERE id = ?',
                ['node-329a3bc4']
            );
        } catch (err) {
            console.error('[DIAGNOSTIC-ERROR] Error de conexión a la base de datos:', err.message);
            console.log('Ejecuta este script en un entorno con variables MYSQL_HOST/DATABASE_URL en .env.');
            process.exitCode = 1;
            return;
        }

        if (!nodeRows || nodeRows.length === 0) {
            console.error('[DIAGNOSTIC-ERROR] Nodo node-329a3bc4 no encontrado en la tabla printer_nodes.');
            process.exitCode = 1;
            return;
        }

        const node = nodeRows[0];
        const ratesSnapshot = typeof node.rates_json === 'string' ? JSON.parse(node.rates_json) : node.rates_json;
        
        // 2. Compute Canonical Rates Checksum using calibrationSessionService
        const canonicalChecksum = calibrationSessionService.computeRatesChecksum(ratesSnapshot);

        console.log('--- 1. ESTADO DE TARIFAS Y REGISTRO DEL NODO ---');
        console.log(`Node ID:                     ${node.id}`);
        console.log(`Node Name:                   ${node.name}`);
        console.log(`Tenant ID:                   ${node.tenant_id}`);
        console.log(`Checksum Canónico Tarifas:   ${canonicalChecksum}`);
        console.log(`Configuración Firmas:        ${JSON.stringify(node.signatures)}`);
        console.log(`Plazo Fabricación (días):   ${node.production_lead_days}`);
        console.log(`Tiempo Envío (días):         ${node.delivery_time}\n`);

        const nodeConfig = {
            id: node.id,
            name: node.name,
            signatures: typeof node.signatures === 'string' ? JSON.parse(node.signatures) : node.signatures,
            production_lead_days: node.production_lead_days || 7,
            shipping_days: 2
        };

        // 3. Exact Live Observed Payload for CASO A (Un-normalized, standard 4/4 hardcover)
        const caseAJobSpec = {
            copies: 3000,
            book_width_mm: 139,
            book_height_mm: 212,
            interior_pages: 216,
            interior_print: '4/4',
            paper_type_interior: 'munken',
            paper_weight_interior: 90,
            cover_print: '4/0',
            paper_type_cover: 'mc',
            paper_weight_cover: 130,
            binding_method: 'hardcover',
            lamination: 'matt',
            delivery_country: 'DE',
            endpapers: 'none',
            endpapers_print: 'none',
            transportPricePerKg: 'Yes, convert flat rate to per-kg based on estimated weight'
            // NOTE: Missing complex flags (has_mixed_interior, has_endpapers, has_spot_uv)
        };

        console.log('--- 2. PAYLOAD ORIGINAL RECIBIDO (CASO A) ---');
        console.log(JSON.stringify(caseAJobSpec, null, 2));

        // 4. Adapt Parameters for Forward Engine
        const bpeParams = buildPriceAdapter.adaptBookSpec(caseAJobSpec);
        console.log('\n--- 3. PARÁMETROS ADAPTADOS PARA BPE BUILDPRICE ---');
        console.log(JSON.stringify(bpeParams, null, 2));

        // 5. Evaluate Direct BPE Forward Calculation
        const bpeEval = buildPriceAdapter.evaluateForwardPrice(caseAJobSpec, ratesSnapshot, {}, nodeConfig);

        console.log('\n--- 4. DESGLOSE COMPLETO DE LÍNEAS DE COSTO BPE ---');
        console.table(bpeEval.lines.map(l => ({ Item: l.item, LineTotal: l.line_total })));
        console.log(`Total Fabricación Predicho:  ${bpeEval.predictedManufacturingPrice} EUR`);
        console.log(`Transporte Referencia:       ${bpeEval.predictedTransportPrice} EUR`);
        console.log(`Total Predicho BPE Engine:   ${bpeEval.totalPredictedPrice} EUR`);

        // 6. Evaluate High-Level Quote Preview Service Output
        const preview = await quotePreviewService.generateQuotePreview(node.tenant_id, caseAJobSpec, node.id);

        console.log('\n--- 5. RESULTADO DEL SERVICIO PREVIEW DE COTIZACIÓN ---');
        console.log(`Precio Final Venta:          ${preview.totals.finalSellingPrice} ${preview.currency}`);
        console.log(`Subtotal Fabricación:        ${preview.totals.manufacturing} EUR`);
        console.log(`Referencia Transporte:       ${preview.totals.transport} EUR`);
        console.log(`Margen Comercial:            ${preview.totals.commercialMarkup} EUR`);
        console.log(`Precio Unitario por Copia:   ${preview.unitPrice} EUR / copia`);
        console.log(`Aproximación Simplificada:   ${preview.isSimplifiedApproximation}`);
        console.log(`Estado Impuestos:            ${preview.taxStatus}`);
        console.log(`Advertencias Emitidas:       ${JSON.stringify(preview.warnings, null, 2)}`);
        console.log(`Desglose Comercial:          ${JSON.stringify(preview.breakdown, null, 2)}`);
        console.log(`Trazado de Configuración:    ${JSON.stringify(preview.configurationTrace, null, 2)}\n`);

        console.log('================================================================================');
        console.log('=== CASO A DIAGNÓSTICO FINALIZADO — CERO MUTACIONES EN BD ===');
        console.log('================================================================================');

    } catch (err) {
        console.error('[DIAGNOSTIC-ERROR] Fallo durante la ejecución del diagnóstico:', err.message);
        process.exitCode = 1;
    } finally {
        await db.closePool();
    }
}

if (require.main === module) {
    runCaseADiagnostic();
}

module.exports = { runCaseADiagnostic };
