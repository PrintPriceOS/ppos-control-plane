# BUDGET-02C-01 — Dictamen de Certificación de Implementación
## Sistema Gobernado de Revisiones Económicas Delta, Reproducibilidad BPE y Cierre Fiscal

**Proyecto:** PrintPrice OS  
**Repositorio:** `PrintPriceOS/ppos-control-plane`  
**Misión:** BUDGET-02C-01  
**Base Técnica:** `BUDGET-02B01R2_PASS` (commit `94b205eddd22fbd5544e476d876ec37ebcad2506`)  
**Base de Diseño:** `BUDGET-02C00R3_CONDITIONAL`  
**Rama de Desarrollo:** `feat/budget-02c01-quote-revisions`  
**Pull Request:** [PrintPriceOS/ppos-control-plane PR #8](https://github.com/PrintPriceOS/ppos-control-plane/pull/8) (DRAFT)  
**Ejecución Oficial CI:** [GitHub Actions Run 40557768828](https://github.com/PrintPriceOS/ppos-control-plane/actions/runs/40557768828) — **SUCCESS**  
**Dictamen:** **`BUDGET-02C01_PASS`**  

**Restricciones Operativas Vigentes:** NO MERGE — NO DEPLOY — NO PRODUCTION CHANGES.

---

## 1. Resumen Ejecutivo y Resultados de Certificación

En cumplimiento riguroso de la **AUTORIZACIÓN EJECUTIVA BUDGET-02C-01**, se ha completado en una rama aislada (`feat/budget-02c01-quote-revisions`) la implementación íntegra del sistema gobernado de revisiones económicas versionadas ante propuestas de sustitución técnica de papel.

Todas las puertas obligatorias han sido verificadas en entorno de desarrollo controlado e integradas en el pipeline oficial de CI con MySQL 8 efímero y Vitest:

| Elemento Auditado | Requisito Mandatario | Resultado de Verificación | Estado |
| :--- | :--- | :--- | :---: |
| **Rama & Aislamiento** | Rama aislada sin mutar cotización original BPE (1.782,30 €) ni alterar PR #1, #6 o #7 | `feat/budget-02c01-quote-revisions` ramificada desde `94b205ed`. PR #1, #6, #7 intactos. | **PASS** |
| **Puerta Fiscal (Gate 2)** | Distinción legal estricta de entregas intracomunitarias exentas vs inversión del sujeto pasivo; no confiar solo en VIES; libros 4% vs comercial 21%; fail-closed `TAX_CLASSIFICATION_BLOCKED` | Implementado en `taxVatReadinessClassifierService.js` con desglose por cuotas independientes. | **PASS** |
| **Puerta BPE (Gate 3 & 5)** | Reproducibilidad algorítmica determinista; congelación de tarifas (`rates_checksum`), margen (18.5%) y especificaciones; fail-closed `RECALCULATION_BLOCKED` | Implementado en `orderQuoteRevisionService.js::recalculateDeterministicBpePrice`. | **PASS** |
| **Persistencia (Gate 4)** | Migración SQL correlativa, rollback, ledger audit trail, concurrencia `active_revision_slot`, transacciones atómicas `SELECT ... FOR UPDATE` | Migración `168_phase196g_order_quote_revisions.sql` y baseline actualizado en `migrations/migration-integrity-baseline.json`. | **PASS** |
| **Aceptación (Gate 6)** | Token monouso 256 bits CSPRNG; hash SHA-256 en BD; GET de solo lectura (inmune a prefetching); POST anti-replay y anti-expiración; OTP > 50 €; redact en logs | Implementado en servicio y rutas `/quote-revisions/review/:token`. | **PASS** |
| **Compuertas (Gate 7)** | Desacoplamiento estricto de `GATE_CONTRACTUAL`, `GATE_FINANCIAL` y `GATE_INDUSTRIAL`; sin cobro ni fabricación automática | Validado en la máquina de estados de respuesta y transiciones. | **PASS** |
| **Pruebas Automatizadas** | 22/22 pruebas unitarias/integración de revisiones + 28/28 regresión de decisiones técnicas | **50/50 pruebas superadas** localmente y 327 pruebas totales en CI oficial. | **PASS** |
| **Pipeline Oficial CI** | Ejecución limpia en GitHub Actions con compilación, migraciones MySQL 8 e integridad de esquemas | Run ID `40557768828` — Job ID `122378314943`: **SUCCESS** (2m 6s). | **PASS** |

---

## 2. Puerta de Cierre Fiscal (Gate 2)

Se ha remediado la conceptualización fiscal del sistema para cumplir estrictamente con el marco tributario de la Ley del IVA (Ley 37/1992) y la Directiva 2006/112/CE del Consejo:

### 2.1. Diferenciación de Naturaleza de Operación

1. **Entregas Intracomunitarias de Bienes Exentas (Art. 25 LIVA / Art. 138 Directiva 2006/112/CE):**
   - Calificación: Operación sujeta pero **exenta** con derecho a deducción (`exemption_flag = true`, `reverse_charge_flag = false`, `tax_rate_pct = 0.00`).
   - Condición sine qua non: Exige **prueba documental fehaciente del transporte físico efectivo** de las mercancías fuera del Territorio de Aplicación del Impuesto (TAI) español hacia otro Estado Miembro de la UE.
   - Cláusula de salvaguarda fail-closed: Si el comprador dispone de NIF-IVA intracomunitario en VIES pero la entrega se realiza localmente en taller o sin transporte internacional verificado, la operación tributa al tipo nacional general/reducido que corresponda. Si el transporte no está acreditado de forma concluyente, el clasificador fiscal emite `TAX_CLASSIFICATION_BLOCKED`.

2. **Inversión del Sujeto Pasivo (Art. 84.Uno.2º LIVA / Art. 196 Directiva 2006/112/CE):**
   - Calificación: Aplicable exclusivamente a **prestaciones de servicios** transfronterizas B2B o adquisiciones a proveedores no establecidos en el TAI (`reverse_charge_flag = true`, `exemption_flag = false`).
   - Diferencia fundamental: La impresión de libros o folletos para un cliente que adquiere el producto terminado constituye jurídicamente una **entrega de bienes corporales** (conforme a jurisprudencia comunitaria consolidada del TJUE, asunto C-88/09 *Graphic Procédé* y doctrina DGT CV2473-19), no una mera prestación de servicios de maquila salvo que el cliente aporte la totalidad del papel y tintas.

3. **Invalidez de VIES como Criterio Unidimensional:**
   - La mera validez de un NIF en VIES acredita la condición subjetiva de operador intracomunitario, pero **no determina los impuestos**. La calificación tributaria se resuelve mediante una matriz multidimensional:
     $$\text{Clasificación Fiscal} = f(\text{Producto}, \text{Operación}, \text{Jurisdicción}, \text{Comprador}, \text{Acreditación de Transporte})$$

4. **Diferenciación de Producto (Libros vs Comercial):**
   - Libros editoriales, revistas y periódicos que cumplan los requisitos de la Ley del Libro: Tipo superreducido del **4%** (Art. 91.Dos.1.2º LIVA).
   - Impresos comerciales, catálogos publicitarios, folletos de propaganda y papelería corporativa: Tipo general del **21%** (Art. 90 LIVA).

5. **Jurisdicciones Especiales:**
   - Islas Canarias: Excluidas del ámbito del IVA; sujetas al IGIC (Ley 20/1991).
   - Ceuta y Melilla: Sujetas al IPSI (Ley 8/1991).

### 2.2. Algoritmo Canónico de Cuotas de Impuesto Independientes

Para evitar discrepancias de redondeo de 1 céntimo frente a facturas emitidas por partidas desglosadas, el cálculo de la variación tributaria ($\Delta_{\text{tax}}$) se realiza mediante cuotas independientes redondeadas en servidor:

$$\text{Cuota}_{\text{base, tax}} = \operatorname{round2}\left(P_{\text{base, net}} \times \frac{t}{100}\right)$$

$$\text{Cuota}_{\text{revised, tax}} = \operatorname{round2}\left(P_{\text{revised, net}} \times \frac{t}{100}\right)$$

$$\Delta_{\text{tax}} = \text{Cuota}_{\text{revised, tax}} - \text{Cuota}_{\text{base, tax}}$$

$$\Delta_{\text{gross}} = \Delta_{\text{net}} + \Delta_{\text{tax}}$$

---

## 3. Puerta de Reproducibilidad Determinista BPE (Gate 3 & 5)

El motor de revisión económica implementado en [orderQuoteRevisionService.js](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/orderQuoteRevisionService.js) garantiza la reproducción exacta de la cotización histórica y la aplicación gobernada de la alternativa técnica:

1. **Invarianza de Líneas No Afectadas:**
   - Costes de preimpresión, planchas CTP, puesta en máquina, tirada de pliegos, encuadernación rústica cosida y transporte permanecen congelados al 100% con los valores de la cotización BPE original.

2. **Cálculo Determinista de la Sustitución de Papel:**
   - A partir del snapshot original de kilos de papel interior ($K_{\text{interior}}$) y la tarifa base del catálogo ($r_{\text{base}} = 1{,}80\text{ \euro/kg}$):
     $$C_{\text{interior, revised}} = K_{\text{revised}} \times r_{\text{revised}}$$
     $$\Delta C_{\text{direct}} = C_{\text{interior, revised}} - C_{\text{interior, base}}$$
     $$C_{\text{revised, direct}} = C_{\text{base, direct}} + \Delta C_{\text{direct}}$$

3. **Aplicación Estricta del Margen Comercial de Control Plane:**
   - El precio comercial revisado se resuelve en servidor aplicando el margen bruto congelado ($m = 0{,}185$):
     $$P_{\text{revised, net}} = \frac{C_{\text{revised, direct}}}{1 - m}$$
     $$\Delta_{\text{net}} = P_{\text{revised, net}} - P_{\text{base, net}}$$
   - **Prohibición de Pase Directo:** Ningún coste mayorista ni delta comunicado unilateralmente por la imprenta puede sustituir la fórmula de Control Plane ni inyectarse en el precio comercial sin pasar por el motor de recálculo gobernado.

4. **Bloqueo Determinista (`RECALCULATION_BLOCKED`):**
   - Si el pedido carece del snapshot BPE estructurado (`engine_quote_snapshot`), o la huella de tarifas (`rates_checksum`) no coincide con las matrices congeladas del pedido, el servicio emite `RECALCULATION_BLOCKED` impidiendo cualquier cotización especulativa.

---

## 4. Persistencia Versionada, Concurrencia y Aislamiento Multi-Tenant (Gate 4)

Se ha creado y validado la migración correlativa:
- [`migrations/168_phase196g_order_quote_revisions.sql`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/migrations/168_phase196g_order_quote_revisions.sql)
- [`migrations/rollback/rollback_168_phase196g_order_quote_revisions.sql`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/migrations/rollback/rollback_168_phase196g_order_quote_revisions.sql)
- Registro verificado en [`migrations/migration-integrity-baseline.json`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/migrations/migration-integrity-baseline.json).

### 4.1. Esquema Relacional de Tablas

1. **`order_quote_revisions`:**
   - Almacena cada versión de revisión económica vinculada a `order_id`, `decision_id`, `tenant_id` y `printhouse_id`.
   - Incluye importes netos base y revisados, deltas, tipos fiscales, cuotas tributarias, y deltas brutos.
   - Incorpora `bpe_engine_version`, `rates_checksum`, `canonical_payload_hash` (SHA-256) y compuertas trifásicas.
   - **Garantía de Concurrencia a Nivel de Base de Datos:** Columna virtual generada `active_revision_slot` con restricción única:
     ```sql
     active_revision_slot VARCHAR(64) GENERATED ALWAYS AS (
       CASE WHEN status IN ('DRAFT', 'PENDING_APPROVAL') THEN 'ACTIVE' ELSE NULL END
     ) STORED,
     UNIQUE KEY uq_order_active_slot (order_id, active_revision_slot)
     ```
     Impide físicamente que dos transacciones concurrentes mantengan activas dos revisiones simultáneas para el mismo pedido.

2. **`quote_revision_tokens`:**
   - Tokens monouso criptográficos de 256 bits (`crypto.randomBytes(32)`).
   - **Zero Plaintext Persistence:** La base de datos almacena exclusivamente el hash SHA-256 (`token_hash`), protegiendo el token contra filtraciones en copias de seguridad o accesos a tablas.
   - Control de ciclo de vida: `expires_at`, `is_used`, `consumed_at`, `otp_hash`, `otp_attempts`, `otp_expires_at`.

3. **`order_revision_audit_events`:**
   - Registro inmutable de eventos de auditoría que documenta transiciones de estado, revocaciones, respuestas de cliente y desafíos OTP con `evidence_id`, `actor_role`, `event_type`, y snapshot del payload.

---

## 5. Protocolo de Aceptación del Cliente y Tokens Monouso (Gate 6)

El protocolo de revisión y consentimiento del cliente implementa las máximas garantías de ciberseguridad:

1. **Inmunidad ante Prefetching y Crawling (GET de Solo Lectura):**
   - El endpoint `GET /quote-revisions/review/:token` no altera el estado de la base de datos ni marca el token como consumido. Permite precargas del navegador o inspecciones sin riesgo de invalidar el enlace de aceptación.

2. **Aceptación Explícita e Idempotente (POST de Consumo Único):**
   - El endpoint `POST /quote-revisions/review/:token/respond` procesa la acción (`ACCEPT` o `REJECT`) bajo una transacción con bloqueo pesimista `SELECT ... FOR UPDATE`.
   - El token se marca atómicamente como consumido (`is_used = 1`). Cualquier solicitud subsiguiente de consumo (replay attack) es rechazada con código HTTP 410 `TOKEN_ALREADY_CONSUMED`.

3. **Protección Anti-Expiración y Caducidad TTL:**
   - Si la fecha actual supera `expires_at`, el token se rechaza con código HTTP 410 `TOKEN_EXPIRED`.

4. **Desafío OTP en Importes Superiores a Umbral:**
   - Para variaciones económicas significativas ($\Delta_{\text{net}} > 50{,}00\text{ \euro}$ en la política gobernada por defecto), el sistema exige un código OTP de 6 dígitos emitido al cliente.
   - Si el código no coincide o el número de intentos supera el máximo permitido (3 intentos), la operación es rechazada con `OTP_VERIFICATION_FAILED`.

5. **Protección de Secretos en Trazas:**
   - La función `redactToken` ofusca el token en todos los logs del sistema (`abc1***def2`), impidiendo la fuga de credenciales monouso a agregadores de logs.

---

## 6. Compuertas Industriales y Financieras Desacopladas (Gate 7)

Conforme a la arquitectura gobernada de PrintPrice OS, la aprobación del cliente no desencadena de forma ciega ni el cobro bancario ni la impresión en taller:

```
[CLIENTE ACEPTA DELTA]
         │
         ├───► GATE_CONTRACTUAL  ──► PASSED (Consentimiento formal registrado)
         │
         ├───► GATE_FINANCIAL    ──► PAYMENT_PENDING (si Delta > 0, requiere autorización de cobro)
         │                            PASSED (si Delta <= 0 o sin recargo adicional)
         │
         └───► GATE_INDUSTRIAL   ──► PENDING_CLEARANCE (Taller debe validar asignación física)
```

1. **`GATE_CONTRACTUAL`:** Pasa a `PASSED` una vez auditado el consentimiento del cliente y consumido el token monouso.
2. **`GATE_FINANCIAL`:** Si $\Delta_{\text{net}} > 0$, la compuerta se sitúa en `PAYMENT_PENDING`. Requiere la confirmación de la pasarela de pagos antes de autorizar la orden definitiva.
3. **`GATE_INDUSTRIAL`:** Permanece en `PENDING_CLEARANCE` o `HOLD_PAPER_ALLOCATION`. La imprenta no recibe autorización de fabricación hasta que las compuertas contractual y financiera alcancen el estado de conformidad.

---

## 7. Evidencia de Pruebas y Pipeline Oficial de CI (Gate 8)

### 7.1. Pruebas Automatizadas Locales

Ejecución de la suite completa de revisiones económicas y regresión de decisiones técnicas:
```bash
npx vitest run tests/budget02c01_order_quote_revisions.test.js tests/budget02b01_order_paper_decisions.test.js
```
**Resultado:**
```
 ✓ tests/budget02c01_order_quote_revisions.test.js (22 tests) 16ms
 ✓ tests/budget02b01_order_paper_decisions.test.js (28 tests) 412ms

 Test Files  2 passed (2)
      Tests  50 passed (50)
   Start at  19:07:38
   Duration  2.08s
```

### 7.2. Pipeline Oficial de CI en GitHub Actions

- **Ejecución:** [Run ID 40557768828](https://github.com/PrintPriceOS/ppos-control-plane/actions/runs/40557768828)
- **Job ID:** `122378314943`
- **Rama:** `feat/budget-02c01-quote-revisions`
- **Pull Request:** [#8 (DRAFT)](https://github.com/PrintPriceOS/ppos-control-plane/pull/8)
- **Duración:** 2 minutos 6 segundos.
- **Resultado:** **`SUCCESS`** (todos los pasos en verde).

Pasos ejecutados satisfactoriamente en CI:
1. `Run actions/checkout@v3` (✓)
2. `Use Node.js` (✓)
3. `Install dependencies` (✓)
4. `Syntax Validation` (✓)
5. `Production Build` (✓)
6. `Bootstrap Canonical Ephemeral Database` (✓)
7. `Execute Database Migrations (Ephemeral CI)` (✓) — Migración 168 aplicada en MySQL 8.
8. `Autonomous Industrial Schema Integrity Check (Post-Migration 161)` (✓)
9. `Apply Phase 184G Industrial Schemas` (✓)
10. `Schema Integrity Check` (✓)
11. `Real MySQL 8 Concurrency & Idempotency Certification (BUDGET-02B-01R)` (✓)
12. `Automated Tests Execution (Vitest)` (✓) — **327 pruebas superadas** (14 suites de test en verde).

---

## 8. Inventario de Archivos y Trazabilidad

Los siguientes archivos componen la entrega de BUDGET-02C-01 en el repositorio:

1. **Migraciones de Base de Datos:**
   - [`migrations/168_phase196g_order_quote_revisions.sql`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/migrations/168_phase196g_order_quote_revisions.sql)
   - [`migrations/rollback/rollback_168_phase196g_order_quote_revisions.sql`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/migrations/rollback/rollback_168_phase196g_order_quote_revisions.sql)
   - [`migrations/migration-integrity-baseline.json`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/migrations/migration-integrity-baseline.json)

2. **Lógica de Dominio y Servicios:**
   - [`src/api/services/taxVatReadinessClassifierService.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/taxVatReadinessClassifierService.js)
   - [`src/api/services/orderQuoteRevisionService.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/orderQuoteRevisionService.js)

3. **Capa de Transporte y Rutas API:**
   - [`src/api/routes/orderQuoteRevisionRoutes.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/routes/orderQuoteRevisionRoutes.js)
   - [`src/api/routes/printhouseOrders.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/routes/printhouseOrders.js)

4. **Integración Continua y Verificación:**
   - [`.github/workflows/ci.yml`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/.github/workflows/ci.yml)
   - [`tests/budget02c01_order_quote_revisions.test.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/tests/budget02c01_order_quote_revisions.test.js)

5. **Documentación Contractual:**
   - [`docs/budget-02c/BUDGET-02C01_IMPLEMENTATION_CERTIFICATION.md`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/docs/budget-02c/BUDGET-02C01_IMPLEMENTATION_CERTIFICATION.md)

---

## 9. Capacidades No Implementadas / Alcance Diferido

En cumplimiento de las instrucciones de transparencia y precisión técnica:

1. **Sobreescritura Dinámica de Tarifas de Imprenta:** No se permite que un taller altere arbitrariamente el precio por kilo fuera de la matriz oficial de tarifas congelada (`rates_checksum`). Toda variación tarifaria requiere un nuevo snapshot emitido por el motor BPE.
2. **Envío Automático de SMS/WhatsApp para OTP:** El servicio genera, audita y valida el código OTP de forma criptográfica (`otp_hash`), pero el envío por canales externos de telecomunicaciones se canaliza a través de los adaptadores de notificación existentes en el orquestador (`notificationService`), manteniéndose desacoplado del motor de cálculo.
3. **Liquidación Automática con Pasarela de Pago:** `GATE_FINANCIAL` se sitúa en `PAYMENT_PENDING`, dejando la orden de cobro en manos del workflow financiero autorizado sin autoejecutar cargos en Stripe.

---

## 10. Dictamen Final

Se emite el dictamen formal:

### **`BUDGET-02C01_PASS`**

Queda certificado que el sistema de revisiones económicas Delta cumple con todos los requisitos contractuales, de seguridad, reproducibilidad de cotizaciones BPE y cierre fiscal exigidos.

**RECORDATORIO ESTRICTO DE SEGURIDAD OPERATIVA:**
- El Pull Request #8 permanece en estado **DRAFT**.
- **NO REALIZAR MERGE.**
- **NO REALIZAR DEPLOY.**
- **NO REALIZAR CAMBIOS EN BASES DE DATOS DE PRODUCCIÓN.**
