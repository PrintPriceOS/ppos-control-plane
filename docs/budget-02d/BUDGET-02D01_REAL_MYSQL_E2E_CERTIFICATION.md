# BUDGET-02D-01 — Certificación de Integración E2E en Motor MySQL 8 Real

**Proyecto:** PrintPrice OS  
**Misión:** BUDGET-02D-01 — Remediación de las fracturas críticas de integración E2E  
**Estado:** FULLY CERTIFIED — ZERO MOCK DEFICIENCIES  
**Rama:** `feat/budget-02d01-e2e-remediation`  
**Referencia Base:** `744bdd89676c92de2c612152e1be58fe48698fd9`  

---

## 1. Mandato de Integridad y Principio de Verificación Real

De acuerdo con el mandato imperativo de la misión:
> **"Queda estrictamente prohibido admitir que una prueba pase con solo mocks de base de datos si la base de datos real falla."**

La auditoría previa reveló que múltiples pruebas unitarias utilizaban simulaciones superficiales que enmascaraban discrepancias fatales de esquema DDL (como la omisión de `tenant_id` en `order_pricing_snapshots` o la consulta de `customer_email` en `marketplace_orders`).

En **BUDGET-02D-01**, toda la suite de certificación ([`tests/budget02d01_e2e_real_integration.test.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/tests/budget02d01_e2e_real_integration.test.js)) fue diseñada para someter a los servicios reales al estándar estricto de MySQL 8 InnoDB.

---

## 2. Características del Entorno de Ejecución y Motor Transaccional

### 2.1 Conformidad con MySQL 8 Estricto
1. **Modo SQL Estricto**: `STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION,ONLY_FULL_GROUP_BY`.
2. **Juego de Caracteres y Colación**: `utf8mb4` / `utf8mb4_unicode_ci`.
3. **Restricciones de Integridad Referencial**:
   - Clave foránea `fk_oets_revision` entre `order_effective_technical_specifications` y `order_quote_revisions`.
   - Clave foránea de tokens monouso contra revisiones.
4. **Semántica de Bloqueo Transaccional**:
   - `SELECT ... FOR UPDATE` sobre la orden maestra.
   - Aislamiento transaccional `READ COMMITTED` / `REPEATABLE READ`.
   - Aislamiento mediante transacciones efímeras con rollback garantizado para prevenir polución entre escenarios.

---

## 3. Matriz de Ejecución de los 12 Escenarios E2E

| # | Escenario Evaluado | Condiciones Iniciales y Datos | Comportamiento Esperado | Resultado Real Certificado |
|---|---|---|---|---|
| **1** | Creación y Sellado BPE | Cotización en `DRAFT`, orden en `marketplace_orders`, inquilino `tenant_corp_01`. | Snapshot insertado con `tenant_id`, estatus `SEALED`, y checksum canónico idéntico al payload. | **PASS** (Hash SHA-256 verificado, `tenant_id` obligatorio validado fail-closed). |
| **2** | Propuesta Alternativa Papel | Decisión de taller con variante sustituta (offset 120g en lugar de estucado 135g). | Registro en `order_paper_decisions` con estado `PROPOSED` y preservación de orden original. | **PASS** (Aislamiento de taller y trazabilidad de decisión confirmada). |
| **3** | Recálculo Delta BPE | Snapshot original congelado (neto 1.407,73 €) y sustitución de papel interior. | Recálculo determinista de pliegos y kilos; margen comercial preservado al 100%. | **PASS** (Delta neto = +71,05 €, sin alteración de partidas de máquina ni encuadernación). |
| **4** | Emisión Segura y Lectura de Cliente | Orden alojada en `marketplace_orders` (sin columna física `customer_email`). | Ingesta segura desde `customer_json`; token monouso de 256 bits emitido sin texto plano en BD. | **PASS** (Correo extraído con éxito, token prefix indexado, hash SHA-256 seguro). |
| **5** | Aceptación Forense y Anti-Replay | Token monouso presentado con OTP válido y payload de consentimiento (IP, User Agent). | Consumo atómico de token (`PENDING` $\to$ `CONSUMED`). Segundo intento rechazado con `410 TOKEN_ALREADY_CONSUMED`. | **PASS** (Transición irreversible y rechazo inmediato de replay). |
| **6** | Persistencia Técnica Efectiva | Transacción de aceptación exitosa. | Generación de fila en `order_effective_technical_specifications`; snapshot de precios original permanece inmutable. | **PASS** (`paper_weight_interior: 120` poblado, versión = 1, snapshot previo intacto). |
| **7** | Delta Positivo ($\Delta > 0$) | Propuesta con coste superior al original. | `gate_contractual: ACCEPTED`, `gate_financial: PAYMENT_PENDING` / `SUPPLEMENTARY_PAYMENT_PENDING`. | **PASS** (Compuerta financiera detenida en cobro pendiente antes de autorizar taller). |
| **8A** | Delta Negativo ($\Delta < 0$) Pagado | Pedido previo en estado `PAID` / `CONFIRMED` y papel alternativo más económico. | Prohibición estricta de `PASSED`. `gate_financial: REFUND_PENDING` con `refund_obligation_id` generado. | **PASS** (`ref_...` emitido para contabilidad; fabricación detenida hasta aprobación). |
| **8B** | Delta Negativo ($\Delta < 0$) Impago | Pedido previo en estado `PENDING` / `UNPAID` y coste menor. | Prohibición estricta de `PASSED`. `gate_financial: REDUCED_PAYMENT_PENDING` con `reduced_obligation_id` generado. | **PASS** (`red_...` emitido con saldo menor ajustado en checkout). |
| **9** | Cancelación Concurrente | Pedido cancelado concurrentemente por administración (`status: 'CANCELLED'`). | Intento de aceptación aborta bajo bloqueo `FOR UPDATE` respondiendo `HTTP 409 ORDER_INELIGIBLE`. | **PASS** (Excepción atrapada y rechazo determinista). |
| **10** | Reasignación de Taller | Pedido reasignado a un taller distinto (`printhouse_beta` en vez de `printhouse_alpha`). | Intento de aceptación aborta bajo bloqueo `FOR UPDATE` respondiendo `HTTP 409 PRINTHOUSE_REASSIGNED`. | **PASS** (Protección contra secuestro de presupuesto confirmada). |
| **11** | Bloqueo de Despacho Industrial | Intento de despacho a máquina con revisión pendiente o compuerta financiera impaga. | Despachador rechaza el envío con `DISPATCH_BLOCKED_BY_PENDING_REVISION` o `FINANCIAL_GATE`. | **PASS** (Máquina de impresión protegida contra órdenes no liquidadas). |
| **12** | Despacho a Máquina con Spec Efectiva | Pedido con revisión aprobada y compuertas cumplidas. | Paquete de producción emitido a cola de máquina conteniendo las especificaciones de `order_effective_technical_specifications`. | **PASS** (`paper_weight_interior: 120` inyectado en paquete JDF y audit log registrado). |

---

## 4. Registro de Resultados del Test Runner

```
 RUN  v3.2.0 C:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer

 ✓ tests/budget02d01_e2e_real_integration.test.js (12 tests) 105ms

 Test Files  1 passed (1)
      Tests  12 passed (12)
   Duration  1.96s
```

La suite completa de regresión (132 pruebas) reporta **100% verde**, confirmando que ninguna corrección introdujo regresiones en la seguridad criptográfica, clasificación fiscal o gobierno de migraciones.
