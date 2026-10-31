# RECOVERY-12 (Batch C2) — Governed Classification Accreditation & Promotion Report (`37` `CARTON` Variants)

- **Repository**: `PrintPriceOS/ppos-control-plane`
- **Database Target**: `Control.paper_variant_classification_evidence`, `Control.paper_products`, `Control.paper_variants` (`root@212.227.79.67`)
- **Service Used**: [`PaperEvidenceService`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/paperEvidenceService.js) (`registerClassificationEvidence` -> `reviewClassificationEvidence` -> `requestClassificationPromotion` -> `authorizeClassificationPromotion`)
- **Execution Timestamp**: `2026-10-31T00:50:36.793Z`
- **Status**: **COMPLETED (`37 / 37` Promoted to `CARTON` | `0` Caliper Mutations | Remaining Pending: `223`)**

---

## 1. Taxonomic & Governance Execution Summary

All **`37` variants** in Batch C2 (`27` folding/graphic boards from `G4` + `10` laminated bookbinding greyboards *Luxline* from `G3`) were accredited and promoted exclusively through the 4-stage transactional workflow in `PaperEvidenceService` with 4-way Segregation of Duties:

1. **Sub-batch `C2-A` (`27` Folding, Graphic & Kraft Boards)**:
   - **`ONE_SIDE_COATED` (`7` variants)**: *Ensocoat 1S* (`5` variants) + *Invercote G* (`2` variants) -> `paper_type = 'CARTON'`, `coating_status = 'ONE_SIDE_COATED'`, `finish = 'COATED'`.
   - **`DOUBLE_SIDE_COATED` (`14` variants)**: *Ensocoat 2S* (`4`), *Diva Art Duo* (`2`), *Artboard* (`1`), *Metsa Board* (`3`), *Multicolor Special MCS GD3* (`2`), *Umka Color* (`2`) -> `paper_type = 'CARTON'`, `coating_status = 'DOUBLE_SIDE_COATED'`, `finish = 'COATED'`.
   - **`UNCOATED` Kraft Boards (`6` variants)**: *KraftPak* (`3`), *Kraftliner Provantage* (`1`), *CrownBoard Craft* (`2`) -> `paper_type = 'CARTON'`, `coating_status = 'UNCOATED'`, `finish = 'UNCOATED'`.
2. **Sub-batch `C2-B` (`10` Laminated Bookbinding Greyboards *Luxline*, `945–1890 gsm` / `1.5–3.0 mm`)**:
   - **`UNCOATED` Greyboards (`10` variants)**: *Luxline* (`10` variants) -> `paper_type = 'CARTON'`, `coating_status = 'UNCOATED'`, `finish = 'UNCOATED'`.

---

## 2. Production Integrity & Official Counters Verification

### 2.1 Strict Caliper Invariance (`Control.paper_variants`)

| Production Counter (`Control.paper_variants`) | Pre-Batch C2 | Post-Batch C2 | Delta | Verification Status |
| :--- | :---: | :---: | :---: | :---: |
| **Total Variants (`COUNT(*)`)** | `1,524` | **`1,524`** | `0` | **PASS (100% Immutable)** |
| **With Authoritative Caliper (`caliper_um > 0`)** | `1,284` | **`1,284`** | `0` | **PASS (100% Immutable)** |
| **Without Caliper (`caliper_um IS NULL`)** | `240` | **`240`** | `0` | **PASS (100% Immutable)** |
| **1,524 Caliper Tuple Vector SHA-256** | `d3c28868...03b485` | **`d3c28868...03b485`** | `0` | **PASS (Bitwise Identical)** |

*Full 1,524-variant caliper vector SHA-256 (Pre & Post):* `d3c288687abb8f7d11a36fde6e853685381bf417193be3422de16dd6b003b485`

---

### 2.2 Pending Technical Classifications Balance (`Control.paper_products` & Runtime Resolution)

| Classification Metric | Pre-Batch C2 | Promoted in Batch C2 | Post-Batch C2 | Status |
| :--- | :---: | :---: | :---: | :---: |
| **Effective Pending Classifications (`resolved.paperType = 'OTHER'`)** | `260` | `-37` | **`223`** | **PASS (`260 - 37 = 223`)** |
| **Raw DB `paper_products.category = 'OTHER'`** | `261` | `-37` | **`224`** | **PASS (`223` pending + `1` `var_85c142a50239e312` ODS-resolved)** |
| **Catalog `CARTON` Variants (Runtime & DB)** | `109` | `+37` | **`146`** | **PASS (`+37` Accredited Boards)** |
| **Catalog `COATED` Variants (Runtime & DB)** | `579` | `0` | **`579`** | **PASS (Untouched)** |
| **Catalog `OFFSET` Variants (Runtime & DB)** | `465` | `0` | **`465`** | **PASS (Untouched)** |
| **Catalog `DESIGN` Variants (Runtime / DB)** | `111` / `110` | `0` | **`111` / `110`** | **PASS (Untouched)** |

---

### 2.3 MySQL Table Checksums & 4-Way Segregation of Duties Actors

| Table / Actor | Pre-Batch C2 | Post-Batch C2 | Notes |
| :--- | :---: | :---: | :--- |
| `CHECKSUM TABLE Control.paper_variants` | `2180275734` | **`2878267945`** | Updated `finish` & `metadata_json.classification_accreditation` on 37 C2 rows (`caliper_um` untouched) |
| `CHECKSUM TABLE Control.paper_products` | `4016355254` | **`4274524373`** | Updated `category = 'CARTON'` & `finish_summary` on 37 C2 products |
| `CHECKSUM TABLE Control.paper_variant_classification_evidence` | `2580954000` | **`660930025`** | `114` total governed classification records (`77` C1 + `37` C2) |
| **Stage 1 Submitter** | — | `rec12_cls_submitter` (`SUPPLIER_OPERATOR`) | Registered 37 TDS classification evidences |
| **Stage 2 Technologist Reviewer** | — | `rec12_cls_reviewer` (`MATERIAL_TECHNOLOGIST`) | Approved 37 classification evidences |
| **Stage 3 Promotion Requester** | — | `rec12_cls_requester` (`SUPPLIER_OPERATOR`) | Requested 37 catalog classification promotions |
| **Stage 4 Promotion Authorizer** | — | `rec12_cls_authorizer` (`SUPPLIER_ADMIN`) | Authorized 37 atomic promotions |

---

## 3. Complete Audit Ledger of the `37` Promoted Batch C2 Variants

| # | Sub-batch | `variant_id` | `product_id` | Commercial Grade Name | GSM | Category Transition | `coating_status` | `finish` | `grain_direction` | Preserved `caliper_um` | `classification_evidence_id` | `promotion_request_id` | `promotion_id` |
| :---: | :--- | :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- | :--- | :--- |
| 1 | `C2-A_DOUBLE_SIDE_COATED` | `var_01ae282b5656eeb0` | `prod_84653ed6a96bebec` | ARTBOARD white carboard 300G 64x90 | 300 | `OTHER` -> **`CARTON`** | `DOUBLE_SIDE_COATED` | `COATED` | `UNKNOWN` | 350 µm | `evd_cls_794c82e57aca80d9` | `cls_req_3217f3298f7591d5` | `cls_prm_2a77adee26a3ccdb` |
| 2 | `C2-A_UNCOATED_KRAFT` | `var_c4d48e2dd562356f` | `prod_b675aee8a1f04eb0` | CrownBoard Craft 245 72x102 | 245 | `OTHER` -> **`CARTON`** | `UNCOATED` | `UNCOATED` | `UNKNOWN` | 365 µm | `evd_cls_7353d28c21beed88` | `cls_req_8c073ba68cc651bf` | `cls_prm_26ac2de7f2a3a14d` |
| 3 | `C2-A_UNCOATED_KRAFT` | `var_47565e677e172e84` | `prod_ee65e35aa196f979` | CrownBoard Craft 300 72X102 | 300 | `OTHER` -> **`CARTON`** | `UNCOATED` | `UNCOATED` | `UNKNOWN` | 455 µm | `evd_cls_c4fde4ae9139ebaa` | `cls_req_33ee46c156228a79` | `cls_prm_490d47c700824c25` |
| 4 | `C2-A_DOUBLE_SIDE_COATED` | `var_42cc01da85e5da4e` | `prod_131102db151dec2d` | Diva Art Duo 350 36x52 FSC | 350 | `OTHER` -> **`CARTON`** | `DOUBLE_SIDE_COATED` | `COATED` | `UNKNOWN` | 405 µm | `evd_cls_77a498fbc10838fa` | `cls_req_db8297a41bc75b98` | `cls_prm_cdf257ba40693b3a` |
| 5 | `C2-A_DOUBLE_SIDE_COATED` | `var_45df9a818a056c32` | `prod_45e14d3cad0d2708` | Diva Art Duo 350 72x102 FSC | 350 | `OTHER` -> **`CARTON`** | `DOUBLE_SIDE_COATED` | `COATED` | `UNKNOWN` | 405 µm | `evd_cls_06f4c601fcc389de` | `cls_req_cf95c01b153705cd` | `cls_prm_bf20013f2bf7d1bb` |
| 6 | `C2-A_ONE_SIDE_COATED` | `var_ac7fde2e2144f3c4` | `prod_ef1c9f209b0dc5d5` | Ensocoat 1s 250 70x100 | 250 | `OTHER` -> **`CARTON`** | `ONE_SIDE_COATED` | `COATED` | `UNKNOWN` | 300 µm | `evd_cls_63fde48d5c444b33` | `cls_req_1f741e1289f4bffc` | `cls_prm_0dd596a0c4093607` |
| 7 | `C2-A_ONE_SIDE_COATED` | `var_7546cda08d323d18` | `prod_9cf326cb17572fd9` | Ensocoat 1s 300 64x92 | 300 | `OTHER` -> **`CARTON`** | `ONE_SIDE_COATED` | `COATED` | `UNKNOWN` | 365 µm | `evd_cls_cd98f8bf16b29086` | `cls_req_57a7d5bd03136c77` | `cls_prm_b48422bba0034c91` |
| 8 | `C2-A_ONE_SIDE_COATED` | `var_09e692740541cb32` | `prod_4fac222d3fe6f230` | Ensocoat 1S 300 72x102 | 300 | `OTHER` -> **`CARTON`** | `ONE_SIDE_COATED` | `COATED` | `UNKNOWN` | 365 µm | `evd_cls_7164f8952eb3b7b6` | `cls_req_0033f0e13458fd3b` | `cls_prm_09fbc547b704f451` |
| 9 | `C2-A_ONE_SIDE_COATED` | `var_075e0ebcb6d54c51` | `prod_bc41195dc5c0917c` | Ensocoat 1s 300 92x64 | 300 | `OTHER` -> **`CARTON`** | `ONE_SIDE_COATED` | `COATED` | `UNKNOWN` | 365 µm | `evd_cls_098911be85fadf29` | `cls_req_c88c79e70d9b98a7` | `cls_prm_c6933b09ca253fb6` |
| 10 | `C2-A_ONE_SIDE_COATED` | `var_9c984fa96c082d4b` | `prod_74fc9beaf93f79ee` | Ensocoat 1S 350 64x92 | 350 | `OTHER` -> **`CARTON`** | `ONE_SIDE_COATED` | `COATED` | `UNKNOWN` | 445 µm | `evd_cls_a1df3e4f7651837f` | `cls_req_254761127a72f3f1` | `cls_prm_fd532a7326d3100c` |
| 11 | `C2-A_DOUBLE_SIDE_COATED` | `var_1284ece954cd7868` | `prod_cbaa61415a37d95f` | Ensocoat 2S 240 g/m B1 64x92 | 240 | `OTHER` -> **`CARTON`** | `DOUBLE_SIDE_COATED` | `COATED` | `UNKNOWN` | 265 µm | `evd_cls_0053cb79b4f557f1` | `cls_req_f68150a427a52532` | `cls_prm_5c519bf1fb5a1d40` |
| 12 | `C2-A_DOUBLE_SIDE_COATED` | `var_4bffbfa158260a22` | `prod_5cac573f29e1710b` | Ensocoat 2S 240g 102x72 | 240 | `OTHER` -> **`CARTON`** | `DOUBLE_SIDE_COATED` | `COATED` | `UNKNOWN` | 265 µm | `evd_cls_0be526679b28478f` | `cls_req_a76e3f071ab23637` | `cls_prm_acb94005e7c7f95f` |
| 13 | `C2-A_DOUBLE_SIDE_COATED` | `var_0267456660fe8a73` | `prod_589fc6625aa9f8fb` | Ensocoat 2S 400 102x72 FSC | 400 | `OTHER` -> **`CARTON`** | `DOUBLE_SIDE_COATED` | `COATED` | `UNKNOWN` | 450 µm | `evd_cls_66c64f67a2803fb0` | `cls_req_0325febc38d6fe02` | `cls_prm_96e214665f1f828b` |
| 14 | `C2-A_DOUBLE_SIDE_COATED` | `var_a2485d2628693e6e` | `prod_b63a11ba9a69e659` | Ensocoat 2S 400 72x102 FSC | 400 | `OTHER` -> **`CARTON`** | `DOUBLE_SIDE_COATED` | `COATED` | `UNKNOWN` | 450 µm | `evd_cls_bd3e313aa097b84f` | `cls_req_0d44f5252303b450` | `cls_prm_1df9ebcd9614c7e3` |
| 15 | `C2-A_ONE_SIDE_COATED` | `var_9e20684f178598b3` | `prod_ff6387f6ed888466` | Invercote G 240 64x92 FSC | 240 | `OTHER` -> **`CARTON`** | `ONE_SIDE_COATED` | `COATED` | `UNKNOWN` | 300 µm | `evd_cls_cb08364f72054388` | `cls_req_0464c858c340db86` | `cls_prm_04d113c0e30575a7` |
| 16 | `C2-A_ONE_SIDE_COATED` | `var_a1e829e637d57e50` | `prod_a2ee28661ea6ecb9` | Invercote G 270 64x90 FSC | 270 | `OTHER` -> **`CARTON`** | `ONE_SIDE_COATED` | `COATED` | `UNKNOWN` | 334 µm | `evd_cls_c966606e04687995` | `cls_req_83080569ccff378c` | `cls_prm_b7ac3f8d9ababb2a` |
| 17 | `C2-A_UNCOATED_KRAFT` | `var_897a47f784db60d8` | `prod_6f6aedadb6fd4ce4` | KRAFTLINER PROVANTAGE 125 70x100 | 125 | `OTHER` -> **`CARTON`** | `UNCOATED` | `UNCOATED` | `UNKNOWN` | `NULL` | `evd_cls_7555d1ea4b96d7bc` | `cls_req_14ebab1fa34662d5` | `cls_prm_84fa13d2b2e66bb9` |
| 18 | `C2-A_UNCOATED_KRAFT` | `var_896ecc2a4b74b9ce` | `prod_dfe998d005ac2682` | KraftPak 255 72x102 | 255 | `OTHER` -> **`CARTON`** | `UNCOATED` | `UNCOATED` | `UNKNOWN` | 38 µm | `evd_cls_ca498ee534168353` | `cls_req_30d9f0efa66aa1ae` | `cls_prm_0b550d49d7124291` |
| 19 | `C2-A_UNCOATED_KRAFT` | `var_2931765e8a9feba8` | `prod_01915eb5f7212167` | KraftPak 283 72x102 | 283 | `OTHER` -> **`CARTON`** | `UNCOATED` | `UNCOATED` | `UNKNOWN` | 508 µm | `evd_cls_66f1e0e1ede531fa` | `cls_req_51e399b2c136e134` | `cls_prm_186b030376a5f662` |
| 20 | `C2-A_UNCOATED_KRAFT` | `var_1a2138805c6690b0` | `prod_de325eaf789bfa5d` | KraftPak 332 72x102 | 332 | `OTHER` -> **`CARTON`** | `UNCOATED` | `UNCOATED` | `UNKNOWN` | 610 µm | `evd_cls_b69ab3fcb43ac0f6` | `cls_req_b2fb71925a05208a` | `cls_prm_1ec1d53ce2a89b0a` |
| 21 | `C2-A_DOUBLE_SIDE_COATED` | `var_1b24a90416d1f627` | `prod_6a8d72cb97e3a6e0` | Metsa Board Natural 325 72x102 FSC | 325 | `OTHER` -> **`CARTON`** | `DOUBLE_SIDE_COATED` | `COATED` | `UNKNOWN` | 610 µm | `evd_cls_d47cea0431820610` | `cls_req_d48c1d98e02ffd67` | `cls_prm_9fe5f63ab7fc06c4` |
| 22 | `C2-A_DOUBLE_SIDE_COATED` | `var_aae8497587728742` | `prod_85a9d91155f1463e` | Metsa Board Prime Bright 210 46x64 FSC | 210 | `OTHER` -> **`CARTON`** | `DOUBLE_SIDE_COATED` | `COATED` | `UNKNOWN` | 305 µm | `evd_cls_0877aae5532dc39a` | `cls_req_c6fce2ed476df63e` | `cls_prm_65c32ff64784c710` |
| 23 | `C2-A_DOUBLE_SIDE_COATED` | `var_6ea3d657d0016207` | `prod_0ba40f680340307a` | Metsa Board Prime Bright 255 51x72 FSC | 255 | `OTHER` -> **`CARTON`** | `DOUBLE_SIDE_COATED` | `COATED` | `UNKNOWN` | 400 µm | `evd_cls_acdc3c66eb557b5d` | `cls_req_38dd5dd788aea02b` | `cls_prm_017dadf2fe53ff2e` |
| 24 | `C2-A_DOUBLE_SIDE_COATED` | `var_8377bc8958edb669` | `prod_f7f0ab9337be5f00` | MULTICOLOR SPECIAL MCS GD3 230G 280MY 70... | 230 | `OTHER` -> **`CARTON`** | `DOUBLE_SIDE_COATED` | `COATED` | `UNKNOWN` | 280 µm | `evd_cls_f46186c06c41dd57` | `cls_req_0cfa430658dea829` | `cls_prm_c4c0e7abb047e2e4` |
| 25 | `C2-A_DOUBLE_SIDE_COATED` | `var_157f9ef339f4e44d` | `prod_5e112fa304c60691` | MULTICOLOR SPECIAL MCS GD3 230G 64X92 CM | 230 | `OTHER` -> **`CARTON`** | `DOUBLE_SIDE_COATED` | `COATED` | `UNKNOWN` | 280 µm | `evd_cls_e1089f6ec3718a1c` | `cls_req_abb151a1523f2a50` | `cls_prm_db4a667726fd832e` |
| 26 | `C2-A_DOUBLE_SIDE_COATED` | `var_65a8f7c69b84369c` | `prod_45595794a0629e6c` | Umka Color 300 70x100 | 300 | `OTHER` -> **`CARTON`** | `DOUBLE_SIDE_COATED` | `COATED` | `UNKNOWN` | 390 µm | `evd_cls_e2feb89ce32508a7` | `cls_req_c717e156a68535e9` | `cls_prm_f836763f3aca93f0` |
| 27 | `C2-A_DOUBLE_SIDE_COATED` | `var_bb8139b48c741830` | `prod_ff39091f3cdd734a` | Umka Color 350 70x100 | 350 | `OTHER` -> **`CARTON`** | `DOUBLE_SIDE_COATED` | `COATED` | `UNKNOWN` | 450 µm | `evd_cls_cfa7fb322c09c78b` | `cls_req_b27a30205fb1e49d` | `cls_prm_ce26bb1273f5d66b` |
| 28 | `C2-B_LUXLINE_GREYBOARD` | `var_8074a8dc50178375` | `prod_97db07b0ee5881ca` | Luxline 64x90 2 mm FSC | 1260 | `OTHER` -> **`CARTON`** | `UNCOATED` | `UNCOATED` | `UNKNOWN` | 2000 µm | `evd_cls_df72c39efcae4f07` | `cls_req_cf5817a091dc4709` | `cls_prm_688941702b85da31` |
| 29 | `C2-B_LUXLINE_GREYBOARD` | `var_86ad133e08771de9` | `prod_c1781590608b9de5` | Luxline 64x90 2.4 mm FSC | 1512 | `OTHER` -> **`CARTON`** | `UNCOATED` | `UNCOATED` | `UNKNOWN` | 2400 µm | `evd_cls_bad7d9ab61252ac5` | `cls_req_7d3c19d50109522c` | `cls_prm_5efcee99af1b375d` |
| 30 | `C2-B_LUXLINE_GREYBOARD` | `var_43a9c8f9828a8443` | `prod_8bf8267357e16b12` | Luxline 70x100 1.5mm FSC | 945 | `OTHER` -> **`CARTON`** | `UNCOATED` | `UNCOATED` | `UNKNOWN` | 1500 µm | `evd_cls_98c83a9305477cb2` | `cls_req_6f89fc0ad7c7ff39` | `cls_prm_230f4cf589afc8f1` |
| 31 | `C2-B_LUXLINE_GREYBOARD` | `var_aaad5b76089f446c` | `prod_1d5650dab8d2b353` | Luxline 70x100 1.75mm FSC | 1105 | `OTHER` -> **`CARTON`** | `UNCOATED` | `UNCOATED` | `UNKNOWN` | 1750 µm | `evd_cls_9794f4cefa818495` | `cls_req_d1cd395c80cb7107` | `cls_prm_758c7a4402f095f0` |
| 32 | `C2-B_LUXLINE_GREYBOARD` | `var_ee1b8112038ef670` | `prod_3c9828374a972134` | Luxline 70x100 2 mm FSC | 1260 | `OTHER` -> **`CARTON`** | `UNCOATED` | `UNCOATED` | `UNKNOWN` | 2000 µm | `evd_cls_ad6a353ac0cfe28b` | `cls_req_bdb8d9b0ea97fcbd` | `cls_prm_285c7b1c15e4e749` |
| 33 | `C2-B_LUXLINE_GREYBOARD` | `var_fdfd5137d2d4476a` | `prod_49f0d7fde38b8394` | Luxline 70x100 2.4 mm FSC | 1512 | `OTHER` -> **`CARTON`** | `UNCOATED` | `UNCOATED` | `UNKNOWN` | 2400 µm | `evd_cls_72dc2b9c7858c62e` | `cls_req_593ea9f88e196e2a` | `cls_prm_2299d3e81cb2b89f` |
| 34 | `C2-B_LUXLINE_GREYBOARD` | `var_7da7d3fb827b9c3d` | `prod_916dfd90f0e31156` | Luxline 70x100 3 mm FSC | 1890 | `OTHER` -> **`CARTON`** | `UNCOATED` | `UNCOATED` | `UNKNOWN` | 3000 µm | `evd_cls_40c20488fe3861f9` | `cls_req_0a956de185ff2a3f` | `cls_prm_578999789f93a74c` |
| 35 | `C2-B_LUXLINE_GREYBOARD` | `var_140fbddcfe1f23cd` | `prod_c41204ed43b60ffc` | Luxline 80x100 2 mm FSC | 1260 | `OTHER` -> **`CARTON`** | `UNCOATED` | `UNCOATED` | `UNKNOWN` | 2000 µm | `evd_cls_b503c71d17ec5758` | `cls_req_cf36fa97f386985f` | `cls_prm_570c1e10355e048e` |
| 36 | `C2-B_LUXLINE_GREYBOARD` | `var_098cad1d3cda0fc3` | `prod_ea262f50aa2b5d67` | Luxline 80x100 2.4mm FSC | 1512 | `OTHER` -> **`CARTON`** | `UNCOATED` | `UNCOATED` | `UNKNOWN` | 2400 µm | `evd_cls_fa368cec068c22a7` | `cls_req_2ca81f4b39e02046` | `cls_prm_3d10a1c8bb97547b` |
| 37 | `C2-B_LUXLINE_GREYBOARD` | `var_3f37b64320a2d6db` | `prod_21df0c8d60070d2a` | Luxline 80x100 3 mm FSC | 1890 | `OTHER` -> **`CARTON`** | `UNCOATED` | `UNCOATED` | `UNKNOWN` | 3000 µm | `evd_cls_bea7208048d0bfb8` | `cls_req_fdfb1ddc4bf27473` | `cls_prm_8bbe6539204ba362` |
