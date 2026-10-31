# INFORME DE VALIDACIÓN DE SEGURIDAD — BUDGET-02B-01
## Acreditación de Aislamiento Multi-Tenant, Idempotencia y Blindaje Económico

**Proyecto:** PrintPrice OS Control Plane  
**Misión:** BUDGET-02B-01  
**Estándar Aplicado:** Trail of Bits Principles (Least Privilege, Secure by Default, Pit of Success)  
**Estado:** `SECURITY_VALIDATED_PASS`  

---

## 1. Matriz de Validación de Controles de Seguridad (Trail of Bits)

| Control | Principio de Seguridad | Vector de Ataque Evaluado | Mecanismo de Defensa Implementado | Resultado de Test |
| :--- | :--- | :--- | :--- | :---: |
| **SEC-01** | Aislamiento Multi-Tenant | Un operador del Tenant A intenta consultar o registrar una decisión para el Tenant B (`tenant_attacker_foreign`). | Extracción de `tenantId` desde el token JWT criptográfico (`resolveActorContext`). El parámetro enviado por el cliente es ignorado o confrontado; si no coincide, rechazo con `403 TENANT_MISMATCH`. | **PASS** (Escenario 5) |
| **SEC-02** | Autorización por Imprenta Asignada | Una imprenta no asignada a la orden intenta registrar una confirmación de papel para forzar el despacho. | Verificación en base de datos de `order.offer_print_house === context.printhouseId`. Si difiere, bloqueo con `403 PRINTHOUSE_UNAUTHORIZED`. | **PASS** (Escenario 6) |
| **SEC-03** | Protección contra Prototype Pollution | Inyección de propiedades maliciosas `__proto__`, `constructor` o `prototype` en el JSON de entrada. | Función de saneamiento recursivo `detectPrototypePollution` ejecutada antes de cualquier serialización; rechazo inmediato con `400 PROTOTYPE_POLLUTION_DETECTED`. | **PASS** (HTTP Test) |
| **SEC-04** | Idempotencia Atómica | Conexiones de red inestables que provocan reintentos automáticos del cliente, o envío duplicado accidental. | Verificación de doble vía: (1) Consulta previa indexada por `(tenant_id, idempotency_key)`, respondiendo `200 OK` con `idempotent_replay = true` si el payload coincide; (2) Restricción única en base de datos `uk_opd_idempotency` que aborta colisiones a nivel de motor. | **PASS** (Escenario 9) |
| **SEC-05** | Prevención de Colisión de Idempotencia | Reutilización de una clave de idempotencia con una decisión alterada (ej. cambiar un REJECT por un CONFIRM). | Comprobación estricta de igualdad de campos clave (`external_order_intent_id`, `paper_role`, `decision_action`, `requested_variant_id`, `alternative_variant_id`); rechazo atómico con `409 IDEMPOTENCY_KEY_COLLISION`. | **PASS** (Escenario 10) |
| **SEC-06** | Control de Concurrencia y Serialización | Dos operarios en talleres distintos o dos procesos paralelos emiten decisiones simultáneas sobre el mismo libro. | Transacción MySQL con bloqueo pesimista de fila `SELECT ... FOR UPDATE` sobre `(tenant_id, external_order_intent_id, paper_role)`. Incremento monotónico de `decision_number` y marcado atómico de la decisión previa como `SUPERSEDED`. | **PASS** (Escenario 11) |
| **SEC-07** | Inmutabilidad de la Cotización BPE | La confirmación de un papel con sobrecoste muta directamente el precio final del pedido. | Inspección de invariante de precio: `order.offer_price` (**1.782,30 €**) se verifica antes y después de cada transacción. Cero mutación de precio permitida en BUDGET-02B-01. El sobrecoste se registra como `REQUIRES_ECONOMIC_REVISION` sin aplicar cargos. | **PASS** (Escenario 14) |
| **SEC-08** | Integridad Referencial y Snapshot Inmutable | Purga o modificación retroactiva de una variante de papel en el catálogo maestro. | Claves foráneas con `ON DELETE RESTRICT` impiden borrar variantes vinculadas. Snapshot técnico incrustado (`snapshot_requested_*`) preserva los atributos físicos históricos con independencia de cambios futuros en el catálogo. | **PASS** (Escenario 1 & DDL) |
| **SEC-09** | Blindaje contra Exposición Mayorista | Exfiltración de costes de compra de papel o márgenes de intermediación de PrintPrice. | `formatDecisionResponse` filtra y omite estrictamente cualquier campo de tabla mayorista (`supplier_paper_offers`). La respuesta solo contiene la variante técnica y el delta relativo del trabajo. | **PASS** (Escenarios 1-3) |
| **SEC-10** | Rechazo de Órdenes Inelegibles | Intentos de confirmar material para trabajos cancelados o cerrados por el cliente. | Comprobación del estado del pedido en base de datos; si se encuentra en `CANCELLED`, `CLOSED` o `REJECTED`, se bloquea con `422 ORDER_INELIGIBLE`. | **PASS** (Escenario 12) |

---

## 2. Análisis Diferencial de Seguridad (Blast Radius)

- **Superficie Afectada:** Exclusivamente la tabla nueva `order_paper_decisions` y las rutas autorizadas de imprenta bajo `/api/printhouse/*`.
- **Rutas Públicas del Marketplace:** Permanecen inalteradas; no se otorgó capacidad de inserción a clientes anónimos ni a tokens de preflight.
- **Riesgo de Insecure Defaults:**
  - `status` por defecto: `'ACTIVE'`.
  - `economic_status` por defecto: `'DELTA_ZERO_CONFIRMED'`.
  - Cero secretos o claves por defecto en el código fuente.
  - La clave de idempotencia es obligatoria en cada mutación (fail-closed con 400).
