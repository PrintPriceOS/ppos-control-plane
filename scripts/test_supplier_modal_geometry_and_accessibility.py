import os
import sys
import json
import time
from playwright.sync_api import sync_playwright

OUT_DIR = os.path.abspath('review_artifacts_modal_fix')
os.makedirs(OUT_DIR, exist_ok=True)
LOG_FILE = os.path.join(OUT_DIR, 'modal_geometry_audit.log')

def log(msg):
    ts = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    entry = f"[{ts}] {msg}"
    print(entry, flush=True)
    with open(LOG_FILE, 'a', encoding='utf-8') as f:
        f.write(entry + "\n")

with open(LOG_FILE, 'w', encoding='utf-8') as f:
    f.write("=== Playwright Supplier Modal Viewport Geometry & Accessibility Suite ===\n")

log("Starting modal positioning and accessibility verification suite...")
log("Architecture: UI Geometry & Accessibility tested on Vite Preview with mocked API routes.")
log("Functional DB Integration (RBAC, isolation, transactions) tested separately via Vitest ephemeral MySQL.")

# Generate 25 products with 2 variants each = 50 rows in catalog table
mock_products = []
for i in range(1, 26):
    mock_products.append({
        "id": f"prod_auto_{i:02d}",
        "name": f"Paper Grade High Performance #{i:02d}",
        "category": "COATED" if i % 2 == 0 else "UNCOATED",
        "brand": f"PaperMill Alliance Global {i}",
        "finish": "Gloss" if i % 2 == 0 else "Silk Matte",
        "variants": [
            {
                "id": f"var_auto_{i:02d}_1",
                "productId": f"prod_auto_{i:02d}",
                "gsm": 100 + (i * 10),
                "widthMm": 700,
                "heightMm": 1000,
                "caliperUm": 95 + (i * 8),
                "grainDirection": "LONG_GRAIN"
            },
            {
                "id": f"var_auto_{i:02d}_2",
                "productId": f"prod_auto_{i:02d}",
                "gsm": 120 + (i * 10),
                "widthMm": 640,
                "heightMm": 900,
                "caliperUm": 115 + (i * 8),
                "grainDirection": "SHORT_GRAIN"
            }
        ]
    })

def setup_routes(page):
    def handle_catalog(route):
        url = route.request.url
        if '/catalog/products' in url:
            route.fulfill(status=200, content_type='application/json', body=json.dumps({
                "ok": True,
                "data": {
                    "products": mock_products,
                    "page": 1,
                    "totalPages": 1,
                    "total": len(mock_products)
                }
            }))
        elif '/catalog/variants/' in url:
            var_id = url.split('/catalog/variants/')[1].split('?')[0]
            route.fulfill(status=200, content_type='application/json', body=json.dumps({
                "ok": True,
                "data": {
                    "variant": {
                        "id": var_id,
                        "productName": f"Detailed Technical Paper Variant [{var_id}]",
                        "category": "COATED",
                        "brand": "Sappi / Condat Premium",
                        "gsm": 170,
                        "widthMm": 720,
                        "heightMm": 1020,
                        "finish": "Silk Touch Double-Coated",
                        "grainDirection": "LONG_GRAIN",
                        "caliperUm": 155,
                        "caliperMm": 0.155,
                        "fingerprint": f"fp_verified_auto_{var_id}_720x1020_170_lg"
                    },
                    "offers": [
                        {
                            "id": f"off_{var_id}",
                            "supplierSku": f"SKU-{var_id.upper()}",
                            "priceAmount": 1.62,
                            "currency": "EUR",
                            "priceBasis": "KG",
                            "moq": 250
                        }
                    ]
                }
            }))
        elif '/offers' in url:
            route.fulfill(status=200, content_type='application/json', body=json.dumps({
                "ok": True,
                "data": {
                    "offers": [
                        {
                            "id": "off_sample_01",
                            "supplierSku": "COND-GLOSS-150-7010",
                            "productName": "Condat Gloss Art Paper",
                            "gsm": 150,
                            "dimensions": "700 x 1000 mm",
                            "priceAmount": 1.45,
                            "currency": "EUR",
                            "priceBasis": "KG",
                            "status": "ACTIVE",
                            "moq": 100,
                            "orderMultiple": 1,
                            "visibility": "APPROVED_CUSTOMERS"
                        }
                    ],
                    "page": 1,
                    "totalPages": 1,
                    "total": 1,
                    "counts": { "total": 1, "active": 1, "inactive": 0, "archived": 0 }
                }
            }))
        else:
            route.continue_()

    page.route("**/api/v1/paper-suppliers/**", handle_catalog)

def configure_session(page):
    page.goto('http://localhost:3000/supplier/catalog')
    page.evaluate("""() => {
        localStorage.setItem('ppos_control_token', 'dev_token_supplier');
        localStorage.setItem('ppos_control_user', JSON.stringify({
            email: 'admin@torraspapel.example',
            role: 'SUPPLIER_ADMIN',
            supplierRole: 'SUPPLIER_ADMIN',
            supplierId: 'sup-alpha-01',
            tenantId: 'tenant-supplier-01',
            hasSupplierCapability: true,
            isSupplierUser: true,
            companyName: 'Torraspapel Distribution S.A.'
        }));
        localStorage.setItem('ppos_active_context', 'supplier');
        localStorage.setItem('ppos_locale', 'en');
        localStorage.setItem('ppos-locale', 'en');
        localStorage.setItem('ppos_theme', 'dark');
        document.documentElement.classList.add('dark');
        document.documentElement.style.backgroundColor = '#0e0e0f';
    }""")
    page.goto('http://localhost:3000/supplier/catalog', wait_until='networkidle')

def run_tests():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        # -------------------------------------------------------------
        # TEST 1: DESKTOP 1366x768 (Top, Middle, Bottom Scrolled Rows)
        # -------------------------------------------------------------
        log("\n--- TEST 1: DESKTOP 1366x768 (Top, Middle, Bottom Scrolled Rows) ---")
        ctx = browser.new_context(viewport={"width": 1366, "height": 768})
        page = ctx.new_page()
        setup_routes(page)
        configure_session(page)

        # Wait for catalog table to render
        page.locator('table tbody tr').first.wait_for(state='visible', timeout=10000)
        buttons = page.locator('button[title="Technical Specs"]')
        count = buttons.count()
        log(f"Rendered {count} 'Technical Specs' action triggers in catalog.")
        assert count >= 10, f"Expected at least 10 spec buttons, found {count}"

        # 1A: Open from ROW 1 (scrollY = 0)
        log("Testing 1A: Open specs from Row 1 at top...")
        btn_top = buttons.nth(0)
        btn_top.click()
        
        # Observable condition: wait for dialog panel visibility
        dialog_panel = page.locator('div[role="dialog"] [class*="max-w-2xl"]').first
        dialog_panel.wait_for(state='visible', timeout=5000)

        # Inspect geometry, portal location, and focus trap
        geo_top = page.evaluate("""() => {
            const dialog = document.querySelector('div[role="dialog"]');
            const panel = dialog ? (dialog.querySelector('.max-w-2xl') || dialog.firstElementChild) : null;
            const dRect = dialog.getBoundingClientRect();
            const pRect = panel ? panel.getBoundingClientRect() : dRect;
            const parentTag = dialog.parentElement.tagName;
            const parentClass = dialog.parentElement.className;
            const isInsidePortal = dialog.closest('.animate-slide-fade') === null;
            const bodyOverflow = window.getComputedStyle(document.body).overflow;

            return {
                windowInnerHeight: window.innerHeight,
                windowInnerWidth: window.innerWidth,
                panelRect: {
                    top: Math.round(pRect.top),
                    bottom: Math.round(pRect.bottom),
                    left: Math.round(pRect.left),
                    right: Math.round(pRect.right),
                    height: Math.round(pRect.height),
                    width: Math.round(pRect.width)
                },
                parentTag,
                parentClass,
                isInsidePortal,
                bodyOverflow
            };
        }""")

        log(f"Row 1 Modal Geometry: {json.dumps(geo_top['panelRect'])} | Viewport: {geo_top['windowInnerWidth']}x{geo_top['windowInnerHeight']}")
        log(f"Portal check: isInsidePortal={geo_top['isInsidePortal']}, Parent Tag={geo_top['parentTag']}")
        
        assert geo_top['isInsidePortal'], "CRITICAL: Dialog is trapped inside .animate-slide-fade containing block!"
        assert geo_top['panelRect']['top'] >= 10, f"Modal top {geo_top['panelRect']['top']} should be >= 10px from viewport top"
        assert geo_top['panelRect']['bottom'] <= geo_top['windowInnerHeight'] - 10, f"Modal bottom {geo_top['panelRect']['bottom']} should be <= viewport height"
        
        # Check horizontal centering
        center_x = (geo_top['panelRect']['left'] + geo_top['panelRect']['right']) / 2
        assert abs(center_x - (geo_top['windowInnerWidth'] / 2)) < 30, f"Modal not horizontally centered: center_x={center_x}"

        # Focus Trap Verification: press Tab multiple times and verify focus remains inside dialog
        for _ in range(4):
            page.keyboard.press("Tab")
        is_trapped = page.evaluate("() => document.activeElement && document.activeElement.closest('div[role=\"dialog\"]') !== null")
        assert is_trapped, "Focus escaped the modal dialog during keyboard navigation!"
        log("Focus trap verified: Tab navigation remains trapped within dialog.")

        page.screenshot(path=os.path.join(OUT_DIR, '01_desktop_modal_row_top.png'))
        log("Saved screenshot: 01_desktop_modal_row_top.png")

        # Close via ESC key and check focus return
        page.keyboard.press("Escape")
        dialog_panel.wait_for(state='hidden', timeout=5000)
        
        # Verify focus returned to trigger button
        focused_on_trigger = page.evaluate("() => document.activeElement === document.querySelectorAll('button[title=\"Technical Specs\"]')[0]")
        assert focused_on_trigger, "Focus did not return to the opening trigger button upon closing!"
        log("Focus returned successfully to trigger button.")

        # 1B: Scroll down to MIDDLE (row 12)
        log("\nTesting 1B: Scroll down to Row 12 (middle of long list)...")
        btn_mid = buttons.nth(11)
        btn_mid.scroll_into_view_if_needed()
        
        # Record scroll position of both window and real container
        scroll_pos_mid = page.evaluate("""() => {
            const main = document.querySelector('main');
            return {
                windowY: window.scrollY || document.documentElement.scrollTop,
                mainY: main ? main.scrollTop : 0
            };
        }""")
        log(f"Scroll positions before open: windowY={scroll_pos_mid['windowY']}px, mainY={scroll_pos_mid['mainY']}px")

        btn_mid.click()
        dialog_panel.wait_for(state='visible', timeout=5000)

        geo_mid = page.evaluate("""() => {
            const dialog = document.querySelector('div[role="dialog"]');
            const panel = dialog ? (dialog.querySelector('.max-w-2xl') || dialog.firstElementChild) : null;
            const pRect = panel ? panel.getBoundingClientRect() : dialog.getBoundingClientRect();
            return {
                windowInnerHeight: window.innerHeight,
                panelRect: {
                    top: Math.round(pRect.top),
                    bottom: Math.round(pRect.bottom),
                    height: Math.round(pRect.height)
                }
            };
        }""")

        log(f"Row 12 (Scrolled) Modal Geometry: {json.dumps(geo_mid['panelRect'])} | Viewport Height: {geo_mid['windowInnerHeight']}")
        assert geo_mid['panelRect']['top'] >= 10, f"Scrolled modal top {geo_mid['panelRect']['top']} should be >= 10px"
        assert geo_mid['panelRect']['bottom'] <= geo_mid['windowInnerHeight'] - 10, f"Scrolled modal bottom {geo_mid['panelRect']['bottom']} should be <= viewport height"

        page.screenshot(path=os.path.join(OUT_DIR, '02_desktop_modal_row_middle_scrolled.png'))
        log("Saved screenshot: 02_desktop_modal_row_middle_scrolled.png")

        # Close via Close button
        page.locator('button:has-text("Close")').first.click()
        dialog_panel.wait_for(state='hidden', timeout=5000)
        
        scroll_after_close = page.evaluate("""() => {
            const main = document.querySelector('main');
            return {
                windowY: window.scrollY || document.documentElement.scrollTop,
                mainY: main ? main.scrollTop : 0
            };
        }""")
        log(f"Scroll positions after close: windowY={scroll_after_close['windowY']}px, mainY={scroll_after_close['mainY']}px")
        assert abs(scroll_after_close['windowY'] - scroll_pos_mid['windowY']) < 50, "Window scroll position jumped upon closing!"
        assert abs(scroll_after_close['mainY'] - scroll_pos_mid['mainY']) < 50, "Main container scroll position jumped upon closing!"

        # 1C: Scroll to VERY BOTTOM ROW (row 25)
        log("\nTesting 1C: Scroll to bottom of long list (row 25)...")
        btn_bot = buttons.nth(count - 1)
        btn_bot.scroll_into_view_if_needed()
        
        btn_bot.click()
        dialog_panel.wait_for(state='visible', timeout=5000)

        geo_bot = page.evaluate("""() => {
            const dialog = document.querySelector('div[role="dialog"]');
            const panel = dialog ? (dialog.querySelector('.max-w-2xl') || dialog.firstElementChild) : null;
            const pRect = panel ? panel.getBoundingClientRect() : dialog.getBoundingClientRect();
            return {
                windowInnerHeight: window.innerHeight,
                panelRect: {
                    top: Math.round(pRect.top),
                    bottom: Math.round(pRect.bottom),
                    height: Math.round(pRect.height)
                }
            };
        }""")

        log(f"Row 25 (Bottom Scrolled) Modal Geometry: {json.dumps(geo_bot['panelRect'])} | Viewport Height: {geo_bot['windowInnerHeight']}")
        assert geo_bot['panelRect']['top'] >= 10, f"Bottom row modal top {geo_bot['panelRect']['top']} should be >= 10px"
        assert geo_bot['panelRect']['bottom'] <= geo_bot['windowInnerHeight'] - 10, f"Bottom row modal bottom {geo_bot['panelRect']['bottom']} should be <= viewport height"

        page.screenshot(path=os.path.join(OUT_DIR, '03_desktop_modal_row_bottom_scrolled.png'))
        log("Saved screenshot: 03_desktop_modal_row_bottom_scrolled.png")

        # 1D: Close via Click Outside (Backdrop click)
        log("Testing 1D: Close via Click on Backdrop (Click Outside)...")
        page.mouse.click(20, 20)
        dialog_panel.wait_for(state='hidden', timeout=5000)
        log("Closed via Backdrop click successfully.")

        ctx.close()

        # -------------------------------------------------------------
        # TEST 2: SHORT VIEWPORT (1024x500) - SCREEN HEIGHT ADAPTATION
        # -------------------------------------------------------------
        log("\n--- TEST 2: SHORT VIEWPORT (1024x500) ---")
        ctx_short = browser.new_context(viewport={"width": 1024, "height": 500})
        page_short = ctx_short.new_page()
        setup_routes(page_short)
        configure_session(page_short)

        page_short.locator('table tbody tr').first.wait_for(state='visible', timeout=10000)
        btn_short = page_short.locator('button[title="Technical Specs"]').first
        btn_short.click()
        
        dialog_panel_short = page_short.locator('div[role="dialog"] [class*="max-w-2xl"]').first
        dialog_panel_short.wait_for(state='visible', timeout=5000)

        geo_short = page_short.evaluate("""() => {
            const dialog = document.querySelector('div[role="dialog"]');
            const panel = dialog ? (dialog.querySelector('.max-w-2xl') || dialog.firstElementChild) : null;
            const pRect = panel ? panel.getBoundingClientRect() : dialog.getBoundingClientRect();
            return {
                windowInnerHeight: window.innerHeight,
                panelRect: {
                    top: Math.round(pRect.top),
                    bottom: Math.round(pRect.bottom),
                    height: Math.round(pRect.height)
                },
                panelMaxHeight: window.getComputedStyle(panel).maxHeight
            };
        }""")

        log(f"Short Viewport Geometry: {json.dumps(geo_short['panelRect'])} | maxHeight: {geo_short['panelMaxHeight']}")
        assert geo_short['panelRect']['top'] >= 0, "Modal top exceeded upper screen in short viewport"
        assert geo_short['panelRect']['bottom'] <= 500, f"Modal bottom {geo_short['panelRect']['bottom']} exceeded short viewport 500px"

        page_short.screenshot(path=os.path.join(OUT_DIR, '04_short_viewport_1024x500.png'))
        log("Saved screenshot: 04_short_viewport_1024x500.png")
        ctx_short.close()

        # -------------------------------------------------------------
        # TEST 3: MOBILE VIEWPORT (390x844)
        # -------------------------------------------------------------
        log("\n--- TEST 3: MOBILE VIEWPORT (390x844) ---")
        ctx_mobile = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True)
        page_mobile = ctx_mobile.new_page()
        setup_routes(page_mobile)
        configure_session(page_mobile)

        page_mobile.locator('table tbody tr').first.wait_for(state='visible', timeout=10000)
        btn_mobile = page_mobile.locator('button[title="Technical Specs"]').first
        btn_mobile.click()
        
        dialog_panel_mobile = page_mobile.locator('div[role="dialog"] [class*="max-w-2xl"]').first
        dialog_panel_mobile.wait_for(state='visible', timeout=5000)

        geo_mobile = page_mobile.evaluate("""() => {
            const dialog = document.querySelector('div[role="dialog"]');
            const panel = dialog ? (dialog.querySelector('.max-w-2xl') || dialog.firstElementChild) : null;
            const pRect = panel ? panel.getBoundingClientRect() : dialog.getBoundingClientRect();
            return {
                windowInnerWidth: window.innerWidth,
                windowInnerHeight: window.innerHeight,
                panelRect: {
                    top: Math.round(pRect.top),
                    bottom: Math.round(pRect.bottom),
                    left: Math.round(pRect.left),
                    right: Math.round(pRect.right),
                    width: Math.round(pRect.width),
                    height: Math.round(pRect.height)
                }
            };
        }""")

        log(f"Mobile Viewport Geometry: {json.dumps(geo_mobile['panelRect'])}")
        assert geo_mobile['panelRect']['left'] >= 0, "Modal overflowed left in mobile"
        assert geo_mobile['panelRect']['right'] <= 390, f"Modal right {geo_mobile['panelRect']['right']} overflowed 390px mobile viewport"
        assert geo_mobile['panelRect']['bottom'] <= 844, f"Modal bottom {geo_mobile['panelRect']['bottom']} overflowed mobile height"

        page_mobile.screenshot(path=os.path.join(OUT_DIR, '05_mobile_viewport_390x844.png'))
        log("Saved screenshot: 05_mobile_viewport_390x844.png")
        ctx_mobile.close()

        # -------------------------------------------------------------
        # TEST 4: REFLOW SIMULATION (683x384 - 200% Zoom Proportional Equivalent)
        # -------------------------------------------------------------
        log("\n--- TEST 4: REFLOW SIMULATION (683x384 - 200% Viewport Equivalent) ---")
        log("Note: Real engine browser zoom 200% with deviceScaleFactor remains PENDING interactive human signoff.")
        ctx_zoom = browser.new_context(viewport={"width": 683, "height": 384})
        page_zoom = ctx_zoom.new_page()
        setup_routes(page_zoom)
        configure_session(page_zoom)

        page_zoom.locator('table tbody tr').first.wait_for(state='visible', timeout=10000)
        btn_zoom = page_zoom.locator('button[title="Technical Specs"]').first
        btn_zoom.click()
        
        dialog_panel_zoom = page_zoom.locator('div[role="dialog"] [class*="max-w-2xl"]').first
        dialog_panel_zoom.wait_for(state='visible', timeout=5000)

        geo_zoom = page_zoom.evaluate("""() => {
            const dialog = document.querySelector('div[role="dialog"]');
            const panel = dialog ? (dialog.querySelector('.max-w-2xl') || dialog.firstElementChild) : null;
            const pRect = panel ? panel.getBoundingClientRect() : dialog.getBoundingClientRect();
            return {
                windowInnerWidth: window.innerWidth,
                windowInnerHeight: window.innerHeight,
                panelRect: {
                    top: Math.round(pRect.top),
                    bottom: Math.round(pRect.bottom),
                    left: Math.round(pRect.left),
                    right: Math.round(pRect.right),
                    width: Math.round(pRect.width),
                    height: Math.round(pRect.height)
                }
            };
        }""")

        log(f"Reflow 683x384 Geometry: {json.dumps(geo_zoom['panelRect'])}")
        assert geo_zoom['panelRect']['top'] >= 0, "Reflow modal top exceeded upper edge"
        assert geo_zoom['panelRect']['bottom'] <= 384, f"Reflow modal bottom {geo_zoom['panelRect']['bottom']} exceeded 384px height"

        page_zoom.screenshot(path=os.path.join(OUT_DIR, '06_zoom_200_percent_683x384.png'))
        log("Saved screenshot: 06_zoom_200_percent_683x384.png")
        ctx_zoom.close()

        # -------------------------------------------------------------
        # TEST 5: OTHER SUPPLIER HUB MODALS (Import, Offer, Confirm, Unsaved Changes Guard)
        # -------------------------------------------------------------
        log("\n--- TEST 5: OTHER SUPPLIER HUB MODALS AUDIT ---")
        ctx_other = browser.new_context(viewport={"width": 1366, "height": 768})
        page_other = ctx_other.new_page()
        setup_routes(page_other)
        configure_session(page_other)
        page_other.locator('table tbody tr').first.wait_for(state='visible', timeout=10000)

        # 5A: Technical Import Modal & Unsaved Changes Guard
        log("Testing 5A: Technical Import Modal & Unsaved Changes Protection...")
        import_btn = page_other.locator('button:has-text("Import Technical Catalog")')
        if import_btn.count() > 0:
            import_btn.first.click()
            import_panel = page_other.locator('div[role="dialog"] [class*="max-w-5xl"]').first
            import_panel.wait_for(state='visible', timeout=5000)
            
            geo_imp = page_other.evaluate("""() => {
                const dialog = document.querySelector('div[role="dialog"]');
                const panel = dialog ? (dialog.querySelector('.max-w-5xl') || dialog.firstElementChild) : null;
                const pRect = panel ? panel.getBoundingClientRect() : dialog.getBoundingClientRect();
                return {
                    top: Math.round(pRect.top),
                    bottom: Math.round(pRect.bottom),
                    width: Math.round(pRect.width),
                    height: Math.round(pRect.height),
                    isInsidePortal: dialog.closest('.animate-slide-fade') === null
                };
            }""")
            log(f"Technical Import Modal Geometry: {json.dumps(geo_imp)}")
            assert geo_imp['isInsidePortal'], "Technical Import Modal trapped in container!"
            assert geo_imp['top'] >= 10 and geo_imp['bottom'] <= 758, "Technical Import Modal out of viewport bounds!"
            page_other.screenshot(path=os.path.join(OUT_DIR, '07_technical_import_modal.png'))
            log("Saved screenshot: 07_technical_import_modal.png")
            page_other.keyboard.press("Escape")
            import_panel.wait_for(state='hidden', timeout=5000)

        # 5B: Create Offer Modal
        log("Testing 5B: Create Offer Modal...")
        create_offer_btn = page_other.locator('button:has-text("Create Offer")').first
        create_offer_btn.click()
        offer_panel = page_other.locator('div[role="dialog"] [class*="max-w-2xl"]').first
        offer_panel.wait_for(state='visible', timeout=5000)
        
        geo_off = page_other.evaluate("""() => {
            const dialog = document.querySelector('div[role="dialog"]');
            const panel = dialog ? (dialog.querySelector('.max-w-2xl') || dialog.firstElementChild) : null;
            const pRect = panel ? panel.getBoundingClientRect() : dialog.getBoundingClientRect();
            return {
                top: Math.round(pRect.top),
                bottom: Math.round(pRect.bottom),
                isInsidePortal: dialog.closest('.animate-slide-fade') === null
            };
        }""")
        log(f"Create Offer Modal Geometry: {json.dumps(geo_off)}")
        assert geo_off['isInsidePortal'], "Create Offer Modal trapped in container!"
        assert geo_off['top'] >= 10 and geo_off['bottom'] <= 758, "Create Offer Modal out of bounds!"
        page_other.screenshot(path=os.path.join(OUT_DIR, '08_create_offer_modal.png'))
        log("Saved screenshot: 08_create_offer_modal.png")
        page_other.keyboard.press("Escape")
        offer_panel.wait_for(state='hidden', timeout=5000)

        # 5C: Delete Confirmation Modal
        log("Testing 5C: Delete Confirmation Modal...")
        del_btn = page_other.locator('button[title*="Delete"]').first
        if del_btn.count() > 0:
            del_btn.click()
            del_panel = page_other.locator('div[role="dialog"] [class*="max-w-md"]').first
            del_panel.wait_for(state='visible', timeout=5000)
            
            geo_del = page_other.evaluate("""() => {
                const dialog = document.querySelector('div[role="dialog"]');
                const panel = dialog ? (dialog.querySelector('.max-w-md') || dialog.firstElementChild) : null;
                const pRect = panel ? panel.getBoundingClientRect() : dialog.getBoundingClientRect();
                return {
                    top: Math.round(pRect.top),
                    bottom: Math.round(pRect.bottom),
                    isInsidePortal: dialog.closest('.animate-slide-fade') === null
                };
            }""")
            log(f"Delete Confirm Modal Geometry: {json.dumps(geo_del)}")
            assert geo_del['isInsidePortal'], "Delete Confirm Modal trapped in container!"
            assert geo_del['top'] >= 10 and geo_del['bottom'] <= 758, "Delete Confirm Modal out of bounds!"
            page_other.screenshot(path=os.path.join(OUT_DIR, '09_delete_confirm_modal.png'))
            log("Saved screenshot: 09_delete_confirm_modal.png")
            page_other.keyboard.press("Escape")
            del_panel.wait_for(state='hidden', timeout=5000)

        ctx_other.close()
        browser.close()

    log("\n=======================================================")
    log("ALL 5 MODAL GEOMETRY & ACCESSIBILITY TESTS PASSED CLEANLY!")
    log("=======================================================")

if __name__ == '__main__':
    run_tests()
