'use strict';

/**
 * server.js — MySihat Backend Entry Point
 *
 * Startup sequence (order matters):
 *   1. Load environment variables (.env)
 *   2. Load and validate codebook — server refuses to start if codebook is invalid
 *   3. Initialise SQLite database and schema
 *   4. Register Express middleware and routes
 *   5. Start sync worker
 *   6. Start card reader (HARDWARE_MODE=true only)
 *   7. Begin listening
 */

// ─── 1. Environment ───────────────────────────────────────────────────────────
require('dotenv').config();

const express = require('express');
const cors    = require('cors');

// ─── 2. Codebook ──────────────────────────────────────────────────────────────
const codebook = require('./codebook');
try {
    codebook.loadCodebook();
} catch (err) {
    console.error(`\n[FATAL] Codebook validation failed:\n  ${err.message}\n`);
    process.exit(1);
}

// ─── 3. Database ──────────────────────────────────────────────────────────────
const db = require('./db');

// ─── 4. Express app ───────────────────────────────────────────────────────────
const app = express();

app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());

// ── Routes ────────────────────────────────────────────────────────────────────
const authRoute     = require('./routes/auth');
const cardRoute     = require('./routes/card');
const patientRoute  = require('./routes/patient');
const syncRoute     = require('./routes/sync');
const codebookRoute = require('./routes/codebook');

authRoute.init(db);
patientRoute.init(db);
syncRoute.init(db);

app.use('/api/auth',     authRoute.router);
app.use('/api/card',     cardRoute);
app.use('/api/patient',  patientRoute.router);
app.use('/api/sync',     syncRoute.router);
app.use('/api/codebook', codebookRoute);

app.use((req, res) => {
    res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
});

app.use((err, req, res, next) => {
    console.error(`[Error] ${err.message}`);
    res.status(500).json({ error: 'Internal server error.' });
});

// ─── 5. Sync worker ───────────────────────────────────────────────────────────
const syncWorker = require('./syncWorker');
syncWorker.start(db);

// ─── 6. Card reader (HARDWARE_MODE=true only) ─────────────────────────────────
const HARDWARE_MODE = process.env.HARDWARE_MODE === 'true';

if (HARDWARE_MODE) {
    const cardState   = require('./cardState');
    const { initReader, cardEvents, cardReadPatientId } = require('../../module-c/card-service');

    initReader()
        .then(readerName => {
            console.log(`[Hardware] Card reader ready: ${readerName}`);

            // card.inserted → read patient ID → update shared state
            cardEvents.on('card.inserted', async () => {
                console.log('[Card] Insertion event — reading patient ID...');
                try {
                    const patientId      = await cardReadPatientId();
                    cardState.present   = true;
                    cardState.patientId = patientId || null;
                    console.log(`[Card] State updated → present=true, patientId="${cardState.patientId}"`);
                } catch (err) {
                    console.error(`[Card] Failed to read patient ID on insertion: ${err.message}`);
                    cardState.present   = false;
                    cardState.patientId = null;
                }
            });

            // card.removed → clear shared state
            cardEvents.on('card.removed', () => {
                console.log('[Card] Removal event — cardState cleared.');
                cardState.present   = false;
                cardState.patientId = null;
            });
        })
        .catch(err => {
            console.error(`[Hardware] Reader init failed: ${err.message}`);
            console.error('[Hardware] Check that ACR39U is plugged in and PC/SC service is running.');
            // Server continues without hardware — all card endpoints will return 503
        });
} else {
    console.log('[Hardware] HARDWARE_MODE=false — using mock card interface.');
}

// ─── 7. Listen ────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`\n[Server] MySihat backend running on http://localhost:${PORT}`);
    console.log(`[Server] Hardware mode: ${HARDWARE_MODE ? 'REAL (JavaCard)' : 'MOCK (test data)'}`);
    console.log(`[Server] Clinic ID: ${process.env.CLINIC_ID || 'not set'}\n`);
});