# Paper Supplier Hub — Architecture & Domain Decisions (ADR)

## ADR 001: Separación Tripartita de Dominio (Ficha Técnica, Oferta de Proveedor, Inventario de Imprenta)
- **Contexto**: Anteriormente el catálogo de materiales en `materials_catalog` mezclaba la especificación física del papel con el proveedor y el inventario del nodo.
- **Decisión**: Separar estrictamente en tres entidades:
  1. `paper_products` / `paper_variants`: Fichas canónicas puramente físicas (gsm, dimensiones, acabado, grano, etc.).
  2. `supplier_paper_offers` / `supplier_paper_offer_revisions`: Catálogo comercial de cada proveedor con precio, moneda, MOQ, tramos y vigencia.
  3. `materials_catalog` / `predictive_material_inventory`: Inventario interno privado de cada imprenta.
- **Consecuencia**: Una oferta comercial nunca altera el inventario de una imprenta sin un flujo explícito de orden de compra y recepción en muelle/almacén.

---

## ADR 002: Modelo de Autorización para Proveedores Desacoplado de Jerarquía Numérica
- **Contexto**: `ROLE_HIERARCHY` en `src/api/middleware/auth.js` asigna niveles numéricos (`PRINTHOUSE_ADMIN`: 50, `SUPER_ADMIN`: 100). Asignar un nivel numérico a `SUPPLIER_ADMIN` provocaría que heredase permisos de imprenta o de administración general si se evaluara con `minLevel >= 50`.
- **Decisión**: Los roles de proveedor (`SUPPLIER_ADMIN`, `SUPPLIER_OPERATOR`, `SUPPLIER_VIEWER`) no se mezclan en la escala numérica de imprenta. Tendrán un guard específico `requireSupplierScope()` y capacidades basadas en pertenencia a la organización proveedora (`paper_suppliers`).
- **Consecuencia**: Un usuario de proveedor tiene acceso estricto a `/api/v1/paper-suppliers/*` y es rechazado con HTTP 403 en `/api/admin/*` y rutas operativas de imprenta.

---

## ADR 003: Recepción Idempotente y Transaccional de Suministros
- **Contexto**: El método actual `receiveProcurement` en `materialAvailabilityService.js` no usa transacciones SQL con bloqueo de fila (`SELECT ... FOR UPDATE`), lo que expone a condiciones de carrera concurrentes y posible doble cómputo de existencias.
- **Decisión**: Todo flujo de recepción requiere:
  1. Clave de idempotencia única `receipt_key` por evento.
  2. Transacción atómica MySQL (`START TRANSACTION ... COMMIT`) con `FOR UPDATE` sobre la orden y la fila de inventario.
  3. Incremento exclusivo de cantidades verificadas y aceptadas, registrando simultáneamente el evento en `material_inventory_events`.
- **Consecuencia**: Fallos de base de datos revierten íntegramente la recepción, el documento y el inventario. Peticiones repetidas devuelven el resultado previo sin alterar el stock.

---

## ADR 004: Gobernanza del Archivo `Paper data base.ods.zip` y Mapeo de Catálogo
- **Contexto**: El archivo recibido contiene 1.573 registros con etiquetas de proveedor (`Antalis DEF`, `Polap DEF`, etc.), categorías mixtas, dimensiones en cm y mm, 96 precios vacíos y 3 precios cero, sin moneda explícita declarada.
- **Decisión**:
  1. El archivo binario original se mantiene estrictamente fuera del repositorio Git.
  2. No se asume que las 6 etiquetas sean organizaciones registradas o verificadas en PrintPrice.
  3. No se publican ofertas comerciales ni se asumen monedas por defecto.
  4. Los precios sin base o moneda confirmada permanecen en estado `UNPRICED` / `NEEDS_REVIEW`.
- **Consecuencia**: Cero publicaciones accidentales o tarifas gratuitas (precios cero) en producción.

---

## ADR 005: Modelo de Datos para Ofertas Comerciales y Revisiones Versionadas (Fase I3)
- **Contexto**: Las variantes físicas (`paper_variants`) representan la ficha técnica canónica. Los proveedores fijan precios en distintas bases (`KG`, `TONNE`, `SHEET`, `THOUSAND_SHEETS`, `PACK`) con MOQ, múltiplos, vigencia, cobertura territorial y visibilidad (`PRIVATE`, `APPROVED_CUSTOMERS`, `MARKETPLACE`). Los cambios de tarifas deben mantener trazabilidad histórica sin sobreescribir auditoría previa.
- **Decisión**:
  1. Crear la tabla `supplier_paper_offers` con clave foránea a `paper_variants(id)` y `paper_suppliers(id)` con ámbito `tenant_id`.
  2. Implementar `supplier_paper_offer_revisions` que almacena cada cambio de tarifa/condición con número de revisión incremental (`revision_number`), datos de pricing, notas de cambio y `created_by`.
  3. Validar estrictamente los datos requeridos por base:
     - `PACK`: requiere `sheets_per_pack` entero positivo.
     - `SHEET`, `THOUSAND_SHEETS`, `KG`, `TONNE`: exigen conversión y datos dimensionales coherentes.
     - `currency`: ISO 4217 de 3 letras obligatorio; sin valores por defecto asumidos.
  4. Estado de oferta: `ACTIVE`, `INACTIVE`, `ARCHIVED`.
- **Consecuencia**: Historial inmutable de condiciones comerciales, separación total entre variantes físicas y contratos de venta.

---

## ADR 006: Matriz de Visibilidad y Reglas de Autorización de Ofertas (Fase I3)
- **Contexto**: Los proveedores necesitan segmentar a quién muestran sus tarifas: solo para ellos mismos (`PRIVATE`), para imprentas autorizadas (`APPROVED_CUSTOMERS`), o público para el hub (`MARKETPLACE`).
- **Decisión**:
  1. Visibilidad parametrizada a nivel de oferta (`visibility`: `PRIVATE`, `APPROVED_CUSTOMERS`, `MARKETPLACE`).
  2. Las consultas y mutaciones se filtran por `tenant_id` y `supplier_id` resueltos desde el token en el servidor mediante `requireSupplierScope()` y `requireApprovedSupplier`.
  3. Roles y permisos:
     - `SUPPLIER_ADMIN` y `SUPPLIER_OPERATOR`: lectura y escritura (crear, editar, activar, desactivar ofertas).
     - `SUPPLIER_VIEWER`: solo lectura (`GET`). Cualquier mutación (`POST`, `PUT`, `PATCH`, `DELETE`) es rechazada con HTTP 403 `FORBIDDEN_WRITE_PERMISSION_REQUIRED`.
     - Proveedores con estado distinto de `ACTIVE` (e.g. `SUSPENDED`, `PENDING_REVIEW`): bloqueados fail-closed por `requireApprovedSupplier`.
- **Consecuencia**: Garantía estricta de aislamiento multitenant y principio de mínimo privilegio.

---

## ADR 007: Unicidad de SKU por Proveedor y Trazabilidad Comercial en Revisiones (Remediación I3)
- **Contexto**: Anteriormente el índice de SKU era no único a nivel de motor de BD (`KEY idx_supplier_sku`), lo que permitía colisiones de SKU ante concurrencia. Además, las revisiones inmutables omitían el SKU, impidiendo reconstruir la oferta exacta en auditorías históricas.
- **Decisión**:
  1. Forzar unicidad a nivel de motor en `supplier_paper_offers` con `UNIQUE KEY uk_supplier_sku_active (supplier_id, supplier_sku)` en la migración 164.
  2. Almacenar `supplier_sku` de forma inmutable en `supplier_paper_offer_revisions`.
  3. En `paperOfferService.js`, capturar colisiones de BD (`ER_DUP_ENTRY` / MySQL 1062) y mapear a HTTP 409 `SKU_ALREADY_EXISTS`.
- **Consecuencia**: Integridad referencial inviolable en base de datos frente a condiciones de carrera concurrentes y reconstrucción histórica perfecta de ofertas.

---

## ADR 008: Cliente HTTP Específico para Proveedores y Preservación de Códigos de Error (Remediación I3)
- **Contexto**: El cliente genérico `adminFetch` convertía ciertos fallos en respuestas con `ok: true` sintético o aplicaba backoffs que simulaban mutaciones exitosas.
- **Decisión**:
  1. Crear `paperSupplierFetch` y `SupplierApiError` en `src/ui/lib/paperSupplierApi.ts` exclusivamente para el Hub de Proveedores.
  2. Preservar íntegramente códigos HTTP (400, 403, 404, 409, 500) y estructuras de error del servidor sin enmascaramiento.
  3. En importación, validar el éxito de los `PATCH` de overrides antes de proceder a la confirmación de lote.
- **Consecuencia**: La interfaz nunca anuncia confirmación tras un rechazo del servidor ni pierde trazabilidad de fallos.

---

## ADR 009: Transición de Datos, Semántica de Retirada, Techo de Lote y Reversión Segura (Migración 165)
- **Contexto**: La migración 165 introdujo `supplier_paper_catalog_variants` y la columna `deleted_at` en `supplier_paper_offers` para soportar ciclo de vida de catálogo a nivel de proveedor y soft-delete de ofertas con preservación de revisiones históricas.
- **Decisión**:
  1. **Backfill Idempotente Basado en Relaciones Reales**:
     - Las asociaciones preexistentes se derivan exclusivamente de:
       a) Lotes de importación confirmados (`paper_import_rows` con `mapped_variant_id` y `paper_import_batches` con `status = 'CONFIRMED'`).
       b) Ofertas comerciales existentes (`supplier_paper_offers` con `variant_id IS NOT NULL`).
     - Se utiliza `INSERT IGNORE` con identificadores deterministas `spcv_<md5(supplier_id:variant_id)>`. Jamás se asigna el catálogo global de forma indiscriminada.
     - Si una asociación ya fue marcada como `ARCHIVED` o retirada (`deleted_at IS NOT NULL`), re-ejecutar el backfill o confirmar nuevos lotes preserva estrictamente el estado y nunca reactiva silenciosamente a `ACTIVE`.
  2. **Semántica de Retirada y Retención de SKU**:
     - Las ofertas con `deleted_at IS NOT NULL` quedan congeladas e inmutables: rechazadas con HTTP 409 `OFFER_RETIRED` ante cualquier intento de edición (`PUT /offers/:id`), cambio de estado (`PATCH /offers/:id/status`), o actualización masiva (`PATCH /offers/bulk-status` con `ACTIVATE` o `RESTORE`).
     - Quedan omitidas de listados operativos (`listSupplierOffers`) y del conteo de ofertas activas en el catálogo técnico (`getTechnicalCatalog`).
     - El SKU comercial permanece retenido y protegido por la restricción `UNIQUE KEY uk_supplier_sku_active (supplier_id, supplier_sku)` incondicional del motor MySQL. La recuperación de una oferta retirada no está habilitada por endpoints estándar para evitar violaciones de trazabilidad.
     - La retirada de una variante técnica (`withdrawSupplierCatalogVariants`) retira en cascada lógica sus ofertas propias preservando el 100% de revisiones. La repetición de la operación o de `deleteOffer` es idempotente y devuelve `alreadyRetired: true` sin duplicar revisiones terminales.
  3. **Límite Exacto de Operaciones Masivas (Ceiling de 500 ítems)**:
     - Se fija `MAX_BULK_OPERATION_LIMIT = 500` tanto para ofertas como para variantes de catálogo.
     - Si el alcance `ALL_MATCHING` coincide con más de 500 registros, la previsualización bloquea la acción (`canProceed: false`, `blockedCount = totalMatches`), y cualquier intento de ejecución directa aborta lanzando `EXCEEDS_MAX_BATCH_LIMIT`. Queda prohibido el procesamiento parcial silencioso.
  4. **Precisión Técnica sobre `ON DELETE CASCADE`**:
     - El DDL de `supplier_paper_offer_revisions` conserva `CONSTRAINT fk_offer_revision_offer ... ON DELETE CASCADE`.
     - La protección de historial no reside en haber eliminado esa FK del DDL, sino en la salvaguarda de la capa de aplicación (`deleteOffer`), que intercepta la eliminación física cuando existen revisiones auditables y ejecuta un borrado lógico (`deleted_at = CURRENT_TIMESTAMP`), evitando que el motor active la cascada física.
  5. **Procedimiento de Reversión Segura (Pre-escrituras vs Post-escrituras)**:
     - **Pre-escrituras**: `DROP TABLE supplier_paper_catalog_variants` y `ALTER TABLE supplier_paper_offers DROP COLUMN deleted_at` solo es inocuo si la funcionalidad nunca recibió escrituras.
     - **Post-escrituras**: Tras operar, ejecutar `DROP TABLE` o `DROP COLUMN` es destructivo (elimina asociaciones de proveedor y marcas de retirada). Si el código retrocediera a una versión que ignore `deleted_at`, las ofertas retiradas con `status = 'ARCHIVED'` podrían reactivarse comercialmente vía `RESTORE`. La estrategia prioritaria y recomendada es **corrección hacia delante (roll-forward)** conservando el esquema y la compatibilidad hacia atrás.
- **Consecuencia**: Transición de datos 100% determinista, integridad referencial y de auditoría inviolable, y eliminación de riesgos de pérdida de datos en reversión.

