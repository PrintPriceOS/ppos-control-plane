# Phase 191G: SSRF Security Review & Guardrail Verification

## 1. SSRF Protection Rules
All user-supplied webhook target URLs and outbound integration endpoints are validated against:
1. **Loopback Networks**: Blocks `localhost`, `127.0.0.0/8`, `0.0.0.0`, `::1`.
2. **RFC1918 Private Ranges**: Blocks `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`.
3. **Link-Local & Cloud Metadata**: Blocks `169.254.0.0/16`, `169.254.169.254`, `instance-data`, `metadata.google.internal`.
4. **Forbidden Schemes**: Rejects `file:`, `ftp:`, `gopher:`, `data:`, `javascript:`. Only `http:` and `https:` permitted.
5. **Production HTTPS Enforcement**: Requires `https:` when `NODE_ENV === 'production'`.

## 2. Automated Test Verification
- Verified by [tests/shipping_ssrf_secret_security_test.js](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/tests/shipping_ssrf_secret_security_test.js).
- 9 attack vector URLs were tested and correctly blocked with `SSRF_SECURITY_VIOLATION`.
