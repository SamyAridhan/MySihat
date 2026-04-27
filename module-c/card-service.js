/**
 * MySihat — Module C
 * card-service.js — Hardware Abstraction Implementation
 *
 * Exposes exactly four functions to Module B:
 *   cardReadAllRecords()  → Array<Buffer(6)>
 *   cardWriteRecord(buf)  → true
 *   cardReadPatientId()   → string (16-char ASCII, trimmed)
 *   cardGetMetadata()     → { head, tail, count }
 *
 * Also exposes:
 *   initReader()          → Promise — call once on server startup
 *   cardEvents            → EventEmitter — 'card.inserted', 'card.removed'
 *
 * Module B imports this file and calls these functions.
 * All APDU logic is hidden here. Module B never touches APDU bytes.
 *
 * Usage:
 *   const card = require('./card-service');
 *   await card.initReader();
 *   const records = await card.cardReadAllRecords();
 */

'use strict';

const pcsclite     = require('pcsclite');
const EventEmitter = require('events');

// ── Constants ─────────────────────────────────────────────────────────────────

const PROTOCOL = 2; // SCARD_PROTOCOL_T1 — confirmed T=1 on Feitian A22CR

const MYSIHAT_AID = Buffer.from([
    0xA0, 0x00, 0x00, 0x00,
    0x62, 0x03, 0x01, 0x0C, 0x01
]);

const APDU = {
    SELECT: Buffer.from([
        0x00, 0xA4, 0x04, 0x00,
        MYSIHAT_AID.length,
        ...MYSIHAT_AID
    ]),
    READ_ALL:        Buffer.from([0x80, 0x20, 0x00, 0x00, 0x00]),
    GET_METADATA:    Buffer.from([0x80, 0x30, 0x00, 0x00, 0x06]),
    READ_PATIENT_ID: Buffer.from([0x80, 0x50, 0x00, 0x00, 0x10]),
};

// Settling delay between card insertion and first APDU (contact pin stabilisation)
const SETTLE_MS = 200;

// ── Internal state ────────────────────────────────────────────────────────────

let _pcsc          = null;
let _reader        = null;
let _selected      = false;
let _sessionActive = false;

// Public event emitter — Module B listens to these
const cardEvents = new EventEmitter();

// ── Low-level transmit ────────────────────────────────────────────────────────

function transmit(apdu) {
    return new Promise((resolve, reject) => {
        if (!_reader) return reject(new Error('No reader connected'));
        _reader.transmit(apdu, 256, PROTOCOL, (err, response) => {
            if (err) return reject(new Error(`APDU transmission failed: ${err.message}`));
            const sw1 = response[response.length - 2];
            const sw2 = response[response.length - 1];
            if (sw1 === 0x90 && sw2 === 0x00) {
                resolve(response.slice(0, response.length - 2));
            } else {
                const sw = sw1.toString(16).toUpperCase().padStart(2, '0') +
                           sw2.toString(16).toUpperCase().padStart(2, '0');
                reject(new Error(`Card error: ${sw} — ${interpretStatus(sw1, sw2)}`));
            }
        });
    });
}

function interpretStatus(sw1, sw2) {
    if (sw1 === 0x6A && sw2 === 0x82) return 'Applet not found — check AID';
    if (sw1 === 0x69 && sw2 === 0x86) return 'Command not allowed — applet not selected';
    if (sw1 === 0x6F && sw2 === 0x00) return 'Applet internal error — check Module A';
    if (sw1 === 0x67 && sw2 === 0x00) return 'Wrong Lc/Le length — APDU construction error';
    if (sw1 === 0x6D && sw2 === 0x00) return 'INS not supported';
    return 'Unknown status word';
}

// ── SELECT (internal) ─────────────────────────────────────────────────────────

async function ensureSelected() {
    if (_selected) return;
    await transmit(APDU.SELECT);
    _selected = true;
}

// ── initReader ────────────────────────────────────────────────────────────────

/**
 * Initialise the PC/SC reader. Call once on Node.js server startup.
 *
 * Returns: Promise<string> — resolves with reader name when reader is found.
 * Rejects if no reader is detected within 10 seconds.
 *
 * Side effects:
 *   - Registers card insertion/removal handlers
 *   - Auto-SELECTs MySihat applet on card insertion (after 200ms settle)
 *   - Emits 'card.inserted' and 'card.removed' on cardEvents
 */
function initReader() {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error(
                'No PC/SC reader detected within 10 seconds. Is the ACR39U plugged in?'
            ));
        }, 10000);

        _pcsc = pcsclite();

        _pcsc.on('reader', function (reader) {
            clearTimeout(timeout);
            _reader = reader;

            reader.on('error', (err) => {
                console.error('[card-service] Reader error:', err.message);
            });

            reader.on('status', function (status) {
                const cardPresent  = !!(status.state & reader.SCARD_STATE_PRESENT);
                const cardChanged  = !!(status.state & reader.SCARD_STATE_CHANGED);

                if (!cardChanged) return;

                if (cardPresent && !_sessionActive) {
                    // ── Card inserted ─────────────────────────────────────────
                    _sessionActive = true;
                    _selected      = false;

                    setTimeout(() => {
                        reader.connect({ share_mode: reader.SCARD_SHARE_SHARED }, (err) => {
                            if (err) {
                                console.error('[card-service] Connect error:', err.message);
                                _sessionActive = false;
                                return;
                            }
                            transmit(APDU.SELECT)
                                .then(() => {
                                    _selected = true;
                                    cardEvents.emit('card.inserted');
                                })
                                .catch((err) => {
                                    console.error('[card-service] Auto-SELECT failed:', err.message);
                                    cardEvents.emit('card.inserted'); // emit anyway — caller handles retry
                                });
                        });
                    }, SETTLE_MS);

                } else if (!cardPresent && _sessionActive) {
                    // ── Card removed ──────────────────────────────────────────
                    _sessionActive = false;
                    _selected      = false;
                    reader.disconnect(reader.SCARD_LEAVE_CARD, () => {});
                    cardEvents.emit('card.removed');
                }
            });

            reader.on('end', () => {
                console.error('[card-service] Reader disconnected.');
                cardEvents.emit('reader.disconnected');
            });

            resolve(reader.name);
        });

        _pcsc.on('error', (err) => {
            clearTimeout(timeout);
            reject(new Error(`PC/SC error: ${err.message}`));
        });
    });
}

// ── The Four Interface Functions ──────────────────────────────────────────────

/**
 * Read all records from the JavaCard circular buffer.
 *
 * Returns: Array<Buffer(6)>
 *   Each element is one 6-byte compressed record in write order (oldest first).
 *   Empty array if no records on card.
 * Throws if card not present or APDU fails.
 */
async function cardReadAllRecords() {
    await ensureSelected();
    const raw = await transmit(APDU.READ_ALL);
    if (raw.length === 0) return [];
    if (raw.length % 6 !== 0) {
        throw new Error(`READ ALL returned ${raw.length} bytes — not a multiple of 6`);
    }
    const records = [];
    for (let i = 0; i < raw.length; i += 6) {
        records.push(Buffer.from(raw.slice(i, i + 6)));
    }
    return records;
}

/**
 * Write one compressed record to the JavaCard circular buffer.
 *
 * Accepts: Buffer(6) — exactly 6 bytes.
 * Returns: true on success.
 * Throws on invalid input or APDU failure.
 */
async function cardWriteRecord(sixByteBuffer) {
    if (!Buffer.isBuffer(sixByteBuffer) || sixByteBuffer.length !== 6) {
        throw new Error(
            `cardWriteRecord requires exactly 6 bytes, got ${sixByteBuffer?.length ?? typeof sixByteBuffer}`
        );
    }
    await ensureSelected();
    const apdu = Buffer.from([
        0x80, 0x10, 0x00, 0x00, 0x06,
        ...sixByteBuffer
    ]);
    await transmit(apdu);
    return true;
}

/**
 * Read the 16-byte Patient ID from the card.
 *
 * Returns: string — ASCII patient ID, trailing nulls/spaces trimmed.
 * Example: "MY-2026-000142"
 */
async function cardReadPatientId() {
    await ensureSelected();
    const raw = await transmit(APDU.READ_PATIENT_ID);
    return raw.toString('ascii').replace(/[\x00\s]+$/, '');
}

/**
 * Read HEAD, TAIL, COUNT diagnostic metadata from the applet.
 *
 * Returns: { head: number, tail: number, count: number }
 */
async function cardGetMetadata() {
    await ensureSelected();
    const raw = await transmit(APDU.GET_METADATA);
    return {
        head:  (raw[0] << 8) | raw[1],
        tail:  (raw[2] << 8) | raw[3],
        count: (raw[4] << 8) | raw[5]
    };
}

// ── Dev-only helpers (test use only, not part of production interface) ────────

async function _transmitDirect(apdu) {
    return transmit(apdu);
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
    initReader,
    cardEvents,
    cardReadAllRecords,
    cardWriteRecord,
    cardReadPatientId,
    cardGetMetadata,
    _transmitDirect 
};