# CONTRATO DEL MOTOR DE CÁLCULO DELTA BPE — BUDGET-02C-00
## Recálculo Server-Side, Tratamiento de Variaciones y Evaluación de Limitaciones Industriales

**Proyecto:** PrintPrice OS  
**Misión:** BUDGET-02C-00 — Contrato de Cálculo Delta  
**Estado:** `BUDGET-02C00_DESIGN_APPROVED`  
**Modalidad Operativa:** READ-ONLY / DESIGN FIRST  
**Restricciones:** NO MERGE / NO DEPLOY / NO CODE MUTATION / NO DATABASE CHANGES  
**Fecha:** 27 de octubre de 2026  
**Autor:** Antigravity (Advanced Agentic Architecture)

---

## 1. Principio Rector: Inmutabilidad de la Cotización Original BPE

En la arquitectura de PrintPrice OS, la cotización original emitida por BPE que sirvió de base para la formalización del pedido es **estrictamente inmutable**:
- **Escenario Certificado de Referencia (Datos de Prueba Verificados en Fixtures):**
  - Producto: Libro rústica cosida, 1.000 ejemplares, A5 (148 × 210 mm), 128 páginas interiores, interior 1/1 negro, cubierta 4/0 color con plastificado mate.
  - Imprenta Adjudicataria: `dar-2025` (Dar 2025).
  - Importe de Referencia Certificado: **1.782,30 €**.
  - **Aclaración Fiscal Fundamental (E-02):**  
    La auditoría de código en [`PriceEngine.js`](file:///c:/Users/KIKE/Downloads/ppos-pricing-engine-main/src/PriceEngine.js), [`MarketplaceOfferMapper.js`](file:///c:/Users/KIKE/Downloads/ppos-pricing-engine-main/src/MarketplaceOfferMapper.js) y [`server.js:3100-3106`](file:///c:/Users/KIKE/Downloads/PrintPricePro_BookPrice-feature-adversarial-node-v5.2/server/server.js#L3100-L3106) determina inequívocamente que **`1.782,30 €` es el importe comercial neto (base imponible B2B sin IVA)**. BPE calcula exclusivamente costes industriales de producción y flete antes de impuestos, y Budget App registra dicho importe en `totals.total_price` con `tax_amount = 0` (o delegado a la jurisdicción fiscal del cliente en Control Plane).
  - **Dato de Prueba, no Constante de Producción (E-04):**  
    El importe de 1.782,30 € y los parámetros del escenario son datos de prueba certificados para verificar la no-regresión en tests; bajo ninguna circunstancia se tratarán como constantes cableadas en el código de producción.
- **Prohibición de Sobrescritura:**  
  Ninguna propuesta de material alternativo, decisión de taller o recálculo posterior sobrescribirá jamás la fila original del pedido ni los campos de cotización base en `orders`, `marketplace_orders` ni en `marketplace_order_intents`.
- **Creación de Versión Económica:**  
  Toda variación económica da origen a una nueva entidad versionada (`order_quote_revisions`), que vincula la cotización original inmutable como padre y preserva la trazabilidad completa de especificaciones, procedencia de cálculo y huella criptográfica.

---

## 2. Tratamiento de los Escenarios Económicos Delta

El delta económico representa la diferencia neta entre la nueva configuración recalculada y la configuración contratada:
$$\Delta_{\text{net}} = \text{Price}_{\text{revised, net}} - \text{Price}_{\text{original, net}}$$

```
                                  ┌──────────────────────────────┐
                                  │   PROPOSE_ALTERNATIVE        │
                                  │ (Taller selecciona variante) │
                                  └──────────────┬───────────────┘
                                                 │
                                                 ▼
                                  ┌──────────────────────────────┐
                                  │ Server Recalculation (BPE)   │
                                  │  Price = Cost / (1 - Margin) │
                                  └──────────────┬───────────────┘
                                                 │
                         ┌───────────────────────┼───────────────────────┐
                         │                       │                       │
                         ▼                       ▼                       ▼
               ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
               │  Delta Positivo  │    │   Delta Cero     │    │  Delta Negativo  │
               │   (Δ_net > 0)    │    │   (Δ_net = 0)    │    │   (Δ_net < 0)    │
               └─────────┬────────┘    └─────────┬────────┘    └─────────┬────────┘
                         │                       │                       │
                         ▼                       ▼                       ▼
               • Requiere Consent.     • Requiere Consent.     • Requiere Consent.
               • Token de aceptación   • Token de aceptación   • Token de aceptación
               • Autorización de       • Cero impacto monetario• Abono/Crédito pactado
                 cobro complementario    (solo cambio técnico)   (Reembolso parcial)
```

### 2.1 Delta Positivo ($\Delta_{\text{net}} > 0$)
- **Causa Típica:** Papel de mayor gramaje (ej. pasar de 90g offset a 120g offset), formato especial con mayor merma, o incremento en el coste de transporte derivado del mayor peso físico.
- **Tratamiento:**
  1. Se emite una revisión con estado `REVISION_PENDING`.
  2. Requiere consentimiento expreso del cliente vía token criptográfico monouso.
  3. No se efectúa cargo inmediato: tras la aceptación del cliente, se activa la Puerta Financiera para autorizar el cobro complementario o retención en tarjeta.
  4. Si el cliente rechaza o el token expira, se bloquea la producción y se abre resolución formal.

### 2.2 Delta Cero ($\Delta_{\text{net}} = 0$)
- **Causa Típica:** Papel equivalente de distinta marca comercial pero idéntico gramaje y características, absorción de costes por parte del marketplace o de la imprenta, o variación económica insignificante inferior al umbral de redondeo ($< 0,01\text{ \euro}$).
- **Tratamiento:**
  1. Se emite igualmente una revisión formal con estado `REVISION_PENDING` (o confirmación técnica gobernada).
  2. **Obligatoriedad de Consentimiento:** Aunque el coste no varíe, el cliente contrató una especificación técnica concreta; la imprenta no puede alterar unilateralmente el soporte físico sin conformidad del cliente.
  3. No requiere movimiento de fondos en la pasarela de pagos.
  4. Al ser aceptada, se actualizan las especificaciones de producción del paquete de despacho sin alterar los importes facturados.

### 2.3 Delta Negativo ($\Delta_{\text{net}} < 0$)
- **Causa Típica:** Papel alternativo de gramaje inferior pero técnicamente admisible para el grosor de lomo, o variante con oferta de compra mayorista más económica.
- **Tratamiento:**
  1. Se emite revisión con estado `REVISION_PENDING`.
  2. El cliente es informado de la alternativa y del abono a su favor.
  3. Tras la aceptación expresa del cliente, la Puerta Financiera instruye un reembolso parcial (Refund/Credit Note) sobre la transacción original de Stripe.
  4. Bajo ninguna circunstancia el marketplace retiene de forma opaca un ahorro derivado de la degradación del papel sin consentimiento ni reflejo contable.

---

## 3. Disociación Económica y Fórmulas Comerciales en Código (E-01)

Una regla de oro de PrintPrice OS es que **un precio de adquisición mayorista no equivale directamente al precio del cliente final**:
1. **El taller no fija precios de venta:** El taller solo declara el coste de adquisición mayorista o la diferencia estimada (`estimated_cost_delta` en `order_paper_decisions`).
2. **Fórmula Real en Código: Gross Margin (Margen Bruto sobre Venta) vs Markup:**  
   La inspección del código fuente en [`MarketplaceOfferMapper.js#L71-L79`](file:///c:/Users/KIKE/Downloads/ppos-pricing-engine-main/src/MarketplaceOfferMapper.js#L71-L79) revela la fórmula matemática efectivamente montada:
   ```javascript
   // Gross margin formula implementada en BPE:
   suggestedPrice = productionCost / (1 - (targetMarginPct / 100));
   estimatedMargin = suggestedPrice - productionCost;
   marginPct = targetMarginPct;
   ```
   - **Diferencia Crítica:** BPE **NO aplica un markup multiplicativo** ($\text{Cost} \times (1 + m)$), sino un **margen bruto comercial sobre el precio de venta final** ($\text{Cost} / (1 - m)$).
   - Ejemplo: Para un coste de producción de 1.452,58 € y un margen del 18,5%:
     $$\text{Price}_{\text{net}} = \frac{1.452,58}{1 - 0,185} = \frac{1.452,58}{0,815} = 1.782,30\text{ \euro}$$
   - Si se aplicase erróneamente un markup sobre coste del 18,5%, el resultado sería $1.452,58 \times 1,185 = 1.721,31\text{ \euro}$ (provocando un descalce financiero de 60,99 € por pedido).
3. **Reglas Fiscales Estrictas y Conservación de Base (E-02):**  
   - BPE calcula exclusivamente en **base imponible neta comercial (B2B sin IVA)**.
   - El delta económico se calcula **exclusivamente sobre bases fiscales homogéneas**:
     $$\Delta_{\text{net}} = \text{Price}_{\text{revised, net}} - \text{Price}_{\text{base, net}}$$
     $$\text{Tax}_{\text{base}} = \text{round2}\left(\text{Price}_{\text{base, net}} \times \frac{\text{tax\_rate\_pct}}{100}\right)$$
     $$\text{Tax}_{\text{revised}} = \text{round2}\left(\text{Price}_{\text{revised, net}} \times \frac{\text{tax\_rate\_pct}}{100}\right)$$
     $$\Delta_{\text{tax}} = \text{Tax}_{\text{revised}} - \text{Tax}_{\text{base}}$$
     $$\Delta_{\text{gross}} = \Delta_{\text{net}} + \Delta_{\text{tax}}$$
   - **Prohibición Taxativa:** Queda terminantemente prohibido calcular deltas mediante restas directas entre importes brutos (con impuestos) e importes netos, o entre monedas o tipos impositivos divergentes.

---

## 4. Comparativa de Estrategias de Recálculo (E-03)

Para la ejecución del recálculo se evalúan formalmente tres alternativas arquitectónicas:

### Alternativa A: Recálculo Íntegro en BPE vía Sustitución de Variante (Recomendada)
- **Mecanismo:** El orquestador toma el payload original firmado de la cotización (`book_spec_json`), sustituye exclusivamente los parámetros de la sección afectada (`paper_weight_interior`, `paper_type_interior` o formato de pliego) con la variante técnica aprobada en `order_paper_decisions`, e invoca el endpoint existente `POST /api/marketplace/offers` de BPE.
- **Ventajas:**
  1. **Reutilización Máxima (Ponytail):** Cero código nuevo en BPE; reutiliza el 100% de [`PriceEngine.js`](file:///c:/Users/KIKE/Downloads/ppos-pricing-engine-main/src/PriceEngine.js) y [`MarketplaceOfferMapper.js`](file:///c:/Users/KIKE/Downloads/ppos-pricing-engine-main/src/MarketplaceOfferMapper.js).
  2. **Paridad Total:** Garantiza que los pliegos fijos, mermas, encuadernación, flete y margen comercial se calculan con el algoritmo idéntico al presupuesto inicial.
  3. **Trazabilidad:** Proporciona un nuevo `rates_checksum` y desglose de líneas completamente auditable.
- **Inconveniente:** Requiere que el tipo de papel alternativo exista en las tarifas de la imprenta en MongoDB.

### Alternativa B: Contrato BPE Especializado (`POST /api/marketplace/recalculate-delta`)
- **Mecanismo:** Endpoint dedicado en BPE que recibe la referencia del presupuesto original y la variante alternativa, devolviendo el desglose diferencial aislado.
- **Ventajas:** Aislamiento formal del contrato delta en una única llamada de red.
- **Inconveniente:** Requiere desarrollar y certificar un nuevo endpoint en el repositorio de BPE (`ppos-pricing-engine-main`), actualmente clasificado como `MISSING`.

### Alternativa C: Nuevas Capacidades de Cálculo Híbridas (Inyección Dinámica de Ofertas de Distribución)
- **Mecanismo:** Modificar BPE para que consulte directamente la tabla `supplier_paper_offers` de Control Plane y sustituya el coste por kilo de la imprenta por el coste de compra del distribuidor.
- **Inconveniente:** Acopla indebidamente la base de datos de Control Plane con BPE y subvierte el principio de no duplicación de modelos.

### Dictamen de Selección (E-03):
Se adopta formalmente la **Alternativa A como estrategia primaria operativa e inmediata** por su paridad matemática absoluta y cero mutación en el motor BPE. Se preserva la especificación de la **Alternativa B** como interfaz de optimización futura para cuando se autorice desarrollo en BPE.

---

## 4.1 Procedimiento de Recálculo en Servidor (Paso a Paso con Estrategia A)

```
[Paso 1: Recuperación]
   orders / marketplace_orders (order_ref = 'dar-2025-1000-a5')
   └── original_quote_json (Total canónico neto: 1.782,30 €)
         │
[Paso 2: Obtención de Decisión Técnica]
   order_paper_decisions (status = 'ACTIVE', action = 'PROPOSE_ALTERNATIVE')
   └── alternative_variant_id = 'pv_munken_pure_120_640x900'
         │
[Paso 3: Verificación de Catálogo Maestro]
   paper_variants (id = 'pv_munken_pure_120_640x900')
   └── gsm: 120, width: 640, height: 900, category: 'UNCOATED'
         │
[Paso 4: Invocación de Cálculo BPE (Estrategia A)]
   POST /api/marketplace/offers
   ├── Payload: specs originales + { paper_weight_interior: 120, paper_type_interior: 'offset' }
   ├── PriceEngine.sheetsInterior()  ──► Pliegos de máquina recalculados
   ├── PriceEngine.kiloInterior()    ──► Kg físicos por pliego y gsm
   ├── PriceEngine.costInterior()    ──► Coste papel según tarifas imprenta
   ├── PriceEngine.costTransport()   ──► Flete por peso total
   └── MarketplaceOfferMapper        ──► Price = Cost / (1 - target_margin_pct/100)
         │
[Paso 5: Liquidación Fiscal y Delta Gobernado]
   -- Resolución autorizada por Control Plane según naturaleza de operación (4% libro, 21% comercial, 0% VIES)
   Delta neto  = Price_revised_net - Price_base_net
   BaseTax     = round2(Price_base_net * tax_rate_pct / 100)
   RevisedTax  = round2(Price_revised_net * tax_rate_pct / 100)
   Delta tax   = RevisedTax - BaseTax
   Delta bruto = Delta neto + Delta tax
         │
[Paso 6: Emisión de Revisión Inmutable]
   INSERT INTO order_quote_revisions (snapshot_canonical_hash, breakdown_json)
   INSERT INTO quote_revision_tokens (token_hash, expires_at en UTC)
```

---

## 5. Evaluación de Capacidades y Limitaciones de BPE

A continuación se audita exhaustivamente qué componentes puede calcular BPE de forma nativa con su código actual ([`PriceEngine.js`](file:///c:/Users/KIKE/Downloads/ppos-pricing-engine-main/src/PriceEngine.js)) y cuáles requieren adaptadores o extensiones en el contrato:

| Componente Técnico | Capacidad BPE Actual (`PriceEngine.js`) | Limitación Detectada en Código | Estrategia de Mitigación en BUDGET-02C |
| :--- | :---: | :--- | :--- |
| **Diferencia de Gramaje (`gsm`)** | **SOPORTADO** | [`kiloInterior()`](file:///c:/Users/KIKE/Downloads/ppos-pricing-engine-main/src/PriceEngine.js#L655-L665) calcula: $\text{kilos} = \text{round}(\text{sheets} \times \text{sizeDef} \times (\text{gsm} / 1000))$. Sensible al cambio de peso. | Mapear directamente el `gsm` de `paper_variants` a `paper_weight_interior` en el payload BPE. |
| **Formato de Pliego (`sizeDef`)** | **PARCIAL** | [`getPaperSize()`](file:///c:/Users/KIKE/Downloads/ppos-pricing-engine-main/src/PriceEngine.js#L125-L150) asigna pliegos predefinidos (`640x900`, `720x1020`, `520x800`). Si la variante alternativa tiene dimensiones no estándar, BPE recurre a heurística fija. | Si la variante física del proveedor tiene un formato de pliego específico, pasar `custom_width` y `custom_height` para forzar cálculo de pliego exacto en BPE. |
| **Imposición y Signatura (`signature`)** | **PARCIAL** | BPE selecciona signatura de 32, 16 o 24 páginas según el número de páginas del libro ([`pickSignature()`](file:///c:/Users/KIKE/Downloads/ppos-pricing-engine-main/src/PriceEngine.js#L160-L180)), pero **no comprueba la rigidez del gramaje**. Doblar 120g o 150g en signaturas de 32 páginas produce arrugas mecánicas en plegadora. | El orquestador de Control Plane debe validar si $\text{gsm} > 135\text{ g/m}^2$, forzando en el recálculo BPE `signature = 16` para reflejar el coste real de pliegos y hendido adicional. |
| **Merma de Fabricación (`waste`)** | **SOPORTADO** | BPE aplica merma fija y variable por color y encuadernación en [`sheetsInterior()`](file:///c:/Users/KIKE/Downloads/ppos-pricing-engine-main/src/PriceEngine.js#L576-L581): $\text{waste} = \text{paperNetInterior} \times (\text{paper\_waste\_for\_binding} / 100)$. | Determinista y preservado íntegramente. |
| **Coste por Kilo vs Oferta Mayorista** | **LIMITACIÓN CRÍTICA** | BPE consulta `rates.paper_price_interior_by_kilo` de su propia base de MongoDB. **BPE no conoce las tablas `supplier_paper_offers` de Control Plane.** | **Decisión Arquitectónica:** No inyectar base de datos de distribuidores en BPE. Control Plane calcula la tarifa efectiva por kg a partir de la oferta mayorista adjudicada y la envía como parámetro `paper_price_override_per_kilo` o recalcula el delta sobre la tabla de tarifas de la imprenta. |
| **Transporte y Logística** | **SOPORTADO** | Si `technical_costs_for_transport` está activo ([`PriceEngine.js#L707-L732`](file:///c:/Users/KIKE/Downloads/ppos-pricing-engine-main/src/PriceEngine.js)), el flete se recalcula automáticamente si el coste técnico total sube. Si es por peso/volumen, el aumento de kilos impacta en el transporte. | Separar rigurosamente el delta de fabricación del delta de transporte en el desglose final. |

---

## 6. Especificación del Contrato API para Recálculo Delta

Se diseña la especificación formal del endpoint de recálculo delta que consumirá el orquestador de Control Plane:

### Endpoint: `POST /api/marketplace/recalculate-delta`
- **Ámbito:** BPE / Orquestador Control Plane (Servicio Interno Autenticado por mTLS / API Key de Servicio).

#### Esquema de Solicitud (Request Payload):
```json
{
  "tenant_id": "tenant_industrial_01",
  "order_ref": "dar-2025-1000-a5",
  "printhouse_id": "dar-2025",
  "currency": "EUR",
  "target_margin_pct": 18.5,
  "tax_resolution": {
    "jurisdiction_code": "ES",
    "tax_rate_pct": 4.0,
    "tax_treatment": "REDUCED_RATE_BOOKS_ART_91_DOS_1_2",
    "source_snapshot_id": "tax_snap_9918234"
  },
  "original_baseline": {
    "net_price": 1782.30,
    "specs_digest": "sha256-a1b2c3d4..."
  },
  "technical_decision": {
    "decision_id": "opd_987654321",
    "paper_role": "INTERIOR",
    "requested_variant": {
      "variant_id": "pv_offset_90_640x900",
      "gsm": 90,
      "paper_type": "offset"
    },
    "alternative_variant": {
      "variant_id": "pv_munken_pure_120_640x900",
      "gsm": 120,
      "width_mm": 640.0,
      "height_mm": 900.0,
      "paper_type": "coral_book",
      "finish": "MATT"
    },
    "wholesale_override_price_per_kilo": 1.45
  }
}
```

#### Esquema de Respuesta Exitosa (Response Payload):
```json
{
  "ok": true,
  "calculation_id": "calc_delta_20261027_001",
  "engine_version": "v3.0.4",
  "rates_checksum": "sha256-e99a8b...",
  "calculated_at_utc": "2026-10-27T18:30:00Z",
  "currency": "EUR",
  "breakdown": {
    "original": {
      "customer_price_net": 1782.30,
      "tax_amount": 71.29,
      "gross_total": 1853.59,
      "tax_rate_applied": 4.00,
      "tax_treatment": "REDUCED_RATE_BOOKS_ART_91_DOS_1_2",
      "kilos_interior": 138,
      "sheets_interior": 2000
    },
    "revised": {
      "customer_price_net": 1972.48,
      "tax_amount": 78.90,
      "gross_total": 2051.38,
      "tax_rate_applied": 4.00,
      "tax_treatment": "REDUCED_RATE_BOOKS_ART_91_DOS_1_2",
      "kilos_interior": 184,
      "sheets_interior": 2000
    },
    "delta": {
      "customer_net_delta": 190.18,
      "tax_delta": 7.61,
      "customer_gross_delta": 197.79
    }
  },
  "production_lines": [
    { "item": "Interior paper (120gsm)", "revised_total": 266.80, "original_total": 192.16, "delta": 74.64 },
    { "item": "Interior print (1/1)", "revised_total": 310.00, "original_total": 310.00, "delta": 0.00 },
    { "item": "Shipping", "revised_total": 142.50, "original_total": 142.50, "delta": 0.00 }
  ],
  "canonical_snapshot_hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
}
```

---

## 7. Garantías Contractuales Inviolables

1. **No Redondeos Intermedios Acumulativos:** Los cálculos de pliegos y kilos utilizan aritmética en coma flotante nativa IEEE 754 de 64 bits; solo el redondeo monetario final a 2 decimales (`round2`) se aplica a los importes liquidados.
2. **Conservación de la Firma de Tarifas (`rates_checksum`):** Toda respuesta de recálculo incluye el hash de la tabla de tarifas con la que se evaluó el presupuesto, garantizando que futuras variaciones tarifarias de la imprenta no alteren la auditoría forense de una revisión emitida en el pasado.
3. **Fallo Cerrado (Fail-Closed):** Si BPE rechaza los parámetros por incompatibilidad física (ej. páginas interiores no divisibles entre la signatura forzada o formato de pliego menor que el tamaño del libro cortado), el recálculo se aborta con error HTTP `422 UNPROCESSABLE_ENTITY`, impidiendo la generación de revisiones con importes corruptos.
