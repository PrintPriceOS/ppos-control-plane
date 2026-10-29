# RECOVERY_11_PRODUCTION_DEPLOYMENT_REPORT — Despliegue Productivo Gobernado de RECOVERY-11

**Misión:** `RECOVERY-11-PROD — DESPLIEGUE INMEDIATO`  
**Prioridad:** ALTA — Entrega funcional para presentación a testers  
**Servidor Productivo:** `212.227.79.67` (`cool-shtern.212-227-79-67.plesk.page`)  
**Ruta de Aplicación:** `/opt/printprice-os/ppos-control-plane`  
**Proceso PM2:** `ppos-control-plane` (`pm_id: 0`, API en `127.0.0.1:8081`)  
**Frontend Document Root:** `/var/www/vhosts/printprice.pro/control.printprice.pro/httpdocs/`  
**Base de Datos:** MySQL `Control` (`8.0.46-0ubuntu0.24.04.4`)  
**Commit Certificado Desplegado:** `ca19230620b8ba262cc8f8fb871a47d1ae59c4ad`  
**URL Verificada:** `https://control.printprice.pro/supplier/catalog`  
**Dictamen Final:** **`RECOVERY_11_PRODUCTION_PASS`**

---

## 1. Preflight Productivo (`212.227.79.67`)

Ejecutado antes de realizar cualquier cambio sobre el servidor productivo (`2026-10-29T15:30:08.030Z`):

| Comprobación | Valor Observado en Producción | Estado |
| :--- | :--- | :---: |
| **Commit previo en `/opt/printprice-os/ppos-control-plane`** | `3ec340cf3d616245d366ca899b3119cf9231a76c` (`git status --short` limpio) | **PASS** |
| **Estado de PM2 (`ppos-control-plane`)** | `pm_id: 0`, `pid: 3800466`, `status: online`, usuario efectivo `root` | **PASS** |
| **Salud API (`127.0.0.1:8081/live` y `/ready`)** | `{"status":"UP"}` / `{"status":"READY","service":"ppos-control-plane","schema":{"status":"READY","manifestVersion":1}}` | **PASS** |
| **Operaciones DDL/DML concurrentes (`SHOW PROCESSLIST`)** | `0` (`activeDdlOrDmlCount: 0`) | **PASS** |
| **Migración 174 en `Control.schema_versions`** | `174_phase197c_paper_evidence_and_technical_accreditation` (`state: APPLIED`, `checksum: d1a400efe6962f0ff88beb7114ed1bb8603fff74ea7b4aa840c6ec64025e7144`, `applied_at: 2026-10-29T12:15:54.000Z`) | **PASS** |
| **Nuevas migraciones ejecutadas en `RECOVERY-11-PROD`** | **`0`** (Prohibido repetir o añadir migraciones) | **PASS** |
| **Conteos de catálogo (`paper_variants`)** | `total_variants = 1524`, `with_caliper = 1272`, `missing_caliper = 252` | **PASS** |
| **9 Conflictos históricos protegidos** | `9` (`5` Amber Graphic @ `122.00 µm` + `4` Galerie Art Matt @ `225.00 µm`, todos con `LIVONIA_REFERENCE_IMPORT` y `REFERENCE_IMPORTED`) | **PASS** |
| **Checksums previos (`CHECKSUM TABLE`)** | `paper_products = 1734492320`, `paper_variants = 2093607442`, `supplier_paper_offers = 3737849396` | **PASS** |

---

## 2. Backup Productivo y Manifiesto `SHA-256`

Antes de actualizar el árbol de trabajo o publicar el frontend, se creó el snapshot completo fuera del repositorio en `/var/backups/ppos/paper_materials_recovery_11_20261029T153000Z` (permisos `0700` en directorio y `0600` en archivos, usando archivo temporal `--defaults-extra-file` eliminado inmediatamente tras `mysqldump`, `tempCredentialsFileDeleted: true`):

| Artefacto de Respaldo | Ruta en `212.227.79.67` | Tamaño (Bytes) | `SHA-256` | Verificación |
| :--- | :--- | ---: | :--- | :---: |
| **Snapshot MySQL (`Control`)** | `/var/backups/ppos/paper_materials_recovery_11_20261029T153000Z/paper_catalog_and_evidence_pre_recovery11.sql` | `3,066,185` | `a28f7527bd962fbc87e43406c143b097a5ae810d515eb88494d835c2a8def970` | `OK` (`Dump completed`) |
| **Snapshot Ejecutable (`3ec340cf`)** | `/var/backups/ppos/paper_materials_recovery_11_20261029T153000Z/control_plane_exec_3ec340cf_pre_recovery11.tar.gz` | `27,163,994` | `7605c649e22f0b05ccb97fce41f8f26933404d0455a7ce3b82094a401f7678db` | `OK` (`4,725` entradas) |
| **Snapshot Frontend (`httpdocs`)** | `/var/backups/ppos/paper_materials_recovery_11_20261029T153000Z/httpdocs_pre_recovery11.tar.gz` | `1,962,542` | `35d1790a6ddb12f36f4ac2bb93e64c0668bfc63151ac00a76d8f84e2a39b4cfc` | `OK` (`13` entradas) |

Salida de `sha256sum -c /var/backups/ppos/paper_materials_recovery_11_20261029T153000Z/SHA256SUMS.manifest`:
```text
/var/backups/ppos/paper_materials_recovery_11_20261029T153000Z/paper_catalog_and_evidence_pre_recovery11.sql: OK
/var/backups/ppos/paper_materials_recovery_11_20261029T153000Z/control_plane_exec_3ec340cf_pre_recovery11.tar.gz: OK
/var/backups/ppos/paper_materials_recovery_11_20261029T153000Z/httpdocs_pre_recovery11.tar.gz: OK
```

---

## 3. Despliegue de `ca19230620b8ba262cc8f8fb871a47d1ae59c4ad` y Estado de PM2

1. **Checkout Exacto**: `git fetch origin feat/paper-materials-recovery-11 && git checkout -f ca19230620b8ba262cc8f8fb871a47d1ae59c4ad` en `/opt/printprice-os/ppos-control-plane` (`deployedHead: "ca19230620b8ba262cc8f8fb871a47d1ae59c4ad"`, `gitStatusClean: true`), conservando intactos `.env` y `/var/lib/ppos/private_evidence_store` (`0700`).
2. **Compilación y Publicación de Frontend**:
   - `npm run build` completado sin errores (`dist/assets/index-mecPbAtv.js`, `dist/assets/index-BLWu1Yyz.css`).
   - Sincronización limpia hacia `/var/www/vhosts/printprice.pro/control.printprice.pro/httpdocs/`.
3. **Recarga Exclusiva de `ppos-control-plane`**:
   - `pm2 reload ppos-control-plane --update-env && pm2 save` ejecutado con éxito (`pm_id: 0`, nuevo `pid: 3947748`, `status: online`).
   - Los demás servicios del servidor (`preflight-app`, `printprice-web`, `budget-app`) no fueron tocados.
   - **PR #11 contra `main` permanece sin fusionar (`OPEN`)**.

---

## 4. Comprobación Inmediata (`/live`, `/ready` y Navegador Real en `https://control.printprice.pro/supplier/catalog`)

### 4.1 Salud de Endpoints Productivos
- `GET http://127.0.0.1:8081/live` $\rightarrow$ `{"status":"UP"}`
- `GET http://127.0.0.1:8081/ready` $\rightarrow$ `{"status":"READY","service":"ppos-control-plane","schema":{"status":"READY","manifestVersion":1}}`
- `GET https://control.printprice.pro/supplier/catalog` $\rightarrow$ `HTTP 200 OK`
- `GET https://budget.printprice.pro/api/health` $\rightarrow$ `{"ok":true,"service":"printpricepro-bookprice","env":"production"}`

### 4.2 Verificación en Navegador Real (Playwright Chromium contra `https://control.printprice.pro/supplier/catalog`)
Se verificó en vivo la coexistencia de las pestañas **Catálogo**, **Ofertas** y **Acreditación Técnica y Metrología**, abriendo una **demostración no destructiva de vista previa del Modal de Promoción Gobernada** (`[data-testid="promotion-modal"]`) para la variante `var_dbd5357075534e3b` (`Nevia Plus C1S 80g 71my 52X72cm`):

| Idioma | Viewport | URL Verificada | Modal Promoción Abierto | Espesor Actual (`promo-current-caliper`) | Espesor Propuesto (`promo-proposed-caliper`) | `horizontalOverflowPx` | `consoleErrors` | `pageErrors` | Resultado |
| :---: | :---: | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **`ES`** | `1366x768` | `https://control.printprice.pro/supplier/catalog` | `true` | `NULL (Missing)` | `71 µm` | `0` | `0` | `0` | **PASS** |
| **`ES`** | `1280x720` | `https://control.printprice.pro/supplier/catalog` | `true` | `NULL (Missing)` | `71 µm` | `0` | `0` | `0` | **PASS** |
| **`ES`** | `390x844` | `https://control.printprice.pro/supplier/catalog` | `true` | `NULL (Missing)` | `71 µm` | `0` | `0` | `0` | **PASS** |
| **`EN`** | `1366x768` | `https://control.printprice.pro/supplier/catalog` | `true` | `NULL (Missing)` | `71 µm` | `0` | `0` | `0` | **PASS** |
| **`EN`** | `1280x720` | `https://control.printprice.pro/supplier/catalog` | `true` | `NULL (Missing)` | `71 µm` | `0` | `0` | `0` | **PASS** |
| **`EN`** | `390x844` | `https://control.printprice.pro/supplier/catalog` | `true` | `NULL (Missing)` | `71 µm` | `0` | `0` | `0` | **PASS** |
| **`DE`** | `1366x768` | `https://control.printprice.pro/supplier/catalog` | `true` | `NULL (Missing)` | `71 µm` | `0` | `0` | `0` | **PASS** |
| **`DE`** | `1280x720` | `https://control.printprice.pro/supplier/catalog` | `true` | `NULL (Missing)` | `71 µm` | `0` | `0` | `0` | **PASS** |
| **`DE`** | `390x844` | `https://control.printprice.pro/supplier/catalog` | `true` | `NULL (Missing)` | `71 µm` | `0` | `0` | `0` | **PASS** |

**Capturas de pantalla reales tomadas de `https://control.printprice.pro/supplier/catalog`:**
- Panel de Acreditación con botón `Promover a catálogo` (`ES`, `1366x768`): `rec11_prod_accreditation_panel_es_1366x768.png`
- Modal de Promoción Gobernada en Español (`ES`, `1366x768`): `rec11_prod_promotion_modal_es_1366x768.png`
- Modal de Promoción Gobernada en Inglés (`EN`, `1366x768`): `rec11_prod_promotion_modal_en_1366x768.png`
- Modal de Promoción Gobernada en Alemán (`DE`, `1366x768`): `rec11_prod_promotion_modal_de_1366x768.png`
- Modal de Promoción Gobernada en Móvil (`ES`, `390x844`): `rec11_prod_promotion_modal_es_390x844.png`

---

## 5. Regresiones Esenciales e Invarianza de Catálogo y BPE

Verificación de base de datos ejecutada **después** del despliegue y de la demostración no destructiva (`dbAfterPreview`):

| Métrica / Invariante | Pre-Despliegue (`dbPre`) | Post-Despliegue (`dbAfterPreview`) | Estado |
| :--- | ---: | ---: | :---: |
| **`total_variants` (`paper_variants`)** | `1,524` | **`1,524`** | **INTACTO** |
| **`with_caliper` (`caliper_um > 0`)** | `1,272` | **`1,272`** | **INTACTO** |
| **`missing_caliper` (`caliper_um IS NULL`)** | `252` | **`252`** | **INTACTO** |
| **9 Conflictos Históricos (`5` Amber `122 µm` + `4` Galerie `225 µm`)** | `9` (`allConflictsPreserved: true`) | **`9` (`allConflictsPreserved: true`)** | **INTACTO** |
| **`CHECKSUM TABLE Control.paper_products`** | `1734492320` | **`1734492320`** | **0 DRIFT** |
| **`CHECKSUM TABLE Control.paper_variants`** | `2093607442` | **`2093607442`** | **0 DRIFT** |
| **`CHECKSUM TABLE Control.supplier_paper_offers` (Ofertas BPE)** | `3737849396` | **`3737849396`** | **0 DRIFT** |
| **Bloqueo industrial (`canReleaseToManufacturing`)** | `false` | **`false`** | **ACTIVO** |
| **Seguimiento de seguridad (`SECURITY_ROTATION_PENDING`)** | `OPEN` | **`OPEN`** | **MANTENIDO** |

---

## 6. Dictamen Final

**`RECOVERY_11_PRODUCTION_PASS`**
