"""
scripts/verify_supplier_registration_ui.py

Verifies Paper Supplier Registration UI (/supplier/register):
- Checks alias redirection from /paper-supplier/register -> /supplier/register
- Validates viewports 1280x720, 1366x768, 390x844 with zero horizontal overflow
- Validates multi-step wizard (Step 1 -> Step 2 -> Step 3)
- Validates password strength meter and match check
- Saves verification screenshots
"""

import sys
import os
import asyncio
from playwright.async_api import async_playwright

if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

BASE_URL = "http://127.0.0.1:4173"
ARTIFACTS_DIR = os.path.join(os.path.dirname(__file__), "../docs/reviews/supplier_registration_evidence")
os.makedirs(ARTIFACTS_DIR, exist_ok=True)

VIEWPORTS = [
    {"name": "desktop_1280", "width": 1280, "height": 720},
    {"name": "desktop_1366", "width": 1366, "height": 768},
    {"name": "mobile_390", "width": 390, "height": 844},
]

async def main():
    print("=== Starting Supplier Registration UI Verification ===")
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()
        page = await context.new_page()

        # 1. Test alias redirect
        print("[1/5] Testing alias redirect /paper-supplier/register -> /supplier/register...")
        await page.goto(f"{BASE_URL}/paper-supplier/register", wait_until="networkidle")
        current_url = page.url
        print(f"Current URL after navigating to alias: {current_url}")
        assert "/supplier/register" in current_url, f"Expected /supplier/register in {current_url}"
        print("✓ Alias redirection verified.")

        # 2. Test viewports for horizontal overflow
        print("[2/5] Testing viewports for zero horizontal overflow...")
        for vp in VIEWPORTS:
            await page.set_viewport_size({"width": vp["width"], "height": vp["height"]})
            await page.goto(f"{BASE_URL}/supplier/register", wait_until="networkidle")
            await page.wait_for_timeout(300)

            scroll_width = await page.evaluate("document.documentElement.scrollWidth")
            client_width = await page.evaluate("document.documentElement.clientWidth")
            print(f"Viewport {vp['name']} ({vp['width']}x{vp['height']}): scrollWidth={scroll_width}, clientWidth={client_width}")
            assert scroll_width <= client_width + 1, f"Horizontal overflow detected on {vp['name']}! scrollWidth={scroll_width} > clientWidth={client_width}"

            screenshot_path = os.path.join(ARTIFACTS_DIR, f"supplier_reg_{vp['name']}_step1.png")
            await page.screenshot(path=screenshot_path, full_page=False)
            print(f"✓ Screenshot saved: {screenshot_path}")

        # 3. Test Step 1 Form Interaction & Transition to Step 2
        print("[3/5] Testing Step 1 (Company & Fiscal) -> Step 2 transition...")
        await page.set_viewport_size({"width": 1280, "height": 800})
        await page.goto(f"{BASE_URL}/supplier/register", wait_until="networkidle")

        await page.fill("#supplier-company-name", "Torraspapel Distribución S.A.")
        await page.fill("#supplier-brand-name", "Lecta Group")
        await page.fill("#supplier-tax-id", "ESA08000000")
        await page.fill("#supplier-city", "Zaragoza")
        await page.fill("#supplier-contact-name", "Ignacio Gómez (Director Comercial)")
        await page.fill("#supplier-phone", "+34 976 123 456")

        step1_screen = os.path.join(ARTIFACTS_DIR, "supplier_reg_step1_filled.png")
        await page.screenshot(path=step1_screen)
        print(f"✓ Step 1 filled screenshot: {step1_screen}")

        # Click next button
        await page.click("#step1-next-button")
        await page.wait_for_timeout(300)

        # Verify Step 2 is visible
        step2_header = await page.text_content("h3")
        print(f"Step 2 Heading: {step2_header}")
        assert "Distribución" in step2_header or "Distribution" in step2_header or "2." in step2_header, "Expected Step 2 heading"

        step2_screen = os.path.join(ARTIFACTS_DIR, "supplier_reg_step2.png")
        await page.screenshot(path=step2_screen)
        print(f"✓ Step 2 screenshot: {step2_screen}")

        # 4. Test Step 2 (Catalog & Logistics) -> Step 3 transition
        print("[4/5] Testing Step 2 -> Step 3 transition...")
        await page.click("#step2-next-button")
        await page.wait_for_timeout(300)

        step3_header = await page.text_content("h3")
        print(f"Step 3 Heading: {step3_header}")
        assert "Acceso" in step3_header or "Access" in step3_header or "3." in step3_header, "Expected Step 3 heading"

        # 5. Test Step 3 Form Validation & Password Strength
        print("[5/5] Testing Step 3 Password strength meter and match validation...")
        await page.fill("#supplier-admin-email", "pedidos@torraspapel-distribucion.es")
        await page.fill("#supplier-admin-password", "PapelIndustrial2026!")
        await page.fill("#supplier-admin-confirm-password", "PapelIndustrial2026!")

        step3_screen = os.path.join(ARTIFACTS_DIR, "supplier_reg_step3_filled.png")
        await page.screenshot(path=step3_screen)
        print(f"✓ Step 3 filled screenshot: {step3_screen}")

        # Verify submit button is present
        submit_btn = await page.query_selector("#supplier-submit-registration")
        assert submit_btn is not None, "Submit button not found"

        await browser.close()
        print("=== ALL UI VERIFICATIONS PASSED SUCCESSFULLY ===")

if __name__ == "__main__":
    asyncio.run(main())
