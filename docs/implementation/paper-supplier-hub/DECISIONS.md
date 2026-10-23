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

## ADR 010: Alcance de Variantes Sin Asociación, Incorporación Explícita y Modificación Pre-Despliegue de Migración 165

- **Fecha**: 2026-10-23
- **Estado**: Aceptado
- **Contexto**:
  En el candidato `656d587b2f4e99c557f86f4b67e8c2200bdc32d3`, el catálogo técnico devolvía variantes sin asociación con `supplierCatalogStatus: r.catalog_status || 'ACTIVE'`, presentándolas como integrantes activos del catálogo propio del proveedor en lugar de "No incorporadas". Adicionalmente, las acciones masivas con alcance `ALL_MATCHING` o selección directa en endpoints de archivo/retirada utilizaban `INSERT ... ON DUPLICATE KEY UPDATE`, creando asociaciones involuntarias con variantes globales ajenas como efecto secundario. Asimismo, la migración 165 fue modificada in-tree antes de su primer despliegue a producción añadiendo el backfill de relaciones reales.
- **Decisión**:
  1. **Estado Explícito 'UNASSOCIATED' para Variantes Globales Sin Relación**:
     - Las variantes de la tabla global `paper_variants` sin registro correspondiente en `supplier_paper_catalog_variants` son plenamente consultables para descubrimiento técnico, pero devuelven de forma obligatoria `supplierCatalogStatus: 'UNASSOCIATED'` e `isCatalogAssociated: false`.
     - En la interfaz de usuario (`SupplierCatalogOffersPage.tsx`), se presentan con badge "No incorporada", quedan excluidas del checkbox maestro de selección para ofertas o acciones masivas de catálogo, y exponen la acción explícita "Incorporar al catálogo".
  2. **Acotamiento Estricto de `ALL_MATCHING` al Catálogo del Proveedor**:
     - Las operaciones masivas (`ARCHIVE`, `RESTORE`, `WITHDRAW`) con alcance `ALL_MATCHING` filtran de forma incondicional por `associatedOnly: true` (y `catalogStatus` acorde a la acción).
     - Las variantes globales ajenas o no incorporadas quedan 100% fuera del barrido.
     - Las acciones `archiveSupplierCatalogVariants`, `restoreSupplierCatalogVariants` y `withdrawSupplierCatalogVariants` ejecutan exclusivamente `UPDATE` sobre asociaciones existentes; si una variante no está asociada al proveedor, devuelven error granular `VARIANT_NOT_ASSOCIATED` sin realizar `INSERT` ni generar asociaciones como efecto secundario.
  3. **Incorporación Explícita y Blindaje de Especificaciones Compartidas**:
     - La incorporación de una variante global al catálogo propio requiere una acción explícita y autorizada: `POST /api/v1/paper-suppliers/catalog/variants/:variantId/incorporate` (restringida a `SUPPLIER_ADMIN` o `SUPPLIER_OPERATOR`).
     - Dicha incorporación concede derecho a gestionar ofertas comerciales propias para esa variante, pero **NO concede permiso para modificar ni eliminar la ficha técnica compartida**.
     - Cualquier intento de `PATCH /catalog/variants/:id` o `DELETE /catalog/variants/:id` sobre una variante incorporada o compartida con otros proveedores se rechaza con HTTP 403/409 (`SHARED_VARIANT_MUTATION_RESTRICTED` / `CANNOT_DELETE_SHARED_VARIANT` / `NOT_VARIANT_ORIGINATOR`), preservando intactas las especificaciones físicas globales.
  4. **Modificación Pre-Despliegue de la Migración 165 y Protocolo para Entornos Persistentes**:
     - La migración `165_phase196d_paper_supplier_offer_soft_delete_and_catalog_associations.sql` fue modificada in-tree antes de su primer despliegue a producción (pasó de 28 líneas que creaban la tabla vacía a 60 líneas que incluyen el backfill idempotente derivado de lotes y ofertas reales).
     - **Advertencia crítica para entornos persistentes**: Si algún entorno persistente (staging, pre-producción o entorno de desarrollo de larga duración) ya aplicó la versión inicial de 28 líneas, el runner de migraciones ya habrá registrado la migración 165 en `schema_migrations`.
     - Actualizar el checksum en `migration-integrity-baseline.json` solo satisface la validación estática de integridad del repositorio, pero **no re-ejecuta la migración en una base de datos donde ya figure como aplicada**.
     - Dichos entornos persistentes requieren la aplicación de una migración secuencial posterior (o la ejecución manual del bloque de backfill DML) para sincronizar las filas de `supplier_paper_catalog_variants`.
- **Consecuencia**: Aislamiento multi-proveedor robusto, cero contaminación lateral de catálogos en operaciones masivas, inmutabilidad de fichas técnicas compartidas y claridad operativa sobre la aplicación de migraciones en entornos preexistentes.

---

## ADR 011: Ciclo de Vida de Pedidos de Aprovisionamiento, Contratos RFQ e Inmutabilidad de Instantánea Comercial (Fases I4 & I5)
- **Fecha**: 2026-10-23
- **Estado**: Aceptado
- **Contexto**:
  La interacción entre imprentas y proveedores de papel requería un ciclo gobernado para órdenes directas (`ORDER`) y solicitudes de cotización (`RFQ`), donde:
  a) Una alteración posterior de la oferta del proveedor no altere jamás el precio, especificaciones ni condiciones acordadas en un pedido existente.
  b) Las solicitudes de cotización (RFQ) permitan al proveedor presentar precios y fechas de validez personalizadas, las cuales la imprenta puede aceptar formalmente convirtiendo la RFQ en orden en firme.
- **Decisión**:
  1. **Tablas de Aprovisionamiento y Recibos (`migrations/166_phase196e_supplier_paper_procurement_orders.sql`)**:
     - `supplier_paper_procurement_orders`: Encabezado y contrato del pedido/RFQ con campos inmutables de snapshot técnico (`snapshot_product_name`, `snapshot_gsm`, `snapshot_width_mm`, `snapshot_height_mm`, `snapshot_finish`, `snapshot_caliper_microns`, `snapshot_grain_direction`) y financiero (`snapshot_price_per_basis`, `snapshot_pricing_formula`, `currency`, `total_amount`).
     - `supplier_paper_order_receipts`: Libro mayor de recepciones físicas atómicas con `receipt_key` idempotente.
  2. **Máquina de Estados Unificada**:
     - Para `ORDER`: `SUBMITTED` -> `CONFIRMED` -> `DISPATCHED` -> `DELIVERED` -> `PARTIALLY_RECEIVED` -> `RECEIVED` (o `REJECTED`/`CANCELLED`).
     - Para `RFQ`: `SUBMITTED` -> `QUOTED` -> `CONFIRMED` (tras aceptación explícita de la imprenta con verificación de expiración de `quote_valid_until`).
  3. **Inmutabilidad y Preservación de Contrato**:
     - Las modificaciones, desactivaciones o re-indexaciones de `supplier_paper_offers` posteriores a la colocación del pedido NO alteran la instantánea contractual.
- **Consecuencia**: Seguridad jurídica y técnica entre imprentas y proveedores, prevención de desajustes contables y auditoría 100% inmutable.

---

## ADR 012: Entrada Idempotente en Inventario Físico con Verificación Multi-Unidad y Auto-Aprovisionamiento Predictivo (Fase I5)
- **Fecha**: 2026-10-23
- **Estado**: Aceptado
- **Contexto**:
  Al ingresar físicamente papel en la planta de la imprenta, el sistema debe registrar albaranes parciales o totales sin permitir sobre-recepciones, integrando concurrentemente `materials_catalog`, `predictive_material_inventory` y el ledger de auditoría `material_inventory_events`.
- **Decisión**:
  1. **Idempotencia Estricta con Verificación Previa (`receipt_key`)**:
     - La verificación de `receipt_key` preexistente se evalúa antes de verificar el estado del pedido, garantizando que un reintento idempotente de red sobre un pedido ya `RECEIVED` responda con éxito ({ alreadyProcessed: true }) sin arrojar excepciones de balance agotado.
  2. **Guarda Anti Sobre-Recepción**:
     - Bloqueo estricto con prefijo `RECEIPT_EXCEEDS_ORDERED_QUANTITY:` si la suma de hojas o volumen recepcionado supera la cantidad contratada.
  3. **Auto-Aprovisionamiento Canónico en Inventario**:
     - Si el material no existía previamente en la planta, `predictive_material_inventory` se aprovisiona automáticamente con los campos canónicos requeridos (`material_name`, `material_type = 'PAPER'`, `paper_gsm`, `finish`, `current_stock_units`, `available_units`).
  4. **Trazabilidad Completa en `material_inventory_events`**:
     - Se registra `(id, material_inventory_id, event_type, quantity_units, before_stock, after_stock, operator_id, reason, metadata_json)` con auditoría completa de albarán y operador.
- **Consecuencia**: Cero descuadres de inventario en planta, sincronización atómica entre proveedores y el ERP/MES industrial de la imprenta.

---

## ADR 013: Generación Canónica de Documentos de Aprovisionamiento (PO & Albarán de Entrega) con Motor de Impresión (Fase I6)
- **Fecha**: 2026-10-23
- **Estado**: Aceptado
- **Contexto**:
  La operativa de aprovisionamiento de bobinas y resmas de papel entre imprentas comerciales y proveedores requiere documentos físicos y descargables legalmente válidos para recepción en muelle, control contable y firma de conformidad:
  a) **Orden de Compra / Purchase Order (PO)**: Generada al confirmar el pedido/RFQ, con desglose de especificaciones físicas, condiciones comerciales, importes y datos del comprador/proveedor.
  b) **Albarán de Entrega / Packing Slip**: Generado por el proveedor o en planta con historial de recepciones parciales o totales, números de albarán, bultos y casillas de firma de entrega y recepción.
- **Decisión**:
  1. **Servicio Centralizado y Multilateral (`paperProcurementService.generateProcurementDocument`)**:
     - Acceso autorizado bilateral: permitido al tenant comprador de la imprenta (`isBuyer`) y a la organización proveedora asociada (`isSupplier`).
     - Rechazo fail-closed (HTTP 403 `FORBIDDEN_DOCUMENT_ACCESS`) para proveedores o imprentas ajenas.
     - Contrato dual de retorno: entrega `{ ok: true, data: docData, ...docData }` garantizando compatibilidad con clientes frontend (`res.data`) y servicios de backend.
  2. **Estructura HTML5 Auto-Contenida e Imprimible (`renderPrintableDocumentHtml`)**:
     - Estilos CSS profesionales `@media print` optimizados para A4 portrait (márgenes de 12mm x 15mm, tipografía Segoe UI/Roboto, encabezados de tabla de alto contraste, casillas de firma y eliminación de elementos interactivos con `.no-print`).
     - Inclusión de identidad corporativa de PrintPrice OS, marca/subtítulo, estado del pedido, dirección de entrega del centro de impresión y SKU comercial del proveedor.
     - En Albaranes (`PACKING_SLIP`), renderizado dinámico de la tabla histórica de recibos con número de albarán, fecha, hojas verificadas, operador y notas.
  3. **Visualización y Descarga en UI (`ProcurementDocumentModal.tsx`)**:
     - Montaje accesible vía `<AccessibleModal>` sobre `document.body` con tabs para conmutar entre Orden de Compra y Albarán, previsualización en iframe aislado, descarga de archivo `.html` y soporte trilingüe ES/EN/DE.
- **Consecuencia**: Estandarización de documentos industriales sin dependencias pesadas de renderizado en servidor (como Puppeteer o Chromium), 100% interactivo y ligero en navegador.

---

## ADR 014: Integración No Invasiva de Coste de Papel y Parcheo BPE de Tarifas Forward (Fases I6 & I7)
- **Fecha**: 2026-10-23
- **Estado**: Aceptado
- **Contexto**:
  El motor de pricing industrial `@ppos/pricing-engine` (fijado estrictamente al commit `1f8997eb34b14db6787986249a1fb8c4e01ea77e`) calcula el precio de trabajos de imprenta basándose en matrices de tarifas horarias de máquina, velocidades y coste de materias primas (`paper_price_interior_by_kilo`, `paper_price_cover_by_kilo`). Los costes de papel fluctúan dinámicamente y la imprenta necesita consultar tarifas reales de mercado e inyectarlas en presupuestos sin modificar el código fuente del motor de precios.
- **Decisión**:
  1. **Fórmulas Físicas Exactas e Inmutables (`paperCostIntegrationService.js`)**:
     $$\text{kg\_per\_sheet} = \frac{\text{width\_mm} \times \text{height\_mm}}{1\,000\,000} \times \frac{\text{gsm}}{1\,000}$$
     $$\text{price\_per\_kg} = \frac{\text{price\_amount}}{\text{weight\_basis\_kg}}$$
     Normalización exacta a EUR/kg para todas las bases canónicas: `KG`, `TONNE`, `SHEET`, `THOUSAND_SHEETS`, `PACK`.
  2. **Estimación Industrial de Papel para Trabajos**:
     - Cálculo de pliegos netos por imposición de signaturas (16 páginas por pliego de máquina).
     - Curvas de merma estándar de imprenta: merma de puesta a punto (100 pliegos por signatura interior, 50 pliegos para cubierta) más 2.5% de merma de tirada en régimen constante.
     - Cómputo de pliegos y kilogramos brutos y netos, y presupuesto estimado de compra.
  3. **Resolución de Mejor Oferta de Mercado (`resolveMarketPaperRate`)**:
     - Consulta indexada de ofertas activas en marketplace o clientes autorizados para las especificaciones físicas requeridas (GSM, acabado, formato), seleccionando de forma determinista la tarifa con menor coste por kilogramo normalizado.
  4. **Parcheo BPE No Invasivo (`buildBpePaperPatch`)**:
     - Construcción de un objeto de parche que inyecta `paper_price_interior_by_kilo` y `paper_price_cover_by_kilo` compatible con las matrices de BPE.
     - Metadatos de procedencia inmutables (`_metadata`) con `source: 'PPOS_PAPER_SUPPLIER_HUB'`, ID de proveedor, SKU, ID de oferta y timestamp de resolución.
  5. **Verificación E2E de Humo (`scripts/smoke_paper_supplier_hub_e2e.js`)**:
     - Ejecución integral y aislada del ciclo de vida en 12 fases sobre MySQL efímero con aserciones estrictas y reporte limpio sin mutaciones en base de datos productiva.
- **Consecuencia**: Máxima precisión en cotizaciones industriales, desacoplamiento absoluto de `@ppos/pricing-engine`, trazabilidad completa de origen de coste y reproducibilidad en CI.

---

## ADR 015: Normalización Multidivisa Estricta, Parámetros Industriales Reales y Gobernanza del Parche BPE
- **Fecha**: 2026-10-23
- **Estado**: Aceptado
- **Contexto**:
  La integración de tarifas de mercado para cálculo industrial de papel presentaba riesgos de distorsión financiera y operativa si:
  a) Se asumía implícitamente EUR o se convertían ofertas en USD/GBP sin tipo de cambio autorizado y trazable.
  b) Se utilizaban reglas fijas de máquina (16 páginas por pliego, 100/50 de preparación, 2,5% de merma) como invariantes universales en lugar de respetar la imposición, el formato de máquina y la ficha de producción.
  c) No se definía con rigor la gobernanza del parche BPE, generando dudas sobre una eventual mutación automática de tarifas preexistentes o pedidos en curso.
- **Decisión**:
  1. **Monedas y Normalización Estricta (`convertPriceToKg`, `resolveMarketPaperRate`)**:
     - Toda normalización de precio por kilogramo conserva la moneda original de la oferta (`{ pricePerKg, currency }`).
     - Queda terminantemente prohibido etiquetar ofertas en USD o GBP como EUR.
     - Queda prohibido comparar o clasificar ofertas en distintas monedas para elegir "la más barata" si no se proporciona un mapa explícito y autorizado de tipos de cambio (`options.exchangeRates`).
     - En ausencia de un mapa de cambio autorizado, el motor exige `targetCurrency` y filtra estrictamente por dicha moneda, rechazando ofertas en divisa divergente.
     - Toda resolución registra metadatos de trazabilidad en `conversionTrace` (`sourceCurrency`, `targetCurrency`, `rateApplied`).
  2. **Cálculo Industrial Parametrizado (`calculateJobPaperRequirements`)**:
     - Los valores de 16 páginas por pliego, 100 pliegos de preparación interior, 50 de cubierta y 2,5% de merma se eliminan como constantes universales del motor.
     - El cálculo acepta parámetros explícitos de producción (`pagesPerSheet`, `makereadyWasteSheets`, `runWastePercentage`).
     - Si no se suministran, el motor deriva la imposición geométrica a partir de las dimensiones del pliego y del corte de página (acotando a signaturas binarias estándar: 32, 16, 8, 4) y aplica 0 de merma por defecto para no inventar costes ocultos.
     - Los valores de ejemplo quedan confinados a fixtures explícitas de prueba.
  3. **Gobernanza del Parche BPE (`buildBpePaperPatch`)**:
     - **Consumidor**: Exclusivamente `commercialEstimationService` / módulo de cotización y presupuestación industrial.
     - **Momento de aplicación**: Únicamente cuando un operador o administrador de la imprenta pulsa explícitamente "Aplicar tarifa de proveedor de mercado" en la confección o recálculo de una nueva cotización de trabajo.
     - **Autorización requerida**: Roles autenticados `PRINTHOUSE_ADMIN` o `PRINTHOUSE_OPERATOR`.
     - **Inmutabilidad de datos históricos**: El parche BPE **nunca** muta de forma automática tarifas base configuradas en la imprenta, cotizaciones ya guardadas, ni condiciones acordadas en pedidos (`orders`) existentes. Genera un objeto de actualización transitorio con metadatos auditables (`_metadata.rateSnapshot`).
  4. **Explicación de Integridad de Migraciones (170 vs 169)**:
     - El directorio `migrations/` contiene 170 archivos totales en disco: 169 scripts DDL/DML que terminan en `.sql` y 1 archivo de metadatos `migration-integrity-baseline.json`.
     - El script de validación `scripts/smoke_phase183_migration_integrity.js` contabiliza los 170 archivos, excluye formalmente el archivo no migración (`.json`) y valida criptográficamente los 169 archivos `.sql` clasificados contra sus SHA-256 baseline ($169 + 1 = 170$).
- **Consecuencia**: Cero distorsión contable multidivisa, respeto a la realidad física de cada taller e inviolabilidad de las cotizaciones y pedidos históricos.




