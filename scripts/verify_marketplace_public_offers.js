/**
 * scripts/verify_marketplace_public_offers.js
 * 
 * Verifies the public marketplace offers endpoint.
 * Run with: node scripts/verify_marketplace_public_offers.js
 */
const axios = require('axios');
require('dotenv').config();

const PORT = process.env.PPOS_CONTROL_PORT || 8081;
const TOKEN = process.env.PPOS_CONTROL_TOKEN;
const BASE_URL = `http://127.0.0.1:${PORT}/api/marketplace`;

async function verify() {
    console.log('--- MARKETPLACE PUBLIC API VERIFICATION ---');
    console.log(`URL: ${BASE_URL}/offers`);
    
    if (!TOKEN) {
        console.error('ERROR: PPOS_CONTROL_TOKEN not found in environment.');
        process.exit(1);
    }

    const payload = {
        "copies": 1000,
        "interior_pages": 120,
        "cover_pages": 4,
        "book_size": "A5",
        "orientation": "portrait",
        "delivery_country": "ES",
        "interior_print": "4/4",
        "cover_print": "4/0",
        "cover_print_rev": 0,
        "paper_type_interior": "offset",
        "paper_weight_interior": 100,
        "paper_type_cover": "artboard",
        "paper_weight_cover": 240,
        "paper_type_endpaper": "offset",
        "paper_weight_endpapers": 140,
        "pms_interior": 0,
        "pms_cover": 0,
        "binding_method": "perfect_bound",
        "finishing_options": "matt_lam_scratch",
        "uv_varnish": false,
        "endpapers": "none",
        "endpapers_print": "",
        "extra_book": 0,
        "extra_section": 0,
        "extra_fixed": 0,
        "extra_variable": 0
    };

    try {
        console.log('Sending request...');
        const response = await axios.post(`${BASE_URL}/offers`, payload, {
            headers: {
                'Authorization': `Bearer ${TOKEN}`,
                'Content-Type': 'application/json'
            },
            timeout: 15000
        });

        console.log('Status:', response.status);
        const data = response.data;
        
        console.log('Success:', data.success);
        
        if (data.success) {
            console.log('Offers count:', data.offers.length);
            console.log('Recommended Offer ID:', data.recommended_offer_id);
            
            if (data.offers.length > 0) {
                const off = data.offers[0];
                console.log('First Offer Details:');
                console.log(`  Print House: ${off.print_house}`);
                console.log(`  Total Cost: ${off.total_cost} ${off.currency}`);
                console.log(`  Total Price: ${off.total_price} ${off.currency}`);
                console.log(`  Checkout Allowed: ${off.checkout_allowed}`);
                console.log(`  Source: ${off.source}`);
                
                // Validate required fields
                const requiredFields = ['print_house', 'total_cost', 'total_price', 'currency', 'breakdown', 'checkout_allowed'];
                const missing = requiredFields.filter(f => off[f] === undefined);
                
                if (missing.length > 0) {
                    console.error('FAILED: Missing fields in offer:', missing);
                } else {
                    console.log('PASSED: Offer structure is valid.');
                }
            } else {
                console.warn('WARNING: No offers returned (but success was true). Check BPE connectivity.');
            }
        } else {
            console.error('FAILED: API returned success: false');
            console.error('Message:', data.message);
            console.error('Error Code:', data.error_code);
        }

    } catch (err) {
        console.error('FAILED: Request error');
        if (err.response) {
            console.error('Status:', err.response.status);
            console.error('Data:', JSON.stringify(err.response.data, null, 2));
        } else {
            console.error('Error:', err.message);
        }
    }
}

verify();
