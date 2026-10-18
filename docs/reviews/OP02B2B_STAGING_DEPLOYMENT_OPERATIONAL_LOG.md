# Registro Operativo de Despliegue Staging OP-02B.2B (Plesk Shared Host)

- **Fecha de sincronización:** 18 de Octubre de 2026
- **Host:** `212.227.79.67` (Plesk Obsidian 18.0.81)
- **Directorio de despliegue:** `/var/www/vhosts/printprice.pro/temporal.printprice.pro/staging`
- **Proyecto Compose:** `ppos-staging`
- **Contenedores activos:**
  - `ppos-control-plane-staging` (Node.js runtime, puerto interno loopback `127.0.0.1:18081`)
  - `ppos-staging-mysql` (MySQL 8.0, sin puertos públicos expuestos)
- **Condición operativa:** `OP02B2B_PLESK_SHARED_HOST_CONDITIONAL`
- **Uso autorizado:** Onboarding y configuración con datos sintéticos.
- **Servicios de producción:** 0 modificaciones / 0 impacto (Bases de datos Plesk `Control`, `crm`, `preflight_` intactas).

---

## 1. Estado Verificado de Endpoints de Salud y Esquema

Comprobación directa de solo lectura ejecutada por ChatGPT directamente en la terminal SSH de Plesk (`212.227.79.67`) sobre el runtime de staging en loopback `http://127.0.0.1:18081`:

### 1.1 GET `/live`
- **Contexto de ejecución:** Host Plesk (`root@212.227.79.67`) observado directamente por ChatGPT en la terminal SSH de Plesk.
- **Comando:** `curl -s http://127.0.0.1:18081/live`
- **Código HTTP:** `200 OK`
- **Cuerpo:**
  ```json
  {"status":"UP"}
  ```

### 1.2 GET `/ready`
- **Contexto de ejecución:** Host Plesk (`root@212.227.79.67`) observado directamente por ChatGPT en la terminal SSH de Plesk.
- **Comando:** `curl -s http://127.0.0.1:18081/ready`
- **Código HTTP:** `200 OK`
- **Cuerpo:**
  ```json
  {"status":"READY","service":"ppos-control-plane","schema":{"status":"READY","manifestVersion":1}}
  ```

---

## 2. Ejecución Real y Estado del Esquema en Base de Datos

- **Volumen MySQL en uso:** `ppos_staging_mysql_data_v2` (dedicado y aislado).
- **Volúmenes preservados intactos como respaldo:**
  - `ppos_staging_mysql_data` (volumen inicial conservado íntegramente).
  - `ppos_staging_documents_data` (volumen de documentos preservado).
- **Base de datos de destino:** `ppos_control_staging`.
- **Usuario efectivo:** `ppos_staging_usr@%`.
- **Bootstrap canónico:**
  - Ejecutado con `PPOS_STAGING_PERSISTENT_BOOTSTRAP=true`.
  - Creó satisfactoriamente las tablas fundacionales requeridas.
  - Resultado: `BOOTSTRAP_EXIT:0`.
- **Ledger de migraciones oficiales:**
  - Ejecutado con `PPOS_MIGRATION_EXECUTION=true` y `PPOS_ENABLE_SCHEMA_MUTATION=true`.
  - Resultado: `Applied 164 new migrations`.
  - Validación posterior de migración 161: `51/51` comprobaciones superadas.
  - Resultado: `MIGRATION_EXIT:0`.
  - Cero manipulación o forzado manual del ledger `schema_versions`.

---

## 3. Hallazgos Reales de Credenciales y Corrección Persistente

1. **Permisos de Docker Secrets:**
   - Durante el primer intento de bootstrap, la aplicación falló con `ER_ACCESS_DENIED_ERROR, using password: YES`.
   - Se constató que el usuario no privilegiado de la aplicación (`node`, UID 1000) no podía leer `/run/secrets/staging_db_password` (`Permission denied`).
   - Por tanto, queda formalmente registrado que dicho archivo **no era legible** por el proceso de la aplicación en el contenedor.

2. **Resolución Persistente y Segura:**
   - Se sincronizó `MYSQL_PASSWORD` dentro de `.env.staging` a partir de `secrets/staging_db_password.txt`.
   - `.env.staging` se mantiene estrictamente protegido con permisos `600`.
   - Se añadió la guarda de interpolación obligatoria al servicio `control-plane-staging` en `docker-compose.staging.yml`:
     ```yaml
     MYSQL_PASSWORD: ${MYSQL_PASSWORD:?MYSQL_PASSWORD requerida}
     ```
   - Se conservó `MYSQL_PASSWORD_FILE`. La resolución efectiva utiliza la variable `MYSQL_PASSWORD` inyectada; no se alteraron los permisos del secreto montado.
   - No se modificó la contraseña del usuario en MySQL ni se alteró `JWT_SECRET`.
   - Copia de respaldo previa protegida en `/root/ppos-staging-config-backup-1792310629/` (permisos 700 directorio, 600 archivos).
   - Recreación del contenedor ejecutada sin variables de entorno residuales en sesión mediante:
     ```bash
     env -u MYSQL_PASSWORD docker compose --env-file .env.staging -f docker-compose.staging.yml up -d --no-deps --force-recreate control-plane-staging
     ```

---

## 4. Trazabilidad del Entregable y Diferencias Sanitizadas del Compose

### 4.1 Paquete Aprobado en CI (Referencia Original)
- **Commit:** `21a3383a2843507738f3c4796c21389a46657476`
- **Run GitHub Actions:** `39096598803`
- **Artifact ID:** `12125405080`
- **Imagen:** `ppos-control-plane:staging-1557452`
- **Image ID certificado:** `sha256:c4f3395002f63d7a5b44854a9bac77d374e402876bb0c6eaa9dd8a6be5327462`
- **TAR SHA-256:** `d276a570449c000d7719e0d1943309d988cc1efb9cbd344f8020a26631642730`

### 4.2 Diferencias Sanitizadas en el `docker-compose.staging.yml` Desplegado
El archivo `docker-compose.staging.yml` desplegado **no conserva el hash del Compose certificado** debido a las adaptaciones operativas estrictamente necesarias para el host compartido Plesk:
- **Volumen MySQL:** Redireccionado de `ppos_staging_mysql_data` a `ppos_staging_mysql_data_v2` para garantizar un volumen limpio sin tocar el histórico.
- **Ruta de Almacenamiento Preflight:** Incorporación de la variable de entorno `PPOS_PREFLIGHT_STORAGE_ROOT: /opt/printprice-os/staging-storage/preflight` para alinear con el punto de montaje del volumen dedicado y prevenir fallos `EACCES`.
- **Variables e Interpolación:**
  - `MYSQL_PASSWORD: ${MYSQL_PASSWORD:?MYSQL_PASSWORD requerida}` (con guarda estricta obligatoria).
  - `JWT_SECRET: ${JWT_SECRET}` (interpolada desde `.env.staging`; no se confirmó una guarda estricta con mensaje de error como en MySQL).
- **Protección del Host:** Cero copia de `.env.staging`, copias de respaldo o archivos en `secrets/` hacia el repositorio Git.

---

## 5. Postura de Seguridad y Restricciones Activas

- **Acceso a red:** Exclusivamente vía loopback interno `127.0.0.1:18081` mediante túnel SSH cifrado hacia el host.
- **Exclusión de reverse proxy público:** No se habilita ni aprueba reverse proxy web público en `temporal.printprice.pro` para staging, preservando el acceso acotado por túnel SSH autorizado.
- **Exposición pública de BD:** Cero puertos expuestos hacia el exterior en `ppos-staging-mysql`.
- **Grants comerciales:** Los 4 grants permanecen estrictamente desactivados (`0:0:0:0:DEACTIVATED`).
- **Operaciones reales de producción:** Completamente fuera de alcance. Solo se permiten datos sintéticos.
- **Alcance del estado READY:** El estado `HTTP 200 READY` acredita exclusivamente la disponibilidad del proceso y la compatibilidad integral del esquema en la base de datos; **no acredita aislamiento L3/L4 ni certificación E2E de pagos**.

---

## 6. Checklist de Requisitos para el Piloto Guided Onboarding v4

Para dar inicio a las pruebas funcionales del flujo **Guided Onboarding v4** en staging, sin repetir la inicialización de la BD ni reabrir auditorías generales:

1. **Acceso Seguro por Túnel SSH:**
   - Establecer el túnel SSH hacia el puerto del contenedor staging:
     ```bash
     ssh -L 18081:127.0.0.1:18081 root@212.227.79.67
     ```
   - El acceso al frontend se realiza estrictamente a través de `http://127.0.0.1:18081` local tunelizado.
2. **Tenant Sintético de Prueba:**
   - Crear o verificar un tenant sintético de demostración (`id: 'tenant_demo_faehrmann'`) en `tenants` y su usuario en `control_users`.
3. **Nodo de Impresión y Esquema de Maquinaria (`printhouse_machines`):**
   - *Nota de distinción metodológica:* La estructura DDL aquí descrita ha sido deducida del análisis del código fuente y migraciones en el repositorio local (`migrations/015`, `migrations/139`, `migrations/140`), no de una inspección introspectiva directa de la base de datos desplegada:
     - Tabla principal de flota: `printhouse_machines` (creada en migración `015`, ajustada con FK a `printer_nodes(id, tenant_id)` en `139`, capacidad y clave única compuesta `(id, tenant_id)` en `140`).
     - Entidad padre obligatoria: `printer_nodes` (o registro en `printhouses` según endpoint consumido).
   - En el piloto, la creación del nodo y la máquina debe realizarse a través de los flujos de la interfaz/API de la aplicación para validar los contratos en tiempo de ejecución, evitando la inserción manual directa por SQL.
4. **Ensayo de Subida Preflight:**
   - Probar la carga de un PDF sintético de presupuesto en la Etapa C para validar la escritura en `/opt/printprice-os/staging-storage/preflight`.
