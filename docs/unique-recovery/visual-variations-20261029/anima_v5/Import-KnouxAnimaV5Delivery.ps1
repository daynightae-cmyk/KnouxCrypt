# KNOUX CRYPT - Safe Anima V5 package importer
# Run from PowerShell 5.1+; no overwrites, deletes, Git mutations or project source changes.
[CmdletBinding()]
param(
    [string]$ZipPath = 'C:\Users\day night\Downloads\Compressed\KNOUX_CRYPT_ANIMA_V5_DELIVERY.zip',
    [string]$ProjectRoot = 'D:\KnouxCrypt',
    [switch]$CheckOnly
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Assert-PackageFiles([string]$Path, [object[]]$Items, [hashtable]$Expected) {
    foreach ($item in $Items) {
        $rel = $item.FullName.Replace('/', [IO.Path]::DirectorySeparatorChar).Replace('\', [IO.Path]::DirectorySeparatorChar)
        $file = Join-Path $Path $rel
        if (-not [IO.File]::Exists($file)) { throw "Missing extracted file: $rel" }
        if ($item.FullName -ne 'FILE_SHA256.txt') {
            $actual = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()
            if ($actual -ne $Expected[$item.FullName]) { throw "SHA256 mismatch: $rel" }
        }
    }
    $count = @(Get-ChildItem -LiteralPath $Path -Recurse -File).Count
    if ($count -ne $Items.Count) {
        throw "Unexpected extracted file count: $count (expected $($Items.Count))."
    }
}

$ZipPath = [IO.Path]::GetFullPath($ZipPath)
$ProjectRoot = [IO.Path]::GetFullPath($ProjectRoot)
if (-not [IO.File]::Exists($ZipPath)) { throw "ZIP not found: $ZipPath" }
if (-not (Test-Path -LiteralPath (Join-Path $ProjectRoot '.git'))) {
    throw "Not a verified Git project directory: $ProjectRoot"
}
$base = Join-Path $ProjectRoot 'visuals\anima_v5'
if (-not (Test-Path -LiteralPath $base -PathType Container)) {
    throw "Expected visuals folder missing; refusing to invent project structure: $base"
}
$destination = Join-Path $base 'KNOUX_CRYPT_ANIMA_V5_DELIVERY'
$zipHash = (Get-FileHash -LiteralPath $ZipPath -Algorithm SHA256).Hash
$archive = [System.IO.Compression.ZipFile]::OpenRead($ZipPath)

try {
    $items = @($archive.Entries | Where-Object { -not [string]::IsNullOrWhiteSpace($_.Name) })
    if ($items.Count -ne 98) { throw "Expected 98 files, got $($items.Count)." }
    $seen = @{}
    $totalBytes = [long]0
    foreach ($item in $items) {
        $rel = $item.FullName.Replace('\', '/')
        if ($rel -cnotmatch '^(?:references/(?:primary|alternates)/[^/]+\.png|prompts/[^/]+\.txt|docs/[^/]+\.md|README_FIRST\.md|MANIFEST\.json|FILE_SHA256\.txt)$') {
            throw "Unexpected or unsafe ZIP entry: $rel"
        }
        if ($rel -match '(^|/)\.\.?(/|$)' -or $seen.ContainsKey($rel)) {
            throw "Traversal or duplicate ZIP entry: $rel"
        }
        $unixType = ($item.ExternalAttributes -shr 16) -band 61440
        if ($unixType -eq 40960) { throw "Symlink ZIP entries are forbidden: $rel" }
        $seen[$rel] = $true
        $totalBytes += $item.Length
    }
    if ($totalBytes -gt 400MB) { throw 'Archive exceeds safe expanded size.' }
    $shaEntry = $archive.GetEntry('FILE_SHA256.txt')
    if ($null -eq $shaEntry) { throw 'Missing FILE_SHA256.txt' }
    $reader = New-Object System.IO.StreamReader($shaEntry.Open())
    try { $hashText = $reader.ReadToEnd() } finally { $reader.Dispose() }
    $expected = @{}
    foreach ($line in ($hashText -split "\r?\n")) {
        if ($line -match '^([a-fA-F0-9]{64})  (\S.+)$') {
            $expected[$Matches[2]] = $Matches[1].ToLowerInvariant()
        }
    }
    if ($expected.Count -ne ($items.Count - 1)) {
        throw "Checksum manifest count $($expected.Count) doesn't match expected $($items.Count - 1)."
    }
    foreach ($item in $items) {
        if ($item.FullName -ne 'FILE_SHA256.txt' -and -not $expected.ContainsKey($item.FullName)) {
            throw "Checksum missing for: $($item.FullName)"
        }
    }
    $primary = @($items | Where-Object { $_.FullName -match '^references/primary/\d{2}_[^/]+\.png$' }).Count
    $alt = @($items | Where-Object { $_.FullName -match '^references/alternates/' }).Count
    $prompts = @($items | Where-Object { $_.FullName -match '^prompts/\d{2}_[^/]+\.txt$' }).Count
    if ($primary -ne 44 -or $alt -ne 5 -or $prompts -ne 44) {
        throw "Incomplete image/prompt groups: primary=$primary, alternates=$alt, prompts=$prompts"
    }
    foreach ($item in ($items | Where-Object { $_.FullName -match '^references/primary/' })) {
        $paired = $item.FullName.Replace('references/primary/', 'prompts/').Replace('.png','.txt')
        if (-not $seen.ContainsKey($paired)) { throw "Unpaired screen: $($item.FullName)" }
    }
    Write-Output "ZIP_SHA256=$zipHash"
    Write-Output "ZIP_FILES=$($items.Count); PRIMARY=$primary; ALTERNATES=$alt; PROMPTS=$prompts"
    Write-Output "UNCOMPRESSED_MB=$([Math]::Round($totalBytes/1MB,2))"
    Write-Output "DESTINATION=$destination"
    if ($CheckOnly) {
        Write-Output 'CHECK_ONLY=PASS (no extraction performed)'
        return
    }
    if (Test-Path -LiteralPath $destination) {
        Write-Output 'Destination exists; verifying in place. No overwrites.'
        Assert-PackageFiles -Path $destination -Items $items -Expected $expected
        Write-Output 'RESULT=ALREADY_PRESENT_AND_SHA256_VERIFIED'
        return
    }
    $stage = Join-Path $base ('.knoux_v5_staging_' + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $stage -ErrorAction Stop | Out-Null
    Write-Output "STAGING=$stage"
    foreach ($item in $items) {
        $rel = $item.FullName.Replace('/', [IO.Path]::DirectorySeparatorChar)
        $out = [IO.Path]::GetFullPath((Join-Path $stage $rel))
        $prefix = [IO.Path]::GetFullPath($stage).TrimEnd('\') + '\'
        if (-not $out.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
            throw "ZIP traversal blocked: $rel"
        }
        $parent = Split-Path -Parent $out
        if (-not (Test-Path -LiteralPath $parent)) {
            New-Item -ItemType Directory -Path $parent -Force | Out-Null
        }
        $inputStream = $item.Open()
        try {
            $outputStream = [IO.File]::Open($out, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write)
            try { $inputStream.CopyTo($outputStream) } finally { $outputStream.Dispose() }
        } finally { $inputStream.Dispose() }
    }
    Assert-PackageFiles -Path $stage -Items $items -Expected $expected
    if (Test-Path -LiteralPath $destination) {
        throw "Destination was created by another process: $destination"
    }
    Move-Item -LiteralPath $stage -Destination $destination -ErrorAction Stop
    Assert-PackageFiles -Path $destination -Items $items -Expected $expected
    Write-Output 'RESULT=EXTRACTED_AND_SHA256_VERIFIED'
    Write-Output "PRIMARY_DIR=$(Join-Path $destination 'references\primary')"
    Write-Output "ALTERNATES_DIR=$(Join-Path $destination 'references\alternates')"
    Write-Output "PROMPTS_DIR=$(Join-Path $destination 'prompts')"
    Write-Output 'GIT=UNCHANGED; ORIGINAL_ZIP=UNCHANGED'
} finally {
    $archive.Dispose()
}
