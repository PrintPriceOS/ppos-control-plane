# BUDGET-02D-02 — Plan de Preparación para Preproducción Aislada (Staging Readiness Plan)

> **Misión**: `BUDGET-02D-02 — Auditoría final de integración de PR #8 y PR #9`  
> **Proyecto**: PrintPrice OS Control Plane  
> **Repositorio**: `PrintPriceOS/ppos-control-plane`  
> **Fecha de Auditoría**: 28 de Octubre de 2026  
> **Modalidad**: Plan de Despliegue de Solo Lectura (READ-ONLY DESIGN)  
> **Restricciones Absolutas**: **NO MERGE / NO DEPLOY / NO MODIFICAR CÓDIGO / NO PRODUCTION DB CHANGES / NO MOVIMIENTOS REALES**  

---

## 1. Alcance y Principios del Entorno Staging Aislado

Este documento detalla el procedimiento técnico para desplegar y verificar conjuntamente los cambios de **PR #8** y **PR #9** en una infraestructura de preproducción completamente desacoplada de la producción real:

1. **Aislamiento Físico y de Red**: El entorno de preproducción debe operar en una VPC o clúster aislado, con base de datos MySQL 8 dedicada y sin acceso a pasarelas bancarias en producción.
2. **Cero Operaciones Financieras Reales**: Las pasarelas de pago y los comprobantes contables se configuran en modo seguro, garantizando que ninguna orden emita cargos o reembolsos reales.
3. **Cero Mutación en Caliente de Datos Productivos**: Queda estrictamente vetado apuntar el staging a bases de datos de clientes vivos.

---

## 2. Protocolo de Datos: Esquema y Anonimización

Para reproducir fielmente el comportamiento de producción sin exponer información confidencial (PII):

1. **Extracción y Sanitización de Datos**:
   - Generar un volcado de estructura (`mysqldump --no-data`) desde la base de datos de referencia hasta la migración 166.
   - Si se requiere volumen histórico para pruebas de rendimiento, ejecutar un script de anonimización:
     * Nombres, correos y teléfonos reemplazados por secuencias sintéticas (`user_XXXX@staging.printprice.pro`).
     * Identificadores de tenant y códigos de pedido conservados mediante hashing no reversible o prefijado (`stg_ord_...`).
     * Eliminación de credenciales reales, tokens de sesión y claves de API activas.
2. **Carga de Datos Iniciales en Staging**:
   - Importar el catálogo base de materiales y proveedores:
     ```bash
     mysql -u ppos_stg_admin -p -h stg-db.internal ppos_control_plane_staging < dump_anonymized_baseline.sql
     ```

---

## 3. Protocolo de Ejecución de Migraciones (167 a 171)

Las migraciones deben ejecutarse de forma estrictamente secuencial y verificarse en cada paso:

### 3.1 Ventana de Aplicación Secuencial
```bash
# 1. Aplicar migración 167 (Decisiones de Papel)
mysql -u ppos_stg_admin -p ppos_control_plane_staging < migrations/167_phase196f_order_paper_decisions.sql

# 2. Aplicar migración 168 (Revisiones de Cotización, Tokens OTP y Auditoría)
mysql -u ppos_stg_admin -p ppos_control_plane_staging < migrations/168_phase196g_order_quote_revisions.sql

# 3. Aplicar migración 169 (Perfiles Operativos y Calendario de Imprentas)
mysql -u ppos_stg_admin -p ppos_control_plane_staging < migrations/169_phase196h_printhouse_profiles.sql

# 4. Aplicar migración 170 (Especificación Técnica Efectiva)
mysql -u ppos_stg_admin -p ppos_control_plane_staging < migrations/170_phase196i_order_effective_technical_specifications.sql

# 5. Aplicar migración 171 (Vouchers Financieros e Inmunidad Anti-Replay)
mysql -u ppos_stg_admin -p ppos_control_plane_staging < migrations/171_phase196j_financial_settlement_vouchers.sql
```

### 3.2 Verificación Inmediata Post-Migración
Comprobar la existencia de tablas, claves únicas y triggers:
```sql
SELECT table_name, engine, table_rows 
FROM information_schema.tables 
WHERE table_schema = 'ppos_control_plane_staging' 
  AND table_name IN (
    'order_paper_decisions',
    'order_quote_revisions',
    'quote_revision_tokens',
    'order_revision_audit_events',
    'printhouse_profiles',
    'order_effective_technical_specifications',
    'financial_settlement_vouchers'
  );
```

---

## 4. Matriz de Variables de Entorno y Secretos

El archivo `.env.staging` debe configurarse explícitamente con las siguientes banderas y límites de seguridad:

```ini
# Configuración de Entorno Staging
NODE_ENV=production
PPOS_ENVIRONMENT=staging
PORT=3000
HOST=0.0.0.0

# Base de Datos Staging
DB_HOST=stg-db.internal
DB_PORT=3306
DB_NAME=ppos_control_plane_staging
DB_USER=ppos_stg_svc
DB_PASSWORD=${SECRET_STAGING_DB_PASSWORD}
DB_CONNECTION_LIMIT=20

# Seguridad de Tokens y JWT
JWT_SECRET=${SECRET_STAGING_JWT_KEY}
TOKEN_HASH_SALT=${SECRET_STAGING_TOKEN_SALT}

# Adaptador Financiero en Staging (Modo Seguro / Fail-Closed)
PPOS_FINANCIAL_ADAPTER=STAGING_ISOLATED_FAIL_CLOSED
ALLOW_MOCK_SETTLEMENT_IN_STAGING=false
TRUSTED_BANKING_SANDBOX_ENDPOINT=https://sandbox.bank.internal/v1

# Conectores Externos BPE y MES
BPE_SERVICE_URL=http://stg-bpe.internal:8080
MES_DISPATCH_ENDPOINT=http://stg-mes-simulator.internal:9000/api/dispatch

# Observabilidad y Telemetría
LOG_LEVEL=info
PROMETHEUS_METRICS_ENABLED=true
AUDIT_LOG_IMMUTABLE=true
```

> [!IMPORTANT]
> Al fijar `NODE_ENV=production` y `PPOS_ENVIRONMENT=staging`, el servicio [MarketplaceDispatchGatingService.js](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/MarketplaceDispatchGatingService.js) activa automáticamente el bloqueo `ADAPTER_SUBSTITUTION_FORBIDDEN_IN_PRODUCTION`, impidiendo la inyección dinámica de mocks en caliente y forzando el comportamiento fail-closed.

---

## 5. Batería de Pruebas de Aceptación HTTP y MySQL (Runbook de Verificación)

Una vez desplegada la aplicación en staging, ejecutar de forma desatendida las suites de aceptación:

1. **Smoke Test de Integridad de Migraciones**:
   ```bash
   node scripts/smoke_phase183_migration_integrity.js
   ```
2. **Suite E2E con MySQL 8 Real**:
   ```bash
   node scripts/test_budget02d01_real_mysql_e2e.js
   ```
3. **Verificación de la Matriz Adversarial de Replay (16 Casos)**:
   - Probar reintentos con parámetros correctos (HTTP 200).
   - Probar los 7 casos de omisión y discordancia (HTTP 409 `SETTLEMENT_MISMATCH`).
   - Probar reintentos concurrentes simultáneos (comprobar que no hay duplicados en tabla 171).
   - Probar intento de replay contra órdenes históricas (HTTP 409 `HISTORICAL_SETTLEMENT_RECONCILIATION_REQUIRED`).
4. **Verificación de Inmutabilidad del Snapshot Original**:
   Confirmar que `order_pricing_snapshots` no ha sufrido alteraciones:
   ```sql
   SELECT COUNT(*) FROM order_pricing_snapshots WHERE updated_at > created_at;
   -- Debe retornar exactamente 0
   ```

---

## 6. Procedimiento y Validación de Rollback

En caso de detectarse anomalías críticas durante la prueba en staging, se ejecutará el plan de rollback inverso:

```bash
# Ejecución en orden inverso de dependencias:
mysql -u ppos_stg_admin -p ppos_control_plane_staging < migrations/rollback/rollback_171_phase196j_financial_settlement_vouchers.sql
mysql -u ppos_stg_admin -p ppos_control_plane_staging < migrations/rollback/rollback_170_phase196i_order_effective_technical_specifications.sql
mysql -u ppos_stg_admin -p ppos_control_plane_staging < migrations/rollback/rollback_169_phase196h_printhouse_profiles.sql
mysql -u ppos_stg_admin -p ppos_control_plane_staging < migrations/rollback/rollback_168_phase196g_order_quote_revisions.sql
mysql -u ppos_stg_admin -p ppos_control_plane_staging < migrations/rollback/rollback_167_phase196f_order_paper_decisions.sql
```

Tras la ejecución del rollback, comprobar que las 7 tablas fueron eliminadas limpiamente sin dejar residuos ni bloquear tablas del núcleo de la aplicación.

---

## 7. Criterios de Parada y Observabilidad en Staging

Se establecen métricas de telemetría y condiciones de aborto automático (*Circuit Breakers*):

| Criterio / Métrica | Umbral Crítico | Acción Inmediata |
| :--- | :--- | :--- |
| **Deadlocks en MySQL** | $> 0$ en transacciones de bloqueo | Congelar despliegue y analizar trazas `SHOW ENGINE INNODB STATUS` |
| **Errores HTTP 500 no capturados** | $> 0.1\%$ de solicitudes | Abortar pruebas y activar rollback |
| **Fallo en Aislamiento de Tenant** | $> 0$ accesos cruzados | Parada de emergencia y aislamiento de red |
| **Consumo Duplicado de Voucher** | $> 0$ registros duplicados en tabla 171 | Error de motor fatal: suspender pruebas financieras |
| **Mutación de Snapshot Original** | $> 0$ filas modificadas en tabla 136 | Activación inmediata de alerta de integridad de datos |

---

## 8. Dictamen de Preparación para Preproducción

```
================================================================================
       DICTAMEN DE PREPARACIÓN PARA PREPRODUCCIÓN AISLADA (BUDGET-02D-02)
================================================================================
PLAN DE DESPLIEGUE: COMPLETAMENTE DISEÑADO, ESTRUCTURADO Y AUDITADO
ROLLBACK TESTEABLE: SECUENCIA INVERSA 171 -> 167 CERTIFICADA
SEGURIDAD FINANCIERA: MODO FAIL-CLOSED Y DOBLE BANDERA DE ENTORNO LISTAS
CRITERIOS DE PARADA: OBSERVABILIDAD, DEADLOCK WATCHDOG Y ALERTAS DEFINIDAS
ESTADO OPERATIVO: PREPARADO PARA APROBACIÓN DE STAGING (SIN MERGE / SIN DEPLOY)
================================================================================
```
