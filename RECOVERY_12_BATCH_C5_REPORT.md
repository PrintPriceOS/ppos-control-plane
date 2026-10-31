# PrintPrice OS — RECOVERY-12: Batch C5 Final Classification Accreditation Report (64 Variants — 100% Completion of 337 Pending Classifications)

> [!IMPORTANT]
> **Estado de Ejecución**: **COMPLETADO AL 100% — ACREDITACIÓN GOBERNADA DE LAS 64 VARIANTES FINALES (`337 / 337` CLASIFICACIONES TÉCNICAS RESUELTAS) E INMUTABILIDAD 100% DE ESPESORES CERTIFICADA**
> - **Fecha de ejecución**: `2026-10-31T01:21:25.323Z`
> - **Servicio transaccional**: `PaperEvidenceService` (`src/api/services/paperEvidenceService.js`)
> - **Tabla de auditoría**: `Control.paper_variant_classification_evidence` (total final acumulado: **`337`** de **`337`** registros acreditados y promovidos — `100,00%`):
>   - **Batch C1**: `77` variantes (`65 OFFSET` + `12 COATED`)
>   - **Batch C2**: `37` variantes (`37 CARTON`)
>   - **Batch C3**: `62` variantes (`62 DESIGN` — recubrimientos de encuadernación)
>   - **Batch C4**: `97` variantes (`97 DESIGN` — Fine Art y creativos)
>   - **Batch C5 (Lote de Cierre)**: **`64` variantes** (`36 DESIGN` *Olin Colours* + `28 OTHER` acreditados de especialidad técnica real)
> - **Inmutabilidad de espesores (`caliper_um`)**: **100% preservada** (`1.524` total | `1.284` con espesor | `240` sin espesor | Hash SHA-256 bit a bit idéntico: `d3c288687abb8f7d11a36fde6e853685381bf417193be3422de16dd6b003b485`).
> - **Clasificaciones pendientes no auditadas restantes**: **`0`** (`isSyntheticOtherUncoated = false` en las 337 variantes).

---

## 1. Certificación de Inmutabilidad de Espesores y Balance Global Final (`Control.paper_variants`)

| Indicador Oficial en Producción (`Control`) | Pre-Batch C5 | Post-Batch C5 (Cierre 100%) | Delta | Estado |
| :--- | :---: | :---: | :---: | :---: |
| **Total registros (`paper_variants`)** | `1524` | **`1524`** | `0` | **INMUTABLE (OK)** |
| **Con espesor (`caliper_um > 0`)** | `1284` | **`1284`** | `0` | **INMUTABLE (OK)** |
| **Sin espesor (`caliper_um IS NULL`)** | `240` | **`240`** | `0` | **INMUTABLE (OK)** |
| **SHA-256 Vector 1.524 Espesores** | `d3c28868...03b485` | **`d3c28868...03b485`** | `0 bits` | **IDÉNTICO BIT A BIT** |
| **Clasificación `DESIGN` activa (runtime)** | `270` | **`306`** | **`+36`** | **PROMOVIDAS C5-A (270 -> 306)** |
| **Clasificación `CARTON` activa (runtime)** | `146` | **`146`** | `0` | **INTACTO (C2)** |
| **Clasificación `OFFSET` activa (runtime)** | `465` | **`465`** | `0` | **INTACTO (C1)** |
| **Clasificación `COATED` activa (runtime)** | `579` | **`579`** | `0` | **INTACTO (C1)** |
| **Sustratos Especiales `OTHER` acreditados (`ACCREDITED_EVIDENCE`)** | `0` | **`28`** | **`+28`** | **ACREDITADOS C5-B (0 -> 28)** |
| **Clasificaciones pendientes no auditadas restantes** | `64` | **`0`** | **`-64`** | **LIQUIDADO AL 100% (64 -> 0)** |
| **Total evidencias en `paper_variant_classification_evidence`** | `273` | **`337`** | **`+64`** | **337 / 337 PROMOVIDAS (100,00%)** |
| **`CHECKSUM TABLE paper_variants`** | `1916298230` | **`22724838`** | Actualizado | `finish` + `metadata_json` |
| **`CHECKSUM TABLE paper_products`** | `2176509447` | **`349664636`** | Actualizado | `category` + `finish_summary` |
| **`CHECKSUM TABLE paper_variant_classification_evidence`** | `701163957` | **`3587940732`** | `+64 filas` | **`337` evidencias totales (`100%`)** |

---

## 2. Gobernanza, Segregación de Roles (SoD) y Desactivación de `isSyntheticOtherUncoated`

1. **Segregación de funciones de 4 vías (SoD)** aplicada en cada una de las 64 variantes:
   - **Stage 1 (`registerClassificationEvidence`)**: `rec12_cls_submitter` (`SUPPLIER_OPERATOR`)
   - **Stage 2 (`reviewClassificationEvidence`)**: `rec12_cls_reviewer` (`MATERIAL_TECHNOLOGIST`) -> Decisión `APPROVE`
   - **Stage 3 (`requestClassificationPromotion`)**: `rec12_cls_requester` (`SUPPLIER_OPERATOR`)
   - **Stage 4 (`authorizeClassificationPromotion`)**: `rec12_cls_authorizer` (`SUPPLIER_ADMIN`) -> Estado final `PROMOTED`
2. **Desactivación certificada del guard sintético en Sublote C5-B (`28` sustratos técnicos)**:
   - Aunque las `28` variantes de especialidad real (*Reacto NCR*, *Syn-Coat*, *Priplak*, *Sticotac*, *Raflamatt*, *Chantaffiche Blueback*, *Metalprint*, *Kaskad*, *Brūns Kraft*, *Antislip*, *Envel.Postac*) mantienen `paper_type = 'OTHER'`, su promoción gobernada inyecta `classification_accreditation` con `coating_confidence = 'ACCREDITED_EVIDENCE'`, `coating_status = 'SPECIALTY'` o `'SYNTHETIC'`, y `isSyntheticUncoatedResolved = false` en `resolveVariantTechnicalAttributes()`.

---

## 3. Registro de Auditoría — Sublote C5-A (`36` Variantes *Olin Colours* 80–170 g/m² — `DESIGN` / `UNCOATED` / `SMOOTH`)

| # | `variant_id` | `product_id` | Producto Comercial | GSM | Transición `category` | `coating_status` | `finish` | Fuente | `classification_evidence_id` | `promotion_request_id` | `promotion_id` | Espesor (`caliper_um`) |
| :---: | :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :--- | :--- | :--- | :--- |
| 1 | `var_a361fe50344c60b6` | `prod_2d78dee8aeba179a` | Olin Colours Grey 170 70x100 FSC | 170 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `SMOOTH` | `SUPPLIER_CATALOG_SPEC` | `evd_cls_4f23a802df8532c6` | `cls_req_c113273daf9cb258` | `cls_prm_6a973c9682eca76a` | `205 µm` (intacto) |
| 2 | `var_a3c491566f15f7c8` | `prod_63449ab22ba45348` | Olin Colours Hot Brown 170 70x100 FSC | 170 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `SMOOTH` | `SUPPLIER_CATALOG_SPEC` | `evd_cls_a97a736e21ac78fe` | `cls_req_23018fb271142718` | `cls_prm_80efa04067827f04` | `208 µm` (intacto) |
| 3 | `var_ac5005656664cf89` | `prod_a9c7891df068568f` | Olin Colours Orange 170 70x100 FSC | 170 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `SMOOTH` | `SUPPLIER_CATALOG_SPEC` | `evd_cls_0053005a1962e4fb` | `cls_req_75c7892f6810c1c6` | `cls_prm_db8a87ac4374f398` | `205 µm` (intacto) |
| 4 | `var_b3deecb4cbd31f27` | `prod_21f4dd6a30c3a3fa` | Olin Colours Jungle Green 170 70x100 FSC | 170 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `SMOOTH` | `SUPPLIER_CATALOG_SPEC` | `evd_cls_10a6e6bbc0482734` | `cls_req_3077d430d99d9285` | `cls_prm_62355cd38cda05f9` | `205 µm` (intacto) |
| 5 | `var_d456a47b4fe90a1f` | `prod_3f10bcf32d0022f8` | Olin Colours Poppy 170 70x100 FSC | 170 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `SMOOTH` | `SUPPLIER_CATALOG_SPEC` | `evd_cls_86b795f7f8928d05` | `cls_req_be2df6b29e693ab5` | `cls_prm_eed16e023b6ca708` | `205 µm` (intacto) |
| 6 | `var_e4da75f98478abf8` | `prod_d90cd5e0b6bc7d4c` | Olin Colours Baby Blue 170 70x100 FSC | 170 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `SMOOTH` | `SUPPLIER_CATALOG_SPEC` | `evd_cls_df3a4f8d7ee9f475` | `cls_req_dec305c08f98be9e` | `cls_prm_1d68abb8531947cc` | `205 µm` (intacto) |
| 7 | `var_f569554675df1f20` | `prod_1426c7128e5aabf8` | Olin Colours Black 170 70x100 FSC | 170 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `SMOOTH` | `SUPPLIER_CATALOG_SPEC` | `evd_cls_806d7bf85bbd992e` | `cls_req_30b2f8fb94b57346` | `cls_prm_b47dc5d2c76be6d3` | `208 µm` (intacto) |
| 8 | `var_f6f2d3a23f13d0c2` | `prod_32ad079e0204c19b` | Olin Colours Citrus Yellow 170 70x100 FS... | 170 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `SMOOTH` | `SUPPLIER_CATALOG_SPEC` | `evd_cls_78302de6f70b0479` | `cls_req_43bb5653ba7b3df1` | `cls_prm_62c360bfa976da67` | `205 µm` (intacto) |
| 9 | `var_f845ea5690112c31` | `prod_50ce65c39105e5f7` | Olin Colours Sunshine Yellow 170 70x100 ... | 170 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `SMOOTH` | `SUPPLIER_CATALOG_SPEC` | `evd_cls_11832dedcfd97031` | `cls_req_9eb59e96d59a580d` | `cls_prm_f29b2241f34f841f` | `205 µm` (intacto) |
| 10 | `var_08dd71ee3482a8a5` | `prod_edace8032590be28` | Olin Colours Urban Grey 120 70x100 FSC | 120 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `SMOOTH` | `SUPPLIER_CATALOG_SPEC` | `evd_cls_52fbcecd1557783e` | `cls_req_8bf20a6b9542a363` | `cls_prm_f2ad609a09190dd1` | `155 µm` (intacto) |
| 11 | `var_2d697be28043b871` | `prod_9352227c5e4da98a` | Olin Colours Cherry 120 70x100 FSC | 120 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `SMOOTH` | `SUPPLIER_CATALOG_SPEC` | `evd_cls_4f9eecbd52cc7e27` | `cls_req_a1616ea150949e23` | `cls_prm_c619c785b883f783` | `153 µm` (intacto) |
| 12 | `var_6ec40a442ac8cd77` | `prod_608a358c39c4d452` | Olin Colours Storm Grey 120 70x100 FSC | 120 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `SMOOTH` | `SUPPLIER_CATALOG_SPEC` | `evd_cls_ff0d095223095d26` | `cls_req_db6be5f5aa082f02` | `cls_prm_a24183061e7132eb` | `153 µm` (intacto) |
| 13 | `var_75d189a96d492d4e` | `prod_026286a37e5c6017` | Olin Colours Light Blue 120 70x100 FSC | 120 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `SMOOTH` | `SUPPLIER_CATALOG_SPEC` | `evd_cls_c4f22541dec187b6` | `cls_req_781cf4d480ffca3b` | `cls_prm_e6aa72275dd46925` | `153 µm` (intacto) |
| 14 | `var_77abcd44600b1e42` | `prod_80673050f19034f0` | Olin Colours Black 120 70x100 FSC | 120 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `SMOOTH` | `SUPPLIER_CATALOG_SPEC` | `evd_cls_99550c0cb974d7b0` | `cls_req_2d78e16b757e84a9` | `cls_prm_234c993515594284` | `155 µm` (intacto) |
| 15 | `var_8ec8f62b19eeacf0` | `prod_e552d1e29b7d3b35` | Olin Colours Sunshine Yellow 120 70x100 ... | 120 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `SMOOTH` | `SUPPLIER_CATALOG_SPEC` | `evd_cls_3e2c9a03c9bb0bc9` | `cls_req_1ae783d7e1844153` | `cls_prm_35527d8afa02e969` | `153 µm` (intacto) |
| 16 | `var_938de162cfd19c55` | `prod_0049e83a4b28009e` | Olin Colours Grey 120 70x100 FSC | 120 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `SMOOTH` | `SUPPLIER_CATALOG_SPEC` | `evd_cls_634b9472f998a74b` | `cls_req_3b93e466437ad82e` | `cls_prm_73a2dfadf417720e` | `153 µm` (intacto) |
| 17 | `var_a1e1339717585c9d` | `prod_0a59eee2e611c5a1` | Olin Colours Orange 120 70x100 FSC | 120 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `SMOOTH` | `SUPPLIER_CATALOG_SPEC` | `evd_cls_bba0529ee405d72e` | `cls_req_869791d225d5f193` | `cls_prm_d72242516b7c8ad3` | `153 µm` (intacto) |
| 18 | `var_ae15566894ba054c` | `prod_ed04072e4807cf46` | Olin Colours Poppy 120 70x100 FSC | 120 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `SMOOTH` | `SUPPLIER_CATALOG_SPEC` | `evd_cls_2fb307902a3e37a5` | `cls_req_09f9ea5d011f4488` | `cls_prm_8cf1917443602491` | `153 µm` (intacto) |
| 19 | `var_b484394861751d33` | `prod_d344b7f4cb72b0f3` | Olin Colours Cloud 120 70x100 FSC | 120 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `SMOOTH` | `SUPPLIER_CATALOG_SPEC` | `evd_cls_dddf31b37f575515` | `cls_req_e0f1088f0a7df38c` | `cls_prm_bab2e769048f3091` | `153 µm` (intacto) |
| 20 | `var_b5f9d11239dca601` | `prod_229d70a64399347a` | Olin Colours Old Gold 120 70x100 FSC | 120 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `SMOOTH` | `SUPPLIER_CATALOG_SPEC` | `evd_cls_a2dc6b92d42388be` | `cls_req_adcbbaac61610d7c` | `cls_prm_febf5d798aab1b87` | `153 µm` (intacto) |
| 21 | `var_b925c4f628ad3d32` | `prod_89a852f5caa7fe8c` | Olin Colours Jungle Green 120 70x100 FSC | 120 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `SMOOTH` | `SUPPLIER_CATALOG_SPEC` | `evd_cls_6c7917a8c75a2a96` | `cls_req_a5277410540f6402` | `cls_prm_66866092f0d125f6` | `153 µm` (intacto) |
| 22 | `var_bda053cad6cebc53` | `prod_fe01d385adb7e128` | Olin Colours Californian Blue 120 70x100... | 120 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `SMOOTH` | `SUPPLIER_CATALOG_SPEC` | `evd_cls_3335f4a50d65677a` | `cls_req_92e079ce5920c203` | `cls_prm_15f66e2efe7ce5d1` | `153 µm` (intacto) |
| 23 | `var_c471294760f7a47d` | `prod_328d59a48dfd1b12` | Olin Colours Fawn 120 70x100 FSC | 120 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `SMOOTH` | `SUPPLIER_CATALOG_SPEC` | `evd_cls_12a4de11b851626e` | `cls_req_26b9d1df7a5c5e4b` | `cls_prm_9dc871674f13960e` | `153 µm` (intacto) |
| 24 | `var_ea6ae2912f341527` | `prod_feae2e60d14ef822` | Olin Colours Citrus Yellow 120 70x100 FS... | 120 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `SMOOTH` | `SUPPLIER_CATALOG_SPEC` | `evd_cls_9dbd7bf8776ca8d2` | `cls_req_5af1e5367021973e` | `cls_prm_bb94a2e9c6a0cf04` | `153 µm` (intacto) |
| 25 | `var_ef8a8df8a08983b5` | `prod_19b1034b6e3b217f` | Olin Colours Baby Blue 120 70x100 FSC | 120 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `SMOOTH` | `SUPPLIER_CATALOG_SPEC` | `evd_cls_88ecd3a116e40b95` | `cls_req_100ae3f7f395811a` | `cls_prm_7a72d28a279f5e13` | `153 µm` (intacto) |
| 26 | `var_fb08c836abfa83e5` | `prod_00208d333868e2c9` | Olin Colours Cobalt 120 70x100 FSC | 120 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `SMOOTH` | `SUPPLIER_CATALOG_SPEC` | `evd_cls_828afe514e965e90` | `cls_req_274c22ac0a0de5b8` | `cls_prm_1265f40354bd5641` | `155 µm` (intacto) |
| 27 | `var_fbed8f17e0677853` | `prod_cd81213ef63b4561` | Olin Colours Baby Pink 120 70x100 FSC | 120 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `SMOOTH` | `SUPPLIER_CATALOG_SPEC` | `evd_cls_6652535c815e729b` | `cls_req_f1f86352028c89bd` | `cls_prm_8d60eb85cdf8c9f7` | `153 µm` (intacto) |
| 28 | `var_2b3f52b8306ee2e8` | `prod_0f43dac0f0919f08` | Olin Colours Baby Pink 90 45x64 FSC | 90 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `SMOOTH` | `SUPPLIER_CATALOG_SPEC` | `evd_cls_3bdb4f056a22778e` | `cls_req_dacac920232f5828` | `cls_prm_6eb445609c6e65b0` | `116 µm` (intacto) |
| 29 | `var_6b4ead48af353dca` | `prod_f8305e68b5dc3828` | Olin Colours Citrus Yellow 90 70x100 FSC | 90 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `SMOOTH` | `SUPPLIER_CATALOG_SPEC` | `evd_cls_8f1e927ebdfe6d06` | `cls_req_5692d21a10388aa1` | `cls_prm_008bb1aeaf8170e4` | `116 µm` (intacto) |
| 30 | `var_87b901f3ff6473c7` | `prod_cc5225589fdea07f` | Olin Colours Ivory 90 45x64 FSC | 90 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `SMOOTH` | `SUPPLIER_CATALOG_SPEC` | `evd_cls_3e09b399db3546ed` | `cls_req_02d484c1643522ea` | `cls_prm_5de413dbb7769a75` | `116 µm` (intacto) |
| 31 | `var_9b9eee76f8c091f7` | `prod_c5655edf2384a20e` | Olin Colours Citrus Yellow 90 45x64 FSC | 90 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `SMOOTH` | `SUPPLIER_CATALOG_SPEC` | `evd_cls_601f61d0ff3780ec` | `cls_req_aea3a34f26abf695` | `cls_prm_9fcb0e3bb77cd27e` | `116 µm` (intacto) |
| 32 | `var_baea44fcb797ca21` | `prod_1b95823984d9a684` | Olin Colours Sunshine Yellow 90 45x64 FS... | 90 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `SMOOTH` | `SUPPLIER_CATALOG_SPEC` | `evd_cls_b339d034c0f77220` | `cls_req_fc2c9001bfd4b284` | `cls_prm_c0a36af5d247537b` | `116 µm` (intacto) |
| 33 | `var_f69a4306842a525e` | `prod_5d2a553f99da0b81` | Olin Colours Cloud 90 45x64 FSC | 90 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `SMOOTH` | `SUPPLIER_CATALOG_SPEC` | `evd_cls_4d3bd4c17749f3a5` | `cls_req_3d87f3283b21f2c7` | `cls_prm_8eec32f1889f7a84` | `116 µm` (intacto) |
| 34 | `var_6315c09a27fa54a0` | `prod_c356bd6b1f3e129e` | Olin Colours Ivory 80 45x64 FSC | 80 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `SMOOTH` | `SUPPLIER_CATALOG_SPEC` | `evd_cls_f0925b76ed8fc1fb` | `cls_req_b997b8b9dcf6963a` | `cls_prm_36736f6977dacf3f` | `99 µm` (intacto) |
| 35 | `var_785d7abd83d86d8c` | `prod_ed7dfcdc3671aeb5` | Olin Colours Oyster 80 45x64 FSC | 80 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `SMOOTH` | `SUPPLIER_CATALOG_SPEC` | `evd_cls_fc051db2800efd63` | `cls_req_45f00c45296dd0b8` | `cls_prm_44ae16105cabdf54` | `99 µm` (intacto) |
| 36 | `var_db3f4e4ecd881c53` | `prod_6fe7808c5f5f8561` | Olin Colours Black 80 45x64 FSC | 80 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `SMOOTH` | `SUPPLIER_CATALOG_SPEC` | `evd_cls_cb9f63690e3500c3` | `cls_req_337b898a90fc0582` | `cls_prm_066ef89e54aac6ce` | `100 µm` (intacto) |

---

## 4. Registro de Auditoría — Sublote C5-B (`28` Variantes de Especialidad Real, Sintéticos, Autoadhesivos y Autocopiativo NCR — `OTHER` Acreditado)

| # | `variant_id` | `product_id` | Producto Comercial | GSM | Transición `category` | `coating_status` | `finish` | Fuente | `classification_evidence_id` | `promotion_request_id` | `promotion_id` | Espesor (`caliper_um`) |
| :---: | :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :--- | :--- | :--- | :--- |
| 37 | `var_d6440696e5e27b83` | `prod_7b8eb6c284dbacfa` | Antislip pap.100 75x115 | 100 | `OTHER` -> **`OTHER`** | `SPECIALTY` | `TEXTURED` | `SUPPLIER_CATALOG_SPEC` | `evd_cls_ad5d07fa642c04f3` | `cls_req_a47d6cf7a8b476b4` | `cls_prm_438f6e0a0c3db4cc` | `NULL` (intacto) |
| 38 | `var_8b2224c2f7f913d0` | `prod_c5dd05080f32115f` | Brūns kraftpapīrs 130 92x64 | 130 | `OTHER` -> **`OTHER`** | `SPECIALTY` | `UNCOATED` | `SUPPLIER_CATALOG_SPEC` | `evd_cls_7d9ab2a3429360b5` | `cls_req_4e932d1ff9e7aeb4` | `cls_prm_92930463dc490d05` | `NULL` (intacto) |
| 39 | `var_aab9da91efa15dbb` | `prod_517eabbb32b9b93d` | Chantaffiche 250JE Blueback 115g 72x102 | 115 | `OTHER` -> **`OTHER`** | `SPECIALTY` | `COATED` | `MILL_DATASHEET` | `evd_cls_95723f26c05c92a2` | `cls_req_8d80d3718abb2bde` | `cls_prm_b1757138303cdba4` | `NULL` (intacto) |
| 40 | `var_85319141d4df540f` | `prod_84969493548c3940` | ENVEL.POSTAC 229x324 C4 A | 100 | `OTHER` -> **`OTHER`** | `SPECIALTY` | `UNCOATED` | `SUPPLIER_CATALOG_SPEC` | `evd_cls_abeff2eb4cdec325` | `cls_req_217cbccdf530aec8` | `cls_prm_8d3925063afc0428` | `NULL` (intacto) |
| 41 | `var_3b28cdabee772322` | `prod_c3ba1d0be33cccb2` | KASKAD Flamingo Pink 120g 64x90 | 120 | `OTHER` -> **`OTHER`** | `SPECIALTY` | `SMOOTH` | `SUPPLIER_CATALOG_SPEC` | `evd_cls_2f8f8916e211c051` | `cls_req_31ea88ae1bf90adc` | `cls_prm_703892d8636ee0f6` | `NULL` (intacto) |
| 42 | `var_e0a132593734810e` | `prod_aaa67fe5d58616e2` | Metalprint 300 72x102 FSC | 300 | `OTHER` -> **`OTHER`** | `SPECIALTY` | `COATED` | `MILL_DATASHEET` | `evd_cls_3921e9035408a651` | `cls_req_a3dfdf72e27654c7` | `cls_prm_496c1c359fea2c73` | `420 µm` (intacto) |
| 43 | `var_737c9a59216f4bf2` | `prod_80b54e77003993b8` | Priplak Cristal + 0.5 mm 72x102 Transpar... | 455 | `OTHER` -> **`OTHER`** | `SYNTHETIC` | `SMOOTH` | `MILL_DATASHEET` | `evd_cls_1666f5ca8080620a` | `cls_req_1035882c3b8862f4` | `cls_prm_cb5a28318e53047d` | `NULL` (intacto) |
| 44 | `var_10c768331b38915c` | `prod_3206e6cd68e46f06` | Priplak Opaline 273g 72x102,naturel | 273 | `OTHER` -> **`OTHER`** | `SYNTHETIC` | `SMOOTH` | `MILL_DATASHEET` | `evd_cls_f784d64a4910ddb5` | `cls_req_b2e3737b2c84d0ef` | `cls_prm_aa4b4d56fc3ab161` | `NULL` (intacto) |
| 45 | `var_7f139c0667b2098d` | `prod_3cff4b67ff5dc3f7` | Priplak Opaline 455g 72x102,naturel | 455 | `OTHER` -> **`OTHER`** | `SYNTHETIC` | `SMOOTH` | `MILL_DATASHEET` | `evd_cls_6ee1214f4a193c73` | `cls_req_c889139edc2d82cb` | `cls_prm_0e87d161e878ae8e` | `NULL` (intacto) |
| 46 | `var_ca07a43436b3b5bb` | `prod_ab9dab6b453b2a24` | Raflamatt Opaque 80g 50x70 | 80 | `OTHER` -> **`OTHER`** | `SPECIALTY` | `UNCOATED` | `MILL_DATASHEET` | `evd_cls_98c952e31db1bca3` | `cls_req_eacae5ff02a83806` | `cls_prm_5a3446369f903b18` | `NULL` (intacto) |
| 47 | `var_1ad26105982b6982` | `prod_90fdeb8a94f2745b` | Reacto 57 CF 43x61yellow | 57 | `OTHER` -> **`OTHER`** | `SPECIALTY` | `UNCOATED` | `MILL_DATASHEET` | `evd_cls_4d08346ef1fc3090` | `cls_req_55f381cac13c4910` | `cls_prm_f33bcf2eea95b6ed` | `NULL` (intacto) |
| 48 | `var_8636983f67b67e98` | `prod_dc4121b40a32e3c9` | Reacto 57 CF Blue 43x61 | 57 | `OTHER` -> **`OTHER`** | `SPECIALTY` | `UNCOATED` | `MILL_DATASHEET` | `evd_cls_4f6c701dd6365836` | `cls_req_f86a9af24a674f52` | `cls_prm_ebb29c95d8dd5630` | `NULL` (intacto) |
| 49 | `var_cdc1e37755be43d4` | `prod_5e69f879db4f85fe` | Reacto 57 CF Green 43x61 | 57 | `OTHER` -> **`OTHER`** | `SPECIALTY` | `UNCOATED` | `MILL_DATASHEET` | `evd_cls_256c3672f8ab131e` | `cls_req_584fa435788cde3f` | `cls_prm_67a7e59e63ababf5` | `NULL` (intacto) |
| 50 | `var_1bbf4bfb2e6301ee` | `prod_13b9d01a00b11346` | Reacto 57 CF Pink 43x61 | 57 | `OTHER` -> **`OTHER`** | `SPECIALTY` | `UNCOATED` | `MILL_DATASHEET` | `evd_cls_d7cf95824df76e7f` | `cls_req_f62ec6d3ef272908` | `cls_prm_e9805d413dc10f43` | `NULL` (intacto) |
| 51 | `var_eba2549ea1c4f97f` | `prod_c3dea41c24c4b55a` | Reacto 57 CF White 43x61 | 57 | `OTHER` -> **`OTHER`** | `SPECIALTY` | `UNCOATED` | `MILL_DATASHEET` | `evd_cls_5a1bab9129cebe04` | `cls_req_fbf03f9a061981b4` | `cls_prm_73c55c4eb369f44e` | `NULL` (intacto) |
| 52 | `var_69a39239eaa18985` | `prod_ff7f44b394e2d404` | Reacto 60 CB Superwhite 43x61 | 60 | `OTHER` -> **`OTHER`** | `SPECIALTY` | `UNCOATED` | `MILL_DATASHEET` | `evd_cls_1b3bda8b347d4c0a` | `cls_req_8986c484a5f3f374` | `cls_prm_be086998171ab000` | `NULL` (intacto) |
| 53 | `var_084b9a33102de3e5` | `prod_f5fade170fb48267` | Reacto 60 CFB Blue 43x61 | 60 | `OTHER` -> **`OTHER`** | `SPECIALTY` | `UNCOATED` | `MILL_DATASHEET` | `evd_cls_b17a1ba97adf7a45` | `cls_req_5012ae4354d14030` | `cls_prm_852fd6f542c5060a` | `NULL` (intacto) |
| 54 | `var_2ec65c3dd806e5c0` | `prod_f9eba0855277f66c` | Reacto 60 CFB Green 43x61 | 60 | `OTHER` -> **`OTHER`** | `SPECIALTY` | `UNCOATED` | `MILL_DATASHEET` | `evd_cls_1b7740c9a1b2abd5` | `cls_req_c761aac9d5fc5ad9` | `cls_prm_495084fa1760c3bc` | `NULL` (intacto) |
| 55 | `var_0735e6e1253379bf` | `prod_21bca2bd3ae88598` | Reacto 60 CFB Pink 43x61 | 60 | `OTHER` -> **`OTHER`** | `SPECIALTY` | `UNCOATED` | `MILL_DATASHEET` | `evd_cls_54681f5075e8a0a8` | `cls_req_ea17fbdbfc1882be` | `cls_prm_ed39f66839a407e8` | `NULL` (intacto) |
| 56 | `var_722a2c5d6af4bded` | `prod_3692dacf9b443a21` | Reacto 60 CFB White 43x61 | 60 | `OTHER` -> **`OTHER`** | `SPECIALTY` | `UNCOATED` | `MILL_DATASHEET` | `evd_cls_568fd555ba622387` | `cls_req_b463ef42c2d99dbe` | `cls_prm_540deff54b017020` | `NULL` (intacto) |
| 57 | `var_a8bbc2c2b9ff5c8f` | `prod_5a40eb3c6881160c` | Reacto 60 CFB Yellow 43x61 | 60 | `OTHER` -> **`OTHER`** | `SPECIALTY` | `UNCOATED` | `MILL_DATASHEET` | `evd_cls_14499c2630169e9e` | `cls_req_e9448c82983588a9` | `cls_prm_4e89b72f343cb759` | `NULL` (intacto) |
| 58 | `var_25660f395446197b` | `prod_fb87880a95253d84` | Sticotac Scoreback SEMIGLOSS 80g 50x70 E... | 80 | `OTHER` -> **`OTHER`** | `SPECIALTY` | `COATED` | `MILL_DATASHEET` | `evd_cls_208d365e84833036` | `cls_req_7372e4cc60c43bcc` | `cls_prm_a36e49b5a5f11d4e` | `NULL` (intacto) |
| 59 | `var_e00360650de8014a` | `prod_f6c4493eb9f9fe26` | Sticotac SEMIGLOSS bez iešķēluma White R... | 80 | `OTHER` -> **`OTHER`** | `SPECIALTY` | `COATED` | `MILL_DATASHEET` | `evd_cls_4187399c1203e18b` | `cls_req_1e694a97b0874c5a` | `cls_prm_5e90fcd66846fbcc` | `NULL` (intacto) |
| 60 | `var_825c85acf8669395` | `prod_ef8a660d4d093759` | Sticotac Vellum 70 45x64 bez iešķēluma | 70 | `OTHER` -> **`OTHER`** | `SPECIALTY` | `UNCOATED` | `MILL_DATASHEET` | `evd_cls_8a46fef9b08c8932` | `cls_req_b3e90be992735bd0` | `cls_prm_45345179fdd5aa96` | `NULL` (intacto) |
| 61 | `var_18392c5563ddf301` | `prod_709bcecb76cee5bd` | Syn-Coat 111 64x90 (DRUKĀT UZ B3 VAI A2)... | 111 | `OTHER` -> **`OTHER`** | `SYNTHETIC` | `SMOOTH` | `MILL_DATASHEET` | `evd_cls_f1198a074dd55f36` | `cls_req_43fe062e9339e80f` | `cls_prm_699841bc396a48a8` | `150 µm` (intacto) |
| 62 | `var_711e659a5062669b` | `prod_1114548566ea3d68` | Syn-Coat 175g 64x90 (DRUKĀT UZ B3 VAI A2... | 175 | `OTHER` -> **`OTHER`** | `SYNTHETIC` | `SMOOTH` | `MILL_DATASHEET` | `evd_cls_80fe27e58c51160d` | `cls_req_326461443229c4a5` | `cls_prm_05888f0dcbc91626` | `250 µm` (intacto) |
| 63 | `var_ac4b6dae047cb88a` | `prod_4549a2b9b0622619` | Syn-Coat 400g 64x90 (DRUKĀT UZ B3 VAI A2... | 400 | `OTHER` -> **`OTHER`** | `SYNTHETIC` | `SMOOTH` | `MILL_DATASHEET` | `evd_cls_afb580aa1d5b9b71` | `cls_req_3739581c64fe3aea` | `cls_prm_0629861197c7e43e` | `400 µm` (intacto) |
| 64 | `var_3e8cf1074a5c5d1b` | `prod_75b91dc3449f3aa0` | Syn-Coat 96g 64x90 (DRUKĀT UZ B3 VAI A2)... | 96 | `OTHER` -> **`OTHER`** | `SYNTHETIC` | `SMOOTH` | `MILL_DATASHEET` | `evd_cls_0bfb0907abf6a8b5` | `cls_req_74416a802cab11b1` | `cls_prm_df1a7930ee254002` | `120 µm` (intacto) |

---

## 5. Cuadro de Cierre Global del Punto 3 (`337 / 337` Variantes Acreditadas — `100,00%`)

| Lote Gobernado | Alcance Técnico | Variantes Acreditadas | Distribución Taxonómica Final (`paper_type`) | Pendientes Restantes | Estado |
| :--- | :--- | :---: | :--- | :---: | :--- |
| **Batch C1** | Interiores Offset/Libro (`G3`) + Publicación Estucada (`G5`) | **`77`** | `65 OFFSET` + `12 COATED` | `0` | **100% COMPLETADO** |
| **Batch C2** | Cartoncillos Gráficos/Folding (`G4`) + Cartón Gris *Luxline* | **`37`** | `37 CARTON` (`7 1S`, `14 2S`, `16 UNCOATED`) | `0` | **100% COMPLETADO** |
| **Batch C3** | Recubrimientos de Encuadernación (`G1`: *Efalin, Geltex, Wibalin, Surbalin*) | **`62`** | `62 DESIGN` (`UNCOATED` / `TEXTURED` & `UNCOATED`) | `0` | **100% COMPLETADO** |
| **Batch C4** | Papeles Creativos y Fine Art (`G2` + `G6` *Audit Note 2*) | **`97`** | `97 DESIGN` (`18` texturizados, `17` perlescentes/metalizados, `62` lisos) | `0` | **100% COMPLETADO** |
| **Batch C5** | *Olin Colours* 80–170g (`36`) + Especialidades/Sintéticos/NCR (`28`) | **`64`** | `36 DESIGN` + `28 OTHER` Acreditados (`SPECIALTY` / `SYNTHETIC`) | `0` | **100% COMPLETADO** |
| **TOTALES** | **Total Universo Clasificaciones Pendientes (`RECOVERY-12 Punto 3`)** | **`337`** (`100,00%`) | **`195 DESIGN` | `65 OFFSET` | `37 CARTON` | `28 OTHER (Accredited)` | `12 COATED`** | **`0`** | **100% LIQUIDADO** |
