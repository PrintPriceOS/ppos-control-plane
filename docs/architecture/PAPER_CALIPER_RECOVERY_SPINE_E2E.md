# PAPER-CALIPER-RECOVERY-02 — Phase 7 Spine Calculator End-to-End Verification

- **Mission**: `PAPER-CALIPER-RECOVERY-02`
- **Target Production Environment**: `https://budget.printprice.pro` $\leftrightarrow$ `https://control.printprice.pro`
- **Executed At (UTC)**: `2026-10-28T19:23:18.818056+00:00`
- **Browser Engine**: Playwright Chromium (Live E2E against Plesk Production)

---

## 1. Summary of Required Phase 7 E2E Scenarios

| Test # | Scenario | Paper Variant(s) & ODS Provenance | Expected Outcome | Actual Outcome | Verdict |
| :---: | --- | --- | --- | --- | :---: |
| **`0`** | **Server Authority Guard (`variantId` vs. tampered `caliperUm`)** | `var_e5225fafe9481bef` (`Amber Graphic 120 64x90 FSC`, DB `141.00 µm` from ODS row `27`), client sends `caliperUm: 999` | Server rejects client tamper with `422 CLIENT_VARIANT_CALIPER_MISMATCH` | `HTTP 422` `CLIENT_VARIANT_CALIPER_MISMATCH` (`clientCaliperUm: 999`, `authoritativeCaliperUm: 141`) | **PASS** |
| **`1`** | **Softcover `GLUED` (`perfect_bound_pur`) with newly ODS-recovered Interior & Cover** | • **Interior**: `var_e5225fafe9481bef` (`Amber Graphic 120 64x90 FSC`, `120 gsm`, `141 µm`, ODS row `27`)<br>• **Cover**: `var_d04e5ee298001363` (`Arctic Volume White 250 102x72 FSC`, `250 gsm`, `275 µm`, ODS row `110`)<br>• **Spec**: `200 pp`, `170 × 240 mm` | Authoritative calculation from DB calipers (`SUPPLIER_IMPORT` / `REFERENCE_IMPORTED`) | • `netPaperBlockMm = 14.1 mm`<br>• `spineWidthMm = 15.0 mm`<br>• `flatCoverWidthMm = 361.0 mm` (`361.0 × 246.0 mm`)<br>• `coverCaliperUmUsed = 275 µm`<br>• `caliperSource = SUPPLIER_IMPORT`, `caliperConfidenceStatus = REFERENCE_IMPORTED` | **PASS** |
| **`2`** | **Softcover `SEWN` (`thread_sewn_sc`) with same ODS-recovered materials** | Same Interior (`141 µm`) + Cover (`275 µm`), switched to `thread_sewn_sc` (`SEWN`) | Sewn spine formula adds thread swell (`15.0 mm` $\to$ `16.0 mm`) | • `netPaperBlockMm = 14.1 mm`<br>• `spineWidthMm = 16.0 mm`<br>• `flatCoverWidthMm = 362.0 mm` (`362.0 × 246.0 mm`) | **PASS** |
| **`3`** | **Two references of the SAME grammage (`120 gsm`) with DIFFERENT recovered caliper** | • **Paper A**: `Amber Graphic 120 64x90 FSC` (`var_e5225fafe9481bef`, `120 gsm`, **`141 µm`**, ODS row `27`)<br>• **Paper B**: `Munken Lynx Rough 120 64x90 FSC` (`var_161b639b687d7204`, `120 gsm`, **`168 µm`**, ODS row `1048`) | Spine and extended cover width must change strictly from the `27 µm` caliper difference at identical `120 gsm` | • **Paper A (`141 µm`)**: `netPaperBlockMm = 14.1 mm`, `spineWidthMm = 16.0 mm`, `flatCoverWidthMm = 362.0 mm`<br>• **Paper B (`168 µm`)**: `netPaperBlockMm = 16.8 mm`, `spineWidthMm = 19.0 mm`, `flatCoverWidthMm = 365.0 mm` | **PASS** |
| **`6`** | **DOM Invalidation on Paper Change** | Switching from `Amber Graphic 120` (`362.0 × 246.0 mm`) to `Munken Lynx Rough 120` (`365.0 × 246.0 mm`) | Old geometry (`362.0 × 246.0 mm`) is removed from DOM and replaced by `365.0 × 246.0 mm` | `hasNewSpine: true` (`19.0 mm`), `hasNewCover: true` (`365.0 × 246.0 mm`), `hasOldCover: false` | **PASS** |
| **`5`** | **Page Count Change (`200` $\to$ `300 pp`)** | `Munken Lynx Rough 120 64x90 FSC` (`168 µm`), `SEWN`, `170 × 240 mm` | Automatic recalculation of block, spine, and extended cover width | • `netPaperBlockMm`: `16.8 mm` $\to$ **`25.2 mm`**<br>• `spineWidthMm`: `19.0 mm` $\to$ **`28.0 mm`**<br>• `flatCoverWidthMm`: `365.0 mm` $\to$ **`374.0 mm`** | **PASS** |
| **`4`** | **Material WITHOUT Caliper Explicitly Blocked** | `Arena Rough Ivory 140g 64x90` (`var_ea4e053e2cc01a28`, ODS row `148` has `MIKRONS = 0` $\to$ `MISSING`) | UI blocks blueprint with `CALIPER_VERIFICATION_REQUIRED`; API returns `spineWidthMm: null`, `MISSING_SEGMENT_CALIPER` | • UI `data-spine-status="CALIPER_VERIFICATION_REQUIRED"`, `hasBlueprint: false`<br>• API: `spineWidthMm: null`, `status: "INVALID_BLOCKED"`, `code: "MISSING_SEGMENT_CALIPER"` | **PASS** |
| **`7` & `8`** | **Provisional Status (`REFERENCE_IMPORTED`) & Manufacturing Release Block (`422`)** | Snapshot `scs_63d6c6d7-0fcd-41ed-b3d3-efee4fd67233` created with `Munken Lynx Rough 120` (`SUPPLIER_IMPORT` / `REFERENCE_IMPORTED`) | • Snapshot persists (`201`) with `caliperConfidenceSummary: "REFERENCE_IMPORTED"`, `canReleaseToManufacturing: false`<br>• `POST /verify-release` rejected with `422`<br>• Flexi disabled (`spineWidthMm: null`)<br>• Hardcover requires explicit params & technologist approval | • `POST /snapshots` $\to$ `201` (`REFERENCE_IMPORTED`, `MATH_BRANCH_VALIDATED`, `canReleaseToManufacturing: false`)<br>• `POST /verify-release` $\to$ `422 MANUFACTURING_RELEASE_BLOCKED_UNCERTIFIED_PROFILE`<br>• Flexi $\to$ `EXPERIMENTAL_DISABLED`, `spineWidthMm: null`<br>• Hardcover without params $\to$ `422 HARDCOVER_PROFILE_PARAMETERS_REQUIRED`; with `{boardThicknessMm: 2.4, overhangMm: 2.5, foldingSignaturePages: 16}` $\to$ `requiresTechnologistApproval: true`, `canReleaseToManufacturing: false` | **PASS** |

---

## 2. Raw E2E Verification Evidence (`phase7_spine_e2e_results.json`)

```json
{
  "mission": "PAPER-CALIPER-RECOVERY-02",
  "phase": "PHASE_7_SPINE_INTEGRATION_E2E",
  "executedAt": "2026-10-28T19:23:18.818056+00:00",
  "baseUrl": "https://budget.printprice.pro",
  "controlUrl": "https://control.printprice.pro",
  "tests": {
    "test0_serverCaliperAuthorityGuard": {
      "status": "PASS",
      "variantId": "var_e5225fafe9481bef",
      "dbCaliperUm": 141.0,
      "clientTamperedCaliperUm": 999,
      "httpStatus": 422,
      "errorCode": "CLIENT_VARIANT_CALIPER_MISMATCH"
    },
    "test1_softcoverGluedWithRecoveredOdsCaliper": {
      "status": "PASS",
      "interiorVariant": "var_e5225fafe9481bef (Amber Graphic 120 64x90 FSC, 141 µm, ODS row 27)",
      "coverVariant": "var_d04e5ee298001363 (Arctic Volume White 250 102x72 FSC, 275 µm, ODS row 110)",
      "netPaperBlockMm": 14.1,
      "spineWidthMm": 15,
      "flatCoverWidthMm": 361,
      "caliperSource": "SUPPLIER_IMPORT",
      "caliperConfidenceStatus": "REFERENCE_IMPORTED"
    },
    "test2_softcoverSewnWithRecoveredOdsCaliper": {
      "status": "PASS",
      "netPaperBlockMm": 14.1,
      "spineWidthMm": 16,
      "flatCoverWidthMm": 362
    },
    "test3_and_6_sameGsmDifferentCaliperAndDomInvalidation": {
      "status": "PASS",
      "paperA": "Amber Graphic 120 64x90 FSC (120 gsm, 141 µm -> 16.0 mm sewn spine, 362.0 mm cover)",
      "paperB": "Munken Lynx Rough 120 64x90 FSC (120 gsm, 168 µm -> 19.0 mm sewn spine, 365.0 mm cover)",
      "oldGeometryRemovedFromDom": true
    },
    "test5_pageCountUpdateRecalculation": {
      "status": "PASS",
      "beforePages": 200,
      "beforeSpineMm": 19.0,
      "afterPages": 300,
      "afterNetBlockMm": 25.2,
      "afterSpineMm": 28.0,
      "afterFlatCoverWidthMm": 374.0
    },
    "test4_materialWithoutCaliperBlocked": {
      "status": "PASS",
      "variantId": "var_ea4e053e2cc01a28",
      "productName": "Arena Rough Ivory 140g 64x90",
      "uiStatus": "CALIPER_VERIFICATION_REQUIRED",
      "uiBadge": "CALIPER VERIFICATION REQUIRED",
      "blueprintRendered": false,
      "apiStatus": 200,
      "spineWidthMm": null,
      "manufacturingValidationStatus": "INVALID_BLOCKED",
      "apiErrorCode": "MISSING_SEGMENT_CALIPER"
    },
    "test7_and_8_provisionalStatusAndManufacturingReleaseBlock": {
      "status": "PASS",
      "snapshotId": "scs_63d6c6d7-0fcd-41ed-b3d3-efee4fd67233",
      "caliperConfidenceSummary": "REFERENCE_IMPORTED",
      "certificationTier": "MATH_BRANCH_VALIDATED",
      "canReleaseToManufacturing": false,
      "verifyReleaseStatus": 422,
      "verifyReleaseErrorCode": "MANUFACTURING_RELEASE_BLOCKED_UNCERTIFIED_PROFILE",
      "flexiStatus": 200,
      "flexiOperationalStatus": "EXPERIMENTAL_DISABLED",
      "flexiSpineWidthMm": null,
      "flexiValidationStatus": "INVALID_BLOCKED",
      "hardcoverMissingParamsStatus": 422,
      "hardcoverMissingParamsErrorCode": "HARDCOVER_PROFILE_PARAMETERS_REQUIRED",
      "hardcoverBlockThicknessMm": 16.128,
      "hardcoverSpineWidthMm": 21.5,
      "hardcoverExtendedCoverWidthMm": 403.5,
      "hardcoverExtendedCoverHeightMm": 281,
      "hardcoverRequiresTechnologistApproval": true,
      "hardcoverCanReleaseToManufacturing": false
    }
  }
}
```
