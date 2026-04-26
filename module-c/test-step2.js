/**
 * MySihat — Module C, Step 2
 * SELECT Applet Test
 *
 * Goal: Insert the JavaCard and confirm the MySihat applet responds
 *       to a SELECT APDU with status word 90 00.
 *
 * Pass criteria: Console prints "STEP 2 PASS" and the full response hex.
 * Fail criteria: Any error, or status word is not 90 00.
 *
 * Run: node test-step2.js
 * Card must be inserted before running, or inserted while script waits.
 */

const pcsclite = require('pcsclite');

// ── MySihat AID ──────────────────────────────────────────────────────────────
// Canonical value from DECISIONS_LOG Decision 012.
// All three places (applet register(), build.xml, this SELECT) must match exactly.
const MYSIHAT_AID = Buffer.from([
    0xA0, 0x00, 0x00, 0x00,
    0x62, 0x03, 0x01, 0x0C, 0x01
]);

// ── SELECT APDU ───────────────────────────────────────────────────────────────
// CLA  INS   P1    P2    Lc              AID (9 bytes)
// 0x00 0xA4  0x04  0x00  0x09  [A0 00 00 00 62 03 01 0C 01]
//
// CLA 0x00 = ISO standard command (not MySihat proprietary)
// INS 0xA4 = SELECT
// P1  0x04 = select by AID
// P2  0x00 = first or only occurrence
// Lc  0x09 = 9 bytes of AID follow
const SELECT_APDU = Buffer.from([
    0x00, 0xA4, 0x04, 0x00,
    MYSIHAT_AID.length,
    ...MYSIHAT_AID
]);

// ── Helper: format Buffer as spaced hex string ────────────────────────────────
function hex(buf) {
    return Buffer.from(buf).toString('hex').toUpperCase().match(/.{2}/g).join(' ');
}

// ── Helper: extract and interpret status word (last 2 bytes of response) ──────
function parseStatus(response) {
    const sw1 = response[response.length - 2];
    const sw2 = response[response.length - 1];
    return { sw1, sw2, ok: sw1 === 0x90 && sw2 === 0x00 };
}

// ── Main ─────────────────────────────────────────────────────────────────────
console.log('MySihat — Module C, Step 2: SELECT Applet Test');
console.log('===============================================');
console.log('Waiting for card reader...');
console.log('');

const pcsc = pcsclite();

pcsc.on('reader', function (reader) {
    console.log('[READER] Detected:', reader.name);

    // Verify this is the ACR39U (sanity check — only one reader expected)
    if (!reader.name.toLowerCase().includes('acr39')) {
        console.warn('[WARN] Unexpected reader name. Continuing anyway.');
    }

    reader.on('error', function (err) {
        console.error('[READER ERROR]', err.message);
    });


    let sessionActive = false;

    reader.on('status', function (status) {
    const cardPresent = !!(status.state & reader.SCARD_STATE_PRESENT);
    const cardChanged = !!(status.state & reader.SCARD_STATE_CHANGED);

    if (!cardPresent) {
        console.log('[CARD] No card detected — insert the JavaCard now.');
        sessionActive = false;
        return;
    }

    if (!cardChanged || sessionActive) {
        return;
    }

    sessionActive = true;

        console.log('[CARD] Card detected. Connecting...');

        reader.connect(
            { share_mode: reader.SCARD_SHARE_SHARED },
            function (err, protocol) {
                if (err) {
                    console.error('[CONNECT ERROR]', err.message);
                    console.error('');
                    console.error('Possible causes:');
                    console.error('  - Card not fully seated in reader');
                    console.error('  - Reader driver issue — try unplugging and replugging');
                    return;
                }

                console.log('[CONNECT] Connected. Protocol:', protocol === reader.SCARD_PROTOCOL_T0 ? 'T=0' : 'T=1');
                console.log('');
                console.log('[APDU →] Sending SELECT:');
                console.log('         ', hex(SELECT_APDU));
                console.log('');

                reader.transmit(SELECT_APDU, 256, reader.SCARD_PROTOCOL_T1, function (err, response) {
                    if (err) {
                        console.error('[TRANSMIT ERROR]', err.message);
                        console.error('');
                        console.error('Possible causes:');
                        console.error('  - Card removed mid-transmit');
                        console.error('  - Protocol mismatch');
                        cleanup(reader, pcsc);
                        return;
                    }

                    const { sw1, sw2, ok } = parseStatus(response);
                    const swHex = sw1.toString(16).toUpperCase().padStart(2, '0') + ' ' +
                                  sw2.toString(16).toUpperCase().padStart(2, '0');

                    console.log('[APDU ←] Raw response:  ', hex(response));
                    console.log('[APDU ←] Status word:   ', swHex);
                    console.log('');

                    if (ok) {
                        console.log('✅ STEP 2 PASS');
                        console.log('   MySihat applet is installed and responded correctly.');
                        console.log('   Status 90 00 confirmed — applet is now selected for this session.');
                        console.log('');
                        console.log('Ready for Step 3: Write and Read-Back Test.');
                    } else {
                        console.error('❌ STEP 2 FAIL');
                        console.error('   Status word:', swHex);
                        console.error('');
                        interpretFailure(sw1, sw2);
                    }

                    cleanup(reader, pcsc);
                });
            }
        );
    });

    reader.on('end', function () {
        console.log('[READER] Reader disconnected.');
    });
});

pcsc.on('error', function (err) {
    console.error('[PCSC ERROR]', err.message);
    console.error('');
    console.error('Possible causes on Windows:');
    console.error('  - Smart Card service (SCardSvr) not running');
    console.error('  - Run: Start-Service SCardSvr  (in an admin PowerShell)');
});

// ── Error interpreter ─────────────────────────────────────────────────────────
function interpretFailure(sw1, sw2) {
    if (sw1 === 0x6A && sw2 === 0x82) {
        console.error('  6A 82 = Applet not found on this card.');
        console.error('  Fix: The MySihat applet is not installed on the card you inserted.');
        console.error('       Make sure you are using a card from Module A Step 4 (gp.jar --install).');
        console.error('       Run: java -jar tools\\gp.jar --list');
        console.error('       Expected: APP: A00000006203010C01 (SELECTABLE)');
    } else if (sw1 === 0x69 && sw2 === 0x86) {
        console.error('  69 86 = Command not allowed (applet not active).');
        console.error('  This should not happen on a fresh SELECT — check AID bytes.');
    } else if (sw1 === 0x67 && sw2 === 0x00) {
        console.error('  67 00 = Wrong length — Lc value mismatch.');
        console.error('  This is a bug in this script — AID length does not match Lc byte.');
    } else if (sw1 === 0x6D && sw2 === 0x00) {
        console.error('  6D 00 = INS not supported.');
        console.error('  The card does not recognise INS 0xA4. Unusual for a JavaCard.');
    } else {
        console.error(`  Unknown status: ${sw1.toString(16)} ${sw2.toString(16)}`);
        console.error('  Check Module C Section 7 status word reference table.');
    }
}

// ── Cleanup ───────────────────────────────────────────────────────────────────
function cleanup(reader, pcsc) {
    setTimeout(function () {
        reader.disconnect(reader.SCARD_LEAVE_CARD, function (err) {
            if (err) console.warn('[DISCONNECT WARN]', err.message);
            pcsc.close();
        });
    }, 500);
}