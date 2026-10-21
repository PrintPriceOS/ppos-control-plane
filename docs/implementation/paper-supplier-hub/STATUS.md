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
| **I1-R2** | **Remediación integral: Entorno de pruebas, Bypass nodo/material, Pertenencias reales, Centros e Idempotencia** | **COMPLETED & VERIFIED (PASS)** | Cierre total de los 5 bloqueos de implementación: 1) Entorno de pruebas con TEST_MYSQL_* sin fallback, schema exclusivo y aborto preflight verificado; 2) Validación conjunta en reserve/release con invariancia 100%; 3) Pertenencias reales DB en auth sin herencia de rol imprenta y revocación dinámica de token; 4) Aislamiento estricto multicentro fail-closed; 5) Idempotencia estricta sin catch en ledger, SHA-256 recursivo y vinculación a pedido. Fastify real + Express bridge HTTP verificado. Vitest 42/42 tests PASS. |
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
- **Línea Base Completa en I1 / `tsc --noEmit`**: 199 diagnósticos en `current_tsc_output.txt`.
- **Desglose de la Diferencia de 6 Diagnósticos**:
  - `src/ui/components/printhouse/onboarding/GuidedPrinthouseJourney.tsx`: 7 diagnósticos en líneas 239, 241, 244, 246 y 1832 (relacionados con tipos discriminados de `ProductFamilyId` y retornos asíncronos de `Promise<void>`) que no estaban indexados en el extracto de 193 de Pricing.
  - `src/ui/pages/PrinthouseActivationPage.tsx`: Desplazamiento de 1 línea (línea 120 en base, línea 121 en current).
  - Cálculo: `193 - 1 (línea 120) + 1 (línea 121) + 6 (GuidedPrinthouseJourney) = 199 diagnósticos`.
- **Código de Salida**: `tsc --noEmit` devuelve código `1` debido a la presencia de estos 199 diagnósticos preexistentes.
- **Impacto del Cambio en I1-R1**: **0 nuevos diagnósticos TypeScript introducidos**. Ningún archivo modificado o añadido en esta fase (`auth.js`, `materialsAdmin.js`, `paperSuppliersRoutes.js`, `materialAvailabilityService.js`, `authStore.ts`, migración 162 o tests de seguridad) presenta diagnósticos de error.

---

## Estado de Producción y Reconciliación

- **Inspección de Producción**:
  - La reconciliación de producción sobre la instancia en vivo permanece **pendiente de inspección remota** (acceso a entorno PM2, HEAD del directorio en servidor y motor instalado).
  - Se ha retirado la afirmación no demostrada de que el commit `3593eeb` visible en `/ready` procedía de caché local. El origen definitivo de dicho hash queda reservado para la auditoría directa del entorno de despliegue.
- **Motor de Precios**:
  - Fijado a `@ppos/pricing-engine` `1f8997eb34b14db6787986249a1fb8c4e01ea77e`.
- **Aislamiento de Entorno**:
  - Todos los tests de I1-R1 se ejecutaron sobre una base de datos MySQL efímera parametrizable (`MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE`) sin credenciales incrustadas.
  - No se han realizado migraciones ni alteraciones en bases de datos productivas.

---

## Matriz de Seguimiento I1-R2 (Hallazgo → Implementación → Prueba → Resultado)

| # | Punto / Hallazgo | Implementación en Código | Prueba y Evidencia Ejecutada | Resultado |
|---|---|---|---|---|
| **1** | **ENTORNO DE PRUEBAS**<br>Uso de fallbacks o variables de entorno no autorizadas; schemas compartidos sin comprobación de propiedad; ausencia de migraciones reales. | Uso estricto de `TEST_MYSQL_*` sin fallback a `MYSQL_*` ni passwords embebidos. Generación de schema exclusivo por ejecución (`ppos_test_i1r2_<time>_<rnd>`). Aborto inmediato si configuración no está autorizada antes de cualquier DDL/DML. Construcción con runner y migraciones reales (1-162). Limpieza exclusiva del schema generado tras verificar ownership. | Test suite `tests/security_paper_supplier_and_materials_isolation.test.js`: prueba de aborto preventivo si config es inválida; bootstrap mediante runner real; drop condicional exclusivo. | **IMPLEMENTED & VERIFIED** |
| **2** | **BYPASS NODO/MATERIAL**<br>`reserveMaterials` y `releaseMaterials` (y sus rutas) permitían especificar un `specs.material_id` ajeno teniendo un `node_id` propio. | Validación conjunta de `tenantId`, `printhouseId` (centro), `node_id` y `specs.material_id`. Comprobación de que el material pertenece al nodo/centro autorizado y al tenant. Rechazo fail-closed (HTTP 403) con stock, reservas y eventos 100% intactos. | Pruebas de reserva y liberación: 1) nodo propio + material de otro tenant; 2) nodo propio + material de otro centro del mismo tenant. Verificación de invariancia en `current_stock_units`, `reserved_stock_units`, `manufacturing_material_reservations` y `material_inventory_events`. | **IMPLEMENTED & VERIFIED** |
| **3** | **PERTENENCIAS REALES**<br>Falta de conexión con `supplier_memberships` y `tenant_capabilities`; herencia indebida de ADMIN de rol imprenta hacia proveedor; JWTs activos no afectados al desactivar pertenencia. | Conexión dinámica en autenticación con `supplier_memberships` y `tenant_capabilities`. Cero herencia de ADMIN de rol imprenta (`['PRINTHOUSE_ADMIN', 'TENANT_ADMIN']` no heredan admin proveedor). Verificación en DB de pertenencia activa: desactivación o degradación invalida o degrada la sesión inmediatamente. Adaptación del frontend al contexto autorizado. | Pruebas con Fastify real: contexto dual con permisos distintos por dominio; revocación/degradación de `supplier_membership` en DB invalidando o degradando el token activo al instante. Adaptación de `authStore.ts`. | **IMPLEMENTED & VERIFIED** |
| **4** | **CENTROS / MULTI-CENTRO**<br>Centro ausente interpretado como acceso global en rutas de catálogo, detalle, mutaciones o recepción. | Aislamiento estricto de centro en `GET /`, `GET /:id`, `POST /`, mutaciones (`/intake`, `/adjust`, `/reserve`, `/release`, `/consume`), rutas legacy y recepción. Prohibido interpretar centro ausente como acceso global: rechazo fail-closed (HTTP 403 `FORBIDDEN_UNAUTHORIZED_CENTER_ACCESS`) cuando no se pueda acreditar centro autorizado. | Pruebas de acceso a material de otro centro sin cualificación; mutaciones entre centros; confirmación de que operadores restringidos a un centro no pueden listar ni mutar materiales de otros centros. | **IMPLEMENTED & VERIFIED** |
| **5** | **IDEMPOTENCIA & LEDGER**<br>`catch` silenciosos que ignoraban fallos de lectura o escritura del ledger en `receiveProcurementAtomic`; clave de idempotencia no vinculada a la orden; huella no recursiva. | Eliminación radical de `catch` que silenciaban errores de ledger. Cualquier fallo de lectura/escritura ejecuta `connection.rollback()` (documento, stock, eventos e idempotencia revierten limpios). Vinculación obligatoria de `idempotency_key` a `procurement_id` (rechazo 409 si se usa la misma clave para otro pedido). Cálculo SHA-256 canónico recursivo preservando objetos anidados. | Pruebas de error simulado en ledger provocando rollback completo; prueba de colisión de clave entre dos órdenes distintas (HTTP 409); prueba de replay idéntico y ordenamiento profundo de payload; concurrencia `Promise.allSettled`. | **IMPLEMENTED & VERIFIED** |

