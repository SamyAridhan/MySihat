'use strict';

/**
 * routes/codebook.js — Codebook endpoint
 *
 * GET /api/codebook — returns all diagnosis and medication entries
 *
 * Called once by the React frontend on startup to populate the
 * diagnosis and medication dropdowns in the New Record Form.
 * The frontend caches this response — it does not call this on every render.
 */

const express        = require('express');
const { requireAuth } = require('../middleware');
const codebook       = require('../codebook');

const router = express.Router();

// ─── GET /api/codebook ────────────────────────────────────────────────────────

router.get('/', requireAuth, (req, res) => {
    return res.json({
        diagnosis:  codebook.getAllDiagnoses(),
        medication: codebook.getAllMedications()
    });
});

module.exports = router;