# Paper Supplier Hub — Operational Status & Progress Log

**Branch**: `feat/paper-supplier-hub`  
**Base Commit**: `5901569c1337d8b808f06c33e9ee44614e18c102`  
**I0 Commit (Docs)**: `81b9b0cb20a8cce094dc4f4939655d17fe2c8fa4` (Publicado en origin)  
**Last Updated**: 2026-10-21 05:26:00 CET  

---

## Estado Actual de Iteraciones

| Iteración | Descripción | Estado | Evidencia / Resultado |
|---|---|---|---|
| **I0** | **Base, alcance e invariantes** | **COMPLETED & VERIFIED (PASS)** | Rama publicada en GitHub (`81b9b0cb...`); Reconciliación de producción documentada; Vitest 43/43 files (664 tests) PASS; Vite build OK; Migration baseline PASS (164 migraciones); TSC baseline completa registrada en `tsc_baseline_i0.json` (199 diagnósticos detallados); Límites de tests de seguridad clarificados. |
| **I1** | **Identidad proveedor y protección de dominio** | **COMPLETED & VERIFIED (PASS)** | Roles de proveedor (ADMIN, OPERATOR, VIEWER) implementados con nivel 0 en `ROLE_HIERARCHY` (cero escalación a imprenta); Soporte de organizaciones con contexto dual (`activeContext`, `X-Active-Context`, `X-Supplier-Id`); Layout y rutas `/supplier/*` bajo flag (`PAPER_SUPPLIER_HUB_ENABLED`, `VITE_PAPER_SUPPLIER_HUB_ENABLED`, por defecto `false`); Protección de materiales de imprenta por tenant, centro y permisos; `/debug` restringido a `SUPER_ADMIN`; Núcleo de recepción atómica e idempotente (`receiveProcurementAtomic`) con transacciones MySQL, `FOR UPDATE`, fingerprinting SHA-256 de payload, guardas de sobre-recepción y auditoría de eventos `RESTOCK_RECEIVED`; Suite `tests/security_paper_supplier_and_materials_isolation.test.js` 14/14 tests superados sobre MySQL efímero; Vitest 44/44 archivos (678 tests) PASS (+14 tests de aislamiento y concurrencia); Build Vite OK; 0 nuevos errores TypeScript (199 diagnósticos preexistentes idénticos a la línea base I0). |
| **I2** | **Fichas técnicas e importador con revisión** | **NOT STARTED** | Pendiente. No iniciado en esta fase conforme a las directrices. |
| **I3** | **Catálogo y ofertas en panel proveedor (R1)** | **NOT STARTED** | Pendiente de I2. |
| **I4** | **Búsqueda imprenta y RFQ bidireccional (R2)** | **NOT STARTED** | Pendiente de I3. |
| **I5** | **Pedido, expedición y recepción a inventario (R3)** | **NOT STARTED** | Pendiente de I4. |
| **I6** | **Integración de precio con pricing industrial** | **NOT STARTED** | Pendiente de I3 + I5. |
| **I7** | **Despliegue estable y operación en producción** | **NOT STARTED** | Pendiente de hitos R1/R2/R3. |

---

## Evidencia de Verificación y Cierre de I1

1. **Aislamiento Multi-Tenant y Seguridad de Dominio (MySQL Efímero Docker `127.0.0.1:3307`)**:
   - **Suite**: `tests/security_paper_supplier_and_materials_isolation.test.js` (14 tests).
   - **Resultados**: 14/14 PASS en 6.64s.
   - **Matriz de Casos Verificados**:
     - *Caso 1*: Creación de 2 proveedores (`sup_fedrigoni_01`, `sup_torras_02`) y 2 imprentas (`ph_graficas_norte`, `ph_barna_print`).
     - *Caso 2*: Aislamiento de lectura cruzada entre imprentas en materiales (HTTP 403 `TENANT_ACCESS_DENIED`).
     - *Caso 3*: Bloqueo estricto de proveedores intentando acceder a rutas de materiales de imprenta (HTTP 403 `FORBIDDEN_SUPPLIER_ACCESS_TO_PRINTHOUSE_MATERIALS`).
     - *Caso 4*: Restricción de `/api/admin/materials/debug` estrictamente a `SUPER_ADMIN` (rechaza `PRINTHOUSE_ADMIN`, `SUPPLIER_ADMIN`, tokens anónimos con 403/401).
     - *Caso 5*: Rechazo de modificación de material cruzado entre imprentas (HTTP 403).
     - *Caso 6*: Recepción atómica exitosa de orden de suministro: decremento/cierre de procurement, incremento de stock disponible en inventario y emisión de evento de auditoría `RESTOCK_RECEIVED` confirmados en la misma transacción MySQL.
     - *Caso 7*: Idempotencia con clave idéntica y mismo payload retorna estado original (`status: 'COMPLETED'`, `isReplay: true`) sin duplicar stock ni transacciones.
     - *Caso 8*: Rechazo por discrepancia de payload bajo la misma clave de idempotencia (HTTP 409 `IDEMPOTENCY_PAYLOAD_MISMATCH`).
     - *Caso 9*: Rechazo de recepción que excede las unidades pedidas (HTTP 400 `RECEIPT_EXCEEDS_ORDERED_QUANTITY`).
     - *Caso 10*: Rechazo de recepción de orden de suministro perteneciente a otra imprenta (HTTP 403 `TENANT_ACCESS_DENIED`).
     - *Caso 11*: Concurrencia de recepciones paralelas en carrera (`Promise.all`): una recepción adquiere el lock `FOR UPDATE` y tiene éxito; la segunda es rechazada con HTTP 409 `ALREADY_RECEIVED`.
     - *Caso 12*: Bloqueo inmediato de proveedor con estado suspendido (`is_active = 0` / `status = 'SUSPENDED'`) devolviendo HTTP 403 `SUPPLIER_SUSPENDED`.
     - *Caso 13*: Rol `SUPPLIER_VIEWER` denegado para mutaciones de proveedor (HTTP 403 `SUPPLIER_PERMISSION_DENIED_VIEWER_READ_ONLY`).
     - *Caso 14*: Rutas `/api/v1/paper-suppliers/*` bloqueadas con HTTP 403 `PAPER_SUPPLIER_HUB_DISABLED` cuando el feature flag está inactivo.

2. **Regresión Completa de Pruebas Unitarias y de Integración**:
   - `npx vitest run tests/`: 44/44 archivos evaluados, **678 passed**, 0 failed (22.25s).
   - Cobertura preexistente (664 tests) intacta, más 14 tests nuevos de seguridad e integridad.

3. **Línea Base TypeScript**:
   - Ejecución de `npx tsc --noEmit`: 199 diagnósticos preexistentes registrados en `tsc_baseline_i0.json`.
   - Comparación con los nuevos archivos creados para I1 (`src/ui/components/SupplierRouteGuard.tsx`, `src/ui/pages/supplier/SupplierDashboardPage.tsx`, modificaciones a `src/ui/layout/Sidebar.tsx`, `Topbar.tsx`, `authStore.ts`, `adminApi.ts`):
   - **0 nuevos diagnósticos TypeScript introducidos**. El total permanece en 199 diagnósticos de código previo no modificado.

4. **Compilación Frontend**:
   - `npm run build`: Vite v6.4.2 generó el bundle de producción en `dist/` en 18.25s sin errores.

5. **Auditoría y Reconciliación de Producción (Inspección de Solo Lectura)**:
   - Commit de documentación I0 publicado en origin: `81b9b0cb20a8cce094dc4f4939655d17fe2c8fa4` (y commit de integración I1 posterior `3062ac809742503dfffdfe5d053298b2422d21b1`).
   - `/ready` en `server.js`: Muestra `schema` y `status: 'READY'`. El metadato `3593eeb` proviene de la compilación/caché anterior y no existe en el histórico Git de este repositorio. No se han forzado redespliegues para enmascararlo.
   - Motor y lockfile: `@ppos/pricing-engine` fijado a `1f8997eb34b14db6787986249a1fb8c4e01ea77e`.
   - Aclaración de tests de aislamiento: El test `tests/security_machines_materials_isolation_test.js` cubre exclusivamente aislamiento de máquinas; la acreditación de materiales y procurement queda formalmente respaldada por la nueva suite `tests/security_paper_supplier_and_materials_isolation.test.js`.

---

## Bloqueos y Riesgos Identificados (Superados en I1)

1. **Jerarquía Numérica en `auth.js` (`ROLE_HIERARCHY`)**:
   - Resuelto: Roles de proveedor definidos con nivel 0 en `ROLE_HIERARCHY`. No pueden satisfacer `requireRole('PRINTHOUSE_ADMIN')` ni ningún permiso administrativo de imprenta.
2. **Recepción Atómica en `materialAvailabilityService.js`**:
   - Resuelto: Función `receiveProcurementAtomic` implementada usando transacciones MySQL con locks `FOR UPDATE`, idempotencia SHA-256 e inserción de eventos de auditoría `RESTOCK_RECEIVED`.
3. **Feature Flags**:
   - Resuelto: Control doble: backend (`PAPER_SUPPLIER_HUB_ENABLED`, default false) y frontend (`VITE_PAPER_SUPPLIER_HUB_ENABLED`, default false). Rutas cerradas por defecto tanto en cliente como en servidor.

