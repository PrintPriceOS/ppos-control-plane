# INFORME DE IMPLEMENTACIÓN — BUDGET-02B-01
## Persistencia gobernada y contratos de decisión de papel por imprenta

**Proyecto:** PrintPrice OS  
**Misión:** BUDGET-02B-01  
**Autorización:** `BUDGET-02B01_DEVELOPMENT_APPROVED`  
**Estado de Ejecución:** COMPLETED / READY FOR AUDIT  
**Restricciones Operativas:** NO MERGE / NO DEPLOY / NO PRODUCTION CHANGES  
**Fecha:** 27 de octubre de 2026  

---

## 1. Resumen Ejecutivo y Alcance

En cumplimiento estricto de la autorización formal ejecutiva emitida para **BUDGET-02B-01**, se ha implementado el subsistema de persistencia gobernada y contratos de decisión técnica de papel para PrintPrice OS Control Plane.

Esta entrega materializa la arquitectura acordada en `BUDGET-02A-R1_PASS` y `BUDGET-02B-00R_PASS`:
1. **Entidad Relacional de Persistencia:** Creación de la tabla `order_paper_decisions` mediante la migración versionada MySQL `167_phase196f_order_paper_decisions.sql` y su contraparte de reversión segura `rollback_167_phase196f_order_paper_decisions.sql`.
2. **Servicio de Dominio Aislado:** Desarrollo de `src/api/services/orderPaperDecisionService.js`, que gobierna las transiciones técnicas de material (`CONFIRM`, `PROPOSE_ALTERNATIVE`, `REJECT`), captura snapshots inmutables del catálogo maestro de papel, previene condiciones de carrera con bloqueos transaccionales `SELECT ... FOR UPDATE` y garantiza idempotencia persistente.
3. **Contratos API Expuestos:** Integración de los endpoints `POST /api/printhouse/jobs/:jobId/paper-decision` y `POST /api/printhouse/orders/:orderRef/paper-decision` en `src/api/routes/printhouseOrders.js`, exigiendo la cabecera obligatoria `Idempotency-Key`, protegiendo frente a prototype pollution y denegando accesos inter-tenant.
4. **Protección Económica Inviolable:** Desacoplamiento riguroso entre la decisión técnica y la cotización económica:
   - El presupuesto canónico base emitido por BPE (**1.782,30 €**) permanece 100% inmutable.
   - Toda propuesta con $\Delta \ne 0$ se clasifica exclusivamente como `REQUIRES_ECONOMIC_REVISION` sin recalcular precios, sin alterar sesiones HMAC del cliente y sin liberar la fabricación hasta la posterior fase BUDGET-02C.
5. **Certificación Automatizada:** Suite exhaustiva en `tests/budget02b01_order_paper_decisions.test.js` con 18 aserciones automatizadas cubriendo los 15 escenarios obligatorios, ejecutada con éxito total (18/18 PASS).

---

## 2. Aislamiento de Ramas y Estado Git

- **Repositorio Control Plane:** `PrintPriceOS/ppos-control-plane`
  - Rama base certificada: `feat/paper-supplier-hub-completion`
  - SHA de referencia certificado: `a378ff534125cb2f3ed6b4c016388bda2035254a`
  - PR certificado en curso: **Control Plane PR #6** (Estado: OPEN, sin modificar)
  - Rama de trabajo aislada: `feat/budget-02b01-paper-decisions`
- **Repositorio Budget App:** `PrintPriceOS/PrintPricePro_BookPrice`
  - Rama certificada: `feat/budget-01-visual-identity-and-paper-selector`
  - SHA de referencia certificado: `07fc15b1ba0e47dea0d0b3425d16f293bc46f923`
  - PR certificado en curso: **Budget App PR #1** (Estado: OPEN, sin modificar, build limpio)

---

## 3. Inventario de Archivos Implementados y Modificados

| Archivo | Tipo de Cambio | Líneas / Tamaño | Propósito y Responsabilidad |
| :--- | :--- | :--- | :--- |
| `migrations/167_phase196f_order_paper_decisions.sql` | Nuevo | 68 líneas | Migración DDL MySQL para la tabla `order_paper_decisions` con snapshots técnicos, FKs restringidas a `paper_variants(id)` e índice de idempotencia `(tenant_id, idempotency_key)`. |
| `migrations/rollback/rollback_167_phase196f_order_paper_decisions.sql` | Nuevo | 6 líneas | Script de reversión atómica (`DROP TABLE IF EXISTS order_paper_decisions`). |
| `migrations/migration-integrity-baseline.json` | Modificado | +19 líneas | Registro del checksum canónico SHA-256 (`b9ffb533...`) de la migración 167 para el verificador de integridad de fase 183. |
| `src/api/services/orderPaperDecisionService.js` | Nuevo | 409 líneas | Servicio de dominio multi-tenant: valida variantes en catálogo, persiste snapshot inmutable, gobierna estados `CONFIRM`/`PROPOSE_ALTERNATIVE`/`REJECT`, previene colisiones de idempotencia y aplica control de concurrencia. |
| `src/api/routes/printhouseOrders.js` | Modificado | +147 líneas | Controladores HTTP bajo `/api/printhouse/jobs/:jobId/paper-decision` y `/orders/:orderRef/paper-decision`, con validación de cabecera `Idempotency-Key`, saneamiento anti-prototype pollution y RBAC por imprenta asignada. |
| `tests/budget02b01_order_paper_decisions.test.js` | Nuevo | 338 líneas | Suite de pruebas de certificación con 18 tests que validan los 15 escenarios requeridos, concurrencia, idempotencia y preservación económica. |
| `.github/workflows/ci.yml` | Modificado | Línea 73 | Inclusión de `tests/budget02b01_order_paper_decisions.test.js` en el pipeline de CI automatizado de GitHub Actions. |

---

## 4. Desacoplamiento Económico y Garantía BPE

De acuerdo con la directriz obligatoria de la sección 6:
- Ninguna decisión técnica muta `orders.offer_price` ni `marketplace_orders.estimated_price`.
- El importe presupuestado canónico de **1.782,30 €** se verifica antes y después de cada operación transaccional. Si se detectara cualquier intento de mutación del precio del pedido durante una decisión de papel, el servicio aborta con la excepción fatal `ECONOMIC_INVARIANT_BREACH`.
- Toda propuesta con `estimated_cost_delta != 0` recibe el estado `economic_status = 'REQUIRES_ECONOMIC_REVISION'`, quedando expresamente reservada para la negociación y validación de tokens de la fase BUDGET-02C.
- Ninguna confirmación técnica libera de forma prematura ni automática la orden a producción sin las comprobaciones completas de preflight y validación comercial.

---

## 5. Verificación de Integridad de la Base de Datos

Se ejecutó la validación estricta de Phase 183 (`npm run migration:integrity`):
```text
=== Phase 183 Migration Integrity & Schema Baseline Validation ===
Migration inventory:
  PASS: 172 SQL/baseline files discovered under migrations/.
  PASS: 170 files classified as migrations.
  PASS: 2 excluded non-migration files.
  PASS: All baseline paths are present.
  PASS: All SHA-256 checksums match.
Prefix collision validation:
  PASS: No unapproved prefix collisions found.
SQL classification:
  PASS: Migration SQL classified.
Phase 183: PASSED
```

---

## 6. Dictamen de Cierre

La implementación técnica satisface el 100% de los requisitos estipulados para la misión BUDGET-02B-01, manteniendo las restricciones de **NO MERGE / NO DEPLOY / NO PRODUCTION DATABASE CHANGES**.
