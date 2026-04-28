'use strict';

/**
 * hardware.js — Hardware Abstraction Layer
 *
 * HARDWARE_MODE=false → mock implementations (no physical card needed)
 * HARDWARE_MODE=true  → real APDU calls via Module C card-service.js
 *
 * The four function signatures never change between modes.
 * Nothing outside this file knows which mode is active.
 */

const HARDWARE_MODE = process.env.HARDWARE_MODE === 'true';

// ─── Module C (real hardware) ─────────────────────────────────────────────────
// Only required when HARDWARE_MODE=true — avoids crashing in mock mode
// if card-service dependencies (pcsclite) are not installed.

let cardService;
if (HARDWARE_MODE) {
    cardService = require('../../module-c/card-service');
}

// ─── Mock implementations ─────────────────────────────────────────────────────

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

// ─── Exported interface ───────────────────────────────────────────────────────

/**
 * cardReadAllRecords()
 * @returns {Promise<Buffer[]>} — array of 6-byte Buffers, one per record
 */
async function cardReadAllRecords() {
    if (HARDWARE_MODE) return cardService.cardReadAllRecords();
    return mockReadAllRecords();
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
    if (HARDWARE_MODE) return cardService.cardWriteRecord(sixByteBuffer);
    return mockWriteRecord(sixByteBuffer);
}

/**
 * cardReadPatientId()
 * @returns {Promise<string>} — patient ID string
 */
async function cardReadPatientId() {
    if (HARDWARE_MODE) return cardService.cardReadPatientId();
    return mockReadPatientId();
}

/**
 * cardGetMetadata()
 * @returns {Promise<{head: number, tail: number, count: number}>}
 */
async function cardGetMetadata() {
    if (HARDWARE_MODE) return cardService.cardGetMetadata();
    return mockGetMetadata();
}

module.exports = {
    cardReadAllRecords,
    cardWriteRecord,
    cardReadPatientId,
    cardGetMetadata,
    HARDWARE_MODE
};