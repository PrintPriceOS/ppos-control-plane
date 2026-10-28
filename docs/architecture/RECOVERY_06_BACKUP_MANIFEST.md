# ORDEN PAPER-MATERIALS-RECOVERY-06 — Manifiesto de Respaldo, Checksums y Script de Rollback (Fase 2)

**Proyecto:** PrintPrice OS  
**Entorno:** Producción — MySQL `Control` (`212.227.79.67`)  
**Directorio de Respaldo en Servidor:** `/opt/printprice-os/backups/paper-materials-recovery-06/`  
**Timestamp de Respaldo:** `2026-10-28T23:02:49.203Z`  

---

## 1. Tablas de Respaldo Consistentes en MySQL `Control`

Antes de ejecutar el primer lote de `PAPER-MATERIALS-RECOVERY-06`, se crearon clones íntegros de las tablas productivas en la base de datos `Control` y se verificó su coincidencia exacta de `CHECKSUM TABLE`:

| Tabla en MySQL `Control` | Filas | Checksum Pre-Ejecución (`Before`) | Checksum Post-Ejecución (`After`) | Estado |
| :--- | :---: | :---: | :---: | :--- |
| `Control.paper_products` | `1.522` | `3691516631` | `1734492320` (`185` productos actualizados) | **Actualizada selectivamente** |
| `Control.paper_products_backup_rec06_20261028` | `1.522` | `3691516631` | `3691516631` (Inmutable) | **Respaldo íntegro (`100 %` match)** |
| `Control.paper_variants` | `1.524` | `3803472582` | `2275212512` (`234` variantes actualizadas) | **Actualizada selectivamente** |
| `Control.paper_variants_backup_rec06_20261028` | `1.524` | `3803472582` | `3803472582` (Inmutable) | **Respaldo íntegro (`100 %` match)** |
| `Control.supplier_paper_offers` | `2` | `3737849396` | `3737849396` (Inmutable) | **Cero cambios comerciales** |
| `Control.paper_technical_caliper_reference` | `375` | `2847849606` | `2847849606` (Inmutable) | **Intacta** |
| `Control.paper_caliper_reconciliation_candidates` | `1.224` | `3402454981` | `3402454981` (Inmutable) | **Intacta** |
| `Control.paper_products_backup_rec03_20261028` | `1.522` | `2180808459` | `2180808459` (Inmutable) | **Respaldo histórico `03/04` intacto** |
| `Control.paper_variants_backup_rec03_20261028` | `1.524` | `866434577` | `866434577` (Inmutable) | **Respaldo histórico `03/04` intacto** |

---

## 2. Manifiesto SHA-256 de Archivos de Snapshot y Rollback en Disco

Los siguientes artefactos fueron generados y verificados criptográficamente en `/opt/printprice-os/backups/paper-materials-recovery-06/` antes de iniciar la escritura por lotes:

| Archivo en Servidor (`212.227.79.67`) | Contenido | Tamaño (Bytes) | Huella Criptográfica SHA-256 |
| :--- | :--- | :---: | :--- |
| `full_catalog_1524_pre_rec06.json` | Snapshot JSON completo de las `1.524` variantes y `1.522` productos previo a `RECOVERY-06`. | `2.891.100` | `fc433512dcbd54484857a730e60e7745f96c7c43d0ded6bcad854e5fdba9a378` |
| `target_234_variants_pre_rec06.json` | Snapshot JSON específico de las `234` variantes acreditadas previo a `RECOVERY-06`. | `310.124` | `be2a4b6d6a8db1654eb7b29fbbdcb54367efc07f083d113eda7052902dd1e76e` |
| `rollback_paper_materials_recovery_06_234.sql` | Script SQL transaccional (`START TRANSACTION; ... COMMIT;`) que restaura exactamente las `234` variantes y `185` productos a su estado previo. | `210.538` | `380be04f81afbfd701cfb8d478287e48bcc9c3c25332b83854a511b518bbbe04` |

---

## 3. Procedimiento de Reversión Determinista (En Caso de Contingencia)

En caso de requerirse la reversión de las 234 variantes al estado inmediatamente posterior a `RECOVERY-04`:

```bash
mysql -u controlplane -p Control < /opt/printprice-os/backups/paper-materials-recovery-06/rollback_paper_materials_recovery_06_234.sql
```

Tras ejecutar el script, los `CHECKSUM TABLE` de `Control.paper_products` y `Control.paper_variants` volverán exactamente a `3691516631` y `3803472582`.

