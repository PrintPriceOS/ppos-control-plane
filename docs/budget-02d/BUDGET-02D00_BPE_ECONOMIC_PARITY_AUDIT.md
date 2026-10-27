# BUDGET-02D-00 — Auditoría de Paridad Económica y Sellado Criptográfico BPE

**Proyecto:** PrintPrice OS  
**Misión:** BUDGET-02D-00 — Auditoría Integral de Integración E2E  
**Estado:** AUDIT ONLY — READ ONLY  
**Referencia Certificada:** `744bdd89676c92de2c612152e1be58fe48698fd9`  

---

## 1. Integridad Criptográfica y Contrato de Sellado de Snapshots

El contrato de sellado original está definido en [quoteService.js](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/quoteService.js#L165-L188) y su validación estricta para BUDGET-02C en [orderQuoteRevisionService.js](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/orderQuoteRevisionService.js#L370-L565).

### 1.1 Algoritmo de Huella Digital Canónica
1. **Canonicalización JSON**: Implementada en [pricingSnapshotCanonicalizer.js](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/pricingSnapshotCanonicalizer.js). Ordena recursivamente las claves de los objetos, excluye propiedades nulas o no serializables y formatea números en representación canónica sin espacios.
2. **Hash SHA-256**: Genera un hash hexadecimal de 64 caracteres.
3. **Inmutabilidad en Memoria**: Tras validar el snapshot, [orderQuoteRevisionService.js:561](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/orderQuoteRevisionService.js#L561) aplica `deepFreeze()` sobre el objeto antes de alimentar el motor de cálculo, impidiendo cualquier mutación posterior en tiempo de ejecución.

### 1.2 Reglas de Vinculación Obligatoria
Para que un snapshot sea admitido como base autorizada de recálculo en BUDGET-02C, debe satisfacer simultáneamente 10 condiciones inviolables:
1. Existencia del registro en `order_pricing_snapshots`.
2. Estado estricto `status = 'SEALED'`.
3. Autoridad de sellado presente (`sealed_by`).
4. Identificador de inquilino no vacío (`tenant_id NOT NULL`) y coincidente con el del actor autenticado.
5. Identificador de pedido no vacío (`order_id NOT NULL`) y coincidente con el pedido en curso.
6. Versión de motor BPE coincidente con la versión del snapshot (`bpe_engine_version === formula_version`).
7. Checksum de tarifas congeladas (`rate_card_checksum`) idéntico al registrado.
8. Correspondencia exacta entre el precio neto base y `final_amount` sellado (`Math.abs(baseNet - finalAmount) <= 0.0001`).
9. Integridad criptográfica verificada: `calculatePricingSnapshotChecksum(snapshot) === sealedRecord.snapshot_checksum`.
10. Prohibición absoluta de fallback a constantes del cliente o metadatos no sellados.

---

## 2. Comparativa Algorítmica: Motor BPE Auténtico vs Control Plane

Se ha contrastado línea por línea el algoritmo de recálculo determinista de Control Plane ([orderQuoteRevisionService.js:571-770](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/orderQuoteRevisionService.js#L571-L770)) con el motor BPE auténtico ([ppos-pricing-engine-main/src/PriceEngine.js](file:///C:/Users/KIKE/Downloads/ppos-pricing-engine-main/src/PriceEngine.js) y [MarketplaceOfferMapper.js](file:///C:/Users/KIKE/Downloads/ppos-pricing-engine-main/src/MarketplaceOfferMapper.js)).

### 2.1 Fórmulas de Peso y Coste de Papel Interior

| Parámetro | Motor BPE Auténtico (`PriceEngine.js`) | Control Plane (`orderQuoteRevisionService.js`) | ¿Paridad Demostrada? |
|---|---|---|---|
| **Área del Pliego ($m^2$)** | `(sheet_width/1000) * (sheet_height/1000)` con tabla de pliegos estándar ([PriceEngine.js:114](file:///C:/Users/KIKE/Downloads/ppos-pricing-engine-main/src/PriceEngine.js#L114)) | `(sheetWidth * sheetHeight) / 1000000` ([orderQuoteRevisionService.js:671](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/orderQuoteRevisionService.js#L671)) | **SÍ** (Idéntico cálculo aritmético) |
| **Kilos de Papel** | `sheets * sheet_area_m2 * (gsm / 1000)` con factor de merma según encuadernación | `totalSheets * sheetAreaM2 * (altGsm / 1000)` usando `totalSheets` del breakdown sellado | **SÍ** (Reutiliza el número exacto de pliegos congelados) |
| **Coste de Papel** | `kilos * rates.paper_price_interior_by_kilo[category]` | `altKilos * rates.paper_price_interior_by_kilo[altCategory]` | **SÍ** (Consulta tarifas congeladas bajo el mismo índice) |
| **Líneas Congeladas** | Calcula cubierta, guardas, encuadernación e impresión | Congela estrictamente `cover_paper_cost`, `interior_print_cost`, `cover_print_cost`, `endpapers_cost`, `binding_cost` | **SÍ** (Garantiza que ningún otro coste se altere) |

---

### 2.2 Discrepancia Crítica en Coste de Transporte (`technical_costs_for_transport`)

Durante la inspección del motor BPE original en [PriceEngine.js:707-732](file:///C:/Users/KIKE/Downloads/ppos-pricing-engine-main/src/PriceEngine.js#L707-L732), se descubrió una regla de cálculo que introduce una discrepancia material con el recálculo de Control Plane:

#### En el motor BPE auténtico:
```js
function costTransport(rates, p, copies, sectArr, costPrintInt, costPrintCov, endpaper, costBinding, extraCost, paper) {
    const technicalCostsTransport = Boolean(rates.technical_costs_for_transport ?? false);
    const countryName = getCountryName(p.delivery_country ?? 'ES');
    
    if (technicalCostsTransport) {
        // El coste de transporte depende directamente del coste técnico total, INCLUYENDO EL PAPEL:
        const technicalCosts = costPrintInt + costPrintCov + endpaper + costBinding + extraCost + paper;
        const pct = Number(arrGet(rates.percentage_technical_costs ?? {}, countryName, 0));
        return technicalCosts * pct;
    } else {
        // Cálculo por contenedor / palets:
        ...
    }
}
```

#### En Control Plane (`orderQuoteRevisionService.js:715, 750`):
```js
const freightCost = breakdown.freight_cost !== undefined ? breakdown.freight_cost : 0.00;
const baseIndustrialCost = breakdown.total_industrial_cost !== undefined
    ? breakdown.total_industrial_cost
    : (basePaperCost + breakdown.cover_paper_cost + breakdown.interior_print_cost + breakdown.cover_print_cost + breakdown.endpapers_cost + breakdown.binding_cost + freightCost);

const revisedIndustrialCost = Math.round((baseIndustrialCost + paperCostDelta) * 10000) / 10000;
```

#### Impacto Económico:
- Si la imprenta tiene activada la política `technical_costs_for_transport: true`, un cambio en el coste de papel de `+155,00 €` produce en BPE real un aumento adicional de transporte de `155,00 * pct` (por ejemplo, con `pct = 0.05`, `+7,75 €` adicionales de transporte).
- En Control Plane, el transporte se mantiene **100% congelado**, lo que genera una desviación económica entre la estimación recalculada por Control Plane y lo que BPE hubiera arrojado si se ejecutara una re-cotización completa.
- **Conclusión**: Control Plane garantiza que los costes no suban por transporte (principio pro-cliente), pero no existe paridad matemática estricta para imprentas que apliquen tarifas de transporte proporcionales a costes técnicos.

---

### 2.3 Aplicación del Margen Comercial

En BPE auténtico ([MarketplaceOfferMapper.js:71-73](file:///C:/Users/KIKE/Downloads/ppos-pricing-engine-main/src/MarketplaceOfferMapper.js#L71-L73)):
$$\text{Precio Sugerido} = \frac{\text{Coste Total Industrial (incluye transporte)}}{1 - (\text{Margen Objetivo} / 100)}$$

En Control Plane ([orderQuoteRevisionService.js:754-770](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/orderQuoteRevisionService.js#L754-L770)):
$$\text{Precio Neto Revisado} = \frac{\text{Coste Industrial Revisado}}{1 - (\text{Margen Objetivo} / 100)}$$

$$\Delta \text{Neto} = \text{Precio Neto Revisado} - \text{Precio Neto Base}$$

La fórmula del divisor de margen es idéntica en ambos sistemas.

---

## 3. Comportamiento ante Diferenciales Positivos, Negativos y Cero

| Escenario Delta | Afectación Coste Papel | Cálculo $\Delta$ Neto | Tratamiento en Revisión | Compuerta Financiera |
|---|---|---|---|---|
| **Delta Positivo** (ej. Offset 90g $\to$ Offset 120g) | Incremento de kilos y coste ($\Delta \text{Coste} > 0$) | $\Delta \text{Neto} > 0$ | Requiere aceptación del cliente. Si $\Delta \text{Neto} > 50$ €, exige OTP obligatorio. | Pasa a `PAYMENT_PENDING`. Exige cobro del suplemento. |
| **Delta Cero** (ej. sustitución por equivalente de igual gramaje y tarifa) | Sin cambio en coste ($\Delta \text{Coste} = 0$) | $\Delta \text{Neto} = 0.0000$ | Notificación al cliente. No exige OTP (umbral 0 $\le$ 50€). | Pasa inmediatamente a `PASSED`. |
| **Delta Negativo** (ej. sustitución por gramaje inferior o tarifa menor) | Reducción de kilos y coste ($\Delta \text{Coste} < 0$) | $\Delta \text{Neto} < 0$ | Aceptación del cliente del cambio técnico a menor precio. | **Defecto**: Se marca como `PASSED` pero no se crea orden de reembolso ni crédito a favor del cliente. |

---

## 4. Limitación de Fixtures y Pruebas Unitarias

La prueba unitaria [budget02c01_order_quote_revisions.test.js](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/tests/budget02c01_order_quote_revisions.test.js) pasa al 100% únicamente porque el fixture `baselineCalculationFixture` define:
```json
{
  "breakdown": {
    "freight_cost": 0.00,
    "total_industrial_cost": 1147.30
  }
}
```
Al tener un transporte de 0.00 € en el fixture, la discrepancia de `technical_costs_for_transport` queda enmascarada matemáticamente. Por tanto, el éxito de los tests unitarios **no constituye prueba de paridad para talleres con transporte dependiente de costes técnicos**.
