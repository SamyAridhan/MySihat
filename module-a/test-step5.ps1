$GP = "C:\Users\samyh\Desktop\MySihat\MySihat\tools\gp.jar"

$SELECT = "00A4040009A00000006203010C01"
$APPEND = "8010000006000100013468"
$META   = "8030000006"

# ── PHASE 1: Write 10 records then read metadata ───────────────────────────
Write-Host "`n=== PHASE 1: Writing 10 records + reading metadata ===" -ForegroundColor Cyan

java -jar $GP `
  --apdu $SELECT `
  --apdu $APPEND `
  --apdu $APPEND `
  --apdu $APPEND `
  --apdu $APPEND `
  --apdu $APPEND `
  --apdu $APPEND `
  --apdu $APPEND `
  --apdu $APPEND `
  --apdu $APPEND `
  --apdu $APPEND `
  --apdu $META

Write-Host @"

Expected final response (before 9000):
  00 0A 00 00 00 0A
  HEAD=10  TAIL=0  COUNT=10
"@ -ForegroundColor Yellow

# ── PHASE 2: Power cycle then re-check ─────────────────────────────────────
Write-Host "`n>>> Physically remove the card now." -ForegroundColor Red
Write-Host ">>> Re-insert it, then press Enter." -ForegroundColor Red
Read-Host

Write-Host "`n=== PHASE 2: Metadata after power cycle ===" -ForegroundColor Cyan

java -jar $GP `
  --apdu $SELECT `
  --apdu $META

Write-Host @"

Pass criteria: identical 6-byte response to Phase 1.
"@ -ForegroundColor Yellow