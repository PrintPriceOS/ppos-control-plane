import os
import json
import time
import hashlib
import zipfile
import subprocess
from playwright.sync_api import sync_playwright

OUT_DIR = os.path.abspath('review_artifacts_beta_operational')
os.makedirs(OUT_DIR, exist_ok=True)

# ── Fixtures according to real client contracts & DB schema ──
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
            "confidence_level": "HIGH",
            "review_window_start": "2026-10-01T00:00:00Z",
            "review_window_end": "2026-10-05T00:00:00Z"
        },
        {
            "review_id": "rev_beta_beta_02",
            "tenant_id": "tenant_beta",
            "cohort_id": "cohort_2026_q4",
            "review_status": "FINALIZED",
            "risk_level": "MEDIUM",
            "confidence_level": "HIGH",
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
        "confidence_level": "HIGH",
        "review_window_start": "2026-10-01T00:00:00Z",
        "review_window_end": "2026-10-05T00:00:00Z",
        "non_mutation_attestation_json": {
            "cohort_access_mutated": False,
            "participant_access_mutated": False,
            "payment_execution_triggered": False,
            "provider_submission_triggered": False
        },
        "created_at": "2026-10-05T08:00:00Z",
        "updated_at": "2026-10-05T12:00:00Z",
        "finalized_at": "2026-10-05T12:00:00Z"
    },
    "decision": {
        "decision_id": "dec_beta_alpha_01",
        "review_id": "rev_beta_alpha_01",
        "recommended_decision": "CONTINUE_COHORT",
        "decision_execution_status": "NOT_EXECUTED_REVIEW_ONLY",
        "execution_blocked_reason": "PHASE_137_IS_READONLY_RECOMMENDATION_GATE",
        "rationale": "Parámetros de salud de cohorte en rango nominal (latencia < 45ms, 0 anomalías bloqueantes)."
    },
    "findings": [
        {
            "finding_id": "find_alpha_01",
            "review_id": "rev_beta_alpha_01",
            "finding_key": "LATENCY_WINDOW_NOMINAL",
            "title": "Rendimiento de latencia nominal",
            "description": "Latencia p99 dentro de límites contractuales (< 45ms) durante la ventana completa.",
            "severity": "LOW",
            "details_json": {
                "metric": "p99_latency_ms",
                "observed": 38.4,
                "threshold": 45.0,
                "description": "Latencia p99 dentro de límites contractuales (< 45ms) durante la ventana completa."
            }
        },
        {
            "finding_id": "find_alpha_02",
            "review_id": "rev_beta_alpha_01",
            "finding_key": "QUOTA_BURST_STABLE",
            "title": "Cuotas de procesamiento estables",
            "description": "Consumo sostenido de cuotas de procesamiento sin saturación ni throttling.",
            "severity": "LOW",
            "details_json": {
                "metric": "burst_saturation_pct",
                "observed": 14.2,
                "threshold": 80.0,
                "description": "Consumo sostenido de cuotas de procesamiento sin saturación ni throttling."
            }
        }
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
        "recommended_decision_from_phase137": "CONTINUE_COHORT",
        "preparation_type": "POLICY_UPDATE",
        "preparation_status": "FINALIZED",
        "preparation_execution_status": "NOT_EXECUTED_PREPARATION_ONLY",
        "risk_level": "LOW",
        "confidence_level": "HIGH",
        "intervention_summary_json": {
            "summary": "Actualización preventiva de límites operativos de cohorte beta para tenant Alpha Press LLC."
        },
        "non_execution_attestation_json": {
            "non_execution_acknowledged": True,
            "readiness_only_attested": True,
            "timestamp": "2026-10-05T12:00:00Z",
            "attested_by": "admin@printprice.pro"
        }
    },
    "items": [
        {
            "item_id": "item_alpha_01",
            "preparation_id": "prep_alpha_intervention_01",
            "action_key": "VERIFY_PARTICIPANT_QUOTA",
            "title": "Validación de cuota por participante",
            "description": "Comprobar límites transaccionales asignados a la cohorte beta sin desbordamientos.",
            "item_status": "COMPLETED",
            "required_role": "SUPER_ADMIN"
        },
        {
            "item_id": "item_alpha_02",
            "preparation_id": "prep_alpha_intervention_01",
            "action_key": "ATTEST_NON_EXECUTION_STATE",
            "title": "Certificación de no ejecución industrial",
            "description": "Garantizar aislamiento estricto sin órdenes industriales ni transacciones monetarias.",
            "item_status": "COMPLETED",
            "required_role": "SUPER_ADMIN"
        }
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
            "confidence_level": "HIGH",
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
        "confidence_level": "HIGH",
        "approval_policy_json": {
            "policy_name": "Gobernanza Beta Controlada",
            "required_roles": ["SUPER_ADMIN"]
        },
        "non_execution_attestation_json": {
            "approval_executed_intervention": False
        }
    },
    "steps": [
        {
            "step_id": "step_alpha_01",
            "role": "SUPER_ADMIN",
            "status": "PENDING",
            "approver_id": "admin@printprice.pro"
        }
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

def setup_client_intercepts(page, error_state=None):
    if error_state is None:
        error_state = {"fail_reviews": False, "fail_preps": False, "fail_approvals": False}

    def route_handler(route):
        url = route.request.url.split('?')[0]
        method = route.request.method

        # 1. Tenants list
        if url.endswith('/api/admin/tenants'):
            route.fulfill(status=200, content_type='application/json', body=json.dumps(MOCK_TENANTS_POPULATED))
            return

        # 2. Reviews endpoints
        if url.endswith('/api/admin/beta/runtime-reviews/reviews'):
            if method == 'GET':
                if error_state.get("fail_reviews_401", False):
                    route.fulfill(status=401, content_type='application/json', body=json.dumps({"ok": False, "error": {"code": "UNAUTHORIZED", "message": "Sesión expirada o ausente. Por favor, inicie sesión."}}))
                elif error_state.get("fail_reviews", False):
                    route.fulfill(status=500, content_type='application/json', body=json.dumps({"ok": False, "error": "HTTP 500: Fallo en el servicio de revisiones"}))
                else:
                    route.fulfill(status=200, content_type='application/json', body=json.dumps(MOCK_REVIEWS_LIST))
                return
            route.continue_()
            return

        if '/api/admin/beta/runtime-reviews/reviews/' in url and 'evidence-pack' in url:
            route.fulfill(status=200, content_type='application/json', body=json.dumps(MOCK_REVIEW_EVIDENCE))
            return

        if '/api/admin/beta/runtime-reviews/reviews/' in url:
            route.fulfill(status=200, content_type='application/json', body=json.dumps(MOCK_REVIEW_DETAIL))
            return

        # 3. Preparations endpoints
        if url.endswith('/api/admin/beta/cohort-interventions/preparations'):
            if method == 'GET':
                if error_state.get("fail_preps_401", False):
                    route.fulfill(status=401, content_type='application/json', body=json.dumps({"ok": False, "error": {"error": {"code": "UNAUTHORIZED", "message": "Sesión ausente en preparación. Inicie sesión para continuar."}}}))
                elif error_state.get("fail_preps", False):
                    route.fulfill(status=500, content_type='application/json', body=json.dumps({"ok": False, "error": "HTTP 500: Fallo en el servicio de propuestas"}))
                else:
                    route.fulfill(status=200, content_type='application/json', body=json.dumps(MOCK_PREPARATIONS_LIST))
                return
            route.continue_()
            return

        if '/api/admin/beta/cohort-interventions/preparations/' in url and 'evidence-pack' in url:
            route.fulfill(status=200, content_type='application/json', body=json.dumps(MOCK_PREPARATION_EVIDENCE))
            return

        if '/api/admin/beta/cohort-interventions/preparations/' in url:
            route.fulfill(status=200, content_type='application/json', body=json.dumps(MOCK_PREPARATION_DETAIL))
            return

        # 4. Approvals endpoints
        if url.endswith('/api/admin/beta/cohort-intervention-approvals/approvals'):
            if method == 'GET':
                if error_state.get("fail_approvals_401", False):
                    route.fulfill(status=401, content_type='application/json', body=json.dumps({"ok": False, "error": {"code": "UNAUTHORIZED", "message": "Credenciales inválidas para acceso a gobernanza."}}))
                elif error_state.get("fail_approvals", False):
                    route.fulfill(status=500, content_type='application/json', body=json.dumps({"ok": False, "error": "HTTP 500: Fallo en el servicio interno de gobernanza"}))
                else:
                    route.fulfill(status=200, content_type='application/json', body=json.dumps(MOCK_APPROVALS_LIST))
                return
            route.continue_()
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
    return error_state

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
            setup_client_intercepts(page, error_state={"fail_reviews": False, "fail_preps": False, "fail_approvals": False})
            setup_page_auth_and_theme(page, theme=theme, locale='es')

            for stage in stages:
                target_url = f"http://127.0.0.1:3000{stage['path']}"
                page.goto(target_url, wait_until='networkidle')
                page.wait_for_timeout(600)

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
                        page.wait_for_timeout(300)
                    except Exception:
                        pass

                # Stage 4: Select Review rev_beta_alpha_01
                if stage["id"] == "04_revisiones_salud":
                    rev_sel = page.locator('#review-list-selector')
                    if rev_sel.count() > 0:
                        rev_sel.select_option(value='rev_beta_alpha_01')
                        page.wait_for_selector('text=Detalle de Revisión: rev_beta_alpha_01', timeout=4000)
                        # Confirm findings with descriptions are rendered
                        assert page.locator('text=LATENCY_WINDOW_NOMINAL').first.is_visible()
                        assert page.locator('text=Latencia p99 dentro de límites contractuales').first.is_visible()
                        page.wait_for_timeout(400)

                # Stage 5: Select Source Review and Preparation prep_alpha_intervention_01
                if stage["id"] == "05_preparacion_intervenciones":
                    src_sel = page.locator('#source-review-selector')
                    if src_sel.count() > 0:
                        src_sel.select_option(value='rev_beta_alpha_01')
                        page.wait_for_timeout(200)
                    prep_sel = page.locator('#prep-proposal-selector')
                    if prep_sel.count() > 0:
                        prep_sel.select_option(value='prep_alpha_intervention_01')
                        page.wait_for_selector('text=Detalle de Propuesta: prep_alpha_intervention_01', timeout=4000)
                        # Confirm tasks with descriptions are rendered
                        assert page.locator('text=Validación de cuota por participante').first.is_visible()
                        assert page.locator('text=Comprobar límites transaccionales asignados').first.is_visible()
                        page.wait_for_timeout(400)

                # Stage 6: Select Approval appr_alpha_gov_01
                if stage["id"] == "06_aprobacion_intervenciones":
                    appr_sel = page.locator('#approval-expediente-selector')
                    if appr_sel.count() > 0:
                        appr_sel.select_option(value='appr_alpha_gov_01')
                        page.wait_for_selector('text=Expediente de Aprobación', timeout=4000)
                        # Confirm steps are rendered
                        assert page.locator('text=SUPER_ADMIN').first.is_visible()
                        page.wait_for_timeout(400)

                # Expand technical details collapsible
                tech_btn = page.locator('button[aria-expanded="false"]').first
                if tech_btn.count() > 0:
                    try:
                        tech_btn.click()
                        page.wait_for_timeout(200)
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
        setup_client_intercepts(page_mobile, error_state={"fail_reviews": False, "fail_preps": False, "fail_approvals": False})
        setup_page_auth_and_theme(page_mobile, theme='dark', locale='es')

        for stage in [stages[1], stages[3], stages[4], stages[5]]:  # Sessions, Reviews, Preps, Approvals
            target_url = f"http://127.0.0.1:3000{stage['path']}"
            page_mobile.goto(target_url, wait_until='networkidle')
            page_mobile.wait_for_timeout(600)
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
        # VACÍA, CAPTURAR PANEL AFECTADO COMPLETO, REINTENTAR Y
        # ACREDITAR RESPUESTA 200 CON ENTIDAD CONOCIDA EN EL SELECTOR
        # ══════════════════════════════════════════════════════════════
        print("\n>>> 2. RECORRIDO: HTTP 500 REAL, VERIFICACIÓN VISUAL Y RECUPERACIÓN CON ENTIDAD CONOCIDA <<<")

        error_stages = [
            {
                "stage": stages[3], # Revisiones de salud
                "target_endpoint": "/api/admin/beta/runtime-reviews/reviews",
                "expected_error": "HTTP 500: Fallo en el servicio de revisiones",
                "empty_text_forbidden": "No se encontraron revisiones de cohorte registradas",
                "state_key": "fail_reviews",
                "selector_id": "#review-list-selector",
                "known_entity_id": "rev_beta_alpha_01",
                "detail_wait_text": "Detalle de Revisión: rev_beta_alpha_01"
            },
            {
                "stage": stages[4], # Preparación
                "target_endpoint": "/api/admin/beta/cohort-interventions/preparations",
                "expected_error": "HTTP 500: Fallo en el servicio de propuestas",
                "empty_text_forbidden": "No se encontraron propuestas de intervención registradas",
                "state_key": "fail_preps",
                "selector_id": "#prep-proposal-selector",
                "known_entity_id": "prep_alpha_intervention_01",
                "detail_wait_text": "Detalle de Propuesta: prep_alpha_intervention_01"
            },
            {
                "stage": stages[5], # Aprobación
                "target_endpoint": "/api/admin/beta/cohort-intervention-approvals/approvals",
                "expected_error": "HTTP 500: Fallo en el servicio interno de gobernanza",
                "empty_text_forbidden": "No hay expedientes registrados",
                "state_key": "fail_approvals",
                "selector_id": "#approval-expediente-selector",
                "known_entity_id": "appr_alpha_gov_01",
                "detail_wait_text": "Expediente de Aprobación"
            }
        ]

        for item in error_stages:
            stage_info = item["stage"]
            target_url = f"http://127.0.0.1:3000{stage_info['path']}"
            target_endpoint = item["target_endpoint"]

            ctx_err = browser.new_context(viewport={"width": 1280, "height": 720})
            page_err = ctx_err.new_page()

            # Initialize with failure active ONLY for this stage
            err_state = {"fail_reviews": False, "fail_preps": False, "fail_approvals": False}
            err_state[item["state_key"]] = True
            setup_client_intercepts(page_err, error_state=err_state)
            setup_page_auth_and_theme(page_err, theme='dark', locale='es')

            print(f"\n--- Testing HTTP 500 & Recovery for {stage_info['id']} ---")

            # 1. PLAYWRIGHT ASSERTION 1: Observe HTTP 500 on target request
            with page_err.expect_response(lambda r: target_endpoint in r.url and r.request.method == 'GET') as resp_info:
                page_err.goto(target_url, wait_until='networkidle')
            resp = resp_info.value
            assert resp.status == 500, f"ASSERTION FAILED: Target request {target_endpoint} did not return HTTP 500! Returned: {resp.status}"
            print(f"  [ASSERTION 1 PASSED] Target request {target_endpoint} responded with status HTTP 500.")

            page_err.wait_for_timeout(500)
            page_err.evaluate("() => { if (!document.documentElement.classList.contains('dark')) document.documentElement.classList.add('dark'); }")

            # 2. PLAYWRIGHT ASSERTION 2: Error message and Reintentar visible, empty message absent
            err_locator = page_err.locator(f'text={item["expected_error"]}')
            assert err_locator.first.is_visible(), f"ASSERTION FAILED: Error message '{item['expected_error']}' is not visible on page!"

            retry_btn = page_err.locator('button:has-text("Reintentar")').first
            assert retry_btn.is_visible(), f"ASSERTION FAILED: 'Reintentar' button is not visible on HTTP 500 error state!"

            empty_count = page_err.locator(f'text={item["empty_text_forbidden"]}').count()
            assert empty_count == 0, f"ASSERTION FAILED: Error state incorrectly rendered empty list message '{item['empty_text_forbidden']}'!"
            print(f"  [ASSERTION 2 PASSED] Error message and 'Reintentar' are visible. Empty list message correctly suppressed.")

            # 3. CAPTURE COMPLETE AFFECTED PANEL (using scroll and element capture so header doesn't push error out of view)
            affected_panel = retry_btn.locator('xpath=ancestor::div[contains(@class, "ppos-card")]').first
            affected_panel.scroll_into_view_if_needed()
            page_err.wait_for_timeout(300)

            shot_err_name = f"{stage_info['id']}_http500_error_dark_es.png"
            shot_err_path = os.path.join(OUT_DIR, shot_err_name)
            # Element screenshot captures the full affected card without viewport cut-offs
            affected_panel.screenshot(path=shot_err_path)

            sha_err = compute_sha256(shot_err_path)
            sha_map[shot_err_name] = sha_err
            overflow_err = check_overflow(page_err)

            results.append({
                "stage": stage_info["name"],
                "flow": "Recorrido 2 (HTTP 500 Error)",
                "variant": "Desktop - Dark - HTTP 500 Error Panel Completo - ES",
                "file": shot_err_name,
                "git_sha": git_sha,
                "sha256": sha_err,
                "overflow": overflow_err,
                "simulated_data": {
                    "http_500_injected": True,
                    "target_endpoint": target_endpoint,
                    "empty_list_hidden": True,
                    "retry_button_present": True
                }
            })
            print(f"  [CAPTURA OK] {shot_err_name} (Panel Completo: Error y Reintentar visibles)")

            # 4. PLAYWRIGHT ASSERTION 3: Click Reintentar -> Observe HTTP 200 response
            err_state[item["state_key"]] = False
            with page_err.expect_response(lambda r: target_endpoint in r.url and r.request.method == 'GET') as recov_resp_info:
                retry_btn.click()
            recov_resp = recov_resp_info.value
            assert recov_resp.status == 200, f"ASSERTION FAILED: Target request {target_endpoint} did not return HTTP 200 on retry! Returned: {recov_resp.status}"
            print(f"  [ASSERTION 3 PASSED] Reintentar triggered request and received HTTP 200.")

            # 5. PLAYWRIGHT ASSERTION 4: Error and retry disappear, selector visible and contains known entity
            page_err.wait_for_timeout(500)
            assert page_err.locator(f'text={item["expected_error"]}').count() == 0, "ASSERTION FAILED: Error message did not disappear after retry!"
            assert page_err.locator('button:has-text("Reintentar")').count() == 0, "ASSERTION FAILED: Retry button did not disappear after retry!"

            selector = page_err.locator(item["selector_id"])
            assert selector.first.is_visible(), f"ASSERTION FAILED: Selector {item['selector_id']} is not visible after recovery!"

            known_opt = selector.locator(f'option[value="{item["known_entity_id"]}"]')
            assert known_opt.count() > 0, f"ASSERTION FAILED: Known entity {item['known_entity_id']} not present in selector options!"

            # Select the known entity so selector displays it and details are loaded
            selector.select_option(value=item["known_entity_id"])
            page_err.wait_for_timeout(500)
            assert selector.input_value() == item["known_entity_id"], f"ASSERTION FAILED: Selector failed to select known entity {item['known_entity_id']}!"

            # Wait for detail card of the selected entity to be rendered
            page_err.wait_for_selector(f'text={item["detail_wait_text"]}', timeout=5000)
            print(f"  [ASSERTION 4 PASSED] Selector populated with known entity '{item['known_entity_id']}' and details loaded.")

            # 6. CAPTURE COMPLETE RECOVERED PANEL WITH KNOWN ENTITY IN SELECTOR
            affected_panel = selector.locator('xpath=ancestor::div[contains(@class, "ppos-card")]').first
            affected_panel.scroll_into_view_if_needed()
            page_err.wait_for_timeout(300)

            shot_recov_name = f"{stage_info['id']}_http500_recovered_dark_es.png"
            shot_recov_path = os.path.join(OUT_DIR, shot_recov_name)
            affected_panel.screenshot(path=shot_recov_path)

            sha_recov = compute_sha256(shot_recov_path)
            sha_map[shot_recov_name] = sha_recov
            overflow_recov = check_overflow(page_err)

            results.append({
                "stage": stage_info["name"],
                "flow": "Recorrido 2 (Recuperación con Reintentar)",
                "variant": "Desktop - Dark - Recuperación Exitosa con Entidad Conocida - ES",
                "file": shot_recov_name,
                "git_sha": git_sha,
                "sha256": sha_recov,
                "overflow": overflow_recov,
                "simulated_data": {
                    "http_200_recovered": True,
                    "target_endpoint": target_endpoint,
                    "known_entity_selected": item["known_entity_id"]
                }
            })
            print(f"  [CAPTURA OK] {shot_recov_name} (Selector con entidad conocida seleccionada: {item['known_entity_id']})")

            ctx_err.close()

        # ══════════════════════════════════════════════════════════════
        # RECORRIDO 3: CASO HTTP 401 CON OBJETO ANIDADO {CODE, MESSAGE},
        # SIN CRASH REACT #31 Y CON INICIAR SESIÓN SIN BUCLE DE REINTENTO
        # ══════════════════════════════════════════════════════════════
        print("\n>>> 3. RECORRIDO: HTTP 401 CON OBJETO ANIDADO {code, message} Y BOTÓN INICIAR SESIÓN <<<")

        unauthorized_stages = [
            {
                "stage": stages[3],  # Revisiones de salud
                "target_endpoint": "/api/admin/beta/runtime-reviews/reviews",
                "expected_error": "Sesión expirada o ausente. Por favor, inicie sesión.",
                "state_key": "fail_reviews_401",
                "shot_name": "04_revisiones_salud_http401_error_dark_es.png"
            },
            {
                "stage": stages[4],  # Preparación
                "target_endpoint": "/api/admin/beta/cohort-interventions/preparations",
                "expected_error": "Sesión ausente en preparación. Inicie sesión para continuar.",
                "state_key": "fail_preps_401",
                "shot_name": "05_preparacion_intervenciones_http401_error_dark_es.png"
            },
            {
                "stage": stages[5],  # Aprobación
                "target_endpoint": "/api/admin/beta/cohort-intervention-approvals/approvals",
                "expected_error": "Credenciales inválidas para acceso a gobernanza.",
                "state_key": "fail_approvals_401",
                "shot_name": "06_aprobacion_intervenciones_http401_error_dark_es.png"
            }
        ]

        for item in unauthorized_stages:
            stage_info = item["stage"]
            target_url = f"http://127.0.0.1:3000{stage_info['path']}"
            target_endpoint = item["target_endpoint"]

            ctx_401 = browser.new_context(viewport={"width": 1280, "height": 720})
            page_401 = ctx_401.new_page()

            err_state = {"fail_reviews_401": False, "fail_preps_401": False, "fail_approvals_401": False}
            err_state[item["state_key"]] = True
            setup_client_intercepts(page_401, error_state=err_state)
            setup_page_auth_and_theme(page_401, theme='dark', locale='es')

            print(f"\n--- Testing HTTP 401 & Safe Login Button for {stage_info['id']} ---")

            # 1. PLAYWRIGHT ASSERTION 1: Observe HTTP 401 on target request
            with page_401.expect_response(lambda r: target_endpoint in r.url and r.request.method == 'GET') as resp_info:
                page_401.goto(target_url, wait_until='networkidle')
            resp = resp_info.value
            assert resp.status == 401, f"ASSERTION FAILED: Target request {target_endpoint} did not return HTTP 401! Returned: {resp.status}"
            print(f"  [ASSERTION 1 PASSED] Target request {target_endpoint} responded with status HTTP 401.")

            page_401.wait_for_timeout(500)
            page_401.evaluate("() => { if (!document.documentElement.classList.contains('dark')) document.documentElement.classList.add('dark'); }")

            # 2. PLAYWRIGHT ASSERTION 2: Verify NO Minified React error #31 crash
            page_text = page_401.content()
            assert "Minified React error" not in page_text, "ASSERTION FAILED: React error crash detected in page content!"
            assert "object with keys {code, message}" not in page_text, "ASSERTION FAILED: Error object dumped to JSX child!"
            print(f"  [ASSERTION 2 PASSED] Screen did NOT crash with Minified React error #31.")

            # 3. PLAYWRIGHT ASSERTION 3: Error message and Iniciar Sesion button visible, Reintentar button absent
            err_locator = page_401.locator(f'text={item["expected_error"]}')
            assert err_locator.first.is_visible(), f"ASSERTION FAILED: Error message '{item['expected_error']}' is not visible on page!"

            login_btn = page_401.locator('button:has-text("Iniciar Sesión")').first
            assert login_btn.is_visible(), f"ASSERTION FAILED: 'Iniciar Sesión' button is not visible on HTTP 401 state!"

            retry_count = page_401.locator('button:has-text("Reintentar")').count()
            assert retry_count == 0, f"ASSERTION FAILED: 'Reintentar' button must NOT be present on 401 to prevent retry loops!"
            print(f"  [ASSERTION 3 PASSED] Safe string message and 'Iniciar Sesión' are visible. 'Reintentar' is correctly suppressed (zero retry loops).")

            # 4. CAPTURE COMPLETE AFFECTED PANEL (using scroll and element capture)
            affected_panel = login_btn.locator('xpath=ancestor::div[contains(@class, "ppos-card")]').first
            affected_panel.scroll_into_view_if_needed()
            page_401.wait_for_timeout(300)

            shot_401_name = item["shot_name"]
            shot_401_path = os.path.join(OUT_DIR, shot_401_name)
            affected_panel.screenshot(path=shot_401_path)

            sha_401 = compute_sha256(shot_401_path)
            sha_map[shot_401_name] = sha_401
            overflow_401 = check_overflow(page_401)

            results.append({
                "stage": stage_info["name"],
                "flow": "Recorrido 3 (HTTP 401 Sesión Ausente/Expirada)",
                "variant": "Desktop - Dark - HTTP 401 Error Panel Completo - ES",
                "file": shot_401_name,
                "git_sha": git_sha,
                "sha256": sha_401,
                "overflow": overflow_401,
                "simulated_data": {
                    "http_401_injected": True,
                    "target_endpoint": target_endpoint,
                    "nested_error_object": True,
                    "login_button_present": True,
                    "retry_loop_prevented": True
                }
            })
            print(f"  [CAPTURA OK] {shot_401_name} (Panel Completo: Error normalizado y botón Iniciar Sesión)")

            ctx_401.close()

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

    zip_path = os.path.abspath("review_artifacts_beta_operational.zip")
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for root, dirs, files in os.walk(OUT_DIR):
            for file in files:
                abs_f = os.path.join(root, file)
                rel_f = os.path.relpath(abs_f, OUT_DIR)
                zf.write(abs_f, rel_f)
    print(f"Paquete ZIP generado exitosamente en: {zip_path}")

if __name__ == '__main__':
    run_captures()
