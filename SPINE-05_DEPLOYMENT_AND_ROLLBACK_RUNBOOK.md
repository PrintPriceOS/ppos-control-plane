# SPINE-05 — Runbook de Activación Controlada, Respaldo y Rollback en Producción

**Misión:** `SPINE-05 — CONTROL PLANE PRODUCTION READINESS`  
**Repositorio:** `PrintPriceOS/ppos-control-plane`  
**Estado de Ejecución:** **PREPARADO — PENDIENTE DE AUTORIZACIÓN DE DESPLIEGUE** (No ejecutado en producción).

---

## 1. Pre-Checks y Respaldo Obligatorio antes de Ejecutar Migraciones (`172` y `173`)

Antes de aplicar cualquier cambio en el servidor de producción de Control Plane:

```bash
set -euo pipefail

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_DIR="/var/backups/ppos-control-plane/spine-05-${TIMESTAMP}"
mkdir -p "${BACKUP_DIR}"
chmod 700 "${BACKUP_DIR}"

# 1. Verificar conectividad a MySQL y estado actual de paper_variants y schema_migrations
mysql -u "${DB_USER}" -p"${DB_PASSWORD}" -h "${DB_HOST}" "${DB_NAME}" -e "
  SELECT COUNT(*) AS total_variants,
         SUM(CASE WHEN caliper_um IS NOT NULL THEN 1 ELSE 0 END) AS variants_with_caliper
  FROM paper_variants;
  SELECT version, applied_at FROM schema_migrations WHERE version IN ('163', '168', '170', '171', '172', '173');
" > "${BACKUP_DIR}/pre_migration_counts.txt"

# 2. Volcado íntegro (estructura + datos) de las tablas afectadas con verificación de salida
mysqldump --single-transaction --routines --triggers \
  -u "${DB_USER}" -p"${DB_PASSWORD}" -h "${DB_HOST}" "${DB_NAME}" \
  paper_products paper_variants order_quote_revisions order_effective_technical_specifications schema_migrations \
  | gzip -c > "${BACKUP_DIR}/pre_spine05_tables.sql.gz"

gzip -t "${BACKUP_DIR}/pre_spine05_tables.sql.gz"
sha256sum "${BACKUP_DIR}/pre_spine05_tables.sql.gz" > "${BACKUP_DIR}/pre_spine05_tables.sql.gz.sha256"
```

---

## 2. Procedimiento de Activación Controlada (Cuando sea Autorizado)

```bash
set -euo pipefail

# 1. Verificar integridad criptográfica de las 176 migraciones (incluyendo 172 y 173)
npm run migration:integrity

# 2. Aplicar migraciones pendientes (172 y 173) mediante el runner oficial
npm run migrate

# 3. Verificar columnas aditivas en paper_variants y los 375 pares en paper_technical_caliper_reference
mysql -u "${DB_USER}" -p"${DB_PASSWORD}" -h "${DB_HOST}" "${DB_NAME}" -e "
  SHOW COLUMNS FROM paper_variants LIKE 'caliper_%';
  SELECT COUNT(*) AS livonia_reference_rows, COUNT(DISTINCT block_index) AS livonia_blocks
  FROM paper_technical_caliper_reference;
  SHOW TABLES LIKE 'spine_%';
"

# 4. Reiniciar el servicio de Control Plane y verificar /api/v1/spine/profiles
pm2 reload ppos-control-plane --update-env
```

---

## 3. Procedimiento de Rollback No Destructivo (Cero Pérdida de Datos Comerciales)

Dado que las migraciones `172` y `173` son **estrictamente aditivas** y no modifican ningún valor existente de `paper_variants`:

### Nivel 1 — Rollback de Aplicación (Instantáneo, `< 30 s`)
Si se detecta cualquier anomalía en las rutas `/api/v1/spine/*`:
1. Revertir el contenedor/proceso de Control Plane al commit previo (`564a50bceba06a6cc76bbbc6be4d091629f478eb`).
2. Las columnas aditivas de `paper_variants` (`bulk_factor`, `caliper_source`, `caliper_confidence_status`, `caliper_verified_at`, `caliper_verified_by`, `caliper_revision`) tienen valores `NULL` o `DEFAULT` y son ignoradas de forma transparente por las versiones anteriores.
3. En Budget App, el BFF recibe `404` de `/api/v1/spine/*` y activa automáticamente la guarda gobernada `SPINE_NOT_AVAILABLE` (`HTTP 503`) sin afectar la cotización económica de BPE.

### Nivel 2 — Rollback de Esquema SQL (`173` y `172`)
Si se requiere revertir explícitamente las tablas y columnas de `172` y `173`:

```sql
-- Rollback de Migración 173
DROP TABLE IF EXISTS spine_calculation_snapshots;
DROP TABLE IF EXISTS spine_binding_profiles;
DELETE FROM schema_migrations WHERE version LIKE '173%';

-- Rollback de Migración 172 (preservando paper_variants y sus 1.524 variantes)
DROP TABLE IF EXISTS paper_caliper_reconciliation_candidates;
DROP TABLE IF EXISTS paper_technical_caliper_reference;

ALTER TABLE paper_variants
    DROP COLUMN caliper_revision,
    DROP COLUMN caliper_verified_by,
    DROP COLUMN caliper_verified_at,
    DROP COLUMN caliper_confidence_status,
    DROP COLUMN caliper_source,
    DROP COLUMN bulk_factor,
    MODIFY COLUMN caliper_um INT NULL;

DELETE FROM schema_migrations WHERE version LIKE '172%';
```
