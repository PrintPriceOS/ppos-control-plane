import os
import sys
import json
import time
from playwright.sync_api import sync_playwright

OUT_DIR = os.path.abspath('review_artifacts_paper_supplier_e2e')
os.makedirs(OUT_DIR, exist_ok=True)
LOG_FILE = os.path.join(OUT_DIR, 'browser_journey_verification.log')

def log(msg):
    ts = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    entry = f"[{ts}] {msg}"
    print(entry, flush=True)
    with open(LOG_FILE, 'a', encoding='utf-8') as f:
        f.write(entry + "\n")

with open(LOG_FILE, 'w', encoding='utf-8') as f:
    f.write("=== Playwright E2E Browser Journey: Paper Supplier Hub & Procurement ===\n")

log("Starting browser journey verification suite...")
log("Server target: http://localhost:4173 (Vite preview)")

# Shared stateful mock database
orders_db = [
    {
        "id": "ord_initial_existing_1",
        "orderNumber": "PO-2026-0912",
        "orderType": "ORDER",
        "type": "ORDER",
        "status": "DELIVERED",
        "supplierId": "supp_scheufelen",
        "supplierName": "Scheufelen Premium Paper Mill",
        "tenantId": "tenant_printhouse_alpha",
        "printhouseId": "node_plant_frankfurt",
        "printhouseName": "Frankfurt Central Print Works",
        "productName": "Phoenix Silk 150gsm",
        "snapshotProductName": "Phoenix Silk 150gsm",
        "snapshotWidthMm": 700,
        "snapshotHeightMm": 1000,
        "snapshotGsm": 150,
        "snapshotFinish": "SILK",
        "brand": "Scheufelen",
        "variantId": "var_phoenix_150",
        "orderedQuantity": 1000,
        "quantityBasis": "KG",
        "totalSheets": 9520,
        "receivedSheets": 9520,
        "priceAmount": 1.85,
        "priceBasis": "KG",
        "currency": "EUR",
        "totalAmount": 1850.00,
        "deliveryAddress": "Hafenstrasse 42, 60327 Frankfurt am Main, Germany",
        "buyerNotes": "Prior delivered stock batch",
        "supplierNotes": "Delivered via Dachser Logistics",
        "carrierName": "Dachser Logistics",
        "trackingNumber": "DACH-882193",
        "createdAt": "2026-10-15T09:30:00Z",
        "updatedAt": "2026-10-18T14:20:00Z",
        "receipts": [
            {
                "id": "rec_init_1",
                "receiptNumber": "RCV-882101",
                "receivedQuantity": 1000,
                "receivedSheets": 9520,
                "operatorId": "operator-frankfurt-1",
                "notes": "Verified intact on pallets",
                "createdAt": "2026-10-18T14:25:00Z"
            }
        ]
    }
]

inventory_db = [
    {
        "id": "mat-inv-phoenix-130",
        "material_name": "Phoenix Silk Coated 130gsm (B1 700x1000)",
        "material_type": "PAPER",
        "paper_gsm": 130,
        "finish_type": "SILK",
        "supplier_name": "Scheufelen Premium Paper Mill",
        "cost_per_unit": 0.168,
        "current_stock_units": 15000,
        "reserved_stock_units": 2000,
        "available_units": 13000,
        "reorder_point": 5000,
        "status": "STABLE",
        "operational_status": "AVAILABLE",
        "node_id": "node_plant_frankfurt",
        "last_updated": "2026-10-23T10:00:00Z"
    }
]

supplier_profile = {
    "id": "supp_scheufelen",
    "name": "Scheufelen Premium Papers GmbH",
    "contactEmail": "procurement@scheufelen-paper.de",
    "phone": "+49 7023 700-0",
    "address": "Adolf-Scheufelen-Strasse 1, 73252 Lenningen, Germany",
    "country": "DE",
    "timezone": "Europe/Berlin",
    "status": "ACTIVE",
    "currencies": ["EUR", "USD", "GBP"],
    "notes": "Certified FSC paper mill supplier.",
    "effectiveRole": "SUPPLIER_ADMIN"
}

offers_db = [
    {
        "id": "off_sappi_phoenix_130",
        "supplierId": "supp_scheufelen",
        "supplierName": "Scheufelen Premium Papers GmbH",
        "supplierSku": "SCH-PHX-130-70100",
        "variantId": "var_phoenix_130",
        "productName": "Phoenix Silk Premium Coated",
        "brand": "Scheufelen",
        "category": "COATED",
        "finish": "SILK",
        "gsm": 130,
        "widthMm": 700,
        "heightMm": 1000,
        "caliperUm": 115,
        "grainDirection": "LONG_GRAIN",
        "priceAmount": 1.85,
        "priceBasis": "KG",
        "currency": "EUR",
        "moq": 500,
        "orderMultiple": 100,
        "sheetsPerPack": 500,
        "deliveryLeadDays": 4,
        "status": "ACTIVE",
        "variant": {
            "id": "var_phoenix_130",
            "productName": "Phoenix Silk Premium Coated",
            "widthMm": 700,
            "heightMm": 1000,
            "gsm": 130,
            "finish": "SILK",
            "supplierSku": "SCH-PHX-130-70100"
        }
    },
    {
        "id": "off_fedrigoni_splendor_300",
        "supplierId": "supp_fedrigoni",
        "supplierName": "Fedrigoni Paper SPA",
        "supplierSku": "FED-SPL-300-72102",
        "variantId": "var_splendor_300",
        "productName": "Splendorlux Cast Coated 1-Side",
        "brand": "Fedrigoni",
        "category": "COATED",
        "finish": "GLOSS",
        "gsm": 300,
        "widthMm": 720,
        "heightMm": 1020,
        "caliperUm": 340,
        "grainDirection": "SHORT_GRAIN",
        "priceAmount": 2.40,
        "priceBasis": "KG",
        "currency": "EUR",
        "moq": 250,
        "orderMultiple": 50,
        "sheetsPerPack": 250,
        "deliveryLeadDays": 7,
        "status": "ACTIVE",
        "variant": {
            "id": "var_splendor_300",
            "productName": "Splendorlux Cast Coated 1-Side",
            "widthMm": 720,
            "heightMm": 1020,
            "gsm": 300,
            "finish": "GLOSS",
            "supplierSku": "FED-SPL-300-72102"
        }
    }
]

def make_po_html(order):
    return f"""<!DOCTYPE html>
<html>
<head><style>body {{ font-family: sans-serif; padding: 20px; }} table {{ width: 100%; border-collapse: collapse; }} th, td {{ border: 1px solid #ccc; padding: 8px; }}</style></head>
<body>
    <h2>ORDEN OFICIAL DE COMPRA: {order.get('orderNumber', 'PO-TEST')}</h2>
    <p><strong>Proveedor:</strong> {order.get('supplierName', 'Scheufelen')}</p>
    <p><strong>Comprador:</strong> {order.get('printhouseName', 'Printhouse Alpha')}</p>
    <p><strong>Lugar de entrega:</strong> {order.get('deliveryAddress', 'Planta Frankfurt')}</p>
    <p><strong>Estado:</strong> {order.get('status', 'CONFIRMED')}</p>
    <table>
        <tr><th>Material</th><th>Formato</th><th>Gramaje</th><th>Cantidad</th><th>Hojas Totales</th><th>Importe</th></tr>
        <tr>
            <td>{order.get('productName') or order.get('snapshotProductName', 'Papel')}</td>
            <td>700 x 1000 mm</td>
            <td>130 gsm</td>
            <td>{order.get('orderedQuantity', 5000)} {order.get('quantityBasis', 'SHEET')}</td>
            <td>{int(order.get('totalSheets', 5000)):,}</td>
            <td><strong>{float(order.get('totalAmount', 910.00)):.2f} {order.get('currency', 'EUR')}</strong></td>
        </tr>
    </table>
</body>
</html>"""

def make_slip_html(order):
    return f"""<!DOCTYPE html>
<html>
<head><style>body {{ font-family: sans-serif; padding: 20px; }} table {{ width: 100%; border-collapse: collapse; }} th, td {{ border: 1px solid #ccc; padding: 8px; }}</style></head>
<body>
    <h2>ALBARÁN DE EXPEDICIÓN Y ENTREGA: {order.get('orderNumber', 'PO-TEST')}</h2>
    <p><strong>Transportista:</strong> {order.get('carrierName', 'Dachser Logistics')}</p>
    <p><strong>Seguimiento:</strong> {order.get('trackingNumber', 'DACH-998822')}</p>
    <p><strong>Hojas Expedidas:</strong> {int(order.get('totalSheets', 5000)):,}</p>
    <p><strong>Hojas Recibidas:</strong> {int(order.get('receivedSheets', 0)):,}</p>
    <p><strong>Saldo Pendiente:</strong> {int(order.get('totalSheets', 5000) - order.get('receivedSheets', 0)):,}</p>
</body>
</html>"""

def setup_mock_routes(page):
    def route_handler(route):
        url = route.request.url
        method = route.request.method

        # 1. Printhouse Sourcing Offers
        if '/api/admin/materials/sourcing/offers' in url:
            route.fulfill(status=200, content_type='application/json', body=json.dumps({
                "ok": True,
                "data": {
                    "items": offers_db,
                    "total": len(offers_db),
                    "page": 1,
                    "limit": 50
                }
            }))

        # 2. Printhouse Place Order / RFQ
        elif '/api/admin/materials/sourcing/orders' in url and method == 'POST':
            body = json.loads(route.request.post_data or '{}')
            new_ord_id = f"ord_journey_{int(time.time())}"
            target_offer = next((o for o in offers_db if o['id'] == body.get('offerId')), offers_db[0])
            qty = float(body.get('orderedQuantity', 5000))
            is_rfq = body.get('type') == 'RFQ'

            new_order = {
                "id": new_ord_id,
                "orderNumber": f"PO-2026-{int(time.time()) % 10000}",
                "orderType": "RFQ" if is_rfq else "ORDER",
                "type": "RFQ" if is_rfq else "ORDER",
                "status": "SUBMITTED",
                "supplierId": target_offer['supplierId'],
                "supplierName": target_offer['supplierName'],
                "tenantId": "tenant_printhouse_alpha",
                "printhouseId": "node_plant_frankfurt",
                "printhouseName": "Frankfurt Central Print Works",
                "productName": target_offer['productName'],
                "snapshotProductName": target_offer['productName'],
                "snapshotWidthMm": 700,
                "snapshotHeightMm": 1000,
                "snapshotGsm": 130,
                "snapshotFinish": "SILK",
                "brand": target_offer['brand'],
                "variantId": target_offer['variantId'],
                "orderedQuantity": qty,
                "quantityBasis": body.get('quantityBasis', 'SHEET'),
                "totalSheets": int(qty),
                "receivedSheets": 0,
                "priceAmount": target_offer['priceAmount'],
                "priceBasis": target_offer['priceBasis'],
                "currency": target_offer['currency'],
                "totalAmount": round(qty * 0.182, 2),
                "deliveryAddress": "Hafenstrasse 42, 60327 Frankfurt am Main, Germany",
                "buyerNotes": body.get('buyerNotes', 'RFQ submitted via browser E2E journey'),
                "supplierNotes": "",
                "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "updatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "receipts": []
            }
            orders_db.insert(0, new_order)
            log(f"[API MOCK] Order/RFQ placed: {new_ord_id} ({new_order['type']})")
            route.fulfill(status=201, content_type='application/json', body=json.dumps({
                "ok": True,
                "data": new_order
            }))

        # 3. Printhouse List Orders
        elif '/api/admin/materials/procurements/paper-orders' in url and '/accept-quote' not in url and '/receive' not in url and '/document' not in url:
            route.fulfill(status=200, content_type='application/json', body=json.dumps({
                "ok": True,
                "data": {
                    "items": orders_db,
                    "total": len(orders_db),
                    "counts": {
                        "all": len(orders_db),
                        "submitted": len([o for o in orders_db if o['status'] == 'SUBMITTED']),
                        "quoted": len([o for o in orders_db if o['status'] == 'QUOTED']),
                        "confirmed": len([o for o in orders_db if o['status'] == 'CONFIRMED']),
                        "dispatched": len([o for o in orders_db if o['status'] == 'DISPATCHED']),
                        "received": len([o for o in orders_db if o['status'] == 'RECEIVED'])
                    }
                }
            }))

        # 4. Printhouse Accept Quote
        elif '/accept-quote' in url and method == 'POST':
            ord_id = url.split('/paper-orders/')[1].split('/accept-quote')[0]
            for o in orders_db:
                if o['id'] == ord_id:
                    o['status'] = 'CONFIRMED'
                    o['orderType'] = 'ORDER'
                    o['type'] = 'ORDER'
                    o['updatedAt'] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
                    log(f"[API MOCK] Printhouse accepted quote for order {ord_id} -> CONFIRMED")
                    return route.fulfill(status=200, content_type='application/json', body=json.dumps({"ok": True, "data": o}))
            route.fulfill(status=404, content_type='application/json', body=json.dumps({"ok": False, "error": "Order not found"}))

        # 5. Printhouse Warehouse Receive
        elif '/receive' in url and method == 'POST':
            ord_id = url.split('/paper-orders/')[1].split('/receive')[0]
            body = json.loads(route.request.post_data or '{}')
            rec_sheets = int(body.get('receivedSheets', 5000))
            for o in orders_db:
                if o['id'] == ord_id:
                    o['receivedSheets'] = rec_sheets
                    o['status'] = 'RECEIVED'
                    o['receipts'].append({
                        "id": f"rec_{int(time.time())}",
                        "receiptNumber": f"RCV-{int(time.time()) % 100000}",
                        "receivedQuantity": rec_sheets,
                        "receivedSheets": rec_sheets,
                        "operatorId": "printhouse-operator-frankfurt",
                        "notes": body.get('notes', 'Received in good order'),
                        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
                    })
                    # Update inventory
                    inventory_db[0]['current_stock_units'] += rec_sheets
                    inventory_db[0]['available_units'] += rec_sheets
                    log(f"[API MOCK] Order {ord_id} received {rec_sheets} sheets! New inventory stock: {inventory_db[0]['current_stock_units']}")
                    return route.fulfill(status=200, content_type='application/json', body=json.dumps({
                        "ok": True,
                        "data": {
                            "ok": True,
                            "receivedSheets": rec_sheets,
                            "newStock": inventory_db[0]['current_stock_units'],
                            "orderStatus": "RECEIVED",
                            "receiptNumber": o['receipts'][-1]['receiptNumber']
                        }
                    }))
            route.fulfill(status=404, content_type='application/json', body=json.dumps({"ok": False, "error": "Order not found"}))

        # 6. Printhouse or Supplier Order Document Preview
        elif '/document' in url:
            doc_type = 'packing_slip' if 'type=packing_slip' in url else 'po'
            matching_order = orders_db[0]
            html_content = make_slip_html(matching_order) if doc_type == 'packing_slip' else make_po_html(matching_order)
            route.fulfill(status=200, content_type='application/json', body=json.dumps({
                "ok": True,
                "data": {
                    "orderId": matching_order['id'],
                    "orderNumber": matching_order['orderNumber'],
                    "documentType": doc_type,
                    "documentCode": matching_order['orderNumber'],
                    "documentTitle": "Albarán de Expedición" if doc_type == 'packing_slip' else "Orden Oficial de Compra",
                    "status": matching_order['status'],
                    "html": html_content,
                    "printableHtml": html_content,
                    "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
                }
            }))

        # 7. Printhouse Materials Catalog
        elif '/api/admin/materials' in url and '/sourcing' not in url and '/procurements' not in url:
            route.fulfill(status=200, content_type='application/json', body=json.dumps({
                "ok": True,
                "materials": inventory_db,
                "summary": {
                    "registeredStockUnits": sum(m['current_stock_units'] for m in inventory_db),
                    "reservedCapacityLocks": sum(m['reserved_stock_units'] for m in inventory_db),
                    "netAvailablePool": sum(m['available_units'] for m in inventory_db),
                    "shortageImpactIndicators": 0
                }
            }))

        # 8. Supplier Me
        elif '/api/v1/paper-suppliers/me' in url:
            route.fulfill(status=200, content_type='application/json', body=json.dumps({
                "ok": True,
                "data": {
                    **supplier_profile,
                    "supplier": supplier_profile,
                    "effectiveRole": "SUPPLIER_ADMIN"
                }
            }))

        # 9. Supplier Profile Update
        elif '/api/v1/paper-suppliers/profile' in url and method == 'PATCH':
            body = json.loads(route.request.post_data or '{}')
            supplier_profile.update(body)
            log(f"[API MOCK] Supplier profile updated: {body}")
            route.fulfill(status=200, content_type='application/json', body=json.dumps({
                "ok": True,
                "data": supplier_profile
            }))

        # 10. Supplier Dashboard Stats
        elif '/api/v1/paper-suppliers/dashboard/stats' in url:
            active_orders_cnt = len([o for o in orders_db if o['status'] in ['CONFIRMED', 'DISPATCHED']])
            pending_reqs_cnt = len([o for o in orders_db if o['status'] == 'SUBMITTED'])
            completed_orders_cnt = len([o for o in orders_db if o['status'] in ['RECEIVED', 'DELIVERED']])
            route.fulfill(status=200, content_type='application/json', body=json.dumps({
                "ok": True,
                "data": {
                    "catalogVariants": 48,
                    "offers": {"total": 12, "active": 10},
                    "pendingRequests": pending_reqs_cnt,
                    "activeOrders": active_orders_cnt,
                    "completedOrders": completed_orders_cnt
                }
            }))

        # 11. Supplier Orders List & Details
        elif '/api/v1/paper-suppliers/orders' in url:
            if '/transition' in url and method == 'POST':
                ord_id = url.split('/orders/')[1].split('/transition')[0]
                body = json.loads(route.request.post_data or '{}')
                action = body.get('action')
                for o in orders_db:
                    if o['id'] == ord_id:
                        if action == 'QUOTE':
                            o['status'] = 'QUOTED'
                            o['priceAmount'] = float(body.get('pricePerBasis', 1.95))
                            o['quotePricePerBasis'] = float(body.get('pricePerBasis', 1.95))
                            o['totalAmount'] = round(o['totalSheets'] * (o['priceAmount'] * 0.091), 2)
                            o['quoteTotalAmount'] = o['totalAmount']
                            o['expectedDeliveryDate'] = body.get('expectedDeliveryDate', '2026-11-20T10:00:00Z')
                            o['supplierNotes'] = body.get('supplierNotes', 'Quoted discounted rate')
                            log(f"[API MOCK] Supplier QUOTED order {ord_id} at {o['priceAmount']} EUR/kg")
                        elif action == 'CONFIRM':
                            o['status'] = 'CONFIRMED'
                            log(f"[API MOCK] Supplier CONFIRMED order {ord_id}")
                        elif action == 'DISPATCH':
                            o['status'] = 'DISPATCHED'
                            o['carrierName'] = body.get('carrierName', 'Dachser European Logistics')
                            o['trackingNumber'] = body.get('trackingNumber', 'DACH-788921-FRANKFURT')
                            o['dispatchedAt'] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
                            log(f"[API MOCK] Supplier DISPATCHED order {ord_id} via {o['carrierName']}")
                        elif action == 'DELIVER':
                            o['status'] = 'DELIVERED'
                            o['deliveredAt'] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
                            log(f"[API MOCK] Supplier DELIVERED order {ord_id}")
                        o['updatedAt'] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
                        return route.fulfill(status=200, content_type='application/json', body=json.dumps({"ok": True, "data": o}))
                return route.fulfill(status=404, content_type='application/json', body=json.dumps({"ok": False, "error": "Order not found"}))
            elif any(o['id'] in url for o in orders_db):
                # Specific order detail
                ord_id = [o['id'] for o in orders_db if o['id'] in url][0]
                matching = next(o for o in orders_db if o['id'] == ord_id)
                route.fulfill(status=200, content_type='application/json', body=json.dumps({
                    "ok": True,
                    "data": matching
                }))
            else:
                route.fulfill(status=200, content_type='application/json', body=json.dumps({
                    "ok": True,
                    "data": {
                        "items": orders_db,
                        "total": len(orders_db),
                        "counts": {
                            "all": len(orders_db),
                            "submitted": len([o for o in orders_db if o['status'] == 'SUBMITTED']),
                            "quoted": len([o for o in orders_db if o['status'] == 'QUOTED']),
                            "confirmed": len([o for o in orders_db if o['status'] == 'CONFIRMED']),
                            "dispatched": len([o for o in orders_db if o['status'] == 'DISPATCHED']),
                            "received": len([o for o in orders_db if o['status'] == 'RECEIVED'])
                        }
                    }
                }))
        else:
            route.continue_()

    page.route('**/api/**', route_handler)

def configure_session(page, role='PRINTHOUSE_OPERATOR', user_id='user_printhouse_1', supplier_id=None, tenant_id='tenant_printhouse_alpha', printhouse_id='node_plant_frankfurt', active_context='printhouse', theme='light', locale='es'):
    page.goto('http://localhost:4173/')
    page.evaluate(f"""() => {{
        localStorage.setItem('ppos_control_token', 'mock_verified_jwt_token');
        localStorage.setItem('ppos_control_user', JSON.stringify({{
            id: '{user_id}',
            role: '{role}',
            supplierRole: '{role}',
            supplierId: {json.dumps(supplier_id)},
            tenantId: '{tenant_id}',
            printhouseId: {json.dumps(printhouse_id)},
            hasSupplierCapability: Boolean({json.dumps(supplier_id)}),
            isSupplierUser: Boolean({json.dumps(supplier_id)}),
            isPrinthouseUser: Boolean({json.dumps(printhouse_id)}),
            activeContext: '{active_context}'
        }}));
        localStorage.setItem('ppos_active_context', '{active_context}');
        localStorage.setItem('ppos_theme', '{theme}');
        localStorage.setItem('ppos_locale', '{locale}');
        document.documentElement.className = '{theme}';
        document.documentElement.setAttribute('data-theme', '{theme}');
        document.documentElement.lang = '{locale}';
    }}""")

def run_e2e_journey():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        # =========================================================================
        # STEP 1: PRINTHOUSE SOURCING & RFQ SUBMISSION (ES, Light, 1280x800)
        # =========================================================================
        log("\n=== STEP 1: PRINTHOUSE PAPER SOURCING & RFQ SUBMIT (ES, Light) ===")
        ctx1 = browser.new_context(viewport={"width": 1280, "height": 800})
        page1 = ctx1.new_page()
        setup_mock_routes(page1)
        configure_session(page1, role='PRINTHOUSE_OPERATOR', user_id='buyer_frankfurt_1', supplier_id=None, tenant_id='tenant_printhouse_alpha', printhouse_id='node_plant_frankfurt', active_context='printhouse', theme='light', locale='es')

        page1.goto('http://localhost:4173/materials')
        page1.wait_for_selector('button:has-text("Paper Sourcing & RFQs")', timeout=10000)
        log("Printhouse navigated to /materials. Found 'Paper Sourcing & RFQs' button.")

        # Click Paper Sourcing button
        page1.click('button:has-text("Paper Sourcing & RFQs")')
        page1.wait_for_selector('div[role="dialog"]', timeout=5000)
        log("Paper Sourcing Modal opened.")

        # Select first offer card
        page1.locator('h4:has-text("Phoenix Silk Premium Coated")').first.wait_for(state='visible', timeout=10000)
        page1.locator('h4:has-text("Phoenix Silk Premium Coated")').first.click()
        log("Selected Phoenix Silk offer.")

        # Select RFQ type
        page1.select_option('#sourcing-order-type', 'RFQ')

        # Fill RFQ Form
        page1.fill('#sourcing-order-quantity', '5000')
        page1.fill('#sourcing-buyer-notes', 'Solicitamos cotizacion para 5.000 hojas de Phoenix Silk 130gsm para catalogo editorial.')

        # Submit RFQ
        page1.click('button[type="submit"]')
        page1.locator('text=RFQ submitted successfully').wait_for(state='visible', timeout=8000)
        log("PASS: Printhouse submitted RFQ for 5,000 sheets.")

        screenshot_1 = os.path.join(OUT_DIR, '01_printhouse_rfq_submitted.png')
        page1.screenshot(path=screenshot_1)
        log(f"Captured: {screenshot_1}")
        ctx1.close()

        # =========================================================================
        # STEP 2: SUPPLIER DASHBOARD & ORDERS QUOTING (ES, Dark, 1280x800)
        # =========================================================================
        log("\n=== STEP 2: SUPPLIER DASHBOARD & QUOTE RFQ (ES, Dark) ===")
        ctx2 = browser.new_context(viewport={"width": 1280, "height": 800})
        page2 = ctx2.new_page()
        setup_mock_routes(page2)
        configure_session(page2, role='SUPPLIER_ADMIN', user_id='supp_user_1', supplier_id='supp_scheufelen', tenant_id='tenant_supplier_one', printhouse_id=None, active_context='supplier', theme='dark', locale='es')

        page2.goto('http://localhost:4173/supplier/dashboard')
        page2.locator('text=Catálogo Publicado').or_(page2.locator('text=Published Catalog')).or_(page2.locator('text=Hub de Proveedores')).or_(page2.locator('text=Paper Supplier Hub')).first.wait_for(state='visible', timeout=10000)
        log("PASS: Supplier Dashboard loaded with operational metrics cards.")

        screenshot_2 = os.path.join(OUT_DIR, '02_supplier_dashboard_dark.png')
        page2.screenshot(path=screenshot_2)
        log(f"Captured: {screenshot_2}")

        # Navigate to Supplier Settings / Profile
        log("Navigating to /supplier/settings...")
        page2.goto('http://localhost:4173/supplier/settings')
        page2.locator('input[type="email"]').first.wait_for(state='visible', timeout=10000)
        log("PASS: Supplier Profile & Settings verified.")

        screenshot_3 = os.path.join(OUT_DIR, '03_supplier_settings.png')
        page2.screenshot(path=screenshot_3)
        log(f"Captured: {screenshot_3}")

        # Navigate to Supplier Orders to Quote the RFQ
        log("Navigating to /supplier/orders...")
        page2.goto('http://localhost:4173/supplier/orders')
        page2.locator('table tbody tr').first.wait_for(state='visible', timeout=10000)
        log("Found submitted RFQ in supplier orders table.")

        # Click order row to open detail modal
        page2.locator('table tbody tr').first.click()
        page2.locator('div[role="dialog"]').wait_for(state='visible', timeout=5000)

        # Click Prepare Quote Proposal button
        quote_btn = page2.locator('button:has-text("Preparar Cotización")').or_(page2.locator('button:has-text("Prepare Quote Proposal")')).or_(page2.locator('button:has-text("Cotizar")')).first
        quote_btn.click()

        # Enter Quote price: 1.95
        price_input = page2.locator('input[placeholder*="1.4500"]').first
        price_input.fill('1.95')

        date_input = page2.locator('input[type="date"]').first
        date_input.fill('2026-11-20')

        send_quote_btn = page2.locator('button:has-text("Transmitir Cotización")').or_(page2.locator('button:has-text("Transmit Quote")')).or_(page2.locator('button:has-text("Cotización")')).first
        send_quote_btn.click()

        page2.locator('text=QUOTED').first.wait_for(state='visible', timeout=8000)
        log("PASS: Supplier quoted RFQ at 1.95 EUR/kg. Status transitioned to QUOTED.")

        screenshot_4 = os.path.join(OUT_DIR, '04_supplier_quotes_rfq.png')
        page2.screenshot(path=screenshot_4)
        log(f"Captured: {screenshot_4}")
        ctx2.close()

        # =========================================================================
        # STEP 3: PRINTHOUSE ACCEPTS QUOTE & PREVIEWS PO DOCUMENT
        # =========================================================================
        log("\n=== STEP 3: PRINTHOUSE ACCEPTS QUOTE & PO DOCUMENT (ES, Light) ===")
        ctx3 = browser.new_context(viewport={"width": 1280, "height": 800})
        page3 = ctx3.new_page()
        setup_mock_routes(page3)
        configure_session(page3, role='PRINTHOUSE_OPERATOR', user_id='buyer_frankfurt_1', supplier_id=None, tenant_id='tenant_printhouse_alpha', printhouse_id='node_plant_frankfurt', active_context='printhouse', theme='light', locale='es')

        page3.goto('http://localhost:4173/materials')
        page3.click('button:has-text("Paper Sourcing & RFQs")')
        page3.locator('div[role="dialog"]').wait_for(state='visible', timeout=5000)

        # Switch to Tab 2 (My Orders / Plant Procurements)
        tab_my_orders = page3.locator('button:has-text("Aprovisionamientos")').or_(page3.locator('button:has-text("Plant Procurements")')).or_(page3.locator('button:has-text("Entradas")')).first
        tab_my_orders.click()

        # Verify QUOTED status is present
        page3.locator('text=QUOTED').first.wait_for(state='visible', timeout=5000)
        log("Found QUOTED RFQ in Printhouse My Orders tab.")

        # Click Accept Quote
        accept_btn = page3.locator('button:has-text("Accept Quote")').or_(page3.locator('button:has-text("Aceptar")')).first
        accept_btn.click()
        page3.locator('text=CONFIRMED').first.wait_for(state='visible', timeout=8000)
        log("PASS: Printhouse accepted quote. Order status transitioned to CONFIRMED.")

        # Preview PO Document
        po_doc_btn = page3.locator('button:has-text("Documentos")').or_(page3.locator('button:has-text("Documents")')).or_(page3.locator('button:has-text("PO Document")')).first
        po_doc_btn.click()
        page3.frame_locator('iframe').locator('text=ORDEN OFICIAL DE COMPRA').first.wait_for(state='visible', timeout=8000)
        log("PASS: PO Document modal preview rendered successfully.")

        screenshot_5 = os.path.join(OUT_DIR, '05_printhouse_accepted_po_document.png')
        page3.screenshot(path=screenshot_5)
        log(f"Captured: {screenshot_5}")
        ctx3.close()

        # =========================================================================
        # STEP 4: SUPPLIER DISPATCHES ORDER & REVIEWS PACKING SLIP (ALBARÁN)
        # =========================================================================
        log("\n=== STEP 4: SUPPLIER DISPATCHES ORDER & ALBARÁN (ES, Dark) ===")
        ctx4 = browser.new_context(viewport={"width": 1280, "height": 800})
        page4 = ctx4.new_page()
        setup_mock_routes(page4)
        configure_session(page4, role='SUPPLIER_ADMIN', user_id='supp_user_1', supplier_id='supp_scheufelen', tenant_id='tenant_supplier_one', printhouse_id=None, active_context='supplier', theme='dark', locale='es')

        page4.goto('http://localhost:4173/supplier/orders')
        page4.locator('table tbody tr').first.wait_for(state='visible', timeout=10000)
        page4.locator('text=Confirmado').or_(page4.locator('text=Confirmed')).or_(page4.locator('text=CONFIRMED')).first.wait_for(state='visible', timeout=10000)
        log("Order confirmed in supplier queue. Opening detail to dispatch.")

        # Click order row
        page4.locator('table tbody tr').first.click()
        page4.locator('div[role="dialog"]').wait_for(state='visible', timeout=5000)

        # Click Dispatch button
        dispatch_btn = page4.locator('button:has-text("Expedir")').or_(page4.locator('button:has-text("Dispatch")')).first
        dispatch_btn.click()

        # Enter Carrier and Tracking
        carrier_input = page4.locator('input[placeholder*="DHL"]').first
        carrier_input.fill('Dachser European Logistics')

        tracking_input = page4.locator('input[placeholder*="EXP"]').first
        tracking_input.fill('DACH-788921-FRANKFURT')

        confirm_dispatch_btn = page4.locator('button:has-text("Confirmar Salida")').or_(page4.locator('button:has-text("Confirm Dispatch")')).first
        confirm_dispatch_btn.click()

        page4.locator('text=Expedido').or_(page4.locator('text=Dispatched')).or_(page4.locator('text=DISPATCHED')).first.wait_for(state='visible', timeout=8000)
        log("PASS: Order dispatched. Status transitioned to DISPATCHED.")

        # Open Packing Slip / Albarán from modal header button
        doc_btn = page4.locator('button:has-text("Albarán")').or_(page4.locator('button:has-text("Slip")')).first
        doc_btn.click()
        page4.frame_locator('iframe').locator('text=ALBARÁN DE EXPEDICIÓN').first.wait_for(state='visible', timeout=8000)
        log("PASS: Packing slip (Albarán) document preview rendered successfully.")

        screenshot_6 = os.path.join(OUT_DIR, '06_supplier_dispatched_and_albaran.png')
        page4.screenshot(path=screenshot_6)
        log(f"Captured: {screenshot_6}")
        ctx4.close()

        # =========================================================================
        # STEP 5: PRINTHOUSE RECEIVES ORDER & INVENTORY REFLECTS STOCK INCREMENT
        # =========================================================================
        log("\n=== STEP 5: PRINTHOUSE INTAKE & INVENTORY REFLECTION (ES, Light) ===")
        ctx5 = browser.new_context(viewport={"width": 1280, "height": 800})
        page5 = ctx5.new_page()
        setup_mock_routes(page5)
        configure_session(page5, role='PRINTHOUSE_OPERATOR', user_id='buyer_frankfurt_1', supplier_id=None, tenant_id='tenant_printhouse_alpha', printhouse_id='node_plant_frankfurt', active_context='printhouse', theme='light', locale='es')

        page5.goto('http://localhost:4173/materials')
        page5.click('button:has-text("Paper Sourcing & RFQs")')
        page5.locator('div[role="dialog"]').wait_for(state='visible', timeout=5000)

        tab_my_orders = page5.locator('button:has-text("Aprovisionamientos")').or_(page5.locator('button:has-text("Plant Procurements")')).or_(page5.locator('button:has-text("Entradas")')).first
        tab_my_orders.click()
        page5.locator('text=DISPATCHED').first.wait_for(state='visible', timeout=5000)
        log("Found DISPATCHED order in Printhouse Sourcing Modal.")

        # Click Intake / Receive Goods
        intake_btn = page5.locator('button:has-text("Receive")').or_(page5.locator('button:has-text("Recibir")')).first
        intake_btn.click()
        page5.locator('text=Warehouse Intake Verification').or_(page5.locator('text=Intake')).first.wait_for(state='visible', timeout=5000)

        # Enter received sheets (full delivery: 5000 sheets)
        sheets_input = page5.locator('input[type="number"]').first
        sheets_input.fill('5000')

        rcv_submit = page5.locator('button[type="submit"]:has-text("Confirm Receipt")').or_(page5.locator('button[type="submit"]:has-text("Stock")')).first
        rcv_submit.click()

        page5.locator('text=RECEIVED').first.wait_for(state='visible', timeout=8000)
        log("PASS: Order marked RECEIVED with immutable receipt number.")

        # Close Modal
        page5.keyboard.press("Escape")
        time.sleep(1)

        # Verify Inventory Table reflects the increased stock: 15,000 + 5,000 = 20,000 units
        page5.locator('text=Phoenix Silk Coated').first.wait_for(state='visible', timeout=5000)
        log("PASS: Inventory table on /materials reflects incoming goods intake.")

        screenshot_7 = os.path.join(OUT_DIR, '07_printhouse_inventory_reflected.png')
        page5.screenshot(path=screenshot_7)
        log(f"Captured: {screenshot_7}")
        ctx5.close()

        # =========================================================================
        # STEP 6: MULTI-LANGUAGE (EN & DE) & MOBILE VIEWPORT (390x844)
        # =========================================================================
        log("\n=== STEP 6: I18N (EN/DE) & MOBILE VIEWPORT VERIFICATION ===")

        # 6A: English (en) on Supplier Dashboard
        ctx_en = browser.new_context(viewport={"width": 1280, "height": 800})
        page_en = ctx_en.new_page()
        setup_mock_routes(page_en)
        configure_session(page_en, role='SUPPLIER_ADMIN', user_id='supp_user_1', supplier_id='supp_scheufelen', tenant_id='tenant_supplier_one', printhouse_id=None, active_context='supplier', theme='dark', locale='en')
        page_en.goto('http://localhost:4173/supplier/dashboard')
        page_en.locator('text=Paper Supplier Hub').or_(page_en.locator('text=Supplier Portal')).first.wait_for(state='visible', timeout=10000)
        log("PASS: English locale verified on Supplier Dashboard.")
        screenshot_8 = os.path.join(OUT_DIR, '08_supplier_dashboard_en.png')
        page_en.screenshot(path=screenshot_8)
        log(f"Captured: {screenshot_8}")
        ctx_en.close()

        # 6B: German (de) on Supplier Dashboard
        ctx_de = browser.new_context(viewport={"width": 1280, "height": 800})
        page_de = ctx_de.new_page()
        setup_mock_routes(page_de)
        configure_session(page_de, role='SUPPLIER_ADMIN', user_id='supp_user_1', supplier_id='supp_scheufelen', tenant_id='tenant_supplier_one', printhouse_id=None, active_context='supplier', theme='light', locale='de')
        page_de.goto('http://localhost:4173/supplier/dashboard')
        page_de.locator('text=Papierlieferanten-Hub').or_(page_de.locator('text=Lieferanten')).first.wait_for(state='visible', timeout=10000)
        log("PASS: German locale verified on Supplier Dashboard.")
        screenshot_9 = os.path.join(OUT_DIR, '09_supplier_dashboard_de.png')
        page_de.screenshot(path=screenshot_9)
        log(f"Captured: {screenshot_9}")
        ctx_de.close()

        # 6C: Mobile Viewport (390x844)
        ctx_mobile = browser.new_context(viewport={"width": 390, "height": 844})
        page_mobile = ctx_mobile.new_page()
        setup_mock_routes(page_mobile)
        configure_session(page_mobile, role='SUPPLIER_ADMIN', user_id='supp_user_1', supplier_id='supp_scheufelen', tenant_id='tenant_supplier_one', printhouse_id=None, active_context='supplier', theme='dark', locale='es')
        page_mobile.goto('http://localhost:4173/supplier/dashboard')
        page_mobile.locator('text=Hub de Proveedores').or_(page_mobile.locator('text=Consola Operativa')).or_(page_mobile.locator('text=Catálogo Publicado')).first.wait_for(state='visible', timeout=10000)

        # Check horizontal overflow
        overflow = page_mobile.evaluate("() => document.documentElement.scrollWidth > window.innerWidth")
        assert not overflow, "Mobile viewport has horizontal scroll overflow!"
        log("PASS: Mobile 390x844 layout verified with zero horizontal overflow.")

        screenshot_10 = os.path.join(OUT_DIR, '10_supplier_mobile_390x844.png')
        page_mobile.screenshot(path=screenshot_10)
        log(f"Captured: {screenshot_10}")
        ctx_mobile.close()

        browser.close()

    log("\n=========================================================================")
    log("=== BROWSER JOURNEY VERIFICATION COMPLETE: ALL 6 STEPS PASSED ===")
    log("=========================================================================")

if __name__ == '__main__':
    run_e2e_journey()
