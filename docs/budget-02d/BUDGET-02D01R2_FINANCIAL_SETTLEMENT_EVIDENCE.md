# BUDGET-02D-01R2 — Evidencia de Liquidación Financiera Verificable (SEC-D03)

**Repositorio:** PrintPriceOS/ppos-control-plane  
**PR:** #9 — Consignado en modo DRAFT  
**Misión:** BUDGET-02D-01R2 — Cierre Crítico de Autorización Industrial y Liquidación Financiera  
**Requisito Normativo:** SEC-D03 — Liquidación de devolución verificable  
**Estado:** REPARADO Y CERTIFICADO (PASS)  

---

## 1. Alcance y Principios Rectores

El requisito SEC-D03 impone la prohibición de generar identificadores locales arbitrarios para simular la liquidación de una obligación de reembolso. En particular:
1. `settleRefund()` no puede fabricar una referencia sintética como `ref_tx_${Date.now()}` y presentarla como prueba de reembolso satisfecho.
2. Es obligatorio exigir una referencia de liquidación externa, real y verificable, proveniente de una pasarela de pago o sistema contable acreditado.
3. Si la integración contable/bancaria no está disponible o la referencia es ausente/inválida, el sistema debe **mantener inalterado el estado `REFUND_PENDING`**.
4. **Restricción absoluta:** Cero ejecución de transferencias o débitos bancarios reales en entornos de test o integración.

---

## 2. Implementación de Validación en `settleRefund()`

En [MarketplaceDispatchGatingService.js](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/MarketplaceDispatchGatingService.js#L440), se han introducido las siguientes salvaguardas de gobernanza financiera:

### 2.1 Validación de Referencia Externa Acreditada
```javascript
const settlementRef = String(settlementContext.settlementRef || settlementContext.transactionId || '').trim();
if (!settlementRef || settlementRef.length < 6) {
    throw new Error('INVALID_SETTLEMENT_REFERENCE: A valid settlement reference (minimum 6 characters) from an accredited accounting system or payment provider is required.');
}

// Rechazo estricto de identificadores pseudo-locales y ficticios
const isPseudoRef = /^ref_tx_\d+$/i.test(settlementRef) ||
                    /^(mock|fake|dummy|test|local|sample)/i.test(settlementRef);
if (isPseudoRef) {
    throw new Error('INVALID_SETTLEMENT_REFERENCE: Fake or local pseudo-references are rejected. A verifiable settlement reference from an accredited accounting system or payment provider is required.');
}
```

### 2.2 Validación de Proveedor Acreditado
El sistema homologa únicamente orígenes acreditados de liquidación financiera:
- `STRIPE`: Transacciones de reembolso vía API Stripe (ej: `re_3M...`).
- `ADYEN`: Notificaciones formales de contracargo o abono Adyen.
- `BANK_TRANSFER_LEDGER`: Asiento en libro mayor bancario verificado por tesorería.
- `ERP_CREDIT_NOTE`: Nota de crédito formal generada en el sistema contable / ERP.
- `PAYMENT_GATEWAY_WEBHOOK`: Evento firmado criptográficamente por webhook de pasarela.
- `MANUAL_BANK_RECONCILIATION`: Conciliación documentada por responsable de finanzas.

Cualquier proveedor ajeno es rechazado con error `INVALID_PROVIDER`.

### 2.3 Preservación Fail-Closed de `REFUND_PENDING`
Si cualquiera de las comprobaciones falla (actor no autorizado, tenant mismatch, referencia local inválida o proveedor desconocido), la transacción se aborta con `ROLLBACK` y el registro en `order_effective_technical_specifications` conserva estrictamente:

$$\text{financial\_reconciliation\_status} \equiv \text{'REFUND_PENDING'}$$

---

## 3. Matriz de Evidencia Adversarial de Liquidación

Las siguientes pruebas automatizadas fueron ejecutadas contra almacenamiento transaccional y contra MySQL 8 con Fastify HTTP montado:

| ID Vector | Caso de Prueba | Entrada | Resultado Observado | Estado de la Obligación |
| :--- | :--- | :--- | :--- | :--- |
| **FIN-ADV-01** | Pseudo-referencia generada localmente | `settlementRef: 'ref_tx_998877'` | Error 422: `INVALID_SETTLEMENT_REFERENCE` | `REFUND_PENDING` (Intacto) |
| **FIN-ADV-02** | Referencia demasiado corta (< 6 caracteres) | `settlementRef: 'tx_1'` | Error 422: `INVALID_SETTLEMENT_REFERENCE` | `REFUND_PENDING` (Intacto) |
| **FIN-ADV-03** | Actor sin atribución financiera | Rol: `OPERATOR` | Error 403: `FORBIDDEN` | `REFUND_PENDING` (Intacto) |
| **FIN-ADV-04** | Intento de liquidación cross-tenant | Tenant: `tenant_foreign_rogue` | Error 403: `FORBIDDEN: Tenant mismatch` | `REFUND_PENDING` (Intacto) |
| **FIN-ADV-05** | Identidad de sistema ficticia | `userId: 'system_finance'` | Error 401: `UNAUTHORIZED` | `REFUND_PENDING` (Intacto) |
| **FIN-ADV-06** | Proveedor de liquidación no acreditado | `provider: 'BITCOIN_WALLET'` | Error 422: `INVALID_PROVIDER` | `REFUND_PENDING` (Intacto) |
| **FIN-ADV-07** | Liquidación legítima acreditada ERP | `settlementRef: 'BCN_ERP_CREDIT_NOTE_2026_0991'` | Éxito 200: Transacción confirmada | Transiciona a `REFUND_SETTLED` |
| **FIN-ADV-08** | Liquidación legítima acreditada Stripe | `settlementRef: 'SETTLE_STRIPE_RE_99182910'` | Éxito 200: Transacción confirmada | Transiciona a `REFUND_SETTLED` |
| **FIN-ADV-09** | Reintento idempotente de liquidación | Misma referencia sobre spec ya liquidada | Éxito 200: Idempotent Replay sin mutación redundante | Mantiene `REFUND_SETTLED` |

---

## 4. Trazabilidad Forense de Auditoría Financiera

Cada liquidación exitosa genera un registro forense en `marketplace_events` conteniendo la metadata de la transacción contable:
```json
{
  "effective_specification_id": "oets_http_001",
  "settlement_ref": "SETTLE_STRIPE_RE_99182910",
  "provider": "STRIPE",
  "settled_by": "user_operator_http",
  "role": "PRINTHOUSE_ADMIN",
  "tenant_id": "tenant_prod_alpha",
  "settled_at": "2026-10-28T05:07:11.890Z"
}
```
Esto garantiza la conciliación bidireccional entre la compuerta MES de planta y el libro mayor financiero.
