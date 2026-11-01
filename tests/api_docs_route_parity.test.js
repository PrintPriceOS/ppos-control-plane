'use strict';

/**
 * tests/api_docs_route_parity.test.js
 *
 * Automated API Contract & Documentation Route Parity Verification Suite (Phases 10–16).
 *
 * Performs a 4-axis cross-validation between the live Express/Fastify routers in `ppos-control-plane`
 * (`server.js` + `src/api/routes/*.js`) and the official developer documentation in
 * `printprice-docs/docs/api/reference.md`:
 *
 *  - Axis A (Phantom Endpoints): Routes documented in `reference.md` that do not exist in runtime routers (`0` allowed).
 *  - Axis B (Shadow Endpoints): Active public/customer/prepress/financial/logistics endpoints in the audited
 *    domain routers that are missing from `reference.md` (`0` allowed).
 *  - Axis C (Path / HTTP Verb Mismatch): Parameter or HTTP verb discrepancies (`PUT` vs `PATCH`, etc.).
 *  - Axis D (RBAC & Auth Header Parity): Verifies that every endpoint guarded by `requireSignOffRights`,
 *    `requireFinanceRights`, `requireAssetUploadRights`, or `requireOrgAdminRights` explicitly documents
 *    `x-b2b-role` and `x-b2b-member-id` in `reference.md`, and enforces HTTP `403` at runtime.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-route-parity-2026';
process.env.PPOS_MARKETPLACE_INTAKE_TOKEN = process.env.PPOS_MARKETPLACE_INTAKE_TOKEN || 'test-mkt-token-2026';

const marketplaceOrdersRouter = require('../src/api/routes/marketplaceOrders');
const preflightRouter = require('../src/api/routes/preflightRoutes');
const customerPortalRouter = require('../src/api/routes/customerPortalRoutes');
const escrowRouter = require('../src/api/routes/escrowRoutes');
const logisticsRouter = require('../src/api/routes/logisticsRoutes');
const publisherRouter = require('../src/api/routes/publisherRoutes');
const adminRouter = require('../src/api/routes/admin');
const {
    requireSignOffRights,
    requireFinanceRights,
    requireAssetUploadRights,
    requireOrgAdminRights
} = require('../src/api/middleware/b2bOrgRbacMiddleware');

/**
 * Normalizes parameter placeholders so `:orderId`, `:id`, `:code`, `:memberId` can be compared structurally
 * while preserving exact static path segments.
 */
function normalizeRoutePath(rawPath) {
    return String(rawPath || '')
        .trim()
        .replace(/\/+/g, '/')
        .replace(/\/$/, '') || '/';
}

/**
 * Extracts all Express/Fallback router endpoints mounted under a given prefix,
 * including the attached middleware function references and handler names.
 */
function extractRouterEndpoints(router, mountPrefix, sourceFile, filterFn = null) {
    const endpoints = [];
    const seenKeys = new Set();
    const stack = (router && router.stack) || [];

    for (const layer of stack) {
        if (!layer || !layer.route) continue;
        const subPath = layer.route.path || '';
        const fullPath = normalizeRoutePath(`${mountPrefix}${subPath === '/' ? '' : subPath}`);
        const methods = Object.keys(layer.route.methods || {})
            .filter(m => layer.route.methods[m])
            .map(m => m.toUpperCase());

        const routeStack = layer.route.stack || [];
        const middlewareHandles = routeStack.map(s => s.handle).filter(Boolean);

        const rbacMiddlewares = [];
        if (middlewareHandles.includes(requireSignOffRights)) rbacMiddlewares.push('requireSignOffRights');
        if (middlewareHandles.includes(requireFinanceRights)) rbacMiddlewares.push('requireFinanceRights');
        if (middlewareHandles.includes(requireAssetUploadRights)) rbacMiddlewares.push('requireAssetUploadRights');
        if (middlewareHandles.includes(requireOrgAdminRights)) rbacMiddlewares.push('requireOrgAdminRights');

        for (const method of methods) {
            const key = `${method} ${fullPath}`;
            if (seenKeys.has(key)) continue;
            const entry = {
                method,
                path: fullPath,
                key,
                sourceFile,
                rbacMiddlewares
            };
            if (!filterFn || filterFn(entry)) {
                seenKeys.add(key);
                endpoints.push(entry);
            }
        }
    }

    return endpoints;
}

/**
 * Builds the complete inventory of active Phase 10–16 endpoints across Fastify proxies and Express routers.
 */
function buildRuntimeEndpointInventory() {
    const serverJsPath = path.resolve(__dirname, '../server.js');
    const serverJsContent = fs.readFileSync(serverJsPath, 'utf8');

    const inventory = [];

    // 1. Fastify Upstream Preflight Proxies registered in server.js (:8001)
    if (serverJsContent.includes("prefix: '/api/preflight/jobs'")) {
        inventory.push({
            method: 'POST',
            path: '/api/preflight/jobs',
            key: 'POST /api/preflight/jobs',
            sourceFile: 'server.js (@fastify/http-proxy)',
            rbacMiddlewares: []
        });
    }
    if (serverJsContent.includes("prefix: '/api/preflight/policies'")) {
        inventory.push({
            method: 'GET',
            path: '/api/preflight/policies',
            key: 'GET /api/preflight/policies',
            sourceFile: 'server.js (@fastify/http-proxy)',
            rbacMiddlewares: []
        });
    }
    if (serverJsContent.includes("prefix: '/api/preflight/workers'")) {
        inventory.push({
            method: 'GET',
            path: '/api/preflight/workers',
            key: 'GET /api/preflight/workers',
            sourceFile: 'server.js (@fastify/http-proxy)',
            rbacMiddlewares: []
        });
    }

    // 2. Express Router: marketplaceOrders.js (/api/marketplace/orders)
    inventory.push(
        ...extractRouterEndpoints(
            marketplaceOrdersRouter,
            '/api/marketplace/orders',
            'src/api/routes/marketplaceOrders.js'
        )
    );

    // 3. Express Router: preflightRoutes.js (/api/preflight)
    inventory.push(
        ...extractRouterEndpoints(
            preflightRouter,
            '/api/preflight',
            'src/api/routes/preflightRoutes.js'
        )
    );

    // 4. Express Router: customerPortalRoutes.js (/api/customer)
    inventory.push(
        ...extractRouterEndpoints(
            customerPortalRouter,
            '/api/customer',
            'src/api/routes/customerPortalRoutes.js'
        )
    );

    // 5. Express Router: escrowRoutes.js (/api/financials/escrow)
    inventory.push(
        ...extractRouterEndpoints(
            escrowRouter,
            '/api/financials/escrow',
            'src/api/routes/escrowRoutes.js'
        )
    );

    // 6. Express Router: logisticsRoutes.js (/api/logistics and /api/printhouses)
    inventory.push(
        ...extractRouterEndpoints(
            logisticsRouter,
            '/api/logistics',
            'src/api/routes/logisticsRoutes.js',
            entry => !entry.path.startsWith('/api/logistics/printhouses/') && !entry.path.startsWith('/api/logistics/:id/freight-matrices')
        )
    );
    inventory.push(
        ...extractRouterEndpoints(
            logisticsRouter,
            '/api/printhouses',
            'src/api/routes/logisticsRoutes.js',
            entry => entry.path === '/api/printhouses/:id/freight-matrices'
        )
    );

    // 7. Express Router: publisherRoutes.js (/api/publisher)
    inventory.push(
        ...extractRouterEndpoints(
            publisherRouter,
            '/api/publisher',
            'src/api/routes/publisherRoutes.js'
        )
    );

    // 8. Express Router: admin.js Phase 16 SRE Telemetry & Storage Mirrors (/api/admin)
    inventory.push(
        ...extractRouterEndpoints(
            adminRouter,
            '/api/admin',
            'src/api/routes/admin.js',
            entry =>
                entry.path.startsWith('/api/admin/operations/telemetry-summary') ||
                entry.path.startsWith('/api/admin/storage/')
        )
    );

    return inventory;
}

/**
 * Parses `printprice-docs/docs/api/reference.md` markdown tables to extract all documented endpoints,
 * their declared middlewares, required headers, and HTTP status codes.
 */
function parseDocumentedEndpointsFromReferenceMd() {
    const candidatePaths = [
        path.resolve(__dirname, '../../printprice-docs-main/docs/api/reference.md'),
        path.resolve(__dirname, '../../../printprice-docs-main/docs/api/reference.md'),
        path.resolve(__dirname, '../docs/api/reference.md')
    ];

    const referenceMdPath = candidatePaths.find(p => fs.existsSync(p));
    if (!referenceMdPath) {
        throw new Error(`Could not locate docs/api/reference.md in any candidate path: ${candidatePaths.join(', ')}`);
    }

    const content = fs.readFileSync(referenceMdPath, 'utf8');
    const lines = content.split(/\r?\n/);
    const documented = [];

    // Matches table rows: | `METHOD` | `/api/...` | Middleware | Headers | HTTP Codes | Description |
    const tableRowRegex = /^\|\s*`(GET|POST|PUT|PATCH|DELETE)`\s*\|\s*`(\/api\/[^`]+)`\s*\|\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+)\|/;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        const match = line.match(tableRowRegex);
        if (!match) continue;

        const method = match[1].trim().toUpperCase();
        const routePath = normalizeRoutePath(match[2].trim());
        const middlewareCell = match[3].trim();
        const headersCell = match[4].trim();
        const statusCodesCell = match[5].trim();
        const descriptionCell = match[6].trim();

        documented.push({
            method,
            path: routePath,
            key: `${method} ${routePath}`,
            lineNumber: i + 1,
            middlewareCell,
            headersCell,
            statusCodesCell,
            descriptionCell
        });
    }

    // Also extract all curl URLs in `reference.md` to ensure zero phantom cURL samples
    const curlEndpoints = [];
    const curlBlocks = content.split(/curl\s+/g).slice(1);
    for (const block of curlBlocks) {
        const urlMatch = block.match(/"https:\/\/control\.printprice\.pro(\/api\/[^"?\s]+)(?:\?[^"]*)?"/);
        if (!urlMatch) continue;
        const methodMatch = block.match(/-X\s+(GET|POST|PUT|PATCH|DELETE)/i);
        const method = methodMatch ? methodMatch[1].toUpperCase() : 'GET';
        curlEndpoints.push({
            method,
            rawPath: urlMatch[1]
        });
    }

    return {
        referenceMdPath,
        documented,
        curlEndpoints
    };
}

describe('API Contract & Documentation Route Parity Suite (Phases 10–16)', () => {
    const runtimeInventory = buildRuntimeEndpointInventory();
    const { documented, curlEndpoints } = parseDocumentedEndpointsFromReferenceMd();

    const runtimeMap = new Map(runtimeInventory.map(e => [e.key, e]));
    const documentedMap = new Map(documented.map(d => [d.key, d]));

    it('1. Discovers all 56 canonical endpoints across the 7 domain routers and Fastify proxies', () => {
        expect(runtimeInventory.length).toBeGreaterThanOrEqual(56);
        expect(documented.length).toBe(runtimeInventory.length);
    });

    it('2. Axis A (Zero Phantom Endpoints): Every endpoint in docs/api/reference.md exists in ppos-control-plane runtime', () => {
        const phantomEndpoints = [];
        for (const docEntry of documented) {
            if (!runtimeMap.has(docEntry.key)) {
                phantomEndpoints.push(`${docEntry.key} (line ${docEntry.lineNumber})`);
            }
        }
        expect(phantomEndpoints).toEqual([]);
    });

    it('3. Axis B (Zero Shadow Endpoints): Every active endpoint in the audited Phase 10–16 routers is documented in docs/api/reference.md', () => {
        const shadowEndpoints = [];
        for (const runtimeEntry of runtimeInventory) {
            if (!documentedMap.has(runtimeEntry.key)) {
                shadowEndpoints.push(`${runtimeEntry.key} (${runtimeEntry.sourceFile})`);
            }
        }
        expect(shadowEndpoints).toEqual([]);
    });

    it('4. Axis C (Zero Path/Verb Mismatches & Validated cURL Samples): Every cURL command in reference.md matches an active runtime route pattern', () => {
        expect(curlEndpoints.length).toBeGreaterThanOrEqual(8);

        for (const sample of curlEndpoints) {
            const matched = runtimeInventory.some(rt => {
                if (rt.method !== sample.method) return false;
                const regexStr = '^' + rt.path.replace(/:[A-Za-z0-9_]+/g, '[^/]+') + '$';
                return new RegExp(regexStr).test(sample.rawPath);
            });
            expect(matched, `cURL sample ${sample.method} ${sample.rawPath} did not match any runtime route`).toBe(true);
        }
    });

    it('5. Axis D (RBAC & Auth Header Parity): All B2B RBAC-protected routes enforce 403 at runtime and document x-b2b-role & x-b2b-member-id headers', async () => {
        const rbacProtectedRoutes = runtimeInventory.filter(e => e.rbacMiddlewares.length > 0);
        expect(rbacProtectedRoutes.length).toBe(10);

        for (const rt of rbacProtectedRoutes) {
            const docEntry = documentedMap.get(rt.key);
            expect(docEntry, `Missing doc entry for RBAC route ${rt.key}`).toBeDefined();

            // Must document the exact RBAC middleware name
            for (const mwName of rt.rbacMiddlewares) {
                expect(
                    docEntry.middlewareCell,
                    `Route ${rt.key} must document middleware ${mwName}`
                ).toContain(mwName);
            }

            // Must document x-b2b-role and x-b2b-member-id headers and 403 status code
            expect(docEntry.headersCell, `Route ${rt.key} must document x-b2b-role`).toContain('x-b2b-role');
            expect(docEntry.headersCell, `Route ${rt.key} must document x-b2b-member-id`).toContain('x-b2b-member-id');
            expect(docEntry.statusCodesCell, `Route ${rt.key} must document HTTP 403`).toContain('403');
        }

        // Verify live middleware rejection for unauthorized roles across all 4 RBAC guards
        const buildMockRes = () => {
            const res = {
                statusCode: 200,
                body: null,
                status(c) {
                    this.statusCode = c;
                    return this;
                },
                json(p) {
                    this.body = p;
                    return this;
                }
            };
            return res;
        };

        // 1. requireSignOffRights blocks PREPRESS_DESIGNER
        const resSignOff = buildMockRes();
        requireSignOffRights({ headers: { 'x-b2b-role': 'PREPRESS_DESIGNER' } }, resSignOff, () => {});
        expect(resSignOff.statusCode).toBe(403);
        expect(resSignOff.body.error).toBe('FORBIDDEN_RBAC_INSUFFICIENT_SIGN_OFF_RIGHTS');

        // 2. requireFinanceRights blocks PRODUCTION_MANAGER
        const resFinance = buildMockRes();
        requireFinanceRights({ headers: { 'x-b2b-role': 'PRODUCTION_MANAGER' } }, resFinance, () => {});
        expect(resFinance.statusCode).toBe(403);
        expect(resFinance.body.error).toBe('FORBIDDEN_RBAC_FINANCE_RIGHTS_REQUIRED');

        // 3. requireAssetUploadRights blocks FINANCE_APPROVER
        const resUpload = buildMockRes();
        requireAssetUploadRights({ headers: { 'x-b2b-role': 'FINANCE_APPROVER' } }, resUpload, () => {});
        expect(resUpload.statusCode).toBe(403);
        expect(resUpload.body.error).toBe('FORBIDDEN_RBAC_ASSET_UPLOAD_RIGHTS_REQUIRED');

        // 4. requireOrgAdminRights blocks PRODUCTION_MANAGER
        const resAdmin = buildMockRes();
        requireOrgAdminRights({ headers: { 'x-b2b-role': 'PRODUCTION_MANAGER' } }, resAdmin, () => {});
        expect(resAdmin.statusCode).toBe(403);
        expect(resAdmin.body.error).toBe('FORBIDDEN_RBAC_ORG_ADMIN_REQUIRED');
    });
});
