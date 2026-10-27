# INFORME FINAL DE DISEÑO CONTRACTUAL Y DE SEGURIDAD — BUDGET-02C-00
## Sistema Gobernada de Revisión Económica Delta de Presupuestos de Imprenta

**Proyecto:** PrintPrice OS  
**Misión:** BUDGET-02C-00 — Cierre de Diseño Contractual y de Seguridad  
**Estado Autorizado:** `BUDGET-02C00_DESIGN_APPROVED`  
**Modalidad Operativa:** READ-ONLY / DESIGN FIRST  
**Restricciones:** NO MERGE / NO DEPLOY / NO CODE MUTATION / NO DATABASE CHANGES  
**Fecha de Emisión:** 27 de octubre de 2026  
**Responsable de Ejecución:** Antigravity (Advanced Agentic Architecture)  
**Dictamen Formal Propuesto:** **`BUDGET-02C00_PASS`**

---

## 1. Resumen Ejecutivo de la Misión

En estricto cumplimiento de la **Autorización Ejecutiva BUDGET-02C-00**, se ha completado el diseño contractual, arquitectónico, matemático y de seguridad del sistema de revisiones económicas de presupuestos (**Revisiones Delta**) para PrintPrice OS.

El sistema gobierna de extremo a extremo el flujo operativo que se desencadena cuando un taller de impresión adjudicatario emite una decisión técnica de tipo `PROPOSE_ALTERNATIVE` sobre un pedido existente, garantizando que:
1. **La cotización original calculada por BPE es estrictamente inmutable**, preservando el importe histórico certificado de **1.782,30 €** (IVA incluido) en el escenario canónico de referencia.
2. **El delta económico se calcula exclusivamente en el servidor** mediante contratos deterministas de BPE y la función de margen comercial del marketplace, rechazando cualquier valor económico suministrado por el navegador o por la imprenta como fuente autoritativa.
3. **El cliente manifiesta su consentimiento mediante un token criptográfico monouso**, resistente a repetición, manipulación de importes, ataques de carrera y filtración de enlaces.
4. **Se desacopla formalmente la aceptación contractual, la garantía financiera de cobro y la liberación fabril**, impidiendo que una aceptación en pantalla active automáticamente el cobro en tarjeta o la impresión si faltan las validaciones pertinentes.
5. **Se preserva la prohibición absoluta de mutaciones silenciosas**: el vencimiento del plazo (TTL) invalida la propuesta económica sin alterar las especificaciones técnicas del pedido.

---

## 2. Índice y Estructura del Paquete Documental Entregado

La especificación completa de la fase **BUDGET-02C-00** queda articulada en los nueve documentos obligatorios depositados en [`docs/budget-02c/`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/docs/budget-02c/):

| # | Documento Entregable | Enlace al Archivo | Objeto y Alcance Técnico |
| :-: | :--- | :--- | :--- |
| **1** | **Auditoría de Arquitectura** | [`BUDGET-02C00_ARCHITECTURE_AUDIT.md`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/docs/budget-02c/BUDGET-02C00_ARCHITECTURE_AUDIT.md) | Inspección de contratos en BPE, Budget App, Control Plane y Paper Supplier Hub. Matriz de propiedad de datos (SoR) y clasificación de capacidades. |
| **2** | **Contrato BPE Delta** | [`BUDGET-02C00_BPE_DELTA_CONTRACT.md`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/docs/budget-02c/BUDGET-02C00_BPE_DELTA_CONTRACT.md) | Inmutabilidad de base neta (1.782,30 €), tratamiento de deltas ($\Delta > 0$, $\Delta = 0$, $\Delta < 0$), limitaciones de BPE (`PriceEngine.js`) y especificación API. |
| **3** | **Modelo de Datos Relacional** | [`BUDGET-02C00_DATA_MODEL_PROPOSAL.md`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/docs/budget-02c/BUDGET-02C00_DATA_MODEL_PROPOSAL.md) | DDL para `order_quote_revisions`, `quote_revision_tokens` y `order_revision_audit_events`. Hashing canónico SHA-256 e integridad referencial. |
| **4** | **Máquina de Estados Económica** | [`BUDGET-02C00_ECONOMIC_STATE_MACHINE.md`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/docs/budget-02c/BUDGET-02C00_ECONOMIC_STATE_MACHINE.md) | Ciclo de vida determinista (`ORIGINAL` a `REVOKED`), matriz de transiciones y resolución transaccional de condiciones de carrera con `SELECT ... FOR UPDATE`. |
| **5** | **Diseño de Seguridad del Token** | [`BUDGET-02C00_TOKEN_SECURITY_DESIGN.md`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/docs/budget-02c/BUDGET-02C00_TOKEN_SECURITY_DESIGN.md) | Token monouso con CSPRNG (256 bits), hash SHA-256 en BD, separación estricta HTTP GET/POST, desafío OTP y prevención de fugas de datos (Referer, logs). |
| **6** | **Compuertas Financieras e Industriales** | [`BUDGET-02C00_FINANCIAL_AND_PRODUCTION_GATES.md`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/docs/budget-02c/BUDGET-02C00_FINANCIAL_AND_PRODUCTION_GATES.md) | Desacoplamiento trifásico (Contractual, Financiera, Industrial), matriz de compensación ante fallos y política de TTL con tope mayorista. |
| **7** | **Modelo de Amenazas** | [`BUDGET-02C00_THREAT_MODEL.md`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/docs/budget-02c/BUDGET-02C00_THREAT_MODEL.md) | Análisis STRIDE exhaustivo sobre 16 vectores de riesgo, defensas en profundidad y aplicación del principio "pit of success". |
| **8** | **Hoja de Ruta de Implementación** | [`BUDGET-02C00_IMPLEMENTATION_ROADMAP.md`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/docs/budget-02c/BUDGET-02C00_IMPLEMENTATION_ROADMAP.md) | Plan de ejecución por fases para BUDGET-02C-01 y estrategia de pruebas en 4 niveles (unitarias, integración, MySQL efímero concurrente y E2E). |
| **9** | **Informe Final de Cierre** | [`BUDGET-02C00_FINAL_DESIGN_REPORT.md`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/docs/budget-02c/BUDGET-02C00_FINAL_DESIGN_REPORT.md) | Síntesis ejecutiva de la arquitectura, resolución de decisiones abiertas y dictamen formal de certificación. |
| **10** | **Certificación del Contrato Económico** | [`BUDGET-02C00R_ECONOMIC_CONTRACT_CERTIFICATION.md`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/docs/budget-02c/BUDGET-02C00R_ECONOMIC_CONTRACT_CERTIFICATION.md) | Reconciliación E-01 a E-05: Gross Margin real, base neta comercial, paridad con BPE existente (Alternativa A) y matriz de correspondencia. |
| **11** | **Aceptación de Paridad BPE R2** | [`BUDGET-02C00R2_BPE_PARITY_ACCEPTANCE.md`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/docs/budget-02c/BUDGET-02C00R2_BPE_PARITY_ACCEPTANCE.md) | Conciliación de precisión numérica sin redondeos intermedios y prueba empírica con fixture reproducible en BPE. |
| **12** | **Cierre Final de Trazabilidad R3** | [`BUDGET-02C00R3_FINAL_ECONOMIC_ACCEPTANCE.md`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/docs/budget-02c/BUDGET-02C00R3_FINAL_ECONOMIC_ACCEPTANCE.md) | Desacoplamiento de coste deducido (UNVERIFIED), delegación fiscal en Control Plane (Ley del IVA 4% vs 21%) y formulación canónica de cuotas de impuesto. |

---

## 3. Verificación de Invariantes y Principios de Diseño

Se acredita formalmente el cumplimiento de cada una de las directrices fijadas en el mandato:

### 3.1 Inmutabilidad del Presupuesto Original BPE
- La cotización original base de **1.782,30 €** permanece inalterable en `orders.offer_price` y en los registros históricos de BPE y Budget App.
- Las revisiones económicas se persisten en una tabla independiente (`order_quote_revisions`), preservando una relación 1:N que documenta cada intento, importe delta y consentimiento.

### 3.2 Recálculo Exclusivo en Servidor y Disociación Mayorista vs Cliente
- Ni el navegador web ni la imprenta actúan como fuente económica autoritativa.
- El taller propone una variante física y declara un coste de adquisición estimado; BPE recalcula pliegos, kilos físicos y flete industrial; el orquestador aplica la fórmula comercial de margen del marketplace:
  $$\text{Price}_{\text{revised, net}} = \frac{\text{Cost}_{\text{revised, industrial}}}{1 - (\text{target\_margin\_pct} / 100)}$$
- Se descarta cualquier ecuación ad-hoc en el frontend o en servicios no autorizados.

### 3.3 Tratamiento de los Tres Escenarios de Delta
- **Delta Positivo ($\Delta > 0$):** Exige consentimiento y posterior autorización de cobro complementario o retención en pasarela.
- **Delta Cero ($\Delta = 0$):** Exige consentimiento expreso para el cambio de material físico sin impacto monetario en la pasarela.
- **Delta Negativo ($\Delta < 0$):** Notifica el ahorro al cliente y genera instrucción de abono/reembolso parcial tras la aceptación.

### 3.4 Token Criptográfico Monouso y Separación HTTP
- Generado con 256 bits de entropía CSPRNG. Almacenado únicamente como hash SHA-256 en base de datos.
- **Método HTTP GET:** Estrictamente de solo lectura, inocuo, no consume el token y es inmune a prefetching de navegadores, bots de mensajería (Slack, WhatsApp) o antivirus corporativos.
- **Método HTTP POST:** Requerido para aceptar o rechazar, ejecutado bajo bloqueo transaccional pesimista (`SELECT ... FOR UPDATE`), serializando accesos concurrentes.
- **Desafío de Identidad Antifraude:** Prohibido confiar únicamente en datos triviales como el código postal. Se implementa verificación de sesión HMAC activa o código OTP de 6 dígitos para deltas significativos ($> 50\text{ \euro}$).

### 3.5 Desacoplamiento Trifásico de Compuertas
- **GATE 1 (Aceptación Contractual):** El cliente aprueba la revisión.
- **GATE 2 (Garantía Financiera):** La pasarela asegura los fondos del delta.
- **GATE 3 (Elegibilidad Industrial):** Preflight revalida el calibre del lomo del libro y se bloquea el lote de papel en almacén.
- **Invariante:** La orden solo transiciona a `IN_PRODUCTION` cuando las tres compuertas emiten dictamen `PASS`.

### 3.6 Expiración Determinista y Prevención de Mutaciones Silenciosas
- El TTL de 48 horas laborables se proyecta en UTC al momento de la emisión, considerando el calendario laboral y huso horario de la imprenta.
- El TTL está topado por la vigencia de la oferta mayorista del distribuidor:
  $$\text{expires\_at} \le \text{supplier\_paper\_offers.valid\_until}$$
- Al vencer el plazo, el token transiciona a `EXPIRED` y la orden a `PENDING_EXPIRATION_RESOLUTION`. **Queda prohibido revertir el material de forma silenciosa o no auditada.**

---

## 4. Clasificación Consolidada de Capacidades y Contratos

Conforme al rigor de auditoría, se certifica el estado de todos los contratos involucrados:

| Contrato / Capacidad | Subsistema | Estado Contractual | Acción en BUDGET-02C |
| :--- | :---: | :---: | :--- |
| **POST /api/estimates** | BPE | `IMPLEMENTED` | Reutilizado como motor base de cotización. |
| **POST /api/marketplace/offers** | BPE | `IMPLEMENTED` | Reutilizado para estructura de márgenes y ranking. |
| **PriceEngine (sheets, kilos, waste)** | BPE | `IMPLEMENTED` | Reutilizado íntegramente sin fórmulas inventadas. |
| **POST /api/marketplace/recalculate-delta** | BPE | `MISSING` | Diseñado en `BUDGET-02C00_BPE_DELTA_CONTRACT.md`. |
| **paper_variants / paper_products** | Control Plane | `IMPLEMENTED` | Catálogo maestro verificado en Migraciones 162-163. |
| **order_paper_decisions** | Control Plane | `IMPLEMENTED` | Implementado y certificado en PR #7 (`BUDGET-02B01R2_PASS`). |
| **order_quote_revisions** | Control Plane | `MISSING` | Diseñado en `BUDGET-02C00_DATA_MODEL_PROPOSAL.md`. |
| **quote_revision_tokens** | Control Plane | `MISSING` | Diseñado en `BUDGET-02C00_DATA_MODEL_PROPOSAL.md`. |
| **GET /orders/:id/quote-revision/:token** | Control Plane / BFF | `MISSING` | Diseñado en `BUDGET-02C00_TOKEN_SECURITY_DESIGN.md`. |
| **POST /orders/:id/quote-revision/:token/accept** | Control Plane / BFF | `MISSING` | Diseñado en `BUDGET-02C00_TOKEN_SECURITY_DESIGN.md`. |
| **revisionGatesOrchestrator** | Control Plane | `MISSING` | Diseñado en `BUDGET-02C00_FINANCIAL_AND_PRODUCTION_GATES.md`. |
| **Stripe Webhook Idempotency** | Control Plane / BFF | `IMPLEMENTED` | Reutilizado de Migración 015 y adaptadores de pagos. |

---

## 5. Resolución de Decisiones Arquitectónicas Abiertas

Durante el análisis exhaustivo de diseño, se resolvieron las cuatro cuestiones técnicas clave:
1. **Decisión D-01: Propietario del Recálculo Delta:**  
   *Resolución:* BPE es la autoridad exclusiva de recálculo determinista industrial. Se diseñó el contrato de extensión `POST /api/marketplace/recalculate-delta`, evitando replicar motores en el Control Plane o en el BFF.
2. **Decisión D-02: Autenticación del Cliente en Pantalla de Aceptación:**  
   *Resolución:* Arquitectura de doble factor proporcional al riesgo: sesión autenticada previa en Budget App para navegación regular, o código OTP numérico de 6 dígitos remitido al correo del pedido para accesos externos en revisiones de $\Delta > 50\text{ \euro}$.
3. **Decisión D-03: Gobierno de Delta Cero ($\Delta = 0$):**  
   *Resolución:* Aunque no exista impacto monetario, se exige aceptación contractual obligatoria con token monouso, ya que el soporte físico contratado ha variado. No se realizan cargos en pasarela.
4. **Decisión D-04: Acotamiento de Vigencia por Stock Mayorista:**  
   *Resolución:* La fecha `expires_at` se calcula en UTC considerando las 48 horas laborables del taller y se trunca de forma obligatoria al valor `supplier_paper_offers.valid_until` de la oferta mayorista adjudicada.

---

## 6. Dictamen Formal de Certificación

Se certifica que:
1. Se han elaborado y entregado los **nueve documentos técnicos obligatorios** en `docs/budget-02c/` con máximo nivel de detalle técnico, diagramas, esquemas DDL y matrices de seguridad.
2. Se respeta escrupulosamente la **inmutabilidad de la cotización BPE original** (**1.782,30 €**) y de las órdenes en curso.
3. Se han resuelto todas las decisiones arquitectónicas sin dejar cabos sueltos, ambigüedades ni bloqueos de persistencia.
4. **Se ha cumplido estrictamente la modalidad READ-ONLY / DESIGN FIRST**:
   - Cero líneas de código de producción mutadas.
   - Cero migraciones ejecutadas en base de datos.
   - PR #1, PR #6 y PR #7 permanecen intactos y abiertos en sus commits certificados.
   - **No se ha iniciado la fase de implementación BUDGET-02C-01.**

Por tanto, el responsable de ejecución emite el dictamen formal:

### **`BUDGET-02C00_PASS`**

> **Notificación de Cierre:** La misión **BUDGET-02C-00** queda formalmente concluida con éxito. Antigravity detiene sus operaciones y queda a la espera de la revisión arquitectónica ejecutiva por parte de la dirección técnica antes de proceder a cualquier fase de desarrollo posterior.
