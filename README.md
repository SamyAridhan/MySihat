My Sihat: Offline-First National Health Record System

My Sihat is a decentralized, offline-first healthcare record system designed to bridge the connectivity gap in rural Malaysia. It utilizes the Malaysian National ID (MyKad) as a secure, high-density offline cache for medical history, ensuring equitable healthcare access regardless of internet availability.

🔗 Quick Links

Live Prototype (Elderly/OKU View) - Interactive Figma/Web view of the inclusive interface.

Pitch Deck - View the full project vision.

🏗 System Architecture

My Sihat operates on a "Chip-First, Cloud-Sync" architecture.

Codebook Protocol: Medical text (e.g., "Type 2 Diabetes") is compressed into international bytecodes (e.g., E11), allowing ~500 visits to fit on a standard 32KB MyKad chip.

Circular Buffer: A low-level C++ driver manages memory as a self-cleaning loop, automatically overwriting the oldest records when full to prevent crashes.

Asynchronous Smart-Sync: Local backups are cryptographically locked to authorized hardware and synced to the cloud only when connectivity is restored.

📂 Repository Contents

This repository contains two core components of the My Sihat engineering stack:

1. cpp-driver-core (The Engine)

A simulated low-level C++ driver demonstrating how we achieve "Zero-Copy" read/write speeds on limited hardware.

Features: Direct Memory Access (DMA), Bit-packing (#pragma pack), and Circular Buffer logic.

File: /driver/mysihat_core.cpp

2. react-clinic-sim (The Implementation)

A React-based simulator showing the Clinic/Doctor experience.

Features: Visualizes the "Read -> Diagnose -> Write" flow, circular buffer capacity UI, and compression ratio analytics.

File: /simulator/src/SmartIDDemo.jsx

💻 Technical Deep Dive

The Low-Level Driver (C++)

The core storage logic uses manual pointer arithmetic to manage the EEPROM lifecycle without OS overhead.

// Snippet from mysihat_core.cpp
struct VisitRecord {
    uint16_t date_compact;    // 2 bytes: Encoded date
    uint16_t diag_code;       // 2 bytes: Compressed ICD-10
    uint16_t med_code;        // 2 bytes: Compressed ATC
};

// Circular Write Logic
header->head_idx = (header->head_idx + 1) % header->max_capacity;


The "Codebook" Compression Strategy

We utilize a lookup dictionary to maximize storage efficiency.

Data Type

Raw Text Size

MySihat Code Size

Reduction

Diagnosis

"Essential Hypertension" (22 bytes)

I10 (2 bytes)

~90%

Medication

"Paracetamol 500mg" (17 bytes)

N02 (2 bytes)

~88%
