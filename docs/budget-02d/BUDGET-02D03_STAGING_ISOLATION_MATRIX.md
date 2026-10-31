# BUDGET-02D-03 — Matriz de Aislamiento y Dependencias para Preproducción

> **Misión**: `MISIÓN BUDGET-02D-03 — Preflight operativo de preproducción aislada`  
> **Proyecto**: PrintPrice OS Control Plane  
> **Repositorio**: `PrintPriceOS/ppos-control-plane`  
> **Fecha de Emisión**: 28 de Octubre de 2026  
> **Modalidad**: Matriz Operativa READ-ONLY  
> **Restricciones Absolutas**: **NO MERGE / NO DEPLOY / NO MODIFICAR PRODUCCIÓN / NO EJECUTAR MIGRACIONES EN SERVIDORES ACTIVOS / NO OPERACIONES FINANCIERAS REALES**  

---

## 1. Matriz de Dependencias y Commits Mandatorios para Preproducción

Para que la futura versión de preproducción reproduzca con fidelidad absoluta los acuerdos técnicos, el paquete de despliegue debe consolidar la siguiente secuencia lineal de commits:

| Componente / Hito | Rama de Origen | Commit SHA Certificado | Contenido Técnico Aportado |
| :--- | :--- | :--- | :--- |
| **Línea Base Catálogo** | `feat/budget-01-marketplace-paper-catalog` | `a378ff534125cb2f3ed6b4c016388bda2035254a` | Catálogo maestro de papeles, variantes y relaciones de proveedor. |
| **PR #8 (Cierre R4V)** | `feat/budget-02c01-quote-revisions` | `744bdd89676c92de2c612152e1be58fe48698fd9` | Decisiones de papel (167), revisiones de cotización (168), perfiles (169), tokens OTP y sellado BPE. |
| **PR #9 (Cierre R5F)** | `feat/budget-02d01-e2e-remediation` | `985421abc725221e73e666d9a112dd24c2b7efe0` | Especificaciones efectivas (170), vouchers contables (171), contrato de replay de 8 dimensiones y suite adversarial. |
| **Documentación y Auditoría** | `feat/budget-02d01-e2e-remediation` | `d7e99355c2c2f44b316eaf66ca8db298186dee05` | Informes de auditoría de integración cruzada BUDGET-02D-02 y dictamen formal. |

### 1.1 Orden de Integración Recomendado para Preproducción
1. **Paso 1**: Incorporación de `feat/budget-01-marketplace-paper-catalog` a la rama de integración staging.
2. **Paso 2**: Incorporación secuencial de PR #8 (`744bdd89`).
3. **Paso 3**: Incorporación de PR #9 (`d7e99355`), alcanzando el estado HEAD auditado.
*(Nota: Dado que PR #9 engloba la totalidad del historial de PR #8 de forma lineal, la promoción atómica directa de PR #9 a la rama staging produce exactamente el mismo resultado determinista sin riesgo de divergencia).*

> [!CAUTION]
> **RESTRICCIÓN OPERATIVA STRICT**: Durante esta misión de preflight, **no se realiza ninguna fusión en GitHub**, ni avance rápido de ramas, ni modificación de estado en los Pull Requests #8 y #9, los cuales se conservan en estado **OPEN / DRAFT**.

---

## 2. Matriz de Aislamiento Multidimensional de Staging

Se establecen 8 dimensiones de aislamiento estricto para garantizar que la ejecución de pruebas en preproducción no interfiera bajo ningún concepto con la operativa de producción:

```
┌────────────────────────────────────────────────────────────────────────┐
│                   MATRIZ DE AISLAMIENTO DE STAGING                     │
├───────────────────┬────────────────────────────────────────────────────┤
│ 1. RED            │ Subred Docker 172.23.0.0/16, solo loopback 18081    │
│ 2. BASE DE DATOS  │ Instancia ppos-staging-mysql (8.0.46) sin exp. ext.│
│ 3. ALMACENAMIENTO │ Volumen ppos_staging_mysql_data_v2 desacoplado     │
│ 4. SECRETOS       │ Permisos 700/600 en secrets/, claves independientes │
│ 5. FINANCIERO     │ Modo FAIL-CLOSED, ADAPTER_SUBSTITUTION bloqueada   │
│ 6. OTP Y CORREOS  │ Interceptación obligatoria por Mailpit (18025)     │
│ 7. MULTI-TENANT   │ Generated stored slots en BD y aislamiento RBAC    │
│ 8. HARDWARE PLANTA│ Simulador MES desacoplado, cero conexión SCADA     │
└───────────────────┴────────────────────────────────────────────────────┘
```

### 2.1 Dimensión 1: Aislamiento de Red
- **Contenedores**: Comunicados a través del bridge privado `ppos_staging_net` (`172.23.0.0/16`).
- **Restricción de Binds**: Ningún servicio de staging publica puertos en `0.0.0.0`. La interfaz de Control Plane escucha exclusivamente en `127.0.0.1:18081` y la interfaz web de Mailpit en `127.0.0.1:18025`.
- **Conectividad con Producción**: Bloqueada por reglas de red interna. Staging no puede resolver ni alcanzar sockets de bases de datos productivas.

### 2.2 Dimensión 2: Aislamiento de Base de Datos
- **Instancia**: Contenedor `ppos-staging-mysql` ejecutando MySQL 8.0.46.
- **Acceso Administrativo**: Usuario exclusivo `ppos_staging_user` con privilegios acotados únicamente sobre el esquema `ppos_control_plane_staging`.
- **Prohibición de Escritura**: Queda estrictamente prohibida la configuración de cadenas de conexión hacia el MySQL de producción (`3310` o sockets compartidos).

### 2.3 Dimensión 3: Aislamiento de Almacenamiento y Documentos
- **Volumen de Base de Datos**: `ppos_staging_mysql_data_v2`, montado en `/var/lib/mysql` dentro del contenedor de base de datos.
- **Almacenamiento de Ficheros**: Volumen `/opt/printprice-os/staging-storage` exclusivo para artefactos, PDFs de prueba y reportes generados.

### 2.4 Dimensión 4: Gestión de Secretos y Criptografía
- **Almacenamiento Local**: Directorio `secrets/` en el host, con permisos de directorio `chmod 700` y ficheros `chmod 600`.
- **Independencia Criptográfica**: Las claves secretas (`staging_jwt_secret.txt`, `staging_db_password.txt`, `staging_token_salt.txt`) se generan aleatoriamente mediante `openssl rand -hex 32` y no comparten ninguna raíz con las claves de producción.

### 2.5 Dimensión 5: Aislamiento Financiero y Pasarelas de Pago
- **Adaptador Forzado**: Inyección obligatoria de `PPOS_FINANCIAL_ADAPTER=STAGING_ISOLATED_FAIL_CLOSED`.
- **Inmutabilidad en Runtime (SEC-R5-01)**: Al fijar `NODE_ENV=production` y `PPOS_ENVIRONMENT=staging`, cualquier llamada a `setActiveAdapter()` o `setFinancialAdapter()` lanza inmediatamente:
  ```
  ADAPTER_SUBSTITUTION_FORBIDDEN_IN_PRODUCTION (HTTP 403 Forbidden)
  ```
- **Fail-Closed Ante Ausencia de Credenciales**: Sin claves reales de pasarela bancaria, el adaptador devuelve honestamente `SETTLEMENT_INTEGRATION_PENDING`, impidiendo que se declaren liquidaciones no verificadas.

### 2.6 Dimensión 6: Aislamiento de Comunicaciones (OTP y Correo)
- **Servidor SMTP**: `ppos-staging-mailpit` escuchando internamente en el puerto `1025`.
- **Prohibición de Relays**: Queda deshabilitado el reenvío SMTP hacia servidores externos (SendGrid, SES, Postfix).
- **Destinatarios de Prueba**: Todos los correos generados (incluyendo códigos OTP y enlaces de revisión de cotización) son capturados en la bandeja virtual de Mailpit, accesible en `http://127.0.0.1:18025`.

### 2.7 Dimensión 7: Aislamiento Multi-Tenant
- **Partición Lógica**: Validada en cada endpoint y consulta SQL mediante `tenant_id`.
- **Restricciones de Motor**: Las tablas de decisiones y revisiones (`order_paper_decisions` y `order_quote_revisions`) utilizan columnas generadas persistidas (`active_role_slot` y `active_revision_slot`) indexadas con `UNIQUE KEY`, impidiendo colisiones entre tenants incluso ante peticiones concurrentes anómalas.

### 2.8 Dimensión 8: Aislamiento de Maquinaria Industrial (MES / SCADA)
- **Despacho Simulado**: La compuerta industrial [MarketplaceDispatchGatingService.js](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/MarketplaceDispatchGatingService.js) serializa el paquete técnico hacia un endpoint de prueba (`MES Simulator`).
- **Cero Conexión a Hardware**: Ninguna máquina física de imprenta (prensas offset, impresoras digitales o líneas de encuadernación) está expuesta o conectada al entorno de staging.

---

## 3. Dictamen de Aislamiento de Preproducción

```
================================================================================
           DICTAMEN DE AISLAMIENTO PARA PREPRODUCCIÓN (BUDGET-02D-03)
================================================================================
DIMENSIONES DE AISLAMIENTO: 8 DE 8 FORMALIZADAS Y BLINDADAS
INTERFERENCIA CON PRODUCCIÓN: NULA (CERO RIESGO DE MUTACIÓN CRUZADA)
PROTECCIÓN FINANCIERA: MODO FAIL-CLOSED INMUTABLE ACTIVADO
PROTECCIÓN DE COMUNICACIONES: ENRUTAMIENTO OBLIGATORIO A MAILPIT
RESTRICCIÓN GIT: PR #8 Y PR #9 MANTENIDOS INTACTOS EN DRAFT (NO MERGE)
================================================================================
```
