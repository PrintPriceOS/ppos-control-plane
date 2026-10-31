// src/api/services/mongoClient.js
const { MongoClient } = require('mongodb');

let client = null;
let db = null;

async function getDb() {
    if (db) return db;

    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/control_plane';
    client = new MongoClient(uri);
    await client.connect();
    db = client.db();

    console.log('[MONGO] Connected to MongoDB');
    return db;
}

module.exports = { getDb };
