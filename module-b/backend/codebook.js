'use strict';

/**
 * MySihat Codebook — Single source of truth for diagnosis and medication lookups.
 *
 * Responsibilities:
 *   1. Load codebook.json and validate all entries at startup
 *   2. Build forward maps  (text → intId + icd10) and
 *              reverse maps (intId → text + icd10)
 *   3. Expose encode() — human strings + date → 6-byte Buffer
 *   4. Expose decode() — 6-byte Buffer → human strings + date
 *
 * This module is loaded ONCE at server startup via loadCodebook().
 * All subsequent calls to encode/decode use the in-memory maps — no disk I/O.
 *
 * Hard rules enforced at load time (server refuses to start if violated):
 *   - Every diagnosis entry must have a non-empty icd10 field
 *   - Every intId must be unique within its section (diagnosis / medication)
 *   - Every intId must be within Tier 1 range: 0x0001–0x03E8 (1–1000)
 *   - Medication entries are exempt from the icd10 requirement
 */

const fs   = require('fs');
const path = require('path');

// ─── Internal state ──────────────────────────────────────────────────────────

// Forward lookups: text (lowercase) → entry object
let diagnosisByText   = new Map();
let medicationByText  = new Map();

// Reverse lookups: intId (number) → entry object
let diagnosisById     = new Map();
let medicationById    = new Map();

let loaded = false;

// ─── Constants ───────────────────────────────────────────────────────────────

const TIER1_MIN = 0x0001;  // 1
const TIER1_MAX = 0x03E8;  // 1000
const RECORD_SIZE = 6;

// ─── Load and Validate ───────────────────────────────────────────────────────

/**
 * loadCodebook()
 *
 * Must be called once before encode() or decode() are used.
 * Throws a descriptive Error if any validation rule is violated —
 * the caller (server startup) should catch this and exit the process.
 *
 * @param {string} [codebookPath] — optional override for testing
 */
function loadCodebook(codebookPath) {
    const filePath = codebookPath || path.join(__dirname, 'data', 'codebook.json');

    // ── Read file ─────────────────────────────────────────────────────────────
    let raw;
    try {
        raw = fs.readFileSync(filePath, 'utf8');
    } catch (err) {
        throw new Error(`Codebook file not found at ${filePath}: ${err.message}`);
    }

    let codebook;
    try {
        codebook = JSON.parse(raw);
    } catch (err) {
        throw new Error(`Codebook JSON parse failed: ${err.message}`);
    }

    if (!Array.isArray(codebook.diagnosis) || !Array.isArray(codebook.medication)) {
        throw new Error('Codebook must have "diagnosis" and "medication" arrays.');
    }

    // ── Validate and index diagnosis entries ──────────────────────────────────
    const seenDiagIds = new Set();

    for (const entry of codebook.diagnosis) {
        // Required fields present
        if (entry.intId === undefined || !entry.text || !entry.icd10) {
            throw new Error(
                `Codebook diagnosis entry intId=${entry.intId} is missing required field(s). ` +
                `Every diagnosis entry must have intId, text, and icd10.`
            );
        }

        // icd10 must be non-empty string
        if (typeof entry.icd10 !== 'string' || entry.icd10.trim() === '') {
            throw new Error(
                `Codebook entry intId=${entry.intId} has an empty icd10 field. ` +
                `Every diagnosis entry must have a valid ICD-10 code.`
            );
        }

        // intId must be within Tier 1 range
        if (entry.intId < TIER1_MIN || entry.intId > TIER1_MAX) {
            throw new Error(
                `Codebook entry intId=${entry.intId} ("${entry.text}") is outside ` +
                `Tier 1 range (1–1000). IDs outside this range indicate a data entry error.`
            );
        }

        // intId must be unique
        if (seenDiagIds.has(entry.intId)) {
            throw new Error(
                `Codebook has duplicate diagnosis intId=${entry.intId}. ` +
                `Duplicate IDs cause silent wrong-string decoding.`
            );
        }
        seenDiagIds.add(entry.intId);

        // Build maps
        const record = {
            intId:  entry.intId,
            icd10:  entry.icd10.trim(),
            text:   entry.text.trim()
        };
        diagnosisByText.set(entry.text.trim().toLowerCase(), record);
        diagnosisById.set(entry.intId, record);
    }

    // ── Validate and index medication entries ─────────────────────────────────
    const seenMedIds = new Set();

    for (const entry of codebook.medication) {
        // Required fields present (no icd10 required for medications)
        if (entry.intId === undefined || !entry.text) {
            throw new Error(
                `Codebook medication entry intId=${entry.intId} is missing required field(s). ` +
                `Every medication entry must have intId and text.`
            );
        }

        // intId must be within Tier 1 range
        if (entry.intId < TIER1_MIN || entry.intId > TIER1_MAX) {
            throw new Error(
                `Codebook medication entry intId=${entry.intId} ("${entry.text}") is outside ` +
                `Tier 1 range (1–1000).`
            );
        }

        // intId must be unique
        if (seenMedIds.has(entry.intId)) {
            throw new Error(
                `Codebook has duplicate medication intId=${entry.intId}. ` +
                `Duplicate IDs cause silent wrong-string decoding.`
            );
        }
        seenMedIds.add(entry.intId);

        const record = {
            intId: entry.intId,
            text:  entry.text.trim()
        };
        medicationByText.set(entry.text.trim().toLowerCase(), record);
        medicationById.set(entry.intId, record);
    }

    loaded = true;
    console.log(
        `[Codebook] Loaded successfully — ` +
        `${diagnosisById.size} diagnoses, ${medicationById.size} medications.`
    );
}

// ─── Guard ───────────────────────────────────────────────────────────────────

function assertLoaded() {
    if (!loaded) {
        throw new Error('Codebook not loaded. Call loadCodebook() at server startup before encode/decode.');
    }
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

/**
 * packDate("YYYY-MM-DD") → uint16 packed date
 *
 * Bit layout:
 *   [15:9] = year offset from 2000 (7 bits, range 0–127)
 *   [8:5]  = month (4 bits, range 1–12)
 *   [4:0]  = day   (5 bits, range 1–31)
 */
function packDate(dateString) {
    const parts = dateString.split('-');
    if (parts.length !== 3) {
        throw new Error(`Invalid date format "${dateString}". Expected YYYY-MM-DD.`);
    }

    const year  = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const day   = parseInt(parts[2], 10);

    if (year < 2000 || year > 2127) {
        throw new Error(`Date year ${year} out of range. Supported: 2000–2127.`);
    }
    if (month < 1 || month > 12) {
        throw new Error(`Date month ${month} out of range. Must be 1–12.`);
    }
    if (day < 1 || day > 31) {
        throw new Error(`Date day ${day} out of range. Must be 1–31.`);
    }

    const yearOffset = year - 2000;
    return (yearOffset << 9) | (month << 5) | day;
}

/**
 * unpackDate(uint16) → "YYYY-MM-DD"
 */
function unpackDate(packed) {
    const day        = packed & 0x1F;
    const month      = (packed >> 5) & 0x0F;
    const yearOffset = (packed >> 9) & 0x7F;
    const year       = 2000 + yearOffset;

    const mm = String(month).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    return `${year}-${mm}-${dd}`;
}

// ─── Encode ──────────────────────────────────────────────────────────────────

/**
 * encode(diagnosisText, medicationText, dateString) → Buffer(6)
 *
 * Compresses one medical record into a 6-byte Buffer ready to be
 * written to the JavaCard applet via APPEND RECORD (INS 0x10).
 *
 * Throws if:
 *   - diagnosisText not found in codebook
 *   - medicationText not found in codebook
 *   - dateString is invalid or out of supported range
 *
 * @param {string} diagnosisText  — must match codebook text exactly (case-insensitive)
 * @param {string} medicationText — must match codebook text exactly (case-insensitive)
 * @param {string} dateString     — "YYYY-MM-DD"
 * @returns {Buffer} 6-byte compressed record
 */
function encode(diagnosisText, medicationText, dateString) {
    assertLoaded();

    // ── Diagnosis lookup ──────────────────────────────────────────────────────
    const diagEntry = diagnosisByText.get(diagnosisText.trim().toLowerCase());
    if (!diagEntry) {
        // Per Decision 013: hard-fail with explicit message. No silent stubs.
        throw new Error(`Diagnosis not in prototype codebook: "${diagnosisText}"`);
    }

    // ── Medication lookup ─────────────────────────────────────────────────────
    const medEntry = medicationByText.get(medicationText.trim().toLowerCase());
    if (!medEntry) {
        throw new Error(`Medication not in prototype codebook: "${medicationText}"`);
    }

    // ── Date packing ──────────────────────────────────────────────────────────
    const datePacked = packDate(dateString);

    // ── Assemble 6-byte Buffer ────────────────────────────────────────────────
    // Byte 0–1: diagnosisId  (uint16 big-endian)
    // Byte 2–3: medicationId (uint16 big-endian)
    // Byte 4–5: datePacked   (uint16 big-endian)
    const buf = Buffer.alloc(RECORD_SIZE);
    buf.writeUInt16BE(diagEntry.intId, 0);
    buf.writeUInt16BE(medEntry.intId,  2);
    buf.writeUInt16BE(datePacked,      4);

    return buf;
}

// ─── Decode ──────────────────────────────────────────────────────────────────

/**
 * decode(buffer) → decoded record object
 *
 * Expands a 6-byte Buffer from the JavaCard applet back into
 * human-readable fields for display and sync payloads.
 *
 * @param {Buffer} buffer — exactly 6 bytes
 * @returns {{ diagnosisText, diagnosisIcd10, diagnosisIntId,
 *             medicationText, medicationIntId,
 *             date }}
 */
function decode(buffer) {
    assertLoaded();

    if (!Buffer.isBuffer(buffer) || buffer.length !== RECORD_SIZE) {
        throw new Error(
            `decode() requires a Buffer of exactly ${RECORD_SIZE} bytes. ` +
            `Got ${buffer ? buffer.length : 'null'} bytes.`
        );
    }

    // ── Extract raw integers ──────────────────────────────────────────────────
    const diagId     = buffer.readUInt16BE(0);
    const medId      = buffer.readUInt16BE(2);
    const datePacked = buffer.readUInt16BE(4);

    // ── Diagnosis reverse lookup ──────────────────────────────────────────────
    const diagEntry = diagnosisById.get(diagId);
    if (!diagEntry) {
        throw new Error(
            `Decode failed: diagnosis intId=${diagId} not found in codebook. ` +
            `Card may contain records written with a different codebook version.`
        );
    }

    // ── Medication reverse lookup ─────────────────────────────────────────────
    const medEntry = medicationById.get(medId);
    if (!medEntry) {
        throw new Error(
            `Decode failed: medication intId=${medId} not found in codebook. ` +
            `Card may contain records written with a different codebook version.`
        );
    }

    // ── Date unpacking ────────────────────────────────────────────────────────
    const dateString = unpackDate(datePacked);

    return {
        diagnosisIntId:  diagId,
        diagnosisText:   diagEntry.text,
        diagnosisIcd10:  diagEntry.icd10,
        medicationIntId: medId,
        medicationText:  medEntry.text,
        date:            dateString
    };
}

// ─── Accessors ────────────────────────────────────────────────────────────────

/**
 * getAllDiagnoses() → Array of all diagnosis entries (for React dropdown)
 * getAllMedications() → Array of all medication entries (for React dropdown)
 */
function getAllDiagnoses() {
    assertLoaded();
    return Array.from(diagnosisById.values());
}

function getAllMedications() {
    assertLoaded();
    return Array.from(medicationById.values());
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
    loadCodebook,
    encode,
    decode,
    getAllDiagnoses,
    getAllMedications
};