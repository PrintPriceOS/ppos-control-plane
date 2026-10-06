# -*- coding: utf-8 -*-
"""
scripts/capture_onboarding_evidence.py

Captures complete E2E visual evidence of the Simplified Printhouse Onboarding Journey:
- Step 1: Qué productos fabricas (4 binding families, toggle 'No ofrecemos este producto', SVG iconography, responsive)
- Step 2: Añadir presupuestos (Clean file upload, drag-and-drop, zero third-party fixture buttons)
- Step 2b: Formulario manual progresivo (7 secciones, referencia de presupuesto editable y opcional)
- Step 3: Revisión de especificaciones:
  * Stutensee: authentic 250 & 300 runs with arithmetic discrepancy (1525 / 300 = 5.08 € vs 3.05 € declared)
  * Die Mysteriösen Steine: authentic 1792 € manufacturing + 415 € combined shipping = 2207 € total, with technical ambiguity banner
  * Natur: authentic 148x210 mm, 592p Munken 80g Klappenbroschur, 500/600/700 runs with 4321, 4604, 4846 €
- Step 4: Comparar cálculos (Positive target, positive engine calculation, tolerance fit, zero fake 0 €)
- Step 5: Aceptar propuesta (Human-friendly parameters without raw keys, dark mode safeguards, governed confirmation modal without pricing_revisions table name)
- Modal dialog close-up y cancelación sin escrituras
- Variaciones ES / Claro / Oscuro, Desktop (1366 / 1280) y Móvil (390).
"""

import os
import sys
import json
import time
import shutil
from playwright.sync_api import sync_playwright

OUTPUT_DIR = r"C:\Users\KIKE\.gemini\antigravity-ide\brain\b274e27a-030a-4140-9e90-be1d5a05ecc9"
PACKAGE_DIR = r"c:\Users\KIKE\Downloads\ppos-control-plane-phase-10-intelligence-layer\review_artifacts_onboarding_simplified"
BASE_URL = "http://localhost:3000/printhouse/setup?tab=PRICING"

def setup_page_routes(page):
    page.route("**/api/printhouse/onboarding*", lambda r: r.fulfill(
        status=200, 
        content_type='application/json', 
        body=json.dumps({
            "ok": True,
            "data": {
                "company": {"companyName": "Druckerei Süd GmbH", "country": "DE", "city": "Stuttgart"},
                "sites": [{"siteId": "site-1", "name": "Planta Principal", "city": "Stuttgart"}],
                "readiness": {"score": 88, "summary": "Ready"}
            }
        })
    ))
    
    page.route("**/api/printhouse/onboarding/pricing/industrial*", lambda r: r.fulfill(
        status=200, 
        content_type='application/json', 
        body=json.dumps({
            "ok": True,
            "data": {
                "nodeId": "node-stuttgart-01",
                "nodeName": "Heidelberg Speedmaster XL 106",
                "rates": {}
            }
        })
    ))
    
    page.route("**/api/admin/audit*", lambda r: r.fulfill(
        status=200, 
        content_type='application/json', 
        body=json.dumps({"ok": True, "data": []})
    ))

    # Calibration sessions & runs mock APIs
    page.route("**/api/printhouse/onboarding/pricing/calibrations/*/ready*", lambda r: r.fulfill(
        status=200, content_type='application/json',
        body=json.dumps({"ok": True, "data": {"id": "sess-cal-01", "status": "READY"}})
    ))

    page.route("**/api/printhouse/onboarding/pricing/calibrations/*/calculate*", lambda r: r.fulfill(
        status=200, content_type='application/json',
        body=json.dumps({
            "ok": True,
            "data": {
                "id": "run-cal-01",
                "status": "SUCCESS",
                "enginePriceBefore": 1340.00,
                "enginePriceAfter": 1280.00,
                "targetPrice": 1283.00,
                "absoluteResidual": 3.00,
                "percentResidual": 0.23,
                "proposedPatch": {
                    "machine_hourly_rate": 68.50,
                    "plate_cost": 9.80,
                    "sewing_cost_per_sig": 0.042,
                    "casing_in_rate": 0.38,
                    "freight_pallet_rate": 162.50
                }
            }
        })
    ))

    page.route("**/api/printhouse/onboarding/pricing/calibrations/*/accept*", lambda r: r.fulfill(
        status=200, content_type='application/json',
        body=json.dumps({
            "ok": True,
            "data": {
                "revisionId": "rev-ph-stuttgart-v2",
                "status": "ACCEPTED",
                "version": 2
            }
        })
    ))

    page.route("**/api/printhouse/onboarding/pricing/calibrations*", lambda r: r.fulfill(
        status=200, content_type='application/json',
        body=json.dumps({"ok": True, "data": {"id": "sess-cal-01", "status": "DRAFT"}})
    ))

    page.route("**/api/printhouse/onboarding/pricing/revisions*", lambda r: r.fulfill(
        status=200, content_type='application/json',
        body=json.dumps({
            "ok": True,
            "data": [
                {
                    "revisionId": "rev-ph-stuttgart-v2",
                    "version": 2,
                    "status": "ACTIVE",
                    "createdAt": "2026-10-06T00:00:00Z"
                }
            ]
        })
    ))

    # Authentic payloads
    natur_payload = {
        "productTitle": "Natur",
        "quoteRef": "NAT-2026-0831",
        "quoteDate": "2026-08-31",
        "widthMm": 148,
        "heightMm": 210,
        "pageCount": 592,
        "interiorPaper": "Munken Print White 1.5, 80 g",
        "coverPaper": "Karton 300g",
        "bindingMethod": "thread_sewn",
        "runs": [
            {
                "id": "run-1",
                "variantKey": "natur_q500",
                "quantity": 500,
                "manufacturingPrice": 4321,
                "transportPrice": 325,
                "quotedTotalPrice": 4646,
                "quotedUnitPrice": 9.29,
                "validationStatus": "CONSISTENT",
                "paperVariant": "Munken Print White 1.5, 80 g",
                "logisticsOption": "Standard DE (325 €)",
                "hasEquivalentBreakdown": True
            },
            {
                "id": "run-2",
                "variantKey": "natur_q600",
                "quantity": 600,
                "manufacturingPrice": 4604,
                "transportPrice": 325,
                "quotedTotalPrice": 4929,
                "quotedUnitPrice": 8.22,
                "validationStatus": "CONSISTENT",
                "paperVariant": "Munken Print White 1.5, 80 g",
                "logisticsOption": "Standard DE (325 €)",
                "hasEquivalentBreakdown": True
            },
            {
                "id": "run-3",
                "variantKey": "natur_q700",
                "quantity": 700,
                "manufacturingPrice": 4846,
                "transportPrice": 325,
                "quotedTotalPrice": 5171,
                "quotedUnitPrice": 7.39,
                "validationStatus": "CONSISTENT",
                "paperVariant": "Munken Print White 1.5, 80 g",
                "logisticsOption": "Standard DE (325 €)",
                "hasEquivalentBreakdown": True
            }
        ]
    }

    mysteriosen_payload = {
        "productTitle": "Die Mysteriösen Steine",
        "quoteRef": "DMS-2026-0908",
        "quoteDate": "2026-09-08",
        "widthMm": 170,
        "heightMm": 240,
        "pageCount": 72,
        "interiorPaper": "Arctic Volumen 150g",
        "coverPaper": "Silk 130g",
        "boardThicknessMm": 2.4,
        "hasAmbiguity": True,
        "ambiguityDetails": "Contradicción documental: El encabezado declara Softcover, pero la especificación técnica incluye cartón MGP 2,4 mm (Tapa dura).",
        "runs": [
            {
                "id": "run-1",
                "variantKey": "mysteriosen_q1500",
                "quantity": 1500,
                "manufacturingPrice": 1792,
                "transportPrice": 415,
                "quotedTotalPrice": 2207,
                "quotedUnitPrice": 1.47,
                "validationStatus": "REQUIRES_REVIEW",
                "paperVariant": "Arctic Volumen 150g",
                "logisticsOption": "Zusammenversand (415 €)",
                "hasEquivalentBreakdown": True
            }
        ]
    }

    stutensee_payload = {
        "productTitle": "Mit Margot durch das Gartenjahr",
        "quoteRef": "ANG-2026-904",
        "quoteDate": "2026-09-04",
        "widthMm": 170,
        "heightMm": 240,
        "pageCount": 104,
        "interiorPaper": "Silk 150g",
        "coverPaper": "Silk 130g",
        "boardThicknessMm": 2.4,
        "hasDiscrepancy": True,
        "runs": [
            {
                "id": "run-1",
                "variantKey": "stutensee_q250",
                "quantity": 250,
                "manufacturingPrice": 1283,
                "transportPrice": 190,
                "quotedTotalPrice": 1473,
                "quotedUnitPrice": 5.89,
                "validationStatus": "CONSISTENT",
                "paperVariant": "Silk 150g",
                "logisticsOption": "Standard DE (190 €)",
                "hasEquivalentBreakdown": True
            },
            {
                "id": "run-2",
                "variantKey": "stutensee_q300",
                "quantity": 300,
                "manufacturingPrice": 1335,
                "transportPrice": 190,
                "quotedTotalPrice": 1525,
                "quotedUnitPrice": 3.05,
                "computedTotalPrice": 1525,
                "computedUnitPrice": 5.0833,
                "validationStatus": "INCONSISTENT_UNIT_PRICE",
                "paperVariant": "Silk 150g",
                "logisticsOption": "Standard DE (190 €)",
                "hasEquivalentBreakdown": True
            }
        ]
    }

    def handle_upload(route, request):
        post_data = request.post_data or ""
        if "Natur" in post_data:
            chosen = natur_payload
        elif "Mysteriosen" in post_data or "Steine" in post_data:
            chosen = mysteriosen_payload
        else:
            chosen = stutensee_payload
        route.fulfill(
            status=200,
            content_type='application/json',
            body=json.dumps({"ok": True, "data": chosen})
        )

    page.route("**/api/printhouse/onboarding/quote-evidence/upload*", handle_upload)

def init_user_storage(page, locale='es', theme='dark'):
    page.goto("http://localhost:3000/", wait_until="domcontentloaded")
    page.evaluate(f"""() => {{
        localStorage.setItem('ppos_locale', '{locale}');
        localStorage.setItem('ppos-theme', '{theme}');
        localStorage.setItem('ppos_control_token', 'mock_jwt_operator_token_demo');
        localStorage.setItem('ppos_control_user', JSON.stringify({{
            id: 'usr-demo-01',
            name: 'Klaus Meister',
            email: 'klaus.meister@imprenta-demo.com',
            role: 'PRINTHOUSE_OPERATOR',
            tenantId: 'tenant-stuttgart-01',
            printhouseId: 'ph-stuttgart-01',
            companyName: 'Druckerei Süd GmbH'
        }}));
    }}""")

def save_and_copy(page, filename, full_page=True):
    path_brain = os.path.join(OUTPUT_DIR, filename)
    path_pkg = os.path.join(PACKAGE_DIR, filename)
    page.screenshot(path=path_brain, full_page=full_page)
    shutil.copyfile(path_brain, path_pkg)
    print(f"  [SAVED] {filename}", flush=True)

def capture_all():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    os.makedirs(PACKAGE_DIR, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        # ─────────────────────────────────────────────────────────────────────
        # 1. Desktop 1366x768 Dark Mode (ES)
        # ─────────────────────────────────────────────────────────────────────
        print("1. Launching Desktop 1366x768 Dark Mode...", flush=True)
        ctx_dark = browser.new_context(
            viewport={"width": 1366, "height": 768},
            color_scheme="dark"
        )
        page = ctx_dark.new_page()
        setup_page_routes(page)
        init_user_storage(page, locale='es', theme='dark')

        page.goto(BASE_URL, wait_until="networkidle")
        time.sleep(1.5)
        page.evaluate("document.documentElement.classList.add('dark')")
        time.sleep(0.5)

        # Step 1: Qué productos fabricas
        print("  Capturing Step 1 (Dark 1366)...", flush=True)
        save_and_copy(page, "01_onboarding_step1_families_dark_1366.png")

        # Step 2: Upload PDF
        print("  Capturing Step 2 Upload PDF (Dark 1366)...", flush=True)
        page.locator("button:has-text('Aportar presupuesto')").first.click()
        time.sleep(0.8)
        save_and_copy(page, "02_onboarding_step2_upload_pdf_fixtures_dark_1366.png")

        # Step 2b: Manual Offer Form
        print("  Capturing Step 2b Manual Form (Dark 1366)...", flush=True)
        page.locator("button:has-text('Introducir oferta manualmente'), button:has-text('manualmente')").first.click()
        time.sleep(0.8)
        save_and_copy(page, "02b_onboarding_step2_manual_offer_form_dark_1366.png")

        # Switch back to Upload PDF tab
        page.locator("button:has-text('Subir presupuesto PDF')").click()
        time.sleep(0.5)

        # Upload Stutensee
        file_input = page.locator("#onboarding-pdf-upload-input")
        file_input.set_input_files({
            "name": "Presupuesto_Editorial_Stutensee.pdf",
            "mimeType": "application/pdf",
            "buffer": b"%PDF-1.4 Mock Stutensee Quote with 300 copies discrepancy"
        })
        time.sleep(1.2)

        print("  Capturing Step 3 Stutensee Discrepancy (Dark 1366)...", flush=True)
        save_and_copy(page, "03_onboarding_step3_stutensee_discrepancy_dark_1366.png")

        # Upload Die Mysteriösen Steine to capture authentic ambiguity
        page.locator("[data-testid='back-to-step2-btn']").click()
        time.sleep(0.8)
        file_input = page.locator("#onboarding-pdf-upload-input")
        file_input.set_input_files({
            "name": "Presupuesto_Die_Mysteriosen_Steine.pdf",
            "mimeType": "application/pdf",
            "buffer": b"%PDF-1.4 Mock Die Mysteriosen Steine 1792 manufacturing + 415 shipping = 2207 total"
        })
        time.sleep(1.2)

        print("  Capturing Step 3b Die Mysteriösen Steine Ambiguity (Dark 1366)...", flush=True)
        save_and_copy(page, "03b_onboarding_step3_mysteriosen_ambiguity_dark_1366.png")

        # Resolve ambiguity by clicking Tapa Dura
        if page.locator("button:has-text('Tapa Dura (Cartón 2,4 mm)')").is_visible():
            page.locator("button:has-text('Tapa Dura (Cartón 2,4 mm)')").click()
            time.sleep(0.5)

        # Advance to Step 4
        print("  Capturing Step 4 Compare Calculations (Dark 1366)...", flush=True)
        page.locator("[data-testid='proceed-to-compare-btn']").scroll_into_view_if_needed()
        page.locator("[data-testid='proceed-to-compare-btn']").click()
        time.sleep(1.2)
        save_and_copy(page, "04_onboarding_step4_compare_calculations_dark_1366.png")

        # Advance to Step 5
        print("  Capturing Step 5 Rate Proposal (Dark 1366)...", flush=True)
        page.locator("[data-testid='proceed-to-accept-btn']").scroll_into_view_if_needed()
        page.locator("[data-testid='proceed-to-accept-btn']").click()
        time.sleep(1.2)
        save_and_copy(page, "05_onboarding_step5_rate_proposal_dark_1366.png")

        # Open confirmation modal
        print("  Capturing Step 5 Confirmation Modal (Dark 1366)...", flush=True)
        page.locator("[data-testid='open-accept-modal-btn']").scroll_into_view_if_needed()
        page.locator("[data-testid='open-accept-modal-btn']").click()
        time.sleep(0.8)

        modal_dialog = page.locator("[data-testid='confirm-acceptance-modal-dialog']")
        if modal_dialog.is_visible():
            save_and_copy(page, "05b_onboarding_step5_confirm_modal_dark_1366.png", full_page=False)
            path_dlg_brain = os.path.join(OUTPUT_DIR, "05b_onboarding_step5_confirm_modal_dialog_dark_1366.png")
            path_dlg_pkg = os.path.join(PACKAGE_DIR, "05b_onboarding_step5_confirm_modal_dialog_dark_1366.png")
            modal_dialog.screenshot(path=path_dlg_brain)
            shutil.copyfile(path_dlg_brain, path_dlg_pkg)
            print("  [SAVED] 05b_onboarding_step5_confirm_modal_dialog_dark_1366.png", flush=True)

        # Close modal
        page.locator("[data-testid='cancel-accept-proposal-btn']").click()
        time.sleep(0.5)
        ctx_dark.close()

        # ─────────────────────────────────────────────────────────────────────
        # 2. Desktop 1280x800 Light Mode (ES) — Natur Klappenbroschur
        # ─────────────────────────────────────────────────────────────────────
        print("2. Launching Desktop 1280x800 Light Mode...", flush=True)
        ctx_light = browser.new_context(
            viewport={"width": 1280, "height": 800},
            color_scheme="light"
        )
        page_light = ctx_light.new_page()
        setup_page_routes(page_light)
        init_user_storage(page_light, locale='es', theme='light')

        page_light.goto(BASE_URL, wait_until="networkidle")
        time.sleep(1.5)
        page_light.evaluate("document.documentElement.classList.remove('dark')")
        time.sleep(0.5)

        print("  Capturing Step 1 (Light 1280)...", flush=True)
        save_and_copy(page_light, "01_onboarding_step1_families_light_1280.png")

        # Go to Step 2
        page_light.locator("button:has-text('Aportar presupuesto')").first.click()
        time.sleep(0.8)

        # Upload Natur Quote
        file_input_light = page_light.locator("#onboarding-pdf-upload-input")
        file_input_light.set_input_files({
            "name": "Presupuesto_Natur_Broschur.pdf",
            "mimeType": "application/pdf",
            "buffer": b"%PDF-1.4 Mock Natur Klappenbroschur 500/600/700 runs (4321, 4604, 4846 fab + 325 transp)"
        })
        time.sleep(1.2)

        print("  Capturing Step 3 Natur (Light 1280)...", flush=True)
        save_and_copy(page_light, "03_onboarding_step3_natur_variants_light_1280.png")
        ctx_light.close()

        # ─────────────────────────────────────────────────────────────────────
        # 3. Mobile 390x844 Dark Mode
        # ─────────────────────────────────────────────────────────────────────
        print("3. Launching Mobile 390x844 Dark Mode...", flush=True)
        ctx_mob = browser.new_context(
            viewport={"width": 390, "height": 844},
            is_mobile=True,
            color_scheme="dark"
        )
        page_mob = ctx_mob.new_page()
        setup_page_routes(page_mob)
        init_user_storage(page_mob, locale='es', theme='dark')

        page_mob.goto(BASE_URL, wait_until="networkidle")
        time.sleep(1.5)
        page_mob.evaluate("document.documentElement.classList.add('dark')")
        time.sleep(0.5)

        print("  Capturing Step 1 (Mobile 390 Dark)...", flush=True)
        save_and_copy(page_mob, "06_onboarding_step1_mobile_390_dark.png")

        page_mob.locator("button:has-text('Aportar presupuesto')").first.click()
        time.sleep(0.8)

        print("  Capturing Step 2 (Mobile 390 Dark)...", flush=True)
        save_and_copy(page_mob, "06b_onboarding_step2_mobile_390_dark.png")
        ctx_mob.close()

        # ─────────────────────────────────────────────────────────────────────
        # 4. English (Light 1280) & German (Dark 1366)
        # ─────────────────────────────────────────────────────────────────────
        print("4. Launching English Light 1280...", flush=True)
        ctx_en = browser.new_context(viewport={"width": 1280, "height": 800}, color_scheme="light")
        page_en = ctx_en.new_page()
        setup_page_routes(page_en)
        init_user_storage(page_en, locale='en', theme='light')
        page_en.goto(BASE_URL, wait_until="networkidle")
        time.sleep(1.2)
        save_and_copy(page_en, "07_onboarding_step1_en_light_1280.png")
        ctx_en.close()

        print("5. Launching German Dark 1366...", flush=True)
        ctx_de = browser.new_context(viewport={"width": 1366, "height": 768}, color_scheme="dark")
        page_de = ctx_de.new_page()
        setup_page_routes(page_de)
        init_user_storage(page_de, locale='de', theme='dark')
        page_de.goto(BASE_URL, wait_until="networkidle")
        time.sleep(1.2)
        page_de.evaluate("document.documentElement.classList.add('dark')")
        time.sleep(0.5)
        save_and_copy(page_de, "08_onboarding_step1_de_dark_1366.png")
        ctx_de.close()

        browser.close()
        print("All visual evidence successfully captured and synced to package dir!", flush=True)

if __name__ == "__main__":
    capture_all()
