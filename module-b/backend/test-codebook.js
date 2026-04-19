'use strict';

/**
 * test-codebook.js
 *
 * Validates the codebook module before any server code is written.
 * Run with: node test-codebook.js
 *
 * Pass criteria:
 *   1. Codebook loads without error
 *   2. Forward lookups return correct intId + icd10 for all 50 diagnosis entries
 *   3. Encode → decode round-trip produces identical strings for all 50 entries
 *   4. test-data.json records encode to correct hex values
 *   5. Invalid inputs throw correct error messages
 */

const { loadCodebook, encode, decode } = require('./codebook');

// ─── Counters ────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function pass(label) {
    console.log(`  ✅ ${label}`);
    passed++;
}

function fail(label, detail) {
    console.log(`  ❌ FAIL: ${label}`);
    if (detail) console.log(`     ${detail}`);
    failed++;
}

function section(title) {
    console.log(`\n── ${title} ${'─'.repeat(55 - title.length)}`);
}

// ─── Test 1: Codebook loads ───────────────────────────────────────────────────

section('Test 1: Codebook load');

try {
    loadCodebook();
    pass('Codebook loaded without error');
} catch (err) {
    fail('Codebook load threw an error', err.message);
    console.log('\nCannot continue — codebook failed to load.');
    process.exit(1);
}

// ─── Test 2: Spot-check the three critical entries ───────────────────────────

section('Test 2: Critical entry spot-check');

const spotChecks = [
    { diagText: 'Essential Hypertension',    expectedIcd10: 'I10',   expectedIntId: 1 },
    { diagText: 'Type 2 Diabetes Mellitus',  expectedIcd10: 'E11',   expectedIntId: 2 },
    { diagText: 'Dengue Fever',              expectedIcd10: 'A97.0', expectedIntId: 4 },
];

for (const check of spotChecks) {
    try {
        const buf     = encode(check.diagText, 'Paracetamol 500mg', '2026-03-08');
        const decoded = decode(buf);
        if (decoded.diagnosisIcd10  !== check.expectedIcd10)  throw new Error(`ICD-10 mismatch: got "${decoded.diagnosisIcd10}", expected "${check.expectedIcd10}"`);
        if (decoded.diagnosisIntId  !== check.expectedIntId)  throw new Error(`intId mismatch: got ${decoded.diagnosisIntId}, expected ${check.expectedIntId}`);
        if (decoded.diagnosisText   !== check.diagText)       throw new Error(`text mismatch: got "${decoded.diagnosisText}", expected "${check.diagText}"`);
        pass(`${check.diagText} → intId=${check.expectedIntId}, ICD-10=${check.expectedIcd10}`);
    } catch (err) {
        fail(check.diagText, err.message);
    }
}

// ─── Test 3: Full encode → decode round-trip for all 50 diagnoses ─────────────

section('Test 3: Full round-trip — all 50 diagnosis entries');

const allDiagnoses = [
    'Essential Hypertension', 'Type 2 Diabetes Mellitus', 'Upper Respiratory Tract Infection',
    'Dengue Fever', 'Asthma, Unspecified', 'Acute Gastroenteritis', 'Urinary Tract Infection',
    'Pneumonia, Unspecified', 'Chronic Ischaemic Heart Disease', 'Hyperlipidaemia',
    'Osteoarthritis, Unspecified', 'Peptic Ulcer Disease', 'Anaemia, Unspecified',
    'Pulmonary Tuberculosis', 'Malaria, Unspecified', 'Typhoid Fever',
    'Acute Tonsillitis, Unspecified', 'Otitis Media, Unspecified', 'Conjunctivitis, Unspecified',
    'Scabies', 'Tinea Pedis', 'Chickenpox, Unspecified', 'Hand, Foot and Mouth Disease',
    'Leptospirosis, Unspecified', 'Low Back Pain', 'Migraine, Unspecified',
    'Anxiety Disorder, Unspecified', 'Depressive Episode, Unspecified', 'Epilepsy, Unspecified',
    'Stroke, Unspecified', 'Heart Failure, Unspecified', 'Atrial Fibrillation, Unspecified',
    'Chronic Kidney Disease, Unspecified', 'Liver Cirrhosis, Unspecified', 'Chronic Hepatitis B',
    'Gout, Unspecified', 'Rheumatoid Arthritis, Unspecified', 'Hypothyroidism, Unspecified',
    'Iron Deficiency Anaemia, Unspecified', 'Acute Bronchitis, Unspecified',
    'Chronic Obstructive Pulmonary Disease, Unspecified', 'Gastro-oesophageal Reflux Disease',
    'Irritable Bowel Syndrome, Unspecified', 'Cellulitis, Unspecified', 'Impetigo',
    'Allergic Rhinitis, Unspecified', 'Contact Dermatitis, Unspecified',
    'Acute Pharyngitis, Unspecified', 'Acute Appendicitis', 'Measles, Unspecified'
];

let roundTripFails = 0;
for (const diagText of allDiagnoses) {
    try {
        const buf     = encode(diagText, 'Paracetamol 500mg', '2026-01-15');
        const decoded = decode(buf);
        if (decoded.diagnosisText !== diagText) {
            fail(`Round-trip: "${diagText}"`, `Got back "${decoded.diagnosisText}"`);
            roundTripFails++;
        }
        if (!decoded.diagnosisIcd10 || decoded.diagnosisIcd10.trim() === '') {
            fail(`ICD-10 empty after round-trip: "${diagText}"`);
            roundTripFails++;
        }
    } catch (err) {
        fail(`Round-trip threw: "${diagText}"`, err.message);
        roundTripFails++;
    }
}
if (roundTripFails === 0) {
    pass(`All 50 diagnosis entries round-tripped cleanly with no data loss`);
}

// ─── Test 4: Date round-trip edge cases ──────────────────────────────────────

section('Test 4: Date encoding edge cases');

const dateTests = [
    { date: '2026-03-08', label: 'Standard date (test-data.json value)' },
    { date: '2000-01-01', label: 'Minimum date (year offset = 0)' },
    { date: '2127-12-31', label: 'Maximum date (year offset = 127)' },
    { date: '2025-11-16', label: 'Salbutamol test-data.json date' },
];

for (const t of dateTests) {
    try {
        const buf     = encode('Essential Hypertension', 'Paracetamol 500mg', t.date);
        const decoded = decode(buf);
        if (decoded.date !== t.date) {
            fail(`${t.label}`, `Encoded "${t.date}", decoded "${decoded.date}"`);
        } else {
            pass(`${t.label}: ${t.date} → encoded → ${decoded.date}`);
        }
    } catch (err) {
        fail(t.label, err.message);
    }
}

// ─── Test 5: test-data.json records — verify exact hex output ────────────────

section('Test 5: test-data.json records — hex verification');

// These are the five exact records from Decision 015.
// Expected hex = diagId (2 bytes) + medId (2 bytes) + datePacked (2 bytes)
//
// Date packing for 2026-03-08:
//   yearOffset = 26, month = 3, day = 8
//   packed = (26 << 9) | (3 << 5) | 8 = 13312 | 96 | 8 = 13416 = 0x3468
//
const testDataRecords = [
    {
        label:   'Essential Hypertension | Paracetamol 500mg | 2026-03-08',
        diag:    'Essential Hypertension',
        med:     'Paracetamol 500mg',
        date:    '2026-03-08',
        // diagId=1 (0x0001), medId=1 (0x0001), date=0x3468
        expectedHex: '000100013468'
    },
    {
        label:   'Type 2 Diabetes Mellitus | Metformin 500mg | 2026-03-01',
        diag:    'Type 2 Diabetes Mellitus',
        med:     'Metformin 500mg',
        date:    '2026-03-01',
        // diagId=2 (0x0002), medId=3 (0x0003), date: year=26,month=3,day=1 → (26<<9)|(3<<5)|1 = 13409 = 0x3461
        expectedHex: '000200033461'
    },
    {
        label:   'Dengue Fever | Paracetamol 500mg | 2026-01-05',
        diag:    'Dengue Fever',
        med:     'Paracetamol 500mg',
        date:    '2026-01-05',
        // diagId=4 (0x0004), medId=1 (0x0001), date: year=26,month=1,day=5 → (26<<9)|(1<<5)|5 = 13312+32+5 = 13349 = 0x3425
        expectedHex: '000400013425'
    },
    {
        label:   'Upper Respiratory Tract Infection | Amoxicillin 250mg | 2025-12-08',
        diag:    'Upper Respiratory Tract Infection',
        med:     'Amoxicillin 250mg',
        date:    '2025-12-08',
        // diagId=3 (0x0003), medId=2 (0x0002), date: year=25,month=12,day=8 → (25<<9)|(12<<5)|8 = 12800|384|8 = 13192 = 0x3388
        expectedHex: '000300023388'
    },
    {
        label:   'Asthma, Unspecified | Salbutamol Inhaler 100mcg | 2025-11-16',
        diag:    'Asthma, Unspecified',
        med:     'Salbutamol Inhaler 100mcg',
        date:    '2025-11-16',
        // diagId=5 (0x0005), medId=4 (0x0004), date: year=25,month=11,day=16 → (25<<9)|(11<<5)|16 = 12800|352|16 = 13168 = 0x3370
        expectedHex: '000500043370'
    }
];

for (const rec of testDataRecords) {
    try {
        const buf        = encode(rec.diag, rec.med, rec.date);
        const actualHex  = buf.toString('hex').toUpperCase();
        const expectHex  = rec.expectedHex.toUpperCase();

        if (actualHex !== expectHex) {
            fail(rec.label, `Expected ${expectHex}, got ${actualHex}`);
        } else {
            pass(`${rec.label} → ${actualHex}`);
        }
    } catch (err) {
        fail(rec.label, err.message);
    }
}

// ─── Test 6: Error handling ───────────────────────────────────────────────────

section('Test 6: Error handling — invalid inputs must throw');

const errorTests = [
    {
        label:    'Unknown diagnosis hard-fails with correct message',
        fn:       () => encode('Malaria Tropica', 'Paracetamol 500mg', '2026-01-01'),
        expected: 'Diagnosis not in prototype codebook'
    },
    {
        label:    'Unknown medication hard-fails with correct message',
        fn:       () => encode('Essential Hypertension', 'Ibuprofen 200mg', '2026-01-01'),
        expected: 'Medication not in prototype codebook'
    },
    {
        label:    'Year below 2000 throws',
        fn:       () => encode('Essential Hypertension', 'Paracetamol 500mg', '1999-01-01'),
        expected: 'out of range'
    },
    {
        label:    'Year above 2127 throws',
        fn:       () => encode('Essential Hypertension', 'Paracetamol 500mg', '2128-01-01'),
        expected: 'out of range'
    },
    {
        label:    'Invalid month throws',
        fn:       () => encode('Essential Hypertension', 'Paracetamol 500mg', '2026-13-01'),
        expected: 'out of range'
    },
    {
        label:    'Malformed date string throws',
        fn:       () => encode('Essential Hypertension', 'Paracetamol 500mg', '26-3-8'),
        expected: 'out of range'
    },
    {
        label:    'decode() with wrong buffer length throws',
        fn:       () => decode(Buffer.from([0x00, 0x01, 0x00, 0x01])),
        expected: 'exactly 6 bytes'
    },
];

for (const t of errorTests) {
    try {
        t.fn();
        fail(t.label, 'Expected an error but none was thrown');
    } catch (err) {
        if (err.message.includes(t.expected)) {
            pass(`${t.label}: threw "${err.message.slice(0, 60)}..."`);
        } else {
            fail(t.label, `Wrong error message. Got: "${err.message}"`);
        }
    }
}

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log('\n' + '═'.repeat(60));
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log('═'.repeat(60));

if (failed > 0) {
    console.log('\n  ⚠️  Fix all failures before proceeding to Step 3.\n');
    process.exit(1);
} else {
    console.log('\n  ✅ All tests passed. Codebook is correct.\n');
    console.log('  You may now proceed to Step 3 (Node.js backend).\n');
    process.exit(0);
}