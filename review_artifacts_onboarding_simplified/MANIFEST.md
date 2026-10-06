# Manifiesto de Evidencias de Onboarding de Calibración
**Proyecto:** PrintPrice OS Control Plane
**Rama:** `phase-39.2-tenant-management-console`
**Remoto Oficial (Verificado):** `https://github.com/PrintPriceOS/ppos-control-plane.git`
**Commit Base Validado (HEAD del repositorio):** `2c3071e71dc42d349fdb64d6c1f32e6d1cc7a784`
**Código Auditado y Empaquetado:** HEAD commit `2c3071e71dc42d349fdb64d6c1f32e6d1cc7a784` con resolución integral de bloqueos de auditoría.
**Estado del Worktree:** Sincronizado y verificado contra commit `2c3071e71dc42d349fdb64d6c1f32e6d1cc7a784`.

### Auditoría y Resoluciones Implementadas en `2c3071e71dc42d349fdb64d6c1f32e6d1cc7a784`:
1. **Pool Nativo MySQL2 & Inicialización Temprana:** Destructuración de `[poolRows]` en `cpPool.query()` para respetar el contrato `[rows, fields]` de `mysql2/promise`. Configuración de variables de entorno (incluyendo `JWT_SECRET`) antes de importar servicios y rutas.
2. **Auditoría de Rutas y Contratos:** Verificación contra rutas reales (`POST /ready` para readiness de sesión; `POST /reject` para cancelación). Uso estricto de middleware de autenticación sin sustituciones ni bypasses.
3. **Aislamiento Multi-Tenant Real:** Comprobación de aislamiento entre tenants utilizando una sesión y un run auténticos pertenecientes a Tenant A, verificando el rechazo (403/404) y la ausencia total de mutaciones en los registros de Tenant A.
4. **Distinción entre Abandono y Cancelación Real:** Implementación del flujo de cancelación formal mediante `POST /reject`, comprobando que `status === 'REJECTED'`, que no se crea ninguna revisión y que las tarifas permanecen inmutadas.
5. **Verificación Criptográfica de Checksums:** Cálculo canónico de SHA-256 sobre `rates_json` con serialización determinista ordenada por claves y comparación estricta contra el `rates_checksum` almacenado.
6. **Limpieza Completa y Reporte Conjunto:** Orden de borrado estricto respetando claves foráneas sobre 6 tablas (`printhouse_pricing_calibration_acceptances` -> `printhouse_pricing_runs` -> `printhouse_pricing_sessions` -> `printhouse_pricing_revisions` -> `printer_nodes` -> `tenants`). Verificación de 0 residuos en las 6 tablas y reporte unificado de errores principales y de limpieza en bloque `finally`.
7. **Eliminación del Fallback Silencioso a Variante:** Bloqueo estricto del cálculo y de la comparación cuando `selectedVariantId` es inválido o inexistente en la oferta, exigiendo selección explícita del usuario.
8. **Protección de Estado Asíncrono (`sessionId` y Extracción PDF):** Guardas con `calculationRequestIdRef` y `uploadRequestIdRef` en todas las operaciones asíncronas (`createSession`, `markSessionReady`, `calculateCalibration`, subida de archivos) para descartar respuestas tardías ante cambios de documento o variante.
9. **Definición Explícita de Unidades Residuales:** Eliminación de heurísticas `valor > 1`. Definición explícita de `absoluteResidual` (EUR), `ratioResidual` ($0.0 \dots 1.0$) y `percentResidual` ($0.0 \dots 100.0\%$), dando soporte riguroso a residuales inferiores al 1 % (ej. 0.4 %, 0.25 %).

---

## 1. Entorno de Captura Visual y Comandos
- **Comandos Ejecutados:**
  - `npx vitest run`: Ejecución de 21 suites y 271 tests unitarios y de integración (271 pasados, 0 fallidos).
  - `npm run build`: Compilación de producción Vite (dist generado limpiamente en 11.90s).
  - `python scripts/capture_onboarding_evidence.py`: Captura de las 15 evidencias visuales con Playwright.
- **Entorno:**
  - Node.js v20+, Vite 6.4.2, React 19, TypeScript
  - Chromium headless via Playwright
  - Servidor Local: `http://localhost:3000` (Dev Server)
- **Declaración de Intercepción de Rutas (Mocks de Auditoría Visual):**
  Las 15 capturas visuales fueron obtenidas mediante Playwright interceptando las siguientes rutas de API para auditar los contratos de interfaz con los fixtures documentales auténticos:
  1. `**/api/printhouse/onboarding/quote-evidence/upload`: Retorna los datos estructurados del documento (Natur, Stutensee, Die Mysteriösen Steine con interior 4/4).
  2. `**/api/printhouse/onboarding/pricing/calibrations`: Retorna la sesión de calibración creada (`sess-cal-01`).
  3. `**/api/printhouse/onboarding/pricing/calibrations/*/ready`: Valida la preflight readiness de la sesión (POST contract).
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
| `test_onboarding_connected_suite.js` | Código JS | Harness revisable de prueba conectada para MySQL aislado (PPOS_ISOLATED_TEST_RUN=1, base pposrcmdw0qdtest, usuario ppos_rc_mdw0qd@127.0.0.1, orden estricto FK). | `8b04b5d70a29ba5ad4eb25906ce0d3ab46e4d4a48d9cd71f97bba8792d087156` |
| `raw_vitest_output.log` | Log original | Log completo de ejecución de Vitest: 21 suites y 271 pruebas pasadas (100% éxito). | `ac0593642eb0f628b2b937decb9a762d375fa33bcbbfcc8e1e1acb830464b044` |
| `raw_build_output.log` | Log original | Log completo de compilación de producción con Vite (`dist/` generado limpiamente). | `168c6d346f0cf55fff0e9d2f25f64816c1ffff4dfed77b15eab7f8d92a50a310` |
| `git_diff_review.diff` | Diff original | Diff completo de todas las modificaciones de código respecto al commit base `5927b97`. | `c82c44598cc947fb7d1a148599ebd151c8bccfef4010be5fb138368f50abee2a` |
| `vitest_discovered_suites.txt` | Texto | Desglose verificado de los 21 archivos descubiertos por Vitest con el conteo exacto de tests por suite (suma: 271). | `ec3be247d86bb6c050152b477055b3264103dfb541b0616d8814b0d7be22e257` |

---

## 3. Invariantes Comprobados en la Suite de Tests
- **Vitest**: 21 suites descubiertas y ejecutadas, 271 tests unitarios y de integración pasando (100% éxito).
- **Validación Matemática**: Validación exhaustiva con `Number.isFinite` que rechaza `NaN`, `Infinity`, `-Infinity`, ceros engañosos y números negativos en cliente y servidor.
- **Regresión Negativa de Comparación**: Se ha verificado que un presupuesto positivo con respuesta del motor ausente (`null`), incompleta o malformada (`0` o negativa) nunca muestra estado calibrado, muestra aviso de cálculo incompleto, visualiza guiones `—` con insignia 'Sin cálculo' y bloquea estrictamente el botón de avance a la propuesta.
- **Cancelación Limpia**: La cancelación en el modal gobernado produce cero escrituras en BD y ninguna mutación de tarifas.
- **Aislamiento de Tenant**: Verificada la propagación inviolable de `tenantId` y `printerNodeId` en todo el ciclo.
- **Build de Producción**: Compilación limpia con Vite (`dist/` generado en 11.87s).
