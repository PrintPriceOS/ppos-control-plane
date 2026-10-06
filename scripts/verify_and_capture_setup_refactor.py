import os
import sys
import json
import time
from playwright.sync_api import sync_playwright

WORKSPACE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
ARTIFACTS_DIR = r"C:\Users\KIKE\.gemini\antigravity-ide\brain\b274e27a-030a-4140-9e90-be1d5a05ecc9"
REVIEW_DIR = os.path.join(WORKSPACE_DIR, "review_artifacts_ux_setup_audit")
os.makedirs(REVIEW_DIR, exist_ok=True)
os.makedirs(ARTIFACTS_DIR, exist_ok=True)

# Standard Intercepted Fixture
MOCK_ONBOARDING_DATA = {
    "ok": True,
    "data": {
        "company": {"companyName": "Druckerei Süd GmbH", "country": "DE", "city": "Stuttgart"},
        "sites": [
            {"siteId": "site-1", "name": "Planta Principal Stuttgart", "city": "Stuttgart", "isOperational": True}
        ],
        "machines": [
            {"machineId": "m-1", "name": "Heidelberg Speedmaster XL 106", "siteId": "site-1", "status": "ACTIVE"}
        ],
        "capabilities": {"status": "COMPLETE"},
        "materials": {"status": "COMPLETE"},
        "capacity": {
            "status": "NOT_STARTED",
            "dailyCapacitySheets": 50000,
            "shiftCount": 2
        },
        "leadTimes": {
            "status": "NOT_STARTED",
            "standardDays": 5,
            "expressDays": 2
        },
        "pricing": {
            "status": "IN_PROGRESS"
        },
        "readiness": {
            "accountSetup": {
                "status": "IN_PROGRESS",
                "completedRequirements": 4,
                "totalRequirements": 6
            },
            "operationalConfiguration": {
                "status": "IN_PROGRESS",
                "completedRequirements": 3,
                "totalRequirements": 5
            },
            "industrialPricing": {
                "status": "IN_PROGRESS",
                "completedRequirements": 1,
                "totalRequirements": 2
            },
            "marketplaceReadiness": {
                "status": "READY_FOR_REVIEW",
                "completedRequirements": 2,
                "totalRequirements": 3
            },
            "sites": {"status": "COMPLETE", "completedRequirements": 1, "totalRequirements": 1},
            "machines": {"status": "COMPLETE", "completedRequirements": 1, "totalRequirements": 1},
            "capabilities": {"status": "COMPLETE", "completedRequirements": 1, "totalRequirements": 1},
            "materials": {"status": "COMPLETE", "completedRequirements": 1, "totalRequirements": 1},
            "capacity": {
                "status": "NOT_STARTED",
                "completedRequirements": 0,
                "totalRequirements": 1,
                "blockers": ["Shift schedules and throughput limits required"]
            },
            "leadTimes": {
                "status": "NOT_STARTED",
                "completedRequirements": 0,
                "totalRequirements": 1,
                "blockers": ["Turnaround SLAs required for scheduling"]
            },
            "pricing": {
                "status": "IN_PROGRESS",
                "completedRequirements": 1,
                "totalRequirements": 2,
                "blockers": ["Unpublished price books"]
            },
            "pricingReadiness": {
                "status": "IN_PROGRESS",
                "completedRequirements": 1,
                "totalRequirements": 2
            }
        }
    }
}

# Incomplete State Fixture with Long Complex Requirements
MOCK_ONBOARDING_DATA_LONG_REQUIREMENTS = {
    "ok": True,
    "data": {
        "company": {"companyName": "Offset & Digitaldruck München AG", "country": "DE", "city": "München"},
        "sites": [
            {"siteId": "site-münchen-1", "name": "Zentralwerk Bayern", "city": "München", "isOperational": True}
        ],
        "machines": [],
        "capabilities": {"status": "NOT_STARTED"},
        "materials": {"status": "NOT_STARTED"},
        "capacity": {"status": "NOT_STARTED"},
        "leadTimes": {"status": "NOT_STARTED"},
        "pricing": {"status": "NOT_STARTED"},
        "readiness": {
            "accountSetup": {"status": "COMPLETE", "completedRequirements": 6, "totalRequirements": 6},
            "operationalConfiguration": {"status": "NOT_STARTED", "completedRequirements": 0, "totalRequirements": 5},
            "industrialPricing": {"status": "NOT_STARTED", "completedRequirements": 0, "totalRequirements": 2},
            "marketplaceReadiness": {"status": "NOT_STARTED", "completedRequirements": 0, "totalRequirements": 3},
            "sites": {"status": "COMPLETE", "completedRequirements": 1, "totalRequirements": 1},
            "machines": {
                "status": "NOT_STARTED",
                "completedRequirements": 0,
                "totalRequirements": 1,
                "blockers": ["At least one active printing press or digital production engine is required for automated quote routing"]
            },
            "capabilities": {
                "status": "LOCKED",
                "completedRequirements": 0,
                "totalRequirements": 2,
                "blockers": [
                    "Production machinery fleet must be configured before operational binding capabilities can be certified",
                    "Validated color profile certification and inline UV drying unit verification pending"
                ]
            },
            "materials": {
                "status": "NOT_STARTED",
                "completedRequirements": 0,
                "totalRequirements": 1,
                "blockers": ["Paper substrates catalog requires at least one interior text weight and one cover board grade"]
            },
            "capacity": {
                "status": "NOT_STARTED",
                "completedRequirements": 0,
                "totalRequirements": 2,
                "blockers": [
                    "Shift schedules and daily maximum impression throughput limits required for dynamic delivery allocation",
                    "Weekly planned maintenance window blackout calendars must be configured"
                ]
            },
            "leadTimes": {
                "status": "NOT_STARTED",
                "completedRequirements": 0,
                "totalRequirements": 1,
                "blockers": ["Turnaround SLAs required for standard, express and critical deadline dispatching"]
            },
            "pricing": {
                "status": "NOT_STARTED",
                "completedRequirements": 0,
                "totalRequirements": 2,
                "blockers": [
                    "Active canonical industrial price matrix required with base setup and run rates across all formats",
                    "Governed commercial acceptance required before public customer quoting"
                ]
            }
        }
    }
}

MOCK_INDUSTRIAL_PRICING = {
    "ok": True,
    "data": {
        "nodeId": "node-stuttgart-01",
        "nodeName": "Fährmann Druckzentrum GmbH",
        "status": "Active",
        "signatures": [16, 24, 32],
        "delivery_time": "10-12 days",
        "production_lead_days": 8,
        "limits": {"min_copies": 25, "max_pages": 1200},
        "rates": {
            "min_order": 95.0,
            "setup_fixed": 42.0,
            "interior_one_colour_fixed": {"16": 80.31, "24": 95.0, "32": 110.0},
            "interior_one_colour_var": {"16": 8.12, "24": 10.5, "32": 12.8},
            "interior_two_colour_fixed": {"16": 100.0, "24": 120.0, "32": 140.0},
            "interior_two_colour_var": {"16": 12.0, "24": 15.0, "32": 18.0},
            "interior_full_colour_fixed": {"16": 120.0, "24": 145.0, "32": 170.0},
            "interior_full_colour_var": {"16": 18.0, "24": 22.0, "32": 26.0},
            "cover_fixed_by_colours": {"1": 40.0, "2": 55.0, "4": 66.0},
            "cover_var_per_1000_by_colours": {"1": 8.0, "2": 10.0, "4": 12.5},
            "endpaper_fixed_by_colours": {"0": 0.0, "1": 35.0, "4": 60.0},
            "endpaper_var_per_1000_by_colours": {"0": 0.0, "1": 7.0, "4": 11.0},
            "lam_fixed": {"varnish": 0, "gloss": 6.0, "matt": 6.0},
            "lam_var_per_1000": {"varnish": 0, "gloss": 25.0, "matt": 25.0},
            "uv_varnish": {"fixed": 45.0, "var": 18.0},
            "binding_pb_fixed_by_sections": {"4": 30.0, "8": 45.0, "12": 60.0},
            "binding_pb_var_per_1000_by_sections": {"4": 20.0, "8": 30.0, "12": 40.0},
            "binding_hb_fixed_by_sections": {"4": 60.0, "8": 80.0, "12": 100.0},
            "binding_hb_var_per_1000_by_sections": {"4": 50.0, "8": 70.0, "12": 90.0},
            "binding_ts_fixed_by_sections": {"4": 75.0, "8": 100.0, "12": 125.0},
            "binding_ts_var_per_1000_by_sections": {"4": 65.0, "8": 90.0, "12": 115.0},
            "paper_price_interior_by_kilo": {"offset": 1.252, "mc": 1.35, "lux": 1.65, "munken": 1.95, "other": 1.40},
            "paper_price_cover_by_kilo": {"mc": 2.515, "artboard": 2.80, "offset": 2.30, "wfmc": 2.65, "other": 2.50},
            "transport_costs": {"es": 1.25, "de": 0.85, "fr": 1.10}
        },
        "baselineChecksum": "f" * 64
    }
}

MOCK_CALIBRATED_SESSION = {
    "id": "session-calibrated-accepted-1",
    "status": "ACCEPTED",
    "printerNodeId": "node-stuttgart-01",
    "referenceBookName": "Catálogo Industrial Estándar",
    "bookSpec": {
        "copies": 1000,
        "book_width_mm": 170,
        "book_height_mm": 240,
        "interior_pages": 128,
        "interior_print": "4/4",
        "paper_type_interior": "offset",
        "paper_weight_interior": 80,
        "cover_print": "4/0",
        "paper_type_cover": "mc",
        "paper_weight_cover": 300,
        "lamination": "matt",
        "binding_method": "perfect bound",
        "delivery_country": "DE"
    },
    "targetManufacturingPrice": 2450.0,
    "currency": "EUR",
    "transportPricePerKg": 1.25,
    "transportCurrency": "EUR",
    "includesPaper": True,
    "includesBinding": True,
    "includesFinishing": True,
    "includesPackaging": True,
    "createdAt": "2026-10-06T12:00:00Z",
    "updatedAt": "2026-10-06T12:30:00Z"
}

MOCK_CALIBRATION_RUN = {
    "id": "run-accepted-1",
    "status": "ACCEPTED",
    "calibrationSessionId": "session-calibrated-accepted-1",
    "printerNodeId": "node-stuttgart-01",
    "targetPrice": 2450.0,
    "enginePriceAfter": 2450.0,
    "absoluteResidual": 0.0,
    "percentResidual": 0.0,
    "sessionInputChecksum": "a" * 64
}

MOCK_MACHINE_TEMPLATES = {
    "ok": True,
    "templates": [
        {"template_id": "DIGITAL_PRESS", "machine_type": "DIGITAL_PRESS", "defaults": {"machine_type": "DIGITAL_PRESS"}},
        {"template_id": "OFFSET_PRESS", "machine_type": "OFFSET_PRESS", "defaults": {"machine_type": "OFFSET_PRESS"}},
        {"template_id": "BINDER", "machine_type": "BINDER", "defaults": {"machine_type": "BINDER"}}
    ]
}

def setup_intercepts(page, mock_onboarding=MOCK_ONBOARDING_DATA, mock_calibrations=None):
    def handle_route(route):
        url = route.request.url
        if "/api/printhouse/onboarding/machines/templates" in url:
            route.fulfill(status=200, content_type="application/json", body=json.dumps(MOCK_MACHINE_TEMPLATES))
        elif "/machines" in url and "/api/printhouse/onboarding/sites/" in url:
            route.fulfill(status=200, content_type="application/json", body=json.dumps({"ok": True, "machines": [
                {
                    "id": "m-1",
                    "machine_name": "Heidelberg Speedmaster XL 106",
                    "machine_type": "OFFSET_PRESS",
                    "manufacturer": "Heidelberg",
                    "model": "Speedmaster XL 106",
                    "status": "ACTIVE",
                    "max_sheet_width_mm": 1060,
                    "max_sheet_height_mm": 750,
                    "supports_pdfx": True,
                    "supports_lamination": True,
                    "supported_color_modes_json": ["CMYK", "PANTONE"]
                }
            ]}))
        elif "/api/printhouse/onboarding/pricing/calibrations" in url:
            if "/runs" in url:
                route.fulfill(status=200, content_type="application/json", body=json.dumps({"ok": True, "data": [MOCK_CALIBRATION_RUN]}))
            else:
                sessions_data = mock_calibrations if mock_calibrations is not None else [MOCK_CALIBRATED_SESSION]
                route.fulfill(status=200, content_type="application/json", body=json.dumps({"ok": True, "data": sessions_data}))
        elif "/api/printhouse/onboarding/pricing/industrial" in url:
            route.fulfill(status=200, content_type="application/json", body=json.dumps(MOCK_INDUSTRIAL_PRICING))
        elif "/api/printhouse/onboarding/pricing/price-books" in url:
            route.fulfill(status=200, content_type="application/json", body=json.dumps({"ok": True, "data": []}))
        elif "/api/printhouse/onboarding" in url:
            route.fulfill(status=200, content_type="application/json", body=json.dumps(mock_onboarding))
        elif "/api/printhouse/sites" in url:
            route.fulfill(status=200, content_type="application/json", body=json.dumps({"ok": True, "data": mock_onboarding.get("data", {}).get("sites", [])}))
        else:
            route.fulfill(status=200, content_type="application/json", body=json.dumps({"ok": True, "data": []}))
    page.route("**/api/printhouse/**", handle_route)

def save_evidence(page, filename, desc):
    path1 = os.path.join(REVIEW_DIR, filename)
    path2 = os.path.join(ARTIFACTS_DIR, filename)
    page.screenshot(path=path1, full_page=False)
    page.screenshot(path=path2, full_page=False)
    # Also save to current conversation brain directory if it exists
    cur_brain = r"C:\Users\KIKE\.gemini\antigravity-ide\brain\2b893f39-8fa0-49ed-8771-228e86a03d74"
    if os.path.exists(cur_brain):
        page.screenshot(path=os.path.join(cur_brain, filename), full_page=False)
    print(f"[OK] Saved screenshot: {filename} -> {desc}")

def run():
    print("=" * 70)
    print("ASSERTIVE PLAYWRIGHT VERIFICATION: 1366x768 VIEWPORT & SETUP HUB REFACTOR")
    print("=" * 70)
    
    results = {
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "target_resolution": {"width": 1366, "height": 768, "scale": 1.0},
        "mode": "intercepted_fixtures_and_connected_backend",
        "network_interception_breakdown": {
            "intercepted_fixtures": [
                "GET /api/printhouse/onboarding (Mock printhouse setup state: company, sites, machines, readiness)",
                "GET /api/printhouse/onboarding/readiness (Module blockers and completion percentages)",
                "GET /api/printhouse/onboarding/pricing/industrial (Canonical industrial pricing rates)",
                "GET /api/printhouse/onboarding/pricing/price-books (Empty published books array)",
                "GET /api/printhouse/sites (Configured physical sites fixture)",
                "Fallback unhandled printhouse endpoints (Fulfill with 200 OK empty data to isolate dev server)"
            ],
            "connected_backend_and_runtime": [
                "Vite dev asset server (port 3000, real React hydration and dynamic layout rendering)",
                "Real DOM CSS computation, layout box constraints, and font metrics",
                "localStorage persistence for locale ('es', 'en', 'de') and theme ('dark', 'light')"
            ]
        },
        "tests": []
    }
    
    app_errors = []
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        
        # ── Test Suite 1: Standard Desktop 1366x768 at 100% Zoom ──
        context = browser.new_context(
            viewport={"width": 1366, "height": 768},
            device_scale_factor=1.0
        )
        page = context.new_page()
        
        # Listen for page errors
        page.on("pageerror", lambda err: app_errors.append(f"PAGE ERROR: {err}"))
        page.on("console", lambda msg: app_errors.append(f"CONSOLE ERROR: {msg.text}") if (msg.type == "error" and "Failed to load resource" not in msg.text) else None)
        
        setup_intercepts(page, MOCK_ONBOARDING_DATA)
        
        # Set Spanish Dark
        page.goto("http://localhost:3000/printhouse/setup?tab=OVERVIEW")
        page.evaluate("""() => {
            localStorage.setItem('ppos_locale', 'es');
            localStorage.setItem('locale', 'es');
            localStorage.setItem('theme', 'dark');
            document.documentElement.classList.add('dark');
        }""")
        page.reload()
        page.wait_for_timeout(1000)
        
        # 1. Measure and Assert Page Height & Scroll Container Overflow
        measurements = page.evaluate("""() => {
            const doc = document.documentElement;
            const body = document.body;
            const scrollingMain = document.querySelector('main.overflow-y-auto') || document.querySelector('main');
            return {
                windowHeight: window.innerHeight,
                docClientHeight: doc.clientHeight,
                docScrollHeight: doc.scrollHeight,
                bodyScrollHeight: body.scrollHeight,
                windowScrollY: window.scrollY,
                containerClientHeight: scrollingMain ? scrollingMain.clientHeight : 0,
                containerScrollHeight: scrollingMain ? scrollingMain.scrollHeight : 0,
                containerScrollTop: scrollingMain ? scrollingMain.scrollTop : 0
            };
        }""")
        
        print("\n--- 1366x768 Viewport & Container Measurements ---")
        print(f"Window Inner Height:       {measurements['windowHeight']}px")
        print(f"Document Client Height:    {measurements['docClientHeight']}px")
        print(f"Document Scroll Height:    {measurements['docScrollHeight']}px")
        print(f"Body Scroll Height:        {measurements['bodyScrollHeight']}px")
        print(f"Window Scroll Y:           {measurements['windowScrollY']}px")
        print(f"Container Client Height:   {measurements['containerClientHeight']}px")
        print(f"Container Scroll Height:   {measurements['containerScrollHeight']}px")
        print(f"Container Scroll Top:      {measurements['containerScrollTop']}px")
        
        test1_pass = (
            measurements['docScrollHeight'] <= measurements['windowHeight'] and
            measurements['bodyScrollHeight'] <= measurements['windowHeight'] and
            measurements['windowScrollY'] == 0 and
            measurements['containerScrollHeight'] <= measurements['containerClientHeight'] and
            measurements['containerScrollTop'] == 0
        )
        
        print(f"Assert scrollHeight <= clientHeight (0px scroll in window & container): {'PASS' if test1_pass else 'FAIL'}")
        if not test1_pass:
            print("FATAL: 1366x768 vertical overflow detected! scrollHeight exceeds clientHeight in document or scrolling main container.")
            sys.exit(1)
            
        results["tests"].append({
            "name": "viewport_1366x768_zero_scroll",
            "measurements": measurements,
            "passed": test1_pass
        })
        
        # 2. Check Visible Boundaries of All 8 Module Cards & Explicit Main CTA Buttons
        card_locators = page.locator("[data-module-card='true']")
        card_count = card_locators.count()
        print(f"\nVerifying visible bounds for all {card_count} module cards and explicit main CTAs...")
        
        if card_count != 8:
            print(f"FATAL: Expected 8 module cards in 4x2 grid, found {card_count}!")
            sys.exit(1)
            
        card_bounds = []
        for i in range(card_count):
            card = card_locators.nth(i)
            box = card.bounding_box()
            if not box:
                print(f"FATAL: Card #{i+1} has no bounding box (not rendered or hidden)!")
                sys.exit(1)
                
            bottom = box['y'] + box['height']
            right = box['x'] + box['width']
            card_in_viewport = (box['y'] >= 0 and bottom <= 768 and right <= 1366)
            
            # Explicit check for main module CTA (using data-module-cta="true", not button.first)
            cta = card.locator("[data-module-cta='true']")
            if cta.count() == 0:
                print(f"FATAL: Card #{i+1} has no primary CTA matching [data-module-cta='true']!")
                sys.exit(1)
            cta_box = cta.bounding_box()
            if not cta_box:
                print(f"FATAL: Card #{i+1} primary CTA has no bounding box!")
                sys.exit(1)
            cta_bottom = cta_box['y'] + cta_box['height']
            cta_in_viewport = (cta_box['y'] >= 0 and cta_bottom <= 768 and (cta_box['x'] + cta_box['width']) <= 1366)
            
            print(f"  Card #{i+1}: top={box['y']:.1f}px, bottom={bottom:.1f}px, height={box['height']:.1f}px | Card in viewport: {card_in_viewport} | Primary CTA visible: {cta_in_viewport} (bottom={cta_bottom:.1f}px)")
            
            if not card_in_viewport:
                print(f"FATAL: Card #{i+1} extends beyond viewport boundaries (bottom={bottom:.1f}px > 768px)!")
                sys.exit(1)
            if not cta_in_viewport:
                print(f"FATAL: Card #{i+1} primary CTA is not fully visible within viewport (cta_bottom={cta_bottom:.1f}px > 768px)!")
                sys.exit(1)
                
            card_bounds.append({
                "module": i + 1,
                "box": box,
                "cta_box": cta_box,
                "in_viewport": card_in_viewport,
                "cta_in_viewport": cta_in_viewport
            })
            
        results["tests"].append({
            "name": "all_8_cards_and_ctas_in_viewport",
            "cards": card_bounds,
            "passed": True
        })
        
        # Save evidence 01..04
        save_evidence(page, "01_setup_hub_overview_1366x768_dark_es.png", "Setup Overview at 1366x768 (Dark, ES)")
        
        page.evaluate("""() => {
            localStorage.setItem('theme', 'light');
            document.documentElement.classList.remove('dark');
        }""")
        page.wait_for_timeout(400)
        save_evidence(page, "02_setup_hub_overview_1366x768_light_es.png", "Setup Overview at 1366x768 (Light, ES)")
        
        page.evaluate("""() => {
            localStorage.setItem('theme', 'dark');
            document.documentElement.classList.add('dark');
            localStorage.setItem('ppos_locale', 'en');
            localStorage.setItem('locale', 'en');
        }""")
        page.reload()
        page.wait_for_timeout(800)
        save_evidence(page, "03_setup_hub_overview_1366x768_dark_en.png", "Setup Overview at 1366x768 (Dark, EN)")
        
        page.evaluate("""() => {
            localStorage.setItem('ppos_locale', 'de');
            localStorage.setItem('locale', 'de');
        }""")
        page.reload()
        page.wait_for_timeout(800)
        save_evidence(page, "04_setup_hub_overview_1366x768_dark_de.png", "Setup Overview at 1366x768 (Dark, DE)")
        
        # ── Test Suite 2: Incomplete State with Long Requirements & Interactive Toggle ──
        print("\n--- Testing Incomplete State with Long Requirements & Accessible Toggle ---")
        long_context = browser.new_context(viewport={"width": 1366, "height": 768}, device_scale_factor=1.0)
        long_page = long_context.new_page()
        setup_intercepts(long_page, MOCK_ONBOARDING_DATA_LONG_REQUIREMENTS)
        long_page.goto("http://localhost:3000/printhouse/setup?tab=OVERVIEW")
        long_page.evaluate("""() => {
            localStorage.setItem('ppos_locale', 'es');
            localStorage.setItem('locale', 'es');
            localStorage.setItem('theme', 'dark');
            document.documentElement.classList.add('dark');
        }""")
        long_page.reload()
        long_page.wait_for_timeout(1000)
        
        # Test clicking requirement detail toggle on Module 4 (Capabilities) which has multiple long blockers
        mod4_blockers = long_page.locator("[data-testid='module-blockers-4']")
        if mod4_blockers.count() > 0:
            toggle_btn = mod4_blockers.locator("button").first
            aria_exp_before = toggle_btn.get_attribute("aria-expanded")
            print(f"  Module #4 requirement toggle aria-expanded before click: {aria_exp_before}")
            toggle_btn.click()
            long_page.wait_for_timeout(300)
            aria_exp_after = toggle_btn.get_attribute("aria-expanded")
            print(f"  Module #4 requirement toggle aria-expanded after click: {aria_exp_after}")
            if aria_exp_after != "true":
                print("FATAL: Accessible requirement toggle did not set aria-expanded='true' on click!")
                sys.exit(1)
            # Test keyboard collapse with Enter
            toggle_btn.press("Enter")
            long_page.wait_for_timeout(300)
            aria_exp_collapse = toggle_btn.get_attribute("aria-expanded")
            print(f"  Module #4 requirement toggle after keyboard Enter press: {aria_exp_collapse}")
            if aria_exp_collapse != "false":
                print("FATAL: Accessible requirement toggle did not collapse on Enter press!")
                sys.exit(1)
        else:
            print("FATAL: Module 4 blockers container not found!")
            sys.exit(1)
            
        long_context.close()
        
        # ── Test Suite 3: Industrial Pricing Tab & 3 Explicit Modes ──
        print("\n--- Verifying Industrial Pricing Views & Dark Mode Form Integrity ---")
        pricing_context = browser.new_context(viewport={"width": 1366, "height": 768}, device_scale_factor=1.0)
        pricing_page = pricing_context.new_page()
        pricing_page.on("pageerror", lambda err: app_errors.append(f"PRICING PAGE ERROR: {err}"))
        setup_intercepts(pricing_page, MOCK_ONBOARDING_DATA)
        pricing_page.goto("http://localhost:3000/printhouse/setup?tab=PRICING")
        pricing_page.evaluate("""() => {
            localStorage.setItem('ppos_locale', 'es');
            localStorage.setItem('locale', 'es');
            localStorage.setItem('theme', 'dark');
            document.documentElement.classList.add('dark');
        }""")
        pricing_page.reload()
        pricing_page.wait_for_timeout(1000)
        
        # View A: Products & Quotes
        save_evidence(pricing_page, "05_setup_hub_pricing_products_dark.png", "Pricing Tab: Products & Quotes 4-Family View")
        
        # View B: Switch to AI Assistant
        assistant_btn = pricing_page.query_selector("#pricing-mode-assistant-btn")
        if not assistant_btn:
            print("FATAL: Mandatory Assistant button #pricing-mode-assistant-btn not found in pricing toolbar!")
            sys.exit(1)
        assistant_btn.click()
        pricing_page.wait_for_timeout(600)
        # Verify 4-family ribbon is visible
        ribbon = pricing_page.query_selector("[data-testid='pricing-family-ribbon']")
        if not ribbon:
            print("FATAL: 4-family ribbon not displayed in AI Assistant view!")
            sys.exit(1)
        save_evidence(pricing_page, "06_setup_hub_pricing_assistant_dark.png", "Pricing Tab: AI Assistant with 4-Family Ribbon")
        
        # View C: Switch to Manual Rate Cards
        manual_btn = pricing_page.query_selector("#pricing-mode-manual-btn")
        if not manual_btn:
            print("FATAL: Mandatory Manual rates button #pricing-mode-manual-btn not found in pricing toolbar!")
            sys.exit(1)
        manual_btn.click()
        pricing_page.wait_for_timeout(600)
        
        # Verify localized labels in Manual Rates in Spanish:
        page_text = pricing_page.content()
        if "Identificador del nodo de imprenta" not in page_text:
            print("FATAL: Manual rates editor does not display localized Spanish label 'Identificador del nodo de imprenta'!")
            sys.exit(1)
        if "Razón social / Nombre comercial" not in page_text:
            print("FATAL: Manual rates editor does not display localized Spanish label 'Razón social / Nombre comercial'!")
            sys.exit(1)
            
        save_evidence(pricing_page, "07_setup_hub_pricing_manual_rates_dark.png", "Pricing Tab: Manual Rate Editor in Dark Mode")
            
        pricing_context.close()
        
        # ── Test Suite 4: Mobile Responsiveness (390x844) ──
        print("\n--- Capturing Mobile Responsiveness (390x844) ---")
        mobile_context = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True)
        mobile_page = mobile_context.new_page()
        setup_intercepts(mobile_page, MOCK_ONBOARDING_DATA)
        mobile_page.goto("http://localhost:3000/printhouse/setup?tab=OVERVIEW")
        mobile_page.evaluate("""() => {
            localStorage.setItem('ppos_locale', 'es');
            localStorage.setItem('locale', 'es');
            localStorage.setItem('theme', 'dark');
            document.documentElement.classList.add('dark');
        }""")
        mobile_page.reload()
        mobile_page.wait_for_timeout(1000)
        save_evidence(mobile_page, "08_setup_hub_overview_mobile_390x844_dark.png", "Mobile Overview at 390x844")
        mobile_context.close()
        
        # ── Test Suite 5: Machinery Form Open (ES/EN/DE, Light/Dark, Vertical Scroll & Zero Horizontal Overflow) ──
        print("\n--- Verifying Machinery Form Open (Vertical Scroll & Zero Horizontal Overflow) ---")
        mach_context = browser.new_context(viewport={"width": 1366, "height": 768}, device_scale_factor=1.0)
        mach_page = mach_context.new_page()
        mach_page.on("pageerror", lambda err: app_errors.append(f"MACHINES PAGE ERROR: {err}"))
        setup_intercepts(mach_page, MOCK_ONBOARDING_DATA)

        # 5.1 Spanish Dark
        mach_page.goto("http://localhost:3000/printhouse/setup?tab=MACHINES")
        mach_page.evaluate("""() => {
            localStorage.setItem('ppos_locale', 'es');
            localStorage.setItem('locale', 'es');
            localStorage.setItem('theme', 'dark');
            document.documentElement.classList.add('dark');
        }""")
        mach_page.reload()
        mach_page.wait_for_timeout(1000)

        # Click "Añadir máquina"
        add_btn_es = mach_page.locator("button:has-text('Añadir máquina'), button:has-text('Add Machine')").first
        add_btn_es.wait_for(state="visible", timeout=5000)
        add_btn_es.click()
        mach_page.wait_for_timeout(600)

        # Verify form container presence, scrollability, and zero horizontal overflow
        form_measurements_es = mach_page.evaluate("""() => {
            const formContainer = document.querySelector('.overflow-y-auto.max-h-\\\\[80vh\\\\]') || document.querySelector('.overflow-y-auto');
            const doc = document.documentElement;
            return {
                found: !!formContainer,
                containerScrollHeight: formContainer ? formContainer.scrollHeight : 0,
                containerClientHeight: formContainer ? formContainer.clientHeight : 0,
                containerScrollWidth: formContainer ? formContainer.scrollWidth : 0,
                containerClientWidth: formContainer ? formContainer.clientWidth : 0,
                docScrollWidth: doc.scrollWidth,
                docClientWidth: doc.clientWidth,
                hasVerticalScroll: formContainer ? formContainer.scrollHeight > formContainer.clientHeight : false,
                zeroHorizontalOverflow: formContainer ? formContainer.scrollWidth <= formContainer.clientWidth : false,
                docZeroHorizontalOverflow: doc.scrollWidth <= doc.clientWidth
            };
        }""")

        print(f"  [ES Dark] Form container found: {form_measurements_es['found']}")
        print(f"  [ES Dark] Form scrollHeight: {form_measurements_es['containerScrollHeight']}px, clientHeight: {form_measurements_es['containerClientHeight']}px (Permits vertical scroll: {form_measurements_es['hasVerticalScroll']})")
        print(f"  [ES Dark] Form scrollWidth: {form_measurements_es['containerScrollWidth']}px, clientWidth: {form_measurements_es['containerClientWidth']}px (Zero horizontal overflow: {form_measurements_es['zeroHorizontalOverflow']})")
        print(f"  [ES Dark] Doc scrollWidth: {form_measurements_es['docScrollWidth']}px, clientWidth: {form_measurements_es['docClientWidth']}px")

        if not form_measurements_es['found'] or not form_measurements_es['zeroHorizontalOverflow'] or not form_measurements_es['docZeroHorizontalOverflow']:
            print("FATAL: Machinery form failed overflow or visibility check!")
            sys.exit(1)

        save_evidence(mach_page, "09_setup_hub_machines_form_open_dark_es.png", "Machinery Fleet: Form Open in Dark Mode (ES)")

        # 5.2 Spanish Light
        mach_page.evaluate("""() => {
            localStorage.setItem('theme', 'light');
            document.documentElement.classList.remove('dark');
        }""")
        mach_page.wait_for_timeout(400)
        save_evidence(mach_page, "10_setup_hub_machines_form_open_light_es.png", "Machinery Fleet: Form Open in Light Mode (ES)")

        # 5.3 English Dark & Light
        mach_page.evaluate("""() => {
            localStorage.setItem('theme', 'dark');
            document.documentElement.classList.add('dark');
            localStorage.setItem('ppos_locale', 'en');
            localStorage.setItem('locale', 'en');
        }""")
        mach_page.reload()
        mach_page.wait_for_timeout(800)
        add_btn_en = mach_page.locator("button:has-text('Add Machine')").first
        add_btn_en.wait_for(state="visible", timeout=5000)
        add_btn_en.click()
        mach_page.wait_for_timeout(500)
        save_evidence(mach_page, "11_setup_hub_machines_form_open_dark_en.png", "Machinery Fleet: Form Open in Dark Mode (EN)")

        mach_page.evaluate("""() => {
            localStorage.setItem('theme', 'light');
            document.documentElement.classList.remove('dark');
        }""")
        mach_page.wait_for_timeout(400)
        save_evidence(mach_page, "17_setup_hub_machines_form_open_light_en.png", "Machinery Fleet: Form Open in Light Mode (EN)")

        # 5.4 German Dark & Light
        mach_page.evaluate("""() => {
            localStorage.setItem('theme', 'dark');
            document.documentElement.classList.add('dark');
            localStorage.setItem('ppos_locale', 'de');
            localStorage.setItem('locale', 'de');
        }""")
        mach_page.reload()
        mach_page.wait_for_timeout(800)
        add_btn_de = mach_page.locator("button:has-text('Maschine hinzufügen')").first
        add_btn_de.wait_for(state="visible", timeout=5000)
        add_btn_de.click()
        mach_page.wait_for_timeout(500)
        save_evidence(mach_page, "12_setup_hub_machines_form_open_dark_de.png", "Machinery Fleet: Form Open in Dark Mode (DE)")

        mach_page.evaluate("""() => {
            localStorage.setItem('theme', 'light');
            document.documentElement.classList.remove('dark');
        }""")
        mach_page.wait_for_timeout(400)
        save_evidence(mach_page, "18_setup_hub_machines_form_open_light_de.png", "Machinery Fleet: Form Open in Light Mode (DE)")

        results["tests"].append({
            "name": "machinery_form_open_and_scroll",
            "measurements": form_measurements_es,
            "passed": True
        })

        mach_context.close()

        # ── Test Suite 6: Assistant in Calibrated State (ES/EN/DE, Light/Dark, Accessible Labels & Actions) ──
        print("\n--- Verifying Calibrated Assistant (Step 5, Accessible Labels & Actions) ---")
        calib_context = browser.new_context(viewport={"width": 1366, "height": 768}, device_scale_factor=1.0)
        calib_page = calib_context.new_page()
        calib_page.on("pageerror", lambda err: app_errors.append(f"CALIBRATION ASSISTANT ERROR: {err}"))
        setup_intercepts(calib_page, MOCK_ONBOARDING_DATA, mock_calibrations=[MOCK_CALIBRATED_SESSION])

        # 6.1 Spanish Dark
        calib_page.goto("http://localhost:3000/printhouse/setup?tab=PRICING")
        calib_page.evaluate("""() => {
            localStorage.setItem('ppos_locale', 'es');
            localStorage.setItem('locale', 'es');
            localStorage.setItem('theme', 'dark');
            document.documentElement.classList.add('dark');
        }""")
        calib_page.reload()
        calib_page.wait_for_timeout(1000)

        # Switch to Assistant mode
        assistant_btn = calib_page.locator("#pricing-mode-assistant-btn")
        assistant_btn.wait_for(state="visible", timeout=5000)
        assistant_btn.click()
        calib_page.wait_for_timeout(800)

        # Assert Step 5 Calibrated State is rendered
        step5_text_es = calib_page.locator("text='Tarifas calibradas y activas'").first
        step5_text_es.wait_for(state="visible", timeout=5000)

        # Verify button action is accessible
        calib_btn_es = calib_page.locator("button:has-text('Calibrar otro libro')").first
        if calib_btn_es.count() == 0 or not calib_btn_es.is_visible():
            print("FATAL: Step 5 action button 'Calibrar otro libro' not visible or missing!")
            sys.exit(1)

        # Scroll to bring GovernedQuoteSmokeTest form into clear view
        calib_page.evaluate("window.scrollTo(0, 320)")
        calib_page.wait_for_timeout(300)

        # Assert Spanish form elements
        calib_page.locator("text='Calcular presupuesto de prueba'").first.wait_for(state="visible", timeout=5000)
        calib_page.locator("text='Cantidad (Ejemplares)'").first.wait_for(state="visible", timeout=5000)

        # Real DOM overflow measurement
        calib_measurements_es = calib_page.evaluate("""() => {
            const doc = document.documentElement;
            return {
                docScrollWidth: doc.scrollWidth,
                docClientWidth: doc.clientWidth,
                windowInnerWidth: window.innerWidth,
                zeroHorizontalOverflow: doc.scrollWidth <= window.innerWidth
            };
        }""")
        print(f"  [Calibrated Assistant ES Dark] docScrollWidth: {calib_measurements_es['docScrollWidth']}px, clientWidth: {calib_measurements_es['docClientWidth']}px (Zero horizontal overflow: {calib_measurements_es['zeroHorizontalOverflow']})")

        if not calib_measurements_es['zeroHorizontalOverflow']:
            print("FATAL: Calibrated assistant view has horizontal overflow!")
            sys.exit(1)

        save_evidence(calib_page, "13_setup_hub_pricing_calibrated_dark_es.png", "Pricing Assistant: Calibrated State (Dark, ES)")

        # 6.2 Spanish Light
        calib_page.evaluate("""() => {
            localStorage.setItem('theme', 'light');
            document.documentElement.classList.remove('dark');
        }""")
        calib_page.wait_for_timeout(400)
        calib_page.evaluate("window.scrollTo(0, 320)")
        calib_page.wait_for_timeout(200)
        save_evidence(calib_page, "14_setup_hub_pricing_calibrated_light_es.png", "Pricing Assistant: Calibrated State (Light, ES)")

        # 6.3 English Dark & Light
        calib_page.evaluate("""() => {
            localStorage.setItem('theme', 'dark');
            document.documentElement.classList.add('dark');
            localStorage.setItem('ppos_locale', 'en');
            localStorage.setItem('locale', 'en');
        }""")
        calib_page.reload()
        calib_page.wait_for_timeout(800)
        calib_page.locator("#pricing-mode-assistant-btn").click()
        calib_page.wait_for_timeout(600)
        calib_page.locator("text='Pricing Calibrated & Active'").first.wait_for(state="visible", timeout=5000)
        calib_btn_en = calib_page.locator("button:has-text('Calibrate Another Book')").first
        if not calib_btn_en.is_visible():
            print("FATAL: English calibrated action button not visible!")
            sys.exit(1)
        calib_page.evaluate("window.scrollTo(0, 320)")
        calib_page.wait_for_timeout(300)
        save_evidence(calib_page, "15_setup_hub_pricing_calibrated_dark_en.png", "Pricing Assistant: Calibrated State (Dark, EN)")

        calib_page.evaluate("""() => {
            localStorage.setItem('theme', 'light');
            document.documentElement.classList.remove('dark');
        }""")
        calib_page.wait_for_timeout(400)
        calib_page.evaluate("window.scrollTo(0, 320)")
        calib_page.wait_for_timeout(200)
        save_evidence(calib_page, "19_setup_hub_pricing_calibrated_light_en.png", "Pricing Assistant: Calibrated State (Light, EN)")

        # 6.4 German Dark & Light
        calib_page.evaluate("""() => {
            localStorage.setItem('theme', 'dark');
            document.documentElement.classList.add('dark');
            localStorage.setItem('ppos_locale', 'de');
            localStorage.setItem('locale', 'de');
        }""")
        calib_page.reload()
        calib_page.wait_for_timeout(800)
        calib_page.locator("#pricing-mode-assistant-btn").click()
        calib_page.wait_for_timeout(600)
        calib_page.locator("text='Preise kalibriert & aktiv'").first.wait_for(state="visible", timeout=5000)
        calib_btn_de = calib_page.locator("button:has-text('Anderes Buch kalibrieren')").first
        if not calib_btn_de.is_visible():
            print("FATAL: German calibrated action button not visible!")
            sys.exit(1)

        calib_page.evaluate("window.scrollTo(0, 320)")
        calib_page.wait_for_timeout(300)

        # Assert localized German texts in GovernedQuoteSmokeTest and QuickCalibrationPanel:
        calib_page.locator("text='Testangebot berechnen'").first.wait_for(state="visible", timeout=5000)
        calib_page.locator("text='Auflage (Exemplare)'").first.wait_for(state="visible", timeout=5000)
        calib_page.locator("text='Kalibrierungsziel:'").first.wait_for(state="visible", timeout=5000)

        # Verify that English strings do NOT appear in the German view
        page_html_de = calib_page.content()
        for forbidden_en in ["Calibration Target:", "Calculate Test Quote", "Quantity (Copies)"]:
            if forbidden_en in page_html_de:
                print(f"FATAL: Found untranslated English string '{forbidden_en}' in German calibrated assistant view!")
                sys.exit(1)

        save_evidence(calib_page, "16_setup_hub_pricing_calibrated_dark_de.png", "Pricing Assistant: Calibrated State (Dark, DE)")

        calib_page.evaluate("""() => {
            localStorage.setItem('theme', 'light');
            document.documentElement.classList.remove('dark');
        }""")
        calib_page.wait_for_timeout(400)
        calib_page.evaluate("window.scrollTo(0, 320)")
        calib_page.wait_for_timeout(200)
        save_evidence(calib_page, "20_setup_hub_pricing_calibrated_light_de.png", "Pricing Assistant: Calibrated State (Light, DE)")

        results["tests"].append({
            "name": "pricing_calibrated_assistant_view",
            "measurements": calib_measurements_es,
            "passed": True
        })

        calib_context.close()

        browser.close()
        
    # Check for application errors
    if app_errors:
        print(f"\nFATAL: {len(app_errors)} application error(s) detected during verification:")
        for err in app_errors:
            print("  ->", err)
        sys.exit(1)
        
    # Save structured results
    res_path = os.path.join(REVIEW_DIR, "verification_results.json")
    with open(res_path, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)
    print(f"\n[OK] Structured results written to: {res_path}")
    
    print("\n" + "=" * 70)
    print("ALL PLAYWRIGHT ASSERTIONS PASSED WITH ZERO OVERFLOW AND ZERO RUNTIME ERRORS!")
    print("=" * 70)

if __name__ == '__main__':
    run()
