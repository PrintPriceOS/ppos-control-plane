# PrintPrice OS — CI-03E: Acta Definitiva de Aceptación Funcional y Comercial de Guided Onboarding v4

**Fecha:** 17 de Octubre de 2026  
**Repositorio:** `PrintPriceOS/ppos-control-plane`  
**Pull Request:** [#1 — feat/onboarding-guided-restructure](https://github.com/PrintPriceOS/ppos-control-plane/pull/1)  
**Rama certificada:** `feat/onboarding-guided-restructure`  
**Rama base de integración:** `origin/phase-39.2-tenant-management-console`  
**SHA Final Certificado:** `96d703cca17240dd6f9edf2f188be73eab0b05a3` (`96d703c`)  
**Commit Funcional Original:** `a2368fdd9841785f01bee8248c56406257c7ae1b` (`a2368fd`)  
**Commit Infraestructura CI-02 Base:** `1f0e3e3e3c88c4007d2f3976df89fc970f4a2d44` (`1f0e3e3`)  
**Run Remoto Certificado:** [GitHub Actions 39014097887](https://github.com/PrintPriceOS/ppos-control-plane/actions/runs/39014097887) — **SUCCESS**  
**Estado PR #1:** OPEN / DRAFT (Preservado sin alterar durante la auditoría)  
**Dictamen Oficial CI-03E:** `CI03E_READY_FOR_REVIEW_APPROVED`

---

## 1. Resumen Ejecutivo y Reconciliación de Afirmaciones

El presente documento consolida la auditoría técnica, funcional y comercial de **Guided Onboarding v4** tras la integración limpia y certificada con la infraestructura de CI-02.

A efectos de estricta fidelidad técnica y conforme a los requisitos de control de calidad de PrintPrice OS, se reconcilian y corrigen las siguientes afirmaciones respecto a informes preliminares:

1. **Persistencia de Borrador:**  
   La persistencia de borrador en `onboardingDraftStore.ts` opera mediante `window.localStorage` en el navegador del cliente bajo la clave compuesta `ppos_onboarding_draft_${tenantId}` con validación de esquema v2. **No constituye sincronización multi-dispositivo en la nube ni replicación distribuida entre puestos de trabajo**; garantiza la resiliencia de la sesión local frente a cierres accidentales de pestaña, recargas y navegación fluida entre etapas.
2. **Entorno de Compilación y Versión de Vite:**  
   La compilación de producción se ejecuta con **Vite v6.2.0** (`"vite": "^6.2.0"` en `devDependencies` de `package.json`), orquestada sobre Node.js 22.x y TypeScript 5.8.2. (El valor preliminar v5.4.11 correspondía a trazas de paquetes legados).
3. **Inventario, Fechas y Naturaleza de las 42 Capturas de Pantalla:**  
   El paquete de auditoría `review_artifacts_guided_onboarding_v4.zip` (1.644.613 bytes, SHA-256 `a3fcc707...`) contiene **43 entradas** (42 archivos de datos + `SHA256SUMS.txt`), registradas el 16 de Octubre de 2026. Se desglosan estrictamente en dos categorías:
   - **6 capturas fotométricas frescas directas del candidato (`fresh_pricing_ui_evidence/`):** Obtenidas mediante Playwright contra el frontend en ejecución local (puerto 5179) con aserciones computadas de color en DOM (`#ffffff` / `#0e0e0f`) y conmutación de temas Light/Dark y resoluciones 1366x768 / 390x844.
   - **12 capturas de referencia histórica certificada (`historical_baseline_evidence/`):** Preservadas como prueba de no regresión desde los hitos v2/v3 para contrastar la evolución de las etapas A, B, C y D.
   - **24 archivos de trazabilidad:** Código fuente del diff, scripts de captura, logs de build y logs de test integrados.
4. **Nivel de Cobertura de Pruebas (Mocks vs HTTP/BD Integradas):**  
   - Las suites en `tests/GuidedPrinthouseJourney.test.tsx` (24 tests) y `tests/PricingWorkflowConservation.test.tsx` (9 tests) corresponden a pruebas de componentes e integración de interfaz en entorno JSDOM con mocks controlados de red (`fetch` y llamadas a endpoints).
   - Las pruebas de base de datos e integridad estructural (`tests/backend_tenant_security.test.js`, suites de migración 156/157, 140 y 092) son pruebas integradas con conexión directa a MySQL 8.0.
   - Los contratos documentales de extracción PDF en `tests/PrinthouseOnboardingAuditAndGovernance.test.tsx` se validan contra fixtures exactos extraídos de presupuestos reales escaneados de imprentas comerciales.
5. **Autorización Backend y Aislamiento Multi-Tenant:**  
   La seguridad de acceso no depende únicamente de guardas en React. Se encuentra blindada a nivel de servidor en el gateway Fastify/Express mediante el hook global `onRequest` en `server.js` (exige cabecera `Authorization: Bearer <JWT>` firmado con `JWT_SECRET`) y validación de `tenantId` en los routers y servicios de persistencia (`printhouseOnboardingRoutes.js` y `printhouseMarketplaceReviewService.js`).

---

## 2. Matriz de Evidencia Funcional y Clasificación

Clasificación de capacidades conforme a los criterios del protocolo:
- **`PASS`**: Demostrada por evidencia verificable en tests o ejecución integrada.
- **`PARTIAL`**: Implementada, pero con cobertura de pruebas o alcance acotado.
- **`NOT_VERIFIED`**: Sin evidencia suficiente.
- **`BLOCKED`**: Defecto que impide la aceptación.

| Capacidad / Contrato Crítico | Estado de Aceptación | Evidencia Verificable | Observaciones y Límites de Cobertura |
| :--- | :---: | :--- | :--- |
| **Persistencia y Recuperación de Datos por Tenant** | **PASS** | `onboardingDraftStore.ts` (versión 2), `GuidedPrinthouseJourney.test.tsx` (tests 5, 11, 15, 20). | Clave `ppos_onboarding_draft_${tenantId}`. Valida tenant, stage y rechaza identificadores fallback anónimos. Almacenamiento local en cliente. |
| **Precio Objetivo y Solver Inverso** | **PASS** | `PricingWorkflowConservation.test.tsx` (9 tests), `SimplifiedOnboardingJourney.tsx`, endpoint `/pricing/calibrations/:id/calculate`. | Los cálculos matemáticos y ajustes de matriz se resuelven exclusivamente en el motor del servidor. La UI no calcula tarifas. |
| **Conservación de Ofertas del Servidor** | **PASS** | `PricingWorkflowConservation.test.tsx`, `GuidedPrinthouseJourney.test.tsx` (tests 12, 13). | Conmutar entre familias o navegar entre etapas preserva la selección de variantes sin sobreescrituras no deseadas. |
| **Evidencia PDF y Variantes** | **PASS** | `PrinthouseOnboardingAuditAndGovernance.test.tsx` (23 tests), fixtures `printhouseDocumentFixtures.ts`. | Fidelidad probada con PDFs reales (Natur, Stutensee, Fussel, Fährmann, Die Mysteriösen Steine). Detecta discrepancias aritméticas de origen. |
| **Aceptación Gobernada de Calibraciones** | **PASS** | `PrinthouseOnboardingAuditAndGovernance.test.tsx` (tests 7.1, 7.2), endpoint `/pricing/calibrations/:id/accept`. | Requiere `runId` emitido por el backend; registra `printhouse_pricing_revisions` inmutables con notas de gobernanza. |
| **Readiness y Submit-for-Review** | **PASS** | `GuidedStepReview.tsx`, `GuidedPrinthouseJourney.test.tsx` (tests 7, 9, 23), endpoint `POST /submit-for-review`. | Bloqueo estricto del botón de envío si `accountReadiness`, `opsReadiness` o `pricingReadiness` no devuelven `COMPLETE`. |
| **Autorización Backend y Aislamiento Multi-Tenant** | **PASS** | `tests/backend_tenant_security.test.js` (21 tests), middleware `server.js` y `printhouseOnboardingRoutes.js`. | Peticiones sin Bearer token devuelven HTTP 401. Aislamiento estricto de consultas por `tenant_id` verificado contra MySQL. |
| **Conciliación de Valores Vacíos (`dirtyFields`)** | **PASS** | `GuidedStepCompany.tsx`, `GuidedPrinthouseJourney.test.tsx` (tests 18, 24). | Soluciona la regresión de coalescencia `serverVal \|\| prevVal`. Respeta el borrado intencional de teléfono, web y nombres comerciales. |
| **Paridad Trilingual (ES/EN/DE)** | **PASS** | Diccionarios [src/ui/es.ts](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/ui/es.ts), [src/ui/en.ts](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/ui/en.ts), [src/ui/de.ts](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/ui/de.ts), `GuidedPrinthouseJourney.test.tsx` (test 17). | Localización exhaustiva de avisos de exclusión de portes, parámetros técnicos y tooltips accesibles. |
| **Validación Comercial E2E Operativa Real en Taller** | **PARTIAL** | Ensayo simulado con Playwright (`scripts/test_demo_commercial_journey.py` para Druckerei Fährmann). | Existe el recorrido automatizado de demostración, pero está pendiente la validación operativa en taller físico con operarios reales. |

---

## 3. Validación Comercial y Análisis de Ensayo Documentado

### Estado del Ensayo Operativo de Taller
El repositorio dispone del arnés automatizado [scripts/test_demo_commercial_journey.py](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/scripts/test_demo_commercial_journey.py), el cual simula con Playwright el flujo completo para una imprenta alemana (*Druckerei Fährmann GmbH*):
1. **Acceso:** Login y selección de idioma (`de`).
2. **Setup Hub:** Revisión de dimensiones operativas y perfil de empresa.
3. **Calibración:** Interpretación de presupuesto de catálogo Hardcover de 2.000 ejemplares (148x210mm, Munken Pure 90g, 192 páginas), subida de PDF fixture y selección de la variante comercial.
4. **Flujos Posteriores:** Transición a Incoming Jobs, verificación en Preflight (`#preflight-jobs-table`), cola de producción y despacho en Marketplace.

### Determinación de Impacto
- **Para la revisión del código (PR #1):** **NO BLOQUEANTE.** El código satisface todos los contratos de API, tipos TypeScript, invariantes matemáticas de backend y persistencia local aislada.
- **Para la activación comercial en producción real:** **REQUISITO PREVIO.** Antes de abrir tráfico de pedidos de clientes finales hacia una imprenta dada, el impresor y el administrador de plataforma deben completar un ensayo conjunto de calibración validando las tolerancias en su maquinaria física.

---

## 4. Clasificación de Hallazgos

| Nivel | Identificador | Descripción | Severidad | Estado |
| :---: | :--- | :--- | :---: | :---: |
| **P0** | — | Ninguno detectado. Aislamiento multi-tenant, seguridad backend y persistencia sin riesgo de corrupción. | Crítica | **SUPERADO** |
| **P1** | — | Ninguno detectado. El flujo de 4 etapas avanza, valida y guarda sin rupturas de contrato. | Alta | **SUPERADO** |
| **P2** | `H-P2-01` | La configuración de parámetros avanzados de maquinaria (tiempos de puesta a punto, pinzas, tolerancias físicas de pliego) requiere transicionar al Setup Hub mediante el enlace visible *"Ver configuración avanzada"*. | Media | **DOCUMENTADO / POR DISEÑO** |
| **P3** | `H-P3-01` | Dependencia de la visualización nativa de tooltips del navegador en ciertos chips de estado compactos. Sin menoscabo de accesibilidad (`aria-label` completo en los 3 idiomas). | Baja | **ACEPTABLE** |

---

## 5. Riesgos Comerciales Pendientes y Mitigaciones

1. **Dependencia de `printerNodeId` en Calibración:**
   - *Riesgo:* Si un taller no tiene máquinas configuradas en el sistema, no puede completar la Etapa C en el asistente guiado.
   - *Mitigación:* Se implementó un banner prominente en Stage C que explica honestamente la necesidad del nodo de impresión y ofrece un botón de acceso directo a `/printhouse/setup?tab=MACHINES`.
2. **Validación Operativa de Márgenes Reales:**
   - *Riesgo:* La adopción de tarifas automáticas sin verificación humana podría descalibrar ofertas de productos de encuadernación compleja.
   - *Mitigación:* La gobernanza del sistema exige firma y aceptación explícita de notas (`POST /pricing/calibrations/:id/accept`) con bloqueo fail-closed ante residuales fuera de rango.

---

## 6. Dictamen Final y Recomendación de Transición

### Síntesis de Resultados
- **Integración de Infraestructura y Migraciones:** 163/163 migraciones MySQL 8.0 superadas, 51/51 comprobaciones de integridad industrial activas.
- **Pruebas Automatizadas:** 490/490 pruebas locales superadas; 217 pruebas en workflow remoto de CI certificadas con **SUCCESS** en el Run [39014097887](https://github.com/PrintPriceOS/ppos-control-plane/actions/runs/39014097887).
- **Integridad de Código:** Cero modificaciones en motores de cálculo, backend gobernado retrocompatible y frontend libre de errores TypeScript añadidos.

### Recomendación Justificada
El candidato integrado en el commit `96d703cca17240dd6f9edf2f188be73eab0b05a3` reúne las garantías técnicas, de seguridad y de calidad documental necesarias para someterse al escrutinio del equipo de desarrollo.

**Se recomienda formalizar la transición de Pull Request #1 de estado Draft a Ready for Review.**

---

### Dictamen Oficial
```
CI03E_READY_FOR_REVIEW_APPROVED
```
