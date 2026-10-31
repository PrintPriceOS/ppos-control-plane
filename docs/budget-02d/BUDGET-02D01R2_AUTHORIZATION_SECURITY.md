# BUDGET-02D-01R2 — Informe de Seguridad y Gobernanza de Autorizaciones Industriales (SEC-D01 / SEC-D02)

**Repositorio:** PrintPriceOS/ppos-control-plane  
**PR:** #9 — Consignado en modo DRAFT  
**Misión:** BUDGET-02D-01R2 — Cierre Crítico de Autorización Industrial y Liquidación Financiera  
**Dictamen Previo:** `BUDGET-02D01R_FAIL_AUTHORIZATION_GATE`  
**Estado:** REPARADO Y CERTIFICADO (PASS)  

---

## 1. Resumen Ejecutivo y Causa Raíz

En la auditoría de la iteración BUDGET-02D-01R se identificó un fallo de severidad alta en la compuerta de despacho de pedidos con reembolsos pendientes (`REFUND_PENDING`): el servicio `MarketplaceDispatchGatingService.dispatchOrder()` permitía la fabricación basándose en banderas no autenticadas en el objeto de contexto (`context.allowDispatchWithPendingRefund`, `context.industrialOverride`, `context.industrialAuthorization.status`). Esto posibilitaba que cualquier cliente HTTP o llamador del API pudiera omitir la compuerta industrial declarando una bandera en el cuerpo de la petición.

Asimismo, los métodos sensibles `authorizeIndustrialDispatch()` y `settleRefund()` aceptaban llamadas sin autenticar, utilizaban identidades ficticias por defecto (`system_manager`, `system_finance`), no validaban roles ni permisos específicos, no comprobaban el aislamiento de tenant e imprenta, y carecían de bloqueos de concurrencia a nivel de base de datos (`SELECT ... FOR UPDATE`).

En la presente misión **BUDGET-02D-01R2**, se ha implementado una remediación integral y de raíz conforme a las directivas SEC-D01 y SEC-D02.

---

## 2. SEC-D01 — Eliminación Absoluta de Banderas de Contexto

### 2.1 Eliminación de Vectores de Evasión
En [MarketplaceDispatchGatingService.js](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/MarketplaceDispatchGatingService.js), se han suprimido de forma irrevocable los siguientes mecanismos:
- `context.allowDispatchWithPendingRefund` (ELIMINADO)
- `context.industrialAuthorization.status` (ELIMINADO)
- `context.industrialOverride` (ELIMINADO)

### 2.2 Política Inviolable de Compuerta
Un pedido con un saldo negativo pendiente de liquidación (`REFUND_PENDING`) **únicamente** puede recibir despacho a máquina si existe una decisión industrial formalmente concedida y persistida en la tabla `order_effective_technical_specifications`:

$$\text{isExplicitlyAuthorized} \iff \text{effectiveSpecRecord.industrial\_gate\_status} \equiv \text{'AUTHORIZED'}$$

Cualquier bandera declarada en el cuerpo HTTP o en el contexto de despacho es completamente ignorada por el motor de compuertas.

```javascript
// Implementación certificada en MarketplaceDispatchGatingService.js
if (finStatus === 'REFUND_PENDING') {
    const isExplicitlyAuthorized = effectiveSpecRecord.industrial_gate_status === 'AUTHORIZED';

    if (!isExplicitlyAuthorized) {
        await this.logEvent(order.id, orderRef, 'DISPATCH_BLOCKED_PENDING_REFUND_AUTHORIZATION', { 
            financial_reconciliation_status: 'REFUND_PENDING',
            order_ref: orderRef,
            effective_specification_id: effectiveSpecRecord.id
        });
        throw new Error('DISPATCH_BLOCKED: Refund settlement pending. Independent industrial authorization required for unliquidated negative delta.');
    }
}
```

---

## 3. SEC-D02 — Autorización Rigurosa de Métodos Sensibles

El método [authorizeIndustrialDispatch](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/MarketplaceDispatchGatingService.js#L325) ha sido reescrito para aplicar una secuencia estricta de 8 barreras criptográficas, contextuales y transaccionales:

| Barrera | Regla Implementada | Comportamiento Fail-Closed |
| :--- | :--- | :--- |
| **1. Identidad Autenticada** | Exige `userId` real. Prohíbe identidades ficticias (`system_manager`, `system_finance`, `unknown`, `anonymous`, `test`, `system`). | Lanza `UNAUTHORIZED: Valid authenticated operator identity required.` |
| **2. Rol y Permisos (RBAC)** | Whitelist restringida: `SUPER_ADMIN`, `OPS_ADMIN`, `SYSTEM_ADMIN`, `TENANT_ADMIN`, `PRINTHOUSE_ADMIN`, `PLANT_DIRECTOR`, `FINANCE_DIRECTOR`. | Lanza `FORBIDDEN: User role '...' does not have industrial authorization permission.` |
| **3. Causa / Justificación** | Exige `reason` explícito no vacío con una longitud mínima de 5 caracteres. | Lanza `BAD_REQUEST: Industrial authorization requires a justified reason.` |
| **4. Estado del Pedido** | Verifica existencia del pedido y bloquea pedidos cancelados (`CANCELLED`, `REJECTED`, `REFUNDED`, `DELETED`, `SUPERSEDED`). | Lanza `ORDER_INELIGIBLE: Order is in an ineligible status.` |
| **5. Aislamiento Multitenant** | Comprueba concordancia exacta de `tenantId` y `printhouseId` entre el actor autenticado y el pedido asignado (salvo administradores globales). | Lanza `FORBIDDEN: Tenant mismatch` o `FORBIDDEN: Printhouse mismatch`. |
| **6. Revisión Aceptada** | Consulta `order_quote_revisions` para verificar que la última revisión esté en estado `ACCEPTED`. | Lanza `INVALID_REVISION_STATE: Active revision is '...', must be 'ACCEPTED'.` |
| **7. Bloqueo Transaccional** | Ejecuta transacción MySQL con `SELECT ... FOR UPDATE` sobre `order_effective_technical_specifications`. | Evita carreras de concurrencia y mutaciones inconsistentes. |
| **8. Auditoría Persistente** | Registra evento estructurado e inmutable en `marketplace_events` con actor, rol, tenant, imprenta, causa y timestamp ISO-8601. | Trazabilidad forense completa. |

---

## 4. Endpoints HTTP Montados y Gobernados

En [printhouseOrders.js](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/routes/printhouseOrders.js), se han montado las rutas bajo el middleware de seguridad `requirePrinthouseScope()`:

1. `POST /api/printhouse/orders/:orderRef/authorize-industrial-dispatch`
2. `POST /api/printhouse/orders/:orderRef/settle-refund`

Cualquier intento de invocar estas rutas sin un Bearer JWT válido es rechazado con **HTTP 401**. Si el token carece del rol necesario o incumple las restricciones de tenant, es rechazado con **HTTP 403**. Si el pedido se encuentra en un estado inelegible, responde con **HTTP 409**. Si los parámetros o referencias son inválidos, responde con **HTTP 400** o **HTTP 422**.
