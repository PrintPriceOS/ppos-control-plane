'use strict';

/**
 * src/api/routes/copilotRoutes.js
 *
 * Phase 200 — DOT Copilot Express API Routes
 *
 * Exposes SSE streaming chat and autocomplete entity retrieval for
 * the resident DOT Copilot assistant in PrintPrice OS Control Plane.
 */

const express = require('express');
const router = express.Router();
const { processCopilotChat, getSearchableEntities, applyCopilotAction } = require('../services/copilot/dotCopilotService');
const { getRegistryState, resolveGeminiModel } = require('../services/copilot/modelRegistryService');

/**
 * Helper to extract tenant / printhouse ID from request headers or auth context.
 */
function extractPrinthouseContext(req) {
    const headerId = req.headers['x-printhouse-id'] || req.headers['x-tenant-id'];
    const authUser = req.user || req.raw?.user;
    const authId = authUser?.printhouseId || authUser?.tenantId;
    return String(headerId || authId || 'node-primary');
}

/**
 * POST /api/copilot/chat
 * Streams conversational SSE events: status, tool_start, tool_result, token, done.
 */
router.post('/chat', async (req, res) => {
    const printhouseId = extractPrinthouseContext(req);
    const { messages = [], context = {}, mode = 'ask', sessionId } = req.body || {};

    // Validate messages array
    if (!Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({
            ok: false,
            error: 'MISSING_MESSAGES',
            message: 'A non-empty messages array is required.'
        });
    }

    // Prepare Server-Sent Events headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (typeof res.flushHeaders === 'function') {
        res.flushHeaders();
    }

    const mergedContext = {
        ...context,
        printhouseId,
        sessionId: sessionId || `session-${Date.now()}`
    };

    const sendEvent = (event, data) => {
        if (!res.writableEnded) {
            res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
            if (typeof res.flush === 'function') {
                res.flush();
            }
        }
    };

    try {
        await processCopilotChat({
            messages,
            context: mergedContext,
            mode,
            onEvent: sendEvent
        });
    } catch (err) {
        console.error('[copilotRoutes] Stream error:', err);
        sendEvent('error', { message: err.message || 'Error processing copilot chat' });
    } finally {
        if (!res.writableEnded) {
            res.end();
        }
    }
});

/**
 * GET /api/copilot/entities
 * Returns searchable printhouse entities for the '@' mention composer autocomplete.
 */
router.get('/entities', async (req, res) => {
    const printhouseId = extractPrinthouseContext(req);
    try {
        const entities = await getSearchableEntities(printhouseId);
        return res.json({
            ok: true,
            printhouseId,
            entities
        });
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * POST /api/copilot/actions/:actionId/confirm
 * Applies a confirmed mutation in Act mode (e.g. machinery setup, profile/SLA update) with multi-tenant isolation.
 */
router.post('/actions/:actionId/confirm', async (req, res) => {
    const printhouseId = extractPrinthouseContext(req);
    const { actionId } = req.params;
    const { actionType, payload } = req.body || {};

    try {
        const result = await applyCopilotAction({
            actionId,
            actionType,
            payload,
            printhouseId
        });
        return res.json({
            ok: true,
            actionId,
            printhouseId,
            ...result
        });
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/copilot/models
 * Returns the dynamic Gemini models status and cache metadata.
 */
router.get('/models', async (req, res) => {
    try {
        const activeFast = await resolveGeminiModel('fast');
        const activeReasoning = await resolveGeminiModel('reasoning');
        const state = getRegistryState();

        return res.json({
            ok: true,
            activeFast,
            activeReasoning,
            registry: state
        });
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
    }
});

module.exports = router;
