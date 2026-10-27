# AUDITORÍA ARQUITECTÓNICA DE CONTRATOS EXISTENTES — BUDGET-02C-00
## Inspección del Ecosistema PrintPrice OS para el Sistema de Revisión Económica Delta

**Proyecto:** PrintPrice OS  
**Misión:** BUDGET-02C-00 — Auditoría y Límites Contractuales  
**Estado:** `BUDGET-02C00_DESIGN_APPROVED`  
**Modalidad Operativa:** READ-ONLY / DESIGN FIRST  
**Restricciones:** NO MERGE / NO DEPLOY / NO CODE MUTATION / NO DATABASE CHANGES  
**Fecha:** 27 de octubre de 2026  
**Autor:** Antigravity (Advanced Agentic Architecture)

---

## 1. Alcance y Objetivos de la Auditoría

La misión **BUDGET-02C-00** tiene por mandato diseñar formalmente el sistema gobernado de revisiones económicas de presupuestos (Revisiones Delta) cuando una imprenta adjudicataria emite una decisión técnica de papel de tipo `PROPOSE_ALTERNATIVE` sobre un pedido en curso.

Para evitar la duplicación de motores de cálculo, entidades de órdenes o estructuras económicas paralelas, este documento audita en profundidad el estado real de los cuatro subsistemas involucrados en el ecosistema PrintPrice OS:
1. **BPE (Book Pricing Engine):** Motor determinista de cálculo de costes industriales e imposición.
2. **Budget App (BFF & Experiencia de Cotización):** Orquestador de cara al cliente, sesiones HMAC, checkout y paquetes de despacho.
3. **Control Plane (Plano de Control Industrial y Marketplace):** Registro de la orden canónica, decisiones técnicas de taller (`order_paper_decisions`), gobernanza RBAC y despacho.
4. **Paper Supplier Hub:** Catálogo maestro de variantes (`paper_variants`), ofertas mayoristas (`supplier_paper_offers`) y pedidos de aprovisionamiento.

---

## 2. Inventario y Análisis de Sistemas Existentes

### 2.1 Book Pricing Engine (BPE v3.0)
- **Ubicación en disco:** [`ppos-pricing-engine-main/`](file:///c:/Users/KIKE/Downloads/ppos-pricing-engine-main/)
- **Pila tecnológica:** Node.js, Fastify, MongoDB (repositorio de imprentas y tarifas).
- **Contratos y Rutas Reales Montadas:**
  - [`POST /api/estimates`](file:///c:/Users/KIKE/Downloads/ppos-pricing-engine-main/routes/estimates.js): Endpoint puro de cálculo. Normaliza parámetros vía [`Normalizer.js`](file:///c:/Users/KIKE/Downloads/ppos-pricing-engine-main/src/Normalizer.js) y ejecuta [`PriceEngine.estimateAll()`](file:///c:/Users/KIKE/Downloads/ppos-pricing-engine-main/src/PriceEngine.js) sobre todas las imprentas registradas.
  - [`POST /api/marketplace/offers`](file:///c:/Users/KIKE/Downloads/ppos-pricing-engine-main/routes/marketplace-offers.js): Endpoint adaptado para Marketplace. Mapea la cotización determinista aplicando markup comercial vía [`MarketplaceOfferMapper.js`](file:///c:/Users/KIKE/Downloads/ppos-pricing-engine-main/src/MarketplaceOfferMapper.js).
- **Mecanismos de Coste de Papel Existentes:**
  - Pliegos de máquina calculados en [`PriceEngine.sheetsInterior()`](file:///c:/Users/KIKE/Downloads/ppos-pricing-engine-main/src/PriceEngine.js#L535-L582), [`sheetsCover()`](file:///c:/Users/KIKE/Downloads/ppos-pricing-engine-main/src/PriceEngine.js#L588-L615), [`sheetsEndpaper()`](file:///c:/Users/KIKE/Downloads/ppos-pricing-engine-main/src/PriceEngine.js#L621-L649).
  - Conversión a kilogramos físicos vía [`kiloInterior()`](file:///c:/Users/KIKE/Downloads/ppos-pricing-engine-main/src/PriceEngine.js#L655-L665), [`kiloCover()`](file:///c:/Users/KIKE/Downloads/ppos-pricing-engine-main/src/PriceEngine.js#L667-L671), [`kiloEndpaper()`](file:///c:/Users/KIKE/Downloads/ppos-pricing-engine-main/src/PriceEngine.js#L673-L677) usando dimensiones de pliego (`getSizeDef`) y gramaje (`paper_weight_* / 1000`).
  - Coste de papel mediante tarifas por kilo en tablas de imprenta: `rates.paper_price_interior_by_kilo[paperType]`.
- **Comprobación del Escenario Canónico Certificado:**
  - Pedido de 1.000 ejemplares, A5, interior 128 páginas, rústica cosida, imprenta adjudicataria `dar-2025`.
  - Importe bruto canónico: **1.782,30 €**. Este importe es inmutable y constituye la referencia base del contrato.

### 2.2 Budget App (BFF Node.js & MySQL)
- **Ubicación en disco:** [`PrintPricePro_BookPrice-feature-adversarial-node-v5.2/`](file:///c:/Users/KIKE/Downloads/PrintPricePro_BookPrice-feature-adversarial-node-v5.2/)
- **Servidor y Repositorios:** [`server/server.js`](file:///c:/Users/KIKE/Downloads/PrintPricePro_BookPrice-feature-adversarial-node-v5.2/server/server.js), adaptadores en [`server/repositories/adapters/mysql/`](file:///c:/Users/KIKE/Downloads/PrintPricePro_BookPrice-feature-adversarial-node-v5.2/server/repositories/adapters/mysql/).
- **Tablas MySQL Efectivamente Inicializadas:**
  - `marketplace_offer_sessions`: Sesiones de cotización con firma HMAC, especificaciones normalizadas y ofertas seleccionadas.
  - `marketplace_order_intents`: Intenciones de compra del cliente (`order_intent_id`, `public_ref`, `status`, `offer_json`, `totals_json`, `customer_json`).
  - `marketplace_production_files`: Ficheros de producción, checksums SHA-256 y roles (`INTERIOR_PDF`, `COVER_PDF`).
  - `marketplace_dispatch_packages`: Paquetes de entrega al taller con tokens de acceso temporal y cola de producción.
  - `marketplace_notification_events`: Cola de envíos de correos y eventos transaccionales.
  - `marketplace_audit_events`: Registro inmutable de eventos de actor, IP hash y payloads.

### 2.3 Control Plane (Plano de Control y Operaciones Industriales)
- **Ubicación en disco:** [`ppos-control-plane-phase-10-intelligence-layer/`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/)
- **Persistencia Relacional (MySQL):**
  - `orders`: Tabla principal de órdenes de producción industrial (`order_ref`, `tenant_id`, `offer_price`, `status`).
  - `marketplace_orders` (Migración 011): Entrada de pedidos de marketplace (`order_id`, `tenant_id`, `printhouse_id`, `status`, `estimated_price`, `book_spec_json`).
  - `order_paper_decisions` (Migración 167): Ledger formal de decisiones de papel de taller implementado y certificado en `BUDGET-02B01R2_PASS`.
- **Servicio Certificado:** [`src/api/services/orderPaperDecisionService.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/orderPaperDecisionService.js).
  - Gestiona `CONFIRM`, `PROPOSE_ALTERNATIVE` y `REJECT`.
  - Ante `PROPOSE_ALTERNATIVE`, clasifica el registro con `economic_status = 'REQUIRES_ECONOMIC_REVISION'` y `estimated_cost_delta` indicativo, estableciendo formalmente que **el delta hacia el cliente final no está verificado ni calculado hasta la presente fase BUDGET-02C**.

### 2.4 Paper Supplier Hub (Catálogo Maestro y Distribución)
- **Tablas en Control Plane (Migraciones 162-166):**
  - `paper_products`: Familia y marca de papel (`category`, `name`, `brand`).
  - `paper_variants`: Catálogo maestro de variantes (`id`, `product_id`, `gsm`, `width_mm`, `height_mm`, `finish`, `grain_direction`).
  - `supplier_paper_offers`: Ofertas de compra de distribuidores con vigencia temporal (`valid_until`, `price_per_ton` / `price_per_sheet`, `pack_sheets`).
  - `supplier_paper_procurement_orders`: Órdenes de aprovisionamiento vinculadas a pedidos de taller.

---

## 3. Matriz de Propiedad de Datos (System of Record)

Para salvaguardar la coherencia transaccional y evitar que múltiples subsistemas actúen como fuentes de verdad competitivas, se fija la siguiente matriz estricta de propiedad:

| Entidad / Dato | Sistema Propietario (SoR) | Consumidores de Solo Lectura | Regla de Gobernanza |
| :--- | :--- | :--- | :--- |
| **Especificación de Libro y Pedido Original** | **Control Plane** (`orders` / `marketplace_orders`) | Budget App, BPE, Taller | Inmutable tras el pago original (**1.782,30 €**). |
| **Sesión de Cotización y Checkout Web** | **Budget App** (`marketplace_offer_sessions`) | Cliente Web, Control Plane | Protegida por HMAC-SHA256 con expiración de 72 horas. |
| **Cálculo de Costes y Tarifas Industriales** | **BPE** (`PriceEngine.js`) | Control Plane, Budget App | Autoridad exclusiva de tarifas base y recálculo determinista. |
| **Catálogo Maestro de Variantes de Papel** | **Control Plane** (`paper_variants`) | Budget App, BPE, Taller | Fuente canónica de IDs de variante y propiedades físicas. |
| **Ofertas Mayoristas de Distribuidores** | **Control Plane** (`supplier_paper_offers`) | Taller, Orquestador Delta | Define la vigencia máxima (`valid_until`) para el TTL de la revisión. |
| **Decisión Técnica de Taller (Disponibilidad)** | **Control Plane** (`order_paper_decisions`) | Taller, Orquestador Delta, Auditoría | Exclusivo del taller asignado (`CONFIRM`, `PROPOSE_ALTERNATIVE`, `REJECT`). |
| **Revisión Económica Delta (`order_quote_revisions`)** | **Control Plane** (Nuevo SoR en BUDGET-02C) | Budget App, Cliente, Facturación | Ledger inmutable versionado de revisiones económicas. |
| **Token de Aceptación del Cliente** | **Control Plane** (`quote_revision_tokens`) | Budget App (consumo vía POST) | Criptográfico, monouso, no transferible y de expiración estricta. |
| **Despacho Industrial de Ficheros y Handoff** | **Budget App / Control Plane** (`dispatch_packages`) | Taller de Impresión | Bloqueado hasta superación de puertas financieras e industriales. |

---

## 4. Principio de No Duplicación de Motores ni Modelos

Se establecen las siguientes directrices arquitectónicas de observancia obligatoria:
1. **Cero Motores Económicos en el Navegador o en BFF:**  
   Ni Budget App ni el frontend React tienen competencia para calcular deltas de precio, impuestos o porcentajes de margen. Todo importe presentado procede de un cálculo firmado por el servidor.
2. **Cero Confianza en la Imprenta para Fijar Precios al Cliente:**  
   El campo `estimated_cost_delta` registrado en `order_paper_decisions` representa únicamente el impacto de adquisición estimado por el taller. **Un precio mayorista no se traduce automáticamente en un incremento de precio al cliente.** El delta contractual al cliente final debe ser liquidado por el orquestador comercial aplicando las reglas de margen del marketplace.
3. **No Creación de Órdenes Paralelas:**  
   Una revisión económica pertenece estrictamente a la orden existente (`order_id` / `external_order_intent_id`). No se crearán pedidos "clon" ni "sub-órdenes" que fragmenten la trazabilidad de los pagos o de los ficheros de producción.

---

## 5. Clasificación Contractual de Capacidades

Conforme al estándar riguroso de auditoría, se clasifica cada contrato y capacidad del sistema en uno de cuatro estados:
- **`IMPLEMENTED`:** Montado, en producción o verificado con pruebas automatizadas en repositorio.
- **`PARTIAL`:** Existe estructura parcial o ruta básica, pero requiere extensiones para cubrir el flujo de revisiones.
- **`MISSING`:** No existe en el código fuente; debe ser diseñado y creado en esta fase/subfase.
- **`UNVERIFIED`:** Código existente pero sin cobertura de pruebas o evidencia suficiente de ejecución en CI.

| ID | Contrato / Capacidad | Subsistema | Estado Real | Evidencia en Repositorio |
| :---: | :--- | :---: | :---: | :--- |
| **C-01** | Cotización determinista multiproveedor (`POST /api/estimates`) | BPE | `IMPLEMENTED` | [`routes/estimates.js`](file:///c:/Users/KIKE/Downloads/ppos-pricing-engine-main/routes/estimates.js), tests en BPE. |
| **C-02** | Mapeo de ofertas para Marketplace (`POST /api/marketplace/offers`) | BPE | `IMPLEMENTED` | [`routes/marketplace-offers.js`](file:///c:/Users/KIKE/Downloads/ppos-pricing-engine-main/routes/marketplace-offers.js), `MarketplaceOfferMapper.js`. |
| **C-03** | Cálculo de pliegos y kilos por tamaño y gramaje | BPE | `IMPLEMENTED` | [`PriceEngine.js#L535-L677`](file:///c:/Users/KIKE/Downloads/ppos-pricing-engine-main/src/PriceEngine.js). |
| **C-04** | Endpoint de recálculo específico de Delta por variante alternativa | BPE | `MISSING` | Actualmente BPE solo cotiza pedidos completos con tipos de papel genéricos. No existe endpoint `POST /api/estimates/delta`. |
| **C-05** | Catálogo maestro de variantes de papel (`paper_variants`) | Control Plane | `IMPLEMENTED` | Migración 162-163, tablas operativas en MySQL. |
| **C-06** | Registro de decisiones técnicas de papel (`order_paper_decisions`) | Control Plane | `IMPLEMENTED` | Migración 167, [`orderPaperDecisionService.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/orderPaperDecisionService.js), certificado en PR #7 (`BUDGET-02B01R2_PASS`). |
| **C-07** | Tabla de revisiones económicas (`order_quote_revisions`) | Control Plane | `MISSING` | Diseñada en BUDGET-02B-00R a nivel de propuesta; pendiente de implementación en BUDGET-02C. |
| **C-08** | Tabla de tokens monouso de revisión (`quote_revision_tokens`) | Control Plane | `MISSING` | Diseñada en BUDGET-02B-00R a nivel de propuesta; pendiente de implementación en BUDGET-02C. |
| **C-09** | Enlace GET de previsualización segura de solo lectura | Control Plane / BFF | `MISSING` | No implementado en servidor ni rutas públicas. |
| **C-10** | Enlace POST de aceptación/rechazo transaccional con consentimiento | Control Plane / BFF | `MISSING` | No implementado en servidor ni rutas públicas. |
| **C-11** | Consulta y bloqueo de vigencia por oferta mayorista (`valid_until`) | Control Plane | `PARTIAL` | La columna `valid_until` existe en `supplier_paper_offers`, pero no está enlazada al cálculo de TTL de cotización. |
| **C-12** | Puertas de desacoplamiento (Contractual vs Financiera vs Fabricación) | Control Plane / BFF | `PARTIAL` | Existen verificaciones de preflight y dispatch packages, pero sin orquestación de compuertas trifásicas de revisión. |
| **C-13** | Webhooks e idempotencia de pagos (Stripe) | Control Plane / BFF | `IMPLEMENTED` | Migración 015 (`stripe_webhook_events_idempotency`), repositorio de intenciones en BFF. |

---

## 6. Dictamen de la Auditoría Arquitectónica

1. **Base Firme:** La infraestructura de persistencia de decisiones técnicas (`order_paper_decisions`), el catálogo maestro (`paper_variants`) y la inmutabilidad de la orden canónica (**1.782,30 €**) están completamente implementadas y certificadas.
2. **Vacíos Estructurales:** Faltan las dos entidades relacionales críticas (`order_quote_revisions` y `quote_revision_tokens`) y el contrato de cálculo delta en BPE para procesar la variante alternativa de forma determinista y auditada.
3. **No Colisión:** No existe riesgo de solapamiento de órdenes ni de colisión de bases de datos si se respeta el diseño de referencias externas entre Budget App y Control Plane formalizado en `BUDGET-02B-00R`.
