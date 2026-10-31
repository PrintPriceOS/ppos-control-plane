# MODELO DE AMENAZAS Y ANÁLISIS DE SUPERFICIE DE RIESGO — BUDGET-02C-00
## Análisis Adversarial, Vectores de Ataque y Controles Defensivos para el Sistema Delta

**Proyecto:** PrintPrice OS  
**Misión:** BUDGET-02C-00 — Modelo de Amenazas  
**Estado:** `BUDGET-02C00_DESIGN_APPROVED`  
**Modalidad Operativa:** READ-ONLY / DESIGN FIRST  
**Restricciones:** NO MERGE / NO DEPLOY / NO CODE MUTATION / NO DATABASE CHANGES  
**Fecha:** 27 de octubre de 2026  
**Autor:** Antigravity (Advanced Agentic Architecture)

---

## 1. Alcance y Metodología del Análisis de Seguridad

En concordancia con los estándares de seguridad industrial y las directrices de auditoría de Trail of Bits (`differential-review`, `insecure-defaults`, `sharp-edges`), se formula el modelo de amenazas formal para el sistema de revisión económica gobernada (BUDGET-02C).

Se analiza el sistema bajo el marco **STRIDE** (Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege) considerando adversarios tanto externos (compradores maliciosos, atacantes en red) como internos (talleres comprometidos, operadores no autorizados).

---

## 2. Matriz Exhaustiva de Vectores de Ataque y Mitigaciones

A continuación se analizan los 16 vectores de amenaza críticos identificados en el mandato ejecutivo:

| ID | Vector de Amenaza / Ataque | Categoría STRIDE | Nivel de Riesgo | Mecanismo Defensivo / Control Inviolable en BUDGET-02C |
| :---: | :--- | :---: | :---: | :--- |
| **TM-01** | **Violación de Aislamiento Multi-Tenant**<br>Un taller o usuario del Tenant A intenta consultar o modificar revisiones de un pedido del Tenant B. | Elevation of Privilege | **CRÍTICO** | Toda consulta o mutación SQL exige la cláusula `WHERE tenant_id = ? AND printhouse_tenant_id = ?`. El token y la revisión validan estrictamente el contexto del tenant autenticado antes de liberar cualquier dato. |
| **TM-02** | **Acceso no autorizado por IDOR (Insecure Direct Object Reference)**<br>Un tercero intenta acceder a la previsualización adivinando o enumerando IDs de revisión. | Information Disclosure | **CRÍTICO** | Las URLs no utilizan IDs secuenciales ni UUIDs simples. El acceso exige el `rawToken` criptográfico de 256 bits de entropía. La tasa de acierto por fuerza bruta es despreciable ($2^{-256}$). |
| **TM-03** | **Manipulación de Importes en Cliente (Price Tampering)**<br>El comprador intercepta la petición `POST /accept` y modifica el cuerpo JSON enviando `accepted_delta: 0.00` en lugar de `110.82`. | Tampering | **CRÍTICO** | **Cero confianza en el cliente.** El servidor ignora cualquier cálculo enviado por el navegador y compara estrictamente el valor contra la columna `delta_gross_amount` almacenada en base de datos. Si difiere, aborta con `400 BAD_REQUEST`. |
| **TM-04** | **Falsificación del Hash Canónico (Snapshot Hash Tampering)**<br>Intento de aceptar especificaciones técnicas diferentes a las calculadas por BPE. | Tampering | **ALTO** | El servidor recalcula en tiempo de aceptación el hash SHA-256 canónico del snapshot y lo contrasta con `order_quote_revisions.snapshot_canonical_hash` mediante comparación en tiempo constante (`crypto.timingSafeEqual`) para prevenir ataques de temporización. |
| **TM-05** | **Ataque de Repetición de Tokens (Token Replay Attacks)**<br>Un atacante intercepta un token ya usado e intenta reutilizarlo para forzar múltiples aceptaciones o reinicios de ciclo. | Repudiation / DoS | **ALTO** | El ciclo de vida del token es estrictamente monouso (`Single-Use`). La transición de `PENDING` a `CONSUMED` se realiza de forma atómica bajo bloqueo transaccional pesimista. Una reutilización devuelve inmediatamente `409 CONFLICT`. |
| **TM-06** | **Aceptación Posterior a la Expiración (Clock Skew Exploit)**<br>El comprador altera el reloj de su ordenador local para enviar una aceptación fuera de plazo. | Tampering | **MEDIO** | El cliente no tiene competencia horaria. La única fuente de tiempo válida es el reloj del motor MySQL del servidor (`NOW() <= expires_at`). Si la fecha venció, el token pasa a `EXPIRED` y se rechaza con `410 GONE`. |
| **TM-07** | **Aceptación de Revisión Revocada o Reemplazada**<br>El comprador acepta una revisión antigua que el taller retiró o sustituyó por otra propuesta más reciente. | Integrity Violation | **ALTO** | La transacción verifica bajo bloqueo `status == 'PENDING'`. Si la revisión fue marcada como `REVOKED` o `SUPERSEDED`, la aceptación se rechaza con `412 PRECONDITION_FAILED`. |
| **TM-08** | **Doble Aceptación Concurrente (Race Condition / Double Submit)**<br>Dos peticiones `POST /accept` concurrentes enviadas en milisegundos idénticos desde pestañas paralelas. | Concurrency Exploit | **ALTO** | Serialización transaccional mediante `SELECT ... FOR UPDATE` en InnoDB. El primer hilo ejecuta la mutación atómica a `CONSUMED`; el segundo hilo es bloqueado y, al despertar, encuentra el estado consumido, fallando de forma segura. |
| **TM-09** | **Mutación de Decisión Técnica por el Taller a Mitad de Flujo**<br>El taller intenta registrar otra decisión de papel mientras la revisión previa está en evaluación por el cliente. | State Machine Violation | **MEDIO** | La restricción única sobre `active_role_slot` en `order_paper_decisions` y `active_revision_slot` en `order_quote_revisions` impide insertar una nueva decisión activa sin antes revocar formalmente la anterior. |
| **TM-10** | **Caducidad de la Oferta Mayorista durante el Plazo de Revisión**<br>El distribuidor retira la oferta de papel mientras el cliente tiene el token pendiente, dejando al taller en descubierto. | Financial Loss | **ALTO** | La fecha `expires_at` de la revisión se capa obligatoriamente por `supplier_paper_offers.valid_until`. Si la oferta mayorista caduca en 12 horas, el TTL del cliente se acorta a 12 horas. |
| **TM-11** | **Inyección de Parámetros o Payload Malicioso en BPE**<br>Envío de valores de gramaje o páginas negativos o exorbitantes para desbordar la memoria de BPE. | Denial of Service | **MEDIO** | Normalización rigurosa en [`Normalizer.js`](file:///c:/Users/KIKE/Downloads/ppos-pricing-engine-main/src/Normalizer.js). Rechazo de enteros no finitos, límites estrictos de páginas ($\ge 4$) y ejemplares ($\ge 1$). Fallo cerrado (`400/422`). |
| **TM-12** | **Fallo de Red o Caída de Base de Datos durante la Aceptación**<br>Caída de la conexión tras debitar al cliente pero antes de actualizar el estado de la revisión. | Inconsistency | **CRÍTICO** | Transacciones atómicas de dos fases con clave de idempotencia (`idempotency_key`). Los reintentos de la pasarela o del cliente no provocan dobles cargos ni desalineación de estados. |
| **TM-13** | **Falta de Autorización Financiera (Stripe Card Decline tras Aceptación)**<br>El cliente acepta el delta de +110 €, pero su tarjeta es rechazada en la pasarela. | Financial Risk | **CRÍTICO** | **Compuerta Financiera Independiente:** La aceptación contractual no transiciona la orden a `IN_PRODUCTION`. Pasa a `HOLD_PAYMENT_PENDING`. La imprenta no recibe autorización de imprimir hasta que el cobro esté afianzado. |
| **TM-14** | **Liberación Prematura a Producción sin Validación Industrial**<br>El taller empieza a imprimir sin adaptar el lomo de la cubierta al nuevo gramaje. | Industrial Failure | **CRÍTICO** | **Compuerta Industrial Obligatoria:** Preflight automático revalida el calibre y grosor de lomo (`spine_width_mm`). Si desborda el arte final, el paquete de despacho permanece bloqueado. |
| **TM-15** | **Fuga de Tokens por Encabezado Referer o Enlaces Compartidos**<br>El comprador comparte el enlace en redes o el navegador envía el token a analíticas de terceros. | Information Disclosure | **ALTO** | Cabecera obligatoria `Referrer-Policy: no-referrer`. Directivas `Cache-Control: no-store`. Supresión del token en herramientas de analítica y telemetría. Desafío contextual (OTP) para importes significativos. |
| **TM-16** | **Fuga de Tokens en Registros de Servidor (Logging Leakage)**<br>Los tokens quedan expuestos en texto claro en los archivos de log de Nginx o Node.js. | Information Disclosure | **ALTO** | Middleware de redacción automática en Express/Fastify que detecta patrones `qrt_[a-zA-Z0-9_-]{32,64}` y los sustituye por `qrt_***REDACTED***` antes de emitir a consola o disco. |

---

## 3. Principio del "Pit of Success" (Diseño Inmune a Errores de API)

En cumplimiento de la directriz de seguridad de Trail of Bits (`sharp-edges`):
1. **APIs Seguras por Defecto:**  
   Ningún endpoint de aceptación expone parámetros opcionales que permitan desactivar la verificación de firma, el chequeo de expiración o la validación multi-tenant.
2. **Imposibilidad de Mutación Silenciosa:**  
   No existe ningún switch o parámetro que permita forzar la expiración de un token y alterar simultáneamente el material de una orden sin auditoría.
3. **Validación Canónica de Tipos y Rangos:**  
   Todos los importes monetarios se manejan como cadenas numéricas decimales o enteros de centavos para evitar errores de redondeo de punto flotante en la capa transaccional.
