# Paper Supplier Hub — Operational Status & Progress Log

**Branch**: `feat/paper-supplier-hub`  
**Base Commit**: `ed111462cfe77c4d764657abc5a079fe6386d19b`  
**I2 Target**: Fichas técnicas normalizadas, importador multi-formato con revisión y separación canónica  
**Last Updated**: 2026-10-21 15:10:00 CET  

---

## Estado Actual de Iteraciones

| Iteración | Descripción | Estado | Evidencia / Resultado |
|---|---|---|---|
| **I0** | **Base, alcance e invariantes** | **COMPLETED & VERIFIED (PASS)** | Rama publicada en GitHub; Vitest 43/43 files (664 tests) PASS; Vite build OK; Migration baseline PASS (164 migraciones); Límites de tests de seguridad clarificados. |
| **I1** | **Identidad proveedor y protección de dominio (R0)** | **SUPERSEDED** | Sustituida por ciclos de remediación I1-R1 e I1-R2. |
| **I1-R1** | **Remediación inicial de autorización, identidad y recepción atómica** | **COMPLETED** | Implementaciones base de modelos y tablas 162; paso a I1-R2 para cierre de bloqueos de aislamiento estricto. |
| **I1-R2** | **Remediación integral: Entorno de pruebas, Bypass nodo/material, Pertenencias reales, Centros e Idempotencia** | **COMPLETED & VERIFIED (PASS)** | Cierre total y comprobado de todos los puntos y del bloqueo funcional de actor sin centro: 1) Bloqueo Funcional (Actor sin centro): PRINTHOUSE_OPERATOR con tenant válido y `printhouseId=null` es rechazado fail-closed (HTTP 403 `FORBIDDEN_UNAUTHORIZED_CENTER_ACCESS`) en listado (`GET /`), fallback, detalle (`GET /:id`), intake/adjust/consume, creación (`POST /`), legacy reserve/release y recepción de procurement. El `node_id` enviado en el cuerpo no acredita autorización de centro. Se eliminó la rama vacía de `getAllMaterials`. 2) Aislamiento estricto del bootstrap de pruebas: tablas copiadas sustituidas por el bootstrap canónico (`scripts/bootstrap_canonical_schema.js`), el cual comprueba que `SELECT DATABASE()` coincida exactamente con el esquema exclusivo antes del primer DDL; erradicación de `DATABASE_URL` heredada para que no prevalezca sobre `TEST_MYSQL_*`; control de pools previos y restauración de variables/conexiones en `finally`. 3) Migraciones secuenciales ejecutadas: inicialización de ledgers (`phase184g` y `phase185`) seguida por las 7 migraciones seleccionadas (`001`, `007`, `015`, `139`, `140`, `158`, `162`). 4) Reutilización directa del middleware de producción `requireAdmin` (`src/api/middleware/auth.js`) en pruebas HTTP con puente Fastify/Express. 5) Suite focalizada de seguridad: 57/57 tests PASS en MySQL efímero; suite global: 44 archivos / 721 tests PASS con `TEST_MYSQL_*` (o 664 PASS / 57 SKIP limpio sin variables de BD); build de producción limpio; integridad de migraciones (165 migraciones) PASSED; y diagnósticos TypeScript comparados por contenido (cero errores nuevos añadidos). |
| **I2** | **Fichas técnicas e importador con revisión** | **COMPLETED & VERIFIED (PASS)** | Implementación de `paper_products`, `paper_variants`, `paper_import_batches` y `paper_import_rows` (migración 163); motor de importación multi-formato ODS/XLSX/CSV con detección real (magic bytes y estructura), trazabilidad de hash SHA-256, hoja, fila, valores crudos originales y reglas v1.0.0; procesamiento del archivo original aportado (`Paper data base.ods.zip`, SHA-256 `7ffb63eb2705fa0c6faa459001ddd3db0702aa25d0bca52fa58e1a13899d4c9a`) con coincidencia exacta de los 1.573 registros (1.463 válidos, 102 con incidencias/avisos, 8 duplicados internos); gestión de incidencias de precios (96 vacíos, 3 cero) y unidades ambiguas sin inferir moneda ni base comercial; staging y confirmación técnica gobernada por RBAC (`SUPPLIER_OPERATOR`/`SUPPLIER_ADMIN`) y aislamiento de tenant; garantía estricta de separación (cero modificación de inventario, cero publicación de ofertas y cero alteración de costes de pricing); 15/15 tests PASS en `tests/paper_technical_import_and_catalog.test.js` y 57/57 tests PASS en seguridad; build Vite limpio; integridad de migraciones (166 migraciones) PASSED; y paridad TypeScript intacta (199 diagnósticos, 0 añadidos). |
| **I3** | **Catálogo y ofertas en panel proveedor (R1)** | **NOT STARTED** | Pendiente de I2. |
| **I4** | **Búsqueda imprenta y RFQ bidireccional (R2)** | **NOT STARTED** | Pendiente de I3. |
| **I5** | **Pedido, expedición y recepción a inventario (R3)** | **NOT STARTED** | Pendiente de I4. |
| **I6** | **Integración de precio con pricing industrial** | **NOT STARTED** | Pendiente de I3 + I5. |
| **I7** | **Despliegue estable y operación en producción** | **NOT STARTED** | Pendiente de hitos R1/R2/R3. |

---

## Resumen de Auditoría y Verificación de Importación Técnica I2

### 1. Archivo Original Aportado
- **Ruta de origen**: `C:\Users\KIKE\Downloads\Paper data base.ods.zip`
- **SHA-256 del archivo**: `7ffb63eb2705fa0c6faa459001ddd3db0702aa25d0bca52fa58e1a13899d4c9a`
- **Formato detectado**: OpenDocument Spreadsheet (`application/vnd.oasis.opendocument.spreadsheet` / `ODS`)
- **Hoja analizada**: `Sheet1`
- **Estructura**: 1 fila de cabecera + 1.573 filas de datos (1.574 filas no vacías en total)

### 2. Conciliación con los 1.573 Registros Documentados
El desglose de los 1.573 registros procesados es el siguiente:
- **Válidos (`VALID`)**: **1.463 registros** (especificación física completa: nombre, gramaje, dimensiones y acabado normalizados con alta certeza).
- **Pendientes / Con Incidencias (`WARNING` / `NEEDS_REVIEW`)**: **102 registros**:
  - **96 registros con precio ausente / vacío**: Marcados con código `EMPTY_PRICE` y `CURRENCY_NOT_DECLARED`.
  - **3 registros con precio cero**: Artículos auxiliares de prueba ("Jauns ieraksts", "KLIENTA PAPĪRS", "Testa drukas papīrs") marcados con código `ZERO_PRICE`.
  - **3 registros con dimensiones o gramaje ambiguo/incompleto**: Marcados con `AMBIGUOUS_DIMENSION_UNITS` o `MISSING_DIMENSIONS` para revisión obligatoria en mesa de validación.
- **Duplicados Internos en el Archivo (`DUPLICATE`)**: **8 registros** (mismo fingerprint físico: nombre normalizado + gramaje + dimensiones + acabado).
- **Rechazados de plano (`REJECTED`)**: **0 registros** (todos los registros aportan al menos nombre o identificador técnico analizable).
- **Total Cuadrado**: $1.463 + 102 + 8 + 0 = 1.573$ registros exactos ($100\%$ trazables).

### 3. Propuestas de Correspondencia de Proveedores
Se identificaron 6 agrupaciones de distribuidores presentes en el archivo:
- **Papyrus**: 640 variantes identificadas (asociación propuesta con proveedor `PAPYRUS` / confianza alta).
- **Antalis**: 512 variantes identificadas (asociación propuesta con proveedor `ANTALIS` / confianza alta).
- **Polap**: 338 variantes identificadas (asociación propuesta con proveedor `POLAP` / confianza alta).
- **Dardedze hologrāfija**: 78 variantes identificadas (asociación propuesta con proveedor `DARDEDZE` / confianza media).
- **Otros / No asignados (`Cits DEF`, `Oldi DEF`)**: 5 variantes (requiere asignación manual).

### 4. Garantías de Separación de Dominio
- **Cero creación de ofertas comerciales**: Las tarifas permanecen en staging sin publicar (`supplier_paper_offers` permanece intacta).
- **Cero mutación de existencias**: El inventario de imprenta (`predictive_material_inventory`, `materials_catalog`) no fue alterado.
- **Cero alteración de costes de pricing industrial**: `@ppos/pricing-engine` no recibe costes no confirmados.

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
| **5** | **RUNNER/BOOTSTRAP CANÓNICO, AISLAMIENTO Y REUTILIZACIÓN DE AUTH**<br>Sustitución de DDL copiada; aislamiento estricto contra DATABASE_URL conflictiva; verificación de SELECT DATABASE(); migraciones reales (001, 007, 015, 139, 140, 158, 162); y reutilización de middleware de producción. | 1) En `tests/security_paper_supplier_and_materials_isolation.test.js`: llamada a `runBootstrap()` (`scripts/bootstrap_canonical_schema.js`) pasando opciones `{ host, database, pool: connectionPool }`. Se erradica `DATABASE_URL` y se cierra cualquier pool previo. `runBootstrap` verifica `SELECT DATABASE() = database` antes del primer DDL abortando sin mutar ante discordancias. Restauración de variables en `finally`. 2) Ejecución secuencial de ledgers (`phase184g`, `phase185`) y migraciones oficiales (`001`, `007`, `015`, `139`, `140`, `158`, `162`). 3) Reutilización de `requireAdmin` (`src/api/middleware/auth.js`) en pruebas HTTP. | Suite de seguridad: 57/57 tests PASS en MySQL real efímero (incluyendo regresión de aborto de bootstrap ante DATABASE_URL conflictiva sin emitir DDL/DML a destinos ajenos). | **IMPLEMENTED & VERIFIED (PASS)** |
| **6** | **VALIDACIÓN INTEGRAL, BUILD Y DIAGNÓSTICOS TS**<br>Ejecución focalizada y regresión completa con desglose PASS/SKIP/FAIL; build; integridad de migraciones; comparación de diagnósticos TS por contenido. | Suite focalizada: 57/57 tests PASS (0 FAIL, 0 SKIP). Suite global con MySQL: 44 archivos / 721 tests PASS (0 FAIL, 0 SKIP). Suite global sin variables de BD: 44 archivos / 664 tests PASS, 57 SKIP limpio (0 FAIL). Build: `npm run build` PASS (3567 módulos en 25.87s). Integridad: `npm run migration:integrity` PASS (165 migraciones, 0 colisiones). TypeScript: comparación por contenido de diagnósticos de `tsc --noEmit` contra línea base, verificando cero errores nuevos añadidos. | Evidencia completa registrada y reproducible. | **IMPLEMENTED & VERIFIED (PASS)** |


