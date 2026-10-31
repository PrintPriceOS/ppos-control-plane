# CONTRATO DE API — BUDGET-02B-01
## Decisión Técnica de Disponibilidad de Papel por Imprenta Asignada

**Proyecto:** PrintPrice OS Control Plane  
**Misión:** BUDGET-02B-01  
**Namespace Autorizado:** `/api/printhouse/*`  
**Estado:** `APPROVED_SPECIFICATION`  
**Autenticación Requerida:** Bearer JWT (Alcance Printhouse o Super Admin)  

---

## 1. Endpoints Expuestos y Rutas Soportadas

| Método | Ruta | Propósito | Código Éxito | Cabeceras Obligatorias |
| :--- | :--- | :--- | :---: | :--- |
| `POST` | `/api/printhouse/jobs/:jobId/paper-decision` | Registrar confirmación, propuesta o rechazo de material | `201 Created` / `200 OK` (Replay) | `Authorization`, `Idempotency-Key` |
| `POST` | `/api/printhouse/orders/:orderRef/paper-decision` | Alias unificado por referencia de pedido | `201 Created` / `200 OK` (Replay) | `Authorization`, `Idempotency-Key` |
| `GET` | `/api/printhouse/jobs/:jobId/paper-decisions` | Consultar historial secuencial de decisiones del trabajo | `200 OK` | `Authorization` |
| `GET` | `/api/printhouse/orders/:orderRef/paper-decisions` | Alias unificado de historial | `200 OK` | `Authorization` |

---

## 2. Contrato `POST /api/printhouse/jobs/:jobId/paper-decision`

### 2.1 Cabeceras de Petición (Request Headers)

```http
POST /api/printhouse/jobs/job_bpe_1782/paper-decision HTTP/1.1
Host: control.printprice.pro
Authorization: Bearer <JWT_PRINTHOUSE_OPERATOR>
Idempotency-Key: 7f8a9e2c-3b1d-4f5e-9a2c-1b3d5e7f9a2c
Content-Type: application/json
```

- `Authorization`: Token JWT emitido por PrintPrice Auth con claims `printhouse_id` y `tenant_id`.
- `Idempotency-Key`: **Obligatorio.** Clave única UUID v4 generada por el cliente para garantizar invocación atómica y prevenir dobles transacciones.

### 2.2 Esquema de Cuerpo de Petición (Request Body)

```json
{
  "paperRole": "INTERIOR",
  "decisionAction": "PROPOSE_ALTERNATIVE",
  "requestedVariantId": "var_coral_90_70x100",
  "alternativeVariantId": "var_creator_115_70x100",
  "estimatedCostDelta": 45.50,
  "currency": "EUR",
  "technicalReason": "Papel solicitado fuera de stock; alternativa disponible en 24h",
  "printhouseNotes": "Gramaje ligeramente superior (115g vs 90g) compatible con encuadernación fresada.",
  "externalOrderIntentId": "intent_2026_0192",
  "metadata": {
    "shift": "MORNING",
    "machine_allocated": "KBA_RAPIDA_106"
  }
}
```

#### Descripción de Campos

| Campo | Tipo | Obligatorio | Valores Permitidos / Regla |
| :--- | :--- | :---: | :--- |
| `paperRole` | `string` | **SÍ** | `'INTERIOR'`, `'COVER'`, `'ENDPAPER'` |
| `decisionAction` | `string` | **SÍ** | `'CONFIRM'`, `'PROPOSE_ALTERNATIVE'`, `'REJECT'` |
| `requestedVariantId` | `string` | **SÍ** | Identificador de variante existente en `paper_variants`. |
| `alternativeVariantId` | `string` | Condicional | **Obligatorio si `decisionAction == 'PROPOSE_ALTERNATIVE'`.** Debe existir en `paper_variants` y ser distinto de `requestedVariantId`. Prohibido en `CONFIRM` o `REJECT`. |
| `estimatedCostDelta` | `number` | No | Sobrecoste o ahorro estimado respecto a la base. En BUDGET-02B-01 no altera la cotización del cliente. Por defecto `0.00`. |
| `currency` | `string` | No | Código ISO 4217 (por defecto `'EUR'`). |
| `technicalReason` | `string` | No | Justificación técnica del operador (hasta 255 caracteres). |
| `printhouseNotes` | `string` | No | Comentarios internos de taller. |
| `externalOrderIntentId` | `string` | No | Referencia externa en Budget App. Si se omite, se deduce de `:jobId`. |
| `metadata` | `object` | No | Atributos adicionales auditables (JSON libre, saneado). |

---

### 2.3 Respuestas de Éxito (Success Responses)

#### Nueva Decisión Registrada (`201 Created`)

```json
{
  "ok": true,
  "decision": {
    "id": "opd_4f9e1b7c2a035d8e",
    "tenant_id": "tenant_books_es",
    "printhouse_tenant_id": "print_artes_graficas_madrid",
    "external_order_intent_id": "intent_2026_0192",
    "canonical_order_id": "job_bpe_1782",
    "operator_id": "usr_operador_carlos",
    "paper_role": "INTERIOR",
    "requested_variant_id": "var_coral_90_70x100",
    "decision_action": "PROPOSE_ALTERNATIVE",
    "alternative_variant_id": "var_creator_115_70x100",
    "snapshot_requested": {
      "gsm": 90,
      "width_mm": 700.0,
      "height_mm": 1000.0,
      "finish": "MATTE",
      "category": "UNCOATED"
    },
    "estimated_cost_delta": 45.5,
    "currency": "EUR",
    "economic_status": "REQUIRES_ECONOMIC_REVISION",
    "technical_reason": "Papel solicitado fuera de stock; alternativa disponible en 24h",
    "printhouse_notes": "Gramaje ligeramente superior (115g vs 90g) compatible con encuadernación fresada.",
    "decision_number": 1,
    "status": "ACTIVE",
    "idempotency_key": "7f8a9e2c-3b1d-4f5e-9a2c-1b3d5e7f9a2c",
    "created_at": "2026-10-27T16:55:00.000Z",
    "updated_at": "2026-10-27T16:55:00.000Z",
    "idempotent_replay": false
  }
}
```

#### Reintento Idempotente Idéntico (`200 OK`)

Si el cliente reenvía la misma petición con la misma cabecera `Idempotency-Key` y carga idéntica, el servidor responde con la decisión previa sin duplicar registros:

```json
{
  "ok": true,
  "decision": {
    "id": "opd_4f9e1b7c2a035d8e",
    "idempotent_replay": true
  }
}
```

---

## 3. Respuestas de Error Estructuradas

Todas las respuestas de error devuelven formato uniforme `{ ok: false, error: { code, message } }`:

| Código HTTP | Error Code | Causa |
| :--- | :--- | :--- |
| `400 Bad Request` | `MISSING_IDEMPOTENCY_KEY` | Cabecera `Idempotency-Key` ausente o vacía. |
| `400 Bad Request` | `PROTOTYPE_POLLUTION_DETECTED` | Propiedades sospechosas detectadas (`__proto__`, `constructor`, `prototype`). |
| `400 Bad Request` | `INVALID_PAPER_ROLE` | `paperRole` no coincide con `INTERIOR`, `COVER`, `ENDPAPER`. |
| `400 Bad Request` | `INVALID_DECISION_ACTION` | `decisionAction` no coincide con `CONFIRM`, `PROPOSE_ALTERNATIVE`, `REJECT`. |
| `400 Bad Request` | `ALTERNATIVE_VARIANT_REQUIRED` | Se indicó `PROPOSE_ALTERNATIVE` sin `alternativeVariantId`. |
| `400 Bad Request` | `IDENTICAL_VARIANT_PROPOSED` | La variante propuesta es exactamente igual a la variante solicitada. |
| `401 Unauthorized` | `UNAUTHORIZED` | Token JWT ausente, expirado o con firma incorrecta. |
| `403 Forbidden` | `FORBIDDEN` | El llamador no posee rol de imprenta ni credencial autorizada. |
| `403 Forbidden` | `PRINTHOUSE_UNAUTHORIZED` | La orden está asignada a otra imprenta distinta de la autenticada. |
| `403 Forbidden` | `TENANT_MISMATCH` | Intento de acceso a un pedido de un tenant ajeno. |
| `404 Not Found` | `VARIANT_NOT_FOUND` | La variante solicitada o alternativa no existe en el catálogo maestro. |
| `409 Conflict` | `IDEMPOTENCY_KEY_COLLISION` | La clave de idempotencia fue reutilizada con una carga útil diferente. |
| `422 Unprocessable` | `ORDER_INELIGIBLE` | El pedido está cancelado, cerrado o en estado incompatible para decisiones. |
| `500 Server Error` | `ECONOMIC_INVARIANT_BREACH` | Intento de mutar el importe presupuestado canónico BPE (violación de seguridad). |

---

## 4. Política de Confidencialidad y Precios Mayoristas

1. **Precios de Proveedor Prohibidos:** Las respuestas del endpoint **nunca** exponen precios de compra mayorista de `supplier_paper_offers` ni márgenes de intermediación de la plataforma.
2. **Tokens y Secretos Prohibidos:** Ninguna clave de API, secreto HMAC ni credencial de infraestructura viaja en la carga útil de respuesta.
