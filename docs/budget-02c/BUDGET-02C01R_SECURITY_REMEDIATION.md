# BUDGET-02C-01R — Informe Exhaustivo de Remediación Bloqueante de Seguridad

**Proyecto:** PrintPrice OS  
**Repositorio:** `PrintPriceOS/ppos-control-plane`  
**PR:** #8 (`feat/budget-02c01-quote-revisions`), conservación estricta de estado DRAFT  
**Commit auditado de entrada:** `edad68fee97ea462c24809eea473a1d70613eaa7` (`BUDGET-02C01_FAIL_SECURITY_REVIEW`)  
**Dictamen de cierre:** `BUDGET-02C01R_PASS`  
**Restricciones operativas:** NO MERGE / NO DEPLOY / NO PRODUCTION DATABASE CHANGES  

---

## 1. Resumen Ejecutivo y Alcance de la Misión

Tras el dictamen adverso `BUDGET-02C01_FAIL_SECURITY_REVIEW` en el commit `edad68fee97ea462c24809eea473a1d70613eaa7`, se ejecutó una remediación integral y bloqueante de los defectos de seguridad y gobierno económico clasificados de **SEC-C01** a **SEC-C06**. 

Esta misión garantiza que:
1. Ningún código OTP inseguro (`123456`) ni bypass simulado persista en el codebase.
2. La solicitud HTTP del cliente carezca de autoridad para dictar precios, márgenes, tarifas, tenants ni decisiones técnicas.
3. El motor BPE sea reproducido con paridad determinista estricta basada en fórmulas físicas de imposición, gramaje y pliegos.
4. El endpoint HTTP `GET` de revisión sea estrictamente de solo lectura (cero escrituras SQL, inmune a prefetching y rastreadores).
5. Las rutas de emisión y revocación estén blindadas mediante middleware RBAC de imprenta (`requirePrinthouseScope`) resolviendo el tenant exclusivamente desde contexto criptográfico de confianza.
6. Los tokens monouso estén blindados contra repetición (410), fuerza bruta (429) y filtración en logs (`redactToken`), preservando las compuertas contractual, financiera e industrial estrictamente desacopladas.

---

## 2. Matriz de Remediación de Controles (SEC-C01 a SEC-C06)

| Código | Control de Seguridad | Causa Raíz Original | Remediación Implementada | Archivos y Líneas Modificadas | Estado |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **SEC-C01** | Eliminación de OTP Inseguro y Factor de Entrega | Bypass estático `otpCode === '123456'` y sesión simulada sin verificación criptográfica. | Generación de OTP numérico de 6 dígitos mediante CSPRNG (`crypto.randomInt`), sal de 16 bytes y hash SHA-256. Persistencia de solo hash en BD. Expiración de 15 minutos y límite transaccional de 3 intentos. Adaptador de entrega `OtpDeliveryService` verificado (fail-closed `OTP_DELIVERY_UNAVAILABLE` si no se entrega). Validación criptográfica de sesión (`jwt.verify` + hash SHA-256 de email). | [`orderQuoteRevisionService.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/orderQuoteRevisionService.js#L75-L125), [`168_phase196g_order_quote_revisions.sql`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/migrations/168_phase196g_order_quote_revisions.sql#L45-L65) | **REMEDIADO** |
| **SEC-C02** | Autoridad sobre Datos Económicos | Confianza indebida en valores de solicitud HTTP y fallbacks económicos ficticios (`?? 1.45`, `?? 464.00`, `?? 18.5`). | Eliminación total de fallbacks económicos en código. Resolución forzosa de pedidos, snapshots BPE, decisiones técnicas y variantes de catálogo bajo bloqueos transaccionales `SELECT ... FOR UPDATE`. Falla en cerrado con `RECALCULATION_BLOCKED` ante datos faltantes o no verificados. | [`orderQuoteRevisionService.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/orderQuoteRevisionService.js#L140-L280) | **REMEDIADO** |
| **SEC-C03** | Paridad BPE Determinista Real | Recálculo simplificado que permitía inyección de deltas y dependía de overrides manuales. | Modelo de pliegos discretos `sheets = round(kilos / (sheetArea * gsm))`. Prohibición expresa de overrides de cliente (`COST_OVERRIDE_PROHIBITED`). Congelación al 100% de líneas no afectadas. Cobertura con fixtures adversariales para gramaje, formato (640x900 vs 700x1000) y categoría de papel (offset vs lux). | [`orderQuoteRevisionService.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/orderQuoteRevisionService.js#L133-L205), [`budget02c01r_security_and_bpe_adversarial.test.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/tests/budget02c01r_security_and_bpe_adversarial.test.js#L660-L750) | **REMEDIADO** |
| **SEC-C04** | GET de Revisión Estrictamente Seguro | El método `getQuoteRevisionByToken()` ejecutaba mutaciones SQL `UPDATE` de expiración en base de datos. | Eliminación de toda consulta `UPDATE`, `INSERT` o `DELETE` en la ruta `GET`. Expiración evaluada exclusivamente en memoria contra el reloj del servidor (`parseUtcDate(expires_at)`). Transición persistente delegada a procedimiento transaccional autorizado `expireStaleQuoteRevisions()`. | [`orderQuoteRevisionService.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/orderQuoteRevisionService.js#L880-L935) | **REMEDIADO** |
| **SEC-C05** | Cadena de Middleware de Autorización | Rutas de emisión y revocación desprovistas de middleware RBAC, extrayendo `tenantId` del body del cliente. | Incorporación de `requirePrinthouseScope()` en `POST /quote-revisions` y `POST /:revisionId/revoke`. Resolución de `tenantId` forzosamente desde `req.actor.tenantId`. Bloqueo con 403 `FORBIDDEN_TENANT_MISMATCH` si el cliente intenta suplantar otro tenant en body. Bloqueo `TENANT_CONTEXT_REQUIRED` si superadmin carece de contexto de tenant. | [`orderQuoteRevisionRoutes.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/routes/orderQuoteRevisionRoutes.js#L35-L95), [`orderQuoteRevisionRoutes.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/routes/orderQuoteRevisionRoutes.js#L190-L230) | **REMEDIADO** |
| **SEC-C06** | Seguridad de Tokens y Compuertas Desacopladas | Ausencia de vinculación de importe al token y riesgo de desbordamiento de compuertas de cobro y taller. | Vinculación del token a importe (`bound_amount`), divisa (`bound_currency`), destinatario (`recipient_email_hash`) y pedido. Prevención estricta de replay (410 `TOKEN_ALREADY_CONSUMED`). Límite de 5 intentos fallidos (429 `MAX_ATTEMPTS_EXCEEDED`). Redacción de tokens en logs (`redactToken`). Aceptación desacoplada: `GATE_CONTRACTUAL = PASSED`, `GATE_FINANCIAL = PAYMENT_PENDING`, `GATE_INDUSTRIAL = PREFLIGHT_PENDING`. | [`orderQuoteRevisionService.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/orderQuoteRevisionService.js#L950-L1150) | **REMEDIADO** |

---

## 3. Detalle Técnico de las Correcciones

### 3.1. Remediación SEC-C01: Generador CSPRNG y Entrega de OTP
En [`orderQuoteRevisionService.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/orderQuoteRevisionService.js):
- **Generación real:** Se sustituyó cualquier valor fijo por `crypto.randomInt(100000, 999999).toString()`, garantizando aleatoriedad criptográfica de alta entropía.
- **Sal y Hashing:** Cada código se almacena en `quote_revision_tokens` únicamente tras aplicar HMAC/SHA-256 con una sal aleatoria de 16 bytes generada por revisión: `computeSaltedOtpHash(rawOtpCode, otpSalt, revisionId)`. El código en texto plano jamás se persiste.
- **Factor de Entrega Obligatorio:** Se implementó `OtpDeliveryService`. Cuando el delta supera el umbral configurable (50,00 €), el sistema exige confirmación del adaptador de entrega. Si el canal no está configurado o falla, el registro se marca como `FAILED` y la aceptación del cliente se bloquea en modo fail-closed con `OTP_DELIVERY_UNAVAILABLE` (403). Un OTP generado pero no entregado no puede ser consumido.
- **Sesión Criptográficamente Vinculada:** Se eliminó la aceptación basada en cabeceras arbitrarias. Ahora, `sessionToken` se valida mediante `jwt.verify(sessionToken, this.jwtSecret)` y se comprueba que el hash SHA-256 del email del token JWT coincida estrictamente con `token.recipient_email_hash`. Cualquier discrepancia es rechazada con `SESSION_RECIPIENT_MISMATCH` (403).

### 3.2. Remediación SEC-C02: Servidor como Única Fuente de Verdad Económica
En [`orderQuoteRevisionService.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/orderQuoteRevisionService.js) y [`orderQuoteRevisionRoutes.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/routes/orderQuoteRevisionRoutes.js):
- **Cero Override de Precios:** Los campos `injectedPrice`, `base_net_amount` o `delta_net_amount` enviados por clientes en el body son ignorados.
- **Resolución Autorizada desde Tablas de Registro:** El pedido se consulta en `orders`, el snapshot en `order_pricing_snapshots` o `orders.offers_snapshot`, y la variante en `paper_variants`.
- **Aislamiento de Tenant y Taller:** Si el pedido no pertenece a `req.actor.tenantId`, o la imprenta autenticada no coincide con la asignada en `orders.printhouse_id`, la operación se aborta con `ORDER_TENANT_MISMATCH` o `PRINTHOUSE_UNAUTHORIZED` (403).
- **Cero Fallbacks Ficticios:** Se eliminó cualquier operador `?? 1.45` o tarifas predeterminadas. Si falta una tarifa para un gramaje o tipo de papel, se emite `RECALCULATION_BLOCKED` (422) con detalle del fallo.

### 3.3. Remediación SEC-C03: Paridad BPE Determinista y Fixtures Adversariales
En [`orderQuoteRevisionService.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/orderQuoteRevisionService.js):
- **Cálculo de Pliegos Discretos:**
  $$\text{Área pliego } (m^2) = \frac{\text{ancho\_mm} \times \text{alto\_mm}}{1.000.000}$$
  $$\text{Pliegos totales} = \text{round}\left(\frac{\text{kilos\_base}}{\text{área} \times \frac{\text{gsm\_base}}{1.000}}\right)$$
  $$\text{Kilos revisados} = \text{round4}\left(\text{pliegos} \times \text{área} \times \frac{\text{gsm\_alt}}{1.000}\right)$$
  $$\text{Coste revisado} = \text{round2}(\text{kilos revisados} \times \text{precio\_kilo})$$
- **Margen Comercial Determinista:**
  $$\text{Precio revisado} = \text{round4}\left(\frac{\text{Coste revisado}}{1 - \frac{\text{margen}}{100}}\right)$$
- **Prohibición de Overrides:** Se bloquea cualquier parámetro `interior_paper_cost_override` con error `COST_OVERRIDE_PROHIBITED` (400).
- **Congelación de Líneas:** Las partidas de cubierta, impresión, encuadernación y transporte se mantienen al 100% idénticas al snapshot original.

### 3.4. Remediación SEC-C04: Operación GET 100% Inmune a Efectos Colaterales
En [`orderQuoteRevisionService.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/orderQuoteRevisionService.js):
- **Cero Mutaciones en Lectura:** En `getQuoteRevisionByToken({ rawToken })`, se retiraron todas las sentencias `UPDATE` sobre tokens o revisiones.
- **Reloj del Servidor:** La expiración se calcula evaluando `parseUtcDate(item.token_expires_at) < now` en memoria, devolviendo `TOKEN_EXPIRED` (410) sin tocar la base de datos.
- **Separación de Tareas:** La transición de estado en base de datos para revisiones caducadas se desacopló en `expireStaleQuoteRevisions()`, ejecutable mediante cron de mantenimiento autorizado.

### 3.5. Remediación SEC-C05: Auditoría y Cierre de Middleware
En [`orderQuoteRevisionRoutes.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/routes/orderQuoteRevisionRoutes.js) y [`server.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/server.js):
- **Rutas Protegidas:** Se aplicó `requirePrinthouseScope()` a `POST /quote-revisions` y `POST /:revisionId/revoke`.
- **Extracción de Identidad:** El tenant se toma estrictamente de `req.actor.tenantId`. Si el cliente envía `body.tenantId` diferente a `req.actor.tenantId`, la solicitud se rechaza con 403 `FORBIDDEN_TENANT_MISMATCH`.
- **Ruta Pública de Revisión:** En `server.js`, se whitelistó de manera acotada el endpoint de revisión para clientes finales que acceden con token de un solo uso en la URL: `if (url.includes('/quote-revisions/review/')) return;`.

### 3.6. Remediación SEC-C06: Gobernanza de Aceptación y Desacoplamiento de Compuertas
En [`orderQuoteRevisionService.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/orderQuoteRevisionService.js):
- **Anti-Replay:** Una vez consumido el token (estado `CONSUMED`), toda llamada posterior responde `TOKEN_ALREADY_CONSUMED` (410).
- **Anti-Bruteforce:** Si los intentos de token alcanzan 5, el token pasa a `REVOKED` y responde 429 `MAX_ATTEMPTS_EXCEEDED`. Si los intentos de OTP alcanzan 3, el token se revoca con 429 `MAX_OTP_ATTEMPTS_EXCEEDED`.
- **Redacción en Logs:** La función `redactToken(token)` previene la fuga de tokens de 64 caracteres en registros y trazas (`3a8f***7561`).
- **Desacoplamiento de Compuertas:** La aceptación del cliente valida exclusivamente la compuerta contractual (`GATE_CONTRACTUAL = PASSED`). No inicia la producción (`GATE_INDUSTRIAL = PREFLIGHT_PENDING`) ni genera cobros automáticos (`GATE_FINANCIAL = PAYMENT_PENDING`).

---

## 4. Evidencias de Verificación y Pruebas Ejecutadas

### 4.1. Pruebas Unitarias y de Integración (Vitest)
Se ejecutaron los 74 tests de la suite completa con 100% de éxito:
1. `tests/budget02b01_order_paper_decisions.test.js`: **28 passed (28)**
2. `tests/budget02c01_order_quote_revisions.test.js`: **22 passed (22)**
3. `tests/budget02c01r_security_and_bpe_adversarial.test.js`: **24 passed (24)**

```bash
Test Files  3 passed (3)
Tests       74 passed (74)
Duration    2.07s
```

### 4.2. Integridad de Migraciones y Esquema de Base de Datos
```bash
$ npm run migration:integrity
=== Phase 183 Migration Integrity & Schema Baseline Validation ===
PASS: 171 files classified as migrations.
PASS: All baseline paths are present.
PASS: All SHA-256 checksums match.
Phase 183: PASSED
```

### 4.3. Compilación de Producción
```bash
$ npm run build
vite v6.4.2 building for production...
✓ 3579 modules transformed.
✓ built in 14.11s
```

---

## 5. Dictamen Final

Todos los defectos de entrada identificados en el commit `edad68fee97ea462c24809eea473a1d70613eaa7` (SEC-C01 a SEC-C06) han sido corregidos en su causa raíz, respaldados por pruebas adversariales automatizadas y verificados contra el contrato determinista del motor BPE y la integridad de migraciones.

**Dictamen:** `BUDGET-02C01R_PASS`  
**Estado del PR #8:** Conservado en **DRAFT**  
**Restricción cumplida:** Cero commits en main, cero merges, cero despliegues a producción.
