# BUDGET-02D-02 — Auditoría de Seguridad End-to-End, Aislamiento y Trazabilidad Funcional

> **Misión**: `BUDGET-02D-02 — Auditoría final de integración de PR #8 y PR #9`  
> **Proyecto**: PrintPrice OS Control Plane  
> **Repositorio**: `PrintPriceOS/ppos-control-plane`  
> **Fecha de Auditoría**: 28 de Octubre de 2026  
> **Modalidad**: Auditoría Independiente, READ-ONLY  
> **Restricciones Absolutas**: **NO MERGE / NO DEPLOY / NO MODIFICAR CÓDIGO / NO PRODUCTION DB CHANGES / NO MOVIMIENTOS REALES**  

---

## 1. Trazabilidad del Recorrido Funcional Completo (End-to-End Journey)

Se trazó el flujo de negocio y tecnológico implementado entre PR #8 y PR #9, verificando cada uno de sus eslabones:

```
[Presupuesto / Selección Papel]
             │
             ▼
[Decisión de Papel: PROPOSE_ALTERNATIVE] (Tabla 167)
             │
             ▼
[Recálculo BPE Determinista & Sellado Criptográfico] (order_pricing_snapshots)
             │
             ▼
[Emisión de Revisión de Cotización con Token OTP] (Tabla 168 / 169)
             │
             ▼
[Consentimiento Contractual Forense del Cliente] (Aceptación Token + Firma)
             │
             ▼
[Compuerta Financiera: Delta Positivo / Negativo] (MarketplaceDispatchGatingService)
             │
     ┌───────┴────────────────────────┐
     ▼                                ▼
[Δ > 0: Pago Suplementario]     [Δ < 0: Liquidación / Voucher 171]
     │                                │
     └───────┬────────────────────────┘
             ▼
[Especificación Técnica Efectiva Aprobada] (Tabla 170)
             │
             ▼
[Autorización Industrial por Director de Planta] (Control Plane RBAC)
             │
             ▼
[Despacho a Máquina / Paquete MES]
```

### 1.1 Detalle de Cada Eslabón del Ciclo de Vida
1. **Presupuesto y Selección de Material (Budget App)**:
   El cliente formula su pedido eligiendo un papel del catálogo. Se genera el `external_order_intent_id`.
2. **Decisión de Papel en Imprenta (`OrderPaperDecisionService`)**:
   El operario de imprenta evalúa disponibilidad. Si propone un papel alternativo (`PROPOSE_ALTERNATIVE`), el sistema clasifica automáticamente el estado económico como `REQUIRES_ECONOMIC_REVISION`.
3. **Recálculo BPE y Sellado Criptográfico**:
   El motor BPE (Book Price Engine) calcula el delta neto y bruto a partir del snapshot original inmutable. Se validan procedencia y sellado con `deepFreeze` y hashes SHA-256. El plazo de expiración se ajusta al calendario laboral de la imprenta (`printhouse_profiles`, migración 169).
4. **Emisión de Revisión y Token Único (`quote_revision_tokens`)**:
   Se emite un token criptográfico de un solo uso (con hash SHA-256 en BD) y desafío OTP.
5. **Consentimiento Contractual Forense**:
   La aceptación por parte del cliente valida token, OTP e importe exacto, registrando `consent_record_json` con huella de navegador, IP y marca temporal.
6. **Compuertas Financieras Desacopladas**:
   - Si $\Delta > 0$: Queda en `SUPPLEMENTARY_PAYMENT_PENDING`. Despacho bloqueado.
   - Si $\Delta < 0$: Queda en `REFUND_PENDING` / `REDUCED_PAYMENT_PENDING`. Despacho bloqueado hasta liquidación con comprobante en tabla 171.
7. **Especificación Técnica Efectiva (`order_effective_technical_specifications`)**:
   Se activa la especificación técnica efectiva con la variante acordada. El snapshot original de cotización nunca se sobreescribe.
8. **Autorización Industrial y Despacho MES**:
   El Director de Planta aprueba el despacho. El sistema consume exclusivamente la versión técnica efectiva aprobada y bloquea el paso si falta liquidación o consentimiento.

---

## 2. Matriz de Distinción: Componentes Acreditados vs Simulados

| Componente del Sistema | Estado Real en PR #8 / PR #9 | Entorno de Verificación | Nivel de Madurez |
| :--- | :--- | :--- | :--- |
| **Máquina de Estados de Papel** | Implementación completa en MySQL 8 | Ephemeral CI + Vitest | **ACREDITADO 100%** |
| **Cálculo BPE y Deltas** | Algoritmo determinista server-side | Suites Vitest + MySQL 8 | **ACREDITADO 100%** |
| **Generación y Consumo de Tokens OTP** | Criptografía CSPRNG + SHA-256 | Vitest + Integración | **ACREDITADO 100%** |
| **Compuertas de Bloqueo Industrial** | Lógica fail-closed en servicio y BD | Vitest + Real MySQL 8 | **ACREDITADO 100%** |
| **Especificación Técnica Efectiva** | Modelo relacional persistido (170) | Vitest + Real MySQL 8 | **ACREDITADO 100%** |
| **Vouchers de Liquidación y Replay (171)** | Bloqueo `FOR UPDATE`, InnoDB Unique | Vitest + Real MySQL 8 | **ACREDITADO 100%** |
| **Integración con Pasarela de Pago Real** | Mock / Adaptador Sandbox | Vitest Sandbox | **SIMULADO (PENDIENTE PRODUCCIÓN)** |
| **Envío de SMS/Email OTP Real** | Handset mockeado / Proof JSON | Vitest | **SIMULADO (PENDIENTE TELCO)** |
| **Conexión Directa a Máquinas MES/SCADA** | Generación de payload JSON/JDF | Vitest Mock MES | **SIMULADO (PENDIENTE HARDWARE)** |

---

## 3. Auditoría de Seguridad y Límites de Confianza

### 3.1 Aislamiento Estricto de Tenant (Multi-Tenancy)
- Toda consulta SQL y toda operación en memoria filtra rigurosamente por `tenant_id`.
- En peticiones de replay de liquidación, un llamador sin privilegios de otro tenant es repelido en el paso de autorización con `FORBIDDEN: Tenant mismatch` (HTTP 403). Si un administrador intenta aportar un tenant divergente en el cuerpo de la petición, el contrato de replay lo rechaza con `SETTLEMENT_MISMATCH: Tenant mismatch` (HTTP 409).
- Las columnas generadas en MySQL (`active_role_slot` y `active_revision_slot`) incorporan `tenant_id` como prefijo, evitando colisiones entre distintos clientes.

### 3.2 Control de Acceso Basado en Roles (RBAC)
- **Decisiones de Papel**: Restringido a operarios y administradores de la imprenta adjudicataria (`PRINTHOUSE_OPERATOR`, `PRINTHOUSE_ADMIN`).
- **Liquidación de Reembolsos**: Restringido a roles financieros autorizados (`FINANCE_DIRECTOR`, `SUPER_ADMIN`, `PRINTHOUSE_ADMIN`). Roles de operario o de cliente son rechazados inmediatamente.
- **Autorización Industrial de Despacho**: Exclusivo para directores de planta (`PLANT_DIRECTOR`, `PRODUCTION_ADMIN`). Se prohíbe el auto-despacho por parte del cliente o del departamento comercial.

### 3.3 Aislamiento de Entorno en Adaptadores Financieros (SEC-R5-01)
- `MarketplaceDispatchGatingService.setActiveAdapter()` y `setFinancialAdapter()` evalúan doble bandera de entorno (`NODE_ENV === 'production'` o `PPOS_ENVIRONMENT === 'production'`).
- En entorno productivo, cualquier intento de inyectar o sustituir un adaptador mock lanza `ADAPTER_SUBSTITUTION_FORBIDDEN_IN_PRODUCTION` (HTTP 403).
- La liquidación rechaza registros simulados en producción con `MOCK_ADAPTER_DISABLED_IN_PRODUCTION`.

### 3.4 Contrato Explícito de Replay de 8 Dimensiones (SEC-R5-03)
En la comprobación de pedidos ya liquidados (`REFUND_SETTLED`), se eliminó toda tolerancia a campos ausentes:
1. `obligationId`: obligatorio, rechazo ante omisión.
2. `tenantId`: obligatorio, validación contra pedido y llamador.
3. `provider`: obligatorio, coincidencia exacta con comprobante persistido.
4. `voucher_id`: obligatorio, coincidencia exacta.
5. `settlementRef`: obligatorio, coincidencia exacta.
6. `amount`: obligatorio, coincidencia exacta en céntimos enteros.
7. `currency`: obligatorio, coincidencia exacta.
8. `beneficiary`: obligatorio, coincidencia exacta.

Cualquier discrepancia u omisión devuelve estrictamente `SETTLEMENT_MISMATCH` (HTTP 409 Conflict) sin mutar la base de datos ni emitir eventos espurios.

### 3.5 Inmutabilidad Técnica y Financiera
- **Cero Variantes No Consentidas en Máquina**: El servicio de despacho solo permite despachar si existe una especificación técnica efectiva activa (`effective_status = 'ACTIVE'`). Dicha especificación solo se crea si el cliente aceptó expresamente la revisión con su token y firma.
- **Cero Liquidaciones Fantasma**: No es posible avanzar a despacho industrial si el estado financiero es `REFUND_PENDING` o `PAYMENT_PENDING`. La orden debe encontrarse fehacientemente en `REFUND_SETTLED` o `PASSED`, respaldada por su comprobante en la tabla 171.

---

## 4. Dictamen de Seguridad End-to-End

```
================================================================================
          DICTAMEN DE SEGURIDAD Y CONSISTENCIA END-TO-END (BUDGET-02D-02)
================================================================================
AISLAMIENTO MULTI-TENANT: INVIOLABLE (TESTEADO A NIVEL RUTA Y BASE DE DATOS)
RBAC Y AUTORIDAD: SEPARACIÓN ESTRICTA (OPERARIO / FINANZAS / PLANTA)
SEGURIDAD CRIPTOGRÁFICA: TOKENS SHA-256, OTP BOUNDING Y SNAPSHOT FREEZING
COMPUERTAS INDUSTRIALES: FAIL-CLOSED ABSOLUTO ANTE PAGOS O CONSENTIMIENTOS PENDIENTES
REPLAY FINANCIERO: CONTRATO DE 8 DIMENSIONES CERRADO CON TOLERANCIA CERO
CONECTIVIDAD EXTERNA: DECLARADA PENDIENTE (PRODUCTION_FINANCIAL_INTEGRATION_PENDING)
================================================================================
```
