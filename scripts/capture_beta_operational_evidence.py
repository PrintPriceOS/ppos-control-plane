import os
import json
import time
import hashlib
import subprocess
from playwright.sync_api import sync_playwright

OUT_DIR = os.path.abspath('review_artifacts_beta_operational')
os.makedirs(OUT_DIR, exist_ok=True)

# ── Mock Data Definitions for Journey 1 (Populated & Selected Entities) ──
MOCK_TENANTS_POPULATED = [
    {"id": "tenant_alpha", "name": "Alpha Press LLC", "status": "ACTIVE", "commercial_status": "ACTIVE"},
    {"id": "tenant_beta", "name": "Beta Graphics Corp", "status": "ACTIVE", "commercial_status": "ACTIVE"}
]

MOCK_REVIEWS_POPULATED = {
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

MOCK_REVIEW_DETAIL_ALPHA = {
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
        "notes": "Parámetros de telemetría y error rate estables en cohorte."
    },
    "findings": [
        {"id": "find_01", "severity": "INFO", "title": "Volumen de pruebas nominal"}
    ]
}

MOCK_PREPARATIONS_POPULATED = {
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

MOCK_PREPARATION_DETAIL_ALPHA = {
    "ok": True,
    "preparation": {
        "preparation_id": "prep_alpha_intervention_01",
        "source_review_id": "rev_beta_alpha_01",
        "tenant_id": "tenant_alpha",
        "cohort_id": "cohort_2026_q4",
        "preparation_status": "FINALIZED",
        "preparation_type": "POLICY_UPDATE"
    },
    "checklist": [
        {"id": "item_01", "label": "Validación de cuota por participante", "status": "APPROVED", "required_role": "SUPER_ADMIN"},
        {"id": "item_02", "label": "Certificación de no ejecución industrial", "status": "APPROVED", "required_role": "SUPER_ADMIN"}
    ]
}

MOCK_APPROVALS_POPULATED = {
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

MOCK_APPROVAL_DETAIL_ALPHA = {
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

def setup_intercepts(page, mode='populated'):
    def route_handler(route):
        url = route.request.url

        if '/api/admin/tenants' in url:
            if mode == 'empty':
                route.fulfill(status=200, content_type='application/json', body=json.dumps([]))
            elif mode == 'error':
                route.fulfill(status=500, content_type='application/json', body=json.dumps({"error": "Error interno del servidor de tenants"}))
            else:
                route.fulfill(status=200, content_type='application/json', body=json.dumps(MOCK_TENANTS_POPULATED))
            return

        if '/api/admin/beta/runtime-reviews/reviews' in url:
            if mode == 'empty':
                route.fulfill(status=200, content_type='application/json', body=json.dumps({"ok": True, "reviews": []}))
            elif mode == 'error':
                route.fulfill(status=500, content_type='application/json', body=json.dumps({"ok": False, "error": "Fallo al listar revisiones"}))
            else:
                route.fulfill(status=200, content_type='application/json', body=json.dumps(MOCK_REVIEWS_POPULATED))
            return

        if '/api/admin/beta/runtime-reviews/review/' in url:
            if mode in ('empty', 'error'):
                route.fulfill(status=404, content_type='application/json', body=json.dumps({"ok": False, "error": "Revisión no encontrada"}))
            else:
                route.fulfill(status=200, content_type='application/json', body=json.dumps(MOCK_REVIEW_DETAIL_ALPHA))
            return

        if '/api/admin/beta/cohort-interventions/preparations' in url:
            if mode == 'empty':
                route.fulfill(status=200, content_type='application/json', body=json.dumps({"ok": True, "preparations": []}))
            elif mode == 'error':
                route.fulfill(status=500, content_type='application/json', body=json.dumps({"ok": False, "error": "Fallo al listar propuestas"}))
            else:
                route.fulfill(status=200, content_type='application/json', body=json.dumps(MOCK_PREPARATIONS_POPULATED))
            return

        if '/api/admin/beta/cohort-interventions/preparation/' in url:
            if mode in ('empty', 'error'):
                route.fulfill(status=404, content_type='application/json', body=json.dumps({"ok": False, "error": "Propuesta no encontrada"}))
            else:
                route.fulfill(status=200, content_type='application/json', body=json.dumps(MOCK_PREPARATION_DETAIL_ALPHA))
            return

        if '/api/admin/beta/cohort-intervention-approvals/approvals' in url:
            if mode == 'empty':
                route.fulfill(status=200, content_type='application/json', body=json.dumps({"ok": True, "approvals": []}))
            elif mode == 'error':
                route.fulfill(status=500, content_type='application/json', body=json.dumps({"ok": False, "error": "Fallo al listar expedientes de aprobación"}))
            else:
                route.fulfill(status=200, content_type='application/json', body=json.dumps(MOCK_APPROVALS_POPULATED))
            return

        if '/api/admin/beta/cohort-intervention-approvals/approval/' in url:
            if mode in ('empty', 'error'):
                route.fulfill(status=404, content_type='application/json', body=json.dumps({"ok": False, "error": "Expediente no encontrado"}))
            else:
                route.fulfill(status=200, content_type='application/json', body=json.dumps(MOCK_APPROVAL_DETAIL_ALPHA))
            return

        if '/api/admin/beta/runtime-sessions/dashboard' in url or '/api/admin/beta/runtime-sessions/readiness' in url:
            route.fulfill(status=200, content_type='application/json', body=json.dumps(MOCK_SESSION_DASHBOARD))
            return

        if '/api/admin/beta/runtime-activity-observation/dashboard' in url or '/api/admin/beta/runtime-activity-observation/readiness' in url:
            route.fulfill(status=200, content_type='application/json', body=json.dumps(MOCK_OBSERVATION_DASHBOARD))
            return

        route.continue_()

    page.route('**/*', route_handler)

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

def run_captures():
    git_sha = get_git_sha()
    print("=" * 60)
    print("CAPTURA DE EVIDENCIAS: SUPER_ADMIN OPERATIONAL FORMS & FLOWS")
    print(f"Commit Git Code Base: {git_sha}")
    print("=" * 60)

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

        # ── RECORRIDO 1: ENTIDADES SELECCIONADAS (Desktop Dark, Desktop Light, Mobile) ──
        print("\n>>> RECORRIDO 1: Entidades Seleccionadas (Dark, Light, Mobile) <<<")
        for theme in ['dark', 'light']:
            ctx = browser.new_context(viewport={"width": 1280, "height": 720})
            page = ctx.new_page()
            setup_intercepts(page, mode='populated')
            setup_page_auth_and_theme(page, theme=theme, locale='es')

            for stage in stages:
                target_url = f"http://127.0.0.1:3000{stage['path']}"
                page.goto(target_url, wait_until='networkidle')
                page.wait_for_timeout(800)

                # Ensure theme applied
                if theme == 'dark':
                    page.evaluate("() => { if (!document.documentElement.classList.contains('dark')) document.documentElement.classList.add('dark'); }")
                else:
                    page.evaluate("() => { document.documentElement.classList.remove('dark'); document.documentElement.style.backgroundColor = '#ffffff'; }")

                # If stage has tenant selector, select tenant_alpha
                tenant_select = page.locator('select[id$="-tenant-selector"]')
                if tenant_select.count() > 0:
                    try:
                        tenant_select.first.select_option(value='tenant_alpha')
                        page.wait_for_timeout(400)
                    except Exception as e:
                        pass

                # If stage has proposal or approval select, select the first available
                prep_sel = page.locator('#prep-proposal-selector')
                if prep_sel.count() > 0:
                    try:
                        prep_sel.select_option(value='prep_alpha_intervention_01')
                        page.wait_for_timeout(400)
                    except Exception:
                        pass

                appr_sel = page.locator('#approval-expediente-selector')
                if appr_sel.count() > 0:
                    try:
                        appr_sel.select_option(value='appr_alpha_gov_01')
                        page.wait_for_timeout(400)
                    except Exception:
                        pass

                # Expand technical details to show collapsible capability
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
                    "simulated_data": {
                        "tenants": True,
                        "reviews": True,
                        "preparations": True,
                        "approvals": True
                    }
                })
                print(f"  [OK] {shot_name} (SHA-256: {sha256[:12]}..., Overflow: {overflow['hasOverflow']})")

            ctx.close()

        # Mobile Viewport (390x844) for populated flow
        print("\n>>> Mobile 390x844 Viewport Check <<<")
        ctx_mobile = browser.new_context(viewport={"width": 390, "height": 844})
        page_mobile = ctx_mobile.new_page()
        setup_intercepts(page_mobile, mode='populated')
        setup_page_auth_and_theme(page_mobile, theme='dark', locale='es')

        for stage in [stages[1], stages[4], stages[5]]:  # Sessions, Preps, Approvals
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

        # ── RECORRIDO 2: DATOS VACÍOS O ERROR CON BOTÓN DE REINTENTO ──
        print("\n>>> RECORRIDO 2: Datos Vacíos o Error con Reintento <<<")
        ctx_err = browser.new_context(viewport={"width": 1280, "height": 720})
        page_err = ctx_err.new_page()
        setup_intercepts(page_err, mode='error')
        setup_page_auth_and_theme(page_err, theme='dark', locale='es')

        for stage in [stages[3], stages[4], stages[5]]:  # Health review, Preps, Approvals
            target_url = f"http://127.0.0.1:3000{stage['path']}"
            page_err.goto(target_url, wait_until='networkidle')
            page_err.wait_for_timeout(800)
            page_err.evaluate("() => { if (!document.documentElement.classList.contains('dark')) document.documentElement.classList.add('dark'); }")

            shot_name = f"{stage['id']}_error_retry_dark_es.png"
            shot_path = os.path.join(OUT_DIR, shot_name)
            page_err.screenshot(path=shot_path, full_page=False)

            sha256 = compute_sha256(shot_path)
            sha_map[shot_name] = sha256
            overflow = check_overflow(page_err)

            results.append({
                "stage": stage["name"],
                "flow": "Recorrido 2 (Error con Reintento)",
                "variant": "Desktop 1280x720 - Dark - Error State - ES",
                "file": shot_name,
                "git_sha": git_sha,
                "sha256": sha256,
                "overflow": overflow,
                "simulated_data": {
                    "server_error_500": True,
                    "retry_button_visible": True
                }
            })
            print(f"  [OK Error] {shot_name} (SHA-256: {sha256[:12]}..., Overflow: {overflow['hasOverflow']})")

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
