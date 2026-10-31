# BUDGET-02D-01R3 — Autoridad de Identidad y Aislamiento Multi-Tenant Estricto (SEC-D02R)

**Repositorio:** PrintPriceOS/ppos-control-plane  
**Pull Request:** PR #9 (Conservado estrictamente en modo **DRAFT**)  
**Branch Activa:** `feat/budget-02d01-e2e-remediation`  
**Base Commit:** `744bdd89676c92de2c612152e1be58fe48698fd9` (`feat/budget-02c01-quote-revisions`)  
**Dictamen Previo:** `BUDGET-02D01R2_FAIL_AUTHORITY_AND_SETTLEMENT`  
**Estado:** REPARADO Y CERTIFICADO (PASS)  

---

## 1. Resumen Ejecutivo y Causa Raíz de la No Conformidad

En la auditoría independiente de la entrega BUDGET-02D-01R2 se identificó un defecto crítico de aislamiento multi-tenant en [MarketplaceDispatchGatingService.js](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/MarketplaceDispatchGatingService.js):

```javascript
// CÓDIGO VULNERABLE ANTERIOR:
if (authContext.tenantId && order.tenant_id && authContext.tenantId !== order.tenant_id) {
    throw new Error('FORBIDDEN');
}
```

Bajo esa implementación, si el llamador omitía `tenantId` en el contexto, la condición evaluaba a falso y la verificación se saltaba por completo. Ocurría lo mismo con `printhouseId`. Asimismo, el método permitía que la bandera `authContext.isSuperAdmin` influyera en la exención de aislamiento basándose en una propiedad recibida en el objeto o en el cuerpo HTTP sin contrastación con la autenticación del servidor.

---

## 2. Remediación Implementada (SEC-D02R)

### 2.1 Contexto de Seguridad Derivado Exclusivamente del Servidor
En [printhouseOrders.js](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/routes/printhouseOrders.js), los manejadores de ruta resuelven el contexto del actor exclusivamente mediante el middleware de autenticación verificado (`req.user` proveniente de la firma criptográfica JWT):
- El rol, tenant, imprenta e identidad se obtienen de la sesión validada.
- Ningún parámetro del cuerpo HTTP (`req.body.role`, `req.body.isSuperAdmin`, `req.body.tenantId`) puede inyectar o elevar privilegios.

### 2.2 Ámbito de Tenant e Imprenta Estrictamente Obligatorios
En [MarketplaceDispatchGatingService.js](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/MarketplaceDispatchGatingService.js):
1. **Identidad no ficticia:** Se rechaza de forma fail-closed cualquier identificador nulo, vacío o correspondiente a actores ficticios (`system_manager`, `system_finance`, `anonymous`, `test`, `system`).
2. **Lista blanca de roles autorizados:** Solo roles autorizados pueden invocar `authorizeIndustrialDispatch()` o `settleRefund()`.
3. **Prohibición de banderas autodeclaradas:** La condición de administrador global se restringe estrictamente a `role === 'SUPER_ADMIN' || role === 'SYSTEM_ADMIN'`. Cualquier bandera `isSuperAdmin: true` recibida de un llamador no global es terminantemente ignorada.
4. **Tenant obligatorio para operadores no globales:**
   ```javascript
   if (!isGlobalAdmin) {
       if (!opTenantId) {
           throw new Error('FORBIDDEN: Authenticated tenant context is mandatory for operator.');
       }
   }
   ```
5. **Imprenta obligatoria para operadores de taller:**
   ```javascript
   if (['PRINTHOUSE_ADMIN', 'PLANT_DIRECTOR'].includes(role) && !opPrinthouseId) {
       throw new Error('FORBIDDEN: Authenticated printhouse context is mandatory for printhouse operator.');
   }
   ```
6. **Verificación contra el pedido bajo bloqueo transaccional (`FOR UPDATE`):**
   - El tenant acreditado del operador debe coincidir con `order.tenant_id`.
   - La imprenta asignada (`order.offer_print_house` / `order.assigned_printhouse_id`) debe coincidir con `opPrinthouseId`.

---

## 3. Cobertura Adversarial Certificada

En la suite de integración [budget02d01_e2e_real_integration.test.js](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/tests/budget02d01_e2e_real_integration.test.js) y en el script de certificación MySQL 8 real [test_budget02d01_real_mysql_e2e.js](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/scripts/test_budget02d01_real_mysql_e2e.js), se comprueban los siguientes vectores:

| Vector Adversarial | Entrada Probada | Comportamiento Esperado | Resultado |
| :--- | :--- | :--- | :---: |
| **Tenant omitido** | Operador no global con `tenantId: ''` o `undefined`. | Rechazo con `FORBIDDEN: Authenticated tenant context is mandatory for operator.` | **PASS** |
| **Tenant ajeno** | Operador con `tenantId: 'tenant_foreign_hacker'` sobre pedido de `tenant_prod_alpha`. | Rechazo con `FORBIDDEN: Tenant mismatch.` | **PASS** |
| **Imprenta omitida** | Director de planta con `printhouseId: ''` o `undefined`. | Rechazo con `FORBIDDEN: Authenticated printhouse context is mandatory for printhouse operator.` | **PASS** |
| **Imprenta ajena** | Operador con `printhouseId: 'ph_foreign'` sobre pedido de `ph_bcn_industrial`. | Rechazo con `FORBIDDEN: Printhouse mismatch.` | **PASS** |
| **Rol autodeclarado** | Llamada con `role: 'OPERATOR'` e `isSuperAdmin: true` autodeclarado. | Rechazo con `FORBIDDEN: User role 'OPERATOR' does not have ... permission.` | **PASS** |
