#include <iostream>
#include <cstdint>
#include <cstring>
#include <iomanip>

// ==========================================
// LOW-LEVEL FIRMWARE DEFINITIONS
// ==========================================

// Simulating the Fixed 32KB EEPROM limit of a MyKad
#define MAX_EEPROM_SIZE 32000 
// Fixed size for our circular history buffer (e.g., 20KB)
#define HISTORY_PARTITION_SIZE 20480 

// Byte-aligned structures to ensure exact memory layout (Crucial for Hardware)
#pragma pack(push, 1)

struct VisitRecord {
    uint16_t date_compact;    // 2 bytes: Encoded date (Year/Month/Day bit-packed)
    uint16_t diag_code;       // 2 bytes: Compressed ICD-10 (e.g., 0xA142 for 'E11')
    uint16_t med_code;        // 2 bytes: Compressed ATC (e.g., 0xB001 for 'N02BE01')
    // Total size per record: 6 BYTES (Extremely compact)
};

struct CardHeader {
    uint32_t magic_bytes;     // 4 bytes: To verify this is a MySihat card
    uint16_t head_idx;        // 2 bytes: Write pointer (index of next free slot)
    uint16_t count;           // 2 bytes: Total records currently stored
    uint16_t max_capacity;    // 2 bytes: Max records fit in partition
};

#pragma pack(pop)

// ==========================================
// PORTABLE DRIVER LOGIC
// ==========================================

class MySihatDriver {
private:
    uint8_t* raw_memory; // Pointer to the raw bytes of the card/simulation

    // Helper: Get pointer to the Header section
    CardHeader* get_header() {
        return reinterpret_cast<CardHeader*>(raw_memory);
    }

    // Helper: Get pointer to the Visit Record array base
    VisitRecord* get_history_buffer() {
        // History starts immediately after the Header
        return reinterpret_cast<VisitRecord*>(raw_memory + sizeof(CardHeader));
    }

public:
    // Initialize with a raw memory block (could be from a real Card Reader or a File)
    MySihatDriver(uint8_t* buffer) : raw_memory(buffer) {}

    // 1. Format/Reset the Card (One-time setup)
    void format_card() {
        CardHeader* header = get_header();
        header->magic_bytes = 0x53494854; // ASCII for 'SIHT'
        header->head_idx = 0;
        header->count = 0;
        
        // Calculate how many 6-byte records fit in our partition
        // (20480 bytes) / (6 bytes per record) = ~3413 visits
        header->max_capacity = HISTORY_PARTITION_SIZE / sizeof(VisitRecord);
        
        std::cout << "[DRIVER] Card Formatted. Capacity: " << header->max_capacity << " visits.\n";
    }

    // 2. The Low-Level Circular Write
    bool write_visit(uint16_t date, uint16_t diagnosis, uint16_t med) {
        CardHeader* header = get_header();
        VisitRecord* buffer = get_history_buffer();

        // POINTER ARITHMETIC: specific slot calculation
        // We write to: Base + (CurrentIndex * StructSize)
        uint16_t write_pos = header->head_idx;
        
        // Direct Memory Access (DMA) write
        buffer[write_pos].date_compact = date;
        buffer[write_pos].diag_code = diagnosis;
        buffer[write_pos].med_code = med;

        std::cout << "[DRIVER] Wrote Record at Index [" << write_pos << "] "
                  << "| Date: " << std::hex << date 
                  << " Diag: " << diagnosis << "\n";

        // CIRCULAR LOGIC: Move pointer forward, wrap around if at end
        header->head_idx = (header->head_idx + 1) % header->max_capacity;

        // Update count (cap at max if full)
        if (header->count < header->max_capacity) {
            header->count++;
        }
        
        return true;
    }

    // 3. Read Dump (For verification)
    void dump_latest_records(int limit) {
        CardHeader* header = get_header();
        VisitRecord* buffer = get_history_buffer();
        
        std::cout << "\n--- Reading Card (Last " << limit << ") ---\n";
        
        int records_to_read = (limit < header->count) ? limit : header->count;
        
        // To read latest, we look backward from the current HEAD
        for (int i = 0; i < records_to_read; i++) {
            // Pointer Arithmetic for Circular "Lookback"
            int read_idx = (header->head_idx - 1 - i);
            if (read_idx < 0) read_idx += header->max_capacity; // Handle wrap-around

            VisitRecord r = buffer[read_idx];
            std::cout << "Visit -" << i << ": [RAW: " 
                      << std::hex << std::setw(4) << r.diag_code << "] \n";
        }
    }
};

// ==========================================
// JUDGE'S TEST BENCH
// ==========================================
int main() {
    // 1. Simulate the physical chip memory (Heap allocation for simulation)
    // In a real scenario, this 'eeprom' pointer comes from the Smart Card Reader driver
    uint8_t* eeprom = new uint8_t[MAX_EEPROM_SIZE];

    // 2. Initialize our portable driver
    MySihatDriver driver(eeprom);
    driver.format_card();

    // 3. Simulate overwriting: Fill buffer + 2 extra to prove circular logic
    // Let's pretend max capacity is small for the demo (hack the header)
    // In reality, this loop would run for years.
    
    std::cout << "\n[TEST] Simulating overflow...\n";
    
    // Write 5 records
    driver.write_visit(0x2512, 0xE11, 0xA01); // Visit 1
    driver.write_visit(0x2512, 0xE12, 0xA02); // Visit 2
    driver.write_visit(0x2512, 0xE13, 0xA03); // Visit 3
    // ... imagine 3000 visits later ...
    driver.write_visit(0x2601, 0x999, 0xB05); // Visit N (Newest)

    // 4. Verify Read
    driver.dump_latest_records(3);

    delete[] eeprom;
    return 0;
}
