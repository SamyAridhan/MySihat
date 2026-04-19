'use strict';

/**
 * routes/sync.js — Sync status endpoint
 *
 * GET /api/sync/status — returns queue count, last sync attempt, network status
 * Used by the persistent sync status bar in the React frontend.
 */

const express        = require('express');
const https          = require('https');
const http           = require('http');
const { requireAuth } = require('../middleware');

const router = express.Router();
let db;

function init(database) {
    db = database;
}

// Quick connectivity check (same logic as syncWorker, duplicated to avoid coupling)
function checkOnline() {
    return new Promise((resolve) => {
        const url      = process.env.CONNECTIVITY_CHECK_URL || 'https://1.1.1.1';
        const protocol = url.startsWith('https') ? https : http;
        const req      = protocol.request(url, { method: 'HEAD' }, () => resolve(true));
        req.on('error', () => resolve(false));
        req.setTimeout(3000, () => { req.destroy(); resolve(false); });
        req.end();
    });
}

// ─── GET /api/sync/status ─────────────────────────────────────────────────────

router.get('/status', requireAuth, async (req, res) => {
    const queuedCount = db.prepare(
        'SELECT COUNT(*) as n FROM records WHERE synced = 0'
    ).get().n;

    const lastLog = db.prepare(`
        SELECT attempted_at, success, error_message
        FROM sync_log
        ORDER BY id DESC
        LIMIT 1
    `).get();

    const lastSuccess = db.prepare(`
        SELECT attempted_at FROM sync_log WHERE success = 1 ORDER BY id DESC LIMIT 1
    `).get();

    const online = await checkOnline();

    return res.json({
        queuedRecords:    queuedCount,
        networkStatus:    online ? 'online' : 'offline',
        lastSyncAttempt:  lastLog?.attempted_at   || null,
        lastSyncSuccess:  lastSuccess?.attempted_at || null,
        lastSyncError:    lastLog?.success === 0 ? lastLog.error_message : null
    });
});

module.exports = { router, init };