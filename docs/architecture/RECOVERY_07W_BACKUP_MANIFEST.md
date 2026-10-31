# PAPER-MATERIALS-RECOVERY-07W — Manifiesto de Backup y Rollback Determinista

**Misión:** `PAPER-MATERIALS-RECOVERY-07W`  
**Fecha de creación del backup:** `2026-10-29T10:00:28Z`  
**Servidor de producción:** `212.227.79.67` (`MySQL Control`)  
**Directorio privado en servidor (fuera de Git):** `/opt/printprice-os/backups/paper-materials-recovery-07w/`  

---

## 1. Tabla de Backup en Base de Datos (`MySQL Control`)

Antes de iniciar la transacción de actualización sobre las 36 variantes aprobadas en Fase 1, se creó y pobló en `Control` la tabla de respaldo íntegra:

| Tabla de Respaldo | Filas | Checksum MySQL (`CHECKSUM TABLE`) | Estado |
| :--- | :---: | :---: | :---: |
| `Control.paper_variants_backup_rec07w_20261029` | `1.524` | `2275212512` (idéntico a `paper_variants` pre-07W) | `VERIFIED` |

*(Nota: `paper_products` no se modifica en `RECOVERY-07W`; su checksum `1734492320` permanece idéntico a `paper_products_backup_rec06_20261028`).*

---

## 2. Artefactos de Backup en Disco y Hashes SHA-256

Los artefactos de respaldo fueron generados directamente en `/opt/printprice-os/backups/paper-materials-recovery-07w/` (fuera del árbol Git del repositorio):

| Archivo | Ruta en Servidor | Tamaño (Bytes) | SHA-256 | Descripción |
| :--- | :--- | :---: | :--- | :--- |
| `full_catalog_1524_pre_rec07w.json` | `/opt/printprice-os/backups/paper-materials-recovery-07w/full_catalog_1524_pre_rec07w.json` | `3.032.884` | `baf3e941059501a9eaa92a06d2cd408860a5d4cc247f30fe84f875975cde0e7c` | Snapshot completo de las 1.524 variantes y sus productos antes de `RECOVERY-07W`. |
| `target_36_variants_pre_rec07w.json` | `/opt/printprice-os/backups/paper-materials-recovery-07w/target_36_variants_pre_rec07w.json` | `36.059` | `80b198d41a83f404154b196ada4ba3e246e2b9dd34e70f886d0f0d611d06f81d` | Snapshot previo específico de las 36 variantes actualizadas en `RECOVERY-07W`. |
| `rollback_paper_materials_recovery_07w_36.sql` | `/opt/printprice-os/backups/paper-materials-recovery-07w/rollback_paper_materials_recovery_07w_36.sql` | `20.320` | `52e0f61a99e9df952a94e2ab81a3c10bcbd87426e16a378e3348c6d1c495eee0` | Script SQL transaccional (`START TRANSACTION; ... COMMIT;`) para revertir exactamente las 36 variantes a su estado previo (`caliper_um = NULL`, `caliper_source = 'NONE'`, `caliper_confidence_status = 'MISSING'`, `caliper_revision = 1`, `metadata_json` previo). |

---

## 3. Procedimiento de Rollback Inmediato

En caso de requerirse reversión total de `RECOVERY-07W` al estado posterior a `RECOVERY-06`:

```bash
mysql Control < /opt/printprice-os/backups/paper-materials-recovery-07w/rollback_paper_materials_recovery_07w_36.sql
```

Tras ejecutar el rollback, el checksum de `Control.paper_variants` vuelve exactamente a `2275212512` (`1.236` variantes con caliper y `288` sin caliper).
