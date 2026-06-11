const express = require('express');
const router = express.Router();

router.get('/records', (req, res) => res.json([]));
router.get('/records/:settlementRecordId', (req, res) => res.json({}));
router.get('/summary', (req, res) => res.json({}));

module.exports = router;
