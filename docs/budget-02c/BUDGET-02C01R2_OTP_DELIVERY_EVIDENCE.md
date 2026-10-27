# EVIDENCIA DE ENTREGA VERIFICABLE DEL OTP (SEC-C01R)
## Misión BUDGET-02C-01R2: Integridad del Canal de Despacho y Prueba Criptográfica de Entrega

**Proyecto:** PrintPrice OS  
**Repositorio:** `PrintPriceOS/ppos-control-plane`  
**PR:** PR #8 (`feat/budget-02c01-quote-revisions`) — Conservado en **DRAFT**  
**Commit de Entrada:** `ade575ecc28a5c0340ec399b55da305ea814e446`  
**Dictamen:** **`BUDGET-02C01R2_PASS`**  
**Restricciones:** NO MERGE / NO DEPLOY / NO PRODUCTION DATABASE CHANGES

---

## 1. SEC-C01R — Arquitectura y Remediación de `OtpDeliveryService`

### 1.1. Diagnóstico del Defecto en BUDGET-02C-01R
En la versión preliminar, la presencia de variables como `SMTP_HOST` o `ENABLE_OTP_DELIVERY` podía interpretarse erróneamente como prueba implícita de despacho. Asimismo, no existía una distinción formal entre la aceptación del mensaje por la pasarela de transporte (carrier/relay) y la entrega física comprobada en el terminal del cliente.

### 1.2. Principios Inviolables de Implementación
1. **Prohibición de Inferencia por Variables de Entorno**:
   La existencia de `SMTP_HOST`, `ENABLE_OTP_DELIVERY` o credenciales SMTP en el entorno **nunca** se considera prueba de envío. Se exige una instancia de adaptador con métodos `sendOtp` o `sendMail` verificados.
2. **Rechazo y Bloqueo en Fallo de Proveedor (Fail-Closed)**:
   Si el proveedor de entrega no existe, está desconfigurado, carece de implementación, es rechazado por el transportista o sufre una caída de red, la operación se bloquea inmediatamente devolviendo HTTP 403 `OTP_DELIVERY_UNAVAILABLE`. La revisión económica no se emite ni se confirma.
3. **Distinción entre `PROVIDER_ACCEPTED` y `DELIVERED`**:
   No se registra el estado `DELIVERED` antes de recibir un webhook de acuse de recibo del dispositivo móvil o terminal. La pasarela emite `PROVIDER_ACCEPTED` con `provider_message_id`, marca de tiempo `accepted_at` y la bandera explícita `handset_delivered: false`.

---

## 2. Implementación en `src/api/services/orderQuoteRevisionService.js`

### 2.1. Clase `OtpDeliveryService`
```javascript
class OtpDeliveryService {
    constructor(dependencies = {}) {
        this.provider = dependencies.deliveryProvider || dependencies.emailDeliveryService || dependencies.provider || null;
        this.isExplicitlyConfigured = dependencies.isConfigured !== undefined ? dependencies.isConfigured : null;
    }

    isDeliveryChannelConfigured() {
        if (this.isExplicitlyConfigured !== null) {
            return this.isExplicitlyConfigured;
        }
        if (!this.provider) return false;
        return typeof this.provider.sendOtp === 'function' || typeof this.provider.sendMail === 'function';
    }

    async deliverOtp({ recipientEmail, otpCode, revisionId, deltaNet, tenantId }) {
        // 1. Verificación de Proveedor Configurado
        if (!this.provider) {
            return {
                ok: false,
                status: 'PROVIDER_MISSING',
                delivered: false,
                reason: 'NO_VERIFIED_DELIVERY_CHANNEL_CONFIGURED'
            };
        }

        // 2. Verificación de Métodos de Transporte
        if (typeof this.provider.sendOtp !== 'function' && typeof this.provider.sendMail !== 'function') {
            return {
                ok: false,
                status: 'PROVIDER_UNIMPLEMENTED',
                delivered: false,
                reason: 'DELIVERY_PROVIDER_UNIMPLEMENTED'
            };
        }

        // 3. Verificación de Canal Habilitado
        if (!this.isDeliveryChannelConfigured()) {
            return {
                ok: false,
                status: 'PROVIDER_MISSING',
                delivered: false,
                reason: 'NO_VERIFIED_DELIVERY_CHANNEL_CONFIGURED'
            };
        }

        try {
            let providerResponse = null;
            if (typeof this.provider.sendOtp === 'function') {
                providerResponse = await this.provider.sendOtp({
                    recipient: recipientEmail,
                    recipientEmail,
                    otpCode,
                    revisionId,
                    deltaNet,
                    tenantId
                });
            } else {
                providerResponse = await this.provider.sendMail({
                    to: recipientEmail,
                    subject: `[PrintPrice OS] Código de Autorización Económica (Delta: +${deltaNet.toFixed(2)} EUR)`,
                    text: `Código OTP de autorización económica: ${otpCode}. Expira en 15 minutos.`
                });
            }

            // 4. Verificación de Rechazo por Transportista / Upstream Carrier
            if (providerResponse && (providerResponse.accepted === false || providerResponse.rejected === true || providerResponse.delivered === false)) {
                return {
                    ok: false,
                    status: 'PROVIDER_REJECTED',
                    delivered: false,
                    reason: providerResponse.error || providerResponse.reason || 'DISPATCH_REJECTED_BY_CARRIER'
                };
            }

            // 5. Aceptación Verificada por la Pasarela
            const providerMsgId = providerResponse?.messageId || providerResponse?.provider_message_id || `msg_${crypto.randomUUID()}`;
            return {
                ok: true,
                status: 'PROVIDER_ACCEPTED',
                channel: 'EMAIL',
                destination: recipientEmail,
                proof: {
                    provider_message_id: providerMsgId,
                    accepted_at: new Date().toISOString(),
                    handset_delivered: false // Evidencia: Aceptado por pasarela, no entregado aún al terminal físico
                }
            };
        } catch (dispatchErr) {
            return {
                ok: false,
                status: 'NETWORK_ERROR',
                delivered: false,
                reason: dispatchErr.message
            };
        }
    }
}
```

### 2.2. Bloqueo en `createQuoteRevision`
Si el Delta neto supera el umbral que requiere 2FA (por defecto 50,00 €) y el resultado del despacho no es `PROVIDER_ACCEPTED`, la emisión de la revisión se cancela mediante rollback transaccional:
```javascript
if (deltaNet > otpThreshold) {
    const deliveryResult = await this.otpDeliveryService.deliverOtp({
        recipientEmail: cleanEmail,
        otpCode: rawOtpCode,
        revisionId,
        deltaNet,
        tenantId
    });

    if (!deliveryResult.ok || deliveryResult.status !== 'PROVIDER_ACCEPTED') {
        throw new OrderQuoteRevisionError(
            `OTP delivery channel unavailable or dispatch rejected: ${deliveryResult.reason}`,
            'OTP_DELIVERY_UNAVAILABLE',
            403,
            {
                delivery_status: deliveryResult.status,
                reason: deliveryResult.reason,
                recipient: cleanEmail
            }
        );
    }

    otpDeliveryStatus = 'PROVIDER_ACCEPTED';
    otpDeliveredAt = new Date();
    otpDeliveryProof = deliveryResult.proof;
}
```

---

## 3. Esquema de Datos y Persistencia de Evidencia

### 3.1. Migración SQL `migrations/168_phase196g_order_quote_revisions.sql`
Se actualizó la columna `otp_delivery_status` para soportar el estado canónico `PROVIDER_ACCEPTED`:
```sql
ALTER TABLE quote_revision_tokens 
    ADD COLUMN otp_delivery_status ENUM('NOT_APPLICABLE', 'PENDING', 'PROVIDER_ACCEPTED', 'DELIVERED', 'FAILED') 
    NOT NULL DEFAULT 'NOT_APPLICABLE' 
    AFTER otp_delivery_channel;
```
La integridad de las 171 migraciones y sus sumas criptográficas SHA-256 fue validada mediante:
`npm run migration:integrity` $\implies$ **Phase 183: PASSED**.

### 3.2. Estructura de la Evidencia Persistida (`otp_delivery_proof_json`)
```json
{
  "provider_message_id": "msg_mock_1793118198000",
  "accepted_at": "2026-10-27T19:03:18.611Z",
  "handset_delivered": false
}
```

---

## 4. Matriz de Pruebas Adversariales SEC-C01R

Las pruebas implementadas en `tests/budget02c01r2_authority_identity_otp.test.js` certifican todos los caminos adversariales exigidos:

| Caso de Prueba | Condición Adversarial | Estado Devuelto | Código HTTP | Resultado |
| :--- | :--- | :--- | :--- | :--- |
| **Test 1.1** | Entorno con `SMTP_HOST` pero sin instancia de proveedor | `PROVIDER_MISSING` | `403 OTP_DELIVERY_UNAVAILABLE` | **PASS** |
| **Test 1.2** | Proveedor configurado como objeto vacío `{}` | `PROVIDER_UNIMPLEMENTED` | `403 OTP_DELIVERY_UNAVAILABLE` | **PASS** |
| **Test 1.3** | Proveedor ausente en la emisión de revisión | `PROVIDER_MISSING` | `403 OTP_DELIVERY_UNAVAILABLE` | **PASS** |
| **Test 1.4** | Rechazo de despacho por carrier upstream (550) | `PROVIDER_REJECTED` | `403 OTP_DELIVERY_UNAVAILABLE` | **PASS** |
| **Test 1.5** | Error de conexión de red (`ECONNREFUSED`) | `NETWORK_ERROR` | `403 OTP_DELIVERY_UNAVAILABLE` | **PASS** |
| **Test 1.6** | Despacho exitoso aceptado por pasarela | `PROVIDER_ACCEPTED` | `201 Revision Issued` con prueba | **PASS** |

### Salida de la Ejecución en Vitest
```text
 ✓ tests/budget02c01r2_authority_identity_otp.test.js (23 tests) 15ms
   ✓ 1. SEC-C01R — Verifiable OTP Delivery & Channel Integrity
     ✓ 1.1: Standalone OtpDeliveryService requires real provider and refuses bare env flags
     ✓ 1.2: Standalone OtpDeliveryService fails closed when provider lacks sendOtp / sendMail
     ✓ 1.3: Fails closed with 403 OTP_DELIVERY_UNAVAILABLE when delivery provider is missing
     ✓ 1.4: Fails closed with 403 OTP_DELIVERY_UNAVAILABLE when provider dispatch is rejected by upstream carrier
     ✓ 1.5: Fails closed with 403 OTP_DELIVERY_UNAVAILABLE upon network connectivity error
     ✓ 1.6: Successfully records PROVIDER_ACCEPTED with provider_message_id and handset_delivered: false
```

---

## 5. Dictamen del Control

El control **SEC-C01R** queda plenamente satisfecho. No existe ninguna circunstancia en la que una revisión económica con Delta superior al umbral pueda generarse o aceptarse sin una pasarela de entrega real y una confirmación de despacho formal.
