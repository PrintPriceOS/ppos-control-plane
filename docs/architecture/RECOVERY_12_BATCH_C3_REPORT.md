# PrintPrice OS — RECOVERY-12: Batch C3 Classification Accreditation Report (62 DESIGN Case-Binding Covering Variants)

> [!IMPORTANT]
> **Estado de Ejecución**: **COMPLETADO CON ÉXITO — ACREDITACIÓN GOBERNADA DE 62 VARIANTES `DESIGN` (RECUBRIMIENTOS DE ENCUADERNACIÓN) E INMUTABILIDAD 100% DE ESPESORES CERTIFICADA**
> - **Fecha de ejecución**: `2026-10-31T00:57:55.733Z`
> - **Servicio transaccional**: `PaperEvidenceService` (`src/api/services/paperEvidenceService.js`)
> - **Tabla de auditoría**: `Control.paper_variant_classification_evidence` (total acumulado: **`176`** registros acreditados: `77` Batch C1 + `37` Batch C2 + `62` Batch C3)
> - **Lote promovido**: **Batch C3 — `62` variantes P1 de materiales de recubrimiento para tapa dura/encuadernación (`G1_CASE_BINDING_COVERING_MATERIALS`)**:
>   - **C3-Efalin (`26` variantes)**: `DESIGN` / `UNCOATED` / `TEXTURED` (Gmund / Zanders — Efalin Fine Linen & New Linen 120 g/m²)
>   - **C3-Geltex (`18` variantes)**: `DESIGN` / `UNCOATED` / `TEXTURED` (Guarro Casas — Geltex 115–130 g/m²)
>   - **C3-Wibalin (`13` variantes)**: `DESIGN` / `UNCOATED` / `TEXTURED` (`5` Buckram / Fine Linen / Flute) & `UNCOATED` (`8` Wibalin Natural 120 g/m²) (Winter & Company)
>   - **C3-Surbalin (`5` variantes)**: `DESIGN` / `UNCOATED` / `TEXTURED` (Peyer Graphic — Surbalin Glatt / Linea / Matt / Seda 115 g/m²)
> - **Inmutabilidad de espesores (`caliper_um`)**: **100% preservada** (`1.524` total | `1.284` con espesor | `240` sin espesor | Hash SHA-256 bit a bit idéntico: `d3c288687abb8f7d11a36fde6e853685381bf417193be3422de16dd6b003b485`).

---

## 1. Certificación de Inmutabilidad de Espesores y Balance de Clasificación (`Control.paper_variants`)

| Indicador Oficial en Producción (`Control`) | Pre-Batch C3 | Post-Batch C3 | Delta | Estado |
| :--- | :---: | :---: | :---: | :---: |
| **Total registros (`paper_variants`)** | `1524` | **`1524`** | `0` | **INMUTABLE (OK)** |
| **Con espesor (`caliper_um > 0`)** | `1284` | **`1284`** | `0` | **INMUTABLE (OK)** |
| **Sin espesor (`caliper_um IS NULL`)** | `240` | **`240`** | `0` | **INMUTABLE (OK)** |
| **SHA-256 Vector 1.524 Espesores** | `d3c28868...03b485` | **`d3c28868...03b485`** | `0 bits` | **IDÉNTICO BIT A BIT** |
| **Clasificación `DESIGN` activa (runtime)** | `111` | **`173`** | **`+62`** | **PROMOVIDAS C3** |
| **Clasificación `CARTON` activa (runtime)** | `146` | **`146`** | `0` | **INTACTO (C2)** |
| **Clasificación `OFFSET` activa (runtime)** | `465` | **`465`** | `0` | **INTACTO (C1)** |
| **Clasificación `COATED` activa (runtime)** | `579` | **`579`** | `0` | **INTACTO (C1)** |
| **Clasificaciones pendientes (`OTHER` runtime)** | `223` | **`161`** | **`-62`** | **REDUCIDO (223 -> 161)** |
| **Clasificaciones `OTHER` crudas en BD (`paper_products`)** | `224` | **`161`** | **`-63`** | **ALINEADO CON RUNTIME (161)** |
| **`CHECKSUM TABLE paper_variants`** | `2878267945` | **`3890542543`** | Actualizado | `finish` + `metadata_json` |
| **`CHECKSUM TABLE paper_products`** | `4274524373` | **`2340046218`** | Actualizado | `category` + `finish_summary` |
| **`CHECKSUM TABLE paper_variant_classification_evidence`** | `660930025` | **`649828167`** | `+62 filas` | `176` evidencias totales (`77` C1 + `37` C2 + `62` C3) |

> [!NOTE]
> **Convergencia exacta entre BD cruda y Runtime (`161 = 161`)**:
> La variante #4 del lote (`var_9ebc604670dc6622`, *Efalin FINE LINEN 130 (Light Blue) 120 102x72*) comparte `product_id = prod_74bc2cb3bd5e8a40` con su variante hermana `var_85c142a50239e312` (*102x70*), la cual ya se resolvía en tiempo de ejecución como `DESIGN` vía `ods_materials_recovery`. Al promover `prod_74bc2cb3bd5e8a40` a `category = 'DESIGN'` en `Control.paper_products`, el contador crudo de `OTHER` en BD y el contador efectivo en tiempo de ejecución (`resolveVariantTechnicalAttributes()`) convergen de forma exacta en **`161`** variantes pendientes.

---

## 2. Gobernanza y Segregación de Funciones de 4 Vías (SoD)

Cada una de las 62 variantes de recubrimiento de encuadernación completó el ciclo transaccional de 4 etapas en `PaperEvidenceService`:
1. **Stage 1 (`registerClassificationEvidence`)**: `rec12_cls_submitter` (`SUPPLIER_OPERATOR`)
2. **Stage 2 (`reviewClassificationEvidence`)**: `rec12_cls_reviewer` (`MATERIAL_TECHNOLOGIST`) -> Decisión `APPROVE`
3. **Stage 3 (`requestClassificationPromotion`)**: `rec12_cls_requester` (`SUPPLIER_OPERATOR`)
4. **Stage 4 (`authorizeClassificationPromotion`)**: `rec12_cls_authorizer` (`SUPPLIER_ADMIN`) -> Estado final `PROMOTED`

---

## 3. Registro de Auditoría — Sublote C3-Efalin (`26` Variantes — `DESIGN` / `UNCOATED` / `TEXTURED`)

| # | `variant_id` | `product_id` | Producto Comercial | GSM | Transición `category` | `coating_status` | `finish` | `classification_evidence_id` | `promotion_request_id` | `promotion_id` | Espesor (`caliper_um`) |
| :---: | :--- | :--- | :--- | :---: | :---: | :---: | :---: | :--- | :--- | :--- | :--- |
| 1 | `var_04ddb17c814d5000` | `prod_5eebbba8429fd80c` | Efalin FINE LINEN 114 (Dark Blue) 120 10... | 120 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `TEXTURED` | `evd_cls_64494431e01b98d8` | `cls_req_269cd81776226cc4` | `cls_prm_9067beafc4152ede` | `NULL` (intacto) |
| 2 | `var_a7fc7fb8e188329b` | `prod_351f7fbc53539877` | Efalin FINE LINEN 116 (Red) 120 102x70 | 120 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `TEXTURED` | `evd_cls_99cc3538caacc4eb` | `cls_req_7de9e484b69a984f` | `cls_prm_00803f434ed3ee9f` | `NULL` (intacto) |
| 3 | `var_c0c9a08ed0895f8d` | `prod_28aaeafd8b6f07d8` | Efalin FINE LINEN 120 (Dark green) 120 1... | 120 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `TEXTURED` | `evd_cls_84c894b551fceac6` | `cls_req_6d29110242465f9d` | `cls_prm_fd0832f9cb3f9fec` | `NULL` (intacto) |
| 4 | `var_9ebc604670dc6622` | `prod_74bc2cb3bd5e8a40` | Efalin FINE LINEN 130 (Light Blue) 120 1... | 120 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `TEXTURED` | `evd_cls_b7b39e1e52f9e476` | `cls_req_79a00bee72855f58` | `cls_prm_1606974b886291ff` | `NULL` (intacto) |
| 5 | `var_a743b85c9cdc0189` | `prod_bf5b33d958663807` | Efalin FINE LINEN 136 (Paris Blue) 120 1... | 120 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `TEXTURED` | `evd_cls_63e86a12a292104c` | `cls_req_ce9f0584eb887b56` | `cls_prm_c517ce6ea9d85da8` | `NULL` (intacto) |
| 6 | `var_5e60c0c4b6008ba2` | `prod_bb2423297a680ac7` | Efalin FINE LINEN 137 (Buff) 120 102x70 | 120 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `TEXTURED` | `evd_cls_e69557376bdb6ee9` | `cls_req_30ce59e099e8ae80` | `cls_prm_421f036750b7a9f2` | `NULL` (intacto) |
| 7 | `var_a244b39b9d23adb4` | `prod_b64631df95a89581` | Efalin FINE LINEN 140 (Sand) 120 102x70 | 120 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `TEXTURED` | `evd_cls_5e0a36e98496ad0d` | `cls_req_f10a57dfddf34f03` | `cls_prm_b6eb5a70e906cf0c` | `NULL` (intacto) |
| 8 | `var_5082199d85952a95` | `prod_b19f198262a7d691` | Efalin FINE LINEN 147 (Charcoal) 120 102... | 120 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `TEXTURED` | `evd_cls_79a665c49f94b35e` | `cls_req_aef6ca1e2dafb53f` | `cls_prm_6e626dfa3dc81b50` | `NULL` (intacto) |
| 9 | `var_b86070cc48e29fbc` | `prod_0c7609867a034e6c` | Efalin FINE LINEN 150 (Bread yellow) 120... | 120 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `TEXTURED` | `evd_cls_0de30f044c50fb50` | `cls_req_148794de40cd598e` | `cls_prm_75533f6325962d67` | `NULL` (intacto) |
| 10 | `var_3188a8084c71f7bd` | `prod_89c95b4babf90399` | Efalin FINE LINEN 155 (Titan) 120 102x70 | 120 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `TEXTURED` | `evd_cls_06ee571bc24c7b8a` | `cls_req_31d4467158e4b05c` | `cls_prm_7fbb063c430f2e82` | `NULL` (intacto) |
| 11 | `var_58745204862feb20` | `prod_77f663343389dbcd` | EFALIN LAID 108 (High white) 120 102x70 | 120 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `TEXTURED` | `evd_cls_cf0b57b51c356637` | `cls_req_a245c409fbf60598` | `cls_prm_b0124488c2b5e79d` | `NULL` (intacto) |
| 12 | `var_d46e8928286368f5` | `prod_613bac3734d5d4d4` | Efalin LINEAR 108 (High white) 120 102x7... | 120 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `TEXTURED` | `evd_cls_7beed00e9d16e0c9` | `cls_req_9e24a7703bdf3c9c` | `cls_prm_4c2afa67a025dca9` | `NULL` (intacto) |
| 13 | `var_8dc70af13f78561a` | `prod_7b7fa8596bc4d74e` | Efalin NEW LINEN 109 (White) 120 102x70 | 120 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `TEXTURED` | `evd_cls_047d08c0cbcd3188` | `cls_req_3b53899527fc99f2` | `cls_prm_4d3acd3899e37e55` | `NULL` (intacto) |
| 14 | `var_2bdac132282f238d` | `prod_9d663ff50b11f9b3` | Efalin NEW LINEN 114 (Dark blue) 120 102... | 120 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `TEXTURED` | `evd_cls_a0af396b93aec8c8` | `cls_req_648c3cde72523df2` | `cls_prm_ab434765dcea83ad` | `NULL` (intacto) |
| 15 | `var_73e3a67a8f6ced50` | `prod_d60b69c5cd994a20` | Efalin NEW LINEN 121 (Black) 120 102x70 | 120 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `TEXTURED` | `evd_cls_d647c80e2671be7c` | `cls_req_e9dfecd8f824c9d6` | `cls_prm_bb64f3a091af9b29` | `NULL` (intacto) |
| 16 | `var_20821dc40f41abc5` | `prod_c1b605d38fd9e6b9` | Efalin NEW LINEN 135 (Burgundy) 120 102x... | 120 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `TEXTURED` | `evd_cls_97d30309626d80a5` | `cls_req_0b0b1a7dbe420a18` | `cls_prm_fef80097839ac5ae` | `NULL` (intacto) |
| 17 | `var_64572b1db6d91816` | `prod_62860880106479ac` | Efalin NEW LINEN 136 (Paris Blue) 120 10... | 120 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `TEXTURED` | `evd_cls_5fa0e00c5933a91b` | `cls_req_d49f287d11e762c7` | `cls_prm_907c239d54a15a5c` | `NULL` (intacto) |
| 18 | `var_2ab3e20d9cf0c628` | `prod_df46bc1fcde428ba` | Efalin NEW LINEN 147 (Charcoal) 120 102x... | 120 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `TEXTURED` | `evd_cls_b992c5ae8fef2f4a` | `cls_req_098ea5a0bc3a23f3` | `cls_prm_782a53a62b380530` | `NULL` (intacto) |
| 19 | `var_a69c102d7302e619` | `prod_ea3a3baa1ebfdcad` | Efalin NEW LINEN 155 (Titan) 120 102x70 | 120 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `TEXTURED` | `evd_cls_c2ac10ec1e6e0554` | `cls_req_80e18a17ba5c2073` | `cls_prm_fef87ad94cb3e08a` | `NULL` (intacto) |
| 20 | `var_4d80a702468e405a` | `prod_40291d2c3158e9cb` | Efalin WOVE 108 (High white) 120 102x70 | 120 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `TEXTURED` | `evd_cls_b226b458bc3d07d0` | `cls_req_0dae33714208e612` | `cls_prm_2dedf33974ba49b7` | `NULL` (intacto) |
| 21 | `var_dec88f8c75a46064` | `prod_092229aeb0a493bf` | Efalin WOVE 108 (High white) 120 70x102 | 120 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `TEXTURED` | `evd_cls_b00868c2a80a5fb5` | `cls_req_d2a82225d9604a5c` | `cls_prm_9a784c7d022147e2` | `NULL` (intacto) |
| 22 | `var_0722559cdebe7bc9` | `prod_8391d519c73ce89b` | Efalin WOVE 121 (Black) 120 102x70 | 120 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `TEXTURED` | `evd_cls_b55cb2b52b1c4ddb` | `cls_req_c05fcb449b50a451` | `cls_prm_96decb2e8f880a61` | `NULL` (intacto) |
| 23 | `var_19c43cad232d430e` | `prod_9608b34d3e5cfb1c` | Efalin WOVE 137 (Buff) 120 102x70 | 120 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `TEXTURED` | `evd_cls_e6ffcf61e99b2036` | `cls_req_f4c307f80fef2734` | `cls_prm_0d6e635717fa1246` | `NULL` (intacto) |
| 24 | `var_8e7b64861115a59a` | `prod_8a4aa950330efa17` | Efalin WOVE 140 (Sand) 120 102x70 | 120 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `TEXTURED` | `evd_cls_9bd284cd85d5694e` | `cls_req_5da0ffc17bd7e80e` | `cls_prm_0af333e2f8c3771f` | `NULL` (intacto) |
| 25 | `var_df1ccb990f435769` | `prod_140ca394fa46ca41` | Efalin WOVE 151 (Orange) 120 102x70 | 120 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `TEXTURED` | `evd_cls_e9d06e7f800dd9d2` | `cls_req_c0be4ef71ed2e350` | `cls_prm_d9b53bdbef64b4f9` | `NULL` (intacto) |
| 26 | `var_cdc13df68a41babf` | `prod_e9a3f628eacc0d34` | Efalin WOVE 166 (Ruby) 120 102x70 | 120 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `TEXTURED` | `evd_cls_f12114c7cdd5aaab` | `cls_req_bdecb845cbfce70f` | `cls_prm_3f7fb324894208fc` | `NULL` (intacto) |

---

## 4. Registro de Auditoría — Sublote C3-Geltex (`18` Variantes — `DESIGN` / `UNCOATED` / `TEXTURED`)

| # | `variant_id` | `product_id` | Producto Comercial | GSM | Transición `category` | `coating_status` | `finish` | `classification_evidence_id` | `promotion_request_id` | `promotion_id` | Espesor (`caliper_um`) |
| :---: | :--- | :--- | :--- | :---: | :---: | :---: | :---: | :--- | :--- | :--- | :--- |
| 27 | `var_bb09030cd999d385` | `prod_c83d8f8116272db7` | Geltex F Blanco Nieve, Nr.111, 130 70x10... | 130 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `TEXTURED` | `evd_cls_32f2a92331ed10fa` | `cls_req_c08ef08cb5ab20f1` | `cls_prm_efc29f539ad98cf1` | `NULL` (intacto) |
| 28 | `var_23b233be84f4fdc5` | `prod_a436eaff67c755a7` | Geltex F Nr. 132 115g 70x100 | 115 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `TEXTURED` | `evd_cls_d4bdcc87288d3b44` | `cls_req_3d54bfe8513f7877` | `cls_prm_a9b3b1104b1019d9` | `NULL` (intacto) |
| 29 | `var_2802802be6439092` | `prod_051a4dd41714e1b5` | Geltex G-STR 130 70x100 Blanco Nieve | 130 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `TEXTURED` | `evd_cls_bfaf8d29c4e0da94` | `cls_req_c0c1633440cad5db` | `cls_prm_b8e2c4ea21fa2547` | `NULL` (intacto) |
| 30 | `var_2b5ba66565788d3e` | `prod_0cc7e03c98c073fd` | Geltex Habana LS 300 gsm 70x100 | 300 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `TEXTURED` | `evd_cls_77f47ca1c8198d7c` | `cls_req_149a5c60d9bc21ae` | `cls_prm_1e17af4f58f568f0` | `NULL` (intacto) |
| 31 | `var_b5497e5a92816d7d` | `prod_34889fd31baf005a` | Geltex K Nr155 Azul Mar, 115 70x100 | 115 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `TEXTURED` | `evd_cls_399dffaba40675a4` | `cls_req_5bcb453511680f25` | `cls_prm_c0885875af56022d` | `NULL` (intacto) |
| 32 | `var_d8912240d66f6be5` | `prod_014d9dc3fb1dc2da` | Geltex Linea Nr. 111, 130 70x100 | 130 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `TEXTURED` | `evd_cls_24a49e36461b7cf4` | `cls_req_1e3eaab7c9b76b31` | `cls_prm_986fb38d5e62fe45` | `NULL` (intacto) |
| 33 | `var_39630e9edb4a63f6` | `prod_11ec72602a5da355` | Geltex LS 115 70x100 Lila | 115 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `TEXTURED` | `evd_cls_77bf674c5b6eca8c` | `cls_req_0517104bd5a7ec50` | `cls_prm_aaeec216258d308c` | `NULL` (intacto) |
| 34 | `var_349a003ad83e3be0` | `prod_96c1d8ca9fb87a61` | Geltex LS 115 70x100 Manzana | 115 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `TEXTURED` | `evd_cls_6ab39b3ee68205c7` | `cls_req_2bdfa238d5ff9380` | `cls_prm_a80183d3d638814e` | `NULL` (intacto) |
| 35 | `var_04343d8a31f07f5c` | `prod_e2e691fd3b002baa` | Geltex LS 115 70x100 Verde Azulado | 115 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `TEXTURED` | `evd_cls_fe0c43d3a236a472` | `cls_req_b860a52faa753167` | `cls_prm_60833ad6ca489010` | `NULL` (intacto) |
| 36 | `var_abd1bfeb99fbc1de` | `prod_53973dc37bf42260` | Geltex LS 1165 Rioja 115 70x100 FSC | 115 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `TEXTURED` | `evd_cls_a6f553a1e4beb882` | `cls_req_1143e371e80df6d9` | `cls_prm_7c976c5198b3807a` | `NULL` (intacto) |
| 37 | `var_272b01c84b667ff8` | `prod_cf3fbcc38aa441cf` | Geltex LS Lago Nr.154 115 70x100 | 115 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `TEXTURED` | `evd_cls_840f0fa2c73760ed` | `cls_req_35e36e6b3f7f4c5f` | `cls_prm_6a2b581aeaa33617` | `NULL` (intacto) |
| 38 | `var_7ead0d6ba5af711a` | `prod_70e898baad49ed78` | Geltex LS Narcisco 1327 115g 70x100 | 115 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `TEXTURED` | `evd_cls_f0949b4f18945e33` | `cls_req_884cc6af75e75b19` | `cls_prm_f208e623764d809e` | `NULL` (intacto) |
| 39 | `var_2a6071242d8ef73e` | `prod_3b23d8d57e92df00` | Geltex LS Nr 184 115 70x100 | 115 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `TEXTURED` | `evd_cls_30a8093ddb67b745` | `cls_req_c279a1a3aaedc3a4` | `cls_prm_28ece156b6ea68cc` | `NULL` (intacto) |
| 40 | `var_8b2d75468a9b88e9` | `prod_2a3a0a67c9e15945` | Geltex LS Nr. 145 115 70x100 | 115 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `TEXTURED` | `evd_cls_0a0a23053b990349` | `cls_req_555b3167004dd55e` | `cls_prm_385e7d55403a0099` | `NULL` (intacto) |
| 41 | `var_f65c8342341371a1` | `prod_dbec43a5c7756f85` | Geltex LS Nr.122 light grey 115 70x100 ... | 115 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `TEXTURED` | `evd_cls_4dcc7422ba10ffef` | `cls_req_5b14eca237537c64` | `cls_prm_7bd03f7b18df7502` | `NULL` (intacto) |
| 42 | `var_fe60e98f8ee9d5e5` | `prod_b2abdfd3f34ff7c4` | Geltex LS Nr.146 Botella 115 70x100 | 115 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `TEXTURED` | `evd_cls_97421ef168e4bda6` | `cls_req_a1760de63211391c` | `cls_prm_4546f17f315e95d6` | `NULL` (intacto) |
| 43 | `var_a4e70f90a7aede5e` | `prod_1239b5ce16e9aecc` | Geltex LS Nr155 Azul Mar 115 70x100 | 115 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `TEXTURED` | `evd_cls_c0c73db9d8738003` | `cls_req_59896f04c1f69c30` | `cls_prm_99accf5cfc9f6082` | `NULL` (intacto) |
| 44 | `var_0c973088ac95fb52` | `prod_1cf8d80f095d9d00` | Geltex Pizzara 1325 Anacalado 2 115 70x1... | 115 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `TEXTURED` | `evd_cls_a6c138e439b550d1` | `cls_req_80f9bcaf51b4fa21` | `cls_prm_0e35f523da0a92fa` | `NULL` (intacto) |

---

## 5. Registro de Auditoría — Sublote C3-Wibalin (`13` Variantes — `DESIGN` / `UNCOATED` / `TEXTURED` & `UNCOATED`)

| # | `variant_id` | `product_id` | Producto Comercial | GSM | Transición `category` | `coating_status` | `finish` | `classification_evidence_id` | `promotion_request_id` | `promotion_id` | Espesor (`caliper_um`) |
| :---: | :--- | :--- | :--- | :---: | :---: | :---: | :---: | :--- | :--- | :--- | :--- |
| 50 | `var_1f1ca033881e25eb` | `prod_5eb4b86657effd9a` | Wibalin Buckram, 125g, 102x76cm, White W... | 125 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `TEXTURED` | `evd_cls_417018fd38c53391` | `cls_req_0a69262612d09688` | `cls_prm_1114ddd1fcc52db0` | `NULL` (intacto) |
| 51 | `var_4d7fbc5824413bbf` | `prod_612fba5f42533f3c` | Wibalin Fine Linen RED 115 102x76 | 115 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `TEXTURED` | `evd_cls_2a1a3f69bf86cf3b` | `cls_req_892386394829abb9` | `cls_prm_debc328cc3d7a73e` | `NULL` (intacto) |
| 52 | `var_21b6def916999f64` | `prod_1ec825af70d52ceb` | Wibalin Finelinen 125g 102x76white | 125 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `TEXTURED` | `evd_cls_28d320011c81eda8` | `cls_req_d3d3d3e11f5aabf1` | `cls_prm_c35c9a9a5f99a9a6` | `NULL` (intacto) |
| 53 | `var_b1884de25a8dfd6b` | `prod_ff1ff417b7d514d3` | Wibalin Finelinen 569 Paris blue 120 102... | 120 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `TEXTURED` | `evd_cls_48c0b6463c9c5aaa` | `cls_req_a4c4992f9076145b` | `cls_prm_fef249d8d2c569b6` | `NULL` (intacto) |
| 54 | `var_ce4f4518b4046022` | `prod_882f16c5e745f5f7` | WIBALIN FLUTE WBU500 125 102x76 | 125 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `TEXTURED` | `evd_cls_10e56b3009ba704b` | `cls_req_4d47005c6fd3a3ac` | `cls_prm_66cb9e655aa19a3e` | `NULL` (intacto) |
| 55 | `var_b783a87ed75b64c9` | `prod_3d4c82fc1e85ce3a` | Wibalin Natural #580 Amethyst 120 g 102x... | 120 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `UNCOATED` | `evd_cls_440c04d628561847` | `cls_req_31ba7e72e7e83533` | `cls_prm_d583bda4556bbf50` | `NULL` (intacto) |
| 56 | `var_e1a3b973c43b187c` | `prod_8f46f1977b3c1492` | Wibalin Natural Lilac 120 102x76 | 120 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `UNCOATED` | `evd_cls_c57b12e2ba6a538d` | `cls_req_56e8a4b887e5ac82` | `cls_prm_3b23d774397b1998` | `NULL` (intacto) |
| 57 | `var_31a3fd386c283a28` | `prod_e53c909e8d281e7c` | Wibalin Natural Nr 565 102x76 | 120 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `UNCOATED` | `evd_cls_ce585c0a86ade688` | `cls_req_4cc2508bf595431d` | `cls_prm_f1632f39e54d1751` | `NULL` (intacto) |
| 58 | `var_cb0911ae8636b02b` | `prod_44141d52fa79567d` | Wibalin Natural, 120g, 102x76cm, Black | 120 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `UNCOATED` | `evd_cls_f20c7a36f3fbf066` | `cls_req_d36e6766606e339a` | `cls_prm_ea15c93266077527` | `NULL` (intacto) |
| 59 | `var_1322b6fb75a09af8` | `prod_cfcc484e21e397e2` | Wibalin Natural, 120g, 102x76cm, Dark Bl... | 120 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `UNCOATED` | `evd_cls_1d297d07df1b116f` | `cls_req_bb7bae5dd3ab8d4a` | `cls_prm_964f122bc58a4ab2` | `NULL` (intacto) |
| 60 | `var_45d407a131b0566a` | `prod_85c8c68e1d532809` | Wibalin Natural, white120 102x76 | 120 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `UNCOATED` | `evd_cls_5e6dc5a11fa8680a` | `cls_req_cf50b64c35b3fa7c` | `cls_prm_21cf7566ce683f48` | `NULL` (intacto) |
| 61 | `var_0ffed8b0f5b2213d` | `prod_abf93eb87f7a8c74` | Wibalin Old Gold 120 102x76 | 120 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `UNCOATED` | `evd_cls_6796fc2b539cce6a` | `cls_req_c344d7bc6d2cdbcf` | `cls_prm_af053962d611f5ed` | `NULL` (intacto) |
| 62 | `var_dcd83bd7ce91e9b0` | `prod_caaa4cd975a7747e` | Wibalin Paris Blue 120 102x76 | 120 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `UNCOATED` | `evd_cls_6405173365aad05b` | `cls_req_58b91c834a2657ed` | `cls_prm_4930880649ff0f33` | `NULL` (intacto) |

---

## 6. Registro de Auditoría — Sublote C3-Surbalin (`5` Variantes — `DESIGN` / `UNCOATED` / `TEXTURED`)

| # | `variant_id` | `product_id` | Producto Comercial | GSM | Transición `category` | `coating_status` | `finish` | `classification_evidence_id` | `promotion_request_id` | `promotion_id` | Espesor (`caliper_um`) |
| :---: | :--- | :--- | :--- | :---: | :---: | :---: | :---: | :--- | :--- | :--- | :--- |
| 45 | `var_46649397a7a4f0d8` | `prod_1866a6672ad6633b` | Surbalin Glatt 6161 Karminrot 115g 70x10... | 115 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `TEXTURED` | `evd_cls_5a60dbb1bc9d19cb` | `cls_req_61875eeb84f0fe95` | `cls_prm_a1655ab2611e357b` | `NULL` (intacto) |
| 46 | `var_9767698cd4fb3086` | `prod_3f0b90bb93ecb8ff` | Surbalin Glatt 6243 Jadegrün 115 70x100 | 115 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `TEXTURED` | `evd_cls_0329ac2b7ed99333` | `cls_req_989fe3032d174112` | `cls_prm_4cd71bfee4bf4964` | `NULL` (intacto) |
| 47 | `var_690046f157ace324` | `prod_ffc430dff4720953` | Surbalin glatt black 6199 115 70x100 | 115 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `TEXTURED` | `evd_cls_b72108713ccd61ef` | `cls_req_9398eea7213b7f26` | `cls_prm_ab32746787be5f15` | `NULL` (intacto) |
| 48 | `var_2667911c324a3c39` | `prod_c6040cd049a9e05a` | Surbalin LINEA 5060/ Kirschrot 135 70 x1... | 135 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `TEXTURED` | `evd_cls_95317480c317cbfa` | `cls_req_c2fd04ab90a0922b` | `cls_prm_14df3fa2241ce41a` | `NULL` (intacto) |
| 49 | `var_e79ad5686a388205` | `prod_97c8437ed473d496` | Surbalin Linea mandarin 115 70x100 FSC | 115 | `OTHER` -> **`DESIGN`** | `UNCOATED` | `TEXTURED` | `evd_cls_68ad1bd9dd1d46a7` | `cls_req_88c3a77e7e4519c5` | `cls_prm_f07488b35689b2d0` | `NULL` (intacto) |

---

## 7. Balance de Clasificaciones Pendientes Restantes (`161` de `337`)

| Lote / Grupo Funcional | Variantes Iniciales (`OTHER`) | Acreditadas Acumuladas | Pendientes Restantes (`OTHER`) | Estado |
| :--- | :---: | :---: | :---: | :--- |
| **Batch C1** (`G2_OFFSET` [65] + `G3_COATED` [12]) | `77` | **`77`** | `0` | **100% ACREDITADO (C1)** |
| **Batch C2** (`G4_BOARD` [27] + `G6_LUXLINE` [10]) | `37` | **`37`** | `0` | **100% ACREDITADO (C2)** |
| **Batch C3** (`G1_CASE_BINDING_COVERING_MATERIALS`) | `62` | **`62`** | `0` | **100% ACREDITADO (C3)** |
| **Batch C4** (`G5_FINE_ART_AND_DESIGN_PAPERS`) | `97` | `0` | **`97`** | En cola (Pop'Set, Sirio Color, Keaykolour, Materica, Tintoretto, Rives, Splendorgel, Old Mill, etc.) |
| **Batch C5** (`G6_SPECIALTY_SYNTHETIC_AND_LABELS` — resto sin Luxline) | `64` | `0` | **`64`** | En cola (Adhestor, Polyart, Synaps, Gmund Bio Cycle, Vegetal, etc.) |
| **TOTALES** | **`337`** | **`176`** (`52,23%`) | **`161`** (`47,77%`) | **176 promovidas / 161 pendientes** |
