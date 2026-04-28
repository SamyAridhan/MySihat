'use strict';

/**
 * routes/card.js — Card interaction endpoint
 *
 * POST /api/card/read
 *
 * HARDWARE_MODE=false → calls mock hardware, returns test patient ID immediately
 * HARDWARE_MODE=true  → reads from cardState singleton (written by card.inserted event)
 *                       Returns 404 if no card is currently present
 *
 * The frontend polls this every 2 seconds while showing "Insert card" screen.
 * When cardState.present flips to true, the next poll returns the patient ID
 * and the frontend transitions to the history view.
 */

const express         = require('express');
const { requireAuth } = require('../middleware');
const hardware        = require('../hardware');

const router         = express.Router();
const HARDWARE_MODE  = process.env.HARDWARE_MODE === 'true';

// ─── POST /api/card/read ──────────────────────────────────────────────────────

router.post('/read', requireAuth, async (req, res) => {

    // ── Real hardware path ────────────────────────────────────────────────────
    if (HARDWARE_MODE) {
        const cardState = require('../cardState');

        if (!cardState.present) {
            // Card not inserted yet — frontend keeps polling
            return res.status(404).json({
                status: 'waiting',
                error:  'No card present. Insert patient card to continue.'
            });
        }

        console.log(`[Card] Poll hit — card present, patientId: ${cardState.patientId}`);
        return res.json({
            status:    'success',
            patientId: cardState.patientId
        });
    }

    // ── Mock path ─────────────────────────────────────────────────────────────
    try {
        const patientId = await hardware.cardReadPatientId();
        console.log(`[Card] Card read — patient: ${patientId} — mode: MOCK`);
        return res.json({ status: 'success', patientId });
    } catch (err) {
        console.error(`[Card] Mock read failed: ${err.message}`);
        return res.status(503).json({
            status: 'error',
            error:  'Card read failed.',
            detail: err.message
        });
    }
});

module.exports = router;