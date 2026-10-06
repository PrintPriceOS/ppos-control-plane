import os
import sys
import shutil
import hashlib
import zipfile
import tempfile
import subprocess

TARGET_DIR = os.path.abspath("review_artifacts_ux_setup_refactor")
ZIP_NAME = "review_artifacts_ux_setup_refactor.zip"
BRAIN_DIR = r"C:\Users\KIKE\.gemini\antigravity-ide\brain\b274e27a-030a-4140-9e90-be1d5a05ecc9"

os.makedirs(TARGET_DIR, exist_ok=True)

# 1. Copy Screenshots
SCREENSHOTS = [
    "01_setup_hub_overview_1366x768_dark_es.png",
    "02_setup_hub_overview_1366x768_light_es.png",
    "03_setup_hub_overview_1366x768_dark_en.png",
    "04_setup_hub_overview_1366x768_dark_de.png",
    "05_setup_hub_pricing_products_dark.png",
    "06_setup_hub_pricing_assistant_dark.png",
    "07_setup_hub_pricing_manual_rates_dark.png",
    "08_setup_hub_overview_mobile_390x844_dark.png",
]

SRC_SCREENSHOTS_DIR = os.path.abspath("review_artifacts_ux_setup_audit")
for s in SCREENSHOTS:
    src = os.path.join(SRC_SCREENSHOTS_DIR, s)
    if os.path.exists(src):
        shutil.copy2(src, os.path.join(TARGET_DIR, s))
        print(f"Copied screenshot: {s}")
    else:
        print(f"Warning: Screenshot not found: {src}")

# 2. Capture Git Diff & Status
diff_out = subprocess.run(["git", "--no-pager", "diff", "origin/phase-39.2-tenant-management-console"], capture_output=True, text=True, encoding="utf-8")
if not diff_out.stdout.strip():
    diff_out = subprocess.run(["git", "--no-pager", "diff"], capture_output=True, text=True, encoding="utf-8")
with open(os.path.join(TARGET_DIR, "git.diff"), "w", encoding="utf-8") as f:
    f.write(diff_out.stdout)

status_out = subprocess.run(["git", "--no-pager", "status", "--porcelain"], capture_output=True, text=True, encoding="utf-8")
with open(os.path.join(TARGET_DIR, "git_status.txt"), "w", encoding="utf-8") as f:
    f.write(status_out.stdout)

# 3. Copy Relevant Sources
SOURCES_TO_PACKAGE = [
    "src/ui/lib/blockerLocalization.ts",
    "src/ui/components/printhouse/onboarding/SimplifiedOnboardingJourney.tsx",
    "src/ui/components/printhouse/pricing/CanonicalIndustrialPricingEditor.tsx",
    "src/ui/components/printhouse/setup/PricingPanel.tsx",
    "src/ui/components/printhouse/setup/SetupModuleCard.tsx",
    "src/ui/components/printhouse/setup/SetupProgressSummary.tsx",
    "src/ui/pages/printhouse/PrinthouseSetupHub.tsx",
    "src/ui/types/printhouseOnboardingTypes.ts",
    "src/ui/de.ts",
    "src/ui/en.ts",
    "src/ui/es.ts",
    "scripts/verify_and_capture_setup_refactor.py",
    "tests/PricingWorkflowConservation.test.tsx",
]

# Copy verification results and differential tsc reports
for f_name in ["verification_results.json", "candidate_tsc.log", "base_tsc.log", "tsc_differential_report.md", "tsc_differential_report.json"]:
    f_src = os.path.join(SRC_SCREENSHOTS_DIR, f_name)
    if os.path.exists(f_src):
        shutil.copy2(f_src, os.path.join(TARGET_DIR, f_name))
        print(f"Copied report/log: {f_name}")

src_copy_dir = os.path.join(TARGET_DIR, "sources")
os.makedirs(src_copy_dir, exist_ok=True)
for src in SOURCES_TO_PACKAGE:
    if os.path.exists(src):
        dst = os.path.join(src_copy_dir, src)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copy2(src, dst)
        print(f"Copied source: {src}")

# 4. Vitest Execution Log
print("Packaging verified Vitest execution log...", flush=True)
vitest_res = subprocess.run(["npx", "vitest", "run"], capture_output=True, text=True, encoding="utf-8", shell=True)
with open(os.path.join(TARGET_DIR, "vitest.log"), "w", encoding="utf-8") as f:
    f.write(vitest_res.stdout + "\n" + vitest_res.stderr)
print(f"Vitest exited with code: {vitest_res.returncode}")

# 5. Build Execution Log
print("Running npm run build...", flush=True)
build_res = subprocess.run(["npm", "run", "build"], capture_output=True, text=True, encoding="utf-8", shell=True)
with open(os.path.join(TARGET_DIR, "build.log"), "w", encoding="utf-8") as f:
    f.write(build_res.stdout + "\n" + build_res.stderr)
print(f"Build exited with code: {build_res.returncode}")

# 6. Checksum helper
def sha256_file(filepath):
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()

# 7. Generate SHA256SUMS.txt inside TARGET_DIR
print("Calculating SHA256 for all packaged files...", flush=True)
sums_lines = []
for root, dirs, files in os.walk(TARGET_DIR):
    for f in sorted(files):
        if f == "SHA256SUMS.txt":
            continue
        full_p = os.path.join(root, f)
        rel_p = os.path.relpath(full_p, TARGET_DIR).replace("\\", "/")
        c_hash = sha256_file(full_p)
        sums_lines.append(f"{c_hash}  {rel_p}")

with open(os.path.join(TARGET_DIR, "SHA256SUMS.txt"), "w", encoding="utf-8") as f:
    f.write("\n".join(sums_lines) + "\n")

# 8. Create ZIP
print(f"Creating zip archive {ZIP_NAME}...", flush=True)
with zipfile.ZipFile(ZIP_NAME, "w", zipfile.ZIP_DEFLATED) as zipf:
    for root, dirs, files in os.walk(TARGET_DIR):
        for f in sorted(files):
            full_p = os.path.join(root, f)
            arc_name = os.path.relpath(full_p, os.path.dirname(TARGET_DIR))
            zipf.write(full_p, arc_name)

zip_hash = sha256_file(ZIP_NAME)
print(f"Zip created: {ZIP_NAME}")
print(f"SHA-256: {zip_hash}")

# 9. Verify ZIP in temp directory
print("Verifying zip extraction integrity in temporary dir...", flush=True)
with tempfile.TemporaryDirectory() as tmp_dir:
    with zipfile.ZipFile(ZIP_NAME, "r") as zipf:
        zipf.extractall(tmp_dir)
        extracted_files = zipf.namelist()
        print(f"Extracted {len(extracted_files)} files successfully.")

# 10. Copy to Brain Directory
if os.path.exists(BRAIN_DIR):
    brain_dst = os.path.join(BRAIN_DIR, ZIP_NAME)
    shutil.copy2(ZIP_NAME, brain_dst)
    print(f"Copied zip to brain directory: {brain_dst}")

print("\n--- ALL PACKAGING AND VERIFICATION COMPLETE ---")
