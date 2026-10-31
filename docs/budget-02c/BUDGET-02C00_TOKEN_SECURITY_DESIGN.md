# DISEÑO DE SEGURIDAD DEL TOKEN DE REVISIÓN ECONÓMICA — BUDGET-02C-00
## Tokens Criptográficos Monouso, Separación HTTP, Desafío de Identidad y Mitigación de Fugas

**Proyecto:** PrintPrice OS  
**Misión:** BUDGET-02C-00 — Seguridad del Token de Aceptación  
**Estado:** `BUDGET-02C00_DESIGN_APPROVED`  
**Modalidad Operativa:** READ-ONLY / DESIGN FIRST  
**Restricciones:** NO MERGE / NO DEPLOY / NO CODE MUTATION / NO DATABASE CHANGES  
**Fecha:** 27 de octubre de 2026  
**Autor:** Antigravity (Advanced Agentic Architecture)

---

## 1. Fundamentos Criptográficos del Token

El token de revisión económica (`quote_revision_token`) es un artefacto de autorización delegado que permite al comprador de un pedido inspeccionar una propuesta económica y manifestar su consentimiento formal de forma segura sin requerir credenciales maestras de la plataforma.

### 1.1 Generación y Entropía Criptográfica
- **CSPRNG (Cryptographically Secure Pseudo-Random Number Generator):**  
  Se genera exclusivamente mediante la API criptográfica nativa de Node.js:
  ```javascript
  const crypto = require('crypto');
  
  function generateRevisionToken() {
      // 256 bits de entropía pura (32 bytes aleatorios del sistema operativo)
      const rawEntropy = crypto.randomBytes(32);
      // Codificación Base64 URL-safe (sin '/', '+' ni '=')
      const tokenString = rawEntropy.toString('base64url');
      const rawToken = `qrt_${tokenString}`; // Longitud: 47 caracteres
      
      // Hash SHA-256 para persistencia segura en base de datos
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const tokenPrefix = rawToken.slice(0, 12); // Ej: 'qrt_Ab9XkL2m'
      
      return { rawToken, tokenHash, tokenPrefix };
  }
  ```
- **Cero Persistencia en Texto Claro (Zero-Plaintext Invariant):**  
  El valor `rawToken` solo existe en memoria durante el envío del correo electrónico o notificación transaccional. La base de datos de Control Plane almacena única y exclusivamente `token_hash` (SHA-256 de 64 caracteres hexadecimales). Una fuga de volcado SQL no compromete los tokens activos.

---

## 2. Vinculación Contextual Inmutable del Token

Para neutralizar ataques de sustitución de parámetros o manipulación de importes, el token no es una cadena opaca flotante, sino que está vinculado de forma criptográfica y referencial a:
1. **Identidad de la Orden y Tenant:** `tenant_id` y `external_order_intent_id`.
2. **Revisión y Versión Exacta:** `revision_id` y `revision_number`.
3. **Importes Contractuales Fijos:** `delta_gross_amount`, `revised_gross_amount` y `currency`.
4. **Huella Canónica de Especificaciones:** `snapshot_canonical_hash` (SHA-256 del pliego de condiciones técnicas).
5. **Destinatario Verificado:** `recipient_email_hash` (SHA-256 del email del comprador en minúsculas).
6. **Vigencia Absoluta:** `expires_at` en UTC.

Cualquier discrepancia entre el token presentado y los atributos de la revisión almacenada provoca la anulación inmediata de la petición con HTTP `403 FORBIDDEN`.

---

## 3. Separación Estricta de Métodos HTTP (RFC 7231)

```
                            ┌──────────────────────────────────────┐
                            │      Cliente recibe enlace seguro    │
                            │ https://budget.printprice.pro/rev/...│
                            └──────────────────┬───────────────────┘
                                               │
                                               ▼
                            ┌──────────────────────────────────────┐
                            │    HTTP GET /api/.../quote-revision  │
                            │   PREVISUALIZACIÓN DE SOLO LECTURA   │
                            └──────────────────┬───────────────────┘
                                               │
                                               ├───────────────────────────────────────────┐
                                               │ Cero consumo de token                     │ Inmune a rastreadores de
                                               │ Consulta determinista de datos            │ WhatsApp, Slack, Antivirus
                                               │ Presenta formulario de consentimiento     │ y prefetch de navegadores
                                               │                                           └───────────────────────────┘
                                               ▼
                            ┌──────────────────────────────────────┐
                            │    Verificación de Identidad (OTP)   │
                            │  (Obligatorio para Δ > 50 €)         │
                            └──────────────────┬───────────────────┘
                                               │
                       ┌───────────────────────┴───────────────────────┐
                       │                                               │
                       ▼                                               ▼
┌──────────────────────────────────────────────┐ ┌──────────────────────────────────────────────┐
│     HTTP POST /api/.../quote-revision/accept │ │     HTTP POST /api/.../quote-revision/reject │
│           ACEPTACIÓN FORMAL DELTA            │ │           RECHAZO EXPRESO DELTA              │
├──────────────────────────────────────────────┤ ├──────────────────────────────────────────────┤
│ • Requiere cuerpo JSON de consentimiento     │ │ • Requiere cuerpo JSON de rechazo            │
│ • Bloqueo SELECT ... FOR UPDATE              │ │ • Bloqueo SELECT ... FOR UPDATE              │
│ • Token transiciona a CONSUMED (POST_ACCEPT) │ │ • Token transiciona a CONSUMED (POST_REJECT) │
│ • Revisión pasa a REVISION_ACCEPTED          │ │ • Revisión pasa a REVISION_REJECTED          │
│ • Activa Puerta Financiera & Industrial      │ │ • Activa Resolución Comercial                │
└──────────────────────────────────────────────┘ └──────────────────────────────────────────────┘
```

### 3.1 `GET /api/marketplace/orders/:orderId/quote-revision/:rawToken` (Seguro y de Solo Lectura)
- **Cumplimiento RFC 7231:** Método seguro e idempotente.
- **Acción:**
  - Computa `tokenHash = SHA256(rawToken)`.
  - Consulta `quote_revision_tokens` y `order_quote_revisions`.
  - Verifica que `status == 'PENDING'` y `NOW() <= expires_at`.
  - Retorna datos de previsualización (desglose original vs revisado, especificaciones del papel alternativo, tiempo restante de vigencia).
- **Prohibición Absoluta:** **Bajo ninguna circunstancia un GET muta el estado del token ni de la orden.** Esto protege el sistema frente a mecanismos de pre-renderizado de Google Chrome, analizadores de enlaces de Slack, vistas previas de WhatsApp o motores de escaneo de antivirus corporativos que navegan automáticamente los enlaces de correos entrantes.

### 3.2 `POST /api/marketplace/orders/:orderId/quote-revision/:rawToken/accept` (Aceptación Vinculante)
- **Acción:** Requiere envío deliberado mediante método POST.
- **Payload Requerido:**
  ```json
  {
    "consent": true,
    "accepted_delta_gross": 110.82,
    "currency": "EUR",
    "challenge_type": "OTP_VERIFIED",
    "challenge_code": "849201",
    "client_timestamp_utc": "2026-10-27T18:45:00Z"
  }
  ```
- **Procesamiento Transaccional:**
  1. Adquiere bloqueo pesimista en InnoDB (`SELECT ... FOR UPDATE`).
  2. Valida que el token siga `PENDING` y vigente.
  3. Valida que `accepted_delta_gross` coincida con `delta_gross_amount` en la BD (detección de adulteración del formulario).
  4. Valida el código OTP o la sesión activa.
  5. Marca el token como `CONSUMED` e inserta el registro forense en `order_quote_revisions.consent_record_json`.

### 3.3 `POST /api/marketplace/orders/:orderId/quote-revision/:rawToken/reject` (Rechazo Expreso)
- **Acción:** Marca el token como `CONSUMED` con método `POST_REJECT` y la revisión como `REVISION_REJECTED`, registrando el motivo si el cliente lo aportó.

---

## 4. Verificación de Identidad Antifraude y Desafíos de Seguridad

El mandato de la dirección técnica prohíbe taxativamente confiar de forma exclusiva en datos débiles (como el código postal o los últimos dígitos del teléfono) como prueba suficiente de identidad.

Se implementa una arquitectura de **Verificación Proporcional al Riesgo Económico**:

```
                                      ┌─────────────────────────────────────┐
                                      │   Petición de Aceptación (POST)     │
                                      └──────────────────┬──────────────────┘
                                                         │
                                                         ▼
                                      ┌─────────────────────────────────────┐
                                      │ ¿Existe Sesión HMAC Activa del      │
                                      │ Comprador (Cookie Segura del BFF)?  │
                                      └───────┬─────────────────────┬───────┘
                                              │                     │
                                           SÍ │                     │ NO
                                              ▼                     ▼
                                    ┌──────────────────┐  ┌─────────────────────────────────┐
                                    │ Sesión Verificada│  │ ¿Importe Delta Bruto > Umbral?  │
                                    │ Identidad Válida │  │ (Por defecto: > 50,00 €)        │
                                    └──────────────────┘  └───────┬─────────────────┬───────┘
                                                               SÍ │                 │ NO (Bajo Riesgo)
                                                                  ▼                 ▼
                                    ┌───────────────────────────────────┐ ┌─────────────────────────┐
                                    │ DESAFÍO ALTO RIESGO: OTP Oblig.   │ │ DESAFÍO SUAVE:          │
                                    │ Emite código 6 dígitos a email    │ │ Confirmación de email   │
                                    │ verificado (Validez: 10 min)      │ │ completo + CP Envío     │
                                    └───────────────────────────────────┘ └─────────────────────────┘
```

1. **Sesión Autenticada Previa:** Si el comprador ya está autenticado en la plataforma mediante su sesión firmada con HMAC (`marketplace_offer_sessions`), la correspondencia del `user_id` u `order_intent_id` es directa y suficiente.
2. **Acceso Externo (Enlace Abierto en Otro Dispositivo):**
   - **Umbral Configurable por Tenant (E-05):** El valor de referencia de 50,00 € es un parámetro de configuración por defecto (`tenant_security_policies.otp_delta_threshold_eur`). Cada tenant puede ajustar este umbral (ej. 0,00 € para exigir OTP en cualquier delta positivo, o desactivar OTP para cuentas corporativas de confianza).
   - **Revisiones por Debajo del Umbral ($\Delta \le \text{Umbral}$ o $\Delta \le 0$):** Se exige confirmación manual del email completo de compra y código postal de entrega para verificar que el operador del navegador conoce los datos del pedido.
   - **Revisiones por Encima del Umbral ($\Delta > \text{Umbral}$):** Se genera y remite automáticamente un código OTP numérico de 6 dígitos al correo verificado del comprador (`expires_in = 10 minutes`). El cliente debe introducir el código en la pantalla de aceptación.
3. **Protección Contra Fuerza Bruta (Rate Limiting y Bloqueo):**
   - Máximo 5 intentos fallidos de OTP o verificación (`attempt_count`, configurable vía `max_otp_attempts`).
   - Al quinto fallo, la columna `locked_until` se fija en `NOW() + INTERVAL 30 MINUTE` y se emite la alerta `CHALLENGE_FAILED` en los registros de auditoría.

---

## 5. Prevención de Fugas de Información y Privacidad (Privacy by Design)

Para evitar la exfiltración involuntaria de tokens a través de canales de terceros, se aplican los siguientes controles estrictos:

1. **Sanitización de Registros del Servidor (Log Redaction Middleware):**  
   Todo middleware de logging (Pino/Morgan) en Express y Fastify aplica expresiones regulares obligatorias para enmascarar tokens antes de escribir en disco o en la consola:
   ```javascript
   function sanitizeLogPayload(str) {
       return str.replace(/qrt_[a-zA-Z0-9_-]{32,64}/g, 'qrt_***REDACTED***');
   }
   ```
2. **Supresión del Encabezado HTTP Referer:**  
   La página de previsualización y aceptación sirve obligatoriamente el encabezado:
   ```http
   Referrer-Policy: no-referrer
   ```
   Esto garantiza que si la página carga recursos estáticos de CDN o fuentes web, el navegador jamás enviará el token presente en la URL en el encabezado `Referer`.
3. **Directivas de Caché Estrictas:**
   ```http
   Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate, private
   Pragma: no-cache
   Expires: 0
   ```
   Garantiza que ningún proxy corporativo ni caché de disco del cliente retenga la pantalla de aceptación económica.
4. **Aislamiento en Herramientas de Analítica:**  
   Los scripts de telemetría o monitorización de errores (ej. Sentry) tienen vetada la captura del parámetro de ruta `:rawToken` en sus configuraciones de inicialización.
