# Paper Supplier Hub — Master Implementation Plan

**Proyecto**: PrintPrice OS Control Plane (`PrintPriceOS/ppos-control-plane`)  
**Rama de trabajo**: `feat/paper-supplier-hub`  
**Base commit**: `5901569c1337d8b808f06c33e9ee44614e18c102`  
**Fecha de inicio**: 21 de octubre de 2026  
**Estado general**: Fase I0 (Fundación, Alcance e Invariantes) COMPLETADA. Listo para I1.

---

## 1. Visión de Producto y Separación Canónica

El **Paper Supplier Hub** incorpora un panel independiente para distribuidores/fabricantes de papel dentro del mismo Control Plane (`/supplier/*`), conviviendo con el panel de materiales de las imprentas (`/materials` y `/materials/sourcing`).

### La Separación Central de Datos
1. **Ficha técnica del papel (`paper_products`, `paper_variants`)**: Qué material es físicamente (clase, acabado, gramaje, dimensiones o bobina, espesor, fibra, certificaciones). Entidad canónica desacoplada de precios o proveedores.
2. **Oferta comercial del proveedor (`supplier_paper_offers`, `supplier_paper_offer_revisions`)**: Quién lo vende, con qué SKU de proveedor, precio, unidad/base (`price_basis`: KG, TONNE, SHEET, THOUSAND_SHEETS, PACK), cantidad mínima (MOQ), múltiplo de compra, vigencia y zonas de entrega.
3. **Material e inventario de la imprenta (`materials_catalog`, `predictive_material_inventory`)**: Qué materiales usa la imprenta internamente y qué stock real mantiene en cada centro/nodo físico.

> **Invariante central**: Un papel técnico puede tener múltiples ofertas de diferentes proveedores. Una oferta comercial **nunca** es stock de la imprenta. Vincular un catálogo o solicitar cotización **no** equivale a comprar ni a dar entrada de mercancía al almacén.

---

## 2. Mapa de Iteraciones

- [x] **I0 — Base, alcance e invariantes**:
  - Reconciliar HEAD, commits, PM2 y salud (`/ready`).
  - Crear rama dedicada `feat/paper-supplier-hub` a partir del commit exacto `5901569c1337d8b808f06c33e9ee44614e18c102`.
  - Crear estructura documental en [docs/implementation/paper-supplier-hub/](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/docs/implementation/paper-supplier-hub).
  - Validar suite de pruebas (43 archivos / 664 tests PASSED), Vite build OK y baseline de diagnósticos TSC.
  - Documentar contratos de unidades, visibilidad e invariantes inviolables.
- [x] **I1 — Identidad proveedor y protección del dominio (I1-R1 / I1-R2)**:
  - Roles de proveedor: `SUPPLIER_ADMIN`, `SUPPLIER_OPERATOR`, `SUPPLIER_VIEWER`.
  - Modelo de autorización desacoplado de la jerarquía numérica `ROLE_HIERARCHY` (no dar acceso a `/api/admin` de imprenta).
  - Rutas y layout de proveedor bajo flag `PAPER_SUPPLIER_HUB_ENABLED`.
  - Protección transaccional con locks e idempotencia en recepción de suministros para evitar doble incremento de inventario (`procurement_receipt_records`).
  - Scope estricto por tenant/centro en `materialsAdmin.js` y `printhouseMaterialService.js`.
  - Remediación completa de bloqueo funcional de actor sin centro (`printhouseId=null`), bypass de `node_id` y bootstrap canónico aislado en commit `ed111462cfe77c4d764657abc5a079fe6386d19b`.
- [x] **I2 — Fichas técnicas e importador con revisión**:
  - Tablas aditivas canónicas: `paper_products`, `paper_variants`, `paper_import_batches`, `paper_import_rows` (migración 163).
  - Parser ODS/XLSX/CSV directo con detección de formato real sin auto-publicar ni asumir moneda desconocida.
  - Validación y conciliación de los 1.573 registros del archivo original aportado (`Paper data base.ods.zip`, SHA-256 `7ffb63eb2705fa0c6faa459001ddd3db0702aa25d0bca52fa58e1a13899d4c9a`): desglose recalculado eliminando `isDeciMatch` e inferencias de ratio 10x: 16 válidos, 1.544 pendientes de revisión técnica/unidades, 13 duplicados internos, 0 rechazados de plano ($16 + 1.544 + 13 + 0 = 1.573$).
  - Separación canónica: sin ofertas comerciales, sin modificación de inventario ni costes de pricing.
  - Endurecimiento estricto de revisión: preservación de evidencia técnica, persistencia de contradicciones ante correcciones parciales, validación cerrada de decisiones (`PENDING`, `ACCEPTED`, `REJECTED`) con HTTP 400 `INVALID_DECISION` y aborto/rollback total ante cualquier `pendingCount > 0`.
- [ ] **I3 — Catálogo y ofertas en panel proveedor (Entrega R1)**:
  - CRUD de ofertas, visibilidad (`PRIVATE`, `APPROVED_CUSTOMERS`, `MARKETPLACE`).
  - Activación por flags y allowlist de organizaciones piloto.
- [ ] **I4 — Búsqueda de imprenta y RFQ bidireccional (Entrega R2)**:
  - Sourcing en `/materials`, RFQ con destinatarios aislados, respuesta versionada.
- [ ] **I5 — Pedido, expedición y recepción a inventario (Entrega R3)**:
  - Orden de compra vinculada a `material_procurements`, recepción atómica e idempotente por lote/centro.
- [ ] **I6 — Integración de coste de papel en cálculo industrial**:
  - Adaptador de precio para `@ppos/pricing-engine` (1f8997e), snapshots inmutables en sesiones y quotes.
- [ ] **I7 — Despliegue estable y operación**:
  - Smoke tests, verificación en servidor productivo por SHA exacto, runbook de rollback.

---

## 3. Contrato Canónico de Precios y Unidades

Para evitar ambigüedades en cálculos y comparativas:

$$ \text{area\_m}^2 = \frac{\text{width\_mm} \times \text{height\_mm}}{1\,000\,000} $$
$$ \text{kg\_per\_sheet} = \text{area\_m}^2 \times \frac{\text{gsm}}{1\,000} $$
$$ \text{price\_per\_sheet} = \text{price\_per\_kg} \times \text{kg\_per\_sheet} $$
$$ \text{price\_per\_kg} = \frac{\text{price\_per\_1000\_sheets}}{1\,000 \times \text{kg\_per\_sheet}} $$

- **Base de precio permitida (`price_basis`)**: `KG`, `TONNE`, `SHEET`, `THOUSAND_SHEETS`, `PACK`.
- **Moneda obligatoria**: `currency` (ISO 4217 de 3 letras). Si no está confirmada, el precio queda en estado `UNPRICED` / `NEEDS_REVIEW`.
- **Cantidad comprable**: Se calcula aplicando MOQ y múltiplo en la unidad del proveedor:
  $$ \text{orderable\_quantity} = \lceil \frac{\max(\text{demand}, \text{moq})}{\text{step}} \rceil \times \text{step} $$
