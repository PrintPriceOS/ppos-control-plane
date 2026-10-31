# CERTIFICACIÓN DEL CONTRATO ECONÓMICO BPE — BUDGET-02C-00R
## Reconciliación Económica, Fiscalidad Canónica y Paridad Algorítmica con el Motor de Precios

**Proyecto:** PrintPrice OS  
**Misión:** BUDGET-02C-00R — Certificación del Contrato Económico  
**Predecesor Inmediato:** BUDGET-02C-00 (`BUDGET-02C00_CONDITIONAL`)  
**Modalidad Operativa:** STRICTLY DOCUMENTATION ONLY  
**Restricciones de Ejecución:** NO MERGE / NO DEPLOY / ZERO CODE MUTATION / NO DATABASE CHANGES  
**Fecha de Emisión:** 27 de octubre de 2026  
**Responsable de Ejecución:** Antigravity (Advanced Agentic Architecture)  
**Dictamen Formal:** **`BUDGET-02C00R_PASS`**

---

## 1. Alcance y Objeto de la Reconciliación R1

La presente misión **BUDGET-02C-00R** responde al mandato ejecutivo de certificar con absoluta fidelidad el contrato económico del sistema de revisiones Delta, reconciliando el diseño previo con el comportamiento matemático real del motor BPE ([`ppos-pricing-engine-main/`](file:///c:/Users/KIKE/Downloads/ppos-pricing-engine-main/)) y las políticas comerciales de Control Plane ([`ppos-control-plane-phase-10-intelligence-layer/`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/)).

Se abordan y certifican formalmente las cinco áreas técnicas requeridas:
1. **E-01 — Fórmula Económica:** Identificación en código de los algoritmos de coste, mermas, flete y margen comercial real sobre venta.
2. **E-02 — Fiscalidad y Redondeos:** Auditoría del desglose original de 1.782,30 € como base imponible neta B2B y reglas de homogeneidad fiscal.
3. **E-03 — Estrategia de Recálculo:** Comparativa formal de las Alternativas A, B y C, dictaminando la adopción de la Alternativa A por paridad total con BPE existente.
4. **E-04 — Versionado Económico:** Estructura de snapshot inmutable y desvinculación formal de datos de prueba respecto a constantes de código.
5. **E-05 — Políticas Operativas:** Parametrización configurable de umbrales OTP y plazos de vigencia comercial.

---

## 2. E-01: Fórmulas Económicas Reales y Propietarios de Política

### 2.1 Desglose de Fórmulas en Código Fuente (BPE v3.0)

A diferencia de aproximaciones heurísticas o modelos lineales de markup, BPE ejecuta un flujo determinista en dos etapas: (1) Coste Industrial Bruto en [`PriceEngine.js`](file:///c:/Users/KIKE/Downloads/ppos-pricing-engine-main/src/PriceEngine.js) y (2) Transformación a Precio Comercial en [`MarketplaceOfferMapper.js`](file:///c:/Users/KIKE/Downloads/ppos-pricing-engine-main/src/MarketplaceOfferMapper.js).

```
┌───────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                   ETAPA 1: COSTE INDUSTRIAL BPE                                   │
│                                  (ppos-pricing-engine-main/src/PriceEngine.js)                    │
├───────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 1. Papel Interior:                                                                               │
│    • Pliegos: sheetsInterior = pliegos_netos + pliegos_fijos + merma_encuadernación              │
│    • Kilos: kiloInterior = round(sheetsInterior * sizeDef * (gsm / 1000))                        │
│    • Coste: costPaperInt = round(kiloInterior * rates.paper_price_interior_by_kilo[paperType])   │
│                                                                                                   │
│ 2. Impresión Interior:                                                                            │
│    • costPrintInt = Σ (sectArr[i] * (fixed + ceil(copies/1000) * vari)) + pms_interior           │
│                                                                                                   │
│ 3. Cubierta y Guardas:                                                                            │
│    • costPaperCov = round(sheetsCover * 0.7344 * (gsm / 1000)) * rates.paper_price_cover_by_kilo │
│    • costPrintCov = colorFixed + ceil(copies/1000) * colorVar + lamFixed + uvFixed               │
│                                                                                                   │
│ 4. Encuadernación (Binding):                                                                      │
│    • costBinding = calcCostCapped('binding_pb_fixed_by_sections', 'binding_pb_var...')           │
│                                                                                                   │
│ 5. Transporte y Flete (Logística):                                                                │
│    • Si technical_costs_for_transport == true:                                                    │
│      costShip = (costPrintInt + costPrintCov + costBinding + extraCost + paper) * pct_pais        │
│                                                                                                   │
│ 6. Subtotal de Coste Industrial Directo (production_cost):                                        │
│    production_cost = round2(paper + costPrintInt + costPrintCov + costBinding + extra + costShip) │
└─────────────────────────────────────────────────┬─────────────────────────────────────────────────┘
                                                  │
                                                  ▼
┌───────────────────────────────────────────────────────────────────────────────────────────────────┐
│                           ETAPA 2: PRECIO COMERCIAL (GROSS MARGIN)                                │
│                            (ppos-pricing-engine-main/src/MarketplaceOfferMapper.js)               │
├───────────────────────────────────────────────────────────────────────────────────────────────────┤
│ FÓRMULA REAL: Margen Bruto Comercial sobre Venta (NO es Markup sobre Coste)                       │
│                                                                                                   │
│                     production_cost                                                               │
│   suggested_price = ───────────────────────────                                                   │
│                      1 - (target_margin_pct / 100)                                                │
│                                                                                                   │
│   estimated_margin = suggested_price - production_cost                                            │
│   total_price      = suggested_price                                                              │
└───────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Distinción Matemática: Gross Margin vs Markup
- **Fórmula de Markup (Incorrecta para BPE):**
  $$\text{Precio}_{\text{markup}} = \text{Coste} \times (1 + m)$$
- **Fórmula de Gross Margin (Real en BPE):**
  $$\text{Precio}_{\text{BPE}} = \frac{\text{Coste}}{1 - m}$$
- **Impacto Financiero:**  
  Para un coste de producción de **1.452,58 €** y un objetivo de margen comercial del **18,5%**:
  - Aplicando Gross Margin (BPE): $\frac{1.452,58}{1 - 0,185} = \frac{1.452,58}{0,815} = \mathbf{1.782,30\text{ \euro}}$.
  - Si se aplicase Markup: $1.452,58 \times 1,185 = \mathbf{1.721,31\text{ \euro}}$ (Pérdida de margen de 60,99 €).
- **Certificación:** Se establece contractualmente que cualquier recálculo Delta debe respetar la función de **Gross Margin** implementada en [`MarketplaceOfferMapper.js:72`](file:///c:/Users/KIKE/Downloads/ppos-pricing-engine-main/src/MarketplaceOfferMapper.js#L72).

### 2.3 Matriz de Propiedad de Políticas Económicas

| Componente Económico | Sistema SoR Propietario | Artefacto de Código / DB | Capacidad de Modificación |
| :--- | :---: | :--- | :--- |
| **Tarifas de Máquina e Imposición** | **Imprenta / BPE** | `rates` en BPE Repository | Publicadas por imprenta vía Control Plane (`bpe_pricing_publications`). |
| **Mermas de Plegado y Color** | **BPE Engine** | [`PriceEngine.js#L576-L581`](file:///c:/Users/KIKE/Downloads/ppos-pricing-engine-main/src/PriceEngine.js) | Gobernadas por heurísticas industriales certificadas en BPE v3.0. |
| **Margen Comercial Marketplace** | **Control Plane** | Contexto `target_margin_pct` | Fijado por la dirección comercial del marketplace. |
| **Costes de Adquisición Mayorista** | **Paper Supplier Hub** | `supplier_paper_offers` | Actualizado por distribuidores mediante órdenes de compra. |
| **Fiscalidad y Régimen de IVA** | **Control Plane** | `tax_vat_readiness_snapshots` | Determinado por la jurisdicción fiscal del comprador y vendedor. |

---

## 3. E-02: Fiscalidad, Homogeneidad de Base y Redondeos

### 3.1 Auditoría del Desglose Original de 1.782,30 €

La inspección forense en los tres repositorios confirma:
1. **En BPE ([`MarketplaceOfferMapper.js:122`](file:///c:/Users/KIKE/Downloads/ppos-pricing-engine-main/src/MarketplaceOfferMapper.js#L122)):**
   BPE calcula únicamente costes directos de fabricación y flete, emitiendo `total_price: 1782.3`. Este valor es una **base comercial neta (B2B sin IVA)**.
2. **En Budget App ([`server.js:3100-3106`](file:///c:/Users/KIKE/Downloads/PrintPricePro_BookPrice-feature-adversarial-node-v5.2/server/server.js#L3100-L3106) y [`types.ts:631-637`](file:///c:/Users/KIKE/Downloads/PrintPricePro_BookPrice-feature-adversarial-node-v5.2/types.ts#L631-L637)):**
   ```javascript
   totals: {
       currency: resolvedOffer.currency,
       total_price: resolvedOffer.total_price, // 1782.3
       tax_amount: 0,                          // IVA diferido a facturación
       shipping_amount: 0,                     // Flete ya integrado en total_price por BPE
       grand_total: resolvedOffer.total_price  // 1782.3
   }
   ```
3. **En Control Plane ([`033_phase93_tax_vat_readiness_schema.sql`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/migrations/033_phase93_tax_vat_readiness_schema.sql) y [`034_phase94_invoice_credit_note_lifecycle.sql`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/migrations/034_phase94_invoice_credit_note_lifecycle.sql)):**
   La base imponible (`taxable_amount` / `subtotal_amount`) es de **1.782,30 €**, sobre la cual el motor fiscal aplica el tipo correspondiente según jurisdicción (ej. 21% de IVA en España = 374,28 €; Total Facturado = 2.156,58 €; o Inversión del Sujeto Pasivo / Intra-UE = 0%).

### 3.2 Regla Inviolable de Homogeneidad Fiscal en Cálculos Delta

$$\Delta_{\text{net}} = \text{Price}_{\text{revised, net}} - \text{Price}_{\text{base, net}}$$
$$\text{Tax}_{\text{base}} = \text{round2}\left(\text{Price}_{\text{base, net}} \times \frac{\text{tax\_rate\_pct}}{100}\right)$$
$$\text{Tax}_{\text{revised}} = \text{round2}\left(\text{Price}_{\text{revised, net}} \times \frac{\text{tax\_rate\_pct}}{100}\right)$$
$$\Delta_{\text{tax}} = \text{Tax}_{\text{revised}} - \text{Tax}_{\text{base}}$$
$$\Delta_{\text{gross}} = \Delta_{\text{net}} + \Delta_{\text{tax}}$$

> [!CAUTION]  
> **Prohibición Taxativa:** Queda terminantemente prohibido calcular deltas mediante restas directas entre importes brutos (con IVA) y bases netas, o entre pedidos evaluados bajo regímenes fiscales distintos. Toda sustracción diferencial debe operar sobre la base neta antes de impuestos.

### 3.3 Reglas de Precisión Decimal y Moneda
- **Aritmética Intermedia:** Coma flotante IEEE 754 de 64 bits en cálculos de pliegos, signaturas y kilogramos.
- **Persistencia en Base de Datos:** `DECIMAL(12, 4)` en `order_quote_revisions` para preservar precisión submilesimal en tasas unitarias y evitar errores de redondeo acumulativo.
- **Redondeo Final:** Función simétrica estándar a dos decimales (`round2`) exclusivamente en el momento de liquidar la revisión y facturar en pasarela.
- **Conservación de Moneda:** Moneda fija en todo el ciclo (`currency = 'EUR'`). Prohibido calcular deltas cruzando divisas sin conversión cambiaria previa autorizada.

---

## 4. E-03: Comparativa y Selección de Estrategia de Recálculo

Se evalúan formalmente las tres alternativas técnicas para obtener la variación económica de un material alternativo:

| Criterio de Evaluación | Alternativa A: Recálculo Íntegro en BPE (Sustitución de Variante) | Alternativa B: Contrato BPE Especializado (recalculate-delta) | Alternativa C: Capacidades Híbridas (Inyección Mayorista) |
| :--- | :--- | :--- | :--- |
| **Principio Ponytail (Reutilización)** | **100% Reutilización:** Consume `POST /api/marketplace/offers` existente sin tocar código de BPE. | **Baja Reutilización:** Exige implementar y desplegar nuevo endpoint en BPE. | **Nula Reutilización:** Exige acoplar BD Control Plane con MongoDB BPE. |
| **Paridad Algorítmica** | **ABSOLUTA:** Utiliza las mismas funciones de imposición, merma, encuadernación y margen. | **ALTA:** Replica la lógica diferencial en un controlador dedicado. | **RIESGOSA:** Altera las fuentes tarifarias de la imprenta con precios de distribuidor. |
| **Riesgo de Regresión** | **CERO:** No modifica contratos existentes certificados en BUDGET-01C. | **MEDIO:** Requiere certificar un nuevo pipeline de CI en BPE. | **ALTO:** Riesgo de inconsistencia en márgenes y responsabilidades de taller. |
| **Estado de Implementación** | `IMPLEMENTED` (Disponible inmediatamente en BPE v3.0). | `MISSING` (Requiere fase de desarrollo en BPE). | `MISSING` (No recomendada arquitectónicamente). |

### Dictamen de Selección (E-03):
1. **Estrategia Primaria Inmediata: Alternativa A.**  
   El orquestador de Control Plane recupera el payload original firmado (`book_spec_json`), sustituye la variante autorizada de la sección afectada (`paper_weight_interior`, `paper_type_interior` o formato) y ejecuta la llamada a `POST /api/marketplace/offers`.
2. **Estrategia Secundaria Futura: Alternativa B.**  
   Se preserva el diseño del contrato `POST /api/marketplace/recalculate-delta` para cuando la dirección técnica autorice intervenciones directas sobre el repositorio `ppos-pricing-engine-main`.

---

## 5. E-04: Versionado Económico y Desvinculación de Datos de Prueba

### 5.1 Estructura del Snapshot Inmutable de Revisión

Toda revisión emitida genera un snapshot inmutable en `order_quote_revisions` que contiene la trazabilidad integral de la operación:

```json
{
  "revision_id": "oqr_20261027_dar2025_001",
  "revision_number": 1,
  "order_ref": "dar-2025-1000-a5",
  "external_order_intent_id": "oi_1793110378512",
  "currency": "EUR",
  "economics": {
    "base_net": 1782.30,
    "revised_net": 1893.12,
    "delta_net": 110.82,
    "tax_rate_pct": 21.00,
    "base_tax": 374.28,
    "revised_tax": 397.56,
    "delta_tax": 23.28,
    "base_gross": 2156.58,
    "revised_gross": 2290.68,
    "delta_gross": 134.10
  },
  "provenance": {
    "bpe_engine_version": "v3.0",
    "bpe_calculation_id": "calc_delta_20261027_001",
    "bpe_rates_checksum": "39ded89fed4da1a721fa34d6ac392a70bc3096ea890560b8add9638f0d9baf7a"
  },
  "technical_specification_snapshot": {
    "book_size": "A5",
    "copies": 1000,
    "interior_pages": 128,
    "requested_paper": { "role": "INTERIOR", "variant_id": "pv_offset_90", "gsm": 90 },
    "selected_alternative_paper": { "role": "INTERIOR", "variant_id": "pv_munken_pure_120", "gsm": 120 }
  },
  "applied_policies": {
    "pricing_strategy": "STRATEGY_A_FULL_RECALCULATION",
    "target_margin_pct": 18.50,
    "tax_jurisdiction": "ES",
    "rounding_rule": "ROUND_HALF_UP_2DEC"
  },
  "snapshot_canonical_hash": "a8f3b2c1d0e9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3"
}
```

### 5.2 Datos de Prueba vs Constantes de Producción

Se certifica formalmente que:
- Los valores monetarios citados en los informes (**1.782,30 €**, **110,82 €**, **134,10 €**) y los nombres de entidades (**`dar-2025`**, **`Coral Book White`**, etc.) son **datos de prueba certificados derivados de fixtures y escenarios de auditoría**.
- **Queda prohibido utilizar estos importes como constantes de producción.** Las clases, modelos relacionales, esquemas DDL y servicios operan exclusivamente con parámetros tipados dinámicos (`DECIMAL(12, 4)`), admitiendo cualquier cuantía y divisa válida según ISO 4217.

---

## 6. E-05: Políticas Operativas y Parámetros Configurables

En respuesta a la directriz E-05, se disocian los parámetros de ejemplo de las políticas aprobadas del sistema:

### 6.1 Política de Verificación Antifraude (Desafíos de Identidad y OTP)
- **Política Aprobada:** La aceptación de una revisión económica exige autenticación proporcional al riesgo.
- **Parámetro Configurable:** El umbral económico a partir del cual se exige código OTP obligatorio por correo (`otp_delta_threshold_eur`) se establece por defecto en **50,00 €**, pero es **configurable por tenant**:
  - `tenant_security_policies.otp_delta_threshold_eur` (por defecto: 50.00).
  - Umbral `0.00`: Exige OTP para cualquier incremento económico.
  - Límite de intentos: Máximo 5 fallos antes de bloqueo temporal (`max_otp_attempts = 5`, `lockout_duration_minutes = 30`).

### 6.2 Política de Vigencia Comercial (TTL)
- **Política Aprobada:** La expiración del TTL invalida la propuesta económica sin mutación silenciosa del pedido.
- **Parámetro Configurable:** El plazo estándar de 48 horas laborables es un valor por defecto configurable en el perfil de la imprenta (`printhouse_operating_profiles.revision_ttl_business_hours`).
- **Tope Mayorista Obligatorio (Inviolable):**
  $$\text{expires\_at} = \min\left(\text{issued\_at} + \text{business\_hours}(\text{TTL}), \text{supplier\_paper\_offers.valid\_until}\right)$$
  Si la oferta de compra del distribuidor expira antes del vencimiento del plazo laboral, el TTL de la revisión se acorta obligatoriamente a dicha fecha límite.

---

## 7. Matriz de Correspondencia: Contrato Diseñado vs Módulos Reales BPE

A continuación se acredita la correspondencia punto por punto entre el contrato diseñado y el código real verificado en [`ppos-pricing-engine-main/`](file:///c:/Users/KIKE/Downloads/ppos-pricing-engine-main/):

| Componente Diseñado | Módulo / Archivo Real BPE | Función en Código Fuente | Entradas de Datos | Salidas Producidas | Evidencia en Repositorio |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Normalización de Parámetros** | [`src/Normalizer.js`](file:///c:/Users/KIKE/Downloads/ppos-pricing-engine-main/src/Normalizer.js) | `Normalizer.normalize()` | `rawParams` de libro y pedido | Parámetros físicos canónicos | Líneas 1-350 de `Normalizer.js`. |
| **Cálculo de Pliegos Interior** | [`src/PriceEngine.js`](file:///c:/Users/KIKE/Downloads/ppos-pricing-engine-main/src/PriceEngine.js) | `sheetsInterior()` | `rates, p, copies, sig, sectArr` | Pliegos brutos y netos con merma | [`PriceEngine.js#L535-L582`](file:///c:/Users/KIKE/Downloads/ppos-pricing-engine-main/src/PriceEngine.js#L535-L582). |
| **Cálculo de Kilos por Gramaje** | [`src/PriceEngine.js`](file:///c:/Users/KIKE/Downloads/ppos-pricing-engine-main/src/PriceEngine.js) | `kiloInterior()` | `p, sheetsInteriorVal` | Kilogramos físicos según `gsm / 1000` | [`PriceEngine.js#L655-L665`](file:///c:/Users/KIKE/Downloads/ppos-pricing-engine-main/src/PriceEngine.js#L655-L665). |
| **Coste Papel según Tarifas** | [`src/PriceEngine.js`](file:///c:/Users/KIKE/Downloads/ppos-pricing-engine-main/src/PriceEngine.js) | `costInterior()` | `rates, p, kiloInteriorVal` | Coste en euros de la materia prima | [`PriceEngine.js#L683-L687`](file:///c:/Users/KIKE/Downloads/ppos-pricing-engine-main/src/PriceEngine.js#L683-L687). |
| **Encuadernación y Signaturas** | [`src/PriceEngine.js`](file:///c:/Users/KIKE/Downloads/ppos-pricing-engine-main/src/PriceEngine.js) | `bindingCost()` | `rates, p, copies, sig, sectArr` | Coste fijo y variable de encuadernación | [`PriceEngine.js#L355-L402`](file:///c:/Users/KIKE/Downloads/ppos-pricing-engine-main/src/PriceEngine.js#L355-L402). |
| **Transporte por Peso/Técnico** | [`src/PriceEngine.js`](file:///c:/Users/KIKE/Downloads/ppos-pricing-engine-main/src/PriceEngine.js) | `costTransport()` | `rates, p, copies, costes...` | Coste logístico de flete | [`PriceEngine.js#L707-L732`](file:///c:/Users/KIKE/Downloads/ppos-pricing-engine-main/src/PriceEngine.js#L707-L732). |
| **Coste Industrial Total** | [`src/PriceEngine.js`](file:///c:/Users/KIKE/Downloads/ppos-pricing-engine-main/src/PriceEngine.js) | `buildPrice()` | `params, house` | `total_cost` (Base neta de producción) | [`PriceEngine.js#L744-L846`](file:///c:/Users/KIKE/Downloads/ppos-pricing-engine-main/src/PriceEngine.js#L744-L846). |
| **Margen Comercial (Gross Margin)**| [`src/MarketplaceOfferMapper.js`](file:///c:/Users/KIKE/Downloads/ppos-pricing-engine-main/src/MarketplaceOfferMapper.js) | `mapToOffer()` | `house, context, rank` | `suggested_price = cost / (1 - m/100)` | [`MarketplaceOfferMapper.js#L71-L79`](file:///c:/Users/KIKE/Downloads/ppos-pricing-engine-main/src/MarketplaceOfferMapper.js#L71-L79). |
| **Endpoint Existente Marketplace**| [`routes/marketplace-offers.js`](file:///c:/Users/KIKE/Downloads/ppos-pricing-engine-main/routes/marketplace-offers.js) | `POST /api/marketplace/offers`| `specs, target_margin_pct` | Ofertas comerciales con markup | [`routes/marketplace-offers.js#L107-L200`](file:///c:/Users/KIKE/Downloads/ppos-pricing-engine-main/routes/marketplace-offers.js#L107-L200). |
| **Gobernanza de Tarifas de Taller**| Control Plane DB | `bpe_pricing_publications` | Migración 160 | `rates_checksum` y versión de tarifas | [`160_phase195g_pricing_bpe_publication.sql`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/migrations/160_phase195g_pricing_bpe_publication.sql). |

---

## 8. Dictamen Final de Certificación

Se certifica que:
1. Las cinco áreas de reconciliación (**E-01 a E-05**) han sido auditadas sobre el código real y documentadas con precisión matemática y arquitectónica.
2. Se confirma la adopción de la **Alternativa A como estrategia primaria de recálculo**, garantizando paridad algorítmica total y cero mutaciones sobre el motor BPE v3.0.
3. Se establece formalmente la naturaleza de base comercial neta de **1.782,30 €** y la regla obligatoria de cálculo Delta sobre bases fiscales homogéneas.
4. Se mantiene el entorno bajo estricto régimen **DOCUMENTATION ONLY / ZERO CODE MUTATION**, con los PR #1, PR #6 y PR #7 intactos y abiertos.

Por consiguiente, el responsable de ejecución emite el dictamen formal:

### **`BUDGET-02C00R_PASS`**

> **Aviso Operativo:** Con la emisión de este dictamen queda completamente reconciliada y certificada la fase de diseño contractual económico. Conforme a las instrucciones expresas de la misión, **queda terminantemente prohibido iniciar la fase de implementación BUDGET-02C-01** hasta que la dirección técnica emita la autorización formal de desarrollo.
