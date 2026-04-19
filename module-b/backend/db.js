'use strict';

/**
 * db.js — SQLite database layer
 *
 * Responsibilities:
 *   1. Open the SQLite database file in WAL mode
 *   2. Create all four tables if they do not exist
 *   3. Seed one default doctor account on first run
 *   4. Export the database connection for use by routes and sync worker
 *
 * better-sqlite3 is synchronous by design — no async/await needed here.
 * All queries in routes run synchronously against this single connection.
 */

const Database = require('better-sqlite3');
const bcrypt   = require('bcryptjs');
const path     = require('path');

const DB_PATH = path.join(__dirname, 'mysihat.db');

// Open (or create) the database file
const db = new Database(DB_PATH);

// ─── WAL mode ────────────────────────────────────────────────────────────────
// Write-Ahead Logging: atomic transactions, crash-safe, allows concurrent reads.
// Must be set before any table creation.
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ─── Schema ──────────────────────────────────────────────────────────────────

db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        username      TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role          TEXT DEFAULT 'doctor',
        created_at    TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS patients (
        patient_id    TEXT PRIMARY KEY,
        name          TEXT,
        ic_number     TEXT UNIQUE,
        date_of_birth TEXT,
        created_at    TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS records (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        patient_id        TEXT NOT NULL,
        visit_date        TEXT NOT NULL,
        diagnosis_text    TEXT NOT NULL,
        diagnosis_int_id  INTEGER NOT NULL,
        diagnosis_icd10   TEXT NOT NULL,
        medication_text   TEXT NOT NULL,
        medication_int_id INTEGER NOT NULL,
        status            TEXT DEFAULT 'Active',
        compressed_hex    TEXT NOT NULL,
        synced            INTEGER DEFAULT 0,
        created_at        TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (patient_id) REFERENCES patients(patient_id)
    );

    CREATE TABLE IF NOT EXISTS sync_log (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        attempted_at  TEXT NOT NULL,
        records_sent  INTEGER,
        success       INTEGER,
        error_message TEXT
    );
`);

// ─── Default user seed ───────────────────────────────────────────────────────
// Creates one doctor account on first run only.
// Credentials: dr_ahmad / password123
// Change this password before any real clinic use.

const existingUser = db.prepare('SELECT id FROM users WHERE username = ?').get('dr_ahmad');
if (!existingUser) {
    const hash = bcrypt.hashSync('password123', 10);
    db.prepare(`
        INSERT INTO users (username, password_hash, role)
        VALUES (?, ?, 'doctor')
    `).run('dr_ahmad', hash);
    console.log('[DB] Default user seeded: dr_ahmad / password123');
}

console.log(`[DB] Connected — ${DB_PATH}`);

module.exports = db;