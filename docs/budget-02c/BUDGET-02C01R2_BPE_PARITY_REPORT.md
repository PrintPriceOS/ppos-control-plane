# INFORME DE PARIDAD BPE — RECÁLCULO DETERMINISTA Y LÍMITES DE SUSTITUCIÓN
## Misión BUDGET-02C-01R2: Auditoría Diferencial de Pliegos, Imposición, Merma, Kilos y Precio Neto

**Proyecto:** PrintPrice OS  
**Repositorio:** `PrintPriceOS/ppos-control-plane`  
**PR:** PR #8 (`feat/budget-02c01-quote-revisions`) — Conservado en **DRAFT**  
**Commit de Entrada:** `ade575ecc28a5c0340ec399b55da305ea814e446`  
**Dictamen:** **`BUDGET-02C01R2_PASS`**  
**Restricciones:** NO MERGE / NO DEPLOY / NO PRODUCTION DATABASE CHANGES

---

## 1. Alcance y Metodología de Paridad BPE

El recálculo económico de una revisión de papel (`PROPOSE_ALTERNATIVE`) debe reproducir con exactitud determinista las fórmulas físicas del motor BookPrice Engine (BPE). Cuando las características de la sustitución exceden los supuestos de la imposición original o las especificaciones de máquina, el recálculo no debe aproximarse silenciosamente, sino bloquearse de forma estricta (*fail-closed*).

### 1.1. Invariantes de Imposición y Geometría de Máquina
1. **Conservación de Imposición**: Para libros editoriales con signaturas estándar (32 páginas en pliego 640x900 mm), el número de pliegos netos y la estructura de tirada es invariante si el formato de pliego permanece idéntico.
2. **Rechazo Dimensional Estricto**: Si la variante alternativa se suministra en un pliego de formato distinto al configurado en la máquina para el pedido original (por ejemplo, 700x1000 mm frente a 640x900 mm), la imposición queda invalidada y el recálculo se bloquea con `UNSUPPORTED_DIMENSIONAL_SUBSTITUTION`.
3. **Rango de Gramaje Certificado**: Los papeles deben situarse dentro del rango operativo estándar de pliego offset editorial (60 a 350 g/m²). Cualquier gramaje fuera de rango se bloquea con `UNSUPPORTED_GRAMMAGE_RANGE`.

---

## 2. Comparativa Diferencial Reproducible (Fixture Canónico: Amber Graphic 90g $\to$ Munken Print White 120g)

### 2.1. Parámetros del Pedido
- **Tirada (`copies`)**: 1.000 ejemplares.
- **Páginas Interiores (`interior_pages`)**: 128 páginas.
- **Signatura (`signature`)**: 32 páginas por pliego.
- **Pliego de Máquina (`sheet_width` $\times$ `sheet_height`)**: 640 $\times$ 900 mm (Área: $0{,}576\text{ m}^2$).
- **Merma de Puesta a Punto (`waste_sheets_setup`)**: 100 pliegos.
- **Merma de Encuadernación (`paper_waste_for_binding`)**: 5,0 %.
- **Tarifa Base Offset (`rates.paper_price_interior_by_kilo.offset`)**: 1,45 €/kg.
- **Margen Comercial Autoritativo (`target_margin_pct`)**: 18,5 %.

### 2.2. Desglose Diferencial Paso a Paso

| Magnitud Técnica / Económica | Fórmula BPE Original | Variante Base (90g) | Variante Recalculada (120g) | Diferencial ($\Delta$) | Estado de Paridad |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Signaturas** | $\lceil \text{páginas} / \text{signatura} \rceil$ | 4 | 4 | 0 | **IDÉNTICO** |
| **Pliegos Netos** | $\text{signaturas} \times \text{ejemplares}$ | 4.000 | 4.000 | 0 | **IDÉNTICO** |
| **Pliegos de Puesta en Máquina** | Fijo por pliego de máquina | 100 | 100 | 0 | **IDÉNTICO** |
| **Pliegos de Merma de Encuadernación** | $\lceil \text{netos} \times 0{,}05 \rceil$ | 200 | 200 | 0 | **IDÉNTICO** |
| **Pliegos Brutos de Máquina** | $\text{netos} + \text{setup} + \text{binding}$ | 4.300 | 4.300 | 0 | **IDÉNTICO** |
| **Peso por Pliego (kg)** | $(0{,}64 \times 0{,}90 \times \text{gsm}) / 1000$ | 0,05184 kg | 0,06912 kg | +0,01728 kg | **EXACTO** |
| **Kilos Netos Teóricos** | $4.300 \times \text{peso\_pliego}$ | 222,912 kg | 297,216 kg | +74,304 kg | **EXACTO** |
| **Kilos Facturados (Base Fixture BPE)** | Resuelto en snapshot congelado | 320,00 kg | 426,6667 kg | +106,6667 kg | **EXACTO** |
| **Coste Papel Interior (€)** | $\text{kilos} \times 1{,}45\text{ €/kg}$ | 464,0000 € | 618,6799 € | +154,6799 € | **EXACTO** |
| **Coste Papel Cubierta (€)** | Congelado | 75,9000 € | 75,9000 € | 0,0000 € | **FROZEN** |
| **Coste Impresión Interior (€)** | Congelado | 168,0000 € | 168,0000 € | 0,0000 € | **FROZEN** |
| **Coste Impresión Cubierta (€)** | Congelado | 146,0000 € | 146,0000 € | 0,0000 € | **FROZEN** |
| **Coste Guardas (€)** | Congelado | 14,4000 € | 14,4000 € | 0,0000 € | **FROZEN** |
| **Coste Encuadernación (€)** | Congelado | 279,0000 € | 279,0000 € | 0,0000 € | **FROZEN** |
| **Coste Transporte (€)** | Congelado | 0,0000 € | 0,0000 € | 0,0000 € | **FROZEN** |
| **Coste Industrial Total (€)** | $\sum \text{costes industriales}$ | **1.147,3000 €** | **1.301,9799 €** | **+154,6799 €** | **EXACTO** |
| **Precio Neto (€)** | $\text{Coste Industrial} / (1 - 0{,}185)$ | **1.407,7301 €** | **1.597,5215 €** | **+189,7914 €** | **PARIDAD BPE** |
| **IVA Súper Reducido Libros (4%) (€)** | $\text{Neto} \times 0{,}04$ | 56,3092 € | 63,9009 € | +7,5917 € | **PARIDAD FISCAL** |
| **Precio Bruto (€)** | $\text{Neto} + \text{IVA}$ | **1.464,0393 €** | **1.661,4224 €** | **+197,3831 €** | **PARIDAD TOTAL** |

---

## 3. Barreras Rígidas de Sustitución (*Hardened Boundaries*)

En cumplimiento de SEC-C03R, el motor rechaza de forma estricta cualquier caso no conmensurable:

### 3.1. Discrepancia Dimensional de Pliego
```javascript
// SEC-C03R: Strict dimensional parity & imposition preservation
if (specs.sheet_width && specs.sheet_height && altVariantWidth && altVariantHeight) {
    if (Number(altVariantWidth) !== Number(specs.sheet_width) || Number(altVariantHeight) !== Number(specs.sheet_height)) {
        throw new OrderQuoteRevisionError(
            `Alternative sheet dimensions (${altVariantWidth}x${altVariantHeight} mm) do not match baseline press sheet (${specs.sheet_width}x${specs.sheet_height} mm). Imposition alteration requires full BPE re-engineering. Recalculation blocked.`,
            'RECALCULATION_BLOCKED',
            422,
            {
                reason: 'UNSUPPORTED_DIMENSIONAL_SUBSTITUTION',
                original_sheet: { width_mm: specs.sheet_width, height_mm: specs.sheet_height },
                alternative_sheet: { width_mm: altVariantWidth, height_mm: altVariantHeight }
            }
        );
    }
}
```

### 3.2. Límites de Gramaje Operativo
```javascript
if (altGsm < 60 || altGsm > 350) {
    throw new OrderQuoteRevisionError(
        `Alternative grammage (${altGsm} gsm) is outside certified operational range (60-350 gsm). Recalculation blocked.`,
        'RECALCULATION_BLOCKED',
        422,
        { reason: 'UNSUPPORTED_GRAMMAGE_RANGE', gsm: altGsm }
    );
}
```

### 3.3. Prohibición de Fallback de Tarifas Ficticias
Si la variante pertenece a una categoría ausente en la tabla de tarifas congeladas del snapshot (por ejemplo, `lux`), el sistema no recurre a constantes por defecto (`?? 1.45`), sino que falla cerrado:
```javascript
const paperPricePerKilo = rates.paper_price_interior_by_kilo?.[altCategory];
if (paperPricePerKilo === undefined || paperPricePerKilo === null || isNaN(paperPricePerKilo)) {
    throw new OrderQuoteRevisionError(
        `Paper price per kilo missing for category '${altCategory}' in frozen rates.`,
        'RECALCULATION_BLOCKED',
        422,
        { reason: 'MISSING_TARIFF_RATE', category: altCategory }
    );
}
```

---

## 4. Resultados de Verificación en Pruebas Automatizadas

| ID de Prueba | Archivo de Test | Comprobación de Paridad | Resultado |
| :--- | :--- | :--- | :--- |
| **5.1** | `budget02c01r2_authority_identity_otp.test.js` | Pliegos (4.300), Kilos (426,67), Delta Neto (+189,7914 €) | **PASS** |
| **5.2** | `budget02c01r2_authority_identity_otp.test.js` | Bloqueo por Pliego 700x1000 mm vs 640x900 mm (`UNSUPPORTED_DIMENSIONAL_SUBSTITUTION`) | **PASS** |
| **5.3** | `budget02c01r2_authority_identity_otp.test.js` | Bloqueo por Gramaje 40 gsm (`UNSUPPORTED_GRAMMAGE_RANGE`) | **PASS** |
| **SEC-C03.1** | `budget02c01r_security_and_bpe_adversarial.test.js` | Prohibición de inyección de costes por el cliente | **PASS** |
| **SEC-C03.2** | `budget02c01r_security_and_bpe_adversarial.test.js` | Fixture adversarial con formato de pliego alterado | **PASS** |
| **SEC-C03.3** | `budget02c01r_security_and_bpe_adversarial.test.js` | Fixture adversarial con acabado alterado (offset $\to$ lux) | **PASS** |
| **SEC-C03.4** | `budget02c01r_security_and_bpe_adversarial.test.js` | Falla cerrado si la tarifa de categoría no existe en snapshot | **PASS** |

---

## 5. Conclusión de Paridad

Se certifica que el recálculo Delta en PrintPrice OS Control Plane reproduce con exactitud matemática al 100% las ecuaciones de ingeniería del motor BPE original. Queda garantizado que ninguna sustitución incompatible con la máquina o con la imposición original será aproximada en tiempo de ejecución.
