# SPINE-02/03 — Informe de Correspondencia Matemática e Industrial con Livonia Spine Calculator 2.0

**Misión:** `SPINE-02/03 — PAPER CALIPER + CONTROL PLANE SPINE ENGINE`  
**Fuente Matemática Original:** `Livonia print spine calculator 2.0 iekšējā lietošana.xlsx` (6 hojas, 63 controles VML)  
**Motor Control Plane:** [`src/api/services/spine/spineCalculationEngine.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/spine/spineCalculationEngine.js)  
**Servicio de Dominio:** [`src/api/services/spine/spineCalculationService.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/spine/spineCalculationService.js)  
**Rutas Protegidas:** [`src/api/routes/spineRoutes.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/routes/spineRoutes.js)

---

## 1. Separación Estricta de los 4 Niveles de Certificación (`CERTIFICATION_TIERS`)

En cumplimiento estricto de los principios de la misión, el motor y el modelo de base de datos ([`migrations/173_phase197b_spine_binding_profiles_and_snapshots.sql`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/migrations/173_phase197b_spine_binding_profiles_and_snapshots.sql)) distinguen explícitamente cuatro niveles de certificación que **jamás se declaran equivalentes**:

| Nivel de Certificación (`certification_tier`) | Definición Técnica Exacta | Perfiles en este Nivel | ¿Habilita Liberación Autónoma a Taller (`canReleaseToManufacturing`)? |
| :--- | :--- | :--- | :---: |
| **`EXCEL_EXAMPLE_PARITY`** | Coincide al 100 % con los valores cacheados en los ejemplos almacenados del libro Excel original, pero tiene ramas incompletas o está deshabilitado operativamente. | `livonia-colibri-flexi@2.0.0` (`EXPERIMENTAL_DISABLED`) | **NO (`false`)** |
| **`MATH_BRANCH_VALIDATED`** | Todas las ramas condicionales (`IF`), redondeos (`CEILING.MATH`, `FLOOR.MATH`, `MROUND` a `0.5 mm`), los 15 escalones de radio $R(x)$, las 4 ramas de `Uzaugums` y las tablas `Rastri` están verificadas con cobertura unitaria al 100 %. | `livonia-alegro-softcover@2.0.0` (`MATH_VALIDATED_ACTIVE`)<br>`livonia-colibri-hardcover@2.0.0` (`REQUIRES_TECH_APPROVAL`) | **NO (`false`)** |
| **`PRINTHOUSE_TECHNICALLY_VALIDATED`** | Las constantes y tolerancias del perfil han sido revisadas y validadas por un tecnólogo de encuadernación de una imprenta específica para su maquinaria real. | *Asignable por imprenta en `spine_binding_profiles`* | **NO (`false`)** |
| **`PRODUCTION_CERTIFIED`** | Certificado formalmente en planta con pruebas físicas de imposición/encuadernación y espesor de papel acreditado (`caliperConfidenceStatus === 'VERIFIED'`). | *Solo tras sign-off físico de planta en `spine_binding_profiles`* | **SÍ (`true`, solo si además `caliperConfidenceStatus === 'VERIFIED'`)** |

---

## 2. Correspondencia Exacta entre Etapas del Motor y Celdas de Livonia

El motor puro [`spineCalculationEngine.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/spine/spineCalculationEngine.js) desacopla los controles de interfaz Excel (`ComboBox`, `OptionButton`, `CheckBox` de `vmlDrawing1..5.vml`) y estructura el cálculo en cinco funciones puras y deterministas:

### 2.1 Etapa 1: `calculateBlockThickness(input)` — Grosor Neto de Bloque y Guardas

Para hasta dos segmentos interiores (`Lpp. 1` y `Lpp. 2`):

$$\text{segmentThicknessMm}_i = \frac{\text{pages}_i}{2} \times \frac{\text{caliperUm}_i}{1000}$$

$$\text{netPaperBlockMm} = \sum_{i=1}^{k} \text{segmentThicknessMm}_i$$

| Hoja Livonia | Celdas de Entrada | Celda de Salida en Excel | Fórmula Excel Original | Implementación en `calculateBlockThickness` |
| :--- | :--- | :--- | :--- | :--- |
| **Hoja 1** (`Mīkstais sējums Alegro`) | `C4` (Lpp.1), `C6` ($\mu\text{m}_1$), `E4` (Lpp.2), `E6` ($\mu\text{m}_2$) | `T7` / `T8` (neto por segmento) | `(C4/2)*(C6/1000)` y `(E4/2)*(E6/1000)` | `rawSegmentMm = (pages / 2) * (caliperUm / 1000)` |
| **Hoja 2** (`Mīk. sēj. ar atlokiem Alegro`) | `C4`, `C6`, `E4`, `E6` | `T7` / `T8` | `(C4/2)*(C6/1000)` y `(E4/2)*(E6/1000)` | Idéntico a Hoja 1 |
| **Hoja 3** (`Ciet. sēj. + Superv. Colibri`) | `C5`, `C7`, `E5`, `E7`, `Z5` (modo guardas) | `AE10` (neto papel)<br>`AF10` (con guardas) | `AE10 = (C5/2)*(C7/1000) + (E5/2)*(E7/1000)`<br>`AF10 = IF(Z5=1, AE10+0.7, AE10)` | `endpapersAllowanceMm = (endpapersMode === 'SEPARATE') ? 0.7 : 0`<br>`totalBlockWithEndpapersMm = netPaperBlockMm + endpapersAllowanceMm` |
| **Hojas 4 y 5** (`Flexi Colibri`) | `C4`, `C6`, `E4`, `E6`, `Z4` | `AE9` / `AF9` | `AF9 = IF(Z4=1, AE9+0.7, AE9)` | Soportado en modo auditoría (`allowExperimentalProfiles: true`), bloqueado en producción (`EXPERIMENTAL_DISABLED`). |

---

### 2.2 Etapa 2: `calculateBindingAdjustment(input, blockThickness, profile)` — Hinchamiento, Fresado, Cartón y Arco

#### A. Perfil `livonia-alegro-softcover@2.0.0` (Hojas 1 y 2 — Tren Alegro)
- **Cosido (`SEWN`, `Z7=1`):** suma $+1.0\text{ mm}$ si hay un segmento activo (`T7`) y $+1.0\text{ mm}$ adicional si el segundo segmento tiene páginas (`E4 > 0`), más dos espesores de cartulina de cubierta:
  $$\text{rawSpineSewnMm} = (\text{seg}_1 + 1.0) + (\text{seg}_2 > 0 \ ? \ \text{seg}_2 + 1.0 : 0) + 2 \times \frac{\text{coverCaliperUm}}{1000}$$
- **Fresado/Encolado (`GLUED`, `Z7=2`):** aplica el factor de cola `1.04` a cada segmento activo más dos espesores de cubierta:
  $$\text{rawSpineGluedMm} = (\text{seg}_1 \times 1.04) + (\text{seg}_2 \times 1.04) + 2 \times \frac{\text{coverCaliperUm}}{1000}$$

#### B. Perfil `livonia-colibri-hardcover@2.0.0` (Hoja 3 — Línea Colibri)
- **Hinchamiento por costura (`Uzaugums`, celda `AF11`):**
  1. **Papel estucado (`COATED`, `Z7=1`):** $\text{Uzaugums} = 0.7\text{ mm}$.
  2. **Papel no estucado (`UNCOATED`, `Z7=2`) con $\text{AF10} \le 29\text{ mm}$:** $\text{Uzaugums} = 1.5\text{ mm}$.
  3. **Papel no estucado (`UNCOATED`, `Z7=2`) con $\text{AF10} > 29\text{ mm}$ y pliego de $16\text{ pp}$ (`Z13=1`):**
     $$\text{Uzaugums} = \frac{\text{totalPages}}{16} \times 0.13\text{ mm}$$
  4. **Papel no estucado (`UNCOATED`, `Z7=2`) con $\text{AF10} > 29\text{ mm}$ y pliego de $32\text{ pp}$ (`Z13=2`):**
     $$\text{Uzaugums} = \frac{\text{totalPages}}{32} \times 0.13\text{ mm}$$
  - *Aviso obligatorio (`D29`):* cuando `blockPaperCoating === 'UNCOATED'` y $\text{AF10} > 29\text{ mm}$, el motor emite el warning `HARDCOVER_UNCOATED_OVER_29MM_TECH_CONSULT`.

- **Grosor del bloque con tapas de cartón (`Bloka biezums ar vākiem`, celdas `AF13..AF16`):**
  - `AF13` (Cosido + Lomo Redondo): $X_{\text{round,sewn}} = \text{AF10} + \text{AF11} + (2 \times \text{boardThicknessMm} - 0.5)$
  - `AF14` (Fresado + Lomo Redondo): $X_{\text{round,glued}} = \text{AF10} - 2.0 + (2 \times \text{boardThicknessMm})$
  - `AF15` (Cosido + Lomo Cuadrado): $X_{\text{square,sewn}} = \text{AF10} + \text{AF11} + (2 \times \text{boardThicknessMm})$
  - `AF16` (Fresado + Lomo Cuadrado): $X_{\text{square,glued}} = \text{AF10} - 2.0 + (2 \times \text{boardThicknessMm})$

- **Tabla Discreta de 15 Escalones de Radio $R(x)$ (`celdas AF17 / AF18`) y Desarrollo de Arco (`AF19 / AF20`):**
  Para lomo redondo (`ROUND`), el radio industrial de horma $R(x)$ se selecciona mediante los 15 escalones exactos de Colibri en [`resolveColibriRoundSpineRadiusMm`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/spine/spineCalculationEngine.js#L139-L162):

  | Rango de $x$ ($\text{mm}$) | Radio $R(x)$ ($\text{mm}$) | Rango de $x$ ($\text{mm}$) | Radio $R(x)$ ($\text{mm}$) | Rango de $x$ ($\text{mm}$) | Radio $R(x)$ ($\text{mm}$) |
  | :---: | :---: | :---: | :---: | :---: | :---: |
  | $x \le 10$ | **8.5** | $23 < x \le 27$ | **16.5** | $45 < x \le 52$ | **28.0** |
  | $10 < x \le 12$ | **10.0** | $27 < x \le 28$ | **18.0** | $52 < x \le 56$ | **30.0** |
  | $12 < x \le 16$ | **11.5** | $28 < x \le 33$ | **19.5** | $56 < x \le 63$ | **34.5** |
  | $16 < x \le 19$ | **12.5** | $33 < x \le 39$ | **22.0** | $63 < x \le 70$ | **38.0** |
  | $19 < x \le 23$ | **15.0** | $39 < x \le 45$ | **25.0** | $70 < x \le 78$ | **42.0** |

  Si $x > 78\text{ mm}$, Excel devuelve `"nav iespējams"` y el motor bloquea con `ROUND_SPINE_RADIUS_OVERFLOW_78MM`.  
  El desarrollo de arco (`calculateColibriArcLengthMm`) replica exactamente la fórmula trigonométrica de `AF19`/`AF20`:
  $$\text{arcLength}(x, R) = \frac{\pi \cdot R \cdot 2 \cdot \arcsin\left(\frac{x}{2R}\right) \cdot \frac{180}{\pi}}{180} = 2R \cdot \arcsin\left(\frac{x}{2R}\right)$$

---

### 2.3 Etapa 3: `calculateSpineWidth(...)` — Redondeo Industrial a Escalón de `0.5 mm`

| Perfil / Rama | Fórmula Excel de Redondeo | Función Equivalente en Motor |
| :--- | :--- | :--- |
| **Alegro Softcover — Cosido (`SEWN`)** | `CEILING.MATH(T10, 0.5)` | `excelCeilingMath05(rawSpineSewnMm)` |
| **Alegro Softcover — Fresado (`GLUED`)** | `FLOOR.MATH(T13, 0.5)` | `excelFloorMath05(rawSpineGluedMm)` |
| **Colibri Hardcover — Todas las ramas (`AF21..AF24`)** | `MROUND(val, 0.5)` | `excelMround05(rawSpineMm)` |
| **Sobrecubierta (`Supervāks`, `N16`)** | `I13 + 2` (si cartón $3.0\text{ mm}$) o `I13 + 1.5` (otros cartones) | `spineWidthMm + (boardThicknessMm === 3.0 ? 2.0 : 1.5)` |

---

### 2.4 Etapa 4: `calculateCoverGeometry(...)` — Cubierta Extendida, Cartones, `Rastri`, `Noloki` y Sobrecubierta

| Medida Geométrica | Celda Excel | Regla Matemática Exacta Implementada |
| :--- | :--- | :--- |
| **Tapa Blanda Estándar (`SOFTCOVER_STANDARD`)** | `I15` (ancho), `K15` (alto), `I17` (sangrado) | $\text{flatW} = 2 \cdot W + \text{spine}$, $\text{flatH} = H$, con sangre $+3\text{ mm}$ por lado ($\text{flatW}+6 \times \text{flatH}+6$). Hendidos laterales a $5.0\text{ mm}$. |
| **Tapa Blanda con Solapas (`SOFTCOVER_FLAPS`)** | `I15`, `I17`, `I18` | Con hendido de solapa de $1.0\text{ mm}$ por lado: $\text{flatW} = 2 \cdot (\text{flapW} + 1.0 + W) + \text{spine}$. |
| **Tapa Dura — Hendidos `Rastri` (`AG28`, `AG29`)** | `AG28` (Redondo), `AG29` (Cuadrado) | • **Redondo (`ROUND`):** $<30\text{ mm} \to 9\text{ mm}$; $30..39.99\text{ mm} \to 10\text{ mm}$; $\ge 40\text{ mm} \to 11\text{ mm}$.<br>• **Cuadrado (`SQUARE`):** si bloque $<5\text{ mm} \to 9\text{ mm}$; si $\ge 5\text{ mm}$ depende del cartón ($1.0 \to 9\text{ mm}$, $2.0 \to 10\text{ mm}$, $2.4 \to 12\text{ mm}$, $3.0 \to 13\text{ mm}$). |
| **Tapa Dura — Ancho de Cartón (`Pāpes platums`, `AF32..AF35`)** | `AF32..AF35`, `I23` | $\text{boardWidthMm} = (W + \text{boardWidthOverhangConstantMm}) - \text{hingeScoreRastriMm}$, donde la constante es $+1.0\text{ mm}$ (`AF32`: cosido redondo ceja $2.5\text{ mm}$), $+0.5\text{ mm}$ (`AF33`: fresado redondo ceja $2.5\text{ mm}$), $+2.5\text{ mm}$ (`AF34`: cuadrado ceja $2.5\text{ mm}$) o $+3.0\text{ mm}$ (`AF35`: ceja $3.0\text{ mm}$). |
| **Tapa Dura — Alto de Cartón (`Pāpes garums`, `AF38 / K23`)** | `AF38`, `K23` | $\text{boardHeightMm} = H + (\text{overhangMm} === 2.5 \ ? \ 5.0 : 6.0)$. |
| **Tapa Dura — Vueltas (`Noloki`, `AF41 / I25`)** | `AF41`, `I25` | $19.0\text{ mm}$ para cartón de $3.0\text{ mm}$; $18.0\text{ mm}$ para cartones de $1.0, 2.0, 2.4\text{ mm}$. |
| **Tapa Dura — Cubierta Extendida (`Izklājums`, `I19 x K19`)** | `I19`, `K19` | $\text{flatCoverWidthMm} = 2 \cdot (\text{turnInMm} + \text{boardWidthMm} + \text{hingeScoreRastriMm}) + \text{spineWidthMm}$<br>$\text{flatCoverHeightMm} = 2 \cdot \text{turnInMm} + \text{boardHeightMm}$ |
| **Tapa Dura — Lomo Interior (`Atstarpīte`, `I28 x K28`)** | `I28`, `K28` | $\text{spineHollowWidthMm} = \text{spineWidthMm} - 2.0$, $\text{spineHollowHeightMm} = \text{boardHeightMm}$. |
| **Sobrecubierta (`Supervāks`, `N16, N18, P18`)** | `N16`, `N18`, `P18` | $\text{dustJacketWidthMm} = 2 \cdot (\text{flapW} + 2.0 + \text{boardWidthMm} + \text{hingeScoreRastriMm}) + \text{dustJacketSpineMm}$, $\text{dustJacketHeightMm} = \text{boardHeightMm} + 1.0$. |

---

## 3. Verificación de Paridad al 100 % con los 5 Ejemplos Guardados en Livonia

Todos los valores intermedios y finales han sido contrastados automáticamente en [`tests/spine02_03_engine_and_api.test.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/tests/spine02_03_engine_and_api.test.js):

| # | Hoja Excel | Entrada Guardada en Excel | Valores Cacheados en Excel | Salida del Motor `SpineCalculator` | Estado |
| :---: | :--- | :--- | :--- | :--- | :---: |
| **1** | `Mīkstais sējums (Alegro)` | $220\text{ pp}$ @ $145\,\mu\text{m}$, $170\times 240\text{ mm}$, cubierta $270\,\mu\text{m}$ | `T7=15.95`, `T10=17.49`, `T11=17.5` (cosido), `T13=17.128`, `T14=17.0` (encolado), `I13=17.5`, `I15=357.5`, `K15=240`, `I17=363.5`, `K17=246` | `netPaperBlockMm=15.95`, `spineWidthMm=17.5` (SEWN) / `17.0` (GLUED), `flatCoverWidthMm=357.5`, `flatCoverWithBleedWidthMm=363.5` | **100 % PARIDAD** |
| **2** | `Mīk. sēj. ar atlokiem (Alegro)` | $504\text{ pp}$ @ $116\,\mu\text{m}$, $170\times 297\text{ mm}$, solapa $80\text{ mm}$, cubierta $350\,\mu\text{m}$ | `T7=29.232`, `T10=30.932`, `T11=31.0`, `I15=533.0`, `K15=297`, `I17=539.0`, `I18=371.0` | `netPaperBlockMm=29.232`, `spineWidthMm=31.0`, `flatCoverWidthMm=533.0`, `flatCoverWithoutFlapsWidthMm=371.0` | **100 % PARIDAD** |
| **3** | `Ciet. sēj. + Superv. (Colibri)` | $240\text{ pp}$ @ $175\,\mu\text{m}$ + $32\text{ pp}$ @ $115\,\mu\text{m}$, guardas separadas, cartón $3.0\text{ mm}$, redondo, ceja $2.5\text{ mm}$, sobrecubierta solapa $90\text{ mm}$ | `AE10=22.84`, `AF10=23.54`, `AF11=1.5`, `AF13=30.54`, `AF17=19.5`, `AF19=35.42415`, `AF21=35.5`, `AG28=10`, `I23=161.0`, `K23=245.0`, `I19=395.5`, `K19=283.0`, `I28=33.5`, `N16=37.5`, `N18=563.5`, `P18=246.0` | `netPaperBlockMm=22.84`, `totalBlockWithEndpapersMm=23.54`, `spineWidthMm=35.5`, `boardWidthMm=161.0`, `boardHeightMm=245.0`, `flatCoverWidthMm=395.5`, `flatCoverHeightMm=283.0`, `dustJacketWidthMm=563.5` | **100 % PARIDAD** |
| **4** | `Flexi (Colibri)` | $0\text{ pp}$, $170\times 240\text{ mm}$, guardas separadas (`Z4=1`) | `AE9=0`, `AF9=0.7`, `AF12=1.2`, `AF14=2.2`, `I12=2.0`, `I16=352.0`, `K16=252.0` | En modo auditoría reproduce `spineWidthMm=2.0`, `flatCoverWidthMm=352.0`, `flatCoverHeightMm=252.0`; en modo producción bloquea con `EXPERIMENTAL_PROFILE_DISABLED`. | **100 % PARIDAD (BLOQUEADO EN PROD)** |
| **5** | `Flexi ar atlokiem (Colibri)` | $0\text{ pp}$, $170\times 240\text{ mm}$, solapa $50\text{ mm}$ (`E11=50`) | `AE9=0`, `AF9=0.7`, `I12=2.0`, `I16=454.0`, `K16=246.0`, `I18=352.0` | En modo auditoría reproduce `spineWidthMm=2.0`, `flatCoverWidthMm=454.0`, `flatCoverHeightMm=246.0`; en modo producción bloquea con `EXPERIMENTAL_PROFILE_DISABLED`. | **100 % PARIDAD (BLOQUEADO EN PROD)** |
