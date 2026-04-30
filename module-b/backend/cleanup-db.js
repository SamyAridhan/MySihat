// cleanup-db.js
// Clears stale records from SQLite so the UI reads fresh from the card.
// Run from: C:\Users\samyh\Desktop\MySihat\MySihat\module-b\backend\
// Usage:    node cleanup-db.js
//
// This does NOT touch the users table (dr_ahmad login is preserved).
// After running this, restart the server and insert the card.
// The server will read all 14 records off the card and populate SQLite fresh.

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'mysihat.db');

let db;
try {
    db = new Database(DB_PATH);
    console.log('[DB] Connected:', DB_PATH);
} catch (err) {
    console.error('[DB] Could not open database:', err.message);
    process.exit(1);
}

// Show what we are about to delete
const before = db.prepare("SELECT COUNT(*) as count FROM records").get();
console.log(`[DB] Records currently in SQLite: ${before.count}`);

const syncLog = db.prepare("SELECT COUNT(*) as count FROM sync_log").get();
console.log(`[DB] Sync log entries: ${syncLog.count}`);

// Delete all medical records (the card is now the source of truth)
const deleteRecords = db.prepare("DELETE FROM records");
const result = deleteRecords.run();
console.log(`[DB] Deleted ${result.changes} record(s) from records table.`);

// Optionally clear sync log (comment this out if you want to keep sync history)
const deleteSyncLog = db.prepare("DELETE FROM sync_log");
const syncResult = deleteSyncLog.run();
console.log(`[DB] Cleared ${syncResult.changes} entry(s) from sync_log table.`);

// Verify users table is untouched
const users = db.prepare("SELECT username, role FROM users").all();
console.log(`[DB] Users preserved: ${users.map(u => u.username).join(', ')}`);

db.close();

console.log('');
console.log('Done. Restart the server, then insert the card.');
console.log('The server will read all 14 records off the card on first poll.');