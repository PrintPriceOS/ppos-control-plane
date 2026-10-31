# RECOVERY-12 (Batch C1) — Governed Classification Accreditation & Promotion Report (`77` Variants)

- **Repository**: `PrintPriceOS/ppos-control-plane`
- **Database Target**: `Control.paper_variant_classification_evidence`, `Control.paper_products`, `Control.paper_variants` (`root@212.227.79.67`)
- **Service Used**: [`PaperEvidenceService`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/paperEvidenceService.js) (`registerClassificationEvidence` -> `reviewClassificationEvidence` -> `requestClassificationPromotion` -> `authorizeClassificationPromotion`)
- **Execution Timestamp**: `2026-10-31T00:33:08.055Z`
- **Status**: **COMPLETED (`77 / 77` Promoted — `65` `OFFSET` + `12` `COATED` | `0` Caliper Mutations)**

---

## 1. Phase 1 & Phase 2 Summary (DDL Upgrade & Transactional Service Implementation)

### 1.1 Safe Non-Destructive Schema Upgrade (`migrations/175_phase197f_paper_classification_accreditation_columns.sql`)
- Extended `paper_variant_classification_evidence.proposed_coating_status` ENUM to include `'ONE_SIDE_COATED'`:
  `ENUM('COATED','UNCOATED','ONE_SIDE_COATED','SYNTHETIC','SPECIALTY','UNKNOWN')`
- Extended `paper_variant_classification_evidence.evidence_source_type` ENUM to include `'PHYSICAL_SAMPLE_INSPECTION'`.
- Added traceability columns to `paper_variant_classification_evidence`:
  - `previous_coating_status` (`ENUM('COATED','UNCOATED','ONE_SIDE_COATED','SYNTHETIC','SPECIALTY','UNKNOWN')`)
  - `previous_grain_direction` (`ENUM('LONG_GRAIN','SHORT_GRAIN','UNKNOWN')`)
  - `proposed_grain_direction` (`ENUM('LONG_GRAIN','SHORT_GRAIN','UNKNOWN')`)
  - `promotion_request_id`, `promotion_requested_by`, `promotion_requested_by_role`, `promotion_requested_at`, `promotion_request_reason`
  - `promotion_id`, `promoted_by`, `promoted_by_role`, `promoted_at`, `promotion_reason`, `metadata_json`.

### 1.2 Governed 4-Stage Methods in `PaperEvidenceService` (`src/api/services/paperEvidenceService.js`)
1. **`registerClassificationEvidence()`**: Validates canonical taxonomy, attaches SHA-256 document hash, and inserts `PENDING_TECH_REVIEW` record without mutating catalog tables.
2. **`reviewClassificationEvidence()`**: Enforces technologist role and Segregation of Duties (`reviewer !== submitter`) with `SELECT ... FOR UPDATE` row locking.
3. **`requestClassificationPromotion()`**: Records formal promotion request (`cls_req_*`) on `APPROVED` classification evidence.
4. **`authorizeClassificationPromotion()`**: Enforces 4-way Segregation of Duties (`authorizer !== submitter && authorizer !== reviewer && authorizer !== requester`), atomically updates `Control.paper_products` (`category`, `finish_summary`, `metadata_json`) and `Control.paper_variants` (`finish`, `grain_direction`, `metadata_json.classification_accreditation`) while leaving `caliper_um` 100% untouched, and deactivates the `isSyntheticOtherUncoated` fallback in [`resolveVariantTechnicalAttributes()`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/paperMaterialsNormalizationService.js#L508-L537).

---

## 2. Production Integrity & Official Counters Verification

### 2.1 Strict Caliper Invariance (`Control.paper_variants`)

| Production Counter (`Control.paper_variants`) | Pre-Batch C1 | Post-Batch C1 | Delta | Verification Status |
| :--- | :---: | :---: | :---: | :---: |
| **Total Variants (`COUNT(*)`)** | `1,524` | **`1,524`** | `0` | **PASS (100% Immutable)** |
| **With Authoritative Caliper (`caliper_um > 0`)** | `1,284` | **`1,284`** | `0` | **PASS (100% Immutable)** |
| **Without Caliper (`caliper_um IS NULL`)** | `240` | **`240`** | `0` | **PASS (100% Immutable)** |
| **1,524 Caliper Tuple Vector SHA-256** | `d3c28868...03b485` | **`d3c28868...03b485`** | `0` | **PASS (Bitwise Identical)** |

*Full 1,524-variant caliper vector SHA-256 (Pre & Post):* `d3c288687abb8f7d11a36fde6e853685381bf417193be3422de16dd6b003b485`

---

### 2.2 Pending Technical Classifications Balance (`Control.paper_products` & Runtime Resolution)

| Classification Metric | Pre-Batch C1 | Promoted in Batch C1 | Post-Batch C1 | Status |
| :--- | :---: | :---: | :---: | :---: |
| **Effective Pending Classifications (`resolved.paperType = 'OTHER'`)** | `337` | `-77` | **`260`** | **PASS (`337 - 77 = 260`)** |
| **Raw DB `paper_products.category = 'OTHER'`** | `338` | `-77` | **`261`** | **PASS (`260` pending + `1` `var_85c142a50239e312` ODS-resolved)** |
| **Catalog `OFFSET` Variants (Runtime & DB)** | `400` | `+65` | **`465`** | **PASS (`+65` P1 Book Interior Offset)** |
| **Catalog `COATED` Variants (Runtime & DB)** | `567` | `+12` | **`579`** | **PASS (`+12` P1 Coated Publication)** |
| **Catalog `DESIGN` Variants (Runtime / DB)** | `111` / `110` | `0` | **`111` / `110`** | **PASS (Untouched)** |
| **Catalog `CARTON` Variants (Runtime & DB)** | `109` | `0` | **`109`** | **PASS (Untouched)** |

---

### 2.3 MySQL Table Checksums & Segregation of Duties Actors

| Table / Actor | Pre-Batch C1 | Post-Batch C1 | Notes |
| :--- | :---: | :---: | :--- |
| `CHECKSUM TABLE Control.paper_variants` | `3572048628` | **`2180275734`** | Updated `finish` & `metadata_json.classification_accreditation` on 77 C1 rows (`caliper_um` untouched) |
| `CHECKSUM TABLE Control.paper_products` | `1734492320` | **`4016355254`** | Updated `category` (`65 OFFSET`, `12 COATED`) & `finish_summary` on 77 C1 products |
| `CHECKSUM TABLE Control.paper_variant_classification_evidence` | `0` | **`2580954000`** | `77` governed `APPROVED` + `applied_to_catalog_product = 1` records persisted |
| **Stage 1 Submitter** | — | `rec12_cls_submitter` (`SUPPLIER_OPERATOR`) | Registered 77 TDS classification evidences |
| **Stage 2 Technologist Reviewer** | — | `rec12_cls_reviewer` (`MATERIAL_TECHNOLOGIST`) | Approved 77 classification evidences |
| **Stage 3 Promotion Requester** | — | `rec12_cls_requester` (`SUPPLIER_OPERATOR`) | Requested 77 catalog classification promotions |
| **Stage 4 Promotion Authorizer** | — | `rec12_cls_authorizer` (`SUPPLIER_ADMIN`) | Authorized 77 atomic promotions |

---

## 3. Complete Audit Ledger of the `77` Promoted Batch C1 Variants

| # | `variant_id` | `product_id` | Commercial Grade Name | GSM | Category Transition | `coating_status` | `finish` | `grain_direction` | Preserved `caliper_um` | `classification_evidence_id` | `promotion_request_id` | `promotion_id` |
| :---: | :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- | :--- | :--- |
| 1 | `var_a3e0fffe582bb8b5` | `prod_38282eca5568c57b` | Amber Preprint 90 64 x 90 cm | 90 | `OTHER` -> **`OFFSET`** | `UNCOATED` | `UNCOATED` | `UNKNOWN` | 117 µm | `evd_cls_3c63e4cf16690da9` | `cls_req_e33f526459d78cfd` | `cls_prm_05188c3ba8cd3728` |
| 2 | `var_e17dfd0844bcd9f7` | `prod_ca3c74d6d9e341f3` | IQ Print 100 88x63 FSC | 100 | `OTHER` -> **`OFFSET`** | `UNCOATED` | `UNCOATED` | `UNKNOWN` | 126 µm | `evd_cls_2835a894863fdebf` | `cls_req_f83254138c7a1882` | `cls_prm_1b1779cc5ff6749b` |
| 3 | `var_928d4845f9ef23f4` | `prod_b161acfd379e62e0` | IQ Print 120 64x90 FSC | 120 | `OTHER` -> **`OFFSET`** | `UNCOATED` | `UNCOATED` | `UNKNOWN` | 144 µm | `evd_cls_891b4f8138fe869e` | `cls_req_2e8b982c421bb136` | `cls_prm_a9046d375fdb4c2d` |
| 4 | `var_5f677a44bf6c5dab` | `prod_e4a7951b4bed076f` | IQ Print 120 88x63 FSC | 120 | `OTHER` -> **`OFFSET`** | `UNCOATED` | `UNCOATED` | `UNKNOWN` | 141 µm | `evd_cls_4274577f18c6fb82` | `cls_req_46e450f81bc8eae3` | `cls_prm_8ed0245d108143b6` |
| 5 | `var_29d8d0b587ef3417` | `prod_c19f396a6e644212` | IQ Print 120 90x64 FSC | 120 | `OTHER` -> **`OFFSET`** | `UNCOATED` | `UNCOATED` | `UNKNOWN` | 144 µm | `evd_cls_595980e248239b04` | `cls_req_2caa630f4bed145e` | `cls_prm_d24a141520047e0f` |
| 6 | `var_3194e4e77350a050` | `prod_db01a58844cdb09c` | IQ Print 140 100x70 FSC | 140 | `OTHER` -> **`OFFSET`** | `UNCOATED` | `UNCOATED` | `UNKNOWN` | 163 µm | `evd_cls_39f268337c89b2af` | `cls_req_893354cc6a3dc1e6` | `cls_prm_15b70d2023a4437d` |
| 7 | `var_07f7f14b168009dd` | `prod_a84278a82261703e` | IQ Print 140 102x72 FSC | 140 | `OTHER` -> **`OFFSET`** | `UNCOATED` | `UNCOATED` | `UNKNOWN` | 163 µm | `evd_cls_6c63a8c3fc5b687b` | `cls_req_b6be93282884fce6` | `cls_prm_fec0b4405449b6b8` |
| 8 | `var_d855573bc5930d11` | `prod_4264ff223e3af4be` | IQ Print 140 63x88 FSC | 140 | `OTHER` -> **`OFFSET`** | `UNCOATED` | `UNCOATED` | `UNKNOWN` | 163 µm | `evd_cls_5164c02ff009887a` | `cls_req_1012638e1420ea87` | `cls_prm_e82079d7c908c714` |
| 9 | `var_f417b6ea242e7607` | `prod_2b8c31f86e18fa90` | IQ Print 140 64X90 FSC | 140 | `OTHER` -> **`OFFSET`** | `UNCOATED` | `UNCOATED` | `UNKNOWN` | 163 µm | `evd_cls_c3aa4d3cd64df506` | `cls_req_6ffe375a37544827` | `cls_prm_ed08ddc05c278315` |
| 10 | `var_ee7c7a845e90e31f` | `prod_8d9625bbb75ef709` | IQ Print 140 72x102 FSC | 140 | `OTHER` -> **`OFFSET`** | `UNCOATED` | `UNCOATED` | `UNKNOWN` | 163 µm | `evd_cls_d01c48a32f41dd16` | `cls_req_3871ac4b1a291d67` | `cls_prm_5f22dd91a455401c` |
| 11 | `var_c7e467bd2357b1c5` | `prod_df62c31f3aeac53c` | IQ Print 140 88x63 FSC | 140 | `OTHER` -> **`OFFSET`** | `UNCOATED` | `UNCOATED` | `UNKNOWN` | 163 µm | `evd_cls_71f26743f8d42917` | `cls_req_5c2c6fa2d81cec7b` | `cls_prm_a811b3766f97e28c` |
| 12 | `var_d8c9590764883df6` | `prod_101d886c1d28a149` | IQ Print 140 90x64 FSC | 140 | `OTHER` -> **`OFFSET`** | `UNCOATED` | `UNCOATED` | `UNKNOWN` | 163 µm | `evd_cls_ae749f9b84e7b172` | `cls_req_55574fa090cc5d43` | `cls_prm_785420cf84abf60c` |
| 13 | `var_f18f012b3746bb10` | `prod_f04d3156352c95a0` | IQ Print 170 72x102 FSC | 170 | `OTHER` -> **`OFFSET`** | `UNCOATED` | `UNCOATED` | `UNKNOWN` | 201 µm | `evd_cls_0a8fbd4fa5e9d799` | `cls_req_68473d8df2c412a8` | `cls_prm_3d4995877d58e652` |
| 14 | `var_11f9908b9c18eb6a` | `prod_48f2deeb3aedfec7` | IQ Print 250 70x100 FSC | 250 | `OTHER` -> **`OFFSET`** | `UNCOATED` | `UNCOATED` | `UNKNOWN` | 285 µm | `evd_cls_8f656d39f21a4823` | `cls_req_3ffa5228e0fef959` | `cls_prm_bcd5670f3d3de2e8` |
| 15 | `var_3612eb84e82288d3` | `prod_c99770d229de787f` | IQ Print 80 102x72 FSC | 80 | `OTHER` -> **`OFFSET`** | `UNCOATED` | `UNCOATED` | `UNKNOWN` | 103 µm | `evd_cls_c19f7dc344f037b0` | `cls_req_a2e5070e687c137f` | `cls_prm_b53480aa68098ef5` |
| 16 | `var_3c84e9c660c6094c` | `prod_286615434d7ad7b7` | IQ Print 80 61x45 FSC | 80 | `OTHER` -> **`OFFSET`** | `UNCOATED` | `UNCOATED` | `UNKNOWN` | 103 µm | `evd_cls_18895f02baef1485` | `cls_req_b0586de1c7550b72` | `cls_prm_3d5a020bee2f3b11` |
| 17 | `var_7a16ab490529438c` | `prod_057f9568a5feb6ad` | IQ Print 80 90x64 FSC | 80 | `OTHER` -> **`OFFSET`** | `UNCOATED` | `UNCOATED` | `UNKNOWN` | 103 µm | `evd_cls_fe1a11d003ff8981` | `cls_req_1482899e3f2a41b0` | `cls_prm_7912551e345537f4` |
| 18 | `var_86d7ffd98f8cf69e` | `prod_c16ffc30c7eda5a6` | IQ Print 90 88x63 FSC | 90 | `OTHER` -> **`OFFSET`** | `UNCOATED` | `UNCOATED` | `UNKNOWN` | 115 µm | `evd_cls_0470035e61f20f67` | `cls_req_4c90ff2ee8f00ea8` | `cls_prm_4854d39bf3e9aa3a` |
| 19 | `var_0ae0050937734bf4` | `prod_397431e303612be5` | IQ Print 90 90x64 FSC | 90 | `OTHER` -> **`OFFSET`** | `UNCOATED` | `UNCOATED` | `UNKNOWN` | 115 µm | `evd_cls_733df556da367428` | `cls_req_ae50d492a38f94df` | `cls_prm_d01bc59538f12a8a` |
| 20 | `var_d945b5c8e0bb8992` | `prod_bd51f693d35c3e2c` | Lux Cream 1.8 90 72x102 | 90 | `OTHER` -> **`OFFSET`** | `UNCOATED` | `UNCOATED` | `UNKNOWN` | 162 µm | `evd_cls_f900a52b7c23b018` | `cls_req_bff2d2fdd7f8c34f` | `cls_prm_a4159ebe18bda2a3` |
| 21 | `var_855196f582594ca6` | `prod_5ab7340521699504` | LuxCream 1.8 90g 64x90 | 90 | `OTHER` -> **`OFFSET`** | `UNCOATED` | `UNCOATED` | `UNKNOWN` | 162 µm | `evd_cls_90c2f432e4eebd6c` | `cls_req_c7d08f4e2d7a10c6` | `cls_prm_25ec0f1f31b3b747` |
| 22 | `var_d9937f9a3c05e548` | `prod_3ab1e02501d7562f` | Maestro Print 120 88x58 FSC | 120 | `OTHER` -> **`OFFSET`** | `UNCOATED` | `UNCOATED` | `UNKNOWN` | 144 µm | `evd_cls_e471b116f382206b` | `cls_req_35e22ebb722210c9` | `cls_prm_31e905d7f8cf1121` |
| 23 | `var_38f46af927f82d57` | `prod_53140e5cdf2fa64c` | Maestro Print 140 102x72 FSC | 140 | `OTHER` -> **`OFFSET`** | `UNCOATED` | `UNCOATED` | `UNKNOWN` | 164 µm | `evd_cls_b99b368793bfcbe6` | `cls_req_66cd45c76f547107` | `cls_prm_95e6e92523e0b939` |
| 24 | `var_f30fa00e5c230b37` | `prod_030ae6372a1e966c` | Maestro Print 170 64x90 FSC | 170 | `OTHER` -> **`OFFSET`** | `UNCOATED` | `UNCOATED` | `UNKNOWN` | `NULL` | `evd_cls_2ec568fe00697482` | `cls_req_fd2c8b79cf477909` | `cls_prm_200eb239235841c6` |
| 25 | `var_26ba7327362986da` | `prod_bb616957774b1105` | Maestro Print 190 90x64 FSC | 190 | `OTHER` -> **`OFFSET`** | `UNCOATED` | `UNCOATED` | `UNKNOWN` | 221 µm | `evd_cls_e1617d5a4ede038b` | `cls_req_05e3c83ad2012d5d` | `cls_prm_b96f4881ea55286a` |
| 26 | `var_9f43752a7fdf0360` | `prod_55531a9b4378a65d` | Maestro Print 300 90x64 FSC | 300 | `OTHER` -> **`OFFSET`** | `UNCOATED` | `UNCOATED` | `UNKNOWN` | `NULL` | `evd_cls_e2eaf26d211e3863` | `cls_req_fa3d921e6f6a6fc3` | `cls_prm_b733d8a7a6f45cbd` |
| 27 | `var_2fa1134ce46d69de` | `prod_67316d96af63f4ac` | MasterBook Extra 60 61x86 FSC | 60 | `OTHER` -> **`OFFSET`** | `UNCOATED` | `UNCOATED` | `UNKNOWN` | 120 µm | `evd_cls_2408f807c59fe045` | `cls_req_02686137b885330f` | `cls_prm_d619e3a143a99a4e` |
| 28 | `var_162027632f21ff22` | `prod_d1a355efaf61e682` | MasterBook Extra 60 70x100 FSC | 60 | `OTHER` -> **`OFFSET`** | `UNCOATED` | `UNCOATED` | `UNKNOWN` | 120 µm | `evd_cls_03fceaa69081525e` | `cls_req_757e750aaaf89185` | `cls_prm_79067a9ccc8cca4e` |
| 29 | `var_ba43d41a15652476` | `prod_d8779fd762b65fe8` | MasterBook Extra 80 86x61 FSC | 80 | `OTHER` -> **`OFFSET`** | `UNCOATED` | `UNCOATED` | `UNKNOWN` | 154 µm | `evd_cls_0a4f07f3ca6bd5b6` | `cls_req_ceca82344cb80f2b` | `cls_prm_ce1b21d9520c82a1` |
| 30 | `var_27387d38ec53a081` | `prod_c944c3d8672f0412` | MasterBook Extra 80 90x64 FSC | 80 | `OTHER` -> **`OFFSET`** | `UNCOATED` | `UNCOATED` | `UNKNOWN` | 154 µm | `evd_cls_2a613070ca70bbed` | `cls_req_f131f901dd0633f8` | `cls_prm_62675acedbc85df6` |
| 31 | `var_2e44aa4d5838c854` | `prod_3899ad021b71684e` | MAXIMA NATURAL 100 70x100 FSC | 100 | `OTHER` -> **`OFFSET`** | `UNCOATED` | `UNCOATED` | `UNKNOWN` | `NULL` | `evd_cls_40566dd0c842f647` | `cls_req_06c7736c409e79ed` | `cls_prm_ae22a881c9eb2ccf` |
| 32 | `var_09e41a549016912d` | `prod_9d5eb5550cc4f569` | Maxima Natural 140 90x64 FSC | 140 | `OTHER` -> **`OFFSET`** | `UNCOATED` | `UNCOATED` | `UNKNOWN` | `NULL` | `evd_cls_7ad7fb1293553d5e` | `cls_req_1221edae49dc660d` | `cls_prm_bc7f38df1579edc4` |
| 33 | `var_bfab4cd66749fe0a` | `prod_77ae9576f9ae22ec` | Maxima Natural 170 90 x 64 FSC | 170 | `OTHER` -> **`OFFSET`** | `UNCOATED` | `UNCOATED` | `UNKNOWN` | `NULL` | `evd_cls_79a0906eb1f27d16` | `cls_req_5da51db77c6bba05` | `cls_prm_05bd8a66a9031428` |
| 34 | `var_ef95d9c7874f1e50` | `prod_8c85be8c98cad963` | Maxima Volume 150 102x72 FSC | 150 | `OTHER` -> **`OFFSET`** | `UNCOATED` | `UNCOATED` | `UNKNOWN` | 162 µm | `evd_cls_542ea83e8b4c8328` | `cls_req_5ff636ed2da17602` | `cls_prm_3648a06b04f0b36d` |
| 35 | `var_4022e6139afa0560` | `prod_904070b5739b1f09` | MultiOffset 120 52x83 FSC | 120 | `OTHER` -> **`OFFSET`** | `UNCOATED` | `UNCOATED` | `UNKNOWN` | 150 µm | `evd_cls_acd04c69912fc08c` | `cls_req_531db6e159e48ebb` | `cls_prm_77620135a2879ce2` |
| 36 | `var_4bcc57bd6e3c9c51` | `prod_86cce7b9d0d051eb` | MultiOffset 300g 72x102 | 300 | `OTHER` -> **`OFFSET`** | `UNCOATED` | `UNCOATED` | `UNKNOWN` | 329 µm | `evd_cls_219ca7c25c93727f` | `cls_req_09d86dc1a0c9e44e` | `cls_prm_5e912fe2493d3c15` |
| 37 | `var_337668698c5acef2` | `prod_2598adb449837ebf` | Munken Kristall 170 90x64 FSC | 170 | `OTHER` -> **`OFFSET`** | `UNCOATED` | `UNCOATED` | `UNKNOWN` | 192 µm | `evd_cls_716e3c3a8549f01c` | `cls_req_82188b80f35b547e` | `cls_prm_499402842546573a` |
| 38 | `var_586f4ee2a7c797c7` | `prod_e93bfd598ec381b9` | Munken Kristall 240 102x72 FSC | 240 | `OTHER` -> **`OFFSET`** | `UNCOATED` | `UNCOATED` | `UNKNOWN` | 271 µm | `evd_cls_d6740de8cfce7183` | `cls_req_f4539fa6c0d47fb1` | `cls_prm_6b075629b3dee30e` |
| 39 | `var_abbee9f4e4f6e4b0` | `prod_750f6e6cfb04dd07` | Munken Lynx 120 59x45 FSC | 120 | `OTHER` -> **`OFFSET`** | `UNCOATED` | `UNCOATED` | `UNKNOWN` | 136 µm | `evd_cls_b436c08b7fee01ad` | `cls_req_844057f93a127eaf` | `cls_prm_7763b8bcaa529e3f` |
| 40 | `var_2aa21fde8d4b01c6` | `prod_8f9e0d88599b7aae` | Munken Polar 240 72x102 FSC | 240 | `OTHER` -> **`OFFSET`** | `UNCOATED` | `UNCOATED` | `UNKNOWN` | 271 µm | `evd_cls_48e48dc6bfa23d9a` | `cls_req_ecb0a8d08f1f8ac6` | `cls_prm_99b8974e7b800aba` |
| 41 | `var_4431c232bb12cdf6` | `prod_518ed13b7677f54e` | Munken Premium Cream 13 100 64x90 FSC | 100 | `OTHER` -> **`OFFSET`** | `UNCOATED` | `UNCOATED` | `UNKNOWN` | 130 µm | `evd_cls_7212ac3e57a84b62` | `cls_req_a8a8b05c81bdf1a0` | `cls_prm_7a535fbbeebf0bc6` |
| 42 | `var_3a9de81cd640e37a` | `prod_a45b8e04d9aadf30` | Munken Premium Cream 13 90 64x90 FSC | 90 | `OTHER` -> **`OFFSET`** | `UNCOATED` | `UNCOATED` | `UNKNOWN` | 117 µm | `evd_cls_c3f7d5350a0f2b2e` | `cls_req_4e084ee3f694866e` | `cls_prm_94a2cd770e82e502` |
| 43 | `var_24529f375c1b6341` | `prod_0139546cc0e0ed95` | Munken Pure Rough 100 90x64 | 100 | `OTHER` -> **`OFFSET`** | `UNCOATED` | `ROUGH` | `UNKNOWN` | `NULL` | `evd_cls_f2b36e9a2905f270` | `cls_req_1d119df1d7bce2ef` | `cls_prm_a0a35521622f3bf4` |
| 44 | `var_fb2a8f3e2fe2f0d0` | `prod_4eb7bb2b4fa21528` | Nautilus SuperWhite 160 64x90 | 160 | `OTHER` -> **`OFFSET`** | `UNCOATED` | `UNCOATED` | `UNKNOWN` | 196 µm | `evd_cls_fb199562b1735cd2` | `cls_req_392eb866f0655ba5` | `cls_prm_b270b2df7be9d238` |
| 45 | `var_ebd54628ffb83779` | `prod_d97d6bedaff80f10` | PERGRAPHICA Classic Rough 240 72x102 FSC | 240 | `OTHER` -> **`OFFSET`** | `UNCOATED` | `ROUGH` | `UNKNOWN` | 328 µm | `evd_cls_af70e5e169f63c51` | `cls_req_da3def24b82064b4` | `cls_prm_ab8411d572f6eac8` |
| 46 | `var_c41927e5c75aca63` | `prod_4e949d6b52c06994` | PERGRAPHICA Infinite Black 120 70X100 | 120 | `OTHER` -> **`OFFSET`** | `UNCOATED` | `UNCOATED` | `UNKNOWN` | 145 µm | `evd_cls_67b741118ff6afa4` | `cls_req_f1308943da1236e8` | `cls_prm_3f677fb0363c585b` |
| 47 | `var_ee2e495a5d5e4944` | `prod_f263ecd6eb56be0a` | PERGRAPHICA Infinite Black 160 70x100 | 160 | `OTHER` -> **`OFFSET`** | `UNCOATED` | `UNCOATED` | `UNKNOWN` | 194 µm | `evd_cls_1e6da2a1182be709` | `cls_req_e7cd30b068d21511` | `cls_prm_bf404456f59511bd` |
| 48 | `var_081452cf35264e77` | `prod_48991de770bf6967` | PERGRAPHICA Infinite Black 250 70X100cm | 250 | `OTHER` -> **`OFFSET`** | `UNCOATED` | `UNCOATED` | `UNKNOWN` | 290 µm | `evd_cls_5ef85da4bd7c06ca` | `cls_req_b85f94d94c9eb41b` | `cls_prm_f1740a8b2bb38972` |
| 49 | `var_4fade2216b6da976` | `prod_7107374d365a1bad` | Printspeed 120 64x90 | 120 | `OTHER` -> **`OFFSET`** | `UNCOATED` | `UNCOATED` | `UNKNOWN` | 133 µm | `evd_cls_feeef89ecc980231` | `cls_req_8bb40d0e707b8bb1` | `cls_prm_b8050e6b6df7492b` |
| 50 | `var_b521eceb12e2cfd3` | `prod_8ba798e343ac3996` | SERIXO 100 59x80 FSC | 100 | `OTHER` -> **`OFFSET`** | `UNCOATED` | `UNCOATED` | `UNKNOWN` | 126 µm | `evd_cls_ab27307b0fb54861` | `cls_req_c97a44966194f682` | `cls_prm_bcca8cef36641b27` |
| 51 | `var_4f9920fa8b479255` | `prod_7cf8bd715b7105f7` | Serixo 100 65x50 FSC | 100 | `OTHER` -> **`OFFSET`** | `UNCOATED` | `UNCOATED` | `UNKNOWN` | 126 µm | `evd_cls_6329b5521c3c8cdd` | `cls_req_46a7b20de07ccc5c` | `cls_prm_71f3474d0d6b5e0f` |
| 52 | `var_853976598d401284` | `prod_896f173c43c92d62` | Serixo 100 71x78 FSC | 100 | `OTHER` -> **`OFFSET`** | `UNCOATED` | `UNCOATED` | `UNKNOWN` | 126 µm | `evd_cls_707023d765744642` | `cls_req_006285ad4a84b993` | `cls_prm_d402438f1321c333` |
| 53 | `var_99cbe60f4feefbf4` | `prod_f68759d910f5dd58` | Serixo 120 46x64 FSC | 120 | `OTHER` -> **`OFFSET`** | `UNCOATED` | `UNCOATED` | `UNKNOWN` | 144 µm | `evd_cls_e8c64d1e6d34abd3` | `cls_req_9cd74da8099c87fc` | `cls_prm_f27c7eaa73b08b3e` |
| 54 | `var_677238dbfd3b2775` | `prod_cfdd5ac7ff142741` | Serixo 120 52x72 FSC | 120 | `OTHER` -> **`OFFSET`** | `UNCOATED` | `UNCOATED` | `UNKNOWN` | 144 µm | `evd_cls_ddf5b80a66ec0839` | `cls_req_df6821a7a1085316` | `cls_prm_4c747e79cc94429b` |
| 55 | `var_a8b3dac75d7ab12c` | `prod_2d71814b10357a13` | Serixo 120 64x45 FSC | 120 | `OTHER` -> **`OFFSET`** | `UNCOATED` | `UNCOATED` | `UNKNOWN` | 144 µm | `evd_cls_1d26d447b0015b61` | `cls_req_7000d5e646c8324f` | `cls_prm_e368fdefc993c6cb` |
| 56 | `var_b7f99199369985de` | `prod_f7308e4fe6517f16` | Serixo 140 32x45 FSC | 140 | `OTHER` -> **`OFFSET`** | `UNCOATED` | `UNCOATED` | `UNKNOWN` | 164 µm | `evd_cls_c65cc796e794d78b` | `cls_req_b1f5c1975be3f044` | `cls_prm_293ce230220d38d1` |
| 57 | `var_46357f036039fb48` | `prod_82ff433d295f57f9` | Serixo 140 59x41 FSC | 140 | `OTHER` -> **`OFFSET`** | `UNCOATED` | `UNCOATED` | `UNKNOWN` | 164 µm | `evd_cls_dd98a91f5c09bb2e` | `cls_req_7ebc1b66dc441379` | `cls_prm_f8607f0d946ddcba` |
| 58 | `var_4abef3daaa42443c` | `prod_6619932dd298c88d` | Serixo 140 88x57 FSC | 140 | `OTHER` -> **`OFFSET`** | `UNCOATED` | `UNCOATED` | `UNKNOWN` | 164 µm | `evd_cls_8bed849a56591707` | `cls_req_cb7b03a512346c44` | `cls_prm_08c5207bcdf6d340` |
| 59 | `var_aae9ce02dffc74d8` | `prod_d428d61420c2a2f0` | Serixo 170 90x64 FSC | 170 | `OTHER` -> **`OFFSET`** | `UNCOATED` | `UNCOATED` | `UNKNOWN` | 198 µm | `evd_cls_995c38ba6fb2f49b` | `cls_req_89c9c3520fd73298` | `cls_prm_a6164609c0a2eaa5` |
| 60 | `var_702b565575230354` | `prod_e384eb0d089eafb3` | Serixo 190 64X90 FSC | 190 | `OTHER` -> **`OFFSET`** | `UNCOATED` | `UNCOATED` | `UNKNOWN` | 221 µm | `evd_cls_9a3b29046644ca08` | `cls_req_91cf413649332bdc` | `cls_prm_fcdbe7a72ff458e0` |
| 61 | `var_f3478e708461585c` | `prod_6a756b2d864c8e18` | SERIXO 70 45x64 | 70 | `OTHER` -> **`OFFSET`** | `UNCOATED` | `UNCOATED` | `UNKNOWN` | 90 µm | `evd_cls_2249674fb770acb2` | `cls_req_f69817eeb32dd302` | `cls_prm_5718aef64fdabb1f` |
| 62 | `var_321ee9ca05450fca` | `prod_db06b9b4d8d75a5f` | Serixo 90 72x52 FSC | 90 | `OTHER` -> **`OFFSET`** | `UNCOATED` | `UNCOATED` | `UNKNOWN` | 115 µm | `evd_cls_12e5f594f9934f0f` | `cls_req_6804e6bfc5ed2366` | `cls_prm_5fa7b4f45ceabf1f` |
| 63 | `var_85a26f46770585f5` | `prod_5efb190fc60f3b87` | Soporset Premium 90 92x64 FSC | 90 | `OTHER` -> **`OFFSET`** | `UNCOATED` | `UNCOATED` | `UNKNOWN` | 115 µm | `evd_cls_c1e7d312411a5981` | `cls_req_fb52591e74b897c0` | `cls_prm_77ec4284b6e13e3d` |
| 64 | `var_093db33af62a444c` | `prod_860cf143c03299fa` | Volume Maxima 200 90x64 FSC | 200 | `OTHER` -> **`OFFSET`** | `UNCOATED` | `UNCOATED` | `UNKNOWN` | 216 µm | `evd_cls_d4421f2ccc30c138` | `cls_req_2145353f4257b895` | `cls_prm_3debf1c569fd2b50` |
| 65 | `var_a0dda598764af698` | `prod_e6643e3de2085de3` | Fredrigoni ArcoPrint Extra White 300g 72... | 300 | `OTHER` -> **`OFFSET`** | `UNCOATED` | `UNCOATED` | `UNKNOWN` | `NULL` | `evd_cls_9b050a6bd36a1ca1` | `cls_req_e87bfe8abe4545d7` | `cls_prm_5571c799d12272a6` |
| 66 | `var_f3c1b55f55b0144e` | `prod_0f8c631b9debbb56` | Arctic Volume Ice 130 63x88 FSC | 130 | `OTHER` -> **`COATED`** | `COATED` | `MATT` | `UNKNOWN` | 140 µm | `evd_cls_d800cef910c140ac` | `cls_req_a44de6040d879fa4` | `cls_prm_3c5dbff06d1f25c0` |
| 67 | `var_3e129a847a4c9809` | `prod_bb30b02fbafc2ee4` | Arctic Volume ice 130 72x102 FSC | 130 | `OTHER` -> **`COATED`** | `COATED` | `MATT` | `UNKNOWN` | 140 µm | `evd_cls_1b2a14004bb834ca` | `cls_req_bb52974ecb4cfe96` | `cls_prm_84dc70a276c175a8` |
| 68 | `var_df63696461c9c27f` | `prod_8b87f9b33787e5e5` | Arctic Volume Maxima 115 72x102 | 115 | `OTHER` -> **`COATED`** | `COATED` | `MATT` | `UNKNOWN` | `NULL` | `evd_cls_ed6cecf536e0f015` | `cls_req_39a5893f82d4cbdc` | `cls_prm_23e5103379518ac0` |
| 69 | `var_45d44ff4537bef38` | `prod_ab23856a88e08235` | Arctic Volume White 200 102x72 FSC | 200 | `OTHER` -> **`COATED`** | `COATED` | `MATT` | `UNKNOWN` | 220 µm | `evd_cls_d48a620b971d5b0e` | `cls_req_7518add4fab3773f` | `cls_prm_719e6618719f06b3` |
| 70 | `var_4754d3a2eeb5d5b2` | `prod_92cffc1497d879cd` | GALERIE FINE G 80 72x102 | 80 | `OTHER` -> **`COATED`** | `COATED` | `GLOSS` | `UNKNOWN` | 65 µm | `evd_cls_6ba827747e63ca5e` | `cls_req_b54deedd4b2a0a41` | `cls_prm_37d14c176dfc56fe` |
| 71 | `var_041f70d8636677bf` | `prod_c9a5eca50c2aa1d4` | GALERIE FINE G 90 72x102 | 90 | `OTHER` -> **`COATED`** | `COATED` | `GLOSS` | `UNKNOWN` | 72 µm | `evd_cls_6edbc73a195208c4` | `cls_req_f71409fb8b53b45e` | `cls_prm_b53a67b9cef7cda3` |
| 72 | `var_05d847c02fe626f1` | `prod_54114e51daba55fd` | GALERIE FINE G 90 90x64 | 90 | `OTHER` -> **`COATED`** | `COATED` | `GLOSS` | `UNKNOWN` | 72 µm | `evd_cls_7f08b749488dc945` | `cls_req_64ccd854b944d765` | `cls_prm_c9ad611e7533816b` |
| 73 | `var_73bdedfa14adf6c1` | `prod_395772454278371f` | Garda Recycled Print 115 72x102 FSC | 115 | `OTHER` -> **`COATED`** | `COATED` | `MATT` | `UNKNOWN` | 112 µm | `evd_cls_dfa0e19e35751f4e` | `cls_req_d4e65521a188cad0` | `cls_prm_c43b2ed179a46ba8` |
| 74 | `var_efb0bba9d8ba69c1` | `prod_9b7c21eb358746a1` | Garda Recycled Print 150 72x102 FSC | 150 | `OTHER` -> **`COATED`** | `COATED` | `MATT` | `UNKNOWN` | `NULL` | `evd_cls_97827354c90da48c` | `cls_req_aae2a5e46ef1f8f5` | `cls_prm_265d5cdaaa3cc477` |
| 75 | `var_a5300aff8d28e40d` | `prod_b0e880c71235b8dc` | GardaMatt Art 130 70x100 FSC | 130 | `OTHER` -> **`COATED`** | `COATED` | `MATT` | `UNKNOWN` | 111 µm | `evd_cls_b338443aaab40ffe` | `cls_req_2b1ebc2ad18e507f` | `cls_prm_e92e0256198a5207` |
| 76 | `var_1ad5657e5fb8deb8` | `prod_557617249c177ca2` | GardaMatt Art 170 64x92 | 170 | `OTHER` -> **`COATED`** | `COATED` | `MATT` | `UNKNOWN` | 153 µm | `evd_cls_21854320eb00a8de` | `cls_req_fa7125ca6afc9d6c` | `cls_prm_5968afda8360a4c8` |
| 77 | `var_dbd5357075534e3b` | `prod_c2d074b1ee1f7ae7` | Nevia Plus C1S 80g 71my 52X72cm | 80 | `OTHER` -> **`COATED`** | `COATED` | `GLOSS` | `UNKNOWN` | `NULL` | `evd_cls_fa1cc93a9ceeb4f4` | `cls_req_f4fd3305bcf3c864` | `cls_prm_84a6e4ddddcaa7c0` |
