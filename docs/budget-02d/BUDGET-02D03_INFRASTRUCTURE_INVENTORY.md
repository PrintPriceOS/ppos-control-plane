# BUDGET-02D-03 — Inventario Técnico de Infraestructura para Preproducción Aislada

> **Misión**: `MISIÓN BUDGET-02D-03 — Preflight operativo de preproducción aislada`  
> **Proyecto**: PrintPrice OS Control Plane  
> **Repositorio**: `PrintPriceOS/ppos-control-plane`  
> **Fecha de Inspección**: 28 de Octubre de 2026  
> **Modalidad**: Auditoría Operativa READ-ONLY  
> **Restricciones Absolutas**: **NO MERGE / NO DEPLOY / NO MODIFICAR PRODUCCIÓN / NO EJECUTAR MIGRACIONES EN SERVIDORES ACTIVOS / NO OPERACIONES FINANCIERAS REALES**  

---

## 1. Identificación y Estado General del Host de Despliegue

La inspección de solo lectura sobre la infraestructura de alojamiento compartida certifica los siguientes parámetros operativos:

| Parámetro | Valor Verificado en Host | Observaciones Operativas |
| :--- | :--- | :--- |
| **Dirección IP Pública** | `212.227.79.67` | Host dedicado compartido en infraestructura IONOS / Plesk |
| **Nombre de Host (FQDN)** | `cool-shtern.212-227-79-67.plesk.page` | Dominio técnico de gestión |
| **Sistema Operativo** | Ubuntu 24.04 LTS (`x86_64`) | Kernel Linux `6.8.0-90-generic` |
| **Panel de Control** | Plesk Obsidian 18.0.81.4 | Compilación 2026/10/21, revisión `2eb3eb68` |
| **Gestores Web** | Nginx Reverse Proxy + Apache MPM Event | Nginx gestiona TLS y actúa como proxy inverso hacia puertos locales |
| **Gestor de Procesos** | Docker Engine 27.x + Docker Compose v2 | Despliegue contenerizado estándar |
| **Supervisor Nativo** | PM2 (`ecosystem.config.js`) | Disponible para servicios locales auxiliares |

---

## 2. Inventario de Contenedores y Aislamiento de Staging

Se constata la existencia de un stack independiente para staging (`ppos-staging`), conviviendo en el mismo host físico pero completamente segregado a nivel de redes y volúmenes Docker de los servicios de producción:

### 2.1 Stack Específico de Staging (`ppos-staging`)

| Nombre del Contenedor | Imagen Base | Puertos y Bindings de Red | Función y Aislamiento |
| :--- | :--- | :--- | :--- |
| **`ppos-control-plane-staging`** | `ppos-control-plane:staging-*` | `127.0.0.1:18081 -> 8081/tcp` | API Control Plane Staging (1 única réplica, límite 1.5 CPUs, 1024 MB RAM). Vinculado estrictamente a loopback. |
| **`ppos-staging-mysql`** | `mysql:8.0.46` | `3306/tcp, 33060/tcp` (Sin puerto publicado en host) | Instancia MySQL 8 dedicada exclusivamente a staging. Accesible solo desde la red interna Docker `ppos_staging_net`. |
| **`ppos-staging-mailpit`** | `axllent/mailpit:v1.22.3` | `1025/tcp` (SMTP interno), `127.0.0.1:18025 -> 8025/tcp` (UI Web) | Servidor SMTP simulado para interceptar y auditar envíos de correo y tokens OTP sin salida a internet. |

### 2.2 Servicios Vecinos Activos en el Host (No Staging / Producción Compartida)

| Contenedor | Imagen | Puerto Publicado | Propósito / Riesgo de Interferencia |
| :--- | :--- | :--- | :--- |
| **`ppos-mysql`** | `mysql:8.0` | `0.0.0.0:3310 -> 3306/tcp` | Base de datos de producción / general. **CERO conexión desde staging**. |
| **`ppos-redis`** | `redis:7.4.8` | `0.0.0.0:6380 -> 6379/tcp` | Colas y caché general. Staging cuenta con puente multi-network aislado. |
| **`ppos-preflight-service`** | `ppos/preflight-service` | `0.0.0.0:8001 -> 8001/tcp` | Servicio de validación de PDF y assets. |
| **`ppos-preflight-worker`** | `ppos/preflight-worker` | `0.0.0.0:8002 -> 8002/tcp` | Worker de procesamiento de preflight. |
| **`ppos-temporal` / `ui`** | `temporalio/auto-setup` | `0.0.0.0:7233` / `8233` | Motor de orquestación de workflows y consola UI. |
| **`ppos-rabbitmq`** | `rabbitmq:3-management` | `0.0.0.0:5673` / `15673` | Message broker RabbitMQ. |

---

## 3. Redes, Puertos y Topología de Almacenamiento

### 3.1 Red Docker de Staging (`ppos_staging_net`)
- **Identificador de Red**: `ppos-staging_ppos_staging_net` (Driver `bridge`).
- **Rango de Subred**: `172.23.0.0/16`.
- **Enrutamiento**: Tráfico de base de datos encapsulado internamente. `ppos-staging-mysql` tiene IP `172.23.0.3` y no expone ningún puerto al host ni al exterior.
- **Exposición Pública Controlada**: El único punto de entrada HTTP para staging es `127.0.0.1:18081`, protegido tras Nginx de Plesk mediante autenticación básica o token de operario.

### 3.2 Volúmenes Persistentes de Staging
- **`ppos_staging_mysql_data_v2`**: Volumen de almacenamiento para `/var/lib/mysql` de staging. Físicamente independiente del volumen de `ppos-mysql`.
- **`ppos_staging_documents_data`**: Almacén local de documentos y artefactos de preflight (`/opt/printprice-os/staging-storage`).

---

## 4. Matriz de Variables de Entorno Requeridas (Sin Secretos Revelados)

El contenedor `ppos-control-plane-staging` requiere el siguiente catálogo de variables inyectadas mediante `.env.staging`:

```ini
# Identificación y Seguridad de Entorno
NODE_ENV=production
PPOS_ENVIRONMENT=staging
PORT=8081
HOST=0.0.0.0

# Conexión a Base de Datos (Aislada en red interna)
DB_HOST=staging-mysql
DB_PORT=3306
DB_NAME=ppos_control_plane_staging
DB_USER=ppos_staging_user
DB_PASSWORD_FILE=/run/secrets/staging_db_password
DB_CONNECTION_LIMIT=15

# Criptografía y Sesiones
JWT_SECRET_FILE=/run/secrets/staging_jwt_secret
TOKEN_HASH_SALT_FILE=/run/secrets/staging_token_salt

# Gobernanza Financiera (Modo Fail-Closed)
PPOS_FINANCIAL_ADAPTER=STAGING_ISOLATED_FAIL_CLOSED
ALLOW_MOCK_SETTLEMENT_IN_STAGING=false
TRUSTED_BANKING_SANDBOX_ENDPOINT=https://sandbox.internal.bank/v1

# Conectividad de Simulación (BPE / MES / Correo)
BPE_SERVICE_URL=http://bpe-staging.internal:8080
MES_DISPATCH_ENDPOINT=http://mes-simulator.internal:9000/api/dispatch
SMTP_HOST=staging-mailpit
SMTP_PORT=1025

# Telemetría y Registro
LOG_LEVEL=info
PROMETHEUS_METRICS_ENABLED=true
AUDIT_LOG_IMMUTABLE=true
```

---

## 5. Dependencias Externas: BPE, Preflight, Redis y MES

1. **BPE (Book Price Engine)**:
   - En preproducción, el Control Plane interactúa con BPE para el recálculo determinista de revisiones de cotización.
   - El servicio valida procedencia criptográfica, checksums de tarifas (`bpe_rates_checksum`) y margen comercial desde `printhouse_profiles`.
2. **Preflight (Validación Técnica)**:
   - Conectado a los servicios locales en puertos 8001/8002 para la verificación de perfiles PDF antes de autorizar el pase a despacho industrial.
3. **Redis (Gestión de Colas y Locks Temporales)**:
   - Conexión a la instancia `ppos-redis` (puerto 6379 interno) utilizando una base de datos lógica segregada (ej. `DB 2` para staging vs `DB 0` para producción).
4. **MES (Manufacturing Execution System)**:
   - Despacho de paquetes industriales hacia un endpoint de simulación virtual (`MES Simulator`), verificando la serialización de `order_effective_technical_specifications` sin comunicación con maquinaria física real.

---

## 6. Evaluación de Riesgos de Interferencia con Servicios Existentes

| Vector de Riesgo | Probabilidad | Impacto Potencial | Salvaguarda Operativa Implementada |
| :--- | :---: | :---: | :--- |
| **Colisión de Puertos TCP** | Nula | Alto | Staging usa `18081` y `18025`, totalmente disjuntos de los puertos 3310, 8001, 8002 y 6380. |
| **Escritura Cruzada en BD Producción** | Nula | Catastrófico | Staging no recibe credenciales ni nombres de host de `ppos-mysql`. Red `ppos_staging_net` aislada. |
| **Agotamiento de Memoria RAM** | Baja | Medio | Contenedor limitado a 1024 MB RAM y 1.5 CPUs mediante directivas de Docker Compose. |
| **Fuga de Correos a Clientes Vivos** | Nula | Crítico | Interceptación de SMTP hacia Mailpit en `172.23.0.4:1025`. Prohibido el relay hacia servidores externos. |
| **Cargos Financieros Accidentales** | Nula | Catastrófico | Adaptador productivo bloqueado en modo fail-closed; rechazo estricto ante ausencia de credenciales bancarias. |

---

## 7. Diagnóstico de Disponibilidad: Estado del Entorno de Staging

- **Conclusión de Infraestructura**: La infraestructura de staging **ya existe físicamente** en el servidor Plesk (`cool-shtern.212-227-79-67.plesk.page`), contando con red dedicada, contenedor MySQL 8 y Mailpit operativos.
- **Acción Requerida para Futuro Despliegue**: El contenedor actual ejecuta una imagen anterior (`ppos-control-plane:staging-74b1b56b`). Para la validación integral de PR #8 y PR #9, **no se debe compilar en el host**, sino generar y cargar un tarball certificado que contenga el commit `d7e99355`.
