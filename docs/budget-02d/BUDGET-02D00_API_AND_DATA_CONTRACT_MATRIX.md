# BUDGET-02D-00 — Matriz de Contratos API y Esquema de Datos

**Proyecto:** PrintPrice OS  
**Misión:** BUDGET-02D-00 — Auditoría Integral de Integración E2E  
**Estado:** AUDIT ONLY — READ ONLY  
**Referencia Certificada:** `744bdd89676c92de2c612152e1be58fe48698fd9`  

---

## 1. Inventario de Endpoints: Comparativa entre Especificación y Montaje Real

Se ha realizado una auditoría exhaustiva comparando las rutas documentadas en especificaciones de diseño, las rutas declaradas en los archivos de rutas de Express y las rutas efectivamente registradas en el árbol Fastify en [server.js](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/server.js).

### 1.1 Matriz de Rutas y Estado Operativo

| Endpoint Documentado | Ruta Montada Realmente en Fastify | Middleware de Autenticación | Validador de Entrada | Clasificación de Integración | Causa Raíz / Observaciones |
|---|---|---|---|---|---|
| `POST /api/marketplace/quote-revisions` | `POST /api/printhouse/quote-revisions` | `requirePrinthouseScope()` | `OrderQuoteRevisionService` (Fail-closed en overrides) | **PARTIAL** | **Desalineación de Prefijo**: Montado bajo `/api/printhouse`, no en `/api/marketplace`. Exige sesión o API Key de imprenta. Si `deltaNet > 50 €`, falla si no hay adaptador OTP configurado. Falla en `marketplace_orders` por columna `customer_email`. |
| `GET /api/marketplace/quote-revisions/review/:token` | `GET /api/printhouse/quote-revisions/review/:token` | Ninguno (Acceso público por token monouso) | Validación de hash SHA-256 en BD | **PARTIAL / MISSING** | **Ruta no encontrada en cliente**: Budget App espera `/api/marketplace/...` y recibe 404 de Fastify. En la ruta de printhouse funciona, pero expone un endpoint de cliente final dentro del espacio de nombres de intranet de imprenta. |
| `POST /api/marketplace/quote-revisions/review/:token/respond` | `POST /api/printhouse/quote-revisions/review/:token/respond` | Ninguno (Autenticación por token y OTP) | Verificación anti-replay, caducidad y OTP si delta > 50€ | **PARTIAL / MISSING** | Igual que el anterior. La respuesta es interceptada con 404 si el cliente invoca el prefijo canónico `/api/marketplace`. |
| `POST /api/marketplace/quote-revisions/:revisionId/revoke` | `POST /api/printhouse/quote-revisions/:revisionId/revoke` | `requirePrinthouseScope()` | Verificación de estado PENDING y pertenencia de tenant | **PARTIAL** | Montado en `/api/printhouse/quote-revisions/:id/revoke`. Funciona para operarios autenticados, pero desalineado del prefijo documentado. |
| `POST /api/printhouse/orders/:orderRef/paper-decision` | `POST /api/printhouse/orders/:orderRef/paper-decision` | `requirePrinthouseScope()` | [orderPaperDecisionService.recordDecision](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/orderPaperDecisionService.js#L402) | **IMPLEMENTED** | Correctamente montado y enlazado. Idempotente con fingerprint SHA-256. |
| `GET /api/printhouse/orders/:orderRef/paper-decisions` | `GET /api/printhouse/orders/:orderRef/paper-decisions` | `requirePrinthouseScope()` | Tenant y printhouse context | **IMPLEMENTED** | Lista decisiones activas e históricas para el pedido. |
| `POST /api/marketplace/orders` | `POST /api/marketplace/orders` | Token de ingesta `X-Marketplace-Token` o JWT | [marketplaceOrderService.createOrder](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/marketplaceOrderService.js#L258) | **IMPLEMENTED** | Inserta en tabla `marketplace_orders`. Soporta bypass autenticado por token de cabecera. |
| `POST /api/admin/orders` | `POST /api/admin/orders` | `requireAdmin` | [ordersService.createOrder](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/ordersService.js) | **IMPLEMENTED** | Inserta en tabla `orders`. Utilizado por Budget App cuando `CONTROL_PLANE_ORDER_ENDPOINT` es default. |
| `POST /api/printhouse/orders/:orderRef/dispatch` | `POST /api/printhouse/orders/:orderRef/dispatch` | `requirePrinthouseScope()` | [MarketplaceDispatchGatingService.dispatchOrder](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/MarketplaceDispatchGatingService.js#L17) | **BLOCKED** | **Bloqueo de Integración**: Consulta únicamente la tabla `orders`. Falla con `ORDER_NOT_FOUND` si el pedido se creó en `marketplace_orders`. Además, despacha las especificaciones originales (`orders.specs`), no las revisadas en `order_quote_revisions`. |

---

## 2. Matriz Comparativa de Esquema de Datos (MySQL 8)

### 2.1 Tablas Implicadas y Migraciones Canónicas

1. **`order_paper_decisions`** (Migración [167_phase196f_order_paper_decisions.sql](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/migrations/167_phase196f_order_paper_decisions.sql))
2. **`order_pricing_snapshots`** (Migración [136_phase190_order_pricing_snapshot_sealing.sql](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/migrations/136_phase190_order_pricing_snapshot_sealing.sql))
3. **`order_quote_revisions`** (Migración [168_phase196g_order_quote_revisions.sql](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/migrations/168_phase196g_order_quote_revisions.sql))
4. **`quote_revision_tokens`** (Migración [168_phase196g_order_quote_revisions.sql](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/migrations/168_phase196g_order_quote_revisions.sql))
5. **`order_revision_audit_events`** (Migración [168_phase196g_order_quote_revisions.sql](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/migrations/168_phase196g_order_quote_revisions.sql))
6. **`printhouse_profiles`** (Migración [169_phase196h_printhouse_profiles.sql](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/migrations/169_phase196h_printhouse_profiles.sql))
7. **`marketplace_orders`** (Migración [011_phase36_marketplace_order_schema.sql](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/migrations/011_phase36_marketplace_order_schema.sql))
8. **`orders`** (Baseline Canónico en [bootstrap_canonical_schema.js](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/scripts/bootstrap_canonical_schema.js#L652))
9. **`paper_variants`** (Migración [163_phase196b_paper_products_and_import_staging.sql](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/migrations/163_phase196b_paper_products_and_import_staging.sql))

---

## 3. Discrepancias entre Consultas en Código y Columnas Reales en Base de Datos

Esta sección audita exhaustivamente cada consulta SQL presente en los servicios de BUDGET-02C frente a las columnas reales del esquema canónico.

### 3.1 Defecto en `quoteService.js` (Falta de `tenant_id` en Sellado)
- **Código Auditado**: [src/api/services/quoteService.js](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/quoteService.js#L176-L188)
```sql
INSERT INTO order_pricing_snapshots (
    snapshot_id, order_id, quote_id, quote_revision, snapshot_revision,
    status, currency, final_amount, formula_version,
    rate_card_id, rate_card_revision, rate_card_checksum,
    snapshot_json, snapshot_checksum, sealed_by
) VALUES (?, ?, ?, ?, ?, 'SEALED', ?, ?, ?, ?, ?, ?, ?, ?, ?)
```
- **Esquema Real (Migración 136)**:
  `tenant_id VARCHAR(64) NOT NULL`
- **Diagnóstico**: `tenant_id` es una columna obligatoria sin valor por defecto. En modo estricto de MySQL 8 (`STRICT_TRANS_TABLES`), la inserción falla de inmediato con:
  `Field 'tenant_id' doesn't have a default value`.
  Si se inserta como cadena vacía en entornos legacy, el validador de BUDGET-02C ([orderQuoteRevisionService.js:401](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/orderQuoteRevisionService.js#L401)) rechaza el snapshot con `MISSING_SEALED_TENANT_ID`.
- **Severidad**: **CRITICAL**.

---

### 3.2 Defecto en `orderQuoteRevisionService.js` (Consulta de `customer_email` en `marketplace_orders`)
- **Código Auditado**: [src/api/services/orderQuoteRevisionService.js](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/orderQuoteRevisionService.js#L1054)
```sql
SELECT id, order_id, tenant_id, printhouse_id, estimated_price, status, customer_email, metadata_json 
FROM marketplace_orders 
WHERE order_id = ? OR id = ? 
FOR UPDATE
```
- **Esquema Real (Migración 011)**:
  Las columnas de `marketplace_orders` son:
  `id, order_id, pricing_session_id, selected_offer_id, customer_id, tenant_id, printhouse_id, status, currency, estimated_price, book_spec_json, selected_offer_json, customer_json, readiness_json, metadata_json, created_at, updated_at`.
- **Diagnóstico**: La columna `customer_email` **NO EXISTE** en `marketplace_orders` (los datos del cliente se almacenan dentro de `customer_json`).
  Al ejecutarse contra una base de datos MySQL 8 real, la consulta arroja:
  `ER_BAD_FIELD_ERROR: Unknown column 'customer_email' in 'field list'`.
  En los tests unitarios este fallo no se detectó porque `mockDb` devolvía un objeto JavaScript plano donde `customer_email` había sido inyectado manualmente.
- **Severidad**: **CRITICAL**.

---

### 3.3 Defecto en Consulta a Tabla `orders` (Columnas Inexistentes en Baseline Canónico)
- **Código Auditado**: [src/api/services/orderQuoteRevisionService.js](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/orderQuoteRevisionService.js#L1043)
```sql
SELECT id, order_ref, tenant_id, offer_print_house, offer_price, status, offers_snapshot, 
       active_pricing_snapshot_id, customer_email, recipient_email, metadata_json, user_id 
FROM orders 
WHERE order_ref = ? OR id = ? 
FOR UPDATE
```
- **Esquema Real Canónico ([bootstrap_canonical_schema.js:652](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/scripts/bootstrap_canonical_schema.js#L652))**:
  `id, job_id, tenant_id, assigned_printhouse_id, currency, active_pricing_snapshot_id, status, created_at, updated_at`.
- **Diagnóstico**: Las columnas `order_ref`, `offer_print_house`, `offer_price`, `offers_snapshot`, `customer_email`, `recipient_email`, `metadata_json` y `user_id` no forman parte del baseline canónico de `orders`. Solo existen en fixtures dinámicos o parches efímeros. En un despliegue canónico limpio, esta consulta falla por columnas desconocidas.
- **Severidad**: **HIGH**.

---

### 3.4 Ausencia de Columnas de Compuertas en `order_quote_revisions`
- **Código Auditado**: [src/api/services/orderQuoteRevisionService.js](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/orderQuoteRevisionService.js#L1891-L1895)
```js
const gates = {
    gate_contractual: decision === 'ACCEPT' ? 'PASSED' : 'REJECTED',
    gate_financial: decision === 'ACCEPT' && deltaNet > 0 ? 'PAYMENT_PENDING' : 'PASSED',
    gate_industrial: 'PREFLIGHT_PENDING'
};
```
- **Esquema Real (Migración 168)**:
  `order_quote_revisions` contiene `status ENUM('PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'SUPERSEDED', 'REVOKED')`.
- **Diagnóstico**: Las compuertas triples no se guardan como columnas relacionales (`gate_contractual`, `gate_financial`, `gate_industrial`), sino como un fragmento JSON embebido en `order_revision_audit_events.payload_json`. Esto impide que motores de búsqueda o trabajadores de fondo puedan realizar consultas optimizadas del tipo `SELECT * FROM order_quote_revisions WHERE gate_financial = 'PASSED'`.
- **Severidad**: **MEDIUM**.

---

## 4. Resumen de Compatibilidad de Datos

| Tabla SQL | Estado de la Migración | Integridad Relacional | Coincidencia con Código |
|---|---|---|---|
| `order_paper_decisions` | Migración 167 ejecutada | FK a `paper_variants` con `ON DELETE RESTRICT`. Columna generada `active_role_slot` funcional. | **100% Coincidencia** |
| `order_pricing_snapshots` | Migración 136 ejecutada | Exige `tenant_id NOT NULL`. El servicio emisor histórico omite el campo. | **Discrepancia Crítica (Falta `tenant_id`)** |
| `order_quote_revisions` | Migración 168 ejecutada | Unique Key `uk_oqr_active_slot` sobre columna generada. FK a `order_paper_decisions`. | **100% Coincidencia** |
| `quote_revision_tokens` | Migración 168 ejecutada | Hash SHA-256 único, FK a `order_quote_revisions` con `ON DELETE CASCADE`. | **100% Coincidencia** |
| `printhouse_profiles` | Migración 169 ejecutada | CHECK constraints en margen y TTL. IANA timezone y jurisdicción validadas. | **100% Coincidencia** |
| `marketplace_orders` | Migración 011 ejecutada | No posee `customer_email` como columna física. | **Discrepancia Crítica (Consulta `customer_email`)** |
| `orders` | Baseline Script | Faltan 8 columnas que el servicio asume existentes. | **Discrepancia Alta (Esquema no canónico)** |
