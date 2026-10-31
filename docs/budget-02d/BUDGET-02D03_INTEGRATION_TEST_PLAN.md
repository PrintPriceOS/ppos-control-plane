# BUDGET-02D-03 — Plan de Pruebas de Integración y Matriz de Contratos para Preproducción

> **Misión**: `MISIÓN BUDGET-02D-03 — Preflight operativo de preproducción aislada`  
> **Proyecto**: PrintPrice OS Control Plane  
> **Repositorio**: `PrintPriceOS/ppos-control-plane`  
> **Fecha de Emisión**: 28 de Octubre de 2026  
> **Modalidad**: Plan de Integración Operativa READ-ONLY  
> **Restricciones Absolutas**: **NO MERGE / NO DEPLOY / NO MODIFICAR PRODUCCIÓN / NO EJECUTAR MIGRACIONES EN SERVIDORES ACTIVOS / NO OPERACIONES FINANCIERAS REALES**  

---

## 1. Alcance y Taxonomía de las Pruebas de Integración

Este plan establece los casos de prueba end-to-end que se ejecutarán en preproducción una vez desplegada la versión integrada de PR #8 y PR #9.

### 1.1 Clasificación Categórica de Componentes
Para garantizar la máxima honestidad técnica, cada eslabón se clasifica según su nivel de acoplamiento real:

1. **Integración Real Acreditada**: Componentes implementados en el repositorio, validados con el motor físico MySQL 8 y comprobados en suites automatizadas (Control Plane, Gating, esquemas 167-171, RBAC, serialización).
2. **Pruebas con Proveedor Simulado (Sandboxed / Mocked)**: Componentes donde el protocolo es real pero el receptor es un emulador aislado de prueba (Mailpit para SMTP/OTP, simulador REST para MES, adaptador en memoria para sandbox financiero).
3. **Componentes No Implementados / Excluidos**: Funcionalidades que requieren proveedores comerciales externos en vivo (Webhooks bancarios con firma criptográfica en vivo de Stripe/Adyen/RedSys, pasarela SMS a telcos, enlace TCP/IP a máquinas físicas de imprenta).

---

## 2. Matriz de Casos de Prueba de Integración por Dominio

### 2.1 Dominio 1: Budget App $\longleftrightarrow$ Control Plane (Catálogo y Decisiones de Papel)

| ID Caso | Endpoint / Operación | Método | Carga de Entrada (Payload) | Comportamiento Esperado | Tipo Integración |
| :--- | :--- | :---: | :--- | :--- | :--- |
| **TC-01.1** | `/api/v1/marketplace/public/paper-catalog` | `GET` | Parámetros: `category=COATED, gsm=150` | HTTP 200 con listado sanitizado (sin precios de coste internos ni márgenes de imprenta). | **REAL** |
| **TC-01.2** | `/api/v1/marketplace/orders/:orderId/paper-decision` | `POST` | `decision_action: CONFIRM, paper_role: INTERIOR` | HTTP 200. Registra decisión con `DELTA_ZERO_CONFIRMED`. `active_role_slot` ocupado. | **REAL** |
| **TC-01.3** | `/api/v1/marketplace/orders/:orderId/paper-decision` | `POST` | `decision_action: PROPOSE_ALTERNATIVE, alternative_variant_id: 'var_99'` | HTTP 200. Marca `REQUIRES_ECONOMIC_REVISION`. `estimated_cost_delta = 0` (coste no alterado en cliente). | **REAL** |
| **TC-01.4** | `/api/v1/marketplace/orders/:orderId/paper-decision` | `POST` | Intento de emitir 2 decisiones `ACTIVE` para el mismo `paper_role` | HTTP 409 `DUPLICATE_ACTIVE_DECISION` (violación de `uk_opd_active_role`). | **REAL** |

---

### 2.2 Dominio 2: Motor BPE y Recálculo de Revisiones de Cotización

| ID Caso | Operación | Entrada | Comportamiento Esperado | Tipo Integración |
| :--- | :--- | :--- | :--- | :--- |
| **TC-02.1** | Recálculo BPE de Revisión | Snapshot sellado de cotización (`order_pricing_snapshots`) | Validación de procedencia criptográfica, `deepFreeze` sobre tarifas y cómputo de `delta_net_amount`. | **REAL** |
| **TC-02.2** | Expiración Dinámica por Calendario | Perfil en `printhouse_profiles` con festivos `ES-MD` | Ajuste de `expires_at` sumando 48 horas hábiles excluyendo fines de semana, festivos y pausa de comida. | **REAL** |
| **TC-02.3** | Clamping por Validez de Proveedor | `supplier_offer_valid_until` menor a 48h hábiles | `expires_at` se recorta para no superar la caducidad del material del proveedor. | **REAL** |
| **TC-02.4** | Emisión Concurrente de Revisión | Dos peticiones simultáneas de revisión para el mismo pedido | Exactamente una queda en `PENDING` (`uk_oqr_active_slot`); la segunda es rechazada. | **REAL** |

---

### 2.3 Dominio 3: Consentimiento Contractual y Desafío OTP

| ID Caso | Operación | Canal / Endpoint | Comportamiento Esperado | Tipo Integración |
| :--- | :--- | :--- | :--- | :--- |
| **TC-03.1** | Emisión de Token de Revisión | Inserción en `quote_revision_tokens` | Token plano entregado al cliente; únicamente se persiste el hash SHA-256 en base de datos. | **REAL** |
| **TC-03.2** | Desafío OTP | Envío SMTP a Mailpit (`172.23.0.4:1025`) | Mensaje capturado en Mailpit UI (`18025`). `otp_delivery_status` pasa a `DELIVERED`. | **SIMULADA (Mailpit)** |
| **TC-03.3** | Aceptación con OTP Válido | `POST /quote-revisions/:id/respond` | HTTP 200. Token consumido (`CONSUMED`), generación de `consent_record_json` inmutable. | **REAL** |
| **TC-03.4** | Replay Attack sobre Token | Segundo intento de consumir el mismo token | HTTP 410 `TOKEN_ALREADY_CONSUMED`. Rechazo absoluto. | **REAL** |
| **TC-03.5** | Ataque de Fuerza Bruta en OTP | 3 intentos fallidos consecutivos | HTTP 429 `OTP_MAX_ATTEMPTS_EXCEEDED`. Revocación permanente del token. | **REAL** |

---

### 2.4 Dominio 4: Compuertas Financieras y Contrato de Replay

| ID Caso | Operación | Condición Financiera | Comportamiento Esperado | Tipo Integración |
| :--- | :--- | :--- | :--- | :--- |
| **TC-04.1** | Bloqueo por $\Delta > 0$ | Aceptación con aumento de precio | `financial_reconciliation_status = 'SUPPLEMENTARY_PAYMENT_PENDING'`. Despacho industrial bloqueado. | **REAL** |
| **TC-04.2** | Bloqueo por $\Delta < 0$ | Aceptación con rebaja de precio | `financial_reconciliation_status = 'REFUND_PENDING'`. Despacho industrial bloqueado. | **REAL** |
| **TC-04.3** | Liquidación con Adaptador Fail-Closed | `POST /orders/:orderId/settle-refund` en staging | Al no haber API bancaria conectada, el adaptador rechaza y mantiene `REFUND_PENDING`. | **REAL (Fail-Closed)** |
| **TC-04.4** | Liquidación con Comprobante en Tabla 171 | Comprobante válido emitido por finanzas | Inserción en `financial_settlement_vouchers` bajo `FOR UPDATE` lock. Estado pasa a `REFUND_SETTLED`. | **REAL** |
| **TC-04.5** | Matriz de Replay (16 Casos) | Reintento idéntico vs omisión de 8 campos | Replay idéntico pasa con HTTP 200; cualquier omisión devuelve `SETTLEMENT_MISMATCH` (HTTP 409). | **REAL** |
| **TC-04.6** | Replay contra Pedido Histórico | Orden liquidada previa a la migración 171 | HTTP 409 `HISTORICAL_SETTLEMENT_RECONCILIATION_REQUIRED`. Cero mutaciones en caliente. | **REAL** |

---

### 2.5 Dominio 5: Especificación Técnica Efectiva y Despacho Industrial MES

| ID Caso | Operación | Contexto de Autorización | Comportamiento Esperado | Tipo Integración |
| :--- | :--- | :--- | :--- | :--- |
| **TC-05.1** | Activación de Especificación Efectiva | Tras consentimiento formal y liquidación | Creación de registro en `order_effective_technical_specifications`. Cotización original intacta. | **REAL** |
| **TC-05.2** | Intento de Despacho por Operario | Usuario con rol `PRINTHOUSE_OPERATOR` | HTTP 403 `FORBIDDEN`. Exclusivo para Director de Planta o Admin. | **REAL** |
| **TC-05.3** | Despacho Industrial Autorizado | Usuario `mgr_plant_01` (`PLANT_DIRECTOR`) | HTTP 200. Paquete enviado a simulador MES. Payload consume versión efectiva aprobada. | **SIMULADA (MES)** |
| **TC-05.4** | Despacho ante Revisión Pendiente | Orden con revisión en estado `PENDING` | HTTP 409 `PENDING_QUOTE_REVISION_BLOCKS_DISPATCH`. Despacho bloqueado. | **REAL** |

---

## 3. Matriz Resumen de Acreditación de Pruebas

```
┌────────────────────────────────────────────────────────────────────────┐
│               MATRIZ DE ACREDITACIÓN DE INTEGRACIÓN                    │
├───────────────────────────────┬──────────────────────────┬─────────────┤
│ Dominio Operativo             │ Tecnología Utilizada     │ Clasificación│
├───────────────────────────────┼──────────────────────────┼─────────────┤
│ Catálogo y Decisiones Papel   │ API REST + MySQL 8       │ REAL        │
│ BPE y Deltas de Cotización    │ Motor Node.js + MySQL 8  │ REAL        │
│ Consentimiento y Tokens       │ Criptografía SHA-256     │ REAL        │
│ Desafío y Verificación OTP    │ Mailpit SMTP (18025)     │ SIMULADA    │
│ Gating y Contrato de Replay   │ Transacciones FOR UPDATE │ REAL        │
│ Pasarela Bancaria Real        │ Adaptador Fail-Closed    │ NO IMPL.    │
│ Especificación Técnica Efectiva│ InnoDB Table 170         │ REAL        │
│ Despacho a Máquina MES        │ Simulador HTTP MES       │ SIMULADA    │
│ Hardware SCADA de Imprenta    │ Desacoplado de Staging   │ NO IMPL.    │
└───────────────────────────────┴──────────────────────────┴─────────────┘
```
