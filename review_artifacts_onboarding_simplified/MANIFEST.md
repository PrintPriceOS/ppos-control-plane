# Manifiesto de Evidencias de Onboarding de Calibración
**Proyecto:** PrintPrice OS Control Plane
**Rama:** `phase-39.2-tenant-management-console`
**Remoto Oficial (Verificado):** `https://github.com/PrintPriceOS/ppos-control-plane.git`
**Commit Acreditado y Publicado en Remoto (HEAD):** `d38da6fce2911c6953f307d2cc0687e14d1d2b49`
**Código Auditado y Empaquetado:** HEAD commit `d38da6fce2911c6953f307d2cc0687e14d1d2b49` con resolución integral de los bloqueos de auditoría y acreditación de contratos.
**Estado del Worktree:** Sincronizado y publicado contra `origin/phase-39.2-tenant-management-console`.

### Auditoría y Resoluciones Implementadas en `d38da6fce2911c6953f307d2cc0687e14d1d2b49`:
1. **Coherencia Absoluta Informe-Código:** Se acredita una única versión formal del harness (`scripts/test_onboarding_connected_suite.js`), coincidente bit a bit con el archivo empaquetado en el ZIP (`test_onboarding_connected_suite.js`).
2. **Cálculo Canónico Exclusivo desde `rates_json`:** Se elimina `printer_nodes.rates_checksum` de todas las consultas SQL (SELECT e INSERT). El hash canónico SHA-256 se calcula exclusivamente en memoria de aplicación desde `rates_json` (`computeCanonicalRatesChecksum`), verificando identidad exacta con `INITIAL_RATES_CHECKSUM` antes y después de `POST /reject` y tras intentos de acceso cruzado entre tenants.
3. **Fixture de Tarifas Compatible con el Motor Real y Claves Documentadas:** Sustitución de claves arbitrarias por el fixture canónico industrial compatible al 100% con `@ppos/pricing-engine` y `buildPriceCalibrationAdapter.js`. Las claves consumidas efectivamente por el motor y el solver inverso (`deterministicInversePricingSolver.js`) son:
   - Impresión interior fija y variable por alzado: `interior_full_colour_fixed` y `interior_full_colour_var` (claves `'16p'`, `'32p'`, etc.).
   - Impresión cubierta fija y variable por millar: `cover_fixed_by_colours` y `cover_var_per_1000_by_colours` (claves `'1'` a `'5'`).
   - Plastificado / Acabado: `lam_fixed` y `lam_var_per_1000` (`'matt'`, `'gloss'`, `'varnish'`).
   - Encuadernación rústica cosida/fresada: `binding_pb_fixed_by_sections` y `binding_pb_var_per_1000_by_sections` (por número de pliegos `'1'` a `'30'`).
   - Mermas de papel fijas y variables: `paper_interior_fixed_by_colours`, `paper_interior_var_per_1000_by_colours`, `paper_cover_fixed_by_colours`, `paper_cover_var_per_1000_by_colours`.
   - Merma por tipo de encuadernación: `paper_waste_for_binding` (`pb`, `ss`, `hc`, etc.).
   - Coste de papel por kilo: `paper_price_interior_by_kilo` (`offset`, `mc`, `lux`, `munken`), `paper_price_cover_by_kilo` (`mc`, `artboard`, etc.).
   - Cero parámetros ficticios que el motor ignore.
4. **Autenticación Estricta con Usuarios Reales (Sin Fallback Ficticio):**
   - Si la tabla `control_users` no existe en la base de datos de destino, el harness aborta inmediatamente con `ABORT_PRECONDITION_FAILED`.
   - Se exige un `insertId` numérico válido en `control_users`. Se elimina todo fallback a identificadores sintéticos o inventados.
   - Las sesiones rastreables se crean mediante `userSessionService.createSession` en `user_sessions`.
   - Se acredita el contrato `validateSession()` comprobando validación positiva, rechazo por `SESSION_TENANT_MISMATCH`, `SESSION_USER_MISMATCH` y `SESSION_NOT_FOUND`.
5. **Evidencias de Contrato Incluidas en el Paquete:**
   - `userSessionService.js`: Código fuente real del servicio de sesiones de usuario.
   - `auth_middleware.js`: Middleware de autenticación `requireAdmin` (`src/api/middleware/auth.js`) que valida tokens y sesiones.
   - `auth_and_user_sessions_schema.sql`: Definiciones DDL reales de `control_users` y `user_sessions`, detallando la correspondencia entre `control_users.id`, `userSessionService.createSession`, `user_sessions.id`, y los claims JWT (`sub`, `jti`, `tenant_id`, `role`).
6. **Eliminación de `.catch` Silenciosos y Comprobación de `PRODUCTION_DISPATCH_ALLOWED`:** Se eliminaron los manejadores `.catch(() => [[{ count: 0 }]])`. Las consultas contra `bpe_pricing_publications` y `printhouse_activation_grants` fallan con diagnóstico explícito en caso de error. Se auditan exhaustivamente los flags comerciales de activación (`marketplace_visible = 1`, `live_quoting_allowed = 1`, `job_routing_allowed = 1`, `production_dispatch_allowed = 1`), además de verificar cero grants totales para el tenant.
7. **Documentación de Claves Foráneas y Orden de Limpieza en 8 Tablas:** Documentación de las FKs y dependencias efectivas (Migraciones 143, 146, 147, 148, 158, 160). Se implementa el orden de limpieza determinista en 8 tablas:
   1. `printhouse_pricing_calibration_acceptances`
   2. `printhouse_pricing_revisions` (eliminadas antes de runs y sessions por referencia lógica a `source_calibration_run_id` y `source_calibration_session_id`)
   3. `printhouse_pricing_calibration_runs`
   4. `printhouse_pricing_calibration_sessions`
   5. `user_sessions`
   6. `control_users` (usuarios de prueba creados)
   7. `printer_nodes`
   8. `tenants`
   Verificación de 0 residuos en las 8 tablas con reporte conjunto en el bloque `finally`.
8. **Invalidación de Extracción Tardía ante Cambio de Familia y Contexto:** Se incrementa `uploadRequestIdRef` al seleccionar o cambiar de familia (`handleSelectFamilyToCalibrate`), al regresar al selector de familias (`handleReturnToFamilySelector`) y al alternar pestañas de entrada. Pruebas de regresión 20 y 21 en Vitest acreditan el descarte de respuestas lentas de PDF.
9. **Trazabilidad Git Rigurosa y Publicación Remota:** Las correcciones quedan publicadas en el commit `d38da6fce2911c6953f307d2cc0687e14d1d2b49` sobre la rama `phase-39.2-tenant-management-console` y subidas a `origin`.
10. **Alineación Estricta con Contratos Oficiales de Rutas y Servicios (HEAD):**
    - **Payload canónico `bookSpec`:** En `scripts/test_onboarding_connected_suite.js`, los fixtures de calibración principal y cancelación secundaria adoptan la especificación formal exigida por `calibrationSessionService.validateBookSpec`: `copies`, `interior_pages`, `book_width_mm`, `book_height_mm`, `interior_print`, `cover_print`, `paper_type_interior`, `paper_weight_interior`, `paper_type_cover`, `paper_weight_cover`, `binding_method` y `delivery_country`, empleando los enums reales del servicio.
    - **Semántica explícita del precio:** Se definen de manera unívoca `includesPaper: true`, `includesBinding: true`, `includesFinishing: true` e `includesPackaging: true` en ambos fixtures sin inferir componentes del precio total. Se mantiene la ambigüedad documental de *Die Mysteriösen Steine* sin alteraciones artificiales; el flujo técnico se valida con un fixture sintético explícito de integración (`Synthetic Integration Fixture`).
    - **Aserciones de Respuestas HTTP contra `printhouseOnboardingRoutes`:**
      - Creación (`POST /pricing/calibrations`): HTTP 201 estricto, sesión extraída directamente de `body.data.id`.
      - Cálculo (`POST /pricing/calibrations/:id/calculate`): HTTP 201 estricto, run extraído de `body.data`.
      - Promoción (`POST /pricing/calibrations/:id/ready`): HTTP 200 estricto, comprobación explícita de `body.data.status === 'READY'` (eliminando fallbacks permisivos `ok === true`).
      - Cancelación (`POST /pricing/calibrations/:id/reject`): HTTP 200 estricto, comprobación de `body.data.status === 'REJECTED'`.
      - Aceptación (`POST /pricing/calibrations/:id/accept`): HTTP 200 estricto, validación de `body.data.status === 'ACCEPTED'`, `revisionId` y `acceptanceId`.
    - **Diagnóstico HTTP Sanitizado:** En caso de discrepancia, `formatHttpDiagnostic` reporta método, ruta, status HTTP y campos de error `{ code, message, details }` sin registrar headers, cookies ni tokens de autorización.
    - **Verificación Directa de `runId` en MySQL:** Tras `POST /calculate`, el identificador `realRunId` (`calcRes.body.data.id`) se verifica directamente en `printhouse_pricing_calibration_runs` por `WHERE id = ?`, asegurando coincidencia de `calibration_session_id` y `tenant_id`.

11. **Resolución de la Validación de Integridad de Checksum (Paso 9):**
    - **Auditoría de Algoritmo y Serialización:** Confirmada la identidad estricta de la serialización JSON canónica recursiva con ordenación de claves (`canonicalStringify` vs `calibrationSessionService._canonicalStringify`) y del algoritmo criptográfico (SHA-256). Se identificó que `calibrationSessionService.computeRatesChecksum` emite exclusivamente el digest hexadecimal puro de 64 caracteres en minúsculas (sin prefijo), mientras que el cálculo de referencia del harness generaba la representación canónica con prefijo `sha256:<hash>`, provocando un fallo por comparación literal en el Paso 9.
    - **Normalización Estricta (`normalizeSha256Hex`):** Admite únicamente cadenas válidas de 64 caracteres hexadecimales, con o sin prefijo `sha256:` (insensible a mayúsculas/minúsculas). Rechaza de forma determinista valores ausentes (`null`, `undefined`, cadenas vacías, espacios en blanco), tipos incorrectos (no-strings), longitudes distintas de 64 hex chars (o 71 con prefijo), caracteres no hexadecimales y prefijos corruptos o duplicados. No realiza eliminación indiscriminada de prefijos.
    - **Cálculo Independiente y Comparación con Igualdad Estricta:** Se mantiene el cálculo independiente del hash SHA-256 desde `rates_json`. Los digests normalizados se comparan con igualdad estricta (`storedNorm === computedNorm`).
    - **Diagnóstico Sanitizado:** Ante cualquier discrepancia, el reporte visualiza exclusivamente el checksum almacenado y el calculado, sin filtrar tarifas, tokens Bearer, credenciales ni datos personales.
    - **Acreditación de Regresiones en 5 Categorías (23 pruebas):**
      1. Hexadecimal puro equivalente (insensible a mayúsculas de hex).
      2. Formato `sha256:<hash>` equivalente (hex puro frente a prefijo, ambos prefijados, variaciones de mayúsculas).
      3. Hash válido pero diferente (rechazo estricto con reporte sanitizado sin secretos).
      4. Formatos inválidos y valores ausentes (`null`, `undefined`, tipos no-string, longitudes 63/65/32, caracteres no-hex 'g'/'z', corrupción de prefijo).
      5. Interoperabilidad directa end-to-end con `calibrationSessionService.computeRatesChecksum`.
      6. Cero filtración de secretos (Zero Secret Leakage) con tokens ficticios, contraseñas y payloads JSON.
      Verificadas mediante ejecución standalone (`node scripts/test_onboarding_connected_suite.js --regressions`), pre-flight en el harness conectado y en la suite Vitest (`tests/onboarding_checksum_integrity_regression.test.js`).

12. **Cierre Hermético del Diagnóstico de `verifyRatesChecksumIntegrity` (Zero Leakage):**
    - Se elimina por completo la impresión del valor original mediante `JSON.stringify(...)` en las ramas de formato inválido.
    - En caso de formato inválido, el diagnóstico muestra única y exclusivamente:
      - `origen`: `stored` o `computed`
      - `tipo`: tipo recibido (`null`, `undefined`, `string`, `number`, `object`, etc.)
      - `longitud`: longitud del string recibido (únicamente si es string)
      - `motivo`: motivo técnico puntual del rechazo (ej. `Longitud inválida tras prefijo sha256:`, `Caracteres no hexadecimales en digest`, `Cadena vacía o solo espacios en blanco`, etc.)
    - Se garantiza que los digests se visualicen en logs y aserciones **únicamente cuando hayan superado la validación estricta SHA-256** de 64 caracteres hexadecimales.
    - Se incorporan regresiones específicas que introducen cadenas inválidas con tokens Bearer ficticios, contraseñas de base de datos ficticias y fragmentos de JSON con claves de API y tarifas, verificando que ninguno de estos contenidos aparezca en el diagnóstico resultante.

13. **Resolución Exclusiva de Credenciales MySQL y Preparación de Conexión (`resolveConnectedMysqlPassword`):**
    - Se resuelve de raíz el error `ReferenceError: mysqlPassword is not defined` mediante la resolución dinámica de credenciales dentro de `runConnectedSuite()` utilizando `resolveConnectedMysqlPassword()` y `getDirectMysqlConnectionConfig()`.
    - Se eliminan por completo los fallbacks a `sharedMysqlPassword` y `process.env.MYSQL_PASSWORD`: la contraseña se resuelve **exclusivamente** desde `process.env.PPOS_TEST_MYSQL_PASSWORD`.
    - Si la variable falta, está vacía o es el placeholder de regresión, se aborta inmediatamente antes de intentar cualquier conexión con el error controlado `MISSING_TEST_PASSWORD`, sin imprimir jamás el contenido de las credenciales.
    - Se incorporan regresiones específicas tanto autónomas (`node scripts/test_onboarding_connected_suite.js --regressions`, Suite 6) como en Vitest (`tests/onboarding_checksum_integrity_regression.test.js`, Suite 7 con 7 tests) que verifican la resolución exclusiva, el rechazo estricto de `MYSQL_PASSWORD` cuando `PPOS_TEST_MYSQL_PASSWORD` está ausente, el rechazo de cadenas vacías/espacios, el rechazo de placeholders y la verificación estática de ausencia de identificadores no declarados ni fallbacks en el código fuente.

14. **Compatibilidad Estricta de Residuales y Tolerancias en Calibración (`calibrationAcceptanceService.js`):**
    - Se audita y resuelve de raíz la compatibilidad de residuales con discriminador verificable de contrato (`PERCENTAGE_POINTS` para solver determinista 1 punto y `RATIO` para multicanidad).
    - Detección estricta de confusión entre ratio 0.01 y 1 % (1.0 percentage points) sin tolerancia ambigua por proximidad.
    - Verificación individual de cada punto de la curva y de los agregados contra `curveMetrics` (máximo de la curva, no contra el primer punto).
    - Preservación de la unidad canónica histórica de `percentResidual` (ratio `[0..1]`) en registros DB, `verification_json` y respuestas de la API, enriquecido con `residualMetrics`.
    - Cálculo de residuales sobre valores sin redondear y redondeo al final conforme a la precisión de contrato (6 decimales para ratio / EUR, 4 para puntos porcentuales).
    - Verificación de precios finitos estrictamente positivos e integridad transaccional limpia con rollback único en caso de error.

---

## 1. Entorno de Verificación y Declaración de Evidencias
- **Distinción entre Capturas Reutilizadas y Entregables Regenerados:**
  - **Evidencias Visuales (15 archivos PNG):** Reutilizadas de la sesión validada de Playwright (`01_onboarding_...` a `08_onboarding_...`), acreditando fidelidad tipográfica, paridad multilingüe EN/ES/DE, densidad cómoda/compacta, y fidelidad documental (1.792 €, interior 4/4). No han sufrido alteraciones visuales en esta iteración.
  - **Entregables Técnicos y Evidencias de Contrato (12 archivos):** Regenerados e incorporados en esta iteración para acreditar los puntos de auditoría (`test_onboarding_connected_suite.js`, `onboarding_checksum_integrity_regression.test.js`, `calibrationAcceptanceService.js`, `calibration_residuals_compatibility_regression.test.js`, `raw_vitest_output.log`, `raw_build_output.log`, `git_diff_review.diff`, `vitest_discovered_suites.txt`, `userSessionService.js`, `auth_middleware.js`, `auth_and_user_sessions_schema.sql`, `SHA256SUMS.txt`).
- **Comandos Ejecutados:**
  - `npx vitest run`: Ejecución de 23 suites y 316 tests unitarios y de integración (316 pasados, 0 fallidos) en 12.04s.
  - `npm run build`: Compilación de producción Vite (dist generado limpiamente en 11.75s).
- **Entorno:**
  - Node.js v20+, Vite 6.4.2, React 19, TypeScript
  - MySQL Target: `ppos_rc_mdw0qd@127.0.0.1:3306/pposrcmdw0qdtest`
- **Estado de Validación Conectada:** *PENDIENTE DE VALIDACIÓN CONECTADA EN ENTORNO DE PERSISTENCIA* (harness revisable entregado, no desplegado ni ejecutado en base de datos conectada).
- **Advertencia Legal / Técnica:** *Los checksums SHA-256 incluidos acreditan exclusivamente la integridad criptográfica de los archivos empaquetados contra alteraciones, no su validez funcional ni ejecución conectada.*

---

## 2. Inventario de Evidencias Visuales y Técnicas

| Archivo | Tipo | Origen | Descripción | Checksum SHA-256 |
|---|---|---|---|---|
| `01_onboarding_step1_families_dark_1366.png` | PNG (1366×768) | Reutilizada | Paso 1: 4 familias canónicas. Selector 'En configuración' neutral sin badge ambiguo 'ACTIVO'. | `93d5acdea2a0c223d7d7bac381013d85349cdbfe38a0b3df1eb178df863d3a0b` |
| `01_onboarding_step1_families_light_1280.png` | PNG (1280×800) | Reutilizada | Paso 1 en modo Claro: selector y familias canónicas sin desbordamiento. | `448bdc369dee2375a99f8e1f13a1ba7da41ef025d62716fb1260e399a0278c8f` |
| `02_onboarding_step2_upload_pdf_fixtures_dark_1366.png` | PNG (1366×768) | Reutilizada | Paso 2: Entrada dual limpia (Subir PDF / Oferta manual), sin botones ficticios de terceros. | `ebc79216d13ac867cd19b4b1e6dcab77fae5fe2c687c25eafe3fc3b70ae70a28` |
| `02b_onboarding_step2_manual_offer_form_dark_1366.png` | PNG (1366×768) | Reutilizada | Paso 2b: Formulario manual progresivo en 7 secciones con referencia de presupuesto editable y opcional. | `f14edb83ebad1da43fd3dc258ccb9ee35998828678792388fc437d1a00966c8c` |
| `03_onboarding_step3_stutensee_discrepancy_dark_1366.png` | PNG (1366×768) | Reutilizada | Paso 3 (Stutensee): Tiradas auténticas de 250 (1.283 + 190 = 1.473 €) y 300 con discrepancia aritmética documentada (1.525 / 300 = 5,08 € real vs 3,05 € declarado en PDF). Cero cifras inventadas. | `6e2ec966eb72ff8c06efb70ba1b63d9e5727a12e6fe14b05a149975308f25f81` |
| `03b_onboarding_step3_mysteriosen_ambiguity_dark_1366.png` | PNG (1366×768) | Reutilizada | Paso 3b (Die Mysteriösen Steine): Datos auténticos del PDF (1.792 € fab + 415 € transp = 2.207 € total, 1,47 €/ud) con aviso explícito de contradicción documental Softcover vs cartón MGP 2,4 mm y botón de comparación bloqueado/deshabilitado. | `06b53370a2fff3d63b6231cbc4d8f141d1552dd50d2ad1ac682dee1b93d83dfc` |
| `03_onboarding_step3_natur_variants_light_1280.png` | PNG (1280×800) | Reutilizada | Paso 3 (Natur): Denominación original exacta 'Munken Print White 1.5, 80 g' (148×210 mm, 592p, cubierta cartulina 300 g, cosido; tiradas 500/600/700 con 4.321, 4.604, 4.846 € fab + 325 € transp). Cero menciones no acreditadas. | `2112485a6eb19cb7849351900ab81d711968069256a8aa98ec9692699dc9574e` |
| `04_onboarding_step4_compare_calculations_dark_1366.png` | PNG (1366×768) | Reutilizada | Paso 4: Comparación fiel de Die Mysteriösen Steine tras resolución de ambigüedad. Fabricación declarada 1.792,00 € vs Motor 1.784,83 € (diferencia 7,17 €, residual +0.4%), 1.500 ej., Arctic Volumen 150g, 72 páginas, Tintas interior 4/4. Cero contaminación con datos de otros presupuestos ni ceros artificiales. | `6fe8517e312569e0625beec87c3a8251ffcfe855f76a77071cac0cbf72dd92d5` |
| `05_onboarding_step5_rate_proposal_dark_1366.png` | PNG (1366×768) | Reutilizada | Paso 5: Propuesta del solver sin claves técnicas visibles (`{key}`). Bloque de garantías corregido en Dark con alto contraste y sin mención a tablas de BD. | `d59b1238fc4e3339a4e2b0f2520fee73c7574883af163e7c2d07654fddbbfc71` |
| `05b_onboarding_step5_confirm_modal_dark_1366.png` | PNG (1366×768) | Reutilizada | Paso 5: Diálogo modal completo de aceptación gobernada. | `6d5ba05cd88e93b6de9fecca94bdeda9921975caaa2593ff730f6399d55cf3e4` |
| `05b_onboarding_step5_confirm_modal_dialog_dark_1366.png` | PNG (Close-up) | Reutilizada | Close-up del diálogo: Redacción clara sin nombre de tabla `pricing_revisions`, describe exactamente qué guarda (parámetros industriales) y qué requiere autorización independiente. | `24329d51eddd1c2e45f3b7b9a37d891a67a6e6804b9039b2f2d6361e0910d467` |
| `06_onboarding_step1_mobile_390_dark.png` | PNG (390×844) | Reutilizada | Móvil Paso 1: Indicador de paso comprensible con texto ('Paso 1 de 5: Qué productos fabricas') y badge neutral 'En configuración'. | `a24b4fca7fe7b0c9cb18ce07b060c35cb78a6f55cc61c85141f40a8f89d97c09` |
| `06b_onboarding_step2_mobile_390_dark.png` | PNG (390×844) | Reutilizada | Móvil Paso 2: Indicador 'Paso 2 de 5: Añadir presupuestos', controles superiores en grid sin recortar ni desbordar. | `28db440d940e5c75375eb9eab839825deccf8b8a10893a5b19ee3cd9ed672dbd` |
| `07_onboarding_step1_en_light_1280.png` | PNG (1280×800) | Reutilizada | Paridad lingüística en Inglés: 'In setup' y navegación sincronizada. | `f450668c2f676a4ce09c816154726d59afff4b7161ebdf57b73b51bb8ff4e96d` |
| `08_onboarding_step1_de_dark_1366.png` | PNG (1366×768) | Reutilizada | Paridad lingüística en Alemán: 'In Konfiguration' y tipografía ajustada sin desbordamientos. | `20fa4b398a8f5293b1cfe2390eb93ee655144429f95ec8ce658be3caf5d6c845` |
| `test_onboarding_connected_suite.js` | Código JS | Regenerado | Harness revisable de prueba conectada para MySQL aislado (base pposrcmdw0qdtest, usuario ppos_rc_mdw0qd@127.0.0.1, sesiones reales con userSessionService, initial rates fixture, aislamiento comercial, orden estricto FK en 8 tablas, normalización estricta de checksum con igualdad estricta, diagnósticos sanitizados y resolución exclusiva y segura de PPOS_TEST_MYSQL_PASSWORD sin fallbacks). | `0845214e133cd1ea6feca638a2187efe99873c2c41bc3793ce149829e83aa3b1` |
| `onboarding_checksum_integrity_regression.test.js` | Suite Vitest | Incorporado | 30 pruebas de regresión unitaria para normalización y comparación estricta de checksums SHA-256 (hex puro, sha256: prefix, rechazo de divergencias, formatos inválidos, interoperabilidad con calibrationSessionService, aserciones de cero filtración de tokens, contraseñas o JSON, resolución exclusiva de PPOS_TEST_MYSQL_PASSWORD sin fallback a MYSQL_PASSWORD y verificación de preparación de conexión). | `0c07d923f2d935dcc08b75e12d94a349e65ff56781163a377b69ccebaf1d7e0d` |
| `calibrationAcceptanceService.js` | Evidencia de Código | Incorporado | Servicio de aceptación gobernada de calibraciones con compatibilidad verificada de residuales para solver 1 punto y multicanidad, cálculo sobre valores sin redondear, preservación de ratios históricos y aislamiento transaccional estricto. | `3c16f34e50967c9543e0a6eba3b123ede593c0d065936c5619c1a8073dbffca3` |
| `calibration_residuals_compatibility_regression.test.js` | Suite Vitest | Incorporado | 13 pruebas de regresión unitaria y de servicio para residuales: discriminación estricta 1% vs 0.01, tolerancias en el límite exacto, agregados de curva cuyo mayor residual no está en el primer punto, y rechazo transaccional sin mutaciones. | `8c1c720bbca87e5ad7d41e4c88394f5cca4bee6575b8e821531df21706c2d63d` |
| `raw_vitest_output.log` | Log original | Regenerado | Log completo de ejecución de Vitest: 23 suites y 316 pruebas pasadas (100% éxito). | `c75e324c034761b5cc4eb306853feb6f5f1e4736d87c27518df386089dc4e333` |
| `raw_build_output.log` | Log original | Regenerado | Log completo de compilación de producción con Vite (`dist/` generado limpiamente en 11.75s). | `2658850f393b325b91287f17402e0b6628358e2f2540767e24bbddd350d8b462` |
| `git_diff_review.diff` | Diff original | Regenerado | Diff completo de todas las modificaciones de código respecto al commit base `f13bba6`. | `24935b208aa42cec582b92a866947eb74400624b9fbde434780bb086b7c8f1d3` |
| `vitest_discovered_suites.txt` | Texto | Regenerado | Desglose verificado de los 23 archivos descubiertos por Vitest con el conteo exacto de tests por suite (suma: 316). | `0460601565e4fa1055c5167612573cd2790a49fe82b3014a186fbbbd87290d0c` |
| `userSessionService.js` | Evidencia de Código | Incorporado | Servicio oficial de sesiones de usuario (`src/api/services/userSessionService.js`), acreditando parámetros, creación y validación estricta de identidades en capa de aplicación. | `8d3b286c95dbe838cad2eefc5613b54dc1812bb7c89df13c0e54602835418a54` |
| `auth_middleware.js` | Evidencia de Código | Incorporado | Middleware de autenticación oficial `requireAdmin` (`src/api/middleware/auth.js`), acreditando la verificación de tokens JWT contra `user_sessions.id` (`jti`) y validación de `user_id`. | `95f1cf01bba7fb085a5961b7645d3d405c1fe9e1dd64caa795bf366671e8fefc` |
| `auth_and_user_sessions_schema.sql` | Evidencia DDL | Incorporado | Definiciones DDL de `control_users` y `user_sessions`, documentando la correspondencia de identificadores y aclarando que la integridad referencial se asegura en aplicación sin FK relacional. | `4223b758c0bc0f5c007307c6897992a65679bda96b461f2c0d0fc34d9b79b926` |
| `inspect_test_db_schema.js` | Herramienta de Inspección | Incorporado | Script de solo lectura (`SET SESSION TRANSACTION READ ONLY`) para auditar las 10 tablas reales (`tenants`, `printer_nodes`, `control_users`, `user_sessions`, `printhouse_pricing_calibration_sessions`, `printhouse_pricing_calibration_runs`, `printhouse_pricing_calibration_acceptances`, `printhouse_pricing_revisions`, `bpe_pricing_publications`, `printhouse_activation_grants`) previo a cualquier ejecución. | `2c57e1a0b7a6e9424edd034caf75cebb51c07be7365cbe346cae51a1c1dcb090` |

---

## 3. Invariantes Comprobados en la Suite de Tests
- **Vitest**: 23 suites descubiertas y ejecutadas, 316 tests unitarios y de integración pasando (100% éxito) en 12.04s.
- **Validación Matemática**: Validación exhaustiva con `Number.isFinite` que rechaza `NaN`, `Infinity`, `-Infinity`, ceros engañosos y números negativos en cliente y servidor.
- **Regresión Negativa de Comparación**: Se ha verificado que un presupuesto positivo con respuesta del motor ausente (`null`), incompleta o malformada (`0` o negativa) nunca muestra estado calibrado, muestra aviso de cálculo incompleto, visualiza guiones `—` con insignia 'Sin cálculo' y bloquea estrictamente el botón de avance a la propuesta.
- **Cancelación Limpia y Fixture Baseline**: Verificación de que la cancelación y los accesos fallidos entre tenants preservan estrictamente las tarifas iniciales válidas (`INITIAL_VALID_RATES`).
- **Aislamiento Comercial**: Cero publicaciones en marketplace y cero activación de grants durante la calibración, con verificación de `production_dispatch_allowed`, `marketplace_visible`, `job_routing_allowed` y `live_quoting_allowed`.
- **Aislamiento Multi-Tenant**: Verificada la propagación inviolable de `tenantId` y `printerNodeId` en todo el ciclo con sesiones reales y acreditación de `userSessionService.validateSession()`.
- **Build de Producción**: Compilación limpia con Vite (`dist/` generado en 11.75s).
