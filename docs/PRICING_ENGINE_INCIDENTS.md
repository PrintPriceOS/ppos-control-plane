# Registro de Incidencias — Repository `@ppos/pricing-engine`

## Incidencia PE-2026-01: Cortocircuito prematuro en `coverPrintCost` cuando `costPrintInt === 0.0`

### Descripción del Problema
En `node_modules/@ppos/pricing-engine/src/PriceEngine.js`, función `coverPrintCost` (línea 411):

```javascript
function coverPrintCost(costPrintInt, rates, p, copies) {
    const coverPrintInt = parseInt(String(p.cover_print ?? '')[0] ?? '0', 10);
    let total = 0.0;

    if (costPrintInt === 0.0 || coverPrintInt === 6) return total;
    // ...
```

Cuando el coste de impresión interior `costPrintInt` es `0.0` (por ejemplo, cuando las tarifas de impresión interior para la signatura activa no están configuradas o valen 0 €), la función evalúa la condición `costPrintInt === 0.0` como `true` y **retorna de forma prematura `0.0 €`** sin llegar a consultar las tarifas activas de impresión de cubierta (`cover_fixed_by_colours` ni `cover_var_per_1000_by_colours`).

### Impacto
Incluso cuando un nodo de impresión tiene tarifas válidas y activas para impresión de cubierta 4/0 (ej. `cover_fixed_by_colours["4"] = 134.8284` y `cover_var_per_1000_by_colours["4"] = 25.5357`), el motor devuelve `0.00 €` para la cubierta si el interior se evalúa a cero.

### Estado
**Pendiente de revisión de contrato en el repositorio `@ppos/pricing-engine`**.
Se debe evaluar si `coverPrintCost` debe ser desacoplado del resultado de `costPrintInt` para permitir el cálculo independiente de cubiertas cuando el interior tenga tarifa 0 o requiera cotización separada.
