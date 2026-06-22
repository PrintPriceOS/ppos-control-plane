const express = require('express');
const db = require('../services/mysqlClient');
const { resolveActorContext, requireApprovedPrinthouse } = require('../middleware/auth');
const printhouseService = require('../services/printhouseService');

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
        
        const STATUS_DB_TO_UI = { 'ACTIVE': 'Active', 'PENDING': 'Under Maintenance', 'SUSPENDED': 'Inactive' };

        // Post-process JSON fields for UI compatibility
        const formatted = rows.map(row => ({
            ...row,
            status: STATUS_DB_TO_UI[row.status] || row.status,
            signatures: typeof row.signatures === 'string' ? JSON.parse(row.signatures) : (row.signatures || []),
            limits: typeof row.limits === 'string' ? JSON.parse(row.limits) : (row.limits || {}),
            rates: typeof row.rates_json === 'string' ? JSON.parse(row.rates_json) : (row.rates_json || null),
            _id: row.id // Map id to _id for UI consistency if needed
        }));

        res.json({ ok: true, printhouses: formatted });
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

// POST /api/admin/printhouses/provision — Full admin-provisioned partner creation (7-step form data)
// This is the admin-mode equivalent of /api/auth/printhouse/register.
// Status is set ACTIVE immediately; no auto-login JWT returned.
router.post('/provision', async (req, res) => {
    const context = resolveActorContext(req);
    if (!context.isSuperAdmin) {
        return res.status(403).json({ ok: false, error: 'Only Super Admins can provision partners' });
    }

    const { companyName, email, password } = req.body;
    if (!companyName || !email || !password) {
        return res.status(400).json({ ok: false, error: 'Company name, email and password are required' });
    }

    try {
        const adminId = context.userId || context.email || 'unknown-admin';
        const result = await printhouseService.adminProvision(req.body, adminId);

        return res.status(201).json({
            ok: true,
            message: `Partner "${companyName}" provisioned successfully.`,
            ...result
        });
    } catch (err) {
        console.error('[ADMIN-PROVISION-ERROR]', err);
        return res.status(400).json({ ok: false, error: err.message });
    }
});

// POST /api/admin/printhouses - Create new printhouse (Super Admin only)
router.post('/', async (req, res) => {
    const context = resolveActorContext(req);
    if (!context.isSuperAdmin && !context.isPrinthouseUser) return res.status(403).json({ ok: false, error: 'Insufficient permissions' });

    const { 
        id, name, country, city, status, signatures, delivery_time, 
        production_lead_days, limits, rates,
        region, latitude, longitude, timezone, address_line
    } = req.body;
    
    if (!id || !name) return res.status(400).json({ ok: false, error: 'ID and Name are required' });

    try {
        await db.query(`
            INSERT INTO printer_nodes (
                id, tenant_id, name, country, city, status, 
                signatures, delivery_time, production_lead_days, limits, rates_json,
                email,
                region, latitude, longitude, timezone, address_line
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            id, context.tenantId, name, country, city, status === 'Active' ? 'ACTIVE' : 'PENDING',
            JSON.stringify(signatures || []),
            String(delivery_time),
            parseInt(production_lead_days) || 0,
            JSON.stringify(limits || {}),
            JSON.stringify(rates || {}),
            `ops+${id}@printprice.os`,
            region, latitude, longitude, timezone, address_line
        ]);

        res.status(201).json({ ok: true, id });
    } catch (err) {
        console.error('[PRINTHOUSES] Error creating printhouse:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// PUT /api/admin/printhouses/:id - Update printhouse
router.put('/:id', async (req, res) => {
    const context = resolveActorContext(req);
    const { id } = req.params;

    if (!context.isSuperAdmin) {
        if (!context.isPrinthouseUser) {
            return res.status(403).json({ ok: false, error: 'Insufficient permissions' });
        }
        const rows = await db.query('SELECT tenant_id FROM printer_nodes WHERE id = ?', [id]);
        if (!rows.length || rows[0].tenant_id !== context.tenantId) {
            return res.status(403).json({ ok: false, error: 'Cannot update printhouses outside your tenant' });
        }
    }

    const { 
        name, country, city, status, signatures, delivery_time, 
        production_lead_days, limits, rates,
        region, latitude, longitude, timezone, address_line
    } = req.body;

    try {
        const fields = [];
        const params = [];

        if (name) { fields.push('name = ?'); params.push(name); }
        if (country) { fields.push('country = ?'); params.push(country); }
        if (city) { fields.push('city = ?'); params.push(city); }
        if (status) { fields.push('status = ?'); params.push(status === 'Active' ? 'ACTIVE' : 'SUSPENDED'); }
        if (signatures) { fields.push('signatures = ?'); params.push(JSON.stringify(signatures)); }
        if (delivery_time) { fields.push('delivery_time = ?'); params.push(String(delivery_time)); }
        if (production_lead_days !== undefined) { fields.push('production_lead_days = ?'); params.push(parseInt(production_lead_days) || 0); }
        if (limits) { fields.push('limits = ?'); params.push(JSON.stringify(limits)); }
        if (rates) { fields.push('rates_json = ?'); params.push(JSON.stringify(rates)); }
        if (region) { fields.push('region = ?'); params.push(region); }
        if (latitude !== undefined) { fields.push('latitude = ?'); params.push(latitude); }
        if (longitude !== undefined) { fields.push('longitude = ?'); params.push(longitude); }
        if (timezone) { fields.push('timezone = ?'); params.push(timezone); }
        if (address_line) { fields.push('address_line = ?'); params.push(address_line); }

        if (fields.length === 0) return res.json({ ok: true, message: 'No changes' });

        params.push(id);
        await db.query(`UPDATE printer_nodes SET ${fields.join(', ')} WHERE id = ?`, params);

        res.json({ ok: true, message: 'Printhouse updated' });
    } catch (err) {
        console.error('[PRINTHOUSES] Error updating printhouse:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// DELETE /api/admin/printhouses/:id - Delete printhouse (Super Admin only)
router.delete('/:id', async (req, res) => {
    const context = resolveActorContext(req);
    if (!context.isSuperAdmin) {
        if (!context.isPrinthouseUser) {
            return res.status(403).json({ ok: false, error: 'Insufficient permissions' });
        }
        const rows = await db.query('SELECT tenant_id FROM printer_nodes WHERE id = ?', [req.params.id]);
        if (!rows.length || rows[0].tenant_id !== context.tenantId) {
            return res.status(403).json({ ok: false, error: 'Cannot delete printhouses outside your tenant' });
        }
    }

    try {
        await db.query('DELETE FROM printer_nodes WHERE id = ?', [req.params.id]);
        res.json({ ok: true, message: 'Printhouse deleted' });
    } catch (err) {
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
