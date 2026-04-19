'use strict';

/**
 * hardware.js — Hardware Abstraction Layer
 *
 * Exposes exactly four functions to the rest of Module B.
 * HARDWARE_MODE=false → mock implementations (no physical card needed)
 * HARDWARE_MODE=true  → real APDU calls via Module C (requires card + reader)
 *
 * The function signatures never change between modes.
 * All route handlers call these four functions only — they never talk to
 * the card layer directly. This is what makes Module B fully testable
 * without any hardware.
 */

const path = require('path');

const HARDWARE_MODE = process.env.HARDWARE_MODE === 'true';

// ─── Mock implementations ────────────────────────────────────────────────────

/**
 * Mock: reads pre-encoded test records from test-data.json.
 * Returns the same type as the real implementation: Array<Buffer(6)>
 */
async function mockReadAllRecords() {
    const testData = require('./test-data.json');
    return testData.records.map(hex => Buffer.from(hex, 'hex'));
}

async function mockWriteRecord(sixByteBuffer) {
    console.log(`[Hardware:MOCK] WRITE record: ${sixByteBuffer.toString('hex').toUpperCase()}`);
    return true;
}

async function mockReadPatientId() {
    const testData = require('./test-data.json');
    return testData.patientId;
}

async function mockGetMetadata() {
    const testData = require('./test-data.json');
    return { head: testData.records.length, tail: 0, count: testData.records.length };
}

// ─── Real implementations (Module C stubs) ───────────────────────────────────
// These will be replaced with actual Module C APDU calls in Phase 3.
// The stubs throw explicitly so any accidental call in HARDWARE_MODE=true
// fails loudly rather than silently returning wrong data.

async function realReadAllRecords() {
    // TODO (Module C): replace with cardLayer.cardReadAllRecords()
    throw new Error('realReadAllRecords() not yet implemented. Build Module C first.');
}

async function realWriteRecord(sixByteBuffer) {
    // TODO (Module C): replace with cardLayer.cardWriteRecord(sixByteBuffer)
    throw new Error('realWriteRecord() not yet implemented. Build Module C first.');
}

async function realReadPatientId() {
    // TODO (Module C): replace with cardLayer.cardReadPatientId()
    throw new Error('realReadPatientId() not yet implemented. Build Module C first.');
}

async function realGetMetadata() {
    // TODO (Module C): replace with cardLayer.cardGetMetadata()
    throw new Error('realGetMetadata() not yet implemented. Build Module C first.');
}

// ─── Exported interface ───────────────────────────────────────────────────────
// Route handlers import these four names only. The mode switch is invisible
// to everything outside this file.

/**
 * cardReadAllRecords()
 * @returns {Promise<Buffer[]>} — array of 6-byte Buffers, one per record
 */
async function cardReadAllRecords() {
    return HARDWARE_MODE ? realReadAllRecords() : mockReadAllRecords();
}

/**
 * cardWriteRecord(sixByteBuffer)
 * @param {Buffer} sixByteBuffer — exactly 6 bytes
 * @returns {Promise<boolean>} — true on success
 */
async function cardWriteRecord(sixByteBuffer) {
    if (!Buffer.isBuffer(sixByteBuffer) || sixByteBuffer.length !== 6) {
        throw new Error(`cardWriteRecord requires exactly 6 bytes. Got ${sixByteBuffer?.length}.`);
    }
    return HARDWARE_MODE ? realWriteRecord(sixByteBuffer) : mockWriteRecord(sixByteBuffer);
}

/**
 * cardReadPatientId()
 * @returns {Promise<string>} — patient ID string (up to 16 ASCII chars)
 */
async function cardReadPatientId() {
    return HARDWARE_MODE ? realReadPatientId() : mockReadPatientId();
}

/**
 * cardGetMetadata()
 * @returns {Promise<{head: number, tail: number, count: number}>}
 */
async function cardGetMetadata() {
    return HARDWARE_MODE ? realGetMetadata() : mockGetMetadata();
}

module.exports = {
    cardReadAllRecords,
    cardWriteRecord,
    cardReadPatientId,
    cardGetMetadata,
    HARDWARE_MODE
};