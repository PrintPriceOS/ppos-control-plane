# BUDGET-02C-01R — Validación de Seguridad de Tokens Monouso y Factor OTP

**Proyecto:** PrintPrice OS  
**Repositorio:** `PrintPriceOS/ppos-control-plane`  
**PR:** #8 (`feat/budget-02c01-quote-revisions`), estado DRAFT  
**Misión:** `BUDGET-02C-01R`  
**Controles Clave:** SEC-C01 (OTP Seguro y Entrega Verificada), SEC-C04 (GET Seguro), SEC-C06 (Seguridad de Aceptación)  
**Dictamen:** `BUDGET-02C01R_PASS`  

---

## 1. Arquitectura de Seguridad de Tokens y Segundo Factor

El sistema de revisiones económicas Delta de PrintPrice OS requiere que clientes y compradores aprueben aumentos o variaciones presupuestarias mediante enlaces seguros. Para evitar cualquier vulnerabilidad de toma de control de pedidos, repetición de transacciones, fuerza bruta o bypass de autenticación, se ha implementado una arquitectura criptográfica multicapa:

```
[ Emisión de Revisión ]
        │
        ├── Genera Token Monouso (256 bits CSPRNG hex)
        │       ├── Hash SHA-256 en BD (Cero texto plano)
        │       ├── Vinculación estricta (bound_amount, bound_currency, recipient_email_hash)
        │       └── TTL de 48 horas (evaluado con reloj del servidor)
        │
        └── Si Delta > 50,00 €:
                ├── Genera OTP numérico (6 dígitos CSPRNG)
                ├── Genera Sal Criptográfica (16 bytes hex)
                ├── Hash SHA-256(otp + salt + revisionId) en BD
                ├── TTL OTP: 15 minutos
                └── Entrega forzosa vía canal verificado (OtpDeliveryService)
                        └── Si falla o no configurado ──> BLOQUEO FAIL-CLOSED (403)
```

---

## 2. Validación de Controles Específicos

### 2.1. SEC-C01 — Eliminación del Mock OTP y Factor de Entrega Verificado

#### Causa Raíz Previa
En la versión inicial auditada (`edad68fee97ea462c24809eea473a1d70613eaa7`), la verificación de OTP permitía el bypass directo:
```javascript
// CÓDIGO INSEGURO PREVIO (ELIMINADO):
if (otpCode === '123456') {
    // bypass
}
```

#### Remediación Criptográfica Definitiva
1. **Generador CSPRNG:**
   ```javascript
   const rawOtpCode = crypto.randomInt(100000, 999999).toString();
   const otpSalt = crypto.randomBytes(16).toString('hex');
   const otpHash = computeSaltedOtpHash(rawOtpCode, otpSalt, revisionId);
   ```
2. **Cero Persistencia de Texto Plano:** La base de datos almacena únicamente `otp_hash` (CHAR 64) y `otp_salt` (VARCHAR 32). El código `rawOtpCode` se envía únicamente a través del adaptador de entrega.
3. **Prueba de Entrega Verificada:** Si `this.otpDeliveryService.deliverOtp` no confirma la recepción o si el canal no está configurado, `otp_delivery_status` se marca como `FAILED` y la aceptación del cliente se bloquea en modo fail-closed con `OTP_DELIVERY_UNAVAILABLE` (403). Un código generado pero no entregado jamás satisface el segundo factor.
4. **Límite Transaccional de Intentos:** Cada intento fallido incrementa `otp_attempts`. Al llegar a 3 fallos, el token pasa a `REVOKED` en la base de datos y se responde con HTTP 429 `MAX_OTP_ATTEMPTS_EXCEEDED`.
5. **Sesión Criptográficamente Vinculada:** Cuando el cliente dispone de sesión autenticada previa, el token de sesión se valida con `jwt.verify(sessionToken, secret)`. Se computa `sha256(decoded.email)` y se exige igualdad estricta con `token.recipient_email_hash`. Si no coincide, se rechaza con HTTP 403 `SESSION_RECIPIENT_MISMATCH`.

---

### 2.2. SEC-C04 — GET de Revisión Estrictamente Seguro e Idempotente

#### Invariante de Seguridad
El método HTTP `GET /api/printhouse/quote-revisions/review/:token` es de solo lectura. Debe ser completamente seguro contra prefetching de navegadores (Chrome Pre-render, Safari Quick Look), extensiones web, rastreadores de correo corporativo (antivirus/antispam bots) y proxies intermediarios.

#### Verificación de Ausencia de Efectos Colaterales
- **Cero Mutaciones en Base de Datos:** Se inspeccionó el registro de consultas ejecutadas durante `getQuoteRevisionByToken()`. El conteo de sentencias `UPDATE`, `INSERT` o `DELETE` es estrictamente **0**.
- **Evaluación en Memoria:** La caducidad del token se calcula en tiempo de ejecución comparando el reloj autoritativo del servidor con `parseUtcDate(item.token_expires_at)`.
- **Transición Persistente Separada:** La transición a estado `EXPIRED` en las tablas `quote_revision_tokens` y `order_quote_revisions` se ejecuta exclusivamente a través de la función de mantenimiento transaccional `expireStaleQuoteRevisions()`.

---

### 2.3. SEC-C06 — Seguridad de Tokens Monouso, Prevención de Replay y Compuertas Desacopladas

#### Vinculación Criptográfica
Cada token monouso emitido se encuentra sellado contra:
1. `bound_amount`: Importe neto exacto de la revisión (`189.7914 €`).
2. `bound_currency`: Divisa oficial (`EUR`).
3. `recipient_email_hash`: Hash SHA-256 del correo del destinatario autorizado.
4. `revision_id` y `tenant_id`: Claves foráneas vinculadas a la revisión y pedido auténticos.

#### Prevención de Replay (Replay Attack Immunity)
La respuesta del cliente se procesa mediante `POST /api/printhouse/quote-revisions/review/:token/respond`:
1. La consulta adquiere bloqueo sobre la fila: `SELECT ... FROM quote_revision_tokens WHERE token_hash = ? FOR UPDATE`.
2. Se valida `token.status === 'PENDING'`.
3. Al aceptar o rechazar, el estado pasa atómicamente a `CONSUMED`.
4. Cualquier llamada posterior con el mismo token es interceptada de inmediato y responde HTTP 410 `TOKEN_ALREADY_CONSUMED`.

#### Prevención de Fuerza Bruta (Brute-Force Rate Limiting)
Cada acceso o intento de resolución no autorizado contabiliza `attempt_count = attempt_count + 1`. Al alcanzar 5 intentos, el token es revocado permanentemente (`REVOKED`) y responde HTTP 429 `MAX_ATTEMPTS_EXCEEDED`.

#### Prevención de Filtración de Tokens en Logs
La función `redactToken(token)` enmascara el token en todos los eventos de auditoría y registros del logger:
```javascript
// Entrada: '3a8f10283c714d2e9b05f617a28e93bc41029384756102938475610293847561'
// Salida:  '3a8f***7561'
```

#### Desacoplamiento de Compuertas (Gate Decoupling)
La aceptación de la revisión por parte del cliente valida de forma aislada la compuerta contractual:
- `gate_contractual`: **`PASSED`** (consentimiento expreso registrado).
- `gate_financial`: **`PAYMENT_PENDING`** (no se produce cobro automático; requiere liquidación financiera del delta).
- `gate_industrial`: **`PREFLIGHT_PENDING`** (no se produce envío automático a máquinas de taller; el pedido permanece retenido hasta validación de preflight con el nuevo papel).

---

## 3. Matriz de Resultados de Pruebas de Tokens y OTP

| Escenario de Prueba | Entrada / Condición | Código Esperado | Código Obtenido | Resultado |
| :--- | :--- | :--- | :--- | :--- |
| Bypass con mock `"123456"` | `otpCode: '123456'` | 403 `INVALID_OTP_CODE` | 403 `INVALID_OTP_CODE` | **PASS** |
| Verificación con OTP real CSPRNG | `otpCode: deliveredOtp` | 200 `ACCEPTED` | 200 `ACCEPTED` | **PASS** |
| Agotamiento de 3 intentos OTP | 3 códigos erróneos | 429 `MAX_OTP_ATTEMPTS_EXCEEDED` | 429 `MAX_OTP_ATTEMPTS_EXCEEDED` | **PASS** |
| Adaptador de entrega no configurado | `configured: false` | 403 `OTP_DELIVERY_UNAVAILABLE` | 403 `OTP_DELIVERY_UNAVAILABLE` | **PASS** |
| Sesión con email no coincidente | `decoded.email !== recipient` | 403 `SESSION_RECIPIENT_MISMATCH` | 403 `SESSION_RECIPIENT_MISMATCH` | **PASS** |
| Sesión criptográfica legítima | `decoded.email === recipient` | 200 `ACCEPTED` (`CRYPTOGRAPHIC_SESSION`) | 200 `ACCEPTED` | **PASS** |
| Lectura repetida mediante GET | 2 llamadas sucesivas `GET` | 200 `PENDING` (0 escrituras SQL) | 200 (0 escrituras SQL) | **PASS** |
| Token caducado en GET | `expires_at < now` | 410 `TOKEN_EXPIRED` (0 escrituras SQL) | 410 `TOKEN_EXPIRED` | **PASS** |
| Ataque de repetición (Replay) | 2da respuesta con mismo token | 410 `TOKEN_ALREADY_CONSUMED` | 410 `TOKEN_ALREADY_CONSUMED` | **PASS** |
| Fuerza bruta sobre token (5 intentos)| `attempt_count = 5` | 429 `MAX_ATTEMPTS_EXCEEDED` | 429 `MAX_ATTEMPTS_EXCEEDED` | **PASS** |
| Redacción de token en logs | Token hex de 64 caracteres | `3a8f***7561` | `3a8f***7561` | **PASS** |
| Estado de compuertas tras aceptación | Aceptación exitosa | Contractual: `PASSED`, Financiera: `PENDING`, Industrial: `PENDING` | Idéntico | **PASS** |

---

## 4. Conclusión de Certificación

Se certifica que los mecanismos de tokens monouso y segundo factor OTP cumplen rigurosamente con los estándares bancarios e industriales de no repudio, confidencialidad, prevención de replay y desacoplamiento de compuertas requeridos por la misión **BUDGET-02C-01R**.
