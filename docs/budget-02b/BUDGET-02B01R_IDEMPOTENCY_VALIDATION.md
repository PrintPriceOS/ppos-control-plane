# PrintPrice OS — BUDGET-02B-01R Idempotency Validation
## Validación de Idempotencia Canónica y Autorización Previa (PR #7)

- **Proyecto:** PrintPrice OS Control Plane
- **Misión:** BUDGET-02B-01R
- **Repositorio:** `PrintPriceOS/ppos-control-plane`
- **Componentes:** `orderPaperDecisionService.js` + `orderPaperDecisions.js` (Router)
- **Alcance Auditado:** Replay seguro, orden de evaluación de seguridad y prevención de fuga de información
- **Estado de Certificación:** `BUDGET-02B01R_PASS`
- **Restricciones:** NO MERGE / NO DEPLOY / NO PRODUCTION CHANGES

---

## 1. El Riesgo de Replay Antes de Autorización (H-03)

### Hallazgo de la Auditoría Independiente
En el PR #7 original:
1. Se consultaba la tabla `order_paper_decisions` por `idempotency_key` al inicio de la operación.
2. Si existía un registro coincidente, se devolvía inmediatamente el registro previo.
3. Esta comprobación ocurría **antes** de verificar si el actor actual seguía teniendo acceso al pedido, si la imprenta continuaba asignada o si la orden había sido cancelada o completada.

### Consecuencias de Seguridad
- **Fuga de Información**: Una credencial comprometida o un actor cuyo acceso a la imprenta hubiera sido revocado podía invocar la API con una clave de idempotencia conocida y obtener datos internos de una decisión sin superar la autorización.
- **Acceso a Pedidos Inelegibles**: Un cliente o imprenta podía forzar la visualización o confirmación sobre una orden cancelada o cerrada mediante un replay idempotente que no verificaba el estado actual del pedido.
- **Detección Incompleta de Colisiones**: La comparación previa no incluía campos como `technicalReason` o `estimatedCostDelta`, por lo que dos peticiones con intenciones técnicas o económicas dispares podían recibir la misma respuesta sin detectar el conflicto.

---

## 2. Flujo Remediado: Autorización Previa y Fingerprinting Canónico

### Secuencia Estricta de Validación
```
[HTTP Request: POST /jobs/:jobId/paper-decision]
      │
      ▼
1. Esquema y Tipado
   - Validar parámetros obligatorios y formato
   - validateMonetaryDelta(estimatedCostDelta) --> rechaza NaN, Infinity, >4 decimales
      │
      ▼
2. Autenticación de Actor y Tenancy
   - Extracción de callerPrinthouseId, tenantId, roles del token/API key
      │
      ▼
3. RESOLUCIÓN Y AUTORIZACIÓN DEL PEDIDO (resolveAndAuthorizeOrder)
   - Consulta a orders / marketplace_orders con bloqueo FOR UPDATE
   - ¿Existe el pedido? ───────────────────> NO ──> [404 ORDER_NOT_FOUND]
   - ¿Coincide el tenant_id? ──────────────> NO ──> [403 TENANT_MISMATCH]
   - ¿Imprenta autorizada? ────────────────> NO ──> [403 PRINTHOUSE_UNAUTHORIZED]
   - ¿Imprenta asignada? ──────────────────> NO ──> [422 PRINTHOUSE_UNASSIGNED]
   - ¿Estado elegible (no cancelado)? ─────> NO ──> [422 ORDER_INELIGIBLE]
      │
      ▼ (Orden verificada y autorizada)
4. EVALUACIÓN DE IDEMPOTENCIA
   - ¿Existe idempotency_key?
      │
      ├───────> SI: Consultar registro existente en BD
      │             │
      │             ├─> ¿Payload Hash SHA-256 es IDÉNTICO?
      │             │      │
      │             │      ├─> SI: Retornar registro previo (HTTP 200, idempotent_replay: true)
      │             │      │
      │             │      └─> NO: Arrojar [409 IDEMPOTENCY_KEY_COLLISION] (Sin filtrar datos)
      │             │
      │             └─> NO EXISTE: Proceder a inserción normal
      │
      ▼
5. Persistencia y Transición
   - Superseder decisiones activas previas
   - Insertar nueva decisión con payload_fingerprint calculado
   - COMMIT de transacción
```

---

## 3. Fingerprint Canónico SHA-256 del Payload

Para garantizar que solo peticiones estrictamente idénticas reciban una respuesta idempotente, se implementó la función `computeCanonicalPayloadHash`:

```javascript
function computeCanonicalPayloadHash(payload) {
  const canonicalFields = {
    alternativeVariantId: payload.alternativeVariantId ? String(payload.alternativeVariantId).trim() : null,
    currency: payload.currency ? String(payload.currency).trim().toUpperCase() : 'EUR',
    decisionAction: String(payload.decisionAction).trim().toUpperCase(),
    estimatedCostDelta: payload.estimatedCostDelta !== undefined && payload.estimatedCostDelta !== null 
      ? Number(payload.estimatedCostDelta).toFixed(4) 
      : '0.0000',
    externalOrderIntentId: String(payload.externalOrderIntentId).trim(),
    paperRole: String(payload.paperRole).trim().toUpperCase(),
    requestedVariantId: payload.requestedVariantId ? String(payload.requestedVariantId).trim() : null,
    technicalReason: payload.technicalReason ? String(payload.technicalReason).trim() : ''
  };

  const sortedKeys = Object.keys(canonicalFields).sort();
  const sortedObj = {};
  for (const key of sortedKeys) {
    sortedObj[key] = canonicalFields[key];
  }

  return crypto
    .createHash('sha256')
    .update(JSON.stringify(sortedObj), 'utf8')
    .digest('hex');
}
```

### Características de la Huella Canónica:
1. **Normalización Total**: Recorta espacios en blanco, estandariza mayúsculas en enums y normaliza deltas numéricos a precisión de 4 decimales (`toFixed(4)`).
2. **Ordenación Determinista**: Las claves del objeto JSON se ordenan lexicográficamente antes de serializar, eliminando cualquier variabilidad por orden de serialización.
3. **Persistencia Explícita**: El hash SHA-256 se persiste en la columna `payload_fingerprint VARCHAR(64) NOT NULL` de la tabla `order_paper_decisions`, indexada por la clave única `uk_opd_tenant_idempotency (tenant_id, idempotency_key)`.

---

## 4. Política Anti-Fuga en Colisiones (HTTP 409)

Cuando se detecta una reutilización de clave con un payload divergente:
- **Respuesta Emitida**:
  ```json
  {
    "error": "IDEMPOTENCY_KEY_COLLISION",
    "message": "Idempotency key 'idemp_key_123' was already used with a different request payload."
  }
  ```
- **Protección de Datos Privados**:
  - No se retorna el `decision_id` del registro previo.
  - No se revelan los campos o valores enviados en la petición original.
  - No se divulga la identidad del usuario ni de la imprenta que generó el primer registro.
  - Se previene cualquier ataque de oráculo o inferencia ciega de datos por reutilización de claves.

---

## 5. Matriz de Pruebas Adversariales Ejecutadas

Las pruebas en [`tests/budget02b01_order_paper_decisions.test.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/tests/budget02b01_order_paper_decisions.test.js) validan los siguientes escenarios:

| Test ID | Escenario Adversarial | Comportamiento Esperado | Resultado |
|---|---|---|---|
| **H-03.1** | Replay idempotente con imprenta no autorizada (cambio de actor). | `403 PRINTHOUSE_UNAUTHORIZED` antes de consultar la idempotencia. | **PASS** |
| **H-03.2** | Replay idempotente sobre un pedido cancelado con posterioridad a la decisión original. | `422 ORDER_INELIGIBLE` antes de evaluar el replay. | **PASS** |
| **H-03.3A** | Reutilización de clave idempotente alterando `technicalReason`. | `409 IDEMPOTENCY_KEY_COLLISION` (detección por fingerprint). | **PASS** |
| **H-03.3B** | Reutilización de clave idempotente alterando `estimatedCostDelta`. | `409 IDEMPOTENCY_KEY_COLLISION` (detección por fingerprint). | **PASS** |
| **H-03.4** | Petición exactamente idéntica con misma clave, actor y payload. | `200 OK` con `idempotent_replay: true` y datos íntegros. | **PASS** |

---

## 6. Dictamen de Idempotencia

Se certifica que:
1. Ningún replay idempotente se procesa sin antes verificar de forma estricta la existencia, titularidad, asignación de imprenta y estado del pedido.
2. La huella digital canónica SHA-256 cubre de forma exhaustiva la totalidad de los parámetros de la solicitud.
3. Las colisiones se rechazan con HTTP 409 con cero fuga de información.
4. Dictamen del hallazgo H-03: **REMEDIADO Y CERTIFICADO (PASS)**.
