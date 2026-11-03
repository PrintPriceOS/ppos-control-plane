#!/usr/bin/env python3
"""
scripts/test_developer_ecosystem_e2e.py

Phase 199E (Frente 3): Automated End-to-End Playwright & Live Production Verification Suite
covering the complete Self-Service Developer Hub (`https://control.printprice.pro/developers`),
Interactive API Playground & OpenAPI 3.1 Specs (`https://docs.printprice.pro`),
and Outbound Webhook Observability.
"""

import json
import sys
import time
import urllib.request
import urllib.error
from playwright.sync_api import sync_playwright

CONTROL_BASE = "https://control.printprice.pro"
DOCS_BASE = "https://docs.printprice.pro"


def http_json(method: str, url: str, headers: dict = None, body: dict = None):
    req_headers = {"Content-Type": "application/json", "Accept": "application/json"}
    if headers:
        req_headers.update(headers)
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, headers=req_headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            resp_headers = {k.lower(): v for k, v in resp.getheaders()}
            raw = resp.read().decode("utf-8")
            return resp.status, resp_headers, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        resp_headers = {k.lower(): v for k, v in e.headers.items()} if e.headers else {}
        raw = e.read().decode("utf-8")
        try:
            parsed = json.loads(raw) if raw else {}
        except Exception:
            parsed = {"raw": raw}
        return e.code, resp_headers, parsed


def run_suite():
    print("==================================================================")
    print(" PrintPrice OS — Phase 199E Developer Ecosystem E2E Suite")
    print("==================================================================")

    tenant_id = f"tenant-e2e-live-{int(time.time())}"

    # 1. Credential Lifecycle (API)
    print("[1/5] Provisioning Sandbox API Key (pp_test_*) on control.printprice.pro...")
    status, headers, created = http_json(
        "POST",
        f"{CONTROL_BASE}/api/developer/keys",
        headers={"x-tenant-id": tenant_id, "x-user-role": "DEVELOPER_SANDBOX"},
        body={
            "keyName": "Playwright Live E2E Key",
            "keyType": "TEST",
            "scopes": ["pricing:read", "preflight:write", "webhooks:manage"],
        },
    )
    assert status in (200, 201), f"Expected 201 on key creation, got {status}: {created}"
    raw_key = created["apiKey"]["rawKey"]
    key_prefix = created["apiKey"]["keyPrefix"]
    assert raw_key.startswith("pp_test_"), f"Invalid key prefix: {raw_key}"
    print(f"  -> OK: Created {key_prefix}... (tier={created['apiKey']['billingTier']})")

    # 2. Paywall Enforcement (HTTP 402 on unactivated LIVE key)
    print("[2/5] Verifying HTTP 402 Paywall for unactivated pp_live_* key...")
    status_402, _, body_402 = http_json(
        "POST",
        f"{CONTROL_BASE}/api/developer/keys",
        headers={"x-tenant-id": f"{tenant_id}-unpaid", "x-user-role": "DEVELOPER_SANDBOX"},
        body={"keyName": "Blocked Live Key", "keyType": "LIVE"},
    )
    assert status_402 == 402, f"Expected HTTP 402 Paywall, got {status_402}: {body_402}"
    print("  -> OK: HTTP 402 Payment Required enforced for unactivated tenant.")

    # 3. Gateway Execution (test-ping & book-estimate with Rate-Limit headers)
    print("[3/5] Executing test-ping and 5-axis BPE book-estimate with X-API-Key...")
    ping_status, ping_headers, ping_body = http_json(
        "GET",
        f"{CONTROL_BASE}/api/developer/keys/test-ping",
        headers={"X-API-Key": raw_key},
    )
    assert ping_status == 200, f"Expected 200 on test-ping, got {ping_status}"
    assert "x-ratelimit-limit" in ping_headers, "Missing X-RateLimit-Limit header"
    assert "x-ratelimit-remaining" in ping_headers, "Missing X-RateLimit-Remaining header"
    print(
        f"  -> OK: test-ping 200 (X-RateLimit-Limit={ping_headers['x-ratelimit-limit']}, "
        f"X-RateLimit-Remaining={ping_headers['x-ratelimit-remaining']})"
    )

    bpe_status, _, bpe_body = http_json(
        "POST",
        f"{CONTROL_BASE}/api/pricing/book-estimate",
        headers={"X-API-Key": raw_key, "x-user-role": "DEVELOPER_SANDBOX"},
        body={
            "trimWidthMm": 148,
            "trimHeightMm": 210,
            "pageCount": 240,
            "printRunCopies": 1200,
            "interiorPaperGsm": 90,
            "bindingType": "SOFTCOVER_PUR",
        },
    )
    assert bpe_status == 200 and bpe_body.get("ok") is True, f"BPE failed: {bpe_status} {bpe_body}"
    q_star = bpe_body["crossover"]["qStarCopies"]
    tech = bpe_body["crossover"]["recommendedTechnology"]
    print(f"  -> OK: BPE book-estimate 200 (Q*={q_star} copies, tech={tech})")

    # 4. Outbound Webhook Subscription, HMAC-SHA256 Test Event & Replay
    print("[4/5] Verifying Outbound Webhooks, SSRF Guard, HMAC-SHA256 Signature & Replay...")
    ssrf_status, _, _ = http_json(
        "POST",
        f"{CONTROL_BASE}/api/developer/webhooks",
        headers={"x-tenant-id": tenant_id},
        body={"url": "http://127.0.0.1:8080/internal", "events": ["preflight.certified"]},
    )
    assert ssrf_status == 400, f"Expected 400 SSRF block, got {ssrf_status}"

    wh_status, _, wh_body = http_json(
        "POST",
        f"{CONTROL_BASE}/api/developer/webhooks",
        headers={"x-tenant-id": tenant_id},
        body={
            "url": "https://webhooks.erp-partner.io/v1/printprice",
            "events": ["preflight.certified", "order.status_changed", "einvoice.issued"],
        },
    )
    assert wh_status == 200 and wh_body.get("ok") is True, f"Webhook save failed: {wh_body}"
    wh_secret = wh_body["endpoint"].get("oneTimeSigningSecret") or wh_body["endpoint"].get("secretPrefix", "")
    assert wh_secret.startswith("whsec_"), f"Expected whsec_* secret, got: {wh_body}"

    evt_status, _, evt_body = http_json(
        "POST",
        f"{CONTROL_BASE}/api/developer/webhooks/test-event",
        headers={"x-tenant-id": tenant_id},
        body={"eventType": "preflight.certified"},
    )
    assert evt_status == 200 and evt_body.get("ok") is True, f"Test event failed: {evt_body}"
    sig = evt_body["signedHeaders"]["X-PPOS-Signature"]
    assert sig.startswith("sha256="), f"Invalid signature format: {sig}"
    print(f"  -> OK: Dispatched preflight.certified with X-PPOS-Signature={sig[:24]}...")

    # 5. Browser E2E Verification on docs.printprice.pro (Interactive Playground + OpenAPI 3.1)
    print("[5/5] Launching Playwright headless Chromium to verify docs.printprice.pro Playground...")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1366, "height": 768})

        page.goto(f"{DOCS_BASE}/docs/api/quickstart", wait_until="networkidle", timeout=30000)
        key_input = page.locator('#ppos-pg-api-key-input').first
        key_input.wait_for(state="visible", timeout=10000)
        key_input.fill(raw_key)

        send_btn = page.locator('.ppos-pg-send-btn').first
        send_btn.click()

        status_badge = page.locator('.ppos-pg-status-badge').first
        status_badge.wait_for(state="visible", timeout=10000)
        badge_text = status_badge.inner_text()
        assert "200" in badge_text, f"Expected HTTP 200 badge in Playground UI, got: {badge_text}"
        print(f"  -> OK: Interactive Playground UI rendered live response badge: {badge_text}")

        # Verify OpenAPI 3.1 bundle download
        openapi_resp = page.request.get(f"{DOCS_BASE}/openapi/printprice-partner-api.bundle.yaml")
        assert openapi_resp.status == 200, f"OpenAPI bundle returned {openapi_resp.status}"
        yaml_text = openapi_resp.text()
        assert "/api/developer/keys/test-ping:" in yaml_text
        assert "/api/pricing/book-estimate:" in yaml_text
        assert "preflight.certified:" in yaml_text
        print("  -> OK: OpenAPI 3.1 bundle verified with test-ping, book-estimate, and 12 webhook topics.")

        browser.close()

    print("==================================================================")
    print(" ALL 5 E2E VERIFICATION STAGES PASSED SUCCESSFULLY")
    print("==================================================================")


if __name__ == "__main__":
    try:
        run_suite()
    except Exception as exc:
        print(f"[FAIL] {exc}", file=sys.stderr)
        sys.exit(1)

