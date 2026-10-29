# PAPER-MATERIALS-RECOVERY-07W — Validación E2E en Spine Calculator, Budget App y BPE

**Misión:** `PAPER-MATERIALS-RECOVERY-07W`  
**Fecha de verificación E2E:** `2026-10-29T10:01:52Z`  
**Entornos verificados:**  
- **Budget App (Producción / Testers):** `https://budget.printprice.pro`  
- **Control Plane (Producción / Testers):** `https://control.printprice.pro`  
- **Base de datos productiva:** MySQL `Control` (`212.227.79.67`)  
**Tenant autenticado en prueba real:** `demo.printhouse@printprice.pro` (`tenant_id = ph-6544e95d`)  

---

## 1. Verificación del Catálogo Vivo BFF (`/api/budget/paper/search`)

Se paginó el catálogo completo expuesto por Control Plane a través de Budget App (`/api/budget/paper/search?limit=100&offset=0..1500`):

| Métrica en Catálogo Productivo | Antes de `RECOVERY-07W` | Después de `RECOVERY-07W` | Estado |
| :--- | :---: | :---: | :---: |
| Total de variantes (`totalVariants`) | `1.524` | **`1.524`** | `PASS` |
| Variantes con espesor (`withCaliper`) | `1.236` (`81,10 %`) | **`1.272`** (`83,46 %`, **`+36`**) | `PASS` |
| Variantes sin espesor (`withoutCaliper`) | `288` (`18,90 %`) | **`252`** (`16,54 %`, **`-36`**) | `PASS` |
| Variantes con `grainDirection = 'UNKNOWN'` | `1.522` | **`1.522`** (`0` cambios) | `PASS` |
| Variantes con `grainDirection != 'UNKNOWN'` | `2` | **`2`** (`0` cambios) | `PASS` |
| Variantes con `caliper_confidence_status = 'VERIFIED'` | `0` | **`0`** (`0` promociones automáticas) | `PASS` |

### Muestras verificadas en API vivo (`/api/budget/paper/search`):
| `variantId` | Producto | Origen Aplicado | `caliperUm` Antes | `caliperUm` Después | Estado |
| :--- | :--- | :--- | :---: | :---: | :---: |
| `var_e9b970adf34027f1` | *Munken Print White 18 115 72x102 FSC* | `LIVONIA_REFERENCE_IMPORT` (`Cell R39`) | `null` | **`209 µm`** | `PASS` |
| `var_337668698c5acef2` | *Munken Kristall 170 90x64 FSC* | `MANUFACTURER_DATASHEET` (`Page 2`) | `null` | **`192 µm`** | `PASS` |
| `var_586f4ee2a7c797c7` | *Munken Kristall 240 102x72 FSC* | `MANUFACTURER_DATASHEET` (`Page 2`) | `null` | **`271 µm`** | `PASS` |
| `var_d9defc9b19b9adbf` | *Invercote G 380 64x90* | `MANUFACTURER_DATASHEET` (`Page 6`) | `null` | **`505 µm`** | `PASS` |
| `var_6c9d63c6a90f9071` | *GALERIE FINE gloss 80 64x90* | `SUPPLIER_IMPORT` (Hermano `E522=65`) | `null` | **`65 µm`** | `PASS` |
| `var_ef95d9c7874f1e50` | *Maxima Volume 150 102x72 FSC* | `SUPPLIER_IMPORT` (Hermano `E885=162`) | `null` | **`162 µm`** | `PASS` |
| `var_015ca99a30bee286` | *PrintSpeed Laser Jet 120g 45x32* | `SUPPLIER_IMPORT` (Hermano `E1399=133`) | `null` | **`133 µm`** | `PASS` |
| `var_dbd5357075534e3b` | *Nevia Plus C1S 80g 71my 52X72cm* | **Excluida Fase 1** (`E1224="0"`) | `null` | **`null`** (Preservado) | `PASS` |
| `var_737c9a59216f4bf2` | *Priplak Cristal + 0.5 mm 72x102 Transpar...* | **Excluida Fase 1** (`E1403="0"`) | `null` | **`null`** (Preservado) | `PASS` |
| `var_ae7dbf443ceab19a` | *Galerie Art Matt 250 46x64 FSC* | **Conflicto Histórico #7** | `225 µm` | **`225 µm`** (Preservado) | `PASS` |

---

## 2. Cálculos Reales en Spine Calculator y Visualización en Budget App (Playwright Chromium)

Con sesión real en `https://budget.printprice.pro` (`demo.printhouse@printprice.pro`, formato `170 x 240 mm`, `200 páginas` = `100 hojas`, encuadernación rústica encolada `perfect_bound`, perfil `livonia-alegro-softcover@2.0.0`):

| Papel Seleccionado en UI | `variant_id` | Etiqueta Renderizada en Selector UI | `caliper_source` | `netPaperBlockMm` (200 pp) | `spineWidthMm` | `flatCoverWidthMm` | `caliperConfidenceSummary` | `canReleaseToManufacturing` |
| :--- | :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| **Munken Print White 18 115 72x102 FSC** (Interior) | `var_e9b970adf34027f1` | `115 GSM · UNCOATED · Grain unspecified · 209 µm · 720x1020` | `LIVONIA_REFERENCE_IMPORT` | **`20,9 mm`** | **`22,0 mm`** | **`368,0 mm`** | `REFERENCE_IMPORTED` | **`false`** (Bloqueado) |
| **Munken Kristall 170 90x64 FSC** (Interior) | `var_337668698c5acef2` | `170 GSM · UNKNOWN · Grain unspecified · 192 µm · 900x640` | `MANUFACTURER_DATASHEET` | **`19,2 mm`** | **`20,0 mm`** | **`366,0 mm`** | `REFERENCE_IMPORTED` | **`false`** (Bloqueado) |
| **GALERIE FINE gloss 80 64x90** (Interior) | `var_6c9d63c6a90f9071` | `80 GSM · COATED · Grain unspecified · 65 µm · 640x900` | `SUPPLIER_IMPORT` | **`6,5 mm`** | **`7,5 mm`** | **`353,5 mm`** | `REFERENCE_IMPORTED` | **`false`** (Bloqueado) |
| **Invercote G 380 64x90** (Cubierta) | `var_d9defc9b19b9adbf` | `380 GSM · OTHER · Grain unspecified · 505 µm · 640x900` | `MANUFACTURER_DATASHEET` | — (Cubierta `505 µm`) | — | — | `REFERENCE_IMPORTED` | **`false`** (Bloqueado) |

---

## 3. Verificación de Invarianza Comercial y BPE (`0,00 €` de Deriva)

Se ejecutó el cálculo completo de oferta en `https://budget.printprice.pro` (`POST /api/budget/calculate`) con la configuración de referencia (*Amber Graphic 100 64x90 FSC* interior + *Galerie Art Matt 250 64x90 FSC* cubierta, `170 x 240 mm`, `200 pp`, `thread_sewn_sc`, `1.000 ejemplares`):

- **Oferta BPE antes de `RECOVERY-07W`:** `2.169,88 EUR`
- **Oferta BPE después de `RECOVERY-07W`:** **`2.169,88 EUR`**
- **Deriva de precios (`priceDriftEur`):** **`0,00 EUR`**
- **Checksum `Control.supplier_paper_offers`:** **`3737849396`** (sin variación).
