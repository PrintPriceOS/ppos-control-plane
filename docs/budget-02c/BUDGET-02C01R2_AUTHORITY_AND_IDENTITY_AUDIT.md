# INFORME DE AUDITORÍA — AUTORIDAD ECONÓMICA E IDENTIDAD REAL
## Misión BUDGET-02C-01R2: Cierre de Autoridad Financiera, Identidad Contractual y Política Fiscal

**Proyecto:** PrintPrice OS  
**Repositorio:** `PrintPriceOS/ppos-control-plane`  
**PR:** PR #8 (`feat/budget-02c01-quote-revisions`) — Conservado en **DRAFT**  
**Commit de Entrada:** `ade575ecc28a5c0340ec399b55da305ea814e446`  
**Dictamen:** **`BUDGET-02C01R2_PASS`**  
**Restricciones:** NO MERGE / NO DEPLOY / NO PRODUCTION DATABASE CHANGES

---

## 1. SEC-C02R — Erradicación Total de Autoridad Financiera en el Cuerpo de la Petición

### 1.1. Diagnóstico de Riesgo Residual en BUDGET-02C-01R
En auditorías preliminares se detectó que componentes periféricos admitían que el cliente HTTP inyectara parámetros económicos determinantes (`originalCalculation`, `alternativeVariant`, `targetMarginPct`, tarifas o costes directos) o bien recurrían a fallbacks no verificados (como un margen fijo por defecto del 18,5 %).

### 1.2. Remediación Implementada

#### A. Compuerta en Capa de Ruteo HTTP (`src/api/routes/orderQuoteRevisionRoutes.js`)
Se implementó una verificación estricta a la entrada de la ruta `POST /quote-revisions`:
```javascript
// SEC-C02R: Strictly eliminate financial & technical authority from client body
if (
    body.originalCalculation !== undefined ||
    body.original_calculation !== undefined ||
    body.targetMarginPct !== undefined ||
    body.target_margin_pct !== undefined ||
    body.alternativeVariant !== undefined ||
    body.alternative_variant !== undefined ||
    body.rates !== undefined ||
    body.tariffs !== undefined ||
    body.cost_override !== undefined
) {
    return res.status(400).json({
        ok: false,
        error: {
            code: 'FINANCIAL_AUTHORITY_VIOLATION',
            message: 'Economic calculations, variants, rates, and margins must be resolved strictly from authoritative systems of record, not request payload.'
        }
    });
}
```
Cualquier intento de suministrar datos económicos desde el cuerpo es abortado inmediatamente con HTTP 400 `FINANCIAL_AUTHORITY_VIOLATION`.

#### B. Resolución Autoritativa Exclusiva desde Registros Confiables (`orderQuoteRevisionService.js`)
1. **Presupuesto Original y Tarifas Congeladas**:
   Resuelto obligatoriamente desde `order_pricing_snapshots` o `orderRow.offers_snapshot`.
   Si el snapshot de precios original no existe en la base de datos o está corrupto, la emisión falla cerrado:
   ```javascript
   if (!authoritativeCalculation || !authoritativeCalculation.breakdown || !authoritativeCalculation.rates) {
       throw new OrderQuoteRevisionError(
           `Order lacks an authoritative pricing snapshot. Recalculation blocked.`,
           'RECALCULATION_BLOCKED',
           422,
           { reason: 'MISSING_AUTHORITATIVE_PRICING_SNAPSHOT' }
       );
   }
   ```
2. **Variante Alternativa**:
   Resuelta exclusivamente desde el catálogo maestro `paper_variants` a partir de `decision.alternative_variant_id` (o de `decision.metadata_json.alternative_variant` si fue pre-validada por el motor de preflight).
   ```javascript
   if (!authoritativeVariant) {
       throw new OrderQuoteRevisionError(
           `Alternative variant '${decision.alternative_variant_id}' not found in master catalog or decision metadata. Recalculation blocked.`,
           'RECALCULATION_BLOCKED',
           422,
           { reason: 'ALTERNATIVE_VARIANT_NOT_FOUND', variant_id: decision.alternative_variant_id }
       );
   }
   ```
3. **Eliminación del Margen Fijo del 18,5 % como Fallback**:
   El margen comercial se extrae estrictamente de `authoritativeCalculation.target_margin_pct` o del registro de configuración de la imprenta. Si no existe margen autoritativo, el recálculo se bloquea:
   ```javascript
   if (effectiveMargin === undefined || effectiveMargin === null || isNaN(effectiveMargin)) {
       throw new OrderQuoteRevisionError(
           `Target margin percentage missing from authoritative pricing snapshot and printhouse registry. Recalculation blocked.`,
           'RECALCULATION_BLOCKED',
           422,
           { reason: 'MISSING_AUTHORITATIVE_MARGIN' }
       );
   }
   ```
4. **Inmutabilidad del Presupuesto Original**:
   El presupuesto original BPE (1.782,30 € bruto / 1.407,7301 € neto) permanece inmutable en el registro de pedidos; la revisión únicamente persiste el diferencial (*Delta*) y el importe recalculado de la variante.

---

## 2. SEC-C03R — Identidad Real Contractual del Cliente y Verificación Bajo Transacción

### 2.1. Erradicación de Identidades Ficticias
Se eliminó de raíz `client@order.local` y cualquier sufijo o dominio no verificable (`order.local`, dominios `.local` o identificadores sin TLD válido).

### 2.2. Resolución de la Identidad Contractual
En `OrderQuoteRevisionService.createQuoteRevision`, la identidad del destinatario se resuelve a partir de la entidad del pedido asegurado bajo transacción con bloqueo exclusivo de fila (`FOR UPDATE`):
1. `orderRow.customer_email`
2. `orderRow.recipient_email`
3. `orderRow.metadata_json.customer_email` / `client_email` / `billing_address.email`
4. `users.email` mediante join con `orderRow.user_id`

Si el pedido carece de una identidad de cliente contractual autenticada, o si el correo resuelto es ficticio, el procedimiento falla cerrado con HTTP 422:
```javascript
if (!authoritativeRecipientEmail) {
    throw new OrderQuoteRevisionError(
        'Order lacks an authenticated contractual customer identity. Revision issuance blocked.',
        'UNVERIFIED_RECIPIENT_IDENTITY',
        422,
        { reason: 'MISSING_CONTRACTUAL_RECIPIENT' }
    );
}

const cleanEmail = String(authoritativeRecipientEmail).trim().toLowerCase();
const emailDomain = cleanEmail.split('@')[1] || '';
if (!cleanEmail.includes('@') || emailDomain === 'order.local' || emailDomain.endsWith('.local') || !emailDomain.includes('.')) {
    throw new OrderQuoteRevisionError(
        `Fictitious customer identity '${cleanEmail}' is prohibited for quote revision issuance.`,
        'UNVERIFIED_RECIPIENT_IDENTITY',
        422,
        { reason: 'FICTITIOUS_RECIPIENT_IDENTITY', email: cleanEmail }
    );
}
```

### 2.3. Control de Discrepancia del Destinatario (Anti-Spoofing)
Si la llamada incluye opcionalmente un `recipientEmail` en el payload, el servidor comprueba que coincida con el correo contractual del pedido. Cualquier discrepancia provoca el rechazo inmediato con HTTP 403 `FORBIDDEN_RECIPIENT_MISMATCH`:
```javascript
if (recipientEmail) {
    const cleanRecipientEmail = String(recipientEmail).trim().toLowerCase();
    if (cleanRecipientEmail !== cleanEmail) {
        throw new OrderQuoteRevisionError(
            `Provided recipient email '${cleanRecipientEmail}' does not match authenticated contractual recipient '${cleanEmail}'.`,
            'FORBIDDEN_RECIPIENT_MISMATCH',
            403
        );
    }
}
```

### 2.4. Garantías Verificadas Bajo Transacción (`SELECT FOR UPDATE`)
Bajo la transacción MySQL:
- **Existencia del Pedido**: Si no existe en `orders` ni en `marketplace_orders`, se emite HTTP 404 `ORDER_NOT_FOUND`.
- **Aislamiento Multi-Tenant**: Si `orderRow.tenant_id !== tenantId`, se emite HTTP 403 `TENANT_MISMATCH`.
- **Imprenta Asignada**: Si `orderRow.offer_print_house !== effectivePrinthouseId`, se emite HTTP 403 `PRINTHOUSE_UNAUTHORIZED`.
- **Decisión Técnica Activa**: Se verifica que `order_paper_decisions` esté en estado `ACTIVE`, acción `PROPOSE_ALTERNATIVE` y estado económico `REQUIRES_ECONOMIC_REVISION`.
- **Consistencia de Pedido en Decisión**: Se comprueba que `decision.external_order_intent_id === externalOrderIntentId`.
- **Vinculación Criptográfica**: El token monouso y el OTP quedan asociados unívocamente al hash SHA-256 del correo contractual real (`recipient_email_hash`).

---

## 3. Política Fiscal y Proyección de Expiración en Horas Laborables

### 3.1. Gobernanza Fiscal del Servidor (Gate 2)
El cliente HTTP no puede dictar el tipo impositivo ni la exención fiscal. El servicio clasifica la transacción mediante `TaxVatReadinessClassifierService` a partir de los datos autoritativos del pedido:
```javascript
const authoritativeTaxContext = {
    amount: bpeResult.revised_net_price,
    currency: 'EUR',
    seller_country: 'ES',
    supplier_country: 'ES',
    customer_country: authoritativeCustomerCountry,
    customer_vat_id: orderRow.vat_number || orderMeta.vat_number || null,
    customer_type: isB2B ? 'B2B' : 'B2C',
    vies_valid: Boolean(orderMeta.vies_valid),
    cross_border_transport_verified: Boolean(orderMeta.has_proof_of_transport),
    supply_type: 'SUPPLY_OF_GOODS',
    product_category: orderRow.product_type || orderMeta.product_type || (isEditorialBook ? 'EDITORIAL_BOOK' : 'COMMERCIAL_PRINT'),
    is_editorial_book: isEditorialBook
};
```
- Para libros editoriales nacionales en España (`is_editorial_book: true`, `ES` $\to$ `ES`), aplica de forma vinculante el tipo súper reducido del **4%** (`DOMESTIC_VAT_SUPER_REDUCED_BOOKS_ART_91_DOS_1_2`).
- Para folletos y papelería comercial (`COMMERCIAL_PRINT`), aplica el régimen general del **21%**.
- Si falta información geográfica o tributaria imprescindible, se bloquea con `RECALCULATION_BLOCKED_TAX_AMBIGUITY` (422).

### 3.2. Proyección de Caducidad (48 Horas Laborables)
Se implementó `calculateBusinessHoursExpirationUtc`:
- Jornada laboral: 8 horas efectivas (09:00 a 18:00 hora local en `Europe/Madrid`).
- Descarta sábados, domingos y festivos nacionales oficiales en España.
- Persistencia estricta en UTC.
- **Acotación por Vigencia de Oferta de Proveedor**: Si el proveedor de papel indicó una vigencia de oferta (`supplier_offer_valid_until`) anterior a la expiración proyectada, el TTL se acota estrictamente a dicha fecha para evitar cotizaciones desfasadas.

---

## 4. Matriz de Cobertura y Verificación de Auditoría

| Control | Requisito Verificado | Código de Error | Resultado de Test |
| :--- | :--- | :--- | :--- |
| **SEC-C02R.1** | Inyección de `originalCalculation` en body | `FINANCIAL_AUTHORITY_VIOLATION` (400) | **PASS** |
| **SEC-C02R.2** | Inyección de `targetMarginPct` en body | `FINANCIAL_AUTHORITY_VIOLATION` (400) | **PASS** |
| **SEC-C02R.3** | Inyección de `alternativeVariant` en body | `FINANCIAL_AUTHORITY_VIOLATION` (400) | **PASS** |
| **SEC-C02R.4** | Ausencia de margen comercial en registro autoritativo | `MISSING_AUTHORITATIVE_MARGIN` (422) | **PASS** |
| **SEC-C02R.5** | Ausencia de snapshot BPE en base de datos | `MISSING_AUTHORITATIVE_PRICING_SNAPSHOT` (422) | **PASS** |
| **SEC-C03R.1** | Destinatario ficticio `client@order.local` | `UNVERIFIED_RECIPIENT_IDENTITY` (422) | **PASS** |
| **SEC-C03R.2** | Pedido sin correo de cliente contractual | `UNVERIFIED_RECIPIENT_IDENTITY` (422) | **PASS** |
| **SEC-C03R.3** | Discrepancia entre correo de llamada y contractual | `FORBIDDEN_RECIPIENT_MISMATCH` (403) | **PASS** |
| **SEC-C03R.4** | Pedido inexistente en base de datos | `ORDER_NOT_FOUND` (404) | **PASS** |
| **Fiscal.1** | Tipo impositivo resuelto por servidor (Libro 4%) | `READY` / 4% IVA superreducido | **PASS** |
| **TTL.1** | Caducidad en días laborables y acotada por proveedor | `expires_at` UTC clampado | **PASS** |

---

## 5. Conclusión de Auditoría

No existe ninguna ruta ni método en el Control Plane mediante el cual un usuario o imprenta pueda alterar el cálculo económico inyectando datos en la petición HTTP o utilizar identidades simuladas. El sistema de revisión económica queda sellado sobre registros autoritativos verificables.
