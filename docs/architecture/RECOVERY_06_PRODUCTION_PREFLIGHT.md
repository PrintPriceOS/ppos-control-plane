# ORDEN PAPER-MATERIALS-RECOVERY-06 — Informe de Preflight Productivo y Simulación Previa (Fase 1)

**Proyecto:** PrintPrice OS  
**Entorno:** Producción — MySQL `Control` (`212.227.79.67`)  
**Repositorio:** `PrintPriceOS/ppos-control-plane`  
**PR de Referencia:** [PR #14](https://github.com/PrintPriceOS/ppos-control-plane/pull/14) (`feat/paper-materials-recovery-05`)  
**Commit Autorizado:** `35b39aa2b97c59fc584f9c54bbeb1d40275638b9`  
**Timestamp de Ejecución Preflight:** `2026-10-28T23:01:06.903Z`  
**Resultado de Fase 1:** **`PREFLIGHT_PASS — 0 DERIVACIONES CAS · 0 ESCRITURAS CONCURRENTES`**

---

## 1. Verificación del Estado Real de Producción (MySQL `Control`)

Antes de abrir cualquier transacción de escritura, el script de preflight (`preflight_recovery_06.cjs`) verificó directamente contra MySQL `Control` todos los invariantes exigidos en la Fase 1:

| Invariante / Métrica Productiva | Valor Esperado | Valor Real en MySQL `Control` | Estado |
| :--- | :---: | :---: | :---: |
| **Total variantes en `paper_variants`** | `1.524` | **`1.524`** | `PASS` |
| **Total productos en `paper_products`** | `1.522` | **`1.522`** | `PASS` |
| **Variantes con espesor presente (`caliper_um > 0`)** | `1.171` | **`1.171`** (`76,84 %`) | `PASS` |
| **Variantes con espesor ausente (`caliper_um IS NULL`)** | `353` | **`353`** (`23,16 %`) | `PASS` |
| **Conflictos históricos protegidos (`LIVONIA_REFERENCE_IMPORT`)** | `9` | **`9`** (`CONFLICT_PRESERVED`) | `PASS` |
| **Variantes con `caliper_confidence_status = 'VERIFIED'`** | `0` | **`0`** | `PASS` |
| **Variantes con `grain_direction != 'UNKNOWN'`** | `2` | **`2`** (`var_12e73b58b1b95990`, `var_bc3a9bd54f4c8b38`) | `PASS` |
| **Ofertas comerciales en `supplier_paper_offers`** | `2` | **`2`** (`Checksum: 3737849396`) | `PASS` |
| **Procesos de escritura concurrentes (`SHOW FULL PROCESSLIST`)** | `0` | **`0`** (`activeWritesCount = 0`) | `PASS` |

---

## 2. Integridad Criptográfica de las Matrices del Commit `35b39aa2`

Se verificaron las huellas SHA-256 de las tres matrices certificadas en `PAPER-MATERIALS-RECOVERY-05V` desplegadas para la ejecución:

- [`docs/architecture/RECOVERY_05V_MANUFACTURER_EVIDENCE.csv`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/docs/architecture/RECOVERY_05V_MANUFACTURER_EVIDENCE.csv):
  - SHA-256: `50da622dc3ce7819c97414eb6d6000bfb64ef373d15659e07507bc593d615a25` (`112` filas totales $\to$ **`5` acreditadas**, `107` `DOCUMENTATION_REQUIRED`).
- [`docs/architecture/RECOVERY_05V_SIBLING_CALIPER_VALIDATION.csv`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/docs/architecture/RECOVERY_05V_SIBLING_CALIPER_VALIDATION.csv):
  - SHA-256: `49cabcc83e142c8133e62f993630bca9500df0f93b31ea333b8713f1d205604e` (`67` filas totales $\to$ **`60` acreditadas**, `7` rechazadas).
- [`docs/architecture/RECOVERY_05V_CLASSIFICATION_EVIDENCE.csv`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/docs/architecture/RECOVERY_05V_CLASSIFICATION_EVIDENCE.csv):
  - SHA-256: `c7b4c36cd5732536a4cd7d1b43bd5cc046925b9e12b112bdd050b73c73fa53b6` (`363` filas totales $\to$ **`185` acreditadas**: `176` Grupo A + `9` Grupo C; `176` `DOCUMENTATION_REQUIRED`; `2` `CONFLICT_HOLD`).

---

## 3. Estado Previo de los 9 Conflictos Históricos (`CALIPER_PRESENT_SOURCE_CONFLICT`)

Los **9 conflictos históricos** (`caliper_source = 'LIVONIA_REFERENCE_IMPORT'`) se verificaron en vivo antes de la ejecución:

1. `var_2b0314c68f5a97c7` (*Amber Graphic 100 102x72*, `100g`, `1020x720`): `122.00 µm` (`LIVONIA_REFERENCE_IMPORT`, `REFERENCE_IMPORTED`)
2. `var_7b7e3a2a2a4a0313` (*Amber Graphic 100 64x90 FSC*, `100g`, `640x900`): `122.00 µm` (`LIVONIA_REFERENCE_IMPORT`, `REFERENCE_IMPORTED`)
3. `var_4178aecbfa53dcf8` (*Amber Graphic 100 72x102 FSC*, `100g`, `720x1020`): `122.00 µm` (`LIVONIA_REFERENCE_IMPORT`, `REFERENCE_IMPORTED`)
4. `var_c699e6a51cd6b41f` (*Amber Graphic 100 88x63*, `100g`, `880x630`): `122.00 µm` (`LIVONIA_REFERENCE_IMPORT`, `REFERENCE_IMPORTED`)
5. `var_5f5cae75e6f45671` (*Amber Graphic 100 90x64 FSC*, `100g`, `900x640`): `122.00 µm` (`LIVONIA_REFERENCE_IMPORT`, `REFERENCE_IMPORTED`)
6. `var_ae7dbf443ceab19a` (*Galerie Art Matt 250 46x64 FSC*, `250g`, `460x640`): `225.00 µm` (`LIVONIA_REFERENCE_IMPORT`, `REFERENCE_IMPORTED`)
7. `var_9dabfd7ac5eff6ca` (*Galerie Art Matt 250 64x90 FSC*, `250g`, `640x900`): `225.00 µm` (`LIVONIA_REFERENCE_IMPORT`, `REFERENCE_IMPORTED`)
8. `var_06e1d1681e4f0989` (*Galerie Art Matt 250 72x102 FSC*, `250g`, `720x1020`): `225.00 µm` (`LIVONIA_REFERENCE_IMPORT`, `REFERENCE_IMPORTED`)
9. `var_e2f2e68304e9d4a1` (*Galerie Art Matt 250 90x64 FSC*, `250g`, `900x640`): `225.00 µm` (`LIVONIA_REFERENCE_IMPORT`, `REFERENCE_IMPORTED`)

---

## 4. Simulación Previa Compare-and-Swap (CAS) sobre las 234 Variantes

- **Espesores acreditados por formato hermano (`D1`)**: `60` (`60/60` con `caliper_um IS NULL` en vivo).
- **Espesores acreditados por fuente técnica archivada (`D2`)**: `5` (`5/5` con `caliper_um IS NULL` en vivo).
- **Total espesores acreditados**: **`65`** (`0` solapamientos con los 9 conflictos históricos).
- **Clasificaciones acreditadas Grupo A**: `176`.
- **Clasificaciones acreditadas Grupo C**: `9`.
- **Total clasificaciones acreditadas**: **`185`** (`185/185` con `grain_direction = 'UNKNOWN'` y `0` productos compartidos).
- **Solapamiento (variantes con clasificación y espesor acreditados simultáneamente)**: **`16`**.
- **Total variantes únicas a actualizar**: **`234`** (`185 + 65 - 16 = 234`).
- **Derivas detectadas (`casDriftsCount`)**: **`0`**.

