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
