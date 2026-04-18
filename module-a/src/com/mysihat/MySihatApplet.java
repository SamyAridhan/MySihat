package com.mysihat;

import javacard.framework.*;

public class MySihatApplet extends Applet {

    // -------------------------------------------------------------------------
    // EEPROM Address Constants
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
    // Size and Capacity Constants
    // -------------------------------------------------------------------------
    private static final short PATIENT_ID_SIZE  = (short) 16;
    private static final short RECORD_SIZE      = (short) 6;
    private static final short MAX_CAPACITY     = (short) 5456;
    private static final short MAX_READ_RECORDS = (short) 42;
    private static final short EEPROM_TOTAL     = (short) 32767;

    // -------------------------------------------------------------------------
    // APDU Instruction Bytes
    // -------------------------------------------------------------------------
    private static final byte INS_APPEND_RECORD    = (byte) 0x10;
    private static final byte INS_READ_ALL_RECORDS = (byte) 0x20;
    private static final byte INS_GET_METADATA     = (byte) 0x30;
    private static final byte INS_WRITE_PATIENT_ID = (byte) 0x40;
    private static final byte INS_READ_PATIENT_ID  = (byte) 0x50;
    private static final byte INS_RESET_CARD       = (byte) 0xFF;

    // -------------------------------------------------------------------------
    // Memory
    // -------------------------------------------------------------------------
    private byte[] eeprom;

    // -------------------------------------------------------------------------
    // Install and Constructor
    // -------------------------------------------------------------------------
    public static void install(byte[] bArray, short bOffset, byte bLength) {
        new MySihatApplet();
    }

    private MySihatApplet() {
        eeprom = new byte[EEPROM_TOTAL];
        register();
    }

    // -------------------------------------------------------------------------
    // APDU Dispatcher
    // -------------------------------------------------------------------------
    public void process(APDU apdu) {
        byte[] buffer = apdu.getBuffer();

        if (selectingApplet()) {
            bootRecovery();
            return;
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
    // Runs on every SELECT. If the commit buffer is non-zero, an interrupted
    // write is completed before any other command is processed.
    // -------------------------------------------------------------------------
    private void bootRecovery() {
        boolean commitPending = false;
        for (short i = (short) 0; i < RECORD_SIZE; i++) {
            if (eeprom[(short)(ADDR_COMMIT + i)] != (byte) 0x00) {
                commitPending = true;
                break;
            }
        }

        if (!commitPending) {
            return;
        }

        short head  = Util.getShort(eeprom, ADDR_HEAD);
        short count = Util.getShort(eeprom, ADDR_COUNT);

        // Calculate target address using explicit intermediate casts
        // JavaCard rule: every arithmetic intermediate must be cast to short
        short offset        = (short)(head * RECORD_SIZE);
        short targetAddress = (short)(ADDR_RECORDS + offset);

        Util.arrayCopy(eeprom, ADDR_COMMIT, eeprom, targetAddress, RECORD_SIZE);

        if (count == MAX_CAPACITY) {
            short tail = Util.getShort(eeprom, ADDR_TAIL);
            tail = incrementPointer(tail);
            Util.setShort(eeprom, ADDR_TAIL, tail);
        } else {
            count = (short)(count + 1);
            Util.setShort(eeprom, ADDR_COUNT, count);
        }

        head = incrementPointer(head);
        Util.setShort(eeprom, ADDR_HEAD, head);

        Util.arrayFillNonAtomic(eeprom, ADDR_COMMIT, RECORD_SIZE, (byte) 0x00);
    }

    // -------------------------------------------------------------------------
    // INS 0x10 — Append Record
    // -------------------------------------------------------------------------
    private void appendRecord(APDU apdu) {
        byte[] buffer = apdu.getBuffer();

        if (buffer[ISO7816.OFFSET_LC] != (byte) RECORD_SIZE) {
            ISOException.throwIt(ISO7816.SW_WRONG_LENGTH);
        }

        apdu.setIncomingAndReceive();

        // Phase 1: Write to commit buffer and verify
        Util.arrayCopy(buffer, ISO7816.OFFSET_CDATA,
                       eeprom, ADDR_COMMIT, RECORD_SIZE);

        if (Util.arrayCompare(buffer, ISO7816.OFFSET_CDATA,
                              eeprom, ADDR_COMMIT, RECORD_SIZE) != 0) {
            ISOException.throwIt((short) 0x6900);
        }

        // Phase 2: Commit to permanent circular buffer slot
        short head          = Util.getShort(eeprom, ADDR_HEAD);
        short count         = Util.getShort(eeprom, ADDR_COUNT);
        short offset        = (short)(head * RECORD_SIZE);
        short targetAddress = (short)(ADDR_RECORDS + offset);

        Util.arrayCopy(eeprom, ADDR_COMMIT, eeprom, targetAddress, RECORD_SIZE);

        if (count == MAX_CAPACITY) {
            short tail = Util.getShort(eeprom, ADDR_TAIL);
            tail = incrementPointer(tail);
            Util.setShort(eeprom, ADDR_TAIL, tail);
        } else {
            count = (short)(count + 1);
            Util.setShort(eeprom, ADDR_COUNT, count);
        }

        head = incrementPointer(head);
        Util.setShort(eeprom, ADDR_HEAD, head);

        Util.arrayFillNonAtomic(eeprom, ADDR_COMMIT, RECORD_SIZE, (byte) 0x00);
    }

    // -------------------------------------------------------------------------
    // INS 0x20 — Read All Records
    // -------------------------------------------------------------------------
    private void readAllRecords(APDU apdu) {
        short count = Util.getShort(eeprom, ADDR_COUNT);

        if (count == (short) 0) {
            return;
        }

        short recordsToReturn = (count > MAX_READ_RECORDS) ? MAX_READ_RECORDS : count;
        short bytesToReturn   = (short)(recordsToReturn * RECORD_SIZE);

        apdu.setOutgoing();
        apdu.setOutgoingLength(bytesToReturn);

        byte[] buffer   = apdu.getBuffer();
        short tail      = Util.getShort(eeprom, ADDR_TAIL);
        short index     = tail;
        short outOffset = (short) 0;

        for (short i = (short) 0; i < recordsToReturn; i++) {
            short srcOffset = (short)(index * RECORD_SIZE);
            short srcAddr   = (short)(ADDR_RECORDS + srcOffset);
            Util.arrayCopy(eeprom, srcAddr, buffer, outOffset, RECORD_SIZE);
            outOffset = (short)(outOffset + RECORD_SIZE);
            index = incrementPointer(index);
        }

        apdu.sendBytes((short) 0, bytesToReturn);
    }

    // -------------------------------------------------------------------------
    // INS 0x30 — Get Metadata
    // -------------------------------------------------------------------------
    private void getMetadata(APDU apdu) {
        apdu.setOutgoing();
        apdu.setOutgoingLength((short) 6);

        byte[] buffer = apdu.getBuffer();
        Util.arrayCopy(eeprom, ADDR_HEAD, buffer, (short) 0, (short) 6);

        apdu.sendBytes((short) 0, (short) 6);
    }

    // -------------------------------------------------------------------------
    // INS 0x40 — Write Patient ID
    // -------------------------------------------------------------------------
    private void writePatientId(APDU apdu) {
        byte[] buffer = apdu.getBuffer();

        if (buffer[ISO7816.OFFSET_LC] != (byte) PATIENT_ID_SIZE) {
            ISOException.throwIt(ISO7816.SW_WRONG_LENGTH);
        }

        apdu.setIncomingAndReceive();
        Util.arrayCopy(buffer, ISO7816.OFFSET_CDATA,
                       eeprom, ADDR_PATIENT_ID, PATIENT_ID_SIZE);
    }

    // -------------------------------------------------------------------------
    // INS 0x50 — Read Patient ID
    // -------------------------------------------------------------------------
    private void readPatientId(APDU apdu) {
        apdu.setOutgoing();
        apdu.setOutgoingLength(PATIENT_ID_SIZE);

        byte[] buffer = apdu.getBuffer();
        Util.arrayCopy(eeprom, ADDR_PATIENT_ID, buffer, (short) 0, PATIENT_ID_SIZE);

        apdu.sendBytes((short) 0, PATIENT_ID_SIZE);
    }

    // -------------------------------------------------------------------------
    // INS 0xFF — Reset Card (DEV ONLY — remove before production)
    // -------------------------------------------------------------------------
    private void resetCard(APDU apdu) {
        Util.arrayFillNonAtomic(eeprom, (short) 0, EEPROM_TOTAL, (byte) 0x00);
    }

    // -------------------------------------------------------------------------
    // Helper: Increment a circular buffer pointer
    //
    // Replaces modulo arithmetic (% MAX_CAPACITY) which produces int
    // intermediates that the JavaCard 2.2.2 converter rejects.
    // This conditional form is the standard JavaCard-safe pattern.
    // -------------------------------------------------------------------------
    private short incrementPointer(short pointer) {
        pointer = (short)(pointer + 1);
        if (pointer >= MAX_CAPACITY) {
            pointer = (short) 0;
        }
        return pointer;
    }
}