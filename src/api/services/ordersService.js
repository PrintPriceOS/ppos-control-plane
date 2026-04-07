// src/api/services/ordersService.js
const { query } = require('./mysqlClient');

const VALID_STATUSES = ['pending', 'reviewing', 'in_production', 'shipped', 'delivered', 'cancelled'];
const UPDATABLE_FIELDS = ['status', 'specs', 'offer_print_house', 'offer_price'];

async function listOrders({ status, user_id, limit = 50, offset = 0 }) {
    const where = [];
    const params = [];

    if (status) { where.push('status = ?'); params.push(status); }
    if (user_id) { where.push('user_id = ?'); params.push(user_id); }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [countRow] = await query(
        `SELECT COUNT(*) AS total FROM orders ${whereSql}`,
        params
    );

    const rows = await query(
        `SELECT * FROM orders ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
        [...params, Number(limit), Number(offset)]
    );

    return { total: Number(countRow.total), orders: rows };
}

async function getOrder(id) {
    const rows = await query('SELECT * FROM orders WHERE id = ?', [id]);
    return rows[0] || null;
}

async function getOrderByRef(order_ref) {
    const rows = await query('SELECT * FROM orders WHERE order_ref = ?', [order_ref]);
    return rows[0] || null;
}

async function createOrder({ order_ref, user_id, specs, offer_print_house, offer_price, status }) {
    const result = await query(
        `INSERT INTO orders (order_ref, user_id, specs, offer_print_house, offer_price, status)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
            order_ref,
            user_id,
            typeof specs === 'object' ? JSON.stringify(specs) : specs,
            offer_print_house,
            offer_price,
            status || 'pending'
        ]
    );
    return result.insertId;
}

async function updateOrder(id, updates) {
    const fields = Object.keys(updates).filter(k => UPDATABLE_FIELDS.includes(k));
    if (fields.length === 0) return false;

    if (updates.status && !VALID_STATUSES.includes(updates.status)) {
        throw new Error(`Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`);
    }

    const setClause = fields.map(f => `${f} = ?`).join(', ');
    const values = fields.map(f => {
        if (f === 'specs' && typeof updates[f] === 'object') return JSON.stringify(updates[f]);
        return updates[f];
    });

    const result = await query(
        `UPDATE orders SET ${setClause} WHERE id = ?`,
        [...values, id]
    );

    return result.affectedRows > 0;
}

async function deleteOrder(id) {
    const result = await query('DELETE FROM orders WHERE id = ?', [id]);
    return result.affectedRows > 0;
}

module.exports = { listOrders, getOrder, getOrderByRef, createOrder, updateOrder, deleteOrder, VALID_STATUSES };
