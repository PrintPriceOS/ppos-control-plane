# BUDGET-02D-01R4 — Adaptador de Liquidación Financiera Confiable (TRUST-01)

**Repositorio:** PrintPriceOS/ppos-control-plane  
**Pull Request:** [PR #9](https://github.com/PrintPriceOS/ppos-control-plane/pull/9) (Conservado estrictamente en modo **OPEN / DRAFT**)  
**Branch Activa:** `feat/budget-02d01-e2e-remediation`  
**Base Commit:** `744bdd89676c92de2c612152e1be58fe48698fd9` (`feat/budget-02c01-quote-revisions`)  
**SHA de Entrada:** `cd2c374adc8f8062b9267ed242fd04f5b2224d23`  
**Dictamen de Entrada:** `BUDGET-02D01R3_FAIL_SETTLEMENT_TRUST_BOUNDARY`  
**Hallazgo Crítico:** `SETTLEMENT_PROOF_NOT_TRUSTED`  
**Estado:** REPARADO Y CERTIFICADO (PASS)  

---

## 1. Resumen Ejecutivo y Causa Raíz del Hallazgo

En la auditoría independiente de **BUDGET-02D-01R3**, se emitió el dictamen de bloqueo con el hallazgo crítico:
> *"En printhouseOrders.js, el endpoint obtiene evidence o proof directamente de req.body y lo transmite a settleRefund(). En MarketplaceDispatchGatingService.js, el servicio comprueba que esa estructura contiene un estado como CONFIRMED, SUCCEEDED o RECONCILED, junto con determinados identificadores. Pero no consulta realmente Stripe, Adyen, el ERP o el libro bancario para corroborar el evento. Además, la verificación de firma de pasarela solo rechaza explícitamente signature_verified === false. Eso significa que omitir el atributo puede superar la comprobación estructural... Impacto: una solicitud con estructura aparentemente válida podría establecer REFUND_SETTLED y habilitar una compuerta industrial sin que exista prueba independiente de devolución."*

El fallo radicaba en situar la frontera de confianza en los datos declarados por el propio cliente HTTP en el cuerpo de la petición (`req.body`). La mera presencia de un JSON sintácticamente coherente no constituye prueba jurídica ni financiera de liquidación.

---

## 2. Arquitectura de TrustedFinancialSettlementAdapter (TRUST-01)

Se ha creado el servicio desacoplado y autoritativo [TrustedFinancialSettlementAdapter.js](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/TrustedFinancialSettlementAdapter.js), integrado directamente en [MarketplaceDispatchGatingService.settleRefund()](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/MarketplaceDispatchGatingService.js).

```
                      +-----------------------------------+
                      |   Llamador HTTP Externo (Untrusted)|
                      +-----------------+-----------------+
                                        | POST /settle-refund
                                        v
                      +-----------------+-----------------+
                      |    printhouseOrders.js (Route)    |
                      +-----------------+-----------------+
                                        | settleRefund(ref, context)
                                        v
                      +-----------------+------------------------------------------+
                      |   MarketplaceDispatchGatingService.js (Transaction Lock)   |
                      |   - SELECT ... FOR UPDATE (orders, OETS)                   |
                      |   - Recuperación servidor de obligación económica          |
                      |   - Comprobación estricta de monto, divisa y beneficiario  |
                      +-----------------+------------------------------------------+
                                        | verifySettlement(...)
                                        v
  +-------------------------------------+-------------------------------------+
  |             TrustedFinancialSettlementAdapter.js                          |
  |  1. Rechazo de autocertificación (UNTRUSTED_CALLER_SIGNATURE_ASSERTION)  |
  |  2. Detección de fallo de integración / caída (PROVIDER_UNREACHABLE)     |
  |  3. Verificación contra fuentes autoritativas independientes:              |
  |     - Registros en mayor contable ERP aprobados                           |
  |     - Webhooks de pasarela verificados en frontera de entrada (Ingress)   |
  |     - Asientos conciliados en libro bancario con doble control            |
  |     - Adaptador de Sandbox CI explícitamente etiquetado                   |
  |  4. Validación criptográfica de firma (signature_verified === true)       |
  |  5. Correspondencia de unidades monetarias menores (céntimos)             |
  +-------------------------------------+-------------------------------------+
                                        |
                 +----------------------+----------------------+
                 | [Fallido / No Verificado]                    | [Acreditado]
                 v                                              v
  +-------------------------------+              +-------------------------------+
  | Conserva REFUND_PENDING       |              | Actualiza a REFUND_SETTLED    |
  | Retorna SETTLEMENT_INTEGRATION|              | Registra comprobante único y  |
  | PENDING (Fail-Closed)         |              | evento en marketplace_events  |
  +-------------------------------+              +-------------------------------+
```

---

## 3. Invariantes de Seguridad y Contratos de Verificación

### 3.1 Prohibición Absoluta de Autocertificación por el Cliente
Si un cliente HTTP incluye en su payload atributos como `signature_verified: true` o `status: 'SUCCEEDED'` sin que hayan sido inyectados y certificados por el middleware de entrada del servidor (`_server_verified_ingress`), el adaptador rechaza la solicitud de inmediato con error:
- **Código:** `422 UNTRUSTED_CALLER_SIGNATURE_ASSERTION`
- **Mensaje:** `Caller cannot self-declare signature_verified. Webhook signatures must be verified at the trusted server ingress boundary.`

### 3.2 Verificación Activa por Tipo de Proveedor Acreditado
La lista de proveedores admitidos se limita estrictamente a:
`['STRIPE', 'ADYEN', 'BANK_TRANSFER_LEDGER', 'ERP_CREDIT_NOTE', 'PAYMENT_GATEWAY_WEBHOOK', 'MANUAL_BANK_RECONCILIATION', 'TEST_TRUSTED_SETTLEMENT_ADAPTER']`.

Para cada proveedor se verifica:
1. **Pasarelas (`STRIPE`, `ADYEN`, `PAYMENT_GATEWAY_WEBHOOK`):**
   - La firma del webhook debe estar positivamente verificada (`signature_verified === true`).
   - La omisión de firma o `signature_verified === false` resulta en `UNVERIFIED_SIGNATURE` o `WEBHOOK_SIGNATURE_INVALID`.
2. **Contabilidad Corporativa (`ERP_CREDIT_NOTE`):**
   - El asiento contable debe estar formalmente registrado en el libro mayor (`accounting_ledger_verified === true`).
   - Requiere identificador formal de factura rectificativa / nota de crédito.
3. **Conciliación Bancaria (`BANK_TRANSFER_LEDGER`, `MANUAL_BANK_RECONCILIATION`):**
   - Requiere protocolo gobernado de conciliación de extractos (`governed_verification_status !== 'UNVERIFIED'`).
   - Requiere apunte en extracto bancario formal (`bank_statement_id`, `bank_tx_id`).

### 3.3 Preservación Fail-Closed y Estado Pendiente
Si la comprobación externa no puede completarse, si el proveedor no está disponible (`PROVIDER_UNREACHABLE`), o si no existe un registro verificado independiente:
- El estado de la orden **permanece inmutablemente en `REFUND_PENDING`**.
- La compuerta industrial deniega cualquier despacho a máquina a menos que medie autorización de dirección técnica.
- La API devuelve el código controlado `422 SETTLEMENT_INTEGRATION_PENDING`.

### 3.4 Identificación Transparente del Adaptador de Pruebas (CI Sandbox)
El adaptador de pruebas para entornos CI está taxativamente catalogado como:
- `TEST_TRUSTED_SETTLEMENT_ADAPTER`
- Provenance estampada: `'TEST_TRUSTED_SETTLEMENT_ADAPTER (CI Mock Sandbox - Not a live banking transaction)'`
- Flag de auditoría persistido: `is_mock_sandbox: true`
- **Garantía:** Jamás se presenta como una liquidación bancaria real ni se confunde con transacciones financieras de producción.
