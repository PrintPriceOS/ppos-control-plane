# CERTIFICACIÓN DE CALENDARIO LABORAL Y CÓMPUTO TEMPORAL (TIME-01R)
## Misión BUDGET-02C-01R4 — Horas Laborales Reales, Pausa de Comida y Jurisdicciones

**Proyecto:** PrintPrice OS  
**Repositorio Principal:** `PrintPriceOS/ppos-control-plane`  
**Pull Request:** PR #8 (`feat/budget-02c01-quote-revisions`)  
**Estado del PR:** Conservado rigurosamente en **DRAFT**  
**Dictamen:** **`BUDGET-02C01R4_PASS`**  

---

## 1. Definición Formal de la Jornada Laboral

Para evitar ambigüedades operativas y reflejar la práctica industrial estandarizada del sector de artes gráficas, el horario operativo de la imprenta queda formalmente definido como:

1. **Jornada Estándar con Pausa de Almuerzo (`hasLunchBreak: true`, valor por defecto):**
   - **8 horas laborables efectivas al día**, distribuidas en dos turnos:
     * **Turno de Mañana:** 09:00 a 14:00 hora local (5 horas laborables).
     * **Pausa de Comida:** 14:00 a 15:00 hora local (0 horas laborables, reloj pausado).
     * **Turno de Tarde:** 15:00 a 18:00 hora local (3 horas laborables).
   - Horas transcurridas de apertura: 9 horas reloj (09:00 a 18:00).
   - Horas laborables efectivas contabilizadas: 5h + 0h + 3h = **8 horas laborables efectivas al día**.

2. **Jornada Continua sin Pausa (`hasLunchBreak: false`):**
   - **9 horas laborables continuas al día**: 09:00 a 18:00 hora local (9 horas laborables).

3. **Períodos no laborables:**
   - Fuera de horario (18:00 a 09:00 del día hábil siguiente): 0 horas laborables.
   - Fines de semana (Sábados y Domingos completos): 0 horas laborables.
   - Festivos oficiales y municipales: 0 horas laborables.

---

## 2. Algoritmo de Salto Analítico de Segmentos por Minutos

El cálculo implementado en `calculateBusinessHoursExpirationUtc({ startDate, businessHours, timezone, jurisdiction, customHolidays, hasLunchBreak })` en [`src/api/services/orderQuoteRevisionService.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/orderQuoteRevisionService.js) sustituye los bucles ingenuos hora a hora por un **salto analítico de segmentos con precisión de minuto**.

### 2.1. Reglas de Transición y Pausa

- **Inicio en cualquier minuto arbitrario:**
  * Si la emisión ocurre a las 09:15 con 8 horas laborables (con pausa de comida):
    - Día 1: Mañana consume 285 min (09:15 a 14:00 = 4h 45m). Pausa de comida 14:00–15:00 no consume minutos. Tarde consume 180 min (15:00 a 18:00 = 3h). Total consumido Día 1: 465 min (7h 45m).
    - Restan 15 minutos (480 min - 465 min).
    - Día 2: Se inicia a las 09:00 hora local y concluye a las 09:15 hora local. Exactamente 1 día hábil.
  * Si la emisión ocurre a las 13:30 con 2 horas laborables:
    - Mañana consume 30 min (13:30 a 14:00). Pausa 14:00–15:00 (0 min).
    - Tarde consume los 90 min restantes (15:00 a 16:30). Concluye a las 16:30 del mismo día.
  * Si la emisión ocurre a las 17:45 con 1 hora laborable:
    - Tarde consume 15 min (17:45 a 18:00).
    - Día siguiente consume los 45 min restantes (09:00 a 09:45).
- **Inicio durante la pausa de comida (ej. 14:30):**
  * El reloj avanza automáticamente a las 15:00 sin descontar minutos laborables.
- **Inicio fuera de horario (ej. 21:00):**
  * El reloj avanza automáticamente a las 09:00 del siguiente día laborable.

---

## 3. Soporte Multijurisdiccional y Festivos Estatutarios

El calendario no asume un régimen fijo de Madrid para todas las imprentas. Permite configurar la jurisdicción territorial de la imprenta (`ES-MD`, `ES-CT`, `ES-VC`, `ES-AN`, `ES-GA`, `ES-PV`) y festivos municipales personalizados (`customHolidays`).

### 3.1. Festivos Fijos Nacionales (Comunes en toda España)
- 1 de enero: Año Nuevo
- 6 de enero: Epifanía del Señor
- 1 de mayo: Fiesta del Trabajo
- 15 de agosto: Asunción de la Virgen
- 12 de octubre: Fiesta Nacional de España
- 1 de noviembre: Todos los Santos
- 6 de diciembre: Día de la Constitución Española
- 8 de diciembre: Inmaculada Concepción
- 25 de diciembre: Natividad del Señor
- Viernes Santo: Festivo nacional según cómputo de Pascua Meeus/Butcher.

### 3.2. Divergencias Regionales Demostradas

| Jurisdicción | Código | Festivos Específicos Diferenciales |
| :--- | :--- | :--- |
| **Comunidad de Madrid** | `ES-MD` | Jueves Santo (variable) + 2 de mayo (Fiesta de la Comunidad de Madrid) |
| **Cataluña** | `ES-CT` | Lunes de Pascua (variable) + 24 de junio (Sant Joan) + 11 de septiembre (Diada) + 26 de diciembre (Sant Esteve). **Jueves Santo es día laborable ordinario**. |
| **Comunitat Valenciana** | `ES-VC` | 19 de marzo (San José) + Lunes de Pascua (variable) + 24 de junio (Sant Joan) + 9 de octubre (Día de la Comunitat Valenciana). |
| **Andalucía** | `ES-AN` | 28 de febrero (Día de Andalucía) + Jueves Santo. |
| **Galicia** | `ES-GA` | Jueves Santo + 17 de mayo (Letras Galegas) + 25 de julio (Santiago Apóstol). |
| **País Vasco** | `ES-PV` | Jueves Santo + Lunes de Pascua + 25 de julio (Santiago Apóstol). |

### 3.3. Festivos Municipales Personalizados (`customHolidays`)
Cualquier imprenta puede incorporar en su perfil festivos patronales o locales (ej. `['05-15']` para San Isidro en Madrid capital, `['09-24']` para La Mercè en Barcelona), asegurando que el reloj se pause de forma personalizada.

---

## 4. Persistencia en UTC, Acotación por Proveedor y Expiración HTTP 410

1. **Persistencia en UTC y Transiciones CET/CEST:**
   - Todos los cálculos se proyectan en la zona IANA autoritativa de la imprenta (ej. `Europe/Madrid`) mediante `Intl.DateTimeFormat` y se persisten en formato ISO UTC en `expires_at`.
   - Las transiciones de cambio de hora (Spring Forward en marzo de CET UTC+1 a CEST UTC+2; Fall Back en octubre de CEST UTC+2 a CET UTC+1) son absorbidas de forma matemáticamente exacta sin desajustes de $\pm 1$ hora.

2. **Acotación Estricta por Oferta de Proveedor (`supplier_offer_valid_until`):**
   - Si la validez del suministro de papel expira antes de la expiración calculada de horas hábiles, la fecha límite se trunca a dicha marca temporal:
     ```javascript
     if (supplierOfferValidUntil && supplierOfferValidUntil < expiresAt) {
         expiresAt = supplierOfferValidUntil;
     }
     ```

3. **Rechazo y Transición de Estado a Expirado (HTTP 410 `TOKEN_EXPIRED`):**
   - Toda interacción posterior en `respondToQuoteRevision` verifica si `now > tokenExpires`. En caso afirmativo:
     * Se actualiza transaccionalmente `quote_revision_tokens.status = 'EXPIRED'`.
     * Se actualiza transaccionalmente `order_quote_revisions.status = 'EXPIRED'`.
     * Se emite de inmediato HTTP 410 `TOKEN_EXPIRED`.

---

## 5. Matriz de Pruebas de Certificación TIME-01R

Pruebas ejecutadas en [`tests/budget02c01r4_bpe_integrity_and_business_calendar.test.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/tests/budget02c01r4_bpe_integrity_and_business_calendar.test.js):

| ID Test | Caso de Prueba / Regla de Tiempo | Resultado Esperado | Resultado |
| :--- | :--- | :--- | :--- |
| **Test 2.1** | Jornada estándar 8h con pausa de comida: inicio 09:15 Madrid | Concluye a las 09:15 del día hábil siguiente | **PASS** (20ms) |
| **Test 2.2** | Inicio parcial a las 13:30 con 2h laborables | 30m mañana + pausa comida 14-15h + 90m tarde $\to$ 16:30 mismo día | **PASS** (1ms) |
| **Test 2.3** | Inicio al final del día a las 17:45 con 1h laborable | 15m tarde + 45m mañana siguiente $\to$ 09:45 siguiente día | **PASS** (1ms) |
| **Test 2.4** | Jornada continua 9h (`hasLunchBreak: false`): inicio 09:00 | Concluye a las 18:00 del mismo día | **PASS** (0ms) |
| **Test 2.5** | Inicio dentro de la pausa de comida (14:30) con 3h | Reloj avanza a 15:00 sin descontar $\to$ concluye a las 18:00 mismo día | **PASS** (0ms) |
| **Test 2.6** | Inicio fuera de horario (21:00) con 8h | Avanza a 09:00 siguiente día hábil $\to$ concluye 18:00 (con pausa comida) | **PASS** (1ms) |
| **Test 3.1** | Divergencia regional Madrid vs Cataluña | Jueves Santo es festivo en Madrid pero hábil en Cataluña; Lunes de Pascua y Sant Joan son hábiles en Madrid pero festivos en Cataluña | **PASS** (0ms) |
| **Test 3.2** | Valencia: San José (19 marzo) y Comunitat (9 octubre) | Reconocidos como festivos específicos estatutarios | **PASS** (0ms) |
| **Test 3.3** | Festivo municipal personalizado (San Isidro 15 mayo) | Reconocido únicamente cuando está presente en `customHolidays` | **PASS** (0ms) |
| **Test 3.4** | Perfil de imprenta en base de datos (`printhouse_profiles`) | `createQuoteRevision` carga políticas de jurisdicción, jornada y festivos | **PASS** (22ms) |
| **Test 4.1** | Intento de aceptación en `respondToQuoteRevision` tras expiración | Rechazado con HTTP 410 `TOKEN_EXPIRED`; estado persistido como `EXPIRED` | **PASS** (1ms) |
| **Test 4.2** | Clamping por `supplier_offer_valid_until` | Fecha límite acotada con precisión a la oferta del proveedor | **PASS** (15ms) |

---

## 6. Dictamen de Calendario Laboral

El cálculo temporal cumple rigurosamente las especificaciones de **artes gráficas profesionales**, garantizando exactitud matemática a nivel de minutos, respeto de pausas de comida, adaptación territorial multijurisdiccional y acotación segura de ofertas.
