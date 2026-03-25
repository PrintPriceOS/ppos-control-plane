// src/api/routes/printhousesAdmin.js
const express = require('express');
const { ObjectId } = require('mongodb');
const { getDb } = require('../services/mongoClient');

const router = express.Router();

// GET /api/admin/printhouses
router.get('/', async (req, res) => {
    try {
        const db = await getDb();
        const printhouses = await db.collection('printhouses').find({}).toArray();
        res.json({ ok: true, printhouses });
    } catch (err) {
        console.error('[PRINTHOUSES] Error fetching printhouses:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// POST /api/admin/printhouses
router.post('/', async (req, res) => {
    try {
        const db = await getDb();
        const result = await db.collection('printhouses').insertOne({
            ...req.body,
            createdAt: new Date(),
            updatedAt: new Date()
        });
        res.status(201).json({ ok: true, id: result.insertedId });
    } catch (err) {
        console.error('[PRINTHOUSES] Error creating printhouse:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// PUT /api/admin/printhouses/:id
router.put('/:id', async (req, res) => {
    try {
        const db = await getDb();
        const result = await db.collection('printhouses').updateOne(
            { _id: new ObjectId(req.params.id) },
            { $set: { ...req.body, updatedAt: new Date() } }
        );
        if (result.matchedCount === 0) {
            return res.status(404).json({ ok: false, error: 'Printhouse not found' });
        }
        res.json({ ok: true });
    } catch (err) {
        console.error('[PRINTHOUSES] Error updating printhouse:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// DELETE /api/admin/printhouses/:id
router.delete('/:id', async (req, res) => {
    try {
        const db = await getDb();
        const result = await db.collection('printhouses').deleteOne(
            { _id: new ObjectId(req.params.id) }
        );
        if (result.deletedCount === 0) {
            return res.status(404).json({ ok: false, error: 'Printhouse not found' });
        }
        res.json({ ok: true });
    } catch (err) {
        console.error('[PRINTHOUSES] Error deleting printhouse:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

module.exports = router;
