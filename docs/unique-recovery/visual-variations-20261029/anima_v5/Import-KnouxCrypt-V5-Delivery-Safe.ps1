# KNOUX CRYPT V5 - safe one-time import
$ErrorActionPreference = 'Stop'
$zipPath = 'C:\Users\day night\Downloads\Compressed\KNOUX_CRYPT_ANIMA_V5_DELIVERY.zip'
$project = 'D:\KnouxCrypt'
$base = Join-Path $project 'visuals\anima_v5'
$target = Join-Path $base 'KNOUX_CRYPT_ANIMA_V5_DELIVERY'
$stage = Join-Path $base ('_import_staging_' + [guid]::NewGuid().ToString('N'))
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
if (!(Test-Path -LiteralPath $zipPath -PathType Leaf)) { throw "ZIP not found: $zipPath" }
if (!(Test-Path -LiteralPath (Join-Path $project '.git') )) { throw "Project git root not found: $project" }
if (Test-Path -LiteralPath $target) {
  Write-Host "Target exists; no files changed: $target" -ForegroundColor Yellow
  return
}
$archive = [IO.Compression.ZipFile]::OpenRead($zipPath)
try {
  $entries = @($archive.Entries | Where-Object { $_.Name -ne '' })
  $names = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
  $total = [long]0
  foreach ($entry in $entries) {
    $name = $entry.FullName.Replace('\','/')
    $segments = $name.Split('/')
    if ($name.StartsWith('/') -or $name.Contains(':') -or $segments -contains '..' -or $segments -contains '.' -or -not $names.Add($name)) {
      throw "Unsafe or duplicate archive entry: $name"
    }
    $total += $entry.Length
  }
  if ($entries.Count -lt 40) { throw "Unexpectedly small archive: $($entries.Count) entries" }
  $drive = Get-PSDrive -Name D
  if ($drive.Free -lt ($total + 200MB)) { throw "Insufficient free space on D:" }
  New-Item -ItemType Directory -Path $stage -Force | Out-Null
  $root = [IO.Path]::GetFullPath($stage).TrimEnd('\') + '\'
  foreach ($entry in $entries) {
    $dest = [IO.Path]::GetFullPath((Join-Path $stage ($entry.FullName.Replace('/','\'))))
    if (!$dest.StartsWith($root,[StringComparison]::OrdinalIgnoreCase)) { throw "Path escapes staging: $($entry.FullName)" }
    $parent = Split-Path $dest -Parent
    New-Item -ItemType Directory -Path $parent -Force | Out-Null
    $inputStream = $entry.Open()
    try {
      $outputStream = [IO.File]::Create($dest)
      try { $inputStream.CopyTo($outputStream) } finally { $outputStream.Dispose() }
    } finally { $inputStream.Dispose() }
    if ((Get-Item -LiteralPath $dest).Length -ne $entry.Length) { throw "Size mismatch: $($entry.FullName)" }
  }
  if (!(Test-Path -LiteralPath (Join-Path $stage 'MANIFEST.json'))) { throw 'Missing MANIFEST.json' }
  if (!(Test-Path -LiteralPath (Join-Path $stage 'README_FIRST.md'))) { throw 'Missing README_FIRST.md' }
  $written = @(Get-ChildItem -LiteralPath $stage -File -Recurse)
  if ($written.Count -ne $entries.Count) { throw "Extracted count mismatch $($written.Count) != $($entries.Count)" }
  Move-Item -LiteralPath $stage -Destination $target -ErrorAction Stop
  Write-Host "IMPORTED $($written.Count) files to $target" -ForegroundColor Green
  Write-Host "Archive SHA256: $((Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash)"
  Write-Host "No existing project file was overwritten. Source ZIP retained."
} finally {
  $archive.Dispose()
  if (Test-Path -LiteralPath $stage) {
    Write-Warning "Staging retained for inspection after failure: $stage"
  }
}
