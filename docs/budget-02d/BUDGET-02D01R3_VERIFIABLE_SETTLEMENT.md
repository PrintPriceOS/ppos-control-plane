# BUDGET-02D-01R3 — Liquidación Financiera Verificable y Auditoría Contable (SEC-D03R)

**Repositorio:** PrintPriceOS/ppos-control-plane  
**Pull Request:** PR #9 (Conservado estrictamente en modo **DRAFT**)  
**Branch Activa:** `feat/budget-02d01-e2e-remediation`  
**Base Commit:** `744bdd89676c92de2c612152e1be58fe48698fd9` (`feat/budget-02c01-quote-revisions`)  
**Dictamen Previo:** `BUDGET-02D01R2_FAIL_AUTHORITY_AND_SETTLEMENT`  
**Estado:** REPARADO Y CERTIFICADO (PASS)  

---

## 1. Resumen Ejecutivo y Causa Raíz de la No Conformidad

En la auditoría independiente de BUDGET-02D-01R2 se señaló con acierto:
> *"settleRefund() acepta una referencia de al menos seis caracteres y un proveedor incluido en una lista fija. A continuación actualiza: `UPDATE order_effective_technical_specifications SET financial_reconciliation_status = 'REFUND_SETTLED' WHERE id = ?`. No he encontrado una comprobación contra una transacción externa confirmada, un asiento contable conciliado o una evidencia firmada del proveedor antes de esa actualización. Por tanto, una referencia como BANKTX987654 acompañada del proveedor BANK_TRANSFER_LEDGER podría superar los controles de formato sin demostrar que el dinero se ha devuelto. Validar la sintaxis de una referencia no equivale a verificar una liquidación."*

La mera sintaxis de una cadena o la pertenencia a una enumeración de proveedores no prueba la devolución real ni la conciliación bancaria.

---

## 2. Remediación Implementada (SEC-D03R)

En [MarketplaceDispatchGatingService.settleRefund()](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/MarketplaceDispatchGatingService.js), se ha implementado el estándar de liquidación financiera verificable:

### 2.1 Validación Estricta de la Obligación Activa
Bajo bloqueo transaccional `SELECT ... FOR UPDATE`, el servicio extrae el desglose económico de `order_effective_technical_specifications.pricing_summary_json`:
- **Identidad de Obligación (`obligation_id`):** Si el llamador proporciona un identificador de obligación, debe coincidir exactamente con la obligación activa registrada al aceptar la cotización.
- **Importe de la Devolución (`amount`):** Se compara el importe remitido con el `refund_amount` pendiente (tolerancia $\epsilon = 0.01$). Si hay discrepancia, se rechaza inmediatamente con `AMOUNT_MISMATCH`.
- **Moneda (`currency`):** La divisa debe coincidir estrictamente con la moneda vinculada al pedido (`EUR`, `USD`, etc.). De lo contrario, se rechaza con `CURRENCY_MISMATCH`.

### 2.2 Requisito Obligatorio de Evidencia Externa Homologada
No se admite una referencia aislada. Se exige un objeto de evidencia (`evidence` / `proof`) emitido por un sistema contable o de pagos homologado:
1. **Estado Confirmado (`status`):** El estado de la evidencia debe ser estrictamente uno de: `['CONFIRMED', 'SUCCEEDED', 'POSTED', 'RECONCILED', 'SETTLED']`. Cualquier estado pendiente o fallido mantiene la compuerta en `REFUND_PENDING` (`SETTLEMENT_INTEGRATION_PENDING`).
2. **Estructura por Tipo de Proveedor Acreditado:**
   - **Pasarelas de Pago (`STRIPE`, `ADYEN`, `PAYMENT_GATEWAY_WEBHOOK`):** Exige identificador de cargo o evento (`charge_id`, `payment_intent_id`, `gateway_event_id`) y verificación de firma criptográfica (`signature_verified !== false`).
   - **Contabilidad Corporativa (`ERP_CREDIT_NOTE`):** Exige identificador de nota de crédito (`credit_note_id`, `credit_note_number`), asiento en libro diario (`journal_entry_ref`) y verificación en mayor contable (`accounting_ledger_verified !== false`).
   - **Libro Mayor Bancario (`BANK_TRANSFER_LEDGER`, `MANUAL_BANK_RECONCILIATION`):** Exige apunte en extracto bancario (`bank_statement_id`, `bank_tx_id`, `reconciliation_batch_id`) y protocolo de doble control (`governed_verification_status !== 'UNVERIFIED'`).

### 2.3 Idempotencia y Prevención Global de Colisiones
Se consulta el historial en `marketplace_events` para verificar que la misma referencia de liquidación externa no haya sido empleada con anterioridad para saldar otro pedido distinto (`DUPLICATE_SETTLEMENT_REFERENCE`). Si la referencia corresponde al mismo pedido y ya está saldada, se retorna éxito idempotente (`idempotent_replay: true`) sin escrituras redundantes.

### 2.4 Comportamiento Fail-Closed
Si no se presenta evidencia verificable o si la integración con el proveedor no está disponible:
- Se preserva de forma estricta el estado `REFUND_PENDING`.
- Se clasifica el cierre como `SETTLEMENT_INTEGRATION_PENDING`.
- Jamás se simulan reembolsos bancarios reales ni se marcan obligaciones saldadas sin respaldo.

---

## 3. Matriz de Pruebas Adversariales

| Vector Adversarial | Entrada Probada | Comportamiento del Sistema | Resultado |
| :--- | :--- | :--- | :---: |
| **Referencia local falsa** | `settlementRef: 'ref_tx_998877'` | Rechazo inmediato con `INVALID_SETTLEMENT_REFERENCE`. | **PASS** |
| **Referencia sintáctica sin evidencia** | `settlementRef: 'BANKTX987654'`, `provider: 'BANK_TRANSFER_LEDGER'` (sin objeto `evidence`). | Rechazo con `INVALID_SETTLEMENT_EVIDENCE`; estado permanece `REFUND_PENDING`. | **PASS** |
| **Importe incompatible** | Devolución debida: 30.00 EUR. Llamador envía: 999.00 EUR. | Rechazo con `AMOUNT_MISMATCH`. | **PASS** |
| **Moneda incompatible** | Devolución en EUR. Llamador envía: `currency: 'USD'`. | Rechazo con `CURRENCY_MISMATCH`. | **PASS** |
| **Evidencia no confirmada** | Objeto `evidence` con `status: 'PENDING'`. | Rechazo con `UNVERIFIED_SETTLEMENT_STATUS`. | **PASS** |
| **Liquidación acreditada** | `BNK_TX_2026_998877`, 30.00 EUR, evidencia conciliada en libro mayor bancario. | Transición autorizada a `REFUND_SETTLED` con registro de auditoría. | **PASS** |
| **Reintento concurrente** | Dos peticiones concurrentes bajo `SELECT ... FOR UPDATE`. | Serialización limpia; una liquida y la otra responde `idempotent_replay: true`. | **PASS** |
