# SPINE-01 — Contrato Arquitectónico del Motor Determinista (`SpineCalculationService`)

**Misión:** `SPINE-01 — LIVONIA SPINE CALCULATOR: REVERSE ENGINEERING & ENGINE CONTRACT`  
**Alcance:** Diseño de funciones puras, tipos estrictos, aritmética decimal controlada y separación modular para `SpineCalculationService` en Control Plane.

---

## 1. Principios de Diseño del Motor

1. **Pureza funcional absoluta en el núcleo matemático:**
   - El motor de cálculo (`src/api/services/spine/spineCalculationEngine.js`) **no realiza llamadas a base de datos, red, `window`, `document` ni `process.env`**.
   - Recibe un `SpineCalculationInput` ya enriquecido con el perfil industrial (`SpineBindingProfile`) y los datos técnicos de los papeles, y devuelve determinísticamente un `SpineCalculationResult` con el mismo hash canónico (`SHA-256`) ante las mismas entradas.
2. **Separación de las 5 etapas obligatorias del pipeline:**
   1. `calculateBlockThickness(segments, endpapersConfig)` → `BlockThicknessResult`
   2. `calculateBindingAdjustment(blockThickness, bindingConfig, profile)` → `BindingAdjustmentResult`
   3. `calculateSpineWidth(blockThickness, bindingAdjustment, bindingConfig, profile)` → `SpineWidthResult`
   4. `calculateCoverGeometry(trimSize, spineWidth, bindingConfig, profile)` → `CoverGeometryResult`
   5. `validateManufacturingConstraints(input, intermediateResults, profile)` → `ManufacturingValidationResult`
3. **Aritmética decimal controlada (Paridad IEEE-754 con Excel `CEILING.MATH`, `FLOOR.MATH` y `MROUND`):**
   - En JavaScript/IEEE-754, operaciones como `(504/2)*(116/1000)` producen `29.232000000000003`. Si un número cae exactamente en un múltiplo de `0.5` con ruido en el bit 53 (ej. `17.000000000000004`), un `Math.ceil(x / 0.5) * 0.5` ingenuo saltaría erróneamente a `17.5`.
   - Por ello, todas las funciones de redondeo del motor normalizan primero el valor a **10 decimales significativos** (`roundToPrecision(val, 10)`) antes de aplicar:
     - `ceilToStep(val, step = 0.5)`: $\lceil \text{round}_{10}(x / s) \rceil \cdot s$ (paridad exacta con `_xlfn.CEILING.MATH(x, 0.5)` para $x \ge 0$).
     - `floorToStep(val, step = 0.5)`: $\lfloor \text{round}_{10}(x / s) \rfloor \cdot s$ (paridad exacta con `_xlfn.FLOOR.MATH(x, 0.5)`).
     - `mroundToStep(val, step = 0.5)`: $\lfloor \text{round}_{10}(x / s) + 0.5 \rfloor \cdot s$ (paridad exacta con `MROUND(x, 0.5)` de Excel, que redondea mitades hacia arriba para positivos).

---

## 2. Contratos de Tipos TypeScript / JSDoc (`SpineEngineTypes`)

```typescript
export type BindingCategory =
  | 'SOFTCOVER_STANDARD'
  | 'SOFTCOVER_WITH_FLAPS'
  | 'HARDCOVER'
  | 'FLEXI_STANDARD'
  | 'FLEXI_WITH_FLAPS';

export type ProcessingType = 'GLUED' | 'SEWN';
export type SpineShape = 'SQUARE' | 'ROUND';

export type CaliperSource =
  | 'MEASURED_MICROMETER'
  | 'MANUFACTURER_DATASHEET'
  | 'LIVONIA_REFERENCE_IMPORT'
  | 'SUPPLIER_IMPORT'
  | 'BULK_DERIVED'
  | 'MANUAL_INPUT'
  | 'NONE';

export type CaliperConfidenceStatus =
  | 'VERIFIED'
  | 'REFERENCE_IMPORTED'
  | 'PROVISIONAL_ESTIMATED'
  | 'MISSING';

export interface BlockSegmentInput {
  segmentIndex: number;               // 1, 2, ...
  pages: number;                      // P_i (debe ser entero >= 0; impar genera WARNING/ERROR según perfil)
  variantId?: string | null;          // ID en paper_variants (si procede de catálogo)
  paperFamilyName?: string | null;
  gsm?: number | null;
  caliperUm: number | null;           // µ_i en micras (admite decimales como 67.5)
  bulkFactor?: number | null;         // cm³/g opcional
  coatingType?: 'COATED' | 'UNCOATED';
  caliperSource: CaliperSource;
  caliperConfidenceStatus: CaliperConfidenceStatus;
}

export interface CoverMaterialInput {
  variantId?: string | null;
  gsm?: number | null;
  caliperUm?: number | null;          // Requerido en SOFTCOVER SEWN (celda E10 en Alegro)
  caliperSource?: CaliperSource;
  caliperConfidenceStatus?: CaliperConfidenceStatus;
  flapWidthMm?: number | null;        // Celda E11 (Hoja 2) o C13 (Hoja 5)
}

export interface HardcoverSpecificInput {
  endpapersMode: 'FROM_BLOCK' | 'SEPARATE';      // AA8: 1 = 0 mm, 2 = +0.6 mm
  boardThicknessMm: 1.0 | 2.0 | 2.4 | 3.0;       // AA10: 1, 2, 3, 4
  blockPaperCoating: 'COATED' | 'UNCOATED';      // AA12: 1 = Krītots, 2 = Nekrītots
  spineShape: SpineShape;                        // AA14: 1 = Apaļa (ROUND), 2 = Taisna (SQUARE)
  overhangMm: 2.5 | 3.0;                         // AA16: 1 = 3.0 mm (+6), 2 = 2.5 mm (+5)
  foldingSignaturePages: 16 | 32;                // AA34: 1 = 8/12/16, 2 = 20/24/32
  dustJacket?: {
    enabled: boolean;
    flapWidthMm: number;                         // R18: ej. 80 mm
  } | null;
}

export interface SpineCalculationInput {
  tenantId: string;
  printhouseId?: string | null;
  profileId: string;                             // ej. 'livonia-alegro-softcover'
  profileVersion: string;                        // ej. '2.0.0'
  trimWidthMm: number;                           // C10: Platums (W)
  trimHeightMm: number;                          // C11: Garums (H)
  bindingCategory: BindingCategory;
  processingType: ProcessingType;                // L4 / AA6 / N8: SEWN | GLUED
  segments: BlockSegmentInput[];
  cover?: CoverMaterialInput | null;
  hardcover?: HardcoverSpecificInput | null;
}
```

---

## 3. Contrato de Salida (`SpineCalculationResult`)

```typescript
export type CalculationValidationStatus =
  | 'CERTIFIED_VALID'               // Listo para producción y Preflight
  | 'PROVISIONAL_ESTIMATE'          // Calculado, pero con espesor estimado/no verificado o perfil pendiente de aprobación
  | 'REQUIRES_TECH_REVIEW'          // Supera umbral automático (ej. Uncoated > 29 mm o Flexi) -> "Contact staff"
  | 'INVALID_BLOCKED';              // Supera límites físicos (ej. > 78 mm, solapa > W-16, sin espesor)

export interface SpineValidationIssue {
  code:
    | 'MISSING_SEGMENT_CALIPER'
    | 'PROVISIONAL_CALIPER_USED'
    | 'MISSING_COVER_CALIPER_FOR_SEWN_SOFTCOVER'
    | 'ODD_PAGE_COUNT_NOT_DIVISIBLE_BY_2'
    | 'ZERO_TOTAL_PAGES'
    | 'FLAP_WIDTH_EXCEEDS_LIMIT'
    | 'DUST_JACKET_FLAP_EXCEEDS_LIMIT'
    | 'UNCOATED_BLOCK_OVER_29MM_TECH_REVIEW_RECOMMENDED'
    | 'BLOCK_THICKNESS_EXCEEDS_MAX_SEWN_78MM'
    | 'BLOCK_THICKNESS_EXCEEDS_MAX_GLUED_63MM'
    | 'FLEXI_SQUARE_SPINE_NOT_SUPPORTED'
    | 'FLEXI_FLAP_LATERAL_BLEED_UNVERIFIED'
    | 'PROFILE_REQUIRES_PRINTHOUSE_TECH_APPROVAL';
  severity: 'INFO' | 'WARNING' | 'ERROR';
  excelCellRef?: string;            // ej. 'B22', 'AF13', 'AI3', 'S13'
  excelMessageOriginal?: string;    // ej. 'Atloki pārāk lieli. Samazini atlokus.'
  message: string;
}

export interface SpineCalculationResult {
  calculationVersion: string;       // '1.0.0'
  profileId: string;
  profileVersion: string;
  inputCanonicalHash: string;       // SHA-256 de las entradas normalizadas
  outputCanonicalHash: string;      // SHA-256 del resultado geométrico

  // 1. Block Thickness
  blockThickness: {
    netPaperBlockMm: number;        // L2 / AA2 / O2
    endpapersAllowanceMm: number;   // AD8 / O4 (0 o 0.6 mm)
    totalBlockWithEndpapersMm: number; // AD2 / N2
    segmentBreakdown: Array<{
      segmentIndex: number;
      pages: number;
      sheets: number;
      caliperUm: number;
      thicknessMm: number;
    }>;
  };

  // 2. Binding Adjustment
  bindingAdjustment: {
    processingType: ProcessingType;
    spineShape: SpineShape;
    sewnSwellingBlockMm: number | null;   // AG3 / S2 (Uzaugums)
    arcRadiusMm: number | null;           // Radio R(x) en lomo redondo
    arcLengthRoundedMm: number | null;    // AF5 / AF10 / R4 / R9
    theoreticalWithBoardMm: number | null;// AH5 (AD2 + 2*board)
    gluedCandidateSpineMm: number | null; // M2 / AF15 / AF16
    sewnCandidateSpineMm: number | null;  // N2 / AF13 / AF14
  };

  // 3. Spine Width
  spineWidthMm: number | null;            // E14 / H14 / D14 / D16 (null si INVALID_BLOCKED)

  // 4. Cover Geometry
  coverGeometry: {
    bleedPerSideMm: number;               // 3.0 mm en Softcover y Dust Jacket
    netCoverWidthMm: number | null;       // E39 / E40 / E41
    netCoverHeightMm: number | null;      // C11 / J30
    flatCoverWidthMm: number | null;      // E16 / H18 / D16 / D18
    flatCoverHeightMm: number | null;     // E18 / H19 / D18 / D19
    panels: {
      leftFlapMm: number | null;          // B30 / B32
      backPanelMm: number;                // C30 / C31 / C32 (W, W+2, W_board o W+4)
      leftHingeScoreMm: number | null;    // D36 (Rastri: 7..11 mm)
      spineMm: number | null;             // E30 / E31 / E32
      rightHingeScoreMm: number | null;   // F36 (Rastri: 7..11 mm)
      frontPanelMm: number;               // F30 / G31 / G32
      rightFlapMm: number | null;         // H30 / H32
      turnInMm: number | null;            // Noloki (18/19 mm en HC, 15 mm en Flexi)
      boardWidthMm: number | null;        // H16 (Papes platums)
      boardHeightMm: number | null;       // J16 (Papes garums)
    };
    dustJacket: {
      enabled: boolean;
      flapWidthMm: number;
      panelWidthMm: number;               // P31 / T31 (W_board + Rastri)
      panelWithHingeRefMm: number;        // P34 / T34 (panelWidth + 8)
      netWidthMm: number;                 // R40
      flatWidthWithBleedMm: number;       // R20
      flatHeightWithBleedMm: number;      // R21
    } | null;
  } | null;

  // 5. Validation & Provenance
  manufacturingValidation: {
    status: CalculationValidationStatus;
    canReleaseToPreflight: boolean;
    requiresTechnologistApproval: boolean;
    caliperConfidenceSummary: CaliperConfidenceStatus;
    issues: SpineValidationIssue[];
  };
}
```

