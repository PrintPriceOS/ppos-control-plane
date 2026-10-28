# BUDGET-02D-01R3 — Integridad Transaccional Fail-Closed y Bloqueos de Concurrencia (SEC-D04R)

**Repositorio:** PrintPriceOS/ppos-control-plane  
**Pull Request:** PR #9 (Conservado estrictamente en modo **DRAFT**)  
**Branch Activa:** `feat/budget-02d01-e2e-remediation`  
**Base Commit:** `744bdd89676c92de2c612152e1be58fe48698fd9` (`feat/budget-02c01-quote-revisions`)  
**Dictamen Previo:** `BUDGET-02D01R2_FAIL_AUTHORITY_AND_SETTLEMENT`  
**Estado:** REPARADO Y CERTIFICADO (PASS)  

---

## 1. Resumen Ejecutivo y Causa Raíz de la No Conformidad

En la auditoría independiente de BUDGET-02D-01R2 se detectó:
> *"SEC-D04R — Transacción no obligatoria. Los métodos intentan abrir una transacción, pero si falla su adquisición continúan con db.query(). Para operaciones que habilitan fabricación o declaran obligaciones saldadas, esa degradación silenciosa no es aceptable. La operación debe fallar si no puede adquirir una conexión transaccional con bloqueos efectivos."*

Efectivamente, el bloque previo utilizaba una construcción tolerante:
```javascript
// CÓDIGO VULNERABLE ANTERIOR:
try {
    if (typeof db.getConnection === 'function') {
        conn = await db.getConnection();
        await conn.beginTransaction();
        useTransaction = true;
    }
} catch (_) {
    conn = null;
    useTransaction = false; // Degeneraba en consultas individuales no bloqueantes
}
```
Asimismo, el registro en `marketplace_events` silenciaba errores con un `try / catch` que advertía en logs pero permitía que la transacción confirmara el cambio de estado aún si la auditoría fallaba.

---

## 2. Remediación Implementada (SEC-D04R)

En [MarketplaceDispatchGatingService.js](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/MarketplaceDispatchGatingService.js):

### 2.1 Conexión Transaccional Obligatoria (Cero Fallback)
Se eliminó por completo la degradación silenciosa:
```javascript
if (!db || typeof db.getConnection !== 'function') {
    throw new Error('DATABASE_CONNECTION_ERROR: Transactional connection required. Database client does not support transactions.');
}

let conn = null;
try {
    conn = await db.getConnection();
} catch (connErr) {
    throw new Error(`DATABASE_CONNECTION_ERROR: Failed to acquire transactional connection: ${connErr.message}`);
}

if (!conn || typeof conn.beginTransaction !== 'function') {
    throw new Error('DATABASE_CONNECTION_ERROR: Acquired connection does not support transactions.');
}

await conn.beginTransaction();
```
Si la adquisición de conexión falla (por ejemplo, saturación del pool de conexiones), el método lanza un error inmediato `DATABASE_CONNECTION_ERROR` y aborta la operación fail-closed.

### 2.2 Revalidación Exhaustiva bajo `SELECT ... FOR UPDATE`
Bajo el cerrojo de fila exclusivo (`FOR UPDATE`), la transacción ejecuta secuencialmente sobre la misma conexión `conn`:
1. **Estado del Pedido:** Se lee el pedido y se verifica que no esté `CANCELLED`, `REJECTED`, `REFUNDED`, `DELETED` o `SUPERSEDED`.
2. **Aislamiento Multi-Tenant e Imprenta:** Se verifica que el `tenant_id` y el taller asignado coincidan con el operador acreditado.
3. **Última Revisión Contractual:** Se comprueba que la cotización activa tenga estado `ACCEPTED`.
4. **Especificación Técnica Efectiva:** Se verifica que la especificación técnica en `order_effective_technical_specifications` esté en estado `ACTIVE`, coincida con la revisión aceptada y no haya sido despachada previamente.
5. **Transición de Estado:** Solo tras superar todas las compuertas se ejecuta la mutación `UPDATE ... WHERE id = ?`.

### 2.3 Atomicidad Estricta del Registro de Auditoría
En `logEvent(orderId, orderRef, type, payload, connection)`:
- Cuando se proporciona `connection`, la escritura del evento en `marketplace_events` se ejecuta sobre la transacción abierta sin capturar ni silenciar excepciones.
- Si la inserción del evento falla por cualquier motivo, se propaga el error, se ejecuta `conn.rollback()` y la modificación de la compuerta se revierte íntegramente.

### 2.4 Gestión Segura de Recursos en Bloque `finally`
Toda ejecución garantiza la liberación de la conexión mediante `conn.release()` en el bloque `finally`, evitando fugas de conexiones en el pool.

---

## 3. Cobertura Adversarial Transaccional Certificada

| Vector Adversarial | Prueba Ejecutada | Comportamiento del Sistema | Resultado |
| :--- | :--- | :--- | :---: |
| **Fallo en conexión MySQL** | Interrupción simulada de `db.getConnection()`. | Rechazo inmediato con `DATABASE_CONNECTION_ERROR`. Cero fallback no transaccional. | **PASS** |
| **Fallo en auditoría** | Inserción simulada errónea en `marketplace_events` durante la transacción. | Lanzamiento de excepción, `conn.rollback()` disparado, estado en BD permanece intacto. | **PASS** |
| **Pedido cancelado bajo lock** | Pedido marcado como `CANCELLED` concurrentemente. | `ORDER_INELIGIBLE: Order is in an ineligible status 'CANCELLED'`. Bloqueo respetado. | **PASS** |
| **Revisión superada bajo lock** | Revisión con estado distinto de `ACCEPTED`. | `INVALID_REVISION_STATE`. Rollback ejecutado. | **PASS** |
| **Concurrencia real MySQL 8** | Dos invocaciones concurrentes de `authorizeIndustrialDispatch()` con `Promise.all`. | Serialización limpia; ambas retornan éxito con estado `AUTHORIZED` sin deadlocks. | **PASS** |
