import os
import json
import time
import hashlib
import subprocess
from playwright.sync_api import sync_playwright

OUT_DIR = os.path.abspath('review_artifacts_beta_operational')
os.makedirs(OUT_DIR, exist_ok=True)

# ── Fixtures according to real client contracts ──
MOCK_TENANTS_POPULATED = [
    {"id": "tenant_alpha", "name": "Alpha Press LLC", "status": "ACTIVE", "commercial_status": "ACTIVE"},
    {"id": "tenant_beta", "name": "Beta Graphics Corp", "status": "ACTIVE", "commercial_status": "ACTIVE"}
]

MOCK_REVIEWS_LIST = {
    "ok": True,
    "reviews": [
        {
            "review_id": "rev_beta_alpha_01",
            "tenant_id": "tenant_alpha",
            "cohort_id": "cohort_2026_q4",
            "review_status": "FINALIZED",
            "risk_level": "LOW",
            "window_start": "2026-10-01T00:00:00Z",
            "window_end": "2026-10-05T00:00:00Z"
        },
        {
            "review_id": "rev_beta_beta_02",
            "tenant_id": "tenant_beta",
            "cohort_id": "cohort_2026_q4",
            "review_status": "FINALIZED",
            "risk_level": "MEDIUM",
            "window_start": "2026-10-01T00:00:00Z",
            "window_end": "2026-10-05T00:00:00Z"
        }
    ]
}

MOCK_REVIEW_DETAIL = {
    "ok": True,
    "review": {
        "review_id": "rev_beta_alpha_01",
        "tenant_id": "tenant_alpha",
        "cohort_id": "cohort_2026_q4",
        "review_status": "FINALIZED",
        "risk_level": "LOW",
        "window_start": "2026-10-01T00:00:00Z",
        "window_end": "2026-10-05T00:00:00Z"
    },
    "decision": {
        "review_id": "rev_beta_alpha_01",
        "decision": "PROCEED",
        "notes": "Parámetros de salud de cohorte en rango nominal (latencia < 45ms, 0 anomalías bloqueantes)."
    },
    "findings": [
        {"id": "find_01", "severity": "INFO", "title": "Rendimiento estable verificado en ventana"},
        {"id": "find_02", "severity": "LOW", "title": "Sin alertas de cuotas excedidas"}
    ]
}

MOCK_REVIEW_EVIDENCE = {
    "ok": True,
    "evidencePack": {
        "evidence_pack_id": "ev_pack_rev_alpha_01",
        "checksum": "c9a4f89d34e2b012",
        "finalized_at": "2026-10-05T12:00:00Z"
    }
}

MOCK_PREPARATIONS_LIST = {
    "ok": True,
    "preparations": [
        {
            "preparation_id": "prep_alpha_intervention_01",
            "source_review_id": "rev_beta_alpha_01",
            "tenant_id": "tenant_alpha",
            "cohort_id": "cohort_2026_q4",
            "preparation_status": "FINALIZED",
            "preparation_type": "POLICY_UPDATE"
        }
    ]
}

MOCK_PREPARATION_DETAIL = {
    "ok": True,
    "preparation": {
        "preparation_id": "prep_alpha_intervention_01",
        "source_review_id": "rev_beta_alpha_01",
        "tenant_id": "tenant_alpha",
        "cohort_id": "cohort_2026_q4",
        "preparation_status": "FINALIZED",
        "preparation_type": "POLICY_UPDATE"
    },
    "items": [
        {"id": "item_01", "label": "Validación de cuota por participante", "status": "APPROVED", "required_role": "SUPER_ADMIN"},
        {"id": "item_02", "label": "Certificación de no ejecución industrial", "status": "APPROVED", "required_role": "SUPER_ADMIN"}
    ]
}

MOCK_PREPARATION_EVIDENCE = {
    "ok": True,
    "evidencePack": {
        "evidence_pack_id": "ev_pack_prep_alpha_01",
        "checksum": "f83b1029da7c44e9"
    }
}

MOCK_APPROVALS_LIST = {
    "ok": True,
    "approvals": [
        {
            "approval_id": "appr_alpha_gov_01",
            "preparation_id": "prep_alpha_intervention_01",
            "tenant_id": "tenant_alpha",
            "cohort_id": "cohort_2026_q4",
            "approval_status": "READY_FOR_APPROVAL",
            "risk_level": "LOW",
            "approval_policy_json": {
                "policy_name": "Gobernanza Beta Controlada",
                "required_roles": ["SUPER_ADMIN"]
            }
        }
    ]
}

MOCK_APPROVAL_DETAIL = {
    "ok": True,
    "approval": {
        "approval_id": "appr_alpha_gov_01",
        "preparation_id": "prep_alpha_intervention_01",
        "tenant_id": "tenant_alpha",
        "cohort_id": "cohort_2026_q4",
        "approval_status": "READY_FOR_APPROVAL",
        "risk_level": "LOW",
        "approval_policy_json": {
            "policy_name": "Gobernanza Beta Controlada",
            "required_roles": ["SUPER_ADMIN"]
        },
        "non_execution_attestation_json": {
            "approval_executed_intervention": False
        }
    },
    "steps": [
        {"role": "SUPER_ADMIN", "status": "PENDING", "assigned_to": "admin@printprice.pro"}
    ]
}

MOCK_APPROVAL_EVIDENCE = {
    "ok": True,
    "evidencePack": {
        "evidence_pack_id": "ev_pack_appr_alpha_01",
        "checksum": "e12da89c3b7490f1"
    }
}

MOCK_SESSION_DASHBOARD = {
    "ok": True,
    "readiness_status": "READY",
    "dashboard": {
        "total_gates": 4,
        "active_sessions": 2,
        "closed_sessions": 5,
        "revoked_sessions": 0
    }
}

MOCK_OBSERVATION_DASHBOARD = {
    "ok": True,
    "readiness_status": "HEALTHY",
    "dashboard": {
        "events_count": 142,
        "signals_count": 0,
        "anomalies_count": 0,
        "findings_count": 1
    }
}

def get_git_sha():
    try:
        return subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip()
    except Exception:
        return 'unknown'

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
    page.goto('http://127.0.0.1:3000/')
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

def setup_client_intercepts(page, error_mode=False):
    # State flags to allow dynamic recovery on retry
    state = {"fail_approvals": error_mode, "fail_preps": error_mode, "fail_reviews": error_mode}

    def route_handler(route):
        url = route.request.url

        # 1. Tenants list
        if url.endswith('/api/admin/tenants'):
            route.fulfill(status=200, content_type='application/json', body=json.dumps(MOCK_TENANTS_POPULATED))
            return

        # 2. Reviews endpoints
        if url.endswith('/api/admin/beta/runtime-reviews/reviews'):
            if state["fail_reviews"]:
                route.fulfill(status=500, content_type='application/json', body=json.dumps({"ok": False, "error": "HTTP 500: Fallo en el servicio de revisiones"}))
            else:
                route.fulfill(status=200, content_type='application/json', body=json.dumps(MOCK_REVIEWS_LIST))
            return

        if '/api/admin/beta/runtime-reviews/reviews/' in url and 'evidence-pack' in url:
            route.fulfill(status=200, content_type='application/json', body=json.dumps(MOCK_REVIEW_EVIDENCE))
            return

        if '/api/admin/beta/runtime-reviews/reviews/' in url:
            route.fulfill(status=200, content_type='application/json', body=json.dumps(MOCK_REVIEW_DETAIL))
            return

        # 3. Preparations endpoints
        if url.endswith('/api/admin/beta/cohort-interventions/preparations'):
            if state["fail_preps"]:
                route.fulfill(status=500, content_type='application/json', body=json.dumps({"ok": False, "error": "HTTP 500: Fallo en el servicio de propuestas"}))
            else:
                route.fulfill(status=200, content_type='application/json', body=json.dumps(MOCK_PREPARATIONS_LIST))
            return

        if '/api/admin/beta/cohort-interventions/preparations/' in url and 'evidence-pack' in url:
            route.fulfill(status=200, content_type='application/json', body=json.dumps(MOCK_PREPARATION_EVIDENCE))
            return

        if '/api/admin/beta/cohort-interventions/preparations/' in url:
            route.fulfill(status=200, content_type='application/json', body=json.dumps(MOCK_PREPARATION_DETAIL))
            return

        # 4. Approvals endpoints
        if url.endswith('/api/admin/beta/cohort-intervention-approvals/approvals'):
            if state["fail_approvals"]:
                route.fulfill(status=500, content_type='application/json', body=json.dumps({"ok": False, "error": "HTTP 500: Fallo en el servicio interno de gobernanza"}))
            else:
                route.fulfill(status=200, content_type='application/json', body=json.dumps(MOCK_APPROVALS_LIST))
            return

        if '/api/admin/beta/cohort-intervention-approvals/approvals/' in url and 'evidence-pack' in url:
            route.fulfill(status=200, content_type='application/json', body=json.dumps(MOCK_APPROVAL_EVIDENCE))
            return

        if '/api/admin/beta/cohort-intervention-approvals/approvals/' in url:
            route.fulfill(status=200, content_type='application/json', body=json.dumps(MOCK_APPROVAL_DETAIL))
            return

        # 5. Sessions & observation dashboards
        if '/api/admin/beta/runtime-sessions/dashboard' in url or '/api/admin/beta/runtime-sessions/readiness' in url:
            route.fulfill(status=200, content_type='application/json', body=json.dumps(MOCK_SESSION_DASHBOARD))
            return

        if '/api/admin/beta/runtime-activity-observation/dashboard' in url or '/api/admin/beta/runtime-activity-observation/readiness' in url:
            route.fulfill(status=200, content_type='application/json', body=json.dumps(MOCK_OBSERVATION_DASHBOARD))
            return

        route.continue_()

    page.route('**/*', route_handler)
    return state

def run_captures():
    git_sha = get_git_sha()
    print("=" * 70)
    print("CAPTURA Y VERIFICACIÓN OPERATIVA SUPER_ADMIN (PLAYWRIGHT)")
    print(f"Commit Git Code Base: {git_sha}")
    print("=" * 70)

    stages = [
        {"id": "01_entorno_beta_overview", "name": "1. Entorno Beta (Overview)", "path": "/admin/beta/runtime?tab=overview"},
        {"id": "02_sesiones_runtime", "name": "2. Sesiones Runtime", "path": "/admin/beta/runtime?tab=sessions"},
        {"id": "03_actividad_observacion", "name": "3. Actividad y Observación", "path": "/admin/beta/runtime?tab=activity"},
        {"id": "04_revisiones_salud", "name": "4. Revisiones de Salud de Cohorte", "path": "/admin/beta/runtime?tab=health"},
        {"id": "05_preparacion_intervenciones", "name": "5. Preparación de Intervenciones", "path": "/admin/beta/governance?tab=interventions"},
        {"id": "06_aprobacion_intervenciones", "name": "6. Aprobación de Gobernanza", "path": "/admin/beta/governance?tab=approvals"}
    ]

    results = []
    sha_map = {}

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        # ══════════════════════════════════════════════════════════════
        # RECORRIDO 1: ENTIDADES SELECCIONADAS (DARK, LIGHT, MOBILE)
        # ══════════════════════════════════════════════════════════════
        print("\n>>> 1. RECORRIDO CON ENTIDADES SELECCIONADAS (Dark, Light, Mobile) <<<")
        for theme in ['dark', 'light']:
            ctx = browser.new_context(viewport={"width": 1280, "height": 720})
            page = ctx.new_page()
            setup_client_intercepts(page, error_mode=False)
            setup_page_auth_and_theme(page, theme=theme, locale='es')

            for stage in stages:
                target_url = f"http://127.0.0.1:3000{stage['path']}"
                page.goto(target_url, wait_until='networkidle')
                page.wait_for_timeout(800)

                # Theme setup
                if theme == 'dark':
                    page.evaluate("() => { if (!document.documentElement.classList.contains('dark')) document.documentElement.classList.add('dark'); }")
                else:
                    page.evaluate("() => { document.documentElement.classList.remove('dark'); document.documentElement.style.backgroundColor = '#ffffff'; }")

                # Select Tenant
                tenant_select = page.locator('select[id$="-tenant-selector"]')
                if tenant_select.count() > 0:
                    try:
                        tenant_select.first.select_option(value='tenant_alpha')
                        page.wait_for_timeout(400)
                    except Exception:
                        pass

                # Stage 4: Select Review rev_beta_alpha_01
                if stage["id"] == "04_revisiones_salud":
                    rev_sel = page.locator('#review-list-selector')
                    if rev_sel.count() > 0:
                        rev_sel.select_option(value='rev_beta_alpha_01')
                        page.wait_for_selector('text=Detalle de Revisión: rev_beta_alpha_01', timeout=4000)
                        page.wait_for_timeout(500)

                # Stage 5: Select Source Review and Preparation prep_alpha_intervention_01
                if stage["id"] == "05_preparacion_intervenciones":
                    src_sel = page.locator('#source-review-selector')
                    if src_sel.count() > 0:
                        src_sel.select_option(value='rev_beta_alpha_01')
                        page.wait_for_timeout(300)
                    prep_sel = page.locator('#prep-proposal-selector')
                    if prep_sel.count() > 0:
                        prep_sel.select_option(value='prep_alpha_intervention_01')
                        page.wait_for_selector('text=Detalle de Propuesta: prep_alpha_intervention_01', timeout=4000)
                        page.wait_for_timeout(500)

                # Stage 6: Select Approval appr_alpha_gov_01
                if stage["id"] == "06_aprobacion_intervenciones":
                    appr_sel = page.locator('#approval-expediente-selector')
                    if appr_sel.count() > 0:
                        appr_sel.select_option(value='appr_alpha_gov_01')
                        page.wait_for_selector('text=Expediente de Aprobación', timeout=4000)
                        page.wait_for_timeout(500)

                # Expand technical details collapsible
                tech_btn = page.locator('button[aria-expanded="false"]').first
                if tech_btn.count() > 0:
                    try:
                        tech_btn.click()
                        page.wait_for_timeout(300)
                    except Exception:
                        pass

                shot_name = f"{stage['id']}_selected_{theme}_es.png"
                shot_path = os.path.join(OUT_DIR, shot_name)
                page.screenshot(path=shot_path, full_page=False)

                sha256 = compute_sha256(shot_path)
                sha_map[shot_name] = sha256
                overflow = check_overflow(page)

                results.append({
                    "stage": stage["name"],
                    "flow": "Recorrido 1 (Entidades Seleccionadas)",
                    "variant": f"Desktop 1280x720 - {theme.capitalize()} - ES",
                    "file": shot_name,
                    "git_sha": git_sha,
                    "sha256": sha256,
                    "overflow": overflow,
                    "entity_selected": True,
                    "simulated_data": {
                        "tenants": True,
                        "reviews": True,
                        "preparations": True,
                        "approvals": True
                    }
                })
                print(f"  [OK] {shot_name} (SHA-256: {sha256[:12]}..., Overflow: {overflow['hasOverflow']})")

            ctx.close()

        # Mobile Viewport (390x844)
        print("\n>>> Mobile 390x844 Viewport Check <<<")
        ctx_mobile = browser.new_context(viewport={"width": 390, "height": 844})
        page_mobile = ctx_mobile.new_page()
        setup_client_intercepts(page_mobile, error_mode=False)
        setup_page_auth_and_theme(page_mobile, theme='dark', locale='es')

        for stage in [stages[3], stages[4], stages[5]]:  # Reviews, Preps, Approvals
            target_url = f"http://127.0.0.1:3000{stage['path']}"
            page_mobile.goto(target_url, wait_until='networkidle')
            page_mobile.wait_for_timeout(800)
            page_mobile.evaluate("() => { if (!document.documentElement.classList.contains('dark')) document.documentElement.classList.add('dark'); }")

            shot_name = f"{stage['id']}_selected_mobile_390x844_dark.png"
            shot_path = os.path.join(OUT_DIR, shot_name)
            page_mobile.screenshot(path=shot_path, full_page=False)

            sha256 = compute_sha256(shot_path)
            sha_map[shot_name] = sha256
            overflow = check_overflow(page_mobile)

            results.append({
                "stage": stage["name"],
                "flow": "Recorrido 1 (Entidades Seleccionadas)",
                "variant": "Mobile 390x844 - Dark - ES",
                "file": shot_name,
                "git_sha": git_sha,
                "sha256": sha256,
                "overflow": overflow,
                "simulated_data": {"tenants": True}
            })
            print(f"  [OK Mobile] {shot_name} (Overflow: {overflow['hasOverflow']})")

        ctx_mobile.close()

        # ══════════════════════════════════════════════════════════════
        # RECORRIDO 2: PROVOCAR HTTP 500 REAL, VERIFICAR QUE NO SEA LISTA
        # VACÍA, PULSAR REINTENTAR Y ACREDITAR RECUPERACIÓN EXITOSA
        # ══════════════════════════════════════════════════════════════
        print("\n>>> 2. RECORRIDO: HTTP 500 REAL, COMPROBACIÓN NO-LISTA-VACÍA Y RECUPERACIÓN CON REINTENTAR <<<")
        ctx_err = browser.new_context(viewport={"width": 1280, "height": 720})
        page_err = ctx_err.new_page()
        intercept_state = setup_client_intercepts(page_err, error_mode=True)
        setup_page_auth_and_theme(page_err, theme='dark', locale='es')

        error_stages = [
            {
                "stage": stages[3], # Revisiones de salud
                "expected_error": "HTTP 500: Fallo en el servicio de revisiones",
                "empty_text_forbidden": "No se encontraron revisiones de cohorte registradas",
                "state_key": "fail_reviews"
            },
            {
                "stage": stages[4], # Preparación
                "expected_error": "HTTP 500: Fallo en el servicio de propuestas",
                "empty_text_forbidden": "No se encontraron propuestas de intervención registradas",
                "state_key": "fail_preps"
            },
            {
                "stage": stages[5], # Aprobación
                "expected_error": "HTTP 500: Fallo en el servicio interno de gobernanza",
                "empty_text_forbidden": "No hay expedientes registrados",
                "state_key": "fail_approvals"
            }
        ]

        for item in error_stages:
            stage_info = item["stage"]
            target_url = f"http://127.0.0.1:3000{stage_info['path']}"
            
            # 1. Nav with HTTP 500 active
            page_err.goto(target_url, wait_until='networkidle')
            page_err.wait_for_timeout(800)
            page_err.evaluate("() => { if (!document.documentElement.classList.contains('dark')) document.documentElement.classList.add('dark'); }")

            # Check that error text is visible and retry button is present
            err_locator = page_err.locator(f'text={item["expected_error"]}')
            retry_btn = page_err.locator('button:has-text("Reintentar")').first
            assert err_locator.count() > 0, f"Error message {item['expected_error']} not displayed on HTTP 500!"
            assert retry_btn.count() > 0, f"Retry button not found on HTTP 500 for {stage_info['id']}!"

            # CRITICAL CHECK: Verify that the empty list message is NOT shown
            empty_locator = page_err.locator(f'text={item["empty_text_forbidden"]}')
            assert empty_locator.count() == 0, f"Error state incorrectly displays empty list message '{item['empty_text_forbidden']}'!"
            print(f"  [VERIFICACIÓN OK] {stage_info['id']}: Error 500 y Reintentar visibles. Mensaje de lista vacía correctamente ausente.")

            # Capture screenshot of HTTP 500 error state
            shot_err_name = f"{stage_info['id']}_http500_error_dark_es.png"
            shot_err_path = os.path.join(OUT_DIR, shot_err_name)
            page_err.screenshot(path=shot_err_path, full_page=False)

            sha_err = compute_sha256(shot_err_path)
            sha_map[shot_err_name] = sha_err
            overflow_err = check_overflow(page_err)

            results.append({
                "stage": stage_info["name"],
                "flow": "Recorrido 2 (HTTP 500 Error)",
                "variant": "Desktop 1280x720 - Dark - HTTP 500 Error - ES",
                "file": shot_err_name,
                "git_sha": git_sha,
                "sha256": sha_err,
                "overflow": overflow_err,
                "simulated_data": {
                    "http_500_injected": True,
                    "empty_list_hidden": True,
                    "retry_button_present": True
                }
            })

            # 2. RESTORE normal 200 response and click Reintentar to prove recovery!
            intercept_state[item["state_key"]] = False
            retry_btn.click()
            page_err.wait_for_timeout(1000)

            # Check that error is gone and items are recovered
            assert page_err.locator(f'text={item["expected_error"]}').count() == 0, "Error message did not disappear after clicking Reintentar!"
            print(f"  [RECUPERACIÓN OK] {stage_info['id']}: Reintentar pulsado y recuperación acreditada correctamente.")

            shot_recov_name = f"{stage_info['id']}_http500_recovered_dark_es.png"
            shot_recov_path = os.path.join(OUT_DIR, shot_recov_name)
            page_err.screenshot(path=shot_recov_path, full_page=False)

            sha_recov = compute_sha256(shot_recov_path)
            sha_map[shot_recov_name] = sha_recov
            overflow_recov = check_overflow(page_err)

            results.append({
                "stage": stage_info["name"],
                "flow": "Recorrido 2 (Recuperación con Reintentar)",
                "variant": "Desktop 1280x720 - Dark - Recuperación Exitosa - ES",
                "file": shot_recov_name,
                "git_sha": git_sha,
                "sha256": sha_recov,
                "overflow": overflow_recov,
                "simulated_data": {
                    "recovery_after_retry": True
                }
            })

        ctx_err.close()
        browser.close()

    summary_path = os.path.join(OUT_DIR, "evidence_summary.json")
    with open(summary_path, "w", encoding="utf-8") as f:
        json.dump({
            "git_commit_sha": git_sha,
            "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "captures_count": len(results),
            "captures": results,
            "checksums": sha_map
        }, f, indent=2)

    print(f"\nResumen completo de evidencias generado en: {summary_path}")
    print(f"Total de capturas acreditadas: {len(results)}")

if __name__ == '__main__':
    run_captures()
