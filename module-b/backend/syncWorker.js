'use strict';

/**
 * syncWorker.js — Async background sync worker
 *
 * Runs every 30 seconds. Checks for internet connectivity, then POSTs
 * all unsynced SQLite records to the central server endpoint.
 *
 * Cardinal rule: data flows one direction only — Card → Clinic → Cloud.
 * This worker never pulls from the server, never overwrites local data,
 * and never touches the JavaCard. It is append-only backup.
 *
 * Conflicts are architecturally impossible — see DECISIONS_LOG Decision 006.
 */

const https = require('https');
const http  = require('http');

let db; // injected via start()

// ─── Connectivity check ───────────────────────────────────────────────────────

/**
 * isOnline()
 * Sends a HEAD request to CONNECTIVITY_CHECK_URL with a 3-second timeout.
 * Returns true if we get any HTTP response (even 4xx) — we only care that
 * the network is reachable, not that the endpoint returns 200.
 */
function isOnline() {
    return new Promise((resolve) => {
        const url      = process.env.CONNECTIVITY_CHECK_URL || 'https://1.1.1.1';
        const protocol = url.startsWith('https') ? https : http;

        const req = protocol.request(url, { method: 'HEAD' }, () => {
            resolve(true);
        });

        req.on('error', () => resolve(false));
        req.setTimeout(3000, () => {
            req.destroy();
            resolve(false);
        });

        req.end();
    });
}

// ─── Sync cycle ───────────────────────────────────────────────────────────────

async function runSyncCycle() {
    // 1. Check connectivity
    const online = await isOnline();
    if (!online) {
        const queued = db.prepare('SELECT COUNT(*) as n FROM records WHERE synced = 0').get().n;
        if (queued > 0) {
            console.log(`[Sync] Network offline. Queue: ${queued} record(s) waiting.`);
        }
        return;
    }

    // 2. Fetch up to 50 unsynced records
    const unsyncedRecords = db.prepare(`
        SELECT * FROM records
        WHERE synced = 0
        ORDER BY created_at ASC
        LIMIT 50
    `).all();

    if (unsyncedRecords.length === 0) {
        return; // Nothing to sync — log nothing (keep console clean during demos)
    }

    // 3. Assemble payload
    const payload = {
        clinicId:      process.env.CLINIC_ID || 'KLINIK-UNKNOWN',
        syncTimestamp: new Date().toISOString(),
        records:       unsyncedRecords.map(r => ({
            patientId:        r.patient_id,
            visitDate:        r.visit_date,
            diagnosisIntId:   r.diagnosis_int_id,
            diagnosisIcd10:   r.diagnosis_icd10,
            diagnosisText:    r.diagnosis_text,
            medicationIntId:  r.medication_int_id,
            medicationText:   r.medication_text,
            status:           r.status,
            compressedHex:    r.compressed_hex
        }))
    };

    const body = JSON.stringify(payload);

    // 4. POST to sync endpoint
    try {
        const statusCode = await postPayload(body);

        if (statusCode >= 200 && statusCode < 300) {
            // Mark all sent records as synced
            const ids = unsyncedRecords.map(r => r.id);
            const placeholders = ids.map(() => '?').join(',');
            db.prepare(`UPDATE records SET synced = 1 WHERE id IN (${placeholders})`).run(...ids);

            db.prepare(`
                INSERT INTO sync_log (attempted_at, records_sent, success)
                VALUES (?, ?, 1)
            `).run(new Date().toISOString(), unsyncedRecords.length);

            console.log(`[Sync] ✅ Synced ${unsyncedRecords.length} record(s) → HTTP ${statusCode}`);
        } else {
            throw new Error(`Server responded with HTTP ${statusCode}`);
        }
    } catch (err) {
        db.prepare(`
            INSERT INTO sync_log (attempted_at, records_sent, success, error_message)
            VALUES (?, 0, 0, ?)
        `).run(new Date().toISOString(), err.message);

        console.log(`[Sync] ❌ Sync failed: ${err.message}`);
    }
}

// ─── HTTP POST helper ─────────────────────────────────────────────────────────

function postPayload(body) {
    return new Promise((resolve, reject) => {
        const endpoint = process.env.SYNC_ENDPOINT || '';
        if (!endpoint || endpoint.includes('replace-with-your-id')) {
            reject(new Error('SYNC_ENDPOINT not configured in .env'));
            return;
        }

        const url      = new URL(endpoint);
        const protocol = url.protocol === 'https:' ? https : http;

        const options = {
            hostname: url.hostname,
            path:     url.pathname,
            method:   'POST',
            headers:  {
                'Content-Type':   'application/json',
                'Content-Length': Buffer.byteLength(body)
            }
        };

        const req = protocol.request(options, (res) => {
            resolve(res.statusCode);
        });

        req.on('error', reject);
        req.setTimeout(10000, () => {
            req.destroy();
            reject(new Error('Sync request timed out after 10 seconds'));
        });

        req.write(body);
        req.end();
    });
}

// ─── Public interface ─────────────────────────────────────────────────────────

/**
 * start(database)
 * Injects the SQLite db connection and starts the 30-second interval.
 * Called once from server.js after db is initialised.
 */
function start(database) {
    db = database;
    console.log('[Sync] Worker started — interval: 30 seconds');
    setInterval(runSyncCycle, 30 * 1000);

    // Run one cycle immediately on startup (catches any queue from previous session)
    runSyncCycle();
}

module.exports = { start };