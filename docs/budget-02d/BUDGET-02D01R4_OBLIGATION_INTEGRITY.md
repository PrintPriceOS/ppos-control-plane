# BUDGET-02D-01R4 — Integridad de la Obligación Económica y Prevención de Replay (TRUST-02 & TRUST-03)

**Repositorio:** PrintPriceOS/ppos-control-plane  
**Pull Request:** [PR #9](https://github.com/PrintPriceOS/ppos-control-plane/pull/9) (Conservado estrictamente en modo **OPEN / DRAFT**)  
**Branch Activa:** `feat/budget-02d01-e2e-remediation`  
**Base Commit:** `744bdd89676c92de2c612152e1be58fe48698fd9` (`feat/budget-02c01-quote-revisions`)  
**SHA de Entrada:** `cd2c374adc8f8062b9267ed242fd04f5b2224d23`  
**Dictamen de Entrada:** `BUDGET-02D01R3_FAIL_SETTLEMENT_TRUST_BOUNDARY`  
**Estado:** REPARADO Y CERTIFICADO (PASS)  

---

## 1. Resumen de Hallazgos y Motivación

En la auditoría independiente de **BUDGET-02D-01R3**, se detectaron las siguientes vulnerabilidades de integridad económica:
1. **Fallback Arbitrario de 30 €:** Cuando el servicio no encontraba un importe en el resumen económico del pedido, recurría a un valor por defecto de 30.00 €, en lugar de fallar de manera cerrada (`fail-closed`).
2. **Campos Económicos Opcionales:** Los parámetros `amount`, `currency` y `obligationId` del llamador eran opcionales, permitiendo que liquidaciones sin importe explícito avanzaran a `REFUND_SETTLED`.
3. **Ausencia de Verificación del Beneficiario:** No se exigía correspondencia entre el destinatario de la transferencia/reembolso y el cliente económico del pedido registrado en la base de datos.
4. **Vulnerabilidad de Replay entre Pedidos:** Un mismo comprobante externo de devolución podía ser reutilizado maliciosamente para saldar múltiples pedidos distintos.

---

## 2. Remediación TRUST-02: Vinculación Económica Incondicional

En [MarketplaceDispatchGatingService.settleRefund()](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/MarketplaceDispatchGatingService.js), se implementa la resolución autoritativa desde el servidor bajo bloqueo transaccional `SELECT ... FOR UPDATE`:

### 2.1 Eliminación Total del Fallback Económico
Se ha suprimido cualquier fallback por defecto (incluido el de 30 €):
```javascript
// Si no existe obligación económica grabada en el servidor, falla cerrado
if (rawRefundAmount === undefined || rawRefundAmount === null || Number(rawRefundAmount) === 0) {
    throw new Error('NO_REFUND_OBLIGATION: Order has no recorded negative delta or economic refund obligation on the server.');
}
```
Si una orden no tiene grabado un delta negativo o una obligación de reembolso en el servidor, la liquidación se rechaza con HTTP `404 NO_REFUND_OBLIGATION`. Los campos del cuerpo HTTP del cliente **jamás** se utilizan para rellenar o inventar una obligación inexistente.

### 2.2 Comparación en Unidades Monetarias Menores (Céntimos)
Para eliminar errores de redondeo de punto flotante de IEEE 754, la validación del importe se realiza multiplicando por 100 y redondeando al entero más cercano:
```javascript
const providedAmount = Math.abs(Number(settlementContext.amount));
const providedMinor = Math.round(providedAmount * 100);
const expectedMinor = Math.round(expectedAmount * 100);
if (providedMinor !== expectedMinor) {
    throw new Error(`AMOUNT_MISMATCH: Settlement amount ${providedAmount} does not match expected refund obligation amount ${expectedAmount}.`);
}
```
Si el llamador no remite `amount`, la petición es denegada con HTTP `422 MISSING_AMOUNT`.

### 2.3 Correspondencia Estricta de Parámetros
Se exige coincidencia exacta en todos los vértices económicos:
- **Identificador de Obligación (`obligationId`):** Coincidencia con la obligación activa o la revisión aprobada (`OBLIGATION_MISMATCH`).
- **Pedido y Tenant:** Validación bajo lock contra la orden persistida (`FORBIDDEN: Tenant mismatch`).
- **Divisa (`currency`):** Comparación normalizada (`MISSING_CURRENCY`, `CURRENCY_MISMATCH`).
- **Beneficiario Económico (`beneficiary`):** Resolución contra `pricing_summary_json.financial_reconciliation.beneficiary` o `customer_json.email` / `customer_email` del pedido. Si se proporciona un destinatario no coincidente, se rechaza con `422 BENEFICIARY_MISMATCH`.

---

## 3. Remediación TRUST-03: Idempotencia y Protección Anti-Replay

### 3.1 Identificador Único del Comprobante
El adaptador confiable resuelve el identificador unívoco del asiento contable o comprobante del proveedor (`voucher_id` / `provider_voucher_id`).

### 3.2 Protección contra Replay con Referencias Divergentes
Si un pedido ya se encuentra en estado `REFUND_SETTLED`, un reintento idempotente solo es aceptado si referencia exactamente la misma transacción que lo saldó:
```javascript
if (eff.financial_reconciliation_status === 'REFUND_SETTLED') {
    const pastSettlementEvents = await runTxQuery(
        `SELECT metadata_json FROM marketplace_events 
         WHERE event_type = 'REFUND_OBLIGATION_SETTLED' 
         AND (order_id = ? OR order_ref = ?) 
         ORDER BY created_at DESC LIMIT 1`,
        [order.id, canonicalRef]
    );
    // ...
    if (originalSettlementRef && originalSettlementRef !== settlementRef) {
        throw new Error(`SETTLEMENT_MISMATCH: Order has already been settled with reference '${originalSettlementRef}'. Cannot replay with different reference '${settlementRef}'.`);
    }
    // Retorna éxito idempotente únicamente para la misma referencia
    return { ok: true, idempotent_replay: true, settlement_ref: originalSettlementRef };
}
```
Cualquier intento de remitir una referencia distinta sobre una orden ya saldada devuelve HTTP `409 SETTLEMENT_MISMATCH`.

### 3.3 Rechazo de Comprobante Reutilizado entre Pedidos (Anti-Colisión)
Antes de comprometer la transacción, se escanea el historial de liquidaciones en `marketplace_events`:
```javascript
const pastEvents = await runTxQuery(
    `SELECT order_id, order_ref, metadata_json FROM marketplace_events 
     WHERE event_type = 'REFUND_OBLIGATION_SETTLED'`
);
for (const ev of pastEvents) {
    // ...
    if (isSameRef && !matchOrder) {
        throw new Error(`EVIDENCE_ALREADY_CONSUMED: Settlement reference or voucher '${settlementRef}' has already been utilized on order '${ev.order_ref || ev.order_id}'. Replay attack rejected.`);
    }
}
```
Si un voucher o referencia ya fue utilizado para saldar otro pedido distinto, el intento es frustrado con HTTP `409 EVIDENCE_ALREADY_CONSUMED`.

---

## 4. Trazabilidad Forense Atómica

Dentro de la **misma transacción MySQL** que actualiza el estado de la especificación técnica efectiva a `REFUND_SETTLED`, se inserta el evento de auditoría en `marketplace_events`:
```json
{
  "event_type": "REFUND_OBLIGATION_SETTLED",
  "effective_specification_id": "oets_http_001",
  "obligation_id": "obl_001",
  "settlement_ref": "SETTLE_STRIPE_RE_99182910",
  "provider_voucher_id": "ch_http_99182910",
  "provider": "STRIPE",
  "amount": 30.00,
  "currency": "EUR",
  "beneficiary": "procurement@editorial.com",
  "settled_by": "user_operator_http",
  "role": "PRINTHOUSE_ADMIN",
  "tenant_id": "tenant_prod_alpha",
  "trusted_adapter": "TrustedFinancialSettlementAdapter",
  "provenance": "TEST_TRUSTED_SETTLEMENT_ADAPTER (CI Mock Sandbox - Not a live banking transaction)",
  "verified_at": "2026-10-28T07:00:00.000Z",
  "is_mock_sandbox": true
}
```
Si la escritura del log de auditoría falla, la transacción MySQL realiza rollback inmediato (`fail-closed`).
