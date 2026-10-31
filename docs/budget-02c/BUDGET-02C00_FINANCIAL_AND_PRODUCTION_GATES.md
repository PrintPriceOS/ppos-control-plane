# COMPUERTAS FINANCIERAS Y DE PRODUCCIÓN — BUDGET-02C-00
## Desacoplamiento Trifásico: Aceptación Contractual, Garantía de Cobro y Elegibilidad Industrial

**Proyecto:** PrintPrice OS  
**Misión:** BUDGET-02C-00 — Compuertas de Control Operativo  
**Estado:** `BUDGET-02C00_DESIGN_APPROVED`  
**Modalidad Operativa:** READ-ONLY / DESIGN FIRST  
**Restricciones:** NO MERGE / NO DEPLOY / NO CODE MUTATION / NO DATABASE CHANGES  
**Fecha:** 27 de octubre de 2026  
**Autor:** Antigravity (Advanced Agentic Architecture)

---

## 1. Principio Fundamental: Desacoplamiento de Consentimiento y Fabricación

Uno de los mayores riesgos operativos en la industria gráfica es dar paso a la impresión física inmediatamente tras una aceptación en pantalla sin haber verificado la viabilidad financiera o la integridad física de los archivos adaptados.

Para blindar la plataforma frente a fraudes, quebrantos económicos y fallos de taller, **BUDGET-02C** establece formalmente una **Arquitectura Trifásica de Compuertas Independientes (Three-Gate Architecture)**:

```
┌───────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                   ORDEN EN REVISIÓN ECONÓMICA                                     │
└─────────────────────────────────────────────────┬─────────────────────────────────────────────────┘
                                                  │
                                                  ▼
┌───────────────────────────────────────────────────────────────────────────────────────────────────┐
│                     COMPUERTA 1: ACEPTACIÓN CONTRACTUAL (GATE_CONTRACTUAL)                        │
├───────────────────────────────────────────────────────────────────────────────────────────────────┤
│ • Cliente consiente la revisión mediante token criptográfico válido.                             │
│ • Verificación de identidad superada (Sesión previa u OTP de seguridad).                         │
│ • Resultado: order_quote_revisions.status = 'ACCEPTED'                                            │
└─────────────────────────────────────────────────┬─────────────────────────────────────────────────┘
                                                  │
                                                  ├─────────────────────────┐
                                          PASS    │                         │ FAIL (Rechazo / Expira)
                                                  ▼                         ▼
┌────────────────────────────────────────────────────────┐ ┌────────────────────────────────────────┐
│     COMPUERTA 2: GARANTÍA FINANCIERA (GATE_FINANCIAL)   │ │      RESOLUCIÓN COMERCIAL GOBERNADA    │
├────────────────────────────────────────────────────────┤ ├────────────────────────────────────────┤
│ • Para Δ > 0: Cobro complementario o retención Stripe. │ │ • Retorno formal a especificación base │
│ • Para Δ = 0: Confirmación de orden original sin mora. │ │ • o Cancelación bilateral acordada.    │
│ • Para Δ < 0: Emisión de nota de abono / reembolso.    │ └────────────────────────────────────────┘
└───────────────────────────┬────────────────────────────┘
                            │
                    PASS    │
                            ▼
┌────────────────────────────────────────────────────────┐
│    COMPUERTA 3: ELEGIBILIDAD INDUSTRIAL (GATE_INDUSTRY)│
├────────────────────────────────────────────────────────┤
│ • Revalidación de lomo físico (Spine preflight check). │
│ • Asignación de pliegos en Paper Supplier Hub.         │
│ • Generación de paquete de despacho con nuevas specs.  │
└───────────────────────────┬────────────────────────────┘
                            │
                    PASS    │
                            ▼
┌───────────────────────────────────────────────────────────────────────────────────────────────────┐
│                     LIBERACIÓN INDUSTRIAL COMPLETA (STATUS = 'IN_PRODUCTION')                     │
└───────────────────────────────────────────────────────────────────────────────────────────────────┘
```

**Regla de Prevalencia Absoluta:**
$$\text{Liberación Fabril} \iff \text{GATE\_CONTRACTUAL} = \text{PASS} \;\land\; \text{GATE\_FINANCIAL} = \text{PASS} \;\land\; \text{GATE\_INDUSTRIAL} = \text{PASS}$$
Bajo ninguna circunstancia una aceptación económica del cliente activará de forma automática la entrada en máquinas de un pedido si cualquiera de las otras dos compuertas permanece abierta o bloqueada.

---

## 2. Definición Detallada de las Tres Compuertas

### 2.1 Compuerta 1: Aceptación Contractual (`GATE_CONTRACTUAL`)
- **Objetivo:** Garantizar que el comprador ha asumido de forma jurídicamente vinculante y verificable el cambio de especificaciones y su impacto en el precio.
- **Criterios de Evaluación:**
  - Token en estado `PENDING` al momento de la recepción de la petición.
  - Marca temporal UTC del servidor menor o igual que `expires_at`.
  - Correspondencia estricta del hash del snapshot canónico (`snapshot_canonical_hash`).
  - Verificación de identidad satisfactoria (código OTP de 6 dígitos verificado o sesión autenticada).
- **Resultado:**
  - `PASS`: La revisión se marca como `ACCEPTED` y el token pasa a `CONSUMED`.
  - `FAIL`: Petición rechazada; la revisión permanece en su estado anterior.

### 2.2 Compuerta 2: Garantía de Cobro Financiera (`GATE_FINANCIAL`)
- **Objetivo:** Asegurar que los fondos correspondientes al delta económico están afianzados antes de autorizar el consumo de materias primas o el arranque de maquinaria.
- **Acciones Según la Naturaleza del Delta:**
  1. **Delta Positivo ($\Delta_{\text{gross}} > 0$):**  
     - Se invoca la pasarela de pagos (Stripe PaymentIntents API) utilizando el `customer_id` y el método de pago guardado de la orden original.
     - Si la pasarela confirma el cobro o la autorización de retención complementaria: `GATE_FINANCIAL = PASS`.
     - Si la tarjeta es rechazada (fondos insuficientes, autenticación SCA/3DS requerida): `GATE_FINANCIAL = HOLD_PAYMENT_FAILED`.
  2. **Delta Cero ($\Delta_{\text{gross}} = 0$):**  
     - Se verifica que el cobro original de la orden sigue consolidado y libre de disputas o retrocesos bancarios (`chargebacks`).
     - Si está consolidado: `GATE_FINANCIAL = PASS`.
  3. **Delta Negativo ($\Delta_{\text{gross}} < 0$):**  
     - Se genera una Nota de Crédito en el sistema de facturación (`invoice_credit_note_lifecycle`) y se programa un reembolso parcial en Stripe por la cuantía exacta del delta.
     - `GATE_FINANCIAL = PASS`.

### 2.3 Compuerta 3: Elegibilidad Industrial y Preflight (`GATE_INDUSTRIAL`)
- **Objetivo:** Verificar la viabilidad física del cambio de soporte antes de enviar las instrucciones finales al taller.
- **Verificaciones Obligatorias:**
  1. **Impacto en el Lomo del Libro (Spine Preflight):**  
     Al cambiar de gramaje o de tipo de papel (ej. de 90g a 120g), el grosor del lomo del libro varía matemáticamente:
     $$\text{Lomo (mm)} = \left(\frac{\text{páginas}}{2}\right) \times \text{calibre del pliego}$$
     Si el grosor del lomo varía más de un 5%, el PDF de cubierta existente (`COVER_PDF`) puede quedar desalineado o cortar textos de la solapa.
     - Si la variación de lomo es absorbible por el sangrado: Preflight aprueba.
     - Si la variación de lomo desborda el arte final: Se emite un aviso de recálculo de cubierta (`GATE_INDUSTRIAL = HOLD_SPINE_REVISION_REQUIRED`).
  2. **Bloqueo y Reserva de Material:**  
     Se confirma que el distribuidor mayorista en `supplier_paper_offers` mantiene existencias y se genera la orden de aprovisionamiento interna en `supplier_paper_procurement_orders`.
  3. **Generación del Paquete de Despacho Actualizado:**  
     Se actualiza el `dispatch_package` de taller en `marketplace_dispatch_packages` con las nuevas especificaciones inmutables.
  - Al completar los tres pasos: `GATE_INDUSTRIAL = PASS`.

---

## 3. Matriz de Estados de Compuertas y Mecanismos de Compensación

| GATE 1 (Contractual) | GATE 2 (Financiera) | GATE 3 (Industrial) | Estado Resultante de la Orden | Acción de Compensación y Mitigación Operativa |
| :---: | :---: | :---: | :--- | :--- |
| **FAIL** | — | — | `HOLD_PROPOSAL_REJECTED` | El cliente no aceptó. La orden queda en espera de resolución de taller o cancelación gobernada. Cero cargos. |
| **PASS** | **FAIL** | — | `HOLD_PAYMENT_PENDING` | El cliente aceptó pero falló el cobro de Stripe. Se remite enlace seguro de regularización de pago (ventana de 24h). El taller NO recibe orden de impresión. Si expira, se revierte la asignación industrial. |
| **PASS** | **PASS** | **FAIL** | `HOLD_TECHNICAL_PREFLIGHT` | El cliente aceptó y el dinero está retenido, pero el PDF de cubierta requiere corrección de lomo o el proveedor agotó el lote físico. Se congela la fabricación; los fondos quedan en cuenta fiduciaria sin abonar al taller. |
| **PASS** | **PASS** | **PASS** | **`IN_PRODUCTION`** | **Todas las compuertas superadas con éxito.** Se notifica al taller, se transfieren los archivos actualizados y se autoriza el corte de papel y arranque de máquinas. |

---

## 4. Política de Vigencia Temporal (TTL y Calendario Comercial)

En estricta observancia de los requisitos ejecutivos del proyecto:

### 4.1 Cálculo Determinista del TTL
- **Regla Estándar:** El plazo de aceptación por defecto es de **48 horas laborables** de taller.
- **Cálculo con Calendario de Taller:**  
  El plazo no cuenta fines de semana (sábados y domingos) ni días festivos reconocidos en el perfil geográfico del taller de impresión adjudicatario (`Europe/Madrid`).
- **Tope Mayorista Obligatorio (Inviolable):**
  $$\text{expires\_at} = \min\left(\text{issued\_at} + \text{business\_hours}(48), \text{supplier\_paper\_offers.valid\_until}\right)$$
  Si la oferta de precio del distribuidor mayorista caduca en 24 horas, la revisión económica **acorta forzosamente su vigencia** a dicho vencimiento para evitar descalces económicos al taller.

### 4.2 Prohibición de Renovación Automática
- Si un token alcanza `expires_at` sin ser consumido, pasa automáticamente a `EXPIRED`.
- **Queda terminantemente prohibido renovar automáticamente el TTL o prorrogar una revisión expirada sin recalcular.** Si la imprenta y el cliente desean retomar el trabajo, debe invocarse un nuevo recálculo BPE para verificar que las tarifas y las ofertas de distribución continúan vigentes.
