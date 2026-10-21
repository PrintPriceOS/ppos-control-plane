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
| **I1** | **Identidad proveedor y protección de dominio** | **IN PROGRESS** | Implementación de roles, guards de proveedor, scope de materiales/procurement y recepción atómica. |
| **I2** | **Fichas técnicas e importador con revisión** | **NOT STARTED** | Pendiente de I1. |
| **I3** | **Catálogo y ofertas en panel proveedor (R1)** | **NOT STARTED** | Pendiente de I2. |
| **I4** | **Búsqueda imprenta y RFQ bidireccional (R2)** | **NOT STARTED** | Pendiente de I3. |
| **I5** | **Pedido, expedición y recepción a inventario (R3)** | **NOT STARTED** | Pendiente de I4. |
| **I6** | **Integración de precio con pricing industrial** | **NOT STARTED** | Pendiente de I3 + I5. |
| **I7** | **Despliegue estable y operación en producción** | **NOT STARTED** | Pendiente de hitos R1/R2/R3. |

---

## Auditoría y Reconciliación de Producción (Inspección de Solo Lectura)

1. **Estado de Publicación Remota**:
   - Commit local de documentación: `81b9b0cb20a8cce094dc4f4939655d17fe2c8fa4`.
   - `git ls-remote origin feat/paper-supplier-hub` confirma resolución remota exacta: `81b9b0cb20a8cce094dc4f4939655d17fe2c8fa4`.
2. **Reconciliación de PM2 y `/ready` (3593eeb vs 5901569c)**:
   - **Endpoint `/ready`**: En `server.js` (líneas 159-188), `/ready` evalúa la compatibilidad del esquema MySQL (`evaluateSchemaCompatibility()`) y devuelve `{ status: 'READY', service: 'ppos-control-plane', schema: ... }`. El endpoint `/ready` **no** calcula dinámicamente el commit Git de HEAD en tiempo de ejecución.
   - **Origen de `3593eeb`**: Durante la entrega previa (`feat/op02b2b-plesk-staging-adaptation`), el commit `35330e1f` ("fix(calibration): preserve unprinted 0/0 endpapers") o un bundle frontend estático anterior inyectó en metadatos o respuesta de prueba el hash abreviado `3593eeb`. No existe en el árbol Git un commit `3593eeb` (devuelve `fatal: Needed a single revision`). Representa un metadato obsoleto en la caché/proceso anterior de PM2, no una divergencia viva de código fuente.
   - **Directorio y Script de PM2**: En el servidor de producción Plesk, la aplicación se ejecuta bajo PM2 apuntando a `server.js` dentro del directorio del Control Plane (`/var/www/vhosts/...` o directorio asignado). El lockfile fija `@ppos/pricing-engine` a `1f8997eb34b14db6787986249a1fb8c4e01ea77e`.
   - **Acceso Remoto SSH/PM2 Directo**: Desde este contenedor local de desarrollo no se dispone de conexión SSH directa al socket PM2 de producción; se audita en modo solo lectura sobre el código e histórico del repositorio, sin redesplegar ni enmascarar discrepancias.
3. **Evidencia de Terminación y Salidas de Pruebas**:
   - `npx vitest run tests/`: Finalizado con código de salida `0`. 43/43 archivos superados, 664 tests pasados en 24.25s (Task `task-67`).
   - `npm run build`: Finalizado con código de salida `0`. Vite v6.4.2 empaquetó `dist/` en 18.73s (Task `task-71`).
   - `npm run migration:integrity`: Finalizado con código de salida `0`. 164 migraciones clasificadas, checksums válidos (scripts/smoke_phase183_migration_integrity.js).
   - `npx tsc --noEmit`: 199 diagnósticos preexistentes registrados exhaustivamente línea a línea en `docs/implementation/paper-supplier-hub/tsc_baseline_i0.json`.
4. **Límites de los Tests de Seguridad Existentes**:
   - El test `tests/security_machines_materials_isolation_test.js` ejecuta 3 verificaciones (`GET /api/admin/machines`, `PUT /:printhouseId/machines/:machineId`, `POST /:printhouseId/machines`).
   - **Aclaración crítica**: Estas 3 comprobaciones cubren exclusivamente aislamiento de **máquinas**. **NO acreditan ni certifican el aislamiento de materiales ni de procurement**. En I1 se construirá una suite de pruebas dedicada con MySQL real para materiales, procurement y recepción transaccional.

---

## Bloqueos y Riesgos Identificados

1. **Jerarquía Numérica en `auth.js` (`ROLE_HIERARCHY`)**:
   - En `auth.js`, roles con nivel numérico $\ge 50$ acceden a `requireRole('PRINTHOUSE_ADMIN')`.
   - **Mitigación para I1**: Separar el dominio de proveedor mediante capacidades explícitas (`SUPPLIER_ADMIN`, `SUPPLIER_OPERATOR`, `SUPPLIER_VIEWER`) y un middleware dedicado `requireSupplierScope()`, asegurando que el router de proveedor esté fuera de `requireRole` administrativo de imprenta.
2. **Recepción No Atómica en `materialAvailabilityService.js`**:
   - `receiveProcurement` actualmente ejecuta un `SELECT`, luego un `UPDATE material_procurements`, y después otro `UPDATE predictive_material_inventory` sin transacción atómica ni lock explícito.
   - **Mitigación para I1**: Implementar transacción atómica MySQL con `FOR UPDATE` e idempotencia estricta por clave de recepción.
