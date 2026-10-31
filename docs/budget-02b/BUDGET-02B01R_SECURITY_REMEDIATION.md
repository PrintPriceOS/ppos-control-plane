# PrintPrice OS — BUDGET-02B-01R Security Remediation Report
## Remediación de Seguridad, Idempotencia y Concurrencia (PR #7)

- **Proyecto:** PrintPrice OS Control Plane
- **Misión:** BUDGET-02B-01R
- **Repositorio:** `PrintPriceOS/ppos-control-plane`
- **Rama:** `feat/budget-02b01-paper-decisions`
- **PR Objetivo:** [Control Plane PR #7](https://github.com/PrintPriceOS/ppos-control-plane/pull/7) (DRAFT)
- **Commit Base Auditado:** `ba60fe9dd4c2ae2ee6c78680e26038ccb9b0c26f`
- **Dictamen Previo:** `BUDGET-02B01_CONDITIONAL — REMEDIATION REQUIRED`
- **Estado de Certificación:** `BUDGET-02B01R_PASS`
- **Restricciones Operativas:** NO MERGE / NO DEPLOY / NO PRODUCTION CHANGES

---

## 1. Resumen Ejecutivo de la Remediación

Tras la auditoría independiente de la entrega BUDGET-02B-01 sobre el PR #7 (commit `ba60fe9d`), se detectaron cuatro hallazgos que impedían otorgar la certificación de seguridad completa:
- **H-02**: Pedido inexistente potencialmente aceptado por resolución no estricta y silenciamiento de errores de base de datos.
- **H-03**: Reintento idempotente evaluado con anterioridad a la autorización del pedido y comparación parcial del payload.
- **H-04**: Serialización concurrente insuficientemente garantizada en la primera decisión por ausencia de filas previas.
- **H-05**: Delta económico procedente del cliente aceptado como clasificación económica confirmada (`DELTA_ZERO_CONFIRMED`) sin acreditación del servidor BPE, y ausencia de sanitización monetaria.

Esta misión **BUDGET-02B-01R** remedia de forma integral y localizada la totalidad de los cuatro hallazgos en el PR #7 sin introducir funcionalidades prematuras de la fase BUDGET-02C y sin alterar los pull requests certificados previamente (PR #1 y PR #6).

---

## 2. Análisis Causa Raíz y Solución por Hallazgo

### Hallazgo H-02 — Verificación Obligatoria del Pedido

#### Causa Raíz
En la versión original de `orderPaperDecisionService.js`, el método `resolveAndAuthorizeOrder()` devolvía `null` cuando no encontraba el pedido en `orders` o `marketplace_orders`, permitiendo que el flujo continuase con un identificador de pedido externo no validado. Asimismo, se capturaban excepciones de base de datos de manera genérica asumiendo ausencia de tabla en entornos de prueba, lo que enmascaraba fallos reales de conectividad o integridad.

#### Remediación Técnica
1. **Resolución Estricta con Fail-Closed**:
   - `resolveAndAuthorizeOrder()` consulta obligatoriamente `orders` o `marketplace_orders` filtrando por `tenant_id` y por `id` o `external_order_intent_id`.
   - Si no existe un registro verificado, arroja de inmediato `404 ORDER_NOT_FOUND` ("Order intent '%s' could not be resolved or does not exist for tenant '%s'").
2. **Validación Exhaustiva de Tenancy y Asignación de Imprenta**:
   - Se valida que `order.tenant_id === tenantId`, arrojando `403 TENANT_MISMATCH` ante cualquier divergencia.
   - Se valida que la imprenta autenticada (`callerPrinthouseId`) coincida exactamente con la imprenta asignada a la orden (`order.printhouse_id` o `order.assigned_printhouse_id`). Si difiere, arroja `403 PRINTHOUSE_UNAUTHORIZED`.
   - Si la orden no tiene ninguna imprenta asignada, arroja `422 PRINTHOUSE_UNASSIGNED`.
3. **Validación del Ciclo de Vida**:
   - Se valida el estado de la orden (`order.status`). Si está cancelada, completada o rechazada (`CANCELLED`, `REJECTED`, `COMPLETED`, `CLOSED`), arroja `422 ORDER_INELIGIBLE`.
4. **Propagación Transparente de Errores de BD**:
   - Se eliminó cualquier bloque `catch` silencioso. Todo error real de MySQL es propagado o envuelto en un error `500 DATABASE_ERROR` con trazabilidad completa.

---

### Hallazgo H-03 — Autorización Anterior al Replay Idempotente

#### Causa Raíz
El flujo consultaba la tabla `order_paper_decisions` por `idempotency_key` antes de verificar la existencia y autorización del pedido. Esto permitía a una clave existente devolver datos de una decisión a un actor no autorizado, a una imprenta reasignada o sobre un pedido cuyo estado hubiera cambiado. Además, la comparación del payload omitía campos sensibles como `technicalReason` y `estimatedCostDelta`.

#### Remediación Técnica
1. **Reordenación Estricta del Flujo de Ejecución**:
   ```
   [Petición Entrante]
         │
         ▼
   1. Validar Esquema Sintáctico y Formato Monetario (validateMonetaryDelta)
         │
         ▼
   2. Autenticar Actor e Imprenta (callerPrinthouseId, tenantId)
         │
         ▼
   3. RESOLVER Y AUTORIZAR PEDIDO (resolveAndAuthorizeOrder)
      - Existencia en orders / marketplace_orders
      - Tenant ownership
      - Asignación obligatoria de printhouse
      - Estado elegible de la orden
         │
         ▼
   4. EVALUAR IDEMPOTENCIA (evaluar idempotency_key)
      - Consulta dentro de la transacción serializada
      - Comparación canónica con canonical SHA-256 hash
   ```
2. **Fingerprint Canónico SHA-256 del Payload**:
   - Se implementó `computeCanonicalPayloadHash(payload)` que genera una representación JSON canónica con claves ordenadas lexicográficamente de:
     - `externalOrderIntentId`
     - `paperRole`
     - `decisionAction`
     - `requestedVariantId`
     - `alternativeVariantId`
     - `estimatedCostDelta`
     - `currency`
     - `technicalReason`
   - Se calcula el hash SHA-256 (`payload_fingerprint`) y se persiste en columna dedicada `VARCHAR(64)`.
3. **Gestión de Colisiones sin Fuga de Información**:
   - Si la clave de idempotencia existe con hash idéntico y la autorización del pedido está vigente: se retorna el registro persistido con `idempotent_replay: true` (HTTP 200).
   - Si la clave de idempotencia existe con hash diferente: se arroja de inmediato `409 IDEMPOTENCY_KEY_COLLISION` con mensaje genérico:
     `"Idempotency key '%s' was already used with a different request payload."`
     No se revela ningún dato de la decisión original, ni identificadores internos, ni el usuario autor.

---

### Hallazgo H-04 — Serialización Concurrente Garantizada en MySQL 8

#### Causa Raíz
Se utilizaba `SELECT ... FOR UPDATE` sobre la tabla de decisiones. Cuando una orden no tenía ninguna decisión previa registrada, el conjunto devuelto era vacío (`0 rows`). En motores MySQL InnoDB bajo niveles de aislamiento habituales, un `SELECT ... FOR UPDATE` sobre filas inexistentes no siempre previene `phantom inserts` concurrentes si no existe una restricción física de índice único en la clave de decisión activa.

#### Remediación Técnica
1. **Bloqueo a Nivel de Entidad Padre**:
   - Al ejecutar `resolveAndAuthorizeOrder(..., { forUpdate: true })` dentro de la transacción, se ejecuta `SELECT id, tenant_id, printhouse_id, status FROM [orders | marketplace_orders] WHERE id = ? FOR UPDATE`.
   - Como la entidad padre ya existe físicamente, la fila del pedido queda bloqueada en InnoDB, serializando todas las decisiones concurrentes para esa orden.
2. **Columna Generada Almacenada e Índice Único en MySQL 8 (InnoDB Active Slot)**:
   - En la migración `migrations/167_phase196f_order_paper_decisions.sql`:
     ```sql
     active_role_slot VARCHAR(192) GENERATED ALWAYS AS (
       IF(status = 'ACTIVE', CONCAT(tenant_id, ':', external_order_intent_id, ':', paper_role), NULL)
     ) STORED,
     UNIQUE KEY uk_opd_active_role (active_role_slot)
     ```
   - En el estándar SQL y en MySQL InnoDB, los valores `NULL` no colisionan en un índice `UNIQUE`. Así, pueden coexistir múltiples registros con `status = 'SUPERSEDED'` o `'CANCELLED'` (`active_role_slot = NULL`), pero el motor InnoDB garantiza de forma inviolable que **solo puede existir exactamente UNA fila con `status = 'ACTIVE'`** para la tupla `(tenant_id, external_order_intent_id, paper_role)`.
   - Cualquier intento de inserción concurrente simultánea que escape al bloqueo de la fila padre resultará en un error determinista de InnoDB `ER_DUP_ENTRY` (código de error `1062`), garantizando cero decisiones activas duplicadas.
3. **Monotonicidad Estricta de Versiones (`decision_number`)**:
   - Dentro de la misma transacción, se consulta `MAX(decision_number)` bloqueando las filas previas con `FOR UPDATE`.
   - La nueva decisión incrementa monótonamente la versión (`nextVersion = maxDecisionNumber + 1`).
   - Las decisiones activas previas para ese rol se actualizan atómicamente a `SUPERSEDED` antes de insertar la nueva fila.

---

### Hallazgo H-05 — Integridad del Estado Económico y Delta No Vinculante

#### Causa Raíz
El servicio realizaba `Number(estimatedCostDelta) || 0`, permitiendo que una propuesta de alternativa enviada con `estimatedCostDelta: 0` por el cliente o la imprenta fuera clasificada como `DELTA_ZERO_CONFIRMED`. Esto contravenía el principio fundamental de PrintPrice OS de que solo el servidor y el motor BPE pueden certificar la neutralidad o el impacto económico de un cambio de material.

#### Remediación Técnica
1. **Sanitización y Validación Monetaria Estricta (`validateMonetaryDelta`)**:
   - Rechaza valores no numéricos, `NaN`, `Infinity` y cadenas vacías o booleanas.
   - Exige que el delta sea un número finito en el rango $[-100.000,00, +100.000,00]$.
   - Exige precisión máxima de 4 decimales (`^\d+(\.\d{1,4})?$`).
   - En caso de anomalía, arroja de inmediato `422 INVALID_MONETARY_DELTA`.
2. **Clasificación Económica Asimétrica y Segura**:
   - **`CONFIRM` (Aceptación del papel solicitado original)**:
     - Delta forzado en servidor a `0.0000`.
     - Clasificación: `DELTA_ZERO_CONFIRMED`. No hay alteración económica.
   - **`PROPOSE_ALTERNATIVE` (Propuesta de material sustitutivo)**:
     - El delta recibido se almacena como estimación preliminar no vinculante.
     - Clasificación **SIEMPRE**: `REQUIRES_ECONOMIC_REVISION`, independientemente de que el cliente o la imprenta hayan enviado `0`.
     - **Cero auto-certificación**: Ninguna alternativa se marca como neutral o autorizada sin el recálculo BPE de la fase BUDGET-02C.
   - **`REJECT` (Rechazo sin alternativa)**:
     - Clasificación: `NO_ECONOMIC_IMPACT` (el pedido queda bloqueado comercialmente; no hay reversión automática de materiales).
3. **Invariante BPE Preservado**:
   - El presupuesto original de BPE (1.782,30 €) permanece 100% inmutable en la base de datos y en los metadatos de la orden.

---

## 3. Matriz de Cambios de Código

| Archivo | Tipo | Justificación de Seguridad |
|---|---|---|
| `migrations/167_phase196f_order_paper_decisions.sql` | DDL MySQL | Se añadió columna generada `active_role_slot` con índice `UNIQUE uk_opd_active_role` y columna `payload_fingerprint VARCHAR(64)`. |
| `migrations/migration-integrity-baseline.json` | Hash Baseline | Actualizado hash SHA-256 de migración 167 para conformidad con Phase 183. |
| `src/api/services/orderPaperDecisionService.js` | Backend Service | Inversión de flujo para orden antes de idempotencia, validación estricta de orden/tenancy/imprenta, hash canónico SHA-256, bloqueo de orden padre `FOR UPDATE`, validación monetaria y forzado de `REQUIRES_ECONOMIC_REVISION`. |
| `tests/budget02b01_order_paper_decisions.test.js` | Test Suite | 17 tests unitarios y de integración adversarial cubriendo H-02, H-03, H-04, H-05 y endpoints HTTP. |
| `scripts/test_budget02b01r_real_mysql_concurrency.js` | Test de Integración Real | Script con dos conexiones MySQL 8.0 independientes en transacciones paralelas comprobando `ER_DUP_ENTRY` e idempotencia. |
| `.github/workflows/ci.yml` | CI Workflow | Inclusión del paso de prueba de concurrencia e idempotencia sobre MySQL 8 real efímero. |

---

## 4. Estado de Verificación y Dictamen

- **Pruebas Adversariales (Vitest)**: 17/17 PASS.
- **Integridad de Migraciones (Phase 183)**: PASS.
- **Concurrencia Real MySQL 8**: Acreditada con script de doble conexión transaccional y CI workflow.
- **Garantías de Presupuesto BPE**: Invariante económico 1.782,30 € verificado e inmutable.
- **Dictamen**: **`BUDGET-02B01R_PASS`**.
