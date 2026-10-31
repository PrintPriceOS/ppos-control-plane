# PrintPrice OS — RECOVERY-12: Batch C4 Classification Accreditation Report (97 DESIGN Fine Art & Creative Paper Variants)

> [!IMPORTANT]
> **Estado de Ejecución**: **COMPLETADO CON ÉXITO — ACREDITACIÓN GOBERNADA DE 97 VARIANTES `DESIGN` (PAPELES CREATIVOS Y FINE ART) E INMUTABILIDAD 100% DE ESPESORES CERTIFICADA**
> - **Fecha de ejecución**: `2026-10-31T01:11:20.170Z`
> - **Servicio transaccional**: `PaperEvidenceService` (`src/api/services/paperEvidenceService.js`)
> - **Tabla de auditoría**: `Control.paper_variant_classification_evidence` (total acumulado: **`273`** registros acreditados: `77` Batch C1 + `37` Batch C2 + `62` Batch C3 + `97` Batch C4)
> - **Lote promovido**: **Batch C4 — `97` variantes de papeles creativos y Fine Art (`DESIGN`)**:
>   - **Sublote C4-A (`18` variantes — Texturizados, Marcados al Fieltro y Verjurados: `FELT_MARKED` / `LAID` / `TEXTURED`)**: *Tintoretto Gesso (`1`), Rives Tradition/Shetland/Basane/Linear (`4`), Conqueror Laid (`7`), Constellation Snow/Tela (`3`), Arena Rough (`2`), G.F. Smith Twist Red (`1`)*.
>   - **Sublote C4-B (`17` variantes — Especialidades Perlescentes, Metalizadas y Translúcidas: `SPECIALTY` / `TEXTURED` & `SMOOTH`)**: *Curious Metallics (`9`), Curious Translucents (`5`), Sirio Pearl Aurum/Platinum (`2`), Gmund Color System Metallic (`1`)*.
>   - **Sublote C4-C (`62` variantes — Creativos Lisos y Coloreados en Masa: `UNCOATED` / `SMOOTH` & `UNCOATED`)**: *Keaykolour (`11`), Sirio Color / Sirio Ultra Black (`10`), Burano (`6`), Colorit (`6`), Pop'Set (`5`), Rainbow (`4`), Materica (`1`), Arena Smooth (`1`), Olin Colours Cubierta/Creativos 170–240 g/m² (`18`)*.
> - **Inmutabilidad de espesores (`caliper_um`)**: **100% preservada** (`1.524` total | `1.284` con espesor | `240` sin espesor | Hash SHA-256 bit a bit idéntico: `d3c288687abb8f7d11a36fde6e853685381bf417193be3422de16dd6b003b485`).
> - **Progreso acumulado de clasificación**: **`273` de `337` (`81,01%`)** completadas; restan exactamente **`64`** variantes pendientes (`161 - 97 = 64`).

---

## 1. Certificación de Inmutabilidad de Espesores y Balance de Clasificación (`Control.paper_variants`)

| Indicador Oficial en Producción (`Control`) | Pre-Batch C4 | Post-Batch C4 | Delta | Estado |
| :--- | :---: | :---: | :---: | :---: |
| **Total registros (`paper_variants`)** | `1524` | **`1524`** | `0` | **INMUTABLE (OK)** |
| **Con espesor (`caliper_um > 0`)** | `1284` | **`1284`** | `0` | **INMUTABLE (OK)** |
| **Sin espesor (`caliper_um IS NULL`)** | `240` | **`240`** | `0` | **INMUTABLE (OK)** |
| **SHA-256 Vector 1.524 Espesores** | `d3c28868...03b485` | **`d3c28868...03b485`** | `0 bits` | **IDÉNTICO BIT A BIT** |
| **Clasificación `DESIGN` activa (runtime)** | `173` | **`270`** | **`+97`** | **PROMOVIDAS C4 (173 -> 270)** |
| **Clasificación `CARTON` activa (runtime)** | `146` | **`146`** | `0` | **INTACTO (C2)** |
| **Clasificación `OFFSET` activa (runtime)** | `465` | **`465`** | `0` | **INTACTO (C1)** |
| **Clasificación `COATED` activa (runtime)** | `579` | **`579`** | `0` | **INTACTO (C1)** |
| **Clasificaciones pendientes (`OTHER` runtime)** | `161` | **`64`** | **`-97`** | **REDUCIDO (161 -> 64)** |
| **Clasificaciones `OTHER` crudas en BD (`paper_products`)** | `161` | **`64`** | **`-97`** | **ALINEADO CON RUNTIME (64)** |
| **`CHECKSUM TABLE paper_variants`** | `3890542543` | **`1916298230`** | Actualizado | `finish` + `metadata_json` |
| **`CHECKSUM TABLE paper_products`** | `2340046218` | **`2176509447`** | Actualizado | `category` + `finish_summary` |
| **`CHECKSUM TABLE paper_variant_classification_evidence`** | `649828167` | **`701163957`** | `+97 filas` | `273` evidencias totales (`77` C1 + `37` C2 + `62` C3 + `97` C4) |

---

## 2. Gobernanza y Segregación de Funciones de 4 Vías (SoD)

Cada una de las 97 variantes de papeles creativos y Fine Art completó el ciclo transaccional de 4 etapas en `PaperEvidenceService`:
1. **Stage 1 (`registerClassificationEvidence`)**: `rec12_cls_submitter` (`SUPPLIER_OPERATOR`)
2. **Stage 2 (`reviewClassificationEvidence`)**: `rec12_cls_reviewer` (`MATERIAL_TECHNOLOGIST`) -> Decisión `APPROVE`
3. **Stage 3 (`requestClassificationPromotion`)**: `rec12_cls_requester` (`SUPPLIER_OPERATOR`)
4. **Stage 4 (`authorizeClassificationPromotion`)**: `rec12_cls_authorizer` (`SUPPLIER_ADMIN`) -> Estado final `PROMOTED`

---

## 3. Registro de Auditoría — Sublote C4-A (`18` Variantes Texturizadas, Marcadas al Fieltro y Verjuradas: `FELT_MARKED`, `LAID`, `TEXTURED`)

| # | `variant_id` | `product_id` | Producto Comercial | GSM | Transición `category` | `coating_status` | `finish` | Fuente | `classification_evidence_id` | `promotion_request_id` | `promotion_id` | Espesor (`caliper_um`) |
| :---: | :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :--- | :--- | :--- | :--- |
| 2 | `var_ea4e053e2cc01a28` | `prod_211fbc245f9fc272` | Arena Rough Ivory 140g 64x90 | 140 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `TEXTURED` | `MILL_DATASHEET` | `evd_cls_345b300b0632df0d` | `cls_req_e5e33c78e8eedab1` | `cls_prm_ebac91d5b58e0f9a` | `185 µm` (intacto) |
| 3 | `var_203100a75b791c98` | `prod_876005c43871b98c` | Arena White Rough 90 72x102 | 90 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `TEXTURED` | `MILL_DATASHEET` | `evd_cls_1d8229f64fbeb98a` | `cls_req_afc4b3d1df0db9f3` | `cls_prm_6a0fb7acb06bfd49` | `NULL` (intacto) |
| 16 | `var_d27ba87146738aa7` | `prod_c0a619c0d97ef560` | CONQUER.Laid High White 250 45x64 | 250 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `LAID` | `MILL_DATASHEET` | `evd_cls_8c924b144136cb39` | `cls_req_5a8a108d372a6b86` | `cls_prm_7faf836902fabdda` | `NULL` (intacto) |
| 17 | `var_f1d74667c3ca2a93` | `prod_dd13a5cbee03d0d5` | Constellation Snow 280 72x102 Intreccio/... | 280 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `TEXTURED` | `MILL_DATASHEET` | `evd_cls_e341d3ffee034f87` | `cls_req_95a9057da5a3ea70` | `cls_prm_273189b0edda4611` | `NULL` (intacto) |
| 18 | `var_219a336e8a577312` | `prod_5315c81e2a0645bd` | Constellation Snow Country 280g 72x102 | 280 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `TEXTURED` | `MILL_DATASHEET` | `evd_cls_3e1113cbce63f2cc` | `cls_req_659d56d374c99179` | `cls_prm_a1d6ec68c11e30ad` | `125 µm` (intacto) |
| 44 | `var_239397ac9dda998c` | `prod_84d6791f67edcdab` | Rives Basane Bright White 120 g/m 70x100 | 120 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `FELT_MARKED` | `MILL_DATASHEET` | `evd_cls_29d836d941a1839c` | `cls_req_94f503a2652136f0` | `cls_prm_09e14bc1877ba2a5` | `NULL` (intacto) |
| 45 | `var_53074163da87b009` | `prod_c7b73e75125ba3be` | Rives Linear Bright White 120 g/m 70x100 | 120 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `FELT_MARKED` | `MILL_DATASHEET` | `evd_cls_dbd6cacf545d67b3` | `cls_req_f55751a400043d48` | `cls_prm_010df641fb158a23` | `NULL` (intacto) |
| 46 | `var_f989b6f4fd9d4b96` | `prod_5455eca512e8c95d` | Rives Shetland 250g70x100 Bright White | 250 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `FELT_MARKED` | `MILL_DATASHEET` | `evd_cls_5e10bc532a22166f` | `cls_req_813225276e3bf004` | `cls_prm_b6feb905f966a1d6` | `NULL` (intacto) |
| 47 | `var_1976b73e81e68249` | `prod_00db0fae688f2957` | Rives Tradition 320g Bright White 70x100 | 320 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `FELT_MARKED` | `MILL_DATASHEET` | `evd_cls_5eedcc24f243da69` | `cls_req_a888f0ab248937b5` | `cls_prm_e1a66c93db928f11` | `445 µm` (intacto) |
| 59 | `var_500505e72bbb9a57` | `prod_dde3f6d51e1928de` | Tintoretto Gesso 250g 72x101 | 250 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `FELT_MARKED` | `MILL_DATASHEET` | `evd_cls_5579319cda8c0a1b` | `cls_req_4fb88dc53fd85fa1` | `cls_prm_160efcae17286017` | `357 µm` (intacto) |
| 60 | `var_de12052a93ec256d` | `prod_dd15652129ceee49` | Conqueror Laid 220 72x102 Brilliant Whit... | 220 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `LAID` | `MILL_DATASHEET` | `evd_cls_10d30755e1c0ea05` | `cls_req_1031489ac7e076b2` | `cls_prm_5f3bedde8f2dbae4` | `NULL` (intacto) |
| 61 | `var_0e75d4e8f1d154a8` | `prod_93a64994be47e18d` | Conqueror Laid Cream 250 45x64 | 250 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `LAID` | `MILL_DATASHEET` | `evd_cls_d4ff4182b82fa85d` | `cls_req_6a7a7bbf099e2033` | `cls_prm_de5efb6c75709c76` | `NULL` (intacto) |
| 62 | `var_4c30b5a9a411b690` | `prod_9f98692fc936107d` | Conqueror Laid Cream 300g 45x64 | 300 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `LAID` | `MILL_DATASHEET` | `evd_cls_8b44796a7f6270fe` | `cls_req_5857b802ff9579c0` | `cls_prm_f7c3b6c4a4d1ba52` | `NULL` (intacto) |
| 63 | `var_cfb1f28c17cbe4a5` | `prod_c283a4ef666424fc` | Conqueror Laid Cream 300g 70x100 | 300 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `LAID` | `MILL_DATASHEET` | `evd_cls_f6da50b7aaaa90e3` | `cls_req_dd634587da9665fb` | `cls_prm_b7862b12ca947f2d` | `NULL` (intacto) |
| 64 | `var_ba615e0c9f63e5cc` | `prod_3e2b4aea7e8097fa` | Conqueror Laid Diamond White 300 70x100 | 300 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `LAID` | `MILL_DATASHEET` | `evd_cls_9431baf79612abd9` | `cls_req_96c1a70ffeb85bb2` | `cls_prm_865683d3577ea0b3` | `NULL` (intacto) |
| 65 | `var_6434ee0dc5116564` | `prod_0e02fc1631013bbe` | Conquoror Laid Oyster 160 g/m B1 70 x 10... | 160 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `LAID` | `MILL_DATASHEET` | `evd_cls_1a669af4d9e55f34` | `cls_req_01de7d354e35353e` | `cls_prm_df5965e14df007ab` | `NULL` (intacto) |
| 66 | `var_b62bb28c60a50c5b` | `prod_4013287a6f903036` | Fedrigoni Constealltion Tela 240 g/m 72x... | 240 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `TEXTURED` | `MILL_DATASHEET` | `evd_cls_48ef632765df82eb` | `cls_req_f757bbf00dd0d1dc` | `cls_prm_141ef4f32b17eec9` | `NULL` (intacto) |
| 68 | `var_48b84bec84aad93f` | `prod_d21f99fe7cc570dd` | G.F. Smith, 290 g. Twist Red 71x101 | 290 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `TEXTURED` | `SUPPLIER_CATALOG_SPEC` | `evd_cls_d3119485eeb9074f` | `cls_req_2472335b501db9f0` | `cls_prm_edda171377a2da64` | `420 µm` (intacto) |

---

## 4. Registro de Auditoría — Sublote C4-B (`17` Variantes Especiales Perlescentes, Metalizadas y Translúcidas: `SPECIALTY`)

| # | `variant_id` | `product_id` | Producto Comercial | GSM | Transición `category` | `coating_status` | `finish` | Fuente | `classification_evidence_id` | `promotion_request_id` | `promotion_id` | Espesor (`caliper_um`) |
| :---: | :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :--- | :--- | :--- | :--- |
| 19 | `var_60bdb834a734e688` | `prod_9fff9be0f63d2dfe` | Curios Metallics Ice Silver 120g 72x102 | 120 | `OTHER` -> **`DESIGN`** | `SPECIALTY` | `TEXTURED` | `MILL_DATASHEET` | `evd_cls_ee72ebf87ba691e1` | `cls_req_17cd782bfe810fac` | `cls_prm_21357594ac5637f5` | `157 µm` (intacto) |
| 20 | `var_0fd60daa43c9c4c1` | `prod_6c11afa2fd116c0b` | CURIOUS Metal.300 70x100 Ice Gold | 300 | `OTHER` -> **`DESIGN`** | `SPECIALTY` | `TEXTURED` | `MILL_DATASHEET` | `evd_cls_c2c1fa79921b6255` | `cls_req_8185b2d7e52b65b2` | `cls_prm_347a847d4dca32d5` | `400 µm` (intacto) |
| 21 | `var_d1012514b8afd728` | `prod_456f333adbeeb9b5` | CURIOUS Metal.300 70x100 Super Gold | 300 | `OTHER` -> **`DESIGN`** | `SPECIALTY` | `TEXTURED` | `MILL_DATASHEET` | `evd_cls_716f1a851fc83b12` | `cls_req_9a7aaa5784be9978` | `cls_prm_db7b377cb7d22cb8` | `400 µm` (intacto) |
| 22 | `var_8616f3e654ae65e1` | `prod_400babcf1ceac27b` | CURIOUS Metalic Galvanised 300 70x100 | 300 | `OTHER` -> **`DESIGN`** | `SPECIALTY` | `TEXTURED` | `MILL_DATASHEET` | `evd_cls_c001f49107201a46` | `cls_req_cc8113b02583c484` | `cls_prm_c8647516040bb077` | `400 µm` (intacto) |
| 23 | `var_f1bbba47708846c3` | `prod_2682bc7ecd01dfcc` | Curious metalic Super gold 120 g/m 72x10... | 120 | `OTHER` -> **`DESIGN`** | `SPECIALTY` | `TEXTURED` | `MILL_DATASHEET` | `evd_cls_3c53b936a6dd0e40` | `cls_req_a1ddbe73a96e1a0c` | `cls_prm_1496922c5e0d523f` | `157 µm` (intacto) |
| 24 | `var_f112de8410ac56c8` | `prod_781afd542cedb8a2` | Curious Metallics 300 70x100 Iceberg | 300 | `OTHER` -> **`DESIGN`** | `SPECIALTY` | `TEXTURED` | `MILL_DATASHEET` | `evd_cls_85dda0c295c13aca` | `cls_req_9e01a8a2a5e0a893` | `cls_prm_106e46429fbbf137` | `400 µm` (intacto) |
| 25 | `var_3c97f45aabbd2894` | `prod_89917bcb199b2426` | Curious Metallics Electric Blue 300g 70x... | 300 | `OTHER` -> **`DESIGN`** | `SPECIALTY` | `TEXTURED` | `MILL_DATASHEET` | `evd_cls_d8ad3b9200a9ea9e` | `cls_req_932940de38da5e48` | `cls_prm_c710a962be5953ca` | `400 µm` (intacto) |
| 26 | `var_46ac13d951f62d83` | `prod_99899350d32c7a71` | Curious Metallics Galvanised 120 72x102 | 120 | `OTHER` -> **`DESIGN`** | `SPECIALTY` | `TEXTURED` | `MILL_DATASHEET` | `evd_cls_9bd9f3dd69545a9b` | `cls_req_af2e8779bb874b07` | `cls_prm_81e26cf7fb0f87e3` | `157 µm` (intacto) |
| 27 | `var_5bf7f1cd390daf3a` | `prod_2efa3e3a51b25798` | Curious Metallics Lustre 300g 70x100 | 300 | `OTHER` -> **`DESIGN`** | `SPECIALTY` | `TEXTURED` | `MILL_DATASHEET` | `evd_cls_88be86f0b1fd6834` | `cls_req_4394a423c25c9106` | `cls_prm_bfc1f3787420a018` | `400 µm` (intacto) |
| 28 | `var_439618a9e3975bee` | `prod_05026b1b7f4f0a71` | Curious Translucents, 100g, 72x102cm, Cl... | 100 | `OTHER` -> **`DESIGN`** | `SPECIALTY` | `SMOOTH` | `MILL_DATASHEET` | `evd_cls_b0af938fdb790a23` | `cls_req_8af42aa58d47bdbf` | `cls_prm_9056642ececc5f37` | `89 µm` (intacto) |
| 29 | `var_3813a6058c56a07a` | `prod_8b2d6dcae0a6859f` | Curious Translucents, 110g, 65x92cm, Cle... | 110 | `OTHER` -> **`DESIGN`** | `SPECIALTY` | `SMOOTH` | `MILL_DATASHEET` | `evd_cls_4601f41bc7ff6242` | `cls_req_984184fb7be30289` | `cls_prm_cc1704944ff9b10b` | `97 µm` (intacto) |
| 30 | `var_b3a76b4fe5214758` | `prod_8b9be68b89dd33d8` | Curious Translucents, 150g, 72x102cm, Cl... | 150 | `OTHER` -> **`DESIGN`** | `SPECIALTY` | `SMOOTH` | `MILL_DATASHEET` | `evd_cls_745dda33ac3bbdf7` | `cls_req_a7574c3ad3aa12a9` | `cls_prm_11997b9ae51fe9f5` | `125 µm` (intacto) |
| 31 | `var_d8e70d12c5b1d813` | `prod_e2009c25b249a3b9` | Curious Translucents, 210g, 72x102cm, Cl... | 210 | `OTHER` -> **`DESIGN`** | `SPECIALTY` | `SMOOTH` | `MILL_DATASHEET` | `evd_cls_44a17d4b963c421f` | `cls_req_7d5545ce6a443c06` | `cls_prm_df2a40a274ddd71a` | `187 µm` (intacto) |
| 32 | `var_4e79e1110e5657bc` | `prod_385ef83df262b9cf` | Curious Translucents, 90g, 72x102cm, Cle... | 90 | `OTHER` -> **`DESIGN`** | `SPECIALTY` | `SMOOTH` | `MILL_DATASHEET` | `evd_cls_847a7bddee2bf450` | `cls_req_eb418bd253dff5d2` | `cls_prm_5098f161eb37c51a` | `83 µm` (intacto) |
| 33 | `var_461d8b9ba2b0b8cc` | `prod_f6e65c6f572fc93e` | Gmund Color System Metallic 50 blanc 260... | 260 | `OTHER` -> **`DESIGN`** | `SPECIALTY` | `TEXTURED` | `MILL_DATASHEET` | `evd_cls_a32c5b4b6cd80612` | `cls_req_916bac2fdd33e412` | `cls_prm_9f0d56bda2154ff2` | `NULL` (intacto) |
| 56 | `var_bbb217ae3a24f4df` | `prod_f4589aa8249bdf20` | Sirio Pearl 300g 72x102 Aurum | 300 | `OTHER` -> **`DESIGN`** | `SPECIALTY` | `TEXTURED` | `MILL_DATASHEET` | `evd_cls_41902911af403bd1` | `cls_req_1c653f8649ff3485` | `cls_prm_3a77acbf6e31c1e4` | `NULL` (intacto) |
| 57 | `var_7a4f87642bdbafa0` | `prod_88613dbfde858aa9` | Sirio Pearl 300g 72x102 Platinum | 300 | `OTHER` -> **`DESIGN`** | `SPECIALTY` | `TEXTURED` | `MILL_DATASHEET` | `evd_cls_6b49aa91e3048c30` | `cls_req_7147afc247c210bf` | `cls_prm_22ac646795256cac` | `NULL` (intacto) |

---

## 5. Registro de Auditoría — Sublote C4-C (`62` Variantes Creativas Lisas y Coloreadas en Masa: `UNCOATED` / `SMOOTH`)

| # | `variant_id` | `product_id` | Producto Comercial | GSM | Transición `category` | `coating_status` | `finish` | Fuente | `classification_evidence_id` | `promotion_request_id` | `promotion_id` | Espesor (`caliper_um`) |
| :---: | :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :--- | :--- | :--- | :--- |
| 1 | `var_906d371bb670d811` | `prod_aa2d64d3caece94d` | Arena Ivory Smooth 250g 72x102 | 250 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `SMOOTH` | `MILL_DATASHEET` | `evd_cls_ab9d35999b8bc3ed` | `cls_req_58abc554b9d2d97d` | `cls_prm_cbcd93402d9c21f7` | `NULL` (intacto) |
| 4 | `var_c4caafc80f859d1c` | `prod_8d1c5480acb60091` | Burano Dark 76 250g 310my 70X100cm, Bor... | 250 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `SMOOTH` | `MILL_DATASHEET` | `evd_cls_c03b9207b610dad3` | `cls_req_25d4d8429e2ccccb` | `cls_prm_ad3ad06d41c73b53` | `310 µm` (intacto) |
| 5 | `var_5f887ec026691b8a` | `prod_5c226b8ae0baae90` | Burano Nr. 58 Cyclamen Pink 140 70 x 100 | 140 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `SMOOTH` | `MILL_DATASHEET` | `evd_cls_132ee26f640caa93` | `cls_req_9de3f401bbf10f8c` | `cls_prm_0dc84391820a1e58` | `170 µm` (intacto) |
| 6 | `var_4d8611e0419fa40a` | `prod_0648373c050d0a3b` | Burano nr. 63 Nero black, 250 70x100 | 250 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `SMOOTH` | `MILL_DATASHEET` | `evd_cls_82572219e435d80d` | `cls_req_e53257544e33b483` | `cls_prm_8fcc4115f9d4ee5a` | `290 µm` (intacto) |
| 7 | `var_d11c0801ff7755b5` | `prod_d72ccafa49d3bf9b` | Burano Nr.54 140g 70x100 | 140 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `SMOOTH` | `MILL_DATASHEET` | `evd_cls_9282127a05affc8e` | `cls_req_eea745e63242b0e1` | `cls_prm_371c9614ec64bdb6` | `170 µm` (intacto) |
| 8 | `var_1c7627f955b5448a` | `prod_59e0623783e96e50` | Burano Nr.69 Indian Red 140 70 x 100 | 140 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `SMOOTH` | `MILL_DATASHEET` | `evd_cls_30352b1d895b0da3` | `cls_req_7d110ea169e6d7fd` | `cls_prm_e34490cf2e67ee66` | `170 µm` (intacto) |
| 9 | `var_42f5cc5ae0637b87` | `prod_dbb85589cc307296` | Burano Pastel 07 Yellow Giallo 140g 70x1... | 140 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `SMOOTH` | `MILL_DATASHEET` | `evd_cls_a619883ce576aeb3` | `cls_req_f95d23b330eee583` | `cls_prm_3a63d2a11142688a` | `170 µm` (intacto) |
| 10 | `var_0d716b2e3e8a5077` | `prod_913b7bd9fde186cc` | Colorit 120 Sky Blue Nr. 72, 45x64 + ... | 120 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `UNCOATED` | `SUPPLIER_CATALOG_SPEC` | `evd_cls_550db361d51d6160` | `cls_req_abbb2977a2356bf1` | `cls_prm_f7f289b57dd22ec7` | `NULL` (intacto) |
| 11 | `var_a19b2e108bfcd819` | `prod_1002826cdfe2baa1` | Colorit 51 120 g/m A2 45 x 64 cm | 120 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `UNCOATED` | `SUPPLIER_CATALOG_SPEC` | `evd_cls_82c24c6950f19b57` | `cls_req_f1085ce173691de9` | `cls_prm_1a129b9fb5489332` | `NULL` (intacto) |
| 12 | `var_ccf8a2c00361ca46` | `prod_af990e8570017bfb` | Colorit Aprikos 120g 46x64 | 120 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `UNCOATED` | `SUPPLIER_CATALOG_SPEC` | `evd_cls_e8630718441f5c01` | `cls_req_862f6a3e955b2964` | `cls_prm_b0bf298136b33155` | `NULL` (intacto) |
| 13 | `var_b141b956bf459961` | `prod_235d91c49d1e771c` | Colorit Buttercup Yellow, 160 g/m2 A2 | 160 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `UNCOATED` | `SUPPLIER_CATALOG_SPEC` | `evd_cls_1a89bf13ab20257c` | `cls_req_a6e214ec4b20b6a9` | `cls_prm_9e652500610c7b93` | `NULL` (intacto) |
| 14 | `var_75a03a61fb1f2eb4` | `prod_1f0e277c0d041023` | Colorit Kingfisher Blue 160 46x64 + 18 e... | 160 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `UNCOATED` | `SUPPLIER_CATALOG_SPEC` | `evd_cls_f898db1b31d7ed6c` | `cls_req_619196d817b4e4fb` | `cls_prm_e16d321ae280ebae` | `NULL` (intacto) |
| 15 | `var_ea7a958fbbbc4a61` | `prod_f21572ff00fcfff2` | Colorit Nr 90 Black 160 64x92 | 160 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `UNCOATED` | `SUPPLIER_CATALOG_SPEC` | `evd_cls_0941325e36e86208` | `cls_req_fe5b4ef7d5445211` | `cls_prm_d50c95fb1938e370` | `NULL` (intacto) |
| 34 | `var_860ec05f101b3f2e` | `prod_efbd017b370ffcf9` | Materica Verde Gris 120g 72x102 | 120 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `SMOOTH` | `MILL_DATASHEET` | `evd_cls_0c8b37313040067b` | `cls_req_ac0d321a318882f3` | `cls_prm_0bdf12b020566436` | `NULL` (intacto) |
| 35 | `var_01dc1655c73d9d1d` | `prod_cc51a2917d673d1a` | POP SET Californian Blue 120 70x100 | 120 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `SMOOTH` | `MILL_DATASHEET` | `evd_cls_e14c69718deb13b6` | `cls_req_3a0e5bf3457ff9ef` | `cls_prm_ce007b683d2d10b9` | `NULL` (intacto) |
| 36 | `var_1e404d0fa54d0cf2` | `prod_eb67daee8cae5cff` | POP'SET INDIGO 120 70x102 | 120 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `SMOOTH` | `MILL_DATASHEET` | `evd_cls_31cdb86e528db41c` | `cls_req_93f727dd0edfd530` | `cls_prm_e3c9e667bd63bc88` | `NULL` (intacto) |
| 37 | `var_202cd6db89d271da` | `prod_1566e6bceded606d` | PopSet 120 Poppy 70x100 (var pirkt pa l... | 120 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `SMOOTH` | `MILL_DATASHEET` | `evd_cls_1b09b57e6958bd01` | `cls_req_17fb3f34359d8212` | `cls_prm_b9fda636f403ee14` | `NULL` (intacto) |
| 38 | `var_a4dccfaa28c6be72` | `prod_897893bcaec63204` | Popset Cloud 120g 70x100 | 120 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `SMOOTH` | `MILL_DATASHEET` | `evd_cls_5ead5e7d6c865b8d` | `cls_req_1a38ae1c5a303cd5` | `cls_prm_92472279d972845c` | `NULL` (intacto) |
| 39 | `var_e8c10d5a017046de` | `prod_fd95d0371e032019` | Popset Lime Tonic 120 70x100 | 120 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `SMOOTH` | `MILL_DATASHEET` | `evd_cls_0f264e500432f0f8` | `cls_req_dc1d25143b5c2832` | `cls_prm_da5945dead70f13c` | `NULL` (intacto) |
| 40 | `var_303c4d29091a0b5f` | `prod_420c6baece7b30b7` | Rainbow 120g 920x650 R chamois/06 | 120 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `UNCOATED` | `SUPPLIER_CATALOG_SPEC` | `evd_cls_aa372cff5bb2af7d` | `cls_req_963ffbd71938347d` | `cls_prm_a644673136228d20` | `NULL` (intacto) |
| 41 | `var_b7442ec7ceb72c42` | `prod_eab8ed69c97c798d` | Rainbow 40 Salmon 120g 45x64 | 120 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `UNCOATED` | `SUPPLIER_CATALOG_SPEC` | `evd_cls_cf6fa1c644445fb8` | `cls_req_b06a0aa008624bd9` | `cls_prm_94536fab4b84c2cc` | `159 µm` (intacto) |
| 42 | `var_4673506b189901ff` | `prod_3ede79722b4f77d1` | Rainbow 80g 92x65 75 medium green | 80 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `UNCOATED` | `SUPPLIER_CATALOG_SPEC` | `evd_cls_4aa07c1f5f89d6ef` | `cls_req_fd6b5c76280fc094` | `cls_prm_36929e844e2f9cc9` | `103 µm` (intacto) |
| 43 | `var_0dfa098d4381319e` | `prod_167809a9abc3fd0e` | Rainbow 82 Light Blue 160g 45x64 | 160 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `UNCOATED` | `SUPPLIER_CATALOG_SPEC` | `evd_cls_511389ec4240591b` | `cls_req_73f2b8e8320e8426` | `cls_prm_881257f55549cda7` | `NULL` (intacto) |
| 48 | `var_9c0a311400d1b1f5` | `prod_97146f7f1e5d162c` | Sirio Color 290 70x100 Iris | 290 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `SMOOTH` | `MILL_DATASHEET` | `evd_cls_a009e97c7441eca2` | `cls_req_8bd16693861920ba` | `cls_prm_9a7eaef627aa2f18` | `NULL` (intacto) |
| 49 | `var_ef74fd09dc0ee00d` | `prod_ba9b82f2354c0de7` | Sirio Color 290 70x100 Jasmine | 290 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `SMOOTH` | `MILL_DATASHEET` | `evd_cls_5bd54c446872ceb7` | `cls_req_6c2408d014967b11` | `cls_prm_e6ed60fe5a44d473` | `NULL` (intacto) |
| 50 | `var_579f1e3dff4e8748` | `prod_59afb7cee218197b` | Sirio Color 290g 70x100 Arancio | 290 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `SMOOTH` | `MILL_DATASHEET` | `evd_cls_1c211166abe73498` | `cls_req_7f4528cf51979d50` | `cls_prm_729692f6bd0c8540` | `NULL` (intacto) |
| 51 | `var_1ec5e1e40b5225f0` | `prod_bd62a44b4c20e30e` | Sirio Color 290g 70x100 Celeste | 290 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `SMOOTH` | `MILL_DATASHEET` | `evd_cls_e3aa2cc779bddfe1` | `cls_req_4768252a97e27c3b` | `cls_prm_d7a58b1b88d669d1` | `NULL` (intacto) |
| 52 | `var_8d342e207311b70c` | `prod_a65ec0006d29a6e3` | Sirio Color 290g 70x100 Foglia | 290 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `SMOOTH` | `MILL_DATASHEET` | `evd_cls_209e8d48131e7364` | `cls_req_af1cbe1ef6bae828` | `cls_prm_bb3d93d2d102f77a` | `NULL` (intacto) |
| 53 | `var_b16736b7be0e0beb` | `prod_aa8233f3a4e015e5` | Sirio Color 290g 70x100 Lampone | 290 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `SMOOTH` | `MILL_DATASHEET` | `evd_cls_94a1be63b2f134c2` | `cls_req_6ce362ebb0e05935` | `cls_prm_20b6cd77128d6a09` | `NULL` (intacto) |
| 54 | `var_32e71e5fd8ea4b7c` | `prod_9dce521a0adfb509` | Sirio Color 290g 70x100 Limone | 290 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `SMOOTH` | `MILL_DATASHEET` | `evd_cls_da9ff5b2cc682c13` | `cls_req_24e3cc5fbab38d3b` | `cls_prm_31384d1d7caf6260` | `NULL` (intacto) |
| 55 | `var_01c77c0ba6e91afd` | `prod_eaa317382efc0417` | Sirio Color 290g 70x100 Vino | 290 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `SMOOTH` | `MILL_DATASHEET` | `evd_cls_ca959a0202d8ab5d` | `cls_req_9d6d94c70a0362cd` | `cls_prm_f136a68ca54c95bf` | `NULL` (intacto) |
| 58 | `var_3bd62623e97441c0` | `prod_743cfbfa099cbf80` | Sirio Ultra Black 460 72x102 | 460 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `SMOOTH` | `MILL_DATASHEET` | `evd_cls_5aa61dd8ed0bb76c` | `cls_req_9c5f21f248537166` | `cls_prm_f670489f984aa736` | `NULL` (intacto) |
| 67 | `var_74c119b5749f8722` | `prod_bc0188eb88b31af0` | Fedrigoni Sirio Ultra black 280 gm 72x10... | 280 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `SMOOTH` | `MILL_DATASHEET` | `evd_cls_a57201eeb2132424` | `cls_req_367fd33e044f65b6` | `cls_prm_1367fc6c51d85af0` | `NULL` (intacto) |
| 69 | `var_c2e6e89a62e587f9` | `prod_adf068cfbc5aa39d` | Keaykolor 300g 70x100 Pumpkin | 300 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `SMOOTH` | `MILL_DATASHEET` | `evd_cls_207e6f301b056777` | `cls_req_5bb4cef1d22a314d` | `cls_prm_0cc7148963c37324` | `NULL` (intacto) |
| 70 | `var_9e56ee3860c1439d` | `prod_3fd7ce9faf9046f1` | Keaykolour 300 70x100 Coral | 300 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `SMOOTH` | `MILL_DATASHEET` | `evd_cls_87703acc71f38d96` | `cls_req_32c21bae765e1601` | `cls_prm_38e468651e7fc30a` | `NULL` (intacto) |
| 71 | `var_d1bb343fa4b2db26` | `prod_8721cdb04ffe3395` | Keaykolour 300 70x100 FSC biscuit | 300 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `SMOOTH` | `MILL_DATASHEET` | `evd_cls_40ebd9d7d38ecb97` | `cls_req_8e69236d59aca57f` | `cls_prm_eea239dd67edb1e2` | `NULL` (intacto) |
| 72 | `var_356ca68b9a9a8c40` | `prod_f6613d0d3d053e3a` | Keaykolour 300 70x100 Meadow | 300 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `SMOOTH` | `MILL_DATASHEET` | `evd_cls_6037d41a0fd0883f` | `cls_req_9fd53977a71a0012` | `cls_prm_5a3a11ba15f43d31` | `NULL` (intacto) |
| 73 | `var_9c39b3e3479da5d2` | `prod_7851bfa18b0071f1` | Keaykolour 300 70x100 Orchid | 300 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `SMOOTH` | `MILL_DATASHEET` | `evd_cls_e759bd3c5f4a8979` | `cls_req_35c264e048b89c12` | `cls_prm_5f5ace935f4a0bf7` | `NULL` (intacto) |
| 74 | `var_88d1b9fdee1d23fe` | `prod_ebf6e1f4eb852ea5` | Keaykolour 300 70x102 Caribbean Blue | 300 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `SMOOTH` | `MILL_DATASHEET` | `evd_cls_f3d8361c8018eea1` | `cls_req_671f4435c802d2b6` | `cls_prm_f5b3c1ff38f57fe0` | `NULL` (intacto) |
| 75 | `var_47a2d9de15d81a9e` | `prod_40ee314ad2496147` | Keaykolour Azure 300g 70x100 | 300 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `SMOOTH` | `MILL_DATASHEET` | `evd_cls_0f19f9980b6209e9` | `cls_req_572a07b819e99e30` | `cls_prm_5fe863f2064d7c74` | `NULL` (intacto) |
| 76 | `var_e3187eab3fe6cfbc` | `prod_d4fe596344db76ff` | Keaykolour Carmine 300 70x100 | 300 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `SMOOTH` | `MILL_DATASHEET` | `evd_cls_402f1f70b3cdded8` | `cls_req_822fbe56ab9ca217` | `cls_prm_06d4bd8cbaf8417a` | `NULL` (intacto) |
| 77 | `var_ae3dbd8e14b43bfd` | `prod_787216896e29b758` | Keaykolour Royal Blue 300 70x100 | 300 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `SMOOTH` | `MILL_DATASHEET` | `evd_cls_b1f43a2b648b5f87` | `cls_req_b1bdd0c170ea7b7b` | `cls_prm_07c9928f9a6f0b22` | `NULL` (intacto) |
| 78 | `var_58294dbd0f8d7db8` | `prod_b9569891a0be9798` | Keaykolour Snow white 300 70x100 | 300 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `SMOOTH` | `MILL_DATASHEET` | `evd_cls_7a02e1fc66079da3` | `cls_req_f7185abfd3ac320f` | `cls_prm_9032b36551fff511` | `NULL` (intacto) |
| 79 | `var_7edc06190eaa1029` | `prod_d3149952dcf39368` | Keaykolour, 300g, 70x100cm, Cobblestone | 300 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `SMOOTH` | `MILL_DATASHEET` | `evd_cls_b1f0de2d812a6d7c` | `cls_req_152ff45f4c025988` | `cls_prm_23cd68210ab24c03` | `440 µm` (intacto) |
| 80 | `var_0d3230aab8344139` | `prod_b0516043038a1570` | Olin Colours Vanilla 240 70x100 FSC | 240 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `SMOOTH` | `SUPPLIER_CATALOG_SPEC` | `evd_cls_d7cd1e3add3e0117` | `cls_req_cddff746afe93f2c` | `cls_prm_a5428ea11e83d0be` | `273 µm` (intacto) |
| 81 | `var_1004deb956283678` | `prod_99b4a4149f88de39` | Olin Colours Baby Pink 240 70x100 FSC | 240 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `SMOOTH` | `SUPPLIER_CATALOG_SPEC` | `evd_cls_fdb8e51fefdaa8ee` | `cls_req_bea871d310a6341a` | `cls_prm_7f3609b15b26c998` | `273 µm` (intacto) |
| 82 | `var_637fe079a03f6942` | `prod_8761d8ad157098b9` | Olin Colours Storm Grey 240 70x100 FSC | 240 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `SMOOTH` | `SUPPLIER_CATALOG_SPEC` | `evd_cls_b968459508f44a4c` | `cls_req_3aca137f143ab926` | `cls_prm_93f6dcc1cd8e2edc` | `273 µm` (intacto) |
| 83 | `var_6e9044eac9c533cb` | `prod_46a5a56d464d9a2e` | Olin Colours Poppy 240 70x100 FSC | 240 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `SMOOTH` | `SUPPLIER_CATALOG_SPEC` | `evd_cls_ca4f21e22cddbe24` | `cls_req_b932a217fa389f8c` | `cls_prm_e3941c30a1e0a56a` | `273 µm` (intacto) |
| 84 | `var_90324825728ace0b` | `prod_80f76445eba25759` | Olin Colours Orange 240 70x100 FSC | 240 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `SMOOTH` | `SUPPLIER_CATALOG_SPEC` | `evd_cls_d5abeb1b7644ce8a` | `cls_req_5f604f16761a9b51` | `cls_prm_880528f4509b8525` | `273 µm` (intacto) |
| 85 | `var_9810e5bcba78571a` | `prod_c8f8b9503328b2c2` | Olin Colours Black 240 70x100 FSC | 240 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `SMOOTH` | `SUPPLIER_CATALOG_SPEC` | `evd_cls_7b9baa07cb336548` | `cls_req_14085a73889c0f3b` | `cls_prm_a16bfdbb984ed10b` | `295 µm` (intacto) |
| 86 | `var_bd85ff3215deb0d6` | `prod_b150f504a8266f73` | Olin Colours Cloud 240 70x100 FSC | 240 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `SMOOTH` | `SUPPLIER_CATALOG_SPEC` | `evd_cls_288fa6e11abb9199` | `cls_req_720891dae1a87886` | `cls_prm_3578460028a78ef8` | `273 µm` (intacto) |
| 87 | `var_cd961e4cbd77fda5` | `prod_9194c7b711a34cbf` | Olin Colours Old Gold 240 70x100 FSC | 240 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `SMOOTH` | `SUPPLIER_CATALOG_SPEC` | `evd_cls_5340ff4eb5285d9d` | `cls_req_65f27226d753461b` | `cls_prm_87b43f4b156ac07b` | `273 µm` (intacto) |
| 88 | `var_f6a1adb4f700cce6` | `prod_1d4fad5f44958945` | Olin Colours Citrus Yellow 240 70x100 FS... | 240 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `SMOOTH` | `SUPPLIER_CATALOG_SPEC` | `evd_cls_49797bed2a7cae88` | `cls_req_60f469e64474743a` | `cls_prm_3c14b9e5c0ec248b` | `273 µm` (intacto) |
| 89 | `var_22f31b134a4c53a0` | `prod_14eb2c1e1cecbcd0` | Olin Colours Storm Grey 170 70x100 FSC | 170 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `SMOOTH` | `SUPPLIER_CATALOG_SPEC` | `evd_cls_a18f203fdf8f57e8` | `cls_req_57138c5596f8ce1e` | `cls_prm_ca79c66faf88bfc7` | `205 µm` (intacto) |
| 90 | `var_290ff7b8a4f5c6f7` | `prod_e4edb53ca9282c86` | Olin Colours Vanilla 170 70x100 FSC | 170 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `SMOOTH` | `SUPPLIER_CATALOG_SPEC` | `evd_cls_23a104115244d88f` | `cls_req_391e6bc9c85e2390` | `cls_prm_95f27cd5e9ce91f7` | `205 µm` (intacto) |
| 91 | `var_2d6ceacb21de2b63` | `prod_940d619af03e977d` | Olin Colours Ivory 170 70x100 FSC | 170 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `SMOOTH` | `SUPPLIER_CATALOG_SPEC` | `evd_cls_84c23377e10365e7` | `cls_req_a14ccffa7dead36e` | `cls_prm_9f82347a85cd76b2` | `205 µm` (intacto) |
| 92 | `var_3b748ce0ed00a7bb` | `prod_be9c61422e223fb5` | Olin Colours Pistachio 170 70x100 FSC | 170 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `SMOOTH` | `SUPPLIER_CATALOG_SPEC` | `evd_cls_6e7eb0418c6077d4` | `cls_req_07c230ba54f0344a` | `cls_prm_eb01a8c7659958f6` | `205 µm` (intacto) |
| 93 | `var_55e41186c3d621fa` | `prod_8ef63d3aac70a542` | Olin Colours Cobalt 170 70x100 FSC | 170 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `SMOOTH` | `SUPPLIER_CATALOG_SPEC` | `evd_cls_8ea9416f279400a7` | `cls_req_8c56e7d5a433a02e` | `cls_prm_8ed488e1cf4edb50` | `205 µm` (intacto) |
| 94 | `var_6271ef1b30c9efbe` | `prod_668b7ad142d511e7` | Olin Colours Fawn 170 70x100 FSC | 170 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `SMOOTH` | `SUPPLIER_CATALOG_SPEC` | `evd_cls_4ca8180f3e50aa72` | `cls_req_fb3b42af3b7a3a5f` | `cls_prm_b61e4353415746db` | `205 µm` (intacto) |
| 95 | `var_7b281cbccad14e2f` | `prod_77eadb90e09e9c1b` | Olin Colours Cloud 170 70x100 FSC | 170 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `SMOOTH` | `SUPPLIER_CATALOG_SPEC` | `evd_cls_17678c1a60683d4c` | `cls_req_dd8ba2acacfc3ebd` | `cls_prm_3c7d818d840286b3` | `205 µm` (intacto) |
| 96 | `var_8970c928c808cb09` | `prod_1c2db829e78912f7` | Olin Colours Cherry 170 70x100 FSC | 170 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `SMOOTH` | `SUPPLIER_CATALOG_SPEC` | `evd_cls_80b783cd2091faf3` | `cls_req_a3f23d6b0f67b9ca` | `cls_prm_04d9d3ab39e95b68` | `205 µm` (intacto) |
| 97 | `var_9f3e683f06d6771e` | `prod_cc396845c49e262c` | Olin Colours Spring Green 170 70x100 FSC | 170 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `SMOOTH` | `SUPPLIER_CATALOG_SPEC` | `evd_cls_b91d18766bc04186` | `cls_req_4da7a176317c997f` | `cls_prm_d0abefd8ea8354ea` | `205 µm` (intacto) |

---

## 6. Balance de Clasificaciones Pendientes Restantes (`64` de `337`)

| Lote / Grupo Funcional | Variantes Iniciales (`OTHER`) | Acreditadas Acumuladas | Pendientes Restantes (`OTHER`) | Estado |
| :--- | :---: | :---: | :---: | :--- |
| **Batch C1** (`G3_OFFSET` [64] + `G5_COATED` [12] + `ArcoPrint` [1]) | `77` | **`77`** | `0` | **100% ACREDITADO (C1)** |
| **Batch C2** (`G4_BOARD` [27] + `G3_LUXLINE` [10]) | `37` | **`37`** | `0` | **100% ACREDITADO (C2)** |
| **Batch C3** (`G1_CASE_BINDING_COVERING_MATERIALS`) | `62` | **`62`** | `0` | **100% ACREDITADO (C3)** |
| **Batch C4** (`G2` & `G6` Fine Art y Papeles Creativos `DESIGN`) | `97` | **`97`** | `0` | **100% ACREDITADO (C4)** |
| **Batch C5** (Resto `64` variantes: `36` *Olin Colours* + `28` Especialidades *Reacto NCR, Syn-Coat, Priplak, Sticotac, etc.*) | `64` | `0` | **`64`** | En cola final (Batch C5) |
| **TOTALES** | **`337`** | **`273`** (`81,01%`) | **`64`** (`18,99%`) | **273 promovidas / 64 pendientes** |
