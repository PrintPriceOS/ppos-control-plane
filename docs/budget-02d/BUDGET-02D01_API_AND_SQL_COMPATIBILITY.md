# BUDGET-02D-01 — Especificación de Compatibilidad de Esquemas SQL y Rutas API

**Proyecto:** PrintPrice OS  
**Misión:** BUDGET-02D-01 — Remediación de las fracturas críticas de integración E2E  
**Estado:** CERTIFIED  
**Rama:** `feat/budget-02d01-e2e-remediation`  
**Referencia Base:** `744bdd89676c92de2c612152e1be58fe48698fd9`  

---

## 1. Contexto y Desafío de la Compatibilidad Dual

En la arquitectura de PrintPrice OS conviven dos esquemas relacionales para la gestión de pedidos:
1. **`orders`**: Esquema clásico/industrial de Control Plane, con columnas físicas individuales para el cliente (`customer_email`), especificaciones serializadas (`specs`) y taller asignado (`offer_print_house` / `printhouse_id`).
2. **`marketplace_orders`**: Esquema de comercio electrónico y Budget App (Migración 011), diseñado con columnas agregadas de tipo JSON (`customer_json`, `book_spec_json`, `pricing_json`) y claves de orden canónica (`order_id`).

Previo a la remediación de **BLK-02**, los métodos de emisión y consulta en `orderQuoteRevisionService.js` intentaban consultar la columna física `customer_email` directamente sobre `marketplace_orders`, generando el fallo fatal de MySQL:
```
ER_BAD_FIELD_ERROR: Unknown column 'customer_email' in 'field list'
```

Asimismo, previo a **BLK-04**, las rutas de revisión orientadas al cliente final se encontraban montadas bajo `/api/printhouse/*`, inaccesibles desde el frontend de Budget App.

---

## 2. Resolución de Esquema Dual en Capa de Servicio

### 2.1 Mapeo Comparativo de Esquemas

| Concepto de Dominio | Tabla `orders` | Tabla `marketplace_orders` | Estrategia de Resolución Canónica |
|---|---|---|---|
| **Identificador Canónico** | `id` (UUID / VARCHAR) | `order_id` o `id` (VARCHAR) | Resolución unificada mediante `order_id = ? OR id = ?` |
| **Inquilino (Tenancy)** | `tenant_id` | `tenant_id` | Mapeo directo fail-closed |
| **Taller Asignado** | `offer_print_house` / `printhouse_id` | `printhouse_id` | Coalescencia: `row.printhouse_id || row.offer_print_house` |
| **Correo del Cliente** | Columna física `customer_email` | Objeto JSON `customer_json.email` | Extracción segura con parseo JSON y fallback |
| **Nombre del Cliente** | Columna física `customer_name` | Objeto JSON `customer_json.name` | Extracción segura con parseo JSON |
| **Especificación de Libro**| Columna de texto/JSON `specs` | Columna JSON `book_spec_json` | Delegación en especificación efectiva |
| **Estado del Pedido** | `status` | `status` | Validación de elegibilidad para revisión |

### 2.2 Algoritmo de Detección e Ingesta Segura de Cliente

Implementado en [`src/api/services/orderQuoteRevisionService.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/orderQuoteRevisionService.js):

```javascript
// Detección de la procedencia de la orden
const isMarketplace = Boolean(rawOrder.customer_json !== undefined || rawOrder.order_id);

let customerEmail = null;
let customerName = null;

if (isMarketplace && rawOrder.customer_json) {
    try {
        const customer = typeof rawOrder.customer_json === 'string'
            ? JSON.parse(rawOrder.customer_json)
            : rawOrder.customer_json;
        customerEmail = customer.email || customer.customer_email || null;
        customerName = customer.name || customer.customer_name || null;
    } catch (e) {
        logger.warn('Failed to parse customer_json in marketplace order', { orderId });
    }
}

if (!customerEmail && rawOrder.customer_email) {
    customerEmail = rawOrder.customer_email;
}

if (!customerEmail) {
    throw new Error(`(ORDER_CUSTOMER_NOT_FOUND) Unable to resolve authoritative customer email for order ${orderId}`);
}
```

Este patrón garantiza que:
- Jamás se emite una sentencia SQL que presuponga columnas físicas en tablas que no las poseen.
- Ambas fuentes de datos convergen en un único modelo de cliente fuertemente tipado.
- Se previene la inyección de destinatarios espurios no asociados contractualmente al pedido.

---

## 3. Arquitectura de Rutas HTTP y Separación de Dominios

Para resolver **BLK-04**, se implementó en [`server.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/server.js) y [`src/api/routes/orderQuoteRevisionRoutes.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/routes/orderQuoteRevisionRoutes.js) una separación limpia entre las rutas públicas para el comprador y las rutas operativas para el personal de imprenta.

### 3.1 Topología de Montaje en Fastify

```
Fastify Server
├── /api/marketplace/quote-revisions  (Público / Comprador / Token monouso)
│   ├── GET  /review/:token           (Solo lectura, verificación previa, 0 mutaciones)
│   └── POST /review/:token/respond   (Aceptación/Rechazo, OTP condicional, consentimiento)
│
└── /api/printhouse/quote-revisions   (Intranet Taller / RBAC Printhouse)
    ├── POST /                        (Emisión de propuesta de revisión de presupuesto)
    └── POST /:revisionId/revoke      (Revocación de propuesta pendiente)
```

### 3.2 Matriz de Contratos de Endpoints

| Método | Ruta Canónica | Nivel de Acceso | Autenticación / Autorización | Payload / Parámetros | Comportamiento / Respuesta |
|---|---|---|---|---|---|
| `GET` | `/api/marketplace/quote-revisions/review/:token` | Público (Comprador) | Token monouso en URL (256-bit hash) | Ninguno | Retorna JSON con desglose original, propuesto, delta económico y flags de OTP requerida. **Cero escrituras en BD**. |
| `POST` | `/api/marketplace/quote-revisions/review/:token/respond` | Público (Comprador) | Token monouso + OTP (si $\Delta > 50\text{ €}$) | `{ decision: 'ACCEPT'\|'REJECT', rejection_reason, otp_code, consent: { ip_address, user_agent, timestamp } }` | Transacción atómica. Valida orden, consume token, genera especificación efectiva y emite estado de compuertas. |
| `POST` | `/api/printhouse/quote-revisions` | Taller de Impresión | JWT Taller / Tenant Session | `{ order_id, alternative_variant_id, paper_role, reason }` | Resuelve delta BPE determinista, genera token y envía enlace por correo. |
| `POST` | `/api/printhouse/quote-revisions/:revisionId/revoke` | Taller de Impresión | JWT Taller / Tenant Session | `{ revocation_reason }` | Revoca la propuesta y transiciona el token a `REVOKED`. |

---

## 4. Garantías de MySQL 8 en Modo Estricto

1. **`STRICT_TRANS_TABLES`**: Ninguna columna sin valor por defecto puede ser omitida. Verificado en `order_pricing_snapshots` (`tenant_id`) y `order_effective_technical_specifications`.
2. **`ONLY_FULL_GROUP_BY`**: Ausencia de agrupaciones ambiguas.
3. **Bloqueos Concurrenciales**: Uso de `SELECT ... FOR UPDATE` sobre la fila del pedido antes de aplicar cualquier mutación contractual.
4. **Idempotencia Transaccional**: El consumo de tokens verifica `status = 'PENDING'` en la cláusula `UPDATE`, impidiendo condiciones de carrera concurrentes (Double-Spend / Replay Attack).
