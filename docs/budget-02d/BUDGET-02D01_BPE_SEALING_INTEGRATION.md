# BUDGET-02D-01 — Integración y Sellado Criptográfico con BPE

**Proyecto:** PrintPrice OS  
**Misión:** BUDGET-02D-01 — Remediación de las fracturas críticas de integración E2E  
**Estado:** CERTIFIED  
**Rama:** `feat/budget-02d01-e2e-remediation`  
**Referencia Base:** `744bdd89676c92de2c612152e1be58fe48698fd9`  

---

## 1. Fundamentos del Sellado de Precios y Snapshot Criptográfico

El principio rector de gobernanza económica en PrintPrice OS establece que:
> **"Todo precio final aceptado por un cliente debe quedar congelado criptográficamente en un snapshot inmutable, garantizando trazabilidad absoluta frente a variaciones posteriores de costes de materias primas o tarifas de taller."**

Este contrato se formaliza en la tabla `order_pricing_snapshots` (Migración 136) y es custodiado por [`quoteService.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/quoteService.js) y [`pricingSnapshotCanonicalizer.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/utils/pricingSnapshotCanonicalizer.js).

---

## 2. Remediación del Defecto BLK-01

### 2.1 Causa Raíz
En versiones previas, la sentencia de inserción de [`quoteService.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/quoteService.js) omitía la columna física `tenant_id` en la lista de campos de `order_pricing_snapshots`:
```sql
-- Sentencia defectuosa pre-remediación:
INSERT INTO order_pricing_snapshots (
    snapshot_id, order_id, quote_id, quote_revision, snapshot_revision,
    status, currency, final_amount, formula_version,
    rate_card_id, rate_card_revision, rate_card_checksum,
    snapshot_json, snapshot_checksum, sealed_by
) VALUES (?, ?, ?, ?, ?, 'SEALED', ?, ?, ?, ?, ?, ?, ?, ?, ?)
```
Dado que la Migración 136 define:
```sql
tenant_id VARCHAR(64) NOT NULL
```
MySQL 8 en modo estricto rechazaba la inserción con error de campo sin valor por defecto. Asimismo, el servicio de revisiones BPE (`orderQuoteRevisionService.js`) abortaba fail-closed con `MISSING_SEALED_TENANT_ID`.

### 2.2 Implementación Corregida
En `acceptQuoteAndSealOrderPricing`, se valida estrictamente el inquilino antes de operar y se incluye `tenant_id` en la inserción parametrizada:

```javascript
if (!tenantId || typeof tenantId !== 'string' || !tenantId.trim()) {
    throw new Error('Tenant ID is strictly required to seal order pricing snapshot');
}

// Inserción corregida en MySQL 8:
await connection.query(
    `INSERT INTO order_pricing_snapshots (
        snapshot_id, order_id, tenant_id, printhouse_id, quote_id, quote_revision,
        snapshot_revision, status, currency, final_amount, formula_version,
        rate_card_id, rate_card_revision, rate_card_checksum,
        snapshot_json, snapshot_checksum, sealed_by
    ) VALUES (?, ?, ?, ?, ?, ?, 1, 'SEALED', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
        snapshotId,
        orderId,
        tenantId,
        printhouseId,
        quoteId,
        quoteRevision,
        currency,
        finalAmount,
        formulaVersion,
        rateCardId,
        rateCardRevision,
        rateCardChecksum,
        serializedSnapshot,
        snapshotChecksum,
        sealedBy
    ]
);
```

---

## 3. Integridad Algorítmica con BPE (Budget Pricing Engine)

Cuando una imprenta propone una alternativa de papel debido a rotura de stock (`order_paper_decisions`), el Control Plane invoca el motor de recálculo BPE determinista.

### 3.1 Preservación Inmutable de Partidas No Afectadas
El recálculo aísla exclusivamente la partida del papel sustituido (interior o cubierta). Todas las demás variables se conservan estrictamente idénticas al snapshot sellado:
- **Costes de Preimpresión y Puesta a Punto**: Congelados.
- **Costes de Impresión (Tirada / Pasadas)**: Congelados.
- **Costes de Encuadernación y Acabados**: Congelados.
- **Costes de Embalaje y Logística de Envío**: Congelados.
- **Margen Comercial Acordado**: Congelado.

### 3.2 Fórmula Determinista del Delta Económico

$$\Delta \text{Neto} = \text{Coste Papel Alternativo} - \text{Coste Papel Original}$$

$$\text{Precio Propuesto} = \text{Precio Original Sellado} + \Delta \text{Neto} \times (1 + \text{Margen})$$

$$\Delta \text{Final} = \text{Precio Propuesto} - \text{Precio Original Sellado}$$

### 3.3 Trazabilidad Criptográfica de Tarifas
El snapshot almacena:
- `rate_card_id`: Identificador de la tabla de tarifas del taller.
- `rate_card_revision`: Versión exacta aplicada en el momento del presupuesto.
- `rate_card_checksum`: Hash SHA-256 canónico de los costes unitarios de papel por kilo, máquinas y acabados.
- `snapshot_checksum`: Hash SHA-256 del JSON ordenado canónicamente de todo el desglose.

---

## 4. Pruebas y Evidencias de Certificación

1. **Aislamiento Multi-Tenant**: Si un intento de recálculo o aceptación suministra un `tenant_id` que no coincide con el snapshot sellado, el sistema rechaza la operación de forma fail-closed (`TENANT_MISMATCH`).
2. **Inmutabilidad Post-Aceptación**: La aceptación de una revisión crea una especificación efectiva activa, pero **jamás modifica, sobreescribe ni elimina el registro histórico en `order_pricing_snapshots`**, garantizando auditoría contable y peritaje forense permanente.
