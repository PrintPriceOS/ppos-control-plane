# BUDGET-02C-01R — Evidencia Exhaustiva de Paridad BPE y Fixtures Adversariales

**Proyecto:** PrintPrice OS  
**Repositorio:** `PrintPriceOS/ppos-control-plane`  
**PR:** #8 (`feat/budget-02c01-quote-revisions`), estado DRAFT  
**Misión:** `BUDGET-02C-01R`  
**Control Clave:** SEC-C03 (Paridad BPE Real) y SEC-C02 (Autoridad sobre Datos Económicos)  
**Dictamen:** `BUDGET-02C01R_PASS`  

---

## 1. Fundamentos del Motor BPE y Reproducibilidad Determinista

El motor BPE (Book Price Engine) opera calculando consumos físicos directos basados en especificaciones de pliego, imposición de páginas, gramaje del soporte papel, mermas de arranque y tarifas unitarias por kilogramo.

Bajo la misión **BUDGET-02C-01R**, se refactorizó la función [`recalculateDeterministicBpePrice()`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/orderQuoteRevisionService.js#L100-L280) para garantizar que la determinación de precios:
1. No dependa de aproximaciones lineales ni promedios ficticios.
2. Calcule los pliegos discretos reales necesarios para la tirada original y la variante alternativa.
3. Congele al 100% las partidas industriales no afectadas (cubierta, encuadernación, impresión y transporte).
4. Aplique la política de margen comercial del marketplace sin tolerar sustituciones ni inyecciones arbitrarias procedentes del cliente.
5. Falla en cerrado (`RECALCULATION_BLOCKED`) si falta el snapshot, el checksum de tarifas o la tarifa del tipo de papel solicitado.

---

## 2. Fórmulas Físicas y Económicas Certificadas

### 2.1. Superficie de Pliego y Pliegos Discretos de Tirada
El área del pliego se deriva de sus dimensiones nominales en milímetros:
$$\text{Área pliego } (m^2) = \frac{\text{ancho\_pliego\_mm} \times \text{alto\_pliego\_mm}}{1.000.000}$$

El peso por pliego según el gramaje nominal ($gsm$ en $g/m^2$) es:
$$\text{Peso pliego } (kg) = \text{Área pliego} \times \frac{gsm}{1.000}$$

A partir de los kilos netos registrados en el snapshot BPE original ($\text{kilos\_interior}$), el motor determina la cantidad de pliegos discretos impresos:
$$\text{Pliegos totales} = \text{round}\left(\frac{\text{kilos\_interior}}{\text{Peso pliego base}}\right)$$

### 2.2. Consumo y Coste de la Variante Alternativa
Para cualquier variante técnica sustitutiva (variando gramaje o tipo de papel), los pliegos se mantienen idénticos (mismo número de páginas e imposición), recalculando el peso total en kilos con 4 decimales:
$$\text{Kilos revisados} = \text{round4}\left(\text{Pliegos totales} \times \text{Área pliego} \times \frac{gsm_{\text{alt}}}{1.000}\right)$$

El coste revisado del papel interior se calcula contra la tarifa congelada por kilogramo del snapshot:
$$\text{Coste papel revisado} = \text{round2}(\text{Kilos revisados} \times \text{Tarifa}_{\text{kilo}})$$
$$\Delta \text{ Coste papel} = \text{Coste papel revisado} - \text{Coste papel original}$$

### 2.3. Partidas Industriales Congeladas (Invariancia al 100%)
Las siguientes partidas se transfieren sin modificación desde el snapshot baseline:
- `cover_paper_cost` (coste de papel de cubierta)
- `cover_print_cost` (impresión de cubierta)
- `interior_print_cost` (impresión de tripas)
- `endpapers_cost` (guardas)
- `binding_cost` (encuadernación)
- `freight_cost` (transporte)

$$\text{Coste industrial revisado} = \text{Coste industrial original} + \Delta \text{ Coste papel}$$

### 2.4. Aplicación Determinista del Margen Comercial
El precio neto de venta se determina aplicando el divisor de margen sobre el coste industrial:
$$\text{Divisor} = 1 - \frac{\text{Margen}\%}{100}$$
$$\text{Precio neto revisado} = \text{round4}\left(\frac{\text{Coste industrial revisado}}{\text{Divisor}}\right)$$
$$\Delta \text{ Precio neto} = \text{Precio neto revisado} - \text{Precio neto original}$$

---

## 3. Fixtures Adversariales y Comportamiento Verificado

La suite adversarial [`tests/budget02c01r_security_and_bpe_adversarial.test.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/tests/budget02c01r_security_and_bpe_adversarial.test.js) implementa y valida escenarios extremos:

### Fixture 1: Aumento de Gramaje Interior (90g $\to$ 120g Offset)
- **Especificaciones:** 1.000 ejemplares, 128 págs interiores, formato pliego 640x900 mm ($0,576\,m^2$), papel offset.
- **Tarifa:** 1,45 €/kg. Margen: 18,5%.
- **Cálculo Base:** 320 kg $\implies$ 464,00 € papel. Coste total: 1.147,30 €. Precio neto: 1.407,7301 €.
- **Pliegos totales:** $\text{round}(320 / (0,576 \times 0,090)) = 6.173\text{ pliegos}$.
- **Cálculo Revisado (120g):**
  - Kilos revisados: $6.173 \times 0,576 \times 0,120 = 426,6778\text{ kg}$.
  - Coste papel: $\text{round2}(426,6778 \times 1,45) = 618,68\text{ €}$.
  - $\Delta$ Papel: $618,68 - 464,00 = 154,68\text{ €}$.
  - Coste industrial revisado: $1.147,30 + 154,68 = 1.301,98\text{ €}$.
  - Precio neto revisado: $\text{round4}(1.301,98 / 0,815) = 1.597,5215\text{ €}$.
  - $\Delta$ Precio neto: $1.597,5215 - 1.407,7301 = \mathbf{189,7914\text{ €}}$.
- **Resultado en test:** **PASS** (189,7914 € exacto).

### Fixture 2: Cambio de Formato de Pliego (640x900 mm $\to$ 700x1000 mm)
- **Alteración:** Pliego mayor ($0,70\,m^2$), imposición readaptada.
- **Pliegos:** $\text{round}(320 / (0,70 \times 0,090)) = 5.079\text{ pliegos}$.
- **Consumo a 120g:** $5.079 \times 0,70 \times 0,120 = 426,636\text{ kg}$.
- **Coste papel:** $\text{round2}(426,636 \times 1,45) = 618,62\text{ €}$.
- **$\Delta$ Coste papel:** $618,62 - 464,00 = 154,62\text{ €}$.
- **Coste industrial:** $1.147,30 + 154,62 = 1.301,92\text{ €}$.
- **$\Delta$ Precio neto:** $\text{round4}(1.301,92 / 0,815) - 1.407,7301 = \mathbf{189,7178\text{ €}}$.
- **Resultado en test:** **PASS** (189,7178 € exacto).

### Fixture 3: Cambio de Categoría de Papel (Offset 90g $\to$ Lux 90g)
- **Alteración:** Mismo gramaje (90g), diferente calidad de papel (estucado arte / lux).
- **Tarifa:** Lux = 1,85 €/kg (vs offset = 1,45 €/kg).
- **Consumo:** $6.173 \times 0,576 \times 0,090 = 320,00832\text{ kg}$.
- **Coste papel:** $\text{round2}(320,00832 \times 1,85) = 592,02\text{ €}$.
- **$\Delta$ Coste papel:** $592,02 - 464,00 = 128,02\text{ €}$.
- **Coste industrial:** $1.147,30 + 128,02 = 1.275,32\text{ €}$.
- **$\Delta$ Precio neto:** $\text{round4}(1.275,32 / 0,815) - 1.407,7301 = \mathbf{157,0797\text{ €}}$.
- **Resultado en test:** **PASS** (157,0797 € exacto).

### Fixture 4: Intento Adversarial de Inyección de Coste de Cliente
- **Acción:** Cliente envía `clientOverrides: { interior_paper_cost_override: 100.00 }`.
- **Comportamiento:** Intercepción inmediata antes de procesar el recálculo.
- **Resultado:** Lanza `OrderQuoteRevisionError` con código `COST_OVERRIDE_PROHIBITED` (HTTP 400).
- **Resultado en test:** **PASS**.

### Fixture 5: Tarifa No Disponible en el Snapshot (Zero Fallback)
- **Acción:** Variante solicita `paper_type: 'unknown_synthetic_poly'`, ausente en la tabla de tarifas congeladas.
- **Comportamiento:** Falla en cerrado, sin asumir `1.45` ni tarifas de offset por defecto.
- **Resultado:** Lanza `OrderQuoteRevisionError` con código `RECALCULATION_BLOCKED` y razón `MISSING_TARIFF_RATE` (HTTP 422).
- **Resultado en test:** **PASS**.

### Fixture 6: Falta de Checksum de Tarifas o Engine Version
- **Acción:** Snapshot carece de `rates_checksum` o `bpe_engine_version`.
- **Comportamiento:** Bloqueo fail-closed de la emisión de la revisión.
- **Resultado:** Lanza `OrderQuoteRevisionError` con código `RECALCULATION_BLOCKED` (HTTP 422).
- **Resultado en test:** **PASS**.

---

## 4. Matriz Comparativa de Conciliación Numérica

| Variable BPE | Pedido Original (Snapshot) | Variante Gramaje (120g) | Variante Formato (700x1000) | Variante Calidad (Lux 90g) |
| :--- | :--- | :--- | :--- | :--- |
| **Pliegos de Tirada** | 6.173 pliegos | 6.173 pliegos | 5.079 pliegos | 6.173 pliegos |
| **Kilos Papel Interior** | 320,00 kg | 426,6778 kg | 426,6360 kg | 320,0083 kg |
| **Tarifa Papel (€/kg)** | 1,45 € | 1,45 € | 1,45 € | 1,85 € |
| **Coste Papel Interior** | 464,00 € | 618,68 € | 618,62 € | 592,02 € |
| **$\Delta$ Coste Papel** | 0,00 € | +154,68 € | +154,62 € | +128,02 € |
| **Cubierta (Papel + Imp)** | 221,90 € (congelado) | 221,90 € (congelado) | 221,90 € (congelado) | 221,90 € (congelado) |
| **Imp. Interior + Guardas**| 182,40 € (congelado) | 182,40 € (congelado) | 182,40 € (congelado) | 182,40 € (congelado) |
| **Encuadernación** | 279,00 € (congelado) | 279,00 € (congelado) | 279,00 € (congelado) | 279,00 € (congelado) |
| **Transporte** | 0,00 € (congelado) | 0,00 € (congelado) | 0,00 € (congelado) | 0,00 € (congelado) |
| **Coste Industrial Total** | **1.147,30 €** | **1.301,98 €** | **1.301,92 €** | **1.275,32 €** |
| **Margen Aplicado** | 18,50% | 18,50% | 18,50% | 18,50% |
| **Divisor de Margen** | 0,815 | 0,815 | 0,815 | 0,815 |
| **Precio Neto Venta** | **1.407,7301 €** | **1.597,5215 €** | **1.597,4479 €** | **1.564,8098 €** |
| **$\Delta$ Neto Facturable** | **0,0000 €** | **+189,7914 €** | **+189,7178 €** | **+157,0797 €** |

---

## 5. Conclusión de Certificación

Se certifica que `recalculateDeterministicBpePrice()` en [`orderQuoteRevisionService.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/orderQuoteRevisionService.js):
1. Cumple con la paridad BPE real sin simplificaciones arbitrarias.
2. Garantiza la invariabilidad total de las partidas no afectadas.
3. Rechaza de forma activa cualquier inyección o manipulación de precios.
4. Responde con precisión matemática de pliegos y divisores comerciales verificada al céntimo y cuarto decimal.
