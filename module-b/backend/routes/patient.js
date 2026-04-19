'use strict';

/**
 * routes/patient.js — Patient record endpoints
 *
 * GET  /api/patient/:patientId/history — return full decoded medical history
 * POST /api/patient/:patientId/record  — save a new medical record
 */

const express        = require('express');
const { requireAuth } = require('../middleware');
const hardware       = require('../hardware');
const codebook       = require('../codebook');

const router = express.Router();
let db;

function init(database) {
    db = database;
}

// ─── GET /api/patient/:patientId/history ──────────────────────────────────────

router.get('/:patientId/history', requireAuth, async (req, res) => {
    const { patientId } = req.params;

    // 1. Check SQLite first — fastest path, has full data including status
    const existingRecords = db.prepare(`
        SELECT * FROM records
        WHERE patient_id = ?
        ORDER BY visit_date DESC
    `).all(patientId);

    if (existingRecords.length > 0) {
        return res.json({
            patientId,
            source:  'sqlite',
            records: existingRecords.map(formatRecord)
        });
    }

    // 2. SQLite empty — read from card (first visit or new clinic)
    try {
        const rawBuffers = await hardware.cardReadAllRecords();

        if (rawBuffers.length === 0) {
            return res.json({ patientId, source: 'card', records: [] });
        }

        // Ensure patient exists in patients table
        const existingPatient = db.prepare('SELECT patient_id FROM patients WHERE patient_id = ?').get(patientId);
        if (!existingPatient) {
            db.prepare(`
                INSERT INTO patients (patient_id) VALUES (?)
            `).run(patientId);
        }

        // Decode each buffer and save to SQLite
        const insertRecord = db.prepare(`
            INSERT INTO records
                (patient_id, visit_date, diagnosis_text, diagnosis_int_id, diagnosis_icd10,
                 medication_text, medication_int_id, status, compressed_hex, synced)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'Active', ?, 0)
        `);

        const insertMany = db.transaction((buffers) => {
            for (const buf of buffers) {
                const decoded = codebook.decode(buf);
                insertRecord.run(
                    patientId,
                    decoded.date,
                    decoded.diagnosisText,
                    decoded.diagnosisIntId,
                    decoded.diagnosisIcd10,
                    decoded.medicationText,
                    decoded.medicationIntId,
                    buf.toString('hex')
                );
            }
        });

        insertMany(rawBuffers);

        // Return the newly inserted records
        const newRecords = db.prepare(`
            SELECT * FROM records
            WHERE patient_id = ?
            ORDER BY visit_date DESC
        `).all(patientId);

        console.log(`[Patient] Loaded ${newRecords.length} record(s) from card for ${patientId}`);

        return res.json({
            patientId,
            source:  'card',
            records: newRecords.map(formatRecord)
        });

    } catch (err) {
        console.error(`[Patient] Card read error: ${err.message}`);
        return res.status(503).json({
            error:  'Could not read records from card.',
            detail: err.message
        });
    }
});

// ─── POST /api/patient/:patientId/record ──────────────────────────────────────

router.post('/:patientId/record', requireAuth, async (req, res) => {
    const { patientId }                       = req.params;
    const { diagnosis, medication, date, status } = req.body;

    // 1. Validate all fields present
    if (!diagnosis || !medication || !date || !status) {
        return res.status(400).json({
            error: 'All fields are required: diagnosis, medication, date, status.'
        });
    }

    // 2. Validate status value
    const validStatuses = ['Active', 'Resolved', 'Critical'];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({
            error: `Invalid status "${status}". Must be one of: ${validStatuses.join(', ')}.`
        });
    }

    // 3. Encode — codebook.encode() throws if diagnosis/medication not in codebook
    let sixByteBuffer;
    try {
        sixByteBuffer = codebook.encode(diagnosis, medication, date);
    } catch (err) {
        // Per Decision 013: hard-fail. Return the exact error message.
        return res.status(422).json({ error: err.message });
    }

    // 4. Write to card (mock logs the hex, real sends APDU)
    try {
        await hardware.cardWriteRecord(sixByteBuffer);
    } catch (err) {
        return res.status(503).json({
            error:  'Failed to write record to card.',
            detail: err.message
        });
    }

    // 5. Decode to get ICD-10 and int IDs for SQLite storage
    const decoded = codebook.decode(sixByteBuffer);

    // 6. Ensure patient exists
    const existingPatient = db.prepare('SELECT patient_id FROM patients WHERE patient_id = ?').get(patientId);
    if (!existingPatient) {
        db.prepare('INSERT INTO patients (patient_id) VALUES (?)').run(patientId);
    }

    // 7. Save full record to SQLite
    const result = db.prepare(`
        INSERT INTO records
            (patient_id, visit_date, diagnosis_text, diagnosis_int_id, diagnosis_icd10,
             medication_text, medication_int_id, status, compressed_hex, synced)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `).run(
        patientId,
        decoded.date,
        decoded.diagnosisText,
        decoded.diagnosisIntId,
        decoded.diagnosisIcd10,
        decoded.medicationText,
        decoded.medicationIntId,
        status,
        sixByteBuffer.toString('hex')
    );

    console.log(`[Patient] New record saved — patient: ${patientId}, diagnosis: ${decoded.diagnosisText} (${decoded.diagnosisIcd10})`);

    return res.json({
        status:         'saved',
        id:             result.lastInsertRowid,
        compressedHex:  sixByteBuffer.toString('hex'),
        diagnosisIcd10: decoded.diagnosisIcd10,
        syncQueued:     true
    });
});

// ─── Helper ───────────────────────────────────────────────────────────────────

function formatRecord(r) {
    return {
        id:              r.id,
        date:            r.visit_date,
        diagnosisText:   r.diagnosis_text,
        diagnosisIcd10:  r.diagnosis_icd10,
        medicationText:  r.medication_text,
        status:          r.status,
        compressedHex:   r.compressed_hex,
        synced:          r.synced === 1
    };
}

module.exports = { router, init };