# BUDGET-02D-00 — Matriz de Escenarios End-to-End

**Proyecto:** PrintPrice OS  
**Misión:** BUDGET-02D-00 — Auditoría Integral de Integración E2E  
**Estado:** AUDIT ONLY — READ ONLY  
**Referencia Certificada:** `744bdd89676c92de2c612152e1be58fe48698fd9`  

---

## 1. Metodología de Evaluación y Honestidad Intelectual

Conforme a las directrices de la misión, se distingue rigurosamente entre:
- **Prueba Unitaria con Mocks**: Verificación aislada donde la base de datos, los adaptadores y los servicios downstream son sustituidos por objetos en memoria.
- **Prueba de Integración en MySQL 8 Efímero**: Verificación ejecutada contra un motor SQL real con migraciones y transacciones reales.
- **Prueba End-to-End Multi-Servicio**: Ejecución coordinada real entre Budget App (Node), Control Plane (Fastify/Express), Motor BPE y Base de Datos.

**Advertencia de Auditoría**: El hecho de que la suite unitaria pase al 100% no demuestra la viabilidad operativa en producción si existen rutas desalineadas, columnas SQL inexistentes o compuertas desacopladas.

---

## 2. Matriz de los 16 Escenarios Obligatorios

### Escenario 1: Pedido Normal con Papel Confirmado
- **Descripción**: La imprenta verifica stock del papel solicitado por el cliente y confirma disponibilidad sin alteraciones.
- **Evidencias Existentes**:
  - [orderPaperDecisionService.js:687-689](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/orderPaperDecisionService.js#L687-L689): Acción `CONFIRM` persiste `DELTA_ZERO_CONFIRMED` con delta 0.0000.
  - Pruebas unitarias en [budget_02b01_order_paper_decision.test.js](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/tests/budget_02b01_order_paper_decision.test.js).
- **Transición Esperada**: `order_paper_decisions` (`status = 'ACTIVE'`, `economic_status = 'DELTA_ZERO_CONFIRMED'`). No se emite revisión económica (`REVISION_NOT_APPLICABLE`).
- **Resultado Conocido**: **PASS (Verificado en Unit / DB)**.
- **Pruebas Pendientes**: Flujo completo de confirmación visual en UI de imprenta conectada a Control Plane vía Fastify.

---

### Escenario 2: Propuesta de Papel Alternativo con Delta Positivo
- **Descripción**: Imprenta propone variante de mayor gramaje o coste (ej. Offset 90g $\to$ Offset 120g).
- **Evidencias Existentes**:
  - `recalculateDeterministicBpePrice` calcula incremento exacto de kilos y precio con divisor de margen.
  - Test en [budget02c01_order_quote_revisions.test.js](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/tests/budget02c01_order_quote_revisions.test.js).
- **Transición Esperada**: Decisión pasa a `REQUIRES_ECONOMIC_REVISION`. Revisión creada en `PENDING` con $\Delta \text{Neto} > 0$. Token generado. Si $\Delta > 50$ €, despacho de OTP.
- **Resultado Conocido**: **PARTIAL / BLOCKED en Producción**.
  - **Fallo Real**: Si no hay servidor SMTP/SMS configurado, falla con `OTP_DELIVERY_UNAVAILABLE` (403). Si el pedido está en `marketplace_orders`, falla en MySQL 8 por columna `customer_email`.
- **Pruebas Pendientes**: Ejecución E2E con pasarela de correo real y pedido originado en Budget App.

---

### Escenario 3: Alternativa con Delta Negativo
- **Descripción**: Imprenta propone variante más económica o gramaje inferior (ej. Offset 100g $\to$ Offset 80g).
- **Evidencias Existentes**:
  - `recalculateDeterministicBpePrice` genera $\Delta \text{Neto} < 0$.
- **Transición Esperada**: Revisión creada en `PENDING` con $\Delta < 0$. Aceptación del cliente debe transicionar a `ACCEPTED`, y `gate_financial` debe programar reembolso.
- **Resultado Conocido**: **FAIL (Vacío Financiero)**.
  - **Fallo Real**: [orderQuoteRevisionService.js:1893](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/orderQuoteRevisionService.js#L1893) marca `gate_financial: 'PASSED'` automáticamente. No se registra ninguna orden de reembolso ni crédito para el cliente.
- **Pruebas Pendientes**: Integración con módulo de liquidaciones para emitir nota de crédito.

---

### Escenario 4: Alternativa sin Diferencia Económica
- **Descripción**: Sustitución por papel equivalente de diferente fabricante con idéntica tarifa y merma ($\Delta = 0.0000$).
- **Evidencias Existentes**:
  - Test unitario de Delta Cero verificado en suite de pruebas.
- **Transición Esperada**: Revisión creada en `PENDING` con $\Delta = 0$. Token generado sin requerir OTP (umbral $0 \le 50$ €). Al aceptar, `gate_financial` pasa a `PASSED`.
- **Resultado Conocido**: **PASS (En entorno con mocks)** / **PARTIAL (Afectado por ruta Fastify)**.
- **Pruebas Pendientes**: Confirmación desde cliente sin intervención de pasarela de pago.

---

### Escenario 5: Cliente Acepta Dentro de Plazo
- **Descripción**: Cliente recibe enlace, revisa desglose y acepta la revisión antes de que venza el TTL de 48h hábiles.
- **Evidencias Existentes**:
  - Endpoint `POST /quote-revisions/review/:token/respond` con `decision = 'ACCEPT'`.
  - Token transiciona a `CONSUMED` y revisión a `ACCEPTED`. Registro en `order_revision_audit_events`.
- **Resultado Conocido**: **PARTIAL (Desconexión Industrial)**.
  - **Fallo Real**: La revisión se acepta, pero `orders.specs` nunca se actualiza. Despacho posterior produce con el papel viejo.
- **Pruebas Pendientes**: Propagación bidireccional de especificaciones técnicas a la orden de fabricación.

---

### Escenario 6: Cliente Rechaza la Revisión
- **Descripción**: El cliente no consiente el sobrecoste o el cambio de papel y pulsa "Rechazar".
- **Evidencias Existentes**:
  - [orderQuoteRevisionService.js:1861](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/orderQuoteRevisionService.js#L1861): `newRevisionStatus = 'REJECTED'`.
  - `gate_contractual: 'REJECTED'`.
- **Transición Esperada**: Token pasa a `CONSUMED`. Revisión a `REJECTED`. El pedido revierte a estado pendiente de decisión técnica o cancelación.
- **Resultado Conocido**: **PASS (A nivel de servicio)**.
- **Pruebas Pendientes**: Notificación al taller de que la propuesta fue rechazada.

---

### Escenario 7: Token Caducado
- **Descripción**: Cliente intenta responder tras haber vencido las 48h hábiles de taller calculadas por calendario (`TIME-01R`).
- **Evidencias Existentes**:
  - [orderQuoteRevisionService.js:1731-1736](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/orderQuoteRevisionService.js#L1731-L1736): Comprueba `now > tokenExp`, actualiza token y revisión a `EXPIRED`, y arroja `HTTP 410 TOKEN_EXPIRED`.
- **Resultado Conocido**: **PASS (Verificado en Unit / DB)**.
- **Pruebas Pendientes**: Verificación de zona horaria DST en transiciones de horario de verano/invierno en navegador real.

---

### Escenario 8: OTP Incorrecto o No Entregado
- **Descripción**: Cliente introduce código erróneo o el proveedor de mensajería no confirma el despacho.
- **Evidencias Existentes**:
  - Comprobación de intentos (`otp_attempts`), bloqueo tras 3 fallos con `HTTP 403 INVALID_OTP_CODE`.
  - Rechazo en creación si el proveedor no está configurado (`HTTP 403 OTP_DELIVERY_UNAVAILABLE`).
- **Resultado Conocido**: **PASS (Fail-closed verificado)**.
- **Pruebas Pendientes**: Integración con webhooks de entrega de SendGrid / AWS SES.

---

### Escenario 9: Variante Retirada o Caducada
- **Descripción**: La imprenta propone un papel cuyo catálogo o tarifa de proveedor ha caducado en `supplier_paper_offers`.
- **Evidencias Existentes**:
  - [orderPaperDecisionService.js:372](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/orderPaperDecisionService.js#L372) consulta únicamente `paper_variants` y `paper_products`.
- **Transición Esperada**: El sistema debería rechazar la propuesta con `VARIANT_INACTIVE_OR_EXPIRED`.
- **Resultado Conocido**: **FAIL (Validación Inexistente)**.
  - **Fallo Real**: El servicio solo comprueba la existencia de la fila en `paper_variants`. No valida si la oferta del proveedor está activa o caducada.
- **Pruebas Pendientes**: Añadir join con `supplier_paper_offers` y validar `valid_until > NOW()`.

---

### Escenario 10: Pedido Cancelado Durante la Aceptación
- **Descripción**: El pedido es cancelado mientras el cliente mantiene abierta la página de aceptación del token.
- **Evidencias Existentes**:
  - [orderQuoteRevisionService.js:1721-1745](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/orderQuoteRevisionService.js#L1721-L1745) consulta únicamente `quote_revision_tokens` y `order_quote_revisions`.
- **Transición Esperada**: Debe bloquear la aceptación con `409 ORDER_CANCELLED`.
- **Resultado Conocido**: **FAIL (Supervivencia de Consentimiento)**.
  - **Fallo Real**: La función NO consulta el estado del pedido en `orders`. Procesa la aceptación y marca `ACCEPTED` sobre un pedido cancelado.
- **Pruebas Pendientes**: Añadir verificación bajo lock de `orders.status` en `respondToQuoteRevision`.

---

### Escenario 11: Dos Revisiones Concurrentes
- **Descripción**: Dos operarios intentan emitir simultáneamente revisiones para el mismo pedido.
- **Evidencias Existentes**:
  - Restricción única en BD `uk_oqr_active_slot` sobre columna generada `active_revision_slot` ([168_phase196g_order_quote_revisions.sql:82](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/migrations/168_phase196g_order_quote_revisions.sql#L82)).
  - [orderQuoteRevisionService.js:1148-1160](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/orderQuoteRevisionService.js#L1148-L1160) arroja `HTTP 409 CONCURRENT_REVISION_PENDING` salvo que `allowSupersede = true`.
- **Resultado Conocido**: **PASS (Verificado en Unit / DB)**.
- **Pruebas Pendientes**: Test de concurrencia bajo carga con múltiples hilos en MySQL 8 real.

---

### Escenario 12: Tenant o Imprenta No Autorizados
- **Descripción**: Un operario de Imprenta A intenta emitir o revocar una revisión para un pedido asignado a Imprenta B, o con un tenant ajeno.
- **Evidencias Existentes**:
  - Comprobaciones estrictas de pertenencia en [orderQuoteRevisionService.js:1075, 1085, 1965](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/orderQuoteRevisionService.js#L1075).
  - Rechazos con `HTTP 403 TENANT_MISMATCH` y `PRINTHOUSE_UNAUTHORIZED`.
- **Resultado Conocido**: **PASS (Verificado)**.
- **Pruebas Pendientes**: Intento de bypass mediante manipulación de headers en gateway perimetral.

---

### Escenario 13: Snapshot BPE Ausente o Manipulado
- **Descripción**: El snapshot sellado en `order_pricing_snapshots` no existe, su hash SHA-256 no coincide o fue alterado.
- **Evidencias Existentes**:
  - [orderQuoteRevisionService.js:547-552](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/orderQuoteRevisionService.js#L547-L552): Detecta discrepancia de checksum y arroja `RECALCULATION_BLOCKED` con código `SNAPSHOT_INTEGRITY_TAMPERED` (422).
- **Resultado Conocido**: **PASS (Verificado en Unit)**.
- **Pruebas Pendientes**: Inyección de bytes alterados en la base de datos y verificación de bloqueo en runtime.

---

### Escenario 14: Error de Clasificación Fiscal
- **Descripción**: Pedido con país desconocido o entrega intracomunitaria sin prueba de transporte físico.
- **Evidencias Existentes**:
  - [taxVatReadinessClassifierService.js:84-90, 176-181](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/taxVatReadinessClassifierService.js#L84-L90): Devuelve `TAX_CLASSIFICATION_BLOCKED`.
  - [orderQuoteRevisionService.js:1380-1386](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/orderQuoteRevisionService.js#L1380-L1386) bloquea la emisión de la revisión con HTTP 422.
- **Resultado Conocido**: **PASS (Fail-closed verificado)**.
- **Pruebas Pendientes**: Validación con pedidos B2B con NIF intracomunitario en VIES real.

---

### Escenario 15: Aceptación Contractual con Pago Pendiente
- **Descripción**: Cliente acepta revisión con Delta positivo ($+120$ €), pero aún no ha realizado el pago en pasarela.
- **Evidencias Existentes**:
  - `gate_contractual: 'PASSED'`.
  - `gate_financial: 'PAYMENT_PENDING'`.
  - `gate_industrial: 'PREFLIGHT_PENDING'`.
- **Transición Esperada**: La producción NO debe comenzar. El taller no puede despachar a máquina.
- **Resultado Conocido**: **PASS (Compuertas desacopladas funcionan)**.
- **Pruebas Pendientes**: Verificación de bloqueo en pantalla de taller (`PrinthouseQueue.tsx`).

---

### Escenario 16: Intento de Despacho Industrial Antes de Autorización
- **Descripción**: Operario de taller pulsa "Despachar a Máquina" para un pedido cuya revisión o pago no está completado.
- **Evidencias Existentes**:
  - [MarketplaceDispatchGatingService.js:43-47](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/MarketplaceDispatchGatingService.js#L43-L47):
    `if (!isPaid) throw new Error('DISPATCH_BLOCKED: Order must be PAID before dispatch.');`
- **Resultado Conocido**: **PASS (Bloqueo efectivo)**.
- **Pruebas Pendientes**: Verificación de mensajes de error en interfaz de operario en caso de intento forzado.

---

## 3. Resumen Consolidado de la Matriz E2E

| Estado de Certificación | Cantidad | Escenarios |
|---|---|---|
| **PASS** (Verificado en Unit / Integración Local) | 9 | 1, 4, 6, 7, 8, 11, 12, 13, 14, 15, 16 |
| **PARTIAL / BLOCKED** (Dependencia Externa o Configuración Faltante) | 3 | 2 (Adapter OTP / email), 4 (Ruta Fastify), 5 (Ruta Fastify) |
| **FAIL** (Defecto de Código, Integración o Seguridad) | 4 | 3 (Vacío en Delta Negativo), 9 (Sin validación de oferta caducada), 10 (Consentimiento sobre pedido cancelado), 5 (Despacho con specs viejas) |
