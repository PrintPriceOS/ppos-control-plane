const express = require('express');
const db = require('../services/mysqlClient');
const { resolveActorContext, requireApprovedPrinthouse } = require('../middleware/auth');

const router = express.Router();

// GET /api/admin/printhouses - List nodes (scoping applied)
router.get('/', async (req, res) => {
    const context = resolveActorContext(req);
    try {
        let sql = 'SELECT * FROM printer_nodes WHERE 1=1';
        const params = [];

        if (!context.isSuperAdmin) {
            sql += ' AND tenant_id = ?';
            params.push(context.tenantId);
        }

        const rows = await db.query(sql, params);
        res.json({ ok: true, printhouses: rows });
    } catch (err) {
        console.error('[PRINTHOUSES] Error fetching printhouses:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// GET /api/admin/printhouses/capabilities - Get current node capabilities
router.get('/capabilities', requireApprovedPrinthouse, async (req, res) => {
    const context = resolveActorContext(req);
    if (!context.printhouseId) return res.status(400).json({ ok: false, error: 'Printhouse ID missing in context' });

    try {
        const rows = await db.query('SELECT * FROM printhouse_capabilities WHERE printhouse_id = ?', [context.printhouseId]);
        res.json({ ok: true, capabilities: rows[0] || null });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// POST /api/admin/printhouses/capabilities - Update node capabilities
router.post('/capabilities', requireApprovedPrinthouse, async (req, res) => {
    const context = resolveActorContext(req);
    const caps = req.body;

    try {
        // Upsert logic
        const existing = await db.query('SELECT id FROM printhouse_capabilities WHERE printhouse_id = ?', [context.printhouseId]);
        
        if (existing && existing.length > 0) {
            const fields = Object.keys(caps).filter(k => ![ 'id', 'printhouse_id', 'tenant_id', 'created_at', 'updated_at' ].includes(k));
            const setClause = fields.map(f => `${f} = ?`).join(', ');
            const values = fields.map(f => (typeof caps[f] === 'object' ? JSON.stringify(caps[f]) : caps[f]));
            
            await db.query(`UPDATE printhouse_capabilities SET ${setClause} WHERE printhouse_id = ?`, [...values, context.printhouseId]);
        } else {
            const fields = [ 'printhouse_id', 'tenant_id', ...Object.keys(caps) ];
            const placeholders = fields.map(() => '?').join(', ');
            const values = [ 
                context.printhouseId, 
                context.tenantId, 
                ...Object.values(caps).map(v => (typeof v === 'object' ? JSON.stringify(v) : v)) 
            ];
            
            await db.query(`INSERT INTO printhouse_capabilities (${fields.join(', ')}) VALUES (${placeholders})`, values);
        }

        res.json({ ok: true, message: 'Capabilities updated' });
    } catch (err) {
        console.error('[PRINTHOUSES] Error updating capabilities:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// PATCH /api/admin/printhouses/:id/status - Super Admin only: Approve/Suspend node
router.patch('/:id/status', async (req, res) => {
    const context = resolveActorContext(req);
    if (!context.isSuperAdmin) return res.status(403).json({ ok: false, error: 'Only Super Admins can change node status' });

    const { status } = req.body;
    const validStatuses = ['pending_review', 'active', 'suspended', 'rejected'];
    
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ ok: false, error: 'Invalid status' });
    }

    try {
        await db.query('UPDATE printer_nodes SET status = ? WHERE id = ?', [status, req.params.id]);
        res.json({ ok: true, message: `Node status updated to ${status}` });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

module.exports = router;
