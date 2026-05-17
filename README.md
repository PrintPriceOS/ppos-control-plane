# 🌌 PrintPrice OS — Control Plane Core Hardening
> **Plataforma Industrial de Coordinación Inteligente, Gobernanza Multirregional e Inferencia Autónoma**

[![Software Version](https://img.shields.io/badge/Version-v1.9.3--Phase--34-blueviolet?style=for-the-badge)](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/ppos-control-plane-phase-10-intelligence-layer/README.md)
[![Build Status](https://img.shields.io/badge/Build-STABLE-success?style=for-the-badge)](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/ppos-control-plane-phase-10-intelligence-layer/README.md)
[![Database Migration](https://img.shields.io/badge/Schema-IDEMPOTENT-orange?style=for-the-badge)](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/ppos-control-plane-phase-10-intelligence-layer/docs/CONTROL_PLANE_OS_AUDIT.md)
[![Audited Status](https://img.shields.io/badge/Security-HARDENED-success?style=for-the-badge)](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/ppos-control-plane-phase-10-intelligence-layer/docs/CONTROL_PLANE_OS_AUDIT.md)

---

## 📖 1. Rol de Repositorio

El **PrintPrice OS Control Plane** (`ppos-control-plane`) es el **Núcleo de Gobernanza, Coordinación Multirregional y Visibilidad Forense** de nuestra infraestructura de impresión federada distribuida. Actúa como el centro neurálgico que recibe telemetría de todos los servicios operacionales (motores de preflight y workers) y coordina de forma proactiva la remediación de anomalías, conciliación financiera, asignación de subastas y enrutamientos inteligentes.

```
                      ┌──────────────────────────────┐
                      │    COCKPIT FRONTEND (Vite)   │
                      └──────────────┬───────────────┘
                                     │ (Bearer JWT / HTTPS)
                      ┌──────────────▼───────────────┐
                      │    FASTIFY API GATEWAY       │
                      │       (Puerto :8081)         │
                      └──────────────┬───────────────┘
                                     │
         ┌───────────────────────────┼───────────────────────────┐
         │                           │                           │
┌────────▼────────┐         ┌────────▼────────┐         ┌────────▼────────┐
│  CAPA CORE MES  │         │ MÓDULOS DE AI   │         │ FEDERACIÓN Y    │
│  (SLA & Alerts) │         │ (Fases 12–22)   │         │ GEOLOCALIZACIÓN │
└────────┬────────┘         └────────┬────────┘         └────────┬────────┘
         │                           │                           │
         └───────────────────────────┼───────────────────────────┘
                                     │
                      ┌──────────────▼───────────────┐
                      │       BD MYSQL RELACIONAL    │
                      │         (50+ Tablas)         │
                      └──────────────────────────────┘
```

---

## ⚙️ 2. Topología de Red y Arquitectura Física

El Control Plane se divide en una SPA React (construida con Vite y estilizada con Vanilla CSS + TailwindCSS) servida estáticamente por un servidor **Fastify** que además expone endpoints REST robustos, protegidos por JWT.

* **Frontend**: Localizado bajo `src/ui/`. Compila en `/dist`.
* **BFF & API Gateway**: Localizado bajo `server.js` y `src/api/`.
* **Proxy de Archivos (Uploads/Preflight)**: Enruta flujos masivos de PDF directamente a `ppos-preflight-service` en el puerto `8001` con control estricto de capacidad de almacenamiento (Quota de 2GB por Tenant).
* **Persistencia Relacional**: Almacenamiento en MySQL optimizado mediante el motor InnoDB con aprovisionamiento e inicialización automatizada a través del `IndustrialProvisioningService.js`.

---

## 🧬 3. Auditoría de Capacidad e Inteligencia (Fases 12–22)

A través de las fases de desarrollo de la **Capa de Inteligencia (Intelligence Layer)**, el Control Plane ha implementado motores de autonomía y simulación de última generación evaluados mediante scripts de diagnóstico dedicados:

| Fase | Título de Inteligencia | Servicio Core Implementado | Equivalente Real de Operaciones | Validador |
| :--- | :--- | :--- | :--- | :--- |
| **Fase 12** | Autonomous MES & SLA | `slaMonitoringService` | Redirección de cola en caso de fallas de SLA. | `validate-autonomous-mes.js` |
| **Fase 13** | Predictive Intelligence | `riskScoringService` | Detección de atascos de stock y papel a futuro. | `validate-predictive-mes.js` |
| **Fase 14** | Digital Twin & Anomaly | `digitalTwinService` | Modelado de desgaste físico e IoT y MTBF de prensa. | `validate-anomaly-mes.js` |
| **Fase 15** | Economic Swarm | `economicOptimizationService` | Enrutamiento optimizado por margen comercial y energía. | `validate-economic-orchestration.js` |
| **Fase 16** | Factory Federation | `federationRegistryService` | Consenso distribuido inter-clúster multirregional. | `validate-federation-swarm.js` |
| **Fase 17** | Market Capacity | `industrialAuctionService` | Subasta dinámica de excedente de capacidad de impresión. | `validate-marketplace-orchestration.js` |
| **Fase 18** | AI Governance | `globalConstitutionService` | Gobernanza ética reforzada por Constitución AI. | `validate-governance-intelligence.js` |
| **Fase 19** | Industrial Civilization | `planetaryCoordinationService` | Logística global, equilibrio de stock y mitigación arancelaria. | `validate-planetary-civilization.js` |
| **Fase 20** | Interplanetary Intel | `interplanetaryFederationService` | Mitigación de latencia extrema de red y colas orbitales. | `validate-interplanetary-civilization.js` |
| **Fase 21** | Reality Simulation | `realitySimulationService` | Enrutamiento probabilístico multi-ruta (Monte Carlo). | `validate-universal-substrate.js` |
| **Fase 22** | Omniversal Consciousness | `omniversalConsciousnessService` | Coherencia en telemetría holográfica global con disyuntores. | `validate-post-reality-singularity.js` |

---

## 🔒 4. Estándares de Seguridad y Aislamiento Multi-Tenant

El Control Plane opera bajo estrictas normativas criptográficas e industriales para evitar filtraciones de datos y accesos indebidos:

1. **Aislamiento Multi-Tenant por Fila**: La base de datos aplica filtrado recursivo utilizando el `tenantId` provisto en el token JWT corporativo del operador en todas las consultas (Row-Level Isolation).
2. **Hook onRequest de Fastify**: Registra una directiva de intercepción de seguridad en todas las rutas administrativas (`/api/admin/*`, `/api/marketplace/*`), validando la firma del Bearer Token JWT.
3. **Master Break-Glass Token (Despliegue de Emergencia)**: Si la variable de entorno `ENABLE_BREAK_GLASS_TOKEN=true` está activa, permite acceso con un token estático seguro (`PPOS_CONTROL_TOKEN`) en caso de caída del servidor central de identidad. *Advertencia: Desactivar en producción.*
4. **Control de Cuota de Storage**: Implementa `PreflightQuotaService` para asegurar que ningún Tenant supere el límite estricto de almacenamiento físico de 2GB de archivos PDF.

---

## 📁 5. Guía de Base de Datos y Geolocalización (Phase 34)

La base de datos MySQL relacional del Control Plane contiene más de **50 tablas** estructuradas e inicializadas de manera idempotente por el `IndustrialProvisioningService`. Durante la auditoría se validó que:

* **Esquema de Red de Impresión (Geolocalización)**:
  * Las tablas `printer_nodes` y `print_nodes` disponen de columnas de alta precisión `latitude` (`DECIMAL(10,8)`) y `longitude` (`DECIMAL(11,8)`) para geoposicionamiento en vivo dentro del Cockpit UI (utilizando Leaflet/React-Leaflet).
  * Columnas de gobernanza regional como `region`, `timezone`, `federation_id` y `cluster_id` se encuentran correctamente indexadas para búsquedas geográficas optimizadas.

* **Capa de Transacciones del Marketplace**:
  * Las tablas `job_marketplace_sessions`, `manufacturing_offers` y `marketplace_events` garantizan la persistencia de las ofertas industriales generadas por los motores de cotización (BPE) integrados.
  * Los registros de ofertas soportan estructuras de costes completas (`production_cost`, `suggested_price`, `estimated_margin`) con alta precisión (`DECIMAL(14,4)`) y plazos de producción/envío desagregados.

* **Capa de Evidencia y SLA (Immutable Evidence Ledger)**:
  * Tabla `production_evidence_ledger`: Almacena hashes encadenados (`hash`, `previous_hash`) que blindan la trazabilidad física de los despachos industriales.
  * Tabla `sla_evidence_snapshots`: Realiza el seguimiento minucioso del "SLA Drift" (desviación de tiempo prometido contra estimado) para activar alertas proactivas.

---

## 🛠️ 6. Inicialización y Desarrollo Local

### Requisitos Previos
* **Node.js**: Versión 18 o superior.
* **MySQL**: Motor relacional corriendo en puerto 3306 (InnoDB).
* **Redis**: Sincronizador de colas corriendo en puerto 6379 (Opcional).

### Instalación e Inicio de Servidor
```bash
# 1. Instalar dependencias limpias de producción
npm ci

# 2. Compilar el cockpit del Frontend (React/Vite)
npm run build

# 3. Configurar las variables de entorno
cp .env.example .env  # Edita según tus variables de base de datos locales

# 4. Iniciar el Servidor de Fastify (Puerto 8081 por defecto)
npm start
```

### Ejecutar Suite de Validaciones de Inteligencia (Fases 12–22)
Para certificar el correcto funcionamiento de todos los módulos del Control Plane, ejecuta:

```bash
# Validación completa e idempotente del núcleo
node scripts/validate-control-plane-full.js

# Verificación de integridad de esquemas MySQL
node scripts/verify-industrial-schema.js

# Preflight check de producción e infraestructura
node scripts/preflight-production-check.js
```

---

## 📦 7. Despliegue en Producción (PM2)

Para entornos empresariales de alta disponibilidad, se recomienda la gestión de procesos mediante **PM2** utilizando el archivo `ecosystem.config.js` provisto:

```bash
# Iniciar Control Plane administrado por PM2
pm2 start ecosystem.config.js

# Visualizar logs en tiempo real
pm2 logs ppos-control-plane

# Comprobar el estado general del proceso
pm2 status
```

### Directivas de Despliegue Críticas
* Asegurar que `NODE_ENV=production` esté configurado en el entorno.
* Mantener la directiva `ENABLE_BREAK_GLASS_TOKEN=false` para proteger la API.
* Habilitar permisos de escritura en la carpeta `/logs` para la persistencia del archivo de trazas rotativas de error.

---
© 2026 PrintPrice OS. Todos los derechos reservados. Infraestructura de Producción Distribuida y Gobernanza Autónoma.