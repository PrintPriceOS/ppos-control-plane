# HOJA DE RUTA DE IMPLEMENTACIÓN Y ESTRATEGIA DE PRUEBAS — BUDGET-02C-00
## Plan de Ejecución Gobernada para BUDGET-02C-01 y Verificación en Cuatro Niveles

**Proyecto:** PrintPrice OS  
**Misión:** BUDGET-02C-00 — Plan de Implementación  
**Estado:** `BUDGET-02C00_DESIGN_APPROVED`  
**Modalidad Operativa:** READ-ONLY / DESIGN FIRST  
**Restricciones:** NO MERGE / NO DEPLOY / NO CODE MUTATION / NO DATABASE CHANGES  
**Fecha:** 27 de octubre de 2026  
**Autor:** Antigravity (Advanced Agentic Architecture)

---

## 1. Advertencia Operativa y Condiciones de Entrada

> [!WARNING]  
> Este documento constituye exclusivamente una propuesta técnica y una hoja de ruta para la fase subsiguiente **BUDGET-02C-01**. En cumplimiento estricto del mandato ejecutivo, **queda terminantemente prohibido implementar código, ejecutar migraciones o crear archivos fuera de la presente documentación hasta que la dirección técnica emita la autorización formal de desarrollo.**

La futura fase de implementación **BUDGET-02C-01** solo podrá iniciarse cuando se cumplan las siguientes condiciones:
- Aprobación formal del informe de diseño `BUDGET-02C00_FINAL_DESIGN_REPORT.md` con dictamen `BUDGET-02C00_PASS`.
- Verificación de que el PR #7 permanece abierto e intacto en el commit certificado `94b205eddd22fbd5544e476d876ec37ebcad2506`.
- Apertura de una nueva rama de características específica para BUDGET-02C (ej. `feat/budget-02c01-quote-revisions`) con la base certificada.

---

## 2. Fases de Implementación Propuestas (BUDGET-02C-01)

```
┌───────────────────────────────────────────────────────────────────────────────────────────────────┐
│                          FASE 1: PERSISTENCIA Y MIGRACIONES RELACIONALES                          │
│ • Migración NEXT_AVAILABLE_MIGRATION_SEQUENCE (candidato: 168_phase196g_quote_revisions.sql)      │
│ • Script de rollback asociado en migrations/rollback/                                             │
│ • Validación de integridad referencial SQL interna y columna active_revision_slot                 │
└─────────────────────────────────────────────────┬─────────────────────────────────────────────────┘
                                                  │
                                                  ▼
┌───────────────────────────────────────────────────────────────────────────────────────────────────┐
│                       FASE 2: CONTRATO DE RECÁLCULO DETERMINISTA EN BPE                           │
│ • Implementación del endpoint POST /api/marketplace/recalculate-delta en Pricing Engine           │
│ • Validación de compatibilidad física de pliegos, signatura (32 vs 16p) y recálculo de flete      │
│ • Cliente interno quoteRevisionCalculatorService.js en Control Plane                              │
└─────────────────────────────────────────────────┬─────────────────────────────────────────────────┘
                                                  │
                                                  ▼
┌───────────────────────────────────────────────────────────────────────────────────────────────────┐
│                   FASE 3: SERVICIOS DE GOBERNANZA DEL CICLO DE VIDA ECONÓMICO                     │
│ • orderQuoteRevisionService.js (Emisión, versionado, expiración determinista, revocación)         │
│ • quoteRevisionTokenService.js (CSPRNG 256 bits, hash SHA-256, serialización SELECT FOR UPDATE)   │
│ • orderRevisionAuditService.js (Ledger inmutable de auditoría forense)                            │
└─────────────────────────────────────────────────┬─────────────────────────────────────────────────┘
                                                  │
                                                  ▼
┌───────────────────────────────────────────────────────────────────────────────────────────────────┐
│                    FASE 4: CAPA DE TRANSPORTE HTTP Y SEPARACIÓN DE MÉTODOS                        │
│ • GET /api/marketplace/orders/:orderId/quote-revision/:rawToken (Previsualización segura RFC 7231)│
│ • POST /api/marketplace/orders/:orderId/quote-revision/:rawToken/accept (Aceptación vinculante)   │
│ • POST /api/marketplace/orders/:orderId/quote-revision/:rawToken/reject (Rechazo formal)          │
│ • Middleware de masking de logs (qrt_***REDACTED***) y cabeceras Referrer-Policy / Cache-Control  │
└─────────────────────────────────────────────────┬─────────────────────────────────────────────────┘
                                                  │
                                                  ▼
┌───────────────────────────────────────────────────────────────────────────────────────────────────┐
│                   FASE 5: COMPUERTAS TRIFÁSICAS DE DESACOPLAMIENTO OPERATIVO                      │
│ • revisionGatesOrchestrator.js: Evaluación de GATE_CONTRACTUAL, GATE_FINANCIAL y GATE_INDUSTRIAL │
│ • Adaptador financiero con idempotencia de Stripe para deltas positivos, negativos y cero        │
│ • Adaptador industrial: Revalidación automática de calibre de lomo en preflight                   │
└───────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Estrategia de Pruebas en Cuatro Niveles Obligatorios

Toda la implementación deberá ser verificada exhaustivamente antes de solicitar su certificación, diferenciando claramente cuatro niveles de aislamiento y fidelidad:

### 3.1 Nivel 1: Pruebas Unitarias de Lógica Pura (Vitest / Jest)
- **Objetivo:** Verificar algoritmos puros en memoria, libres de efectos secundarios y sin dependencias de red.
- **Casos de Prueba:**
  1. Aritmética de recálculo de deltas: delta positivo ($\Delta > 0$), delta cero ($\Delta = 0$) y delta negativo ($\Delta < 0$).
  2. Generación de tokens mediante CSPRNG de 256 bits y comprobación de formato Base64URL (`qrt_...`).
  3. Comprobación de que el hash SHA-256 almacenado es determinista y no invertible.
  4. Serialización y cálculo de `snapshot_canonical_hash` (ordenación alfabética de claves, exclusión de espacios).
  5. Cálculo del TTL de 48 horas laborables considerando fines de semana y festivos locales.
  6. Comparación en tiempo constante de hashes (`crypto.timingSafeEqual`).

### 3.2 Nivel 2: Pruebas de Integración de Servicios con Mocks
- **Objetivo:** Verificar la interacción entre servicios de aplicación y adaptadores.
- **Casos de Prueba:**
  1. Emisión de una revisión vinculada a una decisión técnica `PROPOSE_ALTERNATIVE` en `order_paper_decisions`.
  2. Invocación simulada al motor BPE con payload normalizado y captura de errores `422 UNPROCESSABLE_ENTITY`.
  3. Verificación de que el intento de aceptar con un hash manipulado emite error `409 CONFLICT`.
  4. Verificación de que una tarjeta rechazada en Stripe activa `HOLD_PAYMENT_PENDING` e impide la liberación industrial.

### 3.3 Nivel 3: Pruebas de Concurrencia con MySQL Efímero Real
- **Objetivo:** Acreditar el comportamiento transaccional, bloqueos pesimistas y protección contra carreras críticas sobre un motor relacional idéntico a producción.
- **Patrón a Reutilizar:** Replicar el patrón probado en [`scripts/test_budget02b01r_real_mysql_concurrency.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/scripts/test_budget02b01r_real_mysql_concurrency.js).
- **Casos de Prueba Obligatorios:**
  1. **Doble Aceptación Simultánea:** Dos peticiones paralelas con el mismo `rawToken`. Exactamente una devuelve HTTP `200 OK` y transiciona el token a `CONSUMED`; la otra devuelve HTTP `409 CONFLICT` y se rechaza.
  2. **Reemplazo Concurrente:** Una emisión de revisión $N+1$ bajo transacción revoca la revisión $N$; una petición concurrente de aceptación sobre el token de $N$ falla con `412 PRECONDITION_FAILED`.
  3. **Comprobación de Inmutabilidad del Presupuesto Original:** Verificar por consulta SQL directa que tras múltiples revisiones y aceptaciones, el importe en `orders.offer_price` sigue siendo exactamente **1.782,30 €**.
  4. **Comprobación Contra Mutación Silenciosa por Expiración:** Verificar que al forzar `expires_at < NOW()`, la revisión pasa a `EXPIRED` pero los campos de material y precio de la orden en `orders` no se modifican.

### 3.4 Nivel 4: Pruebas de Recorrido de Extremo a Extremo (E2E / Playwright)
- **Objetivo:** Validar la experiencia completa del cliente y el flujo operativo a través de la interfaz web y la API REST.
- **Recorridos E2E:**
  1. **Flujo Feliz (Delta Positivo Aceptado):**  
     Taller propone papel 120g $\to$ BPE calcula delta (+110,82 €) $\to$ Cliente recibe email $\to$ Cliente abre enlace (GET, token intacto) $\to$ Cliente introduce OTP y consiente (POST) $\to$ Stripe efectúa retención complementaria $\to$ Preflight confirma lomo $\to$ Orden pasa a `IN_PRODUCTION`.
  2. **Flujo de Rechazo por el Cliente:**  
     Cliente previsualiza la alternativa $\to$ Pulsa "Rechazar alternativa" (POST) $\to$ Orden transiciona a `PENDING_REJECTION_RESOLUTION` $\to$ Cero cargos en tarjeta $\to$ Taller es notificado para decidir si asume coste o cancela.
  3. **Flujo de Expiración sin Respuesta:**  
     Se emite la revisión $\to$ Transcurren 48 horas laborables $\to$ El daemon marca el token como `EXPIRED` $\to$ El cliente intenta acceder al enlace y recibe aviso amigable de vencimiento (`410 GONE`) $\to$ La orden no entra en producción.

---

## 4. Criterios de Aceptación Inviolables para la Futura Certificación (BUDGET-02C-01)

- [ ] **CA-01 (Inmutabilidad del Escenario Canónico):** Ninguna operación altera el importe original base de **1.782,30 €**.
- [ ] **CA-02 (Cálculo 100% en Servidor):** Ningún cálculo monetario o de delta procede del navegador o del frontend.
- [ ] **CA-03 (Single-Use Estricto):** Cero posibilidad de consumir dos veces el mismo token.
- [ ] **CA-04 (Separación GET/POST):** El método HTTP GET de previsualización no altera ninguna tabla de la base de datos.
- [ ] **CA-05 (Aislamiento Multi-Tenant):** Peticiones cruzadas entre imprentas o clientes de distintos tenants devuelven HTTP `403 FORBIDDEN`.
- [ ] **CA-06 (Triple Compuerta):** Una orden con delta aceptado nunca entra en `IN_PRODUCTION` si falla el pago o el preflight de lomo.
- [ ] **CA-07 (Cero Fuga de Tokens):** Ningún log del sistema ni encabezado Referer expone el token en texto claro.
