# CERTIFICACIÓN FINAL — MISIÓN BUDGET-02C-01R3
## Cierre Definitivo de Fiscalidad Confiable, Calendario Laboral IANA y Procedencia BPE

**Proyecto:** PrintPrice OS  
**Repositorio Principal:** `PrintPriceOS/ppos-control-plane`  
**Pull Request:** PR #8 (`feat/budget-02c01-quote-revisions`)  
**Estado del PR:** Conservado rigurosamente en **DRAFT**  
**Commit Auditado de Entrada:** `169773d5c96b067f96950746abb4baeab2a00ff5` (`BUDGET-02C01R2_CONDITIONAL`)  
**Commit Definitivo de Cierre:** `0cb7f10b78df0807b51e0ca65fc3646ff525c345`  
**Dictamen de Cierre:** **`BUDGET-02C01R3_PASS`**  

**Restricciones Absolutas Vigentes:**
- **NO MERGE** a ramas base o principales.
- **NO DEPLOY** a entornos de staging o producción.
- **NO PRODUCTION DATABASE CHANGES** (esquemas y pruebas ejecutados en entornos efímeros aislados).

---

## 1. Resumen Ejecutivo de Cierre de Garantías Pendientes

| Control / Garantía | Hallazgo Auditado (R2) | Solución Definitiva Implementada (R3) | Estado |
| :--- | :--- | :--- | :--- |
| **FISC-01 — Clasificación Fiscal Confiable** | Inferencia de libro editorial basada en `specs.interior_pages`; uso de `'ES'` como fallback de país de destino cuando faltaba una jurisdicción acreditada. | Erradicación total de `interior_pages` para determinar tratamiento de libro editorial. Eliminación absoluta del fallback `'ES'`: si el pedido no acredita país de destino, se evalúa `null` y falla cerrado con HTTP 422 `TAX_CLASSIFICATION_BLOCKED` (`MISSING_JURISDICTION_DATA`). Si el producto o categoría es ambiguo, falla cerrado con `TAX_CLASSIFICATION_BLOCKED`. Cobertura adversarial para catálogos con páginas interiores (21% estándar vs 4% libro), destinos desconocidos y B2B con/sin prueba de transporte transfronterizo. | **CERRADO Y CERTIFICADO** |
| **TIME-01 — Calendario Laboral Real** | `calculateBusinessHoursExpirationUtc()` utilizaba `getUTCHours()` y ventana fija 08:00–17:00 UTC con festivos sin año ni jurisdicción, ignorando el horario de verano CET/CEST de Madrid. | Reimplementación integral con `Intl.DateTimeFormat` en zona IANA `Europe/Madrid`. Soporte estricto para transiciones CET (UTC+1, 09:00–18:00 local = 08:00–17:00 UTC) y CEST (UTC+2, 09:00–18:00 local = 07:00–16:00 UTC). Calendario anual determinista con 10 festivos nacionales/regionales y cálculo de Semana Santa (Jueves y Viernes Santo) mediante algoritmo Meeus/Butcher. Persistencia en UTC y acotación estricta por `supplier_offer_valid_until`. | **CERRADO Y CERTIFICADO** |
| **BPE-01 — Procedencia Autorizada del Snapshot** | `decision.metadata_json.bpe_snapshot` se aceptaba sin prueba verificable de origen ni orden; supresión silenciosa de errores SQL en la consulta de margen comercial mediante `.catch(() => [[]])`. | Función `validateBpeSnapshotProvenance` exige versión de motor BPE (`bpe_engine_version`), checksum de tarifas (`rates_checksum`), integridad técnica (`specs`, `rates`, `breakdown`) y vinculación explícita al pedido (`order_id`/`order_ref` o sello criptográfico). Rechazo con 422 `RECALCULATION_BLOCKED` (`UNVERIFIED_SNAPSHOT_PROVENANCE`) ante snapshots sin procedencia. Eliminación del `.catch(() => [[]])` en la consulta de margen: errores de red/conexión abortan con rollback; ausencia legítima de margen falla con `MISSING_AUTHORITATIVE_MARGIN`. | **CERRADO Y CERTIFICADO** |
| **Aclaración Documental Económica** | Inconsistencia documental al presentar 1.782,30 € como bruto de 1.407,7301 €, mezclando dos fuentes de prueba distintas. | Aclaración documental explícita sin modificar cifras almacenadas: 1.782,30 € corresponde al precio comercial neto histórico de las pruebas end-to-end de pedido comercial, mientras que 1.407,7301 € corresponde al precio neto base industrial del fixture canónico BPE de 1.000 ejemplares y 128 páginas (`baselineBpeSnapshot`). | **ACLARADO Y CORREGIDO** |

---

## 2. Aclaración Documental de Líneas Base Económicas

En cumplimiento de la instrucción de auditoría:
- **1.782,30 €**: Es el importe comercial neto histórico asociado al recorrido comercial de referencia de la orden industrial en los fixtures de pruebas de pedidos anteriores.
- **1.407,7301 €**: Es el precio neto industrial de base calculado por BPE para el pliego canónico interior de 1.000 copias, 128 páginas interiores en papel offset 90g (`baselineBpeSnapshot`), sobre el cual opera la sustitución diferencial hacia 120g offset (precio revisado neto: **1.597,5215 €**, delta neto: **+189,7914 €**).
- No existe relación de tasa de IVA entre ambas cifras; se documentan separadamente para evitar cualquier confusión entre el contexto de catálogo comercial y el motor de recálculo industrial.

---

## 3. Inventario de Archivos Modificados y Creados

| Archivo | Tipo de Cambio | Resumen de Modificaciones |
| :--- | :--- | :--- |
| [`src/api/services/orderQuoteRevisionService.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/orderQuoteRevisionService.js) | Modificación | 1. Implementación de `getMadridOfficialHolidays` (festivos anuales + Jueves y Viernes Santo Meeus/Butcher).<br>2. Implementación de `getZonedDateTimeParts` y refactorización de `calculateBusinessHoursExpirationUtc` para zona IANA `Europe/Madrid` (DST-aware).<br>3. Implementación de `validateBpeSnapshotProvenance` (motor, checksum, integridad y enlace a orden).<br>4. Resolución de snapshot con validación de procedencia obligatoria en `generateQuoteRevision`.<br>5. Eliminación de `.catch(() => [[]])` en consulta SQL de margen en `printhouse_profiles`.<br>6. Erradicación de `interior_pages` para clasificar libros y eliminación de `'ES'` como fallback de país de destino.<br>7. Código de error unificado `TAX_CLASSIFICATION_BLOCKED` (422). |
| [`tests/budget02c01r3_fiscal_calendar_provenance.test.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/tests/budget02c01r3_fiscal_calendar_provenance.test.js) | Creación | 18 pruebas unitarias y de integración que certifican exhaustivamente FISC-01, TIME-01 y BPE-01. |
| [`tests/budget02c01r2_authority_identity_otp.test.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/tests/budget02c01r2_authority_identity_otp.test.js) | Modificación | Corrección del texto del test 2.6 para separar el neto canónico BPE (1.407,7301 €) de fixtures comerciales históricos. |
| [`tests/budget02c01_order_quote_revisions.test.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/tests/budget02c01_order_quote_revisions.test.js) | Modificación | Definición explícita de `delivery_country: 'ES'` y `product_type: 'BOOK'` en los pedidos del mock de base de datos. |
| [`tests/budget02c01r_security_and_bpe_adversarial.test.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/tests/budget02c01r_security_and_bpe_adversarial.test.js) | Modificación | Definición explícita de `product_type: 'BOOK'` en los pedidos del mock de base de datos. |
| [`.github/workflows/ci.yml`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/.github/workflows/ci.yml) | Modificación | Incorporación de `tests/budget02c01r3_fiscal_calendar_provenance.test.js` en el paso de ejecución de Vitest. |
| [`docs/budget-02c/BUDGET-02C01R3_FINAL_CERTIFICATION.md`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/docs/budget-02c/BUDGET-02C01R3_FINAL_CERTIFICATION.md) | Creación | Este informe de certificación final y dictamen formal de cierre. |

---

## 4. Matriz de Pruebas de Certificación R3

### 4.1. FISC-01: Clasificación Fiscal Confiable
- **Test 1.1:** Producto con 128 páginas interiores pero `product_type: 'CATALOG'` $\implies$ clasificado con tipo general del 21% (`DOMESTIC_VAT_STANDARD`), impidiendo la aplicación indebida del 4% superreducido.
- **Test 1.2:** Producto con 128 páginas interiores y `product_type: 'BOOK'` $\implies$ clasificado con 4% superreducido (Art. 91.Dos.1.2º Ley del IVA).
- **Test 1.3:** Pedido sin jurisdicción de entrega (`delivery_country` nulo y sin dirección en metadatos) $\implies$ falla cerrado con HTTP 422 `TAX_CLASSIFICATION_BLOCKED` (`MISSING_JURISDICTION_DATA`), certificando la eliminación del fallback `'ES'`.
- **Test 1.4:** Operación intracomunitaria B2B con VIES válido y prueba de transporte transfronterizo acreditada $\implies$ 0% exenta de IVA (`INTRA_EU_SUPPLY_OF_GOODS_EXEMPT`).
- **Test 1.5:** Operación intracomunitaria B2B con VIES válido pero sin prueba de transporte transfronterizo $\implies$ bloqueada con 422 `TAX_CLASSIFICATION_BLOCKED` (`UNVERIFIED_CROSS_BORDER_DISPATCH`).
- **Test 1.6:** Operación intracomunitaria B2C $\implies$ bloqueada con 422 `TAX_CLASSIFICATION_BLOCKED` pendiente de régimen OSS (`INTRA_EU_B2C_REVIEW_REQUIRED`).

### 4.2. TIME-01: Calendario Laboral Real (Europe/Madrid, DST y Festivos)
- **Test 2.1:** Horario laboral de verano (CEST, UTC+2): 09:00 Madrid corresponde exactamente a 07:00 UTC; 9 horas laborables concluyen a las 18:00 CEST (16:00 UTC).
- **Test 2.2:** Horario laboral de invierno (CET, UTC+1): 09:00 Madrid corresponde exactamente a 08:00 UTC; 9 horas laborables concluyen a las 18:00 CET (17:00 UTC).
- **Test 2.3:** Transición de cambio de hora primaveral (Spring Forward CET $\to$ CEST, último domingo de marzo): cómputo exacto sin error de 1 hora a través del fin de semana.
- **Test 2.4:** Transición de cambio de hora otoñal (Fall Back CEST $\to$ CET, último domingo de octubre): cómputo exacto sin error de 1 hora a través del fin de semana.
- **Test 2.5:** Salto de festivos oficiales de la Comunidad de Madrid (1 de mayo y 2 de mayo): la caducidad se proyecta al lunes hábil siguiente.
- **Test 2.6:** Algoritmo determinista Meeus/Butcher: verificación de Jueves Santo y Viernes Santo calculados por año.

### 4.3. BPE-01: Procedencia Autorizada del Snapshot y Propagación de Errores SQL
- **Test 3.1:** Snapshot anónimo o desvinculado en `decision.metadata_json.bpe_snapshot` $\implies$ rechazado con HTTP 422 `RECALCULATION_BLOCKED` (`UNVERIFIED_SNAPSHOT_PROVENANCE`).
- **Test 3.2:** Snapshot en `decision.metadata_json.bpe_snapshot` con vinculación acreditada a `order_id` $\implies$ aceptado y procesado determinísticamente.
- **Test 3.3:** Snapshot sin versión de motor BPE $\implies$ rechazado con `MISSING_BPE_ENGINE_VERSION`.
- **Test 3.4:** Snapshot con formato corrupto de checksum de tarifas $\implies$ rechazado con `INCOMPATIBLE_RATES_CHECKSUM`.
- **Test 3.5:** Error de conexión o fallo de base de datos durante la consulta de `printhouse_profiles` $\implies$ la excepción no se suprime; se aborta la transacción con `ROLLBACK` y el error real se propaga.
- **Test 3.6:** Ausencia legítima de configuración de margen comercial $\implies$ diferenciada del error de BD, fallando limpiamente con 422 `MISSING_AUTHORITATIVE_MARGIN`.

---

## 5. Evidencias de Verificación

### 5.1. Ejecución Conjunta de Suites Vitest (115 pruebas superadas al 100%)
```text
 ✓ tests/budget02c01r3_fiscal_calendar_provenance.test.js (18 tests) 118ms
 ✓ tests/budget02c01r2_authority_identity_otp.test.js (23 tests) 206ms
 ✓ tests/budget02c01r_security_and_bpe_adversarial.test.js (24 tests) 295ms
 ✓ tests/budget02c01_order_quote_revisions.test.js (22 tests) 203ms
 ✓ tests/budget02b01_order_paper_decisions.test.js (28 tests) 79ms

 Test Files  5 passed (5)
      Tests  115 passed (115)
   Duration  2.81s
```

### 5.2. Verificación de Integridad de Migraciones (Phase 183)
```text
=== Phase 183 Migration Integrity & Schema Baseline Validation ===
  PASS: 173 SQL/baseline files discovered under migrations/.
  PASS: 171 files classified as migrations.
  PASS: All baseline paths are present.
  PASS: All SHA-256 checksums match.
Phase 183: PASSED
```

### 5.3. Compilación de Producción (Vite Build)
```text
vite v6.4.2 building for production...
✓ 3579 modules transformed.
dist/index.html                            2.03 kB │ gzip:   0.81 kB
dist/assets/index-5HFbkmVo.css           334.15 kB │ gzip:  45.02 kB
dist/assets/index-BDY5kSH5.js          4,306.80 kB │ gzip: 871.77 kB
✓ built in 13.66s
```

---

## 6. Dictamen Definitivo

Habiendo acreditado plenamente el cierre de las tres garantías pendientes:
1. **FISC-01**: Clasificación fiscal confiable por servidor sin inferencias por páginas interiores ni fallbacks de jurisdicción.
2. **TIME-01**: Calendario laboral real y verificable en zona IANA `Europe/Madrid` con festivos y horario de verano e invierno.
3. **BPE-01**: Procedencia e integridad verificada del snapshot BPE con eliminación de supresión silenciosa de errores SQL.
4. **Claridad documental**: Separación indiscutible entre el precio comercial histórico (1.782,30 €) y el precio neto industrial canónico BPE (1.407,7301 €).

Se emite de forma concluyente la certificación:

# **`BUDGET-02C01R3_PASS`**

### Estado del Entorno
- Pull Request #8 conservado estrictamente en **DRAFT**.
- **NO MERGE — NO DEPLOY — NO PRODUCTION DATABASE CHANGES**.
- Repositorio y rama de PR actualizados con el SHA definitivo para auditoría independiente.
