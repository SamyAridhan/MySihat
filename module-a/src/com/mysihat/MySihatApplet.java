package com.mysihat;

import javacard.framework.*;

public class MySihatApplet extends Applet {

    // -------------------------------------------------------------------------
    // EEPROM Address Constants
    // These are hardcoded physical addresses inside the card's EEPROM.
    // NEVER change these values once a card has been written — all existing
    // data on the card depends on these offsets being exactly correct.
    //
    // Memory map:
    //   0x0000 – 0x0001  HEAD pointer        (2 bytes)
    //   0x0002 – 0x0003  TAIL pointer        (2 bytes)
    //   0x0004 – 0x0005  Record COUNT        (2 bytes)
    //   0x0006 – 0x000B  Commit buffer       (6 bytes)
    //   0x000C – 0x001B  Patient ID          (16 bytes ASCII)
    //   0x001C – 0x7FFE  Circular record buffer (5456 × 6 bytes)
    // -------------------------------------------------------------------------
    private static final short ADDR_HEAD       = (short) 0x0000;
    private static final short ADDR_TAIL       = (short) 0x0002;
    private static final short ADDR_COUNT      = (short) 0x0004;
    private static final short ADDR_COMMIT     = (short) 0x0006;
    private static final short ADDR_PATIENT_ID = (short) 0x000C;
    private static final short ADDR_RECORDS    = (short) 0x001C;

    // -------------------------------------------------------------------------
    // Size Constants
    // -------------------------------------------------------------------------
    private static final short PATIENT_ID_SIZE  = (short) 16;
    private static final short RECORD_SIZE      = (short) 6;

    // MAX_CAPACITY: how many 6-byte records fit in the remaining EEPROM.
    // Derivation: 32767 total bytes − 28 reserved bytes = 32739 usable
    //             32739 ÷ 6 = 5456 records (floor)
    private static final short MAX_CAPACITY     = (short) 5456;

    // Prototype read cap: 42 records × 6 bytes = 252 bytes fits in APDU buffer.
    // Full pagination is a production requirement, not prototype scope.
    private static final short MAX_READ_RECORDS = (short) 42;

    // Safe array ceiling: JavaCard short-indexed arrays max at 32767 (0x7FFF).
    // Allocating 32768 would overflow a signed short — use 32767.
    private static final short EEPROM_TOTAL     = (short) 32767;

    // -------------------------------------------------------------------------
    // APDU Instruction Bytes
    // -------------------------------------------------------------------------
    private static final byte INS_APPEND_RECORD    = (byte) 0x10;
    private static final byte INS_READ_ALL_RECORDS = (byte) 0x20;
    private static final byte INS_GET_METADATA     = (byte) 0x30;
    private static final byte INS_WRITE_PATIENT_ID = (byte) 0x40;
    private static final byte INS_READ_PATIENT_ID  = (byte) 0x50;
    private static final byte INS_RESET_CARD       = (byte) 0xFF; // DEV ONLY

    // -------------------------------------------------------------------------
    // Memory Declarations
    // -------------------------------------------------------------------------

    // Persistent storage — this byte array IS the card's EEPROM.
    // Survives card removal, power loss, and reset.
    // Everything that must persist between sessions lives here.
    private byte[] eeprom;

    // Transient scratch buffer — lives in card RAM.
    // Cleared automatically when the applet is deselected.
    // Used for temporary work only — never for anything that must persist.
    private byte[] ramBuffer;


    // -------------------------------------------------------------------------
    // Install
    // Called by the card OS when gp.jar loads the .cap file onto the card.
    // Creates one instance of this applet and registers it with the AID.
    // -------------------------------------------------------------------------
    public static void install(byte[] bArray, short bOffset, byte bLength) {
        new MySihatApplet();
    }

    private MySihatApplet() {
        // Allocate the full EEPROM block.
        // In JavaCard, 'new byte[]' in the constructor creates PERSISTENT memory.
        // This is the key distinction — RAM arrays use JCSystem.makeTransientByteArray.
        eeprom = new byte[EEPROM_TOTAL];

        // Allocate transient scratch space in RAM.
        // 16 bytes is sufficient for any temporary copy operations.
        ramBuffer = JCSystem.makeTransientByteArray((short) 16,
                        JCSystem.CLEAR_ON_DESELECT);

        register();
    }


    // -------------------------------------------------------------------------
    // APDU Dispatcher
    // Called by the card OS for every APDU command received after SELECT.
    // -------------------------------------------------------------------------
    public void process(APDU apdu) {
        byte[] buffer = apdu.getBuffer();

        // selectingApplet() is true when the card OS is processing the SELECT
        // command that activated this applet. Run boot recovery here — this
        // is the correct moment because it runs exactly once per session,
        // immediately after the card is inserted and selected.
        if (selectingApplet()) {
            bootRecovery();
            return; // Return 9000 implicitly
        }

        byte ins = buffer[ISO7816.OFFSET_INS];

        switch (ins) {
            case INS_APPEND_RECORD:
                appendRecord(apdu);
                break;
            case INS_READ_ALL_RECORDS:
                readAllRecords(apdu);
                break;
            case INS_GET_METADATA:
                getMetadata(apdu);
                break;
            case INS_WRITE_PATIENT_ID:
                writePatientId(apdu);
                break;
            case INS_READ_PATIENT_ID:
                readPatientId(apdu);
                break;
            case INS_RESET_CARD:
                resetCard(apdu);
                break;
            default:
                ISOException.throwIt(ISO7816.SW_INS_NOT_SUPPORTED);
        }
    }


    // -------------------------------------------------------------------------
    // Boot Recovery
    //
    // Problem: if the card is physically removed between Phase 1 (commit buffer
    // written) and Phase 2 (permanent write + HEAD update), the last write is
    // in an indeterminate state on the next insertion.
    //
    // Detection: the commit buffer at ADDR_COMMIT is zeroed after every clean
    // write. If it is non-zero on SELECT, an interrupted write occurred.
    //
    // Recovery: re-execute Phase 2 using the data still in the commit buffer.
    // This is idempotent — running it twice produces the same result as once.
    // -------------------------------------------------------------------------
    private void bootRecovery() {
        // Check if commit buffer contains any non-zero byte
        boolean commitPending = false;
        for (short i = (short) 0; i < RECORD_SIZE; i++) {
            if (eeprom[(short)(ADDR_COMMIT + i)] != (byte) 0x00) {
                commitPending = true;
                break;
            }
        }

        if (!commitPending) {
            return; // Last write completed cleanly. Nothing to recover.
        }

        // Interrupted write detected. Complete Phase 2.
        short head  = Util.getShort(eeprom, ADDR_HEAD);
        short count = Util.getShort(eeprom, ADDR_COUNT);

        // Write commit buffer contents to the permanent circular buffer slot
        short targetAddress = (short)(ADDR_RECORDS + (short)(head * RECORD_SIZE));
        Util.arrayCopy(eeprom, ADDR_COMMIT, eeprom, targetAddress, RECORD_SIZE);

        // Update COUNT or TAIL depending on buffer state
        if (count == MAX_CAPACITY) {
            short tail = Util.getShort(eeprom, ADDR_TAIL);
            tail = (short)((tail + 1) % MAX_CAPACITY);
            Util.setShort(eeprom, ADDR_TAIL, tail);
        } else {
            count = (short)(count + 1);
            Util.setShort(eeprom, ADDR_COUNT, count);
        }

        // Advance HEAD
        head = (short)((head + 1) % MAX_CAPACITY);
        Util.setShort(eeprom, ADDR_HEAD, head);

        // Clear commit buffer — signals clean state for next boot
        Util.arrayFillNonAtomic(eeprom, ADDR_COMMIT, RECORD_SIZE, (byte) 0x00);
    }


    // -------------------------------------------------------------------------
    // INS 0x10 — Append Record
    //
    // Receives exactly 6 bytes from Node.js (one compressed MedicalRecord).
    // Writes it to the circular buffer using two-phase commit.
    // When the buffer is full, the oldest record is silently overwritten.
    //
    // APDU format:
    //   CLA 0x80 | INS 0x10 | P1 0x00 | P2 0x00 | Lc 0x06 | [6 bytes data]
    // Response: 90 00 on success | 69 00 on commit verification failure
    // -------------------------------------------------------------------------
    private void appendRecord(APDU apdu) {
        byte[] buffer = apdu.getBuffer();

        // Reject anything that is not exactly 6 bytes
        if (buffer[ISO7816.OFFSET_LC] != (byte) RECORD_SIZE) {
            ISOException.throwIt(ISO7816.SW_WRONG_LENGTH);
        }

        apdu.setIncomingAndReceive();

        // --- Phase 1: Tentative write to commit buffer ---
        // Write the incoming record to the scratch area first.
        // If the card loses power here, the permanent buffer is untouched.
        Util.arrayCopy(buffer, ISO7816.OFFSET_CDATA,
                       eeprom, ADDR_COMMIT,
                       RECORD_SIZE);

        // Verify the commit buffer exactly matches what was sent.
        // This catches EEPROM write errors before touching permanent data.
        if (Util.arrayCompare(buffer, ISO7816.OFFSET_CDATA,
                              eeprom, ADDR_COMMIT,
                              RECORD_SIZE) != 0) {
            ISOException.throwIt((short) 0x6900);
        }

        // --- Phase 2: Commit to permanent circular buffer slot ---
        short head  = Util.getShort(eeprom, ADDR_HEAD);
        short count = Util.getShort(eeprom, ADDR_COUNT);

        short targetAddress = (short)(ADDR_RECORDS + (short)(head * RECORD_SIZE));
        Util.arrayCopy(eeprom, ADDR_COMMIT, eeprom, targetAddress, RECORD_SIZE);

        // Buffer full: HEAD is about to overwrite TAIL's slot.
        // Advance TAIL so it always points to the oldest valid record.
        // COUNT stays at MAX_CAPACITY.
        if (count == MAX_CAPACITY) {
            short tail = Util.getShort(eeprom, ADDR_TAIL);
            tail = (short)((tail + 1) % MAX_CAPACITY);
            Util.setShort(eeprom, ADDR_TAIL, tail);
        } else {
            // Buffer not yet full: increment count.
            count = (short)(count + 1);
            Util.setShort(eeprom, ADDR_COUNT, count);
        }

        // Advance HEAD to next write slot
        head = (short)((head + 1) % MAX_CAPACITY);
        Util.setShort(eeprom, ADDR_HEAD, head);

        // Clear commit buffer — signals this write completed cleanly.
        // A zero commit buffer on next boot = no recovery needed.
        Util.arrayFillNonAtomic(eeprom, ADDR_COMMIT, RECORD_SIZE, (byte) 0x00);
    }


    // -------------------------------------------------------------------------
    // INS 0x20 — Read All Records
    //
    // Returns all stored records in chronological order (oldest first).
    // Capped at 42 records (252 bytes) per call — APDU buffer constraint.
    // Full pagination is a production requirement.
    //
    // APDU format:
    //   CLA 0x80 | INS 0x20 | P1 0x00 | P2 0x00 | Le 0x00
    // Response: [COUNT × 6 bytes] + 90 00
    //           or 90 00 alone if buffer is empty
    // -------------------------------------------------------------------------
    private void readAllRecords(APDU apdu) {
        short count = Util.getShort(eeprom, ADDR_COUNT);

        // Empty buffer — return 9000 with no data body
        if (count == (short) 0) {
            return;
        }

        // Cap at prototype limit. Production would paginate here.
        short recordsToReturn = (count > MAX_READ_RECORDS) ? MAX_READ_RECORDS : count;
        short bytesToReturn   = (short)(recordsToReturn * RECORD_SIZE);

        apdu.setOutgoing();
        apdu.setOutgoingLength(bytesToReturn);

        byte[] buffer = apdu.getBuffer();
        short tail      = Util.getShort(eeprom, ADDR_TAIL);
        short index     = tail;
        short outOffset = (short) 0;

        // Walk from TAIL towards HEAD, copying each record into the output buffer
        for (short i = (short) 0; i < recordsToReturn; i++) {
            short srcAddress = (short)(ADDR_RECORDS + (short)(index * RECORD_SIZE));
            Util.arrayCopy(eeprom, srcAddress, buffer, outOffset, RECORD_SIZE);
            outOffset = (short)(outOffset + RECORD_SIZE);
            index = (short)((index + 1) % MAX_CAPACITY);
        }

        apdu.sendBytes((short) 0, bytesToReturn);
    }


    // -------------------------------------------------------------------------
    // INS 0x30 — Get Metadata
    //
    // Returns HEAD, TAIL, and COUNT values for diagnostics.
    // Used by test scripts to verify pointer state without reading all records.
    //
    // APDU format:
    //   CLA 0x80 | INS 0x30 | P1 0x00 | P2 0x00 | Le 0x06
    // Response: [HEAD uint16][TAIL uint16][COUNT uint16] + 90 00  (6 bytes total)
    // -------------------------------------------------------------------------
    private void getMetadata(APDU apdu) {
        apdu.setOutgoing();
        apdu.setOutgoingLength((short) 6);

        byte[] buffer = apdu.getBuffer();

        // HEAD, TAIL, COUNT are stored contiguously from ADDR_HEAD.
        // A single 6-byte copy covers all three.
        Util.arrayCopy(eeprom, ADDR_HEAD, buffer, (short) 0, (short) 6);

        apdu.sendBytes((short) 0, (short) 6);
    }


    // -------------------------------------------------------------------------
    // INS 0x40 — Write Patient ID
    //
    // Stores a 16-byte ASCII patient identifier on the card.
    // Example: "MY-2026-000142  " (padded with spaces to exactly 16 bytes)
    //
    // APDU format:
    //   CLA 0x80 | INS 0x40 | P1 0x00 | P2 0x00 | Lc 0x10 | [16 bytes ASCII]
    // Response: 90 00
    // -------------------------------------------------------------------------
    private void writePatientId(APDU apdu) {
        byte[] buffer = apdu.getBuffer();

        if (buffer[ISO7816.OFFSET_LC] != (byte) PATIENT_ID_SIZE) {
            ISOException.throwIt(ISO7816.SW_WRONG_LENGTH);
        }

        apdu.setIncomingAndReceive();
        Util.arrayCopy(buffer, ISO7816.OFFSET_CDATA,
                       eeprom, ADDR_PATIENT_ID,
                       PATIENT_ID_SIZE);
    }


    // -------------------------------------------------------------------------
    // INS 0x50 — Read Patient ID
    //
    // Returns the 16-byte ASCII patient identifier stored on the card.
    //
    // APDU format:
    //   CLA 0x80 | INS 0x50 | P1 0x00 | P2 0x00 | Le 0x10
    // Response: [16 bytes ASCII] + 90 00
    // -------------------------------------------------------------------------
    private void readPatientId(APDU apdu) {
        apdu.setOutgoing();
        apdu.setOutgoingLength(PATIENT_ID_SIZE);

        byte[] buffer = apdu.getBuffer();
        Util.arrayCopy(eeprom, ADDR_PATIENT_ID, buffer, (short) 0, PATIENT_ID_SIZE);

        apdu.sendBytes((short) 0, PATIENT_ID_SIZE);
    }


    // -------------------------------------------------------------------------
    // INS 0xFF — Reset Card  *** DEV ONLY — REMOVE BEFORE PRODUCTION ***
    //
    // Zeroes the entire EEPROM array, resetting all pointers, patient ID,
    // and every record to their blank state. Irreversible.
    // Never expose this command on a card in a clinical environment.
    //
    // APDU format:
    //   CLA 0x80 | INS 0xFF | P1 0x00 | P2 0x00
    // Response: 90 00
    // -------------------------------------------------------------------------
    private void resetCard(APDU apdu) {
        Util.arrayFillNonAtomic(eeprom, (short) 0, EEPROM_TOTAL, (byte) 0x00);
    }
}