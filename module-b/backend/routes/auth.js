'use strict';

/**
 * routes/auth.js — Authentication endpoints
 *
 * POST /api/auth/login   — verify credentials, issue JWT
 * POST /api/auth/logout  — invalidate current session token
 */

const express            = require('express');
const bcrypt             = require('bcryptjs');
const jwt                = require('jsonwebtoken');
const { requireAuth,
        invalidateToken } = require('../middleware');

const router = express.Router();
let db; // injected via init()

function init(database) {
    db = database;
}

// ─── POST /api/auth/login ─────────────────────────────────────────────────────

router.post('/login', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required.' });
    }

    // Look up user
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!user) {
        // Same response as wrong password — don't reveal whether username exists
        return res.status(401).json({ error: 'Invalid username or password.' });
    }

    // Verify password
    const valid = bcrypt.compareSync(password, user.password_hash);
    if (!valid) {
        return res.status(401).json({ error: 'Invalid username or password.' });
    }

    // Issue JWT
    // jti (JWT ID) is a unique identifier for this specific token — used for logout invalidation
    const jti   = `${user.id}-${Date.now()}`;
    const token = jwt.sign(
        {
            sub:      user.id,
            username: user.username,
            role:     user.role,
            jti
        },
        process.env.JWT_SECRET,
        { expiresIn: parseInt(process.env.JWT_EXPIRES_IN, 10) || 28800 }
    );

    console.log(`[Auth] Login: ${user.username}`);
    return res.json({
        token,
        expiresIn: parseInt(process.env.JWT_EXPIRES_IN, 10) || 28800,
        username:  user.username,
        role:      user.role
    });
});

// ─── POST /api/auth/logout ────────────────────────────────────────────────────

router.post('/logout', requireAuth, (req, res) => {
    invalidateToken(req.user.jti);
    console.log(`[Auth] Logout: ${req.user.username}`);
    return res.json({ message: 'Logged out successfully.' });
});

module.exports = { router, init };