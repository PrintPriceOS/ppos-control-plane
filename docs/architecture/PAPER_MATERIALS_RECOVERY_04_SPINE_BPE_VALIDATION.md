# PAPER-MATERIALS-RECOVERY-04 — Validación Productiva Post-Actualización (Catálogo, Spine Calculator, BPE y Multi-Tenant)

**Proyecto:** PrintPrice OS  
**Misión:** `PAPER-MATERIALS-RECOVERY-04 — Actualización productiva controlada de 943 variantes`  
**Entorno:** Producción (`https://control.printprice.pro` y `https://budget.printprice.pro`)  
**Revisiones desplegadas:**  
- **Control Plane (`PrintPriceOS/ppos-control-plane`)**: PR #13 (`feat/paper-materials-recovery-03r`, commit `3874c42b180d7ac03ec2974bc746be8b9657a001`)  
- **Budget App (`PrintPriceOS/PrintPricePro_BookPrice`)**: PR #4 (`feat/paper-materials-recovery-03`, commit `b6cadb58df069ccfb3d3a587d98e728f50e2e2c2`, bundle `index-DIYvoL-J.js`)  
**Estado:** **PASS (`10/10` comprobaciones de la Sección 6 superadas)**

---

## 1. Verificación de los 10 Puntos Obligatorios (Sección 6)

| # | Punto de Verificación (Sección 6) | Evidencia Real en Producción (`212.227.79.67`) | Resultado |
| :---: | :--- | :--- | :---: |
| **1** | **`943` variantes actualizadas según matriz** | `modifiedVariantsTotal = 943`, `modifiedProductsTotal = 941` (`1` producto compartido *Efalin FINE LINEN* omitido deliberadamente para proteger su variante en revisión `var_9ebc604670dc6622`). | **PASS** |
| **2** | **`0` cambios fuera de las `943` variantes elegibles** | `modifiedVariantsOutside943Count = 0`. Las `581` variantes excluidas (`501` `STRONG_MATCH_REVIEW`, `62` `ATTRIBUTE_CONFLICT`, `16` `AMBIGUOUS_MATCH`, `2` `ALREADY_VERIFIED`) permanecen intactas en `Control`. | **PASS** |
| **3** | **`1.171` espesores preservados (`0` diferencias de caliper)** | `with_caliper = 1.171`, `without_caliper = 353`, `conflictsPreservedAfter = 9`, `caliperAndCommercialDiffsCount = 0`. Ningún valor de `caliper_um`, `caliper_mm`, `bulk_factor`, `caliper_source` o `caliper_confidence_status` fue alterado. | **PASS** |
| **4** | **`Grain` mantenido como `UNKNOWN` donde no exista evidencia** | `1.522` variantes mantienen `grain_direction = 'UNKNOWN'` (`Grain unspecified` en UI) y las `2` variantes previamente verificadas (`ALREADY_VERIFIED`) conservan su dirección acreditada. `0` direcciones de fibra inventadas. | **PASS** |
| **5** | **`0` cambios en precios, ofertas o márgenes** | `CHECKSUM TABLE Control.supplier_paper_offers` = `3737849396` (idéntico antes y después). Cálculo BPE en vivo para `1.000` ejemplares (`200` págs., `170×240 mm`, *Amber Graphic 100g* + *Galerie Art Matt 250g*) = **`2.169,88 EUR`** (`0,00 EUR` de variación respecto a la línea base `SPINE-06R` / `RECOVERY-02`). | **PASS** |
| **6** | **Segunda ejecución con `0` filas modificadas** | `PASS_2_IDEMPOTENCY_VERIFICATION`: `totalVariantsUpdated = 0`, `totalProductsUpdated = 0`, `totalVariantsAlreadyUpToDate = 943`. | **PASS** |
| **7** | **Visualización correcta de `Finish`, `Coating` y `Paper Type` en Control Plane y Budget App** | `/api/budget/paper/search` y `/api/v1/paper-suppliers/catalog` exponen `paperType`, `coatingStatus`, `coatingConfidence`, `finish` y `originalCode`. En `budget.printprice.pro`, las pestañas de categoría (`Coated / Silk-Gloss`, `Offset / Uncoated`, `Carton / Board`, `Design / Munken`) filtran los materiales enriquecidos y muestran `MATT` / `SILK` / `UNCOATED` + `Grain unspecified`. | **PASS** |
| **8** | **Ausencia de etiquetas falsas `UNCOATED` en variantes no acreditadas** | Las variantes excluidas en revisión cuyo valor por defecto histórico en BD era `UNCOATED` sin acreditación (p. ej. `var_6ebb28170a7e23bd` *G-Print 100 64x90 FSC* en `STRONG_MATCH_REVIEW` o `var_9ebc604670dc6622` *Efalin FINE LINEN 1020x720*) devuelven `finish: 'UNKNOWN'`, `coatingStatus: 'UNKNOWN'`, `coatingConfidence: 'UNVERIFIED_DEFAULT'`, eliminando falsos positivos `UNCOATED`. | **PASS** |
| **9** | **Cálculo correcto de Spine Calculator con variantes actualizadas** | Con *Arctic Volume White 100 64x90 FSC* (`var_2fe248b6fda72977`, actualizado a `COATED / MATT`, `110 µm`) y `200` páginas `GLUED`: `netPaperBlockMm = 11.0 mm`, `spineWidthMm = 12.0 mm`, `flatCoverWidthMm = 358.0 mm`. Con *Amber Graphic 100 64x90 FSC* (`var_7b7e3a2a2a4a0313`, actualizado a `OFFSET / UNCOATED`, `122 µm`) y `200` páginas `SEWN`: `netPaperBlockMm = 12.2 mm`, `spineWidthMm = 14.0 mm`, `flatCoverWidthMm = 360.0 mm`. | **PASS** |
| **10** | **Aislamiento multi-tenant y bloqueo de liberación industrial intactos** | Solicitudes sin sesión reciben `403 TENANT_CONTEXT_REQUIRED`; intentos de suplantación o lectura cruzada entre `ph-demo-123` y `ph-6544e95d` reciben `403 FORBIDDEN_TENANT_MISMATCH`; la verificación de liberación a fabricación sobre perfiles `REFERENCE_IMPORTED` mantiene `canReleaseToManufacturing: false` y devuelve `422 MANUFACTURING_RELEASE_BLOCKED_UNCERTIFIED_PROFILE`. | **PASS** |

---

## 2. Evidencia de API y UI por Familia Representativa (`1.524` Variantes en Vivo)

### 2.1 Familias Actualizadas (`SAFE_UNIQUE_MATCH`) y Casos Especiales (Sección 3)

| Variante (`variantId`) | Producto (`productName`) | Subconjunto | `category` / `paperType` | `coatingStatus` | `finish` | `caliperUm` | `originalCode` |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| `var_923efe17ac1ca8da` | `G-Print 80 64x90` | `SAFE_UNIQUE_MATCH` | `COATED` / `COATED` | `COATED` | `MATT` | `77 µm` | `116175` |
| `var_2fe248b6fda72977` | `Arctic Volume White 100 64x90 FSC` | `SAFE_UNIQUE_MATCH` | `COATED` / `COATED` | `COATED` | `MATT` | `110 µm` | `594272` |
| `var_73f8e82ef6117012` | `Galerie Art Silk 100 64x90 FSC` | `SAFE_UNIQUE_MATCH` | `COATED` / `COATED` | `COATED` | `SILK` | `82 µm` | `6693` |
| `var_9dabfd7ac5eff6ca` | `Galerie Art Matt 250 64x90 FSC` | `SAFE_UNIQUE_MATCH` | `COATED` / `COATED` | `COATED` | `MATT` | `225 µm` | `401208` |
| `var_7b7e3a2a2a4a0313` | `Amber Graphic 100 64x90 FSC` | `SAFE_UNIQUE_MATCH` | `OFFSET` / `OFFSET` | `UNCOATED` | `UNCOATED` | `122 µm` | `5315` |
| `var_b2a4e8013433fac1` | `Multicolor Special MCS GD3 400g 530my 70x100` | `SAFE_UNIQUE_MATCH` (Multivariante 1/2) | `CARTON` / `CARTON` | `ONE_SIDE_COATED` | `OTHER` | `530 µm` | `0310-400g-7...` |
| `var_70729aed0b243b2e` | `Multicolor Special MCS GD3 400g 530my 70x100` | `SAFE_UNIQUE_MATCH` (Multivariante 2/2) | `CARTON` / `CARTON` | `ONE_SIDE_COATED` | `OTHER` | `530 µm` | `0310-400g-1...` |
| `var_85c142a50239e312` | `Efalin FINE LINEN 130 (Light Blue) 120 102x70` (`1020x700`) | `SAFE_UNIQUE_MATCH` (Multivariante elegible) | `OTHER` / `DESIGN` | `UNCOATED` | `UNCOATED` | `162 µm` | `Efalin FINE...` |
| `var_9ebc604670dc6622` | `Efalin FINE LINEN 130 (Light Blue) 120 102x70` (`1020x720`) | `STRONG_MATCH_REVIEW` (Multivariante excluida) | `OTHER` / `OTHER` | `UNKNOWN` | `UNKNOWN` | `162 µm` | `15672130` |
| `var_6ebb28170a7e23bd` | `G-Print 100 64x90 FSC` | `STRONG_MATCH_REVIEW` (Excluida honesta) | `OTHER` / `OTHER` | `UNKNOWN` | `UNKNOWN` | `98 µm` | `116375` |

### 2.2 Distribución Viva en el Endpoint `/api/budget/paper/search` (`1.524` Variantes)

- **Total de variantes servidas:** `1.524`
- **Con caliper (`withCaliper`):** `1.171` (`76,84 %`)
- **Sin caliper (`withoutCaliper`):** `353` (`23,16 %`)
- **`paperType` resuelto por servidor:**
  - `COATED`: `506`
  - `OTHER` (variantes en revisión sin categoría específica): `416`
  - `OFFSET`: `384`
  - `CARTON`: `109`
  - `DESIGN`: `109` (incluyendo la variante elegible `var_85c142a50239e312` de *Efalin FINE LINEN*)
- **`coatingStatus` resuelto por servidor:**
  - `COATED` (acreditado): `596`
  - `UNCOATED` (acreditado): `485`
  - `UNKNOWN` (variantes excluidas sin acreditación): `416`
  - `ONE_SIDE_COATED` (acreditado): `27`
- **`finish` resuelto por servidor:**
  - `UNCOATED` (acreditado en `ods_materials_recovery` o `ALREADY_VERIFIED`): `485`
  - `UNKNOWN` (variantes excluidas donde se suprimió el falso `UNCOATED`): `416`
  - `SILK`: `294`
  - `MATT`: `130`
  - `COATED`: `103`
  - `OTHER`: `77`
  - `SEMI_GLOSS`: `11`
  - `GLOSS`: `8`
