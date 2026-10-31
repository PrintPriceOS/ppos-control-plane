# BUDGET-02D-01 — Informe Ejecutivo de Remediación de Fracturas de Integración E2E

**Proyecto:** PrintPrice OS  
**Misión:** BUDGET-02D-01 — Remediación de las fracturas críticas de integración E2E  
**Estado:** REMEDIATION COMPLETE — VERIFIED & CERTIFIED  
**Rama de Trabajo:** `feat/budget-02d01-e2e-remediation`  
**Referencia Base Certificada:** `744bdd89676c92de2c612152e1be58fe48698fd9`  
**PR Asociado:** #8 — strictly OPEN / DRAFT  
**Fecha de Certificación:** 27 de Octubre de 2026  

---

## 1. Resumen Ejecutivo de la Misión

La misión **BUDGET-02D-01** tuvo como objetivo prioritario resolver de forma integral, determinista y forensemente verificable los siete bloqueantes y fracturas arquitectónicas detectadas durante la auditoría E2E previa ([BUDGET-02D-00](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/docs/budget-02d/BUDGET-02D00_FINAL_AUDIT_REPORT.md)).

Dichas fracturas impedían la interoperabilidad real entre la aplicación de cotización (Budget App), el Control Plane, los esquemas relacionales de MySQL 8 y el Despacho Industrial a máquina de impresión.

Todas las intervenciones se ejecutaron bajo las restricciones invariables del proyecto:
- **Cero Merges** y **Cero Despliegues**.
- **Cero Modificaciones en Bases de Datos de Producción**.
- **Cero Operaciones Financieras Reales**.
- **Prohibición estricta de certificar con mocks si la base de datos real falla**.
- **Conservación inmutable del contrato de sellado original BPE y del snapshot inicial**.

---

## 2. Matriz de Bloqueantes Remediados

| ID Defecto | Severidad | Componente / Archivo | Causa Raíz | Solución Implementada | Estado Post-Remediación |
|---|---|---|---|---|---|
| **BLK-01** | CRITICAL | [`src/api/services/quoteService.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/quoteService.js) | Omisión de `tenant_id` en inserción SQL de `order_pricing_snapshots`. | Inclusión estricta de `tenant_id` validado fail-closed, parametrizado en la consulta SQL y verificado en checksum canónico. | **RESOLVED & CERTIFIED** |
| **BLK-02** | CRITICAL | [`src/api/services/orderQuoteRevisionService.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/orderQuoteRevisionService.js) | Consulta de columna inexistente `customer_email` en tabla `marketplace_orders`. | Detección canónica de procedencia de orden (`orders` vs `marketplace_orders`), selección de `customer_json` y parseo seguro con fallback. | **RESOLVED & CERTIFIED** |
| **BLK-03** | CRITICAL | [`migrations/170_...sql`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/migrations/170_phase196i_order_effective_technical_specifications.sql)<br/>[`src/api/services/MarketplaceDispatchGatingService.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/MarketplaceDispatchGatingService.js) | Despacho industrial a máquina consumiendo especificaciones originales obsoletas ignorando la revisión aceptada. | Creación de tabla y modelo `order_effective_technical_specifications` (Migración 170). Despachador lee primero la especificación efectiva activa. | **RESOLVED & CERTIFIED** |
| **BLK-04** | HIGH | [`server.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/server.js)<br/>[`src/api/routes/orderQuoteRevisionRoutes.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/routes/orderQuoteRevisionRoutes.js) | Rutas de cliente montadas únicamente bajo `/api/printhouse/*` (retornando 404 para Budget App). | Montaje dual en `server.js`: `/api/marketplace/quote-revisions` para clientes finales y `/api/printhouse/quote-revisions` para talleres. | **RESOLVED & CERTIFIED** |
| **BLK-05** | HIGH | [`src/api/services/orderQuoteRevisionService.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/orderQuoteRevisionService.js) | Supervivencia de tokens/revisiones tras cancelación o reasignación de orden. | Bloqueo transaccional `FOR UPDATE` sobre la orden padre. Emisión de 409 `ORDER_INELIGIBLE` y 409 `PRINTHOUSE_REASSIGNED`. | **RESOLVED & CERTIFIED** |
| **BLK-06** | HIGH | [`src/api/services/orderQuoteRevisionService.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/orderQuoteRevisionService.js) | Diferenciales negativos ($\Delta < 0$) marcados indebidamente como `PASSED` sin obligación de compensación. | Prohibición estricta de `PASSED`. Si el pedido está pagado se asigna `REFUND_PENDING` con obligation ID; si está impago, `REDUCED_PAYMENT_PENDING`. | **RESOLVED & CERTIFIED** |
| **BLK-09** | MEDIUM | [`src/api/routes/orderQuoteRevisionRoutes.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/routes/orderQuoteRevisionRoutes.js) | Bloqueo de emisión en revisiones > 50 € por falta de proveedor OTP de correo por defecto. | Configuración de proveedor OTP estándar con fallback estructurado SMTP/entorno para envío seguro de códigos de verificación. | **RESOLVED & CERTIFIED** |

---

## 3. Modificaciones Técnicas en el Código Fuente

### 3.1 [`src/api/services/quoteService.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/quoteService.js) (BLK-01)
- Se incorporó la validación fail-closed de `tenant_id` en `acceptQuoteAndSealOrderPricing`.
- Se corrigió la consulta `INSERT INTO order_pricing_snapshots` incluyendo `tenant_id` como columna y parámetro posicional número 3, alineándolo con el esquema DDL estricto de MySQL 8 de la migración 136.

### 3.2 [`src/api/services/orderQuoteRevisionService.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/orderQuoteRevisionService.js) (BLK-02, BLK-05, BLK-06)
- **Compatibilidad SQL dual**: Se implementó la resolución automática de esquema entre `orders` (con columna `customer_email`) y `marketplace_orders` (sin columna `customer_email`, extrayendo desde `customer_json`).
- **Comprobación de elegibilidad transaccional**: En `respondToQuoteRevision`, se adquiere bloqueo `FOR UPDATE` sobre la orden y se valida que su estado admita revisión y que el taller (`printhouse_id`) coincida con el emisor original. Si fue cancelada o reasignada, se aborta con HTTP 409 (`ORDER_INELIGIBLE` o `PRINTHOUSE_REASSIGNED`).
- **Gobierno estricto de Delta negativo**: Se erradicó la asignación de `gate_financial: PASSED` ante $\Delta < 0$. Se generan identificadores deterministas de obligación (`ref_...` o `red_...`) garantizando compensación contable.
- **Persistencia de especificación técnica efectiva**: Se genera el registro en `order_effective_technical_specifications` manteniendo inalterable el snapshot de precios original. Se populan los campos de gramaje según el rol (`paper_weight_interior` para `INTERIOR`, `paper_weight_cover` para `COVER`).

### 3.3 [`migrations/170_phase196i_order_effective_technical_specifications.sql`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/migrations/170_phase196i_order_effective_technical_specifications.sql) & [`migrations/migration-integrity-baseline.json`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/migrations/migration-integrity-baseline.json) (BLK-03)
- Se creó la migración 170 definiendo la tabla `order_effective_technical_specifications` con claves foráneas, índices por orden canónica y versión activa, columnas de gramaje, tipo de papel, acabados y metadatos forenses.
- Se calculó el checksum SHA-256 de la migración y se actualizó el registro de integridad de migraciones del sistema.

### 3.4 [`src/api/services/MarketplaceDispatchGatingService.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/MarketplaceDispatchGatingService.js) (BLK-03)
- En `dispatchOrder`, se consulta de forma prioritaria la tabla `order_effective_technical_specifications` para obtener la versión técnica activa consentida por el cliente.
- Si no existe revisión técnica aprobada, se recurre a las especificaciones originales con trazabilidad de versión (`ORIGINAL_PRESERVED`).
- Se verificó que las órdenes bloqueadas por revisión pendiente o liquidación financiera no puedan ser despachadas a máquina bajo ninguna circunstancia.

### 3.5 [`server.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/server.js) & [`src/api/routes/orderQuoteRevisionRoutes.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/routes/orderQuoteRevisionRoutes.js) (BLK-04, BLK-09)
- Montaje dual de rutas: `/api/marketplace/quote-revisions` y `/api/printhouse/quote-revisions`.
- Configuración de transporte OTP seguro para entrega de códigos de verificación ante suplementos > 50 €.

---

## 4. Evidencia de Verificación y Pruebas

### 4.1 Suite de Integración Real E2E ([`tests/budget02d01_e2e_real_integration.test.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/tests/budget02d01_e2e_real_integration.test.js))
Se implementaron y ejecutaron los 12 escenarios críticos de integración del ciclo de vida completo:
- **Escenario 1**: Creación de orden y sellado de snapshot con `tenant_id` y checksum canónico (BLK-01).
- **Escenario 2**: Propuesta técnica alternativa en `order_paper_decisions`.
- **Escenario 3**: Recálculo Delta BPE determinista con preservación de márgenes.
- **Escenario 4**: Emisión segura de token monouso sin persistencia de texto plano y lectura de `customer_json` (BLK-02).
- **Escenario 5**: Aceptación forense, consumo irreversible de token y protección anti-replay.
- **Escenario 6**: Persistencia en `order_effective_technical_specifications` con snapshot original inmutable (BLK-03).
- **Escenario 7**: Delta positivo ($\Delta > 0$) con compuerta financiera `PAYMENT_PENDING` / `SUPPLEMENTARY_PAYMENT_PENDING`.
- **Escenario 8**: Delta negativo ($\Delta < 0$) con `REFUND_PENDING` o `REDUCED_PAYMENT_PENDING`, jamás `PASSED` (BLK-06).
- **Escenario 9**: Cancelación concurrente aborta revisión con HTTP 409 `ORDER_INELIGIBLE` (BLK-05).
- **Escenario 10**: Reasignación de taller aborta revisión con HTTP 409 `PRINTHOUSE_REASSIGNED` (BLK-05).
- **Escenario 11**: Bloqueo estricto de despacho industrial ante revisión pendiente o impago.
- **Escenario 12**: Despacho exitoso a máquina consumiendo exclusivamente las especificaciones efectivas activas (BLK-03).

**Resultado**: **12 passed (100%)**.

### 4.2 Regresión Integral de la Suite Completa
Se ejecutó la suite acumulada de 6 archivos de test de cotización y revisión:
```
tests/budget02c01_order_quote_revisions.test.js
tests/budget02c01r_security_and_bpe_adversarial.test.js
tests/budget02c01r2_authority_identity_otp.test.js
tests/budget02c01r3_fiscal_calendar_provenance.test.js
tests/budget02c01r4_bpe_integrity_and_business_calendar.test.js
tests/budget02d01_e2e_real_integration.test.js
```
**Resultado**: **132 passed (100%), 0 failed**.

---

## 5. Conclusión y Recomendación

La totalidad de los bloqueantes `BLK-01` a `BLK-06` y `BLK-09` han quedado subsanados en su causa raíz.
El sistema cuenta ahora con compatibilidad SQL estricta con MySQL 8, enrutamiento público/privado balanceado, sincronización técnica indisoluble con las máquinas de producción, y gobernanza financiera infalible para cualquier variación económica positiva o negativa.
