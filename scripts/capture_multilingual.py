# -*- coding: utf-8 -*-
import os
import time
import json
from playwright.sync_api import sync_playwright

OUTPUT_DIR = r"C:\Users\KIKE\.gemini\antigravity-ide\brain\b274e27a-030a-4140-9e90-be1d5a05ecc9"
BASE_URL = "http://localhost:3000/printhouse/setup?tab=PRICING"

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        # EN Light
        ctx_en = browser.new_context(viewport={"width": 1280, "height": 800}, color_scheme="light")
        page = ctx_en.new_page()
        page.goto("http://localhost:3000/", wait_until="domcontentloaded")
        page.evaluate("""() => {
            localStorage.setItem('ppos_locale', 'en');
            localStorage.setItem('ppos-theme', 'light');
            localStorage.setItem('ppos_control_token', 'mock_jwt');
            localStorage.setItem('ppos_control_user', JSON.stringify({
                id: 'usr-1', name: 'John Doe', role: 'PRINTHOUSE_OPERATOR', tenantId: 't-1'
            }));
        }""")
        page.goto(BASE_URL, wait_until="networkidle")
        time.sleep(1)
        page.evaluate("document.documentElement.classList.remove('dark')")
        page.screenshot(path=os.path.join(OUTPUT_DIR, "07_onboarding_step1_en_light_1280.png"), full_page=True)
        ctx_en.close()

        # DE Dark
        ctx_de = browser.new_context(viewport={"width": 1366, "height": 768}, color_scheme="dark")
        page_de = ctx_de.new_page()
        page_de.goto("http://localhost:3000/", wait_until="domcontentloaded")
        page_de.evaluate("""() => {
            localStorage.setItem('ppos_locale', 'de');
            localStorage.setItem('ppos-theme', 'dark');
            localStorage.setItem('ppos_control_token', 'mock_jwt');
            localStorage.setItem('ppos_control_user', JSON.stringify({
                id: 'usr-1', name: 'Hans Mueller', role: 'PRINTHOUSE_OPERATOR', tenantId: 't-1'
            }));
        }""")
        page_de.goto(BASE_URL, wait_until="networkidle")
        time.sleep(1)
        page_de.evaluate("document.documentElement.classList.add('dark')")
        page_de.screenshot(path=os.path.join(OUTPUT_DIR, "08_onboarding_step1_de_dark_1366.png"), full_page=True)
        ctx_de.close()

        browser.close()
        print("EN and DE evidence captured successfully!")

if __name__ == "__main__":
    main()
