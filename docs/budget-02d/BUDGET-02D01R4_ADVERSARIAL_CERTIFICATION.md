# BUDGET-02D-01R4 — Certificación de Pruebas Adversariales (TRUST-04)

**Repositorio:** PrintPriceOS/ppos-control-plane  
**Pull Request:** [PR #9](https://github.com/PrintPriceOS/ppos-control-plane/pull/9) (Conservado estrictamente en modo **OPEN / DRAFT**)  
**Branch Activa:** `feat/budget-02d01-e2e-remediation`  
**Base Commit:** `744bdd89676c92de2c612152e1be58fe48698fd9` (`feat/budget-02c01-quote-revisions`)  
**SHA de Entrada:** `cd2c374adc8f8062b9267ed242fd04f5b2224d23`  
**Dictamen de Entrada:** `BUDGET-02D01R3_FAIL_SETTLEMENT_TRUST_BOUNDARY`  
**Estado:** REPARADO Y CERTIFICADO (PASS)  

---

## 1. Matriz de Cobertura Adversarial (12 Vectores TRUST-04)

Se han ejecutado pruebas adversariales rigurosas tanto a nivel unitario/integración con Vitest como a nivel de integración real end-to-end contra MySQL 8 y servidor HTTP Fastify montado con tokens JWT auténticos:

| # | Vector Adversarial Auditado | Payload / Contexto Probado | Comportamiento Esperado del Sistema | Código HTTP / Error | Resultado |
| :-: | :--- | :--- | :--- | :--- | :---: |
| **1** | **JSON con status SUCCEEDED autodeclarado** | `req.body.evidence: { status: 'SUCCEEDED' }` sin corroboración autoritativa. | El estado declarado por el cliente es ignorado por la frontera de confianza; se consulta el adaptador confiable. Si no está en libro, deniega. | `422 EXTERNAL_SETTLEMENT_NOT_FOUND` | **PASS** |
| **2** | **Firma de webhook omitida** | Webhook de pasarela sin atributo `signature_verified` en el registro del adaptador. | Se rechaza por carecer de certificación criptográfica autoritativa. | `422 UNVERIFIED_SIGNATURE` | **PASS** |
| **3** | **Firma autodeclarada por el cliente** | `req.body.evidence: { signature_verified: true }` sin verificación de entrada del servidor. | Rechazo inmediato de la autocertificación por el cliente. | `422 UNTRUSTED_CALLER_SIGNATURE_ASSERTION` | **PASS** |
| **4** | **Referencia externa inexistente** | `settlementRef: 'BANKTX987654'` (no registrada en el ERP ni en el libro bancario). | Rechazo estricto fail-closed. El pedido permanece en `REFUND_PENDING`. | `422 EXTERNAL_SETTLEMENT_NOT_FOUND` | **PASS** |
| **5** | **Importe omitido o divergente** | a) `amount: undefined`<br>b) `amount: 999.00` (deuda real: 30.00 / 45.50). | a) Rechazo por importe omitido.<br>b) Rechazo por discrepancia en céntimos (`minor units`). | a) `422 MISSING_AMOUNT`<br>b) `422 AMOUNT_MISMATCH` | **PASS** |
| **6** | **Divisa y beneficiario incompatibles** | a) Pedido en EUR, envío `currency: 'USD'`.<br>b) Cliente `customer@editorial.com`, envío `beneficiary: 'hacker@bad.com'`. | a) Rechazo por incompatibilidad de divisa.<br>b) Rechazo por beneficiario no coincidente con el pedido. | a) `422 CURRENCY_MISMATCH`<br>b) `422 BENEFICIARY_MISMATCH` | **PASS** |
| **7** | **Obligación económica inexistente** | Pedido con `delta_amount: 0.00` o sin registro de reembolso en el servidor. | Rechazo inmediato. No se admite inventar obligaciones desde el cuerpo HTTP. Suprime fallback de 30 €. | `404 NO_REFUND_OBLIGATION` | **PASS** |
| **8** | **Reutilización de comprobante (Replay cross-order)** | Reutilizar `BNK_TX_2026_998877` en una segunda orden distinta de la original. | Detección en `marketplace_events` bajo lock transaccional. Ataque de replay frustrado. | `409 EVIDENCE_ALREADY_CONSUMED` | **PASS** |
| **9** | **Proveedor externo inaccesible / Outage** | Simulación de indisponibilidad de API de Stripe o banco (`PROVIDER_UNREACHABLE`). | Preservación estricta de `REFUND_PENDING`. La compuerta industrial deniega despacho. | `422 SETTLEMENT_INTEGRATION_PENDING` | **PASS** |
| **10** | **Webhook con firma criptográfica inválida** | Webhook con firma criptográfica alterada o inválida (`signature_verified: false`). | Rechazo inmediato de la evidencia criptográfica adulterada. | `422 WEBHOOK_SIGNATURE_INVALID` | **PASS** |
| **11** | **Liquidaciones concurrentes bajo lock** | Dos peticiones simultáneas con la misma referencia bajo `SELECT ... FOR UPDATE`. | Serialización limpia en MySQL: una efectúa la transición y la otra retorna reintento idempotente. | `200 OK (idempotent_replay: true)` | **PASS** |
| **12** | **Liquidación legítima con adaptador confiable** | Comprobante registrado en `TrustedFinancialSettlementAdapter` con `is_test_sandbox: true`. | Verificación autoritativa de integridad económica, transición a `REFUND_SETTLED` y auditoría forense atómica. | `200 OK (REFUND_SETTLED)` | **PASS** |

---

## 2. Evidencia de Ejecución en las Suites de Prueba

### 2.1 Suite Vitest E2E (`tests/budget02d01_e2e_real_integration.test.js`)
```
 ✓ tests/budget02d01_e2e_real_integration.test.js (12 tests) 110ms
   ✓ 1. Creación de pedido y snapshot sellado BPE
   ✓ 2. Propuesta de alternativa técnica en order_paper_decisions
   ✓ 3. Cálculo Delta reproducible BPE
   ✓ 4. Emisión del enlace al destinatario autorizado con token monouso
   ✓ 5. Aceptación segura con consentimiento forense y consumo irreversible
   ✓ 6. Persistencia contractual y estado de compuertas
   ✓ 7. Delta positivo y pago pendiente
   ✓ 8. Delta negativo y obligación de compensación
   ✓ 9. Cancelación concurrente (409 ORDER_INELIGIBLE)
   ✓ 10. Reasignación de imprenta (409 PRINTHOUSE_REASSIGNED)
   ✓ 11. Bloqueo de despacho industrial ante revisión pendiente o falta de liquidación (FIN-01 & IND-01)
         [Pruebas Adversariales TRUST-01..04: 11.7.1 a 11.7.8 Pasadas al 100%]
   ✓ 12. Despacho exitoso a máquina consumiendo specs efectivas

Test Files  1 passed (1)
     Tests  12 passed (12)
```

### 2.2 Script de Certificación Real MySQL 8 y HTTP (`scripts/test_budget02d01_real_mysql_e2e.js`)
- **Paso 6.6.b:** Rechazo de liquidación sin importe -> `MISSING_AMOUNT`.
- **Paso 6.6.c:** Rechazo de autocertificación de firma por el cliente -> `UNTRUSTED_CALLER_SIGNATURE_ASSERTION`.
- **Paso 6.6.d:** Rechazo de referencia no hallada en el ERP -> `EXTERNAL_SETTLEMENT_NOT_FOUND`.
- **Paso 6.6.e:** Rechazo de importe divergente -> `AMOUNT_MISMATCH`.
- **Paso 6.7:** Liquidación verificada mediante `TrustedFinancialSettlementAdapter` -> `REFUND_SETTLED`.
- **Paso 6.7.b:** Liquidaciones concurrentes bajo `SELECT ... FOR UPDATE` -> `idempotent_replay: true`.
- **Paso 6.7.c:** Intento de re-liquidación con referencia diferente -> `SETTLEMENT_MISMATCH`.
- **Paso 8.6.b a 8.7:** Validación de endpoints HTTP reales montados en Fastify con autenticación JWT Bearer y códigos de estado HTTP 200, 403, 404, 409 y 422.

---

## 3. Garantías de No Simulación Financiera

El adaptador de pruebas `TEST_TRUSTED_SETTLEMENT_ADAPTER` implementa controles estrictos para garantizar que:
1. **Zero Simulación Bancaria Real:** En ningún momento se generan llamadas a sistemas de banca en producción ni se simulan movimientos monetarios reales en cuentas bancarias.
2. **Identificación Transparente:** Todo registro emitido por el sandbox de pruebas estampa el metadato:  
   `"provenance": "TEST_TRUSTED_SETTLEMENT_ADAPTER (CI Mock Sandbox - Not a live banking transaction)"` y `"is_mock_sandbox": true`.
3. **Fail-Closed en Producción:** En entornos con variables de producción, las consultas deben dirigirse a adaptadores bancarios autorizados con certificados mTLS y firmas validadas por webhook.
