'use strict';

/**
 * cardState.js — Shared card state singleton
 *
 * This is the bridge between Module C's event-driven world and
 * Module B's poll-driven frontend.
 *
 * Module C writes to this when card.inserted / card.removed fires.
 * POST /api/card/read reads from this every poll cycle.
 *
 * One object, one place, no circular imports.
 */

const cardState = {
    present:   false,   // true when card is inserted and SELECT succeeded
    patientId: null     // populated from cardReadPatientId() on insertion
};

module.exports = cardState;