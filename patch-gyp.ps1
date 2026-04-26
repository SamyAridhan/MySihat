$f = 'C:\Users\samyh\AppData\Local\nvm\v20.20.2\node_modules\npm\node_modules\node-gyp\lib\find-visualstudio.js'
$c = Get-Content $f -Raw

# Patch 1 & 2: Add 2026 to supported years arrays (already done, harmless to re-apply)
$c = $c -replace '\[2019, 2022\]', '[2019, 2022, 2026]'

# Patch 3: Add versionMajor 18 → 2026 detection
$old3 = "if (ret.versionMajor === 17) {`n      ret.versionYear = 2022`n      return ret`n    }"
$new3 = "if (ret.versionMajor === 17) {`n      ret.versionYear = 2022`n      return ret`n    }`n    if (ret.versionMajor === 18) {`n      ret.versionYear = 2026`n      return ret`n    }"
$c = $c.Replace($old3, $new3)

# Patch 4: Add versionYear 2026 → toolset v143
$old4 = "} else if (versionYear === 2022) {`n      return 'v143'`n    }"
$new4 = "} else if (versionYear === 2022) {`n      return 'v143'`n    } else if (versionYear === 2026) {`n      return 'v143'`n    }"
$c = $c.Replace($old4, $new4)

Set-Content $f $c -NoNewline
Write-Host "Done. Verifying..."
Select-String -Path $f -Pattern '2026' | Select-Object LineNumber, Line | Format-Table -AutoSize -Wrap