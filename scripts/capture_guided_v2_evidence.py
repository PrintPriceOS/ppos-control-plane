import os
import sys
import json
import time
from playwright.sync_api import sync_playwright

OUT_DIR = os.path.abspath('review_artifacts_guided_onboarding_v2')
os.makedirs(OUT_DIR, exist_ok=True)

BASE_URL = 'http://localhost:5179'
TENANT_ID = 'tenant-faehrmann-2026'

AUTH_USER = {
    "tenantId": TENANT_ID,
    "role": "PRINTHOUSE_OPERATOR",
    "email": "operator@faehrmann.de",
    "printhouseId": "node-faehrmann-01",
    "companyName": "Druckerei Fährmann GmbH"
}

AUTH_TOKEN = "test-session-token-guided-v2"

SERVER_ONBOARDING_DATA = {
    "ok": True,
    "data": {
        "company": {
            "companyName": "Druckerei Fährmann GmbH",
            "legalName": "Druckerei Fährmann GmbH & Co. KG",
            "country": "DE",
            "city": "Köln",
            "address": "Industriestraße 45",
            "postalCode": "50667",
            "phone": "+49 221 987654",
            "website": "https://faehrmann-druck.de",
            "contactName": "Hans Fährmann",
            "taxId": "DE123456789"
        },
        "sites": [
            {
                "siteId": "site-cologne-01",
                "siteName": "Hauptproduktionswerk Köln",
                "city": "Köln",
                "country": "DE",
                "timezone": "Europe/Berlin"
            }
        ],
        "readiness": {
            "accountSetup": { "status": "COMPLETE", "blockingIssues": [] },
            "operationalConfiguration": { "status": "COMPLETE", "blockingIssues": [] },
            "pricingReadiness": { "status": "COMPLETE", "blockingIssues": [] }
        }
    }
}

INDUSTRIAL_DATA = {
    "ok": True,
    "nodes": [
        {
            "id": "node-faehrmann-01",
            "name": "Heidelberg Speedmaster XL 106",
            "type": "OFFSET",
            "siteId": "site-cologne-01"
        }
    ]
}

def inject_auth_and_draft(page, stage="WELCOME", locale="es", theme="light", printer_node_id="node-faehrmann-01", pricing_continuity=None):
    user_payload = dict(AUTH_USER)
    if not printer_node_id:
        user_payload["printhouseId"] = None

    draft_data = {
        "schemaVersion": 2,
        "tenantId": TENANT_ID,
        "currentStage": stage,
        "selectedFamilyId": "HARDCOVER",
        "enabledFamilies": {
            "HARDCOVER": True,
            "SOFTCOVER": True,
            "WIRE_O": False,
            "SADDLE_STITCH": False
        },
        "company": {
            "legalName": "Druckerei Fährmann GmbH & Co. KG",
            "tradingName": "Fährmann Print",
            "country": "DE",
            "city": "Köln",
            "address": "Industriestraße 45",
            "postalCode": "50667",
            "phone": "+49 221 987654",
            "website": "https://faehrmann-druck.de",
            "contactName": "Hans Fährmann",
            "taxId": "DE123456789",
            "siteName": "Hauptproduktionswerk Köln",
            "siteTimezone": "Europe/Berlin",
            "primarySiteId": "site-cologne-01"
        },
        "offerDrafts": {},
        "pricingContinuity": pricing_continuity or {
            "HARDCOVER": {
                "sessionId": "sess-live-9821",
                "activeRun": {
                    "id": "run-faehrmann-01",
                    "status": "COMPLETED",
                    "targetPrice": 3850,
                    "enginePriceAfter": 3820,
                    "absoluteResidual": -30,
                    "percentResidual": -0.78
                },
                "selectedVariantId": "var-500-hardcover",
                "proposedPatch": {
                    "speed": 6200,
                    "hourlyRate": 145.0
                },
                "entryMode": "MANUAL_FORM",
                "uploadedFileName": None,
                "step": 4
            }
        },
        "lastSavedTimestamp": int(time.time() * 1000),
        "completedStages": {
            "WELCOME": True,
            "COMPANY": True,
            "PRODUCTS": True,
            "PRICING": True,
            "REVIEW": False
        }
    }

    page.add_init_script(f"""
        localStorage.setItem('ppos_control_user', JSON.stringify({json.dumps(user_payload)}));
        localStorage.setItem('ppos_control_token', '{AUTH_TOKEN}');
        localStorage.setItem('ppos_locale', '{locale}');
        localStorage.setItem('ppos_theme', '{theme}');
        localStorage.setItem('ppos_guided_onboarding_draft_{TENANT_ID}', JSON.stringify({json.dumps(draft_data)}));
        if ('{theme}' === 'dark') {{
            document.documentElement.classList.add('dark');
        }} else {{
            document.documentElement.classList.remove('dark');
        }}
    """)

def route_mocks(page, node_id="node-faehrmann-01", readiness_override=None, company_error=False):
    def handle_route(route):
        url = route.request.url
        if "/api/printhouse/onboarding/pricing/industrial" in url:
            if node_id:
                route.fulfill(status=200, content_type="application/json", body=json.dumps({
                    "ok": True,
                    "data": {
                        "nodeId": node_id,
                        "nodeName": "Heidelberg Speedmaster XL 106"
                    }
                }))
            else:
                route.fulfill(status=200, content_type="application/json", body=json.dumps({"ok": True, "data": None}))
        elif "/api/printhouse/onboarding/company-profile" in url and company_error:
            route.fulfill(
                status=422,
                content_type="application/json",
                body=json.dumps({
                    "error": {
                        "code": "UNPROCESSABLE_ENTITY",
                        "message": "NIF o CIF no válido en el registro mercantil comunitario."
                    }
                })
            )
        elif "/api/printhouse/onboarding" in url:
            data = json.loads(json.dumps(SERVER_ONBOARDING_DATA))
            if readiness_override:
                data["data"]["readiness"] = readiness_override
            route.fulfill(status=200, content_type="application/json", body=json.dumps(data))
        else:
            route.continue_()

    page.route("**/api/printhouse/**", handle_route)

def main():
    print("Starting Guided Onboarding V2 Evidence Capture...")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        scenarios = [
            # 1. Desktop 1366x768 - Welcome Screen (ES, Light)
            {
                "name": "01_welcome_desktop_1366_light_es.png",
                "width": 1366, "height": 768, "locale": "es", "theme": "light", "stage": "WELCOME"
            },
            # 2. Desktop 1366x768 - Stage A Company (ES, Light)
            {
                "name": "02_stage_a_company_desktop_1366_light_es.png",
                "width": 1366, "height": 768, "locale": "es", "theme": "light", "stage": "COMPANY"
            },
            # 3. Desktop 1366x768 - Stage B Products 4-Families (ES, Dark)
            {
                "name": "03_stage_b_products_desktop_1366_dark_es.png",
                "width": 1366, "height": 768, "locale": "es", "theme": "dark", "stage": "PRODUCTS"
            },
            # 4. Desktop 1366x768 - Stage C Pricing with Active Continuity (ES, Light)
            {
                "name": "04_stage_c_pricing_desktop_1366_light_es.png",
                "width": 1366, "height": 768, "locale": "es", "theme": "light", "stage": "PRICING"
            },
            # 5. Desktop 1366x768 - Stage C Missing Printer Node Prerequisite Banner (ES, Light, node_id=None)
            {
                "name": "05_stage_c_missing_node_prerequisite_desktop_1366_light_es.png",
                "width": 1366, "height": 768, "locale": "es", "theme": "light", "stage": "PRICING", "node_id": None
            },
            # 6. Desktop 1366x768 - Stage D Review with Valid Readiness (ES, Light)
            {
                "name": "06_stage_d_review_desktop_1366_light_es.png",
                "width": 1366, "height": 768, "locale": "es", "theme": "light", "stage": "REVIEW"
            },
            # 7. Desktop 1366x768 - Stage D Review with Incomplete Readiness Blocked (ES, Dark)
            {
                "name": "07_stage_d_review_incomplete_readiness_desktop_1366_dark_es.png",
                "width": 1366, "height": 768, "locale": "es", "theme": "dark", "stage": "REVIEW",
                "readiness": {
                    "accountSetup": { "status": "COMPLETE", "blockingIssues": [] },
                    "operationalConfiguration": { "status": "INCOMPLETE", "blockingIssues": ["NO_MACHINES"] },
                    "pricingReadiness": { "status": "INCOMPLETE", "blockingIssues": ["UNRESOLVED_RATES"] }
                }
            },
            # 8. Mobile 390x844 - Stage D Review (ES, Light)
            {
                "name": "08_stage_d_review_mobile_390_light_es.png",
                "width": 390, "height": 844, "locale": "es", "theme": "light", "stage": "REVIEW"
            },
            # 9. Mobile 390x844 - Stage C Pricing (ES, Dark)
            {
                "name": "09_stage_c_pricing_mobile_390_dark_es.png",
                "width": 390, "height": 844, "locale": "es", "theme": "dark", "stage": "PRICING"
            },
            # 10. Desktop 1366x768 - EN Localization Review Screen
            {
                "name": "10_stage_d_review_desktop_1366_light_en.png",
                "width": 1366, "height": 768, "locale": "en", "theme": "light", "stage": "REVIEW"
            },
            # 11. Desktop 1366x768 - DE Localization Review Screen
            {
                "name": "11_stage_d_review_desktop_1366_light_de.png",
                "width": 1366, "height": 768, "locale": "de", "theme": "light", "stage": "REVIEW"
            }
        ]

        for sc in scenarios:
            ctx = browser.new_context(viewport={"width": sc["width"], "height": sc["height"]})
            page = ctx.new_page()
            route_mocks(page, node_id=sc.get("node_id", "node-faehrmann-01"), readiness_override=sc.get("readiness"))
            inject_auth_and_draft(
                page,
                stage=sc["stage"],
                locale=sc.get("locale", "es"),
                theme=sc.get("theme", "light"),
                printer_node_id=sc.get("node_id", "node-faehrmann-01")
            )
            
            target_url = f"{BASE_URL}/printhouse/onboarding"
            page.goto(target_url, wait_until="networkidle")
            page.wait_for_timeout(800)

            out_path = os.path.join(OUT_DIR, sc["name"])
            page.screenshot(path=out_path, full_page=False)
            print(f"Captured: {sc['name']}")
            ctx.close()

        # Capture Error State Screenshot: Stage A 422 Unprocessable Entity
        err_ctx = browser.new_context(viewport={"width": 1366, "height": 768})
        err_page = err_ctx.new_page()
        route_mocks(err_page, company_error=True)
        inject_auth_and_draft(err_page, stage="COMPANY", locale="es", theme="light")
        err_page.goto(f"{BASE_URL}/printhouse/onboarding", wait_until="networkidle")
        err_page.wait_for_timeout(500)
        
        # Click submit to trigger 422 error banner
        submit_btn = err_page.query_selector('button[type="submit"]')
        if submit_btn:
            submit_btn.click()
            err_page.wait_for_timeout(600)
        
        err_page.screenshot(path=os.path.join(OUT_DIR, "12_stage_a_error_normalized_422_desktop_1366.png"))
        print("Captured: 12_stage_a_error_normalized_422_desktop_1366.png")
        err_ctx.close()

        browser.close()
    print("All Playwright evidence captured successfully in", OUT_DIR)

if __name__ == '__main__':
    main()
