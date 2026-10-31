// src/api/middleware/requireAdmin.js
const auth = require('./auth');
module.exports = auth.requireAdmin;
