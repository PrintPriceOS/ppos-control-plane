# ORDEN PAPER-MATERIALS-RECOVERY-06 — Verificación E2E en Vivo: Spine Calculator, BPE y Budget App (Fase 4)

**Proyecto:** PrintPrice OS  
**Entornos Verificados en Vivo:** `https://budget.printprice.pro` + `https://control.printprice.pro`  
**Script de Verificación Playwright + API:** `run_recovery_06_browser_e2e.py`  
**Resultado JSON en Vivo:** `verify_live_recovery_06_results.json` (`2026-10-28T23:09:13Z`)  
**Estado:** **`PASS (9/9 comprobaciones verificadas)`**

---

## 1. Cobertura Real del Catálogo en Producción Tras `RECOVERY-06` (`/api/budget/paper/search`)

Al consultar las **1.524 variantes** a través del BFF productivo de Budget App (`/api/budget/paper/search`), la nueva distribución real es:

| Métrica del Catálogo Productivo (`1.524` Variantes) | Antes de `RECOVERY-06` (Tras `04`) | Cambio en `RECOVERY-06` | **Después de `RECOVERY-06` (En Vivo)** |
| :--- | :---: | :---: | :---: |
| **Variantes con espesor (`caliperUm > 0`)** | `1.171` (`76,84 %`) | **`+65`** (`60` D1 + `5` D2) | **`1.236` (`81,10 %`)** |
| **Variantes sin espesor (`caliperUm IS NULL`)** | `353` (`23,16 %`) | `-65` | **`288` (`18,90 %`)** |
| **Variantes clasificadas (`paperType != 'OTHER'`)** | `1.002` (`65,75 %`) | **`+185`** (`176` A + `9` C) | **`1.187` (`77,89 %`)** |
| **Variantes pendientes en `OTHER` / `UNKNOWN`** | `522` (`34,25 %`) | `-185` | **`337` (`22,11 %`)** |
| **Variantes con `grainDirection = 'UNKNOWN'`** | `1.522` | `0` | **`1.522`** (`2` verificadas intactas) |
| **Conflictos históricos de espesor preservados** | `9` | `0` | **`9` (`100 %` preservados)** |

### Distribución por Categoría (`paperType`), Recubrimiento (`coatingStatus`) y Acabado (`finish`):
- **`paperType`**: `COATED: 567`, `OFFSET: 400`, `DESIGN: 111`, `CARTON: 109`, `OTHER: 337`.
- **`coatingStatus`**: `COATED: 657`, `UNCOATED: 503`, `ONE_SIDE_COATED: 27`, `UNKNOWN: 337`.
- **`finish`**: `UNCOATED: 503`, `SILK: 299`, `MATT: 186`, `GLOSS: 102`, `SEMI_GLOSS: 11`, `COATED: 9`, `OTHER: 77`, `UNKNOWN: 337`.

---

## 2. Verificación en Navegador Real (Playwright) y Cálculos de Spine Calculator con Espesores Recuperados

Iniciando sesión como tester en `https://budget.printprice.pro` (`demo.printhouse@printprice.pro`, tenant `ph-6544e95d`):

### Escenario A — Variante con Clasificación (Grupo C) + Espesor por Fuente Archivada (D2) Recuperados en `06`:
- **Cubierta seleccionada**: *MultiArt Gloss 250 64x90* (`var_872fd511f0e13034`, recuperada en `06` como `COATED · GLOSS` y **`193 µm`**).
  - **Renderizado real en DOM**: `250 GSM · GLOSS · Grain unspecified · 193 µm · 640x900`.
- **Interior seleccionado (Pestaña `Offset / Uncoated`)**: *Munken Print Cream 15 100 72x102 FSC* (`var_3d45d076a5d30a41`, recuperada en `06` como `OFFSET · UNCOATED` y **`150 µm`**).
  - **Renderizado real en DOM**: `100 GSM · UNCOATED · Grain unspecified · 150 µm · 720x1020`.
- **Cálculo real de Spine Calculator (`/api/budget/spine/calculate`, 200 páginas, `170 x 240 mm`, `GLUED`)**:
  - **Bloque neto de papel (`netPaperBlockMm`)**: $\frac{200}{2} \times 0,150\text{ mm} =$ **`15,0 mm`**.
  - **Ancho de lomo (`spineWidthMm`)**: **`16,0 mm`**.
  - **Ancho total de cubierta abierta (`flatCoverWidthMm`)**: $170 \times 2 + 16,0 + 6,0 =$ **`362,0 mm`**.
  - **Bloqueo de liberación industrial (`manufacturingValidation`)**:
    - `caliperConfidenceSummary`: **`"REFERENCE_IMPORTED"`**
    - `canReleaseToManufacturing`: **`false`** (`requiresTechnologistApproval: true`).

### Escenario B — Variante con Clasificación (Grupo A) + Espesor por Formato Hermano (D1) Recuperados en `06`:
- **Interior seleccionado**: *Amber Graphic 150 92x60 FSC* (`var_9cfd7a780ea44b24`, recuperada en `06` como `OFFSET · UNCOATED` y **`178 µm`** desde su hermano `var_9c4d5757b6971e0a`).
- **Cálculo real de Spine Calculator (200 páginas, `170 x 240 mm`, `GLUED`)**:
  - **Bloque neto de papel (`netPaperBlockMm`)**: $\frac{200}{2} \times 0,178\text{ mm} =$ **`17,8 mm`**.
  - **Ancho de lomo (`spineWidthMm`)**: **`18,5 mm`**.
  - **Ancho total de cubierta abierta (`flatCoverWidthMm`)**: **`364,5 mm`**.
  - **Bloqueo de liberación industrial**: `canReleaseToManufacturing: false` (`caliperConfidenceSummary: "REFERENCE_IMPORTED"`).

---

## 3. Verificación de Integridad Comercial BPE (Variación `0,00 €`) y Aislamiento Multi-Tenant

- **Aislamiento Multi-Tenant**: Sesión autenticada bajo `tenant_id = "ph-6544e95d"` (`demo.printhouse@printprice.pro`).
- **Integridad de Precios y Ofertas BPE (`/api/budget/calculate`)**:
  - Configuración de referencia: `1.000` ejemplares, `200` páginas, `170 x 240 mm`, encuadernación cosida rústica (`thread_sewn_sc`), interior *Amber Graphic 100 64x90 FSC* (`var_7b7e3a2a2a4a0313`, `122 µm`), cubierta *Galerie Art Matt 250 64x90 FSC* (`var_9dabfd7ac5eff6ca`, `225 µm`).
  - **Oferta BPE antes de `RECOVERY-06`**: **`2.169,88 €`**
  - **Oferta BPE después de `RECOVERY-06`**: **`2.169,88 €`**
  - **Deriva de precio (`priceDriftEur`)**: **`0,00 €`**.

