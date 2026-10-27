# EVIDENCIAS DE PRUEBAS AUTOMATIZADAS — BUDGET-02B-01
## Acreditación de Verificación de Integridad, Concurrencia y No Regresión

**Proyecto:** PrintPrice OS Control Plane  
**Misión:** BUDGET-02B-01  
**Runner:** Vitest v3.2.0  
**Fecha de Ejecución:** 27 de octubre de 2026  
**Resultado Global:** **100% PASS (39/39 tests en suites relevantes ejecutados satisfactoriamente)**  

---

## 1. Desglose de Escenarios de la Suite de Certificación BUDGET-02B-01

Archivo de prueba: `tests/budget02b01_order_paper_decisions.test.js`

| # | Escenario Obligatorio | Entrada / Condiciones | Comportamiento Observado | Duración | Estado |
| :-: | :--- | :--- | :--- | :-: | :-: |
| 1 | **Confirmación válida** | `paperRole: INTERIOR`, `decisionAction: CONFIRM`, `requestedVariantId: var_coral_90_70x100` | Persistido con `economic_status: DELTA_ZERO_CONFIRMED`, `estimated_cost_delta: 0`, snapshot incrustado (GSM 90, UNCOATED). | 4 ms | **PASS** |
| 2 | **Rechazo válido** | `paperRole: COVER`, `decisionAction: REJECT`, `technicalReason: Fuera de plazo` | Persistido con `economic_status: REVISION_NOT_APPLICABLE`, `alternative_variant_id: null`. | 1 ms | **PASS** |
| 3 | **Propuesta alternativa válida** | `decisionAction: PROPOSE_ALTERNATIVE`, `alternativeVariantId: var_creator_115_70x100`, $\Delta = 45,50$ | Persistido con `economic_status: REQUIRES_ECONOMIC_REVISION`. Precio base BPE (1.782,30 €) inalterado. | 1 ms | **PASS** |
| 4 | **Variante inexistente** | `requestedVariantId: var_phantom_nonexistent` | Interceptado antes de inserción. Devuelve código `VARIANT_NOT_FOUND` y HTTP `404`. | 1 ms | **PASS** |
| 5 | **Tenant incorrecto** | Petición con `tenantId: tenant_attacker_foreign` sobre pedido de `tenant_books_es` | Interceptado por RBAC. Devuelve código `TENANT_MISMATCH` y HTTP `403`. | 0 ms | **PASS** |
| 6 | **Imprenta no autorizada** | Petición con `printhouseId: print_unassigned_barcelona` sobre pedido asignado a Madrid | Interceptado por verificación de asignación. Devuelve código `PRINTHOUSE_UNAUTHORIZED` y HTTP `403`. | 0 ms | **PASS** |
| 7 | **Pedido inexistente / Pre-ingesta** | `jobId: null`, `externalOrderIntentId: intent_pre_ingest_standalone_101` | Resuelve catálogo de variantes y persiste snapshot sin exigir pedido local cerrado. | 0 ms | **PASS** |
| 8 | **Decisión duplicada** | Emisión secuencial de dos confirmaciones sobre el mismo rol sin cambio técnico | Registra advertencia de redundancia y secuencia `decision_number: 2` sin corromper el histórico. | 1 ms | **PASS** |
| 9 | **Reintento con misma idempotency key** | Mismo payload retransmitido con la clave `same_key_100` | Responde con la decisión preexistente, mismo UUID y marca `idempotent_replay: true`. No duplica en BD. | 1 ms | **PASS** |
| 10 | **Reutilización de clave con payload alterado** | Misma clave `shared_key_collision` con cambio de acción (`CONFIRM` a `REJECT`) | Detecta colisión de carga útil y aborta con código `IDEMPOTENCY_KEY_COLLISION` y HTTP `409`. | 1 ms | **PASS** |
| 11 | **Decisiones secuenciales / concurrencia** | Decisión 1 (`CONFIRM`) seguida de Decisión 2 (`PROPOSE_ALTERNATIVE`) | `decision_number` incrementa 1 $\to$ 2. La decisión 1 pasa atómicamente a estado `SUPERSEDED`. | 1 ms | **PASS** |
| 12 | **Pedido cancelado** | Petición sobre pedido con estado `CANCELLED` | Aborta con código `ORDER_INELIGIBLE` y HTTP `422`. Cero mutaciones persistidas. | 0 ms | **PASS** |
| 13 | **Fallo de persistencia** | Simulación de error de I/O en la inserción SQL | Ejecuta `conn.rollback()` de forma limpia. Cero filas huérfanas en base de datos. | 0 ms | **PASS** |
| 14 | **Conservación del importe BPE** | Ejecución de propuestas con sobrecostes ($\Delta = 85,00$) | Se constata que `orders.offer_price` permanece estrictamente en **1.782,30 €**. Cero recálculos. | 0 ms | **PASS** |
| 15 | **Historial de decisiones** | Consulta vía `listDecisionsForOrder` de un pedido con múltiples transiciones | Devuelve traza completa ordenada cronológicamente con sus roles y estados. | 1 ms | **PASS** |
| 16 | **HTTP: Idempotency-Key obligatoria** | Invocación HTTP sin cabecera `Idempotency-Key` | Rechazo inmediato con HTTP `400` y `MISSING_IDEMPOTENCY_KEY`. | 1 ms | **PASS** |
| 17 | **HTTP: Prototype pollution** | Carga útil con clave inyectada `__proto__` | Rechazo preventivo con HTTP `400` y `PROTOTYPE_POLLUTION_DETECTED`. | 0 ms | **PASS** |
| 18 | **HTTP: Invocación completa exitosa** | Invocación HTTP válida a `/api/printhouse/jobs/:jobId/paper-decision` | Procesa y responde con HTTP `201 Created` y decisión estructurada sin fugas mayoristas. | 1 ms | **PASS** |

---

## 2. Registro de Salida de Ejecución de Pruebas

```text
 RUN  v3.2.0 C:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer

 ✓ tests/budget02b01_order_paper_decisions.test.js (18 tests) 14ms
 ✓ tests/backend_tenant_security.test.js (21 tests) 32ms

 Test Files  2 passed (2)
      Tests  39 passed (39)
   Start at  16:55:39
   Duration  3.17s (transform 61ms, setup 0ms, collect 2.16s, tests 47ms, environment 1.64s, prepare 370ms)
```

---

## 3. Verificación de Compilación y Sintaxis

1. **Sintaxis Node.js:**
   - `node -c src/api/services/orderPaperDecisionService.js`: Sin errores (código 0).
   - `node -c src/api/routes/printhouseOrders.js`: Sin errores (código 0).
2. **Build de Control Plane (`npm run build`):**
   - 3579 módulos transformados.
   - Compilación Vite en producción exitosa en 15.47s (código 0).
3. **Build de Budget App (`npm run build`):**
   - 2311 módulos transformados.
   - Compilación Vite en producción exitosa en 5.97s (código 0).
4. **Verificación de Migraciones (`npm run migration:integrity`):**
   - 170 migraciones clasificadas.
   - Checksum canónico `b9ffb533...` verificado en `migration-integrity-baseline.json`.
   - Fase 183: **PASSED**.
