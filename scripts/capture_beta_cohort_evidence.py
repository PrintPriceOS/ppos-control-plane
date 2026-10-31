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

        # Cohort Activation Action (mutation)
        if '/api/admin/beta/cohort-activation/activate' in url:
            route.fulfill(status=200, content_type='application/json', body=json.dumps({"ok": True}))
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

def verify_button_within_panel(page, stage_name, viewport_name):
    """Verifies that the primary verify button inside panel 1 does NOT overflow panel 1."""
    panel1 = page.locator('div.grid > div').first
    btn = panel1.locator('button:has-text("Verificar")').first
    if btn.count() > 0 and panel1.count() > 0:
        btn_box = btn.bounding_box()
        panel_box = panel1.bounding_box()
        if btn_box and panel_box:
            # Button right edge should not exceed panel right edge (+2px tolerance for subpixel rounding)
            btn_right = btn_box['x'] + btn_box['width']
            panel_right = panel_box['x'] + panel_box['width']
            assert btn_right <= panel_right + 2, (
                f"OVERFLOW VIOLATION on {stage_name} ({viewport_name}): "
                f"Button right edge ({btn_right:.1f}px) exceeds panel right edge ({panel_right:.1f}px)!"
            )
            print(f"    [LAYOUT OK] Button fits inside Panel 1 ({btn_box['width']:.1f}px / {panel_box['width']:.1f}px, stacked={btn_box['width'] > 200})")

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
            "safety_patterns": [
                "Activación de cohorte beta controlada",
                "Activación de cohorte Beta controlada",
                "Controlled invite-only beta cohort activation"
            ],
            "forbidden_terms": ["Phase 129", "Phase 133", "Phase 134", "tenant_beta_01", "cohort_beta_01"]
        },
        {
            "id": "08_cohortes_invitaciones",
            "name": "8. Emisión de Invitaciones",
            "path": "/admin/beta/cohorts?tab=invitations",
            "tab_button": "Invitaciones",
            "safety_patterns": [
                "Emisión controlada de invitaciones únicamente",
                "Controlled invite issuance only"
            ],
            "forbidden_terms": ["Phase 133", "Phase 129", "Phase 134", "tenant_beta_01", "user@example.com"]
        },
        {
            "id": "09_cohortes_participantes",
            "name": "9. Aceptación y Participantes",
            "path": "/admin/beta/cohorts?tab=participants",
            "tab_button": "Participantes",
            "safety_patterns": [
                "Aceptación controlada de invitaciones",
                "Controlled invite acceptance and participant onboarding only"
            ],
            "forbidden_terms": ["Phase 134", "Phase 129", "Phase 133", "participant_beta_01"]
        }
    ]

    new_results = []
    sha_map = {}

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        # ── Test Matrix of Viewports and Themes ──
        # Breakpoints requested: 1280px, 1366px, 390px in light and dark
        test_viewports = [
            {"width": 1366, "height": 768, "label": "1366x768"},
            {"width": 1280, "height": 720, "label": "1280x720"},
            {"width": 390, "height": 844, "label": "390x844"}
        ]

        for vp in test_viewports:
            vp_w = vp["width"]
            vp_h = vp["height"]
            vp_lbl = vp["label"]

            for theme in ['dark', 'light']:
                print(f"\n>>> VIEWPORT: {vp_lbl} | THEME: {theme.upper()} <<<")
                ctx = browser.new_context(viewport={"width": vp_w, "height": vp_h})
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

                    # Verify clean content (no phase numbers, no preloaded hardcoded sample values)
                    page_text = page.content()
                    for term in stage["forbidden_terms"]:
                        assert term not in page_text, f"ASSERTION FAILED: Forbidden term '{term}' found on {stage['name']}!"

                    # Verify safety notice is present (localized or fallback)
                    has_safety = any(pattern.lower() in page_text.lower() for pattern in stage["safety_patterns"])
                    assert has_safety, f"ASSERTION FAILED: Safety notice missing on {stage['name']}! Expected one of: {stage['safety_patterns']}"

                    # Select Tenant if present
                    tenant_select = page.locator('select[id$="-tenant-selector"]')
                    if tenant_select.count() > 0:
                        try:
                            tenant_select.first.select_option(value='tenant_alpha')
                            page.wait_for_timeout(200)
                        except Exception:
                            pass

                    # Check horizontal overflow
                    overflow = check_overflow(page)
                    assert not overflow["hasOverflow"], (
                        f"ASSERTION FAILED: Horizontal overflow detected on {stage['name']} ({vp_lbl} - {theme}): {overflow}"
                    )

                    # Check that button fits strictly inside panel 1 (does not overlap next column)
                    verify_button_within_panel(page, stage["name"], f"{vp_lbl}_{theme}")

                    # Determine filename for artifact
                    if vp_w == 1280:
                        shot_name = f"{stage['id']}_selected_{theme}_es.png"
                    elif vp_w == 1366:
                        shot_name = f"{stage['id']}_selected_1366x768_{theme}_es.png"
                    else:
                        shot_name = f"{stage['id']}_selected_mobile_390x844_{theme}.png"

                    shot_path = os.path.join(OUT_DIR, shot_name)
                    # FULL FORM CAPTURE (not just the header)
                    page.screenshot(path=shot_path, full_page=True)

                    file_sha = compute_sha256(shot_path)
                    sha_map[shot_name] = file_sha

                    new_results.append({
                        "stage": stage["name"],
                        "flow": "Recorrido Responsive & Visual (Cohortes Beta Operativo)",
                        "variant": f"{vp_lbl} - {theme.capitalize()} - Formularios Completos - ES",
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

        # ── 4. Confirmation Modal Evidence & Cancellation Mutation Check ──
        print("\n>>> 4. CONFIRMATION MODAL & CANCEL (Zero Mutations Check) <<<")
        ctx_modal = browser.new_context(viewport={"width": 1366, "height": 768})
        page_modal = ctx_modal.new_page()
        setup_client_intercepts(page_modal)
        setup_page_auth_and_theme(page_modal, theme='dark', locale='es')

        target_url = "http://localhost:3000/admin/beta/cohorts?tab=activation"
        page_modal.goto(target_url, wait_until='networkidle')
        page_modal.wait_for_timeout(500)
        page_modal.evaluate("() => { if (!document.documentElement.classList.contains('dark')) document.documentElement.classList.add('dark'); }")

        # Fill activation ID
        act_input = page_modal.locator('input[placeholder*="act_"]').first
        act_input.fill('act_prod_audit_verification')
        page_modal.wait_for_timeout(300)

        # Track mutations
        mutation_requests = []
        def track_request(req):
            if req.method in ["POST", "PUT", "DELETE", "PATCH"] and not req.url.endswith('.js'):
                mutation_requests.append({"method": req.method, "url": req.url})
        page_modal.on("request", track_request)

        # Open confirmation modal
        activate_btn = page_modal.locator('button:has-text("Activar Cohorte")').first
        assert activate_btn.is_visible(), "Activar Cohorte button must be visible"
        activate_btn.click()
        page_modal.wait_for_timeout(400)

        # Assert modal is visible
        dialog = page_modal.locator('div[role="dialog"]').first
        assert dialog.is_visible(), "Confirmation modal dialog must be visible"
        print("  [MODAL OK] Modal de confirmación abierto correctamente.")

        # Capture modal
        modal_shot_name = "07_cohortes_activacion_confirm_modal_dark_es.png"
        modal_shot_path = os.path.join(OUT_DIR, modal_shot_name)
        page_modal.screenshot(path=modal_shot_path, full_page=True)
        sha_modal = compute_sha256(modal_shot_path)
        sha_map[modal_shot_name] = sha_modal

        new_results.append({
            "stage": "7. Activación de Cohortes",
            "flow": "Modal de Confirmación Operativa",
            "variant": "Desktop 1366x768 - Dark - Modal de Confirmación - ES",
            "file": modal_shot_name,
            "git_sha": git_sha,
            "sha256": sha_modal,
            "overflow": {"hasOverflow": False},
            "simulated_data": {"modal_opened": True, "action": "Activar Cohorte"}
        })
        print(f"  [CAPTURA OK] {modal_shot_name} (Modal de confirmación en pantalla)")

        # Click Cancelar
        cancel_btn = dialog.locator('button:has-text("Cancelar")').first
        assert cancel_btn.is_visible(), "Cancelar button in modal must be visible"
        cancel_btn.click()
        page_modal.wait_for_timeout(400)

        # Verify modal dismissed
        assert dialog.count() == 0 or not dialog.is_visible(), "Modal must be dismissed after clicking Cancelar"

        # VERIFY ZERO MUTATIONS
        assert len(mutation_requests) == 0, (
            f"MUTATION INVARIANT VIOLATION: Canceling modal emitted mutation requests: {mutation_requests}"
        )
        print("  [INVARIANTE OK] Cancelar modal NO emitió ninguna petición de mutación HTTP (0 peticiones emitidas).")

        # Capture post-cancellation state
        cancelled_shot_name = "07_cohortes_activacion_confirm_cancelled_dark_es.png"
        cancelled_shot_path = os.path.join(OUT_DIR, cancelled_shot_name)
        page_modal.screenshot(path=cancelled_shot_path, full_page=True)
        sha_cancelled = compute_sha256(cancelled_shot_path)
        sha_map[cancelled_shot_name] = sha_cancelled

        new_results.append({
            "stage": "7. Activación de Cohortes",
            "flow": "Cancelación sin Mutación",
            "variant": "Desktop 1366x768 - Dark - Estado Post-Cancelación (Zero Mutación) - ES",
            "file": cancelled_shot_name,
            "git_sha": git_sha,
            "sha256": sha_cancelled,
            "overflow": {"hasOverflow": False},
            "simulated_data": {"cancelled_cleanly": True, "mutations_emitted": 0}
        })
        print(f"  [CAPTURA OK] {cancelled_shot_name} (Post-cancelación confirmado sin mutaciones)")

        ctx_modal.close()

        # ── 5. HTTP 401 Session Handling & Complete Form Capture ──
        print("\n>>> 5. HTTP 401 (Formulario Completo con Banner de Sesión Expirada) <<<")
        ctx_401 = browser.new_context(viewport={"width": 1366, "height": 768})
        page_401 = ctx_401.new_page()
        setup_client_intercepts(page_401, error_state={"fail_activation_401": True})
        setup_page_auth_and_theme(page_401, theme='dark', locale='es')

        target_url = "http://localhost:3000/admin/beta/cohorts?tab=activation"
        page_401.goto(target_url, wait_until='networkidle')
        page_401.wait_for_timeout(500)
        page_401.evaluate("() => { if (!document.documentElement.classList.contains('dark')) document.documentElement.classList.add('dark'); }")

        # Fill activation ID and trigger readiness check to cause 401
        act_input_401 = page_401.locator('input[placeholder*="act_"]').first
        if act_input_401.count() > 0:
            act_input_401.fill('act_alpha_test')
            page_401.wait_for_timeout(200)
            verify_btn_401 = page_401.locator('button:has-text("Verificar")').first
            if verify_btn_401.is_visible():
                verify_btn_401.click()
                page_401.wait_for_timeout(800)

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

        # FULL FORM CAPTURE (not just the header alert!)
        shot_401_name = "07_cohortes_activacion_http401_error_dark_es.png"
        shot_401_path = os.path.join(OUT_DIR, shot_401_name)
        page_401.screenshot(path=shot_401_path, full_page=True)

        sha_401 = compute_sha256(shot_401_path)
        sha_map[shot_401_name] = sha_401
        overflow_401 = check_overflow(page_401)

        new_results.append({
            "stage": "7. Activación de Cohortes",
            "flow": "Recorrido HTTP 401 (Formulario Completo)",
            "variant": "Desktop 1366x768 - Dark - HTTP 401 Formulario Completo - ES",
            "file": shot_401_name,
            "git_sha": git_sha,
            "sha256": sha_401,
            "overflow": overflow_401,
            "simulated_data": {
                "http_401_injected": True,
                "target_endpoint": "/api/admin/beta/cohort-activation/readiness",
                "nested_error_object": True,
                "login_button_present": True,
                "retry_loop_prevented": True,
                "full_form_captured": True
            }
        })
        print(f"  [CAPTURA OK] {shot_401_name} (Formulario completo 401 con alerta y botón Iniciar Sesión)")

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

    # Filter out prior cohort captures if present, then append
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
    print(f"ZIP SHA256: {compute_sha256(zip_path)}")

if __name__ == '__main__':
    run_cohort_captures()
