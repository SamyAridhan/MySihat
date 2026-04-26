/**
 * MySihat — Module C, Step 3
 * Write and Read-Back Test
 *
 * Sequence:
 *   1. SELECT applet
 *   2. RESET card (INS 0xFF) — dev only, gives clean baseline
 *   3. Write 3 known records via APPEND RECORD (INS 0x10)
 *   4. Read back via READ ALL RECORDS (INS 0x20)
 *   5. Verify all 3 records are present and byte-exact
 *   6. GET METADATA (INS 0x30) — verify HEAD=3, TAIL=0, COUNT=3
 *
 * Pass criteria:
 *   - All 3 records returned byte-exact
 *   - Metadata shows HEAD=3, TAIL=0, COUNT=3
 *
 * NOTE: This test uses RESET (INS 0xFF). Use only on a dev card.
 *       Never run on the clean demo card (Card 3 per DECISIONS_LOG).
 *
 * Run: node test-step3.js
 */

const pcsclite = require('pcsclite');

// ── Protocol (T=1 confirmed in Step 2) ───────────────────────────────────────
// We use the constant directly — the connect callback protocol value is not
// a plain integer in this version of pcsclite.
const PROTOCOL = 2; // SCARD_PROTOCOL_T1 — confirmed T=1 in Step 2

// ── APDU definitions ─────────────────────────────────────────────────────────

const MYSIHAT_AID = Buffer.from([
    0xA0, 0x00, 0x00, 0x00,
    0x62, 0x03, 0x01, 0x0C, 0x01
]);

const SELECT_APDU = Buffer.from([
    0x00, 0xA4, 0x04, 0x00,
    MYSIHAT_AID.length,
    ...MYSIHAT_AID
]);

// INS 0xFF — RESET (dev only, zeroes entire EEPROM)
const RESET_APDU = Buffer.from([0x80, 0xFF, 0x00, 0x00]);

// INS 0x20 — READ ALL RECORDS (Le=0x00 = variable length)
const READ_ALL_APDU = Buffer.from([0x80, 0x20, 0x00, 0x00, 0x00]);

// INS 0x30 — GET METADATA (Le=0x06 = return 6 bytes: HEAD + TAIL + COUNT)
const METADATA_APDU = Buffer.from([0x80, 0x30, 0x00, 0x00, 0x06]);

// ── Test records ─────────────────────────────────────────────────────────────
// From codebook: Essential Hypertension (0x0001) + Paracetamol 500mg (0x0001)
// Dates: 2026-03-08, 2026-01-05, 2025-12-08
//
// Date packing: ((year-2000) << 9) | (month << 5) | day
//   2026-03-08: ((26)<<9)|(3<<5)|8  = 13312+96+8  = 13416 = 0x3468
//   2026-01-05: ((26)<<9)|(1<<5)|5  = 13312+32+5  = 13349 = 0x3425
//   2025-12-08: ((25)<<9)|(12<<5)|8 = 12800+384+8 = 13192 = 0x3388

const TEST_RECORDS = [
    {
        label:  'Essential Hypertension | Paracetamol 500mg | 2026-03-08',
        bytes:  Buffer.from([0x00, 0x01, 0x00, 0x01, 0x34, 0x68])
    },
    {
        label:  'Dengue Fever | Paracetamol 500mg | 2026-01-05',
        bytes:  Buffer.from([0x00, 0x04, 0x00, 0x01, 0x34, 0x25])
    },
    {
        label:  'URTI | Amoxicillin 250mg | 2025-12-08',
        bytes:  Buffer.from([0x00, 0x03, 0x00, 0x02, 0x33, 0x88])
    }
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function hex(buf) {
    return Buffer.from(buf).toString('hex').toUpperCase().match(/.{2}/g).join(' ');
}

function buildAppendAPDU(sixByteRecord) {
    return Buffer.from([
        0x80, 0x10, 0x00, 0x00, 0x06,
        ...sixByteRecord
    ]);
}

function transmit(reader, apdu, label) {
    return new Promise((resolve, reject) => {
        console.log(`[APDU →] ${label}`);
        console.log(`         ${hex(apdu)}`);
        reader.transmit(apdu, 256, PROTOCOL, (err, response) => {
            if (err) return reject(new Error(`Transmit failed (${label}): ${err.message}`));
            const sw1 = response[response.length - 2];
            const sw2 = response[response.length - 1];
            console.log(`[APDU ←] ${hex(response)}`);
            if (sw1 !== 0x90 || sw2 !== 0x00) {
                return reject(new Error(
                    `Bad status word for ${label}: ${sw1.toString(16).toUpperCase()} ${sw2.toString(16).toUpperCase()}`
                ));
            }
            resolve(response.slice(0, response.length - 2)); // strip status word
        });
    });
}

// ── Main test sequence ────────────────────────────────────────────────────────

async function runTest(reader, protocol) {
    console.log('');
    console.log('── Step 1: SELECT ──────────────────────────────────────────');
    await transmit(reader, SELECT_APDU, 'SELECT MySihat Applet');
    console.log('   ✅ Applet selected');

    console.log('');
    console.log('── Step 2: RESET (clean baseline) ──────────────────────────');
    console.log('   ⚠️  Dev card only — never run on demo card (Card 3)');
    await transmit(reader, RESET_APDU, 'RESET CARD');
    console.log('   ✅ Card reset — EEPROM cleared');

    console.log('');
    console.log('── Step 3: WRITE 3 records ─────────────────────────────────');
    for (let i = 0; i < TEST_RECORDS.length; i++) {
        const rec = TEST_RECORDS[i];
        console.log(`   Writing record ${i + 1}: ${rec.label}`);
        await transmit(reader, buildAppendAPDU(rec.bytes), `APPEND RECORD ${i + 1}`);
        console.log(`   ✅ Record ${i + 1} written`);
        console.log('');
    }

    console.log('── Step 4: READ ALL RECORDS ────────────────────────────────');
    const rawRecords = await transmit(reader, READ_ALL_APDU, 'READ ALL RECORDS');
    const recordCount = rawRecords.length / 6;
    console.log(`   Response: ${rawRecords.length} bytes = ${recordCount} records`);
    console.log('');

    console.log('── Step 5: VERIFY byte-exact match ─────────────────────────');
    let allPass = true;

    for (let i = 0; i < TEST_RECORDS.length; i++) {
        const expected = TEST_RECORDS[i].bytes;
        const actual   = rawRecords.slice(i * 6, i * 6 + 6);
        const match    = expected.equals(actual);

        console.log(`   Record ${i + 1}: ${TEST_RECORDS[i].label}`);
        console.log(`   Expected: ${hex(expected)}`);
        console.log(`   Actual:   ${hex(actual)}`);
        console.log(`   Match:    ${match ? '✅ PASS' : '❌ FAIL'}`);
        console.log('');

        if (!match) allPass = false;
    }

    console.log('── Step 6: GET METADATA ────────────────────────────────────');
    const meta = await transmit(reader, METADATA_APDU, 'GET METADATA');
    const head  = (meta[0] << 8) | meta[1];
    const tail  = (meta[2] << 8) | meta[3];
    const count = (meta[4] << 8) | meta[5];

    console.log(`   HEAD:  ${head} (expected 3)`);
    console.log(`   TAIL:  ${tail} (expected 0)`);
    console.log(`   COUNT: ${count} (expected 3)`);

    const metaPass = head === 3 && tail === 0 && count === 3;
    console.log(`   Metadata: ${metaPass ? '✅ PASS' : '❌ FAIL'}`);
    console.log('');

    console.log('════════════════════════════════════════════════════════════');
    if (allPass && metaPass) {
        console.log('✅ STEP 3 PASS');
        console.log('   All 3 records written and read back byte-exact.');
        console.log('   Metadata pointers correct.');
        console.log('   Node.js ↔ JavaCard APDU communication verified.');
        console.log('   Ready for Step 4: Card event handling test.');
    } else {
        console.log('❌ STEP 3 FAIL');
        if (!allPass)   console.log('   Record mismatch — check APPEND/READ APDU construction.');
        if (!metaPass)  console.log('   Metadata mismatch — check pointer logic in applet.');
    }
    console.log('════════════════════════════════════════════════════════════');
}

// ── PC/SC setup ───────────────────────────────────────────────────────────────

const pcsc = pcsclite();
let sessionActive = false;

console.log('MySihat — Module C, Step 3: Write and Read-Back Test');
console.log('====================================================');
console.log('Waiting for card reader...');

pcsc.on('reader', function (reader) {
    console.log('[READER] Detected:', reader.name);

    reader.on('error', (err) => console.error('[READER ERROR]', err.message));

    reader.on('status', function (status) {
        const cardPresent = !!(status.state & reader.SCARD_STATE_PRESENT);
        const cardChanged = !!(status.state & reader.SCARD_STATE_CHANGED);

        if (!cardPresent) {
            sessionActive = false;
            console.log('[CARD] No card — insert the JavaCard now.');
            return;
        }

        if (!cardChanged || sessionActive) return;
        sessionActive = true;

        console.log('[CARD] Card detected. Connecting...');
        reader.connect({ share_mode: reader.SCARD_SHARE_SHARED }, function (err, protocol) {
            if (err) {
                console.error('[CONNECT ERROR]', err.message);
                sessionActive = false;
                return;
            }
            console.log('[CONNECT] Connected. Running test sequence...');

            runTest(reader, protocol)
                .catch((err) => {
                    console.error('');
                    console.error('❌ Test sequence failed:', err.message);
                })
                .finally(() => {
                    setTimeout(() => {
                        reader.disconnect(reader.SCARD_LEAVE_CARD, () => pcsc.close());
                    }, 500);
                });
        });
    });

    reader.on('end', () => console.log('[READER] Reader disconnected.'));
});

pcsc.on('error', (err) => console.error('[PCSC ERROR]', err.message));