# My Sihat: Offline-First National Health Record System

**My Sihat** is a decentralized, offline-first healthcare record system designed to bridge the connectivity gap in rural Malaysia. It utilizes the Malaysian National ID (MyKad) as a secure, high-density offline cache for medical history, ensuring equitable healthcare access regardless of internet availability.

## 🔗 Quick Links

* [**Live Prototype (Elderly/OKU View)**](https://hackaholics-prototype.lovable.app) - Interactive web view of the inclusive interface.
* [**IC Chip Read/Write Simulator**](https://claude.ai/public/artifacts/e6832a85-837b-466b-99d7-264e7ff497d1?fullscreen=false) - Live demo of the circular buffer and doctor's workflow.
* [**Pitch Deck**](https://www.canva.com/design/DAG60cjekIg/mYH7yzfiurLxs1h0yCjwUw/view?utm_content=DAG60cjekIg&utm_campaign=designshare&utm_medium=link2&utm_source=uniquelinks&utlId=h7bd137fbd5) - View the full project vision.

## 🏗 System Architecture

My Sihat operates on a **"Chip-First, Cloud-Sync"** architecture.

1. **Codebook Protocol:** Medical text (e.g., "Type 2 Diabetes") is compressed into international bytecodes (e.g., `E11`), allowing ~500 visits to fit on a standard 32KB MyKad chip.
2. **Circular Buffer:** A low-level C++ driver manages memory as a self-cleaning loop, automatically overwriting the oldest records when full to prevent crashes.
3. **Asynchronous Smart-Sync:** Local backups are cryptographically locked to authorized hardware and synced to the cloud only when connectivity is restored.

## 📂 Repository Contents

This repository contains two core components of the My Sihat engineering stack:

### 1. `cpp-driver-core` (The Engine)
A simulated low-level C++ driver demonstrating how we achieve "Zero-Copy" read/write speeds on limited hardware.
* **Features:** Direct Memory Access (DMA), Bit-packing (`#pragma pack`), and Circular Buffer logic.
* **File:** `/driver/mysihat_core.cpp`

### 2. `react-clinic-sim` (The Implementation)
A React-based simulator showing the Clinic/Doctor experience.
* **Features:** Visualizes the "Read -> Diagnose -> Write" flow, circular buffer capacity UI, and compression ratio analytics.
* **File:** `/simulator/src/SmartIDDemo.jsx`

## 💻 Technical Deep Dive

### The Low-Level Driver (C++)
The core storage logic uses manual pointer arithmetic to manage the EEPROM lifecycle without OS overhead.

```cpp
// Snippet from mysihat_core.cpp
struct VisitRecord {
    uint16_t date_compact;    // 2 bytes: Encoded date
    uint16_t diag_code;       // 2 bytes: Compressed ICD-10
    uint16_t med_code;        // 2 bytes: Compressed ATC
};

// Circular Write Logic
header->head_idx = (header->head_idx + 1) % header->max_capacity;
