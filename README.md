# MySihat — Offline-First Medical Records on Physical Silicon

> *Compressing a patient's complete clinical history into 6 bytes. Verified on hardware.*

**MySihat** is a decentralised, offline-first medical records system built for rural Malaysian clinics. Patient history is written directly to a JavaCard smart card — the same hardware class as the Malaysian MyKad (national identity card). Any equipped clinic reads and updates records in milliseconds with zero internet dependency. When connectivity is restored, records sync upstream to Malaysia's MySejahtera platform using standard ICD-10 codes.

**Status: ✅ Complete — all modules verified on physical hardware.**

---

## 🔗 Quick Links

- 🎬 **[Demo Video](https://youtu.be/XbPvEuUyJkM?si=66hwaejAcwHw6qT5)** — Full end-to-end hardware demo *(YouTube link coming soon)*

---

## The Problem

Malaysia's national health platform, MySejahtera, is cloud-first. When a rural clinic in Kelantan, Sabah, or Sarawak loses connectivity, doctors cannot access patient histories — no allergies, no active medications, no prior diagnoses. Decisions are made on patient memory alone.

MySihat is the offline last-mile layer that makes the national "1 Citizen 1 Record" initiative universally accessible:

| MySejahtera | MySihat |
|---|---|
| Requires internet at point of care | Works with zero connectivity |
| Requires patient smartphone | Works with a physical card the patient carries |
| Cloud-authoritative | Card-authoritative, cloud-synced |

MySihat sync payloads include ICD-10 codes, making records directly interpretable by MySejahtera. The two systems are complementary — MySihat feeds the same national platform, it does not replace it.

---

## Hardware

| Component | Role | Specification |
|---|---|---|
| **Feitian JavaCOS A22CR** | Patient data card | JavaCard 2.2.2 · GlobalPlatform 2.1.1 · CC EAL5+ · 150KB EEPROM |
| **ACS ACR39U-U1** | Clinic-side card reader | USB-A · PC/SC compliant · same reader class as Klinik Kesihatan |

The Feitian A22CR is the same hardware class as the Malaysian MyKad — a JavaCard chip with an on-card processor running a custom applet. The prototype uses the same platform as the national identity infrastructure, not a simulation of it.

---

## System Architecture

```
JavaCard Applet (patient's card)       ← Module A
       ↕  APDU over ISO 7816
ACS ACR39U + PC/SC driver              ← Module C
       ↕  JSON over localhost HTTP
Node.js Express + React + SQLite       ← Module B
       ↕  HTTPS (when available)
MySejahtera central server             ← Cloud sync (append-only)
```

**Cardinal rule: data flows in one direction only — Card → Clinic → Cloud.**

The card is always the authoritative source. The cloud is append-only backup. Sync conflicts are physically impossible — a JavaCard is a singular physical object that can only be at one clinic at a time.

---

## Module A — JavaCard Applet

The applet runs directly on the card's processor and manages a circular buffer in EEPROM. External systems are clients of the applet's interface — they never manage raw memory addresses.

### The 6-Byte Record

Every medical record is exactly 6 bytes:

```
Bytes 0–1:  diagnosis_id  (uint16, big-endian)  ← ICD-10 codebook integer
Bytes 2–3:  medication_id (uint16, big-endian)  ← medication codebook integer
Bytes 4–5:  date_packed   (uint16, big-endian)  ← bit-packed date field
```

The date field packs a full calendar date into 16 bits:

```
[15:9]  year offset from 2000  (7 bits  — covers 2000–2127)
[8:5]   month                  (4 bits  — values 1–12)
[4:0]   day                    (5 bits  — values 1–31)

Pack:   date = ((year - 2000) << 9) | (month << 5) | day
Unpack: year  = ((date >> 9) & 0x7F) + 2000
        month = (date >> 5) & 0x0F
        day   =  date & 0x1F
```

### Capacity

| Parameter | Value |
|---|---|
| EEPROM allocated | 32,767 bytes |
| Metadata reserved | 28 bytes (pointers + commit buffer + patient ID) |
| Record buffer | 32,739 bytes |
| **Maximum records** | **5,456** |
| At 1 visit/month | ~454 years |

### Circular Buffer

HEAD and TAIL pointers track the write position and oldest-record position. COUNT is stored separately — when the buffer is full, HEAD == TAIL is ambiguous without it. When full, each new write evicts the oldest record and advances both HEAD and TAIL.

**Critical JavaCard constraint:** The `%` modulo operator produces an `int` intermediate, which the JavaCard 2.2.2 converter rejects. All pointer wrap-around uses explicit conditional branching:

```java
private short incrementPointer(short pointer) {
    pointer = (short)(pointer + 1);
    if (pointer >= MAX_CAPACITY) {
        pointer = (short) 0;
    }
    return pointer;
}
```

### Two-Phase Commit

Card removal mid-write cannot leave the buffer in a corrupt state:

- **Phase 1:** Write to a dedicated 6-byte commit buffer. Read back and verify byte-for-byte.
- **Phase 2:** Copy verified record to permanent buffer slot. Update pointers. Clear commit buffer.
- **On next insertion:** `selectingApplet()` checks the commit buffer. Non-zero means Phase 2 was interrupted — re-execute Phase 2 before processing any commands.

### EEPROM Memory Map

| Address | Size | Purpose |
|---|---|---|
| `0x0000–0x0001` | 2 bytes | HEAD pointer |
| `0x0002–0x0003` | 2 bytes | TAIL pointer |
| `0x0004–0x0005` | 2 bytes | COUNT |
| `0x0006–0x000B` | 6 bytes | Two-phase commit buffer |
| `0x000C–0x001B` | 16 bytes | Patient ID (ASCII) |
| `0x001C–0x7FFE` | 32,739 bytes | Circular record buffer |

### APDU Command Interface

```
AID: A0 00 00 00 62 03 01 0C 01
```

| INS | Command | Direction | Description |
|---|---|---|---|
| `0x10` | APPEND RECORD | → card | Write one 6-byte record |
| `0x20` | READ ALL RECORDS | ← card | Return up to 42 records |
| `0x30` | GET METADATA | ← card | HEAD, TAIL, COUNT |
| `0x40` | WRITE PATIENT ID | → card | Store 16-byte ASCII patient ID |
| `0x50` | READ PATIENT ID | ← card | Return 16-byte ASCII patient ID |

### Verified on Hardware ✅

```
Stress test: 6,000 writes on Feitian JavaCOS A22CR

At capacity  (5,456 records): HEAD=0    TAIL=0    COUNT=0x1550 ✅
First evict  (5,457 records): HEAD=1    TAIL=1    COUNT=0x1550 ✅
Sustained    (6,000 records): HEAD=544  TAIL=544  COUNT=0x1550 ✅

COUNT never exceeded 5,456. Pointer persistence confirmed across power cycle.
Two-phase commit verified: mid-write card removal → boot recovery → no data loss.
```

---

## Module B — Clinic Interface

Full offline doctor workflow: login, card read, history view, record entry, sync.

**Stack:** Node.js (Express) · React (Vite) · SQLite (WAL mode) · JWT session auth

### ICD-10 Codebook

Medical text is compressed to a 2-byte integer on the card. A JSON codebook maps integers to ICD-10 codes and human-readable text. Example:

| On card | Decodes to | ICD-10 |
|---|---|---|
| `0x0001` | Essential Hypertension | I10 |
| `0x0002` | Type 2 Diabetes Mellitus | E11 |
| `0x0004` | Dengue Fever | A97.0 |

The server refuses to start if any codebook diagnosis entry is missing an ICD-10 field — silent null codes in sync payloads are caught at load time, not in production data.

### Compression Ratio

| Data | Raw size | MySihat size | Reduction |
|---|---|---|---|
| "Essential Hypertension" | 22 bytes | 2 bytes (integer ID) | ~91% |
| Full visit record (diagnosis + medication + date) | ~40 bytes | **6 bytes** | **~85%** |

### Offline Sync Worker

Fires every 30 seconds. Checks connectivity (HEAD to `1.1.1.1`). If online, POSTs all unsynced records as ICD-10 payloads to the central endpoint. On HTTP 200, marks records synced. Queue accumulates without limit while offline. No comparison with the cloud is ever needed — the clinic is always the origin of every record.

### Hardware Abstraction

Four interface functions (`cardReadAllRecords`, `cardWriteRecord`, `cardReadPatientId`, `cardGetMetadata`) have identical signatures in mock mode and real hardware mode. Nothing else in the application knows which mode is active. The full demo runs on any laptop with `HARDWARE_MODE=false` — no card or reader required.

---

## Module C — Physical Card Layer

Bridges Node.js to the physical card via PC/SC.

**Stack:** Node.js · `pcsclite` npm package · ACS ACR39U-U1

The `pcsclite` library fires a status event on card insertion. The handler waits 200ms for contact pin settling, connects, sends SELECT to activate the MySihat applet, reads the patient ID, and emits `card.inserted`. The React frontend polls `POST /api/card/read` every 2 seconds — when a card is present, the next poll returns the patient ID and the UI transitions automatically.

**Key implementation notes:**
- `SCARD_PROTOCOL_T1` integer value is `2`, not `1` — passing `1` causes a silent OS-level failure
- The pcsclite status event fires twice on insertion — a `sessionActive` boolean guard prevents double-connect
- On Windows with VS2026: install VS2022 Build Tools standalone — node-gyp only recognises VS up to major version 17

---

## End-to-End Demo (Confirmed on Physical Hardware)

```
Verified on: Feitian JavaCOS A22CR + ACS ACR39U-U1 + Windows 11

[Hardware] Card reader ready: ACS ACR39U ICC Reader 0
[Card]     State updated → present=true, patientId="MY-2026-000142"
[Patient]  New record saved — diagnosis: Essential Hypertension (I10)
[Sync]     ✅ Synced 1 record(s) → HTTP 200
```

Full flow: reader detects on startup → card inserted → patient ID read off silicon → history loads in UI → doctor adds record → 6 bytes written to card EEPROM → SQLite saved → sync worker POSTs ICD-10 payload → sync bar turns green. Pull the network cable — core workflow continues unchanged.

---

## Repository Structure

```
MySihat/
├── module-a/               JavaCard applet (Java · JavaCard SDK 2.2.2)
│   ├── src/com/mysihat/
│   │   └── MySihatApplet.java
│   ├── build.xml           ant-javacard build file
│   ├── test-step5.ps1      pointer persistence test script
│   └── test-step6-batched.ps1  6,000-record stress test
│
├── module-b/               Clinic interface (Node.js · React · SQLite)
│   ├── backend/
│   │   ├── server.js
│   │   ├── hardware.js     hardware abstraction layer
│   │   ├── routes/
│   │   └── data/
│   │       └── codebook.json
│   └── frontend/           React (Vite)
│
├── module-c/               Physical card layer (Node.js · pcsclite)
│   └── card-service.js
│
└── tools/
    ├── gp.jar              GlobalPlatformPro (requires JDK 17+)
    └── ant-javacard.jar    JavaCard build tool
```

---

## Security Model

The prototype implements Layer 1 (clinic-side session authentication via JWT). The full production architecture mirrors the EMV bank card model:

| Layer | Description | Status |
|---|---|---|
| 1 | Clinic session auth (JWT, 8-hour expiry) | ✅ Implemented |
| 2 | Card-side PIN (JavaCard `OwnerPIN`) | Designed, documented |
| 3 | Applet-controlled memory access | Designed, documented |
| 4 | Mutual AES challenge-response | Designed, documented |
| 5 | National key authority (JPN/MOH holds GP credentials) | Designed, documented |

One-line threat model: **identical to a lost bank card.**

---

## Key Numbers

| Parameter | Value |
|---|---|
| Record size | **6 bytes** |
| Maximum records per card | **5,456** |
| Capacity at 1 visit/month | **~454 years** |
| Date field coverage | 2000–2127 |
| Prototype codebook | 50 diagnoses + 50 medications |
| JavaCard API version | 2.2.2 |
| GlobalPlatform version | 2.1.1 |
| Sync interval | 30 seconds |
| APDU read cap (prototype) | 42 records per call |

---

## Toolchain

| Tool | Purpose |
|---|---|
| JDK 8 (Temurin) | JavaCard applet compilation (via ant-javacard) |
| ant-javacard | Build tool — handles JDK ↔ JavaCard SDK compatibility |
| JavaCard SDK 2.2.2 | Card API classes and export files |
| GlobalPlatformPro (`gp.jar`) | Load `.cap` onto physical card (requires JDK 17+) |
| Node.js v20 | Backend and PC/SC bridge |
| React + Vite | Clinic frontend |

---

> **MySihat: the offline bridge that ensures the national health initiative reaches every Malaysian. When connectivity is available, MySihat syncs to the same central system. When it isn't, the patient still receives full care. The card IS the record.**
