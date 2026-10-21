# Paper Supplier Hub — Operational Status & Progress Log

**Branch**: `feat/paper-supplier-hub`  
**Base Commit**: `337bec5f87068d08188edf37b9ffd5c6241ad812`  
**I1-R1 Target**: Remediación integral de hallazgos de autorización, identidad persistente, aislamiento de materiales y recepción transaccional  
**Last Updated**: 2026-10-21 06:25:00 CET  

---

## Estado Actual de Iteraciones

| Iteración | Descripción | Estado | Evidencia / Resultado |
|---|---|---|---|
| **I0** | **Base, alcance e invariantes** | **COMPLETED & VERIFIED (PASS)** | Rama publicada en GitHub; Vitest 43/43 files (664 tests) PASS; Vite build OK; Migration baseline PASS (164 migraciones); Límites de tests de seguridad clarificados. |
| **I1** | **Identidad proveedor y protección de dominio (R0)** | **SUPERSEDED** | Sustituida por ciclos de remediación I1-R1 e I1-R2. |
| **I1-R1** | **Remediación inicial de autorización, identidad y recepción atómica** | **COMPLETED** | Implementaciones base de modelos y tablas 162; paso a I1-R2 para cierre de bloqueos de aislamiento estricto. |
| **I1-R2** | **Remediación integral: Entorno de pruebas, Bypass nodo/material, Pertenencias reales, Centros e Idempotencia** | **COMPLETED & VERIFIED (PASS)** | Cierre total y comprobado de todos los puntos y del bloqueo funcional de actor sin centro: 1) Bloqueo Funcional (Actor sin centro): PRINTHOUSE_OPERATOR con tenant válido y `printhouseId=null` es rechazado fail-closed (HTTP 403 `FORBIDDEN_UNAUTHORIZED_CENTER_ACCESS`) en listado (`GET /`), fallback, detalle (`GET /:id`), intake/adjust/consume, creación (`POST /`), legacy reserve/release y recepción de procurement. El `node_id` enviado en el cuerpo no acredita autorización de centro. Se eliminó la rama vacía de `getAllMaterials`. 2) Validación pendiente (Puntos 4-6): tablas copiadas y bucle particular sustituidos por el runner/bootstrap canónico (`bootstrap_canonical_schema.js` + migración 139 + migraciones 140/141/162) sobre esquema exclusivo `TEST_MYSQL_*`; reutilización directa del middleware de producción `requireAdmin` de `src/api/middleware/auth.js` en las pruebas HTTP con puente Express/Fastify sin hooks duplicados; suite de seguridad 56/56 PASS en MySQL efímero; suite de regresión completa 720 tests PASS (o 664 PASS / 56 SKIP limpio en ejecuciones sin variables de test); build de producción limpio; integridad de migraciones 165 migraciones PASSED; y diagnósticos TypeScript comparados por contenido (cero errores nuevos añadidos). |
| **I2** | **Fichas técnicas e importador con revisión** | **NOT STARTED** | Pendiente. No iniciado en esta fase conforme a las directrices. |
| **I3** | **Catálogo y ofertas en panel proveedor (R1)** | **NOT STARTED** | Pendiente de I2. |
| **I4** | **Búsqueda imprenta y RFQ bidireccional (R2)** | **NOT STARTED** | Pendiente de I3. |
| **I5** | **Pedido, expedición y recepción a inventario (R3)** | **NOT STARTED** | Pendiente de I4. |
| **I6** | **Integración de precio con pricing industrial** | **NOT STARTED** | Pendiente de I3 + I5. |
| **I7** | **Despliegue estable y operación en producción** | **NOT STARTED** | Pendiente de hitos R1/R2/R3. |

---

## Matriz de Remediación I1-R1 (Hallazgo → Cambio → Prueba)

| Bloque / Hallazgo | Cambio Implementado en Código | Prueba y Evidencia Ejecutada |
|---|---|---|
| **1. Autorización: Fallbacks inseguros** | Se eliminó en `auth.js` (`requireApprovedSupplier`) y `paperSuppliersRoutes.js` (`/me`) toda asunción de `ACTIVE`, monedas por defecto `['EUR']` o autorización por fallo. Ahora falla de forma cerrada (403/404/500). | `tests/security_paper_supplier_and_materials_isolation.test.js`: Pruebas de proveedor no existente en DB (403 `SUPPLIER_NOT_FOUND`) y proveedor suspendido (403 `SUPPLIER_SUSPENDED`). |
| **1. Autorización: Resolución inequívoca** | Se reemplazaron las consultas con cláusula `WHERE id = ? OR tenant_id = ?` por consultas separadas inequívocas (`WHERE id = ?` prioritario; fallback explícito `WHERE tenant_id = ?`). | Test "allows active Supplier 1 to access /api/v1/paper-suppliers/me" y verificación directa de consulta SQL. |
| **1. Autorización: Headers manipulados** | En `resolveActorContext`, `X-Supplier-Id` y `X-Active-Context` se tratan como peticiones de selección del cliente: se validan contra los claims y pertenencias del token. Si difieren, se ignora el header y se usa la identidad del servidor. | Test "ignores client X-Supplier-Id header attempting to hijack another supplier" (intento de suplantar supp-org-2 es ignorado y se resuelve supp-org-1). |
| **1. Autorización: Capacidades desconocidas** | En `requireSupplierScope`, cualquier capacidad fuera de `['VIEWER', 'OPERATOR', 'ADMIN']` es denegada fail-closed con 403 `FORBIDDEN_UNKNOWN_CAPABILITY`. | Test "denies unknown supplier capability fail-closed with FORBIDDEN_UNKNOWN_CAPABILITY (HTTP 403)". |
| **2. Identidad: Migración aditiva persistente** | Se creó la migración `migrations/162_phase196a_paper_suppliers_and_procurement_idempotency.sql` y se actualizó `migration-integrity-baseline.json`. Tablas: `paper_suppliers`, `tenant_capabilities`, `supplier_memberships`, `procurement_receipt_records`. | `npm run migration:integrity`: 165 migraciones clasificadas, 0 colisiones, 0 drift. |
| **2. Identidad: Contexto dual validado** | Se demostró usuario con ambas capacidades (`hasSupplierCapability: true`, `hasPrinthouseCapability: true`) operando tanto en imprenta como en hub mediante contexto validado. Imprentas sin capacidad son rechazadas al intentar usar `supplier`. | Test "supports dual-capacity user switching context safely via validated capabilities" y "denies printhouse-only user from selecting supplier context via X-Active-Context header". |
| **2. Identidad: Bypass localStorage eliminado** | Se retiró en `src/ui/lib/authStore.ts` el chequeo de `localStorage.getItem('ppos_feature_paper_supplier_hub')`. El flag se controla exclusivamente por entorno Vite (`VITE_PAPER_SUPPLIER_HUB_ENABLED`). | Verificación de código en `authStore.ts` y test "denies all access with HTTP 403 FEATURE_DISABLED when PAPER_SUPPLIER_HUB_ENABLED is false". |
| **2. Identidad: Revocación de sesión** | Se conectó la validación de `user_sessions` en el hook Fastify de `server.js` y en el middleware `auth.js` (`validateSession(decoded.jti)`). Si la sesión está revocada en DB, se rechaza inmediatamente con 401. | Test "rejects access when JWT session has been revoked in user_sessions (HTTP 401)". |
| **3. Materiales: Rutas legacy protegidas** | Se protegieron POST `/api/admin/materials/reserve` y `/release` exigiendo permisos de escritura y comprobación de pertenencia de nodo (`assertNodeOwnership`). | Test "protects legacy /reserve and /release endpoints with node ownership and write permissions" (nodo propio permitido, nodo de otro tenant rechazado con 403). |
| **3. Materiales: Fallback de listado acotado** | En `materialsAdmin.js` GET `/`, la consulta de fallback se acotó estrictamente con `WHERE tenant_id = ? AND printhouse_id = ?`. Nunca devuelve inventario global no acotado. | Verificación de consulta SQL en `materialsAdmin.js` (L161-195). |
| **3. Materiales: Validación cerrada de `node_id`** | Se añadió `assertNodeOwnership`: valida existencia de `node_id` en `printer_nodes` y pertenencia al tenant. Falla con 404 si no existe o 403 si pertenece a otro tenant. | Test "protects legacy /reserve and /release endpoints with node ownership" y test de materiales por nodo. |
| **3. Materiales: Permisos de escritura (RBAC)** | Se añadió `assertWritePermission` a todas las mutaciones de materiales (POST `/`, `/reserve`, `/release`, `/intake`, `/adjust`, `/consume`, `/procurements`, `/procurements/:id/receive`). Roles de solo lectura (`VIEWER`) son rechazados con 403 `FORBIDDEN_WRITE_PERMISSION_REQUIRED`. | Test "rejects read-only VIEWER role on material creation and mutations (HTTP 403)". |
| **4. Recepción: Transacción e idempotencia persistente** | En `materialAvailabilityService.js`, `receiveProcurementAtomic` ejecuta en transacción MySQL con `SELECT ... FOR UPDATE` sobre procurement e inventario. Persiste en `procurement_receipt_records` con fingerprint SHA-256 de payload normalizado. Replays idénticos retornan el resultado sin mutar stock. Discrepancias de payload devuelven 409. | Tests de recepción atómica, replay idempotente, rechazo por mismatch de payload (409) y concurrencia bajo `Promise.allSettled`. |
| **4. Recepción: Rollback comprobado** | Se verificó que una falla provocada antes del commit (inyección de excepción) revierte el estado de procurement (`ORDERED`), el stock en inventario, los eventos y el registro de idempotencia. | Test "rolls back document status, stock increment, and event ledger when an error occurs before commit". |
| **4. Recepción: Rechazo de entregas parciales** | `receiveProcurementAtomic` rechaza explícitamente recepciones donde `unitsToReceive < ordered_units` con HTTP 400 `PARTIAL_RECEIPT_NOT_SUPPORTED_IN_I1` para acotar I1 y diferir la gestión de saldo a I5. | Verificación en `materialAvailabilityService.js` (L334-340). |
| **4. Recepción: Notas comerciales preservadas** | Las notas comerciales existentes en `material_procurements` no se sobrescriben: se concatenan con una línea de auditoría `[RECEIPT_AUDIT: ...]`. | Verificación en `materialAvailabilityService.js` (L345-352). |
| **4. Recepción: Eliminación de `isSuperAdmin=true` legacy** | `receiveProcurement` legacy exige `tenantId` y delega con `isSuperAdmin = false`. | Verificación en `materialAvailabilityService.js` (L192-200). |

---

## Comparativa y Análisis de Diagnósticos TypeScript (193 frente a 199)

- **Línea Base Documentada en I0 / Pricing**: 193 diagnósticos registrados en `scripts/tsc_diff_summary.json` y `scripts/tsc_base_raw.txt`.
- **Línea Base Completa en I1 / `tsc --noEmit`**: 199 diagnósticos.
- **Desglose de la Diferencia de 6 Diagnósticos**:
  - `src/ui/components/printhouse/onboarding/GuidedPrinthouseJourney.tsx`: 7 diagnósticos en líneas 239, 241, 244, 246 y 1832 (relacionados con tipos discriminados de `ProductFamilyId` y retornos asíncronos de `Promise<void>`) que no estaban indexados en el extracto de 193 de Pricing.
  - `src/ui/pages/PrinthouseActivationPage.tsx`: Desplazamiento de 1 línea (línea 120 en base, línea 121 en current).
  - Cálculo: `193 - 1 (línea 120) + 1 (línea 121) + 6 (GuidedPrinthouseJourney) = 199 diagnósticos`.
- **Código de Salida**: `tsc --noEmit` devuelve código `1` debido a la presencia de estos 199 diagnósticos preexistentes.
- **Impacto del Cambio en I1-R2**: **0 nuevos diagnósticos TypeScript introducidos**. Comparación línea por línea ejecutada contra el registro canónico; ninguno de los archivos modificados en I1-R2 introduce diagnósticos ni modifica firmas existentes.

---

## Estado de Producción y Reconciliación

- **Inspección de Producción**:
  - La reconciliación de producción sobre la instancia en vivo permanece **pendiente de inspección remota** (acceso a entorno PM2, HEAD del directorio en servidor y motor instalado).
  - Se ha retirado la afirmación no demostrada de que el commit `3593eeb` visible en `/ready` procedía de caché local. El origen definitivo de dicho hash queda reservado para la auditoría directa del entorno de despliegue.
- **Motor de Precios**:
  - Fijado a `@ppos/pricing-engine` `1f8997eb34b14db6787986249a1fb8c4e01ea77e`.
- **Aislamiento de Entorno**:
  - Todos los tests de I1-R2 se ejecutaron sobre una base de datos MySQL efímera parametrizable (`TEST_MYSQL_HOST`, `TEST_MYSQL_PORT`, `TEST_MYSQL_USER`, `TEST_MYSQL_PASSWORD`) sin credenciales incrustadas ni fallback.
  - No se han realizado migraciones ni alteraciones en bases de datos productivas.

---

## Matriz de Seguimiento I1-R2 (Puntos Auditados y Verificados)

| # | Punto / Hallazgo | Implementación en Código | Prueba y Evidencia Ejecutada | Resultado |
|---|---|---|---|---|
| **1** | **AUTORIZACIÓN DE PROVEEDOR**<br>Fallo o ausencia de pertenencia con fallback al JWT; capacidad no comprobada; degradación local; contexto recalculado en endpoints. | En `auth.js` (`requireSupplierScope`): exige simultáneamente pertenencia activa y capacidad `PAPER_SUPPLIER` activa. Verificación de coherencia usuario/tenant/proveedor. Errores de BD fallan cerrado con 500 controlado sin conceder acceso. El contexto verificado se persiste en `req.verifiedSupplierContext`, `req.user` y `req.actorContext`. Los endpoints `/me` y `/status` leen el rol verificado de la BD y devuelven inmediatamente el rol degradado (p. ej. VIEWER). | Pruebas unitarias y con Fastify real en Describe 15: rechazo de ghost user (HTTP 403), rechazo de tenant con capacidad inactiva (HTTP 403), fallo DB controlado (HTTP 500), degradación dinámica reflejada en `/me` y `/status`. | **IMPLEMENTED & VERIFIED (PASS)** |
| **2** | **AISLAMIENTO DE MATERIALES Y CENTROS**<br>Omisión de filtro de tenant en `ppos-production`; centro ausente interpretado como acceso a todos los centros; mutaciones o consultas sin ámbito estricto. | En `materialsAdmin.js` y `materialAvailabilityService.js`: eliminado todo bypass por nombre de tenant (`ppos-production`). Todo listado (`GET /`), fallback, detalle (`GET /:id`), creación (`POST /`), mutaciones (`/intake`, `/adjust`, `/reserve`, `/release`, `/consume`), reserve/release legacy y recepción exigen ámbito estricto. Centro ausente no equivale a acceso global: rechazo fail-closed (HTTP 403 `FORBIDDEN_UNAUTHORIZED_CENTER_ACCESS`). Registros legacy sin centro asignado fallan cerrado. | Pruebas de acceso sin centro (HTTP 403), rechazo de creación sin centro, restricción estricta de tenant `ppos-production` a sus propios centros/nodos sin bypass de materiales ajenos. | **IMPLEMENTED & VERIFIED (PASS)** |
| **3** | **HUELLA DE IDEMPOTENCIA & LEDGER**<br>Huella calculada solo sobre `requestBody` sin incorporar la cantidad efectiva recibida; clave no ligada al pedido; necesidad de rollback en fallos de ledger. | En `materialAvailabilityService.js`: la huella SHA-256 se calcula sobre el comando efectivo normalizado `{ procurement_id, tenant_id, printhouse_id, effective_quantity, request_body }`. La verificación de idempotencia precede a las validaciones de cantidad, garantizando que un payload con cantidad alterada y misma clave se rechaza con HTTP 409 `IDEMPOTENCY_PAYLOAD_MISMATCH`. Rollback garantizado ante fallos de lectura o inserción del ledger. | Pruebas en Describe 13 y 15: reutilización de clave para otro pedido (409), mismo requestBody con distinta `effectiveQuantity` (409), inyección separada de fallo en lectura del ledger y en inserción con verificación de rollback total. | **IMPLEMENTED & VERIFIED (PASS)** |
| **4** | **BLOQUEO FUNCIONAL: ACTOR SIN CENTRO**<br>Actor PRINTHOUSE_OPERATOR con tenant válido y `printhouseId=null` podía listar varios centros, consultar materiales, registrar intake y crear material enviando `node_id`. | En `src/api/routes/materialsAdmin.js` y `src/api/services/materialAvailabilityService.js`: se valida ámbito de centro estricto en servidor. Si el actor no es SUPER_ADMIN y carece de `printhouseId`, se deniega inmediatamente con HTTP 403 `FORBIDDEN_UNAUTHORIZED_CENTER_ACCESS`. Un `node_id` enviado en el cuerpo no acredita autorización de centro. Se eliminó la rama vacía en `getAllMaterials`. | 6 regresiones fail-closed dedicadas en Describe 16: 1) Listado con materiales de 2 centros del mismo tenant (HTTP 403); 2) Detalle de material con centro (HTTP 403); 3) Intake, adjust, consume (HTTP 403) sin alterar stock ni ledger; 4) Creación enviando node_id válido (HTTP 403); 5) Reserve/release legacy (HTTP 403); 6) Recepción de procurement sobre recursos con centro (HTTP 403). Comprobado que el estado de stock, reservas, órdenes y eventos no se altera. | **IMPLEMENTED & VERIFIED (PASS)** |
| **5** | **RUNNER/BOOTSTRAP CANÓNICO Y REUTILIZACIÓN DE AUTH**<br>Sustitución de DDL copiada y bucle particular de migraciones; reutilización de middleware de autenticación de producción. | 1) En `tests/security_paper_supplier_and_materials_isolation.test.js`: sustitución de DDL y bucle manual por llamada canónica a `runBootstrap()` (`scripts/bootstrap_canonical_schema.js`) + inicialización de ledgers + ejecución secuencial de migraciones oficiales (`139`, `140`, `141`, `162`) sobre esquema efímero exclusivo `TEST_MYSQL_*`. 2) En Describe 14: eliminación de hook onRequest duplicado, integrando directamente el módulo de producción `requireAdmin` (`src/api/middleware/auth.js`) sobre Fastify con puente Express. | Ejecución de suite de seguridad completa: 56/56 PASS en 14.6s contra MySQL real en contenedor. | **IMPLEMENTED & VERIFIED (PASS)** |
| **6** | **VALIDACIÓN INTEGRAL, BUILD Y DIAGNÓSTICOS TS**<br>Ejecución focalizada y regresión completa con desglose PASS/SKIP; build; integridad de migraciones; comparación de diagnósticos TS por contenido. | Suite focalizada: 56/56 tests PASS. Suite global con MySQL: 44 archivos / 720 tests PASS (0 fallos). Suite global sin credenciales: 44 archivos / 664 tests PASS, 56 SKIP limpio. Build: `npm run build` PASS (3567 módulos en 25.87s). Integridad: `npm run migration:integrity` PASS (165 migraciones, 0 colisiones). TypeScript: comparación por contenido de diagnósticos de `tsc --noEmit` contra línea base, verificando cero errores nuevos añadidos. | Evidencia completa registrada y reproducible. | **IMPLEMENTED & VERIFIED (PASS)** |


