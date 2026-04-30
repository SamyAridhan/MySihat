# reset-and-reload.ps1
# Wipes the MySihat card and reloads 14 clinically correct records.
# Run from: C:\Users\samyh\Desktop\MySihat\MySihat\module-a\
# Usage:    .\reset-and-reload.ps1

$GP = "java -jar C:\Users\samyh\Desktop\MySihat\MySihat\tools\gp.jar"
# ADDED: The SELECT APDU to wake up the MySihat applet
$SELECT = "--apdu 00A4040009A00000006203010C01"

Write-Host ""
Write-Host "=== MySihat Card Reset and Reload ===" -ForegroundColor Cyan
Write-Host "Make sure the card is inserted in the ACR39U reader."
Write-Host ""

# Step 1: Verify card is reachable
Write-Host "[1/4] Checking card..." -ForegroundColor Yellow
$listOutput = Invoke-Expression "$GP --list" 2>&1
if ($listOutput -match "A00000006203010C01") {
    Write-Host "      MySihat applet found - SELECTABLE." -ForegroundColor Green
} else {
    Write-Host "      ERROR: MySihat applet not found. Is the card inserted?" -ForegroundColor Red
    exit 1
}

# Step 2: Reset card (DEV command - zeroes entire EEPROM)
Write-Host "[2/4] Resetting card EEPROM..." -ForegroundColor Yellow
# ADDED $SELECT before the command
Invoke-Expression "$GP $SELECT --apdu 80FF0000" | Out-Null
Write-Host "      Card wiped." -ForegroundColor Green

# Step 3: Write Patient ID
# "MY-2026-000142" = 14 chars, padded to 16 bytes with two trailing spaces (0x20)
# Hex: 4D592D323032362D3030303134322020
Write-Host "[3/4] Writing Patient ID: MY-2026-000200..." -ForegroundColor Yellow
Invoke-Expression "$GP $SELECT --apdu 80400000104D592D323032362D3030303230302020" | Out-Null
Write-Host "      Patient ID written." -ForegroundColor Green

# Step 4: Write 14 medical records
Write-Host "[4/4] Writing 14 records (oldest to newest)..." -ForegroundColor Yellow

$apdus = @(
    # --- 2025 ---
    "801000000600040001330F",  # 01 | 2025-08-15 | Dengue Fever                 | Paracetamol 500mg
    
    # --- 2026 ---
    "8010000006000B0001344A",  # 02 | 2026-02-10 | Osteoarthritis, Unspecified  | Paracetamol 500mg
    "8010000006000300023476",  # 03 | 2026-03-22 | URTI                         | Amoxicillin 250mg
    "8010000006000A000A348F",  # 04 | 2026-04-15 | Hyperlipidaemia              | Simvastatin 20mg
    "8010000006000A000B349C"   # 05 | 2026-04-28 | Hyperlipidaemia              | Atorvastatin 10mg
)

# Strip any whitespace from hex strings
$apdus = $apdus | ForEach-Object { $_ -replace '\s', '' }

$recordNum = 0
$errors = 0
foreach ($apdu in $apdus) {
    $recordNum++
    # ADDED $SELECT before each apdu loop command
    $result = Invoke-Expression "$GP $SELECT --apdu $apdu" 2>&1
    if ($result -match "9000") {
        Write-Host ("      [{0:D2}/14] OK" -f $recordNum) -ForegroundColor Green
    } else {
        Write-Host ("      [{0:D2}/14] ERROR: {1}" -f $recordNum, ($result -join " ")) -ForegroundColor Red
        $errors++
    }
}

# Verify: read metadata
Write-Host ""
Write-Host "Verifying final card state..." -ForegroundColor Yellow
# ADDED $SELECT before reading metadata
$meta = Invoke-Expression "$GP $SELECT --apdu 8030000006" 2>&1
$metaLine = $meta | Where-Object { $_ -match "^[0-9a-fA-F]" } | Select-Object -First 1
if ($metaLine) {
    $hex   = ($metaLine -replace "9000", "").Trim()
    $head  = [Convert]::ToInt32($hex.Substring(0, 4), 16)
    $tail  = [Convert]::ToInt32($hex.Substring(4, 4), 16)
    $count = [Convert]::ToInt32($hex.Substring(8, 4), 16)
    Write-Host "  HEAD  = $head"  -ForegroundColor Cyan
    Write-Host "  TAIL  = $tail"  -ForegroundColor Cyan
    Write-Host "  COUNT = $count" -ForegroundColor Cyan

    if ($count -eq 14 -and $errors -eq 0) {
        Write-Host ""
        Write-Host "SUCCESS - 14 records on card. Card is ready." -ForegroundColor Green
        Write-Host "Next: run  node cleanup-db.js  to clear stale SQLite records." -ForegroundColor Gray
    } else {
        Write-Host ""
        Write-Host "WARNING - COUNT=$count, errors=$errors. Review output above." -ForegroundColor Red
    }
} else {
    Write-Host "Could not read metadata. Raw output:" -ForegroundColor Red
    Write-Host ($meta -join "`n") -ForegroundColor Gray
}
Write-Host ""