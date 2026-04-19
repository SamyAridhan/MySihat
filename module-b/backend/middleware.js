'use strict';

/**
 * middleware.js — Express authentication middleware
 *
 * Every API route except POST /api/auth/login runs through requireAuth().
 * If the Authorization header is missing, malformed, expired, or invalidated,
 * the request is rejected with 401 before any route handler runs.
 *
 * Token invalidation: when a doctor logs out, their token is added to
 * invalidatedTokens. This is an in-memory Set — it clears on server restart,
 * which is acceptable for a prototype (sessions are shift-length anyway).
 */

const jwt = require('jsonwebtoken');

// In-memory set of invalidated token JTIs (JWT IDs).
// Tokens in this set are rejected even if they have not expired.
const invalidatedTokens = new Set();

/**
 * requireAuth — Express middleware
 * Attach to any route that requires an authenticated session.
 */
function requireAuth(req, res, next) {
    const authHeader = req.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authorization header missing or malformed.' });
    }

    const token = authHeader.slice(7); // Strip "Bearer "

    let payload;
    try {
        payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Session expired. Please log in again.' });
        }
        return res.status(401).json({ error: 'Invalid session token.' });
    }

    // Check if this specific token has been invalidated (logged out)
    if (invalidatedTokens.has(payload.jti)) {
        return res.status(401).json({ error: 'Session has been logged out.' });
    }

    // Attach user info to request for use in route handlers
    req.user = {
        id:       payload.sub,
        username: payload.username,
        role:     payload.role,
        jti:      payload.jti
    };

    next();
}

/**
 * invalidateToken(jti)
 * Called by the logout route to mark a token as invalid.
 */
function invalidateToken(jti) {
    invalidatedTokens.add(jti);
}

module.exports = { requireAuth, invalidateToken };