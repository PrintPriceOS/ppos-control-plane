# -*- coding: utf-8 -*-
import os
import hashlib
import zipfile
import shutil

BRAIN_DIR = r"C:\Users\KIKE\.gemini\antigravity-ide\brain\b274e27a-030a-4140-9e90-be1d5a05ecc9"
DEST_DIR = "review_artifacts_onboarding_simplified"
ZIP_PATH = "review_artifacts_onboarding_simplified.zip"

FILES_TO_PACKAGE = [
    "01_onboarding_step1_families_dark_1366.png",
    "01_onboarding_step1_families_light_1280.png",
    "02_onboarding_step2_upload_pdf_fixtures_dark_1366.png",
    "02b_onboarding_step2_manual_offer_form_dark_1366.png",
    "03_onboarding_step3_stutensee_discrepancy_dark_1366.png",
    "03b_onboarding_step3_mysteriosen_ambiguity_dark_1366.png",
    "03_onboarding_step3_natur_variants_light_1280.png",
    "04_onboarding_step4_compare_calculations_dark_1366.png",
    "05_onboarding_step5_rate_proposal_dark_1366.png",
    "05b_onboarding_step5_confirm_modal_dark_1366.png",
    "05b_onboarding_step5_confirm_modal_dialog_dark_1366.png",
    "06_onboarding_step1_mobile_390_dark.png",
    "06b_onboarding_step2_mobile_390_dark.png",
    "07_onboarding_step1_en_light_1280.png",
    "08_onboarding_step1_de_dark_1366.png"
]

def main():
    os.makedirs(DEST_DIR, exist_ok=True)
    checksums = []

    for fname in FILES_TO_PACKAGE:
        src = os.path.join(BRAIN_DIR, fname)
        dst = os.path.join(DEST_DIR, fname)
        if os.path.exists(src):
            shutil.copy2(src, dst)
            with open(dst, "rb") as f:
                sha = hashlib.sha256(f.read()).hexdigest()
            checksums.append(f"{sha}  {fname}")
            print(f"Copied & hashed: {fname} -> {sha[:12]}...")
        else:
            print(f"WARNING: File not found: {src}")

    sha_path = os.path.join(DEST_DIR, "SHA256SUMS.txt")
    with open(sha_path, "w", encoding="utf-8") as f:
        f.write("\n".join(checksums) + "\n")

    # Create ZIP
    with zipfile.ZipFile(ZIP_PATH, "w", zipfile.ZIP_DEFLATED) as zipf:
        for fname in FILES_TO_PACKAGE:
            dst = os.path.join(DEST_DIR, fname)
            if os.path.exists(dst):
                zipf.write(dst, arcname=fname)
        zipf.write(sha_path, arcname="SHA256SUMS.txt")

    print(f"\nCreated {ZIP_PATH} successfully with {len(checksums)} artifacts.")

if __name__ == "__main__":
    main()
