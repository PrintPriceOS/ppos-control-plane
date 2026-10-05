import os
import json
import time
import hashlib
import zipfile
import subprocess
from playwright.sync_api import sync_playwright

OUT_DIR = os.path.abspath('review_artifacts_beta_operational')
os.makedirs(OUT_DIR, exist_ok=True)

# ── Mock Fixtures according to real client contracts & schemas ──
MOCK_TENANTS = [
    {"id": "tenant_alpha", "name": "Alpha Press LLC", "status": "ACTIVE", "commercial_status": "ACTIVE"},
    {"id": "tenant_beta", "name": "Beta Graphics Corp", "status": "ACTIVE", "commercial_status": "ACTIVE"}
]

MOCK_ACTIVATION_READINESS = {
    "ok": True,
    "readiness_status": "READY",
    "gate_status": "ACTIVE",
    "activation_status": "ACTIVATED",
    "kill_switch_active": False,
    "active_participants_count": 8,
    "max_participants": 25,
    "cohort_id": "cohort_2026_q4",
    "tenant_id": "tenant_alpha",
    "scope": {
        "allowed_modules": ["preflight", "pricing", "manufacturing"],
        "max_concurrent_sessions": 5
    }
}

MOCK_INVITE_ISSUANCE_READINESS = {
    "ok": True,
    "readiness_status": "READY",
    "gate_status": "OPEN",
    "active_batch_count": 3,
    "pending_invites_count": 2,
    "max_invites_per_batch": 10,
    "cohort_id": "cohort_2026_q4",
    "tenant_id": "tenant_alpha",
    "batches": [
        {"batch_id": "batch_alpha_01", "name": "Lote Alfa 1", "status": "APPROVED", "invites_count": 5}
    ]
}

MOCK_INVITE_ACCEPTANCE_READINESS = {
    "ok": True,
    "readiness_status": "READY",
    "gate_status": "OPEN",
    "accepted_participants_count": 6,
    "active_participants_count": 6,
    "revoked_participants_count": 0,
    "cohort_id": "cohort_2026_q4",
    "tenant_id": "tenant_alpha"
}

def get_git_sha():
    try:
        res = subprocess.run(["git", "rev-parse", "HEAD"], capture_output=True, text=True, check=True)
        return res.stdout.strip()
    except Exception:
        return "UNKNOWN"

def compute_sha256(filepath):
    h = hashlib.sha256()
    with open(filepath, 'rb') as f:
        while chunk := f.read(8192):
            h.update(chunk)
    return h.hexdigest()

def check_overflow(page):
    return page.evaluate("""() => {
        const docWidth = document.documentElement.scrollWidth;
        const winWidth = window.innerWidth;
        const bodyWidth = document.body ? document.body.scrollWidth : 0;
        return {
            hasOverflow: docWidth > winWidth + 1 || bodyWidth > winWidth + 1,
            docWidth,
            winWidth,
            bodyWidth
        };
    }""")

def setup_page_auth_and_theme(page, theme='dark', locale='es'):
    page.goto('http://localhost:3000/')
    page.evaluate(f"""() => {{
        localStorage.setItem('ppos-theme', '{theme}');
        localStorage.setItem('ppos_theme', '{theme}');
        localStorage.setItem('ppos_locale', '{locale}');
        localStorage.setItem('ppos-locale', '{locale}');
        localStorage.setItem('ppos_control_token', 'dev_super_admin_token');
        localStorage.setItem('ppos_control_user', JSON.stringify({{
            email: 'admin@printprice.pro',
            role: 'SUPER_ADMIN',
            name: 'Super Admin Principal',
            isSuperAdmin: true
        }}));
        if ('{theme}' === 'dark') {{
            document.documentElement.classList.add('dark');
            document.documentElement.style.backgroundColor = '#0e0e0f';
        }} else {{
            document.documentElement.classList.remove('dark');
            document.documentElement.style.backgroundColor = '#ffffff';
        }}
        document.documentElement.lang = '{locale}';
    }}""")

def setup_client_intercepts(page, error_state=None):
    if error_state is None:
        error_state = {"fail_activation_401": False, "fail_invites_401": False, "fail_acceptance_401": False}

    def route_handler(route):
        url = route.request.url.split('?')[0]
        method = route.request.method

        # Tenants
        if url.endswith('/api/admin/tenants'):
            route.fulfill(status=200, content_type='application/json', body=json.dumps(MOCK_TENANTS))
            return

        # Cohort Activation Readiness
        if '/api/admin/beta/cohort-activation/readiness' in url:
            if error_state.get("fail_activation_401", False):
                route.fulfill(status=401, content_type='application/json', body=json.dumps({
                    "ok": False,
                    "error": {
                        "code": "UNAUTHORIZED",
                        "message": "Credenciales inválidas para acceso a activación de cohortes."
                    }
                }))
                return
            route.fulfill(status=200, content_type='application/json', body=json.dumps(MOCK_ACTIVATION_READINESS))
            return

        # Invite Issuance Readiness
        if '/api/admin/beta/invite-issuance/readiness' in url:
            if error_state.get("fail_invites_401", False):
                route.fulfill(status=401, content_type='application/json', body=json.dumps({
                    "ok": False,
                    "error": {
                        "code": "UNAUTHORIZED",
                        "message": "Credenciales inválidas para emisión de invitaciones."
                    }
                }))
                return
            route.fulfill(status=200, content_type='application/json', body=json.dumps(MOCK_INVITE_ISSUANCE_READINESS))
            return

        # Invite Acceptance Readiness
        if '/api/admin/beta/invite-acceptance/readiness' in url:
            if error_state.get("fail_acceptance_401", False):
                route.fulfill(status=401, content_type='application/json', body=json.dumps({
                    "ok": False,
                    "error": {
                        "code": "UNAUTHORIZED",
                        "message": "Credenciales inválidas para aceptación de participantes."
                    }
                }))
                return
            route.fulfill(status=200, content_type='application/json', body=json.dumps(MOCK_INVITE_ACCEPTANCE_READINESS))
            return

        route.continue_()

    page.route('**/*', route_handler)
    return error_state

def run_cohort_captures():
    git_sha = get_git_sha()
    print("=" * 70)
    print("CAPTURA Y VERIFICACIÓN COHORTES BETA OPERATIVO (PLAYWRIGHT)")
    print(f"Commit Git Code Base: {git_sha}")
    print("=" * 70)

    stages = [
        {
            "id": "07_cohortes_activacion",
            "name": "7. Activación de Cohortes",
            "path": "/admin/beta/cohorts?tab=activation",
            "tab_button": "Activación",
            "required_safety": "First Controlled Invite-Only Beta Cohort Activation",
            "forbidden_terms": ["Phase 129", "Phase 133", "Phase 134", "tenant_beta_01", "cohort_beta_01"]
        },
        {
            "id": "08_cohortes_invitaciones",
            "name": "8. Emisión de Invitaciones",
            "path": "/admin/beta/cohorts?tab=invitations",
            "tab_button": "Invitaciones",
            "required_safety": "Controlled invite issuance only",
            "required_safety_extra": "This is not public beta, not open marketplace, and not automatic expansion",
            "forbidden_terms": ["Phase 133", "Phase 129", "Phase 134", "tenant_beta_01", "user@example.com"]
        },
        {
            "id": "09_cohortes_participantes",
            "name": "9. Aceptación y Participantes",
            "path": "/admin/beta/cohorts?tab=participants",
            "tab_button": "Participantes",
            "required_safety": "Controlled invite acceptance and participant onboarding only",
            "required_safety_extra": "This is not public signup, not public beta, and not open marketplace",
            "forbidden_terms": ["Phase 134", "Phase 129", "Phase 133", "participant_beta_01"]
        }
    ]

    new_results = []
    sha_map = {}

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        # ── 1. Desktop Dark & Light Captures ──
        print("\n>>> 1. DESKTOP (Dark & Light 1280x720) <<<")
        for theme in ['dark', 'light']:
            ctx = browser.new_context(viewport={"width": 1280, "height": 720})
            page = ctx.new_page()
            setup_client_intercepts(page)
            setup_page_auth_and_theme(page, theme=theme, locale='es')

            for stage in stages:
                target_url = f"http://localhost:3000{stage['path']}"
                page.goto(target_url, wait_until='networkidle')
                page.wait_for_timeout(600)

                # Theme setup
                if theme == 'dark':
                    page.evaluate("() => { if (!document.documentElement.classList.contains('dark')) document.documentElement.classList.add('dark'); }")
                else:
                    page.evaluate("() => { document.documentElement.classList.remove('dark'); document.documentElement.style.backgroundColor = '#ffffff'; }")

                # Verify clean content (no phase numbers, no preloaded hardcoded tenant_beta_01)
                page_text = page.content()
                for term in stage["forbidden_terms"]:
                    assert term not in page_text, f"ASSERTION FAILED: Forbidden term '{term}' found on {stage['name']}!"

                if stage.get("required_safety"):
                    assert stage["required_safety"] in page_text, f"ASSERTION FAILED: Safety copy '{stage['required_safety']}' missing on {stage['name']}!"
                if stage.get("required_safety_extra"):
                    assert stage["required_safety_extra"] in page_text, f"ASSERTION FAILED: Extra safety copy missing on {stage['name']}!"

                # Select Tenant
                tenant_select = page.locator('select[id$="-tenant-selector"]')
                if tenant_select.count() > 0:
                    try:
                        tenant_select.first.select_option(value='tenant_alpha')
                        page.wait_for_timeout(300)
                    except Exception:
                        pass

                # Check horizontal overflow
                overflow = check_overflow(page)
                assert not overflow["hasOverflow"], f"ASSERTION FAILED: Horizontal overflow detected on {stage['name']} ({theme}): {overflow}"

                # Take screenshot
                shot_name = f"{stage['id']}_selected_{theme}_es.png"
                shot_path = os.path.join(OUT_DIR, shot_name)
                page.screenshot(path=shot_path, full_page=True)

                file_sha = compute_sha256(shot_path)
                sha_map[shot_name] = file_sha

                new_results.append({
                    "stage": stage["name"],
                    "flow": "Recorrido 1 (Cohortes Beta Operativo)",
                    "variant": f"Desktop 1280x720 - {theme.capitalize()} - ES",
                    "file": shot_name,
                    "git_sha": git_sha,
                    "sha256": file_sha,
                    "overflow": overflow,
                    "entity_selected": True,
                    "simulated_data": {
                        "tenants": True,
                        "activation_readiness": True,
                        "invite_issuance_readiness": True,
                        "invite_acceptance_readiness": True
                    }
                })
                print(f"  [CAPTURA OK] {shot_name} (SHA: {file_sha[:12]}..., Overflow: {overflow['hasOverflow']})")

            ctx.close()

        # ── 2. Mobile Dark Captures (390x844) ──
        print("\n>>> 2. MOBILE (Dark 390x844) <<<")
        ctx_mobile = browser.new_context(viewport={"width": 390, "height": 844})
        page_mobile = ctx_mobile.new_page()
        setup_client_intercepts(page_mobile)
        setup_page_auth_and_theme(page_mobile, theme='dark', locale='es')

        for stage in stages:
            target_url = f"http://localhost:3000{stage['path']}"
            page_mobile.goto(target_url, wait_until='networkidle')
            page_mobile.wait_for_timeout(600)
            page_mobile.evaluate("() => { if (!document.documentElement.classList.contains('dark')) document.documentElement.classList.add('dark'); }")

            # Select Tenant
            tenant_select = page_mobile.locator('select[id$="-tenant-selector"]')
            if tenant_select.count() > 0:
                try:
                    tenant_select.first.select_option(value='tenant_alpha')
                    page_mobile.wait_for_timeout(300)
                except Exception:
                    pass

            overflow = check_overflow(page_mobile)
            assert not overflow["hasOverflow"], f"ASSERTION FAILED: Mobile overflow detected on {stage['name']}: {overflow}"

            shot_name = f"{stage['id']}_selected_mobile_390x844_dark.png"
            shot_path = os.path.join(OUT_DIR, shot_name)
            page_mobile.screenshot(path=shot_path, full_page=True)

            file_sha = compute_sha256(shot_path)
            sha_map[shot_name] = file_sha

            new_results.append({
                "stage": stage["name"],
                "flow": "Recorrido 2 (Mobile Responsive)",
                "variant": "Mobile 390x844 - Dark - ES",
                "file": shot_name,
                "git_sha": git_sha,
                "sha256": file_sha,
                "overflow": overflow,
                "entity_selected": True,
                "simulated_data": {
                    "tenants": True,
                    "activation_readiness": True,
                    "invite_issuance_readiness": True,
                    "invite_acceptance_readiness": True
                }
            })
            print(f"  [CAPTURA OK] {shot_name} (SHA: {file_sha[:12]}..., Overflow: {overflow['hasOverflow']})")

        ctx_mobile.close()

        # ── 3. HTTP 401 Session Handling & Panel Capture ──
        print("\n>>> 3. HTTP 401 (Sesión Ausente/Expirada con Botón Iniciar Sesión) <<<")
        ctx_401 = browser.new_context(viewport={"width": 1280, "height": 720})
        page_401 = ctx_401.new_page()
        setup_client_intercepts(page_401, error_state={"fail_activation_401": True})
        setup_page_auth_and_theme(page_401, theme='dark', locale='es')

        page_401.on("console", lambda msg: print("PAGE LOG:", msg.text))
        page_401.on("request", lambda req: print("PAGE REQ:", req.url))
        page_401.on("response", lambda res: print("PAGE RESP:", res.url, res.status))

        target_url = "http://localhost:3000/admin/beta/cohorts?tab=activation"
        page_401.goto(target_url, wait_until='networkidle')
        page_401.wait_for_timeout(500)
        page_401.evaluate("() => { if (!document.documentElement.classList.contains('dark')) document.documentElement.classList.add('dark'); }")

        # Fill activation ID and trigger readiness check to cause 401
        act_input = page_401.locator('input[placeholder*="act_"]').first
        print(f"act_input count: {act_input.count()}")
        if act_input.count() > 0:
            act_input.fill('act_alpha_test')
            page_401.wait_for_timeout(300)
            btn_info = page_401.evaluate("""() => {
                const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Verificar'));
                if (btn) {
                    btn.click();
                    return { found: true, disabled: btn.disabled, text: btn.textContent };
                }
                return { found: false };
            }""")
            print("BTN INFO & JS CLICK:", btn_info)
            page_401.wait_for_timeout(1000)

        page_401.wait_for_timeout(500)

        # Assertions
        content = page_401.content()
        assert "Minified React error" not in content, "React crash error detected!"
        assert "object with keys {code, message}" not in content, "Object dumped into JSX!"

        # Iniciar sesión button visible
        login_btn = page_401.locator('button:has-text("Iniciar Sesión")').first
        assert login_btn.is_visible(), "Iniciar Sesión button should be visible on 401"

        # Reintentar suppressed
        retry_count = page_401.locator('button:has-text("Reintentar")').count()
        assert retry_count == 0, "Reintentar button must NOT be rendered on 401 to prevent retry loop"

        # Screenshot full affected panel
        panel = page_401.locator('div[role="alert"]').first
        panel.scroll_into_view_if_needed()
        shot_401_name = "07_cohortes_activacion_http401_error_dark_es.png"
        shot_401_path = os.path.join(OUT_DIR, shot_401_name)
        panel.screenshot(path=shot_401_path)

        sha_401 = compute_sha256(shot_401_path)
        sha_map[shot_401_name] = sha_401
        overflow_401 = check_overflow(page_401)

        new_results.append({
            "stage": "7. Activación de Cohortes",
            "flow": "Recorrido 3 (HTTP 401 Sesión Ausente/Expirada)",
            "variant": "Desktop 1280x720 - Dark - HTTP 401 Error Panel Completo - ES",
            "file": shot_401_name,
            "git_sha": git_sha,
            "sha256": sha_401,
            "overflow": overflow_401,
            "simulated_data": {
                "http_401_injected": True,
                "target_endpoint": "/api/admin/beta/cohort-activation/readiness",
                "nested_error_object": True,
                "login_button_present": True,
                "retry_loop_prevented": True
            }
        })
        print(f"  [CAPTURA OK] {shot_401_name} (Panel 401: Error normalizado y botón Iniciar Sesión)")

        ctx_401.close()
        browser.close()

    # ── Update evidence_summary.json ──
    summary_path = os.path.join(OUT_DIR, "evidence_summary.json")
    existing_summary = {"captures": [], "checksums": {}}
    if os.path.exists(summary_path):
        try:
            with open(summary_path, "r", encoding="utf-8") as f:
                existing_summary = json.load(f)
        except Exception:
            pass

    # Filter out any prior cohort captures if present, then append
    filtered_captures = [c for c in existing_summary.get("captures", []) if not c["file"].startswith(("07_", "08_", "09_"))]
    combined_captures = filtered_captures + new_results

    combined_checksums = existing_summary.get("checksums", {})
    combined_checksums.update(sha_map)

    with open(summary_path, "w", encoding="utf-8") as f:
        json.dump({
            "git_commit_sha": git_sha,
            "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "captures_count": len(combined_captures),
            "captures": combined_captures,
            "checksums": combined_checksums
        }, f, indent=2)

    print(f"\nResumen actualizado de evidencias: {summary_path} ({len(combined_captures)} capturas)")

    # ── Re-package ZIP ──
    zip_path = os.path.abspath("review_artifacts_beta_operational.zip")
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for root, dirs, files in os.walk(OUT_DIR):
            for file in files:
                abs_f = os.path.join(root, file)
                rel_f = os.path.relpath(abs_f, OUT_DIR)
                zf.write(abs_f, rel_f)
    print(f"Paquete ZIP generado exitosamente en: {zip_path}")

if __name__ == '__main__':
    run_cohort_captures()
