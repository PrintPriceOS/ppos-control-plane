"""
scripts/verify_materials_paper_search_ui.py

Verifies the Master Paper Database search and manual paper provisioning drawer
in Materials & Substrate Hub (/materials):
1. Authenticates as Printhouse operator in localStorage.
2. Intercepts backend API routes for deterministic E2E assertions.
3. Navigates to /materials and opens "Provision Material Profile" drawer via #btn-add-material.
4. Asserts the presence of Master Paper Database Search card, search input,
   supplier badge (proveedor@demo-papel.pro), and suggestion chips (70x100, 64x92, etc.).
5. Clicks suggestion chip (70x100) -> triggers search -> selects result -> verifies auto-fill of form.
6. Verifies zero horizontal overflow across 1280x720, 1366x768, and 390x844.
7. Tests trilingual parity (ES, EN, DE).
8. Captures visual screenshots for evidence.
"""

import os
import sys
import json
import asyncio
from playwright.async_api import async_playwright

if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

BASE_URL = "http://127.0.0.1:4173"
ARTIFACTS_DIR = os.path.join(os.path.dirname(__file__), "../docs/reviews/paper_db_search_evidence")
os.makedirs(ARTIFACTS_DIR, exist_ok=True)

VIEWPORTS = [
    {"name": "desktop_1280", "width": 1280, "height": 720},
    {"name": "desktop_1366", "width": 1366, "height": 768},
    {"name": "mobile_390", "width": 390, "height": 844},
]

MOCK_USER = {
    "id": "usr_operator_01",
    "name": "Operator Demo",
    "email": "operator@printhouse.pro",
    "role": "PRINTHOUSE_ADMIN",
    "tenant_id": "tenant_printhouse_alpha",
    "printhouse_id": "ph_alpha"
}

MOCK_DB_PAPERS = [
    {
        "variantId": "var_alaska_70x100",
        "productId": "prod_alaska",
        "productName": "Alaska Plus GC2",
        "brand": "Metsä Board",
        "manufacturer": "Metsä Board",
        "category": "CARTON",
        "finish": "SILK",
        "finishSummary": "White back folding boxboard",
        "gsm": 255,
        "widthMm": 700,
        "heightMm": 1000,
        "sheetFormat": "700x1000 (B1)",
        "dimensionsFormatted": "700 × 1000 mm",
        "offerId": "off_alaska_01",
        "supplierId": "supp-test-mill-01",
        "supplierName": "Papelera del Mediterraneo (Demo)",
        "supplierEmail": "proveedor@demo-papel.pro",
        "priceAmount": 1.95,
        "priceBasis": "KG",
        "currency": "EUR",
        "calculatedCostPerSheet": 0.3481,
        "hasActiveOffer": True
    },
    {
        "variantId": "var_algro_64x92",
        "productId": "prod_algro",
        "productName": "Algro Design Duo",
        "brand": "Sappi",
        "manufacturer": "Sappi Fine Paper",
        "category": "DESIGN",
        "finish": "COATED",
        "finishSummary": "Double coated solid bleached board",
        "gsm": 300,
        "widthMm": 640,
        "heightMm": 920,
        "sheetFormat": "640x920",
        "dimensionsFormatted": "640 × 920 mm",
        "offerId": None,
        "supplierId": "supp-test-mill-01",
        "supplierName": "Papelera del Mediterraneo (Demo)",
        "supplierEmail": "proveedor@demo-papel.pro",
        "priceAmount": None,
        "priceBasis": None,
        "currency": "EUR",
        "calculatedCostPerSheet": None,
        "hasActiveOffer": False
    }
]

async def setup_mocks(page):
    async def handle_materials(route):
        await route.fulfill(
            status=200,
            content_type="application/json",
            body=json.dumps({"ok": True, "materials": [], "data": []})
        )

    async def handle_search(route):
        url = route.request.url
        print(f"Intercepted search request: {url}")
        await route.fulfill(
            status=200,
            content_type="application/json",
            body=json.dumps({
                "ok": True,
                "data": {
                    "total": len(MOCK_DB_PAPERS),
                    "limit": 30,
                    "offset": 0,
                    "items": MOCK_DB_PAPERS
                }
            })
        )

    async def handle_generic(route):
        await route.fulfill(
            status=200,
            content_type="application/json",
            body=json.dumps({"ok": True, "data": []})
        )

    await page.route("**/api/admin/materials/paper-database/search*", handle_search)
    await page.route("**/api/admin/materials*", handle_materials)
    await page.route("**/api/admin/notifications*", handle_generic)
    await page.route("**/api/system/health*", handle_generic)

async def setup_auth(page, locale='es', theme='light'):
    await page.goto(f"{BASE_URL}/", wait_until="domcontentloaded")
    await page.evaluate(f"""() => {{
        localStorage.setItem('ppos_control_token', 'mock_verified_jwt_token_search');
        localStorage.setItem('ppos_control_user', JSON.stringify({json.dumps(MOCK_USER)}));
        localStorage.setItem('ppos_active_context', 'printhouse');
        localStorage.setItem('ppos-theme', '{theme}');
        localStorage.setItem('ppos_theme', '{theme}');
        localStorage.setItem('ppos_locale', '{locale}');
    }}""")

async def main():
    print("=== Starting Materials Master Paper Database UI Verification ===")
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()
        page = await context.new_page()

        await setup_mocks(page)

        # 1. Setup Auth and Navigate to /materials
        print("[1/5] Authenticating and navigating to /materials...")
        await setup_auth(page, locale='es', theme='light')
        await page.goto(f"{BASE_URL}/materials", wait_until="networkidle")
        await page.wait_for_timeout(500)

        # 2. Check viewports for zero horizontal overflow on Materials Page
        print("[2/5] Testing viewports for zero horizontal overflow on Materials Page...")
        for vp in VIEWPORTS:
            await page.set_viewport_size({"width": vp["width"], "height": vp["height"]})
            await page.wait_for_timeout(300)
            scroll_width = await page.evaluate("document.documentElement.scrollWidth")
            client_width = await page.evaluate("document.documentElement.clientWidth")
            print(f"Viewport {vp['name']} ({vp['width']}x{vp['height']}): scrollWidth={scroll_width}, clientWidth={client_width}")
            assert scroll_width <= client_width + 1, f"Horizontal overflow detected on {vp['name']}! scrollWidth={scroll_width} > clientWidth={client_width}"

        # 3. Open "Provision Material Profile" drawer
        print("[3/5] Opening Provision Material Profile drawer via #btn-add-material...")
        await page.set_viewport_size({"width": 1280, "height": 800})
        await page.locator("#btn-add-material").click()
        await page.wait_for_timeout(400)

        # 4. Verify Master Paper Database Search component in Drawer
        print("[4/5] Verifying Master Paper Database Search box inside drawer...")
        badge = page.locator("text='proveedor@demo-papel.pro'")
        assert await badge.count() > 0, "Expected demo supplier badge in drawer"
        print("✓ Demo supplier badge verified.")

        search_input = page.locator("input[placeholder*='nombre o medida'], input[placeholder*='name or dimensions']")
        assert await search_input.count() > 0, "Expected paper database search input"
        print("✓ Search input located.")

        # Check quick filter chips
        chips = ["70x100", "64x92", "72x102", "500x700", "SRA3", "Alaska", "Silk"]
        for chip in chips:
            chip_btn = page.locator(f"button:has-text('{chip}')")
            assert await chip_btn.count() > 0, f"Expected chip '{chip}' in drawer"
        print("✓ Quick suggestion chips verified.")

        # Click chip 70x100
        print("Clicking chip 70x100...")
        await page.locator("button:has-text('70x100')").click()
        await page.wait_for_timeout(400)
        input_val = await search_input.input_value()
        print(f"Search input value: '{input_val}'")
        assert input_val == "70x100"

        # Check that results list is shown
        result_item = page.locator("text='Alaska Plus GC2'")
        assert await result_item.count() > 0, "Expected Alaska Plus GC2 in search results dropdown"
        print("✓ Search results dropdown displayed Alaska Plus GC2.")

        # Click "Cargar" to auto-populate the form
        load_btn = page.locator("button:has-text('Cargar'), button:has-text('Load')").first
        await load_btn.click()
        await page.wait_for_timeout(300)

        # Verify form auto-population
        name_val = await page.locator("input[placeholder*='Silk Premium Digital']").input_value()
        print(f"Auto-filled Material Name: '{name_val}'")
        assert "Alaska Plus GC2" in name_val, f"Expected Alaska Plus GC2 in name input, got '{name_val}'"

        # Verify green linked confirmation banner
        linked_banner = page.locator("text='Vinculado a:'")
        assert await linked_banner.count() > 0, "Expected linked banner in drawer"
        print("✓ Green linked confirmation banner verified.")

        # Check zero horizontal overflow with drawer open across all viewports
        for vp in VIEWPORTS:
            await page.set_viewport_size({"width": vp["width"], "height": vp["height"]})
            await page.wait_for_timeout(300)
            scroll_width = await page.evaluate("document.documentElement.scrollWidth")
            client_width = await page.evaluate("document.documentElement.clientWidth")
            print(f"Drawer Open - Viewport {vp['name']}: scrollWidth={scroll_width}, clientWidth={client_width}")
            assert scroll_width <= client_width + 1, f"Horizontal overflow with drawer open on {vp['name']}!"

            # Take screenshot
            ss_path = os.path.join(ARTIFACTS_DIR, f"drawer_{vp['name']}_light.png")
            await page.screenshot(path=ss_path)
            print(f"✓ Saved screenshot: {ss_path}")

        # 5. Check Dark Mode & English / German Locales
        print("[5/5] Testing Dark Theme & Multilingual Support (ES, EN, DE)...")
        await setup_auth(page, locale='en', theme='dark')
        await page.goto(f"{BASE_URL}/materials", wait_until="networkidle")
        await page.wait_for_timeout(400)
        
        # Re-open drawer
        await page.locator("#btn-add-material").click()
        await page.wait_for_timeout(400)

        # Verify English title
        en_title = page.locator("text='Import from Master Paper Database'")
        assert await en_title.count() > 0, "Expected English title in drawer"
        print("✓ English translation verified.")

        ss_dark_path = os.path.join(ARTIFACTS_DIR, "drawer_desktop_1280_dark_en.png")
        await page.screenshot(path=ss_dark_path)
        print(f"✓ Saved dark theme screenshot: {ss_dark_path}")

        # German check
        await setup_auth(page, locale='de', theme='dark')
        await page.goto(f"{BASE_URL}/materials", wait_until="networkidle")
        await page.wait_for_timeout(400)
        await page.locator("#btn-add-material").click()
        await page.wait_for_timeout(400)

        de_title = page.locator("text='Aus Master-Papierdatenbank importieren'")
        assert await de_title.count() > 0, "Expected German title in drawer"
        print("✓ German translation verified.")

        ss_de_path = os.path.join(ARTIFACTS_DIR, "drawer_desktop_1280_dark_de.png")
        await page.screenshot(path=ss_de_path)
        print(f"✓ Saved German screenshot: {ss_de_path}")

        await browser.close()
        print("\n=== ALL BROWSER & PLAYWRIGHT VERIFICATIONS PASSED SUCCESSFULLY ===")

if __name__ == "__main__":
    asyncio.run(main())
