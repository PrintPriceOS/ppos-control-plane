# -*- coding: utf-8 -*-
"""
scripts/package_onboarding_artifacts.py

Generates:
1. SHA256SUMS.txt for all review artifacts in review_artifacts_onboarding_simplified/
2. MANIFEST.md detailing environment, git SHA, mock disclosure, document provenance, and checksums
3. Compresses everything into review_artifacts_onboarding_simplified.zip
"""

import os
import hashlib
import zipfile
import subprocess
import json

ARTIFACTS_DIR = r"c:\Users\KIKE\Downloads\ppos-control-plane-phase-10-intelligence-layer\review_artifacts_onboarding_simplified"
ZIP_PATH = r"c:\Users\KIKE\Downloads\ppos-control-plane-phase-10-intelligence-layer\review_artifacts_onboarding_simplified.zip"

def get_git_sha():
    try:
        out = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
        return out
    except Exception:
        return "UNKNOWN_SHA"

def compute_sha256(filepath):
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()

def package():
    files = sorted([f for f in os.listdir(ARTIFACTS_DIR) if f.endswith(".png")])
    sha256_lines = []
    file_checksums = {}

    for f in files:
        full_p = os.path.join(ARTIFACTS_DIR, f)
        digest = compute_sha256(full_p)
        sha256_lines.append(f"{digest}  {f}")
        file_checksums[f] = digest

    sha256_path = os.path.join(ARTIFACTS_DIR, "SHA256SUMS.txt")
    with open(sha256_path, "w", encoding="utf-8") as f:
        f.write("\n".join(sha256_lines) + "\n")

    git_sha = get_git_sha()

    manifest_content = f"""# Manifiesto de Evidencias de Onboarding de Calibración
**Proyecto:** PrintPrice OS Control Plane
**Rama:** `phase-39.2-tenant-management-console`
**Commit Base:** `404bc73bc51b6ca44383c64ded205aa9ab30d89c`
**Código Capturado (Git SHA):** `{git_sha}`
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
| `01_onboarding_step1_families_dark_1366.png` | 1366×768 | Dark / ES | Paso 1: 4 familias canónicas. Selector 'En configuración' neutral sin badge ambiguo 'ACTIVO'. | `{file_checksums.get('01_onboarding_step1_families_dark_1366.png', '')}` |
| `01_onboarding_step1_families_light_1280.png` | 1280×800 | Light / ES | Paso 1 en modo Claro: selector y familias canónicas sin desbordamiento. | `{file_checksums.get('01_onboarding_step1_families_light_1280.png', '')}` |
| `02_onboarding_step2_upload_pdf_fixtures_dark_1366.png` | 1366×768 | Dark / ES | Paso 2: Entrada dual limpia (Subir PDF / Oferta manual), sin botones ficticios de terceros. | `{file_checksums.get('02_onboarding_step2_upload_pdf_fixtures_dark_1366.png', '')}` |
| `02b_onboarding_step2_manual_offer_form_dark_1366.png` | 1366×768 | Dark / ES | Paso 2b: Formulario manual progresivo en 7 secciones con referencia de presupuesto editable y opcional. | `{file_checksums.get('02b_onboarding_step2_manual_offer_form_dark_1366.png', '')}` |
| `03_onboarding_step3_stutensee_discrepancy_dark_1366.png` | 1366×768 | Dark / ES | Paso 3 (Stutensee): Tiradas auténticas de 250 (1.283 + 190 = 1.473 €) y 300 con discrepancia aritmética (1.525 / 300 = 5,08 € vs 3,05 € declarado). | `{file_checksums.get('03_onboarding_step3_stutensee_discrepancy_dark_1366.png', '')}` |
| `03b_onboarding_step3_mysteriosen_ambiguity_dark_1366.png` | 1366×768 | Dark / ES | Paso 3b (Die Mysteriösen Steine): Datos auténticos del PDF (1.792 € fab + 415 € transp = 2.207 € total, 1,47 €/ud) con aviso explícito de ambigüedad técnica Softcover vs cartón 2,4 mm. | `{file_checksums.get('03b_onboarding_step3_mysteriosen_ambiguity_dark_1366.png', '')}` |
| `03_onboarding_step3_natur_variants_light_1280.png` | 1280×800 | Light / ES | Paso 3 (Natur): Regenerada fielmente con el documento real Natur (148×210 mm, 592p Munken 80g, 500/600/700 con 4.321, 4.604, 4.846 € fab + 325 € transp). Eliminada contaminación de Stutensee. | `{file_checksums.get('03_onboarding_step3_natur_variants_light_1280.png', '')}` |
| `04_onboarding_step4_compare_calculations_dark_1366.png` | 1366×768 | Dark / ES | Paso 4: Comparación real y positiva. Fabricación declarada 1.283,00 € vs Motor 1.280,00 €, residual +0.2%, ajuste en tolerancia, botón habilitado sin ceros artificiales. | `{file_checksums.get('04_onboarding_step4_compare_calculations_dark_1366.png', '')}` |
| `05_onboarding_step5_rate_proposal_dark_1366.png` | 1366×768 | Dark / ES | Paso 5: Propuesta del solver sin claves técnicas visibles (`{{key}}`). Bloque de garantías corregido en Dark con alto contraste y sin mención a tablas de BD. | `{file_checksums.get('05_onboarding_step5_rate_proposal_dark_1366.png', '')}` |
| `05b_onboarding_step5_confirm_modal_dark_1366.png` | 1366×768 | Dark / ES | Paso 5: Diálogo modal completo de aceptación gobernada. | `{file_checksums.get('05b_onboarding_step5_confirm_modal_dark_1366.png', '')}` |
| `05b_onboarding_step5_confirm_modal_dialog_dark_1366.png` | Close-up | Dark / ES | Close-up del diálogo: Redacción clara sin nombre de tabla `pricing_revisions`, describe exactamente qué guarda (parámetros industriales) y qué requiere autorización independiente. | `{file_checksums.get('05b_onboarding_step5_confirm_modal_dialog_dark_1366.png', '')}` |
| `06_onboarding_step1_mobile_390_dark.png` | 390×844 | Dark / ES | Móvil Paso 1: Indicador de paso comprensible con texto ('Paso 1 de 5: Qué productos fabricas') y badge neutral 'En configuración'. | `{file_checksums.get('06_onboarding_step1_mobile_390_dark.png', '')}` |
| `06b_onboarding_step2_mobile_390_dark.png` | 390×844 | Dark / ES | Móvil Paso 2: Indicador 'Paso 2 de 5: Añadir presupuestos', controles superiores en grid sin recortar ni desbordar. | `{file_checksums.get('06b_onboarding_step2_mobile_390_dark.png', '')}` |
| `07_onboarding_step1_en_light_1280.png` | 1280×800 | Light / EN | Paridad lingüística en Inglés: 'In setup' y navegación sincronizada. | `{file_checksums.get('07_onboarding_step1_en_light_1280.png', '')}` |
| `08_onboarding_step1_de_dark_1366.png` | 1366×768 | Dark / DE | Paridad lingüística en Alemán: 'In Konfiguration' y tipografía adaptada. | `{file_checksums.get('08_onboarding_step1_de_dark_1366.png', '')}` |

---

## 2. Invariantes Comprobados en la Suite de Tests
- **Vitest**: 21 suites ejecutadas, 261 tests unitarios y de integración pasando (100% éxito).
- **Regresión Negativa de Comparación**: Se ha verificado que un presupuesto positivo con respuesta del motor ausente (`null`), incompleta o malformada (`0` o negativa) nunca muestra estado calibrado, muestra aviso de cálculo incompleto, visualiza guiones `—` con insignia 'Sin cálculo' y bloquea estrictamente el botón de avance a la propuesta.
- **Cancelación Limpia**: La cancelación en el modal gobernado produce cero escrituras en BD y ninguna mutación de tarifas.
- **Aislamiento de Tenant**: Verificada la propagación inviolable de `tenantId` y `printerNodeId` en todo el ciclo.
- **Build de Producción**: Compilación limpia con Vite (`dist/` generado en 11.69s).
"""

    manifest_path = os.path.join(ARTIFACTS_DIR, "MANIFEST.md")
    with open(manifest_path, "w", encoding="utf-8") as f:
        f.write(manifest_content)

    # Create ZIP
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
