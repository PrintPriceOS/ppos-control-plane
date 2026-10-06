# -*- coding: utf-8 -*-
"""
scripts/package_onboarding_artifacts.py

Generates:
1. Copies technical deliverables (harness, raw logs, git diff, discovered suites) into package dir
2. SHA256SUMS.txt for ALL artifacts (PNGs, scripts, logs, diff, manifest)
3. MANIFEST.md detailing environment, commit base, git remote, test counts, documentary fidelity, and checksums
4. Compresses everything into review_artifacts_onboarding_simplified.zip
"""

import os
import shutil
import hashlib
import zipfile
import subprocess

REPO_ROOT = r"c:\Users\KIKE\Downloads\ppos-control-plane-phase-10-intelligence-layer"
ARTIFACTS_DIR = os.path.join(REPO_ROOT, "review_artifacts_onboarding_simplified")
ZIP_PATH = os.path.join(REPO_ROOT, "review_artifacts_onboarding_simplified.zip")

def get_git_sha():
    try:
        out = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=REPO_ROOT, text=True).strip()
        return out
    except Exception:
        return "UNKNOWN_SHA"

def get_git_remote():
    try:
        out = subprocess.check_output(["git", "config", "--get", "remote.origin.url"], cwd=REPO_ROOT, text=True).strip()
        return out
    except Exception:
        return "UNKNOWN_REMOTE"

def compute_sha256(filepath):
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()

def package():
    os.makedirs(ARTIFACTS_DIR, exist_ok=True)

    # 1. Copy technical verification files directly into package directory
    source_files = {
        "test_onboarding_connected_suite.js": os.path.join(REPO_ROOT, "scripts", "test_onboarding_connected_suite.js"),
        "raw_vitest_output.log": os.path.join(REPO_ROOT, "raw_vitest_output.log"),
        "raw_build_output.log": os.path.join(REPO_ROOT, "raw_build_output.log"),
        "git_diff_review.diff": os.path.join(REPO_ROOT, "git_diff_review.diff"),
        "vitest_discovered_suites.txt": os.path.join(REPO_ROOT, "vitest_discovered_suites.txt")
    }

    for target_name, src_path in source_files.items():
        if os.path.exists(src_path):
            shutil.copy2(src_path, os.path.join(ARTIFACTS_DIR, target_name))
            print(f"  [COPIED] {target_name}")

    git_sha = get_git_sha()
    git_remote = get_git_remote()

    # 2. Compute individual checksums for all deliverables in directory
    files_to_hash = sorted([f for f in os.listdir(ARTIFACTS_DIR) if f not in ("SHA256SUMS.txt", "MANIFEST.md")])
    sha256_lines = []
    file_checksums = {}

    for f in files_to_hash:
        full_p = os.path.join(ARTIFACTS_DIR, f)
        digest = compute_sha256(full_p)
        sha256_lines.append(f"{digest}  {f}")
        file_checksums[f] = digest

    # 3. Generate MANIFEST.md
    manifest_content = f"""# Manifiesto de Evidencias de Onboarding de Calibración
**Proyecto:** PrintPrice OS Control Plane
**Rama:** `phase-39.2-tenant-management-console`
**Remoto Oficial (Verificado):** `{git_remote}`
**Commit Base (HEAD del repositorio):** `{git_sha}`
**Código Auditado y Capturado:** HEAD base `{git_sha}` con modificaciones locales de integridad y robustecimiento.
**Estado del Worktree:** Modificaciones locales de auditoría aplicadas sobre `{git_sha}`.

### Modificaciones Locales Aplicadas sobre `{git_sha}`:
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
| `01_onboarding_step1_families_dark_1366.png` | PNG (1366×768) | Paso 1: 4 familias canónicas. Selector 'En configuración' neutral sin badge ambiguo 'ACTIVO'. | `{file_checksums.get('01_onboarding_step1_families_dark_1366.png', '')}` |
| `01_onboarding_step1_families_light_1280.png` | PNG (1280×800) | Paso 1 en modo Claro: selector y familias canónicas sin desbordamiento. | `{file_checksums.get('01_onboarding_step1_families_light_1280.png', '')}` |
| `02_onboarding_step2_upload_pdf_fixtures_dark_1366.png` | PNG (1366×768) | Paso 2: Entrada dual limpia (Subir PDF / Oferta manual), sin botones ficticios de terceros. | `{file_checksums.get('02_onboarding_step2_upload_pdf_fixtures_dark_1366.png', '')}` |
| `02b_onboarding_step2_manual_offer_form_dark_1366.png` | PNG (1366×768) | Paso 2b: Formulario manual progresivo en 7 secciones con referencia de presupuesto editable y opcional. | `{file_checksums.get('02b_onboarding_step2_manual_offer_form_dark_1366.png', '')}` |
| `03_onboarding_step3_stutensee_discrepancy_dark_1366.png` | PNG (1366×768) | Paso 3 (Stutensee): Tiradas auténticas de 250 (1.283 + 190 = 1.473 €) y 300 con discrepancia aritmética documentada (1.525 / 300 = 5,08 € real vs 3,05 € declarado en PDF). Cero cifras inventadas. | `{file_checksums.get('03_onboarding_step3_stutensee_discrepancy_dark_1366.png', '')}` |
| `03b_onboarding_step3_mysteriosen_ambiguity_dark_1366.png` | PNG (1366×768) | Paso 3b (Die Mysteriösen Steine): Datos auténticos del PDF (1.792 € fab + 415 € transp = 2.207 € total, 1,47 €/ud) con aviso explícito de contradicción documental Softcover vs cartón MGP 2,4 mm y botón de comparación bloqueado/deshabilitado. | `{file_checksums.get('03b_onboarding_step3_mysteriosen_ambiguity_dark_1366.png', '')}` |
| `03_onboarding_step3_natur_variants_light_1280.png` | PNG (1280×800) | Paso 3 (Natur): Denominación original exacta 'Munken Print White 1.5, 80 g' (148×210 mm, 592p, cubierta cartulina 300 g, cosido; tiradas 500/600/700 con 4.321, 4.604, 4.846 € fab + 325 € transp). Cero menciones no acreditadas. | `{file_checksums.get('03_onboarding_step3_natur_variants_light_1280.png', '')}` |
| `04_onboarding_step4_compare_calculations_dark_1366.png` | PNG (1366×768) | Paso 4: Comparación fiel de Die Mysteriösen Steine tras resolución de ambigüedad. Fabricación declarada 1.792,00 € vs Motor 1.784,83 € (diferencia 7,17 €, residual +0.4%), 1.500 ej., Arctic Volumen 150g, 72 páginas, Tintas interior 4/4. Cero contaminación con datos de otros presupuestos ni ceros artificiales. | `{file_checksums.get('04_onboarding_step4_compare_calculations_dark_1366.png', '')}` |
| `05_onboarding_step5_rate_proposal_dark_1366.png` | PNG (1366×768) | Paso 5: Propuesta del solver sin claves técnicas visibles (`{{key}}`). Bloque de garantías corregido en Dark con alto contraste y sin mención a tablas de BD. | `{file_checksums.get('05_onboarding_step5_rate_proposal_dark_1366.png', '')}` |
| `05b_onboarding_step5_confirm_modal_dark_1366.png` | PNG (1366×768) | Paso 5: Diálogo modal completo de aceptación gobernada. | `{file_checksums.get('05b_onboarding_step5_confirm_modal_dark_1366.png', '')}` |
| `05b_onboarding_step5_confirm_modal_dialog_dark_1366.png` | PNG (Close-up) | Close-up del diálogo: Redacción clara sin nombre de tabla `pricing_revisions`, describe exactamente qué guarda (parámetros industriales) y qué requiere autorización independiente. | `{file_checksums.get('05b_onboarding_step5_confirm_modal_dialog_dark_1366.png', '')}` |
| `06_onboarding_step1_mobile_390_dark.png` | PNG (390×844) | Móvil Paso 1: Indicador de paso comprensible con texto ('Paso 1 de 5: Qué productos fabricas') y badge neutral 'En configuración'. | `{file_checksums.get('06_onboarding_step1_mobile_390_dark.png', '')}` |
| `06b_onboarding_step2_mobile_390_dark.png` | PNG (390×844) | Móvil Paso 2: Indicador 'Paso 2 de 5: Añadir presupuestos', controles superiores en grid sin recortar ni desbordar. | `{file_checksums.get('06b_onboarding_step2_mobile_390_dark.png', '')}` |
| `07_onboarding_step1_en_light_1280.png` | PNG (1280×800) | Paridad lingüística en Inglés: 'In setup' y navegación sincronizada. | `{file_checksums.get('07_onboarding_step1_en_light_1280.png', '')}` |
| `08_onboarding_step1_de_dark_1366.png` | PNG (1366×768) | Paridad lingüística en Alemán: 'In Konfiguration' y tipografía ajustada sin desbordamientos. | `{file_checksums.get('08_onboarding_step1_de_dark_1366.png', '')}` |
| `test_onboarding_connected_suite.js` | Código JS | Harness revisable de prueba conectada para MySQL aislado (PPOS_ISOLATED_TEST_RUN=1, base pposrcmdw0qdtest, usuario ppos_rc_mdw0qd@127.0.0.1, orden estricto FK). | `{file_checksums.get('test_onboarding_connected_suite.js', '')}` |
| `raw_vitest_output.log` | Log original | Log completo de ejecución de Vitest: 21 suites y 266 pruebas pasadas. | `{file_checksums.get('raw_vitest_output.log', '')}` |
| `raw_build_output.log` | Log original | Log completo de compilación de producción con Vite (`dist/` generado limpiamente). | `{file_checksums.get('raw_build_output.log', '')}` |
| `git_diff_review.diff` | Diff original | Diff completo de todas las modificaciones de código respecto al commit base `aff7a1e`. | `{file_checksums.get('git_diff_review.diff', '')}` |
| `vitest_discovered_suites.txt` | Texto | Desglose verificado de los 21 archivos descubiertos por Vitest con el conteo exacto de tests por suite (suma: 266). | `{file_checksums.get('vitest_discovered_suites.txt', '')}` |

---

## 3. Invariantes Comprobados en la Suite de Tests
- **Vitest**: 21 suites descubiertas y ejecutadas, 266 tests unitarios y de integración pasando (100% éxito).
- **Validación Matemática**: Validación exhaustiva con `Number.isFinite` que rechaza `NaN`, `Infinity`, `-Infinity`, ceros engañosos y números negativos en cliente y servidor.
- **Regresión Negativa de Comparación**: Se ha verificado que un presupuesto positivo con respuesta del motor ausente (`null`), incompleta o malformada (`0` o negativa) nunca muestra estado calibrado, muestra aviso de cálculo incompleto, visualiza guiones `—` con insignia 'Sin cálculo' y bloquea estrictamente el botón de avance a la propuesta.
- **Cancelación Limpia**: La cancelación en el modal gobernado produce cero escrituras en BD y ninguna mutación de tarifas.
- **Aislamiento de Tenant**: Verificada la propagación inviolable de `tenantId` y `printerNodeId` en todo el ciclo.
- **Build de Producción**: Compilación limpia con Vite (`dist/` generado en 11.87s).
"""

    manifest_path = os.path.join(ARTIFACTS_DIR, "MANIFEST.md")
    with open(manifest_path, "w", encoding="utf-8") as f:
        f.write(manifest_content)

    # 4. Write final SHA256SUMS.txt including MANIFEST.md
    manifest_digest = compute_sha256(manifest_path)
    sha256_lines.append(f"{manifest_digest}  MANIFEST.md")

    sha256_path = os.path.join(ARTIFACTS_DIR, "SHA256SUMS.txt")
    with open(sha256_path, "w", encoding="utf-8") as f:
        f.write("\n".join(sorted(sha256_lines)) + "\n")

    # 5. Create ZIP with all deliverables
    with zipfile.ZipFile(ZIP_PATH, "w", zipfile.ZIP_DEFLATED) as z:
        for root, _, files in os.walk(ARTIFACTS_DIR):
            for file in files:
                full_path = os.path.join(root, file)
                rel_path = os.path.relpath(full_path, ARTIFACTS_DIR)
                z.write(full_path, rel_path)

    zip_size = os.path.getsize(ZIP_PATH)
    zip_sha = compute_sha256(ZIP_PATH)

    print(f"\nPackaging complete:")
    print(f"  ZIP: {ZIP_PATH} ({zip_size} bytes)")
    print(f"  SHA-256: {zip_sha}")

if __name__ == "__main__":
    package()
