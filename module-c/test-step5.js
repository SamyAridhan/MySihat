/**
 * MySihat — Module C, Step 5
 * Full Interface Function Test
 *
 * Calls all four interface functions in sequence via card-service.js:
 *   initReader → cardWriteRecord × 3 → cardReadAllRecords
 *             → cardGetMetadata → cardReadPatientId
 *
 * Pass criteria:
 *   - initReader() resolves with reader name string
 *   - card.inserted event fires
 *   - cardWriteRecord() returns true for each of 3 records
 *   - cardWriteRecord(invalid) throws — input validation works
 *   - cardReadAllRecords() returns Array<Buffer(6)>, byte-exact
 *   - cardGetMetadata() returns { head:3, tail:0, count:3 }
 *   - cardReadPatientId() returns a string (empty is acceptable if never written)
 *
 * NOTE: Uses RESET before writing. Dev card only.
 *
 * Run: node test-step5.js
 *      Card must be inserted before running.
 */

'use strict';

const card = require('./card-service');

// ── Test records ──────────────────────────────────────────────────────────────

const TEST_RECORDS = [
    {
        label: 'Essential Hypertension | Paracetamol 500mg | 2026-03-08',
        bytes: Buffer.from([0x00, 0x01, 0x00, 0x01, 0x34, 0x68])
    },
    {
        label: 'Dengue Fever | Paracetamol 500mg | 2026-01-05',
        bytes: Buffer.from([0x00, 0x04, 0x00, 0x01, 0x34, 0x25])
    },
    {
        label: 'URTI | Amoxicillin 250mg | 2025-12-08',
        bytes: Buffer.from([0x00, 0x03, 0x00, 0x02, 0x33, 0x88])
    }
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function hex(buf) {
    return Buffer.from(buf).toString('hex').toUpperCase().match(/.{2}/g).join(' ');
}
function pass(msg) { console.log(`   ✅ ${msg}`); }
function fail(msg) { console.log(`   ❌ ${msg}`); }

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
    console.log('MySihat — Module C, Step 5: Full Interface Function Test');
    console.log('========================================================');
    console.log('');
    console.log('Insert the card, then this test runs automatically.');
    console.log('');

    // ── Test 1: initReader ────────────────────────────────────────────────────
    console.log('── Test 1: initReader() ────────────────────────────────────');
    let readerName;
    try {
        readerName = await card.initReader();
        if (typeof readerName === 'string' && readerName.length > 0) {
            pass(`Resolved with reader name: "${readerName}"`);
        } else {
            fail(`Expected non-empty string, got: ${JSON.stringify(readerName)}`);
        }
    } catch (err) {
        fail(`initReader() threw: ${err.message}`);
        process.exit(1);
    }

    // Wait for card.inserted (auto-SELECT runs inside card-service)
    console.log('');
    console.log('   Waiting for card.inserted event...');
    await new Promise((resolve) => {
        card.cardEvents.once('card.inserted', () => {
            pass('card.inserted event received — applet auto-selected');
            resolve();
        });
    });
    console.log('');

    // ── Pre-test RESET ────────────────────────────────────────────────────────
    console.log('── Pre-test: RESET (dev card only) ─────────────────────────');
    try {
        await card._transmitDirect(Buffer.from([0x80, 0xFF, 0x00, 0x00]));
        pass('Card reset — clean baseline');
    } catch (err) {
        console.log(`   ⚠️  RESET failed: ${err.message} — continuing`);
    }
    console.log('');

    // ── Test 2: cardWriteRecord ───────────────────────────────────────────────
    console.log('── Test 2: cardWriteRecord() ───────────────────────────────');
    let writePass = true;

    for (let i = 0; i < TEST_RECORDS.length; i++) {
        const rec = TEST_RECORDS[i];
        try {
            const result = await card.cardWriteRecord(rec.bytes);
            if (result === true) {
                pass(`Record ${i + 1} — returned true — ${rec.label}`);
            } else {
                fail(`Record ${i + 1} — expected true, got: ${result}`);
                writePass = false;
            }
        } catch (err) {
            fail(`Record ${i + 1} — threw: ${err.message}`);
            writePass = false;
        }
    }

    // Input validation — must throw on wrong length
    try {
        await card.cardWriteRecord(Buffer.from([0x01, 0x02]));
        fail('cardWriteRecord(2 bytes) — should have thrown');
        writePass = false;
    } catch {
        pass('cardWriteRecord(2 bytes) correctly threw — input validation works');
    }
    console.log('');

    // ── Test 3: cardReadAllRecords ────────────────────────────────────────────
    console.log('── Test 3: cardReadAllRecords() ────────────────────────────');
    let readPass = true;
    let records = [];
    try {
        records = await card.cardReadAllRecords();
        pass(`Returned ${records.length} record(s)`);

        if (!Array.isArray(records)) {
            fail('Return value is not an Array'); readPass = false;
        }
        if (records.length !== TEST_RECORDS.length) {
            fail(`Expected ${TEST_RECORDS.length}, got ${records.length}`); readPass = false;
        }

        for (let i = 0; i < TEST_RECORDS.length; i++) {
            const actual   = records[i];
            const expected = TEST_RECORDS[i].bytes;
            if (!Buffer.isBuffer(actual)) {
                fail(`Record ${i + 1} is not a Buffer`); readPass = false; continue;
            }
            if (actual.length !== 6) {
                fail(`Record ${i + 1} is ${actual.length} bytes, expected 6`); readPass = false; continue;
            }
            if (actual.equals(expected)) {
                pass(`Record ${i + 1} byte-exact: ${hex(actual)}`);
            } else {
                fail(`Record ${i + 1} mismatch`);
                console.log(`      Expected: ${hex(expected)}`);
                console.log(`      Actual:   ${hex(actual)}`);
                readPass = false;
            }
        }
    } catch (err) {
        fail(`cardReadAllRecords() threw: ${err.message}`);
        readPass = false;
    }
    console.log('');

    // ── Test 4: cardGetMetadata ───────────────────────────────────────────────
    console.log('── Test 4: cardGetMetadata() ───────────────────────────────');
    let metaPass = true;
    try {
        const meta = await card.cardGetMetadata();
        pass(`Returned: head=${meta.head}, tail=${meta.tail}, count=${meta.count}`);

        if (typeof meta.head  !== 'number') { fail('head not a number');  metaPass = false; }
        if (typeof meta.tail  !== 'number') { fail('tail not a number');  metaPass = false; }
        if (typeof meta.count !== 'number') { fail('count not a number'); metaPass = false; }

        meta.head  === TEST_RECORDS.length ? pass(`head  = ${meta.head} ✓`)  : (fail(`head expected ${TEST_RECORDS.length}, got ${meta.head}`),   metaPass = false);
        meta.tail  === 0                   ? pass(`tail  = ${meta.tail} ✓`)  : (fail(`tail expected 0, got ${meta.tail}`),                        metaPass = false);
        meta.count === TEST_RECORDS.length ? pass(`count = ${meta.count} ✓`) : (fail(`count expected ${TEST_RECORDS.length}, got ${meta.count}`), metaPass = false);

    } catch (err) {
        fail(`cardGetMetadata() threw: ${err.message}`);
        metaPass = false;
    }
    console.log('');

    // ── Test 5: cardReadPatientId ─────────────────────────────────────────────
    console.log('── Test 5: cardReadPatientId() ─────────────────────────────');
    let pidPass = true;
    try {
        const pid = await card.cardReadPatientId();
        if (typeof pid !== 'string') {
            fail(`Expected string, got ${typeof pid}`); pidPass = false;
        } else if (pid.length === 0) {
            pass('Returned empty string — Patient ID never written — type contract satisfied');
        } else {
            pass(`Returned: "${pid}"`);
        }
    } catch (err) {
        fail(`cardReadPatientId() threw: ${err.message}`);
        pidPass = false;
    }
    console.log('');

    // ── Final result ──────────────────────────────────────────────────────────
    console.log('════════════════════════════════════════════════════════════');
    const allPass = writePass && readPass && metaPass && pidPass;
    if (allPass) {
        console.log('✅ STEP 5 PASS');
        console.log('   All four interface functions return correct types and values.');
        console.log('   card-service.js is verified.');
        console.log('   Module C milestone: COMPLETE.');
        console.log('');
        console.log('   Next: Integration — replace Module B mock calls with card-service.');
    } else {
        console.log('❌ STEP 5 FAIL — see failures above.');
    }
    console.log('════════════════════════════════════════════════════════════');

    process.exit(0);
}

main().catch((err) => {
    console.error('Fatal:', err.message);
    process.exit(1);
});