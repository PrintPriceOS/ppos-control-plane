# Manifiesto de Evidencias de Onboarding de Calibración
**Proyecto:** PrintPrice OS Control Plane
**Rama:** `phase-39.2-tenant-management-console`
**Commit Base:** `404bc73bc51b6ca44383c64ded205aa9ab30d89c`
**Código Capturado (Git SHA):** `5816693a6eedba7c8e60b155c903f0a2377f2340`
**Entorno de Captura Visual:**
- Framework: Vite 6.4.2 + React 19 + TypeScript
- Navegador: Chromium headless via Playwright
- Servidor Local: `http://localhost:3000` (Dev Server)
- Declaración de Intercepción: **Mocks de ruta Playwright** utilizados estrictamente para las capturas visuales de interfaz y fixtures documentales auténticas.
- **Estado de Validación Conectada:** *Pendiente de validación conectada en entorno de persistencia* (debido a la ausencia de los demonios locales MySQL en 127.0.0.1:3306 y MongoDB en 127.0.0.1:27017 en esta estación de trabajo).

---

## 1. Inventario de Evidencias y Descripción

| Archivo | Viewport | Tema / Idioma | Descripción | Checksum SHA-256 |
|---|---|---|---|---|
| `01_onboarding_step1_families_dark_1366.png` | 1366×768 | Dark / ES | Paso 1: 4 familias canónicas. Selector 'En configuración' neutral sin badge ambiguo 'ACTIVO'. | `156b3bb257b908aa225515c7674dbd8b61cefab1aa794f3208b2bc0561fc2772` |
| `01_onboarding_step1_families_light_1280.png` | 1280×800 | Light / ES | Paso 1 en modo Claro: selector y familias canónicas sin desbordamiento. | `448bdc369dee2375a99f8e1f13a1ba7da41ef025d62716fb1260e399a0278c8f` |
| `02_onboarding_step2_upload_pdf_fixtures_dark_1366.png` | 1366×768 | Dark / ES | Paso 2: Entrada dual limpia (Subir PDF / Oferta manual), sin botones ficticios de terceros. | `9d5e7ac61aba696d4bc72eb029d705673101c0ee927b306e6dc5fd03435d947e` |
| `02b_onboarding_step2_manual_offer_form_dark_1366.png` | 1366×768 | Dark / ES | Paso 2b: Formulario manual progresivo en 7 secciones con referencia de presupuesto editable y opcional. | `689027329c16cbf0b73b39e58b4cd28cc6d9acb580273062488d02c5e0e95b73` |
| `03_onboarding_step3_stutensee_discrepancy_dark_1366.png` | 1366×768 | Dark / ES | Paso 3 (Stutensee): Tiradas auténticas de 250 (1.283 + 190 = 1.473 €) y 300 con discrepancia aritmética (1.525 / 300 = 5,08 € vs 3,05 € declarado). | `5364059d3ef5f6efba0b33c75da9265f0767bdc4786fdcab5757d3fe38acc60c` |
| `03b_onboarding_step3_mysteriosen_ambiguity_dark_1366.png` | 1366×768 | Dark / ES | Paso 3b (Die Mysteriösen Steine): Datos auténticos del PDF (1.792 € fab + 415 € transp = 2.207 € total, 1,47 €/ud) con aviso explícito de ambigüedad técnica Softcover vs cartón 2,4 mm. | `e54081e0b723504d7a74ead6fe77cac204098e5ea1ded6dfcd4a9557c4019a4f` |
| `03_onboarding_step3_natur_variants_light_1280.png` | 1280×800 | Light / ES | Paso 3 (Natur): Regenerada fielmente con el documento real Natur (148×210 mm, 592p Munken 80g, 500/600/700 con 4.321, 4.604, 4.846 € fab + 325 € transp). Eliminada contaminación de Stutensee. | `3f272e2f3e7ac98b3e21b536a6ba02ac37ec361712bb9fd2d186019f634885b6` |
| `04_onboarding_step4_compare_calculations_dark_1366.png` | 1366×768 | Dark / ES | Paso 4: Comparación real y positiva. Fabricación declarada 1.283,00 € vs Motor 1.280,00 €, residual +0.2%, ajuste en tolerancia, botón habilitado sin ceros artificiales. | `65aecf4910cf6564dfb4793a87c4683f5f0326ee9d1339bf4317743351de22a9` |
| `05_onboarding_step5_rate_proposal_dark_1366.png` | 1366×768 | Dark / ES | Paso 5: Propuesta del solver sin claves técnicas visibles (`{key}`). Bloque de garantías corregido en Dark con alto contraste y sin mención a tablas de BD. | `ea35621c09afdbe20d335368ced4a4093f4da5d3761d80b15e01e7af1a5be34c` |
| `05b_onboarding_step5_confirm_modal_dark_1366.png` | 1366×768 | Dark / ES | Paso 5: Diálogo modal completo de aceptación gobernada. | `5d4ef83be5587376ac64cd2dcacff27e228fe312b01c56093adfe6147571ebce` |
| `05b_onboarding_step5_confirm_modal_dialog_dark_1366.png` | Close-up | Dark / ES | Close-up del diálogo: Redacción clara sin nombre de tabla `pricing_revisions`, describe exactamente qué guarda (parámetros industriales) y qué requiere autorización independiente. | `24329d51eddd1c2e45f3b7b9a37d891a67a6e6804b9039b2f2d6361e0910d467` |
| `06_onboarding_step1_mobile_390_dark.png` | 390×844 | Dark / ES | Móvil Paso 1: Indicador de paso comprensible con texto ('Paso 1 de 5: Qué productos fabricas') y badge neutral 'En configuración'. | `a24b4fca7fe7b0c9cb18ce07b060c35cb78a6f55cc61c85141f40a8f89d97c09` |
| `06b_onboarding_step2_mobile_390_dark.png` | 390×844 | Dark / ES | Móvil Paso 2: Indicador 'Paso 2 de 5: Añadir presupuestos', controles superiores en grid sin recortar ni desbordar. | `28db440d940e5c75375eb9eab839825deccf8b8a10893a5b19ee3cd9ed672dbd` |
| `07_onboarding_step1_en_light_1280.png` | 1280×800 | Light / EN | Paridad lingüística en Inglés: 'In setup' y navegación sincronizada. | `f450668c2f676a4ce09c816154726d59afff4b7161ebdf57b73b51bb8ff4e96d` |
| `08_onboarding_step1_de_dark_1366.png` | 1366×768 | Dark / DE | Paridad lingüística en Alemán: 'In Konfiguration' y tipografía adaptada. | `20fa4b398a8f5293b1cfe2390eb93ee655144429f95ec8ce658be3caf5d6c845` |

---

## 2. Invariantes Comprobados en la Suite de Tests
- **Vitest**: 21 suites ejecutadas, 261 tests unitarios y de integración pasando (100% éxito).
- **Regresión Negativa de Comparación**: Se ha verificado que un presupuesto positivo con respuesta del motor ausente (`null`), incompleta o malformada (`0` o negativa) nunca muestra estado calibrado, muestra aviso de cálculo incompleto, visualiza guiones `—` con insignia 'Sin cálculo' y bloquea estrictamente el botón de avance a la propuesta.
- **Cancelación Limpia**: La cancelación en el modal gobernado produce cero escrituras en BD y ninguna mutación de tarifas.
- **Aislamiento de Tenant**: Verificada la propagación inviolable de `tenantId` y `printerNodeId` en todo el ciclo.
- **Build de Producción**: Compilación limpia con Vite (`dist/` generado en 11.69s).
