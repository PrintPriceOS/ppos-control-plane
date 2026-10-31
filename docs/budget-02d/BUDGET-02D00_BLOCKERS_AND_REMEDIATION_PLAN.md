# BUDGET-02D-00 — Registro de Bloqueantes y Plan de Remediación

**Proyecto:** PrintPrice OS  
**Misión:** BUDGET-02D-00 — Auditoría Integral de Integración E2E  
**Estado:** AUDIT ONLY — READ ONLY  
**Referencia Certificada:** `744bdd89676c92de2c612152e1be58fe48698fd9`  

---

## 1. Resumen Ejecutivo de Defectos y Bloqueantes

Durante la auditoría integral de integración end-to-end (BUDGET-02D-00) se han identificado **10 defectos técnicos y bloqueantes de integración**, clasificados según el estándar de severidad de PrintPrice OS:

- **3 Críticos (CRITICAL)**: Bloquean la ejecución en bases de datos reales o provocan fallos graves en fabricación.
- **3 Altos (HIGH)**: Provocan desalineación de rutas, supervivencia indebida de consentimientos o vacíos financieros.
- **3 Medios (MEDIUM)**: Afectan a la persistencia relacional, discrepancias de transporte en BPE o proveedores no inyectados.
- **1 Bajo (LOW)**: Falta de validación temporal sobre ofertas de variantes de papel.

---

## 2. Inventario Detallado de Bloqueantes

### BLK-01 (CRITICAL) — Ausencia de `tenant_id` en Sellado Histórico de Snapshots
- **Archivo y Línea**: [src/api/services/quoteService.js:176-188](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/quoteService.js#L176-L188)
- **Función**: `acceptQuoteAndSealOrderPricing(orderId, quoteId, actor)`
- **Evidencia Reproducible**:
  ```sql
  INSERT INTO order_pricing_snapshots (
      snapshot_id, order_id, quote_id, quote_revision, snapshot_revision,
      status, currency, final_amount, formula_version,
      rate_card_id, rate_card_revision, rate_card_checksum,
      snapshot_json, snapshot_checksum, sealed_by
  ) VALUES (?, ?, ?, ?, ?, 'SEALED', ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ```
  La migración [136_phase190_order_pricing_snapshot_sealing.sql:6](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/migrations/136_phase190_order_pricing_snapshot_sealing.sql#L6) establece:
  `tenant_id VARCHAR(64) NOT NULL`.
- **Impacto**: Falla en MySQL 8 en modo estricto (`Field 'tenant_id' doesn't have a default value`). En BUDGET-02C, [orderQuoteRevisionService.js:401](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/orderQuoteRevisionService.js#L401) exige obligatoriamente `tenant_id` no vacío, por lo que el recálculo BPE queda bloqueado con `MISSING_SEALED_TENANT_ID`.
- **Fase de Remediación**: **BUDGET-02D-01 (Inmediata)**.
- **Recomendación**: Añadir `tenant_id` a la lista de columnas y valores en `quoteService.js`:
  ```sql
  INSERT INTO order_pricing_snapshots (..., tenant_id, ...) VALUES (..., order.tenant_id, ...)
  ```

---

### BLK-02 (CRITICAL) — Consulta de Columna Inexistente `customer_email` en `marketplace_orders`
- **Archivo y Línea**: [src/api/services/orderQuoteRevisionService.js:1054](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/orderQuoteRevisionService.js#L1054)
- **Función**: `createQuoteRevision({ ... })`
- **Evidencia Reproducible**:
  ```sql
  SELECT id, order_id, tenant_id, printhouse_id, estimated_price, status, customer_email, metadata_json 
  FROM marketplace_orders 
  WHERE order_id = ? OR id = ? FOR UPDATE
  ```
  En la tabla `marketplace_orders` (migración [011_phase36_marketplace_order_schema.sql](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/migrations/011_phase36_marketplace_order_schema.sql)), `customer_email` **no existe como columna**. Los datos residen en `customer_json`.
- **Impacto**: Todo pedido proveniente de Budget App (almacenado en `marketplace_orders`) falla al intentar emitir una revisión de presupuesto con error fatal de MySQL:
  `ER_BAD_FIELD_ERROR: Unknown column 'customer_email' in 'field list'`.
- **Fase de Remediación**: **BUDGET-02D-01 (Inmediata)**.
- **Recomendación**: Modificar la consulta para seleccionar `customer_json` en lugar de `customer_email`, y extraer el correo mediante parseo seguro de JSON.

---

### BLK-03 (CRITICAL) — Desconexión Industrial: Despacho a Máquina con Especificaciones Viejas
- **Archivo y Línea**: [src/api/services/orderQuoteRevisionService.js:1875](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/orderQuoteRevisionService.js#L1875) y [MarketplaceDispatchGatingService.js:51-68](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/MarketplaceDispatchGatingService.js#L51-L68)
- **Función**: `respondToQuoteRevision` vs `MarketplaceDispatchGatingService.dispatchOrder`
- **Evidencia Reproducible**:
  Al ejecutarse `respondToQuoteRevision`, la revisión pasa a `ACCEPTED`, pero **no se actualiza la columna `specs` en `orders` ni `book_spec_json` en `marketplace_orders`**.
  Posteriormente, al despachar el pedido, `MarketplaceDispatchGatingService` lee `orders.specs` directamente, enviando a la cola de la máquina de impresión la orden con el papel viejo agotado.
- **Impacto**: Pérdida de material y conflicto industrial grave en taller por imprimir sobre papel erróneo a pesar del consentimiento explícito y pago del cliente.
- **Fase de Remediación**: **BUDGET-02D-01 (Inmediata)**.
- **Recomendación**: En `respondToQuoteRevision`, dentro de la misma transacción de aceptación:
  1. Cargar las especificaciones de la variante alternativa aceptada.
  2. Actualizar atómicamente `orders.specs` y `marketplace_orders.book_spec_json`.
  3. Emitir evento de dominio `ORDER_SPECIFICATIONS_UPDATED`.

---

### BLK-04 (HIGH) — Desalineación de Prefijos de Rutas Fastify (`/api/printhouse` vs `/api/marketplace`)
- **Archivo y Línea**: [server.js:372](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/server.js#L372), [printhouseOrders.js:329-330](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/routes/printhouseOrders.js#L329-L330) y [orderQuoteRevisionRoutes.js:9-12](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/routes/orderQuoteRevisionRoutes.js#L9-L12)
- **Evidencia Reproducible**:
  Las rutas de revisión y respuesta se montan mediante:
  `fastify.use('/api/printhouse', require('./src/api/routes/printhouseOrders'));`
  `router.use('/', quoteRevisionRoutes);`
  Resultando en URLs como `/api/printhouse/quote-revisions/review/:token`.
  Budget App y los contratos de cliente esperan `/api/marketplace/quote-revisions/review/:token`, la cual es interceptada por el radix tree de Fastify ([server.js:403-404](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/server.js#L403-L404)) respondiendo `HTTP 404 Endpoint not found`.
- **Impacto**: La interfaz de revisión del cliente no puede conectarse con la API de Control Plane utilizando las URLs estándar documentadas.
- **Fase de Remediación**: **BUDGET-02D-01 (Inmediata)**.
- **Recomendación**:
  1. Montar las rutas públicas de cliente (`/review/:token` y `/review/:token/respond`) explícitamente bajo `/api/marketplace/quote-revisions`.
  2. Mantener las rutas operativas de taller (`/quote-revisions` de emisión y revocación) bajo `/api/printhouse/quote-revisions`.

---

### BLK-05 (HIGH) — Supervivencia de Consentimiento ante Cancelación o Reasignación
- **Archivo y Línea**: [src/api/services/orderQuoteRevisionService.js:1720-1745](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/orderQuoteRevisionService.js#L1720-L1745)
- **Función**: `respondToQuoteRevision`
- **Evidencia Reproducible**:
  La función recupera el token y la revisión sin verificar la fila del pedido padre en `orders`.
- **Impacto**: Un cliente puede aceptar una revisión para un pedido que ya fue cancelado por administración o reasignado a otro taller, dejando estados huérfanos y pagos duplicados.
- **Fase de Remediación**: **BUDGET-02D-01 (Inmediata)**.
- **Recomendación**: Añadir un bloqueo `SELECT status, offer_print_house FROM orders WHERE id = ? FOR UPDATE` y rechazar con `409 ORDER_INELIGIBLE` si el pedido no está en estado válido.

---

### BLK-06 (HIGH) — Vacío Financiero en Diferenciales Negativos ($\Delta \text{Neto} < 0$)
- **Archivo y Línea**: [src/api/services/orderQuoteRevisionService.js:1893](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/orderQuoteRevisionService.js#L1893)
- **Función**: `respondToQuoteRevision`
- **Evidencia Reproducible**:
  `gate_financial: decision === 'ACCEPT' && deltaNet > 0 ? 'PAYMENT_PENDING' : 'PASSED'`
  Si `deltaNet < 0`, el estado pasa a `PASSED` sin emitir orden de devolución ni saldo a favor.
- **Impacto**: El cliente paga de más por un papel que finalmente es más barato, sin que el sistema liquide el reembolso correspondiente.
- **Fase de Remediación**: **BUDGET-02D-01**.
- **Recomendación**: Implementar estado `REFUND_PENDING` en `gate_financial` cuando `deltaNet < 0` y registrar evento para el módulo de facturación.

---

### BLK-07 (MEDIUM) — Discrepancia en Recálculo de Transporte en Imprentas con Costes Técnicos
- **Archivo y Línea**: [orderQuoteRevisionService.js:715](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/orderQuoteRevisionService.js#L715) vs [ppos-pricing-engine-main/src/PriceEngine.js:713-716](file:///C:/Users/KIKE/Downloads/ppos-pricing-engine-main/src/PriceEngine.js#L713-L716)
- **Evidencia Reproducible**:
  Control Plane congela el transporte (`freightCost`), mientras que BPE auténtico recalcula el transporte cuando `rates.technical_costs_for_transport = true`.
- **Impacto**: Desviaciones de entre 5 € y 25 € en pedidos grandes con transporte porcentual.
- **Fase de Remediación**: **BUDGET-02D-02 / BPE Alignment**.

---

### BLK-08 (MEDIUM) — Compuertas Triples No Persistidas en Columnas SQL
- **Archivo y Línea**: [orderQuoteRevisionService.js:1891](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/orderQuoteRevisionService.js#L1891) y migración [168_phase196g_order_quote_revisions.sql](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/migrations/168_phase196g_order_quote_revisions.sql)
- **Impacto**: Downstream no puede consultar indexadamente qué pedidos tienen compuertas aprobadas.
- **Fase de Remediación**: **BUDGET-02D-02**.
- **Recomendación**: Añadir columnas `gate_contractual`, `gate_financial` y `gate_industrial` a `order_quote_revisions`.

---

### BLK-09 (MEDIUM) — Bloqueo de Emisión de Revisiones > 50 € por Proveedor OTP No Inyectado
- **Archivo y Línea**: [orderQuoteRevisionService.js:1456-1468](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/orderQuoteRevisionService.js#L1456-L1468)
- **Impacto**: En despliegues donde no se inyecte un objeto transportador (`sendMail`/`sendOtp`) en `orderQuoteRevisionRoutes.js`, toda revisión con suplemento superior a 50 € falla al emitirse con `HTTP 403 OTP_DELIVERY_UNAVAILABLE`.
- **Fase de Remediación**: **BUDGET-02D-01 (Configuración de Runtime)**.
- **Recomendación**: Cablear un adaptador SMTP por defecto en `orderQuoteRevisionRoutes.js` alimentado por las variables `SMTP_HOST`, `SMTP_USER`, etc., presentes en el entorno.

---

### BLK-10 (LOW) — Ausencia de Verificación de Caducidad de Oferta de Variante
- **Archivo y Línea**: [orderPaperDecisionService.js:372-385](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/orderPaperDecisionService.js#L372-L385)
- **Impacto**: Una imprenta puede proponer un papel cuya oferta de proveedor en `supplier_paper_offers` ya expiró o fue dada de baja.
- **Fase de Remediación**: **BUDGET-02D-02**.

---

## 3. Plan Integral de Remediación (Roadmap hacia BUDGET-02D-01)

| Fase de Ejecución | Bloqueantes Asignados | Alcance de la Acción | Condición de Desbloqueo |
|---|---|---|---|
| **BUDGET-02D-01** (Parches Críticos de Integración) | **BLK-01, BLK-02, BLK-03, BLK-04, BLK-05, BLK-06, BLK-09** | 1. Añadir `tenant_id` a `quoteService.acceptQuoteAndSealOrderPricing`.<br/>2. Corregir consulta SQL a `customer_json` en `marketplace_orders`.<br/>3. Propagar specs revisadas a `orders.specs` tras aceptación.<br/>4. Montar rutas públicas en `/api/marketplace/quote-revisions`.<br/>5. Validar estado de pedido antes de aceptar consentimiento.<br/>6. Establecer `REFUND_PENDING` en Delta negativo.<br/>7. Cablear proveedor de correo en rutas. | Autorización ejecutiva para pasar de READ-ONLY a implementación en PR #8. |
| **BUDGET-02D-02** (Alineación Arquitectónica) | **BLK-07, BLK-08, BLK-10** | 1. Sincronizar recálculo de transporte de BPE.<br/>2. Migración DDL para columnas de compuertas.<br/>3. Validar vigencia temporal en `supplier_paper_offers`. | Tras validación en staging de BUDGET-02D-01. |
