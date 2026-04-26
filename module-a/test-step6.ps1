$GP     = "C:\Users\samyh\Desktop\MySihat\MySihat\tools\gp.jar"
$SELECT = "00A4040009A00000006203010C01"
$APPEND = "8010000006000100013468"
$META   = "8030000006"
$RESET  = "80FF000000"

$BATCH  = 100   # APDUs per java call — safe under Windows limit
$TARGET = 5456  # fill to exact capacity

function Read-Meta {
    $out = java -jar $GP --apdu $SELECT --apdu $META 2>&1 |
           Where-Object { $_ -match '^[0-9a-f]' }
    $hex = $out -replace '\s',''
    if ($hex.Length -ge 12) {
        $head  = [Convert]::ToInt32($hex.Substring(0,4),  16)
        $tail  = [Convert]::ToInt32($hex.Substring(4,4),  16)
        $count = [Convert]::ToInt32($hex.Substring(8,4),  16)
        Write-Host "  HEAD=$head  TAIL=$tail  COUNT=$count  (raw: $hex)" -ForegroundColor Green
    } else {
        Write-Host "  Could not parse metadata: '$hex'" -ForegroundColor Red
    }
}

function Write-Batch ($n) {
    $apdus = @("--apdu", $SELECT)
    1..$n | ForEach-Object { $apdus += @("--apdu", $APPEND) }
    java -jar $GP @apdus | Out-Null
}

# ── Reset ──────────────────────────────────────────────────────────────────
Write-Host "`n=== Resetting card ===" -ForegroundColor Cyan
java -jar $GP --apdu $SELECT --apdu $RESET | Out-Null
Write-Host "Reset done." -ForegroundColor Green
Read-Meta

# ── Phase 1: Fill to capacity in batches ───────────────────────────────────
Write-Host "`n=== PHASE 1: Writing $TARGET records in batches of $BATCH ===" -ForegroundColor Cyan

$written = 0
while ($written -lt $TARGET) {
    $n = [Math]::Min($BATCH, $TARGET - $written)
    Write-Batch $n
    $written += $n
    if ($written % 500 -eq 0 -or $written -eq $TARGET) {
        Write-Host "  Written: $written / $TARGET" -ForegroundColor DarkCyan
    }
}

Write-Host "`nMetadata at exact capacity:" -ForegroundColor Yellow
Read-Meta
Write-Host "  Expected: HEAD=0  TAIL=0  COUNT=5456" -ForegroundColor Yellow

# ── Phase 2: One more write — first overwrite ──────────────────────────────
Write-Host "`n=== PHASE 2: One more write (first overwrite) ===" -ForegroundColor Cyan
Write-Batch 1
Read-Meta
Write-Host "  Expected: HEAD=1  TAIL=1  COUNT=5456" -ForegroundColor Yellow

# ── Phase 3: 543 more — sustained wrap ────────────────────────────────────
Write-Host "`n=== PHASE 3: 543 more writes (6000 total since reset) ===" -ForegroundColor Cyan
$written2 = 0
while ($written2 -lt 543) {
    $n = [Math]::Min($BATCH, 543 - $written2)
    Write-Batch $n
    $written2 += $n
}
Read-Meta
Write-Host "  Expected: HEAD=544  TAIL=544  COUNT=5456" -ForegroundColor Yellow

Write-Host "`n=== Step 6 complete ===" -ForegroundColor Cyan