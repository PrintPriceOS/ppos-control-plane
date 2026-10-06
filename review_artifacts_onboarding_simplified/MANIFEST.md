# Manifiesto de Evidencias de Onboarding de Calibración
**Proyecto:** PrintPrice OS Control Plane
**Rama:** `phase-39.2-tenant-management-console`
**Remoto Oficial (Verificado):** `https://github.com/PrintPriceOS/ppos-control-plane.git`
**Commit Base (HEAD del repositorio):** `aff7a1e2d28de72a3bc36d0989dff2bffa23c65c`
**Código Auditado y Capturado:** HEAD base `aff7a1e2d28de72a3bc36d0989dff2bffa23c65c` con modificaciones locales de integridad y robustecimiento.
**Estado del Worktree:** Modificaciones locales de auditoría aplicadas sobre `aff7a1e2d28de72a3bc36d0989dff2bffa23c65c`.

### Modificaciones Locales Aplicadas sobre `aff7a1e2d28de72a3bc36d0989dff2bffa23c65c`:
1. `src/ui/components/printhouse/onboarding/CalculationComparisonView.tsx`: Eliminado fallback de `manufacturingPrice` hacia `quotedTotalPrice`. Si falta fabricación, se marca comparación incompleta y se bloquea avance y aceptación.
2. `src/ui/components/printhouse/onboarding/SimplifiedOnboardingJourney.tsx`: Invalidación estricta de runs, comparaciones y propuestas al cambiar de documento o variante; token `calculationRequestIdRef` contra race conditions de cálculos tardíos; propagación de avisos de ambigüedad/discrepancia; preservación fiel de tintas interior 4/4 para Die Mysteriösen Steine.
3. `src/api/services/calibrationAcceptanceService.js`: Validación estricta previa a coerciones de presencia, tipo y finitud positiva de precios; verificación de signo y coherencia de residuales suministrados.
4. `scripts/capture_onboarding_evidence.py`: Captura fiel de Die Mysteriösen Steine con 1.792,00 € (sin mezcla con Stutensee 1.283 €), aviso explícito de ambigüedad con botón bloqueado y tintas interior 4/4.
5. `scripts/test_onboarding_connected_suite.js`: Harness revisable ajustado estrictamente al esquema oficial MySQL (`tenants`, `printer_nodes` sin updated_at, `printhouse_pricing_revisions` con printer_node_id y rates_checksum, `printhouse_pricing_calibration_acceptances`), validación de identidad positiva `ppos_rc_mdw0qd@127.0.0.1` en `pposrcmdw0qdtest`, descubrimiento por tenant y orden estricto de borrado FK.
6. `tests/PrinthouseOnboardingAuditAndGovernance.test.tsx` y `tests/PrinthouseOnboardingSimplifiedJourney.test.tsx`: Regresiones añadidas para ausencia de fabricación (3b.6), cambio de documento en vuelo (test 15) e invalidación de variante post-cálculo (test 16).

---

## 1. Entorno de Captura Visual y Comandos
- **Comandos Ejecutados:**
  - `npx vitest run`: Ejecución de 21 suites y 266 tests unitarios y de integración (266 pasados, 0 fallidos).
  - `npm run build`: Compilación de producción Vite (dist generado limpiamente en 11.87s).
  - `python scripts/capture_onboarding_evidence.py`: Captura de las 15 evidencias visuales con Playwright.
- **Entorno:**
  - Node.js v20+, Vite 6.4.2, React 19, TypeScript
  - Chromium headless via Playwright
  - Servidor Local: `http://localhost:3000` (Dev Server)
- **Declaración de Intercepción de Rutas (Mocks de Auditoría Visual):**
  Las 15 capturas visuales fueron obtenidas mediante Playwright interceptando las siguientes rutas de API para auditar los contratos de interfaz con los fixtures documentales auténticos:
  1. `**/api/printhouse/onboarding/quote-evidence/upload`: Retorna los datos estructurados del documento (Natur, Stutensee, Die Mysteriösen Steine con interior 4/4).
  2. `**/api/printhouse/onboarding/pricing/calibrations`: Retorna la sesión de calibración creada (`sess-cal-01`).
  3. `**/api/printhouse/onboarding/pricing/calibrations/*/ready`: Valida la preflight readiness de la sesión.
  4. `**/api/printhouse/onboarding/pricing/calibrations/*/calculate`: Retorna el cálculo del solver inverso con precios positivos y `proposedPatch`.
  5. `**/api/printhouse/onboarding/pricing/calibrations/*/accept`: Registra la aceptación gobernada y retorna la revisión inmutable.
  6. `**/api/printhouse/onboarding/pricing/revisions*`: Lista revisiones inmutables del taller.
- **Estado de Validación Conectada:** *PENDIENTE DE VALIDACIÓN CONECTADA EN ENTORNO DE PERSISTENCIA* (harness revisable entregado, no ejecutado en servidor).
- **Advertencia Legal / Técnica:** *Los checksums SHA-256 incluidos acreditan exclusivamente la integridad criptográfica de los archivos empaquetados contra alteraciones, no su validez funcional ni ejecución conectada.*

---

## 2. Inventario de Evidencias Visuales y Técnicas

| Archivo | Tipo | Descripción | Checksum SHA-256 |
|---|---|---|---|
| `01_onboarding_step1_families_dark_1366.png` | PNG (1366×768) | Paso 1: 4 familias canónicas. Selector 'En configuración' neutral sin badge ambiguo 'ACTIVO'. | `93d5acdea2a0c223d7d7bac381013d85349cdbfe38a0b3df1eb178df863d3a0b` |
| `01_onboarding_step1_families_light_1280.png` | PNG (1280×800) | Paso 1 en modo Claro: selector y familias canónicas sin desbordamiento. | `448bdc369dee2375a99f8e1f13a1ba7da41ef025d62716fb1260e399a0278c8f` |
| `02_onboarding_step2_upload_pdf_fixtures_dark_1366.png` | PNG (1366×768) | Paso 2: Entrada dual limpia (Subir PDF / Oferta manual), sin botones ficticios de terceros. | `ebc79216d13ac867cd19b4b1e6dcab77fae5fe2c687c25eafe3fc3b70ae70a28` |
| `02b_onboarding_step2_manual_offer_form_dark_1366.png` | PNG (1366×768) | Paso 2b: Formulario manual progresivo en 7 secciones con referencia de presupuesto editable y opcional. | `f14edb83ebad1da43fd3dc258ccb9ee35998828678792388fc437d1a00966c8c` |
| `03_onboarding_step3_stutensee_discrepancy_dark_1366.png` | PNG (1366×768) | Paso 3 (Stutensee): Tiradas auténticas de 250 (1.283 + 190 = 1.473 €) y 300 con discrepancia aritmética documentada (1.525 / 300 = 5,08 € real vs 3,05 € declarado en PDF). Cero cifras inventadas. | `6e2ec966eb72ff8c06efb70ba1b63d9e5727a12e6fe14b05a149975308f25f81` |
| `03b_onboarding_step3_mysteriosen_ambiguity_dark_1366.png` | PNG (1366×768) | Paso 3b (Die Mysteriösen Steine): Datos auténticos del PDF (1.792 € fab + 415 € transp = 2.207 € total, 1,47 €/ud) con aviso explícito de contradicción documental Softcover vs cartón MGP 2,4 mm y botón de comparación bloqueado/deshabilitado. | `06b53370a2fff3d63b6231cbc4d8f141d1552dd50d2ad1ac682dee1b93d83dfc` |
| `03_onboarding_step3_natur_variants_light_1280.png` | PNG (1280×800) | Paso 3 (Natur): Denominación original exacta 'Munken Print White 1.5, 80 g' (148×210 mm, 592p, cubierta cartulina 300 g, cosido; tiradas 500/600/700 con 4.321, 4.604, 4.846 € fab + 325 € transp). Cero menciones no acreditadas. | `2112485a6eb19cb7849351900ab81d711968069256a8aa98ec9692699dc9574e` |
| `04_onboarding_step4_compare_calculations_dark_1366.png` | PNG (1366×768) | Paso 4: Comparación fiel de Die Mysteriösen Steine tras resolución de ambigüedad. Fabricación declarada 1.792,00 € vs Motor 1.784,83 € (diferencia 7,17 €, residual +0.4%), 1.500 ej., Arctic Volumen 150g, 72 páginas, Tintas interior 4/4. Cero contaminación con datos de otros presupuestos ni ceros artificiales. | `6fe8517e312569e0625beec87c3a8251ffcfe855f76a77071cac0cbf72dd92d5` |
| `05_onboarding_step5_rate_proposal_dark_1366.png` | PNG (1366×768) | Paso 5: Propuesta del solver sin claves técnicas visibles (`{key}`). Bloque de garantías corregido en Dark con alto contraste y sin mención a tablas de BD. | `d59b1238fc4e3339a4e2b0f2520fee73c7574883af163e7c2d07654fddbbfc71` |
| `05b_onboarding_step5_confirm_modal_dark_1366.png` | PNG (1366×768) | Paso 5: Diálogo modal completo de aceptación gobernada. | `6d5ba05cd88e93b6de9fecca94bdeda9921975caaa2593ff730f6399d55cf3e4` |
| `05b_onboarding_step5_confirm_modal_dialog_dark_1366.png` | PNG (Close-up) | Close-up del diálogo: Redacción clara sin nombre de tabla `pricing_revisions`, describe exactamente qué guarda (parámetros industriales) y qué requiere autorización independiente. | `24329d51eddd1c2e45f3b7b9a37d891a67a6e6804b9039b2f2d6361e0910d467` |
| `06_onboarding_step1_mobile_390_dark.png` | PNG (390×844) | Móvil Paso 1: Indicador de paso comprensible con texto ('Paso 1 de 5: Qué productos fabricas') y badge neutral 'En configuración'. | `a24b4fca7fe7b0c9cb18ce07b060c35cb78a6f55cc61c85141f40a8f89d97c09` |
| `06b_onboarding_step2_mobile_390_dark.png` | PNG (390×844) | Móvil Paso 2: Indicador 'Paso 2 de 5: Añadir presupuestos', controles superiores en grid sin recortar ni desbordar. | `28db440d940e5c75375eb9eab839825deccf8b8a10893a5b19ee3cd9ed672dbd` |
| `07_onboarding_step1_en_light_1280.png` | PNG (1280×800) | Paridad lingüística en Inglés: 'In setup' y navegación sincronizada. | `f450668c2f676a4ce09c816154726d59afff4b7161ebdf57b73b51bb8ff4e96d` |
| `08_onboarding_step1_de_dark_1366.png` | PNG (1366×768) | Paridad lingüística en Alemán: 'In Konfiguration' y tipografía ajustada sin desbordamientos. | `20fa4b398a8f5293b1cfe2390eb93ee655144429f95ec8ce658be3caf5d6c845` |
| `test_onboarding_connected_suite.js` | Código JS | Harness revisable de prueba conectada para MySQL aislado (PPOS_ISOLATED_TEST_RUN=1, base pposrcmdw0qdtest, usuario ppos_rc_mdw0qd@127.0.0.1, orden estricto FK). | `3c4e22d63eacdf0aaf48e3f7ce263a086ff1d6eae50ced0606257a6691fb9f91` |
| `raw_vitest_output.log` | Log original | Log completo de ejecución de Vitest: 21 suites y 266 pruebas pasadas. | `3d2e6848e1b6ce0b3574ceafed9b8a3c7dd8b29e2e143ee4df68f459402b961f` |
| `raw_build_output.log` | Log original | Log completo de compilación de producción con Vite (`dist/` generado limpiamente). | `cb597df42b17ae35ce0d8b4a3f60f78b7cc6cf549cbae2b7667a51ac285c6071` |
| `git_diff_review.diff` | Diff original | Diff completo de todas las modificaciones de código respecto al commit base `aff7a1e`. | `ec7f5c8c9e699abcc67a202957a7f4c80f4e4872152b0d72d191f1e3d32583d2` |
| `vitest_discovered_suites.txt` | Texto | Desglose verificado de los 21 archivos descubiertos por Vitest con el conteo exacto de tests por suite (suma: 266). | `4bad9965c0b0ebc06c45dac10e63aa7b433c1748b4a37826e086b69b8aa68d11` |

---

## 3. Invariantes Comprobados en la Suite de Tests
- **Vitest**: 21 suites descubiertas y ejecutadas, 266 tests unitarios y de integración pasando (100% éxito).
- **Validación Matemática**: Validación exhaustiva con `Number.isFinite` que rechaza `NaN`, `Infinity`, `-Infinity`, ceros engañosos y números negativos en cliente y servidor.
- **Regresión Negativa de Comparación**: Se ha verificado que un presupuesto positivo con respuesta del motor ausente (`null`), incompleta o malformada (`0` o negativa) nunca muestra estado calibrado, muestra aviso de cálculo incompleto, visualiza guiones `—` con insignia 'Sin cálculo' y bloquea estrictamente el botón de avance a la propuesta.
- **Cancelación Limpia**: La cancelación en el modal gobernado produce cero escrituras en BD y ninguna mutación de tarifas.
- **Aislamiento de Tenant**: Verificada la propagación inviolable de `tenantId` y `printerNodeId` en todo el ciclo.
- **Build de Producción**: Compilación limpia con Vite (`dist/` generado en 11.87s).
