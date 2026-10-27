# MÁQUINA DE ESTADOS ECONÓMICA Y TRANSICIONES — BUDGET-02C-00
## Ciclo de Vida de Revisiones, Resolución de Concurrencia y Gobernanza de Expiración

**Proyecto:** PrintPrice OS  
**Misión:** BUDGET-02C-00 — Máquina de Estados Económica  
**Estado:** `BUDGET-02C00_DESIGN_APPROVED`  
**Modalidad Operativa:** READ-ONLY / DESIGN FIRST  
**Restricciones:** NO MERGE / NO DEPLOY / NO CODE MUTATION / NO DATABASE CHANGES  
**Fecha:** 27 de octubre de 2026  
**Autor:** Antigravity (Advanced Agentic Architecture)

---

## 1. Definición Formal de Estados del Ciclo de Vida Económico

El subsistema de revisión económica opera como una máquina de estados finitos determinista y acotada, evitando estados híbridos o transiciones ambiguas:

```
                                      ┌────────────────────────────────────────────────────────┐
                                      │                        ORIGINAL                        │
                                      │ (Pedido Base Certificado: 1.782,30 €, Inmutable)       │
                                      └───────────────────────────┬────────────────────────────┘
                                                                  │
                                                                  │ Taller emite PROPOSE_ALTERNATIVE
                                                                  │ Servidor calcula BPE Delta
                                                                  ▼
                                      ┌────────────────────────────────────────────────────────┐
                                      │                    REVISION_PENDING                    │
                                      │ (Token Activo, TTL en marcha, Espera de Consentimiento)│
                                      └───────┬──────────────┬──────────────┬──────────────┬───┘
                                              │              │              │              │
                   Cliente emite POST Aceptar │              │              │              │ Taller emite
               y supera verificación (Token)  │              │              │              │ nueva propuesta
                                              │              │              │              │ (Revisión N+1)
                                              ▼              │              │              ▼
┌──────────────────────────────────────────────┐             │              │ ┌───────────────────────────┐
│              REVISION_ACCEPTED               │             │              │ │    REVISION_SUPERSEDED    │
│ (Consentimiento Registrado, Token CONSUMED)  │             │              │ │ (Token Invalidad / Revocado)
│ ──► Abre Puerta Financiera & Industrial      │             │              │ └───────────────────────────┘
└──────────────────────────────────────────────┘             │              │
                                                             │              │ Taller / Admin
                                   Cliente emite POST        │              │ cancela propuesta
                                   Rechazar formalmente      │              ▼
                                                             │ ┌───────────────────────────┐
                                                             │ │     REVISION_REVOKED      │
                                                             │ │ (Token Invalidado)        │
                                                             │ └───────────────────────────┘
                                                             │
                                                             │ NOW() > expires_at (TTL agotado)
                                                             │ Sin respuesta del cliente
                                                             ▼
                               ┌────────────────────────────────────────────────────────┐
                               │                    REVISION_EXPIRED                    │
                               │ (Token Invalidad, CERO Mutación Silenciosa de Material)│
                               │ ──► Orden pasa a PENDING_EXPIRATION_RESOLUTION         │
                               └────────────────────────────────────────────────────────┘
```

### 1.1 `ORIGINAL`
- **Definición:** Estado de referencia permanente del pedido.
- **Importe Canónico:** 1.782,30 € (IVA incluido).
- **Invariante:** Nunca se altera ni se borra. Si todas las revisiones fracasan, la orden puede retornar a este punto de partida si hay acuerdo industrial.

### 1.2 `REVISION_PENDING`
- **Definición:** La imprenta propuso un material alternativo (`PROPOSE_ALTERNATIVE`), el servidor recalculó el delta mediante BPE, se emitió un registro en `order_quote_revisions` y se generó un token criptográfico monouso en `quote_revision_tokens`.
- **Invariante:** El material del pedido en taller **no se considera modificado**; el pedido permanece en retención comercial temporal a la espera de la resolución del cliente.

### 1.3 `REVISION_ACCEPTED`
- **Definición:** El cliente accedió al enlace seguro, completó la verificación de identidad y remitió un `POST /accept` vinculante con su consentimiento explícito antes de la expiración.
- **Efecto Inmediato:** El token transiciona atómicamente a `CONSUMED`, la revisión a `ACCEPTED`, y se emite el evento de auditoría `REVISION_ACCEPTED`.
- **Efecto Diferido:** La orden **NO pasa automáticamente a fabricación ni a cobro directo**. Se transfieren las instrucciones a la Puerta Financiera (para retención/cargo/abono) y a la Puerta Industrial (para confirmación de preflight y asignación de papel).

### 1.4 `REVISION_REJECTED`
- **Definición:** El cliente declinó la propuesta mediante `POST /reject` o manifestó formalmente su rechazo en interfaz.
- **Efecto Inmediato:** El token se marca como `CONSUMED` con método `POST_REJECT`, la revisión transiciona a `REJECTED`.
- **Resolución:** El pedido no se cancela automáticamente de forma destructiva; entra en `PENDING_REJECTION_RESOLUTION` para que el taller decida si asume el papel original sin sobrecoste o si procede la cancelación bilateral.

### 1.5 `REVISION_EXPIRED`
- **Definición:** La marca temporal absoluta en UTC `expires_at` se ha cumplido sin que se haya recibido una aceptación o rechazo válido.
- **Efecto Aislado:** La propuesta económica queda sin efecto legal (`REVISION_EXPIRED`). El token queda inhabilitado (`EXPIRED`).
- **Garantía Inviolable Contra Mutación Silenciosa:**  
  **El pedido NO revierte de material ni muta sus especificaciones de forma automática o desapercibida.** La orden pasa a `PENDING_EXPIRATION_RESOLUTION`, requiriendo una acción deliberada y auditada de un operador o del cliente.

### 1.6 `REVISION_REVOKED`
- **Definición:** La imprenta retira la propuesta (ej. descubrió un defecto en el lote alternativo o el distribuidor agotó existencias antes de la decisión del cliente), o el administrador anula la revisión por incidencia operativa.
- **Efecto:** El token queda inmediatamente inhabilitado (`REVOKED`), registrando el motivo en `order_quote_revisions.revocation_reason`.

### 1.7 `REVISION_SUPERSEDED`
- **Definición:** Mientras la revisión $N$ estaba en `REVISION_PENDING`, la imprenta emite una nueva propuesta (revisión $N+1$).
- **Efecto:** La revisión $N$ queda reemplazada (`SUPERSEDED`), su token queda revocado, y el cliente solo puede responder sobre la nueva revisión activa.

---

## 2. Matriz Completa de Transiciones de Estado

| Estado Origen | Evento / Disparador | Actor / Rol | Precondiciones | Estado Destino | Acciones Secundarias |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`ORIGINAL`** | `EMIT_REVISION` | Printhouse / Orquestador | Pedido formalizado, `PROPOSE_ALTERNATIVE` en `order_paper_decisions`, recálculo BPE exitoso. | **`REVISION_PENDING`** | Inserta `order_quote_revisions` y `quote_revision_tokens`. Programa evento de expiración. |
| **`REVISION_PENDING`** | `SUBMIT_ACCEPT` | Cliente Final | `NOW() <= expires_at`, `token.status == 'PENDING'`, identidad contextual verificada, hash canónico coincidente. | **`REVISION_ACCEPTED`** | Consume token (`CONSUMED`), persiste `consent_record_json`, evalúa Puerta Financiera. |
| **`REVISION_PENDING`** | `SUBMIT_REJECT` | Cliente Final | `NOW() <= expires_at`, `token.status == 'PENDING'`, identidad contextual verificada. | **`REVISION_REJECTED`** | Consume token (`CONSUMED`), marca orden en `PENDING_REJECTION_RESOLUTION`. |
| **`REVISION_PENDING`** | `TTL_EXPIRED` | Daemon de Sistema / Cron | `NOW() > expires_at`, `revision.status == 'PENDING'`. | **`REVISION_EXPIRED`** | Invalida token (`EXPIRED`), marca orden en `PENDING_EXPIRATION_RESOLUTION`. |
| **`REVISION_PENDING`** | `REVOKE_PROPOSAL` | Imprenta / Admin | `revision.status == 'PENDING'`. | **`REVISION_REVOKED`** | Invalida token (`REVOKED`), notifica al cliente que la oferta ha sido retirada. |
| **`REVISION_PENDING`** | `SUPERSEDE_REVISION` | Imprenta / Orquestador | Emisión autorizada de revisión $N+1$ sobre el mismo pedido. | **`REVISION_SUPERSEDED`** | Invalida token anterior, emite nueva revisión $N+1$ con nuevo token y nuevo TTL. |
| **`REVISION_PENDING`** | `ORDER_CANCELLED` | Cliente / Admin | Orden cancelada formalmente en plataforma. | **`REVISION_REVOKED`** | Invalida token de inmediato con motivo `ORDER_CANCELLED`. |

---

## 3. Resolución Transaccional de Condiciones de Carrera (Race Conditions)

### 3.1 Doble Envío Simultáneo (Double-Submit / Concurrent Acceptance)
- **Escenario de Ataque / Carrera:** Un usuario pulsa dos veces rápidamente el botón de aceptación o tiene el enlace abierto en dos pestañas del navegador remitiendo `POST /accept` simultáneamente.
- **Mecanismo de Protección:**
  ```sql
  START TRANSACTION;
  
  -- Bloqueo pesimista del token y la revisión
  SELECT id, status, expires_at, attempt_count, locked_until 
  FROM quote_revision_tokens 
  WHERE token_hash = ? FOR UPDATE;
  
  -- Si el estado ya no es PENDING, abortar inmediatamente
  -- (El primer hilo habrá cambiado el estado a CONSUMED)
  IF status != 'PENDING' THEN
      ROLLBACK;
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'TOKEN_ALREADY_CONSUMED';
  END IF;
  
  -- Comprobación de expiración y bloqueo
  IF NOW() > expires_at THEN
      UPDATE quote_revision_tokens SET status = 'EXPIRED' WHERE token_hash = ?;
      COMMIT;
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'TOKEN_EXPIRED';
  END IF;
  
  -- Actualización atómica
  UPDATE quote_revision_tokens 
  SET status = 'CONSUMED', consumed_at = NOW(), consumption_method = 'POST_ACCEPT' 
  WHERE token_hash = ?;
  
  UPDATE order_quote_revisions 
  SET status = 'ACCEPTED', responded_at = NOW(), consent_record_json = ? 
  WHERE id = ?;
  
  COMMIT;
  ```
- **Resultado:** El primer hilo procesa la aceptación de forma exitosa (HTTP `200 OK`). El segundo hilo es rechazado con HTTP `409 CONFLICT` sin efectos colaterales.

### 3.2 Reemplazo de Revisiones Concurrentes (Superseding Race)
- **Escenario:** La imprenta remite una nueva propuesta (revisión 2) en el instante milimétricamente anterior a que el cliente pulse aceptar en la revisión 1.
- **Mecanismo:** La transacción de emisión de la revisión 2 adquiere el bloqueo de la fila del pedido y marca la revisión 1 como `SUPERSEDED` y su token como `REVOKED`. Cuando el `POST /accept` del cliente intenta ejecutar `SELECT ... FOR UPDATE` sobre el token 1, detecta que su estado ya es `REVOKED`, informando amigablemente al cliente de que existía una actualización más reciente emitida por el taller.

### 3.3 Aceptación Posterior a la Expiración (Clock Skew / Expired Race)
- **Escenario:** El cliente remite la aceptación exactamente en el segundo de corte de expiración, o el reloj del navegador del cliente difiere del servidor.
- **Regla Inviolable:** **La única fuente de tiempo válida es el reloj del servidor MySQL (`NOW()` en UTC).** Si `NOW() > expires_at`, la transacción InnoDB rechaza la operación, marca el token como `EXPIRED` y emite error `410 GONE`. No existe margen de gracia especulativo.
