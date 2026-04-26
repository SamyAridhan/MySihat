/**
 * MySihat — Module C, Step 4
 * Card Event Handling Test
 *
 * Sequence:
 *   This test is interactive. Follow the prompts.
 *
 *   Round 1: Insert card  → confirm card.inserted fires + SELECT succeeds
 *   Round 1: Remove card  → confirm card.removed fires
 *   Round 2: Insert card  → confirm card.inserted fires again cleanly
 *   Round 2: Remove card  → confirm card.removed fires again
 *
 * Pass criteria:
 *   - card.inserted fires on every insertion (not just the first)
 *   - card.removed fires on every removal
 *   - SELECT succeeds on every insertion (applet is reachable each time)
 *   - No errors or stale state between cycles
 *
 * Run: node test-step4.js
 * Then follow the prompts — insert and remove the card when asked.
 */

const pcsclite = require('pcsclite');

const PROTOCOL = 2; // SCARD_PROTOCOL_T1

const MYSIHAT_AID = Buffer.from([
    0xA0, 0x00, 0x00, 0x00,
    0x62, 0x03, 0x01, 0x0C, 0x01
]);

const SELECT_APDU = Buffer.from([
    0x00, 0xA4, 0x04, 0x00,
    MYSIHAT_AID.length,
    ...MYSIHAT_AID
]);

// ── Helpers ───────────────────────────────────────────────────────────────────

function hex(buf) {
    return Buffer.from(buf).toString('hex').toUpperCase().match(/.{2}/g).join(' ');
}

function transmit(reader, apdu, label) {
    return new Promise((resolve, reject) => {
        reader.transmit(apdu, 256, PROTOCOL, (err, response) => {
            if (err) return reject(new Error(`Transmit failed (${label}): ${err.message}`));
            const sw1 = response[response.length - 2];
            const sw2 = response[response.length - 1];
            if (sw1 !== 0x90 || sw2 !== 0x00) {
                return reject(new Error(
                    `Bad status: ${sw1.toString(16).toUpperCase()} ${sw2.toString(16).toUpperCase()}`
                ));
            }
            resolve(response.slice(0, response.length - 2));
        });
    });
}

// ── State ─────────────────────────────────────────────────────────────────────

const TARGET_ROUNDS = 2;
let roundsCompleted = 0;
let insertCount = 0;
let removeCount = 0;
let sessionActive = false;

const results = [];

// ── Event log ─────────────────────────────────────────────────────────────────

function logEvent(symbol, message) {
    const ts = new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
    console.log(`${ts}  ${symbol}  ${message}`);
}

// ── Main ─────────────────────────────────────────────────────────────────────

console.log('MySihat — Module C, Step 4: Card Event Handling Test');
console.log('====================================================');
console.log('');
console.log('This test runs 2 insert/remove cycles.');
console.log('Follow the prompts. Insert and remove the card when asked.');
console.log('');
console.log('──────────────────────────────────────────────────────');

const pcsc = pcsclite();

pcsc.on('reader', function (reader) {
    logEvent('📡', `Reader detected: ${reader.name}`);
    console.log('');
    console.log(`👉  ACTION: Insert the JavaCard now (Round 1 of ${TARGET_ROUNDS})`);
    console.log('');

    reader.on('error', (err) => logEvent('❌', `Reader error: ${err.message}`));

    reader.on('status', function (status) {
        const cardPresent = !!(status.state & reader.SCARD_STATE_PRESENT);
        const cardChanged = !!(status.state & reader.SCARD_STATE_CHANGED);

        if (!cardChanged) return; // no state transition — nothing to do

        if (cardPresent && !sessionActive) {
            // ── CARD INSERTED ─────────────────────────────────────────────────
            sessionActive = true;
            insertCount++;
            const round = insertCount;

            logEvent('🟢', `card.inserted — Round ${round}`);

            reader.connect({ share_mode: reader.SCARD_SHARE_SHARED }, function (err, protocol) {
                if (err) {
                    logEvent('❌', `Connect failed (Round ${round}): ${err.message}`);
                    results.push({ round, event: 'inserted', selectPass: false, error: err.message });
                    sessionActive = false;
                    return;
                }

                logEvent('🔌', `Connected — Protocol: T=${protocol === 2 ? '1' : '0'}`);

                // SELECT to verify applet is reachable after each insertion
                transmit(reader, SELECT_APDU, 'SELECT')
                    .then(() => {
                        logEvent('✅', `SELECT succeeded — applet reachable (Round ${round})`);
                        results.push({ round, event: 'inserted', selectPass: true });
                        console.log('');
                        console.log(`👉  ACTION: Remove the card now`);
                        console.log('');
                    })
                    .catch((err) => {
                        logEvent('❌', `SELECT failed (Round ${round}): ${err.message}`);
                        results.push({ round, event: 'inserted', selectPass: false, error: err.message });
                        console.log('');
                        console.log(`👉  ACTION: Remove the card now`);
                        console.log('');
                    });
            });

        } else if (!cardPresent && sessionActive) {
            // ── CARD REMOVED ──────────────────────────────────────────────────
            sessionActive = false;
            removeCount++;
            const round = removeCount;

            logEvent('🔴', `card.removed — Round ${round}`);
            results.push({ round, event: 'removed' });

            reader.disconnect(reader.SCARD_LEAVE_CARD, (err) => {
                if (err) logEvent('⚠️ ', `Disconnect warning (Round ${round}): ${err.message}`);
            });

            roundsCompleted++;

            if (roundsCompleted < TARGET_ROUNDS) {
                console.log('');
                console.log(`👉  ACTION: Insert the card again (Round ${roundsCompleted + 1} of ${TARGET_ROUNDS})`);
                console.log('');
            } else {
                // All rounds done — print results
                setTimeout(() => printResults(pcsc), 300);
            }
        }
    });

    reader.on('end', () => logEvent('📡', 'Reader disconnected.'));
});

pcsc.on('error', (err) => logEvent('❌', `PCSC error: ${err.message}`));

// ── Results ───────────────────────────────────────────────────────────────────

function printResults(pcsc) {
    console.log('');
    console.log('════════════════════════════════════════════════════════════');
    console.log('RESULTS');
    console.log('════════════════════════════════════════════════════════════');
    console.log('');

    let allPass = true;

    // Check all inserts had successful SELECT
    const insertResults = results.filter(r => r.event === 'inserted');
    const removeResults = results.filter(r => r.event === 'removed');

    for (const r of insertResults) {
        const pass = r.selectPass === true;
        console.log(`  Round ${r.round} insert:  ${pass ? '✅ card.inserted fired + SELECT succeeded' : '❌ FAIL — ' + r.error}`);
        if (!pass) allPass = false;
    }

    for (const r of removeResults) {
        console.log(`  Round ${r.round} remove:  ✅ card.removed fired`);
    }

    // Check counts
    const insertsMatch = insertCount === TARGET_ROUNDS;
    const removesMatch = removeCount === TARGET_ROUNDS;

    console.log('');
    console.log(`  Insert events:  ${insertCount} / ${TARGET_ROUNDS}  ${insertsMatch ? '✅' : '❌'}`);
    console.log(`  Remove events:  ${removeCount} / ${TARGET_ROUNDS}  ${removesMatch ? '✅' : '❌'}`);
    console.log('');

    if (!insertsMatch || !removesMatch) allPass = false;

    console.log('════════════════════════════════════════════════════════════');
    if (allPass) {
        console.log('✅ STEP 4 PASS');
        console.log('   card.inserted and card.removed fire correctly every cycle.');
        console.log('   SELECT succeeds on every insertion — no stale state.');
        console.log('   Module C event handling is verified.');
        console.log('   Ready for Step 5: Full interface function test.');
    } else {
        console.log('❌ STEP 4 FAIL');
        console.log('   Check error messages above.');
    }
    console.log('════════════════════════════════════════════════════════════');

    pcsc.close();
}