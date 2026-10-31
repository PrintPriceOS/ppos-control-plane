# BUDGET-02D-03 — Lista de Comprobación Operativa GO / NO-GO para Preproducción

> **Misión**: `MISIÓN BUDGET-02D-03 — Preflight operativo de preproducción aislada`  
> **Proyecto**: PrintPrice OS Control Plane  
> **Repositorio**: `PrintPriceOS/ppos-control-plane`  
> **Fecha de Emisión**: 28 de Octubre de 2026  
> **Modalidad**: Lista de Control Operativo (READ-ONLY)  
> **Restricciones Absolutas**: **NO MERGE / NO DEPLOY / NO MODIFICAR PRODUCCIÓN / NO EJECUTAR MIGRACIONES EN SERVIDORES ACTIVOS / NO OPERACIONES FINANCIERAS REALES**  

---

## 1. Definición del Procedimiento GO / NO-GO

La presente lista de comprobación establece los criterios binarios e inapelables que deben verificarse de forma previa a cualquier solicitud de autorización para ejecutar el despliegue en el entorno de preproducción:

- **Condición GO**: El 100% de los puntos obligatorios están verificados positivamente sin excepciones.
- **Condición NO-GO**: Cualquier discrepancia, ambigüedad o fallo en un solo punto crítico bloquea de inmediato la autorización operativa.

---

## 2. Bloque 1: Integridad de Código y Artefactos de Despliegue

| # | Criterio de Verificación | Condición Mandatoria | Estado Verificado | Dictamen |
| :-: | :--- | :--- | :---: | :---: |
| **1.1** | **Linearidad del Grafo Git** | Rama `feat/budget-02d01-e2e-remediation` contiene linealmente a PR #8 (`744bdd89`). | `True` (`git merge-base`) | **GO** |
| **1.2** | **Conflictos de Fusión en GitHub** | PR #8 y PR #9 reportan `MERGEABLE` con `mergeStateStatus: CLEAN`. | 0 conflictos detectados | **GO** |
| **1.3** | **Estado de los PRs en GitHub** | PR #8 y PR #9 se conservan estrictamente en estado **OPEN / DRAFT**. | Ninguna rama fusionada | **GO** |
| **1.4** | **Certificación CI en GitHub Actions** | Último commit (`d7e99355`) 100% verde en todas las fases ([Run 40652462056](https://github.com/PrintPriceOS/ppos-control-plane/actions/runs/40652462056)). | 15 fases superadas | **GO** |
| **1.5** | **Suites de Pruebas Automatizadas** | 18 suites de Vitest oficiales ejecutadas con éxito (400 tests pasados, 0 fallos). | 100% aprobadas | **GO** |
| **1.6** | **Compilación Frontend de Producción** | Bundle de producción generado limpiamente por Vite en menos de 15 segundos. | 13.59s sin errores | **GO** |

---

## 3. Bloque 2: Integridad de Base de Datos y Migraciones

| # | Criterio de Verificación | Condición Mandatoria | Estado Verificado | Dictamen |
| :-: | :--- | :--- | :---: | :---: |
| **2.1** | **Inventario DDL (167 a 171)** | Existencia de los 5 scripts DDL en `migrations/` con tipado estricto InnoDB. | 5 migraciones válidas | **GO** |
| **2.2** | **Scripts de Reversión (Rollback)** | Existencia de los 5 scripts correspondientes en `migrations/rollback/`. | 5 rollbacks presentes | **GO** |
| **2.3** | **Línea Base de Migraciones (Phase 183)**| Chequeo positivo en `smoke_phase183_migration_integrity.js`. | `Phase 183: PASSED` | **GO** |
| **2.4** | **Aislamiento de BD Producción** | Staging configurado exclusivamente para hablar con `ppos-staging-mysql`. | Cero credenciales prod | **GO** |
| **2.5** | **Inmutabilidad de Snapshots (136)** | Triggers activos en `order_pricing_snapshots` que bloquean UPDATE y DELETE. | Triggers verificados | **GO** |
| **2.6** | **Unicidad Anti-Replay de Vouchers** | `UNIQUE KEY (provider, provider_voucher_id)` en tabla 171. | Constraint InnoDB lista | **GO** |

---

## 4. Bloque 3: Infraestructura, Host y Aislamiento de Red

| # | Criterio de Verificación | Condición Mandatoria | Estado Verificado | Dictamen |
| :-: | :--- | :--- | :---: | :---: |
| **3.1** | **Disponibilidad del Host Plesk** | Host `212.227.79.67` en estado saludable (uptime $> 270$ días, carga baja). | Confirmado en vivo | **GO** |
| **3.2** | **Red Docker Aislada** | `ppos_staging_net` (`172.23.0.0/16`) activa y separada del bridge default. | Subred bridge lista | **GO** |
| **3.3** | **Segregación de Puertos** | Puerto `18081` asignado a loopback local (`127.0.0.1`), sin colisión con 3310 ni 8001. | Bindings certificados | **GO** |
| **3.4** | **Límites de Recursos en Staging** | Contenedor acotado a 1.5 CPUs y 1024 MB RAM en `docker-compose.staging.yml`. | Límites configurados | **GO** |
| **3.5** | **Mailpit Interceptor Activo** | Contenedor Mailpit escuchando en 1025 interno y 18025 local para capturar correos. | Interceptor listo | **GO** |

---

## 5. Bloque 4: Seguridad Operativa, Secretos y Criterios de Parada

| # | Criterio de Verificación | Condición Mandatoria | Estado Verificado | Dictamen |
| :-: | :--- | :--- | :---: | :---: |
| **4.1** | **Directorio de Secretos Local** | Directorio `secrets/` protegido con permisos `700` y ficheros `600`. | Permisos certificados | **GO** |
| **4.2** | **Independencia de Secretos** | Secretos de staging generados aleatoriamente con `openssl rand -hex 32`. | Raíces independientes | **GO** |
| **4.3** | **Modo Fail-Closed Financiero** | `NODE_ENV=production` y `PPOS_ENVIRONMENT=staging` bloquean inyección de mocks. | SEC-R5-01 activo | **GO** |
| **4.4** | **Rechazo de Pasarelas Reales** | Adaptador responde `SETTLEMENT_INTEGRATION_PENDING` si faltan credenciales bancarias. | Fail-closed verificado | **GO** |
| **4.5** | **Circuit Breaker ante Deadlocks** | Regla de parada inmediata si se registra $> 0$ deadlocks en transacciones de bloqueo. | Monitor configurado | **GO** |
| **4.6** | **Circuit Breaker ante Violación Tenant** | Regla de parada y aborto si se detecta cualquier cruce de datos entre tenants. | Umbral 0 fijado | **GO** |

---

## 6. Resultado Consolidado de la Evaluación GO / NO-GO

```
================================================================================
           RESULTADO GLOBAL DE LA LISTA DE COMPROBACIÓN (GO / NO-GO)
================================================================================
TOTAL DE CONTROLES AUDITADOS: 23
CONTROLES CON DICTAMEN GO:   23 (100%)
CONTROLES CON DICTAMEN NO-GO: 0  (0%)
BLOQUEOS OPERATIVOS ACTIVOS:  CERO (0)

DICTAMEN PREVIO: APTO PARA SOLICITAR AUTORIZACIÓN DE DESPLIEGUE EN STAGING
CONDICIÓN DE PARADA: DETENERSE A LA ESPERA DE AUTORIZACIÓN EXPRESA DEL COMITÉ
================================================================================
```
