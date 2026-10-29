# PAPER-MATERIALS-RECOVERY-07V — Auditoría Final de Evidencias Individualizadas

**Proyecto:** PrintPrice OS  
**Repositorio:** `PrintPriceOS/ppos-control-plane`  
**Rama / PR:** `feat/paper-materials-recovery-05` ([PR #14](https://github.com/PrintPriceOS/ppos-control-plane/pull/14) $\to$ `feat/spine-03r-caliper-and-engine`)  
**Misión:** `PAPER-MATERIALS-RECOVERY-07V`  
**Alcance:** Revisión individualizada y reproducción documental de las **72 propuestas** de recuperación de espesor (`caliper_um`) emitidas en `RECOVERY-07` sobre el universo de **288 variantes** sin espesor, **sin ejecutar escrituras en producción**.

> [!IMPORTANT]
> **Doble Veredicto Oficial de `PAPER-MATERIALS-RECOVERY-07V`**:
> - **`RECOVERY_07V_READY_FOR_WRITE_APPROVAL`**: **38 variantes** acreditadas con evidencia primaria verificable e inequívoca (**32** por ficha técnica oficial de fabricante en PDF con tabla/página/fila explícita + **3** por referencia importada verificada celda a celda en el Excel Livonia / ODS original + **3** por formato hermano técnicamente idéntico en la misma subserie).
> - **`RECOVERY_07V_DOCUMENTATION_PENDING`**: **250 variantes** retenidas y protegidas frente a escritura (**34** propuestas de `RECOVERY-07` reclasificadas tras esta auditoría estricta + **216** variantes ya retenidas en `RECOVERY-07`).

---

## 1. Resumen Ejecutivo y Segregación Estricta de las 288 Variantes

Siguiendo la directriz rectora de esta misión (*«prefiero recuperar 40 con evidencia sólida que introducir 72 valores cuya procedencia no podamos demostrar»*), se ha auditado cada una de las 72 propuestas de `RECOVERY-07` exigiendo documento primario verificable (PDF técnico directo con tabla ISO 534 o coordenada exacta de hoja/fila/celda en `Spine calculation.xlsx` / `Paper data base.ods.zip`).

| Categoría Documental (`RECOVERY-07V`) | Propuestas en `REC-07` | Acreditadas en `REC-07V` (`READY_FOR_WRITE`) | Reclasificadas en `REC-07V` (`DOCUMENTATION_PENDING`) | Estado en `MySQL Control` (`db_caliper_source` / `db_caliper_confidence_status`) |
| :--- | :---: | :---: | :---: | :--- |
| **1. Ficha técnica oficial verificada (`MANUFACTURER_DATASHEET_VERIFIED`)** | 53 | **32** | **21** | `DATASHEET_VERIFIED` / `REFERENCE_IMPORTED` |
| **2. Referencia proveedor / Livonia (`SUPPLIER_REFERENCE_IMPORTED`)** | 4 | **3** | **1** | `LIVONIA_REFERENCE_IMPORT` o `SUPPLIER_IMPORT` / `REFERENCE_IMPORTED` |
| **3. Propagación por formato hermano (`SIBLING_FORMAT_DOCUMENTED`)** | 15 | **3** | **12** | `SUPPLIER_IMPORT` / `REFERENCE_IMPORTED` |
| **Subtotal Evaluado de las 72 Propuestas** | **72** | **38** | **34** | **38 listas para aprobación de escritura; 34 retenidas** |
| **4. Sin evidencia suficiente (`DOCUMENTATION_REQUIRED`)** | 67 | 0 | **100** *(67 + 33)* | Sin escritura (`NONE` / `MISSING`) |
| **5. Medición física en planta (`PHYSICAL_MEASUREMENT_REQUIRED`)** | 144 | 0 | **145** *(144 + 1)* | Sin escritura (`NONE` / `MISSING`) — incluye *Geltex, Efalin, Wibalin, Surbalin* |
| **6. Bloqueo por conflicto (`CONFLICT_HOLD`)** | 5 | 0 | **5** | Sin escritura (`NONE` / `MISSING`) + **9 conflictos históricos preservados** |
| **Total Universo sin Espesor (`288` variantes)** | **288** | **38 (13,19 %)** | **250 (86,81 %)** | **Proyección tras `07V`: `1.274 / 1.524` (`83,60 %`) con espesor** |

---

## 2. Verificación de las 53 Fichas Oficiales (`MANUFACTURER_DATASHEET_VERIFIED`)

Se inspeccionaron individualmente las 53 filas propuestas como `MANUFACTURER_DATASHEET_VERIFIED` en `RECOVERY_07_MANUFACTURER_EVIDENCE.csv`. Una URL genérica de portada del fabricante (`https://www.papyrus.com/`, `https://www.antalis.es/`, `https://www.gmund.com/`) o un resumen comercial sin acceso al PDF primario **no** se acepta como evidencia suficiente.

### 2.1. Variantes Acreditadas con PDF Técnico Directo (`32` variantes $\to$ `RECOVERY_07V_READY_FOR_WRITE_APPROVAL`)

Cada una de las 32 variantes siguientes cuenta con URL directa al documento técnico en PDF, fabricante, familia, subserie, acabado, gramaje, color/grupo cromático y referencia exacta de página, tabla y fila:

| Fabricante / Molino | Familia y Subserie | Variantes (`variant_id` y Producto) | Gramaje | Espesor (`µm`) | Documento Primario y URL Directa | Fecha / Revisión | Página, Tabla y Celda / Fila |
| :--- | :--- | :--- | :---: | :---: | :--- | :--- | :--- |
| **Arctic Paper Munkedal** | *Munken Kristall* (Smooth, `1.13 cm³/g`) | `var_337668698c5acef2` (*Munken Kristall 170 90x64 FSC*)<br>`var_586f4ee2a7c797c7` (*Munken Kristall 240 102x72 FSC*) | `170g`<br>`240g` | **`192 µm`**<br>**`271 µm`** | *Technical Sheet Munken Kristall EN* — `https://www.polyedra.fr/medias/sys_master/documents/h68/hfa/9077762949150/TechnicalSheetMunkenKristallEN/TechnicalSheetMunkenKristallEN.pdf` | `Rev. TechnicalSheetMunkenKristallEN` | Pág. 1, Tabla *Technical specifications Munken Kristall*, Filas `170 g/m² -> Thickness 192 µm (Bulk 1.13)` y `240 g/m² -> Thickness 271 µm (Bulk 1.13)` |
| **Holmen Iggesund** | *Invercote G* (SBB / GZ Board) | `var_d9defc9b19b9adbf` (*Invercote G 380 64x90*) | `380g` | **`505 µm`** | *Invercote G General Technical Information* — `https://image.igepa.de/file/P7001311853_Invercote_G_General_Technical_Information_igepa.pdf` | `Doc ID P7001311853` | Pág. 2, Tabla *Invercote G Specification*, Fila `Grammage 380 g/m² (ISO 536)` $\to$ Columna `Thickness 505 µm (±4%, ISO 534)` |
| **Holmen Iggesund** | *Incada Silk* (GC1 Folding Box Board) | `var_3810dbfc361594d9` (*INCADA SILK 280 64x92 FSC*) | `280g` | **`445 µm`** | *Incada Silk Technical Data Sheet* — `https://www.ebbgroup.com/uploads/2/6/4/2/26429893/datasheet_incada_silk.pdf` (y `https://pim.igepa.nl/Paper%20&%20Board/Karton/Vouwkarton%20(GC)/Incada%20Silk/Incada%20silk%20Productblad_IgepaNL.pdf`) | `Holmen Iggesund Incada Silk TDS` | Pág. 1, Tabla *Technical Specification Incada Silk*, Fila `Grammage 280 g/m² (ISO 536)` $\to$ Columna `Thickness 445 µm / 17.6 pt (±4%, ISO 534)` |
| **Billerud** | *CrownBoard Craft* (CUK Board) | `var_b56fd736fb2364c1` (*CrownBoard Craft 345 72x102*) | `345g` | **`535 µm`** | *Billerud CrownBoard Craft Technical Data Sheet* — `https://www.billerud.se/globalassets/billerud/packaging-materials/tds/billerud_crownboard-craft_tech_data_sheet_2025.08.pdf` | `Rev. 2025.08` | Pág. 1, Tabla *Property / Typical values*, Fila `Basis weight 345 g/m² (ISO 536)` $\to$ Columna `Caliper 535 µm / 21.1 pt (±4%, ISO 534)` |
| **Mondi** | *PERGRAPHICA Classic Rough* | `var_ebd54628ffb83779` (*PERGRAPHICA Classic Rough 240 72x102 FSC*) | `240g` | **`328 µm`** | *PERGRAPHICA Rough Datenblatt* — `https://image.igepa.de/file/IGEPA_43727_PERGRAPHICA_rough_Datenblatt.pdf` | `Doc ID IGEPA_43727` | Pág. 1, Tabla *Technische Daten PERGRAPHICA Rough*, Fila `240 g/m² (ISO 536)` $\to$ Columna `Dicke 328 ± 7 µm (ISO 534)` |
| **Umka Cardboard Mill** | *Umka Color GD2* | `var_65a8f7c69b84369c` (*Umka Color 300 70x100*)<br>`var_bb8139b48c741830` (*Umka Color 350 70x100*) | `300g`<br>`350g` | **`390 µm`**<br>**`450 µm`** | *TDS GD2 Umka Color* — `https://www.umka.rs/wp-content/uploads/2023/01/TDS-GD2-Umka-Color.pdf` | `Rev. 2023-01` | Pág. 1, Tabla *Specification GD2 Umka Color*, Filas `300 g/m² -> Thickness 390 µm (±5%, ISO 534)` y `350 g/m² -> Thickness 450 µm (±5%, ISO 534)` |
| **Favini** | *Burano Pastel & Bright Colours* (`13` variantes) | `var_13b509db7a5a7451` (*05 Salmon 140*)<br>`var_e4f82edf80f8012b` (*14 Stone Grey 140*)<br>`var_939baa2efe3449cb` (*bright 49 140*)<br>`var_91206d683ff22395` (*bright 55 Blue 140*)<br>`var_3cbab58b9d9dd650` (*bright 56 Orange 140*)<br>`var_6a31a00f77eac78d` (*Light Gold 11 140*)<br>`var_5f887ec026691b8a` (*Nr.58 Cyclamen Pink 140*)<br>`var_d11c0801ff7755b5` (*Nr.54 140g*)<br>`var_00efa33b21795f15` (*Nr.61 Scarlet Red 140*)<br>`var_1c7627f955b5448a` (*Nr.69 Indian Red 140*)<br>`var_42f5cc5ae0637b87` (*Pastel 07 Yellow 140g*)<br>`var_921f0f007f2db8ed` (*Pastel Nr.08 140*)<br>`var_16f616d88874c4f5` (*50 Shocking Pink 200*) | `140g` (×12)<br>`200g` (×1) | **`170 µm`** (140g)<br>**`234 µm`** (200g) | *Technical Sheet Burano EN* — `https://www.polyedra.fr/medias/sys_master/documents/haf/h1d/8989249601566/TechnicalSheetBuranoEN/TechnicalSheetBuranoEN.pdf` + *Range Chart Burano* — `https://www.favini.com/gs/wp-content/uploads/2023/04/range-chart-Burano-1.pdf` | `Rev. TechnicalSheetBuranoEN` / `2023-04` | Pág. 1, Tabla *Pastel and Bright Colours*: Fila `140 g/m² -> Thickness 170 µm (±5%, ISO 534)` y Fila `200 g/m² -> Thickness 234 µm (±5%, ISO 534)`. Todos los códigos (`05, 07, 08, 11, 14, 49, 50, 54, 55, 56, 58, 61, 69`) están verificados en `range-chart-Burano-1.pdf` dentro de Pastel/Bright (y coinciden con `Burano Bright 69 Indian Red 250g = 288 µm` en catálogo). |
| **Favini** | *Burano Black (Nero Notte Nr. 63)* (`2` variantes) | `var_3cab347d98e6bafb` (*Burano 63 Nero black 140 70x100*)<br>`var_4d8611e0419fa40a` (*Burano nr. 63 Nero black, 250 70x100*) | `140g`<br>`250g` | **`172 µm`**<br>**`290 µm`** | *Características Técnicas Burano Nero* — `https://www.updirecto.es/module/obs_up_integracion/documents/?pdf&product_id=682&filename=Q2FyYWN0ZXJpc3RpY2FzIFTDmmNuaWNhcyBCdXJhbm8gTmVyby5wZGY=` | `Favini-Burano-Nero-TDS` | Pág. 1, Tabla *Burano Black / Nero (ISO 534)*: Fila `140 g/m² -> Caliper 172 µm (±5%, Bulk 1.23)` y Fila `250 g/m² -> Caliper 290 µm (±5%)` (coincide con `Burano nero Nr.63 320g = 390 µm` en catálogo). |
| **Antalis / Arjowiggins** | *Curious Collection — Curious Metallics* (`9` variantes) | `var_60bdb834a734e688` (*Ice Silver 120g*)<br>`var_f1bbba47708846c3` (*Super gold 120g*)<br>`var_46ac13d951f62d83` (*Galvanised 120*)<br>`var_0fd60daa43c9c4c1` (*300 Ice Gold*)<br>`var_d1012514b8afd728` (*300 Super Gold*)<br>`var_8616f3e654ae65e1` (*Galvanised 300*)<br>`var_f112de8410ac56c8` (*300 Iceberg*)<br>`var_3c97f45aabbd2894` (*Electric Blue 300g*)<br>`var_5bf7f1cd390daf3a` (*Lustre 300g*) | `120g` (×3)<br>`300g` (×6) | **`157 µm`** (120g)<br>**`400 µm`** (300g) | *Technical Data Sheet Curious Collection* — `https://kppantalis.com/wp-content/uploads/2023/10/TS_EN_Curious_Collection_00_25092023.pdf` (y `https://www.antalis.co.uk/_media/files/UK/what-we-do/print/products/curious-collection/curious-technical-data-sheet`) | `Rev. 00 — 25/09/2023` | Sección *Curious Metallics — Technical Specifications (ISO 534)*: Fila `120 g/m² -> Thickness 157 µm` y Fila `300 g/m² -> Thickness 400 µm`. |

### 2.2. Propuestas de Ficha Técnica Reclasificadas a `DOCUMENTATION_REQUIRED` (`21` variantes $\to$ `RECOVERY_07V_DOCUMENTATION_PENDING`)

La auditoría individual detectó **discrepancias en fuentes primarias**, **ambigüedad de subserie** o **ausencia de URL directa al PDF técnico** en 21 de las 53 propuestas. Todas ellas han sido reclasificadas a `DOCUMENTATION_REQUIRED`:

1. **`var_fb2a8f3e2fe2f0d0` (*Nautilus SuperWhite 160 64x90*, `160g`) y `var_0a232e062bba2a81` (*Nautilus SuperWhite 350 g/m B1*, `350g`)**:
   - *Hallazgo crítico*: En `RECOVERY-07` se propuso `160 µm` para `160 g/m²` a partir de un resumen secundario, pero la tabla técnica oficial de KPP Antalis / Mondi para *Nautilus® SuperWhite* (`ISO 534`) especifica **`196 ± 5 µm`** para `160 g/m²` (y `450 ± 10 µm` para `350 g/m²`), además de citar una URL genérica (`https://www.mymondi.net/`). Se reclasifican ambas variantes a `DOCUMENTATION_REQUIRED`.
2. **`var_74c119b5749f8722` (*Fedrigoni Sirio Ultra black 280 gm 72x102*, `280g`)**:
   - *Hallazgo crítico*: En `RECOVERY-07` se propuso `330 µm`, pero la ficha técnica oficial de Fedrigoni *Sirio Ultra Black* (`ISO 534`) especifica **`370 ± 4% µm`** para `280 g/m²` (mientras que `330 µm` corresponde a otra referencia). Se reclasifica a `DOCUMENTATION_REQUIRED`.
3. **`var_dce57fdd8e56067c` (*Olin Design Smooth 200 72x102 Ultimate White*, `200g`)**:
   - *Hallazgo crítico*: Discrepancia entre resúmenes de distribuidor (`204 µm` en `purelypaper.co.uk` frente a **`194 µm` / bulk `0.97 cm³/g`** en la tabla técnica ISO 534 de Antalis EE / Masterpiece DK), sin URL directa al PDF primario. Se reclasifica a `DOCUMENTATION_REQUIRED`.
4. **`var_78eeb512252f2d98` (*Ensocoat 275g 102x72*, `275g`)**:
   - *Hallazgo crítico*: La denominación en el catálogo y en la fila `#253` del ODS (`Ensocoat 275g 102x72`, código `88218631`) no especifica si la subserie es **Ensocoat 1S** (C1S, ~`355-365 µm`) o **Ensocoat 2S** (C2S, ~`330 µm`). Conforme al apartado 1 de la orden (*«Subserie, superficie, gramaje y color cuando afecten al espesor»*), se reclasifica a `DOCUMENTATION_REQUIRED`.
5. **`var_897a47f784db60d8` (*KRAFTLINER PROVANTAGE 125 70x100*, `125g`)**:
   - El valor de `187 µm` provenía de un estudio académico (*Polimi / ResearchGate*) y no de una ficha técnica oficial de Mondi en PDF. Se reclasifica a `DOCUMENTATION_REQUIRED`.
6. **`var_9bb4094aff71a872` (*Splendorgel E.W. 300 45x64*, `300g`)**:
   - El valor de `315 µm` procede de multiplicar `300 g/m² × 1.05 cm³/g` (VSA publicado por Fedrigoni) en una web de distribuidor, no de una tabla primaria de micras medidas en PDF oficial. Conforme a la prohibición de derivar espesor desde `gsm × bulk` sin acreditación expresa, se reclasifica a `DOCUMENTATION_REQUIRED`.
7. **Entradas que citaban URL genérica de portada o dominio sin PDF técnico directo (`14` variantes)**:
   - `var_59ea39c77a5c9fbd` (*Balance Silk 130 46x64* — citaba `https://www.papyrus.com/`).
   - `var_321ee9ca05450fca` (*Serixo 90 72x52 FSC* — citaba `https://www.antalis.co.uk/`).
   - `var_3d4c4c6b76317c37` (*Image Digicolor 90g 45x64* — citaba `https://www.antalis.co.uk/`).
   - `var_461d8b9ba2b0b8cc` (*Gmund Color System Metallic 50 blanc 260* — citaba `https://www.gmund.com/`).
   - `var_10c768331b38915c` y `var_7f139c0667b2098d` (*Priplak Opaline 273g* y *455g* — citaban `https://www.antalis.de/` sin PDF directo).
   - `var_6b178658448ce948`, `var_53074163da87b009` y `var_f989b6f4fd9d4b96` (*Rives Design 120g*, *Rives Linear 120g* y *Rives Shetland 250g* — citaban `https://www.antalis.es/` sin PDF directo).
   - `var_01dc1655c73d9d1d`, `var_1e404d0fa54d0cf2`, `var_202cd6db89d271da`, `var_a4dccfaa28c6be72` y `var_e8c10d5a017046de` (*Pop'Set 120g* ×5 colores — citaban `https://www.antalis.lv/` sin PDF directo y con horquilla de distribuidor `147–153 µm`).

---

## 3. Verificación de las 15 Variantes por Formato Hermano (`SIBLING_FORMAT_DOCUMENTED`)

Conforme al apartado 2 de la misión, se exigió simultáneamente: (a) misma familia y subserie, (b) mismo gramaje, (c) misma composición y acabado, (d) cero divergencias de espesor y (e) procedencia documentada del hermano original, rechazando coincidencias parciales o entre colores/tonos distintos.

### 3.1. Formatos Hermanos Acreditados (`3` variantes $\to$ `RECOVERY_07V_READY_FOR_WRITE_APPROVAL`)

| `variant_id` Destino | Producto Destino | Formato Destino | `variant_id` Hermano Fuente | Producto Hermano Fuente y Coordenada ODS | Gramaje | Espesor (`µm`) | Verificación de Equivalencia Técnica |
| :--- | :--- | :---: | :--- | :--- | :---: | :---: | :--- |
| `var_6c9d63c6a90f9071` | *GALERIE FINE gloss 80 64x90* | `640×900` | `var_4754d3a2eeb5d5b2` | *GALERIE FINE G 80 72x102* (`Paper data base.ods.zip :: Sheet1`, Fila `#518`, `fileRowNumber 522`, Celda `C522`, Código `3054`, Celda `K522 = 65`, Celda `L522 = 0.065`) | `80g` | **`65 µm`** | Mismo fabricante (Sappi), misma subserie (*Galerie Fine Gloss*), mismo gramaje (`80g`) y acabado (*Gloss*). Cero divergencias en todo el catálogo (`90g = 72 µm` en los 4 formatos). |
| `var_ef95d9c7874f1e50` | *Maxima Volume 150 102x72 FSC* | `1020×720` | `var_84b91b1fcfe9a59d` | *Maxima Voule 150 90x64 FSC* (`Paper data base.ods.zip :: Sheet1`, Fila `#881`, `fileRowNumber 885`, Celda `C885`, Código `max volme 150 90x64`, Celda `K885 = 162`, Celda `L885 = 0.162`) | `150g` | **`162 µm`** | Misma subserie exacta (*Maxima Volume*, bulk `1.08 cm³/g`), mismo gramaje (`150g`) y acabado (*Matt*). Consistente con *Volume Maxima 200 90x64 FSC* (`200g = 216 µm`, bulk `1.08`). |
| `var_015ca99a30bee286` | *PrintSpeed Laser Jet 120g 45x32* | `450×320` | `var_9164f93b039773bd` | *Print Speed Laser Jet, 120g, 45x64cm* (`Paper data base.ods.zip :: Sheet1`, Fila `#1395`, `fileRowNumber 1399`, Celda `C1399`, Celda `K1399 = 133`, Celda `L1399 = 0.133`) | `120g` | **`133 µm`** | Misma subserie explícita (*Print Speed Laser Jet*), mismo gramaje (`120g`) y acabado (*Uncoated*). El formato `45×32 cm` es el medio pliego exacto del formato `45×64 cm`. |

### 3.2. Propuestas de Formato Hermano Reclasificadas a `DOCUMENTATION_REQUIRED` (`12` variantes $\to$ `RECOVERY_07V_DOCUMENTATION_PENDING`)

1. **Diferencia de subserie nominal (`Print Speed` estándar vs `Print Speed Laser Jet` — `3` variantes)**:
   - `var_a52282e5180d0d3b` (*Print Speed 100 72x102*), `var_4fade2216b6da976` (*Printspeed 120 64x90*) y `var_59ac0c5f627c9a5d` (*PrintSpeed 120g 72X102 FSC*) omiten la designación de subserie `Laser Jet` que sí tiene su fuente (`Print Speed Laser Jet`). Rechazadas por rigor de subserie.
2. **Divergencia de `1–2 µm` entre denominaciones en ODS/Livonia (`Galerie A Silk 90` — `1` variante)**:
   - `var_2a961015f775a4f7` (*Galerie A Silk 90 46x64 FSC*): en el ODS, *Galerie A Silk* y *Galerie Art Silk* presentan `1 µm` de diferencia en `150g` (`124 µm` vs `125 µm`) y `90g Gloss` (`66 µm` vs `67 µm`), además de figurar `76 µm` en el Excel Livonia (`Celda M49`) frente a `74 µm` en la fila `#517` del ODS. Rechazada por divergencia entre fuentes.
3. **Propagación entre tonos o colores distintos (`8` variantes)**:
   - `var_ea4e053e2cc01a28` (*Arena Rough Ivory 140g* desde *Arena Natural Rough 140g*).
   - `var_d6382607237e7511` y `var_df51ab48fb6bee6d` (*MultiDesign Original Natural 100g* y *300g* desde *MultiDesign Original White*).
   - `var_303c4d29091a0b5f`, `var_dadd87b51f6a6a43`, `var_289d4883082e6e4b`, `var_0dfa098d4381319e` y `var_96b5e3fe0ca4583b` (*Rainbow* ×5 colores distintos propagados desde otros colores en el ODS).

---

## 4. Verificación de las 4 Referencias Importadas (`SUPPLIER_REFERENCE_IMPORTED`)

Conforme al apartado 3 de la orden, se comprobaron directamente los valores en `Spine calculation.xlsx` (Livonia) y `Paper data base.ods.zip`, registrando hoja, fila y celda exactas, y manteniendo `caliper_confidence_status = 'REFERENCE_IMPORTED'` (sin equipararlas a certificación física de fabricante):

| `variant_id` | Producto | Gramaje | Veredicto `07V` | Valor Verificado | Coordenadas Exactas en Archivo Fuente (`Hoja :: Fila :: Celda`) | Hallazgo de Auditoría `07V` |
| :--- | :--- | :---: | :---: | :---: | :--- | :--- |
| `var_e9b970adf34027f1` | *Munken Print White 18 115 72x102 FSC* | `115g` | **`READY_FOR_WRITE`** | **`209 µm`** (`0.2090 mm`, bulk `1.8174`) | `Spine calculation.xlsx` :: Hoja `Papers`, Bloque `#24`, Cabecera `P31` (*Munken Print White*, bulk `1.8`), Celda GSM `P39 = 115`, **Celda Micras `R39 = 209`** (registro BD: `liv_ref_b24_p39_115g`) | **Corrección de precisión**: En `RECOVERY-07` se anotó `207 µm` (`115 × 1.8`), pero la celda real `R39` del Excel Livonia contiene **`209 µm`** (idéntico a *Munken Print Cream 18 115g* en la celda `AB39 = 209 µm`, ya aplicado en `RECOVERY-06`). Se corrige a **`209 µm`**. |
| `var_dbd5357075534e3b` | *Nevia Plus C1S 80g 71my 52X72cm* | `80g` | **`READY_FOR_WRITE`** | **`71 µm`** (`0.0710 mm`, bulk `0.8875`) | `Paper data base.ods.zip` :: Hoja `Sheet1`, Fila `#1220` (`fileRowNumber 1224`), Celda `A1224 = "0790-80g-52x72"`, **Celda `C1224 = "Nevia Plus C1S 80g 71my 52X72cm"`**, Celda `H1224 = 80` | Especificación nominal `71my` (`71 µm`) incrustada directamente en la celda `C1224` del catálogo original del proveedor. |
| `var_737c9a59216f4bf2` | *Priplak Cristal + 0.5 mm 72x102 Transparent* | `455g` | **`READY_FOR_WRITE`** | **`500 µm`** (`0.5000 mm`, bulk `1.0989`) | `Paper data base.ods.zip` :: Hoja `Sheet1`, Fila `#1399` (`fileRowNumber 1403`), Celda `A1403 = "6508761"`, **Celda `C1403 = "Priplak Cristal + 0.5 mm 72x102 Transparent"`**, Celda `H1403 = 455` | Especificación nominal `0.5 mm` (`500 µm`) incrustada directamente en la celda `C1403` del catálogo original del proveedor para lámina de polipropileno de `455 g/m²`. |
| `var_a7fc7fb8e188329b` | *Efalin FINE LINEN 116 (Red) 120 102x70* | `120g` | **`DOCUMENTATION_PENDING`** (`PHYSICAL_MEASUREMENT_REQUIRED`) | Retenido (`NULL`) | `Paper data base.ods.zip` :: Hoja `Sheet1`, Filas duplicadas `#201` (`fileRowNumber 205`, `microns = 0`) y `#202` (`fileRowNumber 206`, `microns = 165`) | **Retirado de la lista de escritura**: (1) Existe duplicidad en el ODS entre las filas `#201` (`0 µm`) y `#202` (`165 µm`), y (2) pertenece a la familia gofrada **Efalin**, reservada expresamente para la línea de medición física con micrómetro junto con *Geltex, Wibalin y Surbalin*. |

