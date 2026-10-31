import os
import sys
import time
from playwright.sync_api import sync_playwright

OUT_DIR = os.path.abspath('review_artifacts_guided_onboarding')
os.makedirs(OUT_DIR, exist_ok=True)

def run():
    print(f"Starting Playwright Guided Onboarding Capture into {OUT_DIR}...")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        
        # 1. Desktop 1366x768 ES Light
        context = browser.new_context(viewport={"width": 1366, "height": 768})
        page = context.new_page()

        def route_h(route):
            u = route.request.url
            m = route.request.method
            if '/company-profile' in u:
                route.fulfill(status=200, content_type='application/json', body='{"ok": true, "data": {}}')
            elif '/sites' in u:
                route.fulfill(status=200, content_type='application/json', body='{"ok": true, "data": {"id": "site-val-1"}}')
            elif '/submit-for-review' in u:
                route.fulfill(status=201, content_type='application/json', body='{"success": true, "message": "OK"}')
            elif '/quote-evidence/upload' in u:
                route.fulfill(status=200, content_type='application/json', body='{"ok": true, "data": {"productTitle": "Catalogo 2026", "runs": [{"id":"v1","manufacturingPrice":1200}]}}')
            elif '/api/printhouse/onboarding' in u and m == 'GET':
                route.fulfill(status=200, content_type='application/json', body='{"ok": true, "data": {"company": {"legalName": "Graficas Mediterraneo S.L.", "country": "ES", "city": "Valencia"}, "sites": [{"siteId": "site-val-1", "siteName": "Planta Paterna"}], "readiness": {"accountSetup": {"status": "COMPLETE"}, "operationalConfiguration": {"status": "COMPLETE"}, "pricingReadiness": {"status": "COMPLETE"}}}}')
            else:
                route.continue_()

        page.route('**/api/printhouse/**', route_h)

        page.goto("http://localhost:5179/printhouse/onboarding-guided")
        page.evaluate("""() => {
            localStorage.clear();
            localStorage.setItem('ppos_locale', 'es');
            localStorage.setItem('ppos-locale', 'es');
            localStorage.setItem('ppos_theme', 'light');
            localStorage.setItem('ppos-theme', 'light');
            document.documentElement.classList.remove('dark');
        }""")
        page.reload()
        page.wait_for_timeout(1000)
        page.screenshot(path=os.path.join(OUT_DIR, "01_welcome_desktop_1366x768_light_es.png"))
        print("Captured 01_welcome_desktop_1366x768_light_es.png")

        # 2. Desktop 1366x768 ES Dark
        page.evaluate("""() => {
            localStorage.setItem('ppos-theme', 'dark');
            document.documentElement.classList.add('dark');
        }""")
        page.wait_for_timeout(400)
        page.screenshot(path=os.path.join(OUT_DIR, "02_welcome_desktop_1366x768_dark_es.png"))
        print("Captured 02_welcome_desktop_1366x768_dark_es.png")

        # 3. Mobile 390x844 ES Light
        page.set_viewport_size({"width": 390, "height": 844})
        page.evaluate("""() => {
            localStorage.setItem('ppos-theme', 'light');
            document.documentElement.classList.remove('dark');
        }""")
        page.wait_for_timeout(400)
        page.screenshot(path=os.path.join(OUT_DIR, "03_welcome_mobile_390x844_light_es.png"))
        print("Captured 03_welcome_mobile_390x844_light_es.png")

        # 4. EN & DE Parity on Desktop
        page.set_viewport_size({"width": 1366, "height": 768})
        page.evaluate("""() => {
            localStorage.setItem('ppos-locale', 'en');
            localStorage.setItem('ppos_locale', 'en');
        }""")
        page.reload()
        page.wait_for_timeout(600)
        page.screenshot(path=os.path.join(OUT_DIR, "04_welcome_desktop_1366x768_light_en.png"))
        print("Captured 04_welcome_desktop_1366x768_light_en.png")

        page.evaluate("""() => {
            localStorage.setItem('ppos-locale', 'de');
            localStorage.setItem('ppos_locale', 'de');
        }""")
        page.reload()
        page.wait_for_timeout(600)
        page.screenshot(path=os.path.join(OUT_DIR, "05_welcome_desktop_1366x768_light_de.png"))
        print("Captured 05_welcome_desktop_1366x768_light_de.png")

        # Restore ES and proceed to stages
        page.evaluate("""() => {
            localStorage.setItem('ppos-locale', 'es');
            localStorage.setItem('ppos_locale', 'es');
        }""")
        page.reload()
        page.wait_for_timeout(600)

        # Stage A: Click start button
        start_btn = page.locator("button:has-text('Comenzar'), button:has-text('Continuar')").first
        start_btn.click()
        page.wait_for_timeout(600)
        page.screenshot(path=os.path.join(OUT_DIR, "06_stage_a_company_desktop_1366x768_light_es.png"))
        print("Captured 06_stage_a_company_desktop_1366x768_light_es.png")

        # Mobile Stage A
        page.set_viewport_size({"width": 390, "height": 844})
        page.wait_for_timeout(400)
        page.screenshot(path=os.path.join(OUT_DIR, "07_stage_a_company_mobile_390x844_light_es.png"))
        print("Captured 07_stage_a_company_mobile_390x844_light_es.png")

        # Back to desktop: Test and capture validation error by clearing legal name
        page.set_viewport_size({"width": 1366, "height": 768})
        page.evaluate("""() => {
            const el = document.getElementById('company-legal-name');
            if (el) {
                el.value = '';
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }""")
        page.wait_for_timeout(300)
        save_comp_btn = page.locator("button:has-text('Guardar y elegir qué produces')").first
        save_comp_btn.click()
        page.wait_for_timeout(400)
        page.screenshot(path=os.path.join(OUT_DIR, "08_stage_a_validation_error_desktop_1366x768.png"))
        print("Captured 08_stage_a_validation_error_desktop_1366x768.png")

        # Now refill valid legal name
        page.evaluate("""() => {
            const el = document.getElementById('company-legal-name');
            if (el) {
                el.value = 'Gráficas del Mediterráneo S.L.';
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }""")
        page.wait_for_timeout(300)

        # Submit and proceed to Stage B
        save_comp_btn.click()
        page.wait_for_timeout(1000)
        page.screenshot(path=os.path.join(OUT_DIR, "09_stage_b_products_desktop_1366x768_light_es.png"))
        print("Captured 09_stage_b_products_desktop_1366x768_light_es.png")

        # Advance to Stage C: Pricing calibration entry
        to_pricing_btn = page.locator("button:has-text('Continuar a calibrar precios')").first
        to_pricing_btn.click()
        page.wait_for_timeout(1000)
        page.screenshot(path=os.path.join(OUT_DIR, "10_stage_c_pricing_desktop_1366x768_light_es.png"))
        print("Captured 10_stage_c_pricing_desktop_1366x768_light_es.png")

        # Advance to Stage D: Review via skip button
        skip_review_btn = page.locator("button:has-text('Ir a resumen final')").first
        skip_review_btn.click()
        page.wait_for_timeout(1000)
        page.screenshot(path=os.path.join(OUT_DIR, "11_stage_d_review_desktop_1366x768_light_es.png"))
        print("Captured 11_stage_d_review_desktop_1366x768_light_es.png")

        # Stage D Dark
        page.evaluate("""() => {
            document.documentElement.classList.add('dark');
        }""")
        page.wait_for_timeout(400)
        page.screenshot(path=os.path.join(OUT_DIR, "12_stage_d_review_desktop_1366x768_dark_es.png"))
        print("Captured 12_stage_d_review_desktop_1366x768_dark_es.png")

        # Transition to Setup Hub
        full_setup_link = page.locator("button:has-text('Abrir configuración completa'), button:has-text('Configuración detallada')").first
        full_setup_link.click()
        page.wait_for_timeout(1200)
        page.screenshot(path=os.path.join(OUT_DIR, "13_transition_full_setup_hub_desktop.png"))
        print("Captured 13_transition_full_setup_hub_desktop.png")

        context.close()
        browser.close()
    print("Playwright capture complete.")

if __name__ == '__main__':
    run()
