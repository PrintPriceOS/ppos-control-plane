# SPINE-01 — Especificación Técnica de Perfiles de Encuadernación (`Binding Profiles`)

**Misión:** `SPINE-01 — LIVONIA SPINE CALCULATOR: REVERSE ENGINEERING & ENGINE CONTRACT`  
**Propósito:** Parametrizar las reglas industriales del Excel de Livonia dentro de perfiles versionados, gobernados por imprenta (`printhouse_id` / `tenant_id`), evitando tratar las constantes de las líneas **Alegro** y **Colibri** como leyes universales.

---

## 1. Principio Arquitectónico: Perfiles Industriales Versionados por Imprenta

Cada imprenta en PrintPrice OS tiene su propio parque de maquinaria (por ejemplo, trenes de rústica **Müller Martini Alegro**, líneas de tapa dura **Kolbus / Colibri**, tipos de cola EVA vs PUR, galgas de hilo y calibres de cartón). Por ello:

1. **Ninguna constante empírica está codificada como literal inmutable global.** Todas residen en un `SpineBindingProfile` inmutable y versionado (`profileId` + `version`).
2. **Ciclo de vida y estado de activación por perfil (`activationStatus`):**
   - `CERTIFIED_ACTIVE`: Perfil verificado matemáticamente y autorizado para cálculo automático y liberación a Preflight (Fase 1: **Tapa blanda sin solapas** y **Tapa blanda con solapas**).
   - `REQUIRES_TECH_APPROVAL`: Perfil cuya geometría es calculada por el motor, pero que exige validación explícita de un tecnólogo de la imprenta antes de liberar una plantilla de cubierta definitiva (Fase 2: **Tapa dura con sobrecubierta**).
   - `EXPERIMENTAL_DISABLED`: Perfil documentado a partir de fórmulas parciales o ramas marcadas como inactivas en fábrica (Fase 3: **Flexi sin/con solapas**, donde Livonia anota `"pagaidām flexi neizmantojam"` para lomo recto y omite sangrado lateral en solapas de Hoja 5).

---

## 2. Catálogo Inicial de Perfiles Livonia (`v2.0.0`)

### 2.1 Perfil 1: `livonia-alegro-softcover` (`v2.0.0`)
- **Hojas origen:** Hoja 1 (`Mīkstais sējums(Alegro)`) y Hoja 2 (`Mīk. sēj. ar atlokiem (Alegro)`).
- **Estado recomendado Fase 1:** `CERTIFIED_ACTIVE`.
- **Subtipos soportados:**
  - `SOFTCOVER_STANDARD` (4 páginas de cubierta, sin solapas)
  - `SOFTCOVER_WITH_FLAPS` (6 paneles, con solapas izquierda/derecha)
- **Métodos de unión (`processingType`):**
  - `GLUED` (`Līmēts`):
    $$S_g = \operatorname{ceil}_{0.5}\left(T_{\text{bloque}} + 0.7\right)$$
  - `SEWN` (`Šūts`):
    $$S_s = \operatorname{ceil}_{0.5}\left(1.0718 \cdot \left(T_{\text{bloque}} + \frac{2 \cdot \mu_{\text{cubierta}}}{1000} - 0.66\right) + 0.9964\right)$$
- **Geometría de cubierta extendida:**
  - **Sin solapas (`SOFTCOVER_STANDARD`):**
    - Sangrado exterior perimetral (`bleedMm`): `3.0 mm` por cada uno de los 4 lados (`+6.0 mm` totales en ancho y alto).
    - Ancho neto sin sangrado (`netCoverWidthMm`): $2W + S$
    - Alto neto sin sangrado (`netCoverHeightMm`): $H$
    - Ancho total con sangrado (`flatCoverWidthMm`): $2W + S + 6$
    - Alto total con sangrado (`flatCoverHeightMm`): $H + 6$
  - **Con solapas (`SOFTCOVER_WITH_FLAPS`):**
    - Compensación de giro de solapa en portada/contraportada (`flapTurnAllowanceMm`): `+2.0 mm` por panel ($W_{\text{panel}} = W + 2$).
    - Cota auxiliar de referencia exterior de panel (`panelReferenceWidthMm`): $W_{\text{panel}} + 5 = W + 7$.
    - Ancho neto cubierta abierta sin sangrado (`netCoverWidthMm`): $2F + 2(W + 2) + S$
    - Ancho total con sangrado (`flatCoverWidthMm`): $2F + 2(W + 2) + S + 6$
    - Alto total con sangrado (`flatCoverHeightMm`): $H + 6$
- **Reglas de validación industrial:**
  - Si $F > W - 16\text{ mm}$: Error bloqueante `FLAP_WIDTH_EXCEEDS_LIMIT` (`"Atloki pārāk lieli. Samazini atlokus."`).
  - Si `processingType === 'SEWN'` y falta $\mu_{\text{cubierta}}$ (`coverCaliperUm`): El cálculo no puede certificarse como definitivo; si se usa un valor por defecto del perfil, el estado pasa a `PROVISIONAL`.

---

### 2.2 Perfil 2: `livonia-colibri-hardcover` (`v2.0.0`)
- **Hoja origen:** Hoja 3 (`Ciet. sēj. + Superv. (Colibri)`).
- **Estado recomendado Fase 1:** `REQUIRES_TECH_APPROVAL` (cálculo completo habilitado en modo asistido, sujeto a confirmación técnica de imprenta antes de producción).
- **Parámetros específicos de entrada:**
  - `endpapersMode` (`PP lapas`):
    - `FROM_BLOCK` (`No bloka`, `AA8=1`): $T_{\text{endpapers}} = 0.0\text{ mm}$
    - `SEPARATE` (`Atsevišķi`, `AA8=2`): $T_{\text{endpapers}} = 0.6\text{ mm}$
  - `boardThicknessMm` (`Papes biezums`, `AA10`):
    - Opciones permitidas: `1.0 mm` ($2T_{\text{board}} = 2.0$), `2.0 mm` ($4.0$), `2.4 mm` ($4.8$), `3.0 mm` ($6.0$).
  - `blockPaperCoating` (`Papīra krītojums`, `AA12`): `COATED` (`1`) | `UNCOATED` (`2`).
  - `spineShape` (`Muguriņas forma`, `AA14`): `ROUND` (`1`) | `SQUARE` (`2`).
  - `overhangMm` (`Kantes`, `AA16`): `3.0 mm` (`1` $\rightarrow +6\text{ mm}$ en alto de cartón) | `2.5 mm` (`2` $\rightarrow +5\text{ mm}$ en alto de cartón).
  - `foldingSignaturePages` (`Locīšana`, `AA34`): `16` (`8/12/16`, `1`) | `32` (`20/24/32`, `2`).
- **Fórmulas exactas de hinchamiento y lomo ($T_{\text{total}} = T_{\text{bloque}} + T_{\text{endpapers}}$):**
  1. **Expansión por cosido (`Uzaugums`, $T_{\text{sewn}}$):**
     - Si `COATED`: $T_{\text{sewn}} = 1.1906 \cdot T_{\text{total}} + 1.2599$
     - Si `UNCOATED` y $T_{\text{total}} \le 29$: $T_{\text{sewn}} = 1.1338 \cdot T_{\text{total}} + 1.5213$
     - Si `UNCOATED` y $T_{\text{total}} > 29$ y signatura `16`: $T_{\text{sewn}} = 1.1636 \cdot T_{\text{total}} + 1.1486$ *(emite advertencia `UNCOATED_BLOCK_OVER_29MM_TECH_REVIEW_RECOMMENDED`)*
     - Si `UNCOATED` y $T_{\text{total}} > 29$ y signatura `32`: $T_{\text{sewn}} = 1.1040 \cdot T_{\text{total}} + 1.8940$ *(emite advertencia `UNCOATED_BLOCK_OVER_29MM_TECH_REVIEW_RECOMMENDED`)*
  2. **Función de arco circular de lomo redondo $\operatorname{Arc}_{0.5}(x)$:**
     Dado el radio escalonado $R(x)$ de la tabla de 15 tramos ($x \le 78\text{ mm}$):
     $$\operatorname{Arc}_{0.5}(x) = \operatorname{mround}_{0.5}\left(2 \cdot R(x) \cdot \arcsin\left(\frac{x}{2 \cdot R(x)}\right)\right)$$
     *(Nota matemática: En Excel se escribe como `PI()*R*2*(90 - ACOS(x/(2*R))*180/PI())/180`, que por la identidad $\frac{\pi}{2} - \arccos(u) = \arcsin(u)$ es exactamente $2 R \arcsin\left(\frac{x}{2R}\right)$).*
  3. **Las 4 ramas de lomo final ($S$):**
     - `SEWN` + `ROUND`: $S = \operatorname{Arc}_{0.5}(T_{\text{sewn}}) + 1.0\text{ mm}$ (límite: $T_{\text{sewn}} \le 78\text{ mm}$)
     - `SEWN` + `SQUARE`: Sea $T_{\text{teor}} = T_{\text{total}} + 2 T_{\text{board}}$. Si $T_{\text{sewn}} > T_{\text{teor}}$, $S = \operatorname{mround}_{0.5}(T_{\text{sewn}})$; si no, $S = \operatorname{floor}_{0.5}(T_{\text{teor}})$ (límite: $T_{\text{sewn}} \le 78\text{ mm}$)
     - `GLUED` + `ROUND`: $S = \operatorname{mround}_{0.5}\left(\operatorname{Arc}_{0.5}(T_{\text{total}}) + T_{\text{board}}\right) + 2.0\text{ mm}$ (límite: $T_{\text{total}} \le 63\text{ mm}$)
     - `GLUED` + `SQUARE`: $S = \operatorname{mround}_{0.5}\left(T_{\text{total}} + 2 T_{\text{board}} + 0.5\right)$ (límite: $T_{\text{total}} \le 63\text{ mm}$)
- **Geometría de tapas (`Pape`), forro (`Vāks`) y sobrecubierta (`Supervāks`):**
  - Ancho de cartón ($W_{\text{board}}$):
    - Si `ROUND`: $W - 5\text{ mm}$ (cuando $T_{\text{total}} \le 30\text{ mm}$) o $W - 6\text{ mm}$ (cuando $T_{\text{total}} > 30\text{ mm}$).
    - Si `SQUARE`: $W - 3\text{ mm}$ (cuando $T_{\text{total}} \le 5\text{ mm}$) o $W - 5\text{ mm}$ (cuando $T_{\text{total}} > 5\text{ mm}$).
  - Alto de cartón ($H_{\text{board}}$): $H + 6\text{ mm}$ (ceja `3.0 mm`) o $H + 5\text{ mm}$ (ceja `2.5 mm`).
  - Cajo / Hendido (`hingeScoreMm` / `Rastri` $G$): Según tabla escalonada (`8, 9, 10 mm` para lomo redondo; `7, 8, 8.5, 9, 10, 10.5, 11 mm` para lomo recto).
  - Vuelta del forro (`turnInMm` / `Noloki` $U$): `19 mm` si $T_{\text{board}} = 3.0\text{ mm}$, `18 mm` en caso contrario.
  - **Dimensiones del forro extendido (`flatCover`):**
    $$W_{\text{forro}} = 2 U + 2 W_{\text{board}} + 2 G + S, \qquad H_{\text{forro}} = 2 U + H_{\text{board}}$$
  - **Dimensiones de la sobrecubierta (`dustJacket`), cuando se solicita ($F_{\text{dj}} \le W - 20\text{ mm}$):**
    - Panel frontal/trasero: $W_{\text{dj\_panel}} = W_{\text{board}} + G$
    - Ancho neto sin sangrado: $2 F_{\text{dj}} + 2(W_{\text{board}} + G) + S$
    - Ancho total con sangrado (`+6 mm`): $2 F_{\text{dj}} + 2(W_{\text{board}} + G) + S + 6$
    - Alto total con sangrado (`+6 mm`): $H_{\text{board}} + 6$

---

### 2.3 Perfil 3: `livonia-colibri-flexi` (`v2.0.0`)
- **Hojas origen:** Hoja 4 (`Flexi (Colibri)`) y Hoja 5 (`Flexi ar atlokiem (Colibri)`).
- **Estado recomendado Fase 1:** `EXPERIMENTAL_DISABLED` para liberación directa a producción (requiere validación física y confirmación de sangrado lateral en solapas).
- **Restricciones documentadas en el propio Excel:**
  - `spineShape === 'SQUARE'` devuelve bloqueo explícito `FLEXI_SQUARE_SPINE_NOT_SUPPORTED` (`"pagaidām flexi neizmantojam"`).
  - En `FLEXI_WITH_FLAPS`: $F \le W - 15\text{ mm}$, paneles de $W + 4\text{ mm}$, vueltas superiores/inferiores de `15 mm` sobre $H + 6\text{ mm}$ ($H_{\text{cover}} = H + 36\text{ mm}$), y advertencia obligatoria `FLEXI_FLAP_LATERAL_BLEED_UNVERIFIED` porque la celda `E39` del Excel no suma los `+6 mm` de sangrado horizontal en los extremos de las solapas.

---

## 3. Esquema JSON de Configuración de Perfil (`SpineBindingProfileSchema`)

```json
{
  "profileId": "livonia-alegro-softcover",
  "version": "2.0.0",
  "name": "Livonia Print — Alegro Softcover (Standard & Flaps)",
  "machineryLine": "Müller Martini Alegro",
  "activationStatus": "CERTIFIED_ACTIVE",
  "supportedBindingTypes": ["SOFTCOVER_STANDARD", "SOFTCOVER_WITH_FLAPS"],
  "supportedProcessingTypes": ["GLUED", "SEWN"],
  "roundingStepMm": 0.5,
  "softcoverRules": {
    "glued": {
      "roundingMode": "CEILING_STEP",
      "constantOffsetMm": 0.7
    },
    "sewn": {
      "roundingMode": "CEILING_STEP",
      "slopeFactor": 1.0718,
      "coverCaliperMultiplier": 2.0,
      "innerOffsetMm": -0.66,
      "outerInterceptMm": 0.9964
    },
    "bleedPerSideMm": 3.0,
    "flaps": {
      "panelTurnAllowanceMm": 2.0,
      "panelAuxReferenceOffsetMm": 5.0,
      "maxFlapWidthClearanceFromBookWidthMm": 16.0
    }
  }
}
```

