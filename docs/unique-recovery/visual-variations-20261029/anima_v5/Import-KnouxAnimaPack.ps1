param(
  [string]$ZipPath = ""
)
$ErrorActionPreference = 'Stop'
$ProjectRoot = 'D:\KnouxCrypt'
$Target = Join-Path $ProjectRoot 'visuals\anima_v5'
$ExpectedZipHash = '6762949092df5ba4cdafdb0011245ade786df3bd4482e72409e1c8dcf1548cc0'
$PackageName = 'KNOUX_CRYPT_ANIMA_V5_ORGANIZED.zip'

function Stop-With([string]$Message) { throw "KNOUX ANIMA IMPORT: $Message" }

if (-not (Test-Path -LiteralPath (Join-Path $ProjectRoot '.git'))) {
  Stop-With 'Git project root was not detected; nothing imported.'
}
if (-not (Test-Path -LiteralPath $Target)) {
  New-Item -ItemType Directory -Path $Target | Out-Null
}
if ([string]::IsNullOrWhiteSpace($ZipPath)) {
  $candidates = @(
    (Join-Path $env:USERPROFILE ('Downloads\' + $PackageName)),
    (Join-Path $env:USERPROFILE ('Desktop\' + $PackageName)),
    (Join-Path 'D:\' $PackageName)
  )
  $found = $candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
  if ($found) { $ZipPath = $found }
}
if (-not (Test-Path -LiteralPath $ZipPath -PathType Leaf)) {
  Stop-With "Please download $PackageName first, then run this importer again with -ZipPath if needed."
}
$hash = (Get-FileHash -LiteralPath $ZipPath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($hash -ne $ExpectedZipHash) {
  Stop-With "ZIP SHA-256 mismatch. Expected $ExpectedZipHash, got $hash. No changes made."
}
$free = (Get-PSDrive -Name D).Free
if ($free -lt 190MB) { Stop-With "Insufficient free space on D (requires >=190 MB)." }

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($ZipPath)
try {
  $names = @($zip.Entries | Where-Object { $_.Name } | ForEach-Object { $_.FullName })
  foreach($name in $names) {
    if ($name.StartsWith('/') -or $name.Contains('..') -or $name.Contains(':') -or $name.Contains('\')) {
      Stop-With "Unsafe archive entry: $name"
    }
  }
  $images = @($names | Where-Object { $_ -like 'references/primary/*.png' }).Count
  $alts = @($names | Where-Object { $_ -like 'references/alternates/*.png' }).Count
  $prompts = @($names | Where-Object { $_ -like 'prompts/*.txt' }).Count
  $logo = @($names | Where-Object { $_ -eq 'references/brand/00_STAG_K_ORIGINAL_REF.png' }).Count
  if ($images -ne 44 -or $alts -ne 5 -or $prompts -ne 44 -or $logo -ne 1) {
    Stop-With "Unexpected archive counts: $images primary, $alts alternates, $prompts prompts, $logo logos."
  }
} finally { $zip.Dispose() }

$stage = Join-Path $Target ('_IMPORT_STAGE_' + (Get-Date -Format 'yyyyMMdd_HHmmss'))
New-Item -ItemType Directory -Path $stage | Out-Null
Expand-Archive -LiteralPath $ZipPath -DestinationPath $stage -ErrorAction Stop
$allFiles = @(Get-ChildItem -LiteralPath $stage -File -Recurse)
$conflicts = @()
foreach ($file in $allFiles) {
  $relative = $file.FullName.Substring($stage.Length).TrimStart('\')
  $dest = Join-Path $Target $relative
  if (Test-Path -LiteralPath $dest) {
    $oldHash = (Get-FileHash -LiteralPath $dest -Algorithm SHA256).Hash
    $newHash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash
    if ($oldHash -ne $newHash) { $conflicts += $relative }
  }
}
if ($conflicts.Count) {
  Write-Host 'CONFLICTS — no existing files were overwritten:' -ForegroundColor Yellow
  $conflicts | ForEach-Object { Write-Host " - $_" }
  Stop-With "Review conflicts manually. The extracted staging folder has been PRESERVED at $stage."
}
$copied=0;$skipped=0
foreach ($file in $allFiles) {
  $relative = $file.FullName.Substring($stage.Length).TrimStart('\')
  $dest = Join-Path $Target $relative
  if (Test-Path -LiteralPath $dest) { $skipped++; continue }
  $parent = Split-Path -Parent $dest
  if (-not (Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
  Copy-Item -LiteralPath $file.FullName -Destination $dest -ErrorAction Stop
  $copied++
}
$manifest = Get-Content -LiteralPath (Join-Path $Target 'MANIFEST.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if ($manifest.primary_ui_screens -ne 44 -or $manifest.unique_images -ne 50 -or $manifest.prompts -ne 44) {
  Stop-With 'Manifest validation failed after import.'
}
$promptFiles = @(Get-ChildItem -LiteralPath (Join-Path $Target 'prompts') -Filter '*.txt' -File)
foreach ($p in $promptFiles) {
  $txt=[System.IO.File]::ReadAllText($p.FullName)
  if ($txt.Length -ge 5000 -or $txt -match 'https?://' ) {
    Stop-With "Prompt failed max-length / URL validation: $($p.Name)"
  }
}
Write-Host "READY: Primary screens $images; prompts $prompts; alternate images $alts; logos $logo." -ForegroundColor Green
Write-Host "Copied $copied new files; skipped $skipped matching files; original files untouched."
Write-Host "Project folder: $Target"
Write-Host "Import staging retained for safety: $stage"
Write-Host "Git changes not committed or pushed."
