'use strict';

/**
 * routes/card.js — Card interaction endpoint
 *
 * POST /api/card/read — detect card and return patient ID
 *
 * This endpoint is what the React frontend polls while showing
 * "Please insert patient card". On success it returns the patient ID
 * so the frontend can immediately fetch that patient's history.
 */

const express        = require('express');
const { requireAuth } = require('../middleware');
const hardware       = require('../hardware');

const router = express.Router();

// ─── POST /api/card/read ──────────────────────────────────────────────────────

router.post('/read', requireAuth, async (req, res) => {
    try {
        const patientId = await hardware.cardReadPatientId();

        console.log(`[Card] Card read — patient: ${patientId} — mode: ${hardware.HARDWARE_MODE ? 'REAL' : 'MOCK'}`);

        return res.json({
            status:    'success',
            patientId
        });
    } catch (err) {
        console.error(`[Card] Read failed: ${err.message}`);
        return res.status(503).json({
            status: 'error',
            error:  'Card read failed. Ensure card is fully inserted.',
            detail: err.message
        });
    }
});

module.exports = router;