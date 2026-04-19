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
 *   6. Begin listening
 */

// ─── 1. Environment ───────────────────────────────────────────────────────────
require('dotenv').config();

const express = require('express');
const cors    = require('cors');

// ─── 2. Codebook ──────────────────────────────────────────────────────────────
// Must load before routes — encode/decode used in patient routes.
// Throws and exits if any codebook entry fails validation.
const codebook = require('./codebook');
try {
    codebook.loadCodebook();
} catch (err) {
    console.error(`\n[FATAL] Codebook validation failed:\n  ${err.message}\n`);
    console.error('Server cannot start with an invalid codebook. Fix codebook.json and restart.\n');
    process.exit(1);
}

// ─── 3. Database ──────────────────────────────────────────────────────────────
const db = require('./db');

// ─── 4. Express app ───────────────────────────────────────────────────────────
const app = express();

app.use(cors({ origin: 'http://localhost:5173' }));  // React dev server only
app.use(express.json());

// ── Routes ────────────────────────────────────────────────────────────────────

const authRoute     = require('./routes/auth');
const cardRoute     = require('./routes/card');
const patientRoute  = require('./routes/patient');
const syncRoute     = require('./routes/sync');
const codebookRoute = require('./routes/codebook');

// Inject db into routes that need it
authRoute.init(db);
patientRoute.init(db);
syncRoute.init(db);

app.use('/api/auth',    authRoute.router);
app.use('/api/card',    cardRoute);
app.use('/api/patient', patientRoute.router);
app.use('/api/sync',    syncRoute.router);
app.use('/api/codebook', codebookRoute);

// ── 404 fallback ──────────────────────────────────────────────────────────────
app.use((req, res) => {
    res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, req, res, next) => {
    console.error(`[Error] ${err.message}`);
    res.status(500).json({ error: 'Internal server error.' });
});

// ─── 5. Sync worker ───────────────────────────────────────────────────────────
const syncWorker = require('./syncWorker');
syncWorker.start(db);

// ─── 6. Listen ────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`\n[Server] MySihat backend running on http://localhost:${PORT}`);
    console.log(`[Server] Hardware mode: ${process.env.HARDWARE_MODE === 'true' ? 'REAL (JavaCard)' : 'MOCK (test data)'}`);
    console.log(`[Server] Clinic ID: ${process.env.CLINIC_ID || 'not set'}\n`);
});